# CalcDaily 项目长期备忘

> 详细过程记录在仓库根的报告里，这里只留**做决定时要用的东西**：
> `RELIABILITY-TASK4.md`（判题可靠性）· `RELIABILITY-TASK5.md`（v1.1 收尾）·
> `ONLINE-VALIDATION-REPORT.md`（200 题线上评测 + §14 Task 5K）。
> 按天的工作日志在 `.workbuddy/memory/YYYY-MM-DD.md`。

## 项目定位
考研高数自适应练习 Web 应用（静态前端 + 云函数后端）。目标是一条
「AI 出题 + 确定性验证」的可信流水线，而不是靠提示词祈祷模型别算错。

## 架构事实（别猜，按这个来）
- 静态站点从仓库根目录直接服务。前端 7 个文件：
  `index.html`、`cloudbase-client.js`、`storage.js`、`auth.js`、`math-quality.js`、
  `fallback-bank.js`、`app.js`（另有 `vendor/mathjax/`，一般不动）。
- **三处副本必须同步**，有测试盯着：
  - `math-quality.js` ↔ `cloudbase/deepseek/math-quality.js` → `npm run sync:engine`
    （`reliability.cjs` 断言两者逐字节一致）
  - 后端业务段（哨兵 `const PIPELINE = {` 起到文件尾）：
    `cloudbase/deepseek/index.js`（**源，线上生效**）→ `api/deepseek.js` → `npm run sync:backend`
  - 改完一律 `npm run check:sync`（两条断言：业务段 1534+ 行一致、引擎副本一致）
- 环境变量/密钥不在仓库里，别去找。本机**没有任何部署凭据或 CLI**
  （无 `tcb`/`cloudbase`/`vercel`，无 `~/.tcb`、`~/.config/cloudbase`）——**agent 无法部署**。

## 部署拓扑
- ✅ **唯一生产域名**：`https://calcdaily-calcdaily-d5g2titwue91551fb.webapps.tcloudbase.com/`
  —— v1.1（`7f35c89`），8/8 文件逐字节一致。文档（README ×2、PRD ×2）已统一到它。
- ❌ `calcdaily-v4-…` / `calcdaily-v6-…` **已被删除**。`README` 里旧链接此前全指向 v4。
- 🔴 **默认域名会给访客弹腾讯云「风险提醒」拦截页**（`document.title = "风险提醒"`），
  必须点「确定访问」才进应用。**`curl` 完全看不到这一层**。
  要给外部使用 → 必须绑自定义域名。这是托管就绪度最后一块。
- **后端**：云函数 `deepseek`，env `calcdaily-d5g2titwue91551fb`（ap-shanghai），
  `https://calcdaily-d5g2titwue91551fb-1482769901.ap-shanghai.app.tcloudbase.com/api/deepseek`。
  部署 = 覆盖该函数的 `index.js` + `math-quality.js`。
- **后端地址硬编码在前端**：`cloudbase-client.js:21`、`app.js:1502`。
- **上线后版本自查**（顺序很重要）：
  - 后端最可靠的判别项：`GET <后端>/api/deepseek?health=1` → 看 `math_engine_version`
    （`79adbeb` 及更早没有这个字段）与 `gate_policy`（Task 5K 起才有，见下）。
    ⚠️ **`protocol_version` 不能当判别项** —— 新旧版代码里都有（犯过这个错）。
  - 前端：**先看 HTTP 状态码，再比 `shasum -a 256`**。只比哈希不比状态码会得出错误结论
    （CloudBase 的 404 页内容每次都略有不同，哈希会乱跳）。
  - ⚠️ 本机有 `HTTP_PROXY`，所有 curl 都要加 `--noproxy '*'`。
- **判断「站还在不在」有个干净的探针**（两个错误码含义完全不同）：
  - `INVALID_HOST`（JSON）= **站点不存在**（已删）
  - `NoSuchKey`（COS，HTML 带 `<li>Key: …`）= **站点存在但内容路径拼错了**
  （真实案例：托管「部署路径」配成 `/calcdaily`，导致每个 key 变成
  `calcdaily//index.html` 双斜杠 → 全 404；改成 `/` 后恢复。）
- **只发前端 = 新客户端 + 旧后端**。v1.1 起前端对每个响应做版本校验，
  旧后端响应缺 `versions` → 全部回落备用题（不崩，但没有 AI 出题）。
  所以 v1.1 顺序是**后端先、前端后**，回滚相反。细节见 `RELIABILITY-TASK5.md` §5。

