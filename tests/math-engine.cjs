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

/* ---------------------------------------------------------------
   Task #4 · 判题分层：这批形态必须先由引擎判掉，不许漏给模型
   ---------------------------------------------------------------
   共同点：atom() 对它们全部返回 null —— 它们是表达式，不是标量。

   在 Task #4 之前判题只调 compare()，于是它们一律 uncertain 漏给模型，
   而模型对「参考答案外面套一层系数 / 负号 / 括号」是会误判等价的。
   线上 50 题实测：错答探针 6/40 被判对，全部来自这一条口子。

   现在 judgeDeterministic 的第二层（结构检查）把它们判死在引擎里。
   注意 compare() 本身仍然是标量专用的，不许把表达式逻辑塞进那一层 ——
   它做的是精确有理数比较（1/6 与 2/12 靠它），混进采样就把语义弄没了。
   --------------------------------------------------------------- */

const SIXTH = {
  module: 'limit',
  expression: S`\lim_{x\to0}\frac{\sin x}{6x}`,
  answer: '1/6'
};

test('★ Task#4：11 个曾漏给模型的形态必须都能解析', () => {
  const cases = [
    '-(1/3)', '-(-1/3)', '-(2x)', '2(1/6)',
    S`2\left(1/6\right)`, S`2\cdot\frac{1}{6}`, S`2\times\frac{1}{6}`,
    S`\left(-\frac{1}{3}\right)`, '3(x+1)', '-2(x-1)',
    S`\frac12(x+1)`
  ];

  for (const src of cases) {
    assert.ok(
      Q.tryParse(src, 'x'),
      '应能解析 ' + src + '，实际 infix=' + JSON.stringify(Q.toInfix(src))
    );
  }
});

test('★ 裸 \frac 速写（\frac12 / \frac34x）与花括号写法完全等价', () => {
  eq(Q.compare(S`\frac12`, S`\frac{1}{2}`), 'equivalent');
  eq(Q.compare(S`\frac34`, S`\frac{3}{4}`), 'equivalent');
  eq(Q.compare(S`\frac12`, '0.5'), 'equivalent');

  // LaTeX 语义：裸写法的两个参数各只占一个 token，别把它读成 12、34
  eq(Q.toInfix(S`\frac12(x+1)`), '((1)/(2))(x+1)');
  assert.ok(Math.abs(Q.tryParse(S`\frac12(x+1)`, 'x')(3) - 2) < 1e-12);
  assert.ok(Math.abs(Q.tryParse(S`\frac34x`, 'x')(4) - 3) < 1e-12);

  // 保守边界：参数读不出来就不许猜
  eq(Q.compare(S`\frac1\pi`, '1/3'), 'uncertain');
});

test('★ Task#4 判定方向：套了系数/负号/括号的答案必须判死在引擎里', () => {
  // 数学上等价 —— 必须 equivalent，并标明走了哪一层
  const equivalent = [
    ['1/6', 'scalar'],
    ['2/12', 'scalar'],
    ['0.1666666667', 'scalar'],
    ['2(1/12)', 'scalar'],
    [S`2\left(\frac{1}{12}\right)`, 'scalar'],
    [S`2\cdot\frac{1}{12}`, 'scalar'],
    [S`2\times\frac{1}{12}`, 'scalar'],
    ['-(-1/6)', 'scalar'],
    [S`\left(-\left(-\frac{1}{6}\right)\right)`, 'scalar'],
    [S`\frac12\left(\frac{1}{3}\right)`, 'scalar']
  ];

  for (const [answer, layer] of equivalent) {
    const d = Q.judgeDeterministic(SIXTH, answer);
    eq(d.verdict, 'equivalent', answer + ' 应判等价，实际 ' + d.verdict + ' / ' + d.layer);
    eq(d.layer, layer, answer + ' 走的判定层不对');
  }

  // 数学上不等价 —— 必须 not_equivalent。返回 uncertain 就等于放它去问模型，
  // 而那正是线上 6/40 那条泄漏。
  //
  // 注意这些用例的判定层在 Task #5A 从 structural 前移到了 scalar：
  // compare() 现在能对「纯常量表达式」求值（constantAtom），所以
  // 2(1/6) 这类写法不必再走采样那一层。层变了，但「一层都不许漏」没变。
  const wrong = [
    [S`-\frac{1}{6}`, 'scalar'],
    ['1/3', 'scalar'],
    ['0.5', 'scalar'],
    [S`\frac{1}{3}`, 'scalar'],
    ['2(1/6)', 'scalar'],
    [S`2\left(\frac{1}{6}\right)`, 'scalar'],
    [S`2\cdot\frac{1}{6}`, 'scalar'],
    [S`2\times\frac{1}{6}`, 'scalar'],
    ['-(-1/3)', 'scalar']
  ];

  for (const [answer, layer] of wrong) {
    const d = Q.judgeDeterministic(SIXTH, answer);
    eq(d.verdict, 'not_equivalent', answer + ' 应判不等价，实际 ' + d.verdict);
    eq(d.layer, layer, answer + ' 走的判定层不对');
  }

  // 兜底不变量：这批答案一个都不许漏成 uncertain（漏出去就要问模型，模型又会判错）
  for (const [answer] of equivalent.concat(wrong)) {
    assert.notStrictEqual(
      Q.judgeDeterministic(SIXTH, answer).verdict,
      'uncertain',
      answer + ' 又漏回模型了'
    );
  }
});

