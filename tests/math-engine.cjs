/* CalcDaily v1.1 — 确定性数学验证引擎回归测试
 * 每条用例都对应一个真实发生过的故障，不是凑数的。
 */
const test = require('node:test');
const assert = require('node:assert');
const Q = require('../math-quality');

const S = String.raw;
const eq = (a, b, name) => assert.strictEqual(a, b, name);

test('SPEC-4 小数近似 1/6 与 0.1666666667 等价', () => {
  eq(Q.compare('1/6', '0.1666666667'), 'equivalent');
});

test('SPEC-5 符号错误 -1/2 与 1/2 不等价', () => {
  eq(Q.compare('-1/2', '1/2'), 'not_equivalent');
  eq(Q.compare(S`-\frac{1}{2}`, '1/2'), 'not_equivalent');
});

test('精确分数比较 2/12 与 1/6 等价，1/2 与 1/3 不等价', () => {
  eq(Q.compare('2/12', '1/6'), 'equivalent');
  eq(Q.compare('1/2', '1/3'), 'not_equivalent');
});

test('含糊的中文无穷不参与等值判定', () => {
  eq(Q.compare('发散', '∞'), 'uncertain');
  eq(Q.compare('∞', '不存在'), 'not_equivalent');
});

test('SPEC-7 导数等价表达式 2x 与 x+x 等价', () => {
  eq(Q.verifyDerivative({ module: 'derivative', expression: S`y=x^2` }, 'x+x'), 'equivalent');
});

test('导数验证：正确式通过、漏个系数被拒', () => {
  const q = { module: 'derivative', expression: S`y=\ln(1+x^2)`, answer: '2x/(1+x^2)' };
  eq(Q.verifyDerivative(q, '2x/(1+x^2)'), 'equivalent');
  eq(Q.verifyDerivative(q, 'x/(1+x^2)'), 'not_equivalent');
});

test('隐函数 x^2+xy+y^2=1 必须保守，不能误判', () => {
  eq(Q.verifyDerivative({ module: 'derivative', expression: 'x^2+xy+y^2=1' }, '0'), 'uncertain');
});

test('SPEC-6 不定积分带不带 C 视为等价', () => {
  const q = { module: 'integral', expression: S`\int(3x^2+2x)\,dx`, answer: 'x^3+x^2+C' };
  eq(Q.verifyIntegral(q, 'x^3+x^2+C'), 'equivalent');
  eq(Q.verifyIntegral(q, 'x^3+x^2'), 'equivalent');
  eq(Q.verifyIntegral(q, 'x^3+x'), 'not_equivalent');
});

test('不定积分：换元结果 sin(x^2) 正确', () => {
  const q = { module: 'integral', expression: S`\int 2x\cos(x^2)\,dx`, answer: 'sin(x^2)+C' };
  eq(Q.verifyIntegral(q, 'sin(x^2)+C'), 'equivalent');
});

test('定积分：数值积分校验 (ln2)^2/2', () => {
  const q = { module: 'integral', expression: S`\int_0^1\frac{\ln(1+x)}{1+x}\,dx`, answer: '(ln2)^2/2' };
  eq(Q.verifyIntegral(q, '(ln2)^2/2'), 'equivalent');
  eq(Q.verifyIntegral(q, '1/2'), 'not_equivalent');
});

test('极限：sin3x/x 正确值通过、错值被拒', () => {
  const q = { module: 'limit', expression: S`\lim_{x\to0}\frac{\sin 3x}{x}`, answer: '3' };
  eq(Q.verifyLimit(q, '3'), 'equivalent');
  eq(Q.verifyLimit(q, '4'), 'not_equivalent');
});

test('极限：三阶展开必须能抵抗浮点相减抵消', () => {
  const q = { module: 'limit', expression: S`\lim_{x\to0}\frac{e^x-1-x-\frac{x^2}{2}}{x^3}`, answer: '1/6' };
  eq(Q.verifyLimit(q, '1/6'), 'equivalent');
});

test('★ 曾上线的错题：ln(1+sin x) 正确值是 +1/6 而非 -1/6', () => {
  const q = {
    module: 'limit',
    expression: S`\lim_{x\to0}\frac{\ln(1+\sin x)-x+\frac{x^2}{2}}{x^3}`,
    answer: '+1/6'
  };
  eq(Q.verifyLimit(q, '1/6'), 'equivalent');
  eq(Q.verifyLimit(q, '-1/6'), 'not_equivalent');
});

test('★ issues() 能主动抓出这道错题', () => {
  const issues = Q.issues({
    module: 'limit',
    topic: '复合极限',
    instruction: '计算极限',
    expression: S`\lim_{x\to0}\frac{\ln(1+\sin x)-x+\frac{x^2}{2}}{x^3}`,
    answer: '-1/6',
    solution: S`对 \(\sin x\) 与 \(\ln(1+u)\) 分层展开并保留到三阶。`
  });
  assert.ok(issues.includes('ANSWER_FAILS_VERIFICATION'), '应报 ANSWER_FAILS_VERIFICATION，实际：' + JSON.stringify(issues));
});

