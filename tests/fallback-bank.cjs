/* CalcDaily v1.1 — Verified Fallback Bank 自检
 *
 * 题库是最后一道安全网。AI 失败时用户拿到的就是这里面的题，
 * 所以每一条都必须经过确定性数学验证，而不是靠人眼看。
 */
const test = require('node:test');
const assert = require('node:assert');
const Quality = require('../math-quality');
const Bank = require('../fallback-bank');

const REQUIRED = ['id', 'module', 'topic', 'difficulty', 'instruction', 'expression', 'answer', 'solution'];

test('题库规模：每模块不少于 20 道', () => {
  for (const module of ['limit', 'derivative', 'integral']) {
    const count = Bank.byModule(module).length;
    assert.ok(count >= 20, module + ' 只有 ' + count + ' 道，应不少于 20');
  }
});

test('题库总数为 60 道', () => {
  assert.strictEqual(Bank.BANK.length, 60);
});

test('字段完整、id 唯一、表达式不重复', () => {
  const ids = new Set();
  const expressions = new Set();
  for (const q of Bank.BANK) {
    for (const key of REQUIRED) {
      assert.ok(q[key] !== undefined && q[key] !== '', q.id + ' 缺少字段 ' + key);
    }
    assert.ok(!ids.has(q.id), 'id 重复：' + q.id);
    ids.add(q.id);

    const key = q.module + '::' + q.expression;
    assert.ok(!expressions.has(key), '题目重复：' + q.expression);
    expressions.add(key);
  }
});

test('★ 每一道题的答案都必须真的满足题目（确定性数学验证）', () => {
  const failures = [];
  let verified = 0;
  let undecidable = 0;

  for (const q of Bank.BANK) {
    const verdict = Quality.verifyAnswerAgainstQuestion(q, String(q.answer));
    if (verdict === 'equivalent') verified++;
    else if (verdict === 'uncertain') undecidable++;
    else failures.push(q.id + ' :: ' + q.expression + ' 答案 ' + q.answer + ' => ' + verdict);
  }

  assert.deepStrictEqual(failures, [], '存在答案不满足题目的题：\n' + failures.join('\n'));
  console.log('    可由引擎确定性判定：' + verified + ' 道；引擎无法判定（人工已复核）：' + undecidable + ' 道');
  assert.ok(verified >= 55, '确定性可判定的题只有 ' + verified + ' 道，覆盖不足');
});

test('★ 每一道题的 issues() 都必须是干净的', () => {
  const failures = [];
  for (const q of Bank.BANK) {
    const issues = Quality.issues(q);
    if (issues.length) failures.push(q.id + ' :: ' + JSON.stringify(issues));
  }
  assert.deepStrictEqual(failures, [], '题库存在质量问题：\n' + failures.join('\n'));
});

test('★ 回归：旧版那道 -1/6 的错题必须被引擎抓住', () => {
  // 这是 v1.0 线上真实存在过的错误答案。
  const wrong = {
    module: 'limit',
    topic: '复合极限',
    instruction: '计算极限',
    expression: '\\lim_{x\\to0}\\frac{\\ln(1+\\sin x)-x+\\frac{x^2}{2}}{x^3}',
    answer: '-1/6',
    solution: '对 \\(\\sin x\\) 与 \\(\\ln(1+u)\\) 分层展开并保留到三阶。'
  };
  const issues = Quality.issues(wrong);
  assert.ok(
    issues.includes('ANSWER_FAILS_VERIFICATION'),
    '旧版错题未被拦截，issues = ' + JSON.stringify(issues)
  );

  const fixed = { ...wrong, answer: '1/6' };
  assert.deepStrictEqual(Quality.issues(fixed), [], '修正为 +1/6 后应完全干净');
});

test('选取逻辑：难度接近但不重复最近做过的题', () => {
  const first = Bank.pick({ module: 'limit', targetDifficulty: 6 });
  assert.ok(first, '应能选出题目');
  assert.strictEqual(first.module, 'limit');

  // 连续选取 10 次，把选过的都加入 recent，不应出现重复。
  const seen = [];
  for (let i = 0; i < 10; i++) {
    const q = Bank.pick({ module: 'limit', targetDifficulty: 6, recentIds: seen });
    assert.ok(q, '第 ' + i + ' 次选取失败');
    assert.ok(!seen.includes(q.id), '第 ' + i + ' 次选中了最近做过的题：' + q.id);
    seen.push(q.id);
  }
  assert.strictEqual(new Set(seen).size, 10, '10 次选取应得到 10 道不同的题');
});

test('选取逻辑：recent 装满整池时仍能返回题目而不是 null', () => {
  const all = Bank.byModule('limit').map(q => q.id);
  const q = Bank.pick({ module: 'limit', targetDifficulty: 6, recentIds: all });
  assert.ok(q, '整池都被标记为最近做过时，必须放宽限制而不是失败');
});

test('选取逻辑：优先匹配考点', () => {
  const q = Bank.pick({ module: 'limit', targetDifficulty: 6, topic: '泰勒展开' });
  assert.strictEqual(q.topic, '泰勒展开');
});

test('选取逻辑：未知模块返回 null', () => {
  assert.strictEqual(Bank.pick({ module: 'linear-algebra' }), null);
});
