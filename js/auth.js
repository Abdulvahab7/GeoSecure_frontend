/* ==========================================================================
   auth.js — login/logout + per-page role guard
   ========================================================================== */

const GsAuth = {
  async login(email, password) {
    const data = await GsApi.post('/api/auth/login', { email, password });
    GsStorage.setSession(data.accessToken, data.refreshToken, data.user);
    if (typeof GsSecurity !== 'undefined') GsSecurity.init();
    return data.user;
  },

  logout() {
    GsStorage.clear();
    window.location.href = 'login.html';
  },

  /** Call at the top of every protected page. Redirects if not logged in
   *  or logged in as the wrong role. Returns the current user.
   *  Delegates to GsSecurity.guardRoute() when available, which adds JWT
   *  expiry checks, an access-denied redirect for the wrong role (instead
   *  of a silent bounce), and starts the inactivity/auto-refresh watchers.
   *  Falls back to the original plain-redirect behavior if security.js
   *  isn't loaded on a given page. */
  requireRole(role) {
    if (typeof GsSecurity !== 'undefined') return GsSecurity.guardRoute(role);
    const user = GsStorage.getUser();
    if (!GsStorage.isLoggedIn() || !user) {
      window.location.href = 'login.html';
      return null;
    }
    if (role && user.role !== role) {
      window.location.href = GS_DASHBOARD_BY_ROLE[user.role] || 'login.html';
      return null;
    }
    return user;
  },

  /** For pages any authenticated role can see (notifications, QR scan/generate). */
  requireAnyRole() {
    if (typeof GsSecurity !== 'undefined') return GsSecurity.guardRoute(null);
    const user = GsStorage.getUser();
    if (!GsStorage.isLoggedIn() || !user) {
      window.location.href = 'login.html';
      return null;
    }
    return user;
  },

  redirectToDashboard() {
    const user = GsStorage.getUser();
    window.location.href = (user && GS_DASHBOARD_BY_ROLE[user.role]) || 'login.html';
  },
};
