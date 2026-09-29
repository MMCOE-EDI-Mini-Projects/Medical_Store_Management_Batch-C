/* ==========================================================================
   MEDISTORE MS — QUEUE PAGE LIVE-UPDATE CHECK  (no network, no browser)
   ==========================================================================
   RUN:
       node test/queue-page-live.mjs      # or: npm run test:page

   `test/run-tests.js` loads only js/supabase-config.js, js/supabase-client.js
   and js/api.js — the page scripts (js/queue.js, js/dashboard.js, …) are never
   executed, because they need a DOM. That leaves the Phase 5 Realtime wiring in
   js/queue.js untested, which is exactly the kind of code that can silently
   stop working (a typo in the table name, a missing unsubscribe).

   This file closes that gap: it evaluates js/queue.js under a minimal DOM shim
   and asserts the contract the page must keep -

     1. it parses and registers its DOMContentLoaded handler
     2. it reads the queue exactly once, up front
     3. it subscribes to postgres_changes on the `queue` table
     4. a pushed change makes it re-read the queue (a burst is coalesced)
     5. it unsubscribes on pagehide, so no channel is leaked

   Everything is stubbed, so this is deterministic and cannot touch Supabase.
   The live counterpart (does the event really arrive?) is test/realtime-live.mjs.
   ========================================================================== */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CODE = fs.readFileSync(path.join(ROOT, "js", "queue.js"), "utf8");

/* ---------------------------------------------------------------- helpers */
let passed = 0;
let failed = 0;

function assert(condition, testName, extra) {
  if (condition) {
    console.log(`  \u2713 PASSED: ${testName}`);
    passed++;
  } else {
    console.error(`  \u2717 FAILED: ${testName}${extra !== undefined ? "  -> " + JSON.stringify(extra) : ""}`);
    failed++;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------- minimal DOM shim */
const listeners = {};
const els = {};
const makeEl = (id) => ({ id, innerHTML: "", dataset: {}, addEventListener() {} });

global.document = {
  addEventListener: (ev, fn) => { listeners[ev] = fn; },
  getElementById: (id) => (els[id] = els[id] || makeEl(id)),
  querySelectorAll: () => [],
  createElement: () => makeEl("tmp")
};
global.window = { addEventListener: (ev, fn) => { listeners["window:" + ev] = fn; } };

/* ------------------------------------------------------- app/API doubles */
const ROW = {
  token: 12, name: "Meera Nair", wait: "4m", priority: "High",
  status: "Waiting", cashier: "\u2014", prescriptionId: null
};

let queueReads = 0;
let stopCalls = 0;
let subscribedTables = null;
let pushHandler = null;

global.App = { init() {}, pageHeader: () => "", toast() {} };
global.Auth = { currentUser: () => ({ name: "Aisha Khan" }) };
global.API = {
  getQueue: async () => { queueReads++; return [ROW]; },
  updateQueue: async () => {},
  live: (tables, handler) => { subscribedTables = tables; pushHandler = handler; return () => {}; },
  stopLive: () => { stopCalls++; }
};

/* ------------------------------------------------------------------- run */
console.log("\n========================================================");
console.log("   QUEUE PAGE - LIVE-UPDATE WIRING CHECK");
console.log("========================================================\n");

let parseError = null;
try {
  new Function(CODE)();
} catch (e) {
  parseError = e;
}
assert(!parseError, "js/queue.js parses as a classic script", parseError && parseError.message);
assert(typeof listeners.DOMContentLoaded === "function", "the page registers a DOMContentLoaded handler");

if (!parseError) {
  listeners.DOMContentLoaded();
  await sleep(150);                       /* the page's first API.getQueue() resolves */

  assert(queueReads === 1, "the queue is read exactly once on load", queueReads);
  assert(JSON.stringify(subscribedTables) === '["queue"]',
    "it subscribes to postgres_changes on the `queue` table", subscribedTables);
  assert(typeof pushHandler === "function", "the realtime handler is registered");
  assert(/data-t="12"/.test(els.queueList.innerHTML), "the active queue list rendered the token");
  assert(/Meera Nair/.test(els.queueList.innerHTML), "the customer name rendered");

  /* A burst (two events inside the debounce window) must cause ONE re-read. */
  pushHandler({ table: "queue", event: "INSERT", row: ROW });
  pushHandler({ table: "queue", event: "UPDATE", row: ROW });
  await sleep(600);
  assert(queueReads === 2, "a pushed change re-reads the queue once (burst coalesced)", queueReads);

  listeners["window:pagehide"]();
  assert(stopCalls === 1, "pagehide unsubscribes - no channel is leaked", stopCalls);
}

console.log(`\n================  ${passed} PASSED | ${failed} FAILED  ================\n`);
process.exit(failed ? 1 : 0);