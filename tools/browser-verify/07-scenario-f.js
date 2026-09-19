(() => {
  const checks = [];
  const ck = (label, cond, detail) => checks.push({ label, ok: !!cond, detail: detail === undefined ? '' : String(detail) });

  const st = window.CalcDailyApp.getState();
  const reviews = st.reviews || [];
  const reviewSession = document.getElementById('reviewSession');
  const html = reviewSession ? reviewSession.innerHTML : '';
  const text = reviewSession ? reviewSession.innerText.replace(/\s+/g, ' ') : '';

  // ── 队列本身：同一考点只应有一个槽位，且刷新后仍然自洽 ──
  ck('两道同考点错题只占一个复习槽位', reviews.length === 1, reviews.length);
  ck('错题次数累加到 2', reviews[0] && reviews[0].wrongCount === 2, reviews[0] && reviews[0].wrongCount);

  const item = reviews[0];
  ck('题面被刷新成最近那道错题',
    item && item.expression.includes('e^x-1'), item && item.expression);

  // 这是本场景真正的回归守卫：条目必须自洽。
  ck('条目自带的快照与题面一致（不自相矛盾）',
    item && MathQuality.content(item) === item.verification.content,
    item && (MathQuality.content(item) === item.verification.content ? '一致' : '失配'));
  ck('条目仍然通过硬闸门', item && MathQuality.approved(item));

  // ── 复习会话：条目自洽的前提下，整条链路必须可用 ──
  ck('复习界面已经打开', reviewSession && getComputedStyle(reviewSession).display !== 'none',
    reviewSession && getComputedStyle(reviewSession).display);
  ck('复习卡片渲染出了题目本身', html.includes('submitAnswerBtn') || html.includes('answerInput'),
    text.slice(0, 160));
  ck('界面没有作废任何题目', !text.includes('这道题存在异常') && !html.includes('已自动作废'), text.slice(0, 160));
  ck('界面没有出现「标准答案存在问题」', !text.includes('标准答案存在问题'));

  // 作废上报不走 state，是写在 localStorage 里的
  const reports = JSON.parse(localStorage.getItem('calcDaily.questionIssues.v1') || '[]');
  ck('没有产生题目异常上报', reports.length === 0, '上报了 ' + reports.length + ' 条');

  ck('无运行时错误', window.__errors.length === 0, window.__errors.join(' | '));

  return JSON.stringify({ scenario: 'F 复习条目自洽 + 复习会话', checks, calls: window.__mock.calls, text: text.slice(0, 200) }, null, 1);
})()
