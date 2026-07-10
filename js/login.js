/* ==========================================================================
   login.js
   ========================================================================== */

(function () {
  if (GsStorage.isLoggedIn()) {
    GsAuth.redirectToDashboard();
    return;
  }

  const form = document.getElementById('login-form');
  const errorBox = document.getElementById('login-error');
  const submitBtn = document.getElementById('login-submit-btn');

  document.getElementById('toggle-password').addEventListener('click', (e) => {
    const input = document.getElementById('login-password');
    const icon = e.currentTarget.querySelector('i');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    icon.className = show ? 'bi bi-eye-slash' : 'bi bi-eye';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.classList.add('d-none');

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Signing in…';

    try {
      const user = await GsAuth.login(email, password);
      window.location.href = GS_DASHBOARD_BY_ROLE[user.role] || 'login.html';
    } catch (err) {
      errorBox.textContent = GsUtil.apiErrorMessage(err);
      errorBox.classList.remove('d-none');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign in';
    }
  });
})();
