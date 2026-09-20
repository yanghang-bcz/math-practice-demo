/* 可靠性回归语料 —— 「审核通过但标准答案错」这一类故障的固定样本。
 *
 * 存在的理由：Task #4 的结论是「错答放行 = 0」，但那只覆盖了判题侧。
 * 闸门侧真正的问题是 —— 标准答案本身就是错的，题还是被 approve 了。
 * 这份语料把每一类错误都钉成固定样本，改动引擎时立刻能看出是不是又漏了。
 *
 * 语料按**错误类别**组织，不按题目组织。目标是「这一类错能被抓」，
 * 而不是「这一道题能被抓」—— 只锁定题目的语料，换个数字就失效了。
 *
 * 说明：线上历史批次里另有 5 道错误生成题，但它们只存在于已被替换的
 * 旧内联题库中，没有留下可复现的原文，因此无法原样收录。这里收录的是
 * 能给出独立数值证据、可复现的全部案例。
 */

/* 每一条都附「独立证据」：不依赖引擎自己的判定，而是外部数值/代数事实。
   这样即使引擎改了，也能看出是引擎错了还是题目错了。 */
export const WRONG_CANONICAL = [
  {
    id: 'limit-L8-3',
    className: 'finite-answer-vs-two-sided-divergence',
    module: 'limit',
    topic: '等价无穷小替换',
    instruction: '计算极限',
    expression: '\\lim_{x\\to 0}\\frac{\\sqrt{1+2x+3x^2}-\\sqrt{1+2x-3x^2}}{\\ln(1+x)-x+\\frac{x^2}{2}}',
    answer: '-4',
    solution: '分子有理化后为 \\\\(\\\\frac{6x^2}{2}\\\\)，分母为 \\\\(x^3/3\\\\)，两者之比发散。',
    evidence: 'f(±1e-2)=±898/∓902，f(±1e-3)=±8997.8/∓9002.3 —— 双侧以 9/|x| 的速度反向爆炸，极限不存在；-4 是错的。',
    correct: '不存在'
  },
  {
    id: 'limit-L10-2',
    className: 'finite-answer-vs-one-sign-divergence',
    module: 'limit',
    topic: '等价无穷小替换',
    instruction: '计算极限',
    expression: '\\lim_{x\\to0}\\frac{\\sqrt[3]{1+\\tan x}-\\sqrt{1+\\sin x}}{x^3}',
    answer: '-\\frac{1}{6}',
    solution: '两个根式一阶展开后分子是 \\\\(-x/6\\\\)，除以 \\\\(x^3\\\\) 后发散。',
    evidence: 'f(±1e-2)=-1665.1/-1667.9，f(±1e-3)=-1.6665e5，f(±1e-4)=-1.6667e7 —— 两侧同号以 1/(6x²) 爆炸。',
    correct: '-\\infty'
  },
  {
    id: 'limit-L12-2',
    className: 'sign-flipped-finite-answer',
    module: 'limit',
    topic: '泰勒展开求极限',
    instruction: '计算极限',
    expression: '\\lim_{x\\to0}\\frac{\\left(1+x\\right)^{1/x}-e+\\frac{e}{2}x-\\frac{11e}{24}x^2+\\frac{7e}{16}x^3}{x^4}',
    answer: '-\\frac{2447e}{5760}',
    solution: '分子四阶展开后为 \\\\(e\\\\cdot\\\\frac{2447}{5760}x^4\\\\)。',
    evidence: '真值 +2447e/5760 = 1.15479785。中心平均 1.15478@h=5e-3、1.15497@h=2e-3 —— 符号为正，标准答案把符号写反了。',
    correct: '\\frac{2447e}{5760}'
  },
  {
    id: 'integral-L4-2',
    className: 'indefinite-integral-wrong-coefficients',
    module: 'integral',
    topic: '有理函数积分',
    instruction: '计算不定积分',
    expression: '\\int \\frac{x+2}{x^2-3x+2}\\,dx',
    answer: '3\\ln|x-2|-2\\ln|x-1|+C',
    solution: '部分分式分解后逐项积分。',
    evidence: '(x+2)/((x-1)(x-2)) = 4/(x-2) - 3/(x-1)。错答案求导 8 个采样点 0/8 命中；对答案 8/8。',
    correct: '4\\ln|x-2|-3\\ln|x-1|+C'
  },
  {
    id: 'integral-L12-1',
    className: 'indefinite-integral-wrong-antiderivative',
    module: 'integral',
    topic: '第二类换元积分',
    instruction: '计算不定积分',
    expression: '\\int \\frac{dx}{x\\sqrt{x^4+x^2+1}}',
    answer: '-\\frac12\\ln\\left|\\frac{1+\\sqrt{x^4+x^2+1}}{x^2}\\right|+C',
    solution: '令 \\\\(u=x^2\\\\) 换元后积分。',
    evidence: '对标准答案数值求导，7 个采样点 0/7 等于被积函数，偏差 1.06~1.43 倍（不是常数倍）。' +
      '正确原函数 -(1/2)ln|(2+x²+2√(x⁴+x²+1))/(2x²)| 为 7/7。',
    correct: '-\\frac12\\ln\\left|\\frac{2+x^2+2\\sqrt{x^4+x^2+1}}{2x^2}\\right|+C',
    note: '这道题此前因「微分写在分子里」读不懂而漏网；Task 5A 修好该形态后立刻被抓出。'
  },
  {
    id: 'limit-x-minus-sin',
    className: 'sign-flipped-finite-answer-low-order',
    module: 'limit',
    topic: '泰勒展开求极限',
    instruction: '计算极限',
    expression: '\\lim_{x\\to0}\\frac{x-\\sin x}{x^3}',
    answer: '-\\frac{1}{6}',
    solution: '泰勒展开后分子为 \\\\(x^3/6\\\\)。',
    evidence: 'x - sin x ~ x³/6，真值是 +1/6；标准答案符号错。这一条低阶、无抵消，属于引擎早就应该抓住的类型。',
    correct: '\\frac{1}{6}'
  },
  {
    id: 'derivative-coefficient',
    className: 'derivative-wrong-coefficient',
    module: 'derivative',
    topic: '复合函数求导',
    instruction: '求导',
    expression: 'y=x^2',
    answer: '3x',
    solution: '由幂函数求导法则得 \\\\(3x\\\\)。',
    evidence: 'd/dx x² = 2x。系数写错，是生成侧最常见的错误类别。',
    correct: '2x'
  }
];

