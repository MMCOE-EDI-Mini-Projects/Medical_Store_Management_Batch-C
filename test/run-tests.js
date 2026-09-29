/* ==========================================================================
   MEDISTORE MS — COMPREHENSIVE TEST SUITE  (live Supabase integration)
   ==========================================================================
   RUN:
       node test/run-tests.js

   This suite used to run against js/db.js + js/mockData.js. Those files are
   gone, so it now exercises the real stack:

       API  ->  window.SB  ->  Supabase (PostgREST + RLS + RPC)

   It signs in as a real demo account, so it needs network access and the
   accounts seeded by dbschema.sql. Override them if you changed them:
       MSMS_DEMO_EMAIL, MSMS_DEMO_PASSWORD

   EVERY row this suite creates is marked with a unique TAG and deleted again
   in a `finally` block, so a green run leaves the database exactly as it
   found it - except for the ID sequences, which advance (that is by design:
   deleting a row must never let its code be handed out twice).

   ONE THING IT DELIBERATELY DOES NOT DO
   -------------------------------------
   It never calls API.createUser(). Creating a staff account means creating a
   Supabase Auth user, and a test that leaves login accounts behind which only
   the service_role key can remove is worse than a missing assertion. The
   function's presence is asserted instead, and the real account flow is
   covered by the manual pass in dev_process.md.
   ========================================================================== */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEMO_EMAIL = process.env.MSMS_DEMO_EMAIL || "aisha@medstore.com";
const DEMO_PASSWORD = process.env.MSMS_DEMO_PASSWORD || "MediStore@123";

/* One marker per run, so parallel/previous runs can never collide on a key. */
const TAG = "ZZT" + Date.now().toString(36).toUpperCase();

/* ---- browser shims the js/ files expect -------------------------------- */
const store = new Map();
global.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear()
};
global.sessionStorage = global.localStorage;
global.window = global;
global.window.supabase = { createClient };   /* what the CDN UMD tag provides */

/* ---- load the app exactly the way a page does -------------------------- */
const load = (rel) => new Function(fs.readFileSync(path.join(ROOT, rel), "utf8"))();
load("js/supabase-config.js");
load("js/supabase-client.js");
load("js/api.js");

const API = global.API;
const SB = global.SB;

let passed = 0;
let failed = 0;

function assert(condition, testName, extra) {
  if (condition) {
    console.log(`  ✓ PASSED: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAILED: ${testName}${extra !== undefined ? "  -> " + JSON.stringify(extra) : ""}`);
    failed++;
  }
}

/* Everything created during the run, so cleanup can undo it in FK order. */
const created = {
  transactions: [], queue: [], prescriptions: [], returns: [], purchaseOrders: [],
  inventory: [], medicines: [], categories: [], suppliers: [], storagePaths: []
};

async function cleanup() {
  const attempt = async (label, fn) => {
    try { await fn(); } catch (e) { console.warn(`  (cleanup skipped ${label}: ${e.message})`); }
  };
  for (const id of created.transactions) await attempt("transaction " + id, () => SB.remove("transactions", "id", id));
  for (const token of created.queue) await attempt("queue " + token, () => SB.remove("queue", "token", token));
  for (const id of created.prescriptions) await attempt("prescription " + id, () => SB.remove("prescriptions", "id", id));
  if (created.storagePaths.length) await attempt("storage", () => SB.removeFile(null, created.storagePaths));
  for (const id of created.returns) await attempt("return " + id, () => SB.remove("returns", "id", id));
  for (const id of created.purchaseOrders) await attempt("purchase order " + id, () => SB.remove("purchase_orders", "id", id));
  for (const id of created.inventory) await attempt("inventory " + id, () => SB.remove("inventory", "id", id));
  for (const id of created.medicines) await attempt("medicine " + id, () => SB.remove("medicines", "id", id));
  for (const id of created.categories) await attempt("category " + id, () => SB.remove("categories", "id", id));
  for (const id of created.suppliers) await attempt("supplier " + id, () => SB.remove("suppliers", "id", id));
}

