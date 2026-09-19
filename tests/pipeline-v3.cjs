'use strict';

/* =========================================================
   Task #3 验收：服务端 Hard/Soft Gate 拆分 + Judge 收窄
   =========================================================

   这一批测试锁住的是「结构性保证」，不是「这次模型碰巧答对了」：

     1. 两份部署副本的业务逻辑必须逐字节一致
     2. 每个响应都带流水线版本，50 / 200 题评测才能按版本归因
     3. soft 字段（考点、难度）不符 → 转成展示层修正，绝不拒稿
     4. hard 字段为 false → 拒稿，且理由必须是可枚举字符串
     5. 审核员自由文本只能进 reviewer_notes，不能当拒稿依据
     6. 展示层修正不得改动 canonical 字段（否则 content 快照失效）
     7. 判题员拿不到 solution，也拿不到机会回传自由文本反馈
     8. canonical_suspected → 作废题目，但不归咎学生
     9. 上游故障 → judge_unavailable，前端据此提示重试
    10. 只有「再试一次可能成功」的错误才重试
    11. 上游返回 HTML 时报协议错误，而不是 "Unexpected token '<'"
    12. 客户端必须原样保留服务端的失败原因，不得降级
   ========================================================= */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const path = require('node:path');

const Q = require('../math-quality');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

/* 跨 vm realm 的数组/对象原型与本 realm 不同，deepStrictEqual 会把
   「结构完全一样」判成不相等。所有从沙箱里拿出来的容器都先过一遍这里。 */
const plain = value => JSON.parse(JSON.stringify(value));

const DEPLOYMENTS = ['api/deepseek.js', 'cloudbase/deepseek/index.js'];

/* 会走 AI 判题的输入：确定性引擎对 sin(x) vs 1 无解，必然落到模型。 */
const UNCERTAIN = 'sin(x)';

const draft = () => ({
  module: 'limit',
  topic: '重要极限',
  instruction: '计算极限',
  expression: '\\lim_{x\\to0}\\sin(x)/x',
  answer: '1',
  solution: '利用重要极限，结果为 1。',
  difficulty: 6
});

const review = () => ({
  ...Object.fromEntries(Q.fields.map(k => [k, true])),
  confidence: 0.97,
  issues: [],
  independent_answer: '1'
});

function approved(q = draft()) {
  q.verification = { ...review(), version: Q.VERSION, status: 'approved', content: Q.content(q) };
  q.source = 'ai';
  return q;
}

function createConsole() {
  const lines = [];
  const push = (...args) => lines.push(args.map(String).join(' '));
  return { lines, log: push, warn: push, error: push, info: push };
}

/* 把后端当模块喂进 vm。用真 vm 而不是 mock，是为了连 require 出来的
   math-quality 一起验：副本用的是相对路径，路径写错这里就会炸。 */
function backend(file) {
  const console_ = createConsole();

  const context = vm.createContext({
    require: createRequire(path.resolve(root, file)),
    module: { exports: {} },
    process,
    console: console_,
    AbortSignal,
    URL,
    setTimeout,
    clearTimeout,
    fetch: async () => {
      throw new Error('Unexpected real network');
    }
  });

  let source = read(file);

  // cloudbase 版在模块顶层 server.listen，会把测试进程挂住。
  if (file.includes('cloudbase')) {
    source = source.replace(
      "server.listen(PORT, '0.0.0.0', () => {",
      "if (false) server.listen(PORT, '0.0.0.0', () => {"
    );
  }

  vm.runInContext(source, context);
  context.consoleLines = console_.lines;

  return context;
}

/* =========================================================
   1. 副本一致性
   ========================================================= */

function businessLogic(file) {
  const source = read(file);
  const start = source.indexOf('const PIPELINE = {');

  assert.ok(start > 0, file + ' 找不到业务逻辑起点标记 const PIPELINE');

  return source.slice(start);
}

test('两份部署副本的业务逻辑必须逐字节一致', () => {
  assert.equal(
    businessLogic(DEPLOYMENTS[0]),
    businessLogic(DEPLOYMENTS[1]),
    'api/ 与 cloudbase/ 的业务逻辑已经分叉 —— 实际生效的是 cloudbase 那份，' +
      '只改 api/ 等于什么都没改'
  );
});

