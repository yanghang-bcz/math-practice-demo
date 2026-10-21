# CalcDaily 项目长期备忘

> 只留**做决定时要用的东西**。过程细节在仓库根的报告里：
> `RELIABILITY-TASK4.md`（判题）· `RELIABILITY-TASK5.md`（v1.1）·
> `ONLINE-VALIDATION-REPORT.md`（线上评测 + §14 Task 5K + §15 v1.1 验收）。
> 按天日志在 `.workbuddy/memory/YYYY-MM-DD.md`。

## 项目定位
考研高数自适应练习 Web 应用（静态前端 + 云函数后端）。核心是
「AI 出题 + 确定性验证」的可信流水线，不靠提示词祈祷模型别算错。

## 架构
- 静态站点从仓库根直接服务，前端 7 个文件：`index.html`、`cloudbase-client.js`、
  `storage.js`、`auth.js`、`math-quality.js`、`fallback-bank.js`、`app.js`
  （另有 `vendor/mathjax/`，一般不动）。
- 加载顺序（`wiring.cjs` 钉着，别乱改）：
  `cloudbase-client → storage → auth → math-quality → fallback-bank → app`。
  `fallback-bank.js` 必须在 `app.js` 前，否则 `typeof FallbackBank` 取不到。
- **三处副本必须同步**（有测试断言）：
  - `math-quality.js` ↔ `cloudbase/deepseek/math-quality.js` → `npm run sync:engine`
  - 后端业务段（哨兵 `const PIPELINE = {` 到文件尾）：
    `cloudbase/deepseek/index.js`（**源，线上生效**）→ `api/deepseek.js` → `npm run sync:backend`
  - 改完一律 `npm run check:sync`。
- 密钥/环境变量不在仓库里。本机**无任何部署凭据或 CLI**（无 `tcb`/`cloudbase`/`vercel`）
  —— **agent 无法部署**，只能改代码 + push，部署要用户做。
- 🔴 **`git push` 假失败陷阱**：会打印
  `fatal: could not read Username for 'https://github.com': terminal prompts disabled`
  并非零退出，**但推送其实成功了**。别凭这句 fatal 重推。
  判据只看 sha：`git ls-remote origin main` vs `git rev-parse main`。
  （`~/.ssh`、`~/.netrc`、`~/.git-credentials` 均不存在，钥匙串也查不到 → 根因未定论。）
- `git add` 报 `File exists` 撞 `.git/index.lock` 时，先看锁的 mtime：
  几天前的 0 字节残留直接 `rm -f`；刚产生的要先怀疑真有 git 在跑。

## 仓库基线
- HEAD = `origin/main` = **`ab0e0a0`**（2026-10-07，Task 5K 修复 + 验收报告 §15）。
- ⚠️ 此前 `origin/main` 长期停在 `f25e76b`（= Task 5K **之前**）。
  **从旧 commit 部署会静默把线上覆盖回有 P0 洞的版本**，不报错。

## 部署拓扑
- **生产域名两个**：
  - `https://calcdaily.cn/` ← 自定义域名（2026-10 绑定，证书 10-13 签发），
    **无腾讯云「风险提醒」拦截页**，浏览器直开即进应用；7 文件与本地逐字节一致，
    AI 状态「已连接」；**云开发安全域名白名单已含该域**（判定手法见 `2026-10-16.md`）。
    缺口：`www.calcdaily.cn` 无 DNS；`http://` 不强制跳 HTTPS。
  - `https://calcdaily-calcdaily-d5g2titwue91551fb.webapps.tcloudbase.com/` ← 默认域名，
    **会弹「风险提醒」拦截页**（`document.title = "风险提醒"`），curl 看不到这一层。
  - ❌ `calcdaily-v4-…` / `calcdaily-v6-…` 已删除（README 旧链接曾指向 v4）。
- **后端**：云函数 `deepseek`，env `calcdaily-d5g2titwue91551fb`（ap-shanghai），
  `https://calcdaily-d5g2titwue91551fb-1482769901.ap-shanghai.app.tcloudbase.com/api/deepseek`。
  部署 = 覆盖该函数的 `index.js` + `math-quality.js`。
  后端地址**硬编码在前端**：`cloudbase-client.js:21`、`app.js:1502`。
- **上线后版本自查**：
  - 后端：`GET <后端>?health=1`，看 `math_engine_version`（老版没有）+ `gate_policy`（Task 5K 起）。
    ⚠️ `protocol_version` **不是**判别项（新旧都有）。
  - 前端：**先看 HTTP 状态码再看 `shasum -a 256`**（只看哈希会被 404 页的抖动带偏）。
  - curl 一律 `--noproxy '*'`。
