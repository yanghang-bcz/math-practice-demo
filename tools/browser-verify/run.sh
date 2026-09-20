#!/bin/zsh
# =========================================================
# CalcDaily 真实浏览器验证
# =========================================================
#
# 单元测试能锁住逻辑，但锁不住「浏览器里实际发生了什么」——
# 网络故障被界面说成「这道题存在异常」那个事故，
# 就是只有真实浏览器 + 拦截接口才能暴露出来的。
#
# 这里的做法：
#   1. 起一个本地静态服务（python http.server）
#   2. 用 agent-browser 打开页面
#   3. 往页面里注入一个 fetch 覆盖层，完全接管 /api/deepseek
#      —— 想让它返回什么就返回什么，不需要真的调模型
#   4. 用真实点击/输入驱动界面，然后断言 DOM 与 state
#
# 用法：npm run verify:browser
# 前置：agent-browser 已安装（npm i -g agent-browser && agent-browser install）
# =========================================================
set -u

DIR=${0:A:h}
ROOT=${DIR:h:h}
PORT=${PORT:-8899}
URL="http://127.0.0.1:$PORT/index.html"

# agent-browser 常装在受管 Node 的 bin 下，不一定在 PATH 里
if ! command -v agent-browser >/dev/null 2>&1; then
  for candidate in "$HOME"/.workbuddy/binaries/node/versions/*/bin; do
    [ -x "$candidate/agent-browser" ] && export PATH="$candidate:$PATH"
  done
fi

if ! command -v agent-browser >/dev/null 2>&1; then
  print "✗ 找不到 agent-browser。先执行：npm i -g agent-browser && agent-browser install"
  exit 1
fi

fail=0
server_pid=""

cleanup () {
  agent-browser close >/dev/null 2>&1
  [ -n "$server_pid" ] && kill "$server_pid" 2>/dev/null
}
trap cleanup EXIT INT TERM

# ── 静态服务 ──
node "$DIR/serve.mjs" "$PORT" "$ROOT" >/dev/null 2>&1 &
server_pid=$!
sleep 2
if ! curl -s -o /dev/null --noproxy '*' "$URL"; then
  print "✗ 本地服务没起来（$URL）"; exit 1
fi

assert () {   # $1=标题 $2=断言脚本路径
  print "\n───────── $1 ─────────"
  local result
  result=$(cd "$ROOT" && agent-browser eval "$(cat "$2")")
  node -e '
const raw = process.argv[1];
let once;
try { once = JSON.parse(raw); } catch { console.log("  ❌ 无法解析页面返回：" + raw); process.exit(1); }
const data = typeof once === "string" ? JSON.parse(once) : once;
if (!data || !Array.isArray(data.checks)) { console.log("  ❌ 页面没有返回断言结果：" + JSON.stringify(once).slice(0,400)); process.exit(1); }
let bad = 0;
for (const c of data.checks) {
  if (c.ok) console.log("  ✅ " + c.label);
  else { bad++; console.log("  ❌ " + c.label + (c.detail ? "  → " + c.detail : "")); }
}
console.log("  调用序列: " + JSON.stringify(data.calls || []));
if (data.toasts) console.log("  提示文案: " + JSON.stringify(data.toasts));
process.exit(bad ? 1 : 0);
' "$result" || fail=1
}

submit () {   # $1=答案
  # agent-browser 的操作不会自动把视口外的元素滚进来，返回成功但静默落空。
  # 每次操作前都先 scrollintoview。
  agent-browser scrollintoview "#answerInput" >/dev/null 2>&1
  agent-browser fill "#answerInput" "$1" >/dev/null 2>&1
  agent-browser scrollintoview "#submitAnswerBtn" >/dev/null 2>&1
  agent-browser click "#submitAnswerBtn" >/dev/null 2>&1
  sleep 3
}

bootstrap () {   # $1=可选：在装好 mock 之后、点「开始练习」之前执行的 JS
  cd "$ROOT"
  agent-browser open "$URL" >/dev/null 2>&1
  sleep 3
  agent-browser eval "localStorage.clear(); location.reload(); 'ok'" >/dev/null 2>&1
  sleep 3
  agent-browser eval "$(cat "$DIR/01-setup.js")" >/dev/null 2>&1
  if [ -n "${1:-}" ]; then
    agent-browser eval "$1" >/dev/null 2>&1
  fi
  agent-browser click "#skipDiagnosisBtn" >/dev/null 2>&1
  sleep 1
  agent-browser click "#startDailyBtn" >/dev/null 2>&1
  sleep 3
}

# 只加载页面 + 装 mock，**不进练习**。给「不进练习也能验」的场景用：
# 进练习会触发一次真实的同步失败，把同步提示的 30 秒节流窗口占掉。
load_only () {
  cd "$ROOT"
  agent-browser open "$URL" >/dev/null 2>&1
  sleep 3
  agent-browser eval "localStorage.clear(); location.reload(); 'ok'" >/dev/null 2>&1
  sleep 3
  agent-browser eval "$(cat "$DIR/01-setup.js")" >/dev/null 2>&1
}

# ═══ 场景 A：soft 修正只改展示 ═══
bootstrap
assert "场景 A：soft 修正只改展示，不改 canonical、不作废题目" "$DIR/02-scenario-a.js"

# ═══ 场景 B：canonical_suspected ═══
cd "$ROOT"
agent-browser eval "window.__mock.judge = { verdict:'canonical_suspected', trusted:false, reason:'canonical_suspected' }; 'ok'" >/dev/null 2>&1
submit "sinx"
assert "场景 B：判题员怀疑标准答案 → 作废且不归咎学生" "$DIR/03-scenario-b.js"

# ═══ 场景 C：判题服务 503 ═══
cd "$ROOT"
agent-browser eval "window.__mock.judgeStatus = 503; 'ok'" >/dev/null 2>&1
bootstrap
cd "$ROOT"
agent-browser eval "window.__mock.judgeStatus = 503; 'ok'" >/dev/null 2>&1
submit "sinx"
assert "场景 C：判题服务连不上 → 保留题目与答案，提示重试" "$DIR/04-scenario-c.js"

# ═══ 场景 D：HTTP 200，但服务端 reason=judge_unavailable ═══
# 场景 C 走的是 apiCall 抛错那条路；这里走 200 响应带 reason 那条路，
# 也就是「客户端必须原样照搬服务端失败原因」这条规则真正被执行的地方。
cd "$ROOT"
agent-browser eval "window.__toasts = []; window.__mock.judgeStatus = 200; window.__mock.judge = { trusted:false, verdict:'uncertain', reason:'judge_unavailable' }; 'ok'" >/dev/null 2>&1
submit "sinx"
assert "场景 D：服务端 reason=judge_unavailable → 文案必须是「连不上」" "$DIR/05-scenario-d.js"

# ═══ 场景 E：HTTP 200，reason=judge_uncertain（反向验证）═══
cd "$ROOT"
agent-browser eval "window.__toasts = []; window.__mock.judge = { trusted:false, verdict:'uncertain', reason:'judge_uncertain' }; 'ok'" >/dev/null 2>&1
submit "sinx"
assert "场景 E：服务端 reason=judge_uncertain → 文案必须与之区分" "$DIR/06-scenario-e.js"

# ═══ 场景 F：同一考点第二次做错 → 复习条目必须保持自洽 ═══
# 复习队列按 module:topic 建槽位，所以同考点第二道错题会复用同一个条目。
# 旧写法只覆盖题面字段、不动 verification 快照，条目于是持有一份描述
# 另一道题的验证快照。
submit_wrong_two_same_topic () {
  bootstrap
  cd "$ROOT"
  submit "0"
  # 手动进入下一题，并强制它是另一道同考点的题
  # 注意：agent-browser 的 click 不会自动把视口外的元素滚进来，必须先 scrollintoview，
  # 否则点击会静默落空（返回成功但什么也没发生）。
  agent-browser eval "window.__mock.nextIndex = 1; 'ok'" >/dev/null 2>&1
  agent-browser scrollintoview "#nextQuestionBtn" >/dev/null 2>&1
  agent-browser click "#nextQuestionBtn" >/dev/null 2>&1
  sleep 3
  submit "0"
}

submit_wrong_two_same_topic
# 把复习条目改为已到期，然后重新加载（reload 会清掉注入的 mock，要重装）
agent-browser eval "$(cat "$DIR/08-make-reviews-due.js")" >/dev/null 2>&1
sleep 3
agent-browser eval "$(cat "$DIR/01-setup.js")" >/dev/null 2>&1
agent-browser click '[data-view-target="review"]' >/dev/null 2>&1
sleep 2
agent-browser click "#startReviewBtn" >/dev/null 2>&1
sleep 3
assert "场景 F：同考点第二道错题 → 复习条目自洽，复习会话可用" "$DIR/07-scenario-f.js"

# ═══ 场景 G：AI 出题彻底失败 → 备用题库兜底 ═══
# 出题返回 503（重试后仍然 503）时，用户必须拿到一道经过确定性验证的备用题，
# 而不是空白页面或者一句「出题失败」。
bootstrap 'window.__mock.generateStatus = 503; "ok"'
sleep 6
assert "场景 G：AI 出题失败 → 落回已验证备用题库" "$DIR/09-scenario-g.js"

# ═══ 场景 H：出题 5xx 一次 → 客户端自动重试并拿到 AI 题 ═══
# 与 G 配对：同样是 503，区别只在于第二次成功了 —— 那就必须给 AI 题，
# 而不是白白把用户推到备用题。
bootstrap 'window.__mock.generateFailures = 1; "ok"'
sleep 6
assert "场景 H：出题 5xx 一次 → 自动重试后拿到 AI 题" "$DIR/10-scenario-h.js"

# ═══ 场景 J：云同步失败 → 诊断留痕 + 节流提示 ═══
# 注意：这里**只加载页面和 mock，不进练习**。进练习本身会触发一次真实的
# 同步失败，把 30 秒的提示节流窗口占掉，于是 J1 的第一条提示会被吞掉 ——
# 那不是 bug，是节流在正常工作，但会让断言变成薛定谔的。
load_only
assert "场景 J1：同步失败 → 提示一次 + 诊断留痕 + 30 秒节流" "$DIR/11-scenario-j1.js"
sleep 31
assert "场景 J2：节流窗口过期后，断网文案也正常出现" "$DIR/11-scenario-j2.js"

# ═══ 场景 K：前后端版本劈叉 ═══
# 让服务端把 math_engine 报成 quality-v1（本机是 quality-v2）。客户端必须
# 拒绝这道由另一套引擎验证出来的题、改用备用题库，并在状态栏用红点说明原因 ——
# 劈叉部署时最危险的状态恰恰是「一切看起来正常」。
bootstrap 'window.__mock.versions = { protocol: 2, generator: "generator-v2", reviewer: "reviewer-v2", judge: "judge-v2", math_engine: "quality-v1" }; "ok"'
sleep 7
assert "场景 K：版本不匹配 → 拒绝服务端题 + 状态栏报警" "$DIR/12-scenario-k.js"

if [ $fail -ne 0 ]; then print "\n✗ 有场景失败"; exit 1; fi
print "\n✓ 全部场景通过"
