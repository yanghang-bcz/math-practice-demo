(async () => {
  /* 场景 J1：云端同步失败 → 用户看到一句人话，而且不会被刷屏。

     这里不真的断网：storage.js 的失败是通过 `calcdaily:sync-status` 事件
     报出来的，而「事件 → 提示 + 诊断 + 节流」正是 Task 5J 新加的那一段，
     也正是唯一会打扰用户的那一段。断网重试 / 自动补同步本身由
     tests/sync-reliability.cjs 的 10 条单测锁住（含 offline→online 自动 flush）。

     两个坑都踩过，写在这里免得下次再踩：

       1. 前置必须是「只加载页面 + 装 mock，不进练习」。进练习会触发一次真实
          的同步失败，把 30 秒的提示节流窗口占掉，于是本场景的第一条提示会被
          吞掉 —— 那不是 bug，是节流在正常工作。
       2. toast 的文案是 MutationObserver 记下来的，而 observer 回调跑在
          **微任务**里。同一个同步 eval 里 dispatch 完立刻读 `__toasts`，
          读到的永远是空数组。所以每次 dispatch 之后都要让出一次任务。 */
  const checks = [];
  const ck = (label, cond, detail) => checks.push({ label, ok: !!cond, detail: detail === undefined ? '' : String(detail) });

  const tick = () => new Promise(resolve => setTimeout(resolve, 60));
  const kinds = CalcDailyDiag.kinds;
  const before = CalcDailyDiag.summary();
  const toastsBefore = window.__toasts.slice();

  const fire = async (status, message) => {
    window.dispatchEvent(
      new CustomEvent('calcdaily:sync-status', { detail: { status, message } })
    );
    await tick();
  };

  const ERR_TEXT = '云端同步暂时失败，学习记录已存在本机，稍后会自动重试。';

  // ── 1. 失败一次 → 必须有一句人话 ──
  await fire('error', '网络请求超时（12000ms）');
  const afterFirst = CalcDailyDiag.summary();

  ck('同步失败被记进诊断',
    (afterFirst.byKind[kinds.SYNC_FAILED] || 0) === (before.byKind[kinds.SYNC_FAILED] || 0) + 1,
    JSON.stringify(afterFirst.byKind));
  ck('用户收到一条同步失败提示',
    window.__toasts.length === toastsBefore.length + 1,
    '新增 ' + (window.__toasts.length - toastsBefore.length) + ' 条');
  ck('提示文案说明「记录还在本机、稍后自动重试」',
    window.__toasts.includes(ERR_TEXT), JSON.stringify(window.__toasts.slice(-1)));
  ck('提示文案没有暴露技术细节（超时毫秒数）',
    !window.__toasts.some(t => t.includes('12000ms')), JSON.stringify(window.__toasts.slice(-1)));

  // ── 2. 同一窗口内再失败 → 仍然记录，但不打扰用户 ──
  // 用 offline 这个**不同**的文案来验节流：如果没节流，文案不同，
  // MutationObserver 一定会把它记下来。
  await fire('offline', '当前网络不可用');
  const afterSecond = CalcDailyDiag.summary();

  ck('第二次失败照样记进诊断',
    (afterSecond.byKind[kinds.SYNC_FAILED] || 0) === (before.byKind[kinds.SYNC_FAILED] || 0) + 2,
    JSON.stringify(afterSecond.byKind));
  ck('节流生效：30 秒内不弹第二条提示',
    window.__toasts.length === toastsBefore.length + 1,
    '新增 ' + (window.__toasts.length - toastsBefore.length) + ' 条');
  ck('被节流的那条文案（断网版）确实没有出现',
    !window.__toasts.some(t => t.includes('当前网络不可用')),
    JSON.stringify(window.__toasts.slice(-1)));

  // ── 3. 成功不再提示，但成功也留痕 ──
  const syncsBefore = afterSecond.byAction.sync || 0;
  await fire('synced', '');
  const afterThird = CalcDailyDiag.summary();

  ck('同步成功记进诊断（byAction=sync）',
    (afterThird.byAction.sync || 0) === syncsBefore + 1, JSON.stringify(afterThird.byAction));
  ck('成功没有触发提示',
    window.__toasts.length === toastsBefore.length + 1,
    window.__toasts.length - toastsBefore.length);

  ck('无运行时错误', window.__errors.length === 0, window.__errors.join(' | '));

  return JSON.stringify({
    scenario: 'J1 同步失败 → 提示一次 + 诊断留痕 + 节流生效',
    checks,
    toastsBefore,
    toasts: window.__toasts,
    summary: afterThird
  }, null, 1);
})()
