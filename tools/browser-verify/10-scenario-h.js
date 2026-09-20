(() => {
  // 场景 H：出题第一次 503、第二次成功 → 客户端必须自己重试并拿到 AI 题，
  // 而不是把用户直接推到备用题库。
  const checks = [];
  const ck = (label, cond, detail) => checks.push({ label, ok: !!cond, detail: detail === undefined ? '' : String(detail) });

  const st = window.CalcDailyApp.getState();
  const s = st.activeSession;
  const q = s && s.currentQuestion;

  const bodies = window.__mock.generateBodies;
  const responses = window.__mock.generateResponses;

  ck('第一次出题确实收到 503', responses[0] === 503, JSON.stringify(responses));
  ck('重试之后拿到了正常响应', responses.includes(200), JSON.stringify(responses));

  // ── 核心：重试是「同一个请求」的重试，不是又发了一个新请求 ──
  // 每次重试都换 request_id 的话，服务端日志里的两次尝试就对不上同一次出题，
  // 而客户端也没法判断晚到的响应属于谁。
  ck('重试沿用同一个 request_id',
    bodies.length >= 2 && bodies[0].request_id && bodies[0].request_id === bodies[1].request_id,
    bodies.slice(0, 2).map(b => b.request_id).join(' vs '));

  // 会话身份也不能在重试之间漂移，否则「第二次尝试」会被当成另一道题的位置。
  // 注意：**冷启动的预热出题本来就没有会话**（session_id 为 null 是合法的，
  // 那时用户还没点「开始练习」），所以这里查的是「不漂移」而不是「必须有值」。
  ck('重试的两次请求带的是同一份会话身份（session_id 不漂移）',
    bodies.length >= 2 && bodies[0].session_id === bodies[1].session_id,
    JSON.stringify(bodies.slice(0, 2).map(b => b.session_id)));
  ck('重试的两次请求带的是同一道题的位置（question_sequence 不漂移）',
    bodies.length >= 2 && bodies[0].question_sequence === bodies[1].question_sequence,
    JSON.stringify(bodies.slice(0, 2).map(b => b.question_sequence)));
  ck('每次出题请求都带 question_sequence（哪怕是 0）',
    bodies.every(b => Number.isFinite(b.question_sequence)),
    JSON.stringify(bodies.map(b => b.question_sequence)));
  ck('进入练习之后的出题请求带了 session_id',
    bodies.some(b => b.session_id), JSON.stringify(bodies.map(b => b.session_id)));

  // ── 用户视角：拿到了 AI 题，且没有看到任何降级提示 ──
  ck('最终拿到的是 AI 题', q && q.source === 'ai', q && q.source);
  ck('界面没有提示「已使用备用题」',
    !window.__toasts.some(t => t.includes('已使用备用题')), JSON.stringify(window.__toasts));

  // ── 观测性 ──
  const summary = window.CalcDailyDiag.summary();
  ck('诊断里没有回落计数', summary.fallbackCount === 0, summary.fallbackCount);

  ck('无运行时错误', window.__errors.length === 0, window.__errors.join(' | '));

  return JSON.stringify({
    scenario: 'H 出题 5xx → 自动重试一次',
    checks,
    responses,
    requests: bodies.map(b => ({ action: 'generate', request_id: b.request_id, session_id: b.session_id, question_sequence: b.question_sequence })),
    toasts: window.__toasts,
    summary
  }, null, 1);
})()
