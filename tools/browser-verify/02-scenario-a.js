(() => {
  const checks = [];
  const ck = (label, cond, detail) => checks.push({ label, ok: !!cond, detail: detail === undefined ? '' : String(detail) });

  const badge = document.getElementById('difficultyBadge');
  const session = document.getElementById('dailySession');
  const text = (session ? session.innerText : '').replace(/\s+/g, ' ');
  const bodyText = document.body.innerText;

  const st = window.CalcDailyApp.getState();
  const q = st.activeSession && st.activeSession.currentQuestion;

  ck('题目已生成', !!q, q ? q.source : 'no question');
  ck('AI 生成（不是走了备用题）', q && q.source === 'ai', q && q.source);
  ck('题目状态是 approved', q && q.status === 'approved', q && q.status);

  // ── 核心：展示层修正生效，canonical 不变 ──
  ck('canonical topic 未被展示层污染', q && q.topic === '重要极限', q && q.topic);
  ck('展示层 topic 生效', q && q.displayTopic === '洛必达法则', q && q.displayTopic);
  ck('卡片上显示的是修正后的考点', text.includes('洛必达法则'), text.slice(0, 120));
  ck('卡片上没有出现原始考点', !text.includes('重要极限'), text.slice(0, 120));

  ck('展示层难度仍被记录在题目上（不丢数据）', q && q.displayDifficulty === 8, q && q.displayDifficulty);
  /* Task #4 起审核员的 suggested_difficulty 不再参与界面：线上 50 题评测量出
     这条链路跑偏得很厉害（计划 L12 的题显示成 L3/L4），所以难度徽章回到
     生成时的难度估计（6.0），displayDifficulty 只留档、不显示。 */
  ck('难度徽章不采用展示层难度，回到生成时的估计 6.0',
    badge && badge.textContent.trim() === '难度 6.0',
    badge ? badge.textContent.trim() : 'no badge');

  // ── 修正不得把题目弄失效 ──
  ck('没有出现「已自动作废」', !bodyText.includes('已自动作废'));
  ck('没有出现「标准答案存在问题」', !bodyText.includes('标准答案存在问题'));
  ck('题目没有被判为不可信', q && q.status !== 'void', q && q.status);
  ck('服务端 verification 仍在题目上', q && !!q.verification);

  ck('判题上下文里没有解析', window.__mock.judgeBodies.every(b => !JSON.stringify(b).includes('利用重要极限')));

  ck('无运行时错误', window.__errors.length === 0, window.__errors.join(' | '));

  return JSON.stringify({ scenario: 'A 展示层修正', checks, calls: window.__mock.calls }, null, 1);
})()
