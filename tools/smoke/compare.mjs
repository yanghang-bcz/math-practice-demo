#!/usr/bin/env node
/* 把两次 smoke test 的 report.json 拼成前后对比表
 *
 * 用法：
 *   node tools/smoke/compare.mjs .workbuddy/smoke/<a>/report.json .workbuddy/smoke/<b>/report.json
 *   node tools/smoke/compare.mjs --labels v1,v2 a.json b.json
 *
 * 会自动把第一个当「改造前」、第二个当「改造后」，并对关键指标给出行内 delta。
 */

import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
let labels = null;
const files = [];

for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--labels') labels = String(argv[++i]).split(',').map((s) => s.trim());
  else files.push(argv[i]);
}

if (files.length < 2) {
  console.error('需要两个 report.json 路径。');
  console.error('用法: node tools/smoke/compare.mjs <before.json> <after.json>');
  process.exit(2);
}

const reports = files.map((f) => JSON.parse(fs.readFileSync(path.resolve(f), 'utf8')));
const [before, after] = reports;

const nameOf = (r, i) => labels?.[i] || r.meta?.label || path.basename(path.dirname(files[i]));

/* ---------- 数值提取：把 "39/50" / "78.0%" / "6.0s" / 12 都变成可比数字 ---------- */

function numeric(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;

  const ratio = value.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (ratio) {
    const [, a, b] = ratio;
    return Number(b) === 0 ? null : (Number(a) / Number(b)) * 100;
  }

  const pct = value.match(/^([\d.]+)%$/);
  if (pct) return Number(pct[1]);

  const sec = value.match(/^([\d.]+)s$/);
  if (sec) return Number(sec[1]) * 1000;

  const num = value.trim().match(/^-?[\d.]+$/);
  if (num) return Number(num[0]);

  return null;
}

function unitOf(value) {
  if (typeof value === 'string' && /^\d+\s*\/\s*\d+$/.test(value)) return 'pct';
  if (typeof value === 'string' && /%$/.test(value)) return 'pct';
  if (typeof value === 'string' && /s$/.test(value)) return 'duration';
  return 'count';
}

/* 越低越好 / 越高越好 */
const LOWER_IS_BETTER = [
  'Gate reject',
  'Would fallback',
  'Wrong approved',
  'Structurally bad',
  'Answer-solution mismatch',
  'Answer fails verification',
  'judge 说参考答案可疑',
  '错答探针被误批为对',
  'Generate latency',
  'Judge latency'
];

const HIGHER_IS_BETTER = [
  'Generate success',
  'Verification snapshot intact',
  '焦点格',
  'Judge 重复一致',
  'judge 全部 equivalent',
  'canonical 保持不变',
  'judge 响应带 versions'
];

function direction(key) {
  if (LOWER_IS_BETTER.some((k) => key.startsWith(k))) return -1;
  if (HIGHER_IS_BETTER.some((k) => key.startsWith(k))) return 1;
  return 0;
}

function fmtDelta(key, a, b) {
  const na = numeric(a);
  const nb = numeric(b);
  if (na === null || nb === null) return '';

  const d = nb - na;
  const dir = direction(key);

  if (d === 0) return '＝ 不变';

  let shown;
  if (unitOf(b) === 'duration') shown = `${d > 0 ? '+' : ''}${(d / 1000).toFixed(1)}s`;
  else if (unitOf(b) === 'pct') shown = `${d > 0 ? '+' : ''}${d.toFixed(1)}pt`;
  else shown = `${d > 0 ? '+' : ''}${d}`;

  if (dir > 0) return d > 0 ? `↑ 改善 ${shown}` : `↓ 恶化 ${shown}`;
  if (dir < 0) return d < 0 ? `↓ 改善 ${shown}` : `↑ 恶化 ${shown}`;
  return shown;
}

/* ---------- 输出 ---------- */

const keys = [...new Set([...Object.keys(before.headline || {}), ...Object.keys(after.headline || {})])];

const L = [];
const p = (s = '') => L.push(s);

const beforeName = nameOf(before, 0);
const afterName = nameOf(after, 1);

p(`# 前后对比：${beforeName} → ${afterName}`);
p();
p(`- 改造前：\`${before.meta?.url}\` @ ${before.meta?.generated_at}`);
p(`- 改造后：\`${after.meta?.url}\` @ ${after.meta?.generated_at}`);
p();

p('## 版本');
p();
p(`- 改造前服务端自报：\`${JSON.stringify(before.meta?.health)}\``);
p(`- 改造后服务端自报：\`${JSON.stringify(after.meta?.health)}\``);
p();

p('## 指标对比');
p();
p(`| 指标 | ${beforeName} | ${afterName} | 变化 |`);
p('| --- | --- | --- | --- |');

for (const key of keys) {
  const a = before.headline?.[key] ?? '—';
  const b = after.headline?.[key] ?? '—';
  p(`| ${key} | ${a} | ${b} | ${fmtDelta(key, a, b)} |`);
}

p();

const wrongAfter = numeric(after.headline?.['Wrong approved']);
const probeAfter = numeric(after.headline?.['错答探针被误批为对（须为0）']);

p('## 验收判定');
p();

const blockers = [];

if (wrongAfter === null) {
  blockers.push('`Wrong approved` 无法解析，需人工看 report。');
} else if (wrongAfter === 0) {
  p('- ✅ **Wrong approved = 0**：没有明确数学错误进入用户端。');
} else {
  blockers.push(`**Wrong approved 仍为 ${after.headline['Wrong approved']}**，未达标。`);
}

if (probeAfter !== null) {
  if (probeAfter === 0) {
    p('- ✅ **错答探针 0 条被误批为对**：判题没有被自然语言带偏。');
  } else {
    blockers.push(`**错答探针有 ${after.headline['错答探针被误批为对（须为0）']} 条被误批为对**，未达标。`);
  }
}

p();

if (blockers.length) {
  p('按约定应先定位原因，暂不继续做 prefetch / retry / storage 优化。');
  p();
  for (const b of blockers) p(`- ❌ ${b}`);
  p();

  if (after.wrong_approved_questions?.length) {
    p('  独立复核抓到的错误批准条目：');
    for (const w of after.wrong_approved_questions) {
      p(`  - \`${w.id}\` ${w.module} L${w.requested_difficulty} — ${w.expression}`);
      p(`    - answer: ${w.answer}　issues: ${w.issues.join(', ')}　回代：${w.answer_verifies}`);
    }
    p();
  }

  const bad = [];
  for (const j of after.judge_detail || []) {
    for (const x of j.probes || []) if (x.correct === true) bad.push({ id: j.id, ...x });
  }
  if (bad.length) {
    p('  判题误批错答的条目：');
    for (const b of bad) p(`  - \`${b.id}\` 探针 \`${b.key}\`：提交「${b.answer}」→ verdict=${b.verdict}`);
    p();
  }
} else {
  p('✅ 两项零容忍指标都达标。');
  p();
}

const outPath = path.join(path.dirname(path.resolve(files[1])), `compare-${beforeName}-vs-${afterName}.md`);
fs.writeFileSync(outPath, L.join('\n') + '\n');

process.stdout.write(L.join('\n') + '\n');
process.stdout.write(`\n已写入: ${outPath}\n`);