test('引擎副本必须逐字节一致', () => {
  assert.equal(
    read('math-quality.js'),
    read('cloudbase/deepseek/math-quality.js'),
    '两份 math-quality.js 分叉了'
  );
});

/* =========================================================
   2. 版本号
   ========================================================= */

for (const file of DEPLOYMENTS) {
  test(`${file}: 每个响应都带流水线版本`, () => {
    const c = backend(file);
    const v = c.versions();

    assert.equal(v.protocol, 2);
    for (const key of ['generator', 'reviewer', 'judge', 'math_engine']) {
      assert.ok(v[key], key + ' 版本缺失，出了问题没法归因');
    }
    assert.equal(v.math_engine, Q.VERSION);
  });
}

/* =========================================================
   3~6. Hard / Soft Gate 拆分
   ========================================================= */

for (const file of DEPLOYMENTS) {
  test(`${file}: soft 字段不符不得拒稿，只产出展示层修正`, async () => {
    const c = backend(file);

    c.callDeepSeek = async () => ({
      ...review(),
      topic_match: false,
      difficulty_reasonable: false,
      suggested_topic: '洛必达法则',
      suggested_difficulty: 8,
      // 审核员的自由文本。v1.0 会拿它当拒稿依据，一句「考点与计划不符」
      // 就能把一道数学完全正确的题扔掉。
      issues: ['考点与计划不符']
    });

    const r = await c.reviewQuestion('mock', {
      question: draft(),
      plan: { topic: '重要极限', targetDifficulty: 6 }
    });

    assert.equal(r.status, 'approved', 'soft 字段把题目拒了：' + JSON.stringify(r.issues));
    assert.deepEqual(plain(r.issues), [], '拒稿理由必须是可枚举的硬理由');
    assert.deepEqual(plain(r.reviewer_notes), ['考点与计划不符'], '自由文本只能进 reviewer_notes');
    assert.equal(r.metadata?.topic, '洛必达法则');
    assert.equal(r.metadata?.difficulty, 8);
  });

  test(`${file}: hard 字段为 false 必须拒稿，且理由可枚举`, async () => {
    const c = backend(file);
    c.callDeepSeek = async () => ({ ...review(), solution_correct: false });

    const r = await c.reviewQuestion('mock', { question: draft() });

    assert.equal(r.status, 'rejected');
    assert.ok(
      r.issues.includes('HARD_FIELD_FALSE:solution_correct'),
      '拒稿理由必须说清是哪一项：' + JSON.stringify(r.issues)
    );
  });

  test(`${file}: 审核员独立求出的答案与题包不一致时，必须拒稿`, async () => {
    const c = backend(file);
    c.callDeepSeek = async () => ({ ...review(), independent_answer: '1/2' });

    const r = await c.reviewQuestion('mock', { question: draft() });

    assert.equal(r.status, 'rejected');
    assert.ok(r.issues.includes('INDEPENDENT_ANSWER_DISAGREES'), JSON.stringify(r.issues));
  });

  test(`${file}: 展示层修正不得破坏 content 快照`, async () => {
    const c = backend(file);

    c.callDeepSeek = async () => ({
      ...review(),
      topic_match: false,
      difficulty_reasonable: false,
      suggested_topic: '洛必达法则',
      suggested_difficulty: 8
    });

    const q = draft();
    const verification = await c.reviewQuestion('mock', { question: q, plan: {} });
    const before = Q.content(q);

    c.applyMetadataCorrection(q, verification);

    assert.equal(Q.content(q), before, 'canonical 字段被改动了，快照会立刻失效');
    assert.equal(q.topic, '重要极限', 'canonical topic 不许被展示层修正覆盖');
    assert.equal(q.displayTopic, '洛必达法则');
    assert.equal(q.displayDifficulty, 8);

    // 最关键的断言：改完展示字段之后，这道题仍然必须被认可。
    // v1.0 的「这道题存在异常」事故就是这一步失败的后果。
    q.verification = { ...verification, status: 'approved', content: before };
    assert.ok(Q.approved(q), '展示层修正把题目自己弄失效了');
  });

  test(`${file}: 确定性引擎抓到的错题不必消耗模型调用`, async () => {
    const c = backend(file);
    let calls = 0;
    c.callDeepSeek = async () => {
      calls++;
      return review();
    };

    const r = await c.reviewQuestion('mock', {
      question: { ...draft(), answer: '0', solution: '结果为 0。' }
    });

    assert.equal(r.status, 'rejected');
    assert.equal(calls, 0, '引擎已经能判定的错题不该再去问模型');
  });
}

