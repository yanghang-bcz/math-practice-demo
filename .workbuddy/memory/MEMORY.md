# CalcDaily 项目长期备忘

## 项目定位
考研高数自适应练习 Web 应用（静态前端 + 云函数后端）。用户目标是把它做成
「AI 出题 + 确定性验证」的可信流水线，而不是靠提示词祈祷模型别算错。

## 架构事实（别猜，按这个来）
- 静态站点从仓库根目录直接服务：`index.html` + `app.js` + `math-quality.js` + `fallback-bank.js`
- 后端有两份**同业务逻辑、不同入口**的副本，改一处必须同步另一处：
  - `api/deepseek.js`（Vercel）
  - `cloudbase/deepseek/index.js`（**实际在用**，cloudbase）
- `math-quality.js` 也有两份，必须逐字节一致：根目录一份、`cloudbase/deepseek/` 一份。
  有测试盯着（`reliability.cjs` 的 "both deployment copies have identical deterministic rules"）。
  改完用 `npm run sync:engine` 同步。
- 环境变量/密钥不在仓库里，别去找。

## 部署拓扑（两个独立部署物，会劈叉）
- **前端**：静态托管（Tencent COS，响应头 `server: tcbgw`）。v6 地址
  `https://calcdaily-v6-calcdaily-d5g2titwue91551fb.webapps.tcloudbase.com/`，
  含 7 个文件：`index.html`、`cloudbase-client.js`、`storage.js`、`auth.js`、
  `math-quality.js`、`fallback-bank.js`、`app.js`。该地址下的 `/api/*` 一律 404
  （静态托管不代理云函数）。
- **后端**：云函数 `deepseek`，HTTP 访问路径
  `https://calcdaily-d5g2titwue91551fb-1482769901.ap-shanghai.app.tcloudbase.com/api/deepseek`
  （env `calcdaily-d5g2titwue91551fb`，ap-shanghai）。部署 = 覆盖该函数的
  `index.js` + `math-quality.js`。
- **后端地址硬编码在前端**：`cloudbase-client.js` 第 21 行、`app.js` 第 1502 行。
- **只发前端 = 新客户端 + 旧后端**。此时新版服务端能力全部休眠（`canonical_suspected`
  作废、`judge_unavailable` 重试提示、服务端 `displayDifficulty` 元数据纠正、
  `canonical_answer` 冻结都不生效），但不会崩、不会损坏数据。
  **v1.1 追加的例外（要实测，别假设）**：新前端对每个响应都做版本校验。
  发布前先 `POST {"action":"generate",…}` 探一次旧后端 —— 响应里没有 `versions` 的话，
  新前端会把每次响应判成协议错误 → **所有题都回落备用题**（不崩，但等于没有 AI 出题）。
  所以 v1.1 的正确顺序是**后端先、前端后**；回滚相反（先回前端）。
  部署细节见 `RELIABILITY-TASK5.md` §5。
- **上线后必做版本自查**：
  - 后端：`GET <后端>/api/deepseek?health=1` → 新版必含 `"protocol_version":2`
    和 `"pipeline":{protocol,generator,reviewer,judge,math_engine}`；旧版只有
    `ok` / `service` / `adaptiveDifficultyModel` 三个字段。
  - 后端（更快）：`POST {"action":"judge"}` 空载荷 → 新版必带 `reason`
    （`empty_input`）和 `versions`；旧版只有 `{"verdict":"uncertain","trusted":false}`。
  - 前端：`shasum -a 256` 逐个对比线上 7 个文件与本地同名文件。
- 本机**没有任何部署凭据或 CLI**（无 `tcb` / `cloudbase` / `vercel`，无 `~/.tcb`、
  `~/.config/cloudbase`），agent 无法自行部署，必须由用户操作。

## 脚本加载顺序（有测试盯着，别乱改）
`index.html` 里必须：
```
cloudbase-client.js → storage.js → auth.js → math-quality.js → fallback-bank.js → app.js
```
`fallback-bank.js` 必须在 `app.js` **之前**，否则 `app.js` 里 `typeof FallbackBank` 取不到。

## 核心设计决策（已确立，别回退）
1. **可信来源只有两处**：`MathQuality.approved(q)`（AI 题）和 Verified Fallback Bank（备用题）。
   `trustedQuestion()` 是唯一的判定入口。
