#!/usr/bin/env node
/* AI 连接稳定性探针
 *
 * 存在的理由：用户报「AI 连接很不稳定，一直出备用题，也判不了答案的其他形式」。
 * 要把四种成因的占比分开，必须把**同一套请求**分别从两条路径打出去量：
 *
 *   ① 本机系统代理拖超时（浏览器走 127.0.0.1:7897，curl / Node fetch 不走）
 *   ② 云函数冷启动
 *   ③ 后端 / 上游 DeepSeek 真的抖
 *   ④ 客户端不重试（健康检查超时后无重试；出题超时不重试）
 *
 * 传输层统一用 curl，不用 Node 的 fetch —— 因为 fetch 不读 macOS 的系统代理，
 * 那样 direct / proxy 两条路径就没法用同一套代码量。curl 只是多一个 `-x`。
 *
 * 用法：
 *   node tools/net-stability.mjs --mode health     --n 40
 *   node tools/net-stability.mjs --mode generate   --n 12
 *   node tools/net-stability.mjs --mode judge      --n 12
 *   node tools/net-stability.mjs --mode equiv      --cases 16
 *   node tools/net-stability.mjs --mode session    --n 10
 *   node tools/net-stability.mjs --mode health --n 40 --via proxy
 *
 * --via direct（默认）加 --noproxy '*'，模拟普通用户网络；proxy 走系统代理，
 * 对齐本机浏览器实际路径。两条路径的数字**必须一起看**，否则会把
 * 「我这台机器的代理」误判成「产品不行」。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { buildMatrix } from './smoke/matrix.mjs';

const require = createRequire(import.meta.url);
const Bank = require('../fallback-bank');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const DEFAULT_URL =
  'https://calcdaily-d5g2titwue91551fb-1482769901.ap-shanghai.app.tcloudbase.com/api/deepseek';
const PROXY = 'http://127.0.0.1:7897';

/* ---------------- 等价形式用例 ----------------
 *
 * 直击「无法判断答案的其他形式」：每一条都是数学上与原答案**完全相同**、
 * 只是写法不同的形式。每一条都配一个对照 —— 把**原答案本身**也提交一次。
 * 对照不通过（没给出 equivalent）说明这条用例无效，不能拿它的结果说事。
 * 这是必须的：区分不了正解与改写形式的检查，等于没检查。
 */
const EQUIV_CASES = [
  { bankId: 'fb-limit-03', alt: '0.5', note: '分数写成小数' },
  { bankId: 'fb-limit-10', alt: '\\ln(2)', note: '对数补括号' },
  { bankId: 'fb-limit-08', alt: 'e^{2}', note: '指数补括号' },
  { bankId: 'fb-limit-20', alt: '-\\frac{1}{2}', note: '负号挪到分数前' },
  { bankId: 'fb-deriv-02', alt: '\\frac{2x}{x^2+1}', note: '分母交换次序' },
  { bankId: 'fb-deriv-04', alt: '\\frac{1}{x^2+1}', note: '分母交换次序' },
  { bankId: 'fb-deriv-09', alt: '1+\\ln x', note: '加法交换' },
  { bankId: 'fb-deriv-12', alt: '2e^{x^2}x', note: '因子交换次序' },
  { bankId: 'fb-deriv-15', alt: '\\cos^2 x-\\sin^2 x', note: '倍角公式展开' },
  { bankId: 'fb-deriv-20', alt: '2e^x\\cos x', note: '去掉多余括号' },
  { bankId: 'fb-int-01', alt: 'x^2+x^3+C', note: '项交换次序' },
  { bankId: 'fb-int-05', alt: 'C+\\arctan x', note: '常数项前置' },
  { bankId: 'fb-int-09', alt: '\\frac{1}{2}\\ln(1+x^2)+C', note: '系数写法不同' },
  { bankId: 'fb-int-12', alt: 'x(\\ln x-1)+C', note: '提取公因子' },
  { bankId: 'fb-int-15', alt: 'e^x x-e^x+C', note: '展开乘积' },
  { bankId: 'fb-int-13', alt: '\\frac{2x+\\sin(2x)}{4}+C', note: '通分合并' }
];