/* =========================================================
   7~9. Judge 收窄
   ========================================================= */

for (const file of DEPLOYMENTS) {
  test(`${file}: 判题不得把解析发给模型，也不得回传模型自由文本`, async () => {
    const c = backend(file);
    let captured = null;

    c.callDeepSeek = async (apiKey, messages) => {
      captured = messages;
      return { verdict: 'equivalent', confidence: 0.99, reason: '等价' };
    };

    const r = await c.judgeAnswer('mock', { question: approved(), userAnswer: UNCERTAIN });

    assert.ok(captured, '这个输入应该足以走到模型判题');
    const body = JSON.stringify(captured);

    assert.ok(body.includes('reference_answer'), '判题必须拿到参考答案');
    assert.ok(!body.includes('利用重要极限'), '解析被塞进判题上下文了 —— 模型会被带偏');
    assert.ok(!/"solution"/.test(body), '判题上下文里不该出现 solution 字段');

    // 反馈必须是固定文案。只要允许模型自由文本回传，它就有机会写出
    // 「其实正确答案应该是……」—— 同一道题上就出现了两个「正确答案」。
    assert.equal(r.feedback, '与参考答案数学等价。');
  });

  test(`${file}: judge 的 system 提示必须明令禁止重新求解`, () => {
    const source = read(file);

    for (const clause of [
      '不要重新求解这道题',
      '不要给出你认为的正确答案',
      '不要评价题目或参考答案是否正确'
    ]) {
      assert.ok(source.includes(clause), '判题提示词缺少约束：' + clause);
    }
  });

  test(`${file}: canonical_suspected → 作废题目，但不归咎学生`, async () => {
    const c = backend(file);
    c.callDeepSeek = async () => ({ verdict: 'canonical_suspected', confidence: 0.99 });

    const r = await c.judgeAnswer('mock', { question: approved(), userAnswer: UNCERTAIN });

    assert.equal(r.verdict, 'canonical_suspected');
    assert.equal(r.trusted, false);
    assert.equal(r.reason, 'canonical_suspected');
    assert.equal(r.correct, null, '不能给学生判错');

    const outcome = Q.judgeOutcome(r);
    assert.equal(outcome.action, 'void_question');
    assert.equal(outcome.blameStudent, false, '标准答案有问题不是学生的错');
  });

  test(`${file}: 判题上游故障 → judge_unavailable，不得当成题目问题`, async () => {
    const c = backend(file);
    c.callDeepSeek = async () => {
      const error = new Error('upstream down');
      error.statusCode = 503;
      error.code = 'UPSTREAM_REJECTED';
      throw error;
    };

    const r = await c.judgeAnswer('mock', { question: approved(), userAnswer: UNCERTAIN });

    assert.equal(r.reason, 'judge_unavailable');
    assert.equal(r.trusted, false);
    assert.equal(r.correct, null);
    assert.equal(r.feedback, undefined, '服务不可用时不该编出反馈文案');

    const outcome = Q.judgeOutcome(r);
    assert.equal(outcome.action, 'retry_judge', '网络抖动必须让用户重试');
    assert.notEqual(outcome.action, 'void_question', '网络故障被当成了题目有问题');
  });

  test(`${file}: 低置信度的 AI 结论不得采信`, async () => {
    const c = backend(file);
    c.callDeepSeek = async () => ({ verdict: 'equivalent', confidence: 0.4 });

    const r = await c.judgeAnswer('mock', { question: approved(), userAnswer: UNCERTAIN });

    assert.equal(r.trusted, false);
    assert.equal(r.verdict, 'uncertain');
    assert.equal(r.correct, null);
  });

  test(`${file}: 题目本身不可信时判题必须拒绝作答`, async () => {
    const c = backend(file);
    let calls = 0;
    c.callDeepSeek = async () => {
      calls++;
      return { verdict: 'equivalent', confidence: 0.99 };
    };

    const broken = approved({ ...draft(), answer: '0', solution: '结果为 0。' });
    const r = await c.judgeAnswer('mock', { question: broken, userAnswer: UNCERTAIN });

    assert.equal(r.reason, 'question_untrusted');
    assert.equal(r.trusted, false);
    assert.equal(calls, 0, '题目本身已失效，不该再去问模型');
  });
}

