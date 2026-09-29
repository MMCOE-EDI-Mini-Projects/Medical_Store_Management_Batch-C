/* ==========================================================================
   CUSTOMER BILLING QUEUE PAGE
   ========================================================================== */
document.addEventListener("DOMContentLoaded", function () {
  App.init("queue", "Customer Queue");
  const content = document.getElementById("pageContent");
  let queue = [];

  function render() {
    const waiting = queue.filter((q) => q.status === "Waiting");
    const current = queue.find((q) => q.status === "Billing");
    const next = waiting[0];

    content.innerHTML = `
      ${App.pageHeader("Customer Billing Queue", "Manage walk-in customers waiting at the pharmacy counter.")}

      <div class="row g-3 mb-3">
        <div class="col-sm-4"><div class="stat-card"><div class="stat-icon ic-blue"><i class="bi bi-hash"></i></div><div class="stat-label">Current Token</div><div class="stat-value">${current ? "#" + current.token : "—"}</div></div></div>
        <div class="col-sm-4"><div class="stat-card"><div class="stat-icon ic-teal"><i class="bi bi-person-waiting"></i></div><div class="stat-label">Next Customer</div><div class="stat-value fs-5">${next ? next.name : "—"}</div></div></div>
        <div class="col-sm-4"><div class="stat-card"><div class="stat-icon ic-orange"><i class="bi bi-people"></i></div><div class="stat-label">Number Waiting</div><div class="stat-value">${waiting.length}</div></div></div>
      </div>

      <div class="row g-3">
        <div class="col-lg-7">
          <div class="msms-card section-card">
            <div class="card-header"><i class="bi bi-list-ol text-primary"></i>Active Queue
              <div class="header-tools"><button class="btn btn-sm btn-primary" id="callNextBtn"><i class="bi bi-bell me-1"></i>Call Next</button></div>
            </div>
            <div class="card-body" id="queueList"></div>
          </div>
        </div>
        <div class="col-lg-5">
          <div class="msms-card section-card">
            <div class="card-header"><i class="bi bi-clock-history text-primary"></i>Completed / Held</div>
            <div class="card-body" id="doneList"></div>
          </div>
        </div>
      </div>`;

    const active = queue.filter((q) => q.status === "Waiting" || q.status === "Billing");
    const done = queue.filter((q) => q.status === "Completed" || q.status === "Hold");

    document.getElementById("queueList").innerHTML = active.length ? active.map(function (q) {
      const prCls = q.priority === "High" ? "bg-status-critical" : q.priority === "Elderly" ? "bg-status-warning" : "bg-status-info";
      const stCls = q.status === "Billing" ? "bg-status-warning" : "bg-status-info";
      return `<div class="queue-token ${q.status === "Billing" ? "active" : ""}">
        <div class="token-num">${q.token}</div>
        <div class="token-info">
          <div class="token-name">${q.name}</div>
          <div class="token-meta">Waiting ${q.wait} · <span class="badge ${prCls} fs-xs">${q.priority}</span> · <span class="badge ${stCls} fs-xs">${q.status}</span></div>
        </div>
        <div class="token-actions">
          ${q.status === "Waiting" ? `<button class="btn btn-sm btn-outline-primary start-btn" data-t="${q.token}"><i class="bi bi-play"></i> Start</button>` : ""}
          ${q.status === "Billing" ? `<button class="btn btn-sm btn-outline-warning hold-btn" data-t="${q.token}"><i class="bi bi-pause"></i></button><button class="btn btn-sm btn-success complete-btn" data-t="${q.token}"><i class="bi bi-check"></i></button>` : ""}
          <button class="btn btn-sm btn-outline-danger cancel-btn" data-t="${q.token}"><i class="bi bi-x"></i></button>
        </div>
      </div>`;
    }).join("") : '<div class="msms-empty"><i class="bi bi-check-circle"></i><p>Queue is empty.</p></div>';

    document.getElementById("doneList").innerHTML = done.length ? done.map(function (q) {
      const stCls = q.status === "Completed" ? "bg-status-normal" : "bg-status-muted";
      return `<div class="queue-token"><div class="token-num" style="background:var(--msms-text-light)">${q.token}</div><div class="token-info"><div class="token-name">${q.name}</div><div class="token-meta">${q.cashier} · <span class="badge ${stCls} fs-xs">${q.status}</span></div></div></div>`;
    }).join("") : '<div class="msms-empty"><i class="bi bi-inbox"></i><p>No completed customers yet.</p></div>';

    // Bind actions
    document.getElementById("callNextBtn")?.addEventListener("click", callNext);
    document.querySelectorAll(".start-btn").forEach((b) => b.addEventListener("click", () => setStatus(+b.dataset.t, "Billing")));
    document.querySelectorAll(".hold-btn").forEach((b) => b.addEventListener("click", () => setStatus(+b.dataset.t, "Hold")));
    document.querySelectorAll(".complete-btn").forEach((b) => b.addEventListener("click", () => setStatus(+b.dataset.t, "Completed")));
    document.querySelectorAll(".cancel-btn").forEach((b) => b.addEventListener("click", () => setStatus(+b.dataset.t, "Hold")));
  }

  function callNext() {
    const next = queue.find((q) => q.status === "Waiting");
    if (!next) { App.toast({ type: "info", title: "Queue empty", message: "No customers waiting." }); return; }
    setStatus(next.token, "Billing");
    App.toast({ type: "success", title: "Calling " + next.name, message: "Token #" + next.token + " is now being served." });
  }

  function setStatus(token, status) {
    const q = queue.find((x) => x.token === token);
    if (!q) return;
    q.status = status;
    if (status === "Billing") q.cashier = Auth.currentUser().name;
    API.updateQueue(token, { status: q.status, cashier: q.cashier }).then(render);
  }

  /* ---- Realtime (dev_process.md §6 Phase 5) ------------------------------
     The queue is the one screen that must never go stale: a prescription
     approved at another desk, or a second till calling the next customer,
     changes this table while this page does nothing. API.live() subscribes to
     `postgres_changes` on the `queue` table (already in the
     `supabase_realtime` publication) and re-reads the queue, so no manual
     reload is needed.
     A page-level change, not an API change: the frozen 35 functions are
     untouched. If Realtime cannot be reached the page behaves exactly as it
     did before - it just needs a manual reload - so the call is wrapped.  */
  let reloadTimer = null;
  function scheduleReload() {
    if (reloadTimer) return;                    /* coalesce a burst of events */
    reloadTimer = setTimeout(function () {
      reloadTimer = null;
      API.getQueue().then(function (data) { queue = data; render(); }).catch(function () {});
    }, 250);
  }

  window.addEventListener("pagehide", function () { API.stopLive(); });

  API.getQueue().then(function (data) {
    queue = data;
    render();
    try { API.live(["queue"], scheduleReload); }
    catch (e) { console.warn("Live queue updates unavailable:", e); }
  });
});
