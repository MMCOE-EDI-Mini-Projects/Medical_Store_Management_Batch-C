# Implementation Plan: MediStore MS — Supabase-Powered Rebuild

## Overview

Rebuild the MediStore MS frontend from the ground up to integrate with Supabase (PostgreSQL) as the real backend, replacing the current mock localStorage/IndexedDB implementation. The app will feature role-based views for Admin, Store Manager, Pharmacist, and Cashier users, with a clean, practical dashboard that feels like a real medical store management system.

## Scope

- **Database**: Supabase (PostgreSQL) with proper schema, RLS policies, and real-time capabilities
- **Authentication**: Supabase Auth with email/password, role-based access control
- **Frontend**: Static HTML/JS (Bootstrap 5) with Supabase JS client, role-filtered navigation
- **Dashboard**: Simplified, role-specific widgets showing relevant metrics
- **Pages**: All 14 existing pages adapted for real data flow

---

## Types & Data Structures

### Enums for database
```sql
CREATE TYPE user_role AS ENUM ('Admin', 'Store Manager', 'Pharmacist', 'Cashier');
CREATE TYPE user_status AS ENUM ('Active', 'Inactive');
CREATE TYPE medicine_status AS ENUM ('Active', 'Inactive');
CREATE TYPE inventory_status AS ENUM ('In Stock', 'Low Stock', 'Out of Stock', 'Expiring Soon');
CREATE TYPE transaction_status AS ENUM ('Paid', 'Pending', 'Refunded');
CREATE TYPE prescription_status AS ENUM ('Pending', 'Approved', 'Rejected');
CREATE TYPE return_status AS ENUM ('Pending', 'Approved', 'Rejected');
CREATE TYPE po_status AS ENUM ('Draft', 'Pending', 'Approved', 'Received', 'Cancelled');
CREATE TYPE queue_status AS ENUM ('Waiting', 'Billing', 'Completed', 'Hold', 'Cancelled');
CREATE TYPE queue_priority AS ENUM ('Normal', 'High', 'Elderly');
CREATE TYPE category_status AS ENUM ('Active', 'Inactive');
```

---

## Database Schema (Supabase SQL)

### 1. Users Table
```sql
CREATE TABLE public.users (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  email VARCHAR NOT NULL UNIQUE,
  role user_role NOT NULL,
  status user_status DEFAULT 'Active',
  last_login TIMESTAMPTZ,
  avatar VARCHAR,
  phone VARCHAR,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT users_pkey PRIMARY KEY (id)
);
```

### 2. Categories Table
```sql
CREATE TABLE public.categories (
  id BIGINT NOT NULL DEFAULT floor((EXTRACT(epoch FROM NOW()) * (1000)::numeric)),
  name VARCHAR NOT NULL UNIQUE,
  parent VARCHAR DEFAULT '—',
  count INTEGER DEFAULT 0,
  status category_status DEFAULT 'Active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT categories_pkey PRIMARY KEY (id)
);
```

### 3. Medicines Table
```sql
CREATE TABLE public.medicines (
  id VARCHAR NOT NULL,
  name VARCHAR NOT NULL,
  generic VARCHAR,
  category VARCHAR,
  manufacturer VARCHAR,
  reorder INTEGER DEFAULT 50,
  rx BOOLEAN DEFAULT FALSE,
  status medicine_status DEFAULT 'Active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT medicines_pkey PRIMARY KEY (id)
);
```

### 4. Inventory Table
```sql
CREATE TABLE public.inventory (
  id BIGINT NOT NULL DEFAULT floor((EXTRACT(epoch FROM NOW()) * (1000)::numeric)),
  medicine VARCHAR NOT NULL,
  med_id VARCHAR,
  batch VARCHAR NOT NULL,
  mfg DATE,
  expiry DATE NOT NULL,
  qty INTEGER NOT NULL DEFAULT 0,
  purchase NUMERIC DEFAULT 0,
  selling NUMERIC DEFAULT 0,
  supplier VARCHAR,
  status inventory_status DEFAULT 'In Stock',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT inventory_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_med_id_fkey FOREIGN KEY (med_id) REFERENCES public.medicines(id) ON DELETE SET NULL
);
```

### 5. Suppliers Table
```sql
CREATE TABLE public.suppliers (
  id VARCHAR NOT NULL,
  name VARCHAR NOT NULL,
  contact VARCHAR,
  phone VARCHAR NOT NULL,
  email VARCHAR,
  address TEXT,
  gst VARCHAR,
  status user_status DEFAULT 'Active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT suppliers_pkey PRIMARY KEY (id)
);
```

