#!/usr/bin/env node

/* =========================================================
   后端业务逻辑段同步
   =========================================================

   api/deepseek.js 与 cloudbase/deepseek/index.js 共享同一段业务逻辑，
   哨兵行是 `const PIPELINE = {`。check:sync 会比对它是否逐字节一致。

   问题在于：要改业务逻辑就得**手抄两遍**，而手抄正是历史上
   「只改了一份、本地全绿、线上毫无变化」那起事故的成因。
   这个脚本把机械劳动接管掉 —— 只改 cloudbase 那一份（线上真正生效的那份），
   然后执行 npm run sync:backend 把业务段原样拼进 api 那一份。

   用法：
     npm run sync:backend
     npm run check:sync      # 校验
   ========================================================= */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SENTINEL = 'const PIPELINE = {';

/* 线上生效的那份是源，另一份是拼接产物 —— 和 npm run sync:engine 同一个方向。 */
const SOURCE = 'cloudbase/deepseek/index.js';
const TARGET = 'api/deepseek.js';

const read = file => readFileSync(path.join(root, file), 'utf8');

const source = read(SOURCE);
const target = read(TARGET);

const sourceAt = source.indexOf(SENTINEL);
const targetAt = target.indexOf(SENTINEL);

if (sourceAt < 0) {
  console.error(`✗ ${SOURCE} 里找不到哨兵行 "${SENTINEL}"`);
  process.exit(1);
}

if (targetAt < 0) {
  console.error(`✗ ${TARGET} 里找不到哨兵行 "${SENTINEL}"`);
  process.exit(1);
}

const sourceBusiness = source.slice(sourceAt);
const targetBusiness = target.slice(targetAt);

if (sourceBusiness === targetBusiness) {
  console.log(`✓ 业务逻辑段本来就一致，无需同步（${sourceBusiness.split('\n').length} 行）`);
  process.exit(0);
}

const next = target.slice(0, targetAt) + sourceBusiness;

writeFileSync(path.join(root, TARGET), next);

console.log(`✓ 已把 ${SOURCE} 的业务逻辑段同步到 ${TARGET}`);
console.log(`  （${sourceBusiness.split('\n').length} 行，自 "${SENTINEL}" 起；传输层保持不变）`);
