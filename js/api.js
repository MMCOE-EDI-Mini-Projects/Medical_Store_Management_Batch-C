/* ==========================================================================
   MEDISTORE MS — SERVICE & API LAYER   (Supabase-backed)
   ==========================================================================
   THE ONE PLACE THAT KNOWS A DATABASE EXISTS

     pages/*.js  ->  API  ->  window.SB  ->  Supabase (Postgres + RLS + RPC)

   Every page still calls the same 35 functions with the same arguments and
   receives the same row shapes it always did, so no page needed rewriting when
   the mock database was removed. Only what happens underneath changed:

     before (js/db.js + js/mockData.js)     after
     ------------------------------------   ----------------------------------
     in-memory / localStorage arrays     -> Postgres over PostgREST
     API.login() faked a JWT             -> supabase.auth.signInWithPassword()
     nextId() scanned an array           -> next_code() in the database (race-free)
     cross-module effects in JS          -> database triggers (atomic, always run)
        * purchase order received  -> batches replenished
        * prescription approved    -> queue token issued
        * return approved          -> stock restored
        * category medicine counts recomputed
     createBill() looped client-side     -> create_bill() RPC in ONE transaction
        (a closed tab could half-bill a cart)

   WHERE THE BUSINESS LOGIC LIVES NOW
   ----------------------------------
   Anything expressible as "one row in, one row out" is a database function
   (dbschema.sql sections 6-8). This file keeps only what the database cannot
   know: notifications derived from stock levels, the aggregations the report
   charts need, and the event bus that tells the shell to refresh.
   ========================================================================== */