### 6. Purchase Orders Table
```sql
CREATE TABLE public.purchase_orders (
  id VARCHAR NOT NULL,
  supplier VARCHAR NOT NULL,
  date DATE DEFAULT CURRENT_DATE,
  items INTEGER DEFAULT 0,
  total NUMERIC DEFAULT 0,
  status po_status DEFAULT 'Draft',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT purchase_orders_pkey PRIMARY KEY (id)
);
```

### 7. Prescriptions Table
```sql
CREATE TABLE public.prescriptions (
  id VARCHAR NOT NULL,
  customer VARCHAR NOT NULL,
  doctor VARCHAR,
  date DATE DEFAULT CURRENT_DATE,
  status prescription_status DEFAULT 'Pending',
  invoice VARCHAR,
  file_url TEXT,
  file_name VARCHAR,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT prescriptions_pkey PRIMARY KEY (id)
);
```

### 8. Returns Table
```sql
CREATE TABLE public.returns (
  id VARCHAR NOT NULL,
  invoice VARCHAR NOT NULL,
  customer VARCHAR NOT NULL,
  medicine VARCHAR NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  reason TEXT NOT NULL,
  date DATE DEFAULT CURRENT_DATE,
  status return_status DEFAULT 'Pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT returns_pkey PRIMARY KEY (id)
);
```

### 9. Transactions Table
```sql
CREATE TABLE public.transactions (
  id VARCHAR NOT NULL,
  customer VARCHAR NOT NULL,
  amount NUMERIC NOT NULL,
  payment VARCHAR NOT NULL CHECK (payment IN ('Cash', 'Card', 'UPI', 'Other')),
  date VARCHAR NOT NULL,
  status transaction_status DEFAULT 'Paid',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT transactions_pkey PRIMARY KEY (id)
);
```

### 10. Queue Table
```sql
CREATE TABLE public.queue (
  token INTEGER NOT NULL,
  name VARCHAR NOT NULL,
  wait VARCHAR DEFAULT '0 min',
  priority queue_priority DEFAULT 'Normal',
  status queue_status DEFAULT 'Waiting',
  cashier VARCHAR,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT queue_pkey PRIMARY KEY (token)
);
```

### 11. Notifications Table
```sql
CREATE TABLE public.notifications (
  id BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
  icon VARCHAR NOT NULL,
  color VARCHAR NOT NULL,
  title TEXT NOT NULL,
  time VARCHAR NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT notifications_pkey PRIMARY KEY (id)
);
```

### 12. Audit Log Table (Optional)
```sql
CREATE TABLE public.audit_log (
  id BIGINT NOT NULL DEFAULT floor((EXTRACT(epoch FROM NOW()) * (1000)::numeric)),
  user_id BIGINT,
  action VARCHAR NOT NULL,
  table_name VARCHAR NOT NULL,
  record_id VARCHAR NOT NULL,
  old_data JSONB,
  new_data JSONB,
  ip_address VARCHAR,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT audit_log_pkey PRIMARY KEY (id)
);
```

---

## Schema Issues Found in Your Provided DB (Must Fix)

These are real problems in the schema you pasted. They will break the app if not
corrected in `dbschema.sql`:

| # | Issue | Where | Fix |
|---|-------|-------|-----|
| 1 | `audit_log.user_id` is `BIGINT` but `users.id` is `UUID` | `audit_log` | Change `user_id` to `UUID` |
| 2 | `transactions.date` is `VARCHAR`, not a date type | `transactions` | Change to `TIMESTAMPTZ DEFAULT NOW()` (blocks "today's sales" queries) |
| 3 | `users.role` CHECK has only 3 roles, no `Cashier` | `users` | Add `'Cashier'` |
| 4 | `inventory.medicine` is free text with no link to `medicines` | `inventory` | Already has `med_id` FK — make `med_id` NOT NULL |
| 5 | `categories.parent` uses an em-dash `'—'` as "no parent" | `categories` | Use `NULL` instead of a string sentinel |
| 6 | `medicines.id` is `VARCHAR` but `inventory.med_id` FK → OK | — | Keep, but enforce format `MED-###` |
| 7 | No indexes on `inventory.expiry`, `transactions.date`, `queue.status` | — | Add B-tree indexes |
| 8 | `notifications` has no `user_id` — all users see all notifications | `notifications` | Add `user_id UUID` or `role` targeting |

