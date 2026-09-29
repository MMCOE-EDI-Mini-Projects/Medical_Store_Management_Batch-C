/* ==========================================================================
   DASHBOARD PAGE
   ========================================================================== */
document.addEventListener("DOMContentLoaded", function () {
  App.init("dashboard", "Dashboard");

  const content = document.getElementById("pageContent");
  content.innerHTML = `
    <div class="msms-page-header">
      <div>
        <h1>Welcome back, <span id="welcomeName">—</span> 👋</h1>
        <p class="subtitle">Here is what is happening at your store today.</p>
      </div>
      <div class="actions">
        <span class="badge bg-light text-dark border" id="topbarClock"><i class="bi bi-clock me-1"></i>—</span>
        <a href="billing.html" class="btn btn-primary"><i class="bi bi-bag me-1"></i>New Sale</a>
      </div>
    </div>

    <!-- Stat cards -->
    <div class="row g-3 mb-3" id="statCards"></div>

    <!-- Charts row -->
    <div class="row g-3 mb-3">
      <div class="col-lg-8">
        <div class="msms-card section-card">
          <div class="card-header">
            <i class="bi bi-graph-up-arrow text-primary"></i>Sales Overview
            <div class="header-tools">
              <div class="btn-group btn-group-sm" id="salesRange">
                <button class="btn btn-outline-secondary active" data-range="daily">Daily</button>
                <button class="btn btn-outline-secondary" data-range="weekly">Weekly</button>
                <button class="btn btn-outline-secondary" data-range="monthly">Monthly</button>
              </div>
            </div>
          </div>
          <div class="card-body"><div class="chart-wrap"><canvas id="salesChart"></canvas></div></div>
        </div>
      </div>
      <div class="col-lg-4">
        <div class="msms-card section-card h-100">
          <div class="card-header"><i class="bi bi-box-seam text-primary"></i>Inventory Overview</div>
          <div class="card-body"><div class="chart-wrap"><canvas id="inventoryChart"></canvas></div></div>
        </div>
      </div>
    </div>

    <!-- Low stock + Expiry alerts -->
    <div class="row g-3 mb-3">
      <div class="col-lg-6">
        <div class="msms-card section-card h-100">
          <div class="card-header">
            <i class="bi bi-exclamation-triangle text-warning"></i>Low Stock Alert
            <a href="inventory.html" class="header-tools fs-sm">View all</a>
          </div>
          <div class="card-body p-0"><div class="msms-table-wrap"><table class="table" id="lowStockTable"></table></div></div>
        </div>
      </div>
      <div class="col-lg-6">
        <div class="msms-card section-card h-100">
          <div class="card-header">
            <i class="bi bi-clock-history text-danger"></i>Expiry Alert
            <a href="expiry.html" class="header-tools fs-sm">View all</a>
          </div>
          <div class="card-body p-0"><div class="msms-table-wrap"><table class="table" id="expiryAlertTable"></table></div></div>
        </div>
      </div>
    </div>

    <!-- Recent transactions -->
    <div class="msms-card section-card">
      <div class="card-header">
        <i class="bi bi-receipt text-primary"></i>Recent Transactions
        <a href="reports.html" class="header-tools fs-sm">View all</a>
      </div>
      <div class="card-body p-0"><div class="msms-table-wrap"><table class="table table-hover" id="recentTxTable"></table></div></div>
    </div>
  `;

  const user = Auth.currentUser();
  document.getElementById("welcomeName").textContent = user ? user.name.split(" ")[0] : "";

  let salesChart, inventoryChart;

  API.getDashboardData().then(function (d) {
    /* Stat cards */
    const stats = [
      { label: "Today's Sales",          value: App.money(d.todaySales),         icon: "bi-cash-coin",      color: "ic-blue",   trend: "+12.4%", up: true  },
      { label: "Today's Bills",          value: d.todayBills,                    icon: "bi-receipt",        color: "ic-teal",   trend: "+5",     up: true  },
      { label: "Total Medicines",        value: d.totalMedicines,                icon: "bi-capsule",        color: "ic-purple", trend: "Stable", up: true  },
      { label: "Low Stock Items",        value: d.lowStock,                      icon: "bi-exclamation-triangle", color: "ic-orange", trend: "-2", up: false },
      { label: "Expiring Soon",          value: d.expiringSoon,                  icon: "bi-clock-history",  color: "ic-red",    trend: "+1",     up: false },
      { label: "Pending Prescriptions",  value: d.pendingPrescriptions,          icon: "bi-file-medical",   color: "ic-pink",   trend: "Action needed", up: false },
      { label: "Pending Purchase Orders",value: d.pendingPurchaseOrders,         icon: "bi-cart-check",     color: "ic-cyan",   trend: "Review", up: false },
      { label: "Today's Customers",      value: d.todayCustomers,                icon: "bi-people",         color: "ic-green",  trend: "+8",     up: true  },
    ];
    document.getElementById("statCards").innerHTML = stats.map(function (s) {
      return `<div class="col-sm-6 col-xl-3">
        <div class="stat-card">
          <div class="stat-icon ${s.color}"><i class="bi ${s.icon}"></i></div>
          <div class="stat-label">${s.label}</div>
          <div class="stat-value">${s.value}</div>
          <div class="stat-trend ${s.up ? "up" : "down"}"><i class="bi ${s.up ? "bi-arrow-up-right" : "bi-arrow-down-right"}"></i> ${s.trend}</div>
          <i class="bi ${s.icon} stat-bg-icon"></i>
        </div>
      </div>`;
    }).join("");

    /* Sales chart */
    const ctx = document.getElementById("salesChart").getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, 300);
    grad.addColorStop(0, "rgba(13,110,253,0.35)");
    grad.addColorStop(1, "rgba(13,110,253,0.02)");

    function buildSalesChart(rangeKey) {
      const r = d["sales" + rangeKey.charAt(0).toUpperCase() + rangeKey.slice(1)];
      if (salesChart) salesChart.destroy();
      salesChart = new Chart(ctx, {
        type: "line",
        data: {
          labels: r.labels,
          datasets: [{
            label: "Sales",
            data: r.data,
            borderColor: "#0d6efd",
            backgroundColor: grad,
            fill: true, tension: 0.4, borderWidth: 3,
            pointBackgroundColor: "#0d6efd", pointRadius: 4, pointHoverRadius: 6,
          }],
        },
        options: chartOpts({ plugins: true, currency: rangeKey === "monthly" || rangeKey === "weekly" }),
      });
    }
    buildSalesChart("daily");

    document.querySelectorAll("#salesRange button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll("#salesRange button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        buildSalesChart(btn.dataset.range);
      });
    });

    /* Inventory doughnut */
    inventoryChart = new Chart(document.getElementById("inventoryChart").getContext("2d"), {
      type: "doughnut",
      data: {
        labels: d.inventory ? ["In Stock","Low Stock","Expiring Soon","Out of Stock"] : [],
        datasets: [{
          data: d.inventory ? [d.inventory.inStock, d.inventory.lowStock, d.inventory.expiringSoon, d.inventory.outOfStock] : [],
          backgroundColor: ["#198754", "#f59f00", "#fd7e14", "#e03131"],
          borderWidth: 0, hoverOffset: 6,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: "62%",
        plugins: { legend: { position: "bottom", labels: { boxWidth: 12, padding: 14 } } },
      },
    });

    /* Low stock table */
    API.getInventory().then(function (inv) {
      const low = inv.filter((i) => i.status === "Low Stock" || i.status === "Out of Stock").slice(0, 5);
      document.getElementById("lowStockTable").innerHTML = tableHTML(low, [
        ["Medicine", "medicine"], ["Batch", "batch"], ["Qty", "qty"], ["Status", "status", "badge"],
      ]);

      /* Expiry alert table */
      const exp = inv.filter((i) => App.daysUntil(i.expiry) <= 90 && i.qty > 0)
        .sort((a, b) => App.daysUntil(a.expiry) - App.daysUntil(b.expiry)).slice(0, 5);
      document.getElementById("expiryAlertTable").innerHTML = tableHTML(exp, [
        ["Medicine", "medicine"], ["Batch", "batch"], ["Expiry", "expiry"],
        ["Days Left", "expiry", "days"], ["Status", "status", "badge"]
      ]);
    });

    /* Recent transactions */
    API.getTransactions().then(function (tx) {
      document.getElementById("recentTxTable").innerHTML = tableHTML(tx.slice(0, 6), [
        ["Invoice", "id"], ["Customer", "customer"], ["Amount", "amount", "money"], ["Payment", "payment"], ["Date", "date"], ["Status", "status", "badge"],
      ]);
    });
  });

  /* ---- Shared table builder ---- */
  function tableHTML(rows, cols) {
    if (!rows.length) return `<thead><tr>${cols.map(c => `<th>${c[0]}</th>`).join("")}</tr></thead><tbody><tr><td colspan="${cols.length}"><div class="msms-empty"><i class="bi bi-inbox"></i><p>No records found</p></div></td></tr></tbody>`;
    const head = "<thead><tr>" + cols.map((c) => `<th>${c[0]}</th>`).join("") + "</tr></thead>";
    const body = "<tbody>" + rows.map(function (r) {
      return "<tr>" + cols.map(function (c) {
        let v = r[c[1]];
        if (c[2] === "badge") v = `<span class="badge ${App.statusBadge(r[c[1]])}">${r[c[1]]}</span>`;
        else if (c[2] === "money") v = App.money(r[c[1]]);
        else if (c[2] === "days") {
          const d = App.daysUntil(r[c[1]]);
          v = d < 0 ? `<strong class="text-danger">Expired</strong>` : `<strong>${d} days</strong>`;
        }
        return `<td>${v}</td>`;
      }).join("") + "</tr>";
    }).join("") + "</tbody>";
    return head + body;
  }

  /* ---- Chart defaults ---- */
  function chartOpts(o) {
    return {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: o.currency ? { label: (c) => " " + App.money(c.raw) } : {},
        },
      },
      scales: {
        y: { beginAtZero: true, grid: { color: "rgba(127,127,127,0.12)" }, ticks: { callback: (v) => o.currency ? "₹" + (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v) : v } },
        x: { grid: { display: false } },
      },
    };
  }
});
