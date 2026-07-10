/* ==========================================================================
   charts.js — reusable Chart.js utility kit (GsCharts)
   Phase 5B (Analytics Module).

   Wraps Chart.js so every analytics chart across all three dashboards gets
   consistent styling, a loading state, an empty state, and safe re-render
   (destroys any previous Chart instance bound to the same canvas before
   drawing a new one — required because Chart.js throws if you construct a
   second chart on a canvas that already has one).

   Depends on: Chart.js (loaded via CDN in each *-dashboard.html, BEFORE this
   file), utils.js (GsUtil.escapeHtml).
   ========================================================================== */

const GsCharts = (function () {
  const registry = new Map(); // canvasId -> Chart instance

  const PALETTE = [
    '#12897a', '#d99a3a', '#1e2e48', '#c14f4a', '#5b8def',
    '#8b5cf6', '#0d6b5f', '#e0a458', '#4a7c8c', '#a35d6a',
  ];

  function colorAt(i) { return PALETTE[i % PALETTE.length]; }

  function alpha(hex, a) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  function destroy(canvasId) {
    const existing = registry.get(canvasId);
    if (existing) { existing.destroy(); registry.delete(canvasId); }
  }

  /** Shows a centered spinner inside the chart's wrapper element. */
  function showLoading(wrapEl) {
    wrapEl.innerHTML = `<div class="gs-chart-state"><span class="spinner-border spinner-border-sm text-muted"></span><span class="ms-2">Loading…</span></div>`;
  }

  /** Shows a friendly empty state inside the chart's wrapper element. */
  function showEmpty(wrapEl, message = 'No data available yet.', icon = 'bi-bar-chart') {
    wrapEl.innerHTML = `<div class="gs-chart-state gs-chart-empty"><i class="bi ${icon}"></i><span>${GsUtil.escapeHtml(message)}</span></div>`;
  }

  /** Shows an error/fallback state (e.g. a proposed-but-missing backend endpoint). */
  function showError(wrapEl, message, proposedNote) {
    wrapEl.innerHTML = `
      <div class="gs-chart-state gs-chart-empty">
        <i class="bi bi-exclamation-triangle"></i>
        <span>${GsUtil.escapeHtml(message)}</span>
        ${proposedNote ? `<div class="small text-muted mt-1">${proposedNote}</div>` : ''}
      </div>`;
  }

  /** Ensures a fresh <canvas id="canvasId"> exists inside wrapEl and returns its 2D-ready element. */
  function freshCanvas(wrapEl, canvasId) {
    destroy(canvasId);
    wrapEl.innerHTML = `<canvas id="${canvasId}"></canvas>`;
    return wrapEl.querySelector(`#${canvasId}`);
  }

  const baseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { boxWidth: 12, font: { size: 11 } } },
      tooltip: { backgroundColor: '#101b2d', padding: 10, cornerRadius: 6 },
    },
  };

  function merge(a, b) { return Object.assign({}, a, b); }

  /**
   * Generic renderer. `type`: 'line' | 'bar' | 'doughnut' | 'radar' | 'polarArea'.
   * `wrapEl`: the container div (NOT the canvas) — a fresh canvas is created inside it.
   * `rows`: array of data rows; empty/undefined triggers the empty state instead of drawing.
   */
  function render({ wrapEl, canvasId, type, labels, datasets, rows, options = {}, emptyMessage, emptyIcon }) {
    if (typeof Chart === 'undefined') {
      showError(wrapEl, 'Chart library did not load — check your connection.');
      return null;
    }
    if (!rows || !rows.length) {
      destroy(canvasId);
      showEmpty(wrapEl, emptyMessage, emptyIcon);
      return null;
    }
    const canvas = freshCanvas(wrapEl, canvasId);
    const isRadial = type === 'doughnut' || type === 'pie' || type === 'polarArea';
    const chart = new Chart(canvas.getContext('2d'), {
      type,
      data: { labels, datasets },
      options: merge(baseOptions, merge({
        scales: isRadial ? {} : {
          y: { beginAtZero: true, grid: { color: '#e4e8ee' }, ticks: { font: { size: 10 } } },
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        },
      }, options)),
    });
    registry.set(canvasId, chart);
    return chart;
  }

  // ---- Convenience shapers for common single-series / multi-series cases -----------------

  function lineChart(opts) {
    const { labels, values, label = 'Value', color = colorAt(0), fill = true } = opts;
    return render(merge(opts, {
      type: 'line',
      labels,
      rows: values,
      datasets: [{
        label, data: values, borderColor: color, backgroundColor: alpha(color, 0.12),
        fill, tension: 0.35, pointRadius: 3, pointBackgroundColor: color, borderWidth: 2,
      }],
    }));
  }

  function multiLineChart(opts) {
    const { labels, series } = opts; // series: [{label, values}]
    return render(merge(opts, {
      type: 'line',
      labels,
      rows: series && series.length ? series[0].values : [],
      datasets: (series || []).map((s, i) => ({
        label: s.label, data: s.values, borderColor: colorAt(i),
        backgroundColor: alpha(colorAt(i), 0.1), fill: false, tension: 0.35,
        pointRadius: 2.5, borderWidth: 2,
      })),
    }));
  }

  function barChart(opts) {
    const { labels, values, label = 'Value', color = colorAt(0), horizontal = false } = opts;
    return render(merge(opts, {
      type: 'bar',
      labels,
      rows: values,
      options: horizontal ? { indexAxis: 'y' } : {},
      datasets: [{ label, data: values, backgroundColor: alpha(color, 0.75), borderRadius: 5, maxBarThickness: 36 }],
    }));
  }

  function multiBarChart(opts) {
    const { labels, series } = opts; // series: [{label, values}]
    return render(merge(opts, {
      type: 'bar',
      labels,
      rows: series && series.length ? series[0].values : [],
      datasets: (series || []).map((s, i) => ({
        label: s.label, data: s.values, backgroundColor: alpha(colorAt(i), 0.75), borderRadius: 4, maxBarThickness: 28,
      })),
    }));
  }

  function doughnutChart(opts) {
    const { labels, values } = opts;
    return render(merge(opts, {
      type: 'doughnut',
      labels,
      rows: values,
      datasets: [{ data: values, backgroundColor: (labels || []).map((_, i) => colorAt(i)), borderWidth: 2, borderColor: '#fff' }],
      options: { cutout: '62%' },
    }));
  }

  function radarChart(opts) {
    const { labels, series } = opts;
    return render(merge(opts, {
      type: 'radar',
      labels,
      rows: series && series.length ? series[0].values : [],
      datasets: (series || []).map((s, i) => ({
        label: s.label, data: s.values, borderColor: colorAt(i),
        backgroundColor: alpha(colorAt(i), 0.15), borderWidth: 2, pointRadius: 3,
      })),
      options: {
        scales: {
          r: { beginAtZero: true, suggestedMax: 100, grid: { color: '#e4e8ee' }, pointLabels: { font: { size: 10 } } },
        },
      },
    }));
  }

  return {
    render, lineChart, multiLineChart, barChart, multiBarChart, doughnutChart, radarChart,
    showLoading, showEmpty, showError, destroy, colorAt,
  };
})();
