const Q = require('/Users/emobcccz/Documents/GitHub/math-practice-demo/math-quality.js');

const EXPR = 'y=\\left(\\frac{x^2+1}{x^2-1}\\right)^{\\arctan x}';

const CASES = {
  'r1_missing_arctanx': '\\left(\\frac{x^2+1}{x^2-1}\\right)^{\\arctan x}\\left[\\frac{\\ln\\left(\\frac{x^2+1}{x^2-1}\\right)}{1+x^2}-\\frac{4x}{(x^2+1)(x^2-1)}\\right]',
  'r2_sign_flipped':    'y\'=\\left(\\frac{x^2+1}{x^2-1}\\right)^{\\arctan x}\\left[\\frac{\\ln\\left(\\frac{x^2+1}{x^2-1}\\right)}{1+x^2}+\\frac{4x\\arctan x}{x^4-1}\\right]',
  'correct':            '\\left(\\frac{x^2+1}{x^2-1}\\right)^{\\arctan x}\\left[\\frac{\\ln\\left(\\frac{x^2+1}{x^2-1}\\right)}{1+x^2}-\\frac{4x\\arctan x}{x^4-1}\\right]',
  'correct_v2':         '\\left(\\frac{x^2+1}{x^2-1}\\right)^{\\arctan x}\\left(\\frac{\\ln\\frac{x^2+1}{x^2-1}}{1+x^2}-\\frac{4x\\arctan x}{x^4-1}\\right)'
};

function mk(answer) {
  return { module:'derivative', topic:'幂指函数求导', instruction:'求导数', expression:EXPR, answer, solution:'...' };
}

for (const [name, ans] of Object.entries(CASES)) {
  const q = mk(ans);
  console.log('='.repeat(72));
  console.log('CASE:', name);
  console.log('  shapeSupport :', JSON.stringify(Q.shapeSupport(q)));
  const prof = Q.verificationProfile(q);
  console.log('  profile      : tier=%s readable=%s verdict=%s reason=%s', prof.tier, prof.readable, prof.verdict, prof.reason);
  console.log('  verifyAnswerAgainstQuestion :', Q.verifyAnswerAgainstQuestion(q, String(q.answer)));
  console.log('  issues       :', JSON.stringify(Q.issues(q)));
  const gd = Q.gateDecision(q);
  console.log('  gateDecision :', JSON.stringify(gd));
  console.log('  approved     :', Q.approved(q), ' gateApproved:', Q.gateApproved(q));
}
