# CalcDaily v1.1 · Reliability Finalization —— 交付报告（Task 5A–5N）

日期：2026-09-20　范围：只做「把不可靠的地方变可靠」，最高优先原则是
**不为了提高出题成功率放松数学正确性**。

**未部署、未 push、未 commit。** 本报告里的所有结论都来自本地实跑。

---

## 0. 一句话结论

**这一版把「失败时的行为」也做成了可验收的东西。**

以前的可靠性只覆盖「一切顺利」那条路：模型答得对、网络通畅、用户按顺序点。
一旦任何一环出错，链路上就没有第二套定义好的行为 —— 于是出现过
「网络故障被说成题目有问题」、「答案被判错但标准答案本身是错的」、
「同一道题被反复推送」、「等 180 秒还不知道出了什么事」这些事。

现在这条链上的每个失败模式都有：**一个确定的处置**（回落备用题 / 保留答案重试 /
拒绝采用 / 停手作废）、**一句给用户的话**、**一条可聚合的诊断记录**，
以及**一个锁住它的测试**（单测 + 真实浏览器两种）。

两条底线没有让步：

- `correct: true` 仍然只有一条来路 —— 确定性引擎判 `equivalent`。
  本轮新增的 5A–5J 全部是「失败时怎么退」，没有任何一条放宽闸门。
- 备用题库仍然是**逐题机器可验**的：60/60 全部由确定性引擎判定，
  **一条 `uncertain` 都没有**（安全网里不该有需要人背书的条目）。

---

## 1. 改动文件

### 前端

| 文件 | 改了什么 |
| --- | --- |
| `app.js` | 5D 题目身份冻结与异常隔离；5E 预取竞态防护（`request_id`/`session_id`/`question_sequence` + `issued` 单调计数 + await 前后双重校验）；5F 逐次超时/重试/墙钟预算；5H 诊断缓冲 `window.CalcDailyDiag`；5I 健康检查与逐次响应版本校验；5J 云同步状态 → 诊断 + 30 秒节流提示 |
| `storage.js` | 5J：同步串行链 + 12s 超时 + 2 次重试 + 瞬时/永久失败分类 + 断网跳过 + `online`/`visibilitychange` 自动补同步 + `getSyncState()`（供验收脚本读） |
| `index.html` | 仅脚本加载顺序相关（`math-quality.js` → `fallback-bank.js` → `app.js`） |

### 共享引擎（唯一真源）

| 文件 | 改了什么 |
| --- | --- |
| `math-quality.js` | 5A 发散检测 + 纯常量表达式求值；5B Tier A/B/C 覆盖面分级；5C Hard Gate 三态；5D Canonical Package（FNV-1a 身份指纹、`canonicalIntegrity`、`freezeCanonical`）；`issues()` 遇到被改写过的题先报 `CANONICAL_MUTATED` 并停手 |
| `cloudbase/deepseek/math-quality.js` | 引擎副本，`npm run sync:engine` 同步，逐字节一致 |

### 后端（两份副本，业务段强制逐字节一致）

| 文件 | 改了什么 |
| --- | --- |
| `cloudbase/deepseek/index.js` | **线上真正跑的那份**（`cloudbase-client.js` 把 `/api/deepseek` 重写到 CloudBase 网关）。5E/5I：`withResponseMeta()` 在每个 action 的响应上回显 `request_id`/`session_id`/`question_sequence` + 五个版本号；`CALL_POLICY` 收窄为 generate 25s×1、review 18s×2、judge 20s×1、evaluate 12s×2；出题/判题日志补齐关联字段 |
| `api/deepseek.js` | Vercel 那份副本，同样改动（`npm run check:sync` 强制一致） |

### 测试与工具

