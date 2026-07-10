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

  /** Promise-based confirm using a Bootstrap modal instead of window.confirm. */
  confirm({ title = 'Are you sure?', body = '', confirmText = 'Confirm', danger = false } = {}) {
    return new Promise((resolve) => {
      let modalEl = document.getElementById('gs-confirm-modal');
      if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = 'gs-confirm-modal';
        modalEl.className = 'modal fade';
        modalEl.tabIndex = -1;
        modalEl.innerHTML = `
          <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title" id="gs-confirm-title"></h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body" id="gs-confirm-body"></div>
              <div class="modal-footer">
                <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="btn" id="gs-confirm-ok-btn"></button>
              </div>
            </div>
          </div>`;
        document.body.appendChild(modalEl);
      }
      modalEl.querySelector('#gs-confirm-title').textContent = title;
      modalEl.querySelector('#gs-confirm-body').textContent = body;
      const okBtn = modalEl.querySelector('#gs-confirm-ok-btn');
      okBtn.textContent = confirmText;
      okBtn.className = `btn ${danger ? 'btn-danger' : 'btn-gs-primary'}`;

      const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
      const onOk = () => { cleanup(); modal.hide(); resolve(true); };
      const onHide = () => { cleanup(); resolve(false); };
      function cleanup() {
        okBtn.removeEventListener('click', onOk);
        modalEl.removeEventListener('hidden.bs.modal', onHide);
      }
      okBtn.addEventListener('click', onOk);
      modalEl.addEventListener('hidden.bs.modal', onHide, { once: true });
      modal.show();
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
