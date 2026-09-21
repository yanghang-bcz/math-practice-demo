/* smoke 测试台的守卫
 *
 * 这些断言存在的理由：50 题前后对比的「可比性」完全依赖两件事不变 ——
 * 评测矩阵的形状、以及独立复核到底能不能抓出错题。
 * 悄悄改一格，两次运行的数字就不能比了。
 */

const test = require('node:test');
const assert = require('node:assert');

test('矩阵：50 题，覆盖 3 模块 × L4/L6/L8/L10/L12', async () => {
  const { buildMatrix, matrixSize, MODULES, DIFFICULTIES, COUNTS } = await import(
    '../tools/smoke/matrix.mjs'
  );

  const m = buildMatrix();

  assert.strictEqual(m.length, 50, '总题数必须是 50');
  assert.strictEqual(matrixSize(), 50);

  assert.deepStrictEqual(MODULES, ['limit', 'derivative', 'integral']);
  assert.deepStrictEqual(DIFFICULTIES, [4, 6, 8, 10, 12]);

  // 每个格子的题数与 COUNTS 声明一致
  for (const module of MODULES) {
    for (const difficulty of DIFFICULTIES) {
      const got = m.filter((c) => c.module === module && c.difficulty === difficulty).length;
      assert.strictEqual(got, COUNTS[module][difficulty], `${module} L${difficulty}`);
    }
  }

  // id 唯一，且每题都有考点
  const ids = m.map((c) => c.id);
  assert.strictEqual(new Set(ids).size, 50, 'id 必须唯一');
  for (const c of m) {
    assert.ok(c.topic && c.topic.length > 0, `${c.id} 缺考点`);
  }
});

test('矩阵：高难度焦点格（导数/积分 L8+12）合计 24 题', async () => {
  const { buildMatrix, isFocusCell } = await import('../tools/smoke/matrix.mjs');
  const focus = buildMatrix().filter((c) => c.focus);

  assert.strictEqual(focus.length, 24);
  for (const c of focus) {
    assert.ok(isFocusCell(c.module, c.difficulty), `${c.id} 不该在焦点集合里`);
    assert.ok(['derivative', 'integral'].includes(c.module));
    assert.ok(c.difficulty >= 8);
  }
});

test('错答探针组必须包含「指责参考答案」那条', async () => {
  const { WRONG_PROBES, VALID_PROBES } = await import('../tools/smoke/run.mjs');

  assert.ok(WRONG_PROBES.length >= 4, '探针至少要 4 条');

  // Task #4 · D：探针集从 4 条扩到全形态，缺哪一类都不行 ——
  // 少了哪一类，就等于那一类的错答放行没人盯着。
  for (const key of [
    'plain_refusal', 'blame_reference', 'far_number',
    'double_wrapped', 'sign_flip', 'double_paren',
    'double_cdot', 'double_times', 'half_shorthand',
    'plus_one', 'minus_one'
  ]) {
    assert.ok(WRONG_PROBES.some((p) => p.key === key), '缺错答探针：' + key);
  }

  for (const key of ['paren_wrap', 'double_negation', 'times_one', 'wrapped_twice', 'equivalent_fraction', 'decimal_approx']) {
    assert.ok(VALID_PROBES.some((p) => p.key === key), '缺合法探针：' + key);
  }

  const blame = WRONG_PROBES.find((p) => p.key === 'blame_reference');
  assert.ok(blame, '缺少 blame_reference 探针');

  // 实测过：旧版判题会把这句话判成 equivalent / correct:true。
  // 这条探针就是用来钉住那个故障不再复现的，不能删。
  assert.match(blame.build({ answer: '1' }), /参考答案/);

  // 每条探针都必须能构造出非空答案
  for (const p of [...WRONG_PROBES, ...VALID_PROBES]) {
    const a = p.build({ answer: '\\frac{1}{6}' });
    assert.ok(typeof a === 'string' && a.length > 0, `${p.key} 构造不出答案`);
  }

  // double_wrapped 会用到参考答案本身，且故意构造在嵌套括号形态上
  const wrapped = WRONG_PROBES.find((p) => p.key === 'double_wrapped');
  const simple = wrapped.build({ answer: '\\frac{1}{6}' });
  assert.match(simple, /^2\\left\(\\frac\{1\}\{6\}\\right\)$/);

  const Q = require('../math-quality.js');

  // 这条断言翻过一次，现在再翻一次 —— 每次都是「口子被堵得更早」：
  //   Task #4 之前：compare() 返回 uncertain，探针测的是模型那条路；
  //   Task #4：结构检查层判死，不再经过模型；
  //   Task #5A：compare() 学会对纯常量表达式求值（constantAtom），
  //             于是它在标量层就判死了，比结构层更早、更省。
  // 不管在哪一层，「绝不放行」这条不变。
  assert.strictEqual(
    Q.compare(simple, '\\frac{1}{6}'),
    'not_equivalent',
    'double_wrapped 在标量层就该被判死（纯常量表达式可以直接算）'
  );
  assert.strictEqual(
    Q.judgeDeterministic({ module: 'limit', expression: '\\lim_{x\\to0}\\frac{\\sin x}{6x}', answer: '\\frac{1}{6}' }, simple).verdict,
    'not_equivalent',
    'double_wrapped 又变成引擎判不了了 —— 错答放行的口子回来了'
  );

  // 参考答案带等号时（例如导数题写成 \frac{d^2y}{dx^2}=-...），
  // 只扰动等号右侧，别把整个等式塞进括号里
  const nearEq = wrapped.build({ answer: '\\frac{d^2y}{dx^2}=-\\frac{2xy}{(y^2-x)^3}' });
  assert.ok(!nearEq.includes('='), 'double_wrapped 不该把等号带进去：' + nearEq);

  for (const p of WRONG_PROBES) {
    const a = p.build({ answer: '\\frac{d^2y}{dx^2}=-\\frac{2xy}{(y^2-x)^3}' });
    if (typeof a === 'string') assert.ok(!a.includes('='), `${p.key} 把等号带进去了：${a}`);
  }
});