| 文件 | 说明 |
| --- | --- |
| `tests/fallback-audit.cjs` | **新**。5G：题库审计 26 条（60/60 确定性可验、身份唯一、去重后仍有候选、生产降级路径、空池必须显式抛错） |
| `tests/canonical-freeze.cjs` | **新**。5D：11 条 |
| `tests/prefetch-race.cjs` | **新**。5E：13 条 |
| `tests/client-retry.cjs` | **新**。5F：14 条 |
| `tests/protocol-health.cjs` | **新**。5I：16 条 |
| `tests/sync-reliability.cjs` | **新**。5J：10 条 |
| `tools/test-support.cjs` | **新**。测试共用基建：从 `app.js` 源码按顶层声明边界切出生产函数，常量/`let` 从源码重建（避免测试里再抄一份口径） |
| `tools/sync-backend.mjs` | **新**。两份后端的同步工具 |
| `tools/browser-verify/01-setup.js` | mock 升级：支持 `generateFailures` / `judgeFailures` / `holdGenerate` / `offline` / `versions` 覆盖，并在响应里回显 `request_id`/`session_id`/`question_sequence`/`versions` |
| `tools/browser-verify/09..12-scenario-*.js` | **新**。5 个新场景（G 出题失败→备用题；H 出题 5xx→自动重试；J1/J2 同步失败提示与节流；K 版本劈叉） |
| `tools/browser-verify/run.sh` | 新增 `load_only` 与「装 mock 后、开始练习前注入 JS」的能力；接入 5 个新场景 |
| `package.json` | 新增 `test:audit`、`sync:backend`、`sync`、`verify:browser` |

---

## 2. 完整测试结果

### 2.1 单元 / 集成测试

`npm test` → **243 / 243 通过，0 失败**（v1.0 基线 153 条；本阶段净增 90 条）。

| 测试文件 | 条数 | 结果 |
| --- | --- | --- |
| `tests/math-engine.cjs` | 41 | ✅ |
| `tests/pipeline-v3.cjs` | 47 | ✅ |
| `tests/reliability.cjs` | 33 | ✅ |
| `tests/fallback-audit.cjs` | 26 | ✅ |
| `tests/protocol-health.cjs` | 16 | ✅ |
| `tests/client-retry.cjs` | 14 | ✅ |
| `tests/prefetch-race.cjs` | 13 | ✅ |
| `tests/canonical-freeze.cjs` | 11 | ✅ |
| `tests/fallback-bank.cjs` | 10 | ✅ |
| `tests/sync-reliability.cjs` | 10 | ✅ |
| `tests/wiring.cjs` | 8 | ✅ |
| `tests/smoke-matrix.cjs` | 7 | ✅ |
| `tests/wrong-canonical.cjs` | 6 | ✅ |
| `tests/cloudbase-regression.cjs` | 1 | ✅ |

### 2.2 双副本一致性

```
npm run check:sync
✓ 业务逻辑段逐字节一致（1529 行，自 "const PIPELINE = {" 起）
✓ 引擎副本逐字节一致
```

### 2.3 语法检查

`node --check app.js` / `storage.js` / `math-quality.js` / `cloudbase/deepseek/index.js` / `api/deepseek.js` 全部通过。

### 2.4 本地判题压力测试（不碰网络）

```
node tools/smoke/judge-probe-local.mjs --reuse <corpus> --assert
```

| 指标 | 结果 |
| --- | --- |
| **错答被放行（须为 0）** | **0** |
| 错答被拒 | 27 / 33 |
| 错答落到模型（引擎判不了） | 6 / 33 |
| **合法写法被误拒** | **0 / 15** |
| 确定性覆盖率 · 错答探针 | **81.8%**（5A 前只标量层是 6.1%） |
| 确定性覆盖率 · 合法探针 | **100%** |

结论仍然是结构性的：`correct:true` 只有一条来路，所以「错答放行 = 0」
不依赖模型表现，只依赖「线上跑的是这一版」。

### 2.5 真实浏览器验收（`npm run verify:browser`）

**11 个场景 / 122 条断言，全部通过**（`✓ 全部场景通过`）。

