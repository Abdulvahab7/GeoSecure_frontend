/* ==========================================================================
   profile.js — shared "Profile" section (view profile + change password)
   Mounted into a container element on each dashboard via GsProfile.mount().
   ========================================================================== */

const GsProfile = {
  async mount(containerId, role) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="row g-4">
        <div class="col-lg-5">
          <div class="gs-card">
            <div class="gs-card-header"><h5>My profile</h5></div>
            <div class="gs-card-body" id="gs-profile-view">
              <div class="text-center py-4"><span class="spinner-border spinner-border-sm"></span></div>
            </div>
          </div>
        </div>
        <div class="col-lg-7">
          <div class="gs-card">
            <div class="gs-card-header"><h5>Change password</h5></div>
            <div class="gs-card-body">
              <form id="gs-change-password-form">
                <div class="mb-3">
                  <label class="form-label small fw-semibold">Current password</label>
                  <input type="password" class="form-control" id="gs-cp-current" required autocomplete="current-password">
                </div>
                <div class="mb-3">
                  <label class="form-label small fw-semibold">New password</label>
                  <input type="password" class="form-control" id="gs-cp-new" required minlength="8" autocomplete="new-password">
                  <div class="form-text">At least 8 characters.</div>
                </div>
                <div class="mb-3">
                  <label class="form-label small fw-semibold">Confirm new password</label>
                  <input type="password" class="form-control" id="gs-cp-confirm" required minlength="8" autocomplete="new-password">
                </div>
                <button type="submit" class="btn btn-gs-primary">Update password</button>
              </form>
            </div>
          </div>
        </div>
      </div>`;

    GsSecurity.guardSubmit(document.getElementById('gs-change-password-form'), async (e) => {
      const currentPassword = document.getElementById('gs-cp-current').value;
      const newPassword = document.getElementById('gs-cp-new').value;
      const confirm = document.getElementById('gs-cp-confirm').value;
      if (newPassword !== confirm) {
        GsUtil.toast('New password and confirmation do not match.', 'danger');
        return;
      }
      try {
        await GsApi.post('/api/auth/change-password', { currentPassword, newPassword });
        GsUtil.toast('Password changed successfully.');
        e.target.reset();
      } catch (err) {
        GsUtil.toast(GsUtil.apiErrorMessage(err), 'danger');
      }
    }, { busyText: 'Updating…' });

    await this.loadProfile(role);
  },

  async loadProfile(role) {
    const view = document.getElementById('gs-profile-view');
    try {
      let profile, me;
      me = await GsApi.get('/api/auth/me');
      if (role === 'FACULTY') profile = await GsApi.get('/api/faculty/profile');
      else if (role === 'STUDENT') profile = await GsApi.get('/api/student/profile');

      const rows = [];
      rows.push(['Username', me.username]);
      rows.push(['Email', me.email]);
      rows.push(['Role', me.role]);
      if (profile) {
        if (profile.employeeId) rows.push(['Employee ID', profile.employeeId]);
        if (profile.registerNo) rows.push(['Register no.', profile.registerNo]);
        if (profile.name) rows.push(['Name', profile.name]);
        if (profile.departmentName) rows.push(['Department', profile.departmentName]);
        if (profile.className) rows.push(['Class', profile.className]);
        if (profile.designation) rows.push(['Designation', profile.designation]);
        if (profile.mentorFacultyName) rows.push(['Mentor', profile.mentorFacultyName]);
        if (profile.phone) rows.push(['Phone', profile.phone]);
        if (profile.isMentor !== undefined) rows.push(['Mentor status', profile.isMentor ? 'Is a mentor' : 'Not a mentor']);
      }
      rows.push(['Last login', GsUtil.formatDateTime(me.lastLogin)]);

      const initials = (profile?.name || me.username || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

      view.innerHTML = `
        <div class="d-flex align-items-center gap-3 mb-3">
          <div class="rounded-circle d-flex align-items-center justify-content-center fw-bold"
               style="width:56px;height:56px;background:var(--gs-teal-light);color:var(--gs-teal-dark);font-size:1.1rem;">
            ${GsUtil.escapeHtml(initials)}
          </div>
          <div>
            <div class="fw-bold">${GsUtil.escapeHtml(profile?.name || me.username)}</div>
            <div class="gs-muted small">${GsUtil.escapeHtml(me.email)}</div>
          </div>
        </div>
        <table class="table table-sm table-borderless mb-0">
          <tbody>
            ${rows.map(([k, v]) => `<tr><td class="gs-muted" style="width:40%;">${GsUtil.escapeHtml(k)}</td><td class="fw-medium">${GsUtil.escapeHtml(v ?? '—')}</td></tr>`).join('')}
          </tbody>
        </table>`;
    } catch (err) {
      view.innerHTML = `<div class="alert alert-danger py-2 px-3 small mb-0">${GsUtil.escapeHtml(GsUtil.apiErrorMessage(err))}</div>`;
    }
  },
};
