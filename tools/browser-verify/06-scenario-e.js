(() => {
  const checks = [];
  const ck = (label, cond, detail) => checks.push({ label, ok: !!cond, detail: detail === undefined ? '' : String(detail) });

  const session = document.getElementById('dailySession');
  const input = document.getElementById('answerInput');
  const button = document.getElementById('submitAnswerBtn');

  const st = window.CalcDailyApp.getState();
  const s = st.activeSession;
  const q = s && s.currentQuestion;

  const toasts = window.__toasts.slice();

  ck('判题确实又调了一次服务端', window.__mock.calls.filter(c => c === 'judge').length >= 3,
    window.__mock.calls.join(','));

  // 反向：服务端说 judge_uncertain（判题员答了但结论不可用），
  // 文案必须和「连不上」区分开，否则两种完全不同的故障被合并成一句。
  // 现行文案：judge_uncertain → 「暂时无法可靠判断这个答案…」；
  //           judge_unavailable → 「连不上判题服务…」。
  ck('提示语是「暂时无法可靠判断这个答案」', toasts.some(t => t.includes('暂时无法可靠判断')), JSON.stringify(toasts));
  ck('没有说成「连不上判题服务」', !toasts.some(t => t.includes('连不上判题服务')), JSON.stringify(toasts));
  ck('文案说明这一次不计入统计', toasts.some(t => t.includes('不计入统计')), JSON.stringify(toasts));

  // 跨场景累积，确认两种完全不同的故障确实给出了两句不同的话
  const all = window.__allToasts.slice();
  ck('两种原因确实被区分开了',
    all.some(t => t.includes('暂时无法可靠判断')) && all.some(t => t.includes('连不上判题服务')),
    JSON.stringify(all));

  ck('题目仍未被作废', !q || q.status !== 'void', q && q.status);
  ck('答案仍在输入框里', input && input.value === 'sinx', input && JSON.stringify(input.value));
  ck('按钮仍提示可以重试', button && button.textContent.trim() === '重试提交', button && button.textContent.trim());
  ck('没有写入作答记录', s && s.results.length === 0, s && s.results.length);
  ck('无运行时错误', window.__errors.length === 0, window.__errors.join(' | '));

  return JSON.stringify({ scenario: 'E 200 + reason=judge_uncertain', checks, calls: window.__mock.calls, toasts }, null, 1);
})()