| 场景 | 验的是什么 | 断言 |
| --- | --- | --- |
| A | 展示层修正只改展示、不作废题目 | 15 ✅ |
| B | 判题员怀疑标准答案 → 作废且不归咎学生 | 11 ✅ |
| C | 判题服务 503 → 保留题目与答案、提示重试 | 13 ✅ |
| D | 200 + `reason=judge_unavailable` → 文案必须是「连不上」 | 8 ✅ |
| E | 200 + `reason=judge_uncertain` → 必须与 D 区分开 | 10 ✅ |
| F | 同考点第二道错题 → 复习条目自洽、复习会话可用 | 11 ✅ |
| **G** | **出题彻底失败 → 回落到已验证备用题库** | 16 ✅ |
| **H** | **出题 5xx 一次 → 客户端自动重试并拿到 AI 题** | 11 ✅ |
| **J1** | **同步失败 → 一句人话 + 诊断留痕 + 30 秒节流** | 10 ✅ |
| **J2** | **节流窗口过期后，断网文案正常出现** | 5 ✅ |
| **K** | **版本劈叉 → 拒绝服务端题 + 状态栏红点报警** | 12 ✅ |

浏览器验收里几个值得单独说的观察：

- 场景 C：mock 返回 503 后 `calls` 是 `[..., judge, judge]` —— **客户端确实自己重试了一次**，
  然后才给用户「重试提交」，而不是让用户当那个重试机制。
- 场景 G：`calls` 是 `[generate, generate, generate, generate]`，
  且每个 `request_id` 恰好出现 **2 次** —— 出题失败重试一次、到顶即止，然后回落备用题。
- 场景 H：第一次 503、第二次 200 时，用户拿到的是 **AI 题**，界面上**没有**任何降级提示。
  G 与 H 是一对：同样是 503，区别只在第二次成不成功。
- 场景 K：`calls` 只有 **1 次** `generate`。协议不匹配不重试（重试只会再拿回一份同样
  不可信的题），状态栏变红并说明「已改用备用题库」。

### 2.6 顺带修好的测试侧陈旧断言

跑通浏览器验收的过程里发现 v1.0 的场景有 4 处断言与现行行为不符 —— **都不是生产 bug**，
是场景没跟上代码：

1. 场景 A 断言难度徽章显示 `displayDifficulty`（8.0）。该覆盖在 Task #4 已按实测数据关掉，
   现在徽章回到生成时的估计（6.0）。已改为「不采用展示层难度，但字段仍留档」。
2. 场景 B–E 提交 `sin(x)` 期望结论来自服务端。5A 之后 `sin(x)` 对极限题**已经能被本地
   引擎判死**（`not_equivalent`，结构性），于是服务端根本不会被问到。已改为提交
   `sinx`（既不是常量也不是可解析表达式 → 引擎 `uncertain` → 必须问服务端），
   并新增一条断言显式要求「这次作答本地引擎确实判不了」。
3. 场景 E 期望的文案是「没能给出结论」，现行文案是「暂时无法可靠判断这个答案…」。
4. mock 不回显 `request_id`/`session_id`/`question_sequence`/`versions` ——
   那三条 5E/5F/5I 的校验在浏览器里等于没测。已补齐回显，并新增 2 个场景才知道
   要验什么（G 的 request_id 尝试计数、K 的「不重试」）。

---

## 3. 已解决的问题

### 5A 数学可靠性：发散检测 + 常量表达式求值

上一期发现的 4 道「已放行但参考答案是错的」题，根因是 `estimateLimit` 对发散极限
保守返回 `null` → `ANSWER_FAILS_VERIFICATION` 不触发 → 闸门放行。
补上发散检测与纯常量表达式求值后：错答探针的确定性覆盖率 **6.1% → 81.8%**，
合法探针 **100%**，误拒 0。

### 5B / 5C 覆盖面分级与三态闸门