test('★ 引擎永不误杀：无法解析时必须返回 uncertain', () => {
  const unparseable = [
    { module: 'derivative', expression: S`y=\varphi(x)`, answer: '?' },
    { module: 'limit', expression: S`\lim_{x\to0}\Gamma(x)`, answer: '1' },
    { module: 'integral', expression: S`\int \lfloor x\rfloor\,dx`, answer: 'x' }
  ];
  for (const q of unparseable) {
    const v = Q.verifyAgainstQuestion(q, q.answer);
    assert.notStrictEqual(v, 'not_equivalent', JSON.stringify(q.expression) + ' 被误判为错：' + v);
  }
});

test('gate: 数学正确但 topic/difficulty 不符时不得拒绝', () => {
  const q = {
    module: 'limit',
    topic: '等价无穷小',
    instruction: '计算极限',
    expression: S`\lim_{x\to0}\frac{\sin 3x}{x}`,
    answer: '3',
    solution: S`利用 \(\sin u\sim u\)，极限为 \(3\)。`
  };
  const verification = {
    version: Q.VERSION,
    question_valid: true,
    answer_correct: true,
    solution_correct: true,
    answer_solution_consistent: true,
    topic_match: false,
    difficulty_reasonable: false,
    confidence: 0.88,
    issues: [],
    content: Q.content(q)
  };
  const decision = Q.gateDecision({ ...q, verification });
  assert.strictEqual(decision.ok, true, 'soft gate 不应拒绝：' + JSON.stringify(decision));
  assert.strictEqual(decision.needsSecondaryReview, true, '0.88 应路由到二次验证');
});

test('gate: 硬条件失败必须拒绝', () => {
  const q = {
    module: 'limit', topic: 't', instruction: '计算极限',
    expression: S`\lim_{x\to0}\frac{\sin 3x}{x}`, answer: '3',
    solution: S`答案为 \(3\)。`
  };
  for (const field of Q.HARD_FIELDS) {
    const verification = {
      version: Q.VERSION,
      question_valid: true, answer_correct: true, solution_correct: true,
      answer_solution_consistent: true, topic_match: true, difficulty_reasonable: true,
      confidence: 0.95, issues: [], content: Q.content(q)
    };
    verification[field] = false;
    assert.strictEqual(Q.gateDecision({ ...q, verification }).ok, false, field + ' 为 false 时必须拒绝');
  }
});

test('gate: confidence 低于地板必须拒绝', () => {
  const q = {
    module: 'limit', topic: 't', instruction: '计算极限',
    expression: S`\lim_{x\to0}\frac{\sin 3x}{x}`, answer: '3',
    solution: S`答案为 \(3\)。`
  };
  const verification = {
    version: Q.VERSION,
    question_valid: true, answer_correct: true, solution_correct: true,
    answer_solution_consistent: true, topic_match: true, difficulty_reasonable: true,
    confidence: 0.5, issues: [], content: Q.content(q)
  };
  assert.strictEqual(Q.gateDecision({ ...q, verification }).ok, false);
});

test('gate: 过期版本的 verification 必须失效', () => {
  const q = {
    module: 'limit', topic: 't', instruction: '计算极限',
    expression: S`\lim_{x\to0}\frac{\sin 3x}{x}`, answer: '3',
    solution: S`答案为 \(3\)。`
  };
  const verification = {
    version: 'quality-v1',
    question_valid: true, answer_correct: true, solution_correct: true,
    answer_solution_consistent: true, topic_match: true, difficulty_reasonable: true,
    confidence: 0.95, issues: [], content: Q.content(q)
  };
  assert.strictEqual(Q.gateDecision({ ...q, verification }).ok, false);
});

/* ---------------------------------------------------------------
   文本→表达式：曾让整批正确答案被判「无法判定」的两个解析缺陷
   --------------------------------------------------------------- */

test('★ \frac 的分子/分母可以含嵌套花括号', () => {
  const cases = [
    [S`\frac{x}{\sqrt{1+x^2}}`, 0.4472135955],
    [S`\frac{1}{\sqrt{1-x^2}}`, 1.1547005384],
    [S`\frac{e^{2x}}{2}`, 1.3591409142],
    [S`\frac{\sin(2x)}{4}`, 0.2103677462],
    [S`\frac{(1+x^2)^{\frac{3}{2}}}{3}`, 0.4658474953]
  ];
  for (const [src, want] of cases) {
    const f = Q.tryParse(src, 'x');
    assert.ok(f, '应能解析 ' + src + '，实际 infix=' + JSON.stringify(Q.toInfix(src)));
    assert.ok(Math.abs(f(0.5) - want) < 1e-6, src + ' 在 x=0.5 处应为 ' + want + '，实际 ' + f(0.5));
  }
});

test('★ \sqrt 的括号不能被吞掉（否则会静默算错）', () => {
  const f = Q.tryParse(S`\sqrt{1+x^2}`, 'x');
  assert.ok(f);
  // sqrt(1.25)=1.1180…；若被读成 sqrt(1)+x^2 则是 1.25 —— 差得很远
  assert.ok(Math.abs(f(0.5) - 1.1180339887) < 1e-9, '实际 ' + f(0.5));
});

