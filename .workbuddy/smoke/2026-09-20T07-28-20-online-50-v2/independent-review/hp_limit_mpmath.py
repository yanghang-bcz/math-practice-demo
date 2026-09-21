"""极限复核 · 用 mpmath 内置 limit（Richardson/Shanks 加速）"""
from mpmath import mp, mpf, cos, exp, sin, tan, log1p, nstr, limit

mp.dps = 60

CASES = [
    ("[1] lim (cos x - e^{-x^2/2})/x^4",
     lambda x: (cos(x) - exp(-x * x / 2)) / x ** 4, mpf(-1) / 12),
    ("[2] lim x^2(1/sin^2x + 1/cos^2x)",
     lambda x: x * x * (1 / sin(x) ** 2 + 1 / cos(x) ** 2), mpf(1)),
    ("[3] lim (tan x - x)/(x^2 ln(1+x))",
     lambda x: (tan(x) - x) / (x * x * log1p(x)), mpf(1) / 3),
    ("[4] lim (1/x^2 - 1/(x tan x))",
     lambda x: 1 / x ** 2 - 1 / (x * tan(x)), mpf(1) / 3),
    ("[5] lim (ln(1+x^2) - x sin x)/(x^2(e^{x^2}-1))",
     lambda x: (log1p(x * x) - x * sin(x)) / (x * x * (exp(x * x) - 1)), mpf(-1) / 3),
]

TOL = mpf("1e-20")

print("=" * 78)
print("极限复核 · mpmath limit（mp.dps = 60）")
print("=" * 78)
print()

npass = 0
for tag, f, claimed in CASES:
    L = limit(f, 0)
    err = abs(L - claimed) / max(abs(claimed), mpf(1))
    ok = err < TOL
    npass += bool(ok)
    print("%s" % tag)
    print("  声称值        %s" % nstr(claimed, 20))
    print("  数值极限      %s" % nstr(L, 20))
    print("  相对误差      %.2e" % float(err))
    print("  → %s" % ("PASS" if ok else "FAIL"))
    print()

print("=" * 78)
print("结论：%d/%d 个极限与声称值一致（相对误差 < 1e-20）" % (npass, len(CASES)))
print("=" * 78)
