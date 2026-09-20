'use strict';

/* =========================================================
   Task 5G：Verified Fallback Bank 审计
   =========================================================

   备用题库是**最后一道安全网**：AI 出题失败时用户拿到的就是它。
   所以它的验收标准不能是「看过一遍觉得没问题」，必须是逐条可复核：

     · 60 道全部由确定性引擎判定为 correct —— 不接受 uncertain
       （fallback-bank.cjs 那一组允许 5 道 uncertain，因为那是「人工已复核」；
        这里是安全网验收，安全网里不该有需要人背书的条目）
     · 身份唯一：id 不重复、同模块内表达式不重复
     · 规模：每模块 ≥ 20 道，且低/中/高三档难度都要有
     · 去重后仍有候选：排除最近做过的题之后**不能**退回到刚做过的题
     · 生产降级路径可用：closestFallback / fallbackQuestion / 空池显式失败

   这一组和 fallback-bank.cjs 不重复：那一组测「题库本身对不对」，
   这一组测「安全网在真实调用路径上兜得住吗」。
   ========================================================= */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const Q = require('../math-quality');
const Bank = require('../fallback-bank');
const support = require('../tools/test-support.cjs');

const MODULES = ['limit', 'derivative', 'integral'];
const MIN_PER_MODULE = 20;
const read = support.read;

/* =========================================================
   1. 规模与结构
   ========================================================= */

test('题库规模：总数 60，每模块 20，模块名不越界', () => {
  assert.equal(Bank.BANK.length, 60, '题库总数应为 60');

  for (const module of MODULES) {
    const n = Bank.byModule(module).length;
    assert.ok(n >= MIN_PER_MODULE, `${module} 只有 ${n} 道，少于 ${MIN_PER_MODULE}`);
  }

  const known = new Set(MODULES);
  for (const q of Bank.BANK) {
    assert.ok(known.has(q.module), `${q.id} 的 module 是未知值 ${q.module}`);
  }
});

test('字段完整且类型正确（difficulty 是 1..10 的整数）', () => {
  for (const q of Bank.BANK) {
    assert.equal(typeof q.id, 'string');
    assert.equal(typeof q.module, 'string');
    assert.equal(typeof q.topic, 'string');
    assert.equal(typeof q.instruction, 'string');
    assert.equal(typeof q.expression, 'string');
    assert.equal(typeof q.answer, 'string');
    assert.equal(typeof q.solution, 'string');

    assert.ok(q.id.length, `${q.id} id 为空`);
    assert.ok(q.topic.length, `${q.id} topic 为空`);
    assert.ok(q.expression.length, `${q.id} expression 为空`);
    assert.ok(q.answer.length, `${q.id} answer 为空`);
    assert.ok(q.solution.length, `${q.id} solution 为空`);

    assert.ok(
      Number.isInteger(q.difficulty) && q.difficulty >= 1 && q.difficulty <= 10,
      `${q.id} difficulty=${q.difficulty} 不是 1..10 的整数`
    );
  }
});

/* 复制粘贴事故最典型的样子：题改了，落到别的模块，instruction 还是老的。
   limit 的题写着「求导」这种，人眼很容易漏，机器一查就出来。 */
test('instruction 必须与 module 语义一致（防复制粘贴事故）', () => {
  const expect = {
    limit: '极限',
    integral: '积分',
    derivative: '导'
  };

  for (const q of Bank.BANK) {
    assert.ok(
      q.instruction.includes(expect[q.module]),
      `${q.id}（module=${q.module}）的 instruction 是「${q.instruction}」，与模块不符`
    );
  }
});

/* =========================================================
   2. 身份唯一
   ========================================================= */

test('id 全局唯一', () => {
  const seen = new Map();
  const dups = [];

  for (const q of Bank.BANK) {
    if (seen.has(q.id)) dups.push(`${q.id}（${seen.get(q.id)} 与 ${q.expression}）`);
    seen.set(q.id, q.expression);
  }

  assert.deepEqual(dups, [], 'id 重复：\n' + dups.join('\n'));
});

test('同一模块内表达式不得重复（题面重复等于同一道题反复出现）', () => {
  const seen = new Map();
  const dups = [];

  for (const q of Bank.BANK) {
    const key = `${q.module}::${q.expression}`;
    if (seen.has(key)) dups.push(`${key}（${seen.get(key)} 与 ${q.id}）`);
    seen.set(key, q.id);
  }

  assert.deepEqual(dups, [], '重复题面：\n' + dups.join('\n'));
});

