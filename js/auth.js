/* ==========================================================================
   AUTH — page guard over the real Supabase session
   ==========================================================================
   API.login() performs the actual sign-in (Supabase Auth); this module only
   caches the returned profile so the guard and the topbar chip can be read
   synchronously, and verifies that the session is still alive on page load.
   ========================================================================== */

const Auth = (function () {
  const KEY_USER = "msms_user";
  const KEY_TOKEN = "msms_token";
  const KEY_REMEMBER = "msms_remember";

  /* API.login() now performs a real Supabase sign-in. The token it returns is
     the Supabase access token, and the user object is a CACHE for the page
     guard and the topbar chip only - the session itself lives in localStorage
     under "msms_supabase_auth" (see js/supabase-client.js).

     The cache is always written to localStorage so every page can read it
     synchronously; "Remember me" is recorded for the account menu. */
  function login(credentials) {
    return API.login(credentials).then((res) => {
      if (!res || !res.success) throw new Error("Login failed");
      localStorage.setItem(KEY_TOKEN, res.token || "supabase-session");
      localStorage.setItem(KEY_USER, JSON.stringify(res.user));
      if (credentials.remember) localStorage.setItem(KEY_REMEMBER, "1");
      else localStorage.removeItem(KEY_REMEMBER);
      return res.user;
    });
  }

  function logout() {
    localStorage.removeItem(KEY_TOKEN);
    localStorage.removeItem(KEY_USER);
    localStorage.removeItem(KEY_REMEMBER);
    sessionStorage.removeItem(KEY_USER);
    return API.logout().catch(() => {});
  }

  function currentUser() {
    return JSON.parse(localStorage.getItem(KEY_USER) || sessionStorage.getItem(KEY_USER) || "null");
  }

  function isLoggedIn() {
    return !!currentUser() && !!localStorage.getItem(KEY_TOKEN);
  }

  /* Where the login form lives, from either index.html or pages/*.html */
  function loginUrl() {
    return /\/pages\//i.test(window.location.pathname) ? "../index.html" : "index.html";
  }

  function requireAuth() {
    if (!isLoggedIn()) {
      window.location.href = loginUrl();
      return false;
    }
    return true;
  }

  /* The cached user only says "this browser signed in earlier"; only Supabase
     can say whether that session is still valid. The shell calls this right
     after the guard, so an expired or revoked session returns to the login form
     instead of leaving every table mysteriously empty. */
  async function verify() {
    const s = (typeof window !== "undefined") ? window.SB : null;
    if (!s) return true;
    try {
      const res = await s.init();
      const session = (res && res.session) || s.session();
      if (!session) {
        await logout();
        window.location.href = loginUrl();
        return false;
      }
      const profile = await s.profile();
      if (profile) {
        localStorage.setItem(KEY_USER, JSON.stringify({
          id: profile.id, name: profile.name, email: profile.email,
          role: profile.role, avatar: profile.avatar
        }));
      }
      return true;
    } catch (e) {
      return true; /* offline: keep the cached view instead of throwing the user out */
    }
  }

  /* Role helpers */
  function hasRole(roles) {
    const u = currentUser();
    if (!u) return false;
    if (!roles) return true;
    return roles.includes(u.role);
  }

  return { login, logout, currentUser, isLoggedIn, requireAuth, verify, hasRole, loginUrl };
})();

window.Auth = Auth;
