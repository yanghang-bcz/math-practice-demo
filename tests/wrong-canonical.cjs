/* 「审核通过但标准答案错」——回归语料的行为锁。
 *
 * 这份测试有两条独立的标准，缺一不可：
 *
 *   1. 引擎必须拒掉每一条错答案（工程标准）；
 *   2. 每条错答案**确实**是错的 —— 用与判定层无关的数值/代数手段重新验证一遍
 *      （数学标准）。
 *
 * 只有 1 没有 2，就是在测试自己的 bug；只有 2 没有 1，就是在测试一个摆设。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Q = require('../math-quality.js');

let corpusPromise = null;

function corpus() {
  if (!corpusPromise) {
    corpusPromise = import(
      'file://' + path.join(__dirname, '..', 'tools', 'smoke', 'corpus.mjs')
    );
  }
  return corpusPromise;
}

/* ---------- 与判定层无关的独立数学复核 ---------- */

/* 题干是 \lim_{...}<body> 形态，要先抽出 body 再解析。
   这里只用 extractLimit + tryParse 这两个「原料」，不碰任何判定函数。 */
function limitFunction(expression) {
  const info = Q.extractLimit(expression);
  if (!info) return null;
  const f = Q.tryParse(info.body, info.variable);
  return f ? { f, info } : null;
}

function sampleAt(f, points) {
  const out = [];
  for (const p of points) {
    const v = f(p);
    if (!Number.isFinite(v)) return null;
    out.push(v);
  }
  return out;
}

/* 类别 1/2：有限答案配发散题干 —— 直接看采样幅度是不是在爆炸。 */
function divergesAtZero(expression) {
  const parsed = limitFunction(expression);
  if (!parsed) return false;

  const target = parsed.info.target;
  const steps = [1e-2, 1e-3, 1e-4];

  return [1, -1].some(sign => {
    const mags = sampleAt(parsed.f, steps.map(h => target + sign * h));
    if (!mags) return false;
    return mags.every((v, i) => i === 0 || Math.abs(v) >= Math.abs(mags[i - 1]) * 5);
  });
}

/* 类别 3/5：有限真值但符号写反 —— 中心平均消掉奇次误差后看正负。 */
function centeredAround(expression, h) {
  const parsed = limitFunction(expression);
  if (!parsed) return null;

  const vals = sampleAt(parsed.f, [parsed.info.target - h, parsed.info.target + h]);
  if (!vals) return null;
  return (vals[0] + vals[1]) / 2;
}

/* 类别 4/6：拿候选表达式求导/求值，和被积函数/导数真值对照。
   不定积分的候选要先去掉积分常数 C —— 否则 C 是个未知标识符，
   整条表达式解析不了，复核会假失败。 */
function agreesWithDerivative(body, candidate) {
  const f = Q.tryParse(body, 'x');
  const g = Q.tryParse(Q.stripPlusC(Q.rhsOf(candidate)), 'x');
  if (!f || !g) return null;

  let checked = 0;
  let ok = 0;

  for (const x of [-1.7, -0.83, 0.29, 0.61, 1.13, 1.9, 2.6]) {
    const expected = f(x);
    const d = Q.numericDerivative(g, x);
    if (!Number.isFinite(expected) || d === null) continue;
    checked += 1;
    if (Math.abs(d - expected) <= 1e-4 * Math.max(1, Math.abs(expected))) ok += 1;
  }

  return checked ? { checked, ok } : null;
}

/* ---------- 测试 ---------- */

test('★ 错误类别语料：每一条的「错」都必须能用独立数值证据复核', async () => {
  const { WRONG_CANONICAL } = await corpus();

  assert.ok(WRONG_CANONICAL.length >= 6, '语料太薄，覆盖不了已知错误类别');

  for (const item of WRONG_CANONICAL) {
    const label = `${item.id} [${item.className}]`;

    if (item.className.includes('divergence')) {
      assert.ok(
        divergesAtZero(item.expression),
        label + '：独立采样看不到发散，这条语料的前提已经不成立'
      );
      assert.ok(
        Number.isFinite(Number(Q.atom(item.answer)?.value)),
        label + '：这一类的前提是「标准答案是有限数」'
      );
      continue;
    }

    if (item.className.includes('sign-flipped')) {
      const avg = centeredAround(item.expression, 2e-3);
      assert.ok(avg !== null, label + '：题干采样不了');
      const canonical = Q.constantAtom(item.answer) || Q.atom(item.answer);
      assert.ok(canonical && canonical.kind === 'number', label + '：标准答案应是有限数');

      assert.ok(
        Math.sign(avg) !== Math.sign(canonical.value),
        label + '：中心平均与标准答案同号 —— 这不是符号写反的那一类'
      );
      assert.ok(
        Math.abs(avg - canonical.value) <= 3 * Math.abs(canonical.value),
        label + '：量级对不上，与「符号写反」的画像不符'
      );
      continue;
    }

    if (item.className.includes('integral')) {
      // 用引擎的 extractIntegral 取被积函数（它已经把 \frac{dx}{g} 归一成 \frac{1}{g}）。
      // 注意这里只借「抽结构」这一步，判定本身仍由本文件的数值求导独立给出。
      const info = Q.extractIntegral(item.expression);
      assert.ok(info, label + '：抽不出积分结构');
      const check = agreesWithDerivative(info.body, item.answer);
      assert.ok(check, label + '：求导复核跑不起来');
      assert.equal(check.ok, 0, label + '：错答案居然满足 F′ = f，语料前提不成立');
      continue;
    }

    if (item.className.includes('derivative')) {
      const body = Q.rhsOf(item.expression);
      const check = agreesWithDerivative(body, item.answer);
      assert.ok(check, label + '：求导复核跑不起来');
      assert.equal(check.ok, 0, label + '：错答案居然等于真导数，语料前提不成立');
      continue;
    }

    throw new Error(label + '：语料写了 className 却没有对应的复核方式');
  }
});

