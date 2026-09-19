/* CalcDaily Verified Fallback Bank — fallback-v2
 *
 * 安全网本身必须安全。这里的每一道题都在 tests/fallback-bank.cjs 里
 * 用确定性数学验证引擎逐题自检：答案必须真的满足题目，解析与答案不得矛盾。
 *
 * 上一版的教训：题库只有 12 道、每模块 4 道，选取逻辑只看难度接近度，
 * 不看是否做过，于是 AI 失败时用户会反复看到同一道题；而且其中一道
 * （ln(1+sin x) 的极限）答案写成了 -1/6，正确值是 +1/6。
 */
(function(root) {
  'use strict';

  const VERSION = 'fallback-v2';

  const BANK = [
    /* ============ 极限 limit（20 道） ============ */
    {
      id: 'fb-limit-01', module: 'limit', topic: '因式分解', difficulty: 1,
      instruction: '计算极限',
      expression: '\\lim_{x\\to1}\\frac{x^2-1}{x-1}',
      answer: '2',
      solution: '分子分解为 \\((x-1)(x+1)\\)，约去公因式后极限为 \\(2\\)。'
    },
    {
      id: 'fb-limit-02', module: 'limit', topic: '重要极限', difficulty: 2,
      instruction: '计算极限',
      expression: '\\lim_{x\\to0}\\frac{\\sin 3x}{x}',
      answer: '3',
      solution: '利用 \\(\\sin u\\sim u\\)，有 \\(\\sin 3x\\sim 3x\\)，故极限为 \\(3\\)。'
    },
    {
      id: 'fb-limit-03', module: 'limit', topic: '等价无穷小', difficulty: 3,
      instruction: '计算极限',
      expression: '\\lim_{x\\to0}\\frac{1-\\cos x}{x^2}',
      answer: '1/2',
      solution: '利用 \\(1-\\cos x=2\\sin^2\\frac{x}{2}\\)，极限为 \\(\\frac12\\)。'
    },
    {
      id: 'fb-limit-04', module: 'limit', topic: '等价无穷小', difficulty: 3,
      instruction: '计算极限',
      expression: '\\lim_{x\\to0}\\frac{\\tan x}{x}',
      answer: '1',
      solution: '由 \\(\\tan x\\sim x\\)，极限为 \\(1\\)。'
    },
    {
      id: 'fb-limit-05', module: 'limit', topic: '重要极限', difficulty: 3,
      instruction: '计算极限',
      expression: '\\lim_{x\\to0}\\frac{e^x-1}{x}',
      answer: '1',
      solution: '由 \\(e^x=1+x+o(x)\\) 得 \\(e^x-1\\sim x\\)，极限为 \\(1\\)。'
    },
    {
      id: 'fb-limit-06', module: 'limit', topic: '重要极限', difficulty: 3,
      instruction: '计算极限',
      expression: '\\lim_{x\\to0}\\frac{\\ln(1+x)}{x}',
      answer: '1',
      solution: '由 \\(\\ln(1+x)\\sim x\\)，极限为 \\(1\\)。'
    },
    {
      id: 'fb-limit-07', module: 'limit', topic: '有理化', difficulty: 4,
      instruction: '计算极限',
      expression: '\\lim_{x\\to0}\\frac{\\sqrt{1+x}-1}{x}',
      answer: '1/2',
      solution: '分子有理化得 \\(\\frac{1}{\\sqrt{1+x}+1}\\)，极限为 \\(\\frac12\\)。'
    },
    {
      id: 'fb-limit-08', module: 'limit', topic: '重要极限', difficulty: 4,
      instruction: '计算极限',
      expression: '\\lim_{x\\to\\infty}\\left(1+\\frac{1}{x}\\right)^{2x}',
      answer: 'e^2',
      solution: '写成 \\(\\left(1+\\frac1x\\right)^{x\\cdot2}\\)，由重要极限得 \\(e^2\\)。'
    },
    {
      id: 'fb-limit-09', module: 'limit', topic: '重要极限', difficulty: 5,
      instruction: '计算极限',
      expression: '\\lim_{x\\to0}(1+2x)^{\\frac{1}{x}}',
      answer: 'e^2',
      solution: '写成 \\((1+2x)^{\\frac{1}{2x}\\cdot2}\\)，由重要极限得 \\(e^2\\)。'
    },
    {
      id: 'fb-limit-10', module: 'limit', topic: '洛必达', difficulty: 5,
      instruction: '计算极限',
      expression: '\\lim_{x\\to0}\\frac{2^x-1}{x}',
      answer: '\\ln 2',
      solution: '由 \\(2^x-1\\sim x\\ln 2\\)，极限为 \\(\\ln 2\\)。'
    },
    {
      id: 'fb-limit-11', module: 'limit', topic: '泰勒展开', difficulty: 6,
      instruction: '计算极限',
      expression: '\\lim_{x\\to0}\\frac{x-\\ln(1+x)}{x^2}',
      answer: '1/2',
      solution: '由 \\(\\ln(1+x)=x-\\frac{x^2}{2}+o(x^2)\\)，极限为 \\(\\frac12\\)。'
    },
    {
      id: 'fb-limit-12', module: 'limit', topic: '泰勒展开', difficulty: 6,
      instruction: '计算极限',
      expression: '\\lim_{x\\to0}\\frac{x-\\sin x}{x^3}',
      answer: '1/6',
      solution: '由 \\(\\sin x=x-\\frac{x^3}{6}+o(x^3)\\)，极限为 \\(\\frac16\\)。'
    },
    {
      id: 'fb-limit-13', module: 'limit', topic: '泰勒展开', difficulty: 6,
      instruction: '计算极限',
      expression: '\\lim_{x\\to0}\\frac{e^x-1-x-\\frac{x^2}{2}}{x^3}',
      answer: '1/6',
      solution: '用 \\(e^x=1+x+\\frac{x^2}{2}+\\frac{x^3}{6}+o(x^3)\\)，极限为 \\(\\frac16\\)。'
    },
    {
      id: 'fb-limit-14', module: 'limit', topic: '泰勒展开', difficulty: 7,
      instruction: '计算极限',
      expression: '\\lim_{x\\to0}\\frac{\\sin x-x\\cos x}{x^3}',
      answer: '1/3',
      solution: '展开 \\(\\cos x\\) 后合并同类项，得 \\(\\frac{x^3}{3}+o(x^3)\\)，极限为 \\(\\frac13\\)。'
    },
    {
      id: 'fb-limit-15', module: 'limit', topic: '泰勒展开', difficulty: 8,
      instruction: '计算极限',
      expression: '\\lim_{x\\to0}\\frac{\\tan x-\\sin x}{x^3}',
      answer: '1/2',
      solution: '由 \\(\\tan x-\\sin x=\\tan x(1-\\cos x)\\sim x\\cdot\\frac{x^2}{2}\\)，极限为 \\(\\frac12\\)。'
    },
    {
      id: 'fb-limit-16', module: 'limit', topic: '复合极限', difficulty: 8,
      instruction: '计算极限',
      expression: '\\lim_{x\\to0}\\frac{\\ln(1+\\sin x)-x+\\frac{x^2}{2}}{x^3}',
      answer: '1/6',
      solution: '对 \\(\\sin x\\) 与 \\(\\ln(1+u)\\) 分层展开至三阶，分子为 \\(\\frac{x^3}{6}+o(x^3)\\)，极限为 \\(\\frac16\\)。'
    },
    {
      id: 'fb-limit-17', module: 'limit', topic: '泰勒展开', difficulty: 8,
      instruction: '计算极限',
      expression: '\\lim_{x\\to0}\\frac{\\arctan x-x}{x^3}',
      answer: '-1/3',
      solution: '由 \\(\\arctan x=x-\\frac{x^3}{3}+o(x^3)\\)，极限为 \\(-\\frac13\\)。'
    },
    {
      id: 'fb-limit-18', module: 'limit', topic: '泰勒展开', difficulty: 9,
      instruction: '计算极限',
      expression: '\\lim_{x\\to0}\\frac{e^x\\sin x-x-x^2}{x^3}',
      answer: '1/3',
      solution: '展开 \\(e^x\\) 与 \\(\\sin x\\) 相乘并保留到三阶，分子为 \\(\\frac{x^3}{3}+o(x^3)\\)，极限为 \\(\\frac13\\)。'
    },
    {
      id: 'fb-limit-19', module: 'limit', topic: '洛必达', difficulty: 9,
      instruction: '计算极限',
      expression: '\\lim_{x\\to0}\\left(\\frac{1}{x^2}-\\frac{1}{x\\sin x}\\right)',
      answer: '-1/6',
      solution: '通分后分子为 \\(\\sin x-x\\sim-\\frac{x^3}{6}\\)，分母 \\(x^2\\sin x\\sim x^3\\)，极限为 \\(-\\frac16\\)。'
    },
    {
      id: 'fb-limit-20', module: 'limit', topic: '泰勒展开', difficulty: 10,
      instruction: '计算极限',
      expression: '\\lim_{x\\to0}\\frac{\\ln(\\cos x)}{x^2}',
      answer: '-1/2',
      solution: '由 \\(\\cos x=1-\\frac{x^2}{2}+o(x^2)\\) 得 \\(\\ln(\\cos x)\\sim-\\frac{x^2}{2}\\)，极限为 \\(-\\frac12\\)。'
    },

    /* ============ 导数 derivative（20 道） ============ */
    {
      id: 'fb-deriv-01', module: 'derivative', topic: '基本求导', difficulty: 1,
      instruction: '求导',
      expression: 'y=x^3-3x^2+2',
      answer: '3x^2-6x',
      solution: '逐项求导得 \\(y\'=3x^2-6x\\)。'
    },
    {
      id: 'fb-deriv-02', module: 'derivative', topic: '复合函数求导', difficulty: 2,
      instruction: '求导',
      expression: 'y=\\ln(1+x^2)',
      answer: '\\frac{2x}{1+x^2}',
      solution: '链式法则得 \\(y\'=\\frac{2x}{1+x^2}\\)。'
    },
    {
      id: 'fb-deriv-03', module: 'derivative', topic: '基本求导', difficulty: 3,
      instruction: '求导',
      expression: 'y=\\sin(2x)',
      answer: '2\\cos(2x)',
      solution: '链式法则得 \\(y\'=2\\cos 2x\\)。'
    },
    {
      id: 'fb-deriv-04', module: 'derivative', topic: '反函数求导', difficulty: 3,
      instruction: '求导',
      expression: 'y=\\arctan x',
      answer: '\\frac{1}{1+x^2}',
      solution: '由反正切函数导数公式得 \\(y\'=\\frac{1}{1+x^2}\\)。'
    },
    {
      id: 'fb-deriv-05', module: 'derivative', topic: '乘积法则', difficulty: 4,
      instruction: '求导',
      expression: 'y=x^2e^x',
      answer: 'e^x(x^2+2x)',
      solution: '乘积法则：\\(y\'=2xe^x+x^2e^x=e^x(x^2+2x)\\)。'
    },
    {
      id: 'fb-deriv-06', module: 'derivative', topic: '复合函数求导', difficulty: 4,
      instruction: '求导',
      expression: 'y=\\cos(x^2)',
      answer: '-2x\\sin(x^2)',
      solution: '链式法则：\\(y\'=-\\sin(x^2)\\cdot 2x\\)。'
    },
    {
      id: 'fb-deriv-07', module: 'derivative', topic: '复合函数求导', difficulty: 4,
      instruction: '求导',
      expression: 'y=\\sqrt{1+x^2}',
      answer: '\\frac{x}{\\sqrt{1+x^2}}',
      solution: '链式法则：\\(y\'=\\frac{2x}{2\\sqrt{1+x^2}}=\\frac{x}{\\sqrt{1+x^2}}\\)。'
    },
    {
      id: 'fb-deriv-08', module: 'derivative', topic: '商法则', difficulty: 4,
      instruction: '求导',
      expression: 'y=\\frac{1}{1+x^2}',
      answer: '-\\frac{2x}{(1+x^2)^2}',
      solution: '商法则得 \\(y\'=-\\frac{2x}{(1+x^2)^2}\\)。'
    },
    {
      id: 'fb-deriv-09', module: 'derivative', topic: '乘积法则', difficulty: 4,
      instruction: '求导',
      expression: 'y=x\\ln x',
      answer: '\\ln x+1',
      solution: '乘积法则：\\(y\'=\\ln x+x\\cdot\\frac1x=\\ln x+1\\)。'
    },
    {
      id: 'fb-deriv-10', module: 'derivative', topic: '基本求导', difficulty: 4,
      instruction: '求导',
      expression: 'y=\\tan x',
      answer: '\\frac{1}{\\cos^2 x}',
      solution: '由 \\(\\tan x=\\frac{\\sin x}{\\cos x}\\) 求导得 \\(y\'=\\frac{1}{\\cos^2 x}\\)。'
    },
    {
      id: 'fb-deriv-11', module: 'derivative', topic: '反函数求导', difficulty: 4,
      instruction: '求导',
      expression: 'y=\\arcsin x',
      answer: '\\frac{1}{\\sqrt{1-x^2}}',
      solution: '由反正弦函数导数公式得 \\(y\'=\\frac{1}{\\sqrt{1-x^2}}\\)。'
    },
    {
      id: 'fb-deriv-12', module: 'derivative', topic: '复合函数求导', difficulty: 5,
      instruction: '求导',
      expression: 'y=e^{x^2}',
      answer: '2xe^{x^2}',
      solution: '链式法则：\\(y\'=e^{x^2}\\cdot 2x\\)。'
    },
    {
      id: 'fb-deriv-13', module: 'derivative', topic: '对数求导', difficulty: 5,
      instruction: '求导',
      expression: 'y=\\ln(\\sin x)',
      answer: '\\frac{\\cos x}{\\sin x}',
      solution: '链式法则：\\(y\'=\\frac{\\cos x}{\\sin x}\\)。'
    },
    {
      id: 'fb-deriv-14', module: 'derivative', topic: '商法则', difficulty: 5,
      instruction: '求导',
      expression: 'y=\\frac{x}{1+x}',
      answer: '\\frac{1}{(1+x)^2}',
      solution: '商法则：\\(y\'=\\frac{(1+x)-x}{(1+x)^2}=\\frac{1}{(1+x)^2}\\)。'
    },
    {
      id: 'fb-deriv-15', module: 'derivative', topic: '乘积法则', difficulty: 5,
      instruction: '求导',
      expression: 'y=\\sin x\\cos x',
      answer: '\\cos(2x)',
      solution: '由 \\(y=\\frac12\\sin 2x\\) 得 \\(y\'=\\cos 2x\\)。'
    },
    {
      id: 'fb-deriv-16', module: 'derivative', topic: '复合函数求导', difficulty: 6,
      instruction: '求导',
      expression: 'y=\\cos(\\ln x)',
      answer: '-\\frac{\\sin(\\ln x)}{x}',
      solution: '链式法则：\\(y\'=-\\sin(\\ln x)\\cdot\\frac1x\\)。'
    },
    {
      id: 'fb-deriv-17', module: 'derivative', topic: '商法则', difficulty: 6,
      instruction: '求导',
      expression: 'y=\\frac{e^x}{x}',
      answer: '\\frac{e^x(x-1)}{x^2}',
      solution: '商法则：\\(y\'=\\frac{e^x\\cdot x-e^x}{x^2}=\\frac{e^x(x-1)}{x^2}\\)。'
    },
    {
      id: 'fb-deriv-18', module: 'derivative', topic: '复合函数求导', difficulty: 7,
      instruction: '求导',
      expression: 'y=\\ln(x+\\sqrt{1+x^2})',
      answer: '\\frac{1}{\\sqrt{1+x^2}}',
      solution: '链式法则：\\(y\'=\\frac{1+\\frac{x}{\\sqrt{1+x^2}}}{x+\\sqrt{1+x^2}}=\\frac{1}{\\sqrt{1+x^2}}\\)。'
    },
    {
      id: 'fb-deriv-19', module: 'derivative', topic: '对数求导', difficulty: 8,
      instruction: '求导',
      expression: 'y=x^x',
      answer: 'x^x(\\ln x+1)',
      solution: '取对数得 \\(\\ln y=x\\ln x\\)，两边求导得 \\(\\frac{y\'}{y}=\\ln x+1\\)。'
    },
    {
      id: 'fb-deriv-20', module: 'derivative', topic: '高阶导数', difficulty: 8,
      derivativeOrder: 2,
      instruction: '求二阶导数',
      expression: 'y=e^x\\sin x',
      answer: '2e^x\\cos x',
      solution: '先求 \\(y\'=e^x(\\sin x+\\cos x)\\)，再求一次导得 \\(y\'\'=2e^x\\cos x\\)。'
    },

    /* ============ 积分 integral（20 道） ============ */
    {
      id: 'fb-int-01', module: 'integral', topic: '基本积分', difficulty: 2,
      instruction: '计算不定积分',
      expression: '\\int(3x^2+2x)\\,dx',
      answer: 'x^3+x^2+C',
      solution: '逐项积分得 \\(x^3+x^2+C\\)。'
    },
    {
      id: 'fb-int-02', module: 'integral', topic: '基本积分', difficulty: 2,
      instruction: '计算定积分',
      expression: '\\int_0^1 x^2\\,dx',
      answer: '1/3',
      solution: '原函数为 \\(\\frac{x^3}{3}\\)，代入得 \\(\\frac13\\)。'
    },
    {
      id: 'fb-int-03', module: 'integral', topic: '基本积分', difficulty: 2,
      instruction: '计算不定积分',
      expression: '\\int e^{2x}\\,dx',
      answer: '\\frac{e^{2x}}{2}+C',
      solution: '由 \\(\\int e^{ax}dx=\\frac{e^{ax}}{a}\\) 得 \\(\\frac{e^{2x}}{2}+C\\)。'
    },
    {
      id: 'fb-int-04', module: 'integral', topic: '基本积分', difficulty: 3,
      instruction: '计算不定积分',
      expression: '\\int \\sin(3x)\\,dx',
      answer: '-\\frac{\\cos(3x)}{3}+C',
      solution: '凑微分得 \\(-\\frac{\\cos 3x}{3}+C\\)。'
    },
    {
      id: 'fb-int-05', module: 'integral', topic: '基本积分', difficulty: 3,
      instruction: '计算不定积分',
      expression: '\\int \\frac{1}{1+x^2}\\,dx',
      answer: '\\arctan x+C',
      solution: '由基本积分公式得 \\(\\arctan x+C\\)。'
    },
    {
      id: 'fb-int-06', module: 'integral', topic: '基本积分', difficulty: 3,
      instruction: '计算定积分',
      expression: '\\int_0^{\\pi/2}\\sin x\\,dx',
      answer: '1',
      solution: '原函数为 \\(-\\cos x\\)，代入得 \\(0-(-1)=1\\)。'
    },
    {
      id: 'fb-int-07', module: 'integral', topic: '基本积分', difficulty: 3,
      instruction: '计算定积分',
      expression: '\\int_0^1 e^x\\,dx',
      answer: 'e-1',
      solution: '原函数为 \\(e^x\\)，代入得 \\(e-1\\)。'
    },
    {
      id: 'fb-int-08', module: 'integral', topic: '换元积分', difficulty: 4,
      instruction: '计算不定积分',
      expression: '\\int 2x\\cos(x^2)\\,dx',
      answer: '\\sin(x^2)+C',
      solution: '令 \\(u=x^2\\)，则 \\(du=2x\\,dx\\)，积分为 \\(\\sin(x^2)+C\\)。'
    },
    {
      id: 'fb-int-09', module: 'integral', topic: '换元积分', difficulty: 4,
      instruction: '计算不定积分',
      expression: '\\int \\frac{x}{1+x^2}\\,dx',
      answer: '\\frac{\\ln(1+x^2)}{2}+C',
      solution: '令 \\(u=1+x^2\\)，得 \\(\\frac12\\ln(1+x^2)+C\\)。'
    },
    {
      id: 'fb-int-10', module: 'integral', topic: '基本积分', difficulty: 4,
      instruction: '计算不定积分',
      expression: '\\int \\tan x\\,dx',
      answer: '-\\ln(\\cos x)+C',
      solution: '由 \\(\\int\\frac{\\sin x}{\\cos x}dx=-\\ln|\\cos x|+C\\)，在 \\(\\cos x>0\\) 上即为 \\(-\\ln(\\cos x)+C\\)。'
    },
    {
      id: 'fb-int-11', module: 'integral', topic: '换元积分', difficulty: 5,
      instruction: '计算不定积分',
      expression: '\\int \\frac{2x}{1+x^2}\\,dx',
      answer: '\\ln(1+x^2)+C',
      solution: '令 \\(u=1+x^2\\)，得 \\(\\ln(1+x^2)+C\\)。'
    },
    {
      id: 'fb-int-12', module: 'integral', topic: '分部积分', difficulty: 5,
      instruction: '计算不定积分',
      expression: '\\int \\ln x\\,dx',
      answer: 'x\\ln x-x+C',
      solution: '分部积分：\\(\\int\\ln x\\,dx=x\\ln x-\\int x\\cdot\\frac1x dx=x\\ln x-x+C\\)。'
    },
    {
      id: 'fb-int-13', module: 'integral', topic: '三角积分', difficulty: 6,
      instruction: '计算不定积分',
      expression: '\\int \\cos^2 x\\,dx',
      answer: '\\frac{x}{2}+\\frac{\\sin(2x)}{4}+C',
      solution: '用降幂公式 \\(\\cos^2x=\\frac{1+\\cos 2x}{2}\\) 积分。'
    },
    {
      id: 'fb-int-14', module: 'integral', topic: '换元积分', difficulty: 6,
      instruction: '计算不定积分',
      expression: '\\int x\\sqrt{1+x^2}\\,dx',
      answer: '\\frac{(1+x^2)^{\\frac{3}{2}}}{3}+C',
      solution: '令 \\(u=1+x^2\\)，得 \\(\\frac13(1+x^2)^{\\frac32}+C\\)。'
    },
    {
      id: 'fb-int-15', module: 'integral', topic: '分部积分', difficulty: 6,
      instruction: '计算不定积分',
      expression: '\\int xe^x\\,dx',
      answer: 'e^x(x-1)+C',
      solution: '分部积分得 \\(xe^x-e^x+C=e^x(x-1)+C\\)。'
    },
    {
      id: 'fb-int-16', module: 'integral', topic: '分部积分', difficulty: 6,
      instruction: '计算不定积分',
      expression: '\\int x^2e^x\\,dx',
      answer: 'e^x(x^2-2x+2)+C',
      solution: '连续两次分部积分得 \\(e^x(x^2-2x+2)+C\\)。'
    },
    {
      id: 'fb-int-17', module: 'integral', topic: '定积分技巧', difficulty: 6,
      instruction: '计算定积分',
      expression: '\\int_1^e \\ln x\\,dx',
      answer: '1',
      solution: '原函数为 \\(x\\ln x-x\\)，代入得 \\((e-e)-(0-1)=1\\)。'
    },
    {
      id: 'fb-int-18', module: 'integral', topic: '有理函数积分', difficulty: 7,
      instruction: '计算不定积分',
      expression: '\\int \\frac{1}{x^2+4}\\,dx',
      answer: '\\frac{1}{2}\\arctan\\frac{x}{2}+C',
      solution: '由 \\(\\int\\frac{du}{u^2+a^2}=\\frac1a\\arctan\\frac ua\\)，取 \\(a=2\\) 得结果。'
    },
    {
      id: 'fb-int-19', module: 'integral', topic: '分部积分', difficulty: 7,
      instruction: '计算不定积分',
      expression: '\\int e^x\\cos x\\,dx',
      answer: '\\frac{e^x(\\sin x+\\cos x)}{2}+C',
      solution: '对 \\(\\int e^x\\cos x\\,dx\\) 连续两次分部积分并移项。'
    },
    {
      id: 'fb-int-20', module: 'integral', topic: '定积分技巧', difficulty: 8,
      instruction: '计算定积分',
      expression: '\\int_0^1\\frac{\\ln(1+x)}{1+x}\\,dx',
      answer: '\\frac{(\\ln 2)^2}{2}',
      solution: '令 \\(u=\\ln(1+x)\\)，积分化为 \\(\\int_0^{\\ln2}u\\,du=\\frac{(\\ln2)^2}{2}\\)。'
    }
  ];

  function byModule(module) {
    return BANK.filter(q => q.module === module);
  }

  function byId(id) {
    return BANK.find(q => q.id === id) || null;
  }

  /* Selection: difficulty closeness, then topic relevance, then exclude what the
     user has recently seen. The old version only looked at difficulty and always
     returned candidates[0], so a user hitting repeated AI failures saw the same
     question over and over. */
  function pick(options) {
    const opts = options || {};
    const module = opts.module || 'limit';
    const target = Number(opts.targetDifficulty) || 6;
    const topic = opts.topic || null;
    const recentIds = Array.isArray(opts.recentIds) ? opts.recentIds : [];
    const recent = new Set(recentIds);

    const pool = byModule(module);
    if (!pool.length) return null;

    let candidates = pool.filter(q => !recent.has(q.id));
    if (!candidates.length) candidates = pool;

    const scored = candidates.map(q => ({
      q,
      gap: Math.abs(q.difficulty - target),
      topicMatch: topic && q.topic === topic ? 1 : 0
    }));

    scored.sort((a, b) =>
      (a.gap - b.gap) ||
      (b.topicMatch - a.topicMatch) ||
      a.q.id.localeCompare(b.q.id)
    );

    return scored[0].q;
  }

  const api = { VERSION, BANK, byModule, byId, pick };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FallbackBank = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
