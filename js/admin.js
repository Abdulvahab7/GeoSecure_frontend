/* ==========================================================================
   admin.js — Admin dashboard: routing between sections + all CRUD modules
   Uses a single reusable Bootstrap modal (#gs-entity-modal) whose form body
   is built dynamically per entity, to keep markup DRY across the many
   management screens (departments/subjects/classes/faculty/students/...).
   ========================================================================== */

(function () {
  const user = GsAuth.requireRole('ADMIN');
  if (!user) return;

  document.getElementById('topbar-user').textContent = `${user.username} · ${user.email}`;
  document.getElementById('logout-btn').addEventListener('click', GsAuth.logout);

  // ---- sidebar / section routing -----------------------------------------
  const sectionTitles = {
    overview: 'Dashboard', departments: 'Departments', subjects: 'Subjects',
    classes: 'Classes', timetable: 'Timetable', faculty: 'Faculty',
    students: 'Students', assignments: 'Faculty ↔ Subjects', mentors: 'Mentors',
    coordinators: 'Coordinators', users: 'User accounts', analytics: 'Analytics', reports: 'Reports',
    'audit-logs': 'Audit logs', profile: 'Profile', settings: 'Settings', notifications: 'Notifications',
  };
  const loadedSections = new Set();

  document.querySelectorAll('.gs-nav-link').forEach(link => {
    link.addEventListener('click', () => {
      if (link.dataset.href) { window.location.href = link.dataset.href; return; }
      GsUX?.closeAllModals();
      const target = link.dataset.section;
      document.querySelectorAll('.gs-nav-link').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      document.querySelectorAll('.gs-section').forEach(s => s.classList.remove('active'));
      document.getElementById(`sec-${target}`).classList.add('active');
      document.getElementById('topbar-title').textContent = sectionTitles[target] || 'Dashboard';
      document.getElementById('gs-sidebar').classList.remove('gs-sidebar-open');
      GsUX?.setBreadcrumb(['Admin', sectionTitles[target] || 'Dashboard']);
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
      overview: loadOverview, departments: () => Departments.render(), subjects: () => Subjects.render(),
      classes: () => Classes.render(), timetable: () => TimetableMod.render(), faculty: () => FacultyMod.render(),
      students: () => StudentsMod.render(), assignments: () => Assignments.render(), mentors: () => Mentors.render(),
      coordinators: () => Coordinators.render(), users: () => Users.render(),
      analytics: () => AnalyticsModule.render(), reports: () => Reports.render(),
      'audit-logs': () => AuditLogs.render(), profile: () => GsProfile.mount('sec-profile', 'ADMIN'),
      settings: renderSettings, notifications: () => GsNotifications.mount('sec-notifications', 'ADMIN'),
    };
    loaders[section]?.();
  }


  // Poll unread notification count for the sidebar badge.
  // Isolated from the rest of the dashboard on purpose: this is a background
  // poll, not a user-initiated action, so a failure here (network error,
  // 500, or an expired token) must never clear the session, redirect the
  // page, or leave any global loading state active. It only ever touches
  // the badge element and nothing else.
  async function pollNotifCount() {
    try {
      const { count } = await GsApi.get('/api/notifications/unread-count', undefined, { silent: true });
      const badge = document.getElementById('notif-count-badge');
      if (!badge) return;
      if (count > 0) { badge.textContent = count; badge.classList.remove('d-none'); }
      else badge.classList.add('d-none');
    } catch (e) {
      // Swallow the error: the sidebar badge simply won't update this cycle.
      // Timetable, modals, and every other section remain fully interactive.
    }
  }
  pollNotifCount();
  setInterval(pollNotifCount, 30000);

  // ---- Overview -----------------------------------------------------------
  async function loadOverview() {
    try {
      const stats = await GsApi.get('/api/admin/reports/today-stats');
      const tiles = [
        ['Sessions today', stats.totalSessions ?? stats.sessionsToday ?? '—', 'bi-calendar-check'],
        ['Present today', stats.presentCount ?? stats.totalPresent ?? '—', 'bi-person-check'],
        ['Absent today', stats.absentCount ?? stats.totalAbsent ?? '—', 'bi-person-x'],
        ['Attendance rate', GsUtil.pct(stats.attendanceRate ?? stats.percentage), 'bi-graph-up'],
      ];
      document.getElementById('overview-stats').innerHTML = tiles.map(([label, val, icon]) => `
        <div class="col-6 col-lg-3">
          <div class="gs-stat">
            <div class="gs-stat-icon"><i class="bi ${icon}"></i></div>
            <div class="gs-stat-label">${label}</div>
            <div class="gs-stat-value">${GsUtil.escapeHtml(String(val))}</div>
          </div>
        </div>`).join('');
    } catch (err) {
      document.getElementById('overview-stats').innerHTML = `<div class="col-12"><div class="alert alert-danger py-2">${GsUtil.escapeHtml(GsUtil.apiErrorMessage(err))}</div></div>`;
    }

    try {
      const avgs = await GsApi.get('/api/admin/reports/department-averages');
      document.getElementById('dept-avg-body').innerHTML = avgs.length
        ? avgs.map(a => `<tr><td>${GsUtil.escapeHtml(a.departmentName ?? a.department ?? '—')}</td><td>${GsUtil.pct(a.averagePercentage ?? a.average ?? a.avgAttendance)}</td></tr>`).join('')
        : `<tr><td colspan="2" class="gs-empty border-0">No data yet.</td></tr>`;
    } catch (err) { /* leave empty */ }

    try {
      const daily = await GsApi.get('/api/admin/reports/daily-stats', { sinceDays: 7 });
      document.getElementById('daily-stats-body').innerHTML = daily.length
        ? daily.map(d => `<tr><td>${GsUtil.escapeHtml(d.date ?? d.sessionDate ?? '—')}</td><td>${d.sessionCount ?? d.totalSessions ?? '—'}</td><td>${d.recordCount ?? d.totalRecords ?? '—'}</td></tr>`).join('')
        : `<tr><td colspan="3" class="gs-empty border-0">No data yet.</td></tr>`;
    } catch (err) { /* leave empty */ }
  }

  function renderSettings() {
    const el = document.getElementById('sec-settings');
    el.innerHTML = `
      <div class="gs-card" style="max-width:520px;">
        <div class="gs-card-header"><h5>Preferences</h5></div>
        <div class="gs-card-body">
          <label class="form-label small fw-semibold">Interface density</label>
          <select class="form-select mb-3" id="pref-density">
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
          <div class="form-check form-switch mb-2">
            <input class="form-check-input" type="checkbox" id="pref-email-notifs" checked>
            <label class="form-check-label" for="pref-email-notifs">Email me notification summaries</label>
          </div>
          <div class="form-text mb-3">Preferences are stored on this device only — there is no backend settings endpoint yet.</div>
          <button class="btn btn-gs-primary btn-sm" id="save-prefs-btn">Save preferences</button>
        </div>
      </div>`;
    document.getElementById('pref-density').value = localStorage.getItem('gs_theme_pref') || 'comfortable';
    document.getElementById('save-prefs-btn').addEventListener('click', () => {
      localStorage.setItem('gs_theme_pref', document.getElementById('pref-density').value);
      GsUtil.toast('Preferences saved on this device.');
    });
  }

  // ==========================================================================
  // Generic CRUD table + modal-form helper shared by every admin module below
  // ==========================================================================
  function crudModule({ sectionId, title, addLabel, listFn, fields, columns,
                         idKey = 'id', createFn, updateFn, deleteFn, extraHeaderHtml = '' }) {
    const module = {
      _items: [],
      async render() {
        const el = document.getElementById(sectionId);
        el.innerHTML = `
          <div class="gs-card">
            <div class="gs-card-header">
              <h5>${title}</h5>
              <div class="d-flex gap-2">${extraHeaderHtml}
                ${addLabel ? `<button class="btn btn-gs-primary btn-sm" id="${sectionId}-add-btn"><i class="bi bi-plus-lg"></i> ${addLabel}</button>` : ''}
              </div>
            </div>
            <div class="table-responsive"><table class="table table-gs table-hover mb-0">
              <thead><tr>${columns.map(c => `<th>${c.label}</th>`).join('')}<th></th></tr></thead>
              <tbody id="${sectionId}-body"><tr><td colspan="${columns.length + 1}" class="text-center py-4"><span class="spinner-border spinner-border-sm"></span></td></tr></tbody>
            </table></div>
          </div>`;
        if (addLabel) document.getElementById(`${sectionId}-add-btn`).addEventListener('click', () => openForm(null));
        await module.reload();
      },

      async reload() {
        const body = document.getElementById(`${sectionId}-body`);
        try {
          const items = await listFn();
          module._items = items;
          if (!items.length) {
            body.innerHTML = `<tr><td colspan="${columns.length + 1}" class="gs-empty border-0"><i class="bi bi-inbox"></i>Nothing here yet.</td></tr>`;
            return;
          }
          body.innerHTML = items.map(item => `
            <tr>
              ${columns.map(c => `<td>${c.render ? c.render(item) : GsUtil.escapeHtml(item[c.key] ?? '—')}</td>`).join('')}
              <td class="text-end">
                ${updateFn ? `<button class="btn btn-sm btn-light edit-btn" data-id="${item[idKey]}"><i class="bi bi-pencil"></i></button>` : ''}
                ${deleteFn ? `<button class="btn btn-sm btn-light text-danger delete-btn" data-id="${item[idKey]}"><i class="bi bi-trash"></i></button>` : ''}
              </td>
            </tr>`).join('');

          body.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', () => {
            const item = module._items.find(i => String(i[idKey]) === btn.dataset.id);
            openForm(item);
          }));
          body.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', async () => {
            const ok = await GsUtil.confirm({ title: `Delete this ${title.toLowerCase().replace(/s$/, '')}?`, confirmText: 'Delete', danger: true });
            if (!ok) return;
            try {
              await deleteFn(btn.dataset.id);
              GsUtil.toast(`${title} deleted.`);
              module.reload();
            } catch (err) { GsUtil.toast(GsUtil.apiErrorMessage(err), 'danger'); }
          }));
        } catch (err) {
          body.innerHTML = `<tr><td colspan="${columns.length + 1}" class="text-danger text-center py-3">${GsUtil.escapeHtml(GsUtil.apiErrorMessage(err))}</td></tr>`;
        }
      },
    };

    function openForm(existing) {
      const modalEl = document.getElementById('gs-entity-modal');
      document.getElementById('gs-entity-modal-title').textContent = existing ? `Edit ${title.replace(/s$/, '')}` : `New ${title.replace(/s$/, '')}`;
      document.getElementById('gs-entity-modal-body').innerHTML = fields.map(f => renderField(f, existing)).join('');

      const form = document.getElementById('gs-entity-form');
      const newForm = form.cloneNode(true);
      form.parentNode.replaceChild(newForm, form);

      newForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {};
        fields.forEach(f => {
          const input = document.getElementById(`f-${f.name}`);
          if (!input) return;
          let val = f.type === 'checkbox' ? input.checked : input.value;
          if (f.type === 'number' && val !== '') val = Number(val);
          if (f.optional && val === '') val = null;
          payload[f.name] = val;
        });
        const saveBtn = document.getElementById('gs-entity-modal-save');
        saveBtn.disabled = true;
        try {
          if (existing && updateFn) await updateFn(existing[idKey], payload);
          else if (createFn) await createFn(payload);
          bootstrap.Modal.getOrCreateInstance(modalEl).hide();
          GsUtil.toast(`${title.replace(/s$/, '')} saved.`);
          module.reload();
          if (typeof window.gsRefreshAdminOptions === 'function') window.gsRefreshAdminOptions();
        } catch (err) {
          GsUtil.toast(GsUtil.apiErrorMessage(err), 'danger');
        } finally {
          saveBtn.disabled = false;
        }
      });

      bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }

    function renderField(f, existing) {
      const val = existing ? (existing[f.name] ?? '') : (f.default ?? '');
      if (f.type === 'select') {
        return `
          <div class="mb-3">
            <label class="form-label small fw-semibold">${f.label}</label>
            <select class="form-select" id="f-${f.name}">
              ${(f.options || []).map(o => `<option value="${o.value}" ${String(o.value) === String(val) ? 'selected' : ''}>${GsUtil.escapeHtml(o.label)}</option>`).join('')}
            </select>
          </div>`;
      }
      if (f.type === 'checkbox') {
        return `
          <div class="form-check form-switch mb-3">
            <input class="form-check-input" type="checkbox" id="f-${f.name}" ${val ? 'checked' : ''}>
            <label class="form-check-label" for="f-${f.name}">${f.label}</label>
          </div>`;
      }
      return `
        <div class="mb-3">
          <label class="form-label small fw-semibold">${f.label}</label>
          <input type="${f.type || 'text'}" class="form-control" id="f-${f.name}" value="${GsUtil.escapeHtml(val)}" ${f.required ? 'required' : ''} ${f.type === 'password' ? 'autocomplete="new-password"' : ''}>
        </div>`;
    }

    module.fields = fields;
    return module;
  }

  // ---- Departments ---------------------------------------------------------
  const Departments = crudModule({
    sectionId: 'sec-departments', title: 'Departments', addLabel: 'New department',
    listFn: () => GsApi.get('/api/admin/departments'),
    columns: [{ label: 'Code', key: 'code' }, { label: 'Name', key: 'name' }],
    fields: [{ name: 'code', label: 'Code', required: true }, { name: 'name', label: 'Name', required: true }],
    createFn: (p) => GsApi.post('/api/admin/departments', p),
    updateFn: (id, p) => GsApi.put(`/api/admin/departments/${id}`, p),
    deleteFn: (id) => GsApi.delete(`/api/admin/departments/${id}`),
  });

  // ---- Subjects -------------------------------------------------------------
  const Subjects = crudModule({
    sectionId: 'sec-subjects', title: 'Subjects', addLabel: 'New subject',
    listFn: () => GsApi.get('/api/admin/subjects'),
    columns: [
      { label: 'Code', key: 'code' }, { label: 'Name', key: 'name' },
      { label: 'Department', key: 'departmentName' }, { label: 'Semester', key: 'semester' },
      { label: 'Type', key: 'subjectType' },
    ],
    fields: [
      { name: 'code', label: 'Code', required: true },
      { name: 'name', label: 'Name', required: true },
      { name: 'departmentId', label: 'Department', type: 'select', options: [] },
      { name: 'semester', label: 'Semester', type: 'number', required: true },
      { name: 'credits', label: 'Credits', type: 'number', default: 3 },
      { name: 'subjectType', label: 'Type', type: 'select', options: [{ value: 'theory', label: 'Theory' }, { value: 'lab', label: 'Lab' }] },
    ],
    createFn: (p) => GsApi.post('/api/admin/subjects', p),
    updateFn: (id, p) => GsApi.put(`/api/admin/subjects/${id}`, p),
    deleteFn: (id) => GsApi.delete(`/api/admin/subjects/${id}`),
  });

  // ---- Classes ---------------------------------------------------------------
  const Classes = crudModule({
    sectionId: 'sec-classes', title: 'Classes', addLabel: 'New class',
    listFn: () => GsApi.get('/api/admin/classes'),
    columns: [
      { label: 'Name', key: 'name' }, { label: 'Department', key: 'departmentName' },
      { label: 'Sem.', key: 'semester' }, { label: 'Section', key: 'section' },
      { label: 'Year', key: 'academicYear' }, { label: 'Coordinator', key: 'coordinatorFacultyName' },
      { label: 'Students', key: 'studentCount' },
    ],
    fields: [
      { name: 'name', label: 'Name', required: true },
      { name: 'departmentId', label: 'Department', type: 'select', options: [] },
      { name: 'semester', label: 'Semester', type: 'number', required: true },
      { name: 'section', label: 'Section', required: true },
      { name: 'academicYear', label: 'Academic year (e.g. 2025-26)', required: true },
    ],
    createFn: (p) => GsApi.post('/api/admin/classes', p),
    updateFn: (id, p) => GsApi.put(`/api/admin/classes/${id}`, p),
  });

  // ---- Faculty ----------------------------------------------------------------
  const FacultyMod = crudModule({
    sectionId: 'sec-faculty', title: 'Faculty', addLabel: 'New faculty',
    listFn: () => GsApi.get('/api/admin/faculty'),
    columns: [
      { label: 'Emp. ID', key: 'employeeId' }, { label: 'Name', key: 'name' },
      { label: 'Email', key: 'email' }, { label: 'Department', key: 'departmentName' },
      { label: 'Designation', key: 'designation' },
      { label: 'Mentor', render: (i) => i.isMentor ? '<span class="badge-status badge-present">Yes</span>' : '<span class="gs-muted">No</span>' },
    ],
    fields: [
      { name: 'username', label: 'Username', required: true },
      { name: 'email', label: 'Email', type: 'email', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
      { name: 'employeeId', label: 'Employee ID', required: true },
      { name: 'name', label: 'Full name', required: true },
      { name: 'departmentId', label: 'Department', type: 'select', options: [] },
      { name: 'designation', label: 'Designation' },
      { name: 'phone', label: 'Phone' },
      { name: 'isMentor', label: 'Eligible to be a mentor', type: 'checkbox' },
    ],
    createFn: (p) => GsApi.post('/api/admin/faculty', p),
    updateFn: (id, p) => GsApi.put(`/api/admin/faculty/${id}`, p),
  });

  // ---- Students -----------------------------------------------------------------
  const StudentsMod = crudModule({
    sectionId: 'sec-students', title: 'Students', addLabel: 'New student',
    listFn: () => GsApi.get('/api/admin/students'),
    columns: [
      { label: 'Reg. no.', key: 'registerNo' }, { label: 'Name', key: 'name' },
      { label: 'Email', key: 'email' }, { label: 'Class', key: 'className' },
      { label: 'Mentor', key: 'mentorFacultyName' },
    ],
    fields: [
      { name: 'username', label: 'Username', required: true },
      { name: 'email', label: 'Email', type: 'email', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
      { name: 'registerNo', label: 'Register number', required: true },
      { name: 'name', label: 'Full name', required: true },
      { name: 'classId', label: 'Class', type: 'select', options: [] },
      { name: 'mentorFacultyId', label: 'Mentor faculty', type: 'select', options: [] },
      { name: 'phone', label: 'Phone' },
    ],
    createFn: (p) => GsApi.post('/api/admin/students', p),
    updateFn: (id, p) => GsApi.put(`/api/admin/students/${id}`, p),
  });

  // ---- Timetable (grid editor) ------------------------------------------------------
  const TT_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const TT_SESSIONS = [1, 2, 3, 4, 5, 6, 7, 8];

  const TimetableMod = {
    classes: [],
    faculty: [],
    subjects: [],
    slots: [],        // flat list from the API for the selected class
    slotByKey: {},     // "day-session" -> slot

    async render() {
      const el = document.getElementById('sec-timetable');
      el.innerHTML = `
        <div class="gs-card mb-3">
          <div class="gs-card-header">
            <h5>Timetable</h5>
            <div class="d-flex gap-2 align-items-center">
              <select class="form-select form-select-sm" id="tt-class-filter" style="width:260px;"></select>
            </div>
          </div>
          <div class="gs-card-body">
            <div class="form-text mb-2">Click <strong>+</strong> on an empty cell to schedule a session. Click a filled cell to edit or delete it.</div>
            <div id="tt-grid-wrap"><div class="text-center py-4"><span class="spinner-border spinner-border-sm"></span></div></div>
          </div>
        </div>

        <!-- Dedicated modal for the timetable cell editor (kept separate from the shared gs-entity-modal
             so the grid can stay untouched underneath while editing). -->
        <div class="modal fade" id="tt-cell-modal" tabindex="-1">
          <div class="modal-dialog">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title" id="tt-cell-modal-title">Schedule session</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body">
                <div class="alert alert-danger py-2 d-none" id="tt-cell-error"></div>
                <input type="hidden" id="tt-f-id">
                <input type="hidden" id="tt-f-classId">
                <input type="hidden" id="tt-f-dayOfWeek">
                <input type="hidden" id="tt-f-sessionNumber">
                <div class="mb-2 small text-muted" id="tt-cell-slot-label"></div>
                <div class="mb-3"><label class="form-label small fw-semibold">Faculty</label>
                  <select class="form-select" id="tt-f-facultyId" required></select></div>
                <div class="mb-3"><label class="form-label small fw-semibold">Subject</label>
                  <select class="form-select" id="tt-f-subjectId" required></select></div>
                <div class="mb-3"><label class="form-label small fw-semibold">Room</label>
                  <input type="text" class="form-control" id="tt-f-roomNumber" placeholder="e.g. LH-204"></div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-outline-danger me-auto d-none" id="tt-cell-delete-btn"><i class="bi bi-trash"></i> Delete</button>
                <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-gs-primary" id="tt-cell-save-btn">Save</button>
              </div>
            </div>
          </div>
        </div>`;

      const [classes, faculty, subjects] = await Promise.all([
        GsApi.get('/api/admin/classes'), GsApi.get('/api/admin/faculty'), GsApi.get('/api/admin/subjects'),
      ]);
      this.classes = classes;
      this.faculty = faculty;
      this.subjects = subjects;

      const filter = document.getElementById('tt-class-filter');
      filter.innerHTML = classes.map(c => `<option value="${c.id}">${GsUtil.escapeHtml(c.name)} (${GsUtil.escapeHtml(c.section)})</option>`).join('');
      filter.addEventListener('change', () => this.reload());

      document.getElementById('tt-cell-save-btn').addEventListener('click', () => this.saveCell());
      document.getElementById('tt-cell-delete-btn').addEventListener('click', () => this.deleteCell());

      if (classes.length) await this.reload();
      else document.getElementById('tt-grid-wrap').innerHTML = `<div class="gs-empty border-0"><i class="bi bi-calendar-week"></i>No classes defined yet — add a class first.</div>`;
    },

    async reload() {
      const wrap = document.getElementById('tt-grid-wrap');
      const classId = document.getElementById('tt-class-filter').value;
      if (!classId) return;
      wrap.innerHTML = `<div class="text-center py-4"><span class="spinner-border spinner-border-sm"></span></div>`;
      try {
        this.slots = await GsApi.get('/api/admin/timetable', { classId });
        this.slotByKey = {};
        this.slots.forEach(s => { this.slotByKey[`${s.dayOfWeek}-${s.sessionNumber}`] = s; });
        this.paintGrid();
      } catch (err) {
        wrap.innerHTML = `<div class="alert alert-danger py-2">${GsUtil.escapeHtml(GsUtil.apiErrorMessage(err))}</div>`;
      }
    },

    paintGrid() {
      const wrap = document.getElementById('tt-grid-wrap');
      const cls = this.classes.find(c => String(c.id) === document.getElementById('tt-class-filter').value);
      const heading = cls ? `${GsUtil.escapeHtml(cls.name)} ${GsUtil.escapeHtml(cls.section || '')}` : '';

      let html = `<div class="fw-semibold mb-2">${heading}</div>`;
      html += `<div class="table-responsive"><table class="table table-bordered table-gs text-center align-middle mb-0 gs-tt-grid">
        <thead><tr><th>Session</th>${TT_DAYS.map(d => `<th>${d}</th>`).join('')}</tr></thead><tbody>`;

      TT_SESSIONS.forEach(session => {
        html += `<tr><th class="text-muted">${session}</th>`;
        TT_DAYS.forEach(day => {
          const slot = this.slotByKey[`${day}-${session}`];
          if (slot) {
            html += `<td class="gs-tt-cell gs-tt-filled" data-day="${day}" data-session="${session}" role="button">
              <div class="fw-semibold small">${GsUtil.escapeHtml(slot.subjectName)}</div>
              <div class="text-muted" style="font-size:.75rem;">${GsUtil.escapeHtml(slot.facultyName)}</div>
              ${slot.roomNumber ? `<div class="text-muted" style="font-size:.7rem;">${GsUtil.escapeHtml(slot.roomNumber)}</div>` : ''}
            </td>`;
          } else {
            html += `<td class="gs-tt-cell gs-tt-empty" data-day="${day}" data-session="${session}" role="button">+</td>`;
          }
        });
        html += `</tr>`;
      });
      html += `</tbody></table></div>`;
      wrap.innerHTML = html;

      wrap.querySelectorAll('.gs-tt-cell').forEach(cell => {
        cell.addEventListener('click', () => this.openCell(cell.dataset.day, Number(cell.dataset.session)));
      });
    },

    openCell(day, session) {
      const classId = document.getElementById('tt-class-filter').value;
      const slot = this.slotByKey[`${day}-${session}`];
      const errBox = document.getElementById('tt-cell-error');
      errBox.classList.add('d-none');
      errBox.textContent = '';

      document.getElementById('tt-f-id').value = slot ? slot.id : '';
      document.getElementById('tt-f-classId').value = classId;
      document.getElementById('tt-f-dayOfWeek').value = day;
      document.getElementById('tt-f-sessionNumber').value = session;
      document.getElementById('tt-cell-slot-label').textContent = `${day}, session ${session}`;
      document.getElementById('tt-cell-modal-title').textContent = slot ? 'Edit session' : 'Schedule session';
      document.getElementById('tt-cell-delete-btn').classList.toggle('d-none', !slot);

      const facultySel = document.getElementById('tt-f-facultyId');
      facultySel.innerHTML = this.faculty.map(f => `<option value="${f.id}">${GsUtil.escapeHtml(f.name)}</option>`).join('');
      const subjectSel = document.getElementById('tt-f-subjectId');
      subjectSel.innerHTML = this.subjects.map(s => `<option value="${s.id}">${GsUtil.escapeHtml(s.name)}</option>`).join('');

      if (slot) {
        facultySel.value = slot.facultyId;
        subjectSel.value = slot.subjectId;
        document.getElementById('tt-f-roomNumber').value = slot.roomNumber || '';
      } else {
        document.getElementById('tt-f-roomNumber').value = '';
      }

      bootstrap.Modal.getOrCreateInstance(document.getElementById('tt-cell-modal')).show();
    },

    buildPayload() {
      return {
        classId: Number(document.getElementById('tt-f-classId').value),
        facultyId: Number(document.getElementById('tt-f-facultyId').value),
        subjectId: Number(document.getElementById('tt-f-subjectId').value),
        dayOfWeek: document.getElementById('tt-f-dayOfWeek').value,
        sessionNumber: Number(document.getElementById('tt-f-sessionNumber').value),
        roomNumber: document.getElementById('tt-f-roomNumber').value.trim() || null,
      };
      // Note: faculty_subject_id is intentionally NOT sent — the backend resolves/creates it
      // from facultyId + subjectId + classId, so the user never has to pick a database id.
    },

    async saveCell() {
      const id = document.getElementById('tt-f-id').value;
      const payload = this.buildPayload();
      const errBox = document.getElementById('tt-cell-error');
      errBox.classList.add('d-none');
      try {
        if (id) await GsApi.put(`/api/admin/timetable/${id}`, payload);
        else await GsApi.post('/api/admin/timetable', payload);
        bootstrap.Modal.getOrCreateInstance(document.getElementById('tt-cell-modal')).hide();
        GsUtil.toast(id ? 'Session updated.' : 'Session scheduled.');
        await this.reload();
      } catch (err) {
        errBox.textContent = GsUtil.apiErrorMessage(err);
        errBox.classList.remove('d-none');
      }
    },

    async deleteCell() {
      const id = document.getElementById('tt-f-id').value;
      if (!id) return;
      const ok = await GsUtil.confirm({ title: 'Delete this session?', body: 'This slot will be removed from the timetable.', confirmText: 'Delete', danger: true });
      if (!ok) return;
      try {
        await GsApi.delete(`/api/admin/timetable/${id}`);
        bootstrap.Modal.getOrCreateInstance(document.getElementById('tt-cell-modal')).hide();
        GsUtil.toast('Session removed.');
        await this.reload();
      } catch (err) {
        GsUtil.toast(GsUtil.apiErrorMessage(err), 'danger');
      }
    },
  };

  // ---- Faculty-Subject assignments -------------------------------------------------
  const Assignments = {
    async render() {
      const el = document.getElementById('sec-assignments');
      const faculty = await GsApi.get('/api/admin/faculty');
      el.innerHTML = `
        <div class="gs-card mb-3">
          <div class="gs-card-header">
            <h5>Faculty ↔ subject assignments</h5>
            <div class="d-flex gap-2">
              <select class="form-select form-select-sm" id="as-faculty-select" style="width:240px;">
                ${faculty.map(f => `<option value="${f.id}">${GsUtil.escapeHtml(f.name)}</option>`).join('')}
              </select>
              <button class="btn btn-gs-primary btn-sm" id="as-add-btn"><i class="bi bi-plus-lg"></i> Assign</button>
            </div>
          </div>
          <div class="table-responsive"><table class="table table-gs mb-0">
            <thead><tr><th>Subject</th><th>Class</th><th>Academic year</th></tr></thead>
            <tbody id="as-body"></tbody>
          </table></div>
        </div>`;
      document.getElementById('as-faculty-select').addEventListener('change', () => this.reload());
      document.getElementById('as-add-btn').addEventListener('click', () => this.openForm());
      await this.reload();
    },
    async reload() {
      const facultyId = document.getElementById('as-faculty-select').value;
      const body = document.getElementById('as-body');
      try {
        const rows = await GsApi.get(`/api/admin/faculty-subjects/faculty/${facultyId}`);
        body.innerHTML = rows.length
          ? rows.map(r => `<tr><td>${GsUtil.escapeHtml(r.subjectName)} (${GsUtil.escapeHtml(r.subjectCode)})</td><td>${GsUtil.escapeHtml(r.className)}</td><td>${GsUtil.escapeHtml(r.academicYear)}</td></tr>`).join('')
          : `<tr><td colspan="3" class="gs-empty border-0"><i class="bi bi-diagram-3"></i>No assignments for this faculty yet.</td></tr>`;
      } catch (err) {
        body.innerHTML = `<tr><td colspan="3" class="text-danger text-center py-3">${GsUtil.escapeHtml(GsUtil.apiErrorMessage(err))}</td></tr>`;
      }
    },
    async openForm() {
      const facultyId = document.getElementById('as-faculty-select').value;
      const [subjects, classes] = await Promise.all([GsApi.get('/api/admin/subjects'), GsApi.get('/api/admin/classes')]);
      const modalEl = document.getElementById('gs-entity-modal');
      document.getElementById('gs-entity-modal-title').textContent = 'Assign subject to faculty';
      document.getElementById('gs-entity-modal-body').innerHTML = `
        <div class="mb-3"><label class="form-label small fw-semibold">Subject</label>
          <select class="form-select" id="f-subjectId">${subjects.map(s => `<option value="${s.id}">${GsUtil.escapeHtml(s.name)}</option>`).join('')}</select></div>
        <div class="mb-3"><label class="form-label small fw-semibold">Class</label>
          <select class="form-select" id="f-classId">${classes.map(c => `<option value="${c.id}">${GsUtil.escapeHtml(c.name)}</option>`).join('')}</select></div>
        <div class="mb-3"><label class="form-label small fw-semibold">Academic year</label>
          <input type="text" class="form-control" id="f-academicYear" placeholder="2025-26" required></div>`;

      const form = document.getElementById('gs-entity-form');
      const newForm = form.cloneNode(true);
      form.parentNode.replaceChild(newForm, form);
      newForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await GsApi.post('/api/admin/faculty-subjects', {
            facultyId: Number(facultyId),
            subjectId: Number(document.getElementById('f-subjectId').value),
            classId: Number(document.getElementById('f-classId').value),
            academicYear: document.getElementById('f-academicYear').value,
          });
          bootstrap.Modal.getOrCreateInstance(modalEl).hide();
          GsUtil.toast('Assignment created.');
          Assignments.reload();
        } catch (err) { GsUtil.toast(GsUtil.apiErrorMessage(err), 'danger'); }
      });
      bootstrap.Modal.getOrCreateInstance(modalEl).show();
    },
  };

  // ---- Mentors ---------------------------------------------------------------------
  const Mentors = {
    async render() {
      const el = document.getElementById('sec-mentors');
      el.innerHTML = `
        <div class="gs-card">
          <div class="gs-card-header"><h5>Assign a mentor</h5></div>
          <div class="gs-card-body">
            <p class="gs-muted small">Each student has exactly one mentor; a mentor-eligible faculty member may mentor many students.</p>
            <div class="row g-3 align-items-end">
              <div class="col-md-5">
                <label class="form-label small fw-semibold">Student</label>
                <select class="form-select" id="mentor-student-select"></select>
              </div>
              <div class="col-md-5">
                <label class="form-label small fw-semibold">Mentor faculty</label>
                <select class="form-select" id="mentor-faculty-select"></select>
              </div>
              <div class="col-md-2">
                <button class="btn btn-gs-primary w-100" id="mentor-assign-btn">Assign</button>
              </div>
            </div>
          </div>
        </div>`;
      const [students, eligibleFaculty] = await Promise.all([
        GsApi.get('/api/admin/students'), GsApi.get('/api/admin/faculty/mentor-eligible'),
      ]);
      document.getElementById('mentor-student-select').innerHTML =
        students.map(s => `<option value="${s.id}">${GsUtil.escapeHtml(s.name)} (${GsUtil.escapeHtml(s.registerNo)}) — current: ${GsUtil.escapeHtml(s.mentorFacultyName || 'none')}</option>`).join('');
      document.getElementById('mentor-faculty-select').innerHTML =
        eligibleFaculty.map(f => `<option value="${f.id}">${GsUtil.escapeHtml(f.name)}</option>`).join('');

      document.getElementById('mentor-assign-btn').addEventListener('click', async () => {
        try {
          await GsApi.post('/api/admin/mentors/assign', {
            studentId: Number(document.getElementById('mentor-student-select').value),
            mentorFacultyId: Number(document.getElementById('mentor-faculty-select').value),
          });
          GsUtil.toast('Mentor assigned.');
          Mentors.render();
        } catch (err) { GsUtil.toast(GsUtil.apiErrorMessage(err), 'danger'); }
      });
    },
  };

  // ---- Coordinators -------------------------------------------------------------------
  const Coordinators = {
    async render() {
      const el = document.getElementById('sec-coordinators');
      const classes = await GsApi.get('/api/admin/classes');
      const faculty = await GsApi.get('/api/admin/faculty');
      el.innerHTML = `
        <div class="row g-3">
          <div class="col-lg-6">
            <div class="gs-card">
              <div class="gs-card-header"><h5>Assign / transfer coordinator</h5></div>
              <div class="gs-card-body">
                <div class="mb-3"><label class="form-label small fw-semibold">Class</label>
                  <select class="form-select" id="co-class-select">
                    ${classes.map(c => `<option value="${c.id}">${GsUtil.escapeHtml(c.name)} — current: ${GsUtil.escapeHtml(c.coordinatorFacultyName || 'none')}</option>`).join('')}
                  </select></div>
                <div class="mb-3"><label class="form-label small fw-semibold">New coordinator</label>
                  <select class="form-select" id="co-faculty-select">${faculty.map(f => `<option value="${f.id}">${GsUtil.escapeHtml(f.name)}</option>`).join('')}</select></div>
                <div class="mb-3"><label class="form-label small fw-semibold">Reason (optional)</label>
                  <input type="text" class="form-control" id="co-reason"></div>
                <div class="d-flex gap-2">
                  <button class="btn btn-gs-primary" id="co-assign-btn">Assign</button>
                  <button class="btn btn-outline-danger" id="co-transfer-btn">Force transfer</button>
                </div>
              </div>
            </div>
          </div>
          <div class="col-lg-6">
            <div class="gs-card">
              <div class="gs-card-header"><h5>Transfer history</h5></div>
              <div class="table-responsive" style="max-height:360px;overflow-y:auto;">
                <table class="table table-gs mb-0">
                  <thead><tr><th>Old</th><th>New</th><th>Reason</th><th>When</th></tr></thead>
                  <tbody id="co-history-body"></tbody>
                </table>
              </div>
            </div>
          </div>
        </div>`;

      document.getElementById('co-class-select').addEventListener('change', () => this.loadHistory());
      document.getElementById('co-assign-btn').addEventListener('click', () => this.assign());
      document.getElementById('co-transfer-btn').addEventListener('click', () => this.transfer());
      await this.loadHistory();
    },
    async loadHistory() {
      const classId = document.getElementById('co-class-select').value;
      const body = document.getElementById('co-history-body');
      try {
        const rows = await GsApi.get(`/api/admin/coordinators/history/${classId}`);
        body.innerHTML = rows.length
          ? rows.map(r => `<tr><td>${GsUtil.escapeHtml(r.oldFacultyName || '—')}</td><td>${GsUtil.escapeHtml(r.newFacultyName || '—')}</td><td>${GsUtil.escapeHtml(r.transferReason || '—')}</td><td>${GsUtil.formatDate(r.assignedAt)}</td></tr>`).join('')
          : `<tr><td colspan="4" class="gs-empty border-0"><i class="bi bi-clock-history"></i>No history yet.</td></tr>`;
      } catch (err) {
        body.innerHTML = `<tr><td colspan="4" class="text-danger text-center py-3">${GsUtil.escapeHtml(GsUtil.apiErrorMessage(err))}</td></tr>`;
      }
    },
    async assign() {
      try {
        await GsApi.post('/api/admin/coordinators/assign', {
          classId: Number(document.getElementById('co-class-select').value),
          facultyId: Number(document.getElementById('co-faculty-select').value),
          reason: document.getElementById('co-reason').value || null,
        });
        GsUtil.toast('Coordinator assigned.');
        Coordinators.render();
      } catch (err) { GsUtil.toast(GsUtil.apiErrorMessage(err), 'danger'); }
    },
    async transfer() {
      const ok = await GsUtil.confirm({ title: 'Force transfer coordinator?', confirmText: 'Transfer', danger: true });
      if (!ok) return;
      try {
        await GsApi.post('/api/admin/coordinators/force-transfer', {
          classId: Number(document.getElementById('co-class-select').value),
          newFacultyId: Number(document.getElementById('co-faculty-select').value),
          reason: document.getElementById('co-reason').value || null,
        });
        GsUtil.toast('Coordinator transferred.');
        Coordinators.render();
      } catch (err) { GsUtil.toast(GsUtil.apiErrorMessage(err), 'danger'); }
    },
  };

  // ---- User accounts (activate/deactivate/reset password) ------------------------------
  const Users = {
    async render() {
      const el = document.getElementById('sec-users');
      el.innerHTML = `
        <div class="gs-card">
          <div class="gs-card-header">
            <h5>User accounts</h5>
            <select class="form-select form-select-sm" id="user-role-filter" style="width:180px;">
              <option value="">All roles</option>
              <option value="ADMIN">Admin</option>
              <option value="FACULTY">Faculty</option>
              <option value="STUDENT">Student</option>
            </select>
          </div>
          <div class="table-responsive"><table class="table table-gs table-hover mb-0">
            <thead><tr><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th><th></th></tr></thead>
            <tbody id="user-body"></tbody>
          </table></div>
        </div>`;
      document.getElementById('user-role-filter').addEventListener('change', () => this.reload());
      await this.reload();
    },
    async reload() {
      const role = document.getElementById('user-role-filter').value || undefined;
      const body = document.getElementById('user-body');
      try {
        const users = await GsApi.get('/api/admin/users', { role });
        body.innerHTML = users.length ? users.map(u => `
          <tr>
            <td>${GsUtil.escapeHtml(u.username)}</td><td>${GsUtil.escapeHtml(u.email)}</td><td>${GsUtil.escapeHtml(u.role)}</td>
            <td>${u.isActive ? '<span class="badge-status badge-present">Active</span>' : '<span class="badge-status badge-absent">Inactive</span>'}</td>
            <td>${GsUtil.formatDateTime(u.lastLogin)}</td>
            <td class="text-end">
              <button class="btn btn-sm btn-light toggle-active-btn" data-id="${u.id}" data-active="${u.isActive}">${u.isActive ? 'Deactivate' : 'Activate'}</button>
              <button class="btn btn-sm btn-light reset-pw-btn" data-id="${u.id}">Reset password</button>
            </td>
          </tr>`).join('') : `<tr><td colspan="6" class="gs-empty border-0"><i class="bi bi-shield-lock"></i>No users found.</td></tr>`;

        body.querySelectorAll('.toggle-active-btn').forEach(btn => btn.addEventListener('click', async () => {
          const activate = btn.dataset.active !== 'true';
          try {
            await GsApi.patch(`/api/admin/users/${btn.dataset.id}/${activate ? 'activate' : 'deactivate'}`);
            GsUtil.toast(`User ${activate ? 'activated' : 'deactivated'}.`);
            Users.reload();
          } catch (err) { GsUtil.toast(GsUtil.apiErrorMessage(err), 'danger'); }
        }));
        body.querySelectorAll('.reset-pw-btn').forEach(btn => btn.addEventListener('click', async () => {
          const newPassword = prompt('Enter a new password for this user (min 8 characters):');
          if (!newPassword) return;
          try {
            await GsApi.post(`/api/admin/users/${btn.dataset.id}/reset-password`, { newPassword });
            GsUtil.toast('Password reset.');
          } catch (err) { GsUtil.toast(GsUtil.apiErrorMessage(err), 'danger'); }
        }));
      } catch (err) {
        body.innerHTML = `<tr><td colspan="6" class="text-danger text-center py-3">${GsUtil.escapeHtml(GsUtil.apiErrorMessage(err))}</td></tr>`;
      }
    },
  };

  // ---- Reports (full Reports Module: 8 report types, each with filters + export) --------
  const Reports = {
    async render() {
      const el = document.getElementById('sec-reports');
      const [classes, faculty, students, facultySubjects] = await Promise.all([
        GsApi.get('/api/admin/classes').catch(() => []),
        GsApi.get('/api/admin/faculty').catch(() => []),
        GsApi.get('/api/admin/students').catch(() => []),
        GsApi.get('/api/admin/faculty-subjects').catch(() => []),
      ]);
      this._data = { classes, faculty, students, facultySubjects };

      const tabs = [
        ['daily', 'Daily', 'bi-calendar-day'],
        ['weekly', 'Weekly', 'bi-calendar-week'],
        ['monthly', 'Monthly', 'bi-calendar3'],
        ['semester', 'Semester', 'bi-calendar-range'],
        ['subjectwise', 'Subject-wise', 'bi-journal-bookmark'],
        ['studentwise', 'Student-wise', 'bi-person'],
        ['facultywise', 'Faculty-wise', 'bi-person-badge'],
        ['classwise', 'Class-wise', 'bi-people'],
      ];

      el.innerHTML = `
        <ul class="nav nav-pills mb-3 flex-wrap" id="rep-tabs">
          ${tabs.map(([key, label, icon], i) => `
            <li class="nav-item"><button class="nav-link ${i === 0 ? 'active' : ''}" data-tab="${key}"><i class="bi ${icon} me-1"></i>${label}</button></li>`).join('')}
        </ul>
        <div class="gs-card"><div class="gs-card-body" id="rep-tab-body"></div></div>`;

      document.querySelectorAll('#rep-tabs .nav-link').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#rep-tabs .nav-link').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.renderTab(btn.dataset.tab);
        });
      });
      this.renderTab('daily');
    },

    classOptions() { return this._data.classes.map(c => `<option value="${c.id}">${GsUtil.escapeHtml(c.name)}</option>`).join(''); },
    facultyOptions() { return this._data.faculty.map(f => `<option value="${f.id}">${GsUtil.escapeHtml(f.name ?? f.fullName ?? f.username ?? ('#' + f.id))}</option>`).join(''); },
    studentOptions() { return this._data.students.map(s => `<option value="${s.id}">${GsUtil.escapeHtml(s.name ?? s.fullName ?? s.username ?? ('#' + s.id))} — ${GsUtil.escapeHtml(s.registerNo ?? '')}</option>`).join(''); },
    facultySubjectOptions() { return this._data.facultySubjects.map(fs => `<option value="${fs.id}">${GsUtil.escapeHtml(fs.subjectName ?? fs.subject ?? '')} — ${GsUtil.escapeHtml(fs.className ?? fs.facultyName ?? '')}</option>`).join(''); },

    /** Calls `path` with `params`; on 404/failure shows a friendly "backend endpoint needed" note
     *  instead of throwing, since some report types need a small new admin endpoint
     *  (see REPORT_MODULE_COMPLETION.md for the proposed contract). */
    async loadInto(container, { path, params, title, emptyMessage, proposedNote }) {
      container.innerHTML = `<div class="text-center py-3"><span class="spinner-border spinner-border-sm"></span></div>`;
      try {
        const rows = await GsApi.get(path, params);
        GsReportUI.renderReportTable({ container, rows, title, emptyMessage: emptyMessage || 'No records for this report.' });
      } catch (err) {
        container.innerHTML = `
          <div class="alert alert-warning py-2 mb-0">
            <strong>This report needs one small backend addition.</strong>
            ${proposedNote ? `<div class="small mt-1">${proposedNote}</div>` : ''}
            <div class="small text-muted mt-1">Server said: ${GsUtil.escapeHtml(GsUtil.apiErrorMessage(err))}</div>
          </div>`;
      }
    },

    renderTab(tab) {
      const body = document.getElementById('rep-tab-body');
      const today = new Date().toISOString().slice(0, 10);

      if (tab === 'daily') {
        body.innerHTML = `
          <div class="row g-2 align-items-end mb-3">
            <div class="col-md-5"><label class="form-label small fw-semibold">Class</label>
              <select class="form-select" id="rep-daily-class">${this.classOptions()}</select></div>
            <div class="col-md-4"><label class="form-label small fw-semibold">Date</label>
              <input type="date" class="form-control" id="rep-daily-date" value="${today}"></div>
            <div class="col-md-3"><button class="btn btn-gs-primary w-100" id="rep-daily-btn">Load</button></div>
          </div>
          <div id="rep-daily-out"></div>`;
        document.getElementById('rep-daily-btn').addEventListener('click', () => this.loadInto(
          document.getElementById('rep-daily-out'),
          {
            path: `/api/admin/reports/daily/${document.getElementById('rep-daily-class').value}`,
            params: { date: document.getElementById('rep-daily-date').value },
            title: 'Daily attendance report',
            emptyMessage: 'No sessions recorded for this date.',
            proposedNote: 'Proposed: <code>GET /api/admin/reports/daily/{classId}?date=YYYY-MM-DD</code> returning one row per student/session for that day.',
          }
        ));
        document.getElementById('rep-daily-btn').click();
        return;
      }

      if (tab === 'weekly') {
        body.innerHTML = `
          <div class="row g-2 align-items-end mb-3">
            <div class="col-md-9"><label class="form-label small fw-semibold">Trend window</label>
              <select class="form-select" id="rep-weekly-days">
                <option value="7">Last 7 days</option><option value="14">Last 14 days</option><option value="30">Last 30 days</option>
              </select></div>
            <div class="col-md-3"><button class="btn btn-gs-primary w-100" id="rep-weekly-btn">Load</button></div>
          </div>
          <div id="rep-weekly-out"></div>`;
        document.getElementById('rep-weekly-btn').addEventListener('click', () => this.loadInto(
          document.getElementById('rep-weekly-out'),
          {
            path: '/api/admin/reports/daily-stats',
            params: { sinceDays: document.getElementById('rep-weekly-days').value },
            title: 'Weekly attendance report',
            emptyMessage: 'No attendance data for this window.',
          }
        ));
        document.getElementById('rep-weekly-btn').click();
        return;
      }

      if (tab === 'monthly') {
        body.innerHTML = `
          <div class="row g-2 align-items-end mb-3">
            <div class="col-md-4"><label class="form-label small fw-semibold">Class</label>
              <select class="form-select" id="rep-monthly-class">${this.classOptions()}</select></div>
            <div class="col-md-3"><label class="form-label small fw-semibold">Year</label>
              <input type="number" class="form-control" id="rep-monthly-year" value="${new Date().getFullYear()}"></div>
            <div class="col-md-2"><label class="form-label small fw-semibold">Month</label>
              <input type="number" min="1" max="12" class="form-control" id="rep-monthly-month" value="${new Date().getMonth() + 1}"></div>
            <div class="col-md-3"><button class="btn btn-gs-primary w-100" id="rep-monthly-btn">Load</button></div>
          </div>
          <div id="rep-monthly-out"></div>`;
        document.getElementById('rep-monthly-btn').addEventListener('click', () => this.loadInto(
          document.getElementById('rep-monthly-out'),
          {
            path: `/api/admin/reports/monthly/${document.getElementById('rep-monthly-class').value}`,
            params: { year: document.getElementById('rep-monthly-year').value, month: document.getElementById('rep-monthly-month').value },
            title: 'Monthly class report',
            emptyMessage: 'No records for this period.',
          }
        ));
        document.getElementById('rep-monthly-btn').click();
        return;
      }

      if (tab === 'semester') {
        body.innerHTML = `
          <div class="row g-2 align-items-end mb-3">
            <div class="col-md-4"><label class="form-label small fw-semibold">Class</label>
              <select class="form-select" id="rep-sem-class">${this.classOptions()}</select></div>
            <div class="col-md-4"><label class="form-label small fw-semibold">From</label>
              <input type="date" class="form-control" id="rep-sem-from"></div>
            <div class="col-md-4"><label class="form-label small fw-semibold">To</label>
              <input type="date" class="form-control" id="rep-sem-to" value="${today}"></div>
            <div class="col-md-3 mt-2"><button class="btn btn-gs-primary w-100" id="rep-sem-btn">Load</button></div>
          </div>
          <div id="rep-sem-out"></div>`;
        document.getElementById('rep-sem-btn').addEventListener('click', () => this.loadInto(
          document.getElementById('rep-sem-out'),
          {
            path: `/api/admin/reports/semester/${document.getElementById('rep-sem-class').value}`,
            params: { from: document.getElementById('rep-sem-from').value, to: document.getElementById('rep-sem-to').value },
            title: 'Semester attendance report',
            emptyMessage: 'No records for this semester range.',
            proposedNote: 'Proposed: <code>GET /api/admin/reports/semester/{classId}?from=YYYY-MM-DD&to=YYYY-MM-DD</code> aggregating attendance % per subject across the range.',
          }
        ));
        return;
      }

      if (tab === 'subjectwise') {
        body.innerHTML = `
          <div class="row g-2 align-items-end mb-3">
            <div class="col-md-9"><label class="form-label small fw-semibold">Faculty subject assignment</label>
              <select class="form-select" id="rep-subj-fs">${this.facultySubjectOptions()}</select></div>
            <div class="col-md-3"><button class="btn btn-gs-primary w-100" id="rep-subj-btn">Load</button></div>
          </div>
          <div id="rep-subj-out"></div>`;
        document.getElementById('rep-subj-btn').addEventListener('click', () => this.loadInto(
          document.getElementById('rep-subj-out'),
          {
            path: `/api/admin/reports/faculty-subjects/${document.getElementById('rep-subj-fs').value}`,
            title: 'Subject-wise report',
            emptyMessage: 'No records for this subject yet.',
          }
        ));
        document.getElementById('rep-subj-btn').click();
        return;
      }

      if (tab === 'studentwise') {
        body.innerHTML = `
          <div class="row g-2 align-items-end mb-3">
            <div class="col-md-9"><label class="form-label small fw-semibold">Student</label>
              <select class="form-select" id="rep-stu-id">${this.studentOptions()}</select></div>
            <div class="col-md-3"><button class="btn btn-gs-primary w-100" id="rep-stu-btn">Load</button></div>
          </div>
          <div id="rep-stu-out"></div>`;
        document.getElementById('rep-stu-btn').addEventListener('click', () => this.loadInto(
          document.getElementById('rep-stu-out'),
          {
            path: `/api/admin/reports/student/${document.getElementById('rep-stu-id').value}`,
            title: 'Student-wise report',
            emptyMessage: 'No records for this student yet.',
            proposedNote: 'Proposed: <code>GET /api/admin/reports/student/{studentId}</code> returning the same per-subject shape as <code>/api/student/attendance/summary</code>, but callable by ADMIN for any student.',
          }
        ));
        return;
      }

      if (tab === 'facultywise') {
        body.innerHTML = `
          <div class="row g-2 align-items-end mb-3">
            <div class="col-md-9"><label class="form-label small fw-semibold">Faculty</label>
              <select class="form-select" id="rep-fac-id">${this.facultyOptions()}</select></div>
            <div class="col-md-3"><button class="btn btn-gs-primary w-100" id="rep-fac-btn">Load</button></div>
          </div>
          <div id="rep-fac-out"></div>`;
        document.getElementById('rep-fac-btn').addEventListener('click', () => this.loadInto(
          document.getElementById('rep-fac-out'),
          {
            path: `/api/admin/reports/faculty/${document.getElementById('rep-fac-id').value}`,
            title: 'Faculty-wise report',
            emptyMessage: 'No records for this faculty member yet.',
            proposedNote: 'Proposed: <code>GET /api/admin/reports/faculty/{facultyId}</code> aggregating attendance stats across every subject that faculty teaches.',
          }
        ));
        return;
      }

      if (tab === 'classwise') {
        body.innerHTML = `
          <div class="row g-2 align-items-end mb-3">
            <div class="col-md-5"><label class="form-label small fw-semibold">Class</label>
              <select class="form-select" id="rep-cls-class">${this.classOptions()}</select></div>
            <div class="col-md-3"><label class="form-label small fw-semibold">Defaulter threshold %</label>
              <input type="number" class="form-control" id="rep-cls-threshold" value="${GS_DEFAULTER_THRESHOLD}"></div>
            <div class="col-md-4"><button class="btn btn-gs-primary w-100" id="rep-cls-btn">Load</button></div>
          </div>
          <h6 class="mt-2">Defaulters</h6>
          <div id="rep-cls-def-out" class="mb-4"></div>
          <h6>Overall class averages</h6>
          <div id="rep-cls-avg-out"></div>`;
        document.getElementById('rep-cls-btn').addEventListener('click', () => {
          const classId = document.getElementById('rep-cls-class').value;
          this.loadInto(document.getElementById('rep-cls-def-out'), {
            path: `/api/admin/reports/defaulters/${classId}`,
            params: { threshold: document.getElementById('rep-cls-threshold').value },
            title: 'Class-wise report — defaulters',
            emptyMessage: 'No defaulters below this threshold.',
          });
          this.loadInto(document.getElementById('rep-cls-avg-out'), {
            path: '/api/admin/reports/department-averages',
            title: 'Class-wise report — department averages',
            emptyMessage: 'No averages available.',
          });
        });
        document.getElementById('rep-cls-btn').click();
        return;
      }
    },
  };

  // ---- Audit logs ---------------------------------------------------------------------
  const AuditLogs = {
    async render() {
      const el = document.getElementById('sec-audit-logs');
      el.innerHTML = `
        <div class="gs-card">
          <div class="gs-card-header"><h5>Recent activity</h5></div>
          <div class="table-responsive"><table class="table table-gs mb-0">
            <thead><tr><th>User</th><th>Action</th><th>Table</th><th>Record</th><th>When</th></tr></thead>
            <tbody id="audit-body"><tr><td colspan="5" class="text-center py-4"><span class="spinner-border spinner-border-sm"></span></td></tr></tbody>
          </table></div>
        </div>`;
      try {
        const logs = await GsApi.get('/api/admin/audit-logs');
        document.getElementById('audit-body').innerHTML = logs.length
          ? logs.map(l => `<tr><td>${GsUtil.escapeHtml(l.username)}</td><td>${GsUtil.escapeHtml(l.action)}</td><td>${GsUtil.escapeHtml(l.tableName)}</td><td>${l.recordId ?? '—'}</td><td>${GsUtil.formatDateTime(l.createdAt)}</td></tr>`).join('')
          : `<tr><td colspan="5" class="gs-empty border-0"><i class="bi bi-clock-history"></i>No activity yet.</td></tr>`;
      } catch (err) {
        document.getElementById('audit-body').innerHTML = `<tr><td colspan="5" class="text-danger text-center py-3">${GsUtil.escapeHtml(GsUtil.apiErrorMessage(err))}</td></tr>`;
      }
    },
  };

  // Hydrate select-type fields (department/class/faculty dropdowns) for the
  // generic CRUD modules once the reference lists are known, so "New" forms
  // show real options instead of being empty on first open. Each module's
  // reload() also calls this again so lists stay fresh as data changes.
  function patch(fields, name, options) {
    const f = fields.find(x => x.name === name);
    if (f) f.options = options;
  }

  async function hydrateSelectOptions() {
    try {
      // Reference-data reads (rarely change) are cached briefly via GsPerf so
      // switching sections repeatedly, or opening several create/edit modals
      // in a row, doesn't re-issue the same three GET requests every time.
      const [depts, classes, facultyList] = await Promise.all([
        GsPerf.cachedGet('/api/admin/departments'), GsPerf.cachedGet('/api/admin/classes'), GsPerf.cachedGet('/api/admin/faculty'),
      ]);
      const deptOptions = depts.map(d => ({ value: d.id, label: d.name }));
      const classOptions = classes.map(c => ({ value: c.id, label: `${c.name} (${c.section})` }));
      const facultyOptions = facultyList.map(f => ({ value: f.id, label: f.name }));

      patch(Subjects.fields, 'departmentId', deptOptions);
      patch(Classes.fields, 'departmentId', deptOptions);
      patch(FacultyMod.fields, 'departmentId', deptOptions);
      patch(StudentsMod.fields, 'classId', classOptions);
      patch(StudentsMod.fields, 'mentorFacultyId', facultyOptions);
    } catch (e) { /* best effort; forms still usable, just fewer prefilled options */ }
  }
  window.gsRefreshAdminOptions = () => {
    // A save happened — the cached reference-data reads may now be stale.
    GsPerf.invalidateCache('/api/admin/departments');
    GsPerf.invalidateCache('/api/admin/classes');
    GsPerf.invalidateCache('/api/admin/faculty');
    return hydrateSelectOptions();
  };
  hydrateSelectOptions();

  const params = new URLSearchParams(window.location.search);
  const initialSection = params.get('section') || window.location.hash.slice(1);
  if (initialSection && sectionTitles[initialSection]) {
    const link = document.querySelector(`.gs-nav-link[data-section="${initialSection}"]`);
    if (link) {
      link.click();
    } else {
      ensureLoaded('overview');
    }
  } else {
    ensureLoaded('overview');
  }
})();
