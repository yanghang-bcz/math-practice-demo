"""独立数值复核：18 道线上已放行题
实现完全独立于项目的 JS 引擎（纯 Python math），
用数值极限 / 数值微分 / 数值积分来判定，而不是读 Quality Gate 的结论。
"""
import math

PI = math.pi
fails = []
results = []


def note(tag, ok, detail):
    results.append((tag, ok, detail))
    if not ok:
        fails.append((tag, detail))


def num_lim(f, *pts, claimed, x0="0", rel=2e-3):
    """在递减的 x 上求值，看是否收敛到 claimed"""
    vals = [f(x) for x in pts]
    last = vals[-1]
    denom = max(abs(claimed), 1e-9)
    err = abs(last - claimed) / denom
    note("limit x→%s" % x0, err < rel,
         "数值 %.10f  声称 %.10f  相对误差 %.2e  采样=%s"
         % (last, claimed, err, ["%.4g" % v for v in vals]))


def num_d(f, x, h=1e-5, order=1):
    if order == 1:
        return (f(x + h) - f(x - h)) / (2 * h)
    return (f(x + h) - 2 * f(x) + f(x - h)) / (h * h)


def check_derivative(tag, y, xpts, claimed_d, order=1, tol=1e-4):
    bad = []
    for x in xpts:
        try:
            a = num_d(y, x, order=order)
            b = claimed_d(x)
        except Exception as e:
            bad.append("x=%.3g 求值异常 %s" % (x, e))
            continue
        rel = abs(a - b) / max(abs(b), 1e-9)
        if rel > tol:
            bad.append("x=%.3g 数值 %.8f vs 声称 %.8f (rel %.1e)" % (x, a, b, rel))
    note(tag, not bad, "; ".join(bad) if bad else "各采样点导函数一致（%d 点）" % len(xpts))


def simpson(f, a, b, n=20000):
    if n % 2:
        n += 1
    h = (b - a) / n
    s = f(a) + f(b)
    for i in range(1, n):
        s += (4 if i % 2 else 2) * f(a + i * h)
    return s * h / 3


def check_definite(tag, f, a, b, claimed, tol=1e-7):
    v = simpson(f, a, b)
    rel = abs(v - claimed) / max(abs(claimed), 1e-12)
    note(tag, rel < tol, "数值 %.10f  声称 %.10f  相对误差 %.2e" % (v, claimed, rel))


print("=" * 72)
print("一、极限（数值逼近，比较收敛值）")
print("=" * 72)
sm = [1e-2, 1e-3, 1e-4, 1e-5]
num_lim(lambda x: (math.cos(x) - math.exp(-x * x / 2)) / x ** 4, *sm, claimed=-1 / 12)
num_lim(lambda x: x * x * (1 / math.sin(x) ** 2 + 1 / math.cos(x) ** 2), *sm, claimed=1.0)
num_lim(lambda x: (math.tan(x) - x) / (x * x * math.log1p(x)), *sm, claimed=1 / 3)
num_lim(lambda x: 1 / x ** 2 - 1 / (x * math.tan(x)), *sm, claimed=1 / 3)
num_lim(lambda x: (math.log1p(x * x) - x * math.sin(x)) /
        (x * x * (math.exp(x * x) - 1)), *sm, claimed=-1 / 3)

print()
print("=" * 72)
print("二、二阶导数（数值二阶中心差分）")
print("=" * 72)
y6 = lambda x: math.log1p(x * x)
d6 = lambda x: 2 * (1 - x * x) / (1 + x * x) ** 2
check_derivative("[6] y=ln(1+x^2) → y''", y6, [0.3, 0.7, 1.2, 2.0], d6, order=2)

y7 = lambda x: math.atan((x + 1) / (x - 1))
d7 = lambda x: 2 * x / (x * x + 1) ** 2
check_derivative("[7] y=arctan((x+1)/(x-1)) → y''", y7, [2.0, 3.0, -1.0, -2.0], d7, order=2)

print()
print("=" * 72)
print("三、不定积分（对声称的原函数求数值导，与原被积函数对比）")
print("=" * 72)
xs = [0.3, 0.8, 1.4, 2.2]
check_derivative("[8] ∫dx/(1+sinx+cosx)", lambda x: math.log(abs(1 + math.tan(x / 2))),
                 xs, lambda x: 1 / (1 + math.sin(x) + math.cos(x)))
check_derivative("[9] ∫(x+2)/(x^2+2x+5)dx",
                 lambda x: 0.5 * math.log(x * x + 2 * x + 5) + 0.5 * math.atan((x + 1) / 2),
                 xs, lambda x: (x + 2) / (x * x + 2 * x + 5))
check_derivative("[12] ∫x·arctanx dx",
                 lambda x: (x * x + 1) / 2 * math.atan(x) - x / 2,
                 xs, lambda x: x * math.atan(x))
check_derivative("[14] ∫e^{2x}sin3x dx",
                 lambda x: math.exp(2 * x) / 13 * (2 * math.sin(3 * x) - 3 * math.cos(3 * x)),
                 xs, lambda x: math.exp(2 * x) * math.sin(3 * x))
check_derivative("[15] ∫dx/(x·√(x^2+x+1))",
                 lambda x: -math.log(abs((1 + math.sqrt(x * x + x + 1)) / x + 0.5)),
                 xs, lambda x: 1 / (x * math.sqrt(x * x + x + 1)))
check_derivative("[16] ∫dx/(2+sinx+cosx)",
                 lambda x: math.sqrt(2) * math.atan((math.tan(x / 2) + 1) / math.sqrt(2)),
                 xs, lambda x: 1 / (2 + math.sin(x) + math.cos(x)))
check_derivative("[17] ∫(x^4+1)/(x^6+1)dx",
                 lambda x: math.atan(x) + math.atan(x ** 3) / 3,
                 xs, lambda x: (x ** 4 + 1) / (x ** 6 + 1))

print()
print("=" * 72)
print("四、定积分（Simpson 数值积分，与声称值对比）")
print("=" * 72)
check_definite("[10] ∫_0^1 x/(1+x^2)dx = ½ln2",
               lambda x: x / (1 + x * x), 0, 1, 0.5 * math.log(2))
check_definite("[11]/[13] ∫_0^{π/2} cosx/(1+sin^2x)dx = π/4",
               lambda x: math.cos(x) / (1 + math.sin(x) ** 2), 0, PI / 2, PI / 4)
check_definite("[18] ∫_0^1 ln(1+x)/(1+x^2)dx = (π/8)ln2",
               lambda x: math.log1p(x) / (1 + x * x), 0, 1, PI / 8 * math.log(2))

print()
print("=" * 72)
print("结论")
print("=" * 72)
for tag, ok, detail in results:
    print("%-4s %s" % ("PASS" if ok else "FAIL", tag))
    if not ok:
        print("        " + detail)
print()
print("合计 %d 项，通过 %d，失败 %d" % (len(results), len(results) - len(fails), len(fails)))
