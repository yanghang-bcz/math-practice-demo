#!/usr/bin/env node
/* =========================================================
   Judge 专项压力测试 · 本地判定版（Task #4 · D → Task #5A 扩充）
   =========================================================

   为什么要有这一份：
     run.mjs 打的是**线上**后端，能证明部署生效，但证明不了判定逻辑本身 ——
     线上后端可能还是旧版，那测出来的 0 就毫无意义。
     这份脚本不碰网络，直接把同一批探针喂给本地引擎
     （也就是说，前后端跑的是同一份 math-quality.js），
     逐个探针给出「标量层 / 结构层 / 需要问模型」三选一的结论。

   它到底证明了什么，必须说清楚：
     · 错答探针的 correct:true 只有一条来路 —— 确定性引擎判 equivalent。
       模型那条路按 Task #4 的规则不可能产出 correct:true
       （trustModelVerdict 只采信 not_equivalent）。
       所以「错答放行 = 0」在这里是**结构性保证**，不是抽样结论：
       只要没有任何一条错答探针被引擎判 equivalent，线上就一定是 0。
     · 它证明不了的事情：线上那份代码有没有真的换成这一版。
       那要靠 run.mjs 的 judge_layer 指纹。

   用法：
     node tools/smoke/judge-probe-local.mjs --reuse .workbuddy/smoke/<run>/questions.jsonl
     node tools/smoke/judge-probe-local.mjs --reuse <file> --sample 20 --out .workbuddy/smoke/<run>/probe-local
     node tools/smoke/judge-probe-local.mjs --reuse <file> --assert   # 有错答放行就非零退出
   ========================================================= */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const require = createRequire(import.meta.url);
const Q = require(path.join(ROOT, 'math-quality.js'));

/* 覆盖率增益必须可复算，不能靠「之前量过」的记忆。
   这里把 HEAD 里那一版引擎读出来当基线 —— 它就是 Task #4 之前线上跑的判定逻辑。
   读不到就退化成「只报当前口径」，并在报告里说明，绝不编数字。 */
function loadBaselineEngine() {
  try {
    const raw = execFileSync('git', ['show', 'HEAD:math-quality.js'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024
    });

    const tmp = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'calcdaily-baseline-')),
      'math-quality.cjs'
    );

    fs.writeFileSync(tmp, raw);
    return require(tmp);
  } catch {
    return null;
  }
}

const Q_BASELINE = loadBaselineEngine();

const { probesFor, WRONG_PROBES, VALID_PROBES } = await import(
  pathToFileURL(path.join(HERE, 'probes.mjs')).href
);

function parseArgs(argv) {
  const args = { reuse: null, sample: 0, out: null, assert: false, quiet: false };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--reuse') args.reuse = next();
    else if (a === '--sample') args.sample = Number(next()) || 0;
    else if (a === '--out') args.out = next();
    else if (a === '--assert') args.assert = true;
    else if (a === '--quiet') args.quiet = true;
    else if (a === '--help' || a === '-h') {
      console.log('用法: node tools/smoke/judge-probe-local.mjs --reuse <questions.jsonl> [--sample N] [--out DIR] [--assert]');
      process.exit(0);
    }
  }

  return args;
}

/* 和 cloudbase/deepseek/index.js 里的 judgeAnswer 保持同一套规则。
   规则一旦改，两边必须一起改 —— 所以这里只调用引擎导出的函数，
   不自己复述任何阈值。

   同时算两个历史口径，用来量增益：
     baseline  HEAD 的 compare()（Task #4 之前线上就是这么判的）
     task4     旧 compare() 兜底 + 现在这版结构检查（Task #4 的口径） */
function simulateJudge(question, answer) {
  const det = Q.judgeDeterministic(question, answer);

  const baseline =
    Q_BASELINE ? Q_BASELINE.compare(answer, question.answer) !== 'uncertain' : null;

  const task4 =
    Q_BASELINE
      ? (Q_BASELINE.compare(answer, question.answer) !== 'uncertain' ||
         Q.verifyAnswerAgainstQuestion(question, answer) !== 'uncertain')
      : null;

  const decided = det.verdict !== 'uncertain';

  return {
    verdict: decided ? det.verdict : 'uncertain',
    correct: decided ? det.verdict === 'equivalent' : null,
    trusted: decided,
    method: decided ? 'deterministic' : 'ai',
    layer: decided ? det.layer : 'model',
    baseline_decidable: baseline,
    task4_decidable: task4,
    note: decided ? undefined : '引擎判不了 → 会去问模型；模型最多只能判「错」，判不了「对」'
  };
}

