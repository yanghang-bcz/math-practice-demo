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

  // 客户端流水线版本（app.js clientPipeline() 的定义，必须一致，否则每次响应
  // 都会被 Task 5I 的逐次版本校验拦下来）
  function goodVersions() {
    return { protocol: 2, generator: 'generator-v2', reviewer: 'reviewer-v2', judge: 'judge-v2', math_engine: MathQuality.VERSION };
  }

  window.__mock = {
    // 判题桩：null 表示「没有桩」，走真实的服务端返回结构
    judge: null,
    judgeStatus: 200,
    // 前 N 次 judge 请求返回 503（用于验证客户端自动重试）
    judgeFailures: 0,
    generateStatus: 200,
    // 前 N 次 generate 请求返回 503（用于验证自动重试 / 耗尽后回落备用题）
    generateFailures: 0,
    // 挂起下一次 generate：请求会一直 pending，直到场景调用 __mock.release()
    holdGenerate: false,
    _release: null,
    // true 时 fetch 直接抛 TypeError，模拟断网
    offline: false,
    // 覆盖 health 与各响应里的版本（用于 5I 版本不匹配场景）
    versions: null,
    // 记录
    calls: [],
    judgeBodies: [],
    generateBodies: [],
    generateResponses: [],
    judgeResponses: [],
    healthResponses: [],
    generated: 0,
    nextIndex: null
  };

  window.__mock.release = function () {
    const fn = window.__mock._release;
    window.__mock._release = null;
    if (fn) fn();
  };

  function json(obj, status) {
    return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
  }

  window.fetch = async function (url, options) {
    const u = String(url);

    if (window.__mock.offline) {
      // 浏览器真实断网时 fetch 抛的是 TypeError（"Failed to fetch"）
      const error = new TypeError('Failed to fetch');
      window.__mock.calls.push('offline!');
      throw error;
    }

    if (u.includes('health=1')) {
      const versions = window.__mock.versions || goodVersions();
      window.__mock.healthResponses.push(versions);
      return json({ ok: true, service: 'deepseek', protocol_version: 2, pipeline: versions });
    }

    const body = options && options.body ? JSON.parse(options.body) : {};
    window.__mock.calls.push(body.action);
    if (body.action === 'judge') window.__mock.judgeBodies.push(body);
    if (body.action === 'generate') window.__mock.generateBodies.push(body);

    // 服务端会把 request_id / session_id / question_sequence 原样回显（Task 5E/5F/5I）。
    // 不回显的话，客户端那三条校验永远走不到，等于在浏览器里测了个假的协议。
    const echo = {
      request_id: body.request_id ?? null,
      session_id: body.session_id ?? null,
      question_sequence: body.question_sequence ?? null,
      versions: window.__mock.versions || goodVersions()
    };

    if (body.action === 'generate') {
      if (window.__mock.holdGenerate) {
        window.__mock.holdGenerate = false;
        await new Promise(resolve => { window.__mock._release = resolve; });
      }

      if (window.__mock.generateFailures > 0) {
        window.__mock.generateFailures -= 1;
        window.__mock.generateResponses.push(503);
        return json({ error: '生成服务暂时不可用', code: 'UPSTREAM_REJECTED' }, 503);
      }

      if (window.__mock.generateStatus !== 200) {
        window.__mock.generateResponses.push(window.__mock.generateStatus);
        return json({ error: '生成失败', code: 'UPSTREAM_REJECTED' }, window.__mock.generateStatus);
      }

      // nextIndex 非空时强制出某一道：轮转计数会被预热预取吃掉，
      // 场景需要"下一题必须是另一道同考点的题"时就得显式指定。
      const index = window.__mock.nextIndex !== null ? window.__mock.nextIndex : window.__mock.generated++;
      const q = buildQuestion(index);
      window.__mock.generateResponses.push(200);
      return json({ questions: [q], attempts: 1, ...echo });
    }

    if (body.action === 'judge') {
      if (window.__mock.judgeFailures > 0) {
        window.__mock.judgeFailures -= 1;
        window.__mock.judgeResponses.push(503);
        return json({ error: '判题服务暂时不可用', reason: 'judge_unavailable' }, 503);
      }

      if (window.__mock.judgeStatus !== 200) {
        window.__mock.judgeResponses.push(window.__mock.judgeStatus);
        return json({ error: '判题服务暂时不可用', reason: 'judge_unavailable' }, window.__mock.judgeStatus);
      }

      window.__mock.judgeResponses.push(200);
      return json({ ...(window.__mock.judge || {}), ...echo });
    }

    if (body.action === 'evaluate') {
      return json({ difficulty: 6, confidence: 0.4, ...echo });
    }

    return json({ error: 'unexpected action ' + body.action }, 400);
  };

  // 回显用的 request_id：客户端发的那个（body.request_id）

  return 'mock installed: MathQuality=' + MathQuality.VERSION + ' gate=' + MathQuality.approved(buildQuestion());
})()