/* ---------------- 参数 ---------------- */

function parseArgs(argv) {
  const args = {
    url: DEFAULT_URL,
    mode: 'health',
    n: 20,
    via: 'direct',
    concurrency: 1,
    timeoutS: 120,
    connectTimeoutS: 10,
    out: null,
    label: null,
    warmup: 0,
    modules: null,
    looseTopic: false
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--url') args.url = next();
    else if (a === '--mode') args.mode = next();
    else if (a === '--n' || a === '--cases') args.n = Number(next()) || 0;
    else if (a === '--via') args.via = next();
    else if (a === '--concurrency') args.concurrency = Math.max(1, Number(next()) || 1);
    else if (a === '--timeout') args.timeoutS = Number(next()) || 120;
    else if (a === '--connect-timeout') args.connectTimeoutS = Number(next()) || 10;
    else if (a === '--out') args.out = next();
    else if (a === '--label') args.label = next();
    else if (a === '--warmup') args.warmup = Number(next()) || 0;
    else if (a === '--modules') args.modules = String(next()).split(',').map((s) => s.trim()).filter(Boolean);
    /* 真实产品里 topic 大多来自「薄弱考点」，没有历史时是 null（模型自选）。
       而评测矩阵是**钉死考点**的 —— 两者结果可能完全不同，必须能分开测。 */
    else if (a === '--loose-topic') args.looseTopic = true;
    else if (a === '--help' || a === '-h') {
      console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]);
      process.exit(0);
    }
  }
  if (!['health', 'generate', 'judge', 'equiv', 'session'].includes(args.mode)) {
    console.error('未知 --mode：' + args.mode);
    process.exit(2);
  }
  if (args.via !== 'direct' && args.via !== 'proxy') {
    console.error('--via 只能是 direct 或 proxy');
    process.exit(2);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

/* ---------------- 传输层：curl ---------------- */

function curlOnce({ method = 'GET', url, payload = null, via, timeoutS }) {
  return new Promise((resolve) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'netstab-'));
    const bodyPath = path.join(dir, 'body');
    const hdrPath = path.join(dir, 'hdr');

    const argv = [
      '-s', '-S',
      /* 必须显式给连接超时：实测代理路径上出现过 5 次
         「Connection timed out after 600000~1040000 milliseconds」——
         光有 --max-time 没兜住，一次请求能挂十几分钟，
         还会顺带把本机解析器拖挂（后续请求全变成 Could not resolve host）。 */
      '--connect-timeout', String(args.connectTimeoutS),
      '-o', bodyPath,
      '-D', hdrPath,
      '-w', '%{json}',
      '--max-time', String(timeoutS)
    ];

    if (via === 'proxy') argv.push('-x', PROXY);
    else argv.push('--noproxy', '*');

    if (method === 'POST') {
      const payloadPath = path.join(dir, 'payload.json');
      fs.writeFileSync(payloadPath, JSON.stringify(payload));
      argv.push(
        '-X', 'POST',
        '-H', 'Content-Type: application/json',
        '--data-binary', '@' + payloadPath
      );
    }

    argv.push(url);

    const started = Date.now();
    const child = spawn('curl', argv);

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (b) => { stdout += b; });
    child.stderr.on('data', (b) => { stderr += b; });

    child.on('close', (exitcode) => {
      const wallMs = Date.now() - started;

      let meta = {};
      try { meta = JSON.parse(stdout || '{}'); } catch { /* 保留空对象 */ }

      const rawBody = fs.existsSync(bodyPath) ? fs.readFileSync(bodyPath, 'utf8') : '';
      let data = null;
      try { data = JSON.parse(rawBody); } catch { data = null; }

      const headerText = fs.existsSync(hdrPath) ? fs.readFileSync(hdrPath, 'utf8') : '';
      const header = (name) => {
        const re = new RegExp('^' + name + ':\\s*(.+)$', 'im');
        const m = headerText.match(re);
        return m ? m[1].trim() : null;
      };

      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* 忽略 */ }

      resolve({
        exitcode,
        errormsg: meta.errormsg || (stderr.trim() || null),
        // curl 的 time_total 是网络层总耗时；wallMs 还含进程启动开销（几毫秒）
        net_ms: meta.time_total != null ? Math.round(meta.time_total * 1000) : null,
        wall_ms: wallMs,
        ttfb_ms: meta.time_starttransfer != null ? Math.round(meta.time_starttransfer * 1000) : null,
        connect_ms: meta.time_connect != null ? Math.round(meta.time_connect * 1000) : null,
        tls_ms: meta.time_appconnect != null ? Math.round(meta.time_appconnect * 1000) : null,
        remote_ip: meta.remote_ip || null,
        num_connects: meta.num_connects ?? null,
        // 后端自报的网关内耗时 —— 把它和 total 一比，就能把
        // 「网络慢」和「模型慢」分开
        upstream_ms: header('x-cloudbase-upstream-timecost'),
        http: meta.http_code || 0,
        body_kb: meta.size_download != null ? +(meta.size_download / 1024).toFixed(1) : null,
        data,
        raw_head: rawBody.slice(0, 200)
      });
    });
  });
}

