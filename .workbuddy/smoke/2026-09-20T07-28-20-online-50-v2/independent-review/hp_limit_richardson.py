"""极限复核 · Richardson 外推版
有些极限是一阶收敛（误差 ∝ x），硬比采样值会误判。
这里对每个极限做外推，把 O(x) / O(x^2) 项消掉再比对声称值。
"""
from mpmath import mp, mpf, cos, exp, sin, tan, log1p, nstr

mp.dps = 60


def richardson(f, k0=3, n=4):
    """在 x = 10^-k0, 10^-(k0+1), ... 上采样并做 Richardson 外推。
    自动估阶 p，返回 (外推值, 估计阶数)。"""
    xs = [mpf(10) ** (-(k0 + i)) for i in range(n)]
    vs = [f(x) for x in xs]
    # 相邻差分比 → 估阶
    p = None
    for i in range(len(vs) - 2):
        d1 = abs(vs[i + 1] - vs[i])
        d2 = abs(vs[i + 2] - vs[i + 1])
        if d2 > 0 and d1 > 0:
            ratio = d1 / d2
            if ratio > 1:
                p = float(mp.log(ratio) / mp.log(10))
                break
    if p is None:
        return vs[-1], None
    # 用最后三档做外推：v ≈ L + c·x^p
    p = round(p)
    if p < 1:
        p = 1
    a, b = vs[-3], vs[-2]           # x, x/10
    scale = mpf(10) ** p
    L = b - (a - b) / (scale - 1)
    return L, p


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

print("=" * 78)
print("极限复核 · Richardson 外推（mp.dps = 60）")
print("=" * 78)
print()

npass = 0
for tag, f, claimed in CASES:
    L, p = richardson(f)
    err = abs(L - claimed) / max(abs(claimed), mpf(1))
    ok = err < mpf("1e-18")
    npass += ok
    print("%s" % tag)
    print("  声称值        %s" % nstr(claimed, 16))
    print("  外推值        %s" % nstr(L, 16))
    print("  相对误差      %.2e   （自动估阶 p = %s）" % (float(err), p))
    print("  → %s" % ("PASS" if ok else "FAIL"))
    print()

print("=" * 78)
print("结论：%d/%d 个极限与声称值一致（外推后相对误差 < 1e-18）" % (npass, len(CASES)))
print("=" * 78)
