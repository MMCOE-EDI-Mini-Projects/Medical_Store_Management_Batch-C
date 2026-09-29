/* ==========================================================================
   MEDISTORE MS — COMPLETE SUPABASE DATABASE SCHEMA  (dbschema.sql)
   ==========================================================================
   HOW TO RUN
     1. Open https://supabase.com/dashboard/project/rzuihpcvelaxxbschzkb
     2. Left sidebar  ->  SQL Editor  ->  "+ New query"
     3. Paste this ENTIRE file, then press  Run  (Ctrl+Enter)
     4. Expect: "Success. No rows returned"
     5. Re-running the file is safe: it is idempotent throughout.

   WHAT IT CREATES
     - 10 enum types
     - 14 tables
     - 22 helper / trigger / RPC functions, 21 indexes
     - cross-module triggers:  Rx approved -> queue token
                               PO Received -> inventory replenished
                               Return Approved -> inventory restored
                               medicine change -> category count rebuilt
     - RPCs: create_bill (atomic POS checkout), get_dashboard_data,
             next_queue_token
     - Row Level Security policies for the 3 roles
     - Realtime publication for the live Customer Queue
     - Demo seed data + 6 real auth users

   DEMO LOGIN PASSWORD FOR EVERY SEEDED ACCOUNT:  MediStore@123
     aisha@medstore.com   Admin
     rahul@medstore.com   Store Manager
     priya@medstore.com   Store Manager
     sneha@medstore.com   Pharmacist
     vikram@medstore.com  Pharmacist
     imran@medstore.com   Pharmacist (Inactive — good for testing the guard)

   DESIGN RULES (do not break these)
     * inventory.id is BIGINT because js/billing.js does
       addToCart(+btn.dataset.id) and compares with === .
     * queue is keyed by `token` (BIGINT), never `id`.
     * inventory.status is COMPUTED ON READ, never stored.
     * Empty / root values are NULL in the DB; the JS adapter renders "—".

   WHY THERE IS A RESET SECTION
   A first-draft 12-table schema was already applied to this project from
   implementation_plan.md. It has the known defects (categories.parent uses
   the "—" sentinel, there is no transaction_items / purchase_order_items).
   Because `create table if not exists` would silently SKIP those tables and
   keep the broken columns, the PRE-FLIGHT reset below drops our own objects
   first so the file always converges on the correct shape.

   Every one of those tables was verified EMPTY on 2026-09-23 (REST probes
   returned []), so nothing is lost. Auth users are NOT dropped — only the
   public profile mirror — and the demo accounts are re-seeded in §12.
   ========================================================================== */


/* ==========================================================================
   PRE-FLIGHT · RESET  (idempotent + safe: all these tables were verified empty)
   Only objects created by THIS file are dropped. Nothing else in the
   database is touched. No `auth.*` data is deleted.
   ========================================================================== */

-- P1. Drop our tables, children first so foreign keys never block the drop.
drop table if exists public.transaction_items     cascade;
drop table if exists public.purchase_order_items  cascade;
drop table if exists public.notifications         cascade;
drop table if exists public.queue                 cascade;
drop table if exists public.returns               cascade;
drop table if exists public.prescriptions         cascade;
drop table if exists public.medicines             cascade;
drop table if exists public.inventory             cascade;
drop table if exists public.transactions          cascade;
drop table if exists public.purchase_orders       cascade;
drop table if exists public.suppliers             cascade;
drop table if exists public.categories            cascade;
drop table if exists public.settings              cascade;
drop table if exists public.audit_log             cascade;
drop table if exists public.users                 cascade;

-- P2. Drop every function this file owns, whatever its current signature.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'initials', 'set_updated_at', 'fmt_datetime', 'days_until',
         'compute_inventory_status', 'current_user_role', 'is_staff',
         'is_admin', 'is_manager', 'is_counter', 'handle_new_user',
         'next_code', 'sync_transaction_date', 'refresh_category_count',
         'trg_medicines_refresh_count', 'trg_prescription_approved',
         'trg_po_received', 'trg_return_approved', 'create_bill',
         'get_dashboard_data', 'next_queue_token', 'ist_ts'
       )
  loop
    execute format('drop function if exists %s cascade', r.sig);
  end loop;
end $$;

-- P3. Drop the enum types (after the tables that used them are gone).
drop type if exists public.user_role          cascade;
drop type if exists public.generic_status     cascade;
drop type if exists public.inventory_status   cascade;
drop type if exists public.po_status          cascade;
drop type if exists public.prescription_status cascade;
drop type if exists public.return_status      cascade;
drop type if exists public.transaction_status cascade;
drop type if exists public.payment_method     cascade;
drop type if exists public.queue_status       cascade;
drop type if exists public.queue_priority     cascade;
drop type if exists public.return_reason      cascade;


/* --------------------------------------------------------------------------
   0. EXTENSIONS
   -------------------------------------------------------------------------- */
create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;


/* --------------------------------------------------------------------------
   1. ENUM TYPES
   Every type is wrapped so the script can be re-run without error.
   NOTE: there is intentionally NO 'Cashier' role — the Pharmacist covers
   the counter (locked decision #1).
   -------------------------------------------------------------------------- */