- **判断「站还在不在」的干净探针**：`INVALID_HOST`（JSON）= 站点不存在；
  `NoSuchKey`（COS，HTML 带 `<li>Key: …`）= 站点在但内容路径拼错。
- **只发前端 = 新客户端 + 旧后端**：旧后端响应缺 `versions` → 全回落备用题
  （不崩，但没有 AI 出题）。所以升级顺序**后端先、前端后**，回滚相反。
- 🔴 **本机系统代理**（`scutil --proxy`：HTTP/HTTPS/SOCKS 全 `127.0.0.1:7897`）。
  **浏览器/GUI 走它，curl/Playwright 不走** —— 「我测是好的、用户说坏了」多半出在这。
  经代理访问后端 health 要 **2~11s**（后端自报仅几十 ms；直连 0.15s），
  会打爆前端 `HEALTH_TIMEOUT_MS = 8000` → 状态栏显示「AI 服务未连接」。
  该 `apiHealthy` **只驱动状态栏文案**，不 gate 任何请求（出题 60s / 判题 22s），
  且超时后**无自动重试**。所以那句话 ≠ AI 挂了。

## 核心设计决策（已确立，别回退）
1. **可信来源只有两处**：`MathQuality.approved(q)`（AI 题）与 Verified Fallback Bank，
   `trustedQuestion()` 是唯一入口。
2. **失败必须带原因**：任何 `{ok:false}`/`{trusted:false}` 都要同时给 `reason`。
   踩过坑：把「网络连不上」和「题目有问题」压成一个 `trusted:false`，
   界面把网络故障说成「这道题已作废」还丢了答案。处置集中在 `judgeOutcome()`。
3. **错误分类**：`question_untrusted` → 作废该题；
   `judge_unavailable` / `judge_uncertain` / 未知形态 → 保留题目与答案让用户重试。
4. 引擎宁可 `uncertain`，也不产生错误的拒绝。
5. **判题先本地后远端**：`judgeDeterministic` 能定的绝不打 AI。
6. **判题权限单向**：模型只能判「错」。规则在 `MathQuality.trustModelVerdict`
   （只采信 `not_equivalent` + `confidence` 是 number 且 ≥ 0.9；`equivalent` 不采信）。
   于是 **`correct:true` 只有一条来路：确定性引擎判 `equivalent`**。
7. **两侧闸门口径不同是有意的**：生成端 `gateApproved()` **UNCERTAIN 不放行**（退备用题）；
   判题端 `approved()` **UNCERTAIN 放行**（用户正在做的题不因「机器验不了」作废）。

## Task 5K（2026-09-21）：生成闸门不再放行未验证答案 ← 最近的功能改动
- **病根**：`gateDecision()` 只拦 Tier C，`tier !== C` 一律 `VERIFIED`；
  而 Tier B（结构读得懂、这一次数值没结论）= **同样没验证过**。
- **两个修复（有意冗余，各自都能拦住那次泄漏）**：
  1. `gateStateFromProfile(profile)` —— 三态唯一映射：
     `equivalent→VERIFIED` / `not_equivalent→REJECTED` / 其余（含 Tier B）`→UNCERTAIN`。
     `gateDecision()` 与后端 `reviewQuestion()` 都调它（原先后端自己抄了三元式）。
  2. `toInfix` 把裸 `[ ]` 归一成 `( )`（白名单原本只有 `+-*/^(),`，
     于是 `\left[...\right]` 整条 unparseable → Tier B；幂指函数答案几乎都长这样）。
     ⚠️ 必须在剥离 `\[ \]` 定界符**之后**做。
- **原因码**：Tier C → `UNVERIFIED_SHAPE`；Tier B → **`UNVERIFIED_ANSWER`**。
  关系：`UNVERIFIED_ANSWER` ⟺ readable 且 verdict ∉ {equivalent, not_equivalent} ⟺ Tier B。
- **部署指纹 `gate_policy = 'strict-tier-b'`**：照 `judge_layer` 先例加新字段
  （改 VERSION 会弄红 `pipeline-v3.cjs` 夹具），出现在 health 与 generate 响应**顶层**。
- ⚠️ 历史 200 题里 Tier B = 0 条，所以这刀在老数据上降级数 **0**，只能靠结构论证 + 单测。
- **线上判别手法**：`judge` 动作处理前先跑 `Quality.approved(q)`，返回
  `question_untrusted` 即证明部署端引擎判 REJECTED（UNCERTAIN 是放行的）。
- 定向复测：`npm run smoke -- --label task5k-deriv --only derivative-L8,derivative-L10,derivative-L12 --extra-topics 'derivative:幂指函数求导,对数求导法'`
  （默认考点池没有幂指函数，必须显式追加；一轮 12 格）。
