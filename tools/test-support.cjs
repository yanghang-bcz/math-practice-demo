'use strict';

/* =========================================================
   测试共用小工具：从 app.js 源码里切出生产函数
   =========================================================

   几个测试都是「不引导 UI，直接跑 app.js 里的生产函数」。做法一致：
   按 `  function name(` 起、到下一个顶层 function 声明止，把切片丢进 vm。

   两件事很容易踩，所以放在这里统一定义，不再各抄一份：

     1. app.js 里有些函数后面跟着**顶层语句**（例如 diagJudgeOutcome 后面紧接
        `window.CalcDailyDiag = { summary: diagSummary, ... }`）。切片会把这段
        一起带进去，于是 harness 里必须同时提供它引用到的东西 —— 漏一个就是
        ReferenceError，而且报错位置看起来跟被测行为毫无关系。
     2. FAILURE_KINDS 是 const 对象，vm 里拿不到；手抄一份到测试里就多了一处
        会跟生产漂移的口径，所以从源码里重建。
   ========================================================= */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(name) {
  return fs.readFileSync(path.join(ROOT, name), 'utf8');
}

/* 从 app.js 源码切出指定名字的函数。

   切到下一个**顶层声明**为止：function / async function / const / let / window.。
   只认 function 是不够的 —— app.js 里函数后面常常紧跟着顶层的
   `const $ = id => document.getElementById(id)` 或 `window.X = {...}`，
   这些语句会一起被切进来，然后在 vm 里把 harness 提供的同名对象**遮蔽掉**
   （全局 const 会盖住 context 属性）。症状是报错位置看起来和被测行为
   毫无关系，例如「voidQuestion 里 document.getElementById is not a function」。

   函数体内的缩进至少 4 格，所以 `\n  const ` 这种两格缩进的顶层声明
   不会误伤函数体。 */
const TOP_LEVEL_STARTS = [
  '\n  function ',
  '\n  async function ',
  '\n  const ',
  '\n  let ',
  '\n  window.'
];

function appSlice(source) {
  return function fn(name) {
    const start = source.search(new RegExp('  (?:async )?function ' + name + '\\('));
    if (start < 0) throw new Error('app.js 里找不到 function ' + name);

    const ends = TOP_LEVEL_STARTS
      .map(marker => source.indexOf(marker, start + 1))
      .filter(x => x >= 0);

    if (!ends.length) {
      throw new Error('app.js 里找不到 function ' + name + ' 的结束位置');
    }

    return source.slice(start, Math.min(...ends));
  };
}

function failureKindsFrom(source) {
  const match = source.match(/const FAILURE_KINDS = \{([\s\S]*?)\};/);
  if (!match) throw new Error('app.js 里找不到 FAILURE_KINDS');

  return Object.fromEntries(
    match[1]
      .split(',')
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => {
        const [key, value] = part.split(':');
        return [key.trim(), value.trim().replace(/^'|'$/g, '')];
      })
  );
}

function diagLimitFrom(source) {
  const match = source.match(/const DIAG_LIMIT = (\d+);/);
  if (!match) throw new Error('app.js 里找不到 DIAG_LIMIT');
  return Number(match[1]);
}

/* 顶层 `const NAME = { ... };` 的对象字面量（用花括号配对找出真正的结尾）。
   超时预算、重试次数这类常量是从源码里读出来的，而不是在测试里再抄一份 ——
   抄一份等于给自己留了一个「测试全绿但线上预算还是老的」的口子。 */
function constObjectFrom(source, name) {
  const start = source.indexOf('const ' + name + ' = {');
  if (start < 0) throw new Error('app.js 里找不到 const ' + name);

  const open = source.indexOf('{', start);
  let depth = 0;
  let i = open;

  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }

  return require('node:vm').runInNewContext('(' + source.slice(open, i + 1) + ')');
}

function constNumberFrom(source, name) {
  const match = source.match(new RegExp('const ' + name + ' = (-?[\\d.]+);'));
  if (!match) throw new Error('app.js 里找不到 const ' + name);
  return Number(match[1]);
}

/* 顶层 `const NAME = '字符串';`（app.js 的排版会把值拆到下一行）。 */
function constStringFrom(source, name) {
  const match = source.match(
    new RegExp("const " + name + " =[\\s]*'((?:[^'\\\\]|\\\\.)*)'[\\s]*;")
  );
  if (!match) throw new Error('app.js 里找不到 const ' + name);
  return match[1];
}

const constLiteralFrom = (source, name) => {
  try {
    return constStringFrom(source, name);
  } catch {
    return constNumberFrom(source, name);
  }
};

/* app.js 顶层的 `let xxx = <字面量>;` 声明。
   切片函数里能读到、也会赋值的模块级状态（requestCounter、apiProtocol、
   apiHealthy……）必须由 harness 补上，否则一调用就是 ReferenceError，
   而报错位置看起来和被测行为毫无关系（例如「出题失败回退」报
   requestCounter is not defined）。

   只收字面量初值：`let state = loadState();` 这类要靠 harness 自己给。 */
function runtimeBitsFrom(source) {
  const out = {};
  // `= ` 与字面量之间可能有换行（app.js 的排版把长表达式拆行了）
  const pattern = /^ {2}let (\w+) =[\s]*(-?\d+|null|true|false|'(?:[^'\\]|\\.)*')[\s]*;/gm;

  for (const match of source.matchAll(pattern)) {
    const [, name, literal] = match;
    out[name] = literal === 'null'
      ? null
      : literal === 'true'
        ? true
        : literal === 'false'
          ? false
          : literal.startsWith("'")
            ? literal.slice(1, -1)
            : Number(literal);
  }

  return out;
}

/* 诊断模块（Task 5H）在 vm 里需要的那几样：日志数组、上限、分类表。
   diagLog 只往数组里 push，所以数组由 harness 提供即可。 */
function diagContextBits(source) {
  return {
    diagRecords: [],
    DIAG_LIMIT: diagLimitFrom(source),
    FAILURE_KINDS: failureKindsFrom(source),
    ...runtimeBitsFrom(source)
  };
}

/* 诊断模块的三个函数名，按依赖顺序。 */
const DIAG_FUNCTIONS = ['diagLog', 'diagSummary', 'diagJudgeOutcome'];

module.exports = {
  ROOT,
  read,
  appSlice,
  failureKindsFrom,
  diagLimitFrom,
  constObjectFrom,
  constNumberFrom,
  constStringFrom,
  constLiteralFrom,
  runtimeBitsFrom,
  diagContextBits,
  DIAG_FUNCTIONS
};