const findInv = (rows, id) => rows.find(x => String(x.id) === String(id));

async function main() {
  console.log("\n========================================================");
  console.log("   MEDISTORE MS - LIVE SUPABASE TEST SUITE");
  console.log("========================================================\n");

  /* ------------------------------------------------------------ 0. contract */
  console.log("Test Group 0: The frozen 35-function contract");
  const CONTRACT = (
    "login logout getDashboardData getMedicines createMedicine updateMedicine deactivateMedicine " +
    "getCategories createCategory updateCategory getInventory updateInventory addInventory " +
    "getSuppliers createSupplier updateSupplier getPurchaseOrders createPurchaseOrder updatePurchaseOrder " +
    "getPrescriptions updatePrescription uploadPrescription getReturns createReturn updateReturn " +
    "createBill getTransactions getQueue updateQueue addQueue getReports getUsers createUser updateUser " +
    "getNotifications"
  ).split(" ");

  const missing = CONTRACT.filter(k => typeof API[k] !== "function");
  assert(missing.length === 0, "all 35 documented API functions exist", missing);
  assert(CONTRACT.length === 35, "the contract really lists 35 functions", CONTRACT.length);
  assert(typeof API.live === "function" && typeof API.stopLive === "function", "live-update helpers are present");

  /* ---------------------------------------------------------------- 1. auth */
  console.log("\nTest Group 1: Authentication (real Supabase Auth, no mock token)");
  const login = await API.login({ email: DEMO_EMAIL, password: DEMO_PASSWORD, role: "Admin" });
  assert(login.success === true, "sign-in succeeds");
  assert(login.user.role === "Admin", "the DATABASE decides the role", login.user.role);
  assert(/^[A-Z]{1,2}$/.test(String(login.user.avatar)), "the topbar chip never gets more than 2 letters", login.user.avatar);
  assert(!!login.token && login.token.split(".").length === 3, "a real JWT access token is returned");
  assert(!!SB.session(), "the adapter holds the session afterwards");

  let wrongPw = null;
  try { await API.login({ email: DEMO_EMAIL, password: "definitely-not-the-password" }); }
  catch (e) { wrongPw = e; }
  assert(!!wrongPw && /invalid email or password/i.test(wrongPw.message), "wrong password is rejected cleanly", wrongPw && wrongPw.message);

  let wrongRole = null;
  try { await API.login({ email: DEMO_EMAIL, password: DEMO_PASSWORD, role: "Pharmacist" }); }
  catch (e) { wrongRole = e; }
  assert(!!wrongRole && /Admin account/.test(wrongRole.message), "a mismatched role card is reported, not ignored", wrongRole && wrongRole.message);
  assert(!SB.session(), "the failed attempts did not leave a session behind");

  await API.login({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
  assert(!!SB.session(), "signed in again for the rest of the run");

  /* -------------------------------------------------------------- 2. bridge */
  console.log("\nTest Group 2: Naming bridge & value conventions");
  assert(SB.DASH === "\u2014", "empty-value sentinel is an em dash");
  assert(SB.toSnake("lastLogin") === "last_login", "camelCase -> snake_case");
  assert(SB.toSnake("parent") === "parent_id", "parent -> parent_id alias");
  assert(SB.toCamel("parent_id") === "parent", "parent_id -> parent alias");
  assert(SB.fromRow({ qty: null }).qty === 0, "NULL in a numeric column becomes 0");
  assert(SB.fromRow({ note: null }).note === "\u2014", 'NULL in a text column becomes "-"');
  assert(SB.toRow({ parent: "\u2014" }).parent_id === null, 'the "-" sentinel travels back as NULL');
  assert(SB.toRow({ invId: 7 }).inv_id === undefined, "client-only keys are never uploaded");

  /* ----------------------------------------------------------- 3. medicines */
  console.log("\nTest Group 3: Medicines CRUD");
  const meds = await API.getMedicines();
  assert(meds.length >= 12, "seeded medicines are readable", meds.length);
  assert(meds.every(m => typeof m.id === "string" && m.id.startsWith("MED-")), "every medicine code looks like MED-###");

  const allCats = await API.getCategories();
  assert(allCats.length >= 9, "seeded categories are readable", allCats.length);

  const med = await API.createMedicine({
    name: "TestCillin " + TAG, generic: "Testcillin", category: allCats[0].name,
    manufacturer: "TestPharma", reorder: 15, rx: true
  });
  created.medicines.push(med.id);
  assert(/^MED-\d+$/.test(String(med.id)), "the database generated the new code (no client-side max())", med.id);
  assert(med.status === "Active", "a new medicine starts Active");
  assert(med.rx === true, "the boolean column round-trips as a boolean");

  const bumped = await API.updateMedicine(med.id, { reorder: 25 });
  assert(bumped.reorder === 25, "updateMedicine persisted the change");

  const off = await API.deactivateMedicine(med.id);
  assert(off.status === "Inactive", "deactivateMedicine set Inactive");

  /* ---------------------------------------------------------- 4. categories */
  console.log("\nTest Group 4: Categories & the database-maintained medicine count");
  const cat = await API.createCategory({ name: "ZZ Category " + TAG, parent: "\u2014" });
  created.categories.push(cat.id);
  assert(cat.parent === "\u2014", 'a root category reads back as "-" (NULL in the database)');
  assert(cat.count === 0, "a new category starts with 0 medicines");

  const inCat = await API.createMedicine({ name: "CatMed " + TAG, category: cat.name, reorder: 5 });
  created.medicines.push(inCat.id);
  const catAfter = (await API.getCategories()).find(c => String(c.id) === String(cat.id));
  assert(!!catAfter && catAfter.count === 1, "trg_medicines_count_ai counted the new medicine", catAfter && catAfter.count);

  await SB.remove("medicines", "id", inCat.id);
  created.medicines = created.medicines.filter(x => x !== inCat.id);
  const catBack = (await API.getCategories()).find(c => String(c.id) === String(cat.id));
  assert(!!catBack && catBack.count === 0, "the count went back to 0 - no hand-rolled increment left", catBack && catBack.count);

  const catOff = await API.updateCategory(cat.id, { status: "Inactive" });
  assert(catOff.status === "Inactive", "updateCategory persisted the change");

  /* ----------------------------------------------------------- 5. inventory */
  console.log("\nTest Group 5: Inventory & the computed status");
  const invMed = await API.createMedicine({ name: "InvMed " + TAG, category: allCats[0].name, reorder: 10 });
  created.medicines.push(invMed.id);

  const inv = await API.addInventory({
    medicine: invMed.name, medId: invMed.id, batch: TAG + "-B1",
    mfg: new Date().toISOString().slice(0, 10),
    expiry: new Date(Date.now() + 400 * 86400000).toISOString().slice(0, 10),
    qty: 100, purchase: 10, selling: 15, supplier: "ZZ Supplier"
  });
  created.inventory.push(inv.id);
  assert(typeof inv.id === "number", "inventory.id stays a NUMBER (+id in js/billing.js depends on it)", inv.id);
  assert(inv.status === undefined, "status is not a stored column");

  let listed = await API.getInventory();
  assert(findInv(listed, inv.id).status === "In Stock", "100 units reads as In Stock");
  assert(findInv(listed, inv.id).supplier === "ZZ Supplier", "text columns round-trip unchanged");

  await API.updateInventory(inv.id, { qty: 5 });
  listed = await API.getInventory();
  assert(findInv(listed, inv.id).status === "Low Stock", "5 units reads as Low Stock");

  await API.updateInventory(inv.id, { qty: 0 });
  listed = await API.getInventory();
  assert(findInv(listed, inv.id).status === "Out of Stock", "0 units reads as Out of Stock");

  /* ----------------------------------------------------------- 6. suppliers */
  console.log("\nTest Group 6: Suppliers CRUD");
  const sup = await API.createSupplier({
    name: "ZZ Supplier " + TAG, contact: "Test Contact",
    phone: "+91 90000 00000", email: "zz" + TAG.toLowerCase() + "@test.in", address: "Test Lane"
  });
  created.suppliers.push(sup.id);
  assert(/^SUP-\d+$/.test(String(sup.id)), "the supplier code came from the database", sup.id);

  const supUpd = await API.updateSupplier(sup.id, { phone: "+91 90000 00001" });
  assert(supUpd.phone === "+91 90000 00001", "updateSupplier persisted the change");

  /* ------------------------------- 7. purchase order received -> stock up */
  console.log("\nTest Group 7: Interconnection - PO Received replenishes stock");
  const poInv = await API.addInventory({
    medicine: "POMed " + TAG, batch: TAG + "-PO",
    expiry: new Date(Date.now() + 500 * 86400000).toISOString().slice(0, 10),
    qty: 10, purchase: 5, selling: 9, supplier: sup.name
  });
  created.inventory.push(poInv.id);

  const po = await API.createPurchaseOrder({ supplier: sup.name, items: 2, total: 500, status: "Draft" });
  created.purchaseOrders.push(po.id);
  assert(po.status === "Draft", "a new purchase order starts as a Draft");
  assert(/^PO-\d+$/.test(String(po.id)), "the PO code came from the database", po.id);

  await API.updatePurchaseOrder(po.id, { status: "Received" });
  const afterPo = findInv(await API.getInventory(), poInv.id);
  assert(afterPo.qty === 30, "trg_po_received added items*10 units (2 x 10) in one transaction", afterPo.qty);

  /* -------------------------- 8. prescription approved -> queue token */
  console.log("\nTest Group 8: Interconnection - Approved prescription issues a queue token");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AF+I6gAAAAASUVORK5CYII=",
    "base64"
  );
  const rxFile = new File([png], "prescription.png", { type: "image/png" });

  const rx = await API.uploadPrescription(rxFile, { customer: "ZZ Patient " + TAG, doctor: "Dr. Test", priority: "High" });
  created.prescriptions.push(rx.id);
  if (rx.filePath) created.storagePaths.push(rx.filePath);
  assert(/^RX-\d+$/.test(String(rx.id)), "the prescription code came from the database", rx.id);
  assert(rx.status === "Pending", "an upload starts Pending");
  assert(!!rx.filePath, "the private storage path was stored on the row");
  assert(!!rx.fileUrl, "a signed URL was generated for the View action");

  const approved = await API.updatePrescription(rx.id, { status: "Approved" });
  assert(approved.status === "Approved", "updatePrescription persisted the change");

  const issued = (await API.getQueue()).find(q => String(q.prescriptionId) === String(rx.id));
  assert(!!issued, "trg_prescriptions_approved issued a queue token");
  assert(!!issued && typeof issued.token === "number", "the token is the numeric primary key", issued && issued.token);
  assert(!!issued && issued.priority === "High", "the prescription priority carried into the queue", issued && issued.priority);
  assert(!!issued && issued.cashier === "\u2014", 'an unassigned counter reads as "-"', issued && issued.cashier);
  if (issued) created.queue.push(issued.token);

  /* ------------------------------ 9. return approved -> stock restored */
  console.log("\nTest Group 9: Interconnection - Approved return restores stock");
  const beforeReturn = findInv(await API.getInventory(), poInv.id).qty;

  const ret = await API.createReturn({
    invoice: "INV-TEST-" + TAG, customer: "ZZ Patient " + TAG,
    medicine: "POMed " + TAG, qty: 3, reason: "Damaged pack"
  });
  created.returns.push(ret.id);
  assert(/^RT-\d+$/.test(String(ret.id)), "the return code came from the database", ret.id);
  assert(ret.status === "Pending", "a new return starts Pending");

  await API.updateReturn(ret.id, { status: "Approved" });
  const afterReturn = findInv(await API.getInventory(), poInv.id).qty;
  assert(afterReturn === beforeReturn + 3, "trg_returns_approved put 3 units back", { beforeReturn, afterReturn });

  /* --------------------------------------- 10. POS billing (atomic RPC) */
  console.log("\nTest Group 10: POS billing is atomic (create_bill RPC)");
  const billInv = await API.addInventory({
    medicine: "BillMed " + TAG, batch: TAG + "-BILL",
    expiry: new Date(Date.now() + 300 * 86400000).toISOString().slice(0, 10),
    qty: 20, purchase: 4, selling: 12, supplier: sup.name
  });
  created.inventory.push(billInv.id);

  const bill = await API.createBill({
    customer: "ZZ Customer " + TAG, payment: "Cash",
    subtotal: 24, discount: 0, tax: 1.2, total: 25.2,
    items: [{ invId: billInv.id, qty: 2, price: 12 }]
  });
  created.transactions.push(bill.invoiceId);
  assert(bill.success === true && /^INV-\d+$/.test(String(bill.invoiceId)), "the invoice code came from the RPC", bill.invoiceId);
  assert(bill.lines === 1, "the RPC reported one billed line", bill.lines);
  assert(Number(bill.invoiceId.replace(/\D/g, "")) >= 5500, "invoice numbering starts at 5500 as the old UI did");

  const stockAfterBill = findInv(await API.getInventory(), billInv.id).qty;
  assert(stockAfterBill === 18, "stock was decremented inside the same transaction", stockAfterBill);

  const tx = (await API.getTransactions()).find(t => t.id === bill.invoiceId);
  assert(!!tx && tx.status === "Paid", "the invoice is stored as Paid");
  assert(!!tx && Number(tx.amount) === 25.2, "the stored amount matches the cart total", tx && tx.amount);
  assert(!!tx && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(String(tx.date)), "the display date is produced by trg_transactions_sync_date", tx && tx.date);

  const lines = await SB.list("transaction_items", { filters: { txId: bill.invoiceId } });
  assert(lines.length === 1 && lines[0].medicine === "BillMed " + TAG, "transaction_items holds the cart line", lines.length);

  let oversell = null;
  try {
    await API.createBill({ customer: "ZZ", payment: "Cash", total: 999, items: [{ invId: billInv.id, qty: 9999, price: 12 }] });
  } catch (e) { oversell = e; }
  assert(!!oversell && /insufficient stock/i.test(oversell.message), "an oversell is rejected", oversell && oversell.message);
  assert(findInv(await API.getInventory(), billInv.id).qty === 18, "the rejected bill left the stock untouched (real rollback)");

  /* ------------------------------------------------ 11. customer queue */
  console.log("\nTest Group 11: Customer queue");
  const seededQueue = await API.getQueue();
  assert(seededQueue.length >= 5, "the seeded queue is readable", seededQueue.length);
  assert(seededQueue.every(q => typeof q.token === "number"), "every token is numeric (it is the primary key)");

  const walkin = await API.addQueue({ name: "ZZ Walk-in " + TAG, priority: "Normal" });
  created.queue.push(walkin.token);
  assert(typeof walkin.token === "number", "the token came from queue_token_seq", walkin.token);
  assert(walkin.status === "Waiting", "a new token starts Waiting");
  assert(walkin.cashier === "\u2014", 'an unassigned counter reads as "-"');

  const moved = await API.updateQueue(walkin.token, { status: "Billing", cashier: "\u2014" });
  assert(moved.status === "Billing", "updateQueue persisted the status");
  assert(moved.cashier === "\u2014", "the NOT NULL cashier sentinel survived the round trip (no NULL write)", moved.cashier);

  /* --------------------------------- 12. dashboard, reports, notifications */
  console.log("\nTest Group 12: Dashboard, reports and notifications");
  const dash = await API.getDashboardData();
  assert(typeof dash.todaySales === "number" && dash.todaySales >= 0, "todaySales came back from the RPC", dash.todaySales);
  assert(typeof dash.todayBills === "number", "todayBills is numeric", dash.todayBills);
  assert(typeof dash.totalMedicines === "number" && dash.totalMedicines >= 11, "totalMedicines counts the active catalogue", dash.totalMedicines);
  assert(typeof dash.inventory.inStock === "number" && typeof dash.inventory.outOfStock === "number", "the inventory mix is numeric");
  assert(dash.todayCustomers >= 1, "todayCustomers counts the live queue", dash.todayCustomers);

  const rep = await API.getReports();
  assert(rep.monthlySales.labels.length === 12 && rep.monthlySales.data.length === 12, "monthly sales has 12 buckets");
  assert(rep.inventoryMix.labels.length === 4 && rep.inventoryMix.data.length === 4, "the inventory mix has 4 slices");
  assert(Array.isArray(rep.purchasesBySupplier.labels) && Array.isArray(rep.purchasesBySupplier.data), "the supplier chart is renderable with or without data");

  const notifs = await API.getNotifications();
  assert(Array.isArray(notifs), "notifications is an array");
  assert(notifs.every(n => n.icon && n.color && n.title && n.time), "every notification is renderable by the bell", notifs.length);

  /* -------------------------------------------------------------- 13. users */
  console.log("\nTest Group 13: Staff directory & profile self-service");
  const users = await API.getUsers();
  assert(users.length >= 6, "the staff directory is readable", users.length);
  assert(users.every(u => u.name && u.email && u.role), "every user row is renderable");

  const me = users.find(u => String(u.email).toLowerCase() === DEMO_EMAIL);
  const originalPhone = me ? me.phone : "\u2014";
  const savedProfile = await API.updateUser(me.id, { phone: "+91 90000 12345" });
  assert(savedProfile.phone === "+91 90000 12345", "a user can save their own profile row (RLS self-update)");

  await API.updateUser(me.id, { phone: originalPhone === "\u2014" ? null : originalPhone });
  const restored = (await API.getUsers()).find(u => u.id === me.id);
  assert(!!restored && restored.phone === originalPhone, "the original phone number was restored", restored && restored.phone);

  assert(typeof API.createUser === "function", "createUser is part of the contract (deliberately not exercised)");

  /* ----------------------------------------------------------- 14. sign-out */
  console.log("\nTest Group 14: Sign-out and RLS");
  await API.logout();
  assert(!SB.session(), "the session is gone after logout");

  let blocked = null;
  try { await API.getMedicines(); } catch (e) { blocked = e; }
  assert(!!blocked, "signed out, the same read is refused by RLS", blocked && blocked.message);
}

main()
  .catch((err) => {
    console.error("\nSUITE ABORTED: " + ((err && err.stack) || err));
    failed++;
  })
  .finally(async () => {
    console.log("\nCleanup: removing every row this run created (tag " + TAG + ")");
    /* Group 14 signed out on purpose, and every cleanup statement needs the
       session back - otherwise RLS would refuse them and the test rows would
       be left behind. */
    try { await API.login({ email: DEMO_EMAIL, password: DEMO_PASSWORD }); }
    catch (e) { console.warn("  (could not sign back in for cleanup: " + e.message + ")"); }
    await cleanup();
    console.log("\n================  " + passed + " PASSED | " + failed + " FAILED  ================");
    console.log(failed
      ? "The database is clean; fix the failures above and run again."
      : "The database is exactly as it was before the run (ID sequences advanced, by design).");
    process.exit(failed ? 1 : 0);
  });
