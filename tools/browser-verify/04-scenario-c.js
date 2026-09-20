(() => {
  const checks = [];
  const ck = (label, cond, detail) => checks.push({ label, ok: !!cond, detail: detail === undefined ? '' : String(detail) });

  const session = document.getElementById('dailySession');
  const html = session ? session.innerHTML : '';
  const bodyText = document.body.innerText;
  const input = document.getElementById('answerInput');
  const button = document.getElementById('submitAnswerBtn');

  const st = window.CalcDailyApp.getState();
  const s = st.activeSession;
  const q = s && s.currentQuestion;

  ck('判题确实走了服务端且返回 503', window.__mock.calls.includes('judge'), window.__mock.calls.join(','));

  // ── 核心：网络故障不得被说成题目有问题 ──
  ck('题目没有被作废', !q || q.status !== 'void', q && q.status);
  ck('界面没有出现「已自动作废」', !html.includes('已自动作废'));
  ck('界面没有出现「标准答案存在问题」', !html.includes('标准答案存在问题'));

  // ── 用户的作答必须保住 ──
  // 提交的答案刻意选 'sinx'：本地确定性引擎对它给不出结论（既不是常量也
  // 不是可解析表达式），所以结论必须来自服务端 —— 这正是本场景要测的那条路。
  ck('输入框里保留了用户写下的答案', input && input.value === 'sinx', input && JSON.stringify(input.value));
  ck('提交按钮回到可点状态', button && button.disabled === false, button && button.disabled);
  ck('按钮文案提示可以重试', button && button.textContent.trim() === '重试提交', button && button.textContent.trim());

  // ── 提示语必须是网络问题 ──
  ck('提示语说明是连不上判题服务', window.__toasts.some(t => t.includes('连不上判题服务')), JSON.stringify(window.__toasts));
  ck('提示语没有把锅甩给题目', !window.__toasts.some(t => t.includes('题目') && t.includes('异常')), JSON.stringify(window.__toasts));

  // ── 没有判定结论就不该写学习记录 ──
  ck('没有写入本次作答记录', s && s.results.length === 0, s && s.results.length);
  ck('没有计入学习统计', st.stats.attempts === 0, st.stats.attempts);
  ck('没有写进历史', st.history.length === 0, st.history.length);

  ck('无运行时错误', window.__errors.length === 0, window.__errors.join(' | '));

  return JSON.stringify({ scenario: 'C judge_unavailable', checks, calls: window.__mock.calls, toasts: window.__toasts }, null, 1);
})()
