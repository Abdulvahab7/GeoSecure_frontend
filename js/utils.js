/* ==========================================================================
   utils.js — toasts, spinner overlay, formatters, confirm dialog
   ========================================================================== */

const GsUtil = {
  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  formatDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  },

  formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
  },

  formatTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleTimeString(undefined, { timeStyle: 'short' });
  },

  timeAgo(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diffSec < 60) return 'just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  },

  statusBadge(status) {
    const s = (status || '').toLowerCase();
    const cls = s === 'present' ? 'badge-present' : s === 'late' ? 'badge-late' : 'badge-absent';
    return `<span class="badge-status ${cls}">${GsUtil.escapeHtml(status || '—')}</span>`;
  },

  pct(value) {
    if (value === null || value === undefined || isNaN(value)) return '—';
    return `${Number(value).toFixed(1)}%`;
  },

  debounce(fn, wait = 300) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  },

  showSpinner() { document.getElementById('gs-spinner-overlay')?.classList.add('show'); },
  hideSpinner() { document.getElementById('gs-spinner-overlay')?.classList.remove('show'); },

  toast(message, type = 'success') {
    const stack = document.getElementById('gs-toast-stack');
    if (!stack) { alert(message); return; }
    const icon = type === 'success' ? 'bi-check-circle-fill'
      : type === 'danger' ? 'bi-exclamation-octagon-fill'
      : type === 'warning' ? 'bi-exclamation-triangle-fill'
      : 'bi-info-circle-fill';
    const el = document.createElement('div');
    el.className = `toast align-items-center text-bg-${type === 'danger' ? 'danger' : type === 'warning' ? 'warning' : type === 'info' ? 'secondary' : 'success'} border-0 show`;
    el.setAttribute('role', 'alert');
    el.innerHTML = `
      <div class="d-flex">
        <div class="toast-body"><i class="bi ${icon} me-2"></i>${GsUtil.escapeHtml(message)}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" aria-label="Close"></button>
      </div>`;
    el.querySelector('.btn-close').addEventListener('click', () => el.remove());
    stack.appendChild(el);
    setTimeout(() => el.remove(), 5000);
  },

  apiErrorMessage(err) {
    if (err && err.errors && typeof err.errors === 'object') {
      const parts = Object.values(err.errors);
      if (parts.length) return parts.join(' ');
    }
    return (err && err.message) || 'Something went wrong.';
  },

  /**
   * Promise-based confirm dialog. Deliberately NOT implemented as a
   * Bootstrap Modal: confirm() is routinely invoked from delete buttons
   * that live *inside* an already-open Bootstrap modal (e.g. the
   * timetable cell editor). Bootstrap 5 does not support stacking two
   * real Modal instances — each instance's hide() independently strips
   * `body.modal-open` and removes only its own backdrop, with no
   * awareness of the other modal still being open, which is exactly what
   * was leaving an orphaned `.modal-backdrop` (covering the whole
   * viewport, blocking every click) behind whenever a confirm dialog was
   * closed on top of another open modal. Using a plain, self-contained
   * overlay here — with its own backdrop element and no interaction with
   * Bootstrap's modal bookkeeping at all — means there is never more than
   * one real Bootstrap Modal instance in play, so that failure mode can't
   * happen, regardless of what it's opened on top of.
   */
  confirm({ title = 'Are you sure?', body = '', confirmText = 'Confirm', danger = false } = {}) {
    return new Promise((resolve) => {
      // Always build fresh and fully remove on close, rather than reusing
      // a single hidden instance — there's no Bootstrap Modal object here
      // whose lifecycle needs preserving, so "created once" would only add
      // stale-DOM risk for no benefit.
      document.getElementById('gs-confirm-overlay')?.remove();

      const overlay = document.createElement('div');
      overlay.id = 'gs-confirm-overlay';
      overlay.className = 'gs-confirm-overlay';
      overlay.innerHTML = `
        <div class="gs-confirm-box" role="alertdialog" aria-modal="true" aria-labelledby="gs-confirm-title" tabindex="-1">
          <h5 id="gs-confirm-title" class="gs-confirm-title"></h5>
          <div class="gs-confirm-body"></div>
          <div class="gs-confirm-actions">
            <button type="button" class="btn btn-light" data-action="cancel">Cancel</button>
            <button type="button" class="btn" data-action="ok"></button>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      overlay.querySelector('#gs-confirm-title').textContent = title;
      overlay.querySelector('.gs-confirm-body').textContent = body;
      const okBtn = overlay.querySelector('[data-action="ok"]');
      okBtn.textContent = confirmText;
      okBtn.className = `btn ${danger ? 'btn-danger' : 'btn-gs-primary'}`;
      const cancelBtn = overlay.querySelector('[data-action="cancel"]');

      const close = (result) => {
        document.removeEventListener('keydown', onKeydown);
        overlay.remove();
        resolve(result);
      };
      const onKeydown = (e) => {
        if (e.key === 'Escape') close(false);
        // Simple focus trap between the two buttons.
        if (e.key === 'Tab') {
          e.preventDefault();
          (document.activeElement === okBtn ? cancelBtn : okBtn).focus();
        }
      };

      okBtn.addEventListener('click', () => close(true));
      cancelBtn.addEventListener('click', () => close(false));
      overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(false); });
      document.addEventListener('keydown', onKeydown);
      okBtn.focus();
    });
  },

  getGeolocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by this browser.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        (err) => reject(new Error(`Location access failed: ${err.message}`)),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      );
    });
  },
};
