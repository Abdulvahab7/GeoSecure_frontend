/* ==========================================================================
   ui-ux.js — Phase 5C (UI & UX Improvements)
   GsUX: shared, additive UI helper kit used across dashboards/pages.
   Does not modify GsUtil/GsApi — only adds new, optional helpers that
   existing and future code can opt into. Safe to include on every page.
   ========================================================================== */

const GsUX = {

  /* ---------------- Breadcrumbs ---------------- */
  /**
   * Renders a breadcrumb trail into #gs-breadcrumb (created lazily under
   * #topbar-title's parent if not present in the page markup).
   * @param {string[]} crumbs e.g. ['Dashboard', 'Reports', 'Monthly']
   */
  setBreadcrumb(crumbs) {
    let el = document.getElementById('gs-breadcrumb');
    if (!el) {
      const title = document.getElementById('topbar-title');
      if (!title || !title.parentElement) return;
      el = document.createElement('nav');
      el.id = 'gs-breadcrumb';
      el.className = 'gs-breadcrumb';
      el.setAttribute('aria-label', 'Breadcrumb');
      title.parentElement.appendChild(el);
    }
    el.innerHTML = crumbs.map((c, i) => {
      const sep = i > 0 ? '<span class="gs-crumb-sep">/</span>' : '';
      return `${sep}<span class="gs-crumb">${GsUtil.escapeHtml(c)}</span>`;
    }).join('');
  },

  /* ---------------- Skeleton loaders ---------------- */
  /** Returns HTML for N skeleton stat tiles. */
  skeletonTiles(count = 4) {
    return Array.from({ length: count })
      .map(() => `<div class="col-6 col-lg-3"><div class="gs-skel gs-skel-tile"></div></div>`)
      .join('');
  },
  /** Returns HTML for a skeleton table (rows x approx columns). */
  skeletonRows(rows = 5) {
    return Array.from({ length: rows }).map(() => `<div class="gs-skel gs-skel-row"></div>`).join('');
  },
  /** Returns HTML for a skeleton card (chart/content placeholder). */
  skeletonCard() {
    return `<div class="gs-skel gs-skel-card"></div>`;
  },
  /** Injects skeleton rows into a container while a promise resolves, then swaps in real content. */
  async withSkeleton(containerId, rows, loader) {
    const el = document.getElementById(containerId);
    if (el) el.innerHTML = this.skeletonRows(rows);
    try {
      return await loader();
    } finally {
      // caller replaces el.innerHTML with real content on success/failure
    }
  },

  /* ---------------- Progress indicator ---------------- */
  _progressEl: null,
  showProgress() {
    if (!this._progressEl) {
      this._progressEl = document.createElement('div');
      this._progressEl.className = 'gs-progress-bar-fixed';
      this._progressEl.innerHTML = '<span></span>';
      document.body.appendChild(this._progressEl);
    }
    this._progressEl.classList.add('show');
  },
  hideProgress() {
    this._progressEl?.classList.remove('show');
  },

  /* ---------------- Empty states ---------------- */
  /**
   * Returns HTML for a rich empty-state block.
   * @param {object} opts { icon, title, message, actionLabel, actionOnClick }
   */
  emptyState({ icon = 'bi-inbox', title = 'Nothing here yet', message = '', actionLabel = '', actionId = '' } = {}) {
    const action = actionLabel
      ? `<button class="btn btn-sm btn-gs-primary" id="${actionId}">${GsUtil.escapeHtml(actionLabel)}</button>`
      : '';
    return `
      <div class="gs-empty-state">
        <i class="bi ${icon}"></i>
        <h6>${GsUtil.escapeHtml(title)}</h6>
        ${message ? `<p>${GsUtil.escapeHtml(message)}</p>` : ''}
        ${action}
      </div>`;
  },

  /* Common presets */
  emptyAttendance() {
    return this.emptyState({ icon: 'bi-calendar-x', title: 'No attendance records', message: 'Records will appear here once attendance is marked.' });
  },
  emptyReports() {
    return this.emptyState({ icon: 'bi-bar-chart', title: 'No report data', message: 'Try a different filter or date range.' });
  },
  emptyNotifications() {
    return this.emptyState({ icon: 'bi-bell-slash', title: 'No notifications', message: "You're all caught up." });
  },
  emptyTimetable() {
    return this.emptyState({ icon: 'bi-calendar-week', title: 'No timetable entries', message: 'Nothing scheduled yet.' });
  },
  emptySearch(term = '') {
    return this.emptyState({
      icon: 'bi-search',
      title: 'No results found',
      message: term ? `Nothing matched "${term}". Try a different search.` : 'Try a different search term.',
    });
  },

  /* ---------------- Form validation ---------------- */
  /**
   * Validates a form's fields against simple rules and paints inline errors.
   * @param {HTMLFormElement} form
   * @param {object} rules { fieldName: { required, minLength, pattern, email, match, message } }
   * @returns {boolean} true if valid
   */
  validateForm(form, rules) {
    let valid = true;
    Object.entries(rules).forEach(([name, rule]) => {
      const field = form.elements[name];
      if (!field) return;
      const value = (field.value || '').trim();
      let fieldValid = true;
      let msg = rule.message || 'This field is invalid.';

      if (rule.required && !value) { fieldValid = false; msg = rule.message || 'This field is required.'; }
      else if (rule.minLength && value.length < rule.minLength) { fieldValid = false; msg = rule.message || `Must be at least ${rule.minLength} characters.`; }
      else if (rule.email && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) { fieldValid = false; msg = rule.message || 'Enter a valid email address.'; }
      else if (rule.pattern && value && !rule.pattern.test(value)) { fieldValid = false; msg = rule.message || 'Invalid format.'; }
      else if (rule.match && value !== (form.elements[rule.match]?.value || '')) { fieldValid = false; msg = rule.message || 'Values do not match.'; }

      this._setFieldState(field, fieldValid, msg);
      if (!fieldValid) valid = false;
    });
    return valid;
  },

  _setFieldState(field, isValid, message) {
    field.classList.remove('is-invalid', 'is-valid');
    let errEl = field.parentElement?.querySelector('.gs-field-error');
    if (!isValid) {
      field.classList.add('is-invalid');
      field.setAttribute('aria-invalid', 'true');
      if (!errEl) {
        errEl = document.createElement('div');
        errEl.className = 'gs-field-error';
        field.insertAdjacentElement('afterend', errEl);
      }
      errEl.textContent = message;
      errEl.id = errEl.id || `err-${field.name || field.id || Math.random().toString(36).slice(2)}`;
      field.setAttribute('aria-describedby', errEl.id);
    } else {
      field.classList.add('is-valid');
      field.removeAttribute('aria-invalid');
      if (errEl) errEl.remove();
    }
  },

  /** Clears all validation state on a form. */
  clearValidation(form) {
    form.querySelectorAll('.is-invalid, .is-valid').forEach((f) => f.classList.remove('is-invalid', 'is-valid'));
    form.querySelectorAll('.gs-field-error').forEach((e) => e.remove());
  },

  /* ---------------- Keyboard / accessibility ---------------- */
  /** Closes the mobile sidebar on Escape, and adds a skip-to-content link if missing. */
  initA11y() {
    if (!document.querySelector('.gs-skip-link') && document.getElementById('gs-content-main')) {
      const link = document.createElement('a');
      link.href = '#gs-content-main';
      link.className = 'gs-skip-link';
      link.textContent = 'Skip to main content';
      document.body.prepend(link);
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.getElementById('gs-sidebar')?.classList.remove('gs-sidebar-open');
        document.querySelectorAll('.modal.show').forEach((m) => {
          bootstrap?.Modal?.getInstance(m)?.hide();
        });
      }
    });
    document.querySelectorAll('.gs-nav-link').forEach((link) => {
      if (!link.hasAttribute('tabindex')) link.setAttribute('tabindex', '0');
      if (!link.hasAttribute('role')) link.setAttribute('role', 'button');
      link.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); link.click(); }
      });
    });
  },

  /** Marks the currently active nav link with aria-current for screen readers. */
  markActiveNav(sectionName) {
    document.querySelectorAll('.gs-nav-link').forEach((l) => {
      if (l.dataset.section === sectionName) l.setAttribute('aria-current', 'page');
      else l.removeAttribute('aria-current');
    });
  },

  /* ---------------- Network / session helpers ---------------- */
  /** Call from a catch block when a GsApiError has code NETWORK_ERROR. */
  isNetworkError(err) {
    return err && (err.code === 'NETWORK_ERROR' || err.status === 0);
  },
  goToNetworkError() {
    window.location.href = 'network-error.html';
  },
  goToAccessDenied() {
    window.location.href = 'access-denied.html';
  },
};

document.addEventListener('DOMContentLoaded', () => GsUX.initA11y());