/* =========================================================
   10~11. 重试 / 退避 / 错误分类
   ========================================================= */

for (const file of DEPLOYMENTS) {
  test(`${file}: 只有「再试一次可能成功」的错误才重试`, () => {
    const c = backend(file);

    assert.equal(c.isRetryable({ statusCode: 429 }), true, '限流要重试');
    assert.equal(c.isRetryable({ statusCode: 500 }), true);
    assert.equal(c.isRetryable({ statusCode: 503 }), true);

    assert.equal(c.isRetryable({ statusCode: 400 }), false, '参数错误重试没意义');
    assert.equal(c.isRetryable({ statusCode: 401 }), false, '鉴权失败重试没意义');
    assert.equal(c.isRetryable({ statusCode: 404 }), false);

    assert.equal(c.isRetryable({ name: 'TimeoutError' }), true);
    assert.equal(c.isRetryable({ name: 'AbortError' }), true);
    assert.equal(c.isRetryable({ name: 'TypeError' }), true, 'fetch 层断网是 TypeError');
    assert.equal(c.isRetryable({ name: 'SyntaxError' }), false);
    assert.equal(c.isRetryable(undefined), false);
  });

  test(`${file}: 重试次数必须服从各标签的策略`, async () => {
    const c = backend(file);
    c.sleep = async () => {};

    const counting = code => {
      let n = 0;
      return {
        calls: () => n,
        fn: async () => {
          n++;
          const error = new Error('boom');
          error.statusCode = code;
          throw error;
        }
      };
    };

    const rate = counting(429);
    c.callDeepSeekOnce = rate.fn;
    await assert.rejects(c.callDeepSeek('k', [], 10, 0, 'judge'));
    assert.equal(rate.calls(), 2, 'judge 策略允许一次重试');

    const bad = counting(400);
    c.callDeepSeekOnce = bad.fn;
    await assert.rejects(c.callDeepSeek('k', [], 10, 0, 'judge'));
    assert.equal(bad.calls(), 1, '参数错误不该重试');

    const gen = counting(503);
    c.callDeepSeekOnce = gen.fn;
    await assert.rejects(c.callDeepSeek('k', [], 10, 0, 'generate'));
    assert.equal(gen.calls(), 1, 'generate 内层不重试，否则会把客户端超时预算顶死');
  });

  test(`${file}: 退避必须是指数增长且有上限，并带抖动`, () => {
    const c = backend(file);

    assert.equal(c.backoffDelay(1, 0), 0, 'base 为 0 时不等待');

    const first = c.backoffDelay(1, 1000);
    const second = c.backoffDelay(2, 1000);

    assert.ok(first >= 1000 && first <= 1300, '第一次退避应在 1000ms 上下：' + first);
    assert.ok(second >= 2000 && second <= 2600, '第二次退避应翻倍：' + second);
    assert.ok(c.backoffDelay(9, 1000) <= 5200, '退避必须有上限，不能无限翻倍');

    // 抖动：同样参数不该永远得到同一个值，否则并发重试会形成尖峰。
    const samples = new Set();
    for (let i = 0; i < 40; i++) samples.add(c.backoffDelay(3, 500));
    assert.ok(samples.size > 1, '退避没有抖动');
  });

  test(`${file}: 上游返回 HTML 时报协议错误，而不是伪装成 JSON 解析失败`, async () => {
    const c = backend(file);

    await assert.rejects(
      c.readUpstreamJson({
        ok: false,
        status: 502,
        text: async () => '<html><body>Bad Gateway</body></html>'
      }),
      error => {
        assert.equal(error.code, 'UPSTREAM_PROTOCOL_ERROR');
        assert.equal(error.statusCode, 502, '真实的 502 必须保留，不能被压成 500');
        assert.ok(!/Unexpected token/.test(error.message), '不能把网关的锅甩给 JSON');
        return true;
      }
    );
  });
}