- 验收结论（§15）：36 格 → 放行 15 / fallback 21；三态 VERIFIED 15；
  独立复核 11 函数 44 采样点全对；线上 Tier B 放行为 VERIFIED **0 次**；
  三硬指标（wrong_approved / canonical_drift / judge_inconsistency）全 0；`npm test` 249/249。

## AI 连接稳定性（2026-10-16 实测，完整报告见 `NETWORK-STABILITY-REPORT.md`）
- **连接本身没问题**：health 直连 60/60 + 30/30（p50 100ms，后端自报 19~21ms）；
  真实浏览器走系统代理 **10/10（p50 59ms）**；generate 失败 **0/36** 是网络原因。
  「AI 连接不稳定」这个判断**不成立**。
- 🔴 **curl 走代理的数字不代表浏览器**：curl 仅 6~18/30、`SSL_ERROR_SYSCALL`、还出现过
  5 次挂起 600~1040s（`--max-time` 没兜住，且把本机 DNS 拖挂 → 后续全 `Could not resolve host`）。
  差别在**连接复用**：浏览器保持长隧道，curl 每次新开。**探针必须同时给
  `--connect-timeout`，两条路径的数字要一起看。**
- **真正原因是生成闸门拒稿，且强依赖考点**：50 格矩阵 **25/50**；
  derivative **2/18=11%** / limit 7/14 / integral 16/18。
  **0% 考点**（引擎结构上验不了）：`隐函数求导`、`参数方程求导`、`分段点处的可导性`、
  `复合函数求导`、`定积分定义求数列极限`。
- 🔴 **口径陷阱**：矩阵**钉死考点**；真实产品 `chooseWeakTopic()` 多数返回 **null**。
  导数模块同一批请求：钉考点 **5/18=28%**，`topic:null` **18/18=100%**。
  **钉考点测出的成功率不能当用户体感**（探针 `--loose-topic` 就是为这个加的）。
  连锁缺陷：在「隐函数求导」做错的学生会被反复喂这一考点 → 永远备用题。
- **判题「等价形式」覆盖率其实很好**：16 用例（每条配原答案对照）→ 对照 14/14，
  改写认对 **13/14**。唯一缺口是**前置常数** `C+\arctan x`：
  `math-quality.js:1073 stripPlusC()` 只剥尾部 `+C`。这条**与网络无关**（本地引擎先跑，
  uncertain 才打网络），只能靠扩引擎覆盖，不能放松模型权限。
- **放大器**：闸门拒稿返回 **HTTP 500**（`index.js:1290` 设了 `error.code` 却没设
  `statusCode`），而 `app.js:2034 apiRetryable()` 认为 5xx 可重试 →
  一次拒稿最多烧 4 次模型调用、用户等 ~12s（**代码推断**，未直接测）。
- **副作用**：`topic:null` 下 18 道里 `((x)/(x+1))^x` 出现 8 次 —— 通过率上去了，多样性掉了。
- 探针：`npm run net:stability -- --mode health|generate|judge|equiv|session
  --via direct|proxy --n N [--modules derivative] [--loose-topic]`。

## 数学验证引擎的坑（踩过的，别再犯）
- `\frac` 分子分母可嵌套花括号，要平衡匹配 + 递归；裸 `\frac12` = 1/2，
  每个参数只占**一个** token（读成数字串会变成 `12/…`）。
- `\cos^2 x` = `(cos x)^2`，不是 `cos(x^2)`，也不是把 token `cos` 平方。
- `\sqrt{...}` 必须保留括号（丢了会变成 `sqrt(1)+x^2` 静默算错）。
- `|A|` → `abs(A)`（`|` 在 tokenizer 里非法，`\ln|x|+C` 这类原本整条解析不了）。
  规则保守：奇数个竖线 / 嵌套 / 空内容一律不动。
- `normalize()` 的括号剥离必须看上下文：曾不看前一个字符，把 `2(1)/(6)` 清成 `21/6`
  （捏造的数），`1(2)/(3)` 与 `12/3` 判等价 → 错答放行。
- 数值采样不能取极小步长（`e^x-1-x-x²/2` 在 x=1e-6 因抵消算出 -37.8）。
  步长固定 1e-2~1e-4；极限用粗/细两套步长交叉核对，不一致不下结论。
- 精确比较要覆盖指数写法：`0` vs `1e-15`、`0` vs `1e-400` 必须判不等价。
- 「引擎判不了」要先分清是 **parser 读不出**，还是**根本没走 parser**。
  历史误判：以为 11 个形态都解析不出，实测 10/11 的 `tryParse` 本就 OK，
  真病根是判题只调了 `compare()`（标量专用）。
- **不定积分加任意常数等价**（`F(x)+C+1000 ≡ F(x)+C`），拿「±常数」当错答是假阳性。
- **`compare()` 不许改**：它做精确有理数比较（`1/6` vs `2/12` 靠它），
  `tests/math-engine.cjs` 有守卫钉着。