Hard Gate 从「过 / 不过」改成 `VERIFIED` / `UNCERTAIN` / `REJECTED` 三态，
并按 Tier A/B/C 描述题干的形态支持度。三态的用处不是放宽，而是**把「判不了」
和「判错」分开** —— 这两件事的处置完全不同：前者去问模型，后者直接拒掉。

### 5D 题目身份不可变（Canonical Package）

在此之前「题目有没有被改过」只有 `verification.content` 一个字符串快照，
而谁都能照着改完的题重算一次盖上去。现在：七个 canonical 字段 + `question_id` +
来源 + 引擎/流水线版本 → FNV-1a 指纹；指纹**只覆盖身份，不覆盖难度**
（重新标定不算换题）。`issues()` 遇到指纹失配先报 `CANONICAL_MUTATED` 并**停手**，
不拿「已经不知道是谁」的题去验证答案。备用题也不能例外 —— 它靠 `bankId` 命中，
是最容易被绕过的一条路。

### 5E 预取竞态

预取从「一个 Promise」变成带身份的条目（`request_id` / `session_id` /
`question_sequence`，外加一个单调递增的 `issued`）。`consumeSessionPrefetch`
在 `await` **前后各校验一次**身份，晚到的响应按 `STALE_RESPONSE` 丢弃，
永远不会覆盖更新的那道题。

### 5F 客户端超时 / 重试 / 墙钟预算

- 每次尝试有独立超时（generate 60s / judge 22s / evaluate 25s）；
- 另有一层**墙钟预算**（generate 90s / judge 45s / evaluate 25s），
  保证「等 180 秒」这种事在结构上不可能再发生；
- 重试一次，600–1200ms 抖动退避；
- **超时 / 4xx / 协议错误不重试** —— 重试只会把等待时间翻倍。

### 5G 备用题库审计

安全网本身必须安全，所以验收标准是逐条可复核的，而不是「看过一遍」：

- **60/60 全部由确定性引擎判定为满足题目，`uncertain` 数为 0**；
- id 全局唯一、同模块内题面不重复、不存在「改了题面忘了改解析」的条目；
- 每模块 20 道、≥5 个考点、低/中/高三档难度齐备；
- **排除 10 道最近做过的题后仍有新题可给**；连取 20 次得到 20 道互不相同的题；
  整池都被标记为做过时退回归全池而不是返回 `null`（安全网不能在需要它的时候断掉）；
- `closestFallback` 未知模块时不返回 `null`；**题库为空时显式抛错**，
  绝不静默给出一道空题；
- 60 条逐条走一遍生产侧信任链（`fallbackQuestion` → `trustedQuestion` → 指纹自洽）。

### 5H 失败日志与可观测性

`window.CalcDailyDiag`：200 条环形缓冲 + 失败分类表（超时 / 网络 / HTTP /
协议 / 被拒 / 未验证 / 空题 / 判不了 / 语料过期 / 被改写 / 回落 / 过期响应 / 同步失败）。
每条带 `request_id` / `session_id` / `question_sequence` / `attempt` / `retry_index` /
`duration_ms` / `http_status` / `outcome`。字段一律显式给全（缺的写 `null`），
否则聚合脚本没法写。

### 5I 健康检查与协议校验

health 一次比对五个版本（协议 + 生成器 + 审核员 + 判题员 + 数学引擎），
8 秒超时；**只有「已经确认不匹配」才走短路径**（没测过 / 连不上都不拦，
否则冷启动的头几秒只能拿到备用题）。除此之外**每次响应都单独校验一次版本**：
握手时对得上、返回时对不上，同样不能被当成可信结论。
状态栏用红点把「后端版本不匹配 · …（已改用备用题库）」直接说出来 ——
劈叉部署时最危险的状态恰恰是「一切看起来正常」。

### 5J 存储 / 云同步可靠性