test('★ Task#4 导数/积分同样挡住「套一层系数」的错答', () => {
  const dq = { module: 'derivative', expression: S`y=x^2`, answer: '2x' };
  eq(Q.judgeDeterministic(dq, '2x').verdict, 'equivalent');
  eq(Q.judgeDeterministic(dq, 'x+x').verdict, 'equivalent');
  eq(Q.judgeDeterministic(dq, S`2\left(2x\right)`).verdict, 'not_equivalent');
  eq(Q.judgeDeterministic(dq, '-(2x)').verdict, 'not_equivalent');
  eq(Q.judgeDeterministic(dq, '-2(x-1)').verdict, 'not_equivalent');

  const iq = { module: 'integral', expression: S`\int(3x^2+2x)\,dx`, answer: 'x^3+x^2+C' };
  eq(Q.judgeDeterministic(iq, 'x^3+x^2+C').verdict, 'equivalent');
  eq(Q.judgeDeterministic(iq, 'x^3+x^2').verdict, 'equivalent', '不定积分差常数仍等价');
  eq(Q.judgeDeterministic(iq, S`2\left(x^3+x^2\right)+C`).verdict, 'not_equivalent');
});

test('★ Task#4 边界：等价分数、小数近似、±∞、不存在', () => {
  eq(Q.compare('1/6', '2/12'), 'equivalent');
  eq(Q.compare('1/6', '0.1666666667'), 'equivalent');
  eq(Q.compare('+\u221e', '-\u221e'), 'not_equivalent', '正负无穷绝不能互为等价');
  eq(Q.compare('DNE', '\u4e0d\u5b58\u5728'), 'equivalent', 'DNE 与中文「不存在」是同一个意思');
  eq(Q.compare('\u65e0\u7a77', '\u4e0d\u5b58\u5728'), 'uncertain', '含糊的中文无穷不参与等值判定');
});

test('★ compare() 接受纯常量表达式，但绝不把含变量的式子当常量', () => {
  /* Task #4 时这一层是「标量专用」，表达式一律 uncertain 漏给模型。
     Task #5A 起多了一层 constantAtom：**纯常量表达式就地求值再比**，
     因为模型对「参考答案套系数」这类形态最容易判错（线上 6/40 的泄漏源）。

     但放宽的边界必须钉死：含变量的式子一个字都不许被当成常量。 */
  for (const src of ['2(1/6)', S`2\left(\frac{1}{6}\right)`, '-(-1/3)', S`2\cdot\frac{1}{6}`, S`-\frac{1}{6}`]) {
    eq(Q.compare(src, '1/6'), 'not_equivalent', src + ' 应当由 compare 直接判错');
  }

  eq(Q.compare('-(-1/6)', '1/6'), 'equivalent');
  eq(Q.compare('2(1/12)', '1/6'), 'equivalent');
  eq(Q.compare(S`\frac12\left(\frac{1}{3}\right)`, '1/6'), 'equivalent', '(1/2)(1/3) 就是 1/6');
  eq(Q.compare(S`\sqrt{2}/2`, '0.7071067811865476'), 'equivalent');
  eq(Q.compare(S`\frac{\pi}{4}`, '0.7853981633974483'), 'equivalent');

  // 含变量 → compare 必须说「判不了」，把决定权交回上层，
  // 绝不能因为「在某个点上恰好相等」就判等价。
  for (const [a, b] of [
    ['2x', '2'],
    ['x', '1/6'],
    ['x+1', '1'],
    [S`\frac12(x+1)`, '1/6'],
    [S`2\left(\frac{1}{6}\right)x`, '1/6'],
    ['\\Gamma(x)', '1/6']
  ]) {
    eq(Q.compare(a, b), 'uncertain', a + ' 含变量，compare 不该下结论');
  }

  // 判题入口仍然必须能判死 —— 只是现在它由标量层完成
  assert.notStrictEqual(
    Q.judgeDeterministic(SIXTH, '2(1/6)').verdict,
    'uncertain',
    '判题入口把表达式又漏掉了'
  );
});

