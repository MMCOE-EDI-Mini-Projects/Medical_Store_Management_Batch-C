/* ==========================================================================
   LOGIN PAGE — Frontend mock authentication
   ========================================================================== */
(function () {
  // Already signed in? Confirm the Supabase session is still alive, then go on.
  // (verify() sends us back to this form itself when the session has expired.)
  if (Auth.isLoggedIn()) {
    Auth.verify().then((ok) => { if (ok) window.location.href = "pages/dashboard.html"; });
    return;
  }

  let selectedRole = "Pharmacist";
  const demoEmails = {
    Admin: "aisha@medstore.com",
    "Store Manager": "rahul@medstore.com",
    Pharmacist: "sneha@medstore.com"
  };

  /* Role pill selection */
  document.querySelectorAll("#roleGrid .role-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      document.querySelectorAll("#roleGrid .role-pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      selectedRole = pill.dataset.role;
      // Pre-fill email for convenience in demo
      const emailField = document.getElementById("loginEmail");
      if (!emailField.value) {
        emailField.value = demoEmails[selectedRole] || `${selectedRole.toLowerCase().replace(/[^a-z]/g, "")}@medstore.com`;
      }
    });
  });
  document.querySelector("#roleGrid .role-pill").click();

  /* Show / hide password */
  document.getElementById("togglePw").addEventListener("click", () => {
    const pw = document.getElementById("loginPassword");
    const icon = document.querySelector("#togglePw i");
    if (pw.type === "password") { pw.type = "text"; icon.className = "bi bi-eye-slash"; }
    else { pw.type = "password"; icon.className = "bi bi-eye"; }
  });

  /* Alert helper */
  function showAlert(type, msg) {
    const el = document.getElementById("loginAlert");
    const cls = type === "error" ? "danger" : type === "success" ? "success" : "info";
    el.innerHTML = `<div class="alert alert-${cls} py-2 small mb-3"><i class="bi ${type === "error" ? "bi-exclamation-circle" : "bi-check-circle"} me-1"></i>${msg}</div>`;
  }

  /* Forgot password — resets are owned by Supabase Auth, not by this page */
  document.getElementById("forgotPw").addEventListener("click", (e) => {
    e.preventDefault();
    showAlert("info", "Ask an administrator to send a password reset from the Supabase dashboard (Authentication → Users).");
  });

  /* Submit */
  document.getElementById("loginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    const remember = document.getElementById("rememberMe").checked;
    const btn = document.getElementById("loginBtn");

    if (!email || !password) { showAlert("error", "Please enter both email and password."); return; }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Signing in…';

    Auth.login({ email, password, role: selectedRole, remember })
      .then(() => {
        showAlert("success", "Login successful! Redirecting to dashboard…");
        setTimeout(() => { window.location.href = "pages/dashboard.html"; }, 600);
      })
      .catch((err) => {
        // API.login() reports the real reason: wrong password, inactive account,
        // or a role card that does not match the account being signed into.
        showAlert("error", (err && err.message) ? err.message : "Unable to sign in. Please check your credentials.");
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-box-arrow-in-right me-1"></i> Sign In';
      });
  });
})();