## Task #4（判题）：一句话
`judgeDeterministic(question, candidate)` → `{verdict, layer}`，`layer ∈ scalar|structural|none`。
教训：`Wrong approved 0/41` 是**探测器覆盖率**的结论，实测 41 道里 **4 道参考答案本身是错的**。

## v1.1 不变量（细节见 `RELIABILITY-TASK5.md`）
- **题目身份冻结**：`freezeCanonical(q)` 写 FNV-1a 指纹，只覆盖 7 个 canonical 字段 +
  `question_id` + 来源 + 版本，**不含难度**（重标定不算换题）。canonical 被改 →
  `issues()` 只报 `CANONICAL_MUTATED` 且不再验答案。**备用题也必须冻结**。
- **三个 id 贯穿每次请求**：`request_id` / `session_id` / `question_sequence`，
  服务端 `withResponseMeta()` 原样回显。
- **版本校验两层**：health 比五版本 + 每次响应再校验。`knownProtocolMismatch()`
  只在「已确认不匹配」时走短路径（没测过/连不上都不拦，否则冷启动只拿备用题）。
- `window.CalcDailyDiag` = 200 条环形缓冲 + 失败分类表（字段显式给全）；
  `window.CalcDailyCloud.getSyncState()` 读同步状态。
- **判断「线上跑哪一版」看加分字段**，比改版本号常量可靠：
  Task #3 `protocol_version` + `verification.version`，Task #4 `judge_layer`，Task 5K `gate_policy`。

## 测试
- `npm test` 跑 `tests/*.cjs`（Node 22 下 `node --test tests/` 不认目录）。当前 249 通过。
- 分类：`math-engine`、`fallback-bank`/`fallback-audit`、`wiring`（接线契约）、
  `reliability`（端到端 + 真实事故复现）、`pipeline-v3`、`smoke-matrix`、
  `canonical-freeze`、`wrong-canonical`、`protocol-health`、`prefetch-race`、`client-retry`。
- **改引擎流程**：改 → `sync:engine` → `check:sync` → `npm test` → 拿线上样本回归
  （`.workbuddy/smoke/<run>/questions.jsonl` 重跑 `issues()`，确认没有题被新误伤）。
- **新增回归测试要跑反向对照**（临时撤销修复，确认测试真的会红）。
- ⚠️ **测试辅助函数也会写错语义**：`wrong-canonical.cjs` 的 derivative 分支曾比
  `f(x)` 与 `g′(x)`，对正确答案也返回 `ok=0` → 断言恒真空转。已改用
  `functionDerivativeMatches()` 并加反向守卫（同一复核要认得出正解）。

## 线上评测 / 探针
- `npm run smoke -- --label <名>`。**开跑前先查 `?health=1`**，后端没升级直接拒跑
  （除非 `--allow-old-server`）。报告「部署指纹」段同时报 `judge_layer` 与 `gate_policy`，
  不匹配时明说「本次数字不能当验收依据」。
- `node tools/smoke/compare.mjs <before.json> <after.json>` 出前后对比。
- 两条零容忍指标：`Wrong approved`、`错答探针被误批为对`。
- `npm run probe:local -- --reuse <questions.jsonl> [--sample N] [--out DIR]`：
  不碰网络喂本地引擎，「错答放行 = 0」在这一层可证。
- 探针两条硬规矩：① 探针的「错」必须由**代数构造**，不能用判题入口判断（自证）；
  ② `2·答案`/`-答案` 在不定积分与「参考答案恒为 0」两种情形下本身正确，必须显式跳过。

## 浏览器验收（`npm run verify:browser`）
- `tools/browser-verify/run.sh`：本地静态服务 + `agent-browser`，
  `01-setup.js` 接管 `window.fetch`（**不需要真后端**）。
  跑法：`agent-browser open` → `eval "$(cat 01-setup.js)"` → 真实点击 →
  `eval "$(cat NN-scenario-x.js)"` 读回 JSON 断言。
  开关：`generateFailures` / `judgeFailures` / `holdGenerate` / `offline` / `versions`。
- **改 mock 要跟响应契约一起改**（`versions`、`request_id` 回显），否则那些校验等于没测。
- ⚠️ **前端改完必须跑真实浏览器**，不能只看 `npm test`。
  最贵的 bug（网络故障被报成「题目有问题」）就是拦截接口后在浏览器里复现的。
- `agent-browser` 不在 PATH：`export PATH="$HOME/.workbuddy/binaries/node/workspace/node_modules/.bin:$PATH"`。
- `agent-browser open --init-script <js>` 可给指定 URL 的 `fetch` 人为加延迟，
  不改产品代码就能复现超时类故障（含腾讯云「风险提醒」拦截页，每会话必现需重新点）。
