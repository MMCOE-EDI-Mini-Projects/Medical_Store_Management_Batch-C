/* ==========================================================================
   CATEGORY MANAGEMENT PAGE
   ========================================================================== */
document.addEventListener("DOMContentLoaded", function () {
  App.init("categories", "Categories");
  const content = document.getElementById("pageContent");
  let categories = [];

  function render() {
    content.innerHTML = `
      ${App.pageHeader("Category Management", "Organise medicines into categories.", `
        <button class="btn btn-primary" id="addCatBtn"><i class="bi bi-plus-lg me-1"></i>Add Category</button>`)}
      ${App.filterBar([{ type: "search", id: "catSearch", label: "Search categories…" }, { type: "select", id: "catStatusFilter", label: "All Status", options: ["Active", "Inactive"] }])}
      <div class="msms-card section-card"><div class="card-body p-0" id="catTable"></div></div>`;

    function renderTable() {
      const q = (document.getElementById("catSearch").value || "").toLowerCase();
      const st = document.getElementById("catStatusFilter").value;
      let filtered = categories.filter(function (c) {
        if (st && c.status !== st) return false;
        if (q && !c.name.toLowerCase().includes(q)) return false;
        return true;
      });
      document.getElementById("catTable").innerHTML = App.table(filtered, [
        { key: "id", label: "ID" },
        { key: "name", label: "Category", render: (r) => `<strong>${r.name}</strong>` },
        { key: "parent", label: "Parent Category" },
        { key: "count", label: "Medicines", render: (r) => `<span class="badge bg-light text-dark border">${r.count}</span>` },
        { key: "status", label: "Status", badge: true },
        { label: "Actions", render: () => `${App.actionBtn("bi-pencil", "edit", "Edit")}${App.actionBtn("bi-x-circle", "deactivate", "Deactivate")}` },
      ], { hover: true });
    }
    renderTable();
    document.getElementById("catSearch").addEventListener("input", renderTable);
    document.getElementById("catStatusFilter").addEventListener("change", renderTable);
    document.getElementById("addCatBtn").addEventListener("click", () => openModal());
  }

  function openModal(edit) {
    const c = edit || {};
    const body = `<form id="catForm">
      <div class="row g-3">
        <div class="col-md-6"><label class="form-label">Category Name *</label><input class="form-control" id="cf_name" value="${c.name || ""}" required></div>
        <div class="col-md-6"><label class="form-label">Parent Category</label><select class="form-select" id="cf_parent"><option>—</option>${categories.map((x) => `<option ${x.name === c.parent ? "selected" : ""}>${x.name}</option>`).join("")}</select></div>
        <div class="col-md-6"><label class="form-label">Status</label><select class="form-select" id="cf_status"><option ${c.status !== "Inactive" ? "selected" : ""}>Active</option><option ${c.status === "Inactive" ? "selected" : ""}>Inactive</option></select></div>
      </div></form>`;
    const footer = `<button class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary" id="saveCatBtn"><i class="bi bi-check-lg me-1"></i>Save</button>`;
    document.getElementById("modalRoot").innerHTML = App.modalHtml("catModal", edit ? "Edit Category" : "Add Category", body, footer);
    new bootstrap.Modal(document.getElementById("catModal")).show();
    document.getElementById("saveCatBtn").addEventListener("click", function () {
      const form = document.getElementById("catForm");
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const data = { name: document.getElementById("cf_name").value, parent: document.getElementById("cf_parent").value, status: document.getElementById("cf_status").value, count: edit ? edit.count : 0 };
      (edit ? API.updateCategory(edit.id, data) : API.createCategory(data)).then(async function () {
        bootstrap.Modal.getInstance(document.getElementById("catModal")).hide();
        App.toast({ type: "success", title: edit ? "Category updated" : "Category added", message: data.name + " saved." });
        categories = await API.getCategories();
        render();
      });
    });
  }

  API.getCategories().then(function (data) {
    categories = data; render();
    document.getElementById("pageContent").addEventListener("click", async function (e) {
      const btn = e.target.closest(".action-btn");
      if (!btn) return;
      const row = btn.closest("tr");
      const name = row.querySelector("td:nth-child(2)").textContent.trim();
      const cat = categories.find((c) => c.name === name);
      if (!cat) return;
      if (btn.classList.contains("edit")) openModal(cat);
      else if (btn.classList.contains("deactivate")) {
        await API.updateCategory(cat.id, { status: "Inactive" });
        categories = await API.getCategories();
        render();
        App.toast({ type: "success", title: "Deactivated", message: name + " marked as inactive." });
      }
    });
  });
});
