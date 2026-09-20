#!/usr/bin/env node
/* 50 题 reliability smoke test —— 打真实后端
 *
 * 用法：
 *   node tools/smoke/run.mjs --label v2
 *   node tools/smoke/run.mjs --limit 3 --evaluate-sample 0   # 小样本自检
 *
 * 关键行为：开跑前先查 ?health=1。如果后端没带 protocol_version，说明它是
 * 改造前的旧版 —— 脚本会直接停下来，除非显式给 --allow-old-server。
 * 这是被「以为部署了、其实没部署」坑过一次之后加的。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildMatrix, matrixSize, isFocusCell } from './matrix.mjs';
import { checkQuestion, isWrongApproved, isStructurallyBad, ENGINE_VERSION } from './verify.mjs';

/* 探针组挪到 probes.mjs 了（Task #4 · D 扩到全形态：符号翻转、×2、
   2(...)、2\cdot(...)、2\times(...)、裸 \frac 速写、±1 扰动、以及一批
   「古怪但合法」的写法）。这里再导出一遍是为了兼容已有的守卫测试。 */
export { WRONG_PROBES, VALID_PROBES, probesFor, rhsOf } from './probes.mjs';
import { probesFor } from './probes.mjs';

/* 本机环境设了 HTTP_PROXY，Node 的 fetch 在某些版本会读它并拦成 502。
   这个脚本只打测试目标，直接清掉最省事。放在 main 里，避免 import 时改测试进程的环境。 */
function dropProxyEnv() {
  for (const k of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy']) {
    delete process.env[k];
  }
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

const DEFAULT_URL =
  'https://calcdaily-d5g2titwue91551fb-1482769901.ap-shanghai.app.tcloudbase.com/api/deepseek';

/* 错答探针组。
 *
 * 存在的理由：实测旧版（v1.0）判题时发现，把
 *   「我不会做，感觉参考答案本身写错了。」
 * 当学生答案提交，会拿到 verdict=equivalent / correct=true。
 * 单句自然语言就能把错答刷成「正确」—— 因为旧版提示词让判题员
 * 「检查参考答案是否正确」，模型被学生那句话带偏了。
 *
 * 所以每次跑都固定测这几条，任何一条 correct===true 都是零容忍。
 *
 * Task #4 起探针组从 4 条扩到 11 条错答 + 6 条「古怪但合法」，
 * 定义在 probes.mjs。
 */

/* ---------------- 参数 ---------------- */

function parseArgs(argv) {
  const args = {
    url: DEFAULT_URL,
    label: 'run',
    out: null,
    limit: 0,
    only: null,
    reuse: null,
    repeat: 3,
    judgeSample: 10,
    evaluateSample: 10,
    concurrency: 3,
    allowOldServer: false,
    timeoutMs: 200000
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--url') args.url = next();
    else if (a === '--label') args.label = next();
    else if (a === '--out') args.out = next();
    else if (a === '--limit') args.limit = Number(next()) || 0;
    else if (a === '--only') args.only = String(next()).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--reuse') args.reuse = next();
    else if (a === '--repeat') args.repeat = Number(next()) || 3;
    else if (a === '--judge-sample') args.judgeSample = Number(next()) || 0;
    else if (a === '--evaluate-sample') args.evaluateSample = Number(next()) || 0;
    else if (a === '--concurrency') args.concurrency = Math.max(1, Number(next()) || 3);
    else if (a === '--timeout') args.timeoutMs = Number(next()) || 200000;
    else if (a === '--allow-old-server') args.allowOldServer = true;
    else if (a === '--help' || a === '-h') {
      console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]);
      process.exit(0);
    }
  }

  return args;
}

const args = parseArgs(process.argv.slice(2));

/* ---------------- 输出 ---------------- */

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = args.out
  ? path.resolve(args.out)
  : path.join(ROOT, '.workbuddy', 'smoke', `${stamp}-${args.label}`);

const jsonlPath = path.join(outDir, 'questions.jsonl');
let jsonlReady = false;

/* 被 import（例如测试）时不产生任何文件副作用 */
function initOutput() {
  if (jsonlReady) return;
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(jsonlPath, '');
  jsonlReady = true;
}

function log(...parts) {
  console.log(...parts);
}

function appendJsonl(row) {
  if (!jsonlReady) return;
  fs.appendFileSync(jsonlPath, JSON.stringify(row) + '\n');
}

/* 独立复核结果压成可序列化的形状（报告和 jsonl 都用它） */
function checkSummary(check) {
  if (!check) return null;
  return {
    ok: check.ok,
    issues: check.issues,
    approved: check.approved,
    answer_verifies: check.answer_verifies,
    solution_mismatch: check.solution_mismatch,
    answer_fails_verification: check.answer_fails_verification,
    snapshot_intact: check.snapshot_intact,
    claimed_in_solution: check.claimed_in_solution,
    wrong_approved: isWrongApproved(check),
    structurally_bad: isStructurallyBad(check)
  };
}