test('★ \cos^2 x 是 (cos x)^2，不是 cos(x^2)', () => {
  const f = Q.tryParse(S`\cos^2 x`, 'x');
  assert.ok(f, 'infix=' + JSON.stringify(Q.toInfix(S`\cos^2 x`)));
  assert.ok(Math.abs(f(0.5) - Math.cos(0.5) ** 2) < 1e-12);
  assert.ok(Math.abs(f(0.5) - Math.cos(0.25)) > 1e-3, '不得被读成 cos(x^2)');
});

test('★ 曾无法判定的正确答案现在必须判为等价', () => {
  const cases = [
    [{ module: 'derivative', expression: S`y=\sqrt{1+x^2}` }, S`\frac{x}{\sqrt{1+x^2}}`],
    [{ module: 'derivative', expression: S`y=\tan x` }, S`\frac{1}{\cos^2 x}`],
    [{ module: 'derivative', expression: S`y=\arcsin x` }, S`\frac{1}{\sqrt{1-x^2}}`],
    [{ module: 'derivative', expression: S`y=\ln(x+\sqrt{1+x^2})` }, S`\frac{1}{\sqrt{1+x^2}}`],
    [{ module: 'integral', expression: S`\int e^{2x}\,dx` }, S`\frac{e^{2x}}{2}+C`],
    [{ module: 'integral', expression: S`\int \cos^2 x\,dx` }, S`\frac{x}{2}+\frac{\sin(2x)}{4}+C`],
    [{ module: 'integral', expression: S`\int x\sqrt{1+x^2}\,dx` }, S`\frac{(1+x^2)^{\frac{3}{2}}}{3}+C`],
    [{ module: 'limit', expression: S`\lim_{x\to0}\frac{\sqrt{1+x}-1}{x}` }, '1/2']
  ];
  for (const [q, answer] of cases) {
    eq(Q.verifyAnswerAgainstQuestion(q, answer), 'equivalent', q.expression + ' → ' + answer);
  }
});

test('★ 修好解析不等于放松判定：同批题的错答案仍必须被拒', () => {
  eq(Q.verifyAnswerAgainstQuestion(
    { module: 'derivative', expression: S`y=\sqrt{1+x^2}` },
    S`\frac{1}{\sqrt{1+x^2}}`), 'not_equivalent');

  eq(Q.verifyAnswerAgainstQuestion(
    { module: 'derivative', expression: S`y=\tan x` },
    S`\frac{1}{\cos x}`), 'not_equivalent');

  eq(Q.verifyAnswerAgainstQuestion(
    { module: 'integral', expression: S`\int e^{2x}\,dx` },
    S`e^{2x}+C`), 'not_equivalent');

  eq(Q.verifyAnswerAgainstQuestion(
    { module: 'limit', expression: S`\lim_{x\to0}\frac{\sqrt{1+x}-1}{x}` },
    '1'), 'not_equivalent');
});

test('★ \cos^{-1} 语义含糊时必须保守（不得猜成 arccos 或 sec）', () => {
  const v = Q.verifyAnswerAgainstQuestion(
    { module: 'derivative', expression: S`y=\cos^{-1} x` },
    S`\frac{1}{\cos^2 x}`);
  assert.notStrictEqual(v, 'not_equivalent', '含糊写法不得判为错：' + v);
});

/* ---------------------------------------------------------------
   错误状态分类：网络故障 ≠ 题目有问题
   --------------------------------------------------------------- */

test('★ 判题结论可信时直接采纳', () => {
  const d = Q.judgeOutcome({ trusted: true, correct: true, verdict: 'equivalent' });
  assert.strictEqual(d.action, 'accept');
  assert.strictEqual(d.retryable, false);
});

test('★ 只有「题目不可信」才作废题目', () => {
  const d = Q.judgeOutcome({ trusted: false, reason: Q.JUDGE_REASONS.QUESTION_UNTRUSTED });
  assert.strictEqual(d.action, 'void_question');
});

test('★ 判题服务连不上时绝不能作废题目', () => {
  const d = Q.judgeOutcome({ trusted: false, reason: Q.JUDGE_REASONS.JUDGE_UNAVAILABLE });
  assert.strictEqual(d.action, 'retry_judge', '网络故障被当成题目有问题会让用户白丢一次作答');
  assert.strictEqual(d.retryable, true);
});

test('★ 判题返回但不可用时也不作废题目', () => {
  const d = Q.judgeOutcome({ trusted: false, reason: Q.JUDGE_REASONS.JUDGE_UNCERTAIN });
  assert.strictEqual(d.action, 'retry_judge');
});

test('★ 未知/缺失的失败原因一律走重试，绝不误作废题目', () => {
  for (const verdict of [
    { trusted: false },
    { trusted: false, reason: undefined },
    { trusted: false, reason: 'some_future_reason' },
    {},
    null
  ]) {
    assert.strictEqual(
      Q.judgeOutcome(verdict).action,
      'retry_judge',
      '意外形态被误判为作废题目：' + JSON.stringify(verdict)
    );
  }
});