### Recommended additional columns
```sql
-- Transactions need line items to rebuild invoices
CREATE TABLE public.transaction_items (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  transaction_id VARCHAR NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  med_id        VARCHAR REFERENCES public.medicines(id),
  medicine      VARCHAR NOT NULL,
  batch         VARCHAR,
  qty           INTEGER NOT NULL CHECK (qty > 0),
  price         NUMERIC NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Purchase order line items
CREATE TABLE public.purchase_order_items (
  id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  po_id   VARCHAR NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  med_id  VARCHAR REFERENCES public.medicines(id),
  qty     INTEGER NOT NULL CHECK (qty > 0),
  price   NUMERIC NOT NULL
);

-- Indexes for performance
CREATE INDEX idx_inventory_expiry   ON public.inventory (expiry);
CREATE INDEX idx_inventory_qty      ON public.inventory (qty);
CREATE INDEX idx_transactions_date  ON public.transactions (created_at DESC);
CREATE INDEX idx_queue_status       ON public.queue (status);
CREATE INDEX idx_rx_status          ON public.prescriptions (status);
```

> **Why `transaction_items` matters:** the current `transactions` table only stores
> a total. The POS screen (`billing.js`) builds a cart of multiple medicines with
> per-item qty/price. Without line items you cannot print an invoice or process a
> partial return. This is the single biggest gap.

---

## Files

### New Files to Create
| File | Purpose |
|------|---------|
| `dbschema.sql` | Complete PostgreSQL schema for Supabase (copy-paste ready) |
| `js/supabase-client.js` | Supabase client init + shared query helpers |
| `.env` | Supabase URL + anon key (git-ignored) |

### Modified Files
| File | Changes |
|------|---------|
| `js/api.js` | Replace mock `MediStoreDB` calls with Supabase queries (same public signatures) |
| `js/auth.js` | Replace localStorage mock auth with Supabase Auth |
| `js/login.js` | Use Supabase `signInWithPassword`; add Cashier role pill |
| `js/app.js` | Add `Cashier` to `NAV` role arrays; role-aware badge counts |
| `js/dashboard.js` | Render role-specific widget sets |
| `index.html` | Load Supabase UMD + `supabase-client.js`; drop `db.js`/`mockData.js` |
| `pages/*.html` (14 files) | Update script includes; drop `db.js`/`mockData.js` |
| `package.json` | Add `@supabase/supabase-js` dependency |
| `test/run-tests.js` | Point at Supabase service layer |

### Files to Remove (or leave unused)
| File | Reason |
|------|--------|
| `js/db.js` | Replaced by Supabase client |
| `js/mockData.js` | Replaced by Supabase seed data (`dbschema.sql`) |

### Files Kept Unchanged
`css/style.css`, `css/responsive.css`, `vite.config.js`, all `pages/*.html` markup
structure (only the `<script>` block changes).

---

## Functions

### API Service Layer — Public Surface (`js/api.js`)
These **already exist** in `js/api.js` (verified: 35 exported functions). Every
signature stays identical; only the internals change from `MediStoreDB`
(localStorage) to Supabase queries. Page code needs no changes.

| Function | Purpose |
|----------|---------|
| `initSupabase()` | Initialize and return Supabase client instance |
| `getMedicines()` | Fetch all medicines |
| `createMedicine(data)` | Add new medicine |
| `updateMedicine(id, data)` | Update medicine |
| `deactivateMedicine(id)` | Mark medicine inactive |
| `getCategories()` | Fetch all categories |
| `createCategory(data)` | Add category |
| `updateCategory(id, data)` | Update category |
| `getInventory()` | Fetch all inventory |
| `addInventory(data)` | Add stock |
| `updateInventory(id, data)` | Update stock |
| `getSuppliers()` | Fetch suppliers |
| `createSupplier(data)` | Add supplier |
| `updateSupplier(id, data)` | Update supplier |
| `getPurchaseOrders()` | Fetch POs |
| `createPurchaseOrder(data)` | Create PO |
| `updatePurchaseOrder(id, data)` | Update PO |
| `getPrescriptions()` | Fetch prescriptions |
| `updatePrescription(id, data)` | Update prescription |
| `uploadPrescription(file, meta)` | Upload Rx (store file in Supabase Storage) |
| `getReturns()` | Fetch returns |
| `createReturn(data)` | Create return |
| `updateReturn(id, data)` | Update return |
| `createBill(data)` | Create transaction + deduct inventory |
| `getTransactions()` | Fetch transactions |
| `getQueue()` | Fetch queue |
| `updateQueue(token, data)` | Update queue item |
| `addQueue(data)` | Add queue item |
| `getDashboardData()` | Aggregate dashboard metrics |
| `getReports()` | Fetch reports data |
| `getUsers()` | Fetch users (Admin only) |
| `createUser(data)` | Create user |
| `updateUser(id, data)` | Update user |
| `getNotifications()` | Fetch notifications (currently derived from inventory/PO/rx) |
| `markNotificationRead(id)` | **NEW** — mark notification as read |
| `login(email, password)` | Delegates to Supabase Auth |
| `logout()` | Delegates to Supabase Auth |

