/* ==========================================================================
   notifications.js
   ========================================================================== */

const GsNotifications = (function () {
  async function load(container, role) {
    container.innerHTML = `<div class="text-center py-4"><span class="spinner-border spinner-border-sm"></span></div>`;
    try {
      const items = await GsApi.get('/api/notifications');
      renderList(container, items, role);
    } catch (err) {
      container.innerHTML = `<div class="alert alert-danger py-2 px-3 small">${GsUtil.escapeHtml(GsUtil.apiErrorMessage(err))}</div>`;
    }
  }

  function renderList(container, items, role) {
    const unreadCount = items.filter(n => !n.isRead).length;

    let html = `
      <div class="gs-card">
        <div class="gs-card-header d-flex justify-content-between align-items-center">
          <h5>All notifications</h5>
          <div class="d-flex align-items-center gap-3">
            <span class="gs-muted small" id="unread-summary">${unreadCount} unread</span>
            <button class="btn btn-outline-secondary btn-sm" id="mark-all-read-btn" ${unreadCount === 0 ? 'disabled' : ''}>Mark all as read</button>
          </div>
        </div>
        <div class="list-group list-group-flush" id="notif-list-body">`;

    if (!items.length) {
      html += `<div class="gs-empty py-5 text-center"><i class="bi bi-bell fs-2 gs-muted"></i><div class="mt-2">No notifications yet.</div></div>`;
    } else {
      html += items.map(n => `
        <div class="list-group-item gs-notif p-3 ${n.isRead ? '' : 'unread bg-light-subtle'}" data-id="${n.id}" style="cursor:${n.isRead ? 'default' : 'pointer'}; border-left: ${n.isRead ? '3px solid transparent' : '3px solid var(--bs-primary)'}">
          <div class="d-flex align-items-center gap-2">
            ${n.isRead ? '' : '<span class="gs-notif-dot bg-primary rounded-circle" style="width: 8px; height: 8px; display: inline-block;"></span>'}
            <div class="flex-fill">
              <div class="fw-semibold">${GsUtil.escapeHtml(n.title || 'Notification')}</div>
              <div class="small text-muted mt-1">${GsUtil.escapeHtml(n.message || '')}</div>
              <div class="gs-muted mt-2" style="font-size:0.75rem;"><i class="bi bi-clock me-1"></i>${GsUtil.timeAgo(n.createdAt)}</div>
            </div>
          </div>
        </div>`).join('');
    }

    html += `</div></div>`;
    container.innerHTML = html;

    const btn = container.querySelector('#mark-all-read-btn');
    if (btn) {
      btn.addEventListener('click', async () => {
        try {
          const unread = await GsApi.get('/api/notifications/unread');
          await Promise.all(unread.map(n => GsApi.post(`/api/notifications/${n.id}/read`)));
          GsUtil.toast('All notifications marked as read.');
          load(container, role);
        } catch (err) {
          GsUtil.toast(GsUtil.apiErrorMessage(err), 'danger');
        }
      });
    }

    container.querySelectorAll('.gs-notif').forEach(el => {
      if (el.classList.contains('unread')) {
        el.addEventListener('click', async () => {
          const id = el.dataset.id;
          try {
            await GsApi.post(`/api/notifications/${id}/read`);
            el.classList.remove('unread', 'bg-light-subtle');
            el.style.borderLeft = '3px solid transparent';
            el.style.cursor = 'default';
            el.querySelector('.gs-notif-dot')?.remove();

            const currentUnread = container.querySelectorAll('.gs-notif.unread').length;
            const summary = container.querySelector('#unread-summary');
            if (summary) summary.textContent = `${currentUnread} unread`;
            const markBtn = container.querySelector('#mark-all-read-btn');
            if (markBtn && currentUnread === 0) markBtn.disabled = true;
          } catch (err) {
            GsUtil.toast(GsUtil.apiErrorMessage(err), 'danger');
          }
        });
      }
    });
  }

  return {
    mount(containerId, role) {
      const container = document.getElementById(containerId);
      if (!container) return;
      load(container, role);
    }
  };
})();

if (document.getElementById('notif-list')) {
  // standalone page support
  const user = GsAuth.requireAnyRole();
  if (user) {
    const backLink = document.getElementById('back-link');
    if (backLink) backLink.href = GS_DASHBOARD_BY_ROLE[user.role] || 'login.html';
    GsNotifications.mount('notif-list', user.role);
  }
}
