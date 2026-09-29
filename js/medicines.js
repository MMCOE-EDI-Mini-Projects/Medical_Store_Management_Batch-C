/* ==========================================================================
   MEDICINE MANAGEMENT PAGE
   ========================================================================== */
document.addEventListener("DOMContentLoaded", function () {
  App.init("medicines", "Medicines");
  const content = document.getElementById("pageContent");
  let medicines = [], categories = [];

  function render() {
    const catNames = categories.map((c) => c.name);
    content.innerHTML = `
      ${App.pageHeader("Medicine Management", "View, add, and manage the medicine catalogue.", `
        <button class="btn btn-light"><i class="bi bi-download me-1"></i>Export</button>
        <button class="btn btn-primary" id="addMedBtn"><i class="bi bi-plus-lg me-1"></i>Add Medicine</button>`)}
      ${App.filterBar([
        { type: "search", id: "medSearch", label: "Search medicines…" },
        { type: "select", id: "medCatFilter", label: "All Categories", options: catNames },
        { type: "select", id: "medStatusFilter", label: "All Status", options: ["Active", "Inactive"] },
      ])}
      <div class="msms-card section-card"><div class="card-body p-0" id="medTable"></div></div>`;

    function renderTable() {
      const q = (document.getElementById("medSearch").value || "").toLowerCase();
      const cat = document.getElementById("medCatFilter").value;
      const st = document.getElementById("medStatusFilter").value;
      let filtered = medicines.filter(function (m) {
        if (cat && m.category !== cat) return false;
        if (st && m.status !== st) return false;
        if (q && !m.name.toLowerCase().includes(q) && !m.generic.toLowerCase().includes(q) && !m.id.toLowerCase().includes(q)) return false;
        return true;
      });
      document.getElementById("medTable").innerHTML = App.table(filtered, [
        { key: "id", label: "Med ID" },
        { key: "name", label: "Medicine", render: (r) => `<strong>${r.name}</strong>${r.rx ? ' <i class="bi bi-file-medical text-danger fs-xs" title="Rx"></i>' : ""}` },
        { key: "generic", label: "Generic Name" },
        { key: "category", label: "Category" },
        { key: "manufacturer", label: "Manufacturer" },
        { key: "reorder", label: "Reorder Level" },
        { key: "status", label: "Status", badge: true },
        { label: "Actions", render: () => `${App.actionBtn("bi-eye", "view", "View")}${App.actionBtn("bi-pencil", "edit", "Edit")}${App.actionBtn("bi-x-circle", "deactivate", "Deactivate")}` },
      ], { hover: true });
    }

    renderTable();
    document.getElementById("medSearch").addEventListener("input", renderTable);
    document.getElementById("medCatFilter").addEventListener("change", renderTable);
    document.getElementById("medStatusFilter").addEventListener("change", renderTable);
    document.getElementById("addMedBtn").addEventListener("click", () => openModal());
  }

  function openModal(edit) {
    const m = edit || {};
    const body = `
      <form id="medForm">
        <div class="row g-3">
          <div class="col-md-6"><label class="form-label">Medicine Name *</label><input class="form-control" id="mf_name" value="${m.name || ""}" required></div>
          <div class="col-md-6"><label class="form-label">Generic Name *</label><input class="form-control" id="mf_generic" value="${m.generic || ""}" required></div>
          <div class="col-md-6"><label class="form-label">Category *</label><select class="form-select" id="mf_category" required>${categories.map((c) => `<option ${c.name === m.category ? "selected" : ""}>${c.name}</option>`).join("")}</select></div>
          <div class="col-md-6"><label class="form-label">Manufacturer</label><input class="form-control" id="mf_manuf" value="${m.manufacturer || ""}"></div>
          <div class="col-md-6"><label class="form-label">Reorder Level</label><input type="number" class="form-control" id="mf_reorder" value="${m.reorder || 50}"></div>
          <div class="col-md-6"><label class="form-label">Status</label><select class="form-select" id="mf_status"><option ${m.status !== "Inactive" ? "selected" : ""}>Active</option><option ${m.status === "Inactive" ? "selected" : ""}>Inactive</option></select></div>
          <div class="col-12"><label class="form-label">Description</label><textarea class="form-control" id="mf_desc" rows="2">${m.desc || ""}</textarea></div>
          <div class="col-12"><div class="form-check"><input class="form-check-input" type="checkbox" id="mf_rx" ${m.rx ? "checked" : ""}><label class="form-check-label" for="mf_rx">Prescription required (Rx)</label></div></div>
        </div>
      </form>`;
    const footer = `<button class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary" id="saveMedBtn"><i class="bi bi-check-lg me-1"></i>Save</button>`;
    document.getElementById("modalRoot").innerHTML = App.modalHtml("medModal", edit ? "Edit Medicine" : "Add Medicine", body, footer);
    new bootstrap.Modal(document.getElementById("medModal")).show();
    document.getElementById("saveMedBtn").addEventListener("click", function () {
      const form = document.getElementById("medForm");
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const data = {
        name: document.getElementById("mf_name").value, generic: document.getElementById("mf_generic").value,
        category: document.getElementById("mf_category").value, manufacturer: document.getElementById("mf_manuf").value,
        reorder: +document.getElementById("mf_reorder").value, status: document.getElementById("mf_status").value,
        rx: document.getElementById("mf_rx").checked,
      };
      const fn = edit ? API.updateMedicine(edit.id, data) : API.createMedicine(data);
      fn.then(async function () {
        bootstrap.Modal.getInstance(document.getElementById("medModal")).hide();
        App.toast({ type: "success", title: edit ? "Medicine updated" : "Medicine added", message: data.name + " has been saved." });
        medicines = await API.getMedicines();
        render();
      });
    });
  }

  Promise.all([API.getMedicines(), API.getCategories()]).then(function (res) {
    medicines = res[0]; categories = res[1]; render();
    // Wire up action buttons (delegated)
    document.getElementById("pageContent").addEventListener("click", async function (e) {
      const btn = e.target.closest(".action-btn");
      if (!btn) return;
      const row = btn.closest("tr");
      const id = row.querySelector("td").textContent;
      const med = medicines.find((m) => m.id === id);
      if (!med) return;
      if (btn.classList.contains("edit")) openModal(med);
      else if (btn.classList.contains("deactivate")) {
        await API.deactivateMedicine(med.id);
        medicines = await API.getMedicines();
        render();
        App.toast({ type: "success", title: "Deactivated", message: med.name + " marked as inactive." });
      } else if (btn.classList.contains("view")) {
        App.toast({ type: "info", title: med.name, message: "Generic: " + med.generic + " · Category: " + med.category });
      }
    });
  });
});