2. **失败必须带原因**。任何 `{ok:false}` / `{trusted:false}` 都要同时给出 `reason`，
   因为不同原因要不同处置。已经踩过坑：把「网络连不上」和「题目有问题」压成一个
   `trusted:false`，界面于是把网络故障说成「这道题已作废」，还丢了用户答案。
   处置规则集中在 `MathQuality.judgeOutcome()`。
3. **错误状态分类**：
   - `question_untrusted` → 作废该题
   - `judge_unavailable`（网络/超时）/ `judge_uncertain`（返回不可用）→ 保留题目和答案，让用户重试
   - 未知形态 → 一律走重试（宁可多让用户点一次，也不误作废题目）
4. **引擎宁可返回 `uncertain`，也不产生错误的拒绝**。解析失败、域外采样、数值不收敛
   都是 `uncertain`，把决定权交回上层。
5. **判题先本地后远端**：`MathQuality.judgeDeterministic` 能定的结论绝不消耗 AI 调用。
   浏览器里也跑同一份引擎（`math-quality.js` 是静态资源），所以在浏览器里就能判掉大部分。
6. **判题权限单向**（Task #4 起）：模型只能把答案判「错」，不能判「对」。
   两边的代价差一个量级 —— 错答被判对会污染学习数据且用户永远不知道；
   对答被判"暂时判不了"只是让用户再提交一次。规则在 `MathQuality.trustModelVerdict`，
   前后端共用同一条，别在别处另写一份。

## 数学验证引擎的坑（踩过的，别再犯）
- **`\frac` 的分子分母可以嵌套花括号**，`[^{}]*` 抓不住。要花括号平衡匹配 + 递归。
- **`\cos^2 x` 是 `(cos x)^2`**，不是 `cos(x^2)`，也不是把 token `cos` 平方。
- **`\sqrt{...}` 必须保留括号**。丢掉会变成 `sqrt 1+x^2` = `sqrt(1)+x^2`，静默算错。
- **数值采样不能取极小步长**。`e^x-1-x-x^2/2` 在 x=1e-6 因双精度相减抵消算出 -37.8。
  步长固定 1e-2~1e-4；极限用粗/细两套步长交叉核对，不一致就不下结论。
- **精确比较要覆盖指数写法**。`isExactForm` 只排除带小数点的字面量；
  `0` vs `1e-15`、`0` vs `1e-400` 必须判不等价。
- **`confidence` 必须 `typeof === 'number'`**，不能用 `Number()` 强转，否则 `'0.99'` 字符串能混过闸门。
- **解析器覆盖范围 = 判定走哪条路的开关**（2026-09-19 线上评测定位，Task #4 已修）。
  踩坑时的错误归因值得记住：当时以为「11 个形态都解析不出来」，实测 10/11 的
  `tryParse` 本来就 OK，真正的病根是**判题只调了 `compare()`，而 `compare` 是标量专用的**
  （只认纯数字/分数/±∞/不存在），任何表达式形态都返回 `uncertain` 漏给模型。
  **教训：定位"引擎判不了"时，先分清是 parser 读不出来，还是根本没走 parser。**
  详见下面 Task #4 一节。
- **不定积分加任意常数是等价的**（`F(x)+C+1000 ≡ F(x)+C`）。拿「答案 +常数」当错答
  会得到假阳性，设计评测探针时必须避开。

## Task #4（2026-09-20）：判题可靠性收紧 —— 已实现，待部署验证
- **`judgeDeterministic(question, candidate)` → `{verdict, layer}`**：判题唯一入口。
  `layer` ∈ `scalar`（标量比较）/ `structural`（结构检查，要采样）/ `none`（交给模型）。
  `verifyAgainstQuestion` 现在只是它的薄封装。
- **`trustModelVerdict(verdict, confidence, floor)`：模型只能判"错"，不能判"对"。**
  只采信 `not_equivalent`（+ 置信度 ≥ 0.9）；`equivalent` 一律不采信，返回
  `uncertain` + `detail: equivalent_cannot_upgrade`。**这是 Task #4 的核心**：
  `correct: true` 从此只剩"确定性引擎判 equivalent"一条来路，所以
  **`wrong_answer_accepted = 0` 是结构性保证，不是抽样结论**。前后端共用这条规则。
- **`compare()` 一个字没改，也不许改**。它做精确有理数比较（`1/6` vs `2/12` 靠它）。
  把表达式判定塞进这一层会破坏那批语义 —— `tests/math-engine.cjs` 有守卫钉着。
