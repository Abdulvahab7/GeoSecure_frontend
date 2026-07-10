/* ==========================================================================
   register.js — public registration page (register.html)
   Mirrors login.js conventions: uses GsApi + GsUtil, no auth required.
   ========================================================================== */

(function () {
  const form = document.getElementById('register-form');
  const errorBox = document.getElementById('register-error');
  const submitBtn = document.getElementById('register-submit-btn');

  const studentFields = document.getElementById('student-fields');
  const facultyFields = document.getElementById('faculty-fields');
  const studentDeptSelect = document.getElementById('reg-student-department');
  const facultyDeptSelect = document.getElementById('reg-faculty-department');

  function currentRole() {
    return document.querySelector('input[name="reg-role"]:checked').value;
  }

  function toggleRoleFields() {
    const isStudent = currentRole() === 'student';
    studentFields.classList.toggle('d-none', !isStudent);
    facultyFields.classList.toggle('d-none', isStudent);
  }

  document.querySelectorAll('input[name="reg-role"]').forEach((el) => {
    el.addEventListener('change', toggleRoleFields);
  });
  toggleRoleFields();

  async function loadDepartments() {
    try {
      const departments = await GsApi.get('/api/auth/departments');
      const options = departments
        .map((d) => `<option value="${d.id}">${GsUtil.escapeHtml(d.name)}</option>`)
        .join('');
      studentDeptSelect.insertAdjacentHTML('beforeend', options);
      facultyDeptSelect.insertAdjacentHTML('beforeend', options);
    } catch (err) {
      // Non-fatal: the person can still fill in the rest of the form, but
      // department selection will be unavailable until this succeeds.
      GsUtil.toast('Could not load departments. Please refresh the page.', 'warning');
    }
  }
  loadDepartments();

  function showError(message) {
    errorBox.textContent = message;
    errorBox.classList.remove('d-none');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.classList.add('d-none');

    const role = currentRole();
    const fullName = document.getElementById('reg-full-name').value.trim();
    const phone = document.getElementById('reg-phone').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-confirm-password').value;

    if (password !== confirmPassword) {
      showError('Password and confirm password do not match.');
      return;
    }

    const payload = { fullName, email, password, confirmPassword, phone, role };

    if (role === 'student') {
      payload.registerNo = document.getElementById('reg-register-no').value.trim();
      payload.departmentId = Number(studentDeptSelect.value) || null;
      payload.year = Number(document.getElementById('reg-year').value) || null;
      payload.section = document.getElementById('reg-section').value.trim();

      if (!payload.registerNo || !payload.departmentId || !payload.year || !payload.section) {
        showError('Please fill in all student fields (register number, department, year, section).');
        return;
      }
    } else {
      payload.employeeId = document.getElementById('reg-employee-id').value.trim();
      payload.departmentId = Number(facultyDeptSelect.value) || null;
      payload.designation = document.getElementById('reg-designation').value.trim();

      if (!payload.employeeId || !payload.departmentId) {
        showError('Please fill in all faculty fields (employee ID, department).');
        return;
      }
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Creating account…';

    try {
      await GsApi.post('/api/auth/register', payload);
      document.getElementById('register-form-view').classList.add('d-none');
      document.getElementById('register-success-view').classList.remove('d-none');
    } catch (err) {
      showError(GsUtil.apiErrorMessage(err));
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create account';
    }
  });
})();
