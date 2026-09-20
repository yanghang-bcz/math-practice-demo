/* CalcDaily deterministic math verification engine (browser + Node, dependency-free).
 *
 * quality-v2
 *
 * 三条设计约束（决定这个引擎能不能用）：
 *
 * 1. 引擎永远不产生「错误的拒绝」。解析失败、域外采样、数值不收敛一律返回
 *    'uncertain'，把最终决定权交回上层。宁可放过，不可误杀。
 *
 * 2. 数值采样必须避开极小步长。实测 e^x-1-x-x^2/2 在 x=1e-6 时因双精度相减抵消
 *    会算出 -37.8，足以把正确答案判成错。所以步长固定取 1e-2 ~ 1e-4，
 *    并用 Richardson 外推 + 收敛性检验；不收敛即不下结论。
 *
 * 3. 「等价」按题目类型定义，而不是按字符串：
 *    limit      候选值 ≈ 极限真值
 *    derivative 候选表达式 ≈ 原函数的导数
 *    integral   候选表达式求导后 ≈ 被积函数
 *               （因此 x^2/2 与 x^2/2+C 视为等价，这是不定积分的正确等价定义）
 */
(function(root) {
  'use strict';

  const VERSION = 'quality-v2';

  const HARD_FIELDS = [
    'question_valid',
    'answer_correct',
    'solution_correct',
    'answer_solution_consistent'
  ];

  const SOFT_FIELDS = [
    'topic_match',
    'difficulty_reasonable'
  ];

  const fields = HARD_FIELDS.concat(SOFT_FIELDS);

  const EPSILON = 1e-8;
  const CONFIDENCE_FLOOR = 0.75;
  const CONFIDENCE_TRUSTED = 0.90;

  const CODES = {
    QUESTION_INVALID: 'QUESTION_INVALID',
    ANSWER_INVALID: 'ANSWER_INVALID',
    SOLUTION_MISMATCH: 'SOLUTION_MISMATCH',
    ANSWER_FAILS_VERIFICATION: 'ANSWER_FAILS_VERIFICATION',
    CANONICAL_SUSPECTED: 'CANONICAL_SUSPECTED',
    JUDGE_UNCERTAIN: 'JUDGE_UNCERTAIN',
    JUDGE_PROTOCOL_ERROR: 'JUDGE_PROTOCOL_ERROR',
    GENERATION_REJECTED: 'GENERATION_REJECTED',
    GENERATION_FORMAT_ERROR: 'GENERATION_FORMAT_ERROR',
    VERIFICATION_STALE: 'VERIFICATION_STALE',
    UNVERIFIED_SHAPE: 'UNVERIFIED_SHAPE',
    CANONICAL_MUTATED: 'CANONICAL_MUTATED',
    FALLBACK_USED: 'FALLBACK_USED'
  };

  /* 闸门三态（Task 5C）。关键约定：
       UNCERTAIN 对高风险数学内容 **不等于 APPROVE**。
     只凭审核员的几个布尔就把「引擎从未独立验证过」的题当高可信题发给学生，
     正是线上 4/41 错误标准答案的来源。 */
  const GATE = {
    VERIFIED: 'VERIFIED',
    REJECTED: 'REJECTED',
    UNCERTAIN: 'UNCERTAIN'
  };

  /* 题目形态分级（Task 5B）：
       A  结构可读，且确定性验证给出了结论（equivalent / not_equivalent）
       B  结构可读，但这一次数值不定 —— 矛盾检查跑过了，没发现矛盾
       C  结构读不懂 —— 引擎没有能力为 canonical 背书

     分级只看「引擎有没有能力验证」，与这一次数值是否收敛无关：
     同一道 Tier A 形态的题，换个数字可能落到 B，但不会掉到 C。 */
  const TIER = { A: 'A', B: 'B', C: 'C' };

  /* =========================================================
     Normalization + deterministic atom comparison
     ========================================================= */

  /* \frac 的两种 LaTeX 写法都要认：
       \frac{1}{2}  花括号参数（绝大多数情况）
       \frac12      教科书速写，两个参数各只占一个 token
     速写形态在 normalize 里用「单字符 + 单字符」抠，够精确：
     它不会误吃 \frac1\pi（第二个 token 是反斜杠开头的命令，正则匹配不上），
     也不会把 \frac{12}{34} 读成 12/34——花括号那条规则先跑，压根轮不到它。 */
  function normalize(v) {
    return String(v ?? '')
      .normalize('NFKC')
      .trim()
      .replace(/[\u2212\u2013\u2014]/g, '-')
      .replace(/\\(?:left|right)/g, '')
      .replace(/\\(?:dfrac|tfrac|frac)\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '($1)/($2)')
      .replace(/\\(?:dfrac|tfrac|frac)\s*([0-9A-Za-z])\s*([0-9A-Za-z])/g, '($1)/($2)')
      // 把 \frac 展开留下的 (a)/(b) 清成 a/b，好让 isExactForm/rational 认得出。
      //
      // 但必须看清前面的字符：紧跟在数字/字母/右括号后面的左括号是「乘法」，
      // 不是「分组」。否则 2(1)/(6) 会被清成 21/6 —— 一个凭空捏造出来的数，
      // 而且它会把 1(2)/(3) 判成等于 12/3，也就是一次错答被放行。
      // 剥不干净没关系：那就落回 uncertain，交给结构检查那层去判。
      .replace(/(?<![\w.)])\(([+-]?\d+(?:\.\d+)?)\)/g, '$1')
      .replace(/\\infty/g, '\u221e')
      .replace(/\\[()[\]]|\$/g, '')
      .replace(/\s+/g, '');
  }

  const NUMBER = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?';

  function atom(v) {
    const s = normalize(v).toLowerCase();

    if (['\u4e0d\u5b58\u5728', '\u6781\u9650\u4e0d\u5b58\u5728', '\u65e0\u6781\u9650', 'dne', 'doesnotexist'].includes(s)) {
      return { kind: 'dne' };
    }

    if (['+\u221e', '\u221e', '+infinity', 'infinity', '\u6b63\u65e0\u7a77', '\u6b63\u65e0\u7a77\u5927', '+\u65e0\u7a77'].includes(s)) {
      return { kind: 'positiveInfinity' };
    }

    if (['-\u221e', '-infinity', '\u8d1f\u65e0\u7a77', '\u8d1f\u65e0\u7a77\u5927', '-\u65e0\u7a77'].includes(s)) {
      return { kind: 'negativeInfinity' };
    }

    // Unsigned Chinese infinity / divergence is ambiguous — never equate it with DNE or signed infinity.
    if (['\u65e0\u7a77', '\u65e0\u7a77\u5927', '\u53d1\u6563', '\u00b1\u221e'].includes(s)) {
      return { kind: 'ambiguous' };
    }

    let m = s.match(new RegExp('^(' + NUMBER + ')/(' + NUMBER + ')$'));
    let n;

    if (m) {
      if (Number(m[2]) === 0) return { kind: 'invalid' };
      n = Number(m[1]) / Number(m[2]);
    } else if (new RegExp('^' + NUMBER + '%?$').test(s)) {
      n = Number(s.replace('%', '')) / (s.endsWith('%') ? 100 : 1);
    } else {
      return null;
    }

    return Number.isFinite(n) ? { kind: 'number', value: n } : { kind: 'invalid' };
  }

  function decimal(t) {
    const m = t.replace(/[()]/g, '').match(/^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/);
    if (!m || !(m[2] || m[3]) || Math.abs(Number(m[4] || 0)) > 1000 || t.length > 2000) return null;

    const shift = Number(m[4] || 0) - (m[3] || '').length;
    let n = BigInt((m[2] || '0') + (m[3] || '')) * (m[1] === '-' ? -1n : 1n);
    let d = 1n;

    if (shift >= 0) n *= 10n ** BigInt(shift);
    else d = 10n ** BigInt(-shift);

    return [n, d];
  }

  /* Exact-form = integer, integer fraction or integer percent — and, since
     decimal() parses exponents exactly, exponent literals like 1e-15 too.
     只排除「带小数点」的字面量：那是人的四舍五入，1/6 与 0.1666666667 必须
     判为等价，所以必须走容差比较。
     早先把 e 写法一起排除，导致 0 与 1e-15、0 与 1e-400 都被判成等价 ——
     这两个字面量本来可以精确比较，退化成容差比较就直接没了。 */
  function isExactForm(v) {
    const s = normalize(v).toLowerCase();
    if (s.includes('.')) return false;
    return /^[+-]?\d+(?:e[+-]?\d+)?%?$/.test(s) || new RegExp('^' + NUMBER + '/' + NUMBER + '$').test(s);
  }

  function rational(v) {
    const s = normalize(v).toLowerCase();
    const parts = s.replace(/%$/, '').split('/');
    if (parts.length > 2) return null;

    const a = decimal(parts[0]);
    const b = parts.length === 2 ? decimal(parts[1]) : [1n, 1n];
    if (!a || !b || b[0] === 0n) return null;

    return [a[0] * b[1], a[1] * b[0] * (s.endsWith('%') ? 100n : 1n)];
  }

  function tolerantEqual(va, vb) {
    if (!Number.isFinite(va) || !Number.isFinite(vb)) return null;
    const scale = Math.max(1, Math.abs(va), Math.abs(vb));
    return Math.abs(va - vb) <= EPSILON * scale;
  }

  /* 表达式里有没有自变量。只认编译器的符号表：FUNCS 里的函数名和
     pi / e / Infinity 这些常量之外，任何字母（包括 x）都算「含变量」。
     这条判断决定 constantAtom 敢不敢把一段表达式当成常量去求值。 */
  function containsVariable(infix) {
    const runs = infix.match(/[A-Za-z]+/g) || [];

    for (const run of runs) {
      if (FUNCS[run]) continue;
      if (['pi', 'PI', 'e', 'E', 'Infinity', 'inf'].includes(run)) continue;
      return true;
    }

    return false;
  }

  const CONST_PROBES = [0.37, 1.13, -0.61, 2.71, -1.9];

  /* 纯常量表达式 → 数值 —— compare 的最后一层。

     存在的理由：像 2\left(\frac12\right)、sqrt(2)/2、e^2、pi/4 这些写法
     atom() 一个都不认（它只认裸标量），于是 compare 返回 uncertain，
     整个判题被推给模型。而模型对「参考答案外面套一个系数」这种形态
     恰好是最容易判错的 —— 这正是 Task #4 里错答放行的主要来源。

     安全边界（宁可不判也不猜）：
       · 含变量一律拒绝（x+1、2x 绝不能被当成常量）—— 见 containsVariable；
       · 在 5 个互不相同的点上求值，必须**处处相同**才认定是常量。
         这比字符串匹配结实：「x - x + 1」这种伪常量也会被拆穿（它恒等于 1，
         其实无所谓），而「x^0 + 1」…同样恒等于 2，也确实是常量。真正要拦的
         是「值随 x 变」的表达式，数值法一测便知；
       · 任一探针点落在定义域外（NaN/非有限）→ 直接放弃（保守）。 */
  function constantAtom(v) {
    const s = normalize(v);
    if (!s) return null;

    // 裸数字 / 分数 / 百分号不是「表达式形态」，atom() 已经处理过了，早退。
    if (/^[+\-\d./%e]+$/i.test(s)) return null;

    // 没有数字的式子基本只有 pi / e 裸常量，收益极低，不值得付 tryParse 的成本。
    if (!/[0-9]/.test(s)) return null;

    let infix;
    try {
      infix = toInfix(v, 'x');
    } catch (error) {
      return null;
    }

    if (!infix || infix.includes('=') || containsVariable(infix)) return null;

    const f = tryParse(v, 'x');
    if (!f) return null;

    let value = null;

    for (const probe of CONST_PROBES) {
      const current = safeEval(f, probe);
      if (current === null) return null;
      if (value === null) { value = current; continue; }
      if (!closeEnough(current, value, 1e-12)) return null;
    }

    return value === null ? null : { kind: 'number', value };
  }

  function compare(a, b) {
    // 标量比较的最后一层兜底：两个人写的都是纯常量表达式时，先把它们算成数
    // 再比，而不是原样漏给模型。atom() 认不出的写法（2(1/2)、sqrt(2)/2）
    // 到这里被就地解决掉。
    const x = atom(a) || constantAtom(a);
    const y = atom(b) || constantAtom(b);

    if ([x, y].some(z => z && ['ambiguous', 'invalid'].includes(z.kind))) return 'uncertain';
    if (!x || !y) return 'uncertain';
    if (x.kind !== y.kind) return 'not_equivalent';
    if (x.kind !== 'number') return 'equivalent';

    if (isExactForm(a) && isExactForm(b)) {
      const ra = rational(a);
      const rb = rational(b);
      if (!ra || !rb) return 'uncertain';
      return ra[0] * rb[1] === rb[0] * ra[1] ? 'equivalent' : 'not_equivalent';
    }

    const same = tolerantEqual(x.value, y.value);
    if (same === null) return 'uncertain';
    return same ? 'equivalent' : 'not_equivalent';
  }

  /* =========================================================
     LaTeX → plain infix + a small numeric evaluator
     ========================================================= */

  const FUNCS = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    cot: x => 1 / Math.tan(x),
    sec: x => 1 / Math.cos(x),
    csc: x => 1 / Math.sin(x),
    arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
    // 国内高数教材约定：log 与 ln 均指自然对数。
    ln: Math.log, log: Math.log, log2: Math.log2,
    exp: Math.exp, sqrt: Math.sqrt, abs: Math.abs
  };

  /* Index just past the '}' that closes the '{' at `i`, or -1 when unbalanced. */
  function matchBrace(s, i) {
    let depth = 0;
    for (let p = i; p < s.length; p++) {
      if (s[p] === '{') depth++;
      else if (s[p] === '}') {
        depth--;
        if (depth === 0) return p + 1;
      }
    }
    return -1;
  }

  /* One \frac argument. LaTeX accepts either a brace-balanced group or a single
     following token, and both spellings show up in real student answers:
       \frac{1}{6}        → grouped
       \frac12(x+1)       → shorthand, i.e. (1)/(2) · (x+1)
       \frac34x           → shorthand, i.e. (3)/(4) · x
     The shorthand must take exactly ONE character per argument — reading a digit
     run would turn \frac12 into (12)/(?) and silently mangle the answer. Anything
     that is not a group or a single alphanumeric is refused so the caller can
     leave the raw \frac untouched (which stays 'uncertain', never a wrong verdict). */
  function readFracArg(t, i) {
    if (t[i] === '{') {
      const end = matchBrace(t, i);
      return end < 0 ? null : { text: t.slice(i + 1, end - 1), end };
    }

    if (i >= t.length || !/[0-9A-Za-z.]/.test(t[i])) return null;

    return { text: t[i], end: i + 1 };
  }

  /* \frac{A}{B} -> ((A)/(B)), recursively.
   *
   * A naive flat [^{}]* capture breaks on every real high-math answer, because
   * the numerator or denominator usually contains its own braces:
   *   \frac{x}{\sqrt{1+x^2}}          nested \sqrt group
   *   \frac{e^{2x}}{2}                ^{2x}
   *   \frac{(1+x^2)^{\frac{3}{2}}}{3} nested \frac
   * With a flat capture those all failed to expand, the raw "frac" leaked into
   * the infix string, and the whole answer was unparseable — the engine said
   * 'uncertain' on correct answers. Balanced-brace matching fixes the class. */
  function expandFrac(t, depth) {
    if ((depth || 0) > 12) return t;

    const re = /\\(?:d|t)?frac/g;
    let out = '';
    let i = 0;
    let guard = 0;

    while (i < t.length && guard++ < 500) {
      re.lastIndex = i;
      const m = re.exec(t);
      if (!m) { out += t.slice(i); break; }

      out += t.slice(i, m.index);

      let p = m.index + m[0].length;
      while (t[p] === ' ') p++;

      const a = readFracArg(t, p);
      if (!a) { out += m[0]; i = m.index + m[0].length; continue; }

      let q = a.end;
      while (t[q] === ' ') q++;

      const b = readFracArg(t, q);
      if (!b) { out += m[0]; i = m.index + m[0].length; continue; }

      const numerator = expandFrac(a.text, (depth || 0) + 1);
      const denominator = expandFrac(b.text, (depth || 0) + 1);

      out += '((' + numerator + ')/(' + denominator + '))';
      i = b.end;
    }

    return out;
  }

  /* \sqrt{A} -> sqrt(A);  \sqrt[n]{A} -> ((A)^(1/(n))). Brace-balanced, so
     \sqrt{1+x^2} keeps its brackets instead of leaking a bare "sqrt 1+x^2"
     (which the evaluator happily read as sqrt(1)+x^2 — silently wrong maths). */
  function expandSqrt(t, depth) {
    if ((depth || 0) > 12) return t;

    const re = /\\sqrt/g;
    let out = '';
    let i = 0;
    let guard = 0;

    while (i < t.length && guard++ < 500) {
      re.lastIndex = i;
      const m = re.exec(t);
      if (!m) { out += t.slice(i); break; }

      out += t.slice(i, m.index);

      let p = m.index + m[0].length;
      while (t[p] === ' ') p++;

      let degree = null;
      if (t[p] === '[') {
        const close = t.indexOf(']', p);
        if (close > 0) {
          degree = t.slice(p + 1, close);
          p = close + 1;
          while (t[p] === ' ') p++;
        }
      }

      if (t[p] !== '{') { out += m[0]; i = m.index + m[0].length; continue; }

      const end = matchBrace(t, p);
      if (end < 0) { out += m[0]; i = m.index + m[0].length; continue; }

      const inner = expandSqrt(t.slice(p + 1, end - 1), (depth || 0) + 1);

      out += degree === null
        ? 'sqrt(' + inner + ')'
        : '((' + inner + ')^(1/(' + degree + ')))';

      i = end;
    }

    return out;
  }

  /* Textbook function powers: \cos^2 x means (\cos x)^2, not \cos(x^2) and not
     the token "cos" raised to 2. Rewrites the already-de-backslashed infix
     string: every "func ^ n <primary>" becomes "((func(<primary>))^(n))".
     Only integer exponents >= 2 are honoured, because \cos^{-1} is genuinely
     ambiguous between arccos and 1/cos — leaving it alone yields 'uncertain',
     which is the safe outcome. */
  const POW_FUNCS = ['sinh', 'cosh', 'tanh', 'arcsin', 'arccos', 'arctan', 'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'ln', 'log', 'exp'];

  function expandFuncPowers(t) {
    let out = '';
    let i = 0;
    let guard = 0;

    while (i < t.length && guard++ < 2000) {
      let hit = null;

      for (const name of POW_FUNCS) {
        if (!t.startsWith(name, i)) continue;

        const before = i > 0 ? t[i - 1] : '';
        if (/[A-Za-z0-9_]/.test(before)) continue;

        let k = i + name.length;
        while (t[k] === ' ') k++;
        if (t[k] !== '^') continue;
        k++;

        while (t[k] === ' ') k++;
        let paren = false;
        if (t[k] === '(') { paren = true; k++; while (t[k] === ' ') k++; }

        const digitStart = k;
        while (/\d/.test(t[k])) k++;
        if (k === digitStart) continue;

        const digits = t.slice(digitStart, k);
        if (!/^[2-9]\d*$/.test(digits)) continue;

        while (t[k] === ' ') k++;
        if (paren) {
          if (t[k] !== ')') continue;
          k++;
        }

        // Argument: a balanced paren group, or a single primary token.
        while (t[k] === ' ') k++;
        const argStart = k;
        let arg;

        if (t[k] === '(') {
          const p = matchParen(t, k);
          if (p < 0) continue;
          arg = t.slice(k, p);
          k = p;
        } else {
          let p = k;
          while (p < t.length && /[A-Za-z0-9_.]/.test(t[p])) p++;
          while (t[p] === ' ') p++;
          if (t[p] === '(') {
            const r = matchParen(t, p);
            if (r > 0) p = r;
          }
          arg = t.slice(argStart, p).trim();
          k = p;
        }

        if (!arg) continue;

        hit = { name, pow: digits, arg, end: k };
        break;
      }

      if (hit) {
        out += '((' + hit.name + '(' + hit.arg + '))^(' + hit.pow + '))';
        i = hit.end;
      } else {
        out += t[i];
        i++;
      }
    }

    return out;
  }

  /* Index just past the ')' that closes the '(' at `i`, or -1 when unbalanced. */
  function matchParen(s, i) {
    let depth = 0;
    for (let p = i; p < s.length; p++) {
      if (s[p] === '(') depth++;
      else if (s[p] === ')') {
        depth--;
        if (depth === 0) return p + 1;
      }
    }
    return -1;
  }

  /* |A| -> abs(A)。目标很具体：|x| 是积分答案里最常见的形态之一
     （\ln|x|+C、3\ln|x-2|-2\ln|x-1| 这类），而 '|' 在 tokenizer 里是非法字符，
     于是整条答案直接 unparseable —— 判题只能说「不确定」，白白漏给模型。

     配对规则刻意保守，宁可不解也不猜错：
       · 竖线个数是奇数 → 写法不规整，整段不动（仍旧 unparseable → 保守）
       · 配对内容为空（嵌套写法 ||x|-1|）→ 整段不动
     LaTeX 里嵌套绝对值本身就有歧义（正解是 \lvert/\rvert），去猜它只会猜错。 */
  function expandAbs(t) {
    if (!t.includes('|')) return t;
    if ((t.match(/\|/g) || []).length % 2) return t;

    let out = '';
    let i = 0;

    while (i < t.length) {
      if (t[i] !== '|') { out += t[i]; i++; continue; }

      const close = t.indexOf('|', i + 1);
      if (close < 0) return t;

      const inner = t.slice(i + 1, close);
      if (!inner.trim()) return t;

      out += 'abs(' + inner + ')';
      i = close + 1;
    }

    return out;
  }

  function toInfix(src, varName) {
    let t = String(src ?? '');

    // A LaTeX command glues to whatever precedes it: "2x\cos(x^2)" must become
    // "2x*cos(x^2)", otherwise the tokenizer reads "xcos" as one identifier.
    t = t.replace(
      /\\(sinh|cosh|tanh|arcsin|arccos|arctan|cot|sec|csc|sin|cos|tan|ln|log|exp|abs|pi|infty|int|to|cdot|times|div|quad|qquad|displaystyle|limits|,|;|!)/g,
      (match, name, offset, whole) => {
        if (['quad', 'qquad', 'displaystyle', 'limits', ',', ';', '!'].includes(name)) return ' ';
        if (name === 'cdot' || name === 'times') return '*';
        if (name === 'div') return '/';
        if (name === 'int') return ' ';

        const prev = offset > 0 ? whole[offset - 1] : '';
        const glue = /[A-Za-z0-9)]/.test(prev) ? '*' : '';

        if (name === 'pi') return glue + 'pi';
        if (name === 'infty') return glue + 'Infinity';
        if (name === 'to') return ' to ';
        return glue + name + ' ';
      }
    );

    t = t.replace(/\\(?:left|right)/g, '');
    t = t.replace(/\\operatorname\s*\{([^{}]*)\}/g, ' $1 ');
    t = t.replace(/\\\[|\\\]|\\\(|\\\)|\$/g, ' ');

    t = expandAbs(t);

    // \sqrt is deliberately NOT handled by the command sweep above: it needs its
    // braces to survive so the argument can be bracketed properly. Gluing the
    // implicit product first keeps "2\sqrt{x}" / "x\sqrt{1+x^2}" from collapsing
    // into a single identifier once the backslash is gone.
    t = t.replace(/([A-Za-z0-9_)\]])\s*(?=\\sqrt\b)/g, '$1*');

    t = expandFrac(t);
    t = expandSqrt(t);
    t = t.replace(/\^\{([^{}]*)\}/g, '^($1)');
    t = t.replace(/_\{[^{}]*\}/g, '');
    t = t.replace(/_./g, '');
    t = t.replace(/[{}]/g, '');
    t = t.replace(/\\/g, '');
    t = t.replace(/[\u2212\u2013\u2014]/g, '-');

    // \cos^2 x and friends: the exponent belongs to the *function value*, i.e.
    // (\cos x)^2, not to the raw token. Without this the infix string reads
    // "cos ^2 x" and the parser gives up. Restricted to integer powers >= 2 so
    // the genuinely ambiguous \cos^{-1} (inverse vs. reciprocal) stays untouched.
    t = expandFuncPowers(t);

    if (varName && varName !== 'x') {
      t = t.replace(new RegExp('(^|[^A-Za-z])' + varName + '(?![A-Za-z])', 'g'), '$1x');
    }

    return t.trim();
  }

  /* Split "y = f(x)" into its body. Returns implicit:true when the equation is
     not a plain definition — e.g. "x^2+xy+y^2=1" must NOT be treated as f(x)=1. */
  function splitDefinition(src) {
    const t = String(src ?? '').trim();
    const eq = t.indexOf('=');
    if (eq < 0) return { body: t, implicit: false };

    const lhs = t.slice(0, eq).trim();
    const rhs = t.slice(eq + 1).trim();
    const bare = lhs.replace(/\s+/g, '').replace(/^y'?$|^f\(x\)'?$|^dy\/dx$|^y_x$/, '');

    if (bare === '') return { body: rhs, implicit: false };
    return { body: rhs, implicit: true };
  }

  function rhsOf(src) {
    return splitDefinition(src).body;
  }

  const KNOWN_IDENTS = ['x', 'e', 'E', 'pi', 'PI', 'Infinity', 'inf'];

  function normalizeIdent(name) {
    if (name === 'E') return 'e';
    if (name === 'PI') return 'pi';
    return name;
  }

  function splitSymbolRun(name) {
    const out = [];
    let i = 0;

    while (i < name.length) {
      let matched = null;

      if (name.startsWith('pi', i) || name.startsWith('PI', i)) matched = name.slice(i, i + 2);
      else if ('xEe'.includes(name[i])) matched = name[i];

      if (!matched) return null;

      out.push(normalizeIdent(matched));
      i += matched.length;
    }

    return out.length ? out : null;
  }

  function tokenize(src) {
    const tokens = [];
    let i = 0;

    while (i < src.length) {
      const c = src[i];

      if (/\s/.test(c)) { i++; continue; }

      if (/[0-9.]/.test(c)) {
        let j = i;
        while (j < src.length && /[0-9.]/.test(src[j])) j++;

        if (j < src.length && (src[j] === 'e' || src[j] === 'E')) {
          let k = j + 1;
          if (src[k] === '+' || src[k] === '-') k++;
          if (/[0-9]/.test(src[k] || '')) {
            while (k < src.length && /[0-9]/.test(src[k])) k++;
            j = k;
          }
        }

        tokens.push({ type: 'num', value: Number(src.slice(i, j)) });
        i = j;
        continue;
      }

      if (/[A-Za-z]/.test(c)) {
        let j = i;
        while (j < src.length && /[A-Za-z]/.test(src[j])) j++;

        const name = src.slice(i, j);
        i = j;

        if (
          FUNCS[name] || KNOWN_IDENTS.includes(name)
        ) {
          tokens.push({ type: 'ident', value: normalizeIdent(name) });
          continue;
        }

        // "xe^x" carries no separator, so the letter run must be split into
        // single symbols. Anything that cannot be split is refused, not guessed —
        // that is what keeps implicit equations like "xy" out.
        const pieces = splitSymbolRun(name);
        if (!pieces) throw new Error('unknown identifier ' + name);

        for (const piece of pieces) tokens.push({ type: 'ident', value: piece });
        continue;
      }

      if ('+-*/^(),'.includes(c)) { tokens.push({ type: c }); i++; continue; }

      throw new Error('unexpected character ' + c);
    }

    return tokens;
  }

  function compile(infix) {
    const tokens = tokenize(infix);
    if (!tokens.length) return null;

    let pos = 0;
    const peek = () => tokens[pos];
    const eat = type => {
      if (tokens[pos] && tokens[pos].type === type) { pos++; return true; }
      return false;
    };

    function parseExpr() {
      let left = parseTerm(false);
      for (;;) {
        const t = peek();
        if (t && (t.type === '+' || t.type === '-')) {
          pos++;
          const right = parseTerm(false);
          const l = left;
          left = t.type === '+' ? (x => l(x) + right(x)) : (x => l(x) - right(x));
          continue;
        }
        break;
      }
      return left;
    }

    function parseTerm(stopAtFunc) {
      let left = parseUnary(stopAtFunc);
      for (;;) {
        const t = peek();
        if (!t) break;

        if (t.type === '*' || t.type === '/') {
          // "sin x*cos x" must not become sin(x*cos(x)): a bare function argument
          // also stops at a following function.
          const next = tokens[pos + 1];
          if (stopAtFunc && next && next.type === 'ident' && FUNCS[next.value]) break;

          pos++;
          const right = parseUnary(false);
          const l = left;
          left = t.type === '*' ? (x => l(x) * right(x)) : (x => l(x) / right(x));
          continue;
        }

        if (t.type === 'num' || t.type === '(' || t.type === 'ident') {
          // "\sin x \cos x" → sin(x)*cos(x): a bare function argument stops at the next function.
          if (stopAtFunc && t.type === 'ident' && FUNCS[t.value]) break;
          const right = parseUnary(stopAtFunc);
          const l = left;
          left = x => l(x) * right(x);
          continue;
        }

        break;
      }
      return left;
    }

    function parseUnary(stopAtFunc) {
      const t = peek();
      if (t && t.type === '-') { pos++; const f = parseUnary(stopAtFunc); return x => -f(x); }
      if (t && t.type === '+') { pos++; return parseUnary(stopAtFunc); }
      return parsePower(stopAtFunc);
    }

    function parsePower(stopAtFunc) {
      const base = parseAtom(stopAtFunc);
      if (peek() && peek().type === '^') {
        pos++;
        const exponent = parsePowerExponent();
        return x => Math.pow(base(x), exponent(x));
      }
      return base;
    }

    function parsePowerExponent() {
      const t = peek();
      if (t && t.type === '-') { pos++; const f = parsePowerExponent(); return x => -f(x); }
      const base = parseAtom(false);
      if (peek() && peek().type === '^') {
        pos++;
        const exponent = parsePowerExponent();
        return x => Math.pow(base(x), exponent(x));
      }
      return base;
    }

    function parseAtom(stopAtFunc) {
      const t = peek();
      if (!t) throw new Error('unexpected end of expression');

      if (t.type === 'num') { pos++; const v = t.value; return () => v; }

      if (t.type === '(') {
        pos++;
        const inner = parseExpr();
        if (!eat(')')) throw new Error('missing )');
        return inner;
      }

      if (t.type === 'ident') {
        pos++;
        const name = t.value;

        if (FUNCS[name]) {
          const arg = (peek() && peek().type === '(') ? parseAtom(true) : parseTerm(true);
          return x => FUNCS[name](arg(x));
        }

        if (name === 'x') return x => x;
        if (name === 'pi' || name === 'PI') return () => Math.PI;
        if (name === 'e' || name === 'E') return () => Math.E;
        if (name === 'Infinity' || name === 'inf') return () => Infinity;

        throw new Error('unknown identifier ' + name);
      }

      throw new Error('unexpected token');
    }

    const program = parseExpr();
    if (pos !== tokens.length) return null;

    return x => {
      const v = program(typeof x === 'number' ? x : 0);
      if (typeof v !== 'number') throw new Error('non-numeric');
      return v;
    };
  }

  function safeEval(f, x) {
    try {
      const v = f(x);
      return Number.isFinite(v) ? v : null;
    } catch (error) {
      return null;
    }
  }

  /* Parse + smoke-test. Returns null when anything is uncertain. */
  function tryParse(src, varName) {
    try {
      const infix = toInfix(src, varName);
      if (!infix || infix.includes('=')) return null;

      const fn = compile(infix);
      if (!fn) return null;

      let evaluated = false;
      for (const probe of [0.37, 1.13, -0.61]) {
        if (safeEval(fn, probe) !== null) { evaluated = true; break; }
      }

      return evaluated ? fn : null;
    } catch (error) {
      return null;
    }
  }

  /* =========================================================
     Numeric sampling primitives
     ========================================================= */

  /* Central difference + Richardson extrapolation → ~1e-9 accuracy. */
  function numericDerivative(f, x) {
    const h = 1e-4 * Math.max(1, Math.abs(x));
    const pairs = [[h, null], [h / 2, null]];
    const ds = [];

    for (const pair of pairs) {
      const step = pair[0];
      const up = safeEval(f, x + step);
      const down = safeEval(f, x - step);
      if (up === null || down === null) continue;
      ds.push((up - down) / (2 * step));
    }

    if (!ds.length) return null;
    if (ds.length === 1) return ds[0];

    const v = 2 * ds[1] - ds[0];
    return Number.isFinite(v) ? v : null;
  }

  /* Second derivative via the central second difference + Richardson extrapolation.
     Round-off grows like eps/h², so h must not be too small here. */
  function numericSecondDerivative(f, x) {
    const base = safeEval(f, x);
    if (base === null) return null;

    const d2 = h => {
      const up = safeEval(f, x + h);
      const down = safeEval(f, x - h);
      if (up === null || down === null) return null;
      return (up - 2 * base + down) / (h * h);
    };

    const h1 = 1e-2;
    const a = d2(h1);
    const b = d2(h1 / 2);
    if (a === null && b === null) return null;
    if (a === null) return b;
    if (b === null) return a;

    const v = (4 * b - a) / 3;
    return Number.isFinite(v) ? v : null;
  }

  /* Numeric nth derivative. Only 1 and 2 are supported — anything higher is
     refused rather than guessed. */
  function numericDerivativeOfOrder(f, x, order) {
    if (order <= 1) return numericDerivative(f, x);
    if (order === 2) return numericSecondDerivative(f, x);
    return null;
  }

  /* "求二阶导数" must not be checked against the first derivative. */
  function inferDerivativeOrder(question) {
    const explicit = Number(question?.derivativeOrder);
    if (Number.isFinite(explicit) && explicit >= 1) return Math.min(3, explicit);

    const text = String(question?.instruction || '') + ' ' + String(question?.expression || '');
    if (/三阶|三次导|third/i.test(text)) return 3;
    if (/二阶|二次导|second/i.test(text)) return 2;
    return 1;
  }

  const SAMPLE_POINTS = [-1.7, -0.83, -0.37, 0.29, 0.61, 1.13, 1.9, 2.6];

  function closeEnough(a, b, tol) {
    const scale = Math.max(1, Math.abs(a), Math.abs(b));
    return Math.abs(a - b) <= tol * scale;
  }

  /* Composite Simpson with refinement until the value stabilises. */
  function numericIntegral(f, a, b) {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

    let prev = null;
    for (const n of [128, 256, 512, 1024]) {
      const h = (b - a) / n;
      let sum = safeEval(f, a) + safeEval(f, b);
      if (sum === null) return null;

      let valid = true;
      for (let k = 1; k < n; k++) {
        const y = safeEval(f, a + k * h);
        if (y === null) { valid = false; break; }
        sum += (k % 2 ? 4 : 2) * y;
      }

      if (!valid) return null;

      const value = sum * h / 3;
      if (prev !== null && closeEnough(value, prev, 1e-9)) return value;
      prev = value;
    }

    return prev;
  }

  /* =========================================================
     Structure extraction
     ========================================================= */

  function extractLimit(expr) {
    const s = String(expr ?? '');
    // The subscript may itself contain one level of braces ("x\to0^{+}"), so a
    // flat [^{}]* fails and a flat [^}]* would leave a stray "}" in the body.
    const m = s.match(/\\lim\s*_?\s*\{((?:[^{}]|\{[^{}]*\})*)\}/);
    if (!m) return null;

    // The sign may be written 0^+ or 0^{+}.
    const mm = m[1].match(/([A-Za-z])\s*\\to\s*([^\s^]+)\s*(?:\^?\s*\{?\s*([+-])\s*\}?)?/);
    if (!mm) return null;

    const variable = mm[1];
    const targetRaw = mm[2].replace(/\\/g, '').replace(/\s+/g, '');
    const side = mm[3] || '';

    if (!Number.isFinite(Number(targetRaw)) && !/infty|Infinity|\u221e/.test(targetRaw)) return null;

    const target = /infty|Infinity|\u221e/.test(targetRaw)
      ? (/^-/.test(targetRaw) ? -Infinity : Infinity)
      : Number(targetRaw);

    return { variable, target, side, body: s.slice(s.indexOf(m[0]) + m[0].length) };
  }

  function extractIntegral(expr) {
    const s = String(expr ?? '');
    const idx = s.indexOf('\\int');
    if (idx < 0) return null;

    let rest = s.slice(idx + 4);
    let lower = null;
    let upper = null;

    // Bounds may be braced or bare and may be mixed: _0^1, _{-1}^{2}, _0^{\pi/2}.
    // A bare bound must never swallow the integrand, so backslashes and braces
    // are excluded from it.
    let m = rest.match(/^\s*_\s*\{([^{}]*)\}/);
    if (m) { lower = m[1]; rest = rest.slice(m[0].length); }
    else {
      m = rest.match(/^\s*_\s*([^{}\\^\s]+)/);
      if (m) { lower = m[1]; rest = rest.slice(m[0].length); }
    }

    m = rest.match(/^\s*\^\s*\{([^{}]*)\}/);
    if (m) { upper = m[1]; rest = rest.slice(m[0].length); }
    else {
      m = rest.match(/^\s*\^\s*([^{}\\^\s]+)/);
      if (m) { upper = m[1]; rest = rest.slice(m[0].length); }
    }

    const body = rest.replace(/(?:\\,|\\;|\\!|\\ )?\s*d\s*[a-zA-Z]\s*$/, '').trim();

    /* \int \frac{dx}{g(x)} —— 微分写在分子里的写法。
       它和 \int \frac{1}{g(x)}\,dx 是同一个积分，但引擎只认「被积函数 最后跟着 dx」
       这一种排布，于是整道题变成「读不懂」，只能落 uncertain。
       线上 41 题样本里有 5 道栽在这上面，是纯排布差异，不是数学差异。

       只匹配「分子恰好是 d<单字母>」这一种最明确的形态：
         \frac{dx}{...}      → \frac{1}{...}
         \frac{dt}{...}      → \frac{1}{...}
         \frac{x\,dx}{...}   → 不匹配（分子不是纯微分，交给后面的规则，仍旧保守） */
    const normalizedBody = body.replace(
      /^\s*\\d?frac\s*\{\s*d\s*([a-zA-Z])\s*\}\s*\{/,
      '\\frac{1}{'
    );

    return { lower, upper, body: normalizedBody, definite: lower !== null && upper !== null };
  }

  function stripPlusC(value) {
    return String(value ?? '')
      .replace(/\+\s*\\?[Cc]\s*$/g, '')
      .replace(/\+\s*C\b/g, '')
      .replace(/\+\s*\u5e38\u6570\s*$/g, '')
      .trim();
  }

  /* =========================================================
     Verification: is `candidate` a correct answer for `question`?
     ========================================================= */

  /* Per-step limit samples. Returns null when sampling is unusable
     (domain error, or the two sides disagree -> no two-sided limit). */
  function limitSeries(f, info, steps) {
    const { target, side } = info;

    const pointsFor = h => {
      if (target === Infinity) return [1 / h];
      if (target === -Infinity) return [-1 / h];
      if (side === '+') return [target + h];
      if (side === '-') return [target - h];
      return [target + h, target - h];
    };

    const means = [];

    for (const h of steps) {
      const values = pointsFor(h).map(p => safeEval(f, p));
      if (values.some(v => v === null)) return null;

      const spread = Math.max(...values) - Math.min(...values);
      const mag = Math.max(1, ...values.map(Math.abs));
      if (spread > 0.05 * mag) return null;

      means.push(values.reduce((acc, v) => acc + v, 0) / values.length);
    }

    return means;
  }

  function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function richardsonFrom(means) {
    for (let i = 0; i + 2 < means.length; i++) {
      const a = means[i];
      const b = means[i + 1];
      const c = means[i + 2];
      const d1 = b - a;
      const d2 = c - b;
      const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), 1e-12);

      if (Math.abs(d1) < scale * 1e-9 && Math.abs(d2) < scale * 1e-9) {
        return { estimate: c, residual: scale * 1e-9, converged: true };
      }

      const ratio = d1 === 0 ? 0 : d2 / d1;
      if (ratio > 0 && ratio < 0.8) {
        const correction = d2 * ratio / (1 - ratio);
        if (Math.abs(correction) <= scale * 1e-2) {
          const estimate = c + correction;
          if (Number.isFinite(estimate)) {
            return { estimate, residual: Math.abs(correction), converged: true };
          }
        }
      }
    }
    return null;
  }

  function bandFrom(means) {
    const value = median(means);
    const spread = Math.max(...means) - Math.min(...means);
    const scale = Math.max(1, Math.abs(value));
    if (spread > 1e-2 * scale) return null;
    return { estimate: value, residual: spread, converged: false };
  }

  /* 中心平均估计器 —— 专治「高阶抵消」型极限。

     背景（真实案例）：((1+x)^{1/x} - e + (e/2)x - (11e/24)x² + (7e/16)x³)/x⁴
     的分子是若干 O(1) 项相减后剩下的 O(x⁴)。x 小到 1e-3 以下时 double 的
     舍入误差已经和真值同量级，采样值退化成纯噪声：
         h=1e-2 → 1.144   h=1e-3 → 0.855   h=1e-4 → −2991   h=1e-5 → 1.8e9
     于是 estimateLimit 两侧不一致 + 双档不收敛，直接返回 null ——
     一道「标准答案符号写反」的题就这样从闸门下面滑了过去。

     关键观察：当两侧各自收敛到同一个 L 时，奇次误差项在 (f(t+h)+f(t−h))/2
     里相消，剩下的误差是 O(h²)，在舍入淹没之前一直是干净的。
     上面那道题的中心平均：1.1661 → 1.1576 → 1.1552 → 1.1549 → 1.15478，
     真值 1.15479785。

     代价是「两侧同值」这个前提必须单独验证，否则 lim(x→0) 1/x 的中心平均
     恒为 0，会被误判成「极限是 0」。所以这里要求：
       · |(f(t+h)−f(t−h))/2| 随 h 减小而减小 —— 说明两侧在往同一个值靠，
         而不是发散（1/x 会增大）或跳变（sign(x) 保持常数）；
       · 中心平均本身落在一个足够窄的带里。
     两条都成立才下结论；任何一条不成立就返回 null —— 宁可不确定。 */
  function centeredEstimate(f, info) {
    if (!Number.isFinite(info.target) || info.side) return null;

    const steps = [1e-1, 5e-2, 2e-2, 1e-2, 5e-3, 2e-3];
    const avgs = [];
    const hds = [];

    for (const h of steps) {
      const left = safeEval(f, info.target - h);
      const right = safeEval(f, info.target + h);
      if (left === null || right === null) break;

      avgs.push((left + right) / 2);
      hds.push((right - left) / 2);
    }

    if (avgs.length < 3) return null;

    // 圈定「|hd| 还在随 h 缩小」的可靠前缀，一旦不再缩小就停 —— 后面都是噪声。
    let used = 1;
    for (let i = 1; i < hds.length; i++) {
      if (Math.abs(hds[i]) <= Math.abs(hds[i - 1]) * 1.05) used++;
      else break;
    }

    if (used < 3) return null;

    const firstHd = Math.abs(hds[0]);
    const lastHd = Math.abs(hds[used - 1]);
    if (firstHd > 0 && lastHd > 0 && lastHd > firstHd * 0.5) return null;

    // 从可靠前缀的尾部往回取「最窄的那一段」：O(h²) 误差在粗端还很大，
    // 把 h=1e-1 那种点算进去会让带宽虚高，反而判不出来。
    let start = used - 1;
    for (let i = used - 2; i >= 0; i--) {
      const slice = avgs.slice(i, used);
      const value = median(slice);
      const spread = Math.max(...slice) - Math.min(...slice);
      if (spread > 1e-3 * Math.max(1, Math.abs(value))) break;
      start = i;
    }

    const band = avgs.slice(start, used);
    if (band.length < 3) return null;

    const value = median(band);
    const spread = Math.max(...band) - Math.min(...band);
    const scale = Math.max(1, Math.abs(value));

    if (!Number.isFinite(value)) return null;
    if (spread > 1e-2 * scale) return null;

    // 带宽足够窄就当成收敛：调用方会据此收紧等价/拒稿容差，
    // 这正是「符号写反」能立刻被判死的依据。
    return {
      estimate: value,
      residual: spread,
      converged: spread <= 1e-3 * scale,
      centered: true
    };
  }

  /* 干净发散证据 —— 只证明「AI 给的这个有限答案不可能对」，不回答真正的极限是什么。

     闸门要拒的是一道题，不是要给出正确答案。所以这里刻意做弱判断：
     「有限候选 + 采样呈干净的爆炸特征」已经足够说明这个有限数不可能正确，
     至于真值是 +∞、−∞ 还是不存在，引擎不必、也不该去猜。

     触发条件刻意严格（宁漏勿错）：
       · 只采 1e-2 / 1e-3 / 1e-4 三档。1e-5 起舍入开始污染，
         L8-3 那种题在 1e-5 上自己就先崩了（+7.5e5 / −1.0e6），把噪声当发散会误杀；
       · 幅度必须逐档放大且每档至少 ×5 —— 收敛的函数不可能这样，
         而 1/x 型（×10）和 1/x² 型（×100）都能过；
       · 单侧满足即成立：单侧发散就足以说明双侧极限不存在。 */
  function divergesCleanly(f, info) {
    const steps = [1e-2, 1e-3, 1e-4];

    const sideDiverges = sign => {
      const mags = [];

      for (const h of steps) {
        const point = Number.isFinite(info.target) ? info.target + sign * h : sign / h;
        const value = safeEval(f, point);
        if (value === null) return false;
        mags.push(Math.abs(value));
      }

      for (let i = 1; i < mags.length; i++) {
        if (!(mags[i] >= mags[i - 1] * 5)) return false;
      }

      return true;
    };

    if (!Number.isFinite(info.target)) {
      return sideDiverges(info.target > 0 ? 1 : -1);
    }

    if (info.side === '+') return sideDiverges(1);
    if (info.side === '-') return sideDiverges(-1);

    return sideDiverges(1) || sideDiverges(-1);
  }

  /* Two sampling regimes, deliberately:
     - coarse (1e-2..1e-3) is immune to catastrophic cancellation, but converges
       slowly for functions whose error is O(h);
     - fine (1e-3..1e-4) resolves those, yet sits just above the precision cliff
       (at 1e-5 the same samples drift by up to 4.6e-2).
     Neither is trustworthy alone, so they cross-check each other. When they
     disagree the sampling is unreliable and we refuse to conclude. That is the
     only way to add coverage without ever rejecting a correct answer. */
  const COARSE_FINITE = [1e-2, 5e-3, 2e-3, 1e-3];
  const FINE_FINITE = [1e-3, 5e-4, 2e-4, 1e-4];
  const COARSE_INFINITE = [1e-2, 1e-3, 1e-4, 1e-5];
  const FINE_INFINITE = [1e-3, 1e-4, 1e-5, 1e-6];

  function estimateLimit(f, info) {
    const infinite = !Number.isFinite(info.target);

    const coarseMeans = limitSeries(f, info, infinite ? COARSE_INFINITE : COARSE_FINITE);
    const fineMeans = limitSeries(f, info, infinite ? FINE_INFINITE : FINE_FINITE);

    const coarse = coarseMeans ? (richardsonFrom(coarseMeans) || bandFrom(coarseMeans)) : null;
    const fine = fineMeans ? (richardsonFrom(fineMeans) || bandFrom(fineMeans)) : null;

    const primary =
      (fine && fine.converged) ? fine
        : (coarse && coarse.converged) ? coarse
          : (fine || coarse);

    if (!primary || !Number.isFinite(primary.estimate)) return centeredEstimate(f, info);

    const scale = Math.max(1, Math.abs(primary.estimate));

    if (coarse && fine && Math.abs(coarse.estimate - fine.estimate) > 2e-2 * scale) {
      return null;
    }

    return { estimate: primary.estimate, residual: primary.residual, converged: primary.converged };
  }

  /* Numeric value of an answer that is not a plain number — e.g. "e^2", "\ln 2",
     "(ln2)^2/2". Extends deterministic coverage to transcendental answers. */
  function constantValue(candidate) {
    const a = atom(candidate);
    if (a) return a.kind === 'number' ? a.value : null;

    const f = tryParse(candidate, 'x');
    if (!f) return null;

    const v = safeEval(f, 0);
    return v === null ? null : v;
  }

  /* 候选答案是 ±∞ / 不存在 时，判的是「趋势」而不是数值。

     这个函数曾经被调用但从未定义 —— 于是任何一道标准答案是 ±∞ 或「不存在」
     的极限题，走到 verifyLimit 都会抛 ReferenceError，把整个判题/闸门链路炸掉。
     测试一直没碰到这条路径，因为备用题库和探针里的极限答案都是有限数。
     现在把它补全，并且刻意保持保守：
       finite           收敛到有限值
       positiveInfinity / negativeInfinity  干净发散且方向明确
       dne              两侧对不上（一侧有限一侧无穷、符号相反、或震荡发散）
       null             判不了

     阈值与 divergesCleanly 一致（逐档 ×5），外加一条「带宽」判断来识别收敛。
     慢发散（比如 ln x → −∞，每档只涨 1.5 倍）会落到 null —— 宁可不确定。 */
  const TREND_STEPS = [1e-2, 1e-3, 1e-4];

  function sideTrend(f, info, sign) {
    const vals = [];

    for (const h of TREND_STEPS) {
      const point = Number.isFinite(info.target) ? info.target + sign * h : sign / h;
      const value = safeEval(f, point);
      if (value === null) return null;
      vals.push(value);
    }

    let blowUp = true;

    for (let i = 1; i < vals.length; i++) {
      if (!(Math.abs(vals[i]) >= Math.abs(vals[i - 1]) * 5)) { blowUp = false; break; }
    }

    if (blowUp) {
      if (vals.every(v => v > 0)) return 'positiveInfinity';
      if (vals.every(v => v < 0)) return 'negativeInfinity';
      return 'unstable';
    }

    const spread = Math.max(...vals) - Math.min(...vals);
    const scale = Math.max(1, ...vals.map(Math.abs));
    if (spread <= 0.05 * scale) return 'finite';

    return null;
  }

  function limitTrend(f, info) {
    if (info.side === '+') return sideTrend(f, info, 1);
    if (info.side === '-') return sideTrend(f, info, -1);
    if (!Number.isFinite(info.target)) return sideTrend(f, info, info.target > 0 ? 1 : -1);

    const left = sideTrend(f, info, -1);
    const right = sideTrend(f, info, 1);
    if (!left || !right) return null;

    if (left === 'finite' && right === 'finite') return 'finite';
    if (left === 'positiveInfinity' && right === 'positiveInfinity') return 'positiveInfinity';
    if (left === 'negativeInfinity' && right === 'negativeInfinity') return 'negativeInfinity';

    return 'dne';
  }

  function verifyLimit(question, candidate) {
    const info = extractLimit(question.expression || question.prompt || '');
    if (!info) return 'uncertain';

    const f = tryParse(info.body, info.variable);
    if (!f) return 'uncertain';

    const cand = atom(candidate) || { kind: 'expression' };

    // 含混写法（"无穷"、"发散"、"±∞"）和非法标量（1/0）不判 —— 既可能对也可能不对。
    if (cand.kind === 'ambiguous' || cand.kind === 'invalid') return 'uncertain';

    if (cand.kind !== 'number' && cand.kind !== 'expression') {
      const trend = limitTrend(f, info);
      if (!trend) return 'uncertain';
      if (trend === 'finite') return 'not_equivalent';
      if (trend === cand.kind) return 'equivalent';
      // 「不存在」与「±∞」在教材口径下互相包含（非正常极限也写作极限不存在），
      // 这条边界引擎分不清，所以不判。
      if (trend === 'dne' || cand.kind === 'dne') return 'uncertain';
      return 'not_equivalent';
    }

    const target = cand.kind === 'number' ? cand.value : constantValue(candidate);
    if (target === null) return 'uncertain';

    // 有限候选 + 干净发散证据 → 直接判错，估计器都不用跑。
    // 放在 estimateLimit 之前是有意的：发散题的采样本来就收敛不了，
    // 让估计器先去啃它只会被噪声带偏，不如先判这条更硬也更省事。
    if (divergesCleanly(f, info)) return 'not_equivalent';

    const result = estimateLimit(f, info);
    if (result === null) return 'uncertain';

    const diff = Math.abs(result.estimate - target);
    const scale = Math.max(1, Math.abs(target), Math.abs(result.estimate));

    const equalTol = result.converged
      ? Math.max(20 * result.residual, 1e-3 * scale)
      : 2e-2 * scale;
    const rejectTol = result.converged ? 1e-2 * scale : 5e-2 * scale;

    if (diff <= equalTol) return 'equivalent';
    if (diff > rejectTol) return 'not_equivalent';
    return 'uncertain';
  }

  function verifyDerivative(question, candidate) {
    const definition = splitDefinition(question.expression || question.prompt || '');
    if (definition.implicit) return 'uncertain'; // e.g. x^2+xy+y^2=1 — not f(x)=

    const order = inferDerivativeOrder(question);
    if (order > 2) return 'uncertain';

    const f = tryParse(definition.body, 'x');
    const g = tryParse(rhsOf(candidate), 'x');
    if (!f || !g) return 'uncertain';

    // Second derivatives need a looser window: the numeric second difference is
    // inherently noisier than the central first difference.
    const tolerance = order === 2 ? 1e-3 : 1e-5;

    let checked = 0;
    let bad = 0;

    for (const x of SAMPLE_POINTS) {
      const d = numericDerivativeOfOrder(f, x, order);
      if (d === null) continue;
      const gv = safeEval(g, x);
      if (gv === null) continue;
      checked++;
      if (!closeEnough(d, gv, tolerance)) bad++;
    }

    if (checked < 4) return 'uncertain';
    if (bad === 0) return 'equivalent';
    if (bad === checked) return 'not_equivalent';
    return 'uncertain';
  }

  function verifyIntegral(question, candidate) {
    const info = extractIntegral(question.expression || question.prompt || '');
    if (!info) return 'uncertain';

    const f = tryParse(info.body, 'x');
    if (!f) return 'uncertain';

    if (info.definite) {
      const a = tryParse(rhsOf(info.lower), 'x');
      const b = tryParse(rhsOf(info.upper), 'x');
      if (!a || !b) return 'uncertain';

      const exact = numericIntegral(f, a(0), b(0));
      if (exact === null) return 'uncertain';

      const direct = compare(candidate, String(exact));
      if (direct !== 'uncertain') return direct;

      const g = tryParse(stripPlusC(candidate), 'x');
      if (!g) return 'uncertain';
      const gv = safeEval(g, 0);
      if (gv === null) return 'uncertain';
      return closeEnough(gv, exact, 1e-7) ? 'equivalent' : 'not_equivalent';
    }

    // Indefinite: correct iff the derivative of the candidate equals the integrand.
    const F = tryParse(stripPlusC(candidate), 'x');
    if (!F) return 'uncertain';

    let checked = 0;
    let bad = 0;

    for (const x of SAMPLE_POINTS) {
      const fx = safeEval(f, x);
      if (fx === null) continue;
      const d = numericDerivative(F, x);
      if (d === null) continue;
      checked++;
      if (!closeEnough(d, fx, 1e-5)) bad++;
    }

    if (checked < 4) return 'uncertain';
    if (bad === 0) return 'equivalent';
    if (bad === checked) return 'not_equivalent';
    return 'uncertain';
  }

  /* Structural check only: does `candidate` actually satisfy the question,
     judged by the maths rather than by string similarity?
     Used by the generation gate, where the candidate IS the canonical answer
     (so a self-comparison would trivially "pass" and hide a wrong answer). */
  function verifyAnswerAgainstQuestion(question, candidate) {
    if (!question || typeof candidate !== 'string' || !candidate.trim()) return 'uncertain';

    if (question.module === 'limit') return verifyLimit(question, candidate);
    if (question.module === 'derivative') return verifyDerivative(question, candidate);
    if (question.module === 'integral') return verifyIntegral(question, candidate);

    return 'uncertain';
  }

  /* 「引擎有没有能力验证这道题」—— 与这一次数值收不收敛无关。
     这里复刻的是 verify* 三个函数真正的前置条件：读不出题干，
     后面的采样根本无从谈起。线上 41 题里 16 道的题干属于这一类
     （Σ 求和型极限、分段函数、隐函数、参数方程、被积函数含 dx 排布…）。 */
  function shapeSupport(question) {
    if (!question || typeof question !== 'object') {
      return { ok: false, reason: 'missing_question' };
    }

    const src = question.expression || question.prompt || '';
    if (!src) return { ok: false, reason: 'missing_expression' };

    if (question.module === 'limit') {
      const info = extractLimit(src);
      if (!info) return { ok: false, reason: 'limit_shape_unsupported' };
      return tryParse(info.body, info.variable)
        ? { ok: true, reason: 'limit_ok' }
        : { ok: false, reason: 'limit_body_unparseable' };
    }

    if (question.module === 'derivative') {
      const definition = splitDefinition(src);
      if (definition.implicit) return { ok: false, reason: 'implicit_relation' };
      if (!tryParse(definition.body, 'x')) return { ok: false, reason: 'derivative_body_unparseable' };
      if (inferDerivativeOrder(question) > 2) return { ok: false, reason: 'high_order_derivative' };
      return { ok: true, reason: 'derivative_ok' };
    }

    if (question.module === 'integral') {
      const info = extractIntegral(src);
      if (!info) return { ok: false, reason: 'integral_shape_unsupported' };
      return tryParse(info.body, 'x')
        ? { ok: true, reason: 'integral_ok' }
        : { ok: false, reason: 'integrand_unparseable' };
    }

    return { ok: false, reason: 'module_unsupported' };
  }

  /* 分级 + 验证结论，一次算清。 */
  function verificationProfile(question) {
    const support = shapeSupport(question);

    if (!support.ok) {
      return {
        tier: TIER.C,
        readable: false,
        verdict: 'uncertain',
        reason: support.reason
      };
    }

    const verdict = verifyAnswerAgainstQuestion(question, String(question?.answer ?? ''));

    return {
      tier: verdict === 'uncertain' ? TIER.B : TIER.A,
      readable: true,
      verdict,
      reason: support.reason
    };
  }

  /* 分层判定 —— 判题唯一入口。层数写进返回值，报告才分得清确定性覆盖率
     到底靠哪一层涨上来的：

       scalar      标量比较就够了（纯数字/分数/±∞/不存在）
       structural  标量比不了，但结构检查能判（表达式、需要采样）
       none        机器判不了 → 交给模型兜底

     顺序不能倒：compare 便宜且是精确有理数比较，能定就别去做采样。 */
  function judgeDeterministic(question, candidate) {
    if (!question || typeof candidate !== 'string' || !candidate.trim()) {
      return { verdict: 'uncertain', layer: 'none' };
    }

    const direct = compare(candidate, question.answer);
    if (direct !== 'uncertain') return { verdict: direct, layer: 'scalar' };

    const structural = verifyAnswerAgainstQuestion(question, candidate);
    if (structural !== 'uncertain') return { verdict: structural, layer: 'structural' };

    return { verdict: 'uncertain', layer: 'none' };
  }

  /* Unified entry used by the judge: cheap atom comparison first, then the
     structural check. Same engine as the gate, so the two can never disagree
     about what counts as the right answer. */
  function verifyAgainstQuestion(question, candidate) {
    return judgeDeterministic(question, candidate).verdict;
  }

  /* 模型结论的可采信性 —— 前后端共用同一条规则，避免两边口径漂移。
     单向原则：模型只能把答案判「错」，不能判「对」。

     为什么不能反过来？两个方向的错误代价完全不对称：
       · 错答被判对 → 学习数据被污染，自适应难度被带偏，且用户永远不知道
       · 对答被判无法判定 → 用户再提交一次，损失一次交互
     所以模型说 equivalent 时，最多只算「可能对」——确定性引擎与结构检查都
     给不出结论，就老实说给不出结论（uncertain），而不是把权力让给模型。

     返回 null 表示不采信。 */
  function trustModelVerdict(verdict, confidence, floor) {
    const v = typeof verdict === 'string' ? verdict.trim().toLowerCase() : '';
    const conf = typeof confidence === 'number' && Number.isFinite(confidence) ? confidence : null;
    const min = typeof floor === 'number' && Number.isFinite(floor) ? floor : CONFIDENCE_TRUSTED;

    if (v !== 'not_equivalent') return null;
    if (conf === null || conf < min) return null;

    return { verdict: 'not_equivalent', trusted: true };
  }

  /* Are two expressions equal up to an additive constant? (indefinite integrals) */
  function differByConstant(candidateA, candidateB) {
    const a = tryParse(stripPlusC(candidateA), 'x');
    const b = tryParse(stripPlusC(candidateB), 'x');
    if (!a || !b) return 'uncertain';

    let checked = 0;
    let first = null;

    for (const x of SAMPLE_POINTS) {
      const av = safeEval(a, x);
      const bv = safeEval(b, x);
      if (av === null || bv === null) continue;
      checked++;

      const diff = av - bv;
      if (first === null) first = diff;
      else if (!closeEnough(diff, first, 1e-6)) return 'not_equivalent';
    }

    return checked >= 4 ? 'equivalent' : 'uncertain';
  }

  /* =========================================================
     Content snapshot + issue detection
     ========================================================= */

  function content(q) {
    return JSON.stringify([
      q?.module ?? '',
      q?.topic ?? '',
      q?.instruction || '',
      q?.expression || '',
      q?.prompt || '',
      String(q?.answer ?? ''),
      q?.solution || ''
    ]);
  }

  /* =========================================================
     Canonical Package —— 题目身份的不可变快照（Task 5D）
     =========================================================

     `content()` 已经能把七个 canonical 字段压成一个字符串，闸门用它比对快照。
     但快照只是**一个字符串**：谁都能重算一次 content() 把它盖掉。
     Task 5D 要的是「题目身份一旦确定就不许再变」这件事有个**可核对的指纹**，
     以及一份列清楚「这道题由什么构成」的包，供前端、判题、预取、复习队列
     共用同一个权威来源 —— 而不是各自照着 content() 再抄一遍字段清单。

     指纹里**只放身份**：
       question_id · 七个 canonical 字段 · source · verification 版本与快照
     刻意**不放 difficulty**：难度是标定出来的测量值，会随作答数据重算。
     把 difficulty 算进身份，等于每次重新标定都要换一个 question_id，
     历史记录与复习队列会被无谓地切碎。难度变化不是「题目变了」。
     同理也不放 displayTopic / displayDifficulty / metadataCorrection ——
     那些是展示层修正，改了不该让题目失效（见 content() 的注释）。 */

  const CANONICAL_FIELDS = [
    'module',
    'topic',
    'instruction',
    'expression',
    'prompt',
    'answer',
    'solution'
  ];

  /* FNV-1a 32 位。这里要的只是「同一份内容必须得到同一个指纹、任何一字节改动
     都必须改变指纹」，不需要密码学强度，也不需要依赖 crypto（浏览器与 Node
     两端都要跑，且要能同步调用）。 */
  function fingerprint(text) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  /* canonical 字段的统一取值：answer 一律转字符串，其余一律「原值或空串」。
     兜底改写（例如空 topic 补『综合基础』）在这里是禁止的 —— 那等于往身份里
     写一个题目本身没有的考点，快照与数据会当场分成两回事。 */
  function canonicalBody(q) {
    const body = {};
    for (const field of CANONICAL_FIELDS) {
      body[field] =
        field === 'answer'
          ? String(q?.answer ?? '')
          : (q?.[field] || '');
    }
    return body;
  }

  function canonicalVersions(q) {
    const v =
      q?.verification?.pipeline ||
      q?.verification?.versions ||
      q?.pipeline ||
      {};

    return {
      protocol: v.protocol ?? null,
      generator: v.generator ?? null,
      reviewer: v.reviewer ?? null,
      judge: v.judge ?? null,
      math_engine: v.math_engine ?? q?.verification?.version ?? null
    };
  }

  function canonicalDifficulty(q) {
    const value = Number(
      q?.calibratedDifficulty ??
      q?.provisionalDifficulty ??
      q?.requestedDifficulty ??
      q?.difficulty
    );
    return Number.isFinite(value) ? value : null;
  }

  /* 题目身份包。字段名按 Task 5D 的约定，前端 / 判题 / 预取 / 复习队列
     都从这里取，不要再自己拼字段清单。 */
  function canonicalPackage(q) {
    const body = canonicalBody(q);
    const verification = q?.verification;

    return {
      question_id: q?.question_id || q?.id || null,
      question: {
        module: body.module,
        topic: body.topic,
        instruction: body.instruction,
        expression: body.expression,
        prompt: body.prompt
      },
      canonical_answer: body.answer,
      solution: body.solution,
      module: body.module,
      topic: body.topic,
      difficulty: canonicalDifficulty(q),
      verification: verification
        ? {
            version: verification.version ?? null,
            status: verification.status ?? null,
            content: verification.content ?? null,
            confidence:
              typeof verification.confidence === 'number'
                ? verification.confidence
                : null
          }
        : null,
      source: q?.source || null,
      versions: canonicalVersions(q),
      created_at: q?.created_at || q?.createdAt || null
    };
  }

  /* 指纹的输入：身份包去掉 difficulty（理由见上）。question_id 为空时
     用空串占位 —— 「没有 id」也是一件必须被指纹记住的事，不能当作匹配。 */
  function canonicalDigestPayload(q) {
    const pkg = canonicalPackage(q);
    return JSON.stringify({
      question_id: pkg.question_id ?? '',
      question: pkg.question,
      canonical_answer: pkg.canonical_answer,
      solution: pkg.solution,
      verification: pkg.verification,
      source: pkg.source,
      versions: pkg.versions
    });
  }

  function canonicalDigest(q) {
    return fingerprint(canonicalDigestPayload(q));
  }

  /* 冻结：把指纹写在题目上。canonical_digest / canonical_frozen_at 都**不是**
     canonical 字段，因此不会影响 content() 快照，也不会让题目失效。 */
  function freezeCanonical(q, at) {
    if (!q || typeof q !== 'object') return q;

    q.canonical_digest = canonicalDigest(q);
    q.canonical_frozen_at = at || q.canonical_frozen_at || new Date().toISOString();

    return q;
  }

  /* 完整性核对。没有指纹的老数据一律视为「未记录」而不是「被改过」——
     历史记录、云端快照里大量题目是在 Task 5D 之前存下的，
     把它们判成篡改会让老用户一开 App 就满屏异常。 */
  function canonicalIntegrity(q) {
    const recorded = q?.canonical_digest;

    if (!recorded) {
      return { ok: true, recorded: null, actual: canonicalDigest(q), reason: 'unfrozen' };
    }

    const actual = canonicalDigest(q);

    return {
      ok: recorded === actual,
      recorded,
      actual,
      reason: recorded === actual ? 'intact' : 'mutated'
    };
  }

  function canonicalIntact(q) {
    return canonicalIntegrity(q).ok;
  }

  /* 两个版本之间到底哪几个 canonical 字段变了 —— 用于日志与测试断言，
     不要让调用方自己 diff。 */
  function canonicalChangedFields(before, after) {
    const a = canonicalBody(before);
    const b = canonicalBody(after);
    const changed = CANONICAL_FIELDS.filter(field => a[field] !== b[field]);

    if ((before?.question_id || before?.id || null) !== (after?.question_id || after?.id || null)) {
      changed.push('question_id');
    }

    return changed;
  }

  function issues(q) {
    const out = [];
    if (!q) return [CODES.QUESTION_INVALID];

    /* 被就地改写过的题目：连身份都不成立了，不必再往下验答案 ——
       拿一份「已经不知道是谁」的题去验证答案，只会得到一条误导性的结论。 */
    if (!canonicalIntact(q)) {
      out.push(CODES.CANONICAL_MUTATED);
      return out;
    }


    if (
      !['limit', 'derivative', 'integral'].includes(q.module) ||
      !(q.expression || q.prompt) ||
      !String(q.answer ?? '').trim() ||
      !q.solution
    ) {
      out.push(CODES.QUESTION_INVALID);
    }

    if (/需要重新设计|题目有误|题目错误|答案不对|无法作答|条件不足/.test(q.solution || '')) {
      out.push(CODES.QUESTION_INVALID);
    }

    if (atom(q.answer)?.kind === 'invalid') out.push(CODES.ANSWER_INVALID);

    const matches = [...(q.solution || '').matchAll(
      /(?:最终答案|答案|极限|结果)(?:为|是|等于|[:：])\s*(\\\([^\n]+?\\\)|[+\-]?\d+(?:\.\d+)?(?:\/\d+)?)(?=[。；，\s]|$)/g
    )];

    if (matches.some(m => compare(m[1], q.answer) === 'not_equivalent')) {
      out.push(CODES.SOLUTION_MISMATCH);
    }

    // The strongest check: does the canonical answer actually satisfy the question?
    // This is what catches the "-1/6 should be +1/6" class of error.
    if (!out.includes(CODES.QUESTION_INVALID)) {
      if (verifyAnswerAgainstQuestion(q, String(q.answer ?? '')) === 'not_equivalent') {
        out.push(CODES.ANSWER_FAILS_VERIFICATION);
      }
    }

    return out;
  }

  /* =========================================================
     Hard / Soft gate
     ========================================================= */

  function hardGate(verification) {
    if (!verification || verification.version !== VERSION) {
      return { ok: false, code: CODES.VERIFICATION_STALE };
    }

    const failed = HARD_FIELDS.filter(k => verification[k] !== true);
    if (failed.length) {
      return { ok: false, code: CODES.GENERATION_REJECTED, reason: 'hard fields failed', fields: failed };
    }

    if (Array.isArray(verification.issues) && verification.issues.length) {
      return { ok: false, code: CODES.GENERATION_REJECTED, reason: 'reviewer reported issues', issues: verification.issues };
    }

    // confidence 必须是真正的数字。用 Number() 强转会把 '0.99' 这种字符串
    // 也当成高置信度放过，而服务端自己的审核器要求 typeof === 'number' ——
    // 两边规则不一致时，闸门就守不住了。
    const confidence = verification.confidence;
    if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < CONFIDENCE_FLOOR) {
      return { ok: false, code: CODES.GENERATION_REJECTED, reason: 'confidence below floor', confidence };
    }

    // Soft fields never reject — they route to secondary review or feed metadata correction.
    return { ok: true, needsSecondaryReview: confidence < CONFIDENCE_TRUSTED };
  }

  function gateDecision(q) {
    const local = issues(q);

    if (local.length) {
      return { ok: false, state: GATE.REJECTED, code: local[0], issues: local };
    }

    const verification = q?.verification;

    if (verification && verification.content !== undefined && verification.content !== content(q)) {
      return {
        ok: false,
        state: GATE.REJECTED,
        code: CODES.VERIFICATION_STALE,
        reason: 'content snapshot mismatch'
      };
    }

    const gate = hardGate(verification);

    if (!gate.ok) return { ...gate, state: GATE.REJECTED };

    /* 到这里 schema、快照、审核员硬字段全都过了。剩下唯一的问题是：
       引擎到底有没有独立验证过这道题的标准答案？

       Task 5C：对高风险数学内容，UNCERTAIN ≠ APPROVE。
       形态读不懂（Tier C）就等于「没验证过」—— 此时放行，靠的是模型自己的
       话，而线上 4/41 的错误标准答案恰恰是从这里漏出去的。
       所以 Tier C 在生成闸门这里不放行，调用方应当退到已校验的备用题库。
       少一道动态生成题可以接受，错一道进用户端不行。 */
    const profile = verificationProfile(q);

    if (profile.tier === TIER.C) {
      return {
        ok: false,
        state: GATE.UNCERTAIN,
        code: CODES.UNVERIFIED_SHAPE,
        tier: profile.tier,
        reason: profile.reason,
        // 不是「题目有问题」，是「机器验不了」—— 上层据此走 fallback，而不是报异常。
        unverified: true
      };
    }

    return {
      ok: true,
      state: GATE.VERIFIED,
      tier: profile.tier,
      verdict: profile.verdict,
      needsSecondaryReview: gate.needsSecondaryReview
    };
  }

  /* 生成闸门：只有 VERIFIED 才算过。Tier C（引擎验不了）一律不放行。 */
  function gateApproved(q) {
    return gateDecision(q).ok;
  }

  /* 判题时的「这道题可信吗」——只把明确有问题的（REJECTED）判为不可信。

     Tier C 在这里**放行**，这是有意的：题目本身没错、审核员也过了，
     只是引擎没法独立复核。判题阶段不是纠正题目的地方，把用户正在做的题
     判成「存在异常」并作废（用户白做一题、作答被丢弃）比不放行它更糟。
     真正拦住 Tier C 的地方是生成闸门 —— 让它一开始就进不来。 */
  function approved(q) {
    const decision = gateDecision(q);
    return decision.ok || decision.state === GATE.UNCERTAIN;
  }

  /* =========================================================
     Judge outcome routing — 错误状态分类
     =========================================================

     判题失败有好几种完全不同的原因，界面必须区别对待：

       question_untrusted  这道题本身不可信（没通过硬闸门）
                           → 作废这一题，换一道
       canonical_suspected 判题员怀疑题目给定的标准答案本身有问题
                           → 作废这一题，且不写入学习数据（不是学生的错）
       judge_unavailable   判题服务连不上 / 超时 / 返回坏数据
                           → 题目没问题，保留题目和用户答案，让用户重试
       judge_uncertain     判题服务回答了，但结论不足以采信
                           → 同上，保留题目

     把它们压成一个 trusted:false，上层就只能一刀切，于是网络抖动会被
     说成「这道题存在异常，已自动作废」——用户被误导，作答也被丢掉。
     这条规则放在引擎里，是为了能被测试锁住。 */
  const JUDGE_REASONS = {
    DETERMINISTIC: 'deterministic',
    QUESTION_UNTRUSTED: 'question_untrusted',
    CANONICAL_SUSPECTED: 'canonical_suspected',
    JUDGE_UNAVAILABLE: 'judge_unavailable',
    JUDGE_UNCERTAIN: 'judge_uncertain'
  };

  function judgeOutcome(verdict) {
    if (verdict && verdict.trusted === true) {
      return { action: 'accept', retryable: false };
    }

    const reason = verdict && verdict.reason;

    if (reason === JUDGE_REASONS.QUESTION_UNTRUSTED) {
      return { action: 'void_question', retryable: false };
    }

    // 判题员怀疑标准答案 → 作废题目，但不能让学生背这口锅。
    if (reason === JUDGE_REASONS.CANONICAL_SUSPECTED) {
      return { action: 'void_question', retryable: false, blameStudent: false };
    }

    // 兜底走重试：宁可让用户再提交一次，也不要把题目判成「有问题」。
    return { action: 'retry_judge', retryable: true };
  }

  const api = {
    VERSION,
    EPSILON,
    CONFIDENCE_FLOOR,
    CONFIDENCE_TRUSTED,
    CODES,
    fields,
    HARD_FIELDS,
    SOFT_FIELDS,
    normalize,
    atom,
    constantAtom,
    containsVariable,
    rational,
    compare,
    toInfix,
    tryParse,
    compile,
    constantValue,
    splitDefinition,
    rhsOf,
    numericDerivative,
    numericSecondDerivative,
    numericDerivativeOfOrder,
    inferDerivativeOrder,
    numericIntegral,
    estimateLimit,
    centeredEstimate,
    divergesCleanly,
    limitTrend,
    verifyLimit,
    verifyDerivative,
    verifyIntegral,
    verifyAgainstQuestion,
    verifyAnswerAgainstQuestion,
    judgeDeterministic,
    trustModelVerdict,
    differByConstant,
    extractLimit,
    extractIntegral,
    stripPlusC,
    content,
    CANONICAL_FIELDS,
    canonicalBody,
    canonicalPackage,
    canonicalDigest,
    canonicalDigestPayload,
    canonicalIntegrity,
    canonicalIntact,
    canonicalChangedFields,
    freezeCanonical,
    fingerprint,
    issues,
    hardGate,
    gateDecision,
    gateApproved,
    approved,
    shapeSupport,
    verificationProfile,
    GATE,
    TIER,
    JUDGE_REASONS,
    judgeOutcome
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MathQuality = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
