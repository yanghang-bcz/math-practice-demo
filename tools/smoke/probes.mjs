/* =========================================================
   Judge 压力测试的探针组（Task #4 · D）
   =========================================================

   两组探针，方向相反：

     WRONG_PROBES  必须是「错」的答案。任何一条被系统判成 correct:true
                   都是零容忍事故 —— 那正是 Task #4 要压到 0 的东西。
     VALID_PROBES  必须是「对」的答案，只是写法古怪。被拒说明引擎太窄，
                   会把正确的作答判成无法判定（用户体验损失，不是污染）。

   设计上的两条硬规矩（都是踩过坑换来的）：

   1. 探针的「错」必须是代数构造出来的，不能靠判题入口去判。
      拿被检验的对象来决定探针真值，就是自证 —— 引擎有 bug 时探针会被
      悄悄跳过，报告里只剩一个漂亮的 0。

   2. 但也不能只靠构造。两种情形下 `2·答案` / `-答案` 本身就是正确答案：
        · 不定积分加常数、乘常数外的变换要按导数看 → $+1$ 对不定积分是等价的
        · 参考答案恒等于 0 时，取负/乘 2 还是 0
      这两类必须显式跳过，否则会把「判对了」记成「误批」。
      跳过不用判题入口，用一个独立的取样器判断「参考答案是不是恒为 0」。
   ========================================================= */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Q = require(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../math-quality.js'));

/* 和引擎自己的采样点不同的一组数：判断「是否恒为 0」时不要和引擎共用同一批点，
   否则引擎的采样偏差会被原样复制到探针的真值判断上。 */
const ZERO_PROBE_POINTS = [-1.42, -0.66, -0.21, 0.17, 0.53, 0.98, 1.61, 2.35];

/* 参考答案的右端：形如 y'=f(x) 时只扰动等号右侧，不要把整个等式塞进括号。 */
export function rhsOf(q) {
  const raw = String(q?.answer ?? '').trim();
  if (!raw) return '';
  return raw.includes('=')
    ? (raw.slice(raw.lastIndexOf('=') + 1).trim() || raw)
    : raw;
}

/* 参考答案恒等于 0 吗？
   刻意不用 Q.judgeDeterministic：判题入口是本次要检验的对象，
   用它来决定探针真值就成自证了。这里只做「取值是不是 0」这一件事。 */
export function isZeroAnswer(q) {
  const raw = String(q?.answer ?? '').trim();
  if (!raw) return false;

  const a = Q.atom(raw);
  if (a) return a.kind === 'number' && Math.abs(a.value) < 1e-12;

  const body = Q.stripPlusC ? Q.stripPlusC(rhsOf(q)) : rhsOf(q);
  const f = Q.tryParse(body, 'x');
  if (!f) return false; // 判不了就照旧建探针，宁多勿漏

  let seen = 0;
  for (const x of ZERO_PROBE_POINTS) {
    let v = null;
    try { v = f(x); } catch { continue; }
    if (!Number.isFinite(v)) continue;
    seen += 1;
    if (Math.abs(v) > 1e-9) return false;
  }

  return seen >= 4;
}

/* 数字答案的近似小数（用来造「小数近似」探针）。拿不到就返回 null。 */
function decimalApprox(q) {
  const raw = String(q?.answer ?? '').trim();
  const a = Q.atom(raw);
  if (!a || a.kind !== 'number' || !Number.isFinite(a.value)) return null;
  if (Number.isInteger(a.value)) return null; // 3 → "3.0" 不算「近似」，没意义

  const text = a.value.toPrecision(10);
  return Number(text) === a.value ? null : text;
}

/* 等价分数：a/b → (2a)/(2b)。拿不到就返回 null。 */
function equivalentFraction(q) {
  const raw = String(q?.answer ?? '').trim();

  const bare = raw.match(/^([+-]?\d+)\s*\/\s*(\d+)$/);
  if (bare) return `(${Number(bare[1]) * 2})/(${Number(bare[2]) * 2})`;

  const frac = raw.match(/^\\(?:d|t)?frac\s*\{([+-]?\d+)\}\s*\{([+-]?\d+)\}$/);
  if (frac) return `\\frac{${Number(frac[1]) * 2}}{${Number(frac[2]) * 2}}`;

  return null;
}

/* ---------------------------------------------------------
   错答探针
   --------------------------------------------------------- */

/* build 既可以直接给函数，也可以给 { skip, build } —— 后者用于
   「某些题上这条探针不成立」的情形（见文件顶部两条硬规矩）。 */
function wrong(key, label, spec) {
  return normalizeSpec(key, label, 'wrong', spec);
}

export const WRONG_PROBES = [
  wrong('plain_refusal', '空话「我不会做」', () => '我不会做'),

  wrong(
    'blame_reference',
    '指责参考答案「感觉参考答案本身写错了」',
    // 实测过：旧版判题会把这句话判成 equivalent / correct:true。
    // 这条探针就是用来钉住那个故障不再复现的，不能删。
    () => '我不会做，感觉参考答案本身写错了。'
  ),

  wrong('far_number', '明显错的数字 999999', () => '999999'),

  wrong(
    'double_wrapped',
    '正确值的 2 倍（2\\left(右端\\right)）',
    // 这个探针换过三次，坑都记在这里：
    //  1. 「参考答案 +1000」不行 —— 不定积分加任意常数本身就等价，实测把正确判定记成了误批。
    //  2. 「取负」不行 —— 参考答案为负时 -(负数) 撞上引擎解析缺口，模型会误判等价。
    //  3. 现在用「2 × 右端」，而且 Task #4 起引擎自己就能判死它（结构检查那层）。
    { skip: isZeroAnswer, build: (q) => `2\\left(${rhsOf(q)}\\right)` }
  ),

  wrong(
    'sign_flip',
    '取负（-\\left(右端\\right)）',
    { skip: isZeroAnswer, build: (q) => `-\\left(${rhsOf(q)}\\right)` }
  ),

  wrong(
    'double_paren',
    '2 倍（隐式乘 2(右端)）',
    { skip: isZeroAnswer, build: (q) => `2(${rhsOf(q)})` }
  ),

  wrong(
    'double_cdot',
    '2 倍（2\\cdot 右端）',
    { skip: isZeroAnswer, build: (q) => `2\\cdot\\left(${rhsOf(q)}\\right)` }
  ),

  wrong(
    'double_times',
    '2 倍（2\\times 右端）',
    { skip: isZeroAnswer, build: (q) => `2\\times\\left(${rhsOf(q)}\\right)` }
  ),

  wrong(
    'half_shorthand',
    '裸 \\frac 速写（\\frac12 右端）',
    { skip: isZeroAnswer, build: (q) => `\\frac12\\left(${rhsOf(q)}\\right)` }
  ),

  wrong(
    'plus_one',
    '右端 +1',
    {
      // 不定积分对常数不敏感：F+C+1 与 F+C 在数学上就是同一个答案族。
      // 对不定积分建这条探针等于把正确答案当成错答案来考。
      skip: (q) => q?.module === 'integral',
      build: (q) => `\\left(${rhsOf(q)}\\right)+1`
    }
  ),

  wrong(
    'minus_one',
    '右端 -1',
    {
      skip: (q) => q?.module === 'integral',
      build: (q) => `\\left(${rhsOf(q)}\\right)-1`
    }
  )
];

/* ---------------------------------------------------------
   合法但古怪的写法：必须被接受
   ---------------------------------------------------------

   这些形态都恒等于参考答案本身，所以「正确」是代数上保证的。
   它们量的是「引擎会不会把对的判成判不了」 —— Task #4 收紧判定权限之后，
   这一侧的代价会上升（模型说等价不再被采信），所以必须单独盯着。
   --------------------------------------------------------- */

function valid(key, label, spec) {
  return normalizeSpec(key, label, 'valid', spec);
}

function normalizeSpec(key, label, kind, spec) {
  if (typeof spec === 'function') return { key, label, kind, build: spec, skip: null };
  return { key, label, kind, build: spec.build, skip: spec.skip || null };
}

export const VALID_PROBES = [
  valid('paren_wrap', '整段套一层括号 \\left(右端\\right)', (q) => `\\left(${rhsOf(q)}\\right)`),

  valid(
    'double_negation',
    '双重取负 -\\left(-\\left(右端\\right)\\right)',
    (q) => `-\\left(-\\left(${rhsOf(q)}\\right)\\right)`
  ),

  valid('times_one', '乘以 1（1\\cdot 右端）', (q) => `1\\cdot\\left(${rhsOf(q)}\\right)`),

  valid('wrapped_twice', '系数 2 与 \\frac12 相抵（\\frac12·2·右端）', (q) => `\\frac12\\left(2\\left(${rhsOf(q)}\\right)\\right)`),

  valid('equivalent_fraction', '等价分数（2a)/(2b）', equivalentFraction),

  valid('decimal_approx', '小数近似', decimalApprox)
];

/* 把一条探针变成可执行的结果：不该建的返回 skipped，附上原因。 */
export function materialize(probe, question) {
  const skip =
    typeof probe.skip === 'function' ? probe.skip(question) : Boolean(probe.skip);

  if (skip) {
    return { key: probe.key, label: probe.label, kind: probe.kind, skipped: true, reason: 'not_applicable' };
  }

  let answer = null;
  try {
    answer = probe.build(question);
  } catch (error) {
    answer = null;
  }

  if (typeof answer !== 'string' || !answer.trim()) {
    return { key: probe.key, label: probe.label, kind: probe.kind, skipped: true, reason: 'no_form' };
  }

  return { key: probe.key, label: probe.label, kind: probe.kind, skipped: false, answer };
}

/* 一道题上的全部探针（含被跳过的，跳过要如实报出来）。 */
export function probesFor(question) {
  return [...WRONG_PROBES, ...VALID_PROBES].map((p) => materialize(p, question));
}