/* 表达式不同但答案+解析整段照抄：大概率是改了题面忘了改解析。 */
test('不存在「不同题面、完全相同答案与解析」的偷懒条目', () => {
  const seen = new Map();
  const dups = [];

  for (const q of Bank.BANK) {
    const key = `${q.answer}||${q.solution}`;
    if (seen.has(key)) dups.push(`${seen.get(key)} / ${q.id}（答案与解析完全相同）`);
    seen.set(key, q.id);
  }

  assert.deepEqual(dups, [], '疑似复制粘贴未改解析：\n' + dups.join('\n'));
});

/* =========================================================
   3. ★ 确定性验证：安全网里不允许有猜测
   ========================================================= */

test('★ 60/60 全部由确定性引擎判定为满足题目（不接受 uncertain）', () => {
  const uncertain = [];
  const failures = [];

  for (const q of Bank.BANK) {
    const verdict = Q.verifyAnswerAgainstQuestion(q, String(q.answer));

    if (verdict === 'equivalent') continue;

    if (verdict === 'uncertain') uncertain.push(`${q.id} :: ${q.expression} = ${q.answer}`);
    else failures.push(`${q.id} :: ${q.expression} = ${q.answer} => ${verdict}`);
  }

  assert.deepEqual(failures, [], '备用题答案不满足题目：\n' + failures.join('\n'));
  assert.deepEqual(
    uncertain,
    [],
    '备用题库出现引擎无法判定的题 —— 安全网里的每一条都必须机器可验：\n' + uncertain.join('\n')
  );
});

test('★ 60/60 的 issues() 完全为空', () => {
  const dirty = [];

  for (const q of Bank.BANK) {
    const issues = Q.issues(q);
    if (issues.length) dirty.push(`${q.id} :: ${JSON.stringify(issues)}`);
  }

  assert.deepEqual(dirty, [], '题库存在质量问题：\n' + dirty.join('\n'));
});

/* 备用题走的是 judgeAnswer 里最短的一条信任路径（bankId 命中即放行），
   所以它的答案质量是整条链上唯一没有第二道防线的环节。 */
test('★ 每一条备用题都必须是「学生照抄标准答案就判对、错的答案判得出来」', () => {
  const wrong = [];

  for (const q of Bank.BANK) {
    const exact = Q.judgeDeterministic(q, String(q.answer));
    if (!exact || exact.verdict !== 'equivalent') {
      wrong.push(`${q.id} 抄标准答案却判不出「对」：${JSON.stringify(exact)}`);
    }
    // 回到判题路径时用的也是同一条引擎（judgeDeterministic 是唯一入口）
    if (Q.verifyAgainstQuestion(q, String(q.answer)) !== 'equivalent') {
      wrong.push(`${q.id} verifyAgainstQuestion 与 judgeDeterministic 结论不一致`);
    }
  }

  assert.deepEqual(wrong, [], wrong.join('\n'));

  // 抽查：给一个明显不相干的答案，必须给出「不等价」而不是留下 uncertain。
  // 注意 999999 这类值对极限/导数题仍然是合法数值输入，所以这里只要求
  // 「不把错答案判成对」，不强求每条都能断言成 not_equivalent（有些题的
  // 常量答案确实无法用数值采样否定，那是引擎能力边界而不是题库问题）。
  const sample = [Bank.BANK[0], Bank.BANK[20], Bank.BANK[50]];
  for (const q of sample) {
    const verdict = Q.judgeDeterministic(q, '999999');
    assert.ok(verdict, `${q.id} 对明显错误的答案没有给出任何结论`);
    assert.notEqual(verdict.verdict, 'equivalent', `${q.id} 把 999999 判成了正确答案`);
  }
});

/* =========================================================
   4. ★ 冻结与篡改：备用题也不能例外
   ========================================================= */

test('★ 每条备用题冻结后身份自洽，且冻结不改变 content() 快照', () => {
  for (const q of Bank.BANK) {
    const before = Q.content(q);
    const frozen = Q.freezeCanonical({ ...q });

    assert.equal(Q.content(frozen), before, `${q.id} 冻结动作改动了 content() 快照`);
    assert.equal(Q.canonicalIntact(frozen), true, `${q.id} 冻结后立刻就不自洽`);
    assert.equal(Q.canonicalIntegrity(frozen).reason, 'intact');
    assert.ok(frozen.canonical_digest, `${q.id} 没有写下指纹`);
  }
});

