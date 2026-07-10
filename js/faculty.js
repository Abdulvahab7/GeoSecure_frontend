/* ==========================================================================
   faculty.js — Faculty dashboard: routing + all sections
   ========================================================================== */

(function () {
  const user = GsAuth.requireRole('FACULTY');
  if (!user) return;

  document.getElementById('topbar-user').textContent = `${user.username} · ${user.email}`;
  document.getElementById('logout-btn').addEventListener('click', GsAuth.logout);

  const sectionTitles = {
    overview: "Today's schedule", subjects: 'My subjects', timetable: 'Weekly timetable',
    mentees: 'My mentees', coordinated: 'Coordinated classes', reports: 'Reports',
    profile: 'Profile', settings: 'Settings', 'pending-approvals': 'Pending approvals',
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
      document.getElementById('topbar-title').textContent = sectionTitles[target] || "Today's schedule";
      document.getElementById('gs-sidebar').classList.remove('gs-sidebar-open');
      GsUX?.setBreadcrumb(['Faculty', sectionTitles[target] || "Today's schedule"]);
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
      subjects: renderSubjects, timetable: renderTimetable, mentees: renderMentees,
      coordinated: renderCoordinated, reports: renderReports,
      profile: () => GsProfile.mount('sec-profile', 'FACULTY'), settings: renderSettings,
      'pending-approvals': renderPendingApprovals, notifications: () => GsNotifications.mount('sec-notifications', 'FACULTY'),
    };
    loaders[section]?.();
  }


  // ---- Overview: today's schedule (markup already in HTML) -----------------
  async function loadToday() {
    const body = document.getElementById('today-schedule-body');
    try {
      const slots = await GsApi.get('/api/faculty/dashboard/today');
      body.innerHTML = slots.length ? slots.map(s => `
        <tr><td>${s.sessionNumber}</td><td>${GsUtil.escapeHtml(s.subjectName)}</td>
        <td>${GsUtil.escapeHtml(s.className)}</td><td>${GsUtil.escapeHtml(s.roomNumber ?? '—')}</td></tr>`).join('')
        : `<tr><td colspan="4" class="gs-empty border-0"><i class="bi bi-calendar-check"></i>No sessions scheduled today.</td></tr>`;
    } catch (err) {
      body.innerHTML = `<tr><td colspan="4" class="text-danger text-center py-3">${GsUtil.escapeHtml(GsUtil.apiErrorMessage(err))}</td></tr>`;
    }
  }

  // ---- My subjects ------------------------------------------------------------
  async function renderSubjects() {
    const el = document.getElementById('sec-subjects');
    el.innerHTML = `
      <div class="gs-card">
        <div class="gs-card-header"><h5>My subjects</h5></div>
        <div class="table-responsive"><table class="table table-gs mb-0">
          <thead><tr><th>Subject</th><th>Code</th><th>Class</th><th>Academic year</th></tr></thead>
          <tbody id="my-subjects-body"><tr><td colspan="4" class="text-center py-4"><span class="spinner-border spinner-border-sm"></span></td></tr></tbody>
        </table></div>
      </div>`;
    try {
      const rows = await GsApi.get('/api/faculty/subjects');
      document.getElementById('my-subjects-body').innerHTML = rows.length
        ? rows.map(r => `<tr><td>${GsUtil.escapeHtml(r.subjectName)}</td><td>${GsUtil.escapeHtml(r.subjectCode)}</td><td>${GsUtil.escapeHtml(r.className)}</td><td>${GsUtil.escapeHtml(r.academicYear)}</td></tr>`).join('')
        : `<tr><td colspan="4" class="gs-empty border-0"><i class="bi bi-journal-bookmark"></i>No subjects assigned yet.</td></tr>`;
    } catch (err) {
      document.getElementById('my-subjects-body').innerHTML = `<tr><td colspan="4" class="text-danger text-center py-3">${GsUtil.escapeHtml(GsUtil.apiErrorMessage(err))}</td></tr>`;
    }
  }

  // ---- Weekly timetable ---------------------------------------------------------
  async function renderTimetable() {
    const el = document.getElementById('sec-timetable');
    el.innerHTML = `
      <div class="gs-card">
        <div class="gs-card-header"><h5>Weekly timetable</h5></div>
        <div class="table-responsive"><table class="table table-gs mb-0">
          <thead><tr><th>Day</th><th>Session</th><th>Subject</th><th>Class</th><th>Room</th></tr></thead>
          <tbody id="week-tt-body"><tr><td colspan="5" class="text-center py-4"><span class="spinner-border spinner-border-sm"></span></td></tr></tbody>
        </table></div>
      </div>`;
    try {
      const rows = await GsApi.get('/api/faculty/timetable');
      document.getElementById('week-tt-body').innerHTML = rows.length
        ? rows.map(t => `<tr><td>${GsUtil.escapeHtml(t.dayOfWeek)}</td><td>${t.sessionNumber}</td><td>${GsUtil.escapeHtml(t.subjectName)}</td><td>${GsUtil.escapeHtml(t.className)}</td><td>${GsUtil.escapeHtml(t.roomNumber ?? '—')}</td></tr>`).join('')
        : `<tr><td colspan="5" class="gs-empty border-0"><i class="bi bi-calendar-week"></i>No timetable slots yet.</td></tr>`;
    } catch (err) {
      document.getElementById('week-tt-body').innerHTML = `<tr><td colspan="5" class="text-danger text-center py-3">${GsUtil.escapeHtml(GsUtil.apiErrorMessage(err))}</td></tr>`;
    }
  }

  // ---- Mentees --------------------------------------------------------------------
  async function renderMentees() {
    const el = document.getElementById('sec-mentees');
    el.innerHTML = `
      <div class="gs-card">
        <div class="gs-card-header"><h5>My mentees</h5></div>
        <div class="table-responsive"><table class="table table-gs mb-0">
          <thead><tr><th>Reg. no.</th><th>Name</th><th>Class</th><th>Email</th></tr></thead>
          <tbody id="mentees-body"><tr><td colspan="4" class="text-center py-4"><span class="spinner-border spinner-border-sm"></span></td></tr></tbody>
        </table></div>
      </div>`;
    try {
      const rows = await GsApi.get('/api/faculty/mentees');
      document.getElementById('mentees-body').innerHTML = rows.length
        ? rows.map(s => `<tr><td>${GsUtil.escapeHtml(s.registerNo)}</td><td>${GsUtil.escapeHtml(s.name)}</td><td>${GsUtil.escapeHtml(s.className)}</td><td>${GsUtil.escapeHtml(s.email)}</td></tr>`).join('')
        : `<tr><td colspan="4" class="gs-empty border-0"><i class="bi bi-person-hearts"></i>You have no mentees assigned yet.</td></tr>`;
    } catch (err) {
      document.getElementById('mentees-body').innerHTML = `<tr><td colspan="4" class="text-danger text-center py-3">${GsUtil.escapeHtml(GsUtil.apiErrorMessage(err))}</td></tr>`;
    }
  }

  // ---- Coordinated classes (+ self-service transfer/leave) ------------------------------
  async function renderCoordinated() {
    const el = document.getElementById('sec-coordinated');
    el.innerHTML = `
      <div class="gs-card">
        <div class="gs-card-header"><h5>Classes I coordinate</h5></div>
        <div class="table-responsive"><table class="table table-gs mb-0">
          <thead><tr><th>Class</th><th>Department</th><th>Students</th><th></th></tr></thead>
          <tbody id="coord-body"><tr><td colspan="4" class="text-center py-4"><span class="spinner-border spinner-border-sm"></span></td></tr></tbody>
        </table></div>
      </div>`;
    await loadCoordinated();
  }

  async function loadCoordinated() {
    const body = document.getElementById('coord-body');
    try {
      const classes = await GsApi.get('/api/faculty/coordinated-classes');
      body.innerHTML = classes.length ? classes.map(c => `
        <tr>
          <td>${GsUtil.escapeHtml(c.name)} (${GsUtil.escapeHtml(c.section)})</td>
          <td>${GsUtil.escapeHtml(c.departmentName)}</td>
          <td>${c.studentCount ?? '—'}</td>
          <td class="text-end">
            <button class="btn btn-sm btn-light transfer-btn" data-id="${c.id}">Transfer</button>
            <button class="btn btn-sm btn-light text-danger leave-btn" data-id="${c.id}">Leave</button>
          </td>
        </tr>`).join('') : `<tr><td colspan="4" class="gs-empty border-0"><i class="bi bi-person-check"></i>You don't coordinate any class right now.</td></tr>`;

      body.querySelectorAll('.leave-btn').forEach(btn => btn.addEventListener('click', async () => {
        const ok = await GsUtil.confirm({ title: 'Leave coordination?', body: 'You will no longer be the coordinator for this class.', confirmText: 'Leave', danger: true });
        if (!ok) return;
        try {
          await GsApi.post(`/api/faculty/coordinator/leave/${btn.dataset.id}`);
          GsUtil.toast('You have left coordination of this class.');
          loadCoordinated();
        } catch (err) { GsUtil.toast(GsUtil.apiErrorMessage(err), 'danger'); }
      }));

      body.querySelectorAll('.transfer-btn').forEach(btn => btn.addEventListener('click', () => openTransferPrompt(btn.dataset.id)));
    } catch (err) {
      body.innerHTML = `<tr><td colspan="4" class="text-danger text-center py-3">${GsUtil.escapeHtml(GsUtil.apiErrorMessage(err))}</td></tr>`;
    }
  }

  async function openTransferPrompt(classId) {
    try {
      const faculty = await GsApi.get('/api/admin/faculty').catch(() => []);
      let newFacultyId, reason;
      if (faculty.length) {
        const options = faculty.map(f => `${f.id}: ${f.name}`).join('\n');
        const pick = prompt(`Enter the faculty ID to transfer to:\n${options}`);
        if (!pick) return;
        newFacultyId = Number(pick);
      } else {
        const pick = prompt('Enter the new coordinator faculty ID:');
        if (!pick) return;
        newFacultyId = Number(pick);
      }
      reason = prompt('Reason (optional):') || null;
      await GsApi.post('/api/faculty/coordinator/transfer', { classId: Number(classId), newFacultyId, reason });
      GsUtil.toast('Coordination transferred.');
      loadCoordinated();
    } catch (err) {
      GsUtil.toast(GsUtil.apiErrorMessage(err), 'danger');
    }
  }

  // ---- Reports: per-subject report -------------------------------------------------------
  async function renderReports() {
    const el = document.getElementById('sec-reports');
    const subjects = await GsApi.get('/api/faculty/subjects').catch(() => []);
    el.innerHTML = `
      <div class="gs-card">
        <div class="gs-card-header">
          <h5>Subject-wise report</h5>
          <div class="d-flex gap-2">
            <select class="form-select form-select-sm" id="rep-subject-select" style="width:280px;">
              ${subjects.map(s => `<option value="${s.id}">${GsUtil.escapeHtml(s.subjectName)} — ${GsUtil.escapeHtml(s.className)}</option>`).join('')}
            </select>
            <button class="btn btn-gs-primary btn-sm" id="rep-load-btn">Load</button>
          </div>
        </div>
        <div class="gs-card-body" id="rep-report-body"><div class="gs-empty border-0"><i class="bi bi-bar-chart"></i>Pick a subject and load the report.</div></div>
      </div>`;

    document.getElementById('rep-load-btn').addEventListener('click', async () => {
      const id = document.getElementById('rep-subject-select').value;
      if (!id) return;
      const container = document.getElementById('rep-report-body');
      container.innerHTML = `<div class="text-center py-3"><span class="spinner-border spinner-border-sm"></span></div>`;
      try {
        const rows = await GsApi.get(`/api/admin/reports/faculty-subjects/${id}`);
        const label = document.getElementById('rep-subject-select').selectedOptions[0]?.textContent || 'Subject';
        GsReportUI.renderReportTable({
          container, rows, title: `Subject-wise report — ${label}`,
          emptyMessage: 'No records for this subject yet.', emptyIcon: 'bi-bar-chart',
        });
      } catch (err) {
        container.innerHTML = `<div class="alert alert-danger py-2">${GsUtil.escapeHtml(GsUtil.apiErrorMessage(err))}</div>`;
      }
    });
  }

  function renderSettings() {
    const el = document.getElementById('sec-settings');
    el.innerHTML = `
      <div class="gs-card" style="max-width:520px;">
        <div class="gs-card-header"><h5>Preferences</h5></div>
        <div class="gs-card-body">
          <div class="form-check form-switch mb-2">
            <input class="form-check-input" type="checkbox" id="pref-roster-sound" checked>
            <label class="form-check-label" for="pref-roster-sound">Sound when a student scans during a live session</label>
          </div>
          <div class="form-text mb-3">Preferences are stored on this device only — there is no backend settings endpoint yet.</div>
          <button class="btn btn-gs-primary btn-sm" id="save-prefs-btn">Save preferences</button>
        </div>
      </div>`;
    document.getElementById('pref-roster-sound').checked = localStorage.getItem('gs_roster_sound') !== 'off';
    document.getElementById('save-prefs-btn').addEventListener('click', () => {
      localStorage.setItem('gs_roster_sound', document.getElementById('pref-roster-sound').checked ? 'on' : 'off');
      GsUtil.toast('Preferences saved on this device.');
    });
  }

  async function renderPendingApprovals() {
    const el = document.getElementById('sec-pending-approvals');
    el.innerHTML = `
      <div class="gs-card">
        <div class="gs-card-header d-flex justify-content-between align-items-center">
          <h5>Pending Student Registrations</h5>
          <button class="btn btn-outline-secondary btn-sm" id="fac-pending-refresh-btn" title="Refresh"><i class="bi bi-arrow-clockwise"></i> Refresh</button>
        </div>
        <div class="table-responsive"><table class="table table-gs mb-0">
          <thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Department</th><th>Created at</th><th></th></tr></thead>
          <tbody id="fac-pending-body"><tr><td colspan="6" class="text-center py-4"><span class="spinner-border spinner-border-sm"></span></td></tr></tbody>
        </table></div>
      </div>`;

    const tbody = document.getElementById('fac-pending-body');
    
    async function loadPending() {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center gs-muted py-4">Loading…</td></tr>';
      try {
        const rows = await GsApi.get('/api/faculty/users/pending');
        if (!rows.length) {
          tbody.innerHTML = '<tr><td colspan="6" class="text-center gs-muted py-4">No pending student registrations.</td></tr>';
          return;
        }
        tbody.innerHTML = rows.map((u) => `
          <tr>
            <td>${GsUtil.escapeHtml(u.fullName || u.username || '—')}</td>
            <td><span class="badge text-bg-light border">${GsUtil.escapeHtml(u.role)}</span></td>
            <td>${GsUtil.escapeHtml(u.email)}</td>
            <td>${GsUtil.escapeHtml(u.departmentName || '—')}</td>
            <td>${GsUtil.formatDateTime(u.createdAt)}</td>
            <td class="text-end">
              <button class="btn btn-sm btn-success me-1" data-action="approve" data-id="${u.id}"><i class="bi bi-check-lg"></i> Approve</button>
              <button class="btn btn-sm btn-outline-danger" data-action="reject" data-id="${u.id}"><i class="bi bi-x-lg"></i> Reject</button>
            </td>
          </tr>
        `).join('');
      } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4">${GsUtil.escapeHtml(GsUtil.apiErrorMessage(err))}</td></tr>`;
      }
    }

    tbody.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      const action = btn.dataset.action;

      const isApprove = action === 'approve';
      const confirmed = await GsUtil.confirm({
        title: isApprove ? 'Approve registration?' : 'Reject registration?',
        body: isApprove
          ? 'The student will be able to sign in once approved.'
          : 'The student registration will be rejected.',
        confirmText: isApprove ? 'Approve' : 'Reject',
        danger: !isApprove,
      });
      if (!confirmed) return;

      GsUtil.showSpinner();
      try {
        await GsApi.put(`/api/faculty/users/${id}/${action}`, {});
        GsUtil.toast(isApprove ? 'Student approved.' : 'Student rejected.', isApprove ? 'success' : 'warning');
        await loadPending();
      } catch (err) {
        GsUtil.toast(GsUtil.apiErrorMessage(err), 'danger');
      } finally {
        GsUtil.hideSpinner();
      }
    });

    document.getElementById('fac-pending-refresh-btn').addEventListener('click', loadPending);
    await loadPending();
  }

  loadToday();
})();
