const Q = require('/Users/emobcccz/Documents/GitHub/math-practice-demo/math-quality.js');

const EXPR = 'y=\\left(\\frac{x^2+1}{x^2-1}\\right)^{\\arctan x}';
const PTS = [-1.7, 1.13, 1.9, 2.6];

const R1 = '\\left(\\frac{x^2+1}{x^2-1}\\right)^{\\arctan x}\\left[\\frac{\\ln\\left(\\frac{x^2+1}{x^2-1}\\right)}{1+x^2}-\\frac{4x}{(x^2+1)(x^2-1)}\\right]';
const R2 = "y'=\\left(\\frac{x^2+1}{x^2-1}\\right)^{\\arctan x}\\left[\\frac{\\ln\\left(\\frac{x^2+1}{x^2-1}\\right)}{1+x^2}+\\frac{4x\\arctan x}{x^4-1}\\right]";
const OK = '\\left(\\frac{x^2+1}{x^2-1}\\right)^{\\arctan x}\\left[\\frac{\\ln\\left(\\frac{x^2+1}{x^2-1}\\right)}{1+x^2}-\\frac{4x\\arctan x}{x^4-1}\\right]';

const f = Q.tryParse(Q.rhsOf(EXPR), 'x');
const g = s => Q.tryParse(Q.rhsOf(s), 'x');

const fmt = v => (v === null ? 'null' : v.toFixed(6));

for (const x of PTS) {
  const truth = Q.numericDerivative(f, x);
  console.log(`x=${x}  真值 f'(x)=${fmt(truth)}   r1=${fmt(g(R1)(x))}   r2=${fmt(g(R2)(x))}   正解=${fmt(g(OK)(x))}`);
}

console.log('\n各答案与真值的相对偏差（抽样点上的最大者）：');
for (const [name, ans] of [['r1', R1], ['r2', R2], ['correct', OK]]) {
  let worst = 0;
  for (const x of PTS) {
    const t = Q.numericDerivative(f, x), v = g(ans)(x);
    worst = Math.max(worst, Math.abs(v - t) / Math.max(1, Math.abs(t)));
  }
  console.log('  ' + name.padEnd(8), (worst * 100).toFixed(2) + '%');
}