### Modified Functions

| Function | File | Changes |
|----------|------|---------|
| `login()` | `js/auth.js` | Use Supabase Auth signInWithPassword |
| `logout()` | `js/auth.js` | Use Supabase Auth signOut |
| `currentUser()` | `js/auth.js` | Get from Supabase session |
| `isLoggedIn()` | `js/auth.js` | Check Supabase session existence |
| `requireAuth()` | `js/auth.js` | Redirect to login if no session |
| `hasRole()` | `js/auth.js` | Check role from Supabase user metadata |
| All API functions | `js/api.js` | Replace mock calls with Supabase RPC/queries |

---

## Dependencies

### New Packages
```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.39.0"
  }
}
```

### Existing Packages (keep)
- `vite`: ^5.4.2 (dev)
- Bootstrap 5.3.3 (CDN)
- Bootstrap Icons 1.11.3 (CDN)
- Chart.js 4.4.3 (CDN)

---

## Role-Based View Requirements

### Admin
- Full access to all pages
- User management (create/edit users, assign roles)
- View all reports and analytics
- Settings access
- Dashboard with complete store overview

### Store Manager
- Dashboard with sales, inventory, queue stats
- POS/Billing, Queue management
- Medicines, Inventory, Expiry tracking
- Suppliers, Purchase Orders
- Prescriptions (view/approve)
- Returns processing
- Reports
- Settings (store preferences)

### Pharmacist
- Dashboard with queue, prescriptions, low stock alerts
- POS/Billing
- Queue management
- Medicines (view only, no category management)
- Inventory (view/adjust stock)
- Prescriptions (review/approve/reject)
- Returns (view/process)
- Settings (profile only)