test('★ 括号剥离不得凭空造数（1(2)/(3) 不能等于 12/3）', () => {
  // normalize 会把 \frac 展开留下的 (a)/(b) 清成 a/b，好让精确比较认得出。
  // 但它曾经不看上下文，于是 "2(1)/(6)" 被清成 "21/6" —— 一个捏造出来的数，
  // 而 "1(2)/(3)" 与 "12/3" 被判成等价，就是一次错答放行。
  assert.notStrictEqual(Q.compare('1(2)/(3)', '12/3'), 'equivalent');
  assert.notStrictEqual(Q.compare('2(1)/(6)', '21/6'), 'equivalent');

  // 正常的 \frac 展开仍必须走通
  eq(Q.compare(S`-\frac{1}{2}`, '1/2'), 'not_equivalent');
  eq(Q.compare(S`-\frac{1}{3}`, '-1/3'), 'equivalent');
  eq(Q.compare(S`\frac{1}{2}`, '1/2'), 'equivalent');
});

test('★ 绝对值 |A| 必须能解析（对数型原函数的答案全靠它）', () => {
  // `|` 在 tokenizer 里是非法字符，于是 \ln|x|+C 这种最常见的积分答案
  // 整条 unparseable —— 判题只能说「不确定」，白白漏给模型。
  const parses = [
    [S`\ln|x|+C`, 'ln abs(x)+C'],
    [S`3\ln|x-2|-2\ln|x-1|+C`, '3*ln abs(x-2)-2*ln abs(x-1)+C'],
    [S`\left|1+\tan\frac{x}{2}\right|+C`, 'abs(1+tan ((x)/(2)))+C'],
    [S`\left|\frac{1}{2}\right|`, 'abs(((1)/(2)))']
  ];

  for (const [src, infix] of parses) {
    eq(Q.toInfix(src, 'x'), infix, src + ' 的 infix 不对');
  }

  assert.ok(Math.abs(Q.tryParse(S`\left|\frac{1}{2}\right|`, 'x')(0) - 0.5) < 1e-12);

  // 保守边界：写法不规整一律不动它（于是仍旧 unparseable → uncertain，
  // 而不是猜出一个可能错的表达式）
  eq(Q.toInfix('||x|-1|', 'x'), '||x|-1|', '嵌套绝对值有歧义，不许猜');
  assert.strictEqual(Q.tryParse('|x', 'x'), null, '竖线不成对不许解析');
  assert.strictEqual(Q.tryParse('|x|+|y|', 'x'), null, '多变量仍必须拒绝');
});

test('★ |A| 修好之后才抓得出的错：原函数系数写错', () => {
  // 线上真实样本：∫(x+2)/(x²-3x+2)dx 的标准答案写成 3ln|x-2|-2ln|x-1|。
  // 部分分式解是 4/(x-2) - 3/(x-1)，所以正确原函数是 4ln|x-2|-3ln|x-1|。
  // 修 |A| 之前引擎读不了含竖线的答案，只能给 uncertain，闸门于是放它过去。
  const q = {
    module: 'integral',
    topic: '有理函数积分',
    instruction: '求不定积分',
    expression: S`\int \frac{x+2}{x^2-3x+2}\,dx`,
    answer: '3\\ln|x-2|-2\\ln|x-1|+C',
    solution: S`部分分式分解后积分，结果为 \(3\ln|x-2|-2\ln|x-1|+C\)。`
  };

  eq(Q.verifyIntegral(q, '4\\ln|x-2|-3\\ln|x-1|+C'), 'equivalent', '正确答案必须被接受');
  eq(Q.verifyIntegral(q, '3\\ln|x-2|-2\\ln|x-1|+C'), 'not_equivalent', '系数写错必须被抓住');
  assert.ok(
    Q.issues(q).includes('ANSWER_FAILS_VERIFICATION'),
    'issues() 必须报出来，否则闸门还会放行：' + JSON.stringify(Q.issues(q))
  );
});

test('已知边界：比值型对数原函数上 ln x 与 ln|x| 分不出来', () => {
  // \ln x 只在 x>0 与 1/x 相容，数值检查在负采样点上会因为 NaN 被跳过，
  // 剩 5 个正点仍 ≥ 4，于是判为等价。
  // 这是已知的宽松处（教材层面通常也认），钉在这里免得被当成 bug 修错方向。
  eq(
    Q.verifyIntegral(
      { module: 'integral', expression: S`\int \frac{1}{x}\,dx`, answer: '\\ln|x|+C' },
      '\\ln x+C'
    ),
    'equivalent'
  );
});

test('★ 模型只能判错，不能判对（trustModelVerdict）', () => {
  eq(Q.trustModelVerdict('equivalent', 0.99, 0.9), null, '模型的对判一律不采信');
  eq(Q.trustModelVerdict('not_equivalent', 0.99, 0.9).trusted, true);
  eq(Q.trustModelVerdict('not_equivalent', 0.5, 0.9), null, '置信度不够不采信');
  eq(Q.trustModelVerdict('uncertain', 0.99, 0.9), null);
  eq(Q.trustModelVerdict('canonical_suspected', 0.99, 0.9), null, '作废通道不从这里走');
  eq(Q.trustModelVerdict('NOT_EQUIVALENT', 0.95, 0.9).trusted, true, '大小写要容错');
  eq(Q.trustModelVerdict('not_equivalent', '0.99', 0.9), null, '字符串置信度不算数');
});
