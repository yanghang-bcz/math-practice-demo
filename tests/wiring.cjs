/* CalcDaily v1.1 — 前端接线契约
 *
 * 这一组测试盯的不是数学，而是「题库到底有没有真的接进 app」。
 * 之前踩过的坑：改完模块但忘了改加载顺序 / 忘了删内联副本，
 * 结果运行的是旧代码，测试全绿而线上照旧出错。
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const Bank = require('../fallback-bank');
const Quality = require('../math-quality');

test('index.html 必须在 app.js 之前加载 fallback-bank.js', () => {
  const html = read('index.html');
  const bankAt = html.indexOf('fallback-bank.js');
  const appAt = html.indexOf('./app.js');

  assert.ok(bankAt >= 0, 'index.html 没有引用 fallback-bank.js');
  assert.ok(appAt >= 0, 'index.html 没有引用 app.js');
  assert.ok(bankAt < appAt, 'fallback-bank.js 必须排在 app.js 前面，否则 FallbackBank 未定义');
});

test('app.js 不得再内联题库副本', () => {
  const app = read('app.js');
  assert.ok(
    !/const\s+FALLBACK_BANK\s*=\s*\[/.test(app),
    'app.js 里又出现了内联的 FALLBACK_BANK 数组——两份题库会各自演化'
  );
  assert.ok(
    /FallbackBank\.pick/.test(app),
    'app.js 没有调用 FallbackBank.pick，选取逻辑可能还是旧的'
  );
});

test('app.js 引用的题库字段在题库里都存在', () => {
  // fallbackQuestion 会把 bank 条目 spread 进题目对象，
  // 少一个字段就会在界面上表现为空白题。
  const needed = ['id', 'module', 'topic', 'difficulty', 'instruction', 'expression', 'answer', 'solution'];

  for (const q of Bank.BANK) {
    for (const key of needed) {
      assert.ok(q[key] !== undefined, q.id + ' 缺少 ' + key);
    }
  }
});

test('app 的调用形态（只有 module）必须能选出题', () => {
  for (const module of ['limit', 'derivative', 'integral']) {
    const q = Bank.pick({ module, targetDifficulty: 6, topic: null, recentIds: [] });
    assert.ok(q, module + ' 选不出题');
    assert.strictEqual(q.module, module);
  }
});

test('连续 20 次选取能覆盖整个模块池，不会腻在同一道题上', () => {
  for (const module of ['limit', 'derivative', 'integral']) {
    const pool = Bank.byModule(module).length;
    const seen = [];

    for (let i = 0; i < pool; i++) {
      const q = Bank.pick({ module, targetDifficulty: 6, recentIds: seen });
      assert.ok(q, module + ' 第 ' + i + ' 次选取失败');
      assert.ok(!seen.includes(q.id), module + ' 重复选中 ' + q.id);
      seen.push(q.id);
    }

    assert.strictEqual(new Set(seen).size, pool, module + ' 未覆盖整池');
  }
});

test('备用题本身必须通过硬闸门（它是最后一道安全网）', () => {
  for (const q of Bank.BANK) {
    const issues = Quality.issues(q);
    assert.deepStrictEqual(issues, [], q.id + ' 未通过自检：' + JSON.stringify(issues));
  }
});

test('app.js 必须走引擎的错误状态分类，不能自己再判一遍', () => {
  const app = read('app.js');

  assert.ok(
    /MathQuality\.judgeOutcome\(/.test(app),
    'app.js 没有调用 MathQuality.judgeOutcome：判题失败的处置规则必须唯一'
  );

  assert.ok(
    /judgeUnavailable\(/.test(app),
    'app.js 缺少判题服务不可用时的可重试分支'
  );

  // 反向断言：不能出现「只要 verdict 不可信就作废题目」的写法。
  const voidOnAnyUntrusted =
    /trusted\s*!==\s*true\s*\)\s*\{\s*voidQuestion/.test(app);
  assert.ok(
    !voidOnAnyUntrusted,
    'app.js 又把「任何不可信结论」都当成题目有问题了'
  );
});

test('app.js 判题失败时必须保留用户已经写下的答案', () => {
  const app = read('app.js');
  const fn = app.slice(app.indexOf('function judgeUnavailable'));

  assert.ok(
    /input\.value\s*=\s*userAnswer/.test(fn.slice(0, 1200)),
    'judgeUnavailable 没有把用户答案写回输入框——一次网络抖动就白写了'
  );
});
