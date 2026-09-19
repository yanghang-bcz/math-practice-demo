(() => {
  const checks = [];
  const ck = (label, cond, detail) => checks.push({ label, ok: !!cond, detail: detail === undefined ? '' : String(detail) });

  const session = document.getElementById('dailySession');
  const html = session ? session.innerHTML : '';
  const input = document.getElementById('answerInput');
  const button = document.getElementById('submitAnswerBtn');

  const st = window.CalcDailyApp.getState();
  const s = st.activeSession;
  const q = s && s.currentQuestion;

  const toasts = window.__toasts.slice();

  ck('判题确实又调了一次服务端', window.__mock.calls.filter(c => c === 'judge').length >= 2,
    window.__mock.calls.join(','));

  // ── 核心：服务端说了 judge_unavailable，客户端必须原样照搬 ──
  // 旧代码只认 question_untrusted，其余一律归到 judge_uncertain，
  // 于是「连不上判题服务」被说成「判题服务没给出结论」——原因在客户端丢掉了。
  ck('提示语是「连不上判题服务」', toasts.some(t => t.includes('连不上判题服务')), JSON.stringify(toasts));
  ck('没有把它降级成「没能给出结论」', !toasts.some(t => t.includes('没能给出结论')), JSON.stringify(toasts));

  ck('题目没有被作废', !q || q.status !== 'void', q && q.status);
  ck('输入框里保留了答案', input && input.value === 'sin(x)', input && JSON.stringify(input.value));
  ck('按钮仍提示可以重试', button && button.textContent.trim() === '重试提交', button && button.textContent.trim());
  ck('没有写入作答记录', s && s.results.length === 0, s && s.results.length);
  ck('无运行时错误', window.__errors.length === 0, window.__errors.join(' | '));

  return JSON.stringify({ scenario: 'D 200 + reason=judge_unavailable', checks, calls: window.__mock.calls, toasts }, null, 1);
})()
