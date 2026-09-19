(() => {
  // 复习条目入队时 nextReviewAt 是「两天后」，所以当天进不了复习会话。
  // 这里把到期时间改到过去，模拟"复习已经到期"，然后重新加载让 app 读取。
  const KEY = 'calcDaily.v2';
  const raw = localStorage.getItem(KEY);
  if (!raw) return JSON.stringify({ error: '没有本地状态', items: 0 });

  const st = JSON.parse(raw);
  const items = st.reviews || [];
  for (const r of items) r.nextReviewAt = '2020-01-01';

  localStorage.setItem(KEY, JSON.stringify(st));
  location.reload();
  return JSON.stringify({ items: items.length });
})()
