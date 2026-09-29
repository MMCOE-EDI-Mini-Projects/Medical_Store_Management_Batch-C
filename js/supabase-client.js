/* ==========================================================================
   MEDISTORE MS — SUPABASE CLIENT / DATA ADAPTER   (exposes `window.SB`)
   ==========================================================================
   WHY THIS FILE EXISTS
   --------------------
   The three ways scripts are loaded in this project constrain everything:

     index.html          -> <script type="module">   (import would work)
     pages/*.html        -> <script>  CLASSIC        (import = SYNTAX ERROR)
     test/run-tests.js   -> new Function(code)       (no import, no export)

   So NOTHING under js/ may contain `import`, `export` or `import.meta`.
   The Supabase library therefore arrives as a *global* instead:

     browser -> window.supabase    (UMD bundle, see the <script> tag in the HTML)
     Node    -> injected by test/run-tests.js before this file is evaluated

   RESPONSIBILITIES
   ----------------
     1. Own the single Supabase client (and the auth session).
     2. Translate between the database dialect (snake_case columns, NULL) and
        the dialect the page code already speaks (camelCase, "—").
     3. Provide a small promise-based CRUD / RPC / Storage / Realtime surface
        so that js/api.js never has to know PostgREST exists.

   THE NAMING BRIDGE (memorise this table)
   ---------------------------------------
     DB column        page property     rule
     ---------------  ----------------  --------------------------------------
     med_id           medId             generic snake_case -> camelCase
     file_url         fileUrl           generic snake_case -> camelCase
     cashier_name     cashierName       generic snake_case -> camelCase
     parent_id        parent            explicit alias (TO_DB / FROM_DB)
     last_login       lastLogin         camelCase alias + display formatting
     <NULL>           "—"               every non-numeric column
     <NULL>           0                 every numeric column (see NUMERIC)

   RPC RESULTS ARE **NOT** NORMALISED. Every server-side function in
   dbschema.sql is written to return the exact JSON key names the UI wants
   (e.g. `get_dashboard_data()` already returns `todaySales`, `lowStock`, …),
   so re-mapping them would only risk breaking them.
   ========================================================================== */