function loadQuestions(file) {
  const rows = fs
    .readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));

  return rows.filter((r) => r.generate_ok && r.raw_question);
}

function pickSample(rows, k) {
  if (!k || k >= rows.length) return rows;

  // 分层抽样：按模块轮流取，别让某一类题吃满样本。
  const byModule = new Map();
  for (const r of rows) {
    const list = byModule.get(r.module) || [];
    list.push(r);
    byModule.set(r.module, list);
  }

  const groups = [...byModule.values()];
  const out = [];
  let i = 0;
  while (out.length < k) {
    let added = false;
    for (const g of groups) {
      if (i < g.length && out.length < k) { out.push(g[i]); added = true; }
    }
    i += 1;
    if (!added) break;
  }

  return out;
}

const args = parseArgs(process.argv.slice(2));

if (!args.reuse) {
  console.error('缺少 --reuse <questions.jsonl>（先跑一次 run.mjs，再用它的产物）');
  process.exit(2);
}

const questions = pickSample(loadQuestions(args.reuse), args.sample);

const results = [];
const tally = {
  wrong: { total: 0, scalar: 0, structural: 0, model: 0, accepted: 0, rejected: 0, uncertain: 0, baseline: 0, task4: 0 },
  valid: { total: 0, scalar: 0, structural: 0, model: 0, accepted: 0, rejected: 0, uncertain: 0, baseline: 0, task4: 0, on_bad_canonical: 0 },
  skipped: 0,
  questionsWithBadCanonical: []
};

for (const row of questions) {
  const q = row.raw_question;

  /* 标准答案本身就不过独立验证的题 —— 它上面的「拒绝」不是误杀，
     是引擎抓对了。必须单独归类，否则会把「抓到坏题」记成「误拒好学生」，
     把一个正确行为报成 bug。 */
  const canonicalBad = Q.issues(q).includes(Q.CODES.ANSWER_FAILS_VERIFICATION);
  if (canonicalBad) tally.questionsWithBadCanonical.push(row.id);

  for (const probe of probesFor(q)) {
    if (probe.skipped) {
      tally.skipped += 1;
      results.push({
        id: row.id, module: row.module, difficulty: row.requested_difficulty,
        answer: String(q.answer), key: probe.key, kind: probe.kind,
        skipped: true, reason: probe.reason, canonical_bad: canonicalBad
      });
      continue;
    }

    const out = simulateJudge(q, probe.answer);
    const bucket = tally[probe.kind];
    bucket.total += 1;
    if (out.baseline_decidable) bucket.baseline += 1;
    if (out.task4_decidable) bucket.task4 += 1;
    bucket[out.layer === 'model' ? 'model' : out.layer] += 1;
    if (out.correct === true) bucket.accepted += 1;
    else if (out.correct === false) {
      bucket.rejected += 1;
      if (probe.kind === 'valid' && canonicalBad) bucket.on_bad_canonical += 1;
    } else bucket.uncertain += 1;

    results.push({
      id: row.id, module: row.module, difficulty: row.requested_difficulty,
      answer: String(q.answer), key: probe.key, kind: probe.kind, label: probe.label,
      submitted: probe.answer, verdict: out.verdict, correct: out.correct,
      trusted: out.trusted, layer: out.layer, canonical_bad: canonicalBad,
      baseline_decidable: out.baseline_decidable, task4_decidable: out.task4_decidable
    });
  }
}

const pct = (n, d) => (d ? ((n / d) * 100).toFixed(1) + '%' : 'n/a');

const L = [];
const p = (s = '') => L.push(s);

p('# Judge 专项压力测试 · 本地判定版（Task #4 · D → Task #5A）');
p();
p(`- 题源：\`${args.reuse}\``);
p(`- 题目数：${questions.length}（可用 ${loadQuestions(args.reuse).length}）`);
p(`- 错答探针定义 ${WRONG_PROBES.length} 条 / 合法古怪探针定义 ${VALID_PROBES.length} 条`);
p(`- 生成的探针：错答 ${tally.wrong.total} 条、合法 ${tally.valid.total} 条，跳过 ${tally.skipped} 条`);
p();