/* ---------------- 请求包装 ---------------- */

const healthUrl = () => args.url + (args.url.includes('?') ? '&' : '?') + 'health=1';

async function callHealth() {
  return curlOnce({ method: 'GET', url: healthUrl(), via: args.via, timeoutS: args.timeoutS });
}

async function callApi(payload) {
  return curlOnce({ method: 'POST', url: args.url, payload, via: args.via, timeoutS: args.timeoutS });
}

/* ---------------- 并发池 ---------------- */

async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length || 1) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      try { results[i] = await worker(items[i], i); }
      catch (e) { results[i] = { __workerError: String(e && e.stack || e) }; }
    }
  });
  await Promise.all(runners);
  return results;
}

/* ---------------- 统计 ---------------- */

function pct(values, p) {
  const arr = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!arr.length) return null;
  if (arr.length === 1) return arr[0];
  const idx = (p / 100) * (arr.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return arr[lo];
  return Math.round(arr[lo] + (arr[hi] - arr[lo]) * (idx - lo));
}

function dist(values) {
  const v = values.filter(Number.isFinite);
  if (!v.length) return null;
  return {
    n: v.length,
    min: Math.min(...v),
    p50: pct(v, 50),
    p90: pct(v, 90),
    p95: pct(v, 95),
    max: Math.max(...v),
    mean: Math.round(v.reduce((a, b) => a + b, 0) / v.length)
  };
}

function fmtDist(d) {
  if (!d) return '（无样本）';
  return `min ${d.min} / p50 ${d.p50} / p90 ${d.p90} / p95 ${d.p95} / max ${d.max} / mean ${d.mean}  ms`;
}

/* ---------------- 各模式 ---------------- */

/* 传输层失败的统一判据。返回 null 表示「请求真的出去了」。
   分清这一层很重要：DNS/连接失败与「后端返回了 error」是两类完全不同的
   事故，前者要查本机网络/代理，后者才轮到查产品。 */
function transportFailure(r) {
  if (r.exitcode !== 0 || !r.http) {
    return r.errormsg || ('curl exit ' + r.exitcode);
  }
  return null;
}

function classifyHealth(r) {
  if (r.exitcode !== 0 || !r.http) {
    return { ok: false, outcome: 'network_error', reason: r.errormsg || 'curl exit ' + r.exitcode };
  }
  if (r.http !== 200) return { ok: false, outcome: 'http_' + r.http, reason: 'HTTP ' + r.http };
  if (!r.data || r.data.ok === false) return { ok: false, outcome: 'bad_payload', reason: r.raw_head };
  return { ok: true, outcome: 'ok', reason: null };
}

