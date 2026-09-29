/* ==========================================================================
   APP — Shared shell: sidebar, topbar, theme, toasts, helpers
   Loaded on every authenticated page. Pages call App.init() on DOMContentLoaded.
   ========================================================================== */

const App = (function () {
  /* Full navigation config. `roles` restricts visibility by role. */
  const NAV = [
    { section: "Main" },
    { id: "dashboard",      label: "Dashboard",        icon: "bi-grid-1x2",       href: "dashboard.html",      roles: ["Admin", "Store Manager", "Pharmacist"] },
    { id: "billing",        label: "POS / Billing",    icon: "bi-bag",            href: "billing.html",        roles: ["Admin", "Store Manager", "Pharmacist"] },
    { id: "queue",          label: "Customer Queue",   icon: "bi-people",         href: "queue.html",          roles: ["Admin", "Store Manager", "Pharmacist"], badge: "queue" },

    { section: "Inventory" },
    { id: "medicines",      label: "Medicines",        icon: "bi-capsule",        href: "medicines.html",      roles: ["Admin", "Store Manager", "Pharmacist"] },
    { id: "categories",     label: "Categories",       icon: "bi-diagram-3",      href: "categories.html",     roles: ["Admin", "Store Manager"] },
    { id: "inventory",      label: "Inventory",        icon: "bi-box-seam",       href: "inventory.html",      roles: ["Admin", "Store Manager", "Pharmacist"] },
    { id: "expiry",         label: "Expiry Tracking",  icon: "bi-clock-history",  href: "expiry.html",         roles: ["Admin", "Store Manager"], badge: "expiry" },

    { section: "Procurement" },
    { id: "suppliers",      label: "Suppliers",        icon: "bi-truck",          href: "suppliers.html",      roles: ["Admin", "Store Manager"] },
    { id: "purchase-orders",label: "Purchase Orders",  icon: "bi-cart-check",     href: "purchase-orders.html",roles: ["Admin", "Store Manager"], badge: "po" },
    { id: "prescriptions",  label: "Prescriptions",    icon: "bi-file-medical",   href: "prescriptions.html",  roles: ["Admin", "Store Manager", "Pharmacist"], badge: "rx" },

    { section: "Operations" },
    { id: "returns",        label: "Returns",          icon: "bi-arrow-counterclockwise", href: "returns.html", roles: ["Admin", "Store Manager", "Pharmacist"] },
    { id: "reports",        label: "Reports",          icon: "bi-bar-chart-line", href: "reports.html",        roles: ["Admin", "Store Manager"] },

    { section: "Administration" },
    { id: "users",          label: "Users & Roles",    icon: "bi-person-gear",    href: "users.html",          roles: ["Admin"] },
    { id: "settings",       label: "Settings",         icon: "bi-gear",           href: "settings.html",       roles: ["Admin", "Store Manager", "Pharmacist"] },
  ];

  /* ---- Theme ---- */
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-bs-theme", theme);
    localStorage.setItem("msms_theme", theme);
  }
  function initTheme() {
    const saved = localStorage.getItem("msms_theme") || "light";
    applyTheme(saved);
  }
  function toggleTheme() {
    const next = document.documentElement.getAttribute("data-bs-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    const btn = document.getElementById("themeToggle");
    if (btn) btn.innerHTML = next === "dark" ? '<i class="bi bi-sun"></i>' : '<i class="bi bi-moon-stars"></i>';
  }

  /* ---- Sidebar ---- */
  function renderSidebar(activeId, user) {
    const navItems = NAV.filter((n) => !n.roles || n.roles.includes(user.role));
    const badgeCounts = { queue: 2, expiry: 9, po: 2, rx: 3 };

    let html = `
      <div class="msms-sidebar-brand">
        <div class="brand-logo"><i class="bi bi-prescription2"></i></div>
        <div class="brand-text">MediStore MS<small>Management System</small></div>
      </div>
      <nav class="msms-sidebar-nav">`;
    navItems.forEach((n) => {
      if (n.section) {
        html += `<div class="msms-nav-section">${n.section}</div>`;
      } else {
        const badge = n.badge && badgeCounts[n.badge] ? `<span class="nav-badge">${badgeCounts[n.badge]}</span>` : "";
        html += `<a class="msms-nav-link ${n.id === activeId ? "active" : ""}" href="${n.href}">
                    <i class="bi ${n.icon}"></i><span>${n.label}</span>${badge}
                 </a>`;
      }
    });
    html += `</nav>
      <div class="msms-sidebar-footer">v1.0 · Frontend Demo</div>`;
    return html;
  }

  /* ---- Topbar ---- */
  function renderTopbar(pageTitle, user) {
    const roleBadge = {
      Admin: '<span class="badge bg-danger">Admin</span>',
      "Store Manager": '<span class="badge bg-primary">Store Manager</span>',
      Pharmacist: '<span class="badge bg-success">Pharmacist</span>',
    }[user.role] || "";

    return `
      <button class="menu-toggle topbar-btn" id="menuToggle" title="Menu"><i class="bi bi-list"></i></button>
      <h1 class="page-title">${pageTitle}</h1>

      <div class="topbar-search ms-3 d-none d-md-flex">
        <div class="input-group">
          <span class="input-group-text"><i class="bi bi-search"></i></span>
          <input type="text" class="form-control" placeholder="Search medicines, invoices, customers…" id="globalSearch">
        </div>
      </div>

      <div class="msms-topbar-actions">
        <button class="topbar-btn" id="themeToggle" title="Toggle theme">
          <i class="bi bi-moon-stars"></i>
        </button>
        <div class="dropdown">
          <button class="topbar-btn" data-bs-toggle="dropdown" aria-expanded="false" title="Notifications">
            <i class="bi bi-bell"></i><span class="dot"></span>
          </button>
          <div class="dropdown-menu dropdown-menu-end notif-dropdown" id="notifDropdown"></div>
        </div>
        <span class="msms-topbar-role">${roleBadge}</span>
        <div class="dropdown">
          <div class="msms-user-chip" data-bs-toggle="dropdown" aria-expanded="false" role="button">
            <div class="avatar">${user.avatar || user.name.charAt(0)}</div>
            <div>
              <div class="uc-name">${user.name}</div>
              <div class="uc-role">${user.role}</div>
            </div>
            <i class="bi bi-chevron-down ms-1 text-muted-2"></i>
          </div>
          <ul class="dropdown-menu dropdown-menu-end">
            <li><a class="dropdown-item" href="settings.html"><i class="bi bi-person"></i>Profile Settings</a></li>
            <li><a class="dropdown-item" href="settings.html"><i class="bi bi-gear"></i>Preferences</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item text-danger" href="#" id="logoutBtn"><i class="bi bi-box-arrow-right"></i>Logout</a></li>
          </ul>
        </div>
      </div>`;
  }

  /* ---- Notifications ---- */
  function loadNotifications() {
    const el = document.getElementById("notifDropdown");
    if (!el) return;
    API.getNotifications().then((items) => {
      let html = `<div class="notif-head">Notifications <span class="badge bg-danger float-end">${items.length}</span></div>`;
      items.forEach((n) => {
        html += `<div class="notif-item">
          <div class="n-icon ${n.color}"><i class="bi ${n.icon}"></i></div>
          <div><div class="n-title">${n.title}</div><div class="n-time">${n.time}</div></div>
        </div>`;
      });
      html += `<div class="notif-foot"><a href="#" class="text-decoration-none fw-600 fs-sm">View all</a></div>`;
      el.innerHTML = html;
    });
  }

  /* ---- Toast system ---- */
  function toast(opts) {
    let container = document.querySelector(".msms-toast-container");
    if (!container) {
      container = document.createElement("div");
      container.className = "msms-toast-container";
      document.body.appendChild(container);
    }
    const cfg = {
      type: opts.type || "info",
      title: opts.title || "",
      message: opts.message || "",
      duration: opts.duration != null ? opts.duration : 3200,
    };
    const icons = { success: "bi-check-circle-fill", error: "bi-x-circle-fill", warning: "bi-exclamation-triangle-fill", info: "bi-info-circle-fill" };
    const el = document.createElement("div");
    el.className = `msms-toast ${cfg.type}`;
    el.innerHTML = `<i class="bi ${icons[cfg.type]} toast-icon"></i>
      <div><div class="toast-title">${cfg.title}</div><div class="toast-msg">${cfg.message}</div></div>
      <button class="toast-close"><i class="bi bi-x"></i></button>`;
    container.appendChild(el);
    const close = () => {
      el.classList.add("hide");
      setTimeout(() => el.remove(), 300);
    };
    el.querySelector(".toast-close").addEventListener("click", close);
    if (cfg.duration > 0) setTimeout(close, cfg.duration);
  }

  /* ---- Live clock ---- */
  function startClock() {
    const el = document.getElementById("topbarClock");
    if (!el) return;
    const tick = () => {
      const d = new Date();
      el.textContent = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) + " · " +
        d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    };
    tick();
    setInterval(tick, 1000 * 30);
  }

  /* ---- Sidebar toggle (mobile) ---- */
  function bindSidebarToggle() {
    const toggle = document.getElementById("menuToggle");
    const sidebar = document.getElementById("msmsSidebar");
    const backdrop = document.getElementById("msmsBackdrop");
    if (!toggle || !sidebar) return;
    const open = () => { sidebar.classList.add("show"); backdrop.classList.add("show"); };
    const close = () => { sidebar.classList.remove("show"); backdrop.classList.remove("show"); };
    toggle.addEventListener("click", open);
    backdrop.addEventListener("click", close);
  }

  /* ---- INIT ---- */
  function init(activeId, pageTitle) {
    initTheme();
    if (!Auth.requireAuth()) return;
    /* Confirms the Supabase session behind the cached user is still valid.
       verify() redirects to the login form itself when it is not, so the page
       simply stops here. */
    if (typeof Auth.verify === "function") Auth.verify().catch(() => {});
    const user = Auth.currentUser();
    if (!user) return;

    // Build shell
    const sidebar = document.getElementById("msmsSidebar");
    const topbar = document.getElementById("msmsTopbar");
    if (sidebar) sidebar.innerHTML = renderSidebar(activeId, user);
    if (topbar) topbar.innerHTML = renderTopbar(pageTitle, user);

    // Backdrop element
    if (!document.getElementById("msmsBackdrop")) {
      const bd = document.createElement("div");
      bd.className = "msms-backdrop";
      bd.id = "msmsBackdrop";
      document.body.appendChild(bd);
    }

    bindSidebarToggle();
    loadNotifications();
    startClock();

    // Theme toggle
    const themeBtn = document.getElementById("themeToggle");
    if (themeBtn) {
      themeBtn.innerHTML = (localStorage.getItem("msms_theme") === "dark") ? '<i class="bi bi-sun"></i>' : '<i class="bi bi-moon-stars"></i>';
      themeBtn.addEventListener("click", toggleTheme);
    }

    // Logout
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", (e) => {
        e.preventDefault();
        Auth.logout().then(() => { window.location.href = "../index.html"; });
      });
    }
  }

  /* ---- Utility: status badge class ---- */
  function statusBadge(status) {
    const map = {
      "In Stock": "bg-status-normal", "Low Stock": "bg-status-warning", "Out of Stock": "bg-status-critical",
      "Expiring Soon": "bg-status-warning", "Active": "bg-status-normal", "Inactive": "bg-status-muted",
      "Paid": "bg-status-normal", "Pending": "bg-status-warning", "Refunded": "bg-status-info",
      "Approved": "bg-status-normal", "Rejected": "bg-status-critical", "Received": "bg-status-normal",
      "Draft": "bg-status-muted", "Cancelled": "bg-status-critical", "Waiting": "bg-status-info",
      "Billing": "bg-status-warning", "Completed": "bg-status-normal", "Hold": "bg-status-muted",
      "Normal": "bg-status-info", "High": "bg-status-critical", "Elderly": "bg-status-warning",
    };
    return map[status] || "bg-status-muted";
  }

  function money(n) { return "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  function daysUntil(dateStr) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
    return Math.round((d - today) / 86400000);
  }

  /* ---- UI: table builder ---- */
  function table(rows, cols, opts) {
    opts = opts || {};
    const empty = !rows || !rows.length;
    const head = "<thead><tr>" + cols.map((c) => `<th>${c.label}</th>`).join("") + "</tr></thead>";
    if (empty) return `<div class="msms-table-wrap"><table class="table ${opts.hover ? "table-hover" : ""}">${head}<tbody><tr><td colspan="${cols.length}"><div class="msms-empty"><i class="bi bi-inbox"></i><p>${opts.emptyText || "No records found"}</p></div></td></tr></tbody></table></div>`;
    const body = "<tbody>" + rows.map(function (r) {
      return "<tr>" + cols.map(function (c) {
        let v;
        if (c.render) v = c.render(r);
        else if (c.badge) v = `<span class="badge ${statusBadge(r[c.key])}">${r[c.key]}</span>`;
        else v = r[c.key] != null ? r[c.key] : "—";
        return `<td>${v}</td>`;
      }).join("") + "</tr>";
    }).join("") + "</tbody>";
    return `<div class="msms-table-wrap"><table class="table ${opts.hover ? "table-hover" : ""}">${head}${body}</table></div>`;
  }

  function actionBtn(icon, cls, title) { return `<button class="action-btn ${cls}" title="${title}"><i class="bi ${icon}"></i></button>`; }

  function pageHeader(title, subtitle, actionsHtml) {
    return `<div class="msms-page-header"><div><h1>${title}</h1><p class="subtitle">${subtitle || ""}</p></div><div class="actions">${actionsHtml || ""}</div></div>`;
  }

  function filterBar(items, extraHtml) {
    let html = '<div class="filter-bar">';
    items.forEach(function (it) {
      if (it.type === "search") html += `<div class="input-group" style="max-width:240px"><span class="input-group-text"><i class="bi bi-search"></i></span><input type="text" class="form-control" id="${it.id}" placeholder="${it.label}"></div>`;
      else if (it.type === "select") html += `<select class="form-select" id="${it.id}" style="max-width:180px"><option value="">${it.label}</option>${(it.options || []).map((o) => `<option value="${o}">${o}</option>`).join("")}</select>`;
    });
    if (extraHtml) html += extraHtml;
    html += '<div class="spacer"></div></div>';
    return html;
  }

  function pagination(current, total, perPage, onPage) {
    const pages = Math.ceil(total / perPage) || 1;
    let html = '<div class="msms-pagination">';
    html += `<button ${current <= 1 ? "disabled" : ""} data-p="${current - 1}"><i class="bi bi-chevron-left"></i></button>`;
    for (let i = 1; i <= pages; i++) {
      if (pages > 7 && i > 1 && i < pages && (i < current - 1 || i > current + 1)) {
        if (i === 2 || i === pages - 1) html += `<button disabled>…</button>`;
        continue;
      }
      html += `<button class="${i === current ? "active" : ""}" data-p="${i}">${i}</button>`;
    }
    html += `<button ${current >= pages ? "disabled" : ""} data-p="${current + 1}"><i class="bi bi-chevron-right"></i></button></div>`;
    if (onPage) setTimeout(function () {
      document.querySelectorAll(".msms-pagination button[data-p]").forEach(function (b) {
        b.addEventListener("click", function () { if (!b.disabled) onPage(+b.dataset.p); });
      });
    }, 0);
    return html;
  }

  function modalHtml(id, title, bodyHtml, footerHtml, size) {
    return `<div class="modal fade" id="${id}" tabindex="-1"><div class="modal-dialog modal-dialog-centered ${size || "modal-lg"}"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">${title}</h5><button class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body">${bodyHtml}</div>${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ""}</div></div></div>`;
  }

  function avatar(name) { return `<span class="tbl-avatar">${(name || "?").charAt(0)}</span>`; }

  return { init, toast, statusBadge, money, daysUntil, table, actionBtn, pageHeader, filterBar, pagination, modalHtml, avatar, applyTheme, toggleTheme };
})();

window.App = App;