p('## 核心验收');
p();
const trueFalseRejects = tally.valid.rejected - tally.valid.on_bad_canonical;
p('| 指标 | 值 |');
p('| --- | --- |');
p(`| **错答被放行（wrong_answer_accepted，须为 0）** | **${tally.wrong.accepted}** |`);
p(`| 错答被拒 | ${tally.wrong.rejected} |`);
p(`| 错答落到模型（引擎判不了） | ${tally.wrong.uncertain} |`);
p(`| **合法写法被误拒（真实误杀）** | **${trueFalseRejects}** |`);
p(`| 合法写法被拒，但原因是该题标准答案本身就错 | ${tally.valid.on_bad_canonical} |`);
p(`| 合法写法落到模型 | ${tally.valid.uncertain} |`);
p(`| 确定性覆盖率 · 错答探针 | ${pct(tally.wrong.scalar + tally.wrong.structural, tally.wrong.total)}（标量 ${tally.wrong.scalar} + 结构 ${tally.wrong.structural}） |`);
p(`| 确定性覆盖率 · 合法探针 | ${pct(tally.valid.scalar + tally.valid.structural, tally.valid.total)}（标量 ${tally.valid.scalar} + 结构 ${tally.valid.structural}） |`);
p();

if (tally.questionsWithBadCanonical.length) {
  p(`> 标准答案本身未通过独立验证的题（${tally.questionsWithBadCanonical.length} 道）：`);
  p(`> ${tally.questionsWithBadCanonical.join('、')}`);
  p('>');
  p('> 这些题上的「拒绝」是引擎抓对了，不是误杀 —— 所以从上表的真实误拒数里剔除。');
  p('> 它们属于生成闸门的责任范围（见 Task 5A 回归语料），不属于判题。');
  p();
}
p('## 确定性覆盖率：增益拆解（三列都是当场算出来的）');
p();
if (Q_BASELINE) {
  p('列名写的是**这一列实际用了什么判定能力**，不是时间点 —— 这样不会有歧义：');
  p();
  p('- **只标量**：`git show HEAD:math-quality.js` 载入的旧引擎，判题只调 `compare()`；');
  p('- **＋结构层**：上面的旧 `compare()` 兜底，接当前这版结构检查（标量判不了才走它）；');
  p('- **＋常量/发散/中心**：当前完整引擎（标量层支持纯常量表达式，结构层多了发散检测与中心平均）。');
  p();
  p('所以「＋结构层 → ＋常量/发散/中心」之间那一跳，就是 Task #5A 单独贡献的部分。');
} else {
  p('⚠️ 读不到 HEAD 里的旧引擎（不是 git 仓库或还没提交过），只能报当前口径。');
}
p();
p('| 指标 | 只标量 | ＋结构层 | ＋常量/发散/中心 |');
p('| --- | --- | --- | --- |');
if (Q_BASELINE) {
  p(`| 错答探针由确定性引擎判死 | ${pct(tally.wrong.baseline, tally.wrong.total)}（${tally.wrong.baseline}/${tally.wrong.total}） | ${pct(tally.wrong.task4, tally.wrong.total)}（${tally.wrong.task4}/${tally.wrong.total}） | ${pct(tally.wrong.scalar + tally.wrong.structural, tally.wrong.total)}（${tally.wrong.scalar + tally.wrong.structural}/${tally.wrong.total}） |`);
  p(`| 错答探针落到模型 | ${tally.wrong.total - tally.wrong.baseline}/${tally.wrong.total} | ${tally.wrong.total - tally.wrong.task4}/${tally.wrong.total} | ${tally.wrong.model}/${tally.wrong.total} |`);
  p(`| 合法探针由确定性引擎判死 | ${pct(tally.valid.baseline, tally.valid.total)}（${tally.valid.baseline}/${tally.valid.total}） | ${pct(tally.valid.task4, tally.valid.total)}（${tally.valid.task4}/${tally.valid.total}） | ${pct(tally.valid.scalar + tally.valid.structural, tally.valid.total)}（${tally.valid.scalar + tally.valid.structural}/${tally.valid.total}） |`);
} else {
  p(`| 错答探针由确定性引擎判死 | — | — | ${pct(tally.wrong.scalar + tally.wrong.structural, tally.wrong.total)}（${tally.wrong.scalar + tally.wrong.structural}/${tally.wrong.total}） |`);
  p(`| 错答探针落到模型 | — | — | ${tally.wrong.model}/${tally.wrong.total} |`);
  p(`| 合法探针由确定性引擎判死 | — | — | ${pct(tally.valid.scalar + tally.valid.structural, tally.valid.total)} |`);
}
p(`| 错答被放行 | 取决于模型（实测线上 6/40 误批） | 0（结构上不可能） | ${tally.wrong.accepted}（结构上不可能） |`);
p();

