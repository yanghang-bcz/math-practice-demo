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

/** 展开成逐题列表 */
export function buildMatrix() {
  const out = [];
  let n = 0;

  for (const module of MODULES) {
    for (const difficulty of DIFFICULTIES) {
      const count = COUNTS[module][difficulty] || 0;
      for (let k = 0; k < count; k++) {
        n += 1;
        out.push({
          index: n,
          id: `${module}-L${difficulty}-${k + 1}`,
          module,
          difficulty,
          topic: TOPICS[module][(difficulty / 2 + k) % TOPICS[module].length],
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