/* Task #4 的核心不变式，用静态守卫钉死：
   错答探针绝不能被判成 equivalent —— 因为线上 correct:true 只有这一条来路
   （模型那条路只采信 not_equivalent）。这条一旦松开，「错答放行 = 0」就没了。 */
test('Task#4 不变式：错答探针一律不得被判 equivalent', async () => {
  const { probesFor } = await import('../tools/smoke/run.mjs');
  const Q = require('../math-quality.js');

  const questions = [
    { module: 'limit', expression: '\\lim_{x\\to0}\\frac{\\sin x}{6x}', answer: '1/6' },
    { module: 'limit', expression: '\\lim_{x\\to0}\\frac{\\sin 3x}{x}', answer: '3' },
    { module: 'limit', expression: '\\lim_{x\\to\\infty}\\frac{2x+1}{x-3}', answer: '2' },
    { module: 'derivative', expression: 'y=x^2', answer: '2x' },
    { module: 'derivative', expression: 'y=\\ln(1+x^2)', answer: '2x/(1+x^2)' },
    { module: 'derivative', expression: 'y=\\sqrt{1+x^2}', answer: '\\frac{x}{\\sqrt{1+x^2}}' },
    { module: 'integral', expression: '\\int(3x^2+2x)\\,dx', answer: 'x^3+x^2+C' },
    { module: 'integral', expression: '\\int \\frac{1}{x}\\,dx', answer: '\\ln|x|+C' },
    { module: 'integral', expression: '\\int_0^1\\frac{1}{1+x}\\,dx', answer: '\\ln 2' }
  ];

  const leaks = [];
  let checked = 0;

  for (const q of questions) {
    for (const p of probesFor(q)) {
      if (p.skipped || p.kind !== 'wrong') continue;
      checked += 1;
      const d = Q.judgeDeterministic(q, p.answer);
      if (d.verdict === 'equivalent') {
        leaks.push(`${q.expression} ← ${p.key}: ${p.answer}`);
      }
    }
  }

  assert.ok(checked >= 80, '错答探针样本太少（' + checked + '），守卫失去意义');
  assert.deepStrictEqual(leaks, [], '有错答被判等价 —— 线上就是 correct:true：\n  ' + leaks.join('\n  '));
});

test('独立复核能抓出答案算错的题', async () => {
  const { checkQuestion, isWrongApproved } = await import('../tools/smoke/verify.mjs');

  // y=x^2 的导数应该是 2x，写成 3x 必须被抓住
  const bad = {
    module: 'derivative',
    expression: 'y=x^2',
    answer: '3x',
    solution: '由幂函数求导法则得 3x。'
  };
  const badCheck = checkQuestion(bad);
  assert.ok(
    isWrongApproved(badCheck),
    '答案算错却没过检出：' + JSON.stringify(badCheck)
  );

  // 正确的题不能被误伤
  const good = {
    module: 'derivative',
    expression: 'y=x^2',
    answer: '2x',
    solution: '由幂函数求导法则得 2x。'
  };
  const goodCheck = checkQuestion(good);
  assert.ok(
    !isWrongApproved(goodCheck),
    '正确题被误判成错误批准：' + JSON.stringify(goodCheck)
  );
});

