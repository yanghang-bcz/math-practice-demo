const fs = require('fs');
const path = require('path');
const Q = require('/Users/emobcccz/Documents/GitHub/math-practice-demo/math-quality.js');

const BASE = '/Users/emobcccz/Documents/GitHub/math-practice-demo/.workbuddy/smoke';
const ROUNDS = [
  '2026-09-20T07-32-37-online-200-r1',
  '2026-09-20T07-34-08-online-200-r2',
  '2026-09-20T07-35-44-online-200-r3',
  '2026-09-20T07-37-18-online-200-r4',
];

function rows(dir) {
  return fs.readFileSync(path.join(BASE, dir, 'questions.jsonl'), 'utf8')
    .split('\n').filter(Boolean).map(l => JSON.parse(l));
}

function qOf(row) {
  return {
    module: row.module, topic: row.topic || 't', instruction: row.instruction || '',
    expression: row.expression || '', answer: row.answer || '', solution: row.solution || '',
  };
}
function verificationFor(q) {
  return {
    version: Q.VERSION, question_valid: true, answer_correct: true, solution_correct: true,
    answer_solution_consistent: true, topic_match: true, difficulty_reasonable: true,
    confidence: 0.95, issues: [], content: Q.content(q),
  };
}

// 1) 全部 200 题（含被拒的）tier 分布
const allTier = { A: 0, B: 0, C: 0 };
const okTier = { A: 0, B: 0, C: 0 };
const okByModule = {};
let total = 0, ok = 0;

for (const dir of ROUNDS) {
  for (const row of rows(dir)) {
    total += 1;
    const q = qOf(row);
    const prof = Q.verificationProfile(q);
    allTier[prof.tier] += 1;
    if (row.generate_ok) {
      ok += 1;
      okTier[prof.tier] += 1;
      const m = okByModule[row.module] || (okByModule[row.module] = { A: 0, B: 0, C: 0, n: 0 });
      m[prof.tier] += 1; m.n += 1;
    }
  }
}

console.log('【用修好 parser 后的引擎重算】线上 200 题的形态分级');
console.log('  全部 200 题 :  A=' + allTier.A + '  B=' + allTier.B + '  C=' + allTier.C);
console.log('  其中 105 道被放行 :  A=' + okTier.A + '  B=' + okTier.B + '  C=' + okTier.C);
console.log('  按模块（放行题）:');
for (const [m, v] of Object.entries(okByModule)) {
  console.log('    ' + m.padEnd(11), 'n=' + v.n, ' A=' + v.A, ' B=' + v.B, ' C=' + v.C);
}

// 2) 早期那批 50（r1 的幂指函数错答案在这里）
console.log('\n【早期 50 题那批】（approved-50-firstrun.json）');
const firstrun = JSON.parse(fs.readFileSync(path.join(BASE, 'independent-review/approved-50-firstrun.json'), 'utf8'));
const list = Array.isArray(firstrun) ? firstrun : (firstrun.approved || firstrun.questions || []);
console.log('  条目数 :', list.length);
let fr = { A: 0, B: 0, C: 0 };
for (const item of list) {
  const q = qOf(item);
  const prof = Q.verificationProfile(q);
  fr[prof.tier] += 1;
  if (prof.verdict === 'not_equivalent') {
    const dec = Q.gateDecision({ ...q, verification: verificationFor(q) });
    console.log('   ⚠ 引擎判「答案错」:', item.module, 'L' + item.difficulty, '→', dec.state, '(', dec.code, ')');
    console.log('     ', String(item.expression).replace(/\n/g, ' ').slice(0, 90));
  }
}
console.log('  tier 分布 : A=' + fr.A, 'B=' + fr.B, 'C=' + fr.C);

// 3) 备用题库必须仍然 60/60 可用
console.log('\n【备用题库】');
const bank = require('/Users/emobcccz/Documents/GitHub/math-practice-demo/fallback-bank.js');
const items = bank.QUESTIONS || bank.BANK || bank || [];
const arr = Array.isArray(items) ? items : (items.questions || []);
let bankBad = 0, bankTier = { A: 0, B: 0, C: 0 };
for (const item of arr) {
  const q = qOf(item);
  const prof = Q.verificationProfile(q);
  bankTier[prof.tier] += 1;
  if (prof.verdict !== 'equivalent') {
    bankBad += 1;
    console.log('   ⚠ 未判为 equivalent:', item.id || item.question_id, prof.tier, prof.verdict);
  }
}
console.log('  共', arr.length, '道 | tier A=' + bankTier.A, 'B=' + bankTier.B, 'C=' + bankTier.C, '| 非 equivalent:', bankBad);
