/* ==========================================================================
   student.js — Student dashboard: routing + all sections
   ========================================================================== */

(function () {
  const user = GsAuth.requireRole('STUDENT');
  if (!user) return;

  document.getElementById('topbar-user').textContent = `${user.username} · ${user.email}`;
  document.getElementById('logout-btn').addEventListener('click', GsAuth.logout);

  const sectionTitles = {
    overview: 'My attendance', subjectwise: 'Subject-wise', monthly: 'Monthly history',
    recent: 'Recent activity', profile: 'Profile', settings: 'Settings',
    notifications: 'Notifications',
  };
  const loadedSections = new Set();

  document.querySelectorAll('.gs-nav-link').forEach(link => {
    link.addEventListener('click', () => {
      if (link.dataset.href) { window.location.href = link.dataset.href; return; }
      const target = link.dataset.section;
      document.querySelectorAll('.gs-nav-link').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      document.querySelectorAll('.gs-section').forEach(s => s.classList.remove('active'));
      document.getElementById(`sec-${target}`).classList.add('active');
      document.getElementById('topbar-title').textContent = sectionTitles[target] || 'My attendance';
      document.getElementById('gs-sidebar').classList.remove('gs-sidebar-open');
      GsUX?.setBreadcrumb(['Student', sectionTitles[target] || 'My attendance']);
      GsUX?.markActiveNav(target);
      ensureLoaded(target);
    });
  });

  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    document.getElementById('gs-sidebar').classList.toggle('gs-sidebar-open');
  });

  function ensureLoaded(section) {
    if (loadedSections.has(section)) return;
    loadedSections.add(section);
    const loaders = {
      subjectwise: renderSubjectwise, monthly: renderMonthly, recent: renderRecent,
      profile: () => GsProfile.mount('sec-profile', 'STUDENT'), settings: renderSettings,
      notifications: () => GsNotifications.mount('sec-notifications', 'STUDENT'),
    };
    loaders[section]?.();
  }


  function pick(obj, candidates, fallback) {
    for (const key of candidates) {
      if (obj && obj[key] !== undefined && obj[key] !== null) return obj[key];
    }
    return fallback;
  }

  // ---- Overview: stat tiles + subject summary (markup already in HTML) --------------
  async function loadOverview() {
    try {
      const summary = await GsApi.get('/api/student/attendance/summary');
      renderStats(summary);
      renderSubjectSummaryTable(summary);
    } catch (err) {
      document.getElementById('student-stats').innerHTML = `<div class="col-12"><div class="alert alert-danger py-2">${GsUtil.escapeHtml(GsUtil.apiErrorMessage(err))}</div></div>`;
    }
  }

  function renderStats(rows) {
    let totalPresent = 0, totalSessions = 0;
    rows.forEach(r => {
      totalPresent += Number(pick(r, ['presentCount', 'totalPresent', 'present'], 0)) || 0;
      totalSessions += Number(pick(r, ['totalSessions', 'sessionCount', 'total'], 0)) || 0;
    });
    const overallPct = totalSessions ? (totalPresent / totalSessions) * 100 : null;
    const belowThreshold = rows.filter(r => Number(pick(r, ['percentage', 'attendancePercentage'], 100)) < GS_DEFAULTER_THRESHOLD).length;

    const tiles = [
      ['Subjects tracked', rows.length, 'bi-journal-bookmark'],
      ['Overall attendance', GsUtil.pct(overallPct), 'bi-graph-up'],
      ['Sessions attended', totalPresent, 'bi-person-check'],
      ['Subjects below threshold', belowThreshold, 'bi-exclamation-triangle'],
    ];
    document.getElementById('student-stats').innerHTML = tiles.map(([label, val, icon]) => `
      <div class="col-6 col-lg-3">
        <div class="gs-stat">
          <div class="gs-stat-icon"><i class="bi ${icon}"></i></div>
          <div class="gs-stat-label">${label}</div>
          <div class="gs-stat-value">${GsUtil.escapeHtml(String(val))}</div>
        </div>
      </div>`).join('');
  }

  function renderSubjectSummaryTable(rows) {
    const body = document.getElementById('subject-summary-body');
    body.innerHTML = rows.length ? rows.map(r => `
      <tr>
        <td>${GsUtil.escapeHtml(pick(r, ['subjectName', 'subject'], '—'))}</td>
        <td>${GsUtil.escapeHtml(pick(r, ['presentCount', 'totalPresent', 'present'], '—'))}</td>
        <td>${GsUtil.escapeHtml(pick(r, ['totalSessions', 'sessionCount', 'total'], '—'))}</td>
        <td>${GsUtil.pct(pick(r, ['percentage', 'attendancePercentage'], null))}</td>
      </tr>`).join('') : `<tr><td colspan="4" class="gs-empty border-0"><i class="bi bi-journal-bookmark"></i>No attendance recorded yet.</td></tr>`;
  }

  // ---- Subject-wise (drill into one subject) -----------------------------------------
  async function renderSubjectwise() {
    const el = document.getElementById('sec-subjectwise');
    let summary = [];
    try { summary = await GsApi.get('/api/student/attendance/summary'); } catch (e) { /* ignore */ }

    el.innerHTML = `
      <div class="gs-card">
        <div class="gs-card-header">
          <h5>Subject-wise report</h5>
          <select class="form-select form-select-sm" id="sw-subject-select" style="width:260px;">
            ${summary.map(r => {
              const id = pick(r, ['subjectId', 'id'], '');
              const name = pick(r, ['subjectName', 'subject'], 'Subject');
              return `<option value="${id}">${GsUtil.escapeHtml(name)}</option>`;
            }).join('')}
          </select>
        </div>
        <div class="gs-card-body" id="sw-report-body"><div class="gs-empty border-0"><i class="bi bi-journal-bookmark"></i>Pick a subject above.</div></div>
      </div>`;

    const select = document.getElementById('sw-subject-select');
    select.addEventListener('change', () => loadSubjectDetail(select.value));
    if (select.value) loadSubjectDetail(select.value);
  }

  async function loadSubjectDetail(subjectId) {
    if (!subjectId) return;
    const container = document.getElementById('sw-report-body');
    container.innerHTML = `<div class="text-center py-3"><span class="spinner-border spinner-border-sm"></span></div>`;
    try {
      const rows = await GsApi.get(`/api/student/attendance/subject/${subjectId}`);
      const subjectName = document.getElementById('sw-subject-select').selectedOptions[0]?.textContent || 'Subject';
      GsReportUI.renderReportTable({
        container, rows, title: `Subject-wise report — ${subjectName}`,
        emptyMessage: 'No sessions recorded for this subject yet.', emptyIcon: 'bi-inbox',
        formatters: Object.fromEntries(
          (rows[0] ? Object.keys(rows[0]) : []).filter(k => /status/i.test(k)).map(k => [k, (v) => GsUtil.statusBadge(v)])
        ),
      });
    } catch (err) {
      container.innerHTML = `<div class="alert alert-danger py-2">${GsUtil.escapeHtml(GsUtil.apiErrorMessage(err))}</div>`;
    }
  }

  // ---- Monthly history -----------------------------------------------------------------
  async function renderMonthly() {
    const el = document.getElementById('sec-monthly');
    el.innerHTML = `
      <div class="gs-card">
        <div class="gs-card-header"><h5>Monthly attendance report</h5></div>
        <div class="gs-card-body" id="monthly-report-body"><div class="text-center py-4"><span class="spinner-border spinner-border-sm"></span></div></div>
      </div>`;
    const container = document.getElementById('monthly-report-body');
    try {
      const rows = await GsApi.get('/api/student/attendance/monthly');
      GsReportUI.renderReportTable({
        container, rows, title: 'Monthly attendance report',
        emptyMessage: 'No attendance history yet.', emptyIcon: 'bi-calendar3',
        formatters: Object.fromEntries(
          (rows[0] ? Object.keys(rows[0]) : []).filter(k => /percent/i.test(k)).map(k => [k, (v) => GsUtil.pct(v)])
        ),
      });
    } catch (err) {
      container.innerHTML = `<div class="alert alert-danger py-2">${GsUtil.escapeHtml(GsUtil.apiErrorMessage(err))}</div>`;
    }
  }

  // ---- Recent activity ------------------------------------------------------------------
  async function renderRecent() {
    const el = document.getElementById('sec-recent');
    el.innerHTML = `
      <div class="gs-card">
        <div class="gs-card-header"><h5>Recent activity</h5></div>
        <div class="gs-card-body" id="recent-report-body"><div class="text-center py-4"><span class="spinner-border spinner-border-sm"></span></div></div>
      </div>`;
    const container = document.getElementById('recent-report-body');
    try {
      const rows = await GsApi.get('/api/student/attendance/recent', { limit: 20 });
      GsReportUI.renderReportTable({
        container, rows, title: 'Recent activity',
        emptyMessage: 'No recent activity yet.', emptyIcon: 'bi-clock-history',
        formatters: Object.fromEntries(
          (rows[0] ? Object.keys(rows[0]) : []).filter(k => /status/i.test(k)).map(k => [k, (v) => GsUtil.statusBadge(v)])
        ),
      });
    } catch (err) {
      container.innerHTML = `<div class="alert alert-danger py-2">${GsUtil.escapeHtml(GsUtil.apiErrorMessage(err))}</div>`;
    }
  }

  function renderSettings() {
    const el = document.getElementById('sec-settings');
    el.innerHTML = `
      <div class="gs-card" style="max-width:520px;">
        <div class="gs-card-header"><h5>Preferences</h5></div>
        <div class="gs-card-body">
          <div class="form-check form-switch mb-2">
            <input class="form-check-input" type="checkbox" id="pref-low-attendance-alert" checked>
            <label class="form-check-label" for="pref-low-attendance-alert">Highlight subjects below ${GS_DEFAULTER_THRESHOLD}% on my overview</label>
          </div>
          <div class="form-text mb-3">Preferences are stored on this device only — there is no backend settings endpoint yet.</div>
          <button class="btn btn-gs-primary btn-sm" id="save-prefs-btn">Save preferences</button>
        </div>
      </div>`;
    document.getElementById('pref-low-attendance-alert').checked = localStorage.getItem('gs_low_attendance_alert') !== 'off';
    document.getElementById('save-prefs-btn').addEventListener('click', () => {
      localStorage.setItem('gs_low_attendance_alert', document.getElementById('pref-low-attendance-alert').checked ? 'on' : 'off');
      GsUtil.toast('Preferences saved on this device.');
    });
  }

  loadOverview();
})();