/* =========================================================
   12. 拒稿日志带版本
   ========================================================= */

for (const file of DEPLOYMENTS) {
  test(`${file}: 拒稿日志必须带流水线版本，数据才能按版本归因`, async () => {
    const c = backend(file);
    c.generateDraftQuestions = async () => ({ questions: [draft()] });
    c.callDeepSeek = async () => ({ ...review(), answer_correct: false });

    await assert.rejects(
      c.generateQuestions('mock', { plans: [{ targetDifficulty: 6 }] }),
      error => {
        assert.ok(Array.isArray(error.rejectionReasons) && error.rejectionReasons.length);
        assert.equal(error.versions.protocol, 2);
        return true;
      }
    );

    const rejects = c.consoleLines.filter(l => l.includes('generation_gate_rejected'));
    assert.equal(rejects.length, 2, '两次尝试都该留日志，否则查不出是第几次出的问题');

    const entry = JSON.parse(rejects[1]);
    assert.deepEqual(plain(entry.versions), {
      protocol: 2,
      generator: 'generator-v2',
      reviewer: 'reviewer-v2',
      judge: 'judge-v2',
      math_engine: Q.VERSION
    });
    assert.ok(entry.reasons.length, '日志里必须写明拒稿理由');
    assert.equal(entry.attempt, 2, '最后一次日志要标出这是第二次尝试');
  });
}

/* =========================================================
   13~14. 客户端不得丢掉原因、不得说错话
   ========================================================= */

function appHarness() {
  const source = read('app.js');

  // 从真实 app.js 里切出生产函数，不引导 UI。
  function fn(name) {
    const start = source.search(new RegExp('  (?:async )?function ' + name + '\\('));
    const ends = [source.indexOf('\n  function ', start + 1), source.indexOf('\n  async function ', start + 1)]
      .filter(x => x >= 0);
    return source.slice(start, Math.min(...ends));
  }

  const elements = {
    answerInput: { value: 'sin(x)' },
    submitAnswerBtn: {},
    box: { innerHTML: '' },
    retryQualityBtn: { addEventListener() {} }
  };

  const reports = [];

  const context = vm.createContext({
    MathQuality: Q,
    FallbackBank: require('../fallback-bank'),
    FALLBACK_BANK: require('../fallback-bank').BANK,
    state: { activeSession: null },
    $: id => elements[id],
    console: { log() {}, warn() {}, error() {} },
    localStorage: {
      getItem: () => null,
      setItem: (key, value) => reports.push({ key, value })
    },
    window: { dispatchEvent() {} },
    CustomEvent: function () {},
    toast() {},
    markApiRequestFailure() {},
    markApiRequestSuccess() {},
    apiCall: async () => {
      throw new Error('network');
    },
    saveState() {},
    ensureCurrentQuestion() {},
    document: {}
  });

  for (const name of ['trustedQuestion', 'reportQuestionIssue', 'voidQuestion', 'judgeUnavailable', 'judgeAnswer']) {
    vm.runInContext(fn(name), context);
  }

  return { c: context, elements, reports };
}

