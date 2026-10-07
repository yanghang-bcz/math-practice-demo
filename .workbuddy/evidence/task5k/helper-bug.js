const Q = require('/Users/emobcccz/Documents/GitHub/math-practice-demo/math-quality.js');

const PTS = [-1.7, -0.83, 0.29, 0.61, 1.13, 1.9, 2.6];

// 现有 helper（wrong-canonical.cjs）：拿候选求导，和 body 对照
function legacy(body, candidate) {
  const f = Q.tryParse(body, 'x');
  const g = Q.tryParse(Q.stripPlusC(Q.rhsOf(candidate)), 'x');
  if (!f || !g) return null;
  let checked = 0, ok = 0;
  for (const x of PTS) {
    const expected = f(x);
    const d = Q.numericDerivative(g, x);
    if (!Number.isFinite(expected) || d === null) continue;
    checked += 1;
    if (Math.abs(d - expected) <= 1e-4 * Math.max(1, Math.abs(expected))) ok += 1;
  }
  return checked ? { checked, ok } : null;
}

// 语义正确的版本：把**函数**求导，与候选对照
function correctHelper(body, candidate) {
  const f = Q.tryParse(body, 'x');
  const g = Q.tryParse(Q.stripPlusC(Q.rhsOf(candidate)), 'x');
  if (!f || !g) return null;
  let checked = 0, ok = 0;
  for (const x of PTS) {
    const d = Q.numericDerivative(f, x);
    const gv = g(x);
    if (d === null || !Number.isFinite(gv)) continue;
    checked += 1;
    if (Math.abs(d - gv) <= 1e-4 * Math.max(1, Math.abs(d))) ok += 1;
  }
  return checked ? { checked, ok } : null;
}

const EXPR = 'y=\\left(\\frac{x^2+1}{x^2-1}\\right)^{\\arctan x}';
const ARC = {
  'arc-r1 (缺 arctan x)': [EXPR, '\\left(\\frac{x^2+1}{x^2-1}\\right)^{\\arctan x}\\left[\\frac{\\ln\\left(\\frac{x^2+1}{x^2-1}\\right)}{1+x^2}-\\frac{4x}{(x^2+1)(x^2-1)}\\right]'],
  'arc-r2 (符号写反)': [EXPR, "y'=\\left(\\frac{x^2+1}{x^2-1}\\right)^{\\arctan x}\\left[\\frac{\\ln\\left(\\frac{x^2+1}{x^2-1}\\right)}{1+x^2}+\\frac{4x\\arctan x}{x^4-1}\\right]"],
  'arc-correct (正解)': [EXPR, '\\left(\\frac{x^2+1}{x^2-1}\\right)^{\\arctan x}\\left[\\frac{\\ln\\left(\\frac{x^2+1}{x^2-1}\\right)}{1+x^2}-\\frac{4x\\arctan x}{x^4-1}\\right]'],
  'existing y=x^2 vs 3x': ['y=x^2', '3x'],
  'existing y=x^2 vs 2x': ['y=x^2', '2x'],
};

for (const [k, [expr, ans]] of Object.entries(ARC)) {
  const body = Q.rhsOf(expr);
  console.log(k.padEnd(24),
    'legacy=' + JSON.stringify(legacy(body, ans)).padEnd(22),
    'correctHelper=' + JSON.stringify(correctHelper(body, ans)));
}