同步串行链 + 12s 超时 + 2 次重试 + 700ms 退避；瞬时失败（网络/超时/离线）重排队
并带 5–60s 递增延迟重试，永久失败（4xx）不重试；离线时直接跳过、不发请求；
`online` / `visibilitychange` 自动补同步；破坏性的 `resetRemote` 宁可抛错也不假装成功。
对用户只说一句「记录还在本机、稍后自动补上」，**30 秒节流**，不刷屏。

---

## 4. 仍无法保证的问题

按「离真相有多远」排序：

1. **线上还没部署。** 本报告证明的是本地这一版的行为。在部署之前，
   线上仍然是旧版，「错答放行 = 0」也只是本地结论。
2. **浏览器验收用的是 mock 后端，不是真实 DeepSeek。** 真实模型的
   判题质量、限流、超时分布**没有**被这一轮验收。`npm run smoke`（打线上后端）
   需要已部署的后端与 API key，本轮没跑 —— 它才是「线上跑的到底是哪一版」的证据。
3. **5E 预取竞态没有浏览器级场景。** 它有 13 条单测（跑的是 `app.js` 的生产函数），
   但「让两个并发请求以相反顺序完成」在 UI 里没有可控入口，所以没有端到端复现。
   浏览器里能观察到的只有它的诊断计数。
4. **判不了的答案仍然要去问模型（本地探针 6/33）。** 模型不能把答案判「对」，
   所以不会污染数据；但它会消耗一次请求，并且用户可能要多提交一次。
5. **云同步的真实后端（CloudBase）行为未验收。** 断网补同步只在单测里验证过；
   RLS / 权限 / 真实网络抖动都没有测。测试环境里 CloudBase SDK 不可用时
   `configured=false`，整条同步链是静默跳过的。
6. **`resetRemote` 的破坏性路径没有在真实云端演练。**
7. **题库规模是取舍，不是缺陷但要知道**：60 道、每模块 20 道，
   连做 20 题之后去重必然退回全池 → 高频失败（AI 长时间不可用）时用户会看到重复题。
8. **引擎仍读不懂的题干形态**（`\sum`、`cases`、隐函数二阶导、参数方程）会落到模型。
   这是上一期就记录过的能力边界，本轮没有扩张。
9. **仓库里有噪音**：`.DS_Store`（含一份被 git 跟踪的 `cloudbase/.DS_Store`）与
   `.workbuddy/smoke/*` 的运行产物。不影响功能，但该清。

---

## 5. 部署顺序

### 5.1 两个部署物

| 部署物 | 位置 | 这一版要覆盖的文件 |
| --- | --- | --- |
| **后端** | 云函数 `deepseek`（env `calcdaily-d5g2titwue91551fb`，ap-shanghai） | `cloudbase/deepseek/index.js` + `cloudbase/deepseek/math-quality.js`（**两份一起**） |
| **前端** | 静态托管（COS，`server: tcbgw`） | `index.html`、`cloudbase-client.js`、`storage.js`、`auth.js`、`math-quality.js`、`fallback-bank.js`、`app.js`（**7 个文件同版本**） |

两份后端副本（`cloudbase/deepseek/index.js` 与 `api/deepseek.js`）必须来自同一个提交 ——
`npm run check:sync` 会强制自 `const PIPELINE = {` 起的业务段逐字节一致。

> 部署由用户操作：本机没有任何部署凭据或 CLI（无 `tcb` / `cloudbase` / `vercel`）。

### 5.2 顺序：后端先，前端后。理由是**单向的兼容性**

新前端对响应的要求比旧版严：它要求响应带五个版本号，并且**每次响应都校验一次**。
旧前端对新后端多出来的字段则是宽容的（忽略未知字段）。所以：

```
后端（两份一起） ──→ 前端（7 个文件） ──→ 强制刷新 / 清 CDN 缓存
```

反过来（只发前端）**可能**仍然能用：旧后端的 generate 响应本来就带 `versions`，
而新前端对缺失的 `request_id` 回显是宽容的（只在"有值且对不上"时才判失败）。
但这是**需要先验证**的，不能当成默认前提：

