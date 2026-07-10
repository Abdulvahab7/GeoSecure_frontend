/* ==========================================================================
   config.js — global constants
   In the GeoSecure/ project layout, backend/ and frontend/ are independent
   projects served separately (backend on Spring Boot, frontend via any
   static file server), so API calls use an absolute backend origin rather
   than a same-origin relative path. Update GS_API_BASE if you deploy the
   backend somewhere other than http://localhost:8081, and make sure that
   origin is present in geosecure.cors.allowed-origins in
   backend/src/main/resources/application.properties.
   ========================================================================== */

const GS_API_BASE = 'https://geosecure-backend-7p23.onrender.com/api'; // backend origin (frontend is served separately)
const GS_QR_EXPIRY_FALLBACK_SEC = 50; // mirrors geosecure.qr.expiry-seconds default
const GS_DEFAULTER_THRESHOLD = 75;    // mirrors geosecure.attendance.defaulter-threshold default

const GS_STORAGE_KEYS = {
  access: 'gs_access_token',
  refresh: 'gs_refresh_token',
  user: 'gs_user',
};

const GS_DASHBOARD_BY_ROLE = {
  ADMIN: 'admin-dashboard.html',
  FACULTY: 'faculty-dashboard.html',
  STUDENT: 'student-dashboard.html',
};
