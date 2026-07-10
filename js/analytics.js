/* ==========================================================================
   analytics.js — Analytics Module (Admin dashboard)
   Phase 5B. Built on top of Phase 5A's Reports Module + Phase 4/5A frontend.
   Does NOT touch Reports (js/reports.js, admin.js Reports module), Auth, or
   any existing page — this file is additive only, mounted into a new
   #sec-analytics section wired up from admin-dashboard.html / admin.js.

   Data sources: reuses the SAME endpoints already used by admin.js Overview
   and Reports (today-stats, department-averages, daily-stats, faculty,
   students, subjects, classes, faculty-subjects, monthly, defaulters).
   Two chart types (Subject comparison, Student performance) need a small new
   read-only endpoint each — same "proposed, degrades gracefully" pattern the
   Reports Module already established; see ANALYTICS_COMPLETION.md.

   Depends on: api.js, utils.js, charts.js (GsCharts). Uses Chart.js via CDN.
   ========================================================================== */

const AnalyticsModule = (function () {
  let mounted = false;
  let refDataCache = null; // { classes, faculty, students, subjects, facultySubjects }

  function el(id) { return document.getElementById(id); }

  function shell() {
    return `
      <div class="d-flex flex-wrap align-items-center justify-content-between mb-3 gap-2">
        <div class="small text-muted">Attendance analytics across the whole institution.</div>
        <button class="btn btn-gs-outline btn-sm" id="an-refresh"><i class="bi bi-arrow-clockwise"></i> Refresh</button>
      </div>

      <div class="row g-3 mb-4" id="an-stats"></div>

      <div class="row g-3 mb-3">
        <div class="col-lg-8">
          <div class="gs-card h-100">
            <div class="gs-card-header"><h5>Attendance trend <span class="text-muted small fw-normal">(last 30 days)</span></h5></div>
            <div class="gs-card-body"><div class="gs-chart-wrap" id="an-trend"></div></div>
          </div>
        </div>
        <div class="col-lg-4">
          <div class="gs-card h-100">
            <div class="gs-card-header"><h5>Department comparison</h5></div>
            <div class="gs-card-body"><div class="gs-chart-wrap" id="an-dept"></div></div>
          </div>
        </div>
      </div>

      <div class="row g-3 mb-3">
        <div class="col-lg-6">
          <div class="gs-card h-100">
            <div class="gs-card-header"><h5>Daily attendance <span class="text-muted small fw-normal">(last 7 days)</span></h5></div>
            <div class="gs-card-body"><div class="gs-chart-wrap" id="an-daily"></div></div>
          </div>
        </div>
        <div class="col-lg-6">
          <div class="gs-card h-100">
            <div class="gs-card-header"><h5>Weekly attendance <span class="text-muted small fw-normal">(last 4 weeks)</span></h5></div>
            <div class="gs-card-body"><div class="gs-chart-wrap" id="an-weekly"></div></div>
          </div>
        </div>
      </div>

      <div class="row g-3 mb-3">
        <div class="col-lg-6">
          <div class="gs-card h-100">
            <div class="gs-card-header d-flex align-items-center justify-content-between">
              <h5 class="mb-0">Monthly attendance</h5>
              <div class="d-flex gap-2">
                <select class="form-select form-select-sm" id="an-month-class" style="max-width:150px;"></select>
                <input type="month" class="form-control form-control-sm" id="an-month-picker" style="max-width:140px;">
              </div>
            </div>
            <div class="gs-card-body"><div class="gs-chart-wrap" id="an-monthly"></div></div>
          </div>
        </div>
        <div class="col-lg-6">
          <div class="gs-card h-100">
            <div class="gs-card-header d-flex align-items-center justify-content-between">
              <h5 class="mb-0">Semester attendance</h5>
              <select class="form-select form-select-sm" id="an-sem-class" style="max-width:170px;"></select>
            </div>
            <div class="gs-card-body"><div class="gs-chart-wrap" id="an-semester"></div></div>
          </div>
        </div>
      </div>

      <div class="row g-3 mb-3">
        <div class="col-lg-6">
          <div class="gs-card h-100">
            <div class="gs-card-header"><h5>Subject comparison <span class="text-muted small fw-normal">avg. attendance %</span></h5></div>
            <div class="gs-card-body"><div class="gs-chart-wrap" id="an-subject"></div></div>
          </div>
        </div>
        <div class="col-lg-6">
          <div class="gs-card h-100">
            <div class="gs-card-header"><h5>Faculty workload <span class="text-muted small fw-normal">subjects/classes assigned</span></h5></div>
            <div class="gs-card-body"><div class="gs-chart-wrap" id="an-workload"></div></div>
          </div>
        </div>
      </div>

      <div class="row g-3 mb-3">
        <div class="col-lg-6">
          <div class="gs-card h-100">
            <div class="gs-card-header d-flex align-items-center justify-content-between">
              <h5 class="mb-0">Student performance</h5>
              <select class="form-select form-select-sm" id="an-perf-class" style="max-width:170px;"></select>
            </div>
            <div class="gs-card-body"><div class="gs-chart-wrap" id="an-performance"></div></div>
          </div>
        </div>
        <div class="col-lg-6">
          <div class="gs-card h-100">
            <div class="gs-card-header"><h5>Class statistics <span class="text-muted small fw-normal">students per class</span></h5></div>
            <div class="gs-card-body"><div class="gs-chart-wrap" id="an-class"></div></div>
          </div>
        </div>
      </div>

      <div class="row g-3 mb-3">
        <div class="col-12">
          <div class="gs-card">
            <div class="gs-card-header"><h5>Faculty statistics</h5></div>
            <div class="table-responsive"><table class="table table-gs mb-0">
              <thead><tr><th>Faculty</th><th>Department</th><th>Subjects assigned</th><th>Classes taught</th></tr></thead>
              <tbody id="an-faculty-table"><tr><td colspan="4" class="text-center py-4"><span class="spinner-border spinner-border-sm"></span></td></tr></tbody>
            </table></div>
          </div>
        </div>
      </div>
    `;
  }

  function statTile(label, val, icon) {
    return `
      <div class="col-6 col-lg-3">
        <div class="gs-stat">
          <div class="gs-stat-icon"><i class="bi ${icon}"></i></div>
          <div class="gs-stat-label">${label}</div>
          <div class="gs-stat-value">${GsUtil.escapeHtml(String(val))}</div>
        </div>
      </div>`;
  }

  // ---- reference data (classes/faculty/students/subjects/facultySubjects), cached ---------
  async function loadRefData() {
    if (refDataCache) return refDataCache;
    const [classes, faculty, students, subjects, facultySubjects, departments] = await Promise.all([
      GsApi.get('/api/admin/classes').catch(() => []),
      GsApi.get('/api/admin/faculty').catch(() => []),
      GsApi.get('/api/admin/students').catch(() => []),
      GsApi.get('/api/admin/subjects').catch(() => []),
      GsApi.get('/api/admin/faculty-subjects').catch(() => []),
      GsApi.get('/api/admin/departments').catch(() => []),
    ]);
    refDataCache = { classes, faculty, students, subjects, facultySubjects, departments };
    return refDataCache;
  }

  function classOptionsHtml(classes) {
    return classes.map(c => `<option value="${c.id}">${GsUtil.escapeHtml(c.name)}${c.section ? ' (' + GsUtil.escapeHtml(c.section) + ')' : ''}</option>`).join('');
  }

  function name(entity, fallbackPrefix) {
    return entity.name ?? entity.fullName ?? entity.username ?? `${fallbackPrefix}#${entity.id}`;
  }

  // ---- Stat tiles ---------------------------------------------------------------------
  async function loadStats(ref) {
    const wrap = el('an-stats');
    wrap.innerHTML = Array(8).fill(0).map(() => `
      <div class="col-6 col-lg-3"><div class="gs-stat"><div class="gs-chart-state" style="min-height:52px;"><span class="spinner-border spinner-border-sm text-muted"></span></div></div></div>`).join('');
    try {
      const stats = await GsApi.get('/api/admin/reports/today-stats');
      const tiles = [
        statTile('Total students', ref.students.length, 'bi-people'),
        statTile('Present today', stats.presentCount ?? stats.totalPresent ?? '—', 'bi-person-check'),
        statTile('Absent today', stats.absentCount ?? stats.totalAbsent ?? '—', 'bi-person-x'),
        statTile('Attendance %', GsUtil.pct(stats.attendanceRate ?? stats.percentage), 'bi-graph-up'),
        statTile("Today's sessions", stats.totalSessions ?? stats.sessionsToday ?? '—', 'bi-calendar-check'),
        statTile('Faculty', ref.faculty.length, 'bi-person-badge'),
        statTile('Subjects', ref.subjects.length, 'bi-journal-bookmark'),
        statTile('Classes', ref.classes.length, 'bi-collection'),
      ];
      wrap.innerHTML = tiles.join('');
    } catch (err) {
      wrap.innerHTML = `<div class="col-12"><div class="alert alert-danger py-2 mb-0">${GsUtil.escapeHtml(GsUtil.apiErrorMessage(err))}</div></div>`;
    }
  }

  // ---- Attendance trend (line, 30-day) + Daily attendance (bar, 7-day) --------------------
  async function loadTrendAndDaily() {
    const trendWrap = el('an-trend'), dailyWrap = el('an-daily');
    GsCharts.showLoading(trendWrap); GsCharts.showLoading(dailyWrap);
    try {
      const rows = await GsApi.get('/api/admin/reports/daily-stats', { sinceDays: 30 });
      const sorted = (rows || []).slice().sort((a, b) => String(a.date ?? a.sessionDate).localeCompare(String(b.date ?? b.sessionDate)));
      const labels = sorted.map(r => GsUtil.formatDate(r.date ?? r.sessionDate));
      const pctVals = sorted.map(r => Number(r.attendanceRate ?? r.percentage ?? r.presentPercentage ?? NaN));
      const hasPct = pctVals.some(v => !isNaN(v));
      const series = hasPct ? pctVals.map(v => (isNaN(v) ? 0 : v)) : sorted.map(r => Number(r.recordCount ?? r.totalRecords ?? 0));
      GsCharts.lineChart({
        wrapEl: trendWrap, canvasId: 'an-trend-canvas', labels, values: series,
        label: hasPct ? 'Attendance %' : 'Records', color: GsCharts.colorAt(0),
        emptyMessage: 'No attendance trend data yet.',
      });

      const last7 = sorted.slice(-7);
      GsCharts.multiBarChart({
        wrapEl: dailyWrap, canvasId: 'an-daily-canvas',
        labels: last7.map(r => GsUtil.formatDate(r.date ?? r.sessionDate)),
        series: [
          { label: 'Sessions', values: last7.map(r => Number(r.sessionCount ?? r.totalSessions ?? 0)) },
          { label: 'Records', values: last7.map(r => Number(r.recordCount ?? r.totalRecords ?? 0)) },
        ],
        emptyMessage: 'No daily attendance data yet.',
      });
    } catch (err) {
      GsCharts.showError(trendWrap, GsUtil.apiErrorMessage(err));
      GsCharts.showError(dailyWrap, GsUtil.apiErrorMessage(err));
    }
  }

  // ---- Weekly attendance (bar, grouped client-side from 28-day daily-stats) --------------
  async function loadWeekly() {
    const wrap = el('an-weekly');
    GsCharts.showLoading(wrap);
    try {
      const rows = await GsApi.get('/api/admin/reports/daily-stats', { sinceDays: 28 });
      const weeks = {}; // weekLabel -> {sessions, records}
      (rows || []).forEach(r => {
        const d = new Date(r.date ?? r.sessionDate);
        if (isNaN(d)) return;
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        const key = weekStart.toISOString().slice(0, 10);
        if (!weeks[key]) weeks[key] = { sessions: 0, records: 0 };
        weeks[key].sessions += Number(r.sessionCount ?? r.totalSessions ?? 0);
        weeks[key].records += Number(r.recordCount ?? r.totalRecords ?? 0);
      });
      const keys = Object.keys(weeks).sort();
      GsCharts.multiBarChart({
        wrapEl: wrap, canvasId: 'an-weekly-canvas',
        labels: keys.map(k => `Wk of ${GsUtil.formatDate(k)}`),
        series: [
          { label: 'Sessions', values: keys.map(k => weeks[k].sessions) },
          { label: 'Records', values: keys.map(k => weeks[k].records) },
        ],
        emptyMessage: 'No weekly attendance data yet.',
      });
    } catch (err) {
      GsCharts.showError(wrap, GsUtil.apiErrorMessage(err));
    }
  }

  // ---- Department comparison (doughnut, existing endpoint) -------------------------------
  async function loadDeptComparison() {
    const wrap = el('an-dept');
    GsCharts.showLoading(wrap);
    try {
      const rows = await GsApi.get('/api/admin/reports/department-averages');
      GsCharts.doughnutChart({
        wrapEl: wrap, canvasId: 'an-dept-canvas',
        labels: (rows || []).map(r => r.departmentName ?? r.department ?? '—'),
        values: (rows || []).map(r => Number(r.averagePercentage ?? r.average ?? r.avgAttendance ?? 0)),
        emptyMessage: 'No department data yet.',
      });
    } catch (err) {
      GsCharts.showError(wrap, GsUtil.apiErrorMessage(err));
    }
  }

  // ---- Monthly attendance (bar, existing endpoint, needs class + month) -------------------
  async function loadMonthly(ref) {
    const classSel = el('an-month-class'), monthPicker = el('an-month-picker');
    classSel.innerHTML = classOptionsHtml(ref.classes);
    const now = new Date();
    monthPicker.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    async function run() {
      const wrap = el('an-monthly');
      if (!classSel.value) { GsCharts.showEmpty(wrap, 'No classes configured yet.'); return; }
      GsCharts.showLoading(wrap);
      const [year, month] = (monthPicker.value || `${now.getFullYear()}-${now.getMonth() + 1}`).split('-');
      try {
        const rows = await GsApi.get(`/api/admin/reports/monthly/${classSel.value}`, { year, month: Number(month) });
        const keys = rows && rows.length ? Object.keys(rows[0]) : [];
        const labelKey = keys.find(k => /date|day/i.test(k)) || keys[0];
        const valKey = keys.find(k => /percent|rate|present/i.test(k)) || keys[1];
        GsCharts.barChart({
          wrapEl: wrap, canvasId: 'an-monthly-canvas',
          labels: (rows || []).map(r => String(r[labelKey] ?? '')),
          values: (rows || []).map(r => Number(r[valKey] ?? 0)),
          label: GsUtil.escapeHtml(valKey || 'Value'), color: GsCharts.colorAt(1),
          emptyMessage: 'No records for this month.',
        });
      } catch (err) {
        GsCharts.showError(wrap, GsUtil.apiErrorMessage(err));
      }
    }
    classSel.addEventListener('change', run);
    monthPicker.addEventListener('change', run);
    run();
  }

  // ---- Semester attendance (bar, proposed endpoint — degrades gracefully) -----------------
  async function loadSemester(ref) {
    const classSel = el('an-sem-class');
    classSel.innerHTML = classOptionsHtml(ref.classes);

    async function run() {
      const wrap = el('an-semester');
      if (!classSel.value) { GsCharts.showEmpty(wrap, 'No classes configured yet.'); return; }
      GsCharts.showLoading(wrap);
      const to = new Date().toISOString().slice(0, 10);
      const from = new Date(new Date().setMonth(new Date().getMonth() - 6)).toISOString().slice(0, 10);
      try {
        const rows = await GsApi.get(`/api/admin/reports/semester/${classSel.value}`, { from, to });
        const keys = rows && rows.length ? Object.keys(rows[0]) : [];
        const labelKey = keys.find(k => /subject/i.test(k)) || keys[0];
        const valKey = keys.find(k => /percent|rate/i.test(k)) || keys[1];
        GsCharts.barChart({
          wrapEl: wrap, canvasId: 'an-semester-canvas',
          labels: (rows || []).map(r => String(r[labelKey] ?? '')),
          values: (rows || []).map(r => Number(r[valKey] ?? 0)),
          label: 'Attendance %', color: GsCharts.colorAt(2),
          emptyMessage: 'No semester records for this class.',
        });
      } catch (err) {
        GsCharts.showError(wrap, 'This chart needs one small backend addition.',
          'Proposed: <code>GET /api/admin/reports/semester/{classId}?from=YYYY-MM-DD&to=YYYY-MM-DD</code> — same contract as the Reports Module\'s Semester tab.');
      }
    }
    classSel.addEventListener('change', run);
    run();
  }

  // ---- Subject comparison (bar, proposed endpoint — degrades gracefully) ------------------
  async function loadSubjectComparison(ref) {
    const wrap = el('an-subject');
    GsCharts.showLoading(wrap);
    try {
      const rows = await GsApi.get('/api/admin/analytics/subject-comparison');
      const keys = rows && rows.length ? Object.keys(rows[0]) : [];
      const labelKey = keys.find(k => /subject/i.test(k)) || keys[0];
      const valKey = keys.find(k => /percent|rate|average/i.test(k)) || keys[1];
      GsCharts.barChart({
        wrapEl: wrap, canvasId: 'an-subject-canvas',
        labels: (rows || []).map(r => String(r[labelKey] ?? '')),
        values: (rows || []).map(r => Number(r[valKey] ?? 0)),
        label: 'Avg. attendance %', color: GsCharts.colorAt(3), horizontal: true,
        emptyMessage: 'No subject comparison data yet.',
      });
    } catch (err) {
      // Fallback: subject *count per department* from ref data client-side, so the
      // card still shows something useful instead of an empty error box.
      const bySubjectCount = {};
      ref.subjects.forEach(s => {
        const dept = ref.departments.find(d => d.id === s.departmentId);
        const key = dept ? dept.name : (s.departmentName ?? 'Unassigned');
        bySubjectCount[key] = (bySubjectCount[key] || 0) + 1;
      });
      const labels = Object.keys(bySubjectCount);
      if (!labels.length) { GsCharts.showEmpty(wrap, 'No subject data yet.'); return; }
      GsCharts.barChart({
        wrapEl: wrap, canvasId: 'an-subject-canvas', labels,
        values: labels.map(k => bySubjectCount[k]), label: 'Subjects per department',
        color: GsCharts.colorAt(3), horizontal: true, emptyMessage: 'No subject data yet.',
      });
      const note = document.createElement('div');
      note.className = 'small text-muted mt-2';
      note.innerHTML = 'Showing subjects-per-department as a stand-in. Proposed: <code>GET /api/admin/analytics/subject-comparison</code> returning avg. attendance % per subject.';
      wrap.appendChild(note);
    }
  }

  // ---- Faculty workload (bar, computed client-side from faculty-subjects, fully functional) --
  function loadWorkload(ref) {
    const wrap = el('an-workload');
    const counts = {};
    ref.facultySubjects.forEach(fs => {
      const facId = fs.facultyId ?? fs.faculty?.id;
      const facName = fs.facultyName ?? (ref.faculty.find(f => f.id === facId) ? name(ref.faculty.find(f => f.id === facId), 'F') : 'Unknown');
      counts[facName] = (counts[facName] || 0) + 1;
    });
    const labels = Object.keys(counts);
    GsCharts.barChart({
      wrapEl: wrap, canvasId: 'an-workload-canvas', labels,
      values: labels.map(k => counts[k]), label: 'Assignments',
      color: GsCharts.colorAt(4), horizontal: true,
      emptyMessage: 'No faculty↔subject assignments yet.',
    });
  }

  // ---- Student performance (radar/bar top-N, proposed endpoint — degrades gracefully) -----
  async function loadStudentPerformance(ref) {
    const classSel = el('an-perf-class');
    classSel.innerHTML = classOptionsHtml(ref.classes);

    async function run() {
      const wrap = el('an-performance');
      if (!classSel.value) { GsCharts.showEmpty(wrap, 'No classes configured yet.'); return; }
      GsCharts.showLoading(wrap);
      try {
        const rows = await GsApi.get(`/api/admin/analytics/student-performance/${classSel.value}`);
        const keys = rows && rows.length ? Object.keys(rows[0]) : [];
        const labelKey = keys.find(k => /name/i.test(k)) || keys[0];
        const valKey = keys.find(k => /percent|rate/i.test(k)) || keys[1];
        const top = (rows || []).slice().sort((a, b) => Number(b[valKey]) - Number(a[valKey])).slice(0, 10);
        GsCharts.barChart({
          wrapEl: wrap, canvasId: 'an-performance-canvas',
          labels: top.map(r => String(r[labelKey] ?? '')),
          values: top.map(r => Number(r[valKey] ?? 0)),
          label: 'Attendance %', color: GsCharts.colorAt(5),
          emptyMessage: 'No performance data for this class.',
        });
      } catch (err) {
        GsCharts.showError(wrap, 'This chart needs one small backend addition.',
          'Proposed: <code>GET /api/admin/analytics/student-performance/{classId}</code> returning per-student attendance % for that class.');
      }
    }
    classSel.addEventListener('change', run);
    run();
  }

  // ---- Class statistics (doughnut: students per class, fully functional) -----------------
  function loadClassStats(ref) {
    const wrap = el('an-class');
    const counts = {};
    ref.students.forEach(s => {
      const cls = ref.classes.find(c => c.id === (s.classId ?? s.class?.id));
      const key = cls ? `${cls.name}${cls.section ? ' (' + cls.section + ')' : ''}` : 'Unassigned';
      counts[key] = (counts[key] || 0) + 1;
    });
    const labels = Object.keys(counts);
    GsCharts.doughnutChart({
      wrapEl: wrap, canvasId: 'an-class-canvas', labels,
      values: labels.map(k => counts[k]), emptyMessage: 'No students yet.',
    });
  }

  // ---- Faculty statistics table (computed client-side, fully functional) ------------------
  function loadFacultyTable(ref) {
    const body = el('an-faculty-table');
    if (!ref.faculty.length) {
      body.innerHTML = `<tr><td colspan="4" class="gs-empty border-0"><i class="bi bi-person-badge"></i>No faculty yet.</td></tr>`;
      return;
    }
    const rows = ref.faculty.map(f => {
      const assignments = ref.facultySubjects.filter(fs => (fs.facultyId ?? fs.faculty?.id) === f.id);
      const dept = ref.departments.find(d => d.id === f.departmentId);
      const classSet = new Set(assignments.map(a => a.classId ?? a.class?.id).filter(Boolean));
      return { f, dept, subjCount: assignments.length, classCount: classSet.size };
    });
    body.innerHTML = rows.map(r => `
      <tr>
        <td>${GsUtil.escapeHtml(name(r.f, 'F'))}</td>
        <td>${GsUtil.escapeHtml(r.dept ? r.dept.name : (r.f.departmentName ?? '—'))}</td>
        <td>${r.subjCount}</td>
        <td>${r.classCount}</td>
      </tr>`).join('');
  }

  async function refresh() {
    const ref = await loadRefData();
    loadStats(ref);
    loadTrendAndDaily();
    loadWeekly();
    loadDeptComparison();
    loadMonthly(ref);
    loadSemester(ref);
    loadSubjectComparison(ref);
    loadWorkload(ref);
    loadStudentPerformance(ref);
    loadClassStats(ref);
    loadFacultyTable(ref);
  }

  return {
    async render() {
      const sec = document.getElementById('sec-analytics');
      if (!sec) return;
      sec.innerHTML = shell();
      el('an-refresh').addEventListener('click', () => { refDataCache = null; refresh(); });
      mounted = true;
      await refresh();
    },
    isMounted() { return mounted; },
  };
})();
