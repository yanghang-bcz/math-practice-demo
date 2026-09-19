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
    FALLBACK_USED: 'FALLBACK_USED'
  };

  /* =========================================================
     Normalization + deterministic atom comparison
     ========================================================= */

  function normalize(v) {
    return String(v ?? '')
      .normalize('NFKC')
      .trim()
      .replace(/[\u2212\u2013\u2014]/g, '-')
      .replace(/\\(?:left|right)/g, '')
      .replace(/\\(?:dfrac|tfrac|frac)\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '($1)/($2)')
      .replace(/\(([+-]?\d+(?:\.\d+)?)\)/g, '$1')
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

  function compare(a, b) {
    const x = atom(a);
    const y = atom(b);

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

      if (t[p] !== '{') { out += m[0]; i = m.index + m[0].length; continue; }

      const aEnd = matchBrace(t, p);
      if (aEnd < 0) { out += m[0]; i = m.index + m[0].length; continue; }

      let q = aEnd;
      while (t[q] === ' ') q++;

      if (t[q] !== '{') { out += m[0]; i = m.index + m[0].length; continue; }

      const bEnd = matchBrace(t, q);
      if (bEnd < 0) { out += m[0]; i = m.index + m[0].length; continue; }

      const numerator = expandFrac(t.slice(p + 1, aEnd - 1), (depth || 0) + 1);
      const denominator = expandFrac(t.slice(q + 1, bEnd - 1), (depth || 0) + 1);

      out += '((' + numerator + ')/(' + denominator + '))';
      i = bEnd;
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

    return { lower, upper, body, definite: lower !== null && upper !== null };
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

    if (!primary || !Number.isFinite(primary.estimate)) return null;

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

  function verifyLimit(question, candidate) {
    const info = extractLimit(question.expression || question.prompt || '');
    if (!info) return 'uncertain';

    const f = tryParse(info.body, info.variable);
    if (!f) return 'uncertain';

    const cand = atom(candidate) || { kind: 'expression' };

    if (cand.kind !== 'number' && cand.kind !== 'expression') {
      const trend = limitTrend(f, info);
      if (!trend) return 'uncertain';
      return trend === cand.kind ? 'equivalent' : 'not_equivalent';
    }

    const target = cand.kind === 'number' ? cand.value : constantValue(candidate);
    if (target === null) return 'uncertain';

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

  /* Unified entry used by the judge: cheap atom comparison first, then the
     structural check. Same engine as the gate, so the two can never disagree
     about what counts as the right answer. */
  function verifyAgainstQuestion(question, candidate) {
    if (!question || typeof candidate !== 'string' || !candidate.trim()) return 'uncertain';

    const direct = compare(candidate, question.answer);
    if (direct !== 'uncertain') return direct;

    return verifyAnswerAgainstQuestion(question, candidate);
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

  function issues(q) {
    const out = [];
    if (!q) return [CODES.QUESTION_INVALID];

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
    if (local.length) return { ok: false, code: local[0], issues: local };

    const verification = q?.verification;

    if (verification && verification.content !== undefined && verification.content !== content(q)) {
      return { ok: false, code: CODES.VERIFICATION_STALE, reason: 'content snapshot mismatch' };
    }

    const gate = hardGate(verification);
    if (!gate.ok) return gate;

    return { ok: true, needsSecondaryReview: gate.needsSecondaryReview };
  }

  function approved(q) {
    return gateDecision(q).ok;
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
    verifyLimit,
    verifyDerivative,
    verifyIntegral,
    verifyAgainstQuestion,
    verifyAnswerAgainstQuestion,
    differByConstant,
    extractLimit,
    extractIntegral,
    stripPlusC,
    content,
    issues,
    hardGate,
    gateDecision,
    approved,
    JUDGE_REASONS,
    judgeOutcome
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MathQuality = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
