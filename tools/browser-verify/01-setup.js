(() => {
  // 记录运行时错误，场景断言里统一检查
  window.__errors = [];
  window.addEventListener('error', e => window.__errors.push('error:' + e.message));
  window.addEventListener('unhandledrejection', e => window.__errors.push('rejection:' + (e.reason && e.reason.message || e.reason)));
  const origError = console.error;
  console.error = function (...a) { window.__errors.push('console.error:' + a.map(String).join(' ').slice(0, 300)); return origError.apply(console, a); };

  // toast 是自动消失的，用 MutationObserver 把出现过的文案都留下来
  window.__toasts = [];
  window.__allToasts = [];
  const toastEl = document.getElementById('toast');
  if (toastEl) {
    new MutationObserver(() => {
      const t = (toastEl.textContent || '').trim();
      if (t && window.__toasts[window.__toasts.length - 1] !== t) window.__toasts.push(t);
      if (t && window.__allToasts[window.__allToasts.length - 1] !== t) window.__allToasts.push(t);
    }).observe(toastEl, { childList: true, characterData: true, subtree: true, attributes: true });
  }

  // 出题按顺序轮转。两道题**同一个考点、不同题面** —— 这是为了能复现
  // 「同一考点第二次做错」那条路径（复习队列按 module:topic 建槽位）。
  // displayTopic / displayDifficulty 只挂在第一道上，方便场景 A 单独断言。
  function buildQuestion(index) {
    const specs = [
      {
        expression: '\\lim_{x\\to 0}\\frac{\\sin x}{x}',
        solution: '利用重要极限，结果为 1。',
        displayTopic: '洛必达法则',
        displayDifficulty: 8
      },
      {
        expression: '\\lim_{x\\to 0}\\frac{e^x-1}{x}',
        solution: '等价无穷小替换，结果为 1。'
      }
    ];
    const spec = specs[index % specs.length];
    const q = {
      module: 'limit',
      topic: '重要极限',
      instruction: '计算下列极限',
      expression: spec.expression,
      prompt: '',
      answer: '1',
      solution: spec.solution,
      estimatedDifficulty: 6
    };
    if (spec.displayTopic) q.displayTopic = spec.displayTopic;
    if (spec.displayDifficulty) q.displayDifficulty = spec.displayDifficulty;

    // 必须能过客户端硬闸门：verification.content 要等于 MathQuality.content(q)
    q.verification = {
      question_valid: true, answer_correct: true, solution_correct: true, answer_solution_consistent: true,
      topic_match: !spec.displayTopic, difficulty_reasonable: !spec.displayTopic,
      confidence: 0.97, issues: [], version: MathQuality.VERSION, status: 'approved',
      content: MathQuality.content(q),
      metadata: spec.displayTopic
        ? { topic: spec.displayTopic, difficulty: spec.displayDifficulty, reason_topic: 'reviewer judged topic_match=false' }
        : null
    };
    return q;
  }

  window.__mock = { judge: null, judgeStatus: 200, generateStatus: 200, calls: [], judgeBodies: [], generated: 0, nextIndex: null };

  window.fetch = async function (url, options) {
    const u = String(url);
    if (u.includes('health=1')) {
      return new Response(JSON.stringify({ ok: true, service: 'deepseek', protocol_version: 2,
        pipeline: { protocol: 2, generator: 'generator-v2', reviewer: 'reviewer-v2', judge: 'judge-v2', math_engine: MathQuality.VERSION } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const body = options && options.body ? JSON.parse(options.body) : {};
    window.__mock.calls.push(body.action);
    if (body.action === 'judge') window.__mock.judgeBodies.push(body);

    if (body.action === 'generate') {
      if (window.__mock.generateStatus !== 200) {
        return new Response(JSON.stringify({ error: '生成失败', code: 'UPSTREAM_REJECTED' }),
          { status: window.__mock.generateStatus, headers: { 'Content-Type': 'application/json' } });
      }
      // nextIndex 非空时强制出某一道：轮转计数会被预热预取吃掉，
      // 场景需要"下一题必须是另一道同考点的题"时就得显式指定。
      const index = window.__mock.nextIndex !== null ? window.__mock.nextIndex : window.__mock.generated++;
      const q = buildQuestion(index);
      return new Response(JSON.stringify({ questions: [q], attempts: 1,
        versions: { protocol: 2, generator: 'generator-v2', reviewer: 'reviewer-v2', judge: 'judge-v2', math_engine: MathQuality.VERSION } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (body.action === 'judge') {
      if (window.__mock.judgeStatus !== 200) {
        return new Response(JSON.stringify({ error: '判题服务暂时不可用', reason: 'judge_unavailable' }),
          { status: window.__mock.judgeStatus, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify(window.__mock.judge), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (body.action === 'evaluate') {
      return new Response(JSON.stringify({ difficulty: 6, confidence: 0.4 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'unexpected action ' + body.action }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  };

  return 'mock installed: MathQuality=' + MathQuality.VERSION + ' gate=' + MathQuality.approved(buildQuestion());
})()
