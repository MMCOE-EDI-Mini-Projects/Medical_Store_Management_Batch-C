/* ==========================================================================
   MEDISTORE MS — SUPABASE SMOKE TEST  (live integration, not a unit test)
   ==========================================================================
   Verifies that js/supabase-client.js can actually talk to the deployed
   Supabase project and that every row shape the pages read comes back in the
   form they expect (camelCase, numeric ids, "—" sentinels).

   RUN:
       node test/supabase-smoke.mjs

   Requires network access plus the demo accounts created by dbschema.sql.
   Override the credentials with environment variables if you changed them:
       MSMS_DEMO_EMAIL, MSMS_DEMO_PASSWORD

   NOTE: this test only READS, except for one medicine row that is inserted,
   updated and deleted again inside the same run.
   ========================================================================== */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEMO_EMAIL = process.env.MSMS_DEMO_EMAIL || "aisha@medstore.com";
const DEMO_PASSWORD = process.env.MSMS_DEMO_PASSWORD || "MediStore@123";

/* ---- browser shims that js/*.js expects -------------------------------- */
const store = new Map();
global.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
global.window = global;
global.window.supabase = { createClient };   /* what the CDN UMD tag provides */

/* ---- load the app files the same way test/run-tests.js does ------------ */
const load = (rel) => new Function(fs.readFileSync(path.join(ROOT, rel), "utf8"))();
load("js/supabase-config.js");
load("js/supabase-client.js");

const SB = global.SB;
let pass = 0, fail = 0;
const ok = (cond, label, extra) => {
  if (cond) { console.log(`  PASS  ${label}`); pass++; }
  else { console.log(`  FAIL  ${label}${extra !== undefined ? "  -> " + JSON.stringify(extra) : ""}`); fail++; }
};

console.log("\n=== A. NAMING BRIDGE (pure functions) ===");
ok(SB.DASH === "\u2014", "DASH sentinel is an em dash");
ok(SB.toSnake("lastLogin") === "last_login", "toSnake lastLogin", SB.toSnake("lastLogin"));
ok(SB.toSnake("medId") === "med_id", "toSnake medId", SB.toSnake("medId"));
ok(SB.toSnake("parent") === "parent_id", "toSnake parent (alias)", SB.toSnake("parent"));
ok(SB.toCamel("file_url") === "fileUrl", "toCamel file_url", SB.toCamel("file_url"));
ok(SB.toCamel("parent_id") === "parent", "toCamel parent_id (alias)", SB.toCamel("parent_id"));
ok(SB.toCamel("cashier_name") === "cashierName", "toCamel cashier_name", SB.toCamel("cashier_name"));
ok(SB.fromRow({ qty: null }).qty === 0, "NULL numeric -> 0");
ok(SB.fromRow({ note: null }).note === "\u2014", 'NULL text -> "—"');
ok(SB.toRow({ parent: "\u2014" }).parent_id === null, 'toRow "—" -> NULL');
ok(SB.toRow({ invId: 5 }).inv_id === undefined, "toRow drops client-only invId");
ok(SB.toRow({ createdAt: "x" }).created_at === undefined, "toRow drops createdAt (trigger owns it)");
ok(SB.configured() === true, "config detected as configured");

console.log("\n=== B. INIT / SIGN-IN ===");
const res0 = await SB.init();
ok(res0.online === true, "init() reached Supabase", res0);
const auth = await SB.signIn(DEMO_EMAIL, DEMO_PASSWORD);
ok(!!auth.session, "signInWithPassword returned a session");

const prof = await SB.profile();
ok(prof && prof.role === "Admin", "profile().role === Admin", prof && prof.role);
ok(prof && /^[A-Z]{1,2}$/.test(String(prof.avatar)), "avatar is 1-2 initials", prof && prof.avatar);
/* Format, not a fixed value: API.login() stamps last_login on every sign-in,
   so the timestamp of the last run is the expected content. */
ok(prof && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(String(prof.lastLogin)), "lastLogin is rendered as \"YYYY-MM-DD HH:MM\"", prof && prof.lastLogin);
ok(prof && prof.name === "Dr. Aisha Khan", "profile name", prof && prof.name);

console.log("\n=== C. ROW SHAPES THE PAGES EXPECT ===");
const meds = await SB.list("medicines");
ok(meds.length === 12, "medicines count = 12", meds.length);
ok(meds[0].id === "MED-001" && meds[0].name === "Amoxicillin 500mg", "medicines[0] id/name", meds[0]);
ok(typeof meds[0].rx === "boolean", "medicines[0].rx boolean", typeof meds[0].rx);