async function runHealth() {
  const rows = [];
  for (let i = 0; i < args.n; i++) {
    const r = await callHealth();
    const cls = classifyHealth(r);
    rows.push({
      seq: i + 1, ...cls,
      http: r.http, net_ms: r.net_ms, wall_ms: r.wall_ms, ttfb_ms: r.ttfb_ms,
      upstream_ms: r.upstream_ms, ip: r.remote_ip,
      gate_policy: r.data && r.data.gate_policy ? r.data.gate_policy : null,
      math_engine_version: r.data && r.data.math_engine_version ? r.data.math_engine_version : null
    });
    process.stdout.write(`\r   health ${i + 1}/${args.n}   `);
  }
  process.stdout.write('\n');
  return { rows };
}

async function runGenerate() {
  let matrix = buildMatrix([]);
  if (args.modules) matrix = matrix.filter((c) => args.modules.includes(c.module));
  const rows = [];
  const jobs = Array.from({ length: args.n }, (_, i) => matrix[i % matrix.length]);

  const results = await pool(jobs, args.concurrency, async (cell, i) => {
    const r = await callApi({
      action: 'generate',
      count: 1,
      plans: [{
        module: cell.module,
        topic: args.looseTopic ? null : cell.topic,
        targetDifficulty: cell.difficulty,
        zone: cell.zone
      }],
      avoidPrompts: []
    });

    const q = r.http === 200 && r.data ? (r.data.questions && r.data.questions[0] || null) : null;

    let outcome = 'ok';
    let reason = null;
    if (r.exitcode !== 0 || !r.http) { outcome = 'network_error'; reason = r.errormsg || 'curl exit ' + r.exitcode; }
    else if (r.http !== 200) { outcome = 'http_' + r.http; reason = (r.data && r.data.error) || 'HTTP ' + r.http; }
    else if (!q) {
      outcome = 'no_question';
      reason = (r.data && (r.data.error || (r.data.rejection_reasons || []).join('|'))) || 'unknown';
    }

    return {
      seq: i + 1, cell: cell.id, module: cell.module, difficulty: cell.difficulty,
      requested_topic: args.looseTopic ? null : cell.topic,
      ok: Boolean(q), outcome, reason,
      http: r.http, net_ms: r.net_ms, wall_ms: r.wall_ms, ttfb_ms: r.ttfb_ms, upstream_ms: r.upstream_ms,
      attempts: r.data ? (r.data.attempts ?? null) : null,
      rejection_reasons: r.data ? (r.data.rejection_reasons || []) : [],
      gate_policy: r.data ? (r.data.gate_policy || null) : null,
      question_tier: q && q.verification ? (q.verification.tier ?? null) : null,
      question_state: q && q.verification ? (q.verification.state ?? null) : null,
      question_id: q ? (q.question_id || q.id || null) : null,
      question_topic: q ? (q.topic ?? null) : null,
      question_expression: q ? (q.expression || q.prompt || null) : null,
      /* 被拒时把模型产出的题面也带出来：只看原因码分不清
         「引擎验不了这个形态」和「这题本身出坏了」。 */
      rejected_expression: !q && r.data && r.data.expression ? r.data.expression : null
    };
  });

  results.forEach((r, i) => { rows.push(r); process.stdout.write(`\r   generate ${i + 1}/${args.n}   `); });
  process.stdout.write('\n');
  return { rows };
}

/* 判题：题库题打上 source:'fallback' 后不闸门，与客户端一致 */
function asFallback(item) {
  return { ...item, source: 'fallback', bankId: item.id, question_id: item.id };
}

function classifyJudge(r) {
  if (r.exitcode !== 0 || !r.http) {
    return { ok: false, outcome: 'network_error', reason: r.errormsg || 'curl exit ' + r.exitcode };
  }
  if (r.http !== 200) return { ok: false, outcome: 'http_' + r.http, reason: 'HTTP ' + r.http };
  const d = r.data || {};
  if (d.trusted === true) return { ok: true, outcome: 'trusted', reason: null, verdict: d.verdict, method: d.method, layer: d.judge_layer };
  return {
    ok: false,
    outcome: 'untrusted:' + (d.reason || 'unknown'),
    reason: d.reason || 'unknown',
    verdict: d.verdict ?? null,
    failure: d.failure ?? null
  };
}

