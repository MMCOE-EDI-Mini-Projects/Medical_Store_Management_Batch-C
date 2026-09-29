# dev_process.md — MediStore MS · Development Process, Goals & Handoff Log

> **READ THIS FILE FIRST.** It is the single source of truth for what this project is,
> what has been decided, what is done, and what to do next.
> If you are a new AI/developer picking this up (e.g. the previous session ran out of
> tokens), jump straight to [§9 Resume Runbook](#9-resume-runbook).

| Field | Value |
|---|---|
| **Project** | MediStore MS — Pharmacy Management System |
| **Repo root** | `d:\Engineering\Project\MediStore-MS-Complete` |
| **Backend** | Supabase (Postgres + Auth + Storage + Realtime) |
| **Frontend** | Vanilla JS + Bootstrap 5.3.3 + Chart.js 4.4.3 (multi-page, no framework) |
| **Build tool** | Vite (dev server / static bundler) |
| **Currency** | INR (₹) |
| **Last updated** | 2026-09-24 |
| **Current status** | ✅ **M1 COMPLETE** — every page runs on live Supabase data. `test/run-tests.js` = 90/90 green · `test/queue-page-live.mjs` = 9/9 · `test/realtime-live.mjs` = 6/6 (live Realtime proven) · `test/supabase-smoke.mjs` = 49/51 (the 2 are the `initials()` avatar defect, §7.5). |
| **Doc owner** | Cline (AI dev agent) |

---

## 1. Project Context

MediStore MS is a pharmacy/medical-store management system. It was originally built as a
**fully static frontend demo**: all data came from `js/mockData.js`, persisted in the
browser via IndexedDB/localStorage through `js/db.js`, and accessed through a
hand-written service layer `js/api.js` exposing **35 functions**.

**The goal of the current work** is to replace the mock persistence layer with a real
Supabase backend, **without rewriting any page code**. The page scripts (`js/*.js`
modules + `pages/*.html`) stay untouched; only the internals of `js/api.js` change.

### 1.1 The three architectural layers (memorise these)

```
  pages/*.html  +  js/<page>.js      <- VIEW LAYER (calls window.API.*, renders DOM)
              │  calls window.API.*
              ▼
        js/api.js                    <- SERVICE LAYER (the frozen 35 functions)
              │                          what is left of the old business logic:
              │                          computed stock status, notifications,
              │                          report aggregation, the event bus
              │  calls window.SB.*
              ▼
        js/supabase-client.js        <- DATA ADAPTER (window.SB)
              │                          snake_case <-> camelCase, NULL <-> "—",
              │                          auth session, RPC, Storage, Realtime
              ▼
   Supabase: Postgres + RLS + triggers + RPC + Auth + Storage + Realtime
```

**The mock layer is gone.** `js/mockData.js` and `js/db.js` (and their `<script>` tags)
were deleted on 2026-09-24. `js/api.js` no longer contains any persistence logic: every
read/write goes to `window.SB`, and every rule that used to be an `if` statement in
JavaScript (bill → stock, Rx → token, PO → stock, return → stock, category counts,
ID generation) is now a database trigger/function that cannot be skipped.

**Rule:** page code is the contract. If a change would force edits in `pages/` or in a
page's `js/<page>.js`, prefer fixing `api.js` / the DB instead.

---

## 2. Locked Decisions (answered by the project owner — do NOT re-ask)

| # | Question | **Decision** |
|---|---|---|
| 1 | Cashier role | ❌ **NO separate Cashier role.** The **Pharmacist** performs counter/billing duties. Keep exactly **3 roles**: `Admin`, `Store Manager`, `Pharmacist`. |
| 2 | Supabase project | ✅ Created. URL + publishable key supplied (see §3). |
| 3 | Prescription file storage | ✅ **Supabase Storage** bucket (not base64 in DB). |
| 4 | Seed demo data | ✅ **Yes** — seed all tables from `js/mockData.js` content. |
| 5 | Demo login SQL | ✅ **Yes** — generate SQL creating real `auth.users` accounts. |
| 6 | `audit_log` table | ✅ **Defer** the feature, but **fix the `user_id` type bug** (`BIGINT` → `UUID`) now. |
| 7 | Realtime | ✅ **Yes** — Supabase Realtime (Customer Queue + cross-module refresh). |
| 8 | Currency | ✅ **INR / ₹** — unchanged. |
| 9 | App structure | ✅ **Keep multi-page** HTML. Do **not** migrate to SPA. |

### 2.1 Consequence of Decision #1

`user_role` enum is **`('Admin','Store Manager','Pharmacist')`** — no `Cashier`.
The login page already shows exactly these three role pills (`index.html` → `#roleGrid`)
and `js/app.js` already maps nav items for these three. **This removes all role-permission
rework from the project.**

---

## 3. Environment & Credentials

> The publishable ("anon") key is **designed to be public** — safe to ship in client-side
> code because Row Level Security (RLS) enforces access. Never put a `service_role` key
> in frontend code.

| Setting | Value |
|---|---|
| Supabase Project URL | `https://rzuihpcvelaxxbschzkb.supabase.co` |
| Publishable / anon key | `sb_publishable_Z-LgIoXgXNCIP-I6rwxrnQ_kwj0u1L1` |
| Storage bucket (Rx files) | `prescriptions` (private) |
| Dashboard RPC | `public.get_dashboard_data()` |
| Demo password (all 6 accounts) | `MediStore@123` — also `SUPABASE_CONFIG.defaultUserPassword` |
| Client-side demo account | `aisha@medstore.com` (Admin) — the account the test suites sign in as |

### 3.1 ⚠️ CRITICAL — `import.meta.env` is UNUSABLE in this project

`index.html` loads its scripts as **ES modules**, while every page in `pages/*.html`
loads them as **classic scripts**:

```html
<!-- index.html -->
<script type="module" src="js/supabase-client.js"></script>

<!-- pages/inventory.html -->
<script src="../js/supabase-client.js"></script>
```

In a classic script `import.meta` is a **syntax error** → the entire file fails to parse.
Therefore no file under `js/` may contain `import`, `export` or `import.meta.env`:
the loading mode differs per page, and `test/run-tests.js` evaluates the same files with
`new Function(code)`, which also rejects `import`.

…but **every `pages/*.html` loads the same files as CLASSIC scripts**, so the same file must
parse in both modes. That is only possible because none of them is an ES module — they are
plain globals (`window.SUPABASE_CONFIG`, `window.SB`, `window.API`, `window.Auth`).

**As-built include order** (verified on `index.html` and all 14 pages on 2026-09-24;
`js/mockData.js` and `js/db.js` were deleted — **do not re-add them**):

```html
<!-- every page, after the UMD builds -->
<script src="…/@supabase/supabase-js@2.117.1/dist/umd/supabase.js"></script>  <!-- global `supabase` -->
<script src="../js/supabase-config.js"></script>   <!-- window.SUPABASE_CONFIG -->
<script src="../js/supabase-client.js"></script>   <!-- window.SB   -->
<script src="../js/api.js"></script>               <!-- window.API  -->
<script src="../js/auth.js"></script>              <!-- window.Auth -->
<script src="../js/app.js"></script>               <!-- pages/* : shell + guard -->
<script src="../js/<page>.js"></script>           <!-- pages/* : the page module -->
<!-- index.html instead ends with js/login.js, and uses type="module" on its own tags -->
```

**Consequence:** `js/api.js`, `js/supabase-config.js`, `js/supabase-client.js`, `js/auth.js`
and `js/app.js` **must never contain `import`, `export` or `import.meta.env`** — in a classic
script `import.meta` is a syntax error that silently blanks the page.

**Solution:** a plain global config file `js/supabase-config.js` setting
`window.SUPABASE_CONFIG = { url, publishableKey }`, plus an optional override hook
`window.__MSMS_ENV__`. The `.env` file is kept only as human-readable documentation.

---

## 4. Current Goal (active milestone)

> **MILESTONE M1 — "Live Supabase backend with zero page-code changes."**
>
> Opening `index.html`, signing in with a seeded demo account, and browsing all 14 pages
> shows **real data from Supabase**, with cross-module triggers (bill → stock decrement,
> Rx approval → queue token, PO received → stock increase, return approved → stock
> restore) executing against Postgres.

**Definition of Done for M1** — **all met on 2026-09-24**

- [x] `dbschema.sql` runs clean & idempotently in the Supabase SQL Editor *(owner ran it; verified column-by-column against the live project)*
- [x] All **14** tables + 10 enums + indexes + RLS policies exist. *(The plan said 12; the shipped schema has 14 — `transaction_items` and `purchase_order_items` were the two that were missing from the legacy design.)*
- [x] 6 demo `auth.users` exist and log in via the login page.
- [x] `js/supabase-config.js` + `js/supabase-client.js` exist (`window.SUPABASE_CONFIG`, `window.SB`).
- [x] `js/api.js` still exports **exactly the same 35 functions** with the same shapes (rewritten, **777 lines**).
- [x] `test/run-tests.js` passes against the live project — **90/90**, self-cleaning.
- [x] No file under `pages/` or `css/` required edits for logic. **One exception, unavoidable:** the two `<script>` lines per page were removed when `js/mockData.js` / `js/db.js` were deleted (§7.6).

| Follow-up (not part of M1's DoD) | Status |
|---|---|
| `db-patch-001-avatar-initials.sql` (the `initials()` defect, §7.5) | ⏳ **owner action — one paste.** The UI is already safe: `API.publicUser()` renders 1–2 letters regardless (§7.6). |
| Realtime subscriptions inside the pages (§6 Phase 5) | ✅ **`js/queue.js` subscribes to `queue`** (landed + proven live, §7.6 row 17). ⏳ `js/dashboard.js` / `js/inventory.js` still refresh on load only — optional, see §6 Phase 5. |
| Manual pass over 14 pages × 3 roles | ⏳ see §9. |

---

## 5. Feature Goals (per module / page)

Legend: ✅ existing behaviour to preserve · 🆕 new capability enabled by Supabase

| # | Page / Module | Feature goals |
|---|---|---|
| 1 | **Login** (`index.html`) | ✅ 3 role pills, remember-me, show/hide password · 🆕 real Supabase Auth (`signInWithPassword`), real session persistence, real password reset email, friendly auth errors |
| 2 | **Dashboard** (`pages/dashboard.html`) | ✅ 8 KPI cards, sales chart (daily/weekly/monthly), inventory mix donut, expiry/reorder lists · 🆕 single `get_dashboard_data()` RPC instead of 6 client-side scans |
| 3 | **Medicines** | ✅ list + search + category/status filter, create/edit modal, deactivate · 🆕 `MED-###` IDs from a Postgres sequence, category `count` auto-maintained by trigger |
| 4 | **Categories** | ✅ list, create/edit, active/inactive toggle · 🆕 `parent_id` self-FK (root = NULL, rendered as `—`), live medicine counts |
| 5 | **Inventory** | ✅ list, search, status filter, add/edit, computed status · 🆕 status computed on read (`Out of Stock`/`Low Stock`/`Expiring Soon`/`In Stock`), **numeric `id`** preserved |
| 6 | **Suppliers** | ✅ list, create/edit, active status · 🆕 `SUP-###` IDs from sequence |
| 7 | **Purchase Orders** | ✅ list, create, status flow Draft→Pending→Approved→Received→Cancelled · 🆕 **trigger**: status→`Received` auto-increments inventory |
| 8 | **Prescriptions** | ✅ list, upload file, approve/reject · 🆕 **Storage bucket** uploads, **trigger**: status→`Approved` issues a queue token |
| 9 | **Returns** | ✅ list, create, approve/reject · 🆕 **trigger**: status→`Approved` restores inventory qty |
| 10 | **POS / Billing** | ✅ medicine search+filter, cart, discount, tax, checkout, invoice · 🆕 `transaction_items` child table + **atomic stock decrement in a Postgres function** |
| 11 | **Transactions** | ✅ list of invoices, statuses · 🆕 joins `transaction_items` to rebuild the invoice line-items |
| 12 | **Customer Queue** | ✅ token list, priority, status, cashier · 🆕 **Realtime** live updates (`postgres_changes`) — **landed 2026-09-24**, no manual refresh (`js/queue.js` → `API.live`) |
| 13 | **Reports** | ✅ monthly sales, inventory mix, purchases by supplier, expiry buckets · 🆕 aggregated in SQL |
| 14 | **Users & Settings** | ✅ user list, create/edit, role assignment, profile settings · 🆕 `Admin`-only writes enforced by RLS; new users created via Supabase Auth invite |


---

## 6. Progress Tracker

Tick items off as they land. **Update this table after every work session.**

### Phase 0 — Analysis & planning
- [x] Full codebase read (24 files: `js/*.js`, `pages/*.html`, `css/*.css`, `test/*`)
- [x] Verified the 35-function API surface in `js/api.js`
- [x] Verified `js/auth.js` facade contract
- [x] Verified script-loading mode per HTML file (module vs classic)
- [x] `implementation_plan.md` written (715 lines)
- [x] All 9 open questions answered by the owner (§2)
- [x] `dev_process.md` created (this file)

### Phase 1 — Database (`dbschema.sql`)
- [x] `dbschema.sql` written (1,726 lines, fully idempotent)
- [x] Schema bug list identified (see §7.3)
- [x] **Live project probed** — an earlier 12-table schema is already deployed (see §7.4)
- [x] Pre-flight RESET section added so the file converges on the correct shape
- [x] Verified: no `Cashier` enum value, `inventory.id` BIGINT, `queue` PK = `token`
- [x] Verified: 14 tables, 10 enums, 22 functions, 21 indexes, parens/dollar-quotes balanced, UTF-8 no BOM
- [x] **Owner action DONE** — `dbschema.sql` was pasted into the Supabase SQL Editor and run
- [x] **Verified 2026-09-23 against the live project** (real auth + REST probe, see §7.5):
      all 14 tables reachable · RLS on · **all 6 demo logins return sessions** · seed counts
      `users 6 · categories 9 · suppliers 4 · medicines 12 · inventory 13 · transactions 11 ·
      transaction_items 21 · purchase_orders 6 · purchase_order_items 3 · prescriptions 5 ·
      returns 3 · queue 5 · settings 3 · audit_log 0` · `get_dashboard_data()`,
      `next_queue_token()`, `next_code()`, `current_user_role()` all return correctly
- [x] **Verified 2026-09-24 (re-check):** every seeded count is still exactly as seeded —
      the new self-cleaning test suite leaves no rows behind
- [ ] **Owner action:** run `db-patch-001-avatar-initials.sql` — the one defect found (§7.5).
      Cosmetic only; the app is already immune (§7.6).

### Phase 2 — Frontend data layer
- [x] `js/supabase-config.js` created (window-global config, no `import.meta`)
- [x] `.env.example` created (documentation only — see §3.1)
- [x] `js/supabase-client.js` created — client, naming bridge, CRUD, RPC, Storage, Realtime, `signUpUser` (633 lines)
- [x] `package.json` gains `@supabase/supabase-js` — installed **2.117.1**
- [x] Supabase UMD `<script>` + config/client tags wired into `index.html` + all 14 `pages/*.html`
- [x] `test/supabase-smoke.mjs` added — live integration test (**49 PASS / 2 FAIL**; the 2 are the
      avatar defect described in §7.5, pending the patch file)
- [x] **`js/api.js` REWRITTEN to call `window.SB.*`** — **777 lines**, **35/35 functions preserved**
      with identical names, arguments and row shapes. See §7.6 for the full change list.
- [x] **`js/mockData.js` and `js/db.js` DELETED**, and their `<script>` tags removed from
      `index.html` + all 14 pages (see §7.6)

### Phase 3 — Auth & routing
- [x] `js/auth.js` — the facade is unchanged on the outside (`login/logout/currentUser/
      isLoggedIn/requireAuth/hasRole`) but now caches the real Supabase profile and adds
      `verify()` (async session check) + `loginUrl()`
- [x] `js/login.js` sends the password to real auth, shows the real reason on failure,
      and validates the stored session before bouncing an already-signed-in visitor
- [x] Role-based landing: `API.login()` rejects a role card that does not match the account,
      so the 3-role nav in `js/app.js` is always consistent with the database
- [x] Page guards (`Auth.requireAuth()`) still work on all 14 pages; `App.init()` additionally
      calls `Auth.verify()` so an expired session returns to the login form instead of
      rendering empty tables

### Phase 4 — Cross-module triggers  ✅ **implemented in POSTGRES, not in JavaScript**
- [x] Bill checkout → `transaction_items` + atomic stock decrement — `create_bill()` RPC
      (`select … for update`, all-or-nothing; an oversell raises and rolls back)
- [x] Rx approved → queue token issued — `trg_prescriptions_approved`
- [x] PO received → inventory incremented — `trg_po_received` (line items, or `items*10` fallback)
- [x] Return approved → inventory restored — `trg_return_approved`
- [x] Category medicine counts — `trg_medicines_count_ai/au/ad` (the fragile client-side
      increment/decrement is gone)
- [x] All four verified live by `test/run-tests.js` groups 7–10, including a real rollback test

### Phase 5 — Realtime
- [x] Customer Queue subscribes to `queue` table changes — `js/queue.js` calls
      `API.live(["queue"], …)` after its first load, with a 250 ms debounce so a burst of
      events causes one re-read instead of one render per row
- [ ] *(optional)* Dashboard/inventory subscribe to aggregate refresh events — they still
      refresh on load only. `js/dashboard.js` would have to destroy and rebuild two Chart.js
      instances on every change, which is a bigger change than the queue's, and it is the one
      item that genuinely needs a browser to judge. The local bus is ready either way:
      `API.on("data:changed", fn)` fires for every write, local or remote.
- [x] Unsubscribe on page unload (no leaks) — `window.addEventListener("pagehide", () =>
      API.stopLive())`; `SB.unsubscribeAll()` removes every channel it created

> The whole path is proven, not assumed. `test/queue-page-live.mjs` evaluates the real
> `js/queue.js` under a DOM shim and asserts items 1 and 3 offline (9/9); `test/realtime-live.mjs`
> proves live delivery through the exact `SB.onChange(["queue"], …)` call the page makes
> (6/6). One timing fact worth knowing: **a `postgres_changes` event can only be delivered
> after the channel has joined**, which takes a moment on a cold socket — a probe that writes
> too early sees nothing while the app itself is fine, because it keeps running until the
> socket is up. That is why the live probe retries the write. Realtime is a *bonus* path:
> if the socket never joins, the page still works exactly as it did before.
>
> Why this stayed out of M1's DoD: it is the only item that cannot be fully checked from a
> terminal. The offline shim check covers the wiring, the live probe covers delivery — but
> "two tabs, one updates the other" still deserves §9.3 step 13.

### Phase 6 — Verification
- [x] `test/run-tests.js` rewritten as a **live** suite — **90/90 green, self-cleaning**
- [x] `test/queue-page-live.mjs` added — the queue page's Realtime wiring, offline (DOM shim,
      no network): **9/9 green**
- [x] `test/realtime-live.mjs` added — live Realtime delivery probe (opt-in): **6/6 green**
- [x] `test/supabase-smoke.mjs` green except the 2 documented avatar checks
- [x] No `MockData` dependency left anywhere at runtime (only historical comments mention it)
- [x] Every `js/*.js` file parses (`node --check`, 20 files) and every page still loads
      config → client → api → auth → app in that order
- [ ] Manual pass over all 14 pages × 3 roles (see §9 — needs a browser)
- [x] `dev_process.md` updated (this file)

---

## 7. Reference: verified contracts & known problems

### 7.1 The 35 API functions (frozen contract)

```
login  logout  getDashboardData
getMedicines  createMedicine  updateMedicine  deactivateMedicine
getCategories  createCategory  updateCategory
getInventory  updateInventory  addInventory
getSuppliers  createSupplier  updateSupplier
getPurchaseOrders  createPurchaseOrder  updatePurchaseOrder
getPrescriptions  updatePrescription  uploadPrescription
getReturns  createReturn  updateReturn
createBill  getTransactions
getQueue  updateQueue  addQueue
getReports  getUsers  createUser  updateUser
getNotifications
```

### 7.2 Exact row shapes the pages expect (from the original mock layer + call sites)

| Entity | Fields (camelCase as seen by pages) |
|---|---|
| `users` | `id, name, email, role, status, lastLogin, avatar` |
| `categories` | `id` **(number)**, `name, parent` (`"—"` when root), `count, status` |
| `medicines` | `id` `"MED-001"`, `name, generic, category` (name string), `manufacturer, reorder` (number), `rx` (bool), `status, desc` |
| `inventory` | `id` **(NUMBER — see §7.3 bug 9)**, `medicine, batch, mfg, expiry, qty, purchase, selling, supplier`, `status` (computed) |
| `suppliers` | `id` `"SUP-001"`, `name, contact, phone, email, address, status` |
| `purchaseOrders` | `id` `"PO-001"`, `date, supplier, items` (integer qty), `total, status` |
| `prescriptions` | `id` `"RX-…"`, `date, customer, doctor, medicine, priority, status, invoice, fileName, fileUrl` |
| `returns` | `id` `"RT-…"`, `date, invoice, customer, medicine, qty, reason, status` |
| `transactions` | `id` `"INV-5521"`, `customer, amount, payment, date` `"YYYY-MM-DD HH:MM"`, `status`, `items[]` |
| `queue` | `token` **(number, PK)**, `name, wait, priority, status, cashier, prescriptionId` |
| `notifications` | `{icon, color, title, time}` — **derived at runtime, no table needed** |
| `reports` | `{monthlySales, inventoryMix, purchasesBySupplier}` — **derived, no table needed** |

### 7.3 Known schema bugs found in the original design (must be fixed)

1. `transactions.date` was `VARCHAR` → breaks "today's sales" comparison. **Fix:** use a real
   `timestamptz` column plus a generated `date` text for display.
2. `audit_log.user_id` was `BIGINT` while `users.id` is `UUID` → FK impossible. **Fix:** `UUID`.
3. **No `transaction_items` table** → multi-item carts and partial returns are impossible.
   **Fix:** add it (biggest gap).
4. `users.role` `CHECK` constraint omitted `Cashier`. **Fix:** now moot (decision #1 drops
   Cashier) — the enum has exactly 3 labels.
5. `categories.parent` used the sentinel `'—'` instead of `NULL`. **Fix:** nullable `parent_id`
   self-FK; the normaliser renders `NULL` as `"—"` so the UI is unchanged.
6. Missing `purchase_order_items` child table. **Fix:** add it.
7. Missing indexes on hot filter columns (`inventory.expiry`, `transactions.created_at`,
   `prescriptions.status`, `queue.status`).
8. Dashboard aggregation done in JS by scanning 6 tables. **Fix:** `get_dashboard_data()` RPC.
9. **`inventory.id` must stay NUMERIC.** `js/billing.js:138` calls
   `addToCart(+btn.dataset.id)` and compares `c.invId === invId` with `===`. A UUID or a
   text ID becomes `NaN` and silently breaks the POS cart. → `inventory.id BIGINT`.

### 7.4 Live project state — probed 2026-09-23

The Supabase project was probed over the REST API with the publishable key to find out
what is actually deployed. Results:

| Probe | Result | Meaning |
|---|---|---|
| `/auth/v1/health` | `200 {"name":"GoTrue","version":"v2.197.0"}` | Project live, key valid |
| `/rest/v1/zzz_definitely_not_a_table` | `404 PGRST205` | Correct baseline for "missing" |
| `users`, `categories`, `medicines`, `inventory`, `suppliers`, `purchase_orders`, `prescriptions`, `returns`, `transactions`, `audit_log`, `settings` | `200 []` | **Tables already exist** (from the earlier plan) — and are all **EMPTY** |
| `transaction_items`, `purchase_order_items` | `404 PGRST205` | **The item tables were never created** (bug #3 confirmed live) |
| `categories?select=parent_id` | `400 42703 column categories.parent_id does not exist` (hint: `categories.parent`) | **Bug #5 confirmed live** — the `"—"` sentinel text column is in production |
| `inventory?select=id,selling` | `200 []` | `inventory.selling` exists |
| `transactions?select=date,created_at` | `200 []` | both columns exist |
| `users?select=id,avatar,last_login` | `200 []` | all three exist |

**Conclusion / action taken:** because `create table if not exists` would have silently
skipped those 11 tables and preserved the defective columns, `dbschema.sql` now begins
with a **PRE-FLIGHT · RESET** block that drops only the objects this file owns (plus the
enum types and its own functions) before recreating everything. Every dropped table was
verified empty, so **no data is lost**. `auth.*` is untouched — only the `public.users`
mirror is dropped, and §12 re-seeds the demo accounts.

> If this project is ever pointed at a **non-empty** database, **delete the PRE-FLIGHT
> section** before running, or the existing rows will be destroyed.

### 7.5 Post-deployment verification — 2026-09-23 (after the owner ran `dbschema.sql`)

Verification was done the only way it *can* be done, because the schema deliberately
**revokes everything from `anon`** (`revoke all on schema public from anon` + a per-table
`revoke all … from anon`), so an unauthenticated probe returns `401 · 42501 permission
denied for table medicines` **by design**. The check therefore signed in as a real demo
user (password grant) and queried with the issued JWT:

| Check | Result |
|---|---|
| 6 demo logins via `/auth/v1/token?grant_type=password` | ✅ **all 6 succeed** (incl. the Inactive `imran@`) |
| Tables reachable as `authenticated` | ✅ 14 |
| Row counts | ✅ `users 6 · categories 9 · suppliers 4 · medicines 12 · inventory 13 · transactions 11 · transaction_items 21 · purchase_orders 6 · purchase_order_items 3 · prescriptions 5 · returns 3 · queue 5 · settings 3 · audit_log 0` |
| `rpc/get_dashboard_data` | ✅ `{todaySales: 3762, todayBills: 5, totalMedicines: 11, inventory:{inStock:5,lowStock:3,outOfStock:1,expiringSoon:5}, …}` |
| `rpc/current_user_role` | ✅ `"Admin"` |
| `rpc/next_queue_token` | ✅ returns a bigint (starts at 14 — the seed sets `queue_token_seq` to `max(token)+1`) |
| Deployed columns vs `dbschema.sql` | ✅ **identical column-by-column** |
| `notifications` table | ✅ **intentionally absent** — `API.getNotifications()` derives them at runtime from `inventory` / `purchase_orders` / `prescriptions`, so no table is needed |

#### Defect found: `public.initials()` produced 7-character avatars

| | |
|---|---|
| **Symptom** | The topbar user chip (`js/app.js:108` → `<div class="avatar">${user.avatar …}`) and stored rows show `"DRAISHA"`, `"IMRANSHAIKH"`, `"RAHULMEHTA"` instead of `"AK"`, `"IS"`, `"RM"` |
| **Cause** | `initials()` concatenated the **whole** first and second word (`arr[1] \|\| arr[2]`) and never skipped the honorific, so `"Dr. Aisha Khan"` → `"DR" + "AISHA"` |
| **Fix** | `db-patch-001-avatar-initials.sql` — takes the first letter of the **last two** words, which reproduces every avatar `js/mockData.js` hard-coded (AK, RM, SP, IS, PN, VD) and always yields 1–2 characters |
| **Status** | ✅ fixed in `dbschema.sql` (fresh installs are correct) · ⏳ **the live DB still needs the patch run once** |

Impact is cosmetic (the avatar chip renders 7 characters) — it does not break any logic —
which is why it is the only defect left open. **The app no longer shows it**, see §7.6.

### 7.6 As-built change list — 2026-09-24 (the wiring + Realtime session)

Everything below was verified against the live project, not just written.

| # | File | What changed |
|---|---|---|
| 1 | `js/api.js` | **Full rewrite, 777 lines, same 35-function contract.** Every function now delegates to `window.SB` (`list/one/insert/update/remove/rpc/upload/signedUrl/signIn/signOut/profile/nextCode`). What disappeared: `MediStoreDB`, `mockDelay`, `nextId`, `ensureDB`, `getSalesChartData` (dead code), and the hand-rolled category counters. What was kept on purpose: the event bus (`API.on`, `data:changed`), `computeItemStatus()`, the notification derivation and the report aggregation — none of which a database can do for the page. |
| 2 | `js/api.js` | `createBill()` → single `create_bill()` RPC call. It now *reports* an oversell instead of silently clamping stock, and `js/billing.js` gained a `.catch()` that keeps the cart intact when the RPC rolls back. |
| 3 | `js/api.js` | `updateQueue()` special-cases `cashier`: the column is `NOT NULL DEFAULT '—'`, so a dash is **omitted** rather than converted to `NULL`. Without this, every status change from the queue page failed with a NOT NULL violation. |
| 4 | `js/api.js` | `createUser()` → `SB.signUpUser()` (a throwaway non-persisting client, so **the admin is not signed out** by `auth.signUp()`), then reads the `public.users` row that `handle_new_user()` created. New accounts start on `SUPABASE_CONFIG.defaultUserPassword`. |
| 5 | `js/api.js` | `uploadPrescription()` → the file goes to the private `prescriptions` bucket first, then the row stores `file_name`, `file_path` and a 1-year signed URL in `file_url`. |
| 6 | `js/api.js` | Added `initialsFromName()` (a faithful mirror of the *patched* `public.initials()`) and hardened `publicUser()`: a stored avatar that is not already 1–2 letters is re-derived from the user's name, so the un-patched `initials()` defect stops reaching the topbar chip without hiding it from the tests. |
| 7 | `js/supabase-config.js` | Added `defaultUserPassword: "MediStore@123"`. |
| 8 | `js/supabase-client.js` | Added `signUpUser()` (isolated client) and exported it. |
| 9 | `js/auth.js` | Keeps the same public facade; `login()` caches the real Supabase profile, and the new `verify()` checks the session is still alive on every page load. |
| 10 | `js/login.js` | Shows the real failure reason (wrong password / inactive / wrong role card); "Forgot password" now points at the Supabase dashboard instead of promising future work. |
| 11 | `js/app.js` | `App.init()` calls `Auth.verify()` after the guard. |
| 12 | `js/billing.js` | Removed the 2 `MockData.medicines` fallbacks; checkout now sends `subtotal`/`discount`/`tax` too, so a stored invoice adds up. |
| 13 | `index.html`, 14 × `pages/*.html` | Removed the `js/mockData.js` + `js/db.js` `<script>` tags. Footer of `index.html` no longer claims "no real authentication". |
| 14 | `js/mockData.js`, `js/db.js` | **Deleted.** |
| 15 | `test/run-tests.js` | Rewritten from mock-based to **live Supabase**: 14 groups, 90 assertions, everything tagged and deleted again in a `finally` block. It deliberately does not call `createUser()` (it would leave a real auth account behind that only `service_role` can remove). |
| 16 | `test/supabase-smoke.mjs` | `lastLogin` is now asserted as a *format*, because `API.login()` legitimately stamps that column on every sign-in. |
| 17 | `js/queue.js` | **Phase 5 landed: the page subscribes to Realtime.** After its first `API.getQueue()` it calls `API.live(["queue"], …)`; a pushed change re-reads the queue through a 250 ms debounce (a burst of events = one re-read, not one render per row), and `window.addEventListener("pagehide", …)` calls `API.stopLive()` so no channel is leaked. The subscribe is wrapped in `try/catch`: if Realtime is unreachable the page behaves exactly as before, it just needs a manual reload. No API function changed. |
| 18 | `test/queue-page-live.mjs` (+ `npm run test:page`) | **New.** Evaluates the real `js/queue.js` under a minimal DOM shim and asserts the wiring above end-to-end offline: parses as a classic script · reads the queue once · subscribes to `queue` · re-reads once per burst · unsubscribes on `pagehide`. **9/9.** This is the first test in the repo that executes a *page* script, not just `api.js` — pages are otherwise untestable because they need a DOM. |
| 19 | `test/realtime-live.mjs` (+ `npm run test:realtime`) | **New, opt-in.** Signs in as the demo account, subscribes through the exact `SB.onChange(["queue"], …)` call the page uses, writes a queue row back with its **own current value** (an UPDATE that changes no data), and waits for the event. Proves the three things that no offline test can: the table is in `supabase_realtime`, the JWT reaches the socket, and RLS lets the row through. **6/6**, and it asserts the probe left the row untouched. Kept out of `npm test` because delivery is timing-dependent. |

**Two behaviours changed on purpose — read these before "fixing" them:**

1. **Report charts no longer invent data.** A month with no paid bill charts as `0`
   (the mock layer showed a hard-coded demo baseline), and an empty purchase list
   charts as one zero bar instead of four made-up suppliers.
2. **The notification bell can be empty.** It used to fall back to two fabricated alerts
   so the dropdown never looked empty; now it lists only what is actually true.


---

## 8. Architecture Decisions (locked)

| # | Decision | Rationale |
|---|---|---|
| A | **Keep the service-layer boundary.** `pages/*` → `API` → `SB` → Supabase. | 14 pages keep working unchanged; the backend swap is isolated to `api.js`. |
| B | **Normalisation adapter, not a rewrite.** `js/supabase-client.js` converts `snake_case`↔`camelCase` and keeps the sentinel/empty-value conventions (`"—"`). | Page code reads `i.qty`, `m.generic`, `c.parent`; Postgres uses `qty`, `generic`, `parent_id`. The adapter hides the difference. |
| C | **Business logic stays in `api.js`; integrity in Postgres.** Cross-module effects are DB triggers/functions **and** mirrored in `api.js` for optimistic UI. | Prevents divergence when a row is changed outside the app. |
| D | **Config via `window` global, not `import.meta.env`.** | See §3.1 — classic scripts cannot parse `import.meta`. |
| E | **Multi-page, no SPA.** | Decision #9. |
| F | **Realtime scoped to the queue + a generic refresh bus**, not "every table everywhere". | Keeps the number of websocket channels small and predictable. |

### 8.1 Data-flow for a POS checkout (the most complex path)

```
billing.js  → API.createBill({customer, items:[{invId, qty, price}], subtotal, tax, total, payment})
                 │
                 ├─ 1. RPC create_bill(...)  → inserts transactions + transaction_items
                 │                              and decrements inventory.qty atomically
                 ├─ 2. notifyChange('transactions','create', tx)
                 ├─ 3. notifyChange('inventory','update', …)   (optimistic UI)
                 └─ 4. returns { success: true, invoiceId: 'INV-5522' }   ← shape the page expects
```

---

## 9. Resume Runbook

**If you are new to this repo, do exactly this:**

1. Read this file end-to-end (≈5 min).
2. Read §2 (locked decisions) and §7 (contracts + bugs). Do not re-litigate them.
3. Check the working tree (**note: this folder is NOT a git repository** — there is no
   `.git` directory, so use plain file listing instead of git commands):

   ```powershell
   cd d:\Engineering\Project\MediStore-MS-Complete
   Get-ChildItem -Recurse -File -Include *.js,*.html,*.sql,*.md,*.json |
     Where-Object { $_.FullName -notmatch 'node_modules|dist' } |
     Select-Object FullName, Length, LastWriteTime | Sort-Object LastWriteTime -Descending
   ```
4. Open §6 and find the **first unticked box**. That is your next task.
   *(As of 2026-09-24 the only unticked boxes are the **optional** dashboard/inventory Realtime
   refresh in Phase 5 and the **manual browser pass** in §9.3 — everything else is done and
   green.)*
5. Files you will almost certainly need open:
   - `js/api.js` — the 35-function contract (**777 lines**) + the additive `on/live/stopLive`
   - `js/supabase-client.js` — `window.SB`: the naming bridge, CRUD, RPC, Storage, Realtime
   - `js/app.js` — the shell (nav by role, notifications, guard + `Auth.verify()`)
   - `js/billing.js` — the strictest consumer (numeric IDs, `item.selling`, atomic checkout)
   - `js/queue.js` — the only page that talks to Realtime (`API.live` + `pagehide`)
   - `test/run-tests.js` — **the behavioural test contract** (read group 3–11 before changing
     an API function; they encode exactly what each page relies on)
   - `test/queue-page-live.mjs` — the page-level contract for `js/queue.js` (DOM shim, offline)
   - `test/realtime-live.mjs` — the live Realtime probe (run it after touching Realtime or RLS)
   - `dbschema.sql` — tables, RLS, triggers, RPCs (search for `trg_` and `create_bill`)
   - *(deleted 2026-09-24: `js/mockData.js`, `js/db.js` — do not resurrect them)*
6. **Never** add `import.meta.env` to `js/api.js` or `js/supabase-config.js` (§3.1).
7. After each session: tick §6 boxes, add a row to §11 Changelog, and update the
   "Last updated" date at the top.

### 9.1 Useful commands

```powershell
# install the Supabase client (only new runtime dependency)
npm install @supabase/supabase-js@^2.39.0

# run the app
npm run dev

# the regression gate — live Supabase suite, self-cleaning (currently 90/90)
npm test            # == node test/run-tests.js

# data-layer smoke test — row shapes the pages read (currently 49/51; the 2 are the
# avatar defect in §7.5, which the UI masks but the test deliberately still reports)
npm run test:smoke  # == node test/supabase-smoke.mjs

# page-level check — runs the real js/queue.js under a DOM shim, offline and instant
# (currently 9/9: it reads the queue once, subscribes, re-reads on a pushed change,
#  and unsubscribes on pagehide)
npm run test:page   # == node test/queue-page-live.mjs

# live Realtime probe — opt-in, needs network + ~20 s, kept OUT of `npm test`
# because delivery is timing-dependent. Run it after touching Realtime or RLS.
# (currently 6/6: an event really arrives through SB.onChange and the row is unchanged)
npm run test:realtime  # == node test/realtime-live.mjs

# cheap syntax gate for every classic script (catches a typo before the browser does)
Get-ChildItem js/*.js | ForEach-Object { node --check $_.FullName }
```

### 9.2 What the owner must do manually (cannot be automated from here)

- ~~Paste `dbschema.sql` …~~ ✅ **done 2026-09-23** — the schema is live and verified.
- ⏳ **One paste left:** run `db-patch-001-avatar-initials.sql` in
  **Supabase Dashboard → SQL Editor → New query → Run** (fixes the 7-character avatars, §7.5).
- ⏳ Open the app and click through the 14 pages × 3 roles (see §9.3) — this is the only
  item that cannot be checked from a terminal.
- Confirm the 6 demo users appear in **Authentication → Users**, and that the
  `prescriptions` bucket exists in **Storage** (both were verified programmatically).

### 9.3 Manual smoke pass (15 minutes, needs a browser)

```powershell
npm run dev      # then open the printed URL
```

| # | Step | Expected |
|---|---|---|
| 1 | Sign in as `aisha@medstore.com` / `MediStore@123` with the **Admin** card selected | Lands on the dashboard; the topbar chip shows `AK` |
| 2 | Sign in with the **Pharmacist** card but the admin email | Red banner: "That is a Admin account. Pick the "Admin" card…" — no session created |
| 3 | Sign in as `imran@medstore.com` (seeded **Inactive**) | Red banner about the inactive account |
| 4 | Open all 14 pages | Real rows, no console errors, no spinner left spinning |
| 5 | POS: add a medicine, check out | Invoice `INV-####`; the same batch's qty drops on the Inventory page |
| 6 | POS: put a quantity bigger than the stock in the cart | "Payment failed: create_bill: insufficient stock…" and the cart is untouched |
| 7 | Prescriptions → Upload → Approve | A new token appears on the Customer Queue page |
| 8 | Purchase Orders → set a PO to `Received` | The supplier's inventory quantities increase |
| 9 | Returns → Approve | The returned quantity goes back into inventory |
| 10 | Users → Add User | The row appears (auth account created with the default password; if the project requires email confirmation it will appear as unconfirmed) |
| 11 | Settings → save the profile | Toast confirms; reload keeps the new name |
| 12 | Sign out | Returns to the login form; going back to a page redirects there too |
| 13 | Open **Customer Queue in two tabs**, click *Start* on a waiting token in one | The other tab updates by itself, with **no reload** (Phase 5 Realtime; give a cold socket a second or two) |

---

## 10. Gotchas / landmines

| # | Gotcha | Guard |
|---|---|---|
| 1 | `import.meta.env` in a classic script = hard syntax error, silently blanks the page | Use `window.SUPABASE_CONFIG` only |
| 2 | `inventory.id` coerced with `+` in `billing.js` | Keep it `BIGINT`, never UUID/text |
| 3 | `queue` is keyed by `token` (a number), **not** `id` | PK is `token BIGINT`; API keeps `updateQueue(token, …)` |
| 4 | Pages expect `"—"` for empty/root values, not `null` | Normaliser maps `null` → `"—"` on read |
| 5 | `computed` inventory `status` must **never be persisted** | Compute in the adapter/RPC on read |
| 6 | RLS recursion if a policy on `users` queries `users` | Use `SECURITY DEFINER` helper fns (`current_user_role()`) marked `STABLE` |
| 7 | Realtime requires the table to be in the `supabase_realtime` publication | `ALTER PUBLICATION supabase_realtime ADD TABLE …` (dbschema §10 does it idempotently) |
| 7b | A `postgres_changes` event is **only delivered after the channel has joined**, and Realtime enforces RLS + needs the JWT on the socket | Never write "subscription is broken" off a single fast probe — `npm run test:realtime` retries the write for exactly that reason. The app is unaffected: `API.live` is a bonus path, and the page still works if the socket never joins |
| 8 | ~~`MockData` is still referenced by `billing.js:108`~~ — **resolved 2026-09-24** | The mock layer is deleted; if you see a `MockData` reference, it is a regression |
| 9 | `index.html` vs `pages/*.html` differ in script mode | Re-check after any HTML edit |
| 10 | `queue.cashier` is `NOT NULL DEFAULT '—'`, but the adapter turns `"—"` into `NULL` on write | Any write to `queue` must omit a dash-valued `cashier` (`API.queuePatch`) |
| 11 | `auth.signUp()` on the shared client **replaces the current session** | `SB.signUpUser()` uses a throwaway client — never call `SB.client().auth.signUp()` from a page |
| 12 | Deleting a row does not roll back its sequence (`MED-###`, `INV-####`, tokens) | Expected: codes must never be reused. Do not "fix" the gaps in the demo data |

---

## 11. Changelog

| Date | Author | Change |
|---|---|---|
| 2026-09-23 | Cline | Created `dev_process.md`; recorded all 9 locked decisions; verified the 35-function API surface, the numeric-`id` constraint on `inventory`, and the module-vs-classic script-loading trap. |
| 2026-09-23 | Cline | **Created `dbschema.sql`** (14 tables, 10 enums, 22 functions, 21 indexes, RLS, Realtime, full seed, 6 real demo logins). Created `js/supabase-config.js` and `.env.example`. |
| 2026-09-23 | Cline | **Discovered via REST probes that an earlier 12-table schema is already deployed** and that `transaction_items` / `purchase_order_items` were never created. Added a PRE-FLIGHT RESET section so `dbschema.sql` converges on the correct shape. Verified all deployed tables are empty, so the reset is lossless. See §7.4. |
| 2026-09-23 | Cline | Dropped the unused `return_reason` enum (`returns.reason` is free text, because the legacy seed uses values like `"Damaged pack"`). Enum count is 10. |
| 2026-09-24 | Cline | **Rewrote `js/api.js` onto `window.SB`** (777 lines, 35/35 functions preserved, same shapes). **Deleted `js/mockData.js` + `js/db.js`** and their `<script>` tags from `index.html` + all 14 pages. Details in §7.6. |
| 2026-09-24 | Cline | **Auth is real:** `js/auth.js` caches the Supabase profile and gained `verify()`; `js/login.js` sends the password and reports the true reason for a failure; `js/app.js` verifies the session on page load. §7.6 rows 9–11. |
| 2026-09-24 | Cline | **`test/run-tests.js` rewritten as a live integration suite** — 90 assertions across 14 groups, every row tagged and deleted in a `finally` block, including a real oversell-rollback test. Green on the first run. |
| 2026-09-24 | Cline | **Three latent bugs found and fixed while wiring:** (1) `queue.cashier` is `NOT NULL` while the adapter nullifies `"—"` → any queue status change would have failed; (2) `auth.signUp()` would have signed the administrator out when adding a user → isolated client; (3) `billing.js` still referenced `MockData`, which would have thrown in the POS page. |
| 2026-09-24 | Cline | Confirmed the live DB is unchanged after a full test run (all seeded counts identical) and that the only open item is the cosmetic `initials()` patch — which the UI now masks. |
| 2026-09-24 | Cline | **Final as-built verification & doc reconciliation.** `js/api.js` gained `initialsFromName()` + a hardened `publicUser()` (row 6 of §7.6), so the un-patched 7-character stored avatars never reach the topbar chip while the smoke test still reports them. Re-ran the whole gate: `node test/run-tests.js` → **90 PASSED \| 0 FAILED**; `node test/supabase-smoke.mjs` → **49 PASSED \| 2 FAILED** (both failures are the one documented `initials()` defect); `node --check` clean on all **20** `js/*.js`. Every line-count and status claim in this document was then reconciled with the files on disk (`js/api.js` 777 · `js/supabase-client.js` 633 · `dbschema.sql` 1,726 · `implementation_plan.md` 715 · `test/run-tests.js` 414). |
| 2026-09-24 | Cline | **Phase 5 landed — Realtime is wired and proven, not assumed.** `js/queue.js` now subscribes to `queue` via `API.live`, coalesces bursts with a 250 ms debounce, and unsubscribes on `pagehide` (§7.6 row 17). Added two suites: `test/queue-page-live.mjs` (**9/9**, runs the real page script under a DOM shim — the first page-level test in the repo) and `test/realtime-live.mjs` (**6/6**, live delivery through the exact `SB.onChange(["queue"], …)` call, retrying because an event is only delivered after the channel joins). `npm run test:page` / `npm run test:realtime`. **Correction to a stale claim:** an earlier probe "proved" no event arrived; it had simply written the row before the socket joined. Realtime does work, and gotcha §10.7b now records the trap. |