/* 对照组：把上面每一道的正确答案放在一起。
   它们必须**过闸门** —— 否则说明引擎在用「误杀」换「不漏杀」。 */
export const CORRECTED = WRONG_CANONICAL.map(item => ({
  id: item.id + ' · 正解',
  module: item.module,
  topic: item.topic,
  instruction: item.instruction,
  expression: item.expression,
  answer: item.correct,
  solution: '按标准解法得到 ' + item.correct + '。'
}));

/* 更弱的一类：题目本身没问题，但题干形态引擎读不懂。
   这些不是「答案错」，是「判不了」——由 Task 5B 的分级去处置，不在这里拒稿。 */
export const TIER_C_SHAPES = [
  { id: 'shape-sum', module: 'limit', expression: '\\lim_{n\\to\\infty}\\sum_{k=1}^{n}\\frac{1}{n+k}', answer: '\\ln 2' },
  { id: 'shape-cases', module: 'derivative', expression: 'f(x)=\\begin{cases}x^2\\sin\\frac1x,&x\\ne0\\\\0,&x=0\\end{cases}', answer: "f'(0)=0" },
  { id: 'shape-implicit-2nd', module: 'derivative', expression: 'x^2+xy+y^2=1', answer: '\\frac{d^2y}{dx^2}=-\\frac{6}{(x+2y)^3}' },
  { id: 'shape-parametric', module: 'derivative', expression: 'x=t-\\sin t,\\ y=1-\\cos t', answer: '\\frac{dy}{dx}=\\cot\\frac{t}{2}' },
  { id: 'shape-int-dx', module: 'integral', expression: '\\int\\frac{dx}{x\\ln x}', answer: '\\ln|\\ln x|+C' }
];

/** 对一份语料跑引擎，返回逐条结论（供测试与压测共用） */
export function auditCorpus(Q, items = WRONG_CANONICAL) {
  return items.map(item => {
    const issues = Q.issues({
      module: item.module,
      topic: item.topic,
      instruction: item.instruction,
      expression: item.expression,
      answer: item.answer,
      solution: item.solution
    });

    return {
      id: item.id,
      className: item.className,
      issues,
      caught: issues.includes(Q.CODES.ANSWER_FAILS_VERIFICATION),
      detail: Q.verifyAnswerAgainstQuestion(
        { module: item.module, expression: item.expression, answer: item.answer },
        String(item.answer)
      )
    };
  });
}
