/* Paste into an isolated acceptance browser tab before starting practice.
   Local capture only: no uploads, cookies, headers, passwords or account identifiers. */
(() => {
  'use strict';
  if (window.CalcDailyAcceptance) throw new Error('Collector already installed');
  const startedAt = new Date().toISOString(), records = [], requests = [], visible = [], clicks = [], questions = [];
  const seen = new Set(), visibleSlots = new Set(), pendingReads = new Set();
  const originalFetch = window.fetch, LIMIT = 50000;
  let truncated = false, pendingStart = null, lastMath = Promise.resolve(), mathOriginal, mathWrapper;
  const isAI = input => { try { return new URL(typeof input === 'string' ? input : input.url, location.href).pathname.endsWith('/api/deepseek'); } catch { return false; } };
  function harvest() {
    for (const e of window.CalcDailyDiag?.dump?.() || []) {
      if (e.at < startedAt) continue;
      const key = JSON.stringify(e);
      if (!seen.has(key)) {
        seen.add(key);
        if (records.length < LIMIT) records.push(e); else truncated = true;
      }
    }
    if (!mathOriginal && window.MathJax?.typesetPromise) {
      mathOriginal = window.MathJax.typesetPromise;
      mathWrapper = function(...args) { const p = mathOriginal.apply(this, args); lastMath = Promise.resolve(p).catch(() => {}); return p; };
      window.MathJax.typesetPromise = mathWrapper;
    }
  }
  window.fetch = async function(input, init) {
    if (!isAI(input)) return originalFetch.apply(this, arguments);
    let payload = {};
    try { payload = JSON.parse(init?.body || '{}'); } catch {}
    const row = { at: new Date().toISOString(), action: payload.action || 'health', request_id: payload.request_id || null,
      module: payload.plans?.[0]?.module || null, target_difficulty: payload.plans?.[0]?.targetDifficulty || null,
      topic: payload.plans?.[0]?.topic || null, completed: false, injected: false };
    const start = performance.now(); requests.push(row);
    try {
      const response = await originalFetch.apply(this, arguments);
      row.http_status = response.status;
      const task = (async () => {
        try {
          const data = await response.clone().json();
          Object.assign(row, { code: data.code || null, stage: data.stage || null, reason_code: data.reason_code || null,
            upstream_status: data.upstream_status || null, gate_state: data.gate_state || null, attempts: data.attempts || null, delivery_contract: data.delivery_contract || null });
          for (const q of data.questions || []) questions.push({ question_id: q.question_id || q.id, module: q.module,
            expression: q.expression, instruction: q.instruction, answer: q.answer, solution: q.solution,
            requested_difficulty: row.target_difficulty, topic: q.topic });
        } catch (e) { row.body_error = e.name; }
        finally { row.completed = true; row.duration_ms = performance.now() - start; }
      })();
      pendingReads.add(task);task.finally(() => pendingReads.delete(task));
      return response;
    } catch (e) {
      Object.assign(row, { completed: true, fetch_error: e.name, duration_ms: performance.now() - start });throw e;
    }
  };
  function onClick(e) {
    const target = e.target.closest?.('#startDailyBtn,#startDiagnosisBtn,#startDiagnosisFromDailyBtn');
    if (!target) return;
    if (pendingStart) pendingStart.cancelled_by_new_start = true;
    pendingStart = { at: new Date().toISOString(), start_perf: performance.now(), target: target.id, displayed: false };
    clicks.push(pendingStart);
  }
  let checking = false;
  async function captureVisible() {
    if (checking) return;
    checking = true;
    try {
      const input = [...document.querySelectorAll('.question-card #answerInput')].find(n => n.getClientRects().length && !n.disabled);
      if (!input) return;
      harvest();
      const e = [...(window.CalcDailyDiag?.dump?.() || [])].reverse().find(e => e.event === 'question_displayed');
      if (!e || e.at < startedAt) return;
      const key = `${e.session_id}:${e.question_sequence}`;
      if (visibleSlots.has(key)) return;
      await lastMath;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (!input.isConnected || !input.getClientRects().length) return;
      visibleSlots.add(key);
      const row = { ...e, observed_at: new Date().toISOString(), formula_rendered: Boolean(document.querySelector('.question-card mjx-container')) };
      if (pendingStart) {
        row.first_wait_ms = performance.now() - pendingStart.start_perf;
        pendingStart.displayed = true;pendingStart.first_wait_ms = row.first_wait_ms;pendingStart.session_id = e.session_id;pendingStart = null;
      }
      visible.push(row);
    } finally { checking = false; }
  }
  const observer = new MutationObserver(() => { void captureVisible(); });
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class','disabled'] });
  document.addEventListener('click', onClick, true);
  const timer = setInterval(() => { harvest();void captureVisible(); }, 200);
  window.CalcDailyAcceptance = {
    async export({ source = 'natural' } = {}) {
      harvest();await Promise.allSettled([...pendingReads]);await captureVisible();
      return { version: 1, source, started_at: startedAt, exported_at: new Date().toISOString(), truncated,
        requests, records, visible, clicks: clicks.map(({start_perf, ...r}) => r), questions };
    },
    async download(options) {
      const data = await this.export(options);const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download=`calcdaily-acceptance-${Date.now()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    },
    stop() { clearInterval(timer);observer.disconnect();document.removeEventListener('click',onClick,true);window.fetch=originalFetch;
      if (mathWrapper && window.MathJax?.typesetPromise === mathWrapper) window.MathJax.typesetPromise=mathOriginal;
      delete window.CalcDailyAcceptance;
    }
  };
  console.info('CalcDaily local acceptance collector installed. Run CalcDailyAcceptance.download() when finished; injected runs must use {source:"injected"}.');
})();
