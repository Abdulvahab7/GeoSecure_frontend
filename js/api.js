/* ==========================================================================
   api.js — fetch wrapper for the GeoSecure REST API
   Every backend response is wrapped as { success, message, data, code, errors }
   (see dto.response.ApiResponse). This module unwraps that envelope and
   throws a GsApiError on failure so callers can just `await` and catch.
   ========================================================================== */

class GsApiError extends Error {
  constructor(message, code, status, errors) {
    super(message || 'Request failed');
    this.code = code;
    this.status = status;
    this.errors = errors;
  }
}

let gsRefreshInFlight = null;

async function gsRefreshAccessToken() {
  const refreshToken = GsStorage.getRefreshToken();
  if (!refreshToken) throw new GsApiError('No refresh token', 'NO_REFRESH_TOKEN', 401);

  if (!gsRefreshInFlight) {
    gsRefreshInFlight = fetch(`${GS_API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
      .then((res) => res.json())
      .then((body) => {
        if (!body.success) throw new GsApiError(body.message, body.code, 401);
        GsStorage.setAccessToken(body.data.accessToken);
        if (body.data.refreshToken) {
          localStorage.setItem(GS_STORAGE_KEYS.refresh, body.data.refreshToken);
        }
        return body.data.accessToken;
      })
      .finally(() => { gsRefreshInFlight = null; });
  }
  return gsRefreshInFlight;
}

/**
 * @param {string} path e.g. '/api/admin/departments'
 * @param {object} options { method, body, params, isRetry }
 */
async function gsApi(path, options = {}) {
  const { method = 'GET', body, params, isRetry = false } = options;

  let url = `${GS_API_BASE}${path}`;
  if (params) {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
  }

  const headers = { 'Content-Type': 'application/json' };
  const token = GsStorage.getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  // CSRF-awareness (defence-in-depth; see js/security.js for details).
  if (method !== 'GET' && typeof GsSecurity !== 'undefined') {
    Object.assign(headers, GsSecurity.csrfHeaders());
  }

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    throw new GsApiError('Could not reach the server. Check your connection and try again.', 'NETWORK_ERROR', 0);
  }

  // No-content responses (e.g. some 204s) - guard JSON parse
  let payload = null;
  const text = await res.text();
  if (text) {
    try { payload = JSON.parse(text); } catch (e) { payload = null; }
  }

  if (res.status === 401 && !isRetry && GsStorage.getRefreshToken()) {
    try {
      await gsRefreshAccessToken();
      return gsApi(path, { ...options, isRetry: true });
    } catch (e) {
      GsStorage.clear();
      window.location.href = 'session-expired.html';
      throw new GsApiError('Session expired. Please sign in again.', 'SESSION_EXPIRED', 401);
    }
  }

if (res.status === 401) {

    // Don't redirect during login
    if (path === "/api/auth/login") {
        const message =
            (payload && payload.message) ||
            "Invalid email or password";

        throw new GsApiError(
            message,
            payload?.code || "INVALID_CREDENTIALS",
            401,
            payload?.errors
        );
    }

    GsStorage.clear();
    window.location.href = "session-expired.html";

    throw new GsApiError(
        "Session expired. Please sign in again.",
        "SESSION_EXPIRED",
        401
    );
}

  if (!res.ok || !payload || payload.success === false) {
    const message = (payload && payload.message) || `Request failed (${res.status})`;
    throw new GsApiError(message, payload && payload.code, res.status, payload && payload.errors);
  }

  return payload.data;
}

const GsApi = {
  get: (path, params) => gsApi(path, { method: 'GET', params }),
  post: (path, body) => gsApi(path, { method: 'POST', body }),
  put: (path, body) => gsApi(path, { method: 'PUT', body }),
  patch: (path, body) => gsApi(path, { method: 'PATCH', body }),
  delete: (path) => gsApi(path, { method: 'DELETE' }),
};
