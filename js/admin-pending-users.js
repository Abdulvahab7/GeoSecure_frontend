/* ==========================================================================
   admin-pending-users.js — Admin > Pending Registrations page
   ========================================================================== */

(function () {
  const user = GsAuth.requireRole('ADMIN');
  if (!user) return;

  document.getElementById('topbar-user').textContent = `${user.username} · ${user.email}`;
  document.getElementById('logout-btn').addEventListener('click', GsAuth.logout);
  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    document.getElementById('gs-sidebar').classList.toggle('open');
  });

  const PAGE_SIZE = 10;
  let allPending = [];
  let filtered = [];
  let currentPage = 1;

  const tbody = document.getElementById('pending-users-body');
  const countBadge = document.getElementById('pending-count-badge');
  const pageInfo = document.getElementById('pending-page-info');
  const paginationEl = document.getElementById('pending-pagination');
  const searchInput = document.getElementById('pending-search');
  const roleFilter = document.getElementById('pending-role-filter');
  const deptFilter = document.getElementById('pending-dept-filter');

  async function loadDepartmentFilterOptions() {
    try {
      const departments = await GsApi.get('/api/auth/departments');
      const options = departments
        .map((d) => `<option value="${GsUtil.escapeHtml(d.name)}">${GsUtil.escapeHtml(d.name)}</option>`)
        .join('');
      deptFilter.insertAdjacentHTML('beforeend', options);
    } catch (e) { /* non-fatal */ }
  }

  async function loadPending() {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center gs-muted py-4">Loading…</td></tr>';
    try {
      allPending = await GsApi.get('/api/admin/users/pending');
      applyFilters();
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4">${GsUtil.escapeHtml(GsUtil.apiErrorMessage(err))}</td></tr>`;
    }
  }

  function applyFilters() {
    const term = searchInput.value.trim().toLowerCase();
    const role = roleFilter.value;
    const dept = deptFilter.value;

    filtered = allPending.filter((u) => {
      const name = (u.fullName || u.username || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const matchesTerm = !term || name.includes(term) || email.includes(term);
      const matchesRole = !role || u.role === role;
      const matchesDept = !dept || u.departmentName === dept;
      return matchesTerm && matchesRole && matchesDept;
    });

    currentPage = 1;
    render();
  }

  function render() {
    countBadge.textContent = filtered.length;

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center gs-muted py-4">No pending registrations.</td></tr>';
      pageInfo.textContent = '';
      paginationEl.innerHTML = '';
      return;
    }

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    tbody.innerHTML = pageItems.map((u) => `
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

    pageInfo.textContent = `Showing ${start + 1}-${Math.min(start + PAGE_SIZE, filtered.length)} of ${filtered.length}`;
    renderPagination(totalPages);
  }

  function renderPagination(totalPages) {
    if (totalPages <= 1) { paginationEl.innerHTML = ''; return; }
    let html = '';
    for (let p = 1; p <= totalPages; p++) {
      html += `<li class="page-item ${p === currentPage ? 'active' : ''}"><button class="page-link" data-page="${p}">${p}</button></li>`;
    }
    paginationEl.innerHTML = html;
    paginationEl.querySelectorAll('button[data-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentPage = Number(btn.dataset.page);
        render();
      });
    });
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
        ? 'The applicant will be able to sign in once approved.'
        : 'The applicant will be notified their registration was rejected.',
      confirmText: isApprove ? 'Approve' : 'Reject',
      danger: !isApprove,
    });
    if (!confirmed) return;

    GsUtil.showSpinner();
    try {
      await GsApi.put(`/api/admin/users/${id}/${action}`, {});
      GsUtil.toast(isApprove ? 'Registration approved.' : 'Registration rejected.', isApprove ? 'success' : 'warning');
      await loadPending();
    } catch (err) {
      GsUtil.toast(GsUtil.apiErrorMessage(err), 'danger');
    } finally {
      GsUtil.hideSpinner();
    }
  });

  searchInput.addEventListener('input', GsUtil.debounce(applyFilters, 250));
  roleFilter.addEventListener('change', applyFilters);
  deptFilter.addEventListener('change', applyFilters);
  document.getElementById('pending-refresh-btn').addEventListener('click', loadPending);

  loadDepartmentFilterOptions();
  loadPending();
})();