window.SB = (function () {
  "use strict";

  var cfg = window.SUPABASE_CONFIG || {};
  var DASH = "\u2014"; /* em dash — the sentinel every page renders for "empty" */

  /* ========================================================================
     0. CONSTANTS
     ====================================================================== */

  /* Columns that are genuinely numeric. A NULL there becomes 0 rather than
     "—", so page code can keep doing arithmetic without a guard. Deliberately
     EXCLUDES `id`: it is a bigint on some tables and a uuid/string on others,
     and a primary key is never NULL anyway.                                */
  var NUMERIC = {
    qty: 1, purchase: 1, selling: 1, mrp: 1, price: 1,
    unitPrice: 1, lineTotal: 1, amount: 1, subtotal: 1,
    discount: 1, tax: 1, total: 1, count: 1, items: 1,
    reorder: 1, token: 1, lines: 1
  };

  /* Explicit aliases for the handful of names camelCase cannot derive. */
  var TO_DB   = { parent: "parent_id" };
  var FROM_DB = { parent_id: "parent" };

  /* Keys the UI keeps in RAM only (a cart line's `invId`, for example) or that
     Postgres owns (`created_at` / `updated_at` via trigger). Never uploaded. */
  var CLIENT_ONLY = { invId: 1, createdAt: 1, updatedAt: 1 };

  /* Timestamps the UI prints verbatim, so they are pre-rendered as
     "YYYY-MM-DD HH:MM" in the store timezone instead of raw ISO-8601.      */
  var DISPLAY_TS = { lastLogin: 1 };

  /* Stable default ordering, because PostgREST guarantees no ordering at all
     and js/db.js used to return rows in insertion order.                   */
  var DEFAULT_ORDER = {
    users:                { column: "name",       ascending: true  },
    categories:           { column: "id",         ascending: true  },
    suppliers:            { column: "id",         ascending: true  },
    medicines:            { column: "id",         ascending: true  },
    inventory:            { column: "id",         ascending: true  },
    transactions:         { column: "date",       ascending: false },
    transaction_items:    { column: "id",         ascending: true  },
    purchase_orders:      { column: "date",       ascending: false },
    purchase_order_items: { column: "id",         ascending: true  },
    prescriptions:        { column: "date",       ascending: false },
    returns:              { column: "date",       ascending: false },
    queue:                { column: "token",      ascending: false },
    audit_log:            { column: "created_at", ascending: false }
  };


  /* ========================================================================
     1. VALUE CONVERSION  (the naming bridge)
     ====================================================================== */

  /* medId -> med_id ; lastLogin -> last_login ; parent -> parent_id */
  function toSnake(name) {
    if (Object.prototype.hasOwnProperty.call(TO_DB, name)) return TO_DB[name];
    return String(name).replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  }

  /* med_id -> medId ; file_url -> fileUrl ; parent_id -> parent */
  function toCamel(name) {
    if (Object.prototype.hasOwnProperty.call(FROM_DB, name)) return FROM_DB[name];
    return String(name).replace(/_([a-z0-9])/g, function (_m, ch) { return ch.toUpperCase(); });
  }

  /* timestamptz -> "2026-09-07 09:12" in the configured store timezone */
  function formatTimestamp(value) {
    if (value === null || value === undefined || value === "") return DASH;
    var d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    try {
      /* the sv-SE locale formats as "YYYY-MM-DD HH:MM:SS" */
      return d.toLocaleString("sv-SE", {
        timeZone: cfg.timezone || "Asia/Kolkata",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit"
      }).slice(0, 16);
    } catch (e) {
      return d.toISOString().slice(0, 16).replace("T", " ");
    }
  }

  /* One database row -> the object shape the pages already expect. */
  function fromRow(row) {
    if (row === null || row === undefined) return row;
    if (Array.isArray(row)) return row.map(fromRow);
    if (typeof row !== "object") return row;

    var out = {};
    Object.keys(row).forEach(function (col) {
      var key = toCamel(col);
      var val = row[col];

      if (val === null || val === undefined) {
        out[key] = NUMERIC[key] ? 0 : DASH;
      } else if (DISPLAY_TS[key] && typeof val === "string") {
        out[key] = formatTimestamp(val);
      } else {
        out[key] = val;
      }
    });
    return out;
  }

  /* The object a page hands us -> a database payload.
     The "—" sentinel travels back to NULL so the database stays honest. */
  function toRow(obj) {
    if (!obj || typeof obj !== "object") return obj;
    var out = {};
    Object.keys(obj).forEach(function (key) {
      if (CLIENT_ONLY[key]) return;
      out[toSnake(key)] = (obj[key] === DASH) ? null : obj[key];
    });
    return out;
  }

  /* ========================================================================
     2. CLIENT & SESSION
     ====================================================================== */

  var client = null;
  var session = null;
  var online = false;
  var readyPromise = null;

  /* The UMD bundle (browser) or the injected global (Node) both land here. */
  function lib() {
    var w = (typeof window !== "undefined") ? window : null;
    return w && w.supabase ? w.supabase : null;
  }

  function configured() {
    if (!cfg || !cfg.url || !cfg.publishableKey) return false;
    if (cfg.isConfigured === false) return false;
    return !/YOUR[-_]/.test(cfg.publishableKey);
  }

  function getClient() {
    if (client) return client;
    var s = lib();
    if (!s || typeof s.createClient !== "function" || !configured()) return null;
    client = s.createClient(cfg.url, cfg.publishableKey, {
      auth: {
        /* namespaced so it cannot collide with the legacy "msms_token" /
           "msms_user" mock keys that js/auth.js still cleans up */
        storageKey: "msms_supabase_auth",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      },
      realtime: { params: { eventsPerSecond: 10 } }
    });
    return client;
  }

  /* Resolves once the stored session has been restored. Idempotent, and safe
     to call from every module — the work is done at most once. */
  function init() {
    if (readyPromise) return readyPromise;
    readyPromise = (async function () {
      var c = getClient();
      if (!c) { online = false; return { online: false, reason: "not-configured" }; }
      try {
        var res = await c.auth.getSession();
        session = (res && res.data && res.data.session) || null;
        online = true;
        return { online: true, session: session };
      } catch (e) {
        online = false;
        return { online: false, reason: (e && e.message) || String(e) };
      }
    })();
    return readyPromise;
  }

  function isOnline() { return online; }

  function currentSession() { return session; }

  function accessToken() { return session ? session.access_token : null; }

  function currentAuthUser() { return session ? session.user : null; }

  /* ========================================================================
     3. ERRORS
     ====================================================================== */

  function fail(error, context) {
    var msg = (error && (error.message || error.details || error.hint)) || "Supabase request failed";
    var err = new Error(context ? context + ": " + msg : msg);
    err.code = error && error.code;
    err.details = error && error.details;
    err.hint = error && error.hint;
    return err;
  }

  function requireClient() {
    var c = getClient();
    if (!c) {
      throw new Error(
        "Supabase is not configured. Set window.SUPABASE_CONFIG.url and .publishableKey " +
        "in js/supabase-config.js."
      );
    }
    return c;
  }

  /* ========================================================================
     4. CRUD
     ====================================================================== */

  function applyFilters(q, filters, method) {
    var fn = method || "eq";
    Object.keys(filters || {}).forEach(function (key) {
      var col = toSnake(key);
      var val = filters[key];
      if (val === null || val === undefined) { q = q.is(col, null); return; }
      q = q[fn](col, val);
    });
    return q;
  }

  /* list("medicines")
     list("inventory", { filters: { qty: 0 } })
     list("users",     { single: true, filters: { id: uid } })
     list("queue",     { order: "token", ascending: false, limit: 5 })   */
  async function list(table, opts) {
    opts = opts || {};
    var c = requireClient();

    var q = c.from(table).select(
      opts.select || "*",
      opts.count ? { count: "exact" } : undefined
    );

    q = applyFilters(q, opts.filters || opts.eq, "eq");
    q = applyFilters(q, opts.neq, "neq");
    q = applyFilters(q, opts.gte, "gte");
    q = applyFilters(q, opts.lte, "lte");
    q = applyFilters(q, opts.ilike, "ilike");

    Object.keys(opts.in || {}).forEach(function (key) {
      q = q.in(toSnake(key), opts.in[key]);
    });
    if (opts.or) q = q.or(opts.or);

    var ord = opts.order
      ? { column: opts.order, ascending: opts.ascending !== false }
      : DEFAULT_ORDER[table];
    if (ord) q = q.order(toSnake(ord.column), { ascending: ord.ascending !== false });

    if (opts.limit) q = q.limit(opts.limit);

    var res = opts.single ? await q.maybeSingle() : await q;
    if (res.error) throw fail(res.error, "select " + table);

    if (opts.single) return res.data ? fromRow(res.data) : null;
    return (res.data || []).map(fromRow);
  }

  /* Fetch exactly one row by a key column. Returns null when absent. */
  function one(table, keyColumn, keyValue) {
    var f = {};
    f[keyColumn] = keyValue;
    return list(table, { single: true, filters: f });
  }

  async function count(table, filters) {
    var c = requireClient();
    var q = c.from(table).select("*", { count: "exact", head: true });
    q = applyFilters(q, filters, "eq");
    var res = await q;
    if (res.error) throw fail(res.error, "count " + table);
    return res.count || 0;
  }

  /* insert("medicines", { id: "MED-013", name: "…" }) */
  async function insert(table, row) {
    var c = requireClient();
    var res = await c.from(table).insert(toRow(row)).select();
    if (res.error) throw fail(res.error, "insert into " + table);
    var rows = res.data || [];
    return rows.length ? fromRow(rows[0]) : null;
  }

  /* update("inventory", "id", 1, { qty: 118 }) */
  async function update(table, keyColumn, keyValue, patch) {
    var c = requireClient();
    var res = await c.from(table)
      .update(toRow(patch))
      .eq(toSnake(keyColumn), keyValue)
      .select();
    if (res.error) throw fail(res.error, "update " + table);
    if (!res.data || !res.data.length) {
      throw new Error("Record '" + keyValue + "' not found in '" + table + "'");
    }
    return fromRow(res.data[0]);
  }

  async function upsert(table, row, onConflict) {
    var c = requireClient();
    var res = await c.from(table)
      .upsert(toRow(row), { onConflict: onConflict || "id" })
      .select();
    if (res.error) throw fail(res.error, "upsert into " + table);
    var rows = res.data || [];
    return rows.length ? fromRow(rows[0]) : null;
  }

  async function remove(table, keyColumn, keyValue) {
    var c = requireClient();
    var res = await c.from(table).delete().eq(toSnake(keyColumn), keyValue).select();
    if (res.error) throw fail(res.error, "delete from " + table);
    return true;
  }

  /* ========================================================================
     5. RPC
     Results come back EXACTLY as dbschema.sql wrote them — no normalisation,
     because every server function already returns UI-shaped key names.
     ====================================================================== */

  async function rpc(fn, args) {
    var c = requireClient();
    var res = await c.rpc(fn, args || {});
    if (res.error) throw fail(res.error, "rpc " + fn);
    return res.data;
  }

  /* The next sequential business code — race-free, unlike a client-side max().
     nextCode("MED-", "medicines", "id", 3) -> "MED-013"                   */
  function nextCode(prefix, table, column, width, start) {
    return rpc("next_code", {
      p_prefix: prefix,
      p_table: table,
      p_column: column || "id",
      p_width: width || 3,
      p_start: start || 0
    });
  }

  /* ========================================================================
     6. STORAGE  (Decision #3 — prescription files live in a bucket, never
     as base64 inside a table)
     ====================================================================== */

  function bucketFor(bucket) {
    return bucket || cfg.storageBucket || "prescriptions";
  }

  /* upload("prescriptions", "RX-9001/scan.pdf", fileObject)
     -> { path, fullPath }  */
  async function upload(bucket, path, file, opts) {
    var c = requireClient();
    var res = await c.storage.from(bucketFor(bucket)).upload(path, file, {
      upsert: opts && opts.upsert !== undefined ? opts.upsert : true,
      cacheControl: opts && opts.cacheControl ? opts.cacheControl : "3600",
      contentType: (opts && opts.contentType) || (file && file.type) || undefined
    });
    if (res.error) throw fail(res.error, "upload " + path);
    return res.data;
  }

  /* The bucket is private, so the UI needs a short-lived signed URL. */
  async function signedUrl(bucket, path, expiresIn) {
    if (!path || path === DASH) return null;
    var c = requireClient();
    var res = await c.storage
      .from(bucketFor(bucket))
      .createSignedUrl(path, expiresIn || 3600);
    if (res.error) throw fail(res.error, "signedUrl " + path);
    return res.data ? res.data.signedUrl : null;
  }

  function publicUrl(bucket, path) {
    var c = requireClient();
    var res = c.storage.from(bucketFor(bucket)).getPublicUrl(path);
    return res && res.data ? res.data.publicUrl : null;
  }

  async function removeFile(bucket, paths) {
    var c = requireClient();
    var list = Array.isArray(paths) ? paths : [paths];
    var res = await c.storage.from(bucketFor(bucket)).remove(list);
    if (res.error) throw fail(res.error, "remove file");
    return true;
  }

  /* ========================================================================
     7. REALTIME  (Decision #7 — live queue + cross-module refresh)

     Usage:
       var off = SB.onChange(["queue"], function (e) {
         // e = { table, event: "INSERT"|"UPDATE"|"DELETE", row, old }
       });
       off();   // stop listening
     ====================================================================== */

  var channels = [];

  function onChange(tables, handler) {
    var c = requireClient();
    var list = tables && tables.length ? tables : (cfg.realtimeTables || []);
    var name = "msms-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    var ch = c.channel(name);

    list.forEach(function (table) {
      ch = ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: table },
        function (payload) {
          try {
            handler({
              table: table,
              event: payload.eventType,
              action: payload.eventType,
              row: fromRow(payload.new),
              old: fromRow(payload.old)
            });
          } catch (e) {
            /* a broken listener must never take down the socket */
            if (typeof console !== "undefined") console.warn("SB.onChange handler failed", e);
          }
        }
      );
    });

    ch.subscribe();
    channels.push(ch);

    return function unsubscribe() {
      try { c.removeChannel(ch); } catch (e) { /* already gone */ }
      var i = channels.indexOf(ch);
      if (i >= 0) channels.splice(i, 1);
    };
  }

  function unsubscribeAll() {
    var c = getClient();
    channels.slice().forEach(function (ch) {
      try { if (c) c.removeChannel(ch); } catch (e) { /* ignore */ }
    });
    channels.length = 0;
  }

  /* ========================================================================
     8. AUTH
     Real Supabase Auth replaces the mock token. `login.js` still calls
     Auth.login({ email, password, role, remember }) — the role argument is
     now only a hint, because the server is the authority on who you are.
     ====================================================================== */

  async function signIn(email, password) {
    var c = requireClient();
    var res = await c.auth.signInWithPassword({
      email: String(email || "").trim().toLowerCase(),
      password: password
    });
    if (res.error) throw fail(res.error, "signIn");
    session = res.data.session;
    online = true;
    return res.data;
  }

  /* Creates an auth account WITHOUT touching the signed-in administrator.
     supabase.auth.signUp() on the shared client would replace the current
     session, so a throwaway client is used: persistSession is off and it has
     its own storageKey, so nothing it does can reach localStorage.
     The `handle_new_user()` trigger in dbschema.sql then inserts the matching
     public.users row (name + role + avatar) by itself.                    */
  async function signUpUser(email, password, meta) {
    var s = lib();
    if (!s || typeof s.createClient !== "function" || !configured()) {
      throw new Error("Supabase is not configured.");
    }
    var tmp = s.createClient(cfg.url, cfg.publishableKey, {
      auth: {
        storageKey: "msms_signup_tmp",
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });
    var res = await tmp.auth.signUp({
      email: String(email || "").trim().toLowerCase(),
      password: password,
      options: { data: meta || {} }
    });
    if (res.error) throw fail(res.error, "createUser");
    return res.data;
  }

  async function signOut() {
    var c = getClient();
    session = null;
    if (!c) return true;
    try { await c.auth.signOut(); } catch (e) { /* already signed out */ }
    return true;
  }

  async function refreshSession() {
    var c = getClient();
    if (!c) return null;
    try {
      var res = await c.auth.refreshSession();
      session = (res && res.data && res.data.session) || null;
      return session;
    } catch (e) {
      return null;
    }
  }

  function onAuthStateChange(handler) {
    var c = getClient();
    if (!c) return function () {};
    var res = c.auth.onAuthStateChange(function (event, s) {
      session = s || null;
      try { handler(event, session); } catch (e) { /* ignore listener error */ }
    });
    return function () {
      try { if (res && res.data && res.data.subscription) res.data.subscription.unsubscribe(); }
      catch (e) { /* ignore */ }
    };
  }

  /* The signed-in person's row from public.users — the source of the role
     that drives the sidebar in js/app.js. Returns null when signed out.   */
  async function profile() {
    var u = currentAuthUser();
    if (!u) return null;
    return one("users", "id", u.id);
  }

  /* ========================================================================
     9. PUBLIC SURFACE
     ====================================================================== */

  return {
    /* --- naming bridge (exposed so api.js and the tests can reuse it) --- */
    toSnake: toSnake,
    toCamel: toCamel,
    fromRow: fromRow,
    toRow: toRow,
    DASH: DASH,

    /* --- lifecycle --- */
    init: init,
    isOnline: isOnline,
    configured: configured,
    client: getClient,

    /* --- session --- */
    session: currentSession,
    authUser: currentAuthUser,
    accessToken: accessToken,
    profile: profile,
    signIn: signIn,
    signUpUser: signUpUser,
    signOut: signOut,
    refreshSession: refreshSession,
    onAuthStateChange: onAuthStateChange,

    /* --- data --- */
    list: list,
    one: one,
    count: count,
    insert: insert,
    update: update,
    upsert: upsert,
    remove: remove,

    /* --- server functions --- */
    rpc: rpc,
    nextCode: nextCode,

    /* --- files --- */
    upload: upload,
    signedUrl: signedUrl,
    publicUrl: publicUrl,
    removeFile: removeFile,

    /* --- live updates --- */
    onChange: onChange,
    unsubscribeAll: unsubscribeAll
  };
})();