- **parser 真正补的两处**：① 裸 `\frac` 速写（`\frac12` = 1/2，每个参数只取**一个** token，
  读成数字串会把 `\frac12` 变成 `12/…`）；② `|A|` → `abs(A)`
  （`|` 在 tokenizer 里是非法字符，`\ln|x|+C` 这类最常见的积分答案整条解析不了）。
  两处都保守：`\frac1\pi`、嵌套 `||x|-1|`、单竖线一律**不动**，保持 unparseable → uncertain。
- **`normalize()` 的括号剥离陷阱**（本次修掉）：那条把 `(a)/(b)` 清成 `a/b` 的规则
  原本不看上下文，于是 `2(1)/(6)` 被清成 `21/6`（捏造的数），
  而 `1(2)/(3)` 与 `12/3` 被判**等价** —— 实打实的错答放行。
  现在要求左括号前不能是数字/字母/右括号。改这条要跑全量测试。
- **部署指纹：判题响应里的 `judge_layer` 字段。** 旧后端没有它。
  线上探针报告会打「部署指纹」段；没有 `judge_layer` 就说明还是旧版，那个 0 不能算验收。
- **本地判定压力测试**：`npm run probe:local -- --reuse <questions.jsonl> [--sample N] [--out DIR]`。
  不碰网络，直接把 `tools/smoke/probes.mjs` 的探针（11 条错答 + 6 条合法古怪）喂本地引擎。
  「错答放行 = 0」在这一层是**可证的**，无需部署。
- **探针设计的两条硬规矩**（`tools/smoke/probes.mjs` 顶部）：① 探针的"错"必须由代数构造，
  **不能**用判题入口判断（自证）；② 但两种情形下 `2·答案`/`-答案` 本身就是正确的
  （不定积分对常数不敏感、参考答案恒为 0），必须显式跳过，否则会把"判对了"记成"误批"。
- **`Wrong approved 0/41` 的正确读法**：那是**探测器覆盖率**的结论（引擎能判的范围内没有错答放行），
  **不是**"41 道答案都对"。Task #4 实测发现 41 道已放行题里 **4 道参考答案本身是错的**：
  `limit-L8-3`（答 -4，实为极限不存在）、`limit-L10-2`（答 -1/6，实为 -∞）、
  `limit-L12-2`（答 -1.1548，实为 **+**1.1548，符号错）、
  `integral-L4-2`（答 3ln|x-2|-2ln|x-1|+C，实为 4ln|x-2|-3ln|x-1|+C）。
  前 3 道是同一形态：**有限数字答案配一道发散的极限**，`estimateLimit` 保守返回 null，
  `ANSWER_FAILS_VERIFICATION` 不触发 → 闸门放行。第 4 道被 `|A|` 修好后已能抓出。
- **题干形态盲区**：41 道里 21 道题干引擎读不懂（`\sum`、`\begin{cases}`、隐函数二阶导、
  参数方程、`\int\frac{dx}{…}`）。这些题完全靠模型兜底，`wrong_answer_accepted = 0`
  靠的是"模型不能判对"这条规则，而不是引擎覆盖。
- `tools/smoke/run.mjs` 探针集已从 4 条扩到 17 条，报告新增判定层分布与部署指纹。
- 完整报告：`RELIABILITY-TASK4.md`。

## 测试
- `npm test` 跑 `tests/*.cjs`。Node 22 下 `node --test tests/` 不认目录，要用 `tests/*.cjs`。
- 分四类：`math-engine`（引擎）、`fallback-bank`（题库自检）、`wiring`（接线契约）、
  `reliability`（端到端回归 + 真实事故复现）。
- `wiring.cjs` 专门防「改完模块忘了改加载顺序 / 又塞回内联副本」这类只在运行时暴露的问题。
- `reliability.cjs` 的 `appHarness()` 用 `vm` 切片抽真实函数。注意：切片会连带
  `const FALLBACK_BANK = ...` 适配层，而 vm 里顶层 `const` 会遮蔽沙箱全局 →
  必须把 `FallbackBank` 模块本身喂进沙箱。
- 另有 `pipeline-v3.cjs`（Task #3 流水线契约）和 `smoke-matrix.cjs`（50 题测试台守卫）。
- 线上评测：`npm run smoke -- --label <名>`（`tools/smoke/`；后端未升级时直接拒跑），
  再用 `node tools/smoke/compare.mjs <before.json> <after.json>` 出前后对比表。
  输出落在 `.workbuddy/smoke/`。两条零容忍指标：`Wrong approved`、`错答探针被误批为对`。

## 工作方式
- 改完必须先跑 `npm test`，再用真实浏览器验证。**只看代码会漏掉整类问题**——
  本轮最重要的 bug（网络故障被报成题目有问题）就是拦截接口后在浏览器里复现出来的。