async function runJudge() {
  const pool_ = Bank.byModule('derivative').concat(Bank.byModule('integral'));
  const rows = [];

  for (let i = 0; i < args.n; i++) {
    const q = asFallback(pool_[i % pool_.length]);
    const r = await callApi({ action: 'judge', question: q, userAnswer: q.answer });
    const cls = classifyJudge(r);
    rows.push({
      seq: i + 1, bankId: q.id, ...cls,
      http: r.http, net_ms: r.net_ms, wall_ms: r.wall_ms, ttfb_ms: r.ttfb_ms, upstream_ms: r.upstream_ms
    });
    process.stdout.write(`\r   judge ${i + 1}/${args.n}   `);
  }
  process.stdout.write('\n');
  return { rows };
}

async function runEquiv() {
  const cases = EQUIV_CASES.slice(0, args.n || EQUIV_CASES.length);
  const rows = [];

  for (const [i, c] of cases.entries()) {
    const item = Bank.byId(c.bankId);
    if (!item) {
      rows.push({ seq: i + 1, bankId: c.bankId, note: c.note, invalid: 'bank 里没有这个 id' });
      continue;
    }
    const q = asFallback(item);

    // 对照：原答案本身（必须 equivalent，否则这条用例无效）
    const ctrl = await callApi({ action: 'judge', question: q, userAnswer: q.answer });
    const ctrlCls = classifyJudge(ctrl);

    // 目标：等价的其他形式
    const alt = await callApi({ action: 'judge', question: q, userAnswer: c.alt });
    const altCls = classifyJudge(alt);

    /* 传输层挂了 → 这条用例整个无效，不能算进覆盖率：
       「连不上」和「引擎判不了这个形式」必须分开，否则覆盖率会被网络问题压低。 */
    const tf = transportFailure(ctrl) || transportFailure(alt);

    rows.push({
      seq: i + 1,
      bankId: item.id,
      note: c.note,
      answer: item.answer,
      alt: c.alt,
      invalid: tf || null,
      control_verdict: ctrlCls.verdict ?? null,
      control_method: ctrlCls.method ?? null,
      control_ok: ctrlCls.ok && ctrlCls.verdict === 'equivalent',
      alt_verdict: altCls.verdict ?? null,
      alt_method: altCls.method ?? null,
      alt_reason: altCls.reason ?? null,
      alt_ok: altCls.ok && altCls.verdict === 'equivalent',
      alt_net_ms: alt.net_ms,
      alt_upstream_ms: alt.upstream_ms
    });
    process.stdout.write(`\r   equiv ${i + 1}/${cases.length}   `);
  }
  process.stdout.write('\n');
  return { rows };
}