const cats = await SB.list("categories");
ok(cats.length === 9, "categories count = 9", cats.length);
ok(cats[0].parent === "\u2014", 'categories[0].parent === "—"', cats[0].parent);
ok(typeof cats[0].count === "number", "categories[0].count numeric", cats[0].count);

const inv = await SB.list("inventory");
ok(inv.length === 13, "inventory count = 13", inv.length);
ok(typeof inv[0].id === "number" && inv[0].id === 1, "inventory.id is a NUMBER", inv[0].id);
ok(typeof inv[0].selling === "number", "inventory.selling numeric", inv[0].selling);
ok(inv[0].medId === "MED-001", "inventory.medId present", inv[0].medId);
ok(!("status" in inv[0]), "inventory.status NOT persisted");

const q = await SB.list("queue");
ok(q.length === 5, "queue count = 5", q.length);
ok(typeof q[0].token === "number", "queue.token numeric (it is the PK)", q[0].token);
ok(q[0].token >= q[1].token, "queue ordered by token desc", [q[0].token, q[1].token]);
ok(typeof q[0].cashier === "string", "queue.cashier present", q[0].cashier);

const rx = await SB.list("prescriptions");
ok(rx.length === 5, "prescriptions count = 5", rx.length);
ok("fileName" in rx[0] && "fileUrl" in rx[0], "prescriptions camelCase file fields", Object.keys(rx[0]));

const tx = await SB.list("transactions");
ok(tx.length === 11, "transactions count = 11", tx.length);
ok(typeof tx[0].amount === "number" && tx[0].amount > 0, "transactions.amount numeric", tx[0].amount);
ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(String(tx[0].date)), "transactions.date display format", tx[0].date);

const po = await SB.list("purchase_orders");
ok(po.length === 6, "purchase_orders count = 6", po.length);
const rets = await SB.list("returns");
ok(rets.length === 3, "returns count = 3", rets.length);
const sup = await SB.list("suppliers");
ok(sup.length === 4 && sup[0].id === "SUP-01", "suppliers count/ids", [sup.length, sup[0] && sup[0].id]);
const usr = await SB.list("users");
ok(usr.length === 6, "users count = 6", usr.length);
ok(usr.every((u) => /^[A-Z]{1,2}$/.test(String(u.avatar))), "all user avatars 1-2 initials", usr.map((u) => u.avatar));

console.log("\n=== D. RPCs ===");
const dash = await SB.rpc("get_dashboard_data");
ok(dash.todaySales >= 0 && typeof dash.inventory.inStock === "number", "get_dashboard_data shape", Object.keys(dash));
const code = await SB.nextCode("MED-", "medicines", "id", 3);
ok(/^MED-\d{3}$/.test(String(code)), "next_code MED-*", code);
const code2 = await SB.nextCode("INV-", "transactions", "id", 4, 5500);
ok(/^INV-\d+$/.test(String(code2)), "next_code INV-* (floor 5500)", code2);

console.log("\n=== E. WRITE ROUND-TRIP (self-cleaning) ===");
const tmpId = await SB.nextCode("ZZT-", "medicines", "id", 1, 0);
const created = await SB.insert("medicines", {
  id: tmpId, name: "ZZ Temp Medicine", generic: "Zzgeneric",
  category: "Antibiotics", manufacturer: "Harness", reorder: 5, rx: false, status: "Active",
});
ok(created && created.name === "ZZ Temp Medicine", "insert medicine", created && created.id);
const upd = await SB.update("medicines", "id", tmpId, { reorder: 42 });
ok(upd.reorder === 42, "update medicine", upd.reorder);
await SB.remove("medicines", "id", tmpId);
const gone = await SB.one("medicines", "id", tmpId);
ok(gone === null, "delete medicine (row gone)", gone);

console.log("\n=== F. SIGN-OUT / RLS ===");
await SB.signOut();
const after = await SB.list("medicines").then((r) => r.length).catch((e) => "THREW: " + e.message);
ok(after === 0 || String(after).startsWith("THREW:"), "after sign-out RLS blocks the read", after);

console.log(`\n================ ${pass} PASSED | ${fail} FAILED ================\n`);
process.exit(fail > 0 ? 1 : 0);