## 脚本加载顺序（有测试盯着，别乱改）
```
cloudbase-client.js → storage.js → auth.js → math-quality.js → fallback-bank.js → app.js
```
`fallback-bank.js` 必须在 `app.js` **之前**，否则 `typeof FallbackBank` 取不到。

## 核心设计决策（已确立，别回退）
1. **可信来源只有两处**：`MathQuality.approved(q)`（AI 题）与 Verified Fallback Bank。
   `trustedQuestion()` 是唯一判定入口。
2. **失败必须带原因**。任何 `{ok:false}`/`{trusted:false}` 都要同时给 `reason` ——
   踩过坑：把「网络连不上」和「题目有问题」压成一个 `trusted:false`，
   界面把网络故障说成「这道题已作废」，还丢了用户答案。处置集中在 `judgeOutcome()`。
3. **错误状态分类**：`question_untrusted` → 作废该题；
   `judge_unavailable` / `judge_uncertain` → 保留题目与答案让用户重试；未知形态 → 一律重试。
4. **引擎宁可 `uncertain`，也不产生错误的拒绝**（解析失败/域外采样/不收敛 → uncertain）。
5. **判题先本地后远端**：`judgeDeterministic` 能定的绝不打 AI。浏览器里跑同一份引擎。
6. **判题权限单向**：模型只能把答案判「错」，不能判「对」。
   规则在 `MathQuality.trustModelVerdict`（只采信 `not_equivalent` + 置信度 ≥ 0.9，
   `equivalent` 一律不采信）。前后端共用同一条，别在别处另写一份。
   于是 **`correct:true` 只有一条来路：确定性引擎判 `equivalent`** —— 这是结构性保证。
7. **生成闸门与判题闸门口径不同，这是有意的**：
   - 生成端 `gateApproved()` / `gateDecision()`：**UNCERTAIN 不放行**，退备用题；
   - 判题端 `approved()`：**UNCERTAIN 放行** —— 用户正在做的题不能因为「机器验不了」作废。

## Task 5K（2026-09-21）：生成闸门不再放行未验证的答案 ← 最近的改动
- **病根**：`gateDecision()` 此前只拦 Tier C，`tier !== C` 一律 `VERIFIED`。
  而 Tier B = 「结构读得懂、这一次数值没给结论」= **同样没验证过**。
- **两个修复，各自都能拦住那次泄漏**（有意留的冗余）：
  1. **`gateStateFromProfile(profile)`**：三态的唯一映射，
     `equivalent→VERIFIED` / `not_equivalent→REJECTED` / 其余（含 Tier B）`→UNCERTAIN`。
     `gateDecision()` 与后端 `reviewQuestion()` 都改调它（原先后端自己抄了一份三元表达式）。
  2. **`toInfix` 把裸 `[ ]` 归一成 `( )`**：白名单原本只有 `+-*/^(),`，
     所以 `\left[...\right]` 整条 unparseable → Tier B。幂指函数答案几乎都长这样。
     ⚠️ 这一步**必须在剥离 `\[ \]`（display-math 定界符）之后**，否则清错。
  数值求导的接线本来就在（`verifyDerivative` 一直是 `verifyAnswerAgainstQuestion` 的一环），
  **卡住的只是 parser**。
- **原因码拆开**：Tier C → `UNVERIFIED_SHAPE`，Tier B → 新增 **`UNVERIFIED_ANSWER`**
  （两类修法不同：改题型约束 vs 换数字）。
- **部署指纹 `gate_policy = 'strict-tier-b'`**：改 VERSION 会弄红 `pipeline-v3.cjs` 的协议夹具，
  所以照 Task #4 用 `judge_layer` 的先例**加新字段**。
  出现在 health 与 generate 响应**顶层**（不进 `versions`，那是契约对象）。
  查法：`?health=1` 找 `"gate_policy"`。
  **不要**用「响应里出现了 `UNVERIFIED_ANSWER`」判断版本 —— 要抽到 Tier B 题才碰得到。
- ⚠️ **历史 200 题里 Tier B 是 0 条**（A=105 / B=0 / C=95）。
  所以那一刀在历史数据上的降级数是 **0**；抓到的 1 道（105→104）
  **完全是 parser 修好后**给的 `not_equivalent`。Tier B 保护只能靠结构论证 + 单测证明。