/* --reuse：从上次的 questions.jsonl 里恢复题目，跳过生成、只重跑判题。
   判题环节是重点（也是唯一改过探针的地方），重测它不该再花 50 次生成的钱。 */
function loadReused(p) {
  const file = path.resolve(p);
  const rows = fs
    .readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));

  return rows
    .filter((r) => r.generate_ok && r.raw_question)
    .map((r) => {
      // 复核结果按当前引擎重算，避免报告里混着上一版的结论
      r.check = checkSummary(checkQuestion(r.raw_question));
      r.judge = null;
      r.evaluate = null;
      r.reused_from = file;
      return r;
    });
}

/* ---------------- HTTP ---------------- */

async function post(body) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);

  try {
    const res = await fetch(args.url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = { __nonJson: text.slice(0, 400) };
    }

    return {
      http: res.status,
      ok: res.ok,
      data,
      latency_ms: Date.now() - started
    };
  } catch (error) {
    return {
      http: 0,
      ok: false,
      data: {
        error: error?.name === 'AbortError' ? 'CLIENT_TIMEOUT' : String(error?.message || error),
        code: error?.name === 'AbortError' ? 'CLIENT_TIMEOUT' : 'CLIENT_NETWORK_ERROR'
      },
      latency_ms: Date.now() - started
    };
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------- 健康检查 ---------------- */

async function healthCheck() {
  const url = args.url + (args.url.includes('?') ? '&' : '?') + 'health=1';
  const started = Date.now();
  let payload = null;

  try {
    const res = await fetch(url, { cache: 'no-store' });
    payload = await res.json().catch(() => null);
    return { reachable: true, http: res.status, payload, latency_ms: Date.now() - started };
  } catch (error) {
    return { reachable: false, error: String(error?.message || error), latency_ms: Date.now() - started };
  }
}

/* ---------------- 并发池 ---------------- */

async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        results[i] = await worker(items[i], i);
      } catch (error) {
        results[i] = { __workerError: String(error?.stack || error) };
      }
    }
  });

  await Promise.all(runners);
  return results;
}

/* ---------------- 统计 ---------------- */

