/* ==========================================================================
   scan-qr.js — student scans a faculty-displayed QR using the device camera
   ========================================================================== */

(function () {
  const user = GsAuth.requireRole('STUDENT');
  if (!user) return;

  const idle = document.getElementById('scan-idle');
  const active = document.getElementById('scan-active');
  const video = document.getElementById('scan-video');
  const canvas = document.getElementById('scan-canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const statusEl = document.getElementById('scan-status');
  const resultEl = document.getElementById('scan-result');

  let stream = null;
  let scanning = false;
  let submitted = false;

  document.getElementById('start-camera-btn').addEventListener('click', startCamera);
  document.getElementById('stop-camera-btn').addEventListener('click', stopCamera);
  document.getElementById('manual-submit-btn').addEventListener('click', () => {
    const token = document.getElementById('manual-token').value.trim();
    if (token) submitScan(token);
  });

  async function startCamera() {
    resultEl.innerHTML = '';
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = stream;
      await video.play();
      idle.classList.add('d-none');
      active.classList.remove('d-none');
      scanning = true;
      submitted = false;
      requestAnimationFrame(scanFrame);
    } catch (err) {
      GsUtil.toast('Could not access the camera. You can enter the code manually below.', 'warning');
    }
  }

  function stopCamera() {
    scanning = false;
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    active.classList.add('d-none');
    idle.classList.remove('d-none');
  }

  function scanFrame() {
    if (!scanning) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
      if (code && code.data && !submitted) {
        submitted = true;
        statusEl.textContent = 'QR code detected — verifying your location…';
        submitScan(code.data.trim());
        return;
      }
    }
    requestAnimationFrame(scanFrame);
  }

  async function submitScan(sessionToken) {
    resultEl.innerHTML = '';
    GsUtil.showSpinner();
    try {
      const { latitude, longitude } = await GsUtil.getGeolocation();
      const record = await GsApi.post('/api/student/attendance/scan-qr', { sessionToken, latitude, longitude });
      stopCamera();
      resultEl.innerHTML = `
        <div class="alert alert-success">
          <div class="fw-bold mb-1"><i class="bi bi-check-circle-fill"></i> Attendance marked</div>
          <div>Status: ${GsUtil.statusBadge(record.status)}</div>
          <div class="small gs-muted mt-1">Distance from faculty: ${record.distanceMeters ?? '—'} m · ${GsUtil.formatDateTime(record.scannedAt)}</div>
        </div>`;
    } catch (err) {
      resultEl.innerHTML = `<div class="alert alert-danger">${GsUtil.escapeHtml(GsUtil.apiErrorMessage(err))}</div>`;
      submitted = false;
      if (scanning) requestAnimationFrame(scanFrame);
    } finally {
      GsUtil.hideSpinner();
    }
  }
})();