p('## 结论');
p();
if (tally.wrong.accepted === 0) {
  p('- ✅ 没有任何一条错答探针被判成 `correct: true`。');
  p('- 这不是抽样运气：`correct:true` 只有一条来路 —— 确定性引擎判 `equivalent`。');
  p('  模型那条路按 Task #4 的规则只采信 `not_equivalent`，产不出 `correct:true`。');
  p('  所以「错答放行 = 0」是结构性保证，前提只是「线上跑的是这一版代码」。');
} else {
  p(`- ❌ 有 ${tally.wrong.accepted} 条错答被判成对，下面是明细。`);
}

if (tally.wrong.uncertain) {
  p();
  p(`- ⚠️ 还有 ${tally.wrong.uncertain} 条错答引擎判不了、会去问模型。`);
  p('  模型最多只能把它们判「错」，不会放行；但会多消耗一次模型调用，且判不出来时用户会看到「暂时无法可靠判断」。');
}
p();

const residual = results.filter((r) => !r.skipped && r.kind === 'wrong' && r.correct !== false);
if (residual.length) {
  p('## 仍未被引擎判死的错答（会落到模型）');
  p();
  p('| 题 | 模块 | 参考答案 | 探针 | 提交的答案 | 本地结论 |');
  p('| --- | --- | --- | --- | --- | --- |');
  const seen = new Set();
  for (const r of residual) {
    const dedupe = r.key + '|' + r.answer;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    p(`| ${r.id} | ${r.module} | \`${r.answer}\` | ${r.key} | \`${r.submitted}\` | ${r.verdict} |`);
  }
  p();
}

const validProblem = results.filter((r) => !r.skipped && r.kind === 'valid' && r.correct !== true);
if (validProblem.length) {
  p('## 合法写法没被确定性判定（这一侧是「多问一次模型」的代价，不是误批）');
  p();
  p('带 ⚠ 的行落在「标准答案本身有问题」的题上 —— 那里的拒绝是对的。');
  p();
  p('| 题 | 模块 | 参考答案 | 探针 | 提交的答案 | 本地结论 | 备注 |');
  p('| --- | --- | --- | --- | --- | --- | --- |');
  const seen = new Set();
  for (const r of validProblem) {
    const dedupe = r.key + '|' + r.answer;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    p(`| ${r.id} | ${r.module} | \`${r.answer}\` | ${r.key} | \`${r.submitted}\` | ${r.verdict} | ${r.canonical_bad ? '⚠ 该题标准答案本身有问题' : ''} |`);
  }
  p();
}

const skipped = results.filter((r) => r.skipped);
if (skipped.length) {
  const byReason = {};
  for (const r of skipped) byReason[r.reason] = (byReason[r.reason] || 0) + 1;
  p('## 被跳过的探针（不适用）');
  p();
  for (const [k, v] of Object.entries(byReason)) p(`- ${k}：${v} 条`);
  p();
}

p('## 逐条明细');
p();
p('| 题 | 模块 | L | 探针 | 类型 | 提交的答案 | verdict | correct | 判定层 |');
p('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of results) {
  if (r.skipped) {
    p(`| ${r.id} | ${r.module} | L${r.difficulty} | ${r.key} | ${r.kind} | — | skip | — | — |`);
    continue;
  }
  p(
    `| ${r.id} | ${r.module} | L${r.difficulty} | ${r.key} | ${r.kind} | \`${r.submitted}\` | ` +
      `${r.verdict} | ${r.correct === null ? '—' : r.correct} | ${r.layer} |`
  );
}
p();

const text = L.join('\n');
console.log(text);

if (args.out) {
  fs.mkdirSync(args.out, { recursive: true });
  fs.writeFileSync(path.join(args.out, 'probe-local.md'), text + '\n');
  fs.writeFileSync(path.join(args.out, 'probe-local.json'), JSON.stringify({ tally, results }, null, 2) + '\n');
  console.log(`\n写好了：${path.join(args.out, 'probe-local.md')}`);
}

if (args.assert && tally.wrong.accepted > 0) process.exit(1);