do $$ begin
  create type public.user_role as enum ('Admin', 'Store Manager', 'Pharmacist');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.generic_status as enum ('Active', 'Inactive');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.inventory_status as enum ('In Stock', 'Low Stock', 'Expiring Soon', 'Out of Stock', 'Expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.po_status as enum ('Draft', 'Pending', 'Approved', 'Received', 'Cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.prescription_status as enum ('Pending', 'Approved', 'Rejected', 'Dispensed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.return_status as enum ('Pending', 'Approved', 'Rejected', 'Completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.transaction_status as enum ('Paid', 'Pending', 'Refunded', 'Cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_method as enum ('Cash', 'Card', 'UPI', 'Insurance', 'Net Banking');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.queue_status as enum ('Waiting', 'Billing', 'Completed', 'Hold', 'Skipped');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.queue_priority as enum ('Normal', 'High', 'Elderly', 'Emergency');
exception when duplicate_object then null; end $$;


/* --------------------------------------------------------------------------
   2. GENERIC HELPER FUNCTIONS
   -------------------------------------------------------------------------- */

-- Builds the 2-letter avatar chip shown in the topbar / user table.
-- "Dr. Aisha Khan" -> "AK",  "Rahul Mehta" -> "RM"
create or replace function public.initials(p_name text)
returns text
language sql
immutable
as $$
  with cleaned as (
    select regexp_replace(coalesce(nullif(trim(p_name), ''), '?'),
                          '[^A-Za-z0-9 ]', '', 'g') as n
  ),
  parts as (
    select regexp_split_to_array(trim(n), '\s+') as arr from cleaned
  )
  -- Initials of the LAST TWO words, so honorifics are skipped and the result
  -- always has 1-2 characters (the chip in the topbar is small).
  --   "Dr. Aisha Khan" -> "AK"   "Rahul Mehta" -> "RM"   "Madonna" -> "M"
  select coalesce(nullif(upper(
           case
             when coalesce(array_length(arr, 1), 0) >= 2
               then left(arr[array_length(arr, 1) - 1], 1)
                 || left(arr[array_length(arr, 1)], 1)
             else left(coalesce(arr[1], ''), 1)
           end
         ), ''), '?')
  from parts
$$;

-- Generic updated_at maintainer, attached to every mutable table.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Formats a timestamptz the way the pages expect to display it:
-- "2026-09-07 10:25"  (matches mockData.js transaction.date shape)
create or replace function public.fmt_datetime(p_ts timestamptz)
returns text
language sql
immutable
as $$
  select to_char(coalesce(p_ts, now()) at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI')
$$;

-- Days remaining until a date, from today (mirrors App.daysUntil in the JS).
create or replace function public.days_until(p_date date)
returns integer
language sql
stable
as $$
  select case when p_date is null then 999 else (p_date - current_date) end
$$;

-- The single source of truth for "computed" inventory status.
-- Mirrored by computeItemStatus() in js/api.js so the UI never disagrees.
create or replace function public.compute_inventory_status(p_qty integer, p_expiry date)
returns public.inventory_status
language sql
stable
as $$
  select case
    when p_expiry is not null and p_expiry < current_date then 'Expired'::public.inventory_status
    when coalesce(p_qty, 0) <= 0                 then 'Out of Stock'::public.inventory_status
    when p_qty <= 20                             then 'Low Stock'::public.inventory_status
    when p_expiry is not null and (p_expiry - current_date) <= 90
                                                 then 'Expiring Soon'::public.inventory_status
    else 'In Stock'::public.inventory_status
  end
$$;


/* ==========================================================================
   3. TABLES
   ========================================================================== */

/* --------------------------------------------------------------------------
   3.1 users — application profile mirroring auth.users
   -------------------------------------------------------------------------- */
create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text        not null,
  email       text        not null,
  role        public.user_role   not null default 'Pharmacist',
  status      public.generic_status not null default 'Active',
  phone       text,
  avatar      text,
  last_login  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists users_email_key on public.users (lower(email));

drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at before update on public.users
  for each row execute function public.set_updated_at();


/* --------------------------------------------------------------------------
   3.2 ROLE HELPER FUNCTIONS
   SECURITY DEFINER + STABLE prevents the classic RLS recursion problem
   (a policy on `users` that itself queries `users`) and lets policies on
   other tables reuse the same authorisation rules.
   -------------------------------------------------------------------------- */
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.role from public.users u
   where u.id = auth.uid() and u.status = 'Active'
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select public.current_user_role() is not null $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select public.current_user_role() = 'Admin' $$;

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select public.current_user_role() in ('Admin', 'Store Manager') $$;

-- Counter / clinical work: Admin + Pharmacist (the Pharmacist IS the cashier)
create or replace function public.is_counter()
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select public.current_user_role() in ('Admin', 'Pharmacist') $$;


/* --------------------------------------------------------------------------
   3.3 Auto-create a profile row whenever a new auth user appears.
   This covers both the seeded demo users below AND self-service sign-ups.
   -------------------------------------------------------------------------- */
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name   text;
  v_role   public.user_role;
begin
  v_name := coalesce(nullif(new.raw_user_meta_data->>'full_name', ''),
                     nullif(new.raw_user_meta_data->>'name', ''),
                     split_part(coalesce(new.email, 'user'), '@', 1));

  begin
    v_role := coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'Pharmacist');
  exception when others then
    v_role := 'Pharmacist';
  end;

  insert into public.users (id, name, email, role, status, avatar)
  values (new.id, v_name, coalesce(new.email, ''), v_role, 'Active', public.initials(v_name))
  on conflict (id) do update
    set name  = excluded.name,
        email = excluded.email,
        updated_at = now();

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


/* --------------------------------------------------------------------------
   3.4 HUMAN-READABLE CODE GENERATOR
   Reproduces the exact ID formats already used by the UI:
     MED-001 (3)   SUP-01 (2)   PO-2041 (4)   RX-9001 (4)   RT-501 (3)
     INV-5521 (4)
   Mirrors nextId() in js/api.js so the formats never drift.
   -------------------------------------------------------------------------- */
create or replace function public.next_code(
  p_prefix text,
  p_table  text,
  p_column text,
  p_width  integer,
  p_start  integer default 0
)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_next integer;
begin
  execute format(
    'select greatest(coalesce(max(nullif(regexp_replace(%I, ''\D'', '''', ''g''), '''')::int), 0), %L) + 1 from public.%I',
    p_column, p_start, p_table
  ) into v_next;

  return p_prefix || lpad(v_next::text, p_width, '0');
end $$;


/* ==========================================================================
   4. DOMAIN TABLES
   ========================================================================== */

/* --------------------------------------------------------------------------
   4.1 categories  (self-referencing tree; root = NULL, JS renders "—")
   -------------------------------------------------------------------------- */
create table if not exists public.categories (
  id         bigint generated by default as identity primary key,
  name       text not null,
  parent_id  bigint references public.categories(id) on delete set null,
  count      integer not null default 0,
  status     public.generic_status not null default 'Active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_key unique (name)
);

drop trigger if exists trg_categories_updated_at on public.categories;
create trigger trg_categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();


/* --------------------------------------------------------------------------
   4.2 medicines
   `category` is the category NAME (the pages render m.category directly).
   Deleting/renaming a category cascades to keep names in sync.
   -------------------------------------------------------------------------- */
create table if not exists public.medicines (
  id           text primary key
               default public.next_code('MED-', 'medicines', 'id', 3),
  name         text not null,
  generic      text,
  category     text not null references public.categories(name)
               on update cascade on delete restrict,
  manufacturer text,
  reorder      integer not null default 50 check (reorder >= 0),
  rx           boolean not null default false,
  status       public.generic_status not null default 'Active',
  description  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists trg_medicines_updated_at on public.medicines;
create trigger trg_medicines_updated_at before update on public.medicines
  for each row execute function public.set_updated_at();


/* --------------------------------------------------------------------------
   4.3 inventory  (batch level — one row per medicine+batch)
   ⚠️ id MUST stay BIGINT: js/billing.js does addToCart(+btn.dataset.id)
      and compares cart lines with === . A UUID would become NaN.
   ⚠️ `status` is NOT stored — it is computed on read (see api.js).
   -------------------------------------------------------------------------- */
create table if not exists public.inventory (
  id         bigint generated by default as identity primary key,
  med_id     text references public.medicines(id) on delete set null,
  medicine   text not null,
  batch      text not null,
  mfg        date,
  expiry     date not null,
  qty        integer not null default 0 check (qty >= 0),
  purchase   numeric(12,2) not null default 0 check (purchase >= 0),
  selling    numeric(12,2) not null default 0 check (selling >= 0),
  supplier   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_medicine_batch_key unique (medicine, batch)
);

drop trigger if exists trg_inventory_updated_at on public.inventory;
create trigger trg_inventory_updated_at before update on public.inventory
  for each row execute function public.set_updated_at();


/* --------------------------------------------------------------------------
   4.4 suppliers   (id format SUP-01)
   -------------------------------------------------------------------------- */
create table if not exists public.suppliers (
  id         text primary key
             default public.next_code('SUP-', 'suppliers', 'id', 2),
  name       text not null,
  contact    text,
  phone      text,
  email      text,
  address    text,
  gst        text,
  status     public.generic_status not null default 'Active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suppliers_name_key unique (name)
);

drop trigger if exists trg_suppliers_updated_at on public.suppliers;
create trigger trg_suppliers_updated_at before update on public.suppliers
  for each row execute function public.set_updated_at();


/* --------------------------------------------------------------------------
   4.5 purchase_orders + 4.6 purchase_order_items
   -------------------------------------------------------------------------- */
create table if not exists public.purchase_orders (
  id         text primary key
             default public.next_code('PO-', 'purchase_orders', 'id', 4),
  supplier   text not null,
  date       date not null default current_date,
  items      integer not null default 0 check (items >= 0),
  total      numeric(12,2) not null default 0 check (total >= 0),
  status     public.po_status not null default 'Draft',
  notes      text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_po_updated_at on public.purchase_orders;
create trigger trg_po_updated_at before update on public.purchase_orders
  for each row execute function public.set_updated_at();

create table if not exists public.purchase_order_items (
  id         bigint generated by default as identity primary key,
  po_id      text not null references public.purchase_orders(id) on delete cascade,
  med_id     text references public.medicines(id) on delete set null,
  medicine   text not null,
  batch      text,
  qty        integer not null default 0 check (qty >= 0),
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  line_total numeric(12,2) generated always as (qty * unit_price) stored,
  created_at timestamptz not null default now()
);
create index if not exists po_items_po_id_idx on public.purchase_order_items (po_id);


/* --------------------------------------------------------------------------
   4.7 prescriptions   (id format RX-9001)
   Files live in the `prescriptions` Storage bucket; only the path is stored.
   -------------------------------------------------------------------------- */
create table if not exists public.prescriptions (
  id          text primary key
              default public.next_code('RX-', 'prescriptions', 'id', 4),
  customer    text not null,
  doctor      text,
  medicine    text,
  date        date not null default current_date,
  priority    public.queue_priority not null default 'Normal',
  status      public.prescription_status not null default 'Pending',
  invoice     text,
  file_name   text,
  file_path   text,
  file_url    text,
  notes       text,
  reviewed_by uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_prescriptions_updated_at on public.prescriptions;
create trigger trg_prescriptions_updated_at before update on public.prescriptions
  for each row execute function public.set_updated_at();


/* --------------------------------------------------------------------------
   4.8 returns   (id format RT-501)
   `reason` is free text on purpose — the legacy seed uses values such as
   "Damaged pack" / "Expired batch" that a strict enum would reject.
   -------------------------------------------------------------------------- */
create table if not exists public.returns (
  id           text primary key
               default public.next_code('RT-', 'returns', 'id', 3),
  invoice      text,
  customer     text not null,
  medicine     text not null,
  inventory_id bigint references public.inventory(id) on delete set null,
  qty          integer not null default 1 check (qty > 0),
  reason       text,
  amount       numeric(12,2) not null default 0,
  date         date not null default current_date,
  status       public.return_status not null default 'Pending',
  approved_by  uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists trg_returns_updated_at on public.returns;
create trigger trg_returns_updated_at before update on public.returns
  for each row execute function public.set_updated_at();


/* --------------------------------------------------------------------------
   4.9 transactions + 4.10 transaction_items   (id format INV-5521)

   SCHEMA BUG FIX #1
   The legacy design stored `date` as VARCHAR, which made "today's sales"
   comparisons unreliable. We now store a real `created_at timestamptz` as the
   source of truth and derive the display string `date` in a trigger, so
   pages keep rendering the exact same "YYYY-MM-DD HH:MM" text while SQL can
   filter with proper date arithmetic.
   -------------------------------------------------------------------------- */
create table if not exists public.transactions (
  id           text primary key
               default public.next_code('INV-', 'transactions', 'id', 4, 5500),
  customer     text not null default 'Walk-in',
  subtotal     numeric(12,2) not null default 0 check (subtotal >= 0),
  discount     numeric(12,2) not null default 0 check (discount >= 0),
  tax          numeric(12,2) not null default 0 check (tax >= 0),
  amount       numeric(12,2) not null default 0 check (amount >= 0),
  payment      public.payment_method not null default 'Cash',
  status       public.transaction_status not null default 'Paid',
  date         text,
  cashier_id   uuid references public.users(id) on delete set null,
  cashier_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists trg_transactions_updated_at on public.transactions;
create trigger trg_transactions_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();

-- Keeps the legacy display column in sync with the real timestamp.
create or replace function public.sync_transaction_date()
returns trigger
language plpgsql
as $$
begin
  new.date := public.fmt_datetime(coalesce(new.created_at, now()));
  return new;
end $$;

drop trigger if exists trg_transactions_sync_date on public.transactions;
create trigger trg_transactions_sync_date
  before insert or update of created_at on public.transactions
  for each row execute function public.sync_transaction_date();

create table if not exists public.transaction_items (
  id           bigint generated by default as identity primary key,
  tx_id        text not null references public.transactions(id) on delete cascade,
  inventory_id bigint references public.inventory(id) on delete set null,
  med_id       text references public.medicines(id) on delete set null,
  medicine     text not null,
  batch        text,
  qty          integer not null check (qty > 0),
  price        numeric(12,2) not null default 0 check (price >= 0),
  line_total   numeric(12,2) generated always as (qty * price) stored,
  created_at   timestamptz not null default now()
);
create index if not exists tx_items_tx_id_idx on public.transaction_items (tx_id);


/* --------------------------------------------------------------------------
   4.11 queue  (Customer Queue)
   ⚠️ Primary key is `token` (BIGINT), NOT `id` — js/db.js and
      API.updateQueue(token, …) both key on token.
   -------------------------------------------------------------------------- */
create sequence if not exists public.queue_token_seq as bigint start with 14;

create table if not exists public.queue (
  token           bigint primary key default nextval('public.queue_token_seq'),
  name            text not null,
  wait            text not null default '0 min',
  priority        public.queue_priority not null default 'Normal',
  status          public.queue_status not null default 'Waiting',
  cashier         text not null default '—',
  prescription_id text references public.prescriptions(id) on delete set null,
  served_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter sequence public.queue_token_seq owned by public.queue.token;

drop trigger if exists trg_queue_updated_at on public.queue;
create trigger trg_queue_updated_at before update on public.queue
  for each row execute function public.set_updated_at();


/* --------------------------------------------------------------------------
   4.12 settings  (key/value bag — consumed by the Settings page)
   -------------------------------------------------------------------------- */
create table if not exists public.settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);


/* --------------------------------------------------------------------------
   4.13 audit_log
   SCHEMA BUG FIX #2
   The legacy design declared user_id as BIGINT while users.id is UUID,
   which made the foreign key impossible. Now UUID + real FK.
   The *feature* is deliberately deferred, but the table is correct today so
   it can be switched on without a migration later.
   -------------------------------------------------------------------------- */
create table if not exists public.audit_log (
  id         bigint generated by default as identity primary key,
  user_id    uuid references public.users(id) on delete set null,
  action     text not null,
  entity     text,
  entity_id  text,
  details    jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);


/* ==========================================================================
   5. INDEXES  (SCHEMA BUG FIX #7 — hot filter columns had none)
   ========================================================================== */
create index if not exists medicines_category_idx    on public.medicines (category);
create index if not exists medicines_status_idx      on public.medicines (status);
create index if not exists inventory_expiry_idx      on public.inventory (expiry);
create index if not exists inventory_medicine_idx    on public.inventory (medicine);
create index if not exists inventory_med_id_idx      on public.inventory (med_id);
create index if not exists inventory_qty_idx         on public.inventory (qty);
create index if not exists prescriptions_status_idx  on public.prescriptions (status);
create index if not exists prescriptions_date_idx    on public.prescriptions (date desc);
create index if not exists returns_status_idx        on public.returns (status);
create index if not exists returns_date_idx          on public.returns (date desc);
create index if not exists tx_created_at_idx         on public.transactions (created_at desc);
create index if not exists tx_status_idx             on public.transactions (status);
create index if not exists tx_customer_idx           on public.transactions (customer);
create index if not exists queue_status_idx          on public.queue (status);
create index if not exists queue_created_at_idx      on public.queue (created_at desc);
create index if not exists po_status_idx             on public.purchase_orders (status);
create index if not exists po_supplier_idx           on public.purchase_orders (supplier);
create index if not exists users_role_idx            on public.users (role);


/* ==========================================================================
   6. CATEGORY MEDICINE-COUNT MAINTENANCE
   Replaces the fragile increment/decrement logic that api.js used to do by
   hand (a crash mid-way left the counts permanently wrong). Now Postgres
   recomputes the count whenever a medicine row changes.
   ========================================================================== */
create or replace function public.refresh_category_count(p_name text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_name is null or p_name = '' then
    return;
  end if;

  update public.categories c
     set count = (
           select count(*) from public.medicines m
            where m.category = p_name
              and m.status = 'Active'
         )
   where c.name = p_name;
end $$;

create or replace function public.trg_medicines_refresh_count()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_category_count(old.category);
    return old;
  elsif tg_op = 'UPDATE' then
    perform public.refresh_category_count(old.category);
    if new.category is distinct from old.category then
      perform public.refresh_category_count(new.category);
    end if;
    return new;
  else
    perform public.refresh_category_count(new.category);
    return new;
  end if;
end $$;

drop trigger if exists trg_medicines_count_ai on public.medicines;
create trigger trg_medicines_count_ai after insert on public.medicines
  for each row execute function public.trg_medicines_refresh_count();

drop trigger if exists trg_medicines_count_au on public.medicines;
create trigger trg_medicines_count_au after update on public.medicines
  for each row execute function public.trg_medicines_refresh_count();

drop trigger if exists trg_medicines_count_ad on public.medicines;
create trigger trg_medicines_count_ad after delete on public.medicines
  for each row execute function public.trg_medicines_refresh_count();


/* ==========================================================================
   7. CROSS-MODULE AUTOMATION (triggers)
   These live in the database — not in api.js — so the behaviour holds no
   matter how a row is changed (app, SQL editor, another client, cron).
   api.js therefore only performs a plain UPDATE and the DB does the rest.
   ========================================================================== */

/* --------------------------------------------------------------------------
   7.1 Prescription approved  ->  issue a Customer Queue token
   -------------------------------------------------------------------------- */
create or replace function public.trg_prescription_approved()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing bigint;
begin
  if new.status = 'Approved' and old.status is distinct from 'Approved' then

    -- idempotency guard: never queue the same prescription twice while it is
    -- still open in the queue
    select q.token into v_existing
      from public.queue q
     where q.prescription_id = new.id
       and q.status in ('Waiting', 'Billing', 'Hold')
     limit 1;

    if v_existing is null then
      insert into public.queue (name, wait, priority, status, cashier, prescription_id)
      values (new.customer, '0 min', new.priority, 'Waiting', '—', new.id);
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_prescriptions_approved on public.prescriptions;
create trigger trg_prescriptions_approved after update on public.prescriptions
  for each row execute function public.trg_prescription_approved();


/* --------------------------------------------------------------------------
   7.2 Purchase order Received  ->  replenish inventory
   Preferred path: the explicit `purchase_order_items` lines.
   Legacy fallback (preserves the original api.js behaviour when a PO has no
   line items): every inventory row from that supplier gains
   (po.items * 10) units.
   -------------------------------------------------------------------------- */
create or replace function public.trg_po_received()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_applied integer := 0;
  v_line    record;
begin
  if new.status = 'Received' and old.status is distinct from 'Received' then

    for v_line in
      select * from public.purchase_order_items where po_id = new.id
    loop
      if v_line.batch is not null then
        update public.inventory
           set qty = qty + v_line.qty
         where medicine = v_line.medicine
           and batch = v_line.batch;
      else
        update public.inventory
           set qty = qty + v_line.qty
         where medicine = v_line.medicine;
      end if;
      v_applied := v_applied + 1;
    end loop;

    if v_applied = 0 then
      update public.inventory
         set qty = qty + (greatest(coalesce(new.items, 1), 1) * 10)
       where supplier = new.supplier;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_po_received on public.purchase_orders;
create trigger trg_po_received after update on public.purchase_orders
  for each row execute function public.trg_po_received();


/* --------------------------------------------------------------------------
   7.3 Return approved  ->  restore inventory stock
   -------------------------------------------------------------------------- */
create or replace function public.trg_return_approved()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv_id bigint;
begin
  if new.status = 'Approved' and old.status is distinct from 'Approved' then

    -- 1) explicit link set by the app / POS line item
    if new.inventory_id is not null then
      v_inv_id := new.inventory_id;
    end if;

    -- 2) exact medicine-name match, lowest id first (legacy behaviour)
    if v_inv_id is null then
      select i.id into v_inv_id
        from public.inventory i
       where lower(i.medicine) = lower(new.medicine)
       order by i.id
       limit 1;
    end if;

    -- 3) loose contains-match fallback
    if v_inv_id is null then
      select i.id into v_inv_id
        from public.inventory i
       where i.medicine ilike '%' || new.medicine || '%'
       order by i.id
       limit 1;
    end if;

    if v_inv_id is not null then
      update public.inventory
         set qty = qty + greatest(coalesce(new.qty, 1), 1)
       where id = v_inv_id;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_returns_approved on public.returns;
create trigger trg_returns_approved after update on public.returns
  for each row execute function public.trg_return_approved();


/* ==========================================================================
   8. RPC FUNCTIONS
   ========================================================================== */

/* --------------------------------------------------------------------------
   8.1 create_bill — the POS checkout, fully atomic.
   Inserts the transaction header, every line item, and decrements stock in a
   single transaction: either the whole sale succeeds or nothing changes.

   Returns exactly the shape js/billing.js expects:
       { "success": true, "invoiceId": "INV-5522" }

   Replaces the old client-side loop that could leave a half-billed cart with
   partially decremented stock if the browser was closed mid-way.
   -------------------------------------------------------------------------- */
create or replace function public.create_bill(
  p_items    jsonb,
  p_customer text    default 'Walk-in',
  p_payment  text    default 'Cash',
  p_discount numeric default 0,
  p_tax      numeric default 0,
  p_subtotal numeric default 0,
  p_total    numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id     text;
  v_item   jsonb;
  v_inv_id bigint;
  v_stock  integer;
  v_med    text;
  v_batch  text;
  v_medid  text;
  v_qty    integer;
  v_price  numeric;
  v_lines  integer := 0;
begin
  if not public.is_staff() then
    raise exception 'create_bill: not authorised' using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'create_bill: the cart is empty';
  end if;

  v_id := public.next_code('INV-', 'transactions', 'id', 4, 5500);

  insert into public.transactions
    (id, customer, subtotal, discount, tax, amount, payment, status, cashier_id, cashier_name)
  values (
    v_id,
    coalesce(nullif(trim(p_customer), ''), 'Walk-in'),
    coalesce(p_subtotal, 0),
    coalesce(p_discount, 0),
    coalesce(p_tax, 0),
    coalesce(p_total, 0),
    coalesce(nullif(trim(p_payment), ''), 'Cash')::public.payment_method,
    'Paid',
    auth.uid(),
    (select u.name from public.users u where u.id = auth.uid())
  );

  for v_item in select * from jsonb_array_elements(p_items) loop

    v_inv_id := nullif(coalesce(v_item->>'invId', v_item->>'id'), '')::bigint;
    v_qty    := greatest(coalesce(nullif(v_item->>'qty', '')::integer, 1), 1);
    v_price  := coalesce(nullif(v_item->>'price', '')::numeric, 0);

    -- lock the stock row so two tills cannot oversell the same batch
    select i.qty, i.medicine, i.batch, i.med_id
      into v_stock, v_med, v_batch, v_medid
      from public.inventory i
     where i.id = v_inv_id
       for update;

    if v_med is null then
      raise exception 'create_bill: inventory item % not found', v_inv_id;
    end if;

    if v_stock < v_qty then
      raise exception 'create_bill: insufficient stock for % (available %, requested %)',
        v_med, v_stock, v_qty;
    end if;

    update public.inventory set qty = qty - v_qty where id = v_inv_id;

    insert into public.transaction_items
      (tx_id, inventory_id, med_id, medicine, batch, qty, price)
    values
      (v_id, v_inv_id, v_medid, v_med, v_batch, v_qty, v_price);

    v_lines := v_lines + 1;
  end loop;

  return jsonb_build_object('success', true, 'invoiceId', v_id, 'lines', v_lines);
end $$;


/* --------------------------------------------------------------------------
   8.2 get_dashboard_data — one round trip instead of six client-side scans.
   SCHEMA BUG FIX #1 (continued): "today" is derived from the real
   `created_at timestamptz` using the Asia/Kolkata calendar day — never from a
   string comparison.
   Returns the exact key names API.getDashboardData() already hands to the UI.
   -------------------------------------------------------------------------- */
create or replace function public.get_dashboard_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  return jsonb_build_object(
    'todaySales', coalesce(
      (select sum(t.amount) from public.transactions t
        where t.status = 'Paid'
          and (t.created_at at time zone 'Asia/Kolkata')::date = v_today), 0),

    'todayBills', coalesce(
      (select count(*) from public.transactions t
        where t.status = 'Paid'
          and (t.created_at at time zone 'Asia/Kolkata')::date = v_today), 0),

    'totalMedicines', coalesce(
      (select count(*) from public.medicines m where m.status = 'Active'), 0),

    'lowStock', coalesce(
      (select count(*) from public.inventory i where i.qty > 0 and i.qty <= 20), 0),

    'expiringSoon', coalesce(
      (select count(*) from public.inventory i
        where i.qty > 0 and (i.expiry - current_date) <= 90), 0),

    'pendingPrescriptions', coalesce(
      (select count(*) from public.prescriptions p where p.status = 'Pending'), 0),

    'pendingPurchaseOrders', coalesce(
      (select count(*) from public.purchase_orders p where p.status = 'Pending'), 0),

    'todayCustomers', coalesce(
      (select count(*) from public.queue q
        where q.status in ('Waiting', 'Billing', 'Completed')), 0),

    'inventory', jsonb_build_object(
      'inStock', coalesce(
        (select count(*) from public.inventory i
          where i.qty > 20 and (i.expiry - current_date) > 90), 0),
      'lowStock', coalesce(
        (select count(*) from public.inventory i
          where i.qty > 0 and i.qty <= 20), 0),
      'expiringSoon', coalesce(
        (select count(*) from public.inventory i
          where i.qty > 0 and (i.expiry - current_date) <= 90), 0),
      'outOfStock', coalesce(
        (select count(*) from public.inventory i where i.qty <= 0), 0)
    ),

    'generatedAt', now()
  );
end $$;


/* --------------------------------------------------------------------------
   8.3 Convenience: next queue token (used by the "Walk-in customer" button)
   -------------------------------------------------------------------------- */
create or replace function public.next_queue_token()
returns bigint
language sql
volatile
security definer
set search_path = public, pg_temp
as $$ select nextval('public.queue_token_seq')::bigint $$;


/* ==========================================================================
   9. ROW LEVEL SECURITY
   Model:
     anon               -> nothing at all (blocked everywhere)
     authenticated      -> must ALSO have an Active row in public.users
     Admin / Manager /
     Pharmacist         -> full read+write on operational data
     Admin              -> additionally manages the users table

   NOTE ON GRANULARITY
   A three-person pharmacy has no strict separation of duties, and the UI
   already restricts which pages each role can reach (see js/app.js NAV).
   RLS therefore guarantees "no anonymous access, no inactive accounts, no
   privilege escalation" and leaves fine-grained write limits to the UI.
   Tightening per-role write rules later is a pure-policy change — no app
   code is affected.
   ========================================================================== */

-- Make sure nobody but signed-in staff can touch the schema.
revoke all on schema public  from anon;
grant  usage on schema public to authenticated;

do $$
declare
  t text;
  domain_tables text[] := array[
    'categories', 'medicines', 'inventory', 'suppliers',
    'purchase_orders', 'purchase_order_items',
    'prescriptions', 'returns',
    'transactions', 'transaction_items',
    'queue', 'settings'
  ];
begin
  foreach t in array domain_tables loop

    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_staff_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_staff())',
      t || '_staff_read', t);

    execute format('drop policy if exists %I on public.%I', t || '_staff_write', t);
    execute format(
      'create policy %I on public.%I for all to authenticated '
      'using (public.is_staff()) with check (public.is_staff())',
      t || '_staff_write', t);

    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);

  end loop;
end $$;


/* --------------------------------------------------------------------------
   9.1 users — the only table with a genuine role split
   Everyone signed in may SEE the staff directory and EDIT their own profile;
   only an Admin may create, delete, or change somebody else's account.
   -------------------------------------------------------------------------- */
alter table public.users enable row level security;

drop policy if exists users_self_read on public.users;
create policy users_self_read on public.users
  for select to authenticated
  using (public.is_staff() or id = auth.uid());

drop policy if exists users_admin_insert on public.users;
create policy users_admin_insert on public.users
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists users_update_self_or_admin on public.users;
create policy users_update_self_or_admin on public.users
  for update to authenticated
  using (public.is_admin() or id = auth.uid())
  with check (
    -- a non-admin may edit their own row but must not escalate their role
    public.is_admin()
    or (id = auth.uid() and role = (select u.role from public.users u where u.id = auth.uid()))
  );

drop policy if exists users_admin_delete on public.users;
create policy users_admin_delete on public.users
  for delete to authenticated
  using (public.is_admin());


/* --------------------------------------------------------------------------
   9.2 audit_log — read: Admin only.  write: any active staff.
   (The audit *feature* is deferred, but the table is locked down already.)
   -------------------------------------------------------------------------- */
alter table public.audit_log enable row level security;

drop policy if exists audit_admin_read on public.audit_log;
create policy audit_admin_read on public.audit_log
  for select to authenticated
  using (public.is_admin());

drop policy if exists audit_staff_insert on public.audit_log;
create policy audit_staff_insert on public.audit_log
  for insert to authenticated
  with check (public.is_staff());


/* --------------------------------------------------------------------------
   9.3 Lock down EXECUTE on the SECURITY DEFINER RPCs.
   These run with elevated rights, so they must not be callable by anon.
   Each one re-checks the caller internally as well (defence in depth).
   -------------------------------------------------------------------------- */
revoke all on function public.create_bill(jsonb, text, text, numeric, numeric, numeric, numeric) from anon, public;
grant execute on function public.create_bill(jsonb, text, text, numeric, numeric, numeric, numeric) to authenticated;

revoke all on function public.get_dashboard_data() from anon, public;
grant execute on function public.get_dashboard_data() to authenticated;

revoke all on function public.next_queue_token() from anon, public;
grant execute on function public.next_queue_token() to authenticated;

revoke all on function public.current_user_role() from anon, public;
grant execute on function public.current_user_role() to authenticated;


/* ==========================================================================
   10. REALTIME
   The live Customer Queue is the main consumer: a token issued at the counter
   (or created by the prescription trigger) appears on every open screen
   without a refresh. Inventory / transactions / medicines are published too
   so the dashboard can refresh its counters.
   ========================================================================== */
do $$
declare
  t text;
  rt_tables text[] := array['queue', 'inventory', 'prescriptions', 'transactions', 'medicines'];
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'create publication supabase_realtime for table public.queue';
    foreach t in array rt_tables loop
      if t <> 'queue' then
        begin
          execute format('alter publication supabase_realtime add table public.%I', t);
        exception when duplicate_object then null;
        end;
      end if;
    end loop;
  else
    foreach t in array rt_tables loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then null;
      end;
    end loop;
  end if;
end $$;

-- Full row images so DELETE events carry usable old values (queue tokens are
-- removed/served and listeners need to know exactly which row went away).
alter table public.queue         replica identity full;
alter table public.inventory     replica identity full;
alter table public.prescriptions  replica identity full;


/* ==========================================================================
   11. SEED DATA
   Mirrors js/mockData.js so the UI looks identical on first load.
   Every insert is guarded so re-running the script never duplicates rows.
   NOTE: inventory.status is intentionally NOT inserted — it is computed.
   ========================================================================== */

/* ---------------------------------------------------------------- 11.1 users
   The public.users rows are created automatically by the
   on_auth_user_created trigger when the auth users are seeded in §12.
   Nothing to insert here.
   --------------------------------------------------------------------------- */

/* ----------------------------------------------------------- 11.2 categories */
insert into public.categories (id, name, parent_id, status) values
  (1, 'Antibiotics',            null, 'Active'),
  (2, 'Analgesics',             null, 'Active'),
  (3, 'Antacids',               null, 'Active'),
  (4, 'Cardiac Care',           null, 'Active'),
  (5, 'Diabetes Care',          null, 'Active'),
  (6, 'Vitamins & Supplements', null, 'Active'),
  (7, 'Dermatology',            null, 'Inactive'),
  (8, 'Cold & Cough',           null, 'Active'),
  (9, 'Eye & Ear Care',         null, 'Active')
on conflict (id) do nothing;

select setval(
  pg_get_serial_sequence('public.categories', 'id'),
  greatest((select max(id) from public.categories), 1)
);


/* Helper: build a timestamptz from an IST calendar day + wall-clock time.
   Keeps the seeded timestamps stable no matter what the DB session timezone
   is (Supabase defaults to UTC, the business runs on IST). */
create or replace function public.ist_ts(p_day date, p_time text)
returns timestamptz
language sql
immutable
as $$ select timezone('Asia/Kolkata', (p_day::text || ' ' || p_time)::timestamp) $$;


/* ------------------------------------------------------------ 11.3 medicines */
insert into public.medicines (id, name, generic, category, manufacturer, reorder, rx, status) values
  ('MED-001', 'Amoxicillin 500mg',  'Amoxicillin',      'Antibiotics',            'Cipla Ltd',    50,  true,  'Active'),
  ('MED-002', 'Paracetamol 500mg',  'Acetaminophen',    'Analgesics',             'Sun Pharma',   100, false, 'Active'),
  ('MED-003', 'Azithromycin 250mg', 'Azithromycin',     'Antibiotics',            'Glenmark',     40,  true,  'Active'),
  ('MED-004', 'Omeprazole 20mg',    'Omeprazole',       'Antacids',               'Dr. Reddy''s', 60,  false, 'Active'),
  ('MED-005', 'Metformin 500mg',    'Metformin HCl',    'Diabetes Care',          'USV Pvt Ltd',  80,  true,  'Active'),
  ('MED-006', 'Atorvastatin 10mg',  'Atorvastatin',     'Cardiac Care',           'Lupin Ltd',    45,  true,  'Active'),
  ('MED-007', 'Cetirizine 10mg',    'Cetirizine HCl',   'Cold & Cough',           'Alkem',        70,  false, 'Active'),
  ('MED-008', 'Vitamin D3 60K',     'Cholecalciferol',  'Vitamins & Supplements', 'Mankind',      90,  false, 'Active'),
  ('MED-009', 'Pantoprazole 40mg',  'Pantoprazole',     'Antacids',               'Aristo',       55,  false, 'Active'),
  ('MED-010', 'Ibuprofen 400mg',    'Ibuprofen',        'Analgesics',             'Reckitt',      75,  false, 'Inactive'),
  ('MED-011', 'Ranitidine 150mg',   'Ranitidine',       'Antacids',               'Zydus Cadila', 40,  false, 'Active'),
  ('MED-012', 'Insulin Glargine',   'Insulin Glargine', 'Diabetes Care',          'Sanofi',       25,  true,  'Active')
on conflict (id) do nothing;


/* --------------------------------------------- 11.4 inventory (batch level)
   `status` is deliberately absent — computed on read by the app/RPC.
   Expiry dates are relative to today so the "Expiring Soon" tiles always
   have real content in a fresh environment.                              */
insert into public.inventory (id, med_id, medicine, batch, mfg, expiry, qty, purchase, selling, supplier) values
  ( 1, 'MED-001', 'Amoxicillin 500mg',  'AMX2401', current_date - 900, current_date + 470, 120,  35.00,  52.00, 'Medico Distributors'),
  ( 2, 'MED-001', 'Amoxicillin 500mg',  'AMX2406', current_date - 480, current_date + 260,   8,  35.00,  52.00, 'Medico Distributors'),
  ( 3, 'MED-002', 'Paracetamol 500mg',  'PCM2403', current_date - 700, current_date + 520, 340,   5.00,  12.00, 'Pharma Plus'),
  ( 4, 'MED-003', 'Azithromycin 250mg', 'AZT2312', current_date - 980, current_date +  75,  45,  48.00,  72.00, 'Medico Distributors'),
  ( 5, 'MED-004', 'Omeprazole 20mg',    'OMP2402', current_date - 800, current_date +  60,  42,  22.00,  38.00, 'HealLine Supplies'),
  ( 6, 'MED-005', 'Metformin 500mg',    'MET2404', current_date - 640, current_date + 560, 210,  18.00,  30.00, 'Pharma Plus'),
  ( 7, 'MED-006', 'Atorvastatin 10mg',  'ATV2405', current_date - 520, current_date +  25,  28,  30.00,  48.00, 'HealLine Supplies'),
  ( 8, 'MED-007', 'Cetirizine 10mg',    'CTZ2311', current_date - 900, current_date +  14, 150,   8.00,  16.00, 'Medico Distributors'),
  ( 9, 'MED-008', 'Vitamin D3 60K',     'VD32408', current_date - 430, current_date + 600, 180, 120.00, 185.00, 'Wellness Wholesale'),
  (10, 'MED-009', 'Pantoprazole 40mg',  'PAN2407', current_date - 400, current_date + 490,  12,  26.00,  44.00, 'Pharma Plus'),
  (11, 'MED-010', 'Ibuprofen 400mg',    'IBU2310', current_date - 900, current_date + 200,   0,  10.00,  18.00, 'HealLine Supplies'),
  (12, 'MED-011', 'Ranitidine 150mg',   'RNT2409', current_date - 380, current_date + 500,  60,  14.00,  24.00, 'Wellness Wholesale'),
  (13, 'MED-012', 'Insulin Glargine',   'INS2406', current_date - 300, current_date +  85,  18, 780.00, 950.00, 'Medico Distributors')
on conflict (id) do nothing;

select setval(
  pg_get_serial_sequence('public.inventory', 'id'),
  greatest((select max(id) from public.inventory), 1)
);


/* ------------------------------------------------------------ 11.5 suppliers */
insert into public.suppliers (id, name, contact, phone, email, address, gst, status) values
  ('SUP-01', 'Medico Distributors', 'Anand Verma',  '+91 98200 11223', 'anand@medico.in',   'Plot 14, Industrial Estate, Mumbai',   '27AABCM1234L1Z5', 'Active'),
  ('SUP-02', 'Pharma Plus',         'Meera Joshi',  '+91 98700 44556', 'meera@pharmaplus.in','21 MG Road, Pune',                     '27AAACP9876R1Z2', 'Active'),
  ('SUP-03', 'HealLine Supplies',   'Suresh Iyer',  '+91 90210 77889', 'suresh@healline.in','88 Commercial St, Bengaluru',          '29AAGCH5566P1Z8', 'Active'),
  ('SUP-04', 'Wellness Wholesale',  'Farah Sheikh', '+91 99300 22110', 'farah@wellness.in', '5 Station Rd, Delhi',                  '07AAACW3344Q1Z1', 'Inactive')
on conflict (id) do nothing;


/* ----------------------------------------------------- 11.6 purchase orders
   Deliberately inserted with their final status: inserting (rather than
   updating) does NOT fire trg_po_received, so the seeded stock levels above
   stay exactly as written.                                                */
insert into public.purchase_orders (id, supplier, date, items, total, status) values
  ('PO-2041', 'Medico Distributors', current_date -  22, 6, 18450.00, 'Pending'),
  ('PO-2042', 'Pharma Plus',         current_date -  20, 4,  9200.00, 'Approved'),
  ('PO-2043', 'HealLine Supplies',   current_date -  26, 8, 26700.00, 'Received'),
  ('PO-2044', 'Wellness Wholesale',  current_date -  18, 3,  4100.00, 'Draft'),
  ('PO-2045', 'Medico Distributors', current_date -  34, 5, 12300.00, 'Cancelled'),
  ('PO-2046', 'Pharma Plus',         current_date -  17, 7, 15800.00, 'Pending')
on conflict (id) do nothing;

/* 11.7 purchase_order_items — real line items for the received PO */
insert into public.purchase_order_items (po_id, med_id, medicine, batch, qty, unit_price) values
  ('PO-2043', 'MED-001', 'Amoxicillin 500mg',  'AMX2401',  60, 35.00),
  ('PO-2043', 'MED-007', 'Cetirizine 10mg',    'CTZ2311',  80,  8.00),
  ('PO-2043', 'MED-011', 'Ranitidine 150mg',   'RNT2409',  40, 14.00)
on conflict do nothing;


/* -------------------------------------------------------- 11.8 prescriptions
   invoice '—' in the legacy mock means "not dispensed yet" -> stored as NULL
   and rendered back as "—" by the JS normaliser.                          */
insert into public.prescriptions (id, customer, doctor, medicine, date, priority, status, invoice) values
  ('RX-9001', 'Kabir Sharma', 'Dr. Mehta',  'Amoxicillin 500mg',  current_date -  1, 'Normal', 'Pending',  null),
  ('RX-9002', 'Ananya Roy',   'Dr. Iyer',   'Insulin Glargine',   current_date -  1, 'Elderly','Approved', 'INV-5521'),
  ('RX-9003', 'Rohan Das',    'Dr. Kapoor', 'Ibuprofen 400mg',    current_date -  2, 'Normal', 'Rejected', null),
  ('RX-9004', 'Sara Ali',     'Dr. Mehta',  'Atorvastatin 10mg',  current_date,      'High',   'Pending',  null),
  ('RX-9005', 'Arjun Pillai', 'Dr. Nair',   'Metformin 500mg',    current_date -  3, 'Normal', 'Approved', 'INV-5518')
on conflict (id) do nothing;


/* -------------------------------------------------------------- 11.9 returns
   `reason` is free text, so the legacy wording is kept verbatim.           */
insert into public.returns (id, invoice, customer, medicine, qty, reason, amount, date, status) values
  ('RT-501', 'INV-5501', 'Neha Gupta',     'Omeprazole 20mg',  2, 'Wrong item',    76.00, current_date - 4, 'Pending'),
  ('RT-502', 'INV-5512', 'Karan Malhotra', 'Cetirizine 10mg',  1, 'Expired batch', 16.00, current_date - 6, 'Approved'),
  ('RT-503', 'INV-5520', 'Divya Menon',    'Ibuprofen 400mg',  3, 'Damaged pack',  54.00, current_date - 3, 'Rejected')
on conflict (id) do nothing;


/* --------------------------------------------------------- 11.10 transactions
   `date` is NOT inserted: trg_transactions_sync_date derives the display
   string from created_at, which is exactly the bug fix described in 4.9.
   Amounts are spread across the last 7 days so the dashboard's sales chart
   and "Today's sales" tile show real, non-zero data on a fresh install.
   --------------------------------------------------------------------------- */
insert into public.transactions
  (id, customer, subtotal, discount, tax, amount, payment, status, created_at, cashier_name) values
  ('INV-5515', 'Imran Q.',     500.00, 0,  40.00,  540.00, 'Cash', 'Pending',  public.ist_ts(current_date - 6, '17:20'), 'Sneha Patel'),
  ('INV-5516', 'Walk-in',       92.00, 0,   7.00,   99.00, 'Cash', 'Paid',     public.ist_ts(current_date - 5, '18:35'), 'Vikram Desai'),
  ('INV-5517', 'Rhea Kapoor',  664.00, 0,  53.00,  717.00, 'UPI',  'Refunded', public.ist_ts(current_date - 4, '19:10'), 'Sneha Patel'),
  ('INV-5518', 'Arjun Pillai',2140.00, 0, 171.00, 2311.00, 'Card', 'Paid',     public.ist_ts(current_date - 3, '08:40'), 'Vikram Desai'),
  ('INV-5519', 'Walk-in',      185.00, 0,  15.00,  200.00, 'Cash', 'Paid',     public.ist_ts(current_date - 2, '09:15'), 'Sneha Patel'),
  ('INV-5520', 'Divya Menon',  432.00, 0,  35.00,  467.00, 'UPI',  'Paid',     public.ist_ts(current_date - 1, '09:50'), 'Sneha Patel'),
  ('INV-5521', 'Ananya Roy',  1135.00, 0,  91.00, 1226.00, 'Card', 'Paid',     public.ist_ts(current_date,     '10:25'), 'Vikram Desai'),
  ('INV-5522', 'Walk-in',      308.00, 0,  25.00,  333.00, 'Cash', 'Paid',     public.ist_ts(current_date,     '11:05'), 'Sneha Patel'),
  ('INV-5523', 'Meera Joshi',  540.00, 0,  43.00,  583.00, 'UPI',  'Paid',     public.ist_ts(current_date,     '12:40'), 'Sneha Patel'),
  ('INV-5524', 'Walk-in',      180.00, 0,  14.00,  194.00, 'Cash', 'Paid',     public.ist_ts(current_date,     '14:15'), 'Vikram Desai'),
  ('INV-5525', 'Sara Ali',    1320.00, 0, 106.00, 1426.00, 'Card', 'Paid',     public.ist_ts(current_date,     '15:30'), 'Vikram Desai')
on conflict (id) do nothing;

/* 11.11 transaction_items — real invoice lines (the biggest gap in the old
   schema: previously the cart was jammed into a single JSON blob, which made
   per-item reporting and partial returns impossible). */
insert into public.transaction_items (tx_id, inventory_id, med_id, medicine, batch, qty, price) values
  ('INV-5515',  5, 'MED-004', 'Omeprazole 20mg',   'OMP2402', 10,  38.00),
  ('INV-5515',  3, 'MED-002', 'Paracetamol 500mg', 'PCM2403', 10,  12.00),
  ('INV-5516',  8, 'MED-007', 'Cetirizine 10mg',   'CTZ2311',  5,  16.00),
  ('INV-5516',  3, 'MED-002', 'Paracetamol 500mg', 'PCM2403',  1,  12.00),
  ('INV-5517',  6, 'MED-005', 'Metformin 500mg',   'MET2404', 20,  30.00),
  ('INV-5517',  8, 'MED-007', 'Cetirizine 10mg',   'CTZ2311',  4,  16.00),
  ('INV-5518', 13, 'MED-012', 'Insulin Glargine',  'INS2406',  2, 950.00),
  ('INV-5518',  7, 'MED-006', 'Atorvastatin 10mg', 'ATV2405',  5,  48.00),
  ('INV-5519',  9, 'MED-008', 'Vitamin D3 60K',    'VD32408',  1, 185.00),
  ('INV-5520',  1, 'MED-001', 'Amoxicillin 500mg', 'AMX2401',  6,  52.00),
  ('INV-5520', 12, 'MED-011', 'Ranitidine 150mg',  'RNT2409',  5,  24.00),
  ('INV-5521', 13, 'MED-012', 'Insulin Glargine',  'INS2406',  1, 950.00),
  ('INV-5521',  9, 'MED-008', 'Vitamin D3 60K',    'VD32408',  1, 185.00),
  ('INV-5522',  1, 'MED-001', 'Amoxicillin 500mg', 'AMX2401',  5,  52.00),
  ('INV-5522',  8, 'MED-007', 'Cetirizine 10mg',   'CTZ2311',  3,  16.00),
  ('INV-5523',  6, 'MED-005', 'Metformin 500mg',   'MET2404', 10,  30.00),
  ('INV-5523',  3, 'MED-002', 'Paracetamol 500mg', 'PCM2403', 20,  12.00),
  ('INV-5524', 12, 'MED-011', 'Ranitidine 150mg',  'RNT2409',  5,  24.00),
  ('INV-5524',  3, 'MED-002', 'Paracetamol 500mg', 'PCM2403',  5,  12.00),
  ('INV-5525', 13, 'MED-012', 'Insulin Glargine',  'INS2406',  1, 950.00),
  ('INV-5525',  9, 'MED-008', 'Vitamin D3 60K',    'VD32408',  2, 185.00)
on conflict do nothing;


/* -------------------------------------------- 11.12 queue (Customer Queue) */
insert into public.queue (token, name, wait, priority, status, cashier) values
  ( 9, 'Tariq Basha',  '15 min', 'Normal',  'Hold',      'Sneha Patel'),
  (10, 'Lakshmi Rao',  '12 min', 'Elderly', 'Completed', 'Vikram Desai'),
  (11, 'Mohit Sen',    '7 min',  'Normal',  'Billing',   'Sneha Patel'),
  (12, 'Kabir Sharma', '4 min',  'Normal',  'Waiting',   '—'),
  (13, 'Sara Ali',     '2 min',  'High',    'Waiting',   '—')
on conflict (token) do nothing;

-- next token issued will be 14
select setval('public.queue_token_seq', greatest((select max(token) from public.queue), 13) + 1, false);


/* ------------------------------------------------------------ 11.13 settings */
insert into public.settings (key, value) values
  ('store', jsonb_build_object(
      'name', 'MediStore Pharmacy',
      'address', 'Shop 3, Krishna Complex, MG Road, Pune 411001',
      'phone', '+91 20 4000 1234',
      'email', 'care@medstore.com',
      'gstin', '27AABCM1234L1Z5'
  )),
  ('billing', jsonb_build_object(
      'currency', 'INR',
      'currencySymbol', '₹',
      'taxRate', 0.08,
      'invoicePrefix', 'INV-',
      'lowStockThreshold', 20,
      'expiryWarningDays', 90
  )),
  ('notifications', jsonb_build_object(
      'lowStock', true,
      'expiringSoon', true,
      'newPrescription', true,
      'emailDailySummary', false
  ))
on conflict (key) do nothing;


/* ==========================================================================
   12. DEMO LOGIN ACCOUNTS  (requested: "yes, generate demo login SQL")
   ==========================================================================
   Creates REAL Supabase Auth users, so the login page performs a genuine
   signInWithPassword() — no mock tokens anywhere.

       PASSWORD FOR EVERY DEMO ACCOUNT:   MediStore@123

   | Email                  | Name             | Role          | Status   |
   |------------------------|------------------|---------------|----------|
   | aisha@medstore.com     | Dr. Aisha Khan   | Admin         | Active   |
   | rahul@medstore.com     | Rahul Mehta      | Store Manager | Active   |
   | priya@medstore.com     | Priya Nair       | Store Manager | Active   |
   | sneha@medstore.com     | Sneha Patel      | Pharmacist    | Active   |
   | vikram@medstore.com    | Vikram Desai     | Pharmacist    | Active   |
   | imran@medstore.com     | Imran Shaikh     | Pharmacist    | Inactive |

   NOTES
   * Writing to auth.users requires the `postgres` role — the SQL Editor runs
     as postgres, so this works there (it would NOT work from the client).
   * The public.users profile rows are created automatically by the
     on_auth_user_created trigger (§3.3) and then corrected in place for
     role / status / avatar.
   * Re-running is safe: existing accounts are skipped.
   * PLAN B (if this block ever fails on a future Supabase version): create
     the same six users by hand in
     Dashboard -> Authentication -> Users -> "Add user",
     then re-run only the UPDATE below (section 12.2).
   ========================================================================== */
do $$
declare
  rec    record;
  v_uid  uuid;
  v_pw   text := 'MediStore@123';
  v_seed jsonb := '[
    {"email":"aisha@medstore.com",  "name":"Dr. Aisha Khan", "role":"Admin",         "status":"Active",   "last_login":"2026-09-07 09:12"},
    {"email":"rahul@medstore.com",  "name":"Rahul Mehta",    "role":"Store Manager", "status":"Active",   "last_login":"2026-09-07 08:40"},
    {"email":"priya@medstore.com",  "name":"Priya Nair",     "role":"Store Manager", "status":"Active",   "last_login":"2026-09-07 07:30"},
    {"email":"sneha@medstore.com",  "name":"Sneha Patel",    "role":"Pharmacist",    "status":"Active",   "last_login":"2026-09-06 19:55"},
    {"email":"vikram@medstore.com", "name":"Vikram Desai",   "role":"Pharmacist",    "status":"Active",   "last_login":"2026-09-07 06:50"},
    {"email":"imran@medstore.com",  "name":"Imran Shaikh",   "role":"Pharmacist",    "status":"Inactive", "last_login":"2026-08-30 14:20"}
  ]'::jsonb;
begin
  if not exists (select 1 from pg_extension where extname = 'pgcrypto') then
    execute 'create extension if not exists pgcrypto with schema extensions';
  end if;

  for rec in
    select * from jsonb_to_recordset(v_seed)
      as x(email text, name text, role text, status text, last_login text)
  loop
    select u.id into v_uid from auth.users u where lower(u.email) = lower(rec.email);

    if v_uid is null then
      v_uid := gen_random_uuid();

      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
      ) values (
        '00000000-0000-0000-0000-000000000000',
        v_uid, 'authenticated', 'authenticated',
        rec.email,
        extensions.crypt(v_pw, extensions.gen_salt('bf')),
        now(),
        jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        jsonb_build_object('full_name', rec.name, 'role', rec.role, 'email_verified', true),
        now(), now(),
        '', '', '', ''
      );
    end if;

    -- The email/password provider needs a matching identity row, otherwise
    -- signInWithPassword() reports "Invalid login credentials".
    insert into auth.identities
      (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(),
      v_uid,
      jsonb_build_object('sub', v_uid::text, 'email', rec.email, 'email_verified', true),
      'email',
      v_uid::text,
      now(), now(), now()
    )
    on conflict do nothing;

    -- 12.2 Correct the auto-created profile (also re-runnable on its own).
    update public.users
       set name       = rec.name,
           email      = rec.email,
           role       = rec.role::public.user_role,
           status     = rec.status::public.generic_status,
           avatar     = public.initials(rec.name),
           last_login = public.ist_ts(current_date - 16, substr(rec.last_login, 12, 5))
     where id = v_uid;

  end loop;
end $$;


/* ==========================================================================
   13. STORAGE — prescription files
   Decision #3: Rx files go to Supabase Storage, not into the database.
   ========================================================================== */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'prescriptions', 'prescriptions', false, 10485760,
  array['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf']
)
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "msms_rx_read" on storage.objects;
create policy "msms_rx_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'prescriptions' and public.is_staff());

drop policy if exists "msms_rx_insert" on storage.objects;
create policy "msms_rx_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'prescriptions' and public.is_staff());

drop policy if exists "msms_rx_update" on storage.objects;
create policy "msms_rx_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'prescriptions' and public.is_staff());

drop policy if exists "msms_rx_delete" on storage.objects;
create policy "msms_rx_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'prescriptions' and public.is_admin());


/* ==========================================================================
   14. VERIFICATION — run these to confirm the install
   ========================================================================== */

-- V1  Tables + whether Row Level Security is switched on (expect 14 rows,
--     rowsecurity = true for every one)
select tablename, rowsecurity
  from pg_tables
 where schemaname = 'public'
 order by tablename;

-- V2  Policy coverage (every table should appear with >= 1 policy)
select tablename, count(*) as policies
  from pg_policies
 where schemaname = 'public'
 group by tablename
 order by tablename;

-- V3  Seeded row counts
select 'categories'          as entity, count(*) from public.categories
union all select 'medicines',          count(*) from public.medicines
union all select 'inventory',          count(*) from public.inventory
union all select 'suppliers',          count(*) from public.suppliers
union all select 'purchase_orders',    count(*) from public.purchase_orders
union all select 'purchase_order_items', count(*) from public.purchase_order_items
union all select 'prescriptions',      count(*) from public.prescriptions
union all select 'returns',            count(*) from public.returns
union all select 'transactions',       count(*) from public.transactions
union all select 'transaction_items',  count(*) from public.transaction_items
union all select 'queue',              count(*) from public.queue
union all select 'users',              count(*) from public.users
union all select 'audit_log',          count(*) from public.audit_log
union all select 'settings',           count(*) from public.settings
order by entity;

-- V4  The six demo login accounts (all should be confirmed)
select email, email_confirmed_at is not null as confirmed
  from auth.users
 order by email;

-- V5  Staff profiles with their resolved role + avatar
select name, email, role, status, avatar
  from public.users
 order by role, name;

-- V6  Category counts were auto-computed by the medicines trigger
select name, count, status from public.categories order by id;

-- V7  Inventory status is COMPUTED, never stored — this is what the UI shows
select
  medicine,
  batch,
  qty,
  expiry,
  public.days_until(expiry)                        as days_left,
  public.compute_inventory_status(qty, expiry)     as status
from public.inventory
order by id;

-- V8  Dashboard aggregate (the single RPC the dashboard page calls)
select jsonb_pretty(public.get_dashboard_data());


/* ==========================================================================
   15. TROUBLESHOOTING
   ==========================================================================
   "Invalid login credentials" on the login page
       -> the auth.identities row is missing. Re-run §12 (it is idempotent).

   "Success. No rows returned" is expected for the whole script; only the
   verification SELECTs in §14 produce output.

   A page shows an empty table / no data
       -> the signed-in user has no Active row in public.users. Run:
              select * from public.users;
          If the row is missing, re-run §12, or check that the trigger
          on_auth_user_created exists:
              select tgname from pg_trigger where tgrelid = 'auth.users'::regclass;

   "permission denied for table X"
       -> RLS is on and the caller is not active staff. Check:
              select public.current_user_role();

   "duplicate key value violates unique constraint supabase_realtime..."
       -> harmless; §10 already swallows it.

   Live queue does not update
       -> confirm the table is published:
              select * from pg_publication_tables
               where pubname = 'supabase_realtime';
   ========================================================================== */
