test('客户端必须原样保留服务端的判题失败原因，不得降级', async () => {
  const { c } = appHarness();

  const cases = [
    ['question_untrusted', Q.JUDGE_REASONS.QUESTION_UNTRUSTED],
    ['judge_unavailable', Q.JUDGE_REASONS.JUDGE_UNAVAILABLE],
    ['canonical_suspected', Q.JUDGE_REASONS.CANONICAL_SUSPECTED],
    ['judge_uncertain', Q.JUDGE_REASONS.JUDGE_UNCERTAIN],
    // 服务端没见过的原因一律兜底成「结论不可用」，仍然走重试。
    ['empty_input', Q.JUDGE_REASONS.JUDGE_UNCERTAIN]
  ];

  for (const [serverReason, expected] of cases) {
    c.apiCall = async () => ({ trusted: false, verdict: 'uncertain', reason: serverReason });
    const result = await c.judgeAnswer(approved(), 'sin(x)');
    assert.equal(result.reason, expected, `${serverReason} 在客户端被降级了`);
  }
});

test('界面不得把「标准答案有问题」和「题目异常」说成同一句话', () => {
  const { c, elements } = appHarness();
  const session = { mode: 'daily', currentQuestion: {}, results: [] };

  c.voidQuestion(session, { module: 'limit', topic: '重要极限' }, 'box', '1', {
    reason: Q.JUDGE_REASONS.CANONICAL_SUSPECTED
  });

  assert.match(elements.box.innerHTML, /标准答案存在问题/);
  assert.match(elements.box.innerHTML, /这不是你的错/);
  assert.ok(!/这道题存在异常/.test(elements.box.innerHTML));

  elements.box.innerHTML = '';
  c.voidQuestion(session, { module: 'limit', topic: '重要极限' }, 'box', '1', {
    reason: Q.JUDGE_REASONS.QUESTION_UNTRUSTED
  });

  assert.match(elements.box.innerHTML, /这道题存在异常/);
  assert.ok(!/标准答案存在问题/.test(elements.box.innerHTML));
});

/* =========================================================
   15. canonical 冻结：静态守卫
   ========================================================= */

/* canonical 字段一旦被就地改写，verification.content 快照立刻失配，
   整道题会被判成「不可信」并显示「这道题存在异常」。
   这类事故不是逻辑写错，而是"顺手改了一下"，所以用静态检查兜住。 */
const CANONICAL_FIELDS = ['module', 'topic', 'instruction', 'expression', 'prompt', 'answer', 'solution'];

test('app.js 不得就地修改题目的 canonical 字段', () => {
  const source = read('app.js');
  const offenders = [];

  for (const field of CANONICAL_FIELDS) {
    // 只看赋值（= / += 等），不看对象字面量里的 `topic:`
    const pattern = new RegExp('\\.' + field + '\\s*(?:[+\\-*/%]|\\|\\||&&)?=(?!=)', 'g');
    for (const match of source.matchAll(pattern)) {
      const line = source.slice(0, match.index).split('\n').length;
      offenders.push(`app.js:${line} → ${match[0]}`);
    }
  }

  assert.deepEqual(offenders, [],
    'canonical 字段被就地改写了，content() 快照会立刻失效：\n  ' + offenders.join('\n  '));
});

test('content() 快照必须只由 canonical 字段决定', () => {
  // 每个 canonical 字段都给一个非空值，否则"清空后快照没变"这条断言
  // 会因为源值本来就是空而误报。
  const base = { ...draft(), prompt: '求该极限的值' };
  const before = Q.content(base);

  // 展示层/模型层字段怎么变，都不许影响快照 —— 否则 soft 修正会把题目弄失效
  assert.equal(Q.content({ ...base, displayTopic: '洛必达法则', displayDifficulty: 9, metadataCorrection: { a: 1 } }), before);
  assert.equal(Q.content({ ...base, calibratedDifficulty: 9.9, provisionalDifficulty: 1, difficultyConfidence: 0.1 }), before);
  assert.equal(Q.content({ ...base, status: 'void', source: 'fallback', id: 'x', verification: null }), before);

  // 反过来：canonical 字段任何一个变了，快照都必须跟着变
  for (const field of ['topic', 'instruction', 'expression', 'prompt', 'solution']) {
    assert.notEqual(Q.content({ ...base, [field]: String(base[field] || '') + '!' }), before,
      field + ' 竟然不在快照里 —— 改了它题目却不会被判失效');
    assert.notEqual(Q.content({ ...base, [field]: '' }), before, field + ' 清空后快照没变');
  }

  assert.notEqual(Q.content({ ...base, answer: '2' }), before);
  assert.notEqual(Q.content({ ...base, module: 'integral' }), before);
});

