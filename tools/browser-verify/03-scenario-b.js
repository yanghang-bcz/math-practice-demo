(() => {
  const checks = [];
  const ck = (label, cond, detail) => checks.push({ label, ok: !!cond, detail: detail === undefined ? '' : String(detail) });

  const session = document.getElementById('dailySession');
  const html = session ? session.innerHTML : '';
  const bodyText = document.body.innerText;

  const st = window.CalcDailyApp.getState();
  const s = st.activeSession;
  const q = s && s.currentQuestion;

  ck('判题确实走了服务端', window.__mock.calls.includes('judge'), window.__mock.calls.join(','));
  ck('这次作答本地引擎确实判不了（结论必须来自服务端）',
    window.__mock.judgeBodies.length === 1, window.__mock.judgeBodies.length);

  // ── 措辞：标准答案有问题 ≠ 题目异常 ──
  ck('界面说明「标准答案存在问题」', html.includes('标准答案存在问题'));
  ck('界面明确说不是学生的错', html.includes('这不是你的错'));
  ck('界面没有把它说成「这道题存在异常」', !html.includes('这道题存在异常'));

  // ── 题目作废，但不写学习数据 ──
  ck('题目被作废', q && q.status === 'void', q && q.status);
  ck('没有写入本次作答记录', s && s.results.length === 0, s && s.results.length);
  ck('没有计入学习统计', st.stats.attempts === 0, st.stats.attempts);
  ck('没有写进历史', st.history.length === 0, st.history.length);

  ck('界面不再停留在作答状态', !!document.getElementById('retryQualityBtn'));

  ck('无运行时错误', window.__errors.length === 0, window.__errors.join(' | '));

  return JSON.stringify({ scenario: 'B canonical_suspected', checks, calls: window.__mock.calls, toasts: window.__toasts }, null, 1);
})()
