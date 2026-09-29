document.addEventListener("DOMContentLoaded",function(){
 App.init("settings","Settings");const c=document.getElementById("pageContent");const u=Auth.currentUser();
 c.innerHTML=App.pageHeader("Settings","Manage your profile and application preferences.")
 +`<div class="row g-3"><div class="col-lg-7"><div class="msms-card section-card"><div class="card-header"><i class="bi bi-person text-primary"></i>Profile</div><div class="card-body"><form id="profile"><div class="row g-3">
 <div class="col-md-6"><label class="form-label">Full Name</label><input class="form-control" id="name" value="${u.name}"></div><div class="col-md-6"><label class="form-label">Email</label><input class="form-control" value="${u.email}" readonly></div>
 <div class="col-md-6"><label class="form-label">Role</label><input class="form-control" value="${u.role}" readonly></div><div class="col-md-6"><label class="form-label">Phone</label><input class="form-control" id="phone" value="${u.phone||""}"></div>
 </div><button class="btn btn-primary mt-3" id="save">Save Changes</button></form></div></div></div>
 <div class="col-lg-5"><div class="msms-card section-card"><div class="card-header"><i class="bi bi-sliders text-primary"></i>Preferences</div><div class="card-body">
 <div class="form-check form-switch mb-3"><input class="form-check-input" type="checkbox" id="dark"><label class="form-check-label" for="dark">Dark theme</label></div>
 <div class="mb-3"><label class="form-label">Store Name</label><input class="form-control" id="store" value="MediStore MS"></div>
 <button class="btn btn-outline-primary" id="savePref">Save Preferences</button>
 </div></div></div></div>`;
  const dark = document.getElementById("dark");
  const store = document.getElementById("store");
  const profile = document.getElementById("profile");
  const savePref = document.getElementById("savePref");

  dark.checked = localStorage.getItem("msms_theme") === "dark";
  dark.onchange = () => App.applyTheme(dark.checked ? "dark" : "light");

  profile.onsubmit = async (e) => {
    e.preventDefault();
    const nameVal = document.getElementById("name").value;
    const phoneVal = document.getElementById("phone").value;
    const data = {
      name: nameVal,
      phone: phoneVal,
      avatar: nameVal.split(" ").map(x => x[0]).slice(0, 2).join("").toUpperCase()
    };
    if (u.id) await API.updateUser(u.id, data);
    const nu = { ...u, ...data };
    localStorage.setItem("msms_user", JSON.stringify(nu));
    App.toast({ type: "success", title: "Profile saved", message: "Your changes were saved." });
  };

  savePref.onclick = () => {
    localStorage.setItem("msms_store_name", store.value);
    App.toast({ type: "success", title: "Preferences saved", message: "Store preferences updated." });
  };
});