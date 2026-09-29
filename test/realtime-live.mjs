/* ==========================================================================
   MEDISTORE MS — LIVE REALTIME PROBE  (opt-in: needs network + the demo user)
   ==========================================================================
   RUN:
       node test/realtime-live.mjs        # or: npm run test:realtime

   WHY THIS IS SEPARATE FROM `npm test`
   ------------------------------------
   Realtime delivery depends on three things that no offline test can prove:
   the table is in the `supabase_realtime` publication, the subscriber's JWT is
   pushed to the socket, and RLS lets the subscriber see the row. It is also
   timing-dependent (the channel must join before the write), so it is kept out
   of the deterministic gate in test/run-tests.js and run on demand.

   WHAT IT DOES
   ------------
   Signs in as a demo account, subscribes through the exact helper the queue
   page uses - window.SB.onChange(["queue"], ...) - then writes a queue row back
   with its OWN current value (an UPDATE that changes no data, so the database
   is left exactly as it was) and waits for the event.

   A green run proves `API.live(["queue"], …)` in js/queue.js can receive
   changes. In the browser, the page-level behaviour is: open Customer Queue in
   two tabs, change a token in one, and the other one updates without a reload.

   Override the account with MSMS_DEMO_EMAIL / MSMS_DEMO_PASSWORD.
   ========================================================================== */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEMO_EMAIL = process.env.MSMS_DEMO_EMAIL || "aisha@medstore.com";
const DEMO_PASSWORD = process.env.MSMS_DEMO_PASSWORD || "MediStore@123";

/* ---- browser shims the js/ files expect (same as test/run-tests.js) ---- */
const store = new Map();
global.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear()
};
global.sessionStorage = global.localStorage;
global.window = global;
global.window.supabase = { createClient };

const load = (rel) => new Function(fs.readFileSync(path.join(ROOT, rel), "utf8"))();
load("js/supabase-config.js");
load("js/supabase-client.js");
const SB = global.SB;

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

console.log("\n========================================================");
console.log("   MEDISTORE MS - LIVE REALTIME PROBE");
console.log("========================================================\n");

if (typeof WebSocket === "undefined") {
  console.error("  This Node build has no global WebSocket (needs Node 22+).");
  process.exit(1);
}

await SB.signIn(DEMO_EMAIL, DEMO_PASSWORD);
assert(!!SB.accessToken(), "signed in (the socket needs a real JWT)");

const rows = await SB.list("queue");
assert(rows.length > 0, "there is a queue row to watch", rows.length);
const target = rows[0];
console.log(`  watching queue token ${target.token} (status ${target.status})`);

const received = [];
SB.onChange(["queue"], (e) => received.push(e));

/* The channel join is not observable through SB.onChange(), so the write is
   retried: an event can only be delivered once the socket has joined. */
for (let attempt = 1; attempt <= 5 && !received.length; attempt++) {
  await SB.update("queue", "token", target.token, { wait: target.wait });
  for (let i = 0; i < 10 && !received.length; i++) await sleep(500);
  if (!received.length) console.log(`  (attempt ${attempt} delivered nothing - still joining?)`);
}

assert(received.length > 0, "SB.onChange (and therefore API.live) received the queue change",
  received.length ? undefined : "no event within 25s - check the publication and RLS");
if (received.length) {
  assert(received[0].table === "queue", "the event carries the table name", received[0].table);
  assert(!!received[0].row && String(received[0].row.token) === String(target.token),
    "the event carries the camelCase row the pages render", received[0].row && received[0].row.token);
}

const after = await SB.one("queue", "token", target.token);
assert(after.wait === target.wait && after.status === target.status,
  "the probe left the row exactly as it found it");

SB.unsubscribeAll();
await SB.signOut();

console.log(`\n================  ${passed} PASSED | ${failed} FAILED  ================\n`);
process.exit(failed ? 1 : 0);