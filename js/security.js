/* ==========================================================================
   security.js — GsSecurity: shared Security & Performance-phase helpers
   Additive, opt-in module. Does not replace GsAuth/GsApi/GsStorage; it wraps
   and extends them. Loaded after storage.js/api.js/auth.js and before the
   page-level controller script on every protected page.

   Responsibilities:
   - Decode/inspect the JWT access token (expiry only; no signature check,
     that's the backend's job) so the UI can react before a 401 round-trip.
   - Auto-logout after inactivity, with a warning countdown modal.
   - Proactively refresh the access token shortly before it expires, reusing
     GsApi's existing single-flight refresh.
   - requirePermission()/guardRoute() — a thin, friendlier wrapper around
     GsAuth.requireRole/requireAnyRole with consistent redirect targets
     (access-denied.html / login.html / session-expired.html).
   - Friendlier auth-error → message mapping.
   - CSRF awareness: attaches an X-Requested-With header (defence-in-depth
     against simple CSRF on any cookie-based deployment) and reads a
     <meta name="csrf-token"> if the backend ever adds one.
   - guardSubmit()/withSubmitLock() — prevents duplicate form submissions by
     disabling the trigger control for the duration of the async handler.
   ========================================================================== */

const GsSecurity = (function () {
  // ---- Config ---------------------------------------------------------------------------
  const INACTIVITY_LIMIT_MS = 15 * 60 * 1000;   // auto-logout after 15 min idle
  const INACTIVITY_WARNING_MS = 60 * 1000;      // warn 60s before logout
  const PROACTIVE_REFRESH_SKEW_MS = 30 * 1000;  // refresh 30s before token expiry
  const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];

  let inactivityTimer = null;
  let warningTimer = null;
  let refreshTimer = null;
  let warningModalEl = null;
  let activityBound = false;

  // ---- JWT helpers ------------------------------------------------------------------------
  /** Decodes a JWT payload without verifying the signature (display/UX only). */
  function decodeJwt(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
      return JSON.parse(atob(padded));
    } catch (e) {
      return null;
    }
  }

  function getTokenExpiryMs(token) {
    const payload = decodeJwt(token);
    if (!payload || !payload.exp) return null;
    return payload.exp * 1000;
  }

  function isTokenExpired(token) {
    const expMs = getTokenExpiryMs(token);
    if (expMs === null) return false; // unknown shape — let the backend be the source of truth
    return Date.now() >= expMs;
  }

  // ---- Proactive refresh --------------------------------------------------------------
  function scheduleProactiveRefresh() {
    clearTimeout(refreshTimer);
    const token = GsStorage.getAccessToken();
    const expMs = getTokenExpiryMs(token);
    if (!expMs) return;

    const delay = expMs - Date.now() - PROACTIVE_REFRESH_SKEW_MS;
    if (delay <= 0) return; // already at/near expiry — the next API call's 401 path handles it

    refreshTimer = setTimeout(async () => {
      if (!GsStorage.getRefreshToken()) return;
      try {
        if (typeof gsRefreshAccessToken === 'function') {
          await gsRefreshAccessToken();
        }
      } catch (e) {
        // Silent — the next real request will surface the session-expired flow.
      } finally {
        scheduleProactiveRefresh();
      }
    }, delay);
  }

  // ---- Inactivity auto-logout ------------------------------------------------------------
  function buildWarningModal() {
    if (warningModalEl) return warningModalEl;
    warningModalEl = document.createElement('div');
    warningModalEl.id = 'gs-session-warning-modal';
    warningModalEl.className = 'modal fade';
    warningModalEl.tabIndex = -1;
    warningModalEl.setAttribute('data-bs-backdrop', 'static');
    warningModalEl.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="bi bi-clock-history me-2"></i>Still there?</h5>
          </div>
          <div class="modal-body">
            <p class="mb-1">You've been inactive for a while. For your security, you'll be
              signed out in <strong id="gs-session-warning-secs">60</strong>s.</p>
            <p class="small gs-muted mb-0">Click "Stay signed in" to continue your session.</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-gs-primary" id="gs-session-stay-btn">Stay signed in</button>
            <button type="button" class="btn btn-light" id="gs-session-logout-btn">Sign out now</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(warningModalEl);
    warningModalEl.querySelector('#gs-session-logout-btn').addEventListener('click', () => {
      GsAuth.logout();
    });
    warningModalEl.querySelector('#gs-session-stay-btn').addEventListener('click', () => {
      const modal = bootstrap.Modal.getOrCreateInstance(warningModalEl);
      modal.hide();
      resetInactivityTimer();
    });
    return warningModalEl;
  }

  function showInactivityWarning() {
    const el = buildWarningModal();
    let secsLeft = Math.round(INACTIVITY_WARNING_MS / 1000);
    const secsEl = el.querySelector('#gs-session-warning-secs');
    secsEl.textContent = String(secsLeft);
    const tick = setInterval(() => {
      secsLeft -= 1;
      if (secsLeft <= 0) { clearInterval(tick); return; }
      secsEl.textContent = String(secsLeft);
    }, 1000);
    el.addEventListener('hidden.bs.modal', () => clearInterval(tick), { once: true });
    bootstrap.Modal.getOrCreateInstance(el).show();
  }

  function hideInactivityWarning() {
    if (!warningModalEl) return;
    const inst = bootstrap.Modal.getInstance(warningModalEl);
    if (inst) inst.hide();
  }

  function triggerAutoLogout() {
    hideInactivityWarning();
    GsStorage.clear();
    window.location.href = 'session-expired.html';
  }

  function resetInactivityTimer() {
    hideInactivityWarning();
    clearTimeout(inactivityTimer);
    clearTimeout(warningTimer);
    if (!GsStorage.isLoggedIn()) return;
    warningTimer = setTimeout(showInactivityWarning, INACTIVITY_LIMIT_MS - INACTIVITY_WARNING_MS);
    inactivityTimer = setTimeout(triggerAutoLogout, INACTIVITY_LIMIT_MS);
  }

  function bindActivityListeners() {
    if (activityBound) return;
    activityBound = true;
    const onActivity = GsPerf ? GsPerf.throttle(resetInactivityTimer, 1000) : resetInactivityTimer;
    ACTIVITY_EVENTS.forEach((evt) => document.addEventListener(evt, onActivity, { passive: true }));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && GsStorage.isLoggedIn()) {
        if (isTokenExpired(GsStorage.getAccessToken()) && !GsStorage.getRefreshToken()) {
          triggerAutoLogout();
        }
      }
    });
  }

  // ---- Route / permission guarding -------------------------------------------------------
  /**
   * Friendlier wrapper over GsAuth.requireRole/requireAnyRole:
   * - Sends users with the wrong role to access-denied.html instead of
   *   silently bouncing them to their own dashboard, so they get a clear
   *   message rather than an unexplained redirect.
   * - Starts the inactivity/auto-refresh watchers once a valid session is
   *   confirmed.
   */
  function guardRoute(roleOrRoles) {
    const user = GsStorage.getUser();
    const loggedIn = GsStorage.isLoggedIn();

    if (!loggedIn || !user) {
      window.location.href = 'login.html';
      return null;
    }

    if (isTokenExpired(GsStorage.getAccessToken()) && !GsStorage.getRefreshToken()) {
      GsStorage.clear();
      window.location.href = 'session-expired.html';
      return null;
    }

    if (roleOrRoles) {
      const allowed = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles];
      if (!allowed.includes(user.role)) {
        window.location.href = 'access-denied.html';
        return null;
      }
    }

    init();
    return user;
  }

  /** Call once on any protected page to start the session watchers. Safe to call multiple times. */
  function init() {
    bindActivityListeners();
    resetInactivityTimer();
    scheduleProactiveRefresh();
  }

  // ---- Auth error mapping ---------------------------------------------------------------
  function friendlyAuthError(err) {
    const code = err && err.code;
    const status = err && err.status;
    if (code === 'SESSION_EXPIRED' || status === 401) {
      return 'Your session has expired. Please sign in again.';
    }
    if (status === 403 || code === 'ACCESS_DENIED') {
      return "You don't have permission to do that.";
    }
    if (code === 'NETWORK_ERROR' || status === 0) {
      return 'Could not reach the server. Check your connection and try again.';
    }
    return (typeof GsUtil !== 'undefined' && GsUtil.apiErrorMessage) ? GsUtil.apiErrorMessage(err) : (err && err.message) || 'Something went wrong.';
  }

  /** Convenience: handle an auth-flavored error consistently (toast + redirect where needed). */
  function handleAuthError(err) {
    const status = err && err.status;
    if (status === 401) {
      GsStorage.clear();
      window.location.href = 'session-expired.html';
      return;
    }
    if (status === 403) {
      if (typeof GsUtil !== 'undefined') GsUtil.toast(friendlyAuthError(err), 'danger');
      return;
    }
    if (typeof GsUtil !== 'undefined') GsUtil.toast(friendlyAuthError(err), 'danger');
  }

  // ---- CSRF awareness ---------------------------------------------------------------------
  /** Reads an optional <meta name="csrf-token" content="..."> if the backend ever adds one. */
  function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : null;
  }

  /** Extra headers every state-changing request should carry: X-Requested-With
   *  (defence-in-depth against simple/legacy CSRF) plus a CSRF token if present.
   *  This system uses stateless Bearer-JWT auth (no cookies), which is inherently
   *  not CSRF-vulnerable in the classic sense, but these headers are cheap
   *  insurance if the deployment ever adds cookie-based auth. */
  function csrfHeaders() {
    const headers = { 'X-Requested-With': 'XMLHttpRequest' };
    const token = getCsrfToken();
    if (token) headers['X-CSRF-Token'] = token;
    return headers;
  }

  // ---- Duplicate-submission guard --------------------------------------------------------
  /**
   * Wraps a form's submit handler so a second click/Enter while the first
   * submission is still in flight is ignored, and the trigger button is
   * disabled + shows a busy label meanwhile.
   *   GsSecurity.guardSubmit(form, async (e) => { ... }, { busyText: 'Saving…' })
   */
  function guardSubmit(form, handler, opts = {}) {
    if (!form) return;
    const { busyText = 'Please wait…' } = opts;
    let inFlight = false;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (inFlight) return;
      const btn = form.querySelector('[type="submit"]');
      const originalHtml = btn ? btn.innerHTML : null;
      inFlight = true;
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${GsUtil ? GsUtil.escapeHtml(busyText) : busyText}`;
      }
      try {
        await handler(e);
      } finally {
        inFlight = false;
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = originalHtml;
        }
      }
    });
  }

  /** Generic guard for any async button click (not just forms), e.g. "Generate QR",
   *  "End session" — disables the button for the duration of the click handler. */
  function guardClick(button, handler) {
    if (!button) return;
    let inFlight = false;
    button.addEventListener('click', async (...args) => {
      if (inFlight) return;
      inFlight = true;
      button.disabled = true;
      try {
        await handler(...args);
      } finally {
        inFlight = false;
        button.disabled = false;
      }
    });
  }

  return {
    decodeJwt, getTokenExpiryMs, isTokenExpired,
    scheduleProactiveRefresh, resetInactivityTimer, init, guardRoute,
    friendlyAuthError, handleAuthError,
    getCsrfToken, csrfHeaders,
    guardSubmit, guardClick,
  };
})();