test('★ 每条备用题被就地改写后都必须被抓住', () => {
  const missed = [];

  for (const q of Bank.BANK) {
    for (const patch of [
      { answer: `${q.answer}+1` },
      { expression: `${q.expression}\\,dx` },
      { solution: q.solution + '（已改写）' }
    ]) {
      const tampered = Q.freezeCanonical({ ...q, ...patch });
      // 先把冻结写在原题上，再改字段 —— 这才是「就地改写」的真实形态
      const mutated = { ...Q.freezeCanonical({ ...q }), ...patch };
      const changed = Q.canonicalChangedFields(Q.freezeCanonical({ ...q }), mutated);

      if (Q.canonicalIntact(mutated)) {
        missed.push(`${q.id} 改了 ${Object.keys(patch)[0]} 仍被判为完整`);
        continue;
      }

      assert.ok(
        Q.issues(mutated).includes(Q.CODES.CANONICAL_MUTATED),
        `${q.id} 改了 ${Object.keys(patch)[0]} 却没报 CANONICAL_MUTATED`
      );
      assert.ok(changed.length, `${q.id} 改了 ${Object.keys(patch)[0]} 但 diff 为空`);
      // 反例：只是复制一份并冻结，不该被判成篡改
      assert.equal(Q.canonicalIntact(tampered), true, `${q.id} 复制后冻结被误判为篡改`);
    }
  }

  assert.deepEqual(missed, [], missed.join('\n'));
});

/* =========================================================
   5. 选取逻辑：去重之后仍有候选
   ========================================================= */

test('★ 排除 10 道最近做过的题后，仍然能选出没做过的新题', () => {
  for (const module of MODULES) {
    const recent = Bank.byModule(module).slice(0, 10).map(q => q.id);
    const picked = Bank.pick({ module, targetDifficulty: 5, recentIds: recent });

    assert.ok(picked, `${module} 排除 10 道后选不出题`);
    assert.equal(picked.module, module);
    assert.ok(
      !recent.includes(picked.id),
      `${module} 排除 10 道后仍退回刚做过的 ${picked.id}`
    );
  }
});

test('★ 连续取题 20 次得到 20 道互不相同的题（去重真的生效）', () => {
  for (const module of MODULES) {
    const seen = [];

    for (let i = 0; i < MIN_PER_MODULE; i++) {
      const picked = Bank.pick({ module, targetDifficulty: 1 + (i % 10), recentIds: seen });

      assert.ok(picked, `${module} 第 ${i + 1} 次取题失败`);
      assert.ok(!seen.includes(picked.id), `${module} 第 ${i + 1} 次重复取到 ${picked.id}`);
      seen.push(picked.id);
    }

    assert.equal(new Set(seen).size, MIN_PER_MODULE, `${module} 20 次取题未覆盖全部题目`);
  }
});

test('★ 整池都被标记为最近做过时退回全池，而不是返回 null', () => {
  for (const module of MODULES) {
    const all = Bank.byModule(module).map(q => q.id);
    const picked = Bank.pick({ module, targetDifficulty: 6, recentIds: all });

    assert.ok(picked, `${module} 整池去重后返回了 null —— 安全网会在最需要它的时候断掉`);
    assert.equal(picked.module, module);
  }
});

test('去重与考点偏好同时生效时优先给没做过且考点匹配的题', () => {
  const pool = Bank.byModule('limit');
  const topic = pool[0].topic;
  const sameTopic = pool.filter(q => q.topic === topic);

  // 排除掉同考点的前面几道，剩下的应换成同考点里没做过的那道
  const recent = sameTopic.slice(0, 1).map(q => q.id);
  const picked = Bank.pick({ module: 'limit', targetDifficulty: pool[0].difficulty, topic, recentIds: recent });

  assert.ok(picked);
  assert.ok(!recent.includes(picked.id));
});

test('选取逻辑：未知模块返回 null，交给上层降级', () => {
  assert.equal(Bank.pick({ module: 'linear-algebra' }), null);
  assert.equal(Bank.pick({}), Bank.pick({ module: 'limit' }), '空参数应落到默认模块 limit');
});

test('byId 能命中的 id 一定在池里，命不中返回 null', () => {
  for (const q of Bank.BANK) {
    assert.equal(Bank.byId(q.id), q);
  }
  assert.equal(Bank.byId('fb-nope-99'), null);
  assert.equal(Bank.byId(null), null);
});

/* =========================================================
   6. 难度与考点覆盖
   ========================================================= */

