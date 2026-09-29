/* ==========================================================================
   POS / BILLING PAGE
   ========================================================================== */
document.addEventListener("DOMContentLoaded", function () {
  App.init("billing", "POS / Billing");
  const content = document.getElementById("pageContent");

  let cart = [];
  let inventory = [];
  let categories = [];

  const TAX_RATE = 0.05; // 5% mock tax

  content.innerHTML = `
    <div class="msms-page-header">
      <div><h1>Pharmacy Billing Counter</h1>
      <p class="subtitle">Search medicines, build the bill, and process payment.</p></div>
      <div class="actions">
        <button class="btn btn-light" id="holdBillBtn"><i class="bi bi-pause-btn me-1"></i>Hold</button>
        <button class="btn btn-light" id="draftBtn"><i class="bi bi-save me-1"></i>Save Draft</button>
        <button class="btn btn-outline-danger" id="clearCartBtn"><i class="bi bi-trash3 me-1"></i>Clear</button>
      </div>
    </div>

    <div class="pos-grid">
      <!-- LEFT: search + results -->
      <div>
        <div class="msms-card pos-search-card section-card">
          <div class="card-header"><i class="bi bi-search text-primary"></i>Find Medicine</div>
          <div class="card-body">
            <div class="row g-2 mb-3">
              <div class="col-md-6">
                <div class="input-group">
                  <span class="input-group-text"><i class="bi bi-search"></i></span>
                  <input type="text" class="form-control" id="medSearch" placeholder="Search by name or code…">
                </div>
              </div>
              <div class="col-md-3">
                <select class="form-select" id="catFilter"><option value="">All Categories</option></select>
              </div>
              <div class="col-md-3">
                <select class="form-select" id="batchFilter"><option value="">All Batches</option></select>
              </div>
            </div>
            <div id="medResults"><div class="msms-loading"><div class="spinner-border"></div></div></div>
          </div>
        </div>
      </div>

      <!-- RIGHT: cart / bill -->
      <div class="msms-card cart-card section-card">
        <div class="card-header"><i class="bi bi-bag-check text-primary"></i>Current Bill</div>
        <div class="card-body">
          <div class="row g-2 mb-3">
            <div class="col-7">
              <input type="text" class="form-control form-control-sm" id="custName" placeholder="Customer name">
            </div>
            <div class="col-5">
              <input type="text" class="form-control form-control-sm" id="custPhone" placeholder="Phone">
            </div>
          </div>
          <div id="rxIndicator" class="alert alert-warning py-2 fs-sm d-none"><i class="bi bi-file-medical me-1"></i>Prescription required for Rx items</div>

          <div id="cartItems"><div class="msms-empty"><i class="bi bi-cart-x"></i><p>Cart is empty — add medicines from the left.</p></div></div>

          <hr class="my-3">
          <div class="mb-2">
            <label class="form-label fs-sm fw-600 mb-1">Discount (₹)</label>
            <input type="number" class="form-control form-control-sm" id="discountInput" value="0" min="0" step="1">
          </div>
          <div id="cartSummary"></div>

          <div class="d-grid gap-2 mt-3">
            <button class="btn btn-primary py-2 fw-600" id="checkoutBtn" disabled><i class="bi bi-credit-card-2-front me-1"></i>Proceed to Payment</button>
            <button class="btn btn-outline-secondary btn-sm" id="invoiceBtn" disabled><i class="bi bi-receipt me-1"></i>Generate Invoice</button>
          </div>
        </div>
      </div>
    </div>
  `;

  /* ---- Load inventory + categories + medicines ---- */
  let medList = [];
  Promise.all([API.getInventory(), API.getCategories(), API.getMedicines()]).then(function (res) {
    inventory = res[0].filter((i) => i.qty > 0);
    categories = res[1];
    medList = res[2];

    const catSel = document.getElementById("catFilter");
    categories.forEach((c) => { const o = document.createElement("option"); o.value = c.name; o.textContent = c.name; catSel.appendChild(o); });

    const batches = [...new Set(inventory.map((i) => i.batch))];
    const batchSel = document.getElementById("batchFilter");
    batches.forEach((b) => { const o = document.createElement("option"); o.value = b; o.textContent = b; batchSel.appendChild(o); });

    renderResults();
  });

  /* ---- Search/filter ---- */
  function renderResults() {
    const q = document.getElementById("medSearch").value.toLowerCase();
    const cat = document.getElementById("catFilter").value;
    const batch = document.getElementById("batchFilter").value;

    // Medicine metadata (name -> medicine row) straight from the database
    const medMap = {};
    medList.forEach((m) => medMap[m.name] = m);

    let list = inventory.filter(function (i) {
      const med = medMap[i.medicine];
      if (cat && med && med.category !== cat) return false;
      if (batch && i.batch !== batch) return false;
      if (q && !i.medicine.toLowerCase().includes(q) && !i.batch.toLowerCase().includes(q) && !(med && med.generic && med.generic.toLowerCase().includes(q))) return false;
      return true;
    });

    const container = document.getElementById("medResults");
    if (!list.length) { container.innerHTML = '<div class="msms-empty"><i class="bi bi-search"></i><p>No medicines match your search.</p></div>'; return; }
    container.innerHTML = list.map(function (i) {
      const med = medMap[i.medicine] || {};
      const days = App.daysUntil(i.expiry);
      const expCls = days <= 30 ? "bg-status-critical" : days <= 60 ? "bg-status-warning" : "bg-status-normal";
      return `<div class="medicine-result" data-id="${i.id}">
        <div class="med-icon"><i class="bi bi-capsule"></i></div>
        <div class="med-info">
          <div class="med-name">${i.medicine} ${med.rx ? '<i class="bi bi-file-medical text-danger fs-xs" title="Prescription required"></i>' : ""}</div>
          <div class="med-meta">${med.generic || "—"} · ${med.category || "—"} · Batch ${i.batch} · Exp ${i.expiry} · <span class="badge ${expCls} fs-xs">${days}d</span> · ${i.qty} in stock</div>
        </div>
        <div class="text-end me-2">
          <div class="fw-700">${App.money(i.selling)}</div>
          <button class="btn btn-sm btn-primary add-btn" data-id="${i.id}"><i class="bi bi-plus-lg"></i> Add</button>
        </div>
      </div>`;
    }).join("");

    container.querySelectorAll(".add-btn").forEach(function (btn) {
      btn.addEventListener("click", function (e) { e.stopPropagation(); addToCart(+btn.dataset.id); });
    });
  }

  document.getElementById("medSearch").addEventListener("input", renderResults);
  document.getElementById("catFilter").addEventListener("change", renderResults);
  document.getElementById("batchFilter").addEventListener("change", renderResults);

  /* ---- Cart ---- */
  function addToCart(invId) {
    const item = inventory.find((i) => i.id === invId);
    if (!item) return;
    const existing = cart.find((c) => c.invId === invId);
    if (existing) { if (existing.qty < item.qty) existing.qty++; else { App.toast({ type: "warning", title: "Max stock reached", message: "Only " + item.qty + " units available." }); return; } }
    else cart.push({ invId, name: item.medicine, batch: item.batch, price: item.selling, qty: 1, maxQty: item.qty, rx: !!(medList.find((m) => m.name === item.medicine) || {}).rx });
    renderCart();
  }

  function removeFromCart(invId) { cart = cart.filter((c) => c.invId !== invId); renderCart(); }
  function changeQty(invId, delta) {
    const c = cart.find((c) => c.invId === invId); if (!c) return;
    const nq = c.qty + delta;
    if (nq < 1) { removeFromCart(invId); return; }
    if (nq > c.maxQty) { App.toast({ type: "warning", title: "Max stock reached", message: "Only " + c.maxQty + " units available." }); return; }
    c.qty = nq; renderCart();
  }

  function renderCart() {
    const wrap = document.getElementById("cartItems");
    if (!cart.length) {
      wrap.innerHTML = '<div class="msms-empty"><i class="bi bi-cart-x"></i><p>Cart is empty — add medicines from the left.</p></div>';
      document.getElementById("checkoutBtn").disabled = true;
      document.getElementById("invoiceBtn").disabled = true;
    } else {
      wrap.innerHTML = cart.map(function (c) {
        return `<div class="cart-item">
          <div class="ci-name">${c.name} ${c.rx ? '<i class="bi bi-file-medical text-danger fs-xs"></i>' : ""}<div class="ci-meta">Batch ${c.batch} · ${App.money(c.price)}</div></div>
          <div class="qty-control">
            <button class="dec-btn" data-id="${c.invId}">−</button>
            <input type="text" value="${c.qty}" readonly>
            <button class="inc-btn" data-id="${c.invId}">+</button>
          </div>
          <div class="fw-700 fs-sm">${App.money(c.price * c.qty)}</div>
          <button class="btn btn-sm text-danger p-0 rm-btn" data-id="${c.invId}"><i class="bi bi-x-lg"></i></button>
        </div>`;
      }).join("");
      wrap.querySelectorAll(".inc-btn").forEach((b) => b.addEventListener("click", () => changeQty(+b.dataset.id, 1)));
      wrap.querySelectorAll(".dec-btn").forEach((b) => b.addEventListener("click", () => changeQty(+b.dataset.id, -1)));
      wrap.querySelectorAll(".rm-btn").forEach((b) => b.addEventListener("click", () => removeFromCart(+b.dataset.id)));
      document.getElementById("checkoutBtn").disabled = false;
      document.getElementById("invoiceBtn").disabled = false;
    }

    // Rx indicator
    document.getElementById("rxIndicator").classList.toggle("d-none", !cart.some((c) => c.rx));

    // Summary
    const subtotal = cart.reduce((s, c) => s + c.price * c.qty, 0);
    const discount = +document.getElementById("discountInput").value || 0;
    const taxable = Math.max(0, subtotal - discount);
    const tax = taxable * TAX_RATE;
    const grand = taxable + tax;
    document.getElementById("cartSummary").innerHTML = `
      <div class="cart-summary-row"><span>Subtotal</span><span>${App.money(subtotal)}</span></div>
      <div class="cart-summary-row"><span>Discount</span><span>− ${App.money(discount)}</span></div>
      <div class="cart-summary-row"><span>Tax (5%)</span><span>${App.money(tax)}</span></div>
      <div class="cart-summary-row total"><span>Grand Total</span><span>${App.money(grand)}</span></div>`;
  }

  document.getElementById("discountInput").addEventListener("input", renderCart);
  document.getElementById("clearCartBtn").addEventListener("click", function () {
    if (!cart.length) return;
    cart = []; renderCart(); App.toast({ type: "info", title: "Cart cleared", message: "All items removed." });
  });
  document.getElementById("holdBillBtn").addEventListener("click", function () {
    if (!cart.length) { App.toast({ type: "warning", title: "Nothing to hold", message: "Add items first." }); return; }
    App.toast({ type: "info", title: "Bill held", message: "Held bills can be resumed later (backend will persist)." });
  });
  document.getElementById("draftBtn").addEventListener("click", function () {
    if (!cart.length) { App.toast({ type: "warning", title: "Nothing to save", message: "Add items first." }); return; }
    App.toast({ type: "success", title: "Draft saved", message: "Draft stored locally for now." });
  });

  /* ---- Payment modal ---- */
  let paymentMethod = "Cash";
  document.getElementById("checkoutBtn").addEventListener("click", function () {
    const subtotal = cart.reduce((s, c) => s + c.price * c.qty, 0);
    const discount = +document.getElementById("discountInput").value || 0;
    const tax = Math.max(0, subtotal - discount) * TAX_RATE;
    const grand = Math.max(0, subtotal - discount) + tax;
    document.getElementById("paymentModalBody").innerHTML = `
      <div class="mb-3">
        <label class="form-label fw-600">Payment Method</label>
        <div class="d-flex gap-2 flex-wrap">
          ${["Cash","Card","UPI","Other"].map((m) => `
            <button class="btn ${m===paymentMethod?'btn-primary':'btn-light'} pm-btn" data-m="${m}"><i class="bi ${m==='Cash'?'bi-cash-coin':m==='Card'?'bi-credit-card':m==='UPI'?'bi-qr-code':'bi-three-dots'} me-1"></i>${m}</button>`).join("")}
        </div>
      </div>
      <div class="row g-2 mb-3">
        <div class="col-6"><label class="form-label fs-sm">Amount Payable</label><input class="form-control" value="${App.money(grand)}" readonly></div>
        <div class="col-6" id="receivedWrap"><label class="form-label fs-sm">Amount Received</label><input type="number" class="form-control" id="amtReceived" value="${grand.toFixed(2)}" step="0.01"></div>
      </div>
      <div class="cart-summary-row total"><span>Change</span><span id="changeDue">${App.money(0)}</span></div>`;
    document.querySelectorAll(".pm-btn").forEach((b) => b.addEventListener("click", function () {
      paymentMethod = b.dataset.m;
      document.querySelectorAll(".pm-btn").forEach((x) => x.classList.replace("btn-primary","btn-light"));
      b.classList.replace("btn-light","btn-primary");
      document.getElementById("receivedWrap").style.display = paymentMethod === "Cash" ? "" : "none";
    }));
    document.getElementById("amtReceived").addEventListener("input", function () {
      const change = (+this.value || 0) - grand;
      document.getElementById("changeDue").textContent = App.money(Math.max(0, change));
    });
    new bootstrap.Modal(document.getElementById("paymentModal")).show();
  });

  document.getElementById("confirmPaymentBtn").addEventListener("click", function () {
    const subtotal = cart.reduce((s, c) => s + c.price * c.qty, 0);
    const discount = +document.getElementById("discountInput").value || 0;
    const tax = Math.max(0, subtotal - discount) * TAX_RATE;
    const grand = Math.max(0, subtotal - discount) + tax;
    let invoiceId = "";
    const custName = document.getElementById("custName").value || "Walk-in Customer";

    /* subtotal / discount / tax are stored on the invoice as well, so a
       reprinted bill adds up. The RPC writes them in the same transaction as
       the stock decrements. */
    API.createBill({ customer: custName, items: cart, subtotal: subtotal, discount: discount, tax: tax, total: grand, payment: paymentMethod }).then(function (result) {
      invoiceId = result.invoiceId || ("INV-" + Date.now());
      bootstrap.Modal.getInstance(document.getElementById("paymentModal")).hide();
      document.getElementById("successModalBody").innerHTML = `
        <div style="font-size:3.5rem;color:#198754"><i class="bi bi-check-circle-fill"></i></div>
        <h3 class="mt-2">Payment Successful</h3>
        <p class="text-muted-2">Invoice <strong>${invoiceId}</strong> has been generated.</p>
        <div class="card text-start mb-3" style="background:var(--msms-surface-2)">
          <div class="card-body">
            <div class="cart-summary-row"><span>Customer</span><span>${custName}</span></div>
            <div class="cart-summary-row"><span>Items</span><span>${cart.length}</span></div>
            <div class="cart-summary-row"><span>Payment</span><span>${paymentMethod}</span></div>
            <div class="cart-summary-row total"><span>Total Paid</span><span>${App.money(grand)}</span></div>
          </div>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-primary flex-fill" id="newSaleBtn"><i class="bi bi-bag me-1"></i>New Sale</button>
          <button class="btn btn-light flex-fill" data-bs-dismiss="modal">Close</button>
        </div>`;
      new bootstrap.Modal(document.getElementById("successModal")).show();
      API.getInventory().then(inv => { inventory = inv.filter(i => i.qty > 0); renderResults(); });
      cart = []; document.getElementById("custName").value = ""; document.getElementById("custPhone").value = "";
      document.getElementById("discountInput").value = 0; renderCart();
      document.getElementById("newSaleBtn").addEventListener("click", () => bootstrap.Modal.getInstance(document.getElementById("successModal")).hide());
      App.toast({ type: "success", title: "Sale completed", message: "Invoice " + invoiceId + " generated." });
    }).catch(function (err) {
      /* create_bill() runs in ONE database transaction: when it rejects (e.g.
         "insufficient stock") nothing at all was written - no invoice, no
         stock change - so the cart stays intact for the cashier to fix. */
      const modal = bootstrap.Modal.getInstance(document.getElementById("paymentModal"));
      if (modal) modal.hide();
      App.toast({ type: "error", title: "Payment failed", message: (err && err.message) || "Could not complete the sale." });
    });
  });

  document.getElementById("invoiceBtn").addEventListener("click", function () {
    App.toast({ type: "info", title: "Invoice", message: "Invoice generation will be handled by the backend." });
  });

  renderCart();
});