function percentile(values, p) {
  const arr = values.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (!arr.length) return null;
  if (arr.length === 1) return arr[0];
  const idx = (p / 100) * (arr.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return arr[lo];
  return Math.round(arr[lo] + (arr[hi] - arr[lo]) * (idx - lo));
}

function mean(values) {
  const arr = values.filter((v) => Number.isFinite(v));
  if (!arr.length) return null;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

/* ---------------- 主流程 ---------------- */

async function main() {
  dropProxyEnv();
  initOutput();

  log('=============================================================');
  log(' CalcDaily 50 题 reliability smoke test');
  log('=============================================================');
  log('目标      :', args.url);
  log('标签      :', args.label);
  log('输出目录  :', outDir);
  log('引擎版本  :', ENGINE_VERSION);
  log('并发      :', args.concurrency);
  log('');

  /* --- 版本闸门 --- */
  log('>> 检查后端版本 ...');
  const health = await healthCheck();
  const hp = health.payload || {};
  const isNew = hp.protocol_version !== undefined || hp.pipeline !== undefined;

  log('   health:', JSON.stringify(hp));
  log('   版本字段:', isNew ? '存在（新版）' : '缺失（旧版）');

  if (!isNew && !args.allowOldServer) {
    log('');
    log('!! 停下来了：后端没有返回 protocol_version / pipeline。');
    log('   这说明线上跑的还是改造前的旧版，现在测出来的数字不是「改造后」的。');
    log('   确认要测这个版本（当作改造前基线）就加 --allow-old-server。');
    log('');
    fs.writeFileSync(
      path.join(outDir, 'ABORTED.txt'),
      [
        '后端未升级：health 响应缺少 protocol_version / pipeline。',
        'health = ' + JSON.stringify(hp),
        '若要有意测旧版基线，请加 --allow-old-server。'
      ].join('\n') + '\n'
    );
    process.exit(2);
  }

  log('');

  /* --- 生成（--reuse 时矩阵留空，pool 立即返回；题目从上次的 jsonl 恢复）--- */
  let matrix = args.reuse ? [] : buildMatrix();
  if (args.only) {
    matrix = matrix.filter((c) =>
      args.only.some((p) => c.id.startsWith(p) || `${c.module}-L${c.difficulty}` === p)
    );
  }
  if (args.limit > 0) matrix = matrix.slice(0, args.limit);

  let generated = null;

  if (args.reuse) {
    generated = loadReused(args.reuse);
    log(`>> 复用模式：从 ${path.resolve(args.reuse)} 恢复 ${generated.length} 道已放行题，跳过生成`);
    fs.writeFileSync(jsonlPath, generated.map((r) => JSON.stringify(r)).join('\n') + '\n');
  } else {
    log(`>> 生成阶段：${matrix.length} 题（矩阵全量 ${matrixSize()} 题）`);
  }

  let done = 0;

  const fresh = await pool(matrix, args.concurrency, async (cell) => {
    const res = await post({
      action: 'generate',
      count: 1,
      plans: [
        {
          module: cell.module,
          topic: cell.topic,
          targetDifficulty: cell.difficulty,
          purpose: cell.purpose,
          zone: cell.zone
        }
      ],
      avoidPrompts: []
    });

    done += 1;
    const q = res.ok ? res.data?.questions?.[0] : null;
    const check = q ? checkQuestion(q) : null;

    const row = {
      index: cell.index,
      id: cell.id,
      module: cell.module,
      requested_topic: cell.topic,
      requested_difficulty: cell.difficulty,
      focus: cell.focus,
      generate_ok: Boolean(q),
      generate_http: res.http,
      generate_latency_ms: res.latency_ms,
      generate_error: q ? null : (res.data?.error || 'unknown'),
      generate_error_code: q ? null : (res.data?.code || null),
      rejection_reasons: res.data?.rejection_reasons || [],
      attempts: res.data?.attempts ?? null,
      versions: res.data?.versions || null,
      would_fallback: !q,
      question_id: q?.question_id ?? null,
      topic: q?.topic ?? null,
      display_topic: q?.displayTopic ?? null,
      display_difficulty: q?.displayDifficulty ?? null,
      calibrated_difficulty: q?.calibratedDifficulty ?? null,
      provisional_difficulty: q?.provisionalDifficulty ?? null,
      difficulty: q?.difficulty ?? null,
      instruction: q?.instruction ?? null,
      expression: q?.expression ?? q?.prompt ?? null,
      answer: q?.answer ?? null,
      solution: q?.solution ?? null,
      verification: q?.verification ?? null,
      verification_version: q?.verification?.version ?? null,
      prompt: q?.prompt ?? null,
      // 判题回环必须原样用服务端返回的对象。少一个字段、改一个字段，
      // verification.content 快照就对不上，题目会被判成不可信 —— 实测踩过。
      raw_question: q ?? null,
      check: checkSummary(check),
      judge: null,
      evaluate: null
    };

    appendJsonl(row);
    process.stdout.write(`\r   生成 ${done}/${matrix.length}   通过 ${row.generate_ok ? 'Y' : '.'}   `);
    return row;
  });

  if (!args.reuse) generated = fresh;

  log('');
  const approvedRows = generated.filter((r) => r.generate_ok);
  log(`   生成成功 ${approvedRows.length}/${generated.length}，失败 ${generated.length - approvedRows.length}`);

  /* --- 判题：抽样 --- */
  const sample = selectJudgeSample(approvedRows, args.judgeSample);
  const probeSet = [
    ...WRONG_PROBES.map((p) => ({ ...p, kind: 'wrong' })),
    ...VALID_PROBES.map((p) => ({ ...p, kind: 'valid' }))
  ];
  const activeProbes = probeSet.length;
  log('');
  log(
    `>> 判题阶段：${sample.length} 题 × ${args.repeat} 次重复 + ${activeProbes} 条探针` +
      `（错答 ${WRONG_PROBES.length} + 合法古怪 ${VALID_PROBES.length}）`
  );

  let judged = 0;
  const totalJudgeCalls = sample.length * (args.repeat + activeProbes);

  await pool(sample, Math.min(args.concurrency, 3), async (row) => {
    // 原样回传服务端给的题目对象；不要自己重新拼字段（会造成快照失配）。
    const q = row.raw_question;

    const canonicalBefore = JSON.stringify({
      answer: q.answer,
      solution: q.solution,
      expression: q.expression,
      module: q.module,
      topic: q.topic
    });

    // 1) 重复判题：把「标准答案本身」当学生答案提交。
    //    正确行为是每一次都 equivalent，且由确定性引擎直接裁决（不消耗模型调用）。
    const reps = [];
    for (let i = 0; i < args.repeat; i++) {
      const res = await post({ action: 'judge', question: q, userAnswer: q.answer });
      reps.push({
        http: res.http,
        ok: res.ok,
        latency_ms: res.latency_ms,
        verdict: res.data?.verdict ?? null,
        correct: res.data?.correct ?? null,
        trusted: res.data?.trusted ?? null,
        reason: res.data?.reason ?? null,
        method: res.data?.method ?? null,
        judge_layer: res.data?.judge_layer ?? null,
        detail: res.data?.detail ?? null,
        versions: res.data?.versions ?? null,
        raw: res.data
      });
      judged += 1;
      process.stdout.write(`\r   判题 ${judged}/${totalJudgeCalls}    `);
    }

    // 2) 探针组（Task #4 · D）。
    //    错答探针：任何一条 correct===true 都是零容忍事故。
    //    合法探针：任何一条 correct!==true 都说明引擎太窄（判对的拒了）。
    const probes = [];

    for (const p of probesFor(q)) {
      if (p.skipped) {
        // 不该建的探针如实记下来，而不是悄悄从分母里消失。
        probes.push({
          key: p.key,
          label: p.label,
          kind: p.kind,
          skipped: true,
          reason: p.reason,
          answer: null,
          correct: null,
          wrongly_correct: false,
          wrongly_rejected: false
        });
        continue;
      }

      const res = await post({ action: 'judge', question: q, userAnswer: p.answer });
      judged += 1;
      process.stdout.write(`\r   判题 ${judged}/${totalJudgeCalls}    `);

      probes.push({
        key: p.key,
        label: p.label,
        kind: p.kind,
        skipped: false,
        answer: p.answer,
        http: res.http,
        verdict: res.data?.verdict ?? null,
        correct: res.data?.correct ?? null,
        trusted: res.data?.trusted ?? null,
        reason: res.data?.reason ?? null,
        method: res.data?.method ?? null,
        judge_layer: res.data?.judge_layer ?? null,
        detail: res.data?.detail ?? null,
        versions: res.data?.versions ?? null,
        // 反向指责参考答案 —— Task #3 新增 canonical_suspected 就是为了让它有正当出口
        blamed_reference: res.data?.verdict === 'canonical_suspected',
        wrongly_correct: p.kind === 'wrong' && res.data?.correct === true,
        wrongly_rejected: p.kind === 'valid' && res.data?.correct === false,
        raw: res.data
      });
    }

    const canonicalAfter = JSON.stringify({
      answer: q.answer,
      solution: q.solution,
      expression: q.expression,
      module: q.module,
      topic: q.topic
    });

    // 判题响应里有没有可以反过来改写标准答案的字段
    const rewriteFields = ['answer', 'canonical_answer', 'suggested_answer', 'correct_answer'];
    const leaks = rewriteFields.filter((f) =>
      [...reps, ...probes].some((r) => r.raw && f in r.raw)
    );

    const verdicts = reps.map((r) => r.verdict);
    const distinct = [...new Set(verdicts)];

    const live = probes.filter((p) => !p.skipped);
    const wrongLive = live.filter((p) => p.kind === 'wrong');
    const validLive = live.filter((p) => p.kind === 'valid');

    /* 判定层分布 —— Task #4 要证明「确定性覆盖率」真的涨了，
       所以标量层、结构层、以及仍然落到模型的层数都要分开数。 */
    const layerCount = (rows) => ({
      scalar: rows.filter((r) => r.judge_layer === 'scalar').length,
      structural: rows.filter((r) => r.judge_layer === 'structural').length,
      model: rows.filter((r) => r.method === 'ai').length,
      unknown: rows.filter((r) => r.judge_layer === null && r.method === null).length
    });

    row.judge = {
      student_answer_mode: 'canonical_answer',
      reps,
      repeat_consistent: distinct.length === 1,
      distinct_verdicts: distinct,
      all_equivalent: verdicts.every((v) => v === 'equivalent'),
      all_correct_true: reps.every((r) => r.correct === true),
      methods: [...new Set(reps.map((r) => r.method))],
      reasons: [...new Set(reps.map((r) => r.reason))],
      versions_present: [...reps, ...probes].every((r) => r.versions !== null),
      canonical_unchanged: canonicalBefore === canonicalAfter,
      canonical_suspected_count: reps.filter((r) => r.verdict === 'canonical_suspected').length,
      probes,
      probes_skipped: probes.filter((p) => p.skipped).length,
      wrong_probes: wrongLive.length,
      valid_probes: validLive.length,
      wrongly_correct_probes: wrongLive.filter((p) => p.wrongly_correct).length,
      wrongly_rejected_probes: validLive.filter((p) => p.wrongly_rejected).length,
      layers_reps: layerCount(reps),
      layers_wrong_probes: layerCount(wrongLive),
      layers_valid_probes: layerCount(validLive),
      rewrite_fields_leaked: leaks
    };

    row.__mutated = row.judge;
    return row;
  });

  // 把判题结果写回 jsonl（重写整个文件，行数只有 50，代价可忽略）
  const byId = new Map(generated.map((r) => [r.id, r]));
  for (const r of sample) {
    const target = byId.get(r.id);
    if (target) target.judge = r.judge;
  }
  fs.writeFileSync(jsonlPath, generated.map((r) => JSON.stringify(r)).join('\n') + '\n');

  log('');

  /* --- 难度独立评估：抽样 --- */
  if (args.evaluateSample > 0) {
    // 用和判题同样的分层抽样：否则 evaluate 永远落在矩阵最前面那几个低难度格子，
    // 高难度题的「审核员纠正 vs 独立评估」就没法交叉核对。
    const evalSample = selectJudgeSample(approvedRows, args.evaluateSample);
    log('');
    log(`>> 独立难度评估：${evalSample.length} 题`);

    let n = 0;
    await pool(evalSample, Math.min(args.concurrency, 3), async (row) => {
      const res = await post({
        action: 'evaluate',
        question: {
          module: row.module,
          topic: row.topic,
          expression: row.expression,
          answer: row.answer,
          solution: row.solution
        },
        plan: { module: row.module, targetDifficulty: row.requested_difficulty }
      });
      n += 1;
      process.stdout.write(`\r   评估 ${n}/${evalSample.length}    `);
      row.evaluate = {
        http: res.http,
        ok: res.ok,
        latency_ms: res.latency_ms,
        difficulty: res.data?.difficulty ?? res.data?.estimatedDifficulty ?? null,
        confidence: res.data?.confidence ?? null,
        versions: res.data?.versions ?? null,
        raw: res.ok ? undefined : res.data
      };
      return row;
    });

    fs.writeFileSync(jsonlPath, generated.map((r) => JSON.stringify(r)).join('\n') + '\n');
    log('');
  }

  /* --- 汇总 --- */
  const report = summarize(generated, {
    label: args.label,
    url: args.url,
    health: hp,
    engine: ENGINE_VERSION,
    matrixSize: matrixSize(),
    concurrency: args.concurrency,
    repeat: args.repeat
  });

  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(outDir, 'report.md'), renderMarkdown(report));

  log('');
  log('=============================================================');
  log(' 汇总');
  log('=============================================================');
  for (const [k, v] of Object.entries(report.headline)) {
    log(`   ${k.padEnd(34)} ${v}`);
  }
  log('');
  log('  报告:', path.join(outDir, 'report.md'));
  log('  原始:', jsonlPath);
  log('');
}

/* ---------------- 抽样：偏高难度焦点格子 ---------------- */

function selectJudgeSample(approved, k) {
  if (k <= 0) return [];
  const focus = approved.filter((r) => r.focus);
  const rest = approved.filter((r) => !r.focus);

  const out = [];
  const takeFrom = (arr) => {
    for (const r of arr) {
      if (out.length >= k) return;
      if (!out.includes(r)) out.push(r);
    }
  };

  // 先按模块×难度分层各取一道，保证覆盖面
  const seen = new Set();
  for (const r of [...focus, ...rest]) {
    const key = `${r.module}-${r.requested_difficulty}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length >= k) return out;
  }

  takeFrom(focus);
  takeFrom(rest);
  return out.slice(0, k);
}

/* ---------------- 汇总 ---------------- */

function summarize(rows, meta) {
  const total = rows.length;
  const ok = rows.filter((r) => r.generate_ok);
  const failed = rows.filter((r) => !r.generate_ok);
  const checks = ok.filter((r) => r.check);
  const wrongApproved = checks.filter((r) => r.check.wrong_approved);
  const structurallyBad = checks.filter((r) => r.check.structurally_bad);

  const judgeRows = rows.filter((r) => r.judge);
  const allReps = judgeRows.flatMap((r) => r.judge.reps);
  const totalVerdicts = allReps.length;

  const genLatency = rows.map((r) => r.generate_latency_ms);
  const genLatencyOk = ok.map((r) => r.generate_latency_ms);
  const judgeLatency = allReps.map((r) => r.latency_ms);

  const versions = new Set();
  for (const r of rows) {
    if (r.versions) versions.add(JSON.stringify(r.versions));
  }

  const focusOk = ok.filter((r) => r.focus);
  const focusWrong = focusOk.filter((r) => r.check?.wrong_approved);

  const rejectionReasons = {};
  for (const r of failed) {
    for (const reason of r.rejection_reasons.length ? r.rejection_reasons : [r.generate_error_code || 'unknown']) {
      rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
    }
  }

  const report = {
    meta: { ...meta, generated_at: new Date().toISOString() },
    headline: {},
    versions_observed: [...versions].map((v) => JSON.parse(v)),
    gate_rejection_reasons: rejectionReasons,
    by_cell: {},
    wrong_approved_questions: wrongApproved.map(brief),
    structurally_bad_questions: structurallyBad.map(brief),
    judge_detail: judgeRows.map((r) => ({
      id: r.id,
      module: r.module,
      difficulty: r.requested_difficulty,
      verdicts: r.judge.reps.map((x) => x.verdict),
      consistent: r.judge.repeat_consistent,
      all_equivalent: r.judge.all_equivalent,
      methods: r.judge.methods,
      reasons: r.judge.reasons,
      canonical_suspected: r.judge.canonical_suspected_count,
      canonical_unchanged: r.judge.canonical_unchanged,
      versions_present: r.judge.versions_present,
      probes: r.judge.probes.map((p) => ({
        key: p.key,
        label: p.label,
        kind: p.kind,
        skipped: p.skipped,
        skip_reason: p.reason ?? null,
        answer: p.answer,
        verdict: p.verdict,
        correct: p.correct,
        trusted: p.trusted,
        method: p.method,
        judge_layer: p.judge_layer,
        detail: p.detail,
        wrongly_correct: p.wrongly_correct,
        wrongly_rejected: p.wrongly_rejected
      })),
      probe_wrongly_correct: r.judge.wrongly_correct_probes,
      probe_wrongly_rejected: r.judge.wrongly_rejected_probes,
      probe_skipped: r.judge.probes_skipped,
      probe_blamed_reference: r.judge.probes.filter((p) => p.blamed_reference).length,
      judge_layers: {
        reps: r.judge.layers_reps,
        wrong_probes: r.judge.layers_wrong_probes,
        valid_probes: r.judge.layers_valid_probes
      }
    })),
    rows
  };

  const pct = (a, b) => (b ? `${a}/${b}` : `0/0`);

  Object.assign(report.headline, {
    'Generate success': pct(ok.length, total),
    'Generate success rate': total ? ((ok.length / total) * 100).toFixed(1) + '%' : 'n/a',
    'Gate reject（两轮全拒）': pct(failed.length, total),
    'Would fallback': pct(failed.length, total),
    'Wrong approved': pct(wrongApproved.length, ok.length),
    'Structurally bad': pct(structurallyBad.length, ok.length),
    'Answer-solution mismatch': pct(
      checks.filter((r) => r.check.solution_mismatch).length,
      ok.length
    ),
    'Answer fails verification': pct(
      checks.filter((r) => r.check.answer_fails_verification).length,
      ok.length
    ),
    'Verification snapshot intact': pct(
      checks.filter((r) => r.check.snapshot_intact).length,
      ok.length
    ),
    'Server engine (verification.version)': (() => {
      const seen = [...new Set(ok.map((r) => r.verification_version).filter(Boolean))];
      return seen.length ? seen.join(', ') : 'n/a';
    })(),
    'Local engine (math-quality)': ENGINE_VERSION,
    '焦点格(导数/积分 L8+12) 通过': pct(focusOk.length, ok.filter((r) => r.focus).length + failed.filter((r) => r.focus).length),
    '焦点格 wrong approved': pct(focusWrong.length, focusOk.length),
    'Judge 重复次数合计': totalVerdicts,
    'Judge 重复一致': pct(judgeRows.filter((r) => r.judge.repeat_consistent).length, judgeRows.length),
    'judge 全部 equivalent': pct(judgeRows.filter((r) => r.judge.all_equivalent).length, judgeRows.length),
    'judge 说参考答案可疑': judgeRows.reduce((a, r) => a + r.judge.canonical_suspected_count, 0),
    'judge 改写标准答案': judgeRows.filter((r) => r.judge.rewrite_fields_leaked.length).length ? '有' : '无',
    'canonical 保持不变': pct(judgeRows.filter((r) => r.judge.canonical_unchanged).length, judgeRows.length),
    'judge 响应带 versions': pct(judgeRows.filter((r) => r.judge.versions_present).length, judgeRows.length),
    '错答探针总数（不含跳过）': judgeRows.reduce((a, r) => a + r.judge.wrong_probes, 0),
    '错答探针被误批为对（须为0）': judgeRows.reduce((a, r) => a + r.judge.wrongly_correct_probes, 0),
    '合法探针总数（不含跳过）': judgeRows.reduce((a, r) => a + r.judge.valid_probes, 0),
    '合法探针被误拒（越少越好）': judgeRows.reduce((a, r) => a + r.judge.wrongly_rejected_probes, 0),
    '探针跳过（不适用）': judgeRows.reduce((a, r) => a + r.judge.probes_skipped, 0),
    '判题把错答说成「答案可疑」': judgeRows.reduce(
      (a, r) => a + r.judge.probes.filter((p) => p.blamed_reference).length,
      0
    ),
    ...(() => {
      /* 判定层分布：Task #4 的核心收益就在这几个数上。
         deterministic 越高、model 越低，说明被漏给模型的口子收得越紧。 */
      const sum = (pick) =>
        judgeRows.reduce(
          (acc, r) => {
            const s = pick(r);
            return {
              scalar: acc.scalar + s.scalar,
              structural: acc.structural + s.structural,
              model: acc.model + s.model,
              unknown: acc.unknown + s.unknown
            };
          },
          { scalar: 0, structural: 0, model: 0, unknown: 0 }
        );

      const wrong = sum((r) => r.judge.layers_wrong_probes);
      const valid = sum((r) => r.judge.layers_valid_probes);
      const wrongTotal = wrong.scalar + wrong.structural + wrong.model + wrong.unknown;
      const validTotal = valid.scalar + valid.structural + valid.model + valid.unknown;
      const pctOf = (n, d) => (d ? ((n / d) * 100).toFixed(1) + '%' : 'n/a');

      return {
        '错答探针·标量层判定': `${wrong.scalar}/${wrongTotal}`,
        '错答探针·结构层判定': `${wrong.structural}/${wrongTotal}`,
        '错答探针·确定性覆盖率': pctOf(wrong.scalar + wrong.structural, wrongTotal),
        '错答探针·仍落到模型': `${wrong.model}/${wrongTotal}`,
        '合法探针·确定性覆盖率': pctOf(valid.scalar + valid.structural, validTotal),
        '合法探针·仍落到模型': `${valid.model}/${validTotal}`,
        '合法探针·判定层不可识别（旧版后端）': `${valid.unknown}/${validTotal}`
      };
    })(),
    'Generate latency avg': fmt(mean(genLatencyOk)),
    'Generate latency P95': fmt(percentile(genLatencyOk, 95)),
    'Generate latency max': fmt(Math.max(...genLatencyOk.filter(Number.isFinite), 0)) ,
    'Judge latency avg': fmt(mean(judgeLatency)),
    'Judge latency P95': fmt(percentile(judgeLatency, 95))
  });

  // 按格子统计
  for (const r of rows) {
    const key = `${r.module} L${r.requested_difficulty}`;
    const cell = (report.by_cell[key] ||= { total: 0, approved: 0, wrong_approved: 0, issues: {} });
    cell.total += 1;
    if (r.generate_ok) cell.approved += 1;
    if (r.check?.wrong_approved) cell.wrong_approved += 1;
    for (const code of r.check?.issues || []) {
      cell.issues[code] = (cell.issues[code] || 0) + 1;
    }
  }

  return report;
}

function fmt(ms) {
  if (!Number.isFinite(ms) || ms === 0) return 'n/a';
  return (ms / 1000).toFixed(1) + 's';
}

function brief(r) {
  return {
    id: r.id,
    module: r.module,
    requested_difficulty: r.requested_difficulty,
    question_id: r.question_id,
    expression: r.expression,
    answer: r.answer,
    issues: r.check?.issues || [],
    answer_verifies: r.check?.answer_verifies || null,
    claimed_in_solution: r.check?.claimed_in_solution || []
  };
}

/* ---------------- Markdown ---------------- */

function renderMarkdown(report) {
  const L = [];
  const p = (s = '') => L.push(s);

  p(`# 50 题 reliability smoke test — ${report.meta.label}`);
  p();
  p(`- 目标：\`${report.meta.url}\``);
  p(`- 时间：${report.meta.generated_at}`);
  p(`- 引擎版本：\`${report.meta.engine}\``);
  p(`- 并发：${report.meta.concurrency}（并发会影响 P95，读数时注意）`);
  p();
  p('## 服务端自报版本');
  p();
  p('```json');
  p(JSON.stringify(report.meta.health, null, 2));
  p('```');
  p();
  p('响应里的版本集合：');
  p();
  p('```json');
  p(JSON.stringify(report.versions_observed, null, 2));
  p('```');
  p();
  p('## 关键指标');
  p();
  p('| 指标 | 值 |');
  p('| --- | --- |');
  for (const [k, v] of Object.entries(report.headline)) p(`| ${k} | ${v} |`);
  p();

  if (Object.keys(report.gate_rejection_reasons).length) {
    p('## 闸门拒稿原因分布');
    p();
    p('| 原因 | 次数 |');
    p('| --- | --- |');
    for (const [k, v] of Object.entries(report.gate_rejection_reasons)) p(`| ${k} | ${v} |`);
    p();
  }

  p('## 按模块 × 难度');
  p();
  p('| 格子 | 通过/总数 | wrong approved | 引擎 issue |');
  p('| --- | --- | --- | --- |');
  for (const key of Object.keys(report.by_cell).sort()) {
    const c = report.by_cell[key];
    const issues = Object.entries(c.issues).map(([k, v]) => `${k}×${v}`).join(', ') || '—';
    p(`| ${key} | ${c.approved}/${c.total} | ${c.wrong_approved} | ${issues} |`);
  }
  p();

  if (report.wrong_approved_questions.length) {
    p('## 错误批准（必须归零）');
    p();
    for (const w of report.wrong_approved_questions) {
      p(`- \`${w.id}\` ${w.module} L${w.requested_difficulty}`);
      p(`  - 题：${w.expression}`);
      p(`  - 标准答案：${w.answer}`);
      p(`  - 引擎 issue：${w.issues.join(', ')}`);
      p(`  - 答案回代验证：${w.answer_verifies}`);
      if (w.claimed_in_solution?.length) p(`  - 解析里声称的答案：${w.claimed_in_solution.join(' | ')}`);
    }
    p();
  }

  if (report.structurally_bad_questions.length) {
    p('## 结构异常');
    p();
    for (const w of report.structurally_bad_questions) {
      p(`- \`${w.id}\` ${w.module} L${w.requested_difficulty}：${w.issues.join(', ')}`);
    }
    p();
  }

  p('## 判题重复一致性');
  p();
  p('| 题 | 模块 | 难度 | N 次 verdict | 一致 | 全 equivalent | method | 说答案可疑 | 错答探针（key:verdict:层） | 误批为对 |');
  p('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const j of report.judge_detail) {
    const probes = j.probes
      .filter((x) => x.kind !== 'valid')
      .map((x) =>
        x.skipped
          ? `${x.key}:skip`
          : `${x.key}:${x.verdict}:${x.judge_layer || x.method || '?'}${x.correct === true ? ' ←correct!' : ''}`
      )
      .join('<br>');
    p(
      `| ${j.id} | ${j.module} | L${j.difficulty} | ${j.verdicts.join('/')} | ${j.consistent ? '是' : '否'} | ` +
        `${j.all_equivalent ? '是' : '否'} | ${j.methods.join(',')} | ${j.canonical_suspected} | ${probes} | ` +
        `${j.probe_wrongly_correct ? '⚠️ ' + j.probe_wrongly_correct : '0'} |`
    );
  }
  p();

  const badProbes = [];
  const rejectedValid = [];
  for (const j of report.judge_detail) {
    for (const x of j.probes) {
      if (x.wrongly_correct) badProbes.push({ id: j.id, ...x });
      if (x.wrongly_rejected) rejectedValid.push({ id: j.id, ...x });
    }
  }
  if (badProbes.length) {
    p('## 判题误批错答（零容忍）');
    p();
    p('学生答案明显是错的，判题却给了 `correct: true`。');
    p();
    for (const b of badProbes) {
      p(`- \`${b.id}\` 探针 \`${b.key}\`（${b.label}）：verdict=${b.verdict}`);
      p(`  - 提交的「答案」：${b.answer}`);
    }
    p();
  }

  if (rejectedValid.length) {
    p('## 合法写法被误拒（不是污染，但会浪费用户一次作答）');
    p();
    for (const b of rejectedValid) {
      p(`- \`${b.id}\` 探针 \`${b.key}\`（${b.label}）：verdict=${b.verdict} reason=${b.reason}`);
      p(`  - 提交的「答案」：${b.answer}`);
    }
    p();
  }

  /* Task #4 的验收必须证明「跑的是新判题」。旧后端没有 judge_layer 字段，
     所以这里显式报出来 —— 免得又出现「以为部署了、其实没部署」的数字。 */
  const layersSeen = new Set(
    report.judge_detail.flatMap((j) => j.probes.filter((x) => !x.skipped).map((x) => x.judge_layer)).filter(Boolean)
  );

  p('## 部署指纹');
  p();
  p(
    layersSeen.size
      ? `- 判题响应带 \`judge_layer\`：${[...layersSeen].sort().join(', ')} → 线上是 Task #4 之后的判题。`
      : '- ⚠️ 判题响应里**没有** `judge_layer` 字段 → 线上判题还是 Task #4 之前的版本，' +
        '下面的「确定性覆盖率」数字与这次改动无关，不能当作验收依据。'
  );
  p();

  p('## 复核方法与它的局限');
  p();
  p('- 独立复核用的是项目自己的确定性引擎 `math-quality.js`。它和服务端跑的是同一份代码，');
  p('  所以它证明的是「服务端的闸门有没有真的执行、返回的题目有没有被改过」，');
  p('  **不等于**换一个数学系学生重算一遍。');
  p('- 其中 `ANSWER_FAILS_VERIFICATION`（把 standard answer 代回题目做数值验证）和');
  p('  `SOLUTION_MISMATCH`（解析里声称的最终答案与 answer 对撞）是抓「算错却放行」的主力。');
  p('  - 覆盖不到的一类：解析里裸写的**符号**答案，例如「最终答案为 3x」。');
  p('    抽取正则只认纯数字或 `\\(...\\)` 包裹的式子，而且 `compare(3x, 2x)` 本身就返回 `uncertain`。');
  p('    这条边界在 `tests/smoke-matrix.cjs` 里有测试钉着。');
  p('- 要更强的独立性，需要再接一个外部解答模型做第二意见 —— 当前脚本没有接。');
  p();

  return L.join('\n');
}

/* 只有被直接执行时才跑；被 import 时（测试用）只导出纯函数，不碰网络和磁盘。 */
const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((error) => {
    console.error('smoke test 崩了:', error);
    process.exit(1);
  });
}