const API = (function () {
  "use strict";

  /* The sentinel every page renders for "nothing here" --------------------- */
  const DASH = "\u2014";

  /* ========================================================================
     0. ADAPTER ACCESS & SMALL HELPERS
     ====================================================================== */

  /* js/supabase-client.js (window.SB) is loaded before this file by every HTML
     page and by the tests. Nothing here may `import` it: the pages in
     pages/*.html are CLASSIC scripts, where `import` is a syntax error.      */
  function sb() {
    const s = (typeof window !== "undefined") ? window.SB : null;
    if (!s) {
      throw new Error(
        "Data adapter missing. Load js/supabase-config.js and js/supabase-client.js before js/api.js."
      );
    }
    return s;
  }

  /* Restores the stored Supabase session exactly once, however many pages ask */
  let readyPromise = null;
  function ready() {
    if (!readyPromise) readyPromise = sb().init();
    return readyPromise;
  }

  function num(v) { const n = Number(v); return isNaN(n) ? 0 : n; }

  function today() { return new Date().toISOString().slice(0, 10); }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, "").replace(/@medistore\.com$/, "@medstore.com");
  }

  /* Mirrors public.initials() in dbschema.sql (see db-patch-001): the first
     letter of the LAST TWO words, so "Dr. Aisha Khan" -> "AK" and "Madonna"
     -> "M". The UI applies it as a safety net when a stored avatar is longer
     than two characters, because the database that is live today was created
     by an older initials() that concatenated whole words ("DRAISHA").
     The stored value is left alone - the tests still report it - the chip in
     the topbar just never renders more than two letters. */
  function initialsFromName(name) {
    const parts = String(name || "?").replace(/[^A-Za-z0-9 ]/g, "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length >= 2) {
      return (parts[parts.length - 2].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }
    return parts[0].charAt(0).toUpperCase();
  }

  /* The object the sidebar / topbar user chip renders */
  function publicUser(u) {
    const stored = String(u && u.avatar ? u.avatar : "");
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      avatar: /^[A-Z]{1,2}$/.test(stored) ? stored : initialsFromName(u.name)
    };
  }

  /* Turns Supabase Auth's wording into something a shop user can act on */
  function authError(err) {
    const raw = String((err && err.message) || err || "");
    if (/invalid login credentials/i.test(raw)) return new Error("Invalid email or password.");
    if (/email not confirmed/i.test(raw)) return new Error("This email address has not been confirmed yet.");
    if (/failed to fetch|network ?error|network request failed/i.test(raw)) {
      return new Error("Cannot reach Supabase. Check your internet connection.");
    }
    return new Error(raw || "Unable to sign in.");
  }

  /* Empty form inputs arrive as "" and the mock "—" sentinel arrives as itself;
     both mean NULL in Postgres (e.g. an empty manufacturing date).           */
  function clean(payload) {
    const out = {};
    Object.keys(payload || {}).forEach(function (k) {
      const v = payload[k];
      if (v === undefined) return;
      out[k] = (v === "" || v === DASH) ? null : v;
    });
    return out;
  }

  /* queue.cashier is NOT NULL and legitimately stores the "—" sentinel while a
     token is unassigned, so a dash must be OMITTED (leave the column alone)
     rather than converted to NULL.                                            */
  function queuePatch(data) {
    const patch = clean(data);
    if (patch.cashier === null) delete patch.cashier;
    return patch;
  }

  function safeFileName(name) {
    const base = String(name || "upload.bin").replace(/[^A-Za-z0-9._-]/g, "_");
    return base || "upload.bin";
  }

  /* Inventory status is never stored - it is derived from qty + expiry on every
     read so it can never go stale. Same rules as the old mock layer.          */
  function daysUntil(s) {
    if (!s) return 999;
    const a = new Date(); a.setHours(0, 0, 0, 0);
    const b = new Date(s);
    if (isNaN(b.getTime())) return 999;
    b.setHours(0, 0, 0, 0);
    return Math.round((b - a) / 86400000);
  }

  function computeItemStatus(item) {
    const days = daysUntil(item.expiry);
    if (item.qty <= 0) return "Out of Stock";
    else if (item.qty <= 20) return "Low Stock";
    else if (days <= 90) return "Expiring Soon";
    else return "In Stock";
  }

  /* ----------------------------------------------------------------------
     EVENT BUS — cross-module refresh signal.
     A page (or the notification bell) can listen with API.on(event, fn).
     The Postgres triggers additionally push the same events over Realtime, so
     a second till's sale refreshes this screen without polling.
     -------------------------------------------------------------------- */
  const eventBus = {
    listeners: new Map(),
    emit(event, data) {
      const callbacks = this.listeners.get(event) || [];
      callbacks.forEach(cb => {
        try { cb(data); } catch (e) { console.warn("API listener failed for " + event, e); }
      });
    },
    on(event, callback) {
      if (!this.listeners.has(event)) this.listeners.set(event, []);
      this.listeners.get(event).push(callback);
      return () => {
        const arr = this.listeners.get(event) || [];
        const idx = arr.indexOf(callback);
        if (idx >= 0) arr.splice(idx, 1);
      };
    }
  };

  function notifyChange(entity, action, data) {
    eventBus.emit(`${entity}:${action}`, data);
    eventBus.emit("data:changed", { entity, action, data });
  }

  /* ========================================================================
     1. AUTHENTICATION SERVICE
     ====================================================================== */

  /* API.login({ email, password, role }) -> { success, token, user }
     A real Supabase session replaces the fake JWT of the mock layer. `role` is
     only the hint the login page's role pill sends: the database is the
     authority, and a mismatch is reported instead of quietly signing you in. */
  async function login(credentials) {
    const s = sb();
    await ready();

    const email = normalizeEmail(credentials && credentials.email);
    const password = credentials && credentials.password;
    const hint = credentials && credentials.role;

    if (!email || !password) throw new Error("Enter both your email address and password.");

    let auth;
    try {
      auth = await s.signIn(email, password);
    } catch (err) {
      throw authError(err);
    }

    const profile = await s.profile();
    if (!profile) {
      await logout();
      throw new Error("Signed in, but no staff profile exists for " + email + ". Ask an administrator to add you.");
    }
    if (String(profile.status) !== "Active") {
      await logout();
      throw new Error("This account is marked Inactive. Ask an administrator to reactivate it.");
    }
    if (hint && profile.role !== hint) {
      await logout();
      throw new Error("That is a " + profile.role + " account. Pick the \"" + profile.role + "\" card and sign in again.");
    }

    await touchLastLogin(profile.id);

    const user = publicUser(profile);
    notifyChange("auth", "login", user);
    return {
      success: true,
      token: (auth && auth.session && auth.session.access_token) || null,
      user: user
    };
  }

  /* last_login is bookkeeping - a permission hiccup must never block sign-in. */
  async function touchLastLogin(id) {
    try {
      await sb().update("users", "id", id, { lastLogin: new Date().toISOString() });
    } catch (e) { /* cosmetic column */ }
  }

  async function logout() {
    try { await sb().signOut(); } catch (e) { /* already signed out */ }
    try {
      localStorage.removeItem("msms_token");
      localStorage.removeItem("msms_user");
      localStorage.removeItem("msms_remember");
      sessionStorage.removeItem("msms_user");
    } catch (e) { /* storage disabled */ }
    notifyChange("auth", "logout", null);
    return { success: true };
  }

  /* ========================================================================
     2. DASHBOARD SERVICE
     ====================================================================== */

  /* ONE stored function instead of six table scans. The "today" window is
     computed in the store's timezone by get_dashboard_data() (dbschema 8.2),
     which is why it no longer depends on the browser clock. */
  async function getDashboardData() {
    const s = sb();
    await ready();
    const d = (await s.rpc("get_dashboard_data")) || {};
    const mix = d.inventory || {};
    return {
      todaySales: num(d.todaySales),
      todayBills: num(d.todayBills),
      totalMedicines: num(d.totalMedicines),
      lowStock: num(d.lowStock),
      expiringSoon: num(d.expiringSoon),
      pendingPrescriptions: num(d.pendingPrescriptions),
      pendingPurchaseOrders: num(d.pendingPurchaseOrders),
      todayCustomers: num(d.todayCustomers),
      inventory: {
        inStock: num(mix.inStock),
        lowStock: num(mix.lowStock),
        expiringSoon: num(mix.expiringSoon),
        outOfStock: num(mix.outOfStock)
      },
      generatedAt: d.generatedAt || null
    };
  }

  /* ========================================================================
     3. MEDICINES SERVICE
     ====================================================================== */

  async function getMedicines() {
    const s = sb(); await ready();
    return s.list("medicines");
  }

  /* The code (MED-013) is generated by next_code() inside the database, so two
     people adding a medicine at the same moment cannot collide on the key. */
  async function createMedicine(data) {
    const s = sb(); await ready();
    const row = await s.insert("medicines", clean(Object.assign({ status: "Active" }, data)));
    notifyChange("medicines", "create", row);
    return row;
  }

  async function updateMedicine(id, data) {
    const s = sb(); await ready();
    const row = await s.update("medicines", "id", id, clean(data));
    notifyChange("medicines", "update", row);
    return row;
  }

  async function deactivateMedicine(id) {
    const s = sb(); await ready();
    const row = await s.update("medicines", "id", id, { status: "Inactive" });
    notifyChange("medicines", "deactivate", row);
    return row;
  }

  /* ========================================================================
     4. CATEGORIES SERVICE
     ====================================================================== */

  async function getCategories() {
    const s = sb(); await ready();
    return s.list("categories");
  }

  /* category.count is maintained by the trg_medicines_count_* triggers in
     dbschema.sql (section 6). The old hand-rolled increment/decrement is gone:
     a crash halfway through used to leave the counts wrong forever. */
  async function createCategory(data) {
    const s = sb(); await ready();
    const row = await s.insert("categories", clean(Object.assign({ count: 0, status: "Active" }, data)));
    notifyChange("categories", "create", row);
    return row;
  }

  async function updateCategory(id, data) {
    const s = sb(); await ready();
    const row = await s.update("categories", "id", id, clean(data));
    notifyChange("categories", "update", row);
    return row;
  }

  /* ========================================================================
     5. INVENTORY SERVICE   (batch level: one row per medicine + batch)
     ====================================================================== */

  /* `status` is not a column - it is computed here on every read (Expired is
     intentionally not produced, matching the badge map in js/app.js). */
  async function getInventory() {
    const s = sb(); await ready();
    const rows = await s.list("inventory");
    return rows.map(function (i) { return Object.assign({}, i, { status: computeItemStatus(i) }); });
  }

  async function updateInventory(id, data) {
    const s = sb(); await ready();
    const row = await s.update("inventory", "id", id, clean(data));
    notifyChange("inventory", "update", row);
    return row;
  }

  /* inventory.id is a database identity column (BIGINT). js/billing.js adds to
     the cart with `+btn.dataset.id` and compares lines with `===`, so the id
     must stay a NUMBER and must never be sent from the client on insert. */
  async function addInventory(data) {
    const s = sb(); await ready();
    const row = await s.insert("inventory", clean(data));
    notifyChange("inventory", "create", row);
    return row;
  }

  /* ========================================================================
     6. SUPPLIERS SERVICE   (id format SUP-01, generated in the database)
     ====================================================================== */

  async function getSuppliers() {
    const s = sb(); await ready();
    return s.list("suppliers");
  }

  async function createSupplier(data) {
    const s = sb(); await ready();
    const row = await s.insert("suppliers", clean(Object.assign({ status: "Active" }, data)));
    notifyChange("suppliers", "create", row);
    return row;
  }

  async function updateSupplier(id, data) {
    const s = sb(); await ready();
    const row = await s.update("suppliers", "id", id, clean(data));
    notifyChange("suppliers", "update", row);
    return row;
  }

  /* ========================================================================
     7. PURCHASE ORDERS SERVICE
     ====================================================================== */

  async function getPurchaseOrders() {
    const s = sb(); await ready();
    return s.list("purchase_orders");
  }

  async function createPurchaseOrder(data) {
    const s = sb(); await ready();
    const row = await s.insert("purchase_orders", clean(Object.assign({
      date: today(),
      status: "Draft"
    }, data)));
    notifyChange("purchaseOrders", "create", row);
    return row;
  }

  /* Marking a PO "Received" is ALL the client does. The database trigger
     trg_po_received (dbschema 6.3) replenishes every batch bought from that
     supplier in the same transaction - even if this tab is closed right after
     the click, which the old JavaScript loop could not guarantee. */
  async function updatePurchaseOrder(id, data) {
    const s = sb(); await ready();
    const row = await s.update("purchase_orders", "id", id, clean(data));
    notifyChange("purchaseOrders", "update", row);
    if (data && data.status === "Received") notifyChange("inventory", "refresh", null);
    return row;
  }

  /* ========================================================================
     8. PRESCRIPTIONS SERVICE
     ====================================================================== */

  async function getPrescriptions() {
    const s = sb(); await ready();
    return s.list("prescriptions");
  }

  /* Approving issues a queue token through trg_prescriptions_approved
     (dbschema 6.2) - no client-side token maths, so two pharmacists approving
     at once cannot issue the same token twice. */
  async function updatePrescription(id, data) {
    const s = sb(); await ready();
    const row = await s.update("prescriptions", "id", id, clean(data));
    notifyChange("prescriptions", "update", row);
    if (data && data.status === "Approved") notifyChange("queue", "refresh", null);
    return row;
  }

  /* The file goes to the PRIVATE `prescriptions` Storage bucket first (decision
     #3: never a base64 blob inside a table). The row keeps the path, the
     original file name and a long-lived signed URL for the "View" action. */
  async function uploadPrescription(file, meta) {
    const s = sb(); await ready();
    if (!file) throw new Error("Choose a prescription file to upload.");
    meta = meta || {};

    const id = await s.nextCode("RX-", "prescriptions", "id", 4, 9000);
    const path = id + "/" + safeFileName(file.name);
    const uploaded = await s.upload(null, path, file);
    const storedPath = (uploaded && uploaded.path) || path;

    let url = null;
    try { url = await s.signedUrl(null, storedPath, 31536000); } catch (e) { /* the link is optional */ }

    const row = await s.insert("prescriptions", clean({
      id: id,
      customer: meta.customer,
      doctor: meta.doctor,
      medicine: meta.medicine,
      priority: meta.priority || "Normal",
      status: "Pending",
      invoice: meta.invoice,
      fileName: file.name,
      filePath: storedPath,
      fileUrl: url
    }));

    notifyChange("prescriptions", "create", row);
    return Object.assign({ success: true }, row);
  }

  /* ========================================================================
     9. RETURNS SERVICE
     ====================================================================== */

  async function getReturns() {
    const s = sb(); await ready();
    return s.list("returns");
  }

  async function createReturn(data) {
    const s = sb(); await ready();
    const row = await s.insert("returns", clean(Object.assign({
      date: today(),
      status: "Pending"
    }, data)));
    notifyChange("returns", "create", row);
    return row;
  }

  /* Approving restores the stock through trg_return_approved (dbschema 6.4). */
  async function updateReturn(id, data) {
    const s = sb(); await ready();
    const row = await s.update("returns", "id", id, clean(data));
    notifyChange("returns", "update", row);
    if (data && data.status === "Approved") notifyChange("inventory", "refresh", null);
    return row;
  }

  /* ========================================================================
     10. POS BILLING & TRANSACTIONS SERVICE
     ====================================================================== */

  /* ONE database transaction. The invoice row, its transaction_items and the
     stock decrements either all happen or none do:

       * stock is locked with `select ... for update`, so two tills cannot sell
         the same last strip of a batch,
       * insufficient stock raises an exception and the whole bill rolls back,
       * the invoice id comes from next_code(..., 5500) and cannot be reused.

     The old client-side loop could leave a half-billed cart plus partially
     decremented stock if the browser closed mid-checkout. */
  async function createBill(data) {
    const s = sb(); await ready();

    const cart = (data && data.items) || [];
    if (!cart.length) throw new Error("The cart is empty.");

    const items = cart.map(function (c) {
      return { invId: Number(c.invId), qty: num(c.qty) || 1, price: num(c.price) };
    });

    const res = await s.rpc("create_bill", {
      p_items: items,
      p_customer: (data && data.customer) || "Walk-in",
      p_payment: (data && data.payment) || "Cash",
      p_discount: num(data && data.discount),
      p_tax: num(data && data.tax),
      p_subtotal: num(data && data.subtotal),
      p_total: num(data && data.total)
    });

    notifyChange("transactions", "create", res);
    notifyChange("inventory", "refresh", null);
    return { success: true, invoiceId: res && res.invoiceId, lines: res && res.lines };
  }

  /* Newest first (see DEFAULT_ORDER in js/supabase-client.js) */
  async function getTransactions() {
    const s = sb(); await ready();
    return s.list("transactions");
  }

  /* ========================================================================
     11. CUSTOMER QUEUE SERVICE
     ====================================================================== */

  async function getQueue() {
    const s = sb(); await ready();
    return s.list("queue");
  }

  /* `token` IS the primary key (BIGINT). */
  async function updateQueue(token, data) {
    const s = sb(); await ready();
    const row = await s.update("queue", "token", num(token), queuePatch(data));
    notifyChange("queue", "update", row);
    return row;
  }

  /* The token comes from the queue_token_seq sequence, so a token handed out at
     one counter can never be handed out at the other. */
  async function addQueue(data) {
    const s = sb(); await ready();
    const row = await s.insert("queue", queuePatch(Object.assign({
      name: "Customer",
      wait: "0 min",
      priority: "Normal",
      status: "Waiting"
    }, data)));
    notifyChange("queue", "create", row);
    return row;
  }

  /* ========================================================================
     12. REPORTS & ANALYTICS SERVICE
     These three charts are pure aggregation, so they stay client-side: the raw
     rows are already cached by the browser, and no chart needs a round trip.
     Ranges are honest - a month with no paid bill charts as 0, not as the demo
     baseline the mock layer used to display.
     ====================================================================== */

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  async function getReports() {
    const s = sb(); await ready();
    const [transactions, inventory, purchaseOrders] = await Promise.all([
      s.list("transactions"),
      s.list("inventory"),
      s.list("purchase_orders")
    ]);

    /* Monthly sales ------------------------------------------------------ */
    const monthlyMap = {};
    transactions.filter(t => t.status === "Paid").forEach(t => {
      const d = new Date(String(t.date).replace(" ", "T"));
      if (!isNaN(d.getTime())) {
        const label = d.toLocaleString("en-US", { month: "short" });
        monthlyMap[label] = (monthlyMap[label] || 0) + num(t.amount);
      }
    });
    const monthlySalesData = MONTHS.map(m => num(monthlyMap[m]));

    /* Inventory mix ------------------------------------------------------ */
    const inventoryMixData = [
      inventory.filter(i => i.qty > 20 && daysUntil(i.expiry) > 90).length,
      inventory.filter(i => i.qty > 0 && i.qty <= 20).length,
      inventory.filter(i => i.qty > 0 && daysUntil(i.expiry) <= 90).length,
      inventory.filter(i => i.qty <= 0).length
    ];

    /* Purchases by supplier ---------------------------------------------- */
    const supplierMap = {};
    purchaseOrders.forEach(p => {
      const sup = p.supplier || "Vendor";
      supplierMap[sup] = (supplierMap[sup] || 0) + num(p.total);
    });
    const supplierLabels = Object.keys(supplierMap);

    return {
      monthlySales: { labels: MONTHS, data: monthlySalesData },
      inventoryMix: {
        labels: ["In Stock", "Low Stock", "Expiring Soon", "Out of Stock"],
        data: inventoryMixData
      },
      purchasesBySupplier: {
        labels: supplierLabels.length ? supplierLabels : ["No purchase orders yet"],
        data: supplierLabels.length ? supplierLabels.map(l => supplierMap[l]) : [0]
      }
    };
  }

  /* ========================================================================
     13. USERS SERVICE
     ====================================================================== */

  async function getUsers() {
    const s = sb(); await ready();
    return s.list("users");
  }

  /* Supabase Auth owns identity, so "add a user" means creating an auth
     account. SB.signUpUser() uses a throwaway client, which matters: calling
     auth.signUp() on the shared client would sign the ADMINISTRATOR out and
     sign the new person in.

     The Users form has no password field (and should not gain one - a password
     typed into someone else's account is a bad habit), so the account starts on
     SUPABASE_CONFIG.defaultUserPassword and the person changes it after their
     first sign-in. The handle_new_user() trigger writes the public.users row,
     including the initials shown in the topbar. */
  async function createUser(data) {
    const s = sb(); await ready();
    if (!data || !data.email) throw new Error("An email address is required.");

    const cfg = (typeof window !== "undefined" && window.SUPABASE_CONFIG) || {};
    const created = await s.signUpUser(
      normalizeEmail(data.email),
      data.password || cfg.defaultUserPassword || "MediStore@123",
      { full_name: data.name, name: data.name, role: data.role || "Pharmacist" }
    );

    const userId = created && created.user && created.user.id;
    let row = userId ? await s.one("users", "id", userId) : null;

    /* The form can also create the account as Inactive straight away. */
    if (row && data.status && data.status !== row.status) {
      row = await s.update("users", "id", row.id, { status: data.status });
    }

    notifyChange("users", "create", row);
    return row;
  }

  /* Administrators may edit anyone; everybody else may edit their own row -
     and may not change their own role. Both rules live in the RLS policies on
     public.users, so they hold even if the UI is bypassed. */
  async function updateUser(id, data) {
    const s = sb(); await ready();
    const row = await s.update("users", "id", id, clean(data));
    notifyChange("users", "update", row);
    return row;
  }

  /* ========================================================================
     14. NOTIFICATIONS SERVICE
     Derived at runtime - there is no notifications table to keep in sync.
     An empty list is a valid answer now: the mock layer used to invent two
     alerts so the bell never looked empty, which is exactly the kind of thing
     that makes people stop trusting the bell.
     ====================================================================== */

  async function getNotifications() {
    const s = sb(); await ready();
    const [inventory, purchaseOrders, prescriptions] = await Promise.all([
      s.list("inventory"),
      s.list("purchase_orders"),
      s.list("prescriptions")
    ]);

    const notifs = [];

    const low = inventory.find(i => i.qty > 0 && i.qty <= 20);
    if (low) notifs.push({ icon: "bi-exclamation-triangle", color: "ic-red", title: `Low stock: ${low.medicine} (${low.qty} left)`, time: low.batch ? `Batch ${low.batch}` : "Today" });

    const exp = inventory.find(i => daysUntil(i.expiry) <= 30 && i.qty > 0);
    if (exp) notifs.push({ icon: "bi-clock-history", color: "ic-orange", title: `${exp.medicine} batch ${exp.batch} expires soon`, time: `${daysUntil(exp.expiry)} days left` });

    const out = inventory.find(i => i.qty <= 0);
    if (out) notifs.push({ icon: "bi-x-octagon", color: "ic-red", title: `Out of stock: ${out.medicine}`, time: "Reorder now" });

    const recPo = purchaseOrders.find(p => p.status === "Received");
    if (recPo) notifs.push({ icon: "bi-bag-check", color: "ic-green", title: `Purchase order ${recPo.id} received`, time: recPo.date });

    const pendRx = prescriptions.find(r => r.status === "Pending");
    if (pendRx) notifs.push({ icon: "bi-person-plus", color: "ic-blue", title: `Prescription ${pendRx.id} pending review`, time: pendRx.date });

    return notifs;
  }

  /* ========================================================================
     15. LIVE UPDATES  (additive - NOT part of the frozen 35-function contract)
     API.on()   listens to this page's own event bus (instant, local).
     API.live() subscribes to Postgres tables over Supabase Realtime and also
                emits the same events, so a second till's sale updates this
                screen without polling. Always call API.stopLive() on unload.
     ====================================================================== */

  function on(event, callback) {
    return eventBus.on(event, callback);
  }

  function live(tables, handler) {
    return sb().onChange(tables, function (e) {
      try { handler(e); } catch (err) { console.warn("API.live handler failed", err); }
      notifyChange(e.table, String(e.event || "").toLowerCase(), e.row);
    });
  }

  function stopLive() {
    try { sb().unsubscribeAll(); } catch (e) { /* nothing subscribed */ }
  }

  /* ========================================================================
     16. PUBLIC SURFACE — the frozen 35-function contract, unchanged
     ====================================================================== */

  return {
    login, logout, getDashboardData,
    getMedicines, createMedicine, updateMedicine, deactivateMedicine,
    getCategories, createCategory, updateCategory,
    getInventory, updateInventory, addInventory,
    getSuppliers, createSupplier, updateSupplier,
    getPurchaseOrders, createPurchaseOrder, updatePurchaseOrder,
    getPrescriptions, updatePrescription, uploadPrescription,
    getReturns, createReturn, updateReturn,
    createBill, getTransactions,
    getQueue, updateQueue, addQueue,
    getReports, getUsers, createUser, updateUser,
    getNotifications,
    /* additive helpers */
    on, live, stopLive
  };
})();

/* Attach to the global scope: pages in pages/*.html are classic scripts and
   cannot `import` anything. */
window.API = API;

