/* 50 题评测矩阵
 *
 * 覆盖 3 模块 × 5 难度（L4/L6/L8/L10/L12），共 50 题。
 * 高难度端（derivative / integral 的 L8/L10/L12）刻意加权：
 * 那正是改造前最容易「过闸门但算错」的地方，样本太薄就看不出差别。
 *
 * 合计：14 + 18 + 18 = 50
 */

export const COUNTS = {
  limit:      { 4: 3, 6: 3, 8: 3, 10: 3, 12: 2 },
  derivative: { 4: 3, 6: 3, 8: 4, 10: 4, 12: 4 },
  integral:   { 4: 3, 6: 3, 8: 4, 10: 4, 12: 4 }
};

/* 每个模块的考点池，按难度轮转取用。
 * 都写成「由你在模块内选择合适考点」也比写死强，但写死才能验证考点匹配。 */
export const TOPICS = {
  limit: [
    '洛必达法则求极限',
    '等价无穷小替换',
    '泰勒展开求极限',
    '定积分定义求数列极限',
    '夹逼准则'
  ],
  derivative: [
    '复合函数求导',
    '隐函数求导',
    '参数方程求导',
    '高阶导数',
    '分段点处的可导性'
  ],
  integral: [
    '分部积分',
    '第二类换元积分',
    '三角有理式积分',
    '有理函数积分',
    '定积分的换元'
  ]
};

export const DIFFICULTIES = [4, 6, 8, 10, 12];
export const MODULES = ['limit', 'derivative', 'integral'];

/** 高难度焦点格子：报告里单独统计 */
export function isFocusCell(module, difficulty) {
  return (
    (module === 'derivative' || module === 'integral') &&
    difficulty >= 8
  );
}

/** 展开成逐题列表
 *
 * `extraTopics` 允许为某几个模块**临时追加**考点（形如
 * `{ derivative: ['幂指函数求导'] }`）。存在的理由：默认考点池是按
 * 「考研常见形态」挑的，池里没有幂指函数 u(x)^v(x) / 对数求导法 ——
 * 而那正是线上唯一被抓到「标准答案算错还放行」的形态。
 * 定向复测需要主动把它排进去，否则跑一百道也碰不到一次。
 *
 * 只影响本次传参：不传就和历史上那批 200 题完全一致，
 * 模块/难度维度的可比性不受影响。
 */
export function buildMatrix(extraTopics = {}) {
  const poolOf = module =>
    TOPICS[module].concat(
      Array.isArray(extraTopics[module]) ? extraTopics[module] : []
    );

  const out = [];
  let n = 0;

  for (const module of MODULES) {
    const pool = poolOf(module);

    for (const difficulty of DIFFICULTIES) {
      const count = COUNTS[module][difficulty] || 0;
      for (let k = 0; k < count; k++) {
        n += 1;
        out.push({
          index: n,
          id: `${module}-L${difficulty}-${k + 1}`,
          module,
          difficulty,
          topic: pool[(difficulty / 2 + k) % pool.length],
          purpose: 'daily',
          zone: 'target',
          focus: isFocusCell(module, difficulty)
        });
      }
    }
  }

  return out;
}

export function matrixSize() {
  return buildMatrix().length;
}
