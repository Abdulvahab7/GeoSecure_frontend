/* ==========================================================================
   perf.js — GsPerf: shared performance helpers
   Additive, opt-in module loaded early (right after utils.js) so other
   shared modules (security.js, reports.js, admin/faculty/student.js) can
   use it. Nothing existing was changed to make room for this file.

   Responsibilities:
   - throttle() — companion to GsUtil.debounce() for high-frequency events
     (scroll, mousemove, activity tracking) where the debounce would delay
     the trailing call too long.
   - dedupeGet()/cachedGet() — collapse concurrent identical GET requests
     into one network call, and optionally cache short-lived, frequently
     re-fetched reference data (departments/subjects/classes/faculty lists)
     so switching sections repeatedly doesn't re-hit the same endpoint.
   - once() — ensures a section/module is only initialized a single time,
     to avoid duplicate event-listener registration on re-render.
   - renderRows()/fragmentAppend() — fast table body rendering using a
     DocumentFragment instead of repeated string concatenation + innerHTML
     for large row sets.
   - measure() — lightweight dev-time timing helper (no-op unless a query
     flag is set), useful for spotting slow renders without shipping a
     profiling dependency.
   ========================================================================== */

const GsPerf = (function () {
  // ---- Throttle ---------------------------------------------------------------------------
  function throttle(fn, wait = 200) {
    let last = 0;
    let timer = null;
    return (...args) => {
      const now = Date.now();
      const remaining = wait - (now - last);
      if (remaining <= 0) {
        clearTimeout(timer);
        last = now;
        fn(...args);
      } else {
        clearTimeout(timer);
        timer = setTimeout(() => {
          last = Date.now();
          fn(...args);
        }, remaining);
      }
    };
  }

  // ---- GET request dedupe + short-lived cache ----------------------------------------------
  const inFlightGets = new Map();   // key -> Promise
  const cache = new Map();          // key -> { data, expiresAt }

  function keyFor(path, params) {
    return params ? `${path}?${JSON.stringify(params)}` : path;
  }

  /** Collapses concurrent identical GET calls into a single network request.
   *  Does not cache across calls once resolved — use cachedGet() for that. */
  function dedupeGet(path, params) {
    const key = keyFor(path, params);
    if (inFlightGets.has(key)) return inFlightGets.get(key);
    const promise = GsApi.get(path, params).finally(() => inFlightGets.delete(key));
    inFlightGets.set(key, promise);
    return promise;
  }

  /** Like dedupeGet(), but also caches the resolved value for `ttlMs` so
   *  repeatedly switching back to the same section (e.g. reference-data
   *  dropdowns: departments/classes/faculty/subjects) doesn't re-fetch on
   *  every visit. Pass ttlMs = 0 to disable caching (dedupe only). */
  function cachedGet(path, params, ttlMs = 30000) {
    const key = keyFor(path, params);
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.data);

    return dedupeGet(path, params).then((data) => {
      if (ttlMs > 0) cache.set(key, { data, expiresAt: Date.now() + ttlMs });
      return data;
    });
  }

  function invalidateCache(pathPrefix) {
    if (!pathPrefix) { cache.clear(); return; }
    for (const key of cache.keys()) {
      if (key.startsWith(pathPrefix)) cache.delete(key);
    }
  }

  // ---- One-time init guard ------------------------------------------------------------------
  const initialized = new Set();
  function once(id, fn) {
    if (initialized.has(id)) return false;
    initialized.add(id);
    fn();
    return true;
  }

  // ---- Fast row rendering -------------------------------------------------------------------
  /** Renders an array of row-HTML strings into a <tbody>/container using a
   *  single DocumentFragment + one reflow, instead of building one giant
   *  string (fine for small tables, wasteful for large/frequent re-renders)
   *  or doing repeated appendChild calls (many reflows). */
  function renderRows(container, rowsHtml) {
    if (!container) return;
    const tpl = document.createElement('template');
    tpl.innerHTML = rowsHtml.join('');
    const frag = tpl.content;
    container.replaceChildren(frag);
  }

  // ---- Dev-time timing (no-op in normal use) ----------------------------------------------
  const timingEnabled = /[?&]gsperf=1\b/.test(window.location.search);
  function measure(label, fn) {
    if (!timingEnabled) return fn();
    const t0 = performance.now();
    const result = fn();
    const done = (t1) => console.debug(`[GsPerf] ${label}: ${(t1 - t0).toFixed(1)}ms`);
    if (result && typeof result.then === 'function') {
      return result.then((v) => { done(performance.now()); return v; });
    }
    done(performance.now());
    return result;
  }

  return {
    throttle, dedupeGet, cachedGet, invalidateCache, once, renderRows, measure,
  };
})();
