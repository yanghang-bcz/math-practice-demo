const Q = require('/Users/emobcccz/Documents/GitHub/math-practice-demo/math-quality.js');

const EXPR = 'y=\\left(\\frac{x^2+1}{x^2-1}\\right)^{\\arctan x}';

const CASES = {
  r1_missing_arctanx: '\\left(\\frac{x^2+1}{x^2-1}\\right)^{\\arctan x}\\left[\\frac{\\ln\\left(\\frac{x^2+1}{x^2-1}\\right)}{1+x^2}-\\frac{4x}{(x^2+1)(x^2-1)}\\right]',
  r2_sign_flipped: "y'=\\left(\\frac{x^2+1}{x^2-1}\\right)^{\\arctan x}\\left[\\frac{\\ln\\left(\\frac{x^2+1}{x^2-1}\\right)}{1+x^2}+\\frac{4x\\arctan x}{x^4-1}\\right]",
  correct: '\\left(\\frac{x^2+1}{x^2-1}\\right)^{\\arctan x}\\left[\\frac{\\ln\\left(\\frac{x^2+1}{x^2-1}\\right)}{1+x^2}-\\frac{4x\\arctan x}{x^4-1}\\right]',
  correct_paren: '\\left(\\frac{x^2+1}{x^2-1}\\right)^{\\arctan x}\\left(\\frac{\\ln\\left(\\frac{x^2+1}{x^2-1}\\right)}{1+x^2}-\\frac{4x\\arctan x}{x^4-1}\\right)',
};

function mk(answer) {
  const q = { module: 'derivative', topic: '幂指函数求导', instruction: '求导数', expression: EXPR, answer, solution: '取对数求导' };
  const verification = {
    version: Q.VERSION,
    question_valid: true, answer_correct: true, solution_correct: true,
    answer_solution_consistent: true, topic_match: true, difficulty_reasonable: true,
    confidence: 0.95, issues: [], content: Q.content(q)
  };
  return { ...q, verification };
}

for (const [name, ans] of Object.entries(CASES)) {
  const q = mk(ans);
  const prof = Q.verificationProfile(q);
  const dec = Q.gateDecision(q);
  console.log([
    name.padEnd(20),
    'tier=' + prof.tier,
    'verdict=' + prof.verdict,
    'gate=' + dec.state,
    'ok=' + dec.ok,
    'code=' + (dec.code || '-'),
  ].join('  '));
}

console.log('\n--- Tier B 回归（原本会被放行的形态） ---');
// 构造一道「形态读得懂、但这一次数值没结论」的题：用引擎暂时算不动的表达式
const tierB = {
  module: 'derivative', topic: 't', instruction: '求导',
  expression: 'y=x^2', answer: '2x', solution: 's'
};
console.log('x^2 求导 (应为 A/equivalent):', JSON.stringify(Q.verificationProfile(tierB)));

console.log('\n--- 判题侧口径必须不变（approved 仍放行 UNCERTAIN） ---');
for (const [name, ans] of Object.entries(CASES)) {
  const q = mk(ans);
  const d = Q.gateDecision(q);
  console.log(name.padEnd(20), 'gateApproved=' + Q.gateApproved(q), 'approved(judge)=' + Q.approved(q), 'state=' + d.state);
}