test('独立复核能抓出解析与答案不一致的题', async () => {
  const { checkQuestion } = await import('../tools/smoke/verify.mjs');

  // 数值型：解析声称的最终答案与 answer 都是原子可比的，必须抓到
  const numeric = {
    module: 'limit',
    expression: '\\lim_{x\\to0}\\frac{\\sin x}{x}',
    answer: '1',
    solution: '由等价无穷小替换得最终答案为 2。'
  };
  assert.ok(checkQuestion(numeric).solution_mismatch, '数值型不一致没抓到');
});

test('已知覆盖缺口：解析里裸写的符号答案提取不到', async () => {
  const { checkQuestion } = await import('../tools/smoke/verify.mjs');

  // 引擎的对撞只覆盖「原子可比」的形态：纯数字，或 \(...\) 包起来且 compare 能判定的式子。
  // 「计算得最终答案为 3x」这种裸符号既提取不到，compare(3x, 2x) 也只返回 uncertain。
  // 这是已知缺口，钉在这里 —— 免得以后误以为它兜住了所有情况。
  const symbolic = {
    module: 'derivative',
    expression: 'y=x^2',
    answer: '2x',
    solution: '计算得最终答案为 3x。'
  };
  assert.strictEqual(
    checkQuestion(symbolic).solution_mismatch,
    false,
    '若这里变成 true，说明引擎增强了，请同步更新报告里的「局限」段落'
  );
});

/* 静态守卫：「再导出」≠「本地绑定」。
 *
 * 来由（2026-09-20 线上实测）：run.mjs 里写着
 *     export { WRONG_PROBES, VALID_PROBES, probesFor, rhsOf } from './probes.mjs';
 *     import { probesFor } from './probes.mjs';
 * 前一行是**再导出**，它不会在本模块作用域里创建 WRONG_PROBES 的绑定。
 * 于是 50 题线上跑时：生成阶段 50/50 跑完，进入判题阶段立刻
 *     ReferenceError: WRONG_PROBES is not defined
 * 整轮作废（模型调用已经花掉了）。
 *
 * 为什么上面那些守卫抓不到：它们是 `await import('run.mjs')` 之后读**模块导出**，
 * 而那条路走的正是再导出、是通的。出问题的是模块**内部**用到的本地绑定。
 * 所以这里必须静态看源码，不能靠 import 一下就算数。
 */
test('run.mjs：凡正文用到 probes.mjs 的导出名，必须真的 import（再导出不算）', async () => {
  const fs = require('node:fs');
  const nodePath = require('node:path');

  const raw = fs.readFileSync(
    nodePath.join(__dirname, '..', 'tools', 'smoke', 'run.mjs'),
    'utf8'
  );
  const exported = Object.keys(await import('../tools/smoke/probes.mjs'));

  // ① 只认真正的 import 语句
  const local = new Set();
  for (const m of raw.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]\.\/probes\.mjs['"]/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) local.add(name);
    }
  }

  // ② 剥掉注释与 `export { ... } from './probes.mjs'`，剩下的才是"正文"
  const body = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/export\s*\{[^}]*\}\s*from\s*['"]\.\/probes\.mjs['"]\s*;?/g, '');

  const missing = exported.filter(
    (name) => !local.has(name) && new RegExp(`\\b${name}\\b`).test(body)
  );

  assert.deepStrictEqual(
    missing,
    [],
    '这些名字在 run.mjs 正文里被用到，却只做了再导出、没有 import —— 跑到那一步就会 ReferenceError：\n  ' +
      missing.join('\n  ')
  );

  // 反向兜底：正则一旦失效会让上面静默通过，所以再钉几处已知事实
  for (const name of ['WRONG_PROBES', 'VALID_PROBES']) {
    assert.ok(exported.includes(name), `probes.mjs 不再导出 ${name}？守卫需要同步`);
    assert.ok(local.has(name), `本地 import 里必须有 ${name}`);
  }
  assert.ok(exported.length >= 5, 'probes.mjs 的导出面变了，守卫需要重新审阅');
});
