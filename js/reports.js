/* ==========================================================================
   reports.js — shared Reports Module UI kit
   Reused by admin.js, faculty.js, and student.js Reports sections so every
   report table gets the same search box, pagination, and CSV/Excel/PDF/Print
   export controls without duplicating the logic per role.

   Depends on: utils.js (GsUtil), and (loaded via CDN in each *-dashboard.html)
   SheetJS (`XLSX`) for Excel export and jsPDF + jspdf-autotable (`window.jspdf`)
   for PDF export. Both are optional — if a library failed to load (e.g. no
   network), the corresponding button just shows a toast instead of throwing.
   ========================================================================== */

const GsReportUI = (function () {
  function cellText(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  function humanizeKey(k) {
    return String(k)
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/^./, (c) => c.toUpperCase());
  }

  // ---- Export helpers -------------------------------------------------------------------
  function toCsv(keys, rows) {
    const esc = (v) => {
      const s = cellText(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [keys.map(humanizeKey).map(esc).join(',')];
    rows.forEach((r) => lines.push(keys.map((k) => esc(r[k])).join(',')));
    return lines.join('\n');
  }

  function downloadBlob(content, filename, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function exportCsv(filename, keys, rows) {
    if (!rows.length) { GsUtil.toast('Nothing to export.', 'warning'); return; }
    downloadBlob(toCsv(keys, rows), `${filename}.csv`, 'text/csv;charset=utf-8;');
  }

  function exportExcel(filename, keys, rows) {
    if (!rows.length) { GsUtil.toast('Nothing to export.', 'warning'); return; }
    if (typeof XLSX === 'undefined') {
      GsUtil.toast('Excel export library did not load — check your connection.', 'danger');
      return;
    }
    const data = [keys.map(humanizeKey), ...rows.map((r) => keys.map((k) => cellText(r[k])))];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `${filename}.xlsx`);
  }

  function exportPdf(title, keys, rows) {
    if (!rows.length) { GsUtil.toast('Nothing to export.', 'warning'); return; }
    if (typeof window.jspdf === 'undefined') {
      GsUtil.toast('PDF export library did not load — check your connection.', 'danger');
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: keys.length > 5 ? 'landscape' : 'portrait' });
    doc.setFontSize(14);
    doc.text(title, 14, 16);
    doc.setFontSize(9);
    doc.text(`Generated ${new Date().toLocaleString()}`, 14, 22);
    doc.autoTable({
      startY: 26,
      head: [keys.map(humanizeKey)],
      body: rows.map((r) => keys.map((k) => cellText(r[k]))),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [24, 45, 74] },
    });
    doc.save(`${title.replace(/\s+/g, '_')}.pdf`);
  }

  function printTable(title, keys, rows) {
    if (!rows.length) { GsUtil.toast('Nothing to print.', 'warning'); return; }
    const win = window.open('', '_blank');
    if (!win) { GsUtil.toast('Pop-up blocked — allow pop-ups to print.', 'warning'); return; }
    const html = `
      <html><head><title>${GsUtil.escapeHtml(title)}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:24px;color:#182d4a;}
        h1{font-size:18px;margin-bottom:2px;}
        p{font-size:11px;color:#666;margin-top:0;}
        table{width:100%;border-collapse:collapse;margin-top:12px;}
        th,td{border:1px solid #ccc;padding:6px 8px;font-size:12px;text-align:left;}
        th{background:#182d4a;color:#fff;}
        tr:nth-child(even){background:#f5f6f8;}
      </style></head><body>
      <h1>${GsUtil.escapeHtml(title)}</h1>
      <p>Generated ${GsUtil.escapeHtml(new Date().toLocaleString())} · ${rows.length} record(s)</p>
      <table><thead><tr>${keys.map((k) => `<th>${GsUtil.escapeHtml(humanizeKey(k))}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${keys.map((k) => `<td>${GsUtil.escapeHtml(cellText(r[k]))}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
      <script>window.onload=()=>{window.print();};</script>
      </body></html>`;
    win.document.write(html);
    win.document.close();
  }

  // ---- Paginated + searchable table with export toolbar --------------------------------
  /**
   * @param {object} opts
   *   container   - element to render into
   *   title       - report title (used for export filenames / PDF header / print header)
   *   rows        - full row array (array of objects)
   *   keys        - optional explicit column order; defaults to Object.keys(rows[0])
   *   formatters  - optional { key: (value, row) => htmlString } per-column render override
   *   pageSize    - rows per page (default 10)
   *   emptyMessage, emptyIcon
   */
  function renderReportTable(opts) {
    const {
      container, title, rows, keys: explicitKeys, formatters = {},
      pageSize = 10, emptyMessage = 'No records for this report.', emptyIcon = 'bi-inbox',
    } = opts;

    if (!rows || !rows.length) {
      container.innerHTML = `<div class="gs-empty border-0"><i class="bi ${emptyIcon}"></i>${GsUtil.escapeHtml(emptyMessage)}</div>`;
      return { refresh: () => {} };
    }

    const keys = explicitKeys && explicitKeys.length ? explicitKeys : Object.keys(rows[0]);
    let filtered = rows.slice();
    let page = 1;

    const uid = `rpt-${Math.random().toString(36).slice(2, 9)}`;
    container.innerHTML = `
      <div class="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-2">
        <input type="search" class="form-control form-control-sm" style="max-width:240px;" id="${uid}-search" placeholder="Search this report…">
        <div class="btn-group btn-group-sm" role="group">
          <button class="btn btn-outline-secondary" id="${uid}-csv" title="Export CSV"><i class="bi bi-filetype-csv"></i> CSV</button>
          <button class="btn btn-outline-secondary" id="${uid}-xlsx" title="Export Excel"><i class="bi bi-file-earmark-excel"></i> Excel</button>
          <button class="btn btn-outline-secondary" id="${uid}-pdf" title="Export PDF"><i class="bi bi-file-earmark-pdf"></i> PDF</button>
          <button class="btn btn-outline-secondary" id="${uid}-print" title="Print"><i class="bi bi-printer"></i> Print</button>
        </div>
      </div>
      <div class="table-responsive"><table class="table table-gs mb-0">
        <thead><tr>${keys.map((k) => `<th>${GsUtil.escapeHtml(humanizeKey(k))}</th>`).join('')}</tr></thead>
        <tbody id="${uid}-body"></tbody>
      </table></div>
      <div class="d-flex align-items-center justify-content-between mt-2">
        <div class="small text-muted" id="${uid}-count"></div>
        <nav><ul class="pagination pagination-sm mb-0" id="${uid}-pager"></ul></nav>
      </div>`;

    const body = container.querySelector(`#${uid}-body`);
    const countEl = container.querySelector(`#${uid}-count`);
    const pagerEl = container.querySelector(`#${uid}-pager`);

    function renderRow(r) {
      return `<tr>${keys.map((k) => {
        const fmt = formatters[k];
        return `<td>${fmt ? fmt(r[k], r) : GsUtil.escapeHtml(cellText(r[k]))}</td>`;
      }).join('')}</tr>`;
    }

    function draw() {
      const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
      if (page > totalPages) page = totalPages;
      const start = (page - 1) * pageSize;
      const pageRows = filtered.slice(start, start + pageSize);

      body.innerHTML = pageRows.length
        ? pageRows.map(renderRow).join('')
        : `<tr><td colspan="${keys.length}" class="gs-empty border-0"><i class="bi bi-search"></i>No rows match your search.</td></tr>`;

      countEl.textContent = filtered.length
        ? `Showing ${start + 1}–${Math.min(start + pageRows.length, filtered.length)} of ${filtered.length}`
        : 'No matching rows';

      let pagerHtml = '';
      for (let p = 1; p <= totalPages; p++) {
        if (totalPages > 7 && p !== 1 && p !== totalPages && Math.abs(p - page) > 1) {
          if (p === 2 || p === totalPages - 1) pagerHtml += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
          continue;
        }
        pagerHtml += `<li class="page-item ${p === page ? 'active' : ''}"><button class="page-link" data-page="${p}">${p}</button></li>`;
      }
      pagerEl.innerHTML = pagerHtml;
      pagerEl.querySelectorAll('button[data-page]').forEach((btn) => {
        btn.addEventListener('click', () => { page = Number(btn.dataset.page); draw(); });
      });
    }

    container.querySelector(`#${uid}-search`).addEventListener('input', GsUtil.debounce((e) => {
      const q = e.target.value.trim().toLowerCase();
      filtered = !q ? rows.slice() : rows.filter((r) => keys.some((k) => cellText(r[k]).toLowerCase().includes(q)));
      page = 1;
      draw();
    }, 200));

    container.querySelector(`#${uid}-csv`).addEventListener('click', () => exportCsv(title, keys, filtered));
    container.querySelector(`#${uid}-xlsx`).addEventListener('click', () => exportExcel(title, keys, filtered));
    container.querySelector(`#${uid}-pdf`).addEventListener('click', () => exportPdf(title, keys, filtered));
    container.querySelector(`#${uid}-print`).addEventListener('click', () => printTable(title, keys, filtered));

    draw();
    return { refresh: draw };
  }

  return { renderReportTable, exportCsv, exportExcel, exportPdf, printTable };
})();