- 项目没有 sudo/Homebrew 权限限制问题，但也没有构建步骤，直接改文件即可。
- **引擎改动必须走"改 → 跑全量测试 → 拿线上样本回归"三步**：改完 `math-quality.js`
  要 `npm run sync:engine`（副本逐字节一致有测试盯着）并 `npm run check:sync`
  （两份后端业务段自 `const PIPELINE = {` 起必须逐字节一致）。
  线上样本回归：拿 `.workbuddy/smoke/<run>/questions.jsonl` 里 41 道已放行题
  重新跑 `Q.issues()`，确认没有题被**新误伤**（Task #4 改 `|A|` 时就是这么验的：
  41 道里 1 道被抓出、1 道从不判定变可判定、其余 39 道无变化）。
- **`api/deepseek.js` 是副本，不是死代码**，`check:sync` 会强制两份业务段一致。
  它和被 require 的根 `math-quality.js` 共享引擎，所以引擎改一处两份后端都生效。
- **响应里新增字段是判断"线上跑的是哪一版"的最硬信号**，比版本号常量可靠
  （改版本号常量会连带弄红 `tests/pipeline-v3.cjs` 的夹具断言）。
  Task #4 用 `judge_layer`；Task #3 用 `protocol_version` + `verification.version`。
- 历史遗留冗余（清理项，不在 Task #4 范围）：`cloudbase/.DS_Store`、根 `.DS_Store` 进了版本库。

## v1.1 可靠性收尾（Task 5A–5J，报告 `RELIABILITY-TASK5.md`）

- **判题/出题的每条失败路径都有定义的处置**：回落备用题 / 保留答案重试 / 拒绝采用 /
  停手作废。`correct:true` 仍然只有一条来路（确定性引擎判 `equivalent`），没有为了让出题
  成功率好看而放宽闸门。
- **题目身份是冻结的**：`MathQuality.freezeCanonical(q)` 写 FNV-1a 指纹，只覆盖身份
  （7 个 canonical 字段 + question_id + 来源 + 版本），**不含难度**（重新标定不算换题）。
  任何路径改到 canonical 字段 → `canonicalIntegrity().ok === false` → `issues()` 只报
  `CANONICAL_MUTATED` 且**不再验答案**。备用题同样必须冻结（它靠 bankId 命中，最易被绕）。
- **关联三个 id**：每个请求都带 `request_id` / `session_id` / `question_sequence`，
  服务端 `withResponseMeta()` 原样回显。判"重试是否同一请求""晚到的响应属于谁"都靠它。
- **版本校验有两层**：health 一次比对五版本 + **每次响应再校验一次**。
  `knownProtocolMismatch()` 只在「已确认不匹配」时走短路径（没测过/连不上都不拦，
  否则冷启动头几秒只能拿备用题）。
- **`window.CalcDailyDiag`** = 200 条环形缓冲 + 失败分类表，字段一律显式给全（缺的写 null）。
  `window.CalcDailyCloud.getSyncState()` 供验收脚本读同步状态。
- **部署顺序是硬约束：后端先，前端后。回滚相反（先回前端）。**
  新前端要求响应带五版本号与 request_id 回显；旧后端缺这些字段会被判成协议错误 →
  全部回落备用题。旧前端对新后端多出来的字段是宽容的，所以只有"后端先"安全。

## 浏览器验收（`npm run verify:browser`）

- 入口 `tools/browser-verify/run.sh`：起本地静态服务 + `agent-browser`，
  往页面注入 `01-setup.js` 接管 `window.fetch`（**不需要真后端**）。
  跑法是 `agent-browser open` → `eval "$(cat 01-setup.js)"` → 真实点击 → `eval "$(cat NN-scenario-x.js)"`
  读回 JSON 断言。`01-setup.js` 的开关：`generateFailures` / `judgeFailures` /
  `holdGenerate` / `offline` / `versions`（覆盖响应版本号）。
- **改 mock 时要跟着响应契约一起改**：新客户端校验的字段（`versions`、
  `request_id` 回显）mock 不回显的话，那些校验在浏览器里等于没测。
- **断言红之前先分清「产品错了 / 场景陈旧 / harness 坏了」**：本轮 5 处失败里
  4 处是场景陈旧、1 处是 harness，0 处是生产 bug。
- 场景文件里凡是断言依赖具体文案/数值的地方，都要在注释里写清它来自哪次有意变更。