async function runSession() {
  const matrix = buildMatrix([]);
  const rows = [];

  for (let i = 0; i < args.n; i++) {
    const cell = matrix[i % matrix.length];
    const t0 = Date.now();

    const gen = await callApi({
      action: 'generate',
      count: 1,
      plans: [{ module: cell.module, topic: cell.topic, targetDifficulty: cell.difficulty, zone: cell.zone }],
      avoidPrompts: []
    });

    const q = gen.http === 200 && gen.data ? (gen.data.questions && gen.data.questions[0] || null) : null;
    const tGen = Date.now() - t0;

    const genTf = transportFailure(gen);
    let genOutcome = 'ok';
    if (genTf) genOutcome = 'network_error';
    else if (gen.http !== 200) genOutcome = 'http_' + gen.http;
    else if (!q) genOutcome = 'no_question';

    // 出题失败 → 用户在真实产品里拿到的是备用题；这里模拟同一条路
    const used = q || asFallback(Bank.pick(cell.module, null, cell.difficulty) || Bank.BANK[0]);
    const fromFallback = !q;

    const t1 = Date.now();
    const jr = await callApi({ action: 'judge', question: used, userAnswer: used.answer });
    const tJudge = Date.now() - t1;
    const judgeTf = transportFailure(jr);

    rows.push({
      seq: i + 1,
      cell: cell.id,
      gen_outcome: genOutcome,
      gen_ok: Boolean(q),
      gen_reason: genTf || (gen.data && gen.data.error) ||
        (gen.data && (gen.data.rejection_reasons || []).join('|')) || null,
      gen_net_ms: gen.net_ms,
      gen_upstream_ms: gen.upstream_ms,
      gen_e2e_ms: tGen,
      question_source: fromFallback ? 'fallback' : 'ai',
      judge_ok: jr.data ? jr.data.trusted === true : false,
      judge_verdict: jr.data ? (jr.data.verdict ?? null) : null,
      judge_method: jr.data ? (jr.data.method ?? null) : null,
      judge_reason: judgeTf || (jr.data ? (jr.data.reason ?? null) : null),
      judge_net_ms: jr.net_ms,
      judge_upstream_ms: jr.upstream_ms,
      judge_e2e_ms: tJudge,
      total_e2e_ms: Date.now() - t0
    });
    process.stdout.write(`\r   session ${i + 1}/${args.n}   `);
  }
  process.stdout.write('\n');
  return { rows };
}

/* ---------------- 汇总输出 ---------------- */

