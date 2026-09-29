/* ==========================================================================
   MEDISTORE MS — SUPABASE CONFIGURATION
   ==========================================================================
   Central runtime configuration for the Supabase backend.

   ⚠️ IMPORTANT — READ BEFORE EDITING
   This file is loaded by `index.html` as an ES module, but by every file in
   `pages/*.html` as a CLASSIC script:

       <script src="../js/supabase-config.js"></script>

   In a classic script, `import.meta` is a SYNTAX ERROR and the whole file
   fails to parse (the page silently renders nothing). Therefore:

       *** NEVER add `import.meta.env` to this file. ***

   Instead we expose a plain global that works identically in both loading
   modes, and can still be overridden at deploy time without touching code:

       <script>window.__MSMS_ENV__ = { url: "...", publishableKey: "..." };</script>

   NOTE ON SECRECY
   The publishable / "anon" key below is DESIGNED to be public. It is safe to
   ship in client-side code because Row Level Security (RLS) on every table
   decides what that key is allowed to read or write. A `service_role` key must
   NEVER appear in frontend code.
   ========================================================================== */

window.SUPABASE_CONFIG = (function () {
  /* ---- Built-in defaults (safe to commit: publishable key only) ------- */
  var DEFAULTS = {
    url: "https://rzuihpcvelaxxbschzkb.supabase.co",
    publishableKey: "sb_publishable_Z-LgIoXgXNCIP-I6rwxrnQ_kwj0u1L1",

    /* Supabase Storage bucket that holds uploaded prescription files */
    storageBucket: "prescriptions",

    /* Starting password for accounts created from the Users page.
       Supabase Auth is the only place a password may live, and the Users form
       deliberately has no password field, so the new staff member signs in with
       this and changes it from the account menu. It matches the demo accounts
       seeded by dbschema.sql, so "add a user" behaves exactly like the demo. */
    defaultUserPassword: "MediStore@123",

    /* Presentation settings (locked: INR / multi-page) */
    currency: "INR",
    currencySymbol: "\u20B9",
    timezone: "Asia/Kolkata",

    /* Tables that should stream live changes over Supabase Realtime */
    realtimeTables: ["queue", "inventory", "prescriptions", "transactions", "medicines"]
  };

  /* ---- Deploy-time override slot -------------------------------------- */
  var override = (typeof window !== "undefined" && window.__MSMS_ENV__) || {};

  var cfg = {};
  Object.keys(DEFAULTS).forEach(function (k) { cfg[k] = DEFAULTS[k]; });
  Object.keys(override).forEach(function (k) { cfg[k] = override[k]; });

  /* ---- Validation: decides whether we run live or fall back to mock --- */
  cfg.isConfigured = Boolean(
    cfg.url &&
    cfg.publishableKey &&
    /^https?:\/\//.test(cfg.url) &&
    !/YOUR[-_]/.test(cfg.publishableKey) &&
    !/YOUR[-_]/.test(cfg.url)
  );

  /* True when running only on mock data (no usable Supabase credentials) */
  cfg.useMock = !cfg.isConfigured;

  return cfg;
})();

/* Convenience alias so other modules can read a short name */
window.MSMS_CONFIG = window.SUPABASE_CONFIG;
