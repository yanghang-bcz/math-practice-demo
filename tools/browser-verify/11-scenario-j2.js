(async () => {
  /* 场景 J2：接 J1 —— 等 30 秒节流窗口过期后，断网（offline）这条路
     也必须给出它自己那句文案，而不是复用失败那句。

     两个状态在界面上必须是两句不同的话，否则「网络断了」和「服务端同步失败」
     对用户来说就没有区别了 —— 而这两件事对用户的意义完全不同：
     前者等一会儿就好，后者可能需要他换个网络。 */
  const checks = [];
  const ck = (label, cond, detail) => checks.push({ label, ok: !!cond, detail: detail === undefined ? '' : String(detail) });

  // toast 文案由 MutationObserver 记录，回调跑在微任务里 —— dispatch 之后要让出一次任务
  const tick = () => new Promise(resolve => setTimeout(resolve, 60));
  const kinds = CalcDailyDiag.kinds;
  const before = CalcDailyDiag.summary();
  const toastsBefore = window.__toasts.slice();

  const OFFLINE_TEXT = '当前网络不可用，学习记录已暂存在本机，联网后会自动补同步。';

  window.dispatchEvent(
    new CustomEvent('calcdaily:sync-status', { detail: { status: 'offline', message: '当前网络不可用' } })
  );
  await tick();

  const after = CalcDailyDiag.summary();

  ck('窗口过期后提示重新出现',
    window.__toasts.length === toastsBefore.length + 1,
    '新增 ' + (window.__toasts.length - toastsBefore.length) + ' 条');
  ck('断网用的是自己的那句文案（没有复用「同步失败」）',
    window.__toasts.includes(OFFLINE_TEXT), JSON.stringify(window.__toasts.slice(-1)));
  ck('断网这次也记进了诊断',
    (after.byKind[kinds.SYNC_FAILED] || 0) === (before.byKind[kinds.SYNC_FAILED] || 0) + 1,
    JSON.stringify(after.byKind));
  ck('两次的文案确实是两句不同的话',
    window.__toasts.some(t => t.includes('云端同步暂时失败')) && window.__toasts.includes(OFFLINE_TEXT),
    JSON.stringify(window.__toasts));

  ck('无运行时错误', window.__errors.length === 0, window.__errors.join(' | '));

  return JSON.stringify({
    scenario: 'J2 节流窗口过期后断网文案',
    checks,
    toasts: window.__toasts,
    summary: after
  }, null, 1);
})()