test('★ 错误类别语料：闸门必须全部拒掉（ANSWER_FAILS_VERIFICATION）', async () => {
  const { WRONG_CANONICAL, auditCorpus } = await corpus();
  const results = auditCorpus(Q);

  assert.equal(results.length, WRONG_CANONICAL.length);

  for (const r of results) {
    assert.ok(
      r.caught,
      `闸门没拦住 ${r.id} [${r.className}]：issues=${JSON.stringify(r.issues)} verdict=${r.detail}`
    );
    assert.notStrictEqual(r.detail, 'equivalent', r.id + ' 的标准答案被判成等价');
  }
});

test('★ 对照组：把标准答案改对之后，同一道题必须过闸门', async () => {
  const { WRONG_CANONICAL } = await corpus();

  // 只取语料里「改对答案后引擎能给出确定性结论」的那些 —— L8-3 的正解是
  // 「不存在」、L10-2 是 −∞，它们走趋势判定，不在本题的范围内（另有专项测试）。
  const deterministic = WRONG_CANONICAL.filter(item => {
    const v = Q.verifyAnswerAgainstQuestion(
      { module: item.module, expression: item.expression, answer: item.correct },
      String(item.correct)
    );
    return v !== 'uncertain';
  });

  assert.ok(
    deterministic.length >= 3,
    '能给出确定性结论的正解太少（' + deterministic.length + '），对照组失去意义'
  );

  for (const item of deterministic) {
    const verdict = Q.verifyAnswerAgainstQuestion(
      { module: item.module, expression: item.expression, answer: item.correct },
      String(item.correct)
    );

    assert.equal(
      verdict,
      'equivalent',
      `${item.id} 的正解「${item.correct}」被误判为 ${verdict} —— 引擎在用误杀换不漏杀`
    );
  }
});

test('★ 语料里的题干形态（Tier C）不得被判「答案错」—— 判不了就只说判不了', async () => {
  const { TIER_C_SHAPES } = await corpus();

  for (const item of TIER_C_SHAPES) {
    const issue = Q.verifyAnswerAgainstQuestion(
      { module: item.module, expression: item.expression, answer: item.answer },
      String(item.answer)
    );

    assert.notStrictEqual(
      issue,
      'not_equivalent',
      `${item.id}：题干引擎读不懂，却被判成「答案错」—— 这是误杀。` +
      '读不懂应当落在 uncertain，交给分级与 fallback 处置。'
    );
  }
});

test('★ limitTrend：±∞ / 不存在 的答案不得让引擎崩溃（曾经是 ReferenceError）', () => {
  const cases = [
    ['\\lim_{x\\to0}\\frac{1}{x^2}', '\\infty', 'equivalent'],
    ['\\lim_{x\\to0}\\frac{1}{x^2}', '-\\infty', 'not_equivalent'],
    ['\\lim_{x\\to0}\\frac{1}{x^2}', '0', 'not_equivalent'],
    ['\\lim_{x\\to0}\\frac{1}{x}', '\\u4e0d\\u5b58\\u5728', 'volatile'],
    ['\\lim_{x\\to0}1', '\\infty', 'not_equivalent'],
    ['\\lim_{x\\to0}1', '1', 'equivalent']
  ];

  for (const [expression, answer, expected] of cases) {
    const q = { module: 'limit', expression, answer, solution: 'x' };
    let verdict;

    assert.doesNotThrow(
      () => { verdict = Q.verifyAnswerAgainstQuestion(q, answer); },
      expression + ' 判 ±∞/不存在 时抛异常了'
    );

    if (expected !== 'volatile') eqv(verdict, expected, expression + ' 的趋势判定不对');
  }

  // 直接钉住底层趋势函数
  const f = Q.tryParse('1/x^2', 'x');
  eqv(Q.limitTrend(f, { variable: 'x', target: 0, side: '' }), 'positiveInfinity');
  const g = Q.tryParse('1/x', 'x');
  eqv(Q.limitTrend(g, { variable: 'x', target: 0, side: '' }), 'dne');
  const h = Q.tryParse('1', 'x');
  eqv(Q.limitTrend(h, { variable: 'x', target: 0, side: '' }), 'finite');
});

test('★ divergesCleanly：只认「干净」的发散，噪声与收敛一律不放行', () => {
  const info = { variable: 'x', target: 0, side: '' };
  const cases = [
    ['1/x', true],
    ['1/x^2', true],
    ['sin(x)/x', false],
    ['(1-cos(x))/x^2', false],
    ['x', false],
    ['sin(1/x)', false]
  ];

  for (const [body, expected] of cases) {
    const f = Q.tryParse(body, 'x');
    assert.equal(Q.divergesCleanly(f, info), expected, body + ' 的发散判定不对');
  }
});

function eqv(actual, expected, message) {
  assert.strictEqual(actual, expected, message + `（实际 ${actual}）`);
}