function tally(rows, key = 'outcome') {
  const m = new Map();
  rows.forEach((r) => {
    const k = r[key] || 'unknown';
    m.set(k, (m.get(k) || 0) + 1);
  });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function report(mode, rows) {
  const q = (s) => `  ${s}`;
  const line = '─'.repeat(64);

  console.log('\n' + line);
  console.log(` 模式 ${mode}  ·  路径 ${args.via}  ·  样本 ${rows.length}  ·  ${new Date().toISOString()}`);
  console.log(line);

  if (mode === 'equiv') {
    const invalid = rows.filter((r) => r.invalid);
    const valid = rows.filter((r) => !r.invalid);
    const ctrlFail = valid.filter((r) => !r.control_ok);

    console.log(q(`用例总数          ${rows.length}`));
    if (invalid.length) {
      console.log(q(`因网络失败作废     ${invalid.length}   ← 必须重跑，否则覆盖率被网络压低`));
      invalid.forEach((r) => console.log(`     · ${r.bankId}  ${r.invalid}`));
    }
    console.log(q(`对照（原答案）通过 ${valid.length - ctrlFail.length}/${valid.length}` +
      (ctrlFail.length ? `   ⚠️ ${ctrlFail.length} 条对照失败 → 这些用例不能采信` : '')));
    console.log(q(`等价改写被认对     ${valid.filter((r) => r.alt_ok).length}/${valid.length}`));
    console.log(q(`等价改写判不了     ${valid.filter((r) => !r.alt_ok && r.alt_verdict === 'uncertain').length}/${valid.length}`));

    const byVerdict = tally(valid, 'alt_verdict');
    console.log(q('改写形式的判词分布 ' + byVerdict.map(([k, v]) => `${k}=${v}`).join('  ')));
    console.log(q('改写形式的判定层次 ' + tally(valid, 'alt_method').map(([k, v]) => `${k}=${v}`).join('  ')));

    console.log('\n 逐条：');
    valid.forEach((r) => {
      const mark = r.alt_ok ? '✅' : (r.alt_verdict === 'uncertain' ? '⚠️' : '❌');
      console.log(`   ${mark} ${r.bankId.padEnd(12)} ${String(r.answer).padEnd(26)} → ${String(r.alt).padEnd(28)} ` +
        `${String(r.alt_verdict).padEnd(14)} ${r.alt_method || r.alt_reason || ''}   [${r.note}]`);
    });
    return;
  }

  const ok = mode === 'session'
    ? rows.filter((r) => r.gen_ok).length
    : rows.filter((r) => r.ok || r.judge_ok).length;
  console.log(q(`成功率          ${ok}/${rows.length}`));
  console.log(q('结果分布        ' + tally(rows, 'outcome').map(([k, v]) => `${k}=${v}`).join('  ')));

  const lats = rows.map((r) => r.net_ms);
  console.log(q('网络总耗时      ' + fmtDist(dist(lats))));

  const up = rows.map((r) => Number(r.upstream_ms)).filter(Number.isFinite);
  if (up.length) {
    console.log(q('后端自报内耗时  ' + fmtDist(dist(up))));
    const gap = rows
      .filter((r) => Number.isFinite(Number(r.upstream_ms)) && Number.isFinite(r.net_ms))
      .map((r) => r.net_ms - Number(r.upstream_ms));
    if (gap.length) console.log(q('链路净开销      ' + fmtDist(dist(gap)) + '   ← 总耗时减去后端自报'));
  } else {
    console.log(q('后端自报内耗时  （响应头里没有 x-cloudbase-upstream-timecost）'));
  }

  const first = rows[0];
  if (first && Number.isFinite(first.net_ms)) {
    console.log(q(`首请求（冷启动?） ${first.net_ms} ms   http=${first.http}  outcome=${first.outcome}`));
  }

  const reasons = tally(rows.filter((r) => !(r.ok || r.judge_ok || r.gen_ok)), 'reason');
  if (reasons.length) {
    console.log('\n 失败原因：');
    reasons.forEach(([k, v]) => console.log(`   ${v}×  ${k}`));
  }

  if (mode === 'session') {
    console.log('\n 用户视角（出题 → 判题 一条完整链路）：');
    console.log(q('出题结果分布     ' + tally(rows, 'gen_outcome').map(([k, v]) => `${k}=${v}`).join('  ')));
    console.log(q('拿到 AI 题       ' + rows.filter((r) => r.question_source === 'ai').length + '/' + rows.length));
    console.log(q('落到备用题       ' + rows.filter((r) => r.question_source === 'fallback').length + '/' + rows.length));
    console.log(q('判题可用         ' + rows.filter((r) => r.judge_ok).length + '/' + rows.length));
    console.log(q('整链路耗时       ' + fmtDist(dist(rows.map((r) => r.total_e2e_ms)))));

    const genReasons = tally(rows.filter((r) => !r.gen_ok), 'gen_reason');
    if (genReasons.length) {
      console.log('\n 出题失败明细：');
      genReasons.forEach(([k, v]) => console.log(`   ${v}×  ${k}`));
    }
  }
}

/* ---------------- 主流程 ---------------- */

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = args.out
    ? path.resolve(args.out)
    : path.join(ROOT, '.workbuddy', 'net-stability');
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`目标   ${args.url}`);
  console.log(`模式   ${args.mode}   路径 ${args.via}   并发 ${args.concurrency}   超时 ${args.timeoutS}s`);
  if (args.via === 'proxy') console.log(`代理   ${PROXY}（浏览器实际走这条）`);
  else console.log(`代理   关闭（--noproxy '*'，模拟普通用户网络）`);

  for (let i = 0; i < args.warmup; i++) {
    process.stdout.write(`\r   预热 ${i + 1}/${args.warmup}   `);
    await callHealth();
  }
  if (args.warmup) process.stdout.write('\n');

  let result;
  if (args.mode === 'health') result = await runHealth();
  else if (args.mode === 'generate') result = await runGenerate();
  else if (args.mode === 'judge') result = await runJudge();
  else if (args.mode === 'equiv') result = await runEquiv();
  else result = await runSession();

  report(args.mode, result.rows);

  const outPath = path.join(outDir, `${stamp}-${args.mode}-${args.via}.json`);
  fs.writeFileSync(outPath, JSON.stringify({
    url: args.url,
    mode: args.mode,
    via: args.via,
    concurrency: args.concurrency,
    timeout_s: args.timeoutS,
    at: new Date().toISOString(),
    rows: result.rows
  }, null, 2));

  console.log(`\n原始数据 → ${path.relative(ROOT, outPath)}`);
}

main();