- **定向复测**（部署后跑；默认考点池里没有幂指函数，必须显式追加）：
  ```bash
  npm run smoke -- --label task5k-deriv \
    --only derivative-L8,derivative-L10,derivative-L12 \
    --extra-topics 'derivative:幂指函数求导,对数求导法'
  ```
  一轮 12 格（其中 5 格幂指函数），跑 3 轮 = 36 道。默认矩阵与 `HEAD` 逐题一致，历史可比。
- 完整记录：`ONLINE-VALIDATION-REPORT.md` §14。

## 数学验证引擎的坑（踩过的，别再犯）
- **`\frac` 的分子/分母可以嵌套花括号**，`[^{}]*` 抓不住，要花括号平衡匹配 + 递归。
  裸速写 `\frac12` = 1/2，每个参数只占**一个** token（读成数字串会把 `\frac12` 变成 `12/…`）。
- **`\cos^2 x` 是 `(cos x)^2`**，不是 `cos(x^2)`，也不是把 token `cos` 平方。
- **`\sqrt{...}` 必须保留括号**，丢掉会变成 `sqrt(1)+x^2` 静默算错。
- **`|A|` → `abs(A)`**：`|` 在 tokenizer 里是非法字符，`\ln|x|+C` 这类最常见的积分答案
  原本整条解析不了。规则保守：奇数个竖线 / 嵌套 / 空内容一律**不动**（保持 uncertain）。
- **`normalize()` 的括号剥离必须看上下文**：那条把 `(a)/(b)` 清成 `a/b` 的规则曾不看前一个字符，
  于是 `2(1)/(6)` 被清成 `21/6`（捏造的数），`1(2)/(3)` 与 `12/3` 被判等价 —— 错答放行。
- **数值采样不能取极小步长**。`e^x-1-x-x^2/2` 在 x=1e-6 因双精度相减抵消算出 -37.8。
  步长固定 1e-2~1e-4；极限用粗/细两套步长交叉核对，不一致就不下结论。
- **精确比较要覆盖指数写法**：`0` vs `1e-15`、`0` vs `1e-400` 必须判不等价。
- **`confidence` 必须 `typeof === 'number'`**，不能用 `Number()` 强转，否则 `'0.99'` 能混过闸门。
- **定位「引擎判不了」时，先分清是 parser 读不出来，还是根本没走 parser。**
  历史误判：以为「11 个形态都解析不出」，实测 10/11 的 `tryParse` 本就 OK，
  真正的病根是判题只调了 `compare()`（标量专用），表达式形态全返回 uncertain。
- **不定积分加任意常数是等价的**（`F(x)+C+1000 ≡ F(x)+C`）。
  拿「答案 ±常数」当错答会得到假阳性，设计探针时必须避开。
- **`compare()` 不许改**：它做精确有理数比较（`1/6` vs `2/12` 靠它），
  把表达式判定塞进这一层会破坏那批语义 —— `tests/math-engine.cjs` 有守卫钉着。

## Task #4（判题）：一句话回顾
`judgeDeterministic(question, candidate)` → `{verdict, layer}`，
`layer ∈ scalar | structural | none`。`verifyAgainstQuestion` 只是它的薄封装。
**bug 的教训**：`Wrong approved 0/41` 是**探测器覆盖率**的结论，
不是「41 道答案都对」—— 实测 41 道已放行题里 **4 道参考答案本身是错的**。
详见 `RELIABILITY-TASK4.md`。

## v1.1 的不变量（Task 5A–5J，细节见 `RELIABILITY-TASK5.md`）
- **题目身份是冻结的**：`MathQuality.freezeCanonical(q)` 写 FNV-1a 指纹，只覆盖身份
  （7 个 canonical 字段 + `question_id` + 来源 + 版本），**不含难度** ——
  重新标定不算换题。改到 canonical 字段 → `canonicalIntegrity().ok === false` →
  `issues()` 只报 `CANONICAL_MUTATED` 且**不再验答案**。**备用题也必须冻结**
  （它靠 bankId 命中，最容易被绕）。
- **三个 id 贯穿每次请求**：`request_id` / `session_id` / `question_sequence`，
  服务端 `withResponseMeta()` 原样回显。判「重试是否同一请求」「晚到的响应属于谁」都靠它。
- **版本校验两层**：health 比一次五版本 + **每次响应再校验一次**。
  `knownProtocolMismatch()` 只在「已确认不匹配」时走短路径 ——
  没测过/连不上都不拦，否则冷启动头几秒只能拿备用题。
- `window.CalcDailyDiag` = 200 条环形缓冲 + 失败分类表，字段一律显式给全（缺的写 null）；
  `window.CalcDailyCloud.getSyncState()` 供验收脚本读同步状态。
