/* ==========================================================================
   generate-qr.js — faculty starts/monitors a QR attendance session
   ========================================================================== */

(function () {
  const user = GsAuth.requireRole('FACULTY');
  if (!user) return;

  const setupCard = document.getElementById('qr-setup-card');
  const liveCard = document.getElementById('qr-live-card');
  const select = document.getElementById('timetable-select');
  const setupError = document.getElementById('qr-setup-error');

  let countdownTimer = null;
  let rosterPoll = null;
  let currentSessionId = null;

  function pick(obj, candidates, fallback = '—') {
    for (const key of candidates) {
      if (obj && obj[key] !== undefined && obj[key] !== null) return obj[key];
    }
    return fallback;
  }

  /**
   * Normalizes an ISO-8601 timestamp string to be unambiguously parsed as UTC.
   *
   * Bug this fixes: if the backend sends a timestamp with no timezone info
   * (e.g. "2026-07-14T10:30:00" instead of "2026-07-14T10:30:00Z"), the
   * native Date constructor treats it as LOCAL time in the browser. For a
   * client in a timezone ahead of UTC (e.g. IST, +5:30), this makes the
   * parsed expiresAt appear hours earlier than the real expiry, so
   * (expiresAt - now) is negative immediately and the countdown shows
   * "Expired" the instant the QR is generated.
   *
   * This helper only appends 'Z' when the string has no explicit zone
   * designator (no trailing 'Z' and no +HH:MM/-HH:MM offset), so it's a
   * no-op for any timestamp that's already zone-aware.
   */
  function toUtcDate(isoString) {
    if (!isoString) return new Date(NaN);
    const hasZone = /Z$|[+-]\d{2}:?\d{2}$/.test(isoString);
    return new Date(hasZone ? isoString : isoString + 'Z');
  }

  async function loadTodaySchedule() {
    try {
      const slots = await GsApi.get('/api/faculty/dashboard/today');
      if (!slots.length) {
        select.innerHTML = '<option value="">No sessions scheduled today</option>';
        document.getElementById('start-session-btn').disabled = true;
        return;
      }
      select.innerHTML = slots.map(s => `
        <option value="${s.id}">
          Session ${s.sessionNumber} · ${GsUtil.escapeHtml(s.subjectName)} · ${GsUtil.escapeHtml(s.className)}${s.roomNumber ? ' · Room ' + GsUtil.escapeHtml(s.roomNumber) : ''}
        </option>`).join('');
    } catch (err) {
      setupError.textContent = GsUtil.apiErrorMessage(err);
      setupError.classList.remove('d-none');
    }
  }

  document.getElementById('start-session-btn').addEventListener('click', async () => {
    setupError.classList.add('d-none');
    const timetableId = select.value;
    if (!timetableId) return;

    const btn = document.getElementById('start-session-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Locating…';

    try {
      const { latitude, longitude } = await GsUtil.getGeolocation();
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Starting…';
      const session = await GsApi.post('/api/faculty/attendance/generate-qr', {
        timetableId: Number(timetableId), latitude, longitude,
      });
      startLiveSession(session);
    } catch (err) {
      setupError.textContent = GsUtil.apiErrorMessage(err);
      setupError.classList.remove('d-none');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-qr-code"></i> Generate QR';
    }
  });

  function startLiveSession(session) {
    currentSessionId = session.sessionId;
    setupCard.classList.add('d-none');
    liveCard.classList.remove('d-none');

    document.getElementById('qr-image').src = session.qrImageDataUrl;
    document.getElementById('qr-session-meta').textContent =
      `${session.subjectName || ''} · ${session.className || ''}`;

    startCountdown(session.expiresAt);
    loadRoster();
    rosterPoll = setInterval(loadRoster, 4000);
  }

  function startCountdown(expiresAtIso) {
    const el = document.getElementById('qr-countdown');
    clearInterval(countdownTimer);

    const expiresAtMs = toUtcDate(expiresAtIso).getTime();

    function tick() {
      if (Number.isNaN(expiresAtMs)) {
        clearInterval(countdownTimer);
        el.textContent = '--';
        return;
      }
      const remaining = Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));
      el.textContent = `${remaining}s`;
      if (remaining <= 0) {
        clearInterval(countdownTimer);
        el.textContent = 'Expired';
        GsUtil.toast('QR code has expired. Students can no longer scan this session.', 'warning');
      }
    }
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  async function loadRoster() {
    if (!currentSessionId) return;
    try {
      const roster = await GsApi.get(`/api/faculty/attendance/session/${currentSessionId}/roster`);
      renderRoster(roster);
    } catch (err) {
      // Session may have auto-closed server-side; stop polling quietly.
      clearInterval(rosterPoll);
    }
  }

  function renderRoster(roster) {
    const body = document.getElementById('roster-body');
    const present = roster.filter(r => (pick(r, ['status'], '') + '').toLowerCase() === 'present').length;
    document.getElementById('roster-summary').textContent = `${present}/${roster.length} present`;

    if (!roster.length) {
      body.innerHTML = `<tr><td colspan="3" class="gs-empty border-0"><i class="bi bi-people"></i>No students found for this class.</td></tr>`;
      return;
    }

    body.innerHTML = roster.map(r => {
      const name = pick(r, ['name', 'studentName', 'student_name']);
      const reg = pick(r, ['registerNo', 'register_no', 'regNo']);
      const status = pick(r, ['status'], 'absent');
      return `<tr><td>${GsUtil.escapeHtml(name)}</td><td>${GsUtil.escapeHtml(reg)}</td><td>${GsUtil.statusBadge(status)}</td></tr>`;
    }).join('');
  }

  GsSecurity.guardClick(document.getElementById('end-session-btn'), async () => {
    const ok = await GsUtil.confirm({
      title: 'End this session?',
      body: 'Students who have not scanned yet will be marked absent.',
      confirmText: 'End session',
      danger: true,
    });
    if (!ok || !currentSessionId) return;

    try {
      await GsApi.post(`/api/faculty/attendance/session/${currentSessionId}/end`);
      GsUtil.toast('Session ended.');
      clearInterval(countdownTimer);
      clearInterval(rosterPoll);
      currentSessionId = null;
      liveCard.classList.add('d-none');
      setupCard.classList.remove('d-none');
      loadTodaySchedule();
    } catch (err) {
      GsUtil.toast(GsUtil.apiErrorMessage(err), 'danger');
    }
  });

  loadTodaySchedule();
})();
