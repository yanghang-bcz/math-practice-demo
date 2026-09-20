(() => {
  /* 场景 K：前后端版本劈叉（最危险的状态是「连接正常」）

     mock 把每次响应里的 math_engine 报成 quality-v1，而本机是 quality-v2。
     期望：客户端**不采用**这道由另一套引擎验证出来的题，改用备用题库，
     状态栏用红点把「后端版本不匹配」说出来；而且协议错误不重试
     （重试只会再拿回一份同样不可信的题）。 */
  const checks = [];
  const ck = (label, cond, detail) => checks.push({ label, ok: !!cond, detail: detail === undefined ? '' : String(detail) });

  const text = document.getElementById('apiStatusText');
  const dot = document.getElementById('apiStatusDot');

  const st = window.CalcDailyApp.getState();
  const s = st.activeSession;
  const q = s && s.currentQuestion;

  const generates = window.__mock.calls.filter(c => c === 'generate').length;

  // 每个 request_id 的尝试次数：协议错误必须「一次即止」，重试只会再拿回
  // 一份同样不可信的题，只是把等待时间翻倍。
  const attemptsPerRequest = {};
  for (const b of window.__mock.generateBodies) {
    const key = String(b.request_id || '(none)');
    attemptsPerRequest[key] = (attemptsPerRequest[key] || 0) + 1;
  }
  const maxAttempts = Math.max(0, ...Object.values(attemptsPerRequest));

  // ── 核心一：版本不对的题一个都不能用 ──
  ck('没有采用版本不匹配的 AI 题', q && q.source !== 'ai', q && q.source);
  ck('落到了备用题库', q && q.source === 'fallback' && !!q.bankId, q && (q.source + '/' + q.bankId));
  ck('备用题来自本机已验证题库（本机引擎版本）',
    q && typeof FallbackBank !== 'undefined' && !!FallbackBank.byId(q.bankId));
  ck('题目不带服务端 verification 快照', q && !q.verification);
  ck('提示语说明本次用了备用题',
    window.__toasts.some(t => t.includes('已使用备用题')), JSON.stringify(window.__toasts));

  // ── 核心二：协议错误不重试 ──
  ck('协议不匹配没有触发重试（每个 request_id 只尝试一次）', maxAttempts === 1,
    JSON.stringify(attemptsPerRequest));

  // ── 核心三：状态栏必须说出真正的原因，而不是显示「已连接」──
  ck('状态栏说明后端版本不匹配',
    text && text.textContent.includes('后端版本不匹配'), text && text.textContent);
  ck('状态栏标出已改用备用题库',
    text && text.textContent.includes('备用题库'), text && text.textContent);
  ck('状态点变红（rose）', dot && dot.className.includes('bg-rose-500'), dot && dot.className);

  // ── 观测性 ──
  const summary = window.CalcDailyDiag.summary();
  ck('诊断里记了协议不匹配',
    (summary.byKind[CalcDailyDiag.kinds.PROTOCOL_MISMATCH] || 0) + (summary.byKind[CalcDailyDiag.kinds.GENERATE_PROTOCOL] || 0) >= 1,
    JSON.stringify(summary.byKind));
  ck('诊断里记了备用题回落', summary.fallbackCount >= 1, summary.fallbackCount);

  ck('无运行时错误', window.__errors.length === 0, window.__errors.join(' | '));

  return JSON.stringify({
    scenario: 'K 版本不匹配 → 拒绝服务端题 + 状态栏报警',
    checks,
    statusText: text && text.textContent,
    statusDot: dot && dot.className,
    calls: window.__mock.calls,
    toasts: window.__toasts,
    summary
  }, null, 1);
})()