/* =========================================================
   16. 复习队列：题目内容与 verification 快照必须成对更新
   ========================================================= */

/* 复习队列按「考点」而不是「题目」建槽位（topicKey = module:topic）。
   所以学生在同一考点第二次做错时，会命中同一个槽位。
   旧写法把 instruction/expression/prompt/answer/solution 逐个覆盖过去，
   而 verification 快照留在创建时那道题上 —— 条目从此持有一份描述**另一道题**
   的验证快照。

   注意别把它说成"复习卡片会显示题目异常"：复习会话并不是把条目当题目渲染，
   而是拿它的题面当 referenceQuestion 重新生成一道题。所以这是一条
   「持久化数据自相矛盾」的隐患，不是当前可见的故障 —— 但只要将来有代码
   按 trustedQuestion 校验条目，它就会立刻变成可见故障。 */
function reviewHarness() {
  const source = read('app.js');

  function fn(name) {
    const start = source.search(new RegExp('  (?:async )?function ' + name + '\\('));
    const ends = [source.indexOf('\n  function ', start + 1), source.indexOf('\n  async function ', start + 1)]
      .filter(x => x >= 0);
    if (start < 0) throw new Error('app.js 里找不到 function ' + name);
    return source.slice(start, Math.min(...ends));
  }

  // CANONICAL_FIELDS 是 const，vm 里拿不到，直接从源码切出来重建
  const fieldsMatch = source.match(/const CANONICAL_FIELDS = \[([\s\S]*?)\];/);
  const CANONICAL_FIELDS = fieldsMatch
    ? fieldsMatch[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean)
    : null;

  const context = vm.createContext({
    MathQuality: Q,
    FallbackBank: require('../fallback-bank'),
    FALLBACK_BANK: require('../fallback-bank').BANK,
    CANONICAL_FIELDS,
    state: { reviews: [], difficultyModel: { version: 'v0-provisional' } },
    console: { log() {}, warn() {}, error() {} },
    Date,
    Math,
    JSON,
    // 与 app.js 同名工具：这几个不是本次要验的对象，按原意给等价实现
    addDaysISO: days => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10),
    deepClone: value => JSON.parse(JSON.stringify(value))
  });

  for (const name of ['uid', 'topicKey', 'trustedQuestion', 'bindReviewQuestion', 'queueWrongQuestion']) {
    vm.runInContext(fn(name), context);
  }

  return context;
}

const aiQuestion = (overrides = {}) => {
  const q = {
    module: 'limit',
    topic: '重要极限',
    instruction: '计算下列极限',
    expression: '\\lim_{x\\to0}\\sin(x)/x',
    prompt: '',
    answer: '1',
    solution: '利用重要极限，结果为 1。',
    estimatedDifficulty: 6,
    ...overrides
  };
  q.question_id = q.question_id || 'q-' + Math.random().toString(36).slice(2);
  q.verification = { ...review(), version: Q.VERSION, status: 'approved', content: Q.content(q) };
  q.source = 'ai';
  return q;
};

test('同一考点第二次做错时，复习条目的快照必须同步刷新', () => {
  const c = reviewHarness();

  const first = aiQuestion();
  c.queueWrongQuestion(first);

  assert.equal(c.state.reviews.length, 1);
  const item = c.state.reviews[0];
  assert.ok(Q.approved(item), '第一次入队后条目就该是可信的');

  // 同一考点、另一道题。槽位会被复用，题目内容会刷新。
  const second = aiQuestion({
    expression: '\\lim_{x\\to0}\\frac{e^x-1}{x}',
    answer: '1',
    solution: '等价无穷小，结果为 1。'
  });
  c.queueWrongQuestion(second);

  assert.equal(c.state.reviews.length, 1, '同一考点只应有一个槽位');
  assert.equal(c.state.reviews[0].id, item.id, '应该复用原槽位');

  // ── 核心断言 ──
  assert.equal(Q.content(item), item.verification.content,
    '题目内容被换掉了，快照却还是旧的 —— 复习时必然显示「这道题存在异常」');
  assert.ok(Q.approved(item), '刷新后条目必须仍然可信');
  assert.ok(c.trustedQuestion(item), '复习时会走 trustedQuestion，这里也必须过');

  // 题目确实换成了最近那道
  assert.equal(item.expression, second.expression);
  assert.equal(item.wrongCount, 2, '错题次数要累加');
});