```bash
# 发布前先探一次旧后端：generate 响应里到底有没有 versions
curl -s -X POST '<后端>/api/deepseek' -H 'Content-Type: application/json' \
  -d '{"action":"generate","module":"limit","count":1}' | head -c 600
```

- 响应里**有** `"versions":{"math_engine":"quality-v2",…}` → 只发前端也能跑，
  只是新版服务端能力（`withResponseMeta` 回显、`canonical_suspected` 作废链）处于休眠。
- 响应里**没有** `versions` → **绝不能只发前端**：新前端会把每一个响应判成协议错误，
  结果是所有题都回落到备用题库（功能不崩，但用户在很长一段时间里只会看到备用题）。

### 5.3 回滚顺序与部署相反：**先回前端，再回后端**

先回后端会把还在跑的新前端打成「协议不匹配 → 全部回落备用题」。

### 5.4 上线后的版本自查（沿用既有做法）

```bash
# 后端：新版 health 必须带 protocol_version 与 pipeline 里的五件套
curl -s '<后端>/api/deepseek?health=1'
# 前端：逐个对比线上 7 个文件与本地同名文件
for f in index.html cloudbase-client.js storage.js auth.js math-quality.js fallback-bank.js app.js; do
  printf '%-24s %s\n' "$f" "$(curl -s "<前端地址>/$f" | shasum -a 256 | cut -c1-12)"
done
```

线上 7 个文件的哈希必须与本地逐一相同 —— 少一个就是"新客户端 + 旧资源"的混版状态。

---

## 6. 部署后测试计划

### 自动化（前 3 步）

1. `npm run check:sync` —— 确认要部署的这两份后端 + 引擎副本逐字节一致。
2. 上面 5.4 的版本自查 —— 后端五件套齐全、前端 7 个文件哈希一致。
3. `npm run smoke` —— 打**线上**后端，看报告里的部署指纹与 `judge_layer` 分布；
   对照本地 `npm run probe:local`。**这一步才是「线上真的换成了这一版」的证据。**

### 手动（按用户视角）

4. 正常路径：开一次练习（第一题 `source` 必须是 `ai`）→ 做对一题 → 做错一题 →
   下一题 → 刷新页面看复习队列。
5. 故障路径（DevTools 拦截）：
   - 判题接口 503 → 文案应是「连不上判题服务…」，**答案必须保留**，按钮变「重试提交」；
   - 出题接口全部 503 → 应回落到备用题并提示「已使用备用题」；
   - `Offline` → 提交一次 → 提示「连不上判题服务」；恢复后再提交 → 正常判题；
   - 断网期间做题 → 提示「记录已暂存在本机」，联网后自动补同步。
6. **版本劈叉演练**（推荐，且当作回归项）：把后端临时改成 `math_engine: 'quality-v1'` 再部署 →
   前端应显示「后端版本不匹配 · …（已改用备用题库）」、只给备用题、状态点变红。改回。
7. 观察 `window.CalcDailyDiag.summary()`：
   - `fallbackCount` 应接近 0（有明显值时说明出题成功率掉了）；
   - `byKind` 里**不应**出现 `canonical_mutated`（有题被就地改写）
     或 `protocol_mismatch`（版本劈叉）。
8. 云同步：登录后做几题 → 刷新 → 记录还在；断网做题 → 联网后
   `window.CalcDailyCloud.getSyncState().pending` 回到 `false`。

---

## 附录：怎么复现这一轮的全部结论

```bash
npm test                      # 243 / 243
npm run check:sync            # 两份后端 + 引擎副本逐字节一致
npm run test:audit            # 5G 题库审计 26 条
npm run probe:local           # 本地判题压力测试（不碰网络）
npm run verify:browser        # 真实浏览器 11 个场景 / 122 条断言
```

`npm run smoke` 会打**线上**后端，需要 API key，且必须在部署之后再跑。
