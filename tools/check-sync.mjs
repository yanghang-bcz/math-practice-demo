#!/usr/bin/env node

/* =========================================================
   部署副本同步检查
   =========================================================

   这个项目同时存在两份后端：

     api/deepseek.js            Vercel serverless handler
     cloudbase/deepseek/index.js  腾讯云 CloudBase 常驻服务（实际生效的那份）

   两份共享同一套业务逻辑，各自只有传输层不同。历史事故的成因就是
   「只改了 api/ 那份」，本地测试全绿，线上（跑的是 cloudbase 那份）毫无变化。

   所以业务逻辑段的起点固定为一个哨兵行 `const PIPELINE = {`，
   从这个哨兵到文件末尾必须逐字节一致。哨兵之前是传输层，允许不同。

   引擎 math-quality.js 是被两份 require 的同一个文件内容，也必须一致。

   用法：npm run check:sync
   ========================================================= */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SENTINEL = 'const PIPELINE = {';

const BACKENDS = ['api/deepseek.js', 'cloudbase/deepseek/index.js'];
const ENGINES = ['math-quality.js', 'cloudbase/deepseek/math-quality.js'];

const read = file => readFileSync(path.join(root, file), 'utf8');

const failures = [];

/* ---------- 业务逻辑段 ---------- */

function businessLogic(file) {
  const source = read(file);
  const start = source.indexOf(SENTINEL);

  if (start < 0) {
    failures.push(`${file}：找不到业务逻辑哨兵行 "${SENTINEL}"，无法比对`);
    return null;
  }

  return source.slice(start);
}

const [a, b] = BACKENDS.map(businessLogic);

if (a !== null && b !== null && a !== b) {
  const left = a.split('\n');
  const right = b.split('\n');
  const limit = Math.max(left.length, right.length);
  const drifted = [];

  for (let i = 0; i < limit && drifted.length < 10; i++) {
    if (left[i] !== right[i]) {
      drifted.push(`  第 ${i + 1} 行（相对哨兵行）\n    - ${BACKENDS[0]}: ${left[i] ?? '<无>'}\n    + ${BACKENDS[1]}: ${right[i] ?? '<无>'}`);
    }
  }

  failures.push(
    `${BACKENDS[0]} 与 ${BACKENDS[1]} 的业务逻辑已经分叉（线上生效的是后者）：\n` +
      drifted.join('\n')
  );
}

/* ---------- 引擎副本 ---------- */

const [engineA, engineB] = ENGINES.map(read);

if (engineA !== engineB) {
  failures.push(
    `${ENGINES[0]} 与 ${ENGINES[1]} 不一致。执行 npm run sync:engine 修复。`
  );
}

/* ---------- 结论 ---------- */

if (failures.length) {
  console.error('✗ 部署副本不同步\n');
  for (const item of failures) console.error(item + '\n');
  process.exitCode = 1;
} else {
  const lines = businessLogic(BACKENDS[0]).split('\n').length;
  console.log(`✓ 业务逻辑段逐字节一致（${lines} 行，自 "${SENTINEL}" 起）`);
  console.log(`✓ 引擎副本逐字节一致`);
}