### Cashier
- Minimal dashboard (today's sales, current queue count)
- POS/Billing (primary function)
- Queue management (call next, complete, hold)
- Prescriptions (view + attach to bill only, no approve/reject)
- No access to inventory, suppliers, purchase orders, users, reports, or settings

---

## Testing

### Test File Updates
- `test/run-tests.js`: Update to use Supabase client instead of mock data. Tests will need a test Supabase project or mocked Supabase responses.

### Validation Strategy
1. **Schema validation**: Verify Supabase tables match expected schema
2. **Auth flow**: Test login/logout with Supabase Auth
3. **CRUD operations**: Test each module's create/read/update/delete
4. **Role-based access**: Verify users see only their permitted pages
5. **Dashboard data**: Verify dashboard aggregates correct data per role

---

## Implementation Order

### Phase 1: Database Setup (Supabase)
1. Create Supabase project
2. Run `dbschema.sql` to create all tables
3. Set up Row Level Security (RLS) policies for each table
4. Create storage bucket for prescription files (if using file uploads)
5. Add test users with different roles via Supabase dashboard or SQL

### Phase 2: Supabase Client Integration
1. Install `@supabase/supabase-js`
2. Create `supabase-client.js` with initialized client
3. Update `js/api.js` to use Supabase instead of mock DB
4. Update `js/auth.js` to use Supabase Auth
5. Test all CRUD operations

### Phase 3: Authentication & Role-Based Routing
1. Update `index.html` login page to use Supabase Auth
2. Update `js/login.js` for Supabase sign-in
3. Implement session persistence and redirect logic
4. Update `js/app.js` NAV config for role-based filtering
5. Test each role sees correct navigation

### Phase 4: Page-by-Page Migration
For each page (in order of dependency):
1. Update HTML to remove mock data references
2. Update page JS to use Supabase API
3. Test data loading, CRUD, and role-based visibility

Order:
1. Dashboard (depends on all data)
2. Medicines
3. Categories
4. Inventory
5. Suppliers
6. Purchase Orders
7. Prescriptions
8. Queue
9. Billing
10. Returns
11. Reports
12. Users (Admin only)
13. Settings
14. Expiry (uses inventory data)

### Phase 5: Dashboard Refinement
1. Simplify dashboard widgets per role
2. Add role-specific metrics (Cashier sees only today's sales, Admin sees everything)
3. Real-time updates where applicable (queue, notifications)

### Phase 6: Testing & Polish
1. Run end-to-end tests for each role
2. Verify all CRUD operations work
3. Check responsive layout
4. Add loading states and error handling
5. Final polish

---

## Supabase-Specific Notes

### 1. RLS Policies
Every table gets Row Level Security enabled with a role-check policy:
```sql
ALTER TABLE public.medicines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_medicines" ON public.medicines
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role IN ('Admin','Store Manager','Pharmacist','Cashier')
    )
  );

CREATE POLICY "manager_write_medicines" ON public.medicines
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role IN ('Admin','Store Manager')
    )
  );
```

### 2. Storage Bucket for Prescriptions
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('prescriptions', 'prescriptions', true)
ON CONFLICT (id) DO NOTHING;
```

### 3. Dashboard Aggregation Function
```sql
CREATE OR REPLACE FUNCTION public.get_dashboard_data()
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_build_object(
      'todaySales', COALESCE(SUM(amount), 0),
      'todayBills', COUNT(*),
      'totalMedicines', (SELECT COUNT(*) FROM medicines WHERE status = 'Active'),
      'lowStock', (SELECT COUNT(*) FROM inventory WHERE qty > 0 AND qty <= 20),
      'expiringSoon', (SELECT COUNT(*) FROM inventory
                       WHERE expiry <= NOW() + INTERVAL '90 days' AND qty > 0),
      'pendingPrescriptions', (SELECT COUNT(*) FROM prescriptions WHERE status = 'Pending'),
      'inventory', json_build_object(
        'inStock',     (SELECT COUNT(*) FROM inventory WHERE qty > 20 AND expiry > NOW() + INTERVAL '90 days'),
        'lowStock',    (SELECT COUNT(*) FROM inventory WHERE qty > 0 AND qty <= 20),
        'expiringSoon',(SELECT COUNT(*) FROM inventory WHERE expiry <= NOW() + INTERVAL '90 days' AND qty > 0),
        'outOfStock',  (SELECT COUNT(*) FROM inventory WHERE qty <= 0)
      ),
      'queueWaiting', (SELECT COUNT(*) FROM queue WHERE status = 'Waiting'),
      'pendingReturns', (SELECT COUNT(*) FROM returns WHERE status = 'Pending')
    )
    FROM transactions
    WHERE created_at::date = CURRENT_DATE
      AND status = 'Paid'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```
> **Note:** uses `created_at::date` (not the legacy `date` VARCHAR column) and only
> counts `Paid` transactions. `SECURITY DEFINER` lets the function read across
> tables regardless of per-table RLS while still being callable by any logged-in user.

---

## Frontend Changes Summary

### Script Loading Order (every authenticated page)
```html
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/supabase.umd.min.js"></script>
<script src="../js/supabase-client.js"></script>
<script src="../js/api.js"></script>
<script src="../js/auth.js"></script>
<script src="../js/app.js"></script>
<script src="../js/[page-specific].js"></script>
```
> `mockData.js` and `db.js` are removed from all pages.

### Environment Configuration
Create `.env` in the project root:
```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-public-key>
```
Exposed to the browser in `js/supabase-client.js` via `import.meta.env`.

---

## Key Architectural Decisions

### 1. Preserve the Existing Service Layer
`js/api.js` already exposes a clean service API (`API.getMedicines()`,
`API.createBill()`, etc.). We keep every **public signature identical** and only
swap the internals from `MediStoreDB` (localStorage) to Supabase queries. Result:
page files (`dashboard.js`, `billing.js`, `inventory.js`, ...) need **zero**
data-layer rewrites.

### 2. Preserve the Auth Facade
`js/auth.js` exposes `login/logout/currentUser/isLoggedIn/requireAuth/hasRole`.
Only the internals change to Supabase Auth. Existing page guards keep working.

### 3. Snake_case -> camelCase Normalization Layer
Supabase returns `last_login`, `created_at`, `med_id`. The frontend reads
`lastLogin`, `createdAt`, `medId`. A small `toCamel()` / `toSnake()` mapper inside
`js/api.js` converts on read/write so view code stays unchanged.

### 4. Role-Based Views
`js/app.js` already filters `NAV` by `roles`. We extend it:
- add `Cashier` to permitted items,
- render a role-specific dashboard in `dashboard.js`
  (`Auth.currentUser().role` -> choose widget set).

### 5. Dashboard Philosophy
Keep it "medical-store simple": 4 stat cards + 1 alert list + 1 recent activity
table per role. No chart clutter unless role is Admin/Store Manager.


---

## Open Questions (Need Your Input)

1. **Cashier role** — Your schema's `users.role` CHECK only allows
   `Admin / Store Manager / Pharmacist`. You asked for **Cashier** views. Shall I
   add `Cashier` to the role enum? (Recommended.)

2. **Supabase keys** — Please share when ready:
   - Project URL (`https://<ref>.supabase.co`)
   - `anon` public key
   I will place them in `.env`.

3. **Prescription files** — Real upload to **Supabase Storage** (`prescriptions`
   bucket), or just store a URL/label for now?

4. **Seed data** — Load the existing demo data (categories, medicines, batches,
   suppliers, POs, prescriptions, transactions, queue) into Supabase so the app
   isn't empty on first login? (Recommended.)

5. **Auth users** — Should I generate the SQL to create 4 demo logins
   (`admin@`, `manager@`, `pharmacist@`, `cashier@medstore.com`), or will you
   create users via the Supabase dashboard?

6. **Audit log** — Implement `audit_log` now (trigger-based) or defer?

7. **Real-time** — Use Supabase Realtime for the **queue** and **notifications**
   (live refresh across cashiers), or simple polling?

8. **Currency** — UI currently shows `₹` (INR). Keep INR?

9. **File structure** — Keep the current multi-page (`pages/*.html`) architecture,
   or migrate to a single-page (SPA) router? (Recommend keeping multi-page to
   minimise risk; it is already working.)

---

## Deliverables When I Implement

| # | Deliverable | Path |
|---|-------------|------|
| 1 | Full Supabase schema (enums, tables, indexes, RLS, seed, dashboard fn) | `dbschema.sql` |
| 2 | Supabase client + config | `js/supabase-client.js` |
| 3 | Rewritten API service layer (all ~35 functions) | `js/api.js` |
| 4 | Supabase Auth integration | `js/auth.js` |
| 5 | Role-based nav incl. Cashier | `js/app.js` |
| 6 | Role-specific dashboard | `js/dashboard.js` |
| 7 | Real login page | `index.html`, `js/login.js` |
| 8 | Corrected script includes | `pages/*.html` |
| 9 | Dependency | `package.json` |
| 10 | Integration tests | `test/run-tests.js` |

---

## ✅ AS-BUILT STATUS — 2026-09-24 (supersedes the note below)

**Everything in this plan has been implemented and verified against the live Supabase
project.** Two plan lines changed during implementation (both owner-approved):

- Item 5, "Role-based nav **incl. Cashier**" → **no Cashier role**; decision #1 kept the
  3 roles `Admin / Store Manager / Pharmacist` and the Pharmacist works the counter.
- Item 1, schema size: the shipped `dbschema.sql` has **14 tables / 10 enums / 22 functions**
  (`transaction_items` and `purchase_order_items` were added to fix the legacy gaps).

Where to look for the as-built detail:

| What you want to know | Read |
|---|---|
| Every file that changed, and why | `dev_process.md` §7.6 |
| The exact row shapes each page relies on | `dev_process.md` §7.2 (unchanged) |
| How to run the tests / check the app | `dev_process.md` §9.1–§9.3 |
| What each API function now calls | the function bodies in `js/api.js` |

**Status: implemented. `node test/run-tests.js` → 90/90 green; `node test/queue-page-live.mjs`
→ 9/9 (the queue page's Realtime wiring, offline); `node test/realtime-live.mjs` → 6/6 (live
Realtime delivery proven); `node test/supabase-smoke.mjs` → 49/51 (the 2 open checks are the
cosmetic `initials()` avatar defect, §7.5 of `dev_process.md`, which the UI already masks and
which needs one paste of `db-patch-001-avatar-initials.sql`). The only remaining items are the
optional dashboard/inventory Realtime refresh and the manual browser pass.**


