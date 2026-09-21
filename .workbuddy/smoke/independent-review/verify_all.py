"""CalcDaily 放行题 · 独立数学复核（sympy 解析 + mpmath 数值）

与项目 JS 引擎完全不同的实现：LaTeX 解析器不同、计算算法不同。
不做昂贵的符号化简（会挂死进程）。每题带超时，超时如实记为 unresolved。

用法：python verify_all.py <题目数组.json>
输入每条需含 round/id/module/difficulty/instruction/expression/answer。

已修的解析坑（全部来自 sympy 的 LaTeX 前端）：
  1. 裸 `e` 被当成符号 → 需替换为 E
  2. `\\ln 2` 解析成 log(2, E) 两参形式，N() 会报错 → 需归一化
  3. `y'=` / `y=` 前缀会让解析器崩溃 → 需剥离
  4. `\\lim` 解析出 Limit 对象，不能直接 lambdify → 取 args[0]
  5. ★ 极限点：不能一律按 x→0 求，必须按题面 `\\lim_{x\\to…}` 里的点求。
     v1 漏了这条，把 lim_{x→1} 与 lim_{x→∞} 误判成错题。
"""
import json
import re
import signal
import sys
import warnings

warnings.filterwarnings("ignore")

import sympy as sp
from sympy.parsing.latex import parse_latex
from sympy.core.function import AppliedUndef
from mpmath import mp, mpf, quad

mp.dps = 40

X = sp.Symbol("x", real=True)
E_SYM = sp.Symbol("e")           # parse_latex 把裸 e 解析成这个符号
PI_SYM = sp.Symbol("pi")         # parse_latex 把 \pi 解析成这个符号
PTS = [mpf("0.37"), mpf("0.71"), mpf("1.13"), mpf("2.31"), mpf("3.50")]


class Timeout(Exception):
    pass


def _to(signum, frame):
    raise Timeout()


signal.signal(signal.SIGALRM, _to)


def norm(s):
    t = str(s or "")
    t = t.replace("\\left", "").replace("\\right", "")
    for m in ("\\,", "\\!", "\\;", "\\ "):
        t = t.replace(m, "")
    t = re.sub(r"^\s*y\s*''\s*=", "", t)      # y'' =
    t = re.sub(r"^\s*y\s*'\s*=", "", t)       # y' =
    t = re.sub(r"^\s*y\s*=", "", t)           # y =
    t = re.sub(r"^\s*f\s*'\s*\(x\)\s*=", "", t)
    t = re.sub(r"^\s*f\s*\(x\)\s*=", "", t)
    t = re.sub(r"\+\s*C\s*$", "", t.strip())         # +C
    t = re.sub(r"\+\s*\\text\{C\}\s*$", "", t)
    return t.strip()


def fix_expr(e):
    """修正 sympy LaTeX 前端的四个坑：
       1. 裸 `e`      被解析成 Symbol('e')  而不是自然常数 E
       2. `\\pi`      被解析成 Symbol('pi') 而不是常数 pi
       3. `\\ln 2`    被解析成 log(2, E) 两参形式，N() 会报错
       4. `x(1+x²)`   被解析成**函数调用** x(...)，而不是乘法 x·(...)
          —— 例如 `\\frac{1}{x(1+x^2)}` 会得到 1/x(x**2+1)，求值直接 TypeError。
    不修这四处，sp.N() / lambdify 会把本可求值的式子当成符号或非法调用，数值复核失效。"""
    try:
        e = e.replace(E_SYM, sp.E)
    except Exception:
        pass
    try:
        e = e.replace(PI_SYM, sp.pi)
    except Exception:
        pass
    try:
        e = e.replace(
            lambda t: t.func == sp.log and len(t.args) == 2,
            lambda t: sp.log(t.args[0]) / sp.log(t.args[1]),
        )
    except Exception:
        pass
    try:
        e = e.replace(
            lambda t: isinstance(t, AppliedUndef) and len(t.args) == 1,
            lambda t: sp.Symbol(t.func.__name__, real=True) * t.args[0],
        )
    except Exception:
        pass
    return e


def parse_any(s):
    return fix_expr(parse_latex(norm(s)))


def lam(expr):
    return sp.lambdify(X, expr, "mpmath")


def re_of(v):
    """把结果强制成实数 mpf。
    坑：mpmath 不能直接转换 sympy 的 Float（TypeError: Cannot convert），
    必须经 str() 中转。"""
    if v is None:
        return None
    try:
        return mp.mpf(v)                       # mpmath 原生类型
    except Exception:
        pass
    try:
        return mp.mpf(str(sp.N(v, 30)))        # sympy 数值 → 字符串 → mpf
    except Exception:
        pass
    try:
        return mp.mpf(str(sp.N(sp.re(v), 30)))
    except Exception:
        return None


