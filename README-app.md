# MediStore MS — Pharmacy Management System

Vanilla JS + Bootstrap 5.3.3 + Chart.js 4.4.3 (multi-page, no framework), backed by
**Supabase** (Postgres + RLS + triggers + RPC + Auth + Storage + Realtime).

> **Read [`dev_process.md`](./dev_process.md) first** — it is the single source of truth for
> what this project is, what has been decided, and what is left. This README only covers
> how to run it.

## Run locally

1. Install Node.js (LTS).
2. Open this folder in VS Code and open a terminal in it.
3. Install dependencies:
   `npm install`
4. Start the dev server:
   `npm run dev`
5. Open the URL Vite prints (normally <http://localhost:5173/>).

The app talks to a **live Supabase project** — no local database, no seeding step, and no
`.env` file is needed. The connection is read from `js/supabase-config.js`
(`window.SUPABASE_CONFIG`). See §3.1 of `dev_process.md` for why a global config file is used
instead of `import.meta.env`: `index.html` loads its scripts as **ES modules** while every
page in `pages/*.html` loads them as **classic scripts**, so no file under `js/` may contain
`import`, `export` or `import.meta`.

## Demo login

Pick the role card that matches the account and use the real password
**`MediStore@123`** for all of them (there is no "any password" shortcut — this is Supabase
Auth, and the database decides the role):

| Role | Email |
|---|---|
| Admin | `aisha@medstore.com` |
| Store Manager | `rahul@medstore.com` |
| Pharmacist | `sneha@medstore.com` |

The remaining three seeded accounts (`imran@`, `priya@`, `vikram@`) exist too; `imran@medstore.com`
is deliberately **Inactive** so the "inactive account" path can be demonstrated.

Choosing the wrong role card for an account is refused with an explanatory message rather than
signing you in with the wrong navigation.

## What is included

14 pages, all reading and writing live Supabase data:

- Dashboard with 8 KPIs, sales chart (daily/weekly/monthly) and inventory mix
- Medicines and categories (`MED-###` codes from Postgres sequences, counts by trigger)
- Batch inventory with computed status (In Stock / Low Stock / Expiring Soon / Out of Stock)
- POS billing with an atomic stock decrement (`create_bill` RPC — an oversell rolls back)
- Customer queue with **Realtime** updates (a second tab refreshes without a reload)
- Suppliers and purchase orders (status → `Received` increments inventory)
- Prescription upload to Supabase Storage, review, and queue token on approval
- Returns/refunds (approve restores stock)
- Reports aggregated in SQL, and Users & roles (Admin-only writes enforced by RLS)

Cross-module rules (bill → stock, Rx → token, PO → stock, return → stock) live in **database
triggers and functions**, so they cannot be skipped by any client.

## Tests

```powershell
npm test              # live integration suite, self-cleaning          (90/90)
npm run test:page     # js/queue.js Realtime wiring, offline DOM shim   (9/9)
npm run test:realtime # live Realtime delivery probe (opt-in)           (6/6)
npm run test:smoke    # data-layer row-shape smoke test                 (49/51)
```

The 2 smoke failures are one known cosmetic defect in `public.initials()` on the deployed
database — the UI masks it, and it is fixed by running `db-patch-001-avatar-initials.sql`
once in the Supabase SQL Editor. See §7.5 of `dev_process.md`.

Every test writes with a unique tag and deletes its own rows, so a green run leaves the
database as it found it (only the ID sequences advance — that is by design).
