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
  async function pollNotifCount() {
    try {
      const { count } = await GsApi.get('/api/notifications/unread-count');
      const badge = document.getElementById('notif-count-badge');
      if (count > 0) { badge.textContent = count; badge.classList.remove('d-none'); }
      else badge.classList.add('d-none');
    } catch (e) { /* ignore */ }
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
              <select class="form-select form-select-sm" id="tt-class-filter"