def close(a, b, tol):
    a, b = re_of(a), re_of(b)
    if a is None or b is None:
        return False
    if a != a or b != b:
        return False
    return abs(a - b) <= tol * max(mpf(1), abs(b))


def same_numeric(fa, fb, pts=PTS, tol=mpf("1e-8"), need=3):
    ok = tot = 0
    for p in pts:
        try:
            va, vb = re_of(fa(p)), re_of(fb(p))
        except Exception:
            continue
        if va is None or vb is None:
            continue
        tot += 1
        if close(va, vb, tol):
            ok += 1
    if tot < need:
        return None, "数值采样不足（%d 点可用）" % tot
    if ok == tot:
        return True, "numeric %d/%d" % (ok, tot)
    return False, "numeric %d/%d 不符" % (ok, tot)


def const_of(claim):
    """声称值取数值（应为常数）"""
    try:
        v = re_of(sp.N(claim, 30))
        return v if v is not None else None
    except Exception:
        return None


LIM_RE = re.compile(r"\\lim_\{x\\to\s*([^}]*)\}")


def limit_point(raw):
    """从题面 LaTeX 里取出真实的极限点。

    ★ 这是一个真实踩过的坑：v1 版本把**所有**极限都按 x→0 求，
      于是 lim_{x->1}(x^2-1)/(x-1)=2 和 lim_{x->inf}(1+1/x)^(2x)=e^2
      被误报成错题（假阴性）。题面写了极限点就必须按题面求。

    返回 (point, side)：point 为 mpf 或 ±mp.inf；side ∈ {0(双侧), +1(右), -1(左)}。
    """
    m = LIM_RE.search(raw or "")
    tok = (m.group(1) if m else "0").strip()
    side = 0
    if "^+" in tok or "^{+}" in tok:
        side, tok = 1, tok.replace("^{+}", "").replace("^+", "")
    elif "^-" in tok or "^{-}" in tok:
        side, tok = -1, tok.replace("^{-}", "").replace("^-", "")
    tok = tok.replace("\\infty", "oo").replace("+", "").strip()
    if tok.startswith("oo"):
        return mp.inf, side
    if tok.startswith("-oo"):
        return -mp.inf, side
    try:
        v = re_of(sp.N(parse_any(tok), 30))
        if v is not None:
            return v, side
    except Exception:
        pass
    return mpf(0), side


def _lim_at(f, p, side):
    """在点 p 求极限。

    ★ 两个 mpmath 的坑：
      a) direction=0 会去算 f(x0 + 0/(k+1)) = f(x0)，遇到 0/0 直接 ZeroDivisionError，
         所以必须显式给方向。
      b) mpmath 的单侧取样点是 x0 ± 1/(k+1)，即 x0±1, x0±1/2, x0±1/3 …
         **这些点可能正好落在函数的极点上**。例如 lim_{x→0}(1+2x)^{1/x}
         左侧取样会撞上 x=-1/2（此处底数为 0），被判成「数值极限失败」。
         解法：把步长换成 u³（u=1/(k+1)），取样点变成 x0±1, x0±1/8, x0±1/27 …
         既避开极点，又保持单调趋近。
    """
    def right():
        return mp.limit(lambda u: f(p + u ** 3), 0, direction=1)

    def left():
        return mp.limit(lambda u: f(p - u ** 3), 0, direction=1)

    if p == mp.inf:
        return mp.limit(lambda t: f(1 / t), 0, direction=1)      # t→0⁺ ⇒ x→+∞
    if p == -mp.inf:
        return mp.limit(lambda t: f(-1 / t), 0, direction=1)     # t→0⁺ ⇒ x→-∞
    if side > 0:
        return right()
    if side < 0:
        return left()
    r = right()
    l = left()
    if not close(re_of(r), re_of(l), mpf("1e-6")):
        return None                                            # 双侧不等 ⇒ 极限不存在
    return r


def check_limit(q):
    raw = q["expression"]
    p, side = limit_point(raw)
    e = parse_any(raw)
    if isinstance(e, sp.Limit):
        e = e.args[0]                      # 取被求极限的表达式
    f = lam(e)
    claim = parse_any(q["answer"])
    cv = const_of(claim)
    if cv is None:
        return None, "声称值非数值：%s" % q["answer"][:28]
    try:
        got = _lim_at(f, p, side)
    except Exception:
        got = None
    if got is None:
        return None, "数值极限失败（含双侧不等）"
    got = re_of(got)
    if got is None:
        return None, "数值极限返回非实数"
    at = mp.nstr(p, 6)
    if close(got, cv, mpf("1e-6")):
        return True, "numeric-limit@%s %s" % (at, mp.nstr(got, 10))
    return False, "极限@%s %s vs 声称 %s" % (at, mp.nstr(got, 10), mp.nstr(cv, 10))