- 加分字段（新响应字段）是判断「线上跑的是哪一版」最硬的信号，**比改版本号常量可靠**
  （改常量会连带弄红 `pipeline-v3.cjs` 的协议夹具断言）。
  Task #3 用 `protocol_version` + `verification.version`，Task #4 用 `judge_layer`，
  Task 5K 用 `gate_policy`。

## 测试
- `npm test` 跑 `tests/*.cjs`（Node 22 下 `node --test tests/` 不认目录）。
- 分类：`math-engine`（引擎 + 闸门）、`fallback-bank` / `fallback-audit`（题库自检）、
  `wiring`（接线契约）、`reliability`（端到端回归 + 真实事故复现）、
  `pipeline-v3`（流水线契约）、`smoke-matrix`（50 题测试台守卫）、
  `canonical-freeze` / `wrong-canonical` / `protocol-health` / `prefetch-race` / `client-retry`。
- `wiring.cjs` 专门防「改完模块忘了改加载顺序 / 又塞回内联副本」这类只在运行时暴露的问题。
- `smoke-matrix.cjs` 同时钉住评测矩阵的**可比性**：默认矩阵逐题不变，
  只能通过 `buildMatrix(extraTopics)` 临时追加考点。
- **改引擎的流程**：改 → `npm run sync:engine` → `npm run check:sync` → `npm test`
  → 拿线上样本回归（`.workbuddy/smoke/<run>/questions.jsonl` 里的已放行题重跑 `issues()`，
  确认没有题被**新误伤**）。
- **新增回归测试时要跑反向对照**：把修复临时撤销，确认新测试真的会红。
  本轮就是这么做才发现一条断言恒真的（见下）。
- ⚠️ **测试辅助函数也会写错语义**：`wrong-canonical.cjs` 的 derivative 分支曾用
  `agreesWithDerivative(body, candidate)`，而它算的是 **`g′` 与 `body`** 比较
  （对不定积分成立，因为 body 是被积函数）。用到导数题上变成比 `f(x)` 与 `g′(x)`，
  实测对**正确答案**同样返回 `ok=0` → `assert.equal(check.ok, 0)` **恒真**，空转。
  已改用 `functionDerivativeMatches()`（算 `f′`）并加**反向守卫**：
  同一个复核必须认得出该条语料的正解。

## 线上评测
- `npm run smoke -- --label <名>`（`tools/smoke/`）。
  **开跑前先查 `?health=1`**，后端没升级直接拒跑（这是被
  「以为部署了、其实没部署」坑过之后加的）——除非显式 `--allow-old-server`。
- 报告里的「部署指纹」段会同时报 `judge_layer`（Task #4）与
  `gate_policy`（Task 5K）；不匹配时明说「本次数字不能当验收依据」。
- `node tools/smoke/compare.mjs <before.json> <after.json>` 出前后对比表。
- 两条零容忍指标：`Wrong approved`、`错答探针被误批为对`。
- `npm run probe:local -- --reuse <questions.jsonl> [--sample N] [--out DIR]`：
  不碰网络，直接把探针喂本地引擎。「错答放行 = 0」在这一层**可证**，无需部署。
- 探针设计两条硬规矩：① 探针的「错」必须由代数构造，**不能**用判题入口判断（自证）；
  ② `2·答案`/`-答案` 在不定积分与「参考答案恒为 0」两种情形下本身正确，必须显式跳过。

## 浏览器验收（`npm run verify:browser`）
- 入口 `tools/browser-verify/run.sh`：起本地静态服务 + `agent-browser`，
  注入 `01-setup.js` 接管 `window.fetch`（**不需要真后端**）。
  跑法：`agent-browser open` → `eval "$(cat 01-setup.js)"` → 真实点击 →
  `eval "$(cat NN-scenario-x.js)"` 读回 JSON 断言。
- `01-setup.js` 的开关：`generateFailures` / `judgeFailures` / `holdGenerate` /
  `offline` / `versions`。
- **改 mock 时要跟着响应契约一起改**：新客户端校验的字段（`versions`、`request_id` 回显）
  mock 不回显的话，那些校验在浏览器里等于没测。
- **断言红之前先分清「产品错了 / 场景陈旧 / harness 坏了」**。
- ⚠️ **前端改动之后必须跑真实浏览器**，不能只看 `npm test`。
  最贵的那个 bug（网络故障被报成「题目有问题」）就是拦截接口后在浏览器里复现出来的。
