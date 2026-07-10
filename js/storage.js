/* ==========================================================================
   storage.js — thin wrapper around localStorage for auth state
   ========================================================================== */

const GsStorage = {
  getAccessToken() { return localStorage.getItem(GS_STORAGE_KEYS.access); },
  getRefreshToken() { return localStorage.getItem(GS_STORAGE_KEYS.refresh); },
  getUser() {
    const raw = localStorage.getItem(GS_STORAGE_KEYS.user);
    return raw ? JSON.parse(raw) : null;
  },
  setSession(accessToken, refreshToken, user) {
    localStorage.setItem(GS_STORAGE_KEYS.access, accessToken);
    localStorage.setItem(GS_STORAGE_KEYS.refresh, refreshToken);
    localStorage.setItem(GS_STORAGE_KEYS.user, JSON.stringify(user));
  },
  setAccessToken(token) { localStorage.setItem(GS_STORAGE_KEYS.access, token); },
  setUser(user) { localStorage.setItem(GS_STORAGE_KEYS.user, JSON.stringify(user)); },
  clear() {
    localStorage.removeItem(GS_STORAGE_KEYS.access);
    localStorage.removeItem(GS_STORAGE_KEYS.refresh);
    localStorage.removeItem(GS_STORAGE_KEYS.user);
  },
  isLoggedIn() { return !!this.getAccessToken() && !!this.getUser(); },
};