def check_derivative(q):
    rhs = q["expression"].split("=", 1)[1] if "=" in q["expression"] else q["expression"]
    y = lam(parse_any(rhs))
    claimed = lam(parse_any(q["answer"]))
    order = 2 if "二阶" in q["instruction"] else 1
    h = mpf("1e-6") if order == 1 else mpf("1e-4")

    def numd(p):
        if order == 1:
            return (y(p + h) - y(p - h)) / (2 * h)
        return (y(p + h) - 2 * y(p) + y(p - h)) / (h * h)

    return same_numeric(numd, claimed, tol=mpf("1e-4") if order == 2 else mpf("1e-5"))


def check_integral(q):
    expr = parse_any(q["expression"])
    if not isinstance(expr, sp.Integral):
        return None, "解析结果不是 Integral"
    var, *lims = expr.limits[0]
    f = expr.function
    claim = parse_any(q["answer"])

    if lims:
        a, b = lims[0], lims[1]
        fa = lam(f)
        try:
            lo, hi = re_of(sp.N(a, 30)), re_of(sp.N(b, 30))
            got = re_of(quad(fa, [lo, hi]))
        except Exception as ex:
            return None, "数值积分失败 %s" % type(ex).__name__
        if got is None:
            return None, "数值积分返回非数"
        cv = const_of(claim)
        if cv is None:
            return None, "声称值非数值：%s" % q["answer"][:28]
        if close(got, cv, mpf("1e-7")):
            return True, "quad %s" % mp.nstr(got, 10)
        return False, "quad %s vs 声称 %s" % (mp.nstr(got, 10), mp.nstr(cv, 10))

    # 不定积分：对声称原函数求数值导，与被积函数比对
    try:
        F = lam(claim)
    except Exception as ex:
        return None, "原函数无法数值化 %s" % type(ex).__name__
    h = mpf("1e-6")

    def dF(p):
        return (F(p + h) - F(p - h)) / (2 * h)

    return same_numeric(dF, lam(f), tol=mpf("1e-5"))


ROUTER = {"limit": check_limit, "derivative": check_derivative, "integral": check_integral}


def main():
    qs = json.load(open(sys.argv[1]))
    rows = []
    for i, q in enumerate(qs):
        fn = ROUTER.get(q["module"])
        try:
            signal.alarm(30)
            ok, how = fn(q)
            signal.alarm(0)
        except Timeout:
            signal.alarm(0)
            ok, how = None, "超时 30s"
        except Exception as e:
            signal.alarm(0)
            ok, how = None, "%s: %s" % (type(e).__name__, str(e)[:55])
        rows.append({**q, "ok": ok, "how": how})
        sys.stderr.write("\r  复核 %d/%d" % (i + 1, len(qs)))
    sys.stderr.write("\n")

    npass = sum(1 for r in rows if r["ok"] is True)
    nfail = sum(1 for r in rows if r["ok"] is False)
    nres = sum(1 for r in rows if r["ok"] is None)

    print("=" * 78)
    print("独立数学复核 · 200 题 benchmark（sympy 解析 + mpmath 数值）")
    print("=" * 78)
    print("样本          : %d 道已放行题" % len(rows))
    print("通过          : %d" % npass)
    print("不通过        : %d" % nfail)
    print("无法自动判定   : %d" % nres)
    print()

    if nfail:
        print("-" * 78)
        print("!! 不通过的题 —— 需人工确认")
        print("-" * 78)
        for r in rows:
            if r["ok"] is False:
                print("[%s] %s (%s L%s)" % (r["round"], r["id"], r["module"], r["difficulty"]))
                print("   题: %s" % r["expression"][:100])
                print("   答: %s" % r["answer"][:70])
                print("   判: %s" % r["how"])
                print()

    print("-" * 78)
    print("仍无法自动判定（如实列出）")
    print("-" * 78)
    for r in rows:
        if r["ok"] is None:
            print("[%s] %-18s %-6s :: %s" % (r["round"], r["id"], r["instruction"][:6],
                                             r["expression"][:50]))
            print("        答 %-40s ← %s" % (r["answer"][:40], r["how"]))
    print()

    dec = npass + nfail
    print("=" * 78)
    if dec:
        print("在【可自动判定】的 %d 道中：正确 %d，错误 %d，正确率 %.2f%%"
              % (dec, npass, nfail, 100.0 * npass / dec))
    print("在【全部放行】的 %d 道中：已确认正确 %d，未判定 %d，错误 %d"
          % (len(rows), npass, nres, nfail))
    print("=" * 78)
    json.dump(rows, open("/tmp/independent_result.json", "w"), ensure_ascii=False, indent=1)


main()