test('旧写法确实会让复习条目失去可信性（反向验证）', () => {
  const c = reviewHarness();

  const first = aiQuestion();
  c.queueWrongQuestion(first);
  const item = c.state.reviews[0];

  // 手工复现 v1 的写法：只覆盖 canonical 字段，不动 verification
  const second = aiQuestion({
    expression: '\\lim_{x\\to0}\\frac{e^x-1}{x}',
    solution: '等价无穷小，结果为 1。'
  });
  item.expression = second.expression;
  item.solution = second.solution;

  assert.equal(Q.approved(item), false,
    '这个测试的意义在于：如果 v1 的写法不会导致失配，那上面那条测试就没有价值了');
  assert.equal(c.trustedQuestion(item), false);
});

test('备用题入复习队列后仍然可信（它靠 bankId，不靠快照）', () => {
  const c = reviewHarness();
  const bank = require('../fallback-bank').BANK;
  const b = bank[0];

  // fallbackQuestion 包装出来的形态
  c.queueWrongQuestion({ ...b, id: 'fallback-' + b.id, source: 'fallback', bankId: b.id });

  const item = c.state.reviews[0];
  assert.equal(item.source, 'fallback');
  assert.equal(item.bankId, b.id);
  assert.equal(item.verification, null, '备用题本来就不带快照');
  assert.ok(c.trustedQuestion(item), '备用题入队后必须仍被认可');
});

test('历史遗留的复习条目（没带 source/bankId）靠题面比对仍可被认可', () => {
  const c = reviewHarness();
  const bank = require('../fallback-bank').BANK;
  const b = bank[0];

  // 模拟 v1 存下来的老数据：只有题面，什么标记都没有
  const legacy = {
    id: 'legacy-1',
    module: b.module, topic: b.topic, instruction: b.instruction,
    expression: b.expression, prompt: '', answer: b.answer, solution: b.solution
  };

  assert.ok(c.trustedQuestion(legacy), '题面与题库一致的旧条目不该被判成不可信');

  // 但题面被改动过就不再认可
  assert.equal(c.trustedQuestion({ ...legacy, answer: '999' }), false);
});

test('展示层难度必须优先于 AI 生成的临时难度与它的标定变换', () => {
  const source = read('app.js');
  const start = source.indexOf('  function questionDifficultyLabel(');
  const end = source.indexOf('\n  function ', start + 1);

  const context = vm.createContext({ console: { log() {}, warn() {} } });
  vm.runInContext(source.slice(start, end), context);

  const label = q => context.questionDifficultyLabel(q);

  // displayDifficulty 是审核员对**这一道题**的修正。
  assert.equal(label({ provisionalDifficulty: 6, displayDifficulty: 7.5 }), '难度 7.5',
    '审核员修正过难度，界面必须显示修正后的值');

  // calibratedDifficulty 只是 calibrateDifficulty(provisionalDifficulty)，
  // 没有标定点时它就是 provisionalDifficulty 本身，不该压过针对本题的修正。
  assert.equal(label({ calibratedDifficulty: 6, provisionalDifficulty: 6, displayDifficulty: 7.5 }), '难度 7.5',
    'AI 自己猜测的单调变换压过了审核员的修正');

  assert.equal(label({ calibratedDifficulty: 8.2 }), '难度 8.2', '没有修正时用标定值');
  assert.equal(label({ provisionalDifficulty: 6 }), '难度 6.0');
  assert.equal(label({}), '难度 6.0', '完全没有难度信息时要有兜底');
});
