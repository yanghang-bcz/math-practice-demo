(() => {
  // 场景 G：AI 出题彻底失败（503 且重试后仍失败）→ 必须落到已验证备用题库
  const checks = [];
  const ck = (label, cond, detail) => checks.push({ label, ok: !!cond, detail: detail === undefined ? '' : String(detail) });

  const session = document.getElementById('dailySession');
  const html = session ? session.innerHTML : '';
  const text = (session ? session.innerText : '').replace(/\s+/g, ' ');

  const st = window.CalcDailyApp.getState();
  const s = st.activeSession;
  const q = s && s.currentQuestion;

  const generates = window.__mock.calls.filter(c => c === 'generate').length;

  // 每个 request_id 出现了几次 —— 用来证明「重试是同一个请求的第二次尝试」
  const attemptsPerRequest = {};
  for (const b of window.__mock.generateBodies) {
    const key = String(b.request_id || '(none)');
    attemptsPerRequest[key] = (attemptsPerRequest[key] || 0) + 1;
  }
  const maxAttempts = Math.max(0, ...Object.values(attemptsPerRequest));

  ck('出题请求确实失败了（服务端 503）',
    window.__mock.generateResponses.includes(503), JSON.stringify(window.__mock.generateResponses));
  // Task 5F：5xx 属于可重试，客户端应当自己再试一次，而不是立刻回落
  ck('客户端对 5xx 做过重试（同一个 request_id 发了两次）', maxAttempts === 2,
    JSON.stringify(attemptsPerRequest));
  ck('重试没有超过 2 次（预算有上限）', maxAttempts <= 2, maxAttempts);
  ck('出题请求总数与重试次数一致', generates === Object.values(attemptsPerRequest).reduce((a, b) => a + b, 0),
    generates + ' vs ' + JSON.stringify(attemptsPerRequest));

  ck('题目不是空的', !!q, q ? q.source : 'no question');

  // ── 核心：安全网接住了 ──
  ck('出题回落到备用题（source=fallback）', q && q.source === 'fallback', q && q.source);
  ck('备用题带 bankId，指向已验证题库',
    q && q.bankId && typeof FallbackBank !== 'undefined' && !!FallbackBank.byId(q.bankId),
    q && q.bankId);
  ck('备用题的题面与题库逐字段一致',
    q && typeof FallbackBank !== 'undefined' && MathQuality.content(q) === MathQuality.content(FallbackBank.byId(q.bankId)));
  ck('备用题带身份指纹且自洽',
    q && !!q.canonical_digest && MathQuality.canonicalIntact(q),
    q && q.canonical_digest);
  ck('备用题通过生产侧可信判定',
    q && MathQuality.approved(q) !== undefined && MathQuality.issues(q).length === 0,
    q && JSON.stringify(MathQuality.issues(q)));

  // ── 用户必须被告知，而且能继续做题 ──
  ck('提示语说明本次用了备用题',
    window.__toasts.some(t => t.includes('已使用备用题')), JSON.stringify(window.__toasts));
  ck('界面渲染出了作答控件', html.includes('answerInput') && html.includes('submitAnswerBtn'), text.slice(0, 120));
  ck('界面没有把失败说成题目异常',
    !text.includes('已自动作废') && !text.includes('这道题存在异常'), text.slice(0, 120));

  // ── 观测性：失败与回落都要进诊断缓冲 ──
  const summary = window.CalcDailyDiag.summary();
  ck('诊断里记录了出题失败', (summary.byAction.generate || 0) >= 1, JSON.stringify(summary.byOutcome));
  ck('诊断里记录了备用题回落', summary.fallbackCount >= 1, summary.fallbackCount);

  ck('无运行时错误', window.__errors.length === 0, window.__errors.join(' | '));

  return JSON.stringify({
    scenario: 'G 出题失败 → 备用题库',
    checks,
    calls: window.__mock.calls,
    generateResponses: window.__mock.generateResponses,
    toasts: window.__toasts,
    summary
  }, null, 1);
})()
