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

// 已知的 2 道独立复核确认错误的题面
const KNOWN_WRONG = new Set(['arc-r1-missing-arctanx', 'arc-r2-sign-flipped']);

function rows(dir) {
  const p = path.join(BASE, dir, 'questions.jsonl');
  return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}

function verificationFor(q) {
  return {
    version: Q.VERSION,
    question_valid: true, answer_correct: true, solution_correct: true,
    answer_solution_consistent: true, topic_match: true, difficulty_reasonable: true,
    confidence: 0.95, issues: [], content: Q.content(q),
  };
}

const summary = { total: 0, genOk: 0, oldVerified: 0, newVerified: 0, nowUncertain: 0, nowRejected: 0 };
const demoted = [];
const promoted = [];
const perModule = {};

for (const dir of ROUNDS) {
  for (const row of rows(dir)) {
    summary.total += 1;
    if (!row.generate_ok) continue;
    summary.genOk += 1;

    const q = {
      module: row.module, topic: row.topic || 't', instruction: row.instruction || '',
      expression: row.expression || '', answer: row.answer || '', solution: row.solution || '',
    };

    const prof = Q.verificationProfile(q);
    const oldApproved = prof.tier !== 'C' ? 'VERIFIED' : 'UNCERTAIN';

    const decision = Q.gateDecision({ ...q, verification: verificationFor(q) });
    const newState = decision.state;

    if (oldApproved === 'VERIFIED') summary.oldVerified += 1;
    if (newState === 'VERIFIED') summary.newVerified += 1;
    if (oldApproved === 'VERIFIED' && newState === 'UNCERTAIN') {
      summary.nowUncertain += 1;
      demoted.push({ dir: dir.slice(-2), module: row.module, difficulty: row.difficulty, tier: prof.tier, verdict: prof.verdict, expr: row.expression });
    }
    if (oldApproved === 'VERIFIED' && newState === 'REJECTED') {
      summary.nowRejected += 1;
      demoted.push({ dir: dir.slice(-2), module: row.module, difficulty: row.difficulty, tier: prof.tier, verdict: prof.verdict, expr: row.expression, REJECTED: true });
    }
    if (oldApproved === 'UNCERTAIN' && newState === 'VERIFIED') {
      promoted.push({ dir: dir.slice(-2), module: row.module, expr: row.expression });
    }
  }
}

console.log('线上 200 题（4 轮 × 50）在「新闸门」下的影响预估');
console.log('='.repeat(66));
console.log('  总题数                :', summary.total);
console.log('  生成成功（过旧闸门）  :', summary.genOk, '  ← 旧接受率', (summary.genOk / summary.total * 100).toFixed(1) + '%');
console.log('  旧口径 VERIFIED       :', summary.oldVerified);
console.log('  新口径 VERIFIED       :', summary.newVerified, '  ← 新接受率', (summary.newVerified / summary.total * 100).toFixed(1) + '%');
console.log('  由 VERIFIED 降级      :');
console.log('     → UNCERTAIN(回落)  :', summary.nowUncertain);
console.log('     → REJECTED         :', summary.nowRejected);
console.log('  由 UNCERTAIN 升为 VERIFIED :', promoted.length);
console.log();
console.log('降级明细（题目形态 → tier / verdict）：');
const byShape = {};
for (const d of demoted) {
  const k = `${d.module}  tier=${d.tier}  verdict=${d.verdict}  ${d.REJECTED ? '→ REJECTED' : '→ UNCERTAIN'}`;
  byShape[k] = (byShape[k] || 0) + 1;
}
for (const [k, v] of Object.entries(byShape).sort((a, b) => b[1] - a[1])) {
  console.log('   ', String(v).padStart(3), k);
}
console.log();
console.log('样例（前 8 条）：');
for (const d of demoted.slice(0, 8)) {
  console.log('   ', d.dir, d.module, 'L' + d.difficulty, '| tier=' + d.tier, '| ' + String(d.expr).slice(0, 72));
}