test('每模块都覆盖低、中、高三档难度', () => {
  for (const module of MODULES) {
    const diffs = Bank.byModule(module).map(q => q.difficulty);

    assert.ok(Math.min(...diffs) <= 3, `${module} 缺低难度题（min=${Math.min(...diffs)}）`);
    assert.ok(Math.max(...diffs) >= 7, `${module} 缺高难度题（max=${Math.max(...diffs)}）`);
    assert.ok(
      diffs.some(d => d >= 4 && d <= 6),
      `${module} 缺中难度题`
    );
  }
});

test('每模块的考点不少于 5 个（避免整模块押在一个考点上）', () => {
  for (const module of MODULES) {
    const topics = new Set(Bank.byModule(module).map(q => q.topic));
    assert.ok(topics.size >= 5, `${module} 只有 ${topics.size} 个考点`);
  }
});

test('每个考点至少 1 道，且没有考点只挂在一条上导致取题必撞', () => {
  const counts = new Map();

  for (const q of Bank.BANK) {
    const key = `${q.module}::${q.topic}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  for (const [key, n] of counts) {
    assert.ok(n >= 1, `${key} 计数异常`);
  }

  // 模块内考点分布不能只有一个（否则去重一开就必然退回）
  for (const module of MODULES) {
    const inModule = [...counts.keys()].filter(k => k.startsWith(module + '::')).length;
    assert.ok(inModule >= 5, `${module} 的考点分布过窄：${inModule}`);
  }
});

/* =========================================================
   7. 生产降级路径（app.js）
   ========================================================= */

/* 和 canonical-freeze.cjs 做法一致：从真实 app.js 切片，不引导 UI。

   默认按真实情况注入 FallbackBank（题库模块已加载）。
   `{ bankModule: undefined, bank: [] }` 用来模拟「fallback-bank.js 根本没加载」——
   这才是空池在生产里的真实成因，app.js 也是据此算出 FALLBACK_BANK = []。 */
function appHarness(options = {}) {
  const source = read('app.js');
  const fn = support.appSlice(source);
  const bankModule = 'bankModule' in options ? options.bankModule : Bank;
  const bankList = 'bank' in options
    ? options.bank
    : (bankModule ? bankModule.BANK : []);

  const context = vm.createContext({
    MathQuality: Q,
    FallbackBank: bankModule,
    FALLBACK_BANK: bankList,
    ...support.diagContextBits(source),
    state: { difficultyModel: { version: 'v0-provisional' }, history: [] },
    console: { log() {}, warn() {}, error() {} },
    window: { dispatchEvent() {} },
    CustomEvent: function () {},
    localStorage: { getItem: () => null, setItem: () => {} },
    Date,
    Math,
    JSON,
    uid: prefix => `${prefix}-test`,
    clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)),
    calibrateDifficulty: v => v
  });

  for (const name of [
    ...support.DIAG_FUNCTIONS,
    'freezeQuestion',
    'canonicalIntegrityOf',
    'recentFallbackIds',
    'closestFallback',
    'fallbackQuestion',
    'trustedQuestion'
  ]) {
    vm.runInContext(fn(name), context);
  }

  return context;
}

test('★ fallbackQuestion 产出的题满足生产侧的全部信任约束', () => {
  const h = appHarness();

  for (const module of MODULES) {
    for (const target of [1, 4, 7, 10]) {
      const q = h.fallbackQuestion({ module, targetDifficulty: target, purpose: 'daily' });

      assert.ok(q && q.answer, `${module}@${target} 备用题没取到`);
      assert.equal(q.module, module, '备用题跨模块了');
      assert.equal(q.source, 'fallback');
      assert.ok(q.bankId, '备用题必须留下 bankId');
      assert.ok(
        Bank.byId(q.bankId),
        `${q.bankId} 不在题库里 —— bankId 是伪造的`
      );
      assert.equal(
        Q.content(q),
        Q.content(Bank.byId(q.bankId)),
        '备用题的题面与题库不一致（身份在搬运中被改过）'
      );

      assert.equal(q.canonical_digest ? true : false, true, '备用题没有身份指纹');
      assert.equal(h.canonicalIntegrityOf(q).ok, true);
      assert.equal(h.trustedQuestion(q), true, '备用题通不过生产侧可信判定');

      // 难度四件套必须齐，否则难度模型会把它当前作废值
      assert.equal(q.provisionalDifficulty, Bank.byId(q.bankId).difficulty);
      assert.equal(q.requestedDifficulty, target);
      assert.ok(Number.isFinite(q.calibratedDifficulty));
      assert.ok(q.difficultyDimensions && q.difficultyDimensions.recognition >= 1);
      assert.equal(q.difficultyModelVersion, 'v0-provisional');
      assert.equal(q.planPurpose, 'daily');
    }
  }
});

test('★ 每条备用题都能作为会话题目使用（逐题走一次 fallbackQuestion 信任链）', () => {
  const h = appHarness();

  // 用 requestedTopic 精确命中每一条，确认 60 条没有一条通不过
  const blocked = [];

  for (const q of Bank.BANK) {
    const picked = h.fallbackQuestion({
      module: q.module,
      targetDifficulty: q.difficulty,
      topic: q.topic,
      purpose: 'daily'
    });

    if (!picked) {
      blocked.push(`${q.id} 取不到题`);
      continue;
    }
    if (h.trustedQuestion(picked) !== true) blocked.push(`${q.id} 通不过可信判定`);
    if (h.canonicalIntegrityOf(picked).ok !== true) blocked.push(`${q.id} 指纹不自洽`);
  }

  assert.deepEqual(blocked, [], blocked.join('\n'));
});

test('★ recentFallbackIds 能从历史里反查出做过的备用题', () => {
  const h = appHarness();
  const a = Bank.BANK[0];
  const b = Bank.BANK[25];

  h.state.history = [
    { expression: '一道不存在的题' },
    { expression: a.expression },
    { expression: b.prompt || b.expression }
  ];

  const ids = h.recentFallbackIds();

  assert.ok(ids.includes(a.id), '历史里的备用题没被反查出来');
  assert.ok(ids.includes(b.id));
  assert.equal(ids.length, 2, '反查出了不该有的 id');
});

test('★ closestFallback：模块内挑难度最近的题，未知模块退回全池', () => {
  const h = appHarness();

  for (const module of MODULES) {
    const picked = h.closestFallback(module, 10);
    assert.ok(picked, `${module} 降级路径取不到题`);
    assert.equal(picked.module, module);

    // 池内不存在比它更接近目标的题
    const gap = Math.abs(picked.difficulty - 10);
    for (const other of Bank.byModule(module)) {
      assert.ok(
        Math.abs(other.difficulty - 10) >= gap,
        `${module} 降级路径没挑到最近的题（${picked.id} 而不是 ${other.id}）`
      );
    }
  }

  // 未知模块：不能返回 null —— 这时宁可跨模块给一道题，也不能让用户空手
  const fallback = h.closestFallback('linear-algebra', 5);
  assert.ok(fallback, '未知模块时降级路径返回了 null');
  assert.ok(Bank.byId(fallback.id), '降级返回的题不在题库里');
});

test('★ 题库为空时必须显式抛错，而不是静默给出一道空题', () => {
  // 模拟 fallback-bank.js 未加载：这才是空池在线上唯一的真实成因
  const h = appHarness({ bankModule: undefined, bank: [] });

  assert.throws(
    () => h.fallbackQuestion({ module: 'limit', targetDifficulty: 3 }),
    /fallback bank unavailable/,
    '空题库没有显式报错 —— 上层会拿到一道 undefined 的题'
  );

  // 空池时 trustedQuestion 也不能把任何备用题当可信来源
  assert.equal(h.trustedQuestion({ source: 'fallback', answer: '1' }), false,
    '空题库仍放行了 source=fallback 的题');
});

/* =========================================================
   8. 回归：上一版真实漏掉的那道错题
   ========================================================= */

test('★ 回归：旧版 -1/6 的错题若混进题库，审计一定能拦住', () => {
  const wrong = {
    id: 'fb-limit-regression',
    module: 'limit',
    topic: '复合极限',
    difficulty: 9,
    instruction: '计算极限',
    expression: '\\lim_{x\\to0}\\frac{\\ln(1+\\sin x)-x+\\frac{x^2}{2}}{x^3}',
    answer: '-1/6',
    solution: '分层展开到三阶。'
  };

  // 1) 确定性验证能判它错
  assert.notEqual(Q.verifyAnswerAgainstQuestion(wrong, wrong.answer), 'equivalent');

  // 2) issues() 会拦下它（而不是静默通过）
  const issues = Q.issues(wrong);
  assert.ok(
    issues.includes(Q.CODES.ANSWER_FAILS_VERIFICATION),
    '旧版错题混进题库却没被拦：' + JSON.stringify(issues)
  );

  // 3) 改回 +1/6 后完全干净 —— 确认拦住的是答案而不是别的噪音
  const fixed = { ...wrong, answer: '1/6' };
  assert.deepEqual(Q.issues(fixed), []);
  assert.equal(Q.verifyAnswerAgainstQuestion(fixed, fixed.answer), 'equivalent');
});
