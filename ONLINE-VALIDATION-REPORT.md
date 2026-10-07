# CalcDaily v1.1 · Online Reliability Validation

> 执行时间：2026-09-20
> 本机 HEAD：`7f35c89 优化出题`（= `origin/main`）
> 线上后端：`https://calcdaily-d5g2titwue91551fb-1482769901.ap-shanghai.app.tcloudbase.com/api/deepseek`
> 本轮约束：**不修改生产代码**（只在 `tools/smoke/run.mjs` 修了一个让测试跑不起来的测试工具 bug）
>
> **2026-09-21 追加**：§1–§13 是「不改代码跑完 200 题」阶段的记录。
> 之后按审查结论处理了唯一的 P0 —— **生成闸门放行未验证的 canonical answer**，
> 完整记录见 **§14**（代码已改完并全量验证，尚未部署）。

---

## 0. 一页结论

| 层面 | 目标 | 实测 | 判定 |
| --- | ---: | ---: | --- |
| 部署一致性 | 前端/后端 = v1.1 | 前端 8/8 文件逐字节一致；后端 `math_engine_version=quality-v2` | ✅ 通过 |
| **数学安全性（工具侧）** | Wrong Approved = 0 | **0/105** | ✅ 通过 |
| **数学安全性（独立复核）** | ≈0 错题放行 | **152/154 正确 = 98.70%**，2 道错 | ⚠️ **有 1 处系统性漏洞** |
| 判题可靠性 | 错答不误批、合法不误拒 | 误批 **0/514**、误拒 **0/229** | ✅ 通过 |
| canonical 稳定性 | drift = 0 | **50/50 保持不变** | ✅ 通过 |
| **用户视角正确率** | ≥ 98% | **199/200 = 99.50%** | ✅ 通过 |
| AI 动态生成率 | —（效率指标，非信任指标） | **52.5%**（105/200），波动 36–60% | ⚠️ 偏低，另阶段处理 |
| **生产前端可用性** | 可访问 | 08:00 全路径 404 → 09:31 **已修复，8/8 一致**（见 §1） | ✅ 已恢复 |
| **生成闸门：未验证的答案不得放行** | Tier B 不得 VERIFIED | 已改（Task 5K，见 §14）：正解 VERIFIED / 两份错答 REJECTED / Tier B → UNCERTAIN | ✅ **代码已验证，待部署** |

**一句话**：数学正确性按你定的两条标准（Wrong Approved = 0 且 visible ≥ 98%）**都过了**；
且审查指出的唯一真 P0 —— **Tier B 仍能被生成闸门放行** —— 已修复并本地全量验证（§14，249/249 测试通过、反向对照确认断言有效），
待部署后跑定向复测收口。
线上前端的 404 事故已修复并端到端复测通过；**剩下唯一的阻塞是默认域名会给访客弹腾讯云警告页**（见 §1.2）。

---

## 1. 生产前端可用性事故：404 → 已修复 → **但访客会先看到腾讯云警告页**

### 1.1 事故与修复（2026-09-20 晚 → 09-21 上午）

**症状**：生产域名**全部路径 404**（连 `index.html` 都是），错误形态完全一致 ——
每个请求的存储键都是 `部署路径 + 请求路径` 直接首尾相接，中间恒多一个斜杠：

```
GET /index.html   → 404  Key: calcdaily%2F%2Findex.html        （= calcdaily/  +  /index.html）
GET /app.js       → 404  Key: calcdaily%2F%2Fapp.js
GET /calcdaily/x  → 404  Key: calcdaily%2F%2Fcalcdaily%2Fx
```

**根因**：控制台「部署路径」被设成了 **`/calcdaily`**（截图确认，部署时间 `2026-09-20 15:10:11`）。
网关拿它当存储键前缀、再原样拼上自带前导斜杠的请求路径 → 双斜杠 → COS `NoSuchKey`。

**修复**：把「部署路径」改回 `/` 并重新部署。**09:31 复测已恢复，8/8 文件 200 且与本地逐字节一致。**

> **两个错误码含义完全不同，别搞混**（本次靠它把范围缩到最小）：
> `INVALID_HOST`（JSON）= 站点不存在（v4/v6 老站已被删）；`NoSuchKey`（HTML，带 `<li>Key:`）= 站点存在但键拼错了。

### 1.2 🔴 仍未解决：默认域名的「风险提醒」拦截页

修复后用**真实浏览器**打开生产域名，`document.title` 是 **`风险提醒`**，不是应用标题：

```
页面访问提示
当前域名 calcdaily-calcdaily-…webapps.tcloudbase.com 是由腾讯云 CloudBase 提供的测试域名，
仅供开发测试使用，内容可能处于未审核状态
请谨慎浏览，请勿泄露个人信息、账号密码或进行涉及财产的操作
[我是开发者，如何去掉当前页面？]   [确定访问]
```

必须点「**确定访问**」才进入应用本体（点了之后一切正常，见 §1.3）。

**这条最重要的教训**：

- **`curl` 拿到的是真 `index.html`（200、哈希一致），所以纯自动化校验永远看不出这一层。**
  只有真实浏览器会撞到它 —— 8/8 全绿 + 接口全通，仍然不等于"访客能正常打开"。
- 把链接发给老师/面试官，**对方第一眼看到的是腾讯云的安全警告页**，容易被当成不安全站点。
- **要对外分享，必须绑自定义域名**（控制台本身也在提示这件事）。

### 1.3 修复后的端到端复核（curl + 真实 Chromium）

| 检查项 | 结果 |
| --- | --- |
| 前端 8 文件状态码 + 哈希 | ✅ 200，**8/8 逐字节一致** |
| `index.html` 引用的全部本地资源 | ✅ 全部 200 |
| 后端 `?health=1` | ✅ `math_engine_version = quality-v2`，`protocol 2`，pipeline 五件套齐全 |
| 真实 generate | ✅ `gate_state=VERIFIED` / `tier=A`，题 `lim(ln(1+x)−x+x²/2)/x³ = 1/3`（答案正确） |
| 浏览器渲染 | ✅ 应用加载，侧栏显示「**DeepSeek 已连接 · 协议 v2**」，MathJax 3.2.2 正常渲染公式 |
| 判题 · 错答 | ✅ 提交 `999999` → 「与参考答案不等价」并给出参考答案 `1/2`，**未**误报「题目已作废」 |
| 判题 · 对答 | ✅ 提交 `1/2` → 「✓ 答对了 · 与参考答案数学等价」 |
| 不存在的路径 | ✅ 返回普通 404，双斜杠问题已消失 |

> 浏览器实测所测两题的答案（`lim(e^{x²}−1−x²)/x⁴ = 1/2`、`lim[ln(1+x+x²)−x]/x² = 1/2`）已独立手算核对。
> 证据截图：`.workbuddy/evidence/online-prod-question.png`、`online-prod-judge-wrong.png`。

---

## 2. 线上地址现状：三个变一个

| 地址 | 今天上午 | 现在 |
| --- | --- | --- |
| **`calcdaily-…`（无版本后缀）** | 200，= `7f35c89` = v1.1，8/8 一致 | **唯一有效 host**；09-20 晚曾全站 404，09-21 上午已修复（§1） |
| `calcdaily-v6-…` | 200，= `79adbeb` | **`INVALID_HOST`（站点已删）** |
| `calcdaily-v4-…` | 200，= `ca51046`（4-script 旧架构） | **`INVALID_HOST`（站点已删）** |

用 `INVALID_HOST` 当探针，把 `calcdaily-*` 的 20 个可能站点名扫了一遍：
**只有 `calcdaily-calcdaily-<envid>` 一个 host 是有效的**，`v1`–`v12`、`prod`、`latest`、`main` 等全部 `INVALID_HOST`。

→ **唯一生产地址已确认**：`https://calcdaily-calcdaily-d5g2titwue91551fb.webapps.tcloudbase.com/`
（老站已经没了，「清掉老站」这件事实际上已经完成；剩下的只是把它修好。）

> **踩坑记录**：核对线上版本时不要只测别人给的地址。下「没部署」结论之前，
> 先把域名变体（带版本后缀的、不带后缀的）都探一遍 —— 我第一轮只测了 v4/v6，得出过**错误结论**（已作废）。
> 反过来，判断「某个站是否还存在」有个干净的探针：**`INVALID_HOST` = 站点不存在**，
> `NoSuchKey` = 站点存在但内容路径坏了。这两个错误码含义完全不同。

---

## 3. 后端 = v1.1（已确认）

线上 `?health=1`（现在仍是 200）：

```json
{"ok":true,"service":"deepseek","adaptiveDifficultyModel":"v0-provisional",
 "protocol_version":2,"generator_version":"generator-v2","reviewer_version":"reviewer-v2",
 "judge_version":"judge-v2","math_engine_version":"quality-v2",
 "pipeline":{"protocol":2,"generator":"generator-v2","reviewer":"reviewer-v2",
             "judge":"judge-v2","math_engine":"quality-v2"}}
```

**决定性判别项是 `math_engine_version`**（不是 `protocol_version`）：

| 提交 | `math_engine_version` 出现次数 |
| --- | ---: |
| `79adbeb`（上一版） | **0** |
| `7f35c89`（v1.1） | **2** |
| 线上 health | **返回该字段** |

该字段在旧代码里根本不存在 → 线上后端**只可能**是 v1.1。
（踩坑：`protocol_version` 两版代码里都有，用它当判据会得出错误结论。）

---

## 4. 前端：v1.1（8/8 文件逐字节一致，下午实测）

| 文件 | HTTP | 线上 SHA256(前16) | 本地 | |
| --- | --- | --- | --- | --- |
| `index.html` | 200 | `1e4638d227b90c12` | 同 | ✅ |
| `cloudbase-client.js` | 200 | `6c54bd8fcc18ed34` | 同 | ✅ |
| `storage.js` | 200 | `6d3f07622cace589` | 同 | ✅ |
| `auth.js` | 200 | `98872f79860a164f` | 同 | ✅ |
| `math-quality.js` | 200 | `57a3087b91e957de` | 同 | ✅ |
| `fallback-bank.js` | 200 | `463082480178d2e4` | 同 | ✅ |
| `app.js` | 200 | `83d5cbea24c3ce77` | 同 | ✅ |
| `vendor/mathjax/tex-svg.js` | 200 | `d4295dc337448369` | 同 | ✅ |

`storage.js` / `math-quality.js` / `app.js` 正是 v1.1 相对 `79adbeb` 改动的 3 个文件，当时在线上都是新版
→ 客户端改造（5E/5F/5I/5J）**当时确实已生效**。（现在因 §1 的 404 无法复核，等托管修好请重跑附录命令。）

**三项部署检查**（当时）：

| # | 检查项 | 结果 |
| --- | --- | --- |
| 1 | 后端 `health=1` 五版本为当前版本 | ✅ |
| 2 | 线上前端文件与本地逐一一致 | ✅ 8/8（含 vendor） |
| 3 | 真实 generate / judge 响应带 `request_id` / `session_id` / `question_sequence` / `versions` | ✅ |

第 3 项实测：判题走 `method=deterministic` / `judge_layer=scalar` —— **本地引擎直接判定，没花模型调用**。

---

## 5. 200 题 benchmark · 总表

**口径**：200 题 = **200 次出题尝试**（4 轮 × 50 格矩阵，`--label online-200-r1..r4`，并发 3）。
另外单独跑了 2 轮 50 题上线冒烟，所以独立复核累计覆盖 **300 次尝试 / 154 道放行题**。

| 指标 | 200 题（r1–r4） | 含 2 轮 50 题（共 300 次） |
| --- | ---: | ---: |
| generate attempts | 200 | 300 |
| **AI approved** | **105（52.5%）** | **154（51.3%）** |
| AI rejected | 95 | 146 |
| **fallback used** | **95** | 146 |
| visible questions total | 200（全部出题，无一空白） | 300 |
| 独立复核 · 确认正确 | 104（AI 题） | 152（AI 题） |
| 独立复核 · 确认错误 | **1** | **2** |
| 独立复核 · 备用题库 | — | 60/60 正确 |

逐轮成功率（明显的抖动，50 题量级下 ±14% 属正常）：

| 轮次 | 成功率 |
| --- | ---: |
| `online-50`（首轮冒烟） | 31/50 = 62.0% |
| `online-50-v2` | 18/50 = 36.0% |
| `online-200-r1` | 24/50 = 48.0% |
| `online-200-r2` | 30/50 = 60.0% |
| `online-200-r3` | 25/50 = 50.0% |
| `online-200-r4` | 26/50 = 52.0% |
| **200 题四轮合计** | **105/200 = 52.5%** |
| **全部 300 次** | **154/300 = 51.3%** |

> ⚠️ **样本独立性的重要限定**：105 道放行题里，**只有 52 个不同题面**（重复生成 53 次）。
> 也就是说「200 题」不等于 200 个独立样本 —— 生成器在同一个格子上会反复给出同一道题
> （典型：`∫dx/(x√(x²+x+1))` 出现 12 次、`∫dx/(1+sin x+cos x)` 出现 11 次）。
> 读 P95 与成功率时把这一点算进去；**结论方向不受影响，但有效样本量应理解为「约 50 个格子」**。

---

## 6. 按 module / difficulty / module × difficulty

### 6.1 按模块（300 次）

| 模块 | 放行/尝试 | 成功率 |
| --- | ---: | ---: |
| limit | 34/70 | 48.6% |
| **derivative** | **20/90** | **22.2%** ⚠️ |
| integral | 69/90 | 76.7% |

### 6.2 按难度（300 次）

| 难度 | 放行/尝试 | 成功率 |
| --- | ---: | ---: |
| L4 | 28/45 | 62.2% |
| L6 | 18/45 | 40.0% |
| L8 | 31/55 | 56.4% |
| L10 | 25/55 | 45.5% |
| L12 | 21/50 | 42.0% |

### 6.3 模块 × 难度（300 次）

| | L4 | L6 | L8 | L10 | L12 | 小计 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| limit | 10/15 | 6/15 | 9/15 | 6/15 | 3/10 | 34/70 |
| **derivative** | 5/15 | 3/15 | **3/20** | **6/20** | **3/20** | **20/90** |
| integral | 13/15 | 9/15 | 19/20 | 13/20 | 15/20 | 69/90 |
| **小计** | 28/45 | 18/45 | 31/55 | 25/55 | 21/50 | **123/250**\* |

\* 该表为含 50 题冒烟的 250 次；不影响结构。

---

## 7. 焦点格：你点名要看的九格

**200 题四轮**（每格 16 次尝试；limit L12 为 8 次）：

| 模块 × 难度 | 放行/尝试 | 成功率 | 独立复核 |
| --- | ---: | ---: | --- |
| **derivative L8** | **3/16** | **18.8%** | 3/3 正确 |
| **derivative L10** | **5/16** | **31.3%** | 4/5 正确 ← **1 道错题在这格** |
| **derivative L12** | **3/16** | **18.8%** | 3/3 正确 |
| integral L8 | 15/16 | 93.8% | 15/15 正确 |
| integral L10 | 13/16 | 81.3% | 13/13 正确 |
| integral L12 | 13/16 | 81.3% | 13/13 正确 |
| limit L8 | 7/12 | 58.3% | 7/7 正确 |
| limit L10 | 6/12 | 50.0% | 6/6 正确 |
| limit L12 | 3/8 | 37.5% | 3/3 正确 |

**你的判断被数据坐实了**：高难导数就是重灾区。
derivative 的 L8/L10/L12 合计 **11/48 = 22.9%**，而 integral 同三格 **41/48 = 85.4%**。
两者差 3.7 倍，**同一个 Prompt 确实撑不住三个模块**。

---

## 8. 失败画像：闸门到底在拦什么

### 8.1 拒稿原因 × 模块（200 题，一次失败可触发多条）

| 原因 | limit | derivative | integral | 合计 |
| --- | ---: | ---: | ---: | ---: |
| `UNVERIFIED_SHAPE` | 19 | **66** | **0** | 85 |
| `ANSWER_FAILS_VERIFICATION` | 30 | 15 | **25** | 70 |
| `GENERATION_REJECTED` | 2 | **26** | 3 | 31 |
| `SOLUTION_MISMATCH` | 8 | 0 | 0 | 8 |

**这张表信息量最大**：

- **derivative 的失败是「形状不可验证」（66 次 `UNVERIFIED_SHAPE`）**——
  生成器给出的表达形式机器读不懂，不是算错。也就是说：**导数的生成器在写「闸门无法解析的题面」**。
- **integral 的失败是「答案算错」（25 次 `ANSWER_FAILS_VERIFICATION`，`UNVERIFIED_SHAPE` 为 0）**——
  积分题面永远是可验证的形状，但答案经常不对。**两个模块的病完全不同。**
- limit 两头都占（形状 19 + 答案 30 + 解析与答案矛盾 8）。

> 结论：**不能用同一套修法**。derivative 要治「输出形状」，integral 要治「算对答案」，
> limit 要治「解析与答案的一致性」。这正是你说的「第二刀：不同模块不同策略」的数据依据。

### 8.2 拒稿原因 × 难度（200 题）

| 原因 | L4 | L6 | L8 | L10 | L12 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `UNVERIFIED_SHAPE` | 21 | 13 | 21 | 14 | 16 |
| `ANSWER_FAILS_VERIFICATION` | 3 | **25** | 9 | 17 | 16 |
| `GENERATION_REJECTED` | 4 | 4 | 7 | 7 | 9 |
| `SOLUTION_MISMATCH` | 0 | 3 | 2 | 2 | 1 |

`UNVERIFIED_SHAPE` 在 L4 就已经是 21 次 —— **形状问题不是「难度太高才有的」，它从头就存在**。

### 8.3 200 题中「一次都没放行过」的格子：13/50

```
limit      2 个: limit-L4-2, limit-L6-1
derivative 11 个: derivative-L4-1, L4-3, L6-2, L8-1, L8-3, L8-4,
                  L10-2, L10-3, L12-1, L12-2, L12-4
integral   0 个
```

导数 20 个格子里有 **11 个在 4 轮里从未成功过一次**。这不是「偶尔失败」，是**整片格子是空的**。
（这也解释了为什么 derivative 的放行题看起来题型偏窄 —— 只有 10 个不同题面来自 20 个格子。）

### 8.4 失败后用户看到什么

被拒的 95 条：**`would_fallback = true` 95/95**，`generate_http` 全部为 **500**。
→ 客户端确实全部回落备用题库，**用户不会看到空白页或错误页**。

---

## 9. 判题可靠性（含 50 题冒烟，共 5 轮）

| 指标 | 目标 | 实测 |
| --- | --- | ---: |
| 错答探针被误批为「对」 | 0 | **0/514** ✅ |
| 合法探针被误拒 | 越少越好 | **0/229** ✅ |
| 判题重复一致 | ≥ 99% | **150/150 = 100%** ✅ |
| canonical 保持不变（drift） | 0 | **50/50** ✅ |
| 探针跳过（不适用） | — | 107 |
| 判题把错答说成「答案可疑」而非「答错」 | — | 10（UX 问题，见 §12.4） |

探针分两层落地：**标量层**（纯数值比对）与**结构层**（表达式结构比对），确定性覆盖率
错答探针 80.0–80.8%、合法探针 100%。剩下约 19% 仍落到模型，但**这 19% 没有产生任何一次误批**。

### 9.1 一个漂亮的巧合（其实是可用的信号）

5 轮 × 10 题 × 3 次重复 = **150 条判词**，其中：

```
equivalent  147
uncertain     3     ← 全部 3 条都属于同一道题
```

**这 3 条 `uncertain` 全部指向 §10 那道唯一被独立复核判错的题**（`derivative-L10-1`，
`method=['ai']`，`reason=['judge_uncertain']`）。150 条里唯一的异常信号，精准落在唯一的错题上。

→ **`judge_uncertain` 是一个近乎零噪声的「这题可疑」信号**，本轮张冠李戴率为 0。
建议把「判题返回 `uncertain`」当成「不出给用户 / 回炉重验」的触发器（见 §13）。

---

## 10. 独立数学复核（154 道 AI 题 + 60 道备用题）

### 10.1 为什么要另写一套

`tools/smoke/run.mjs` 自己声明了局限：

> 用项目自己的确定性引擎（`math-quality.js`）当 oracle，但它跟服务端跑的是**同一份代码**，
> 所以它证明的是「服务端的闸门有没有执行、结果是否被改动」，**不是「换了个人重算一遍」**。

所以另写了 `.workbuddy/smoke/independent-review/verify_all.py`：
**sympy 解析 LaTeX + mpmath 高精度数值**，与 JS 引擎的解析器、算法、代码全无重叠。

| 题型 | 独立方法 |
| --- | --- |
| 极限 | 按题面极限点求数值极限（mpmath 40 位 + Richardson/Shanks 加速） |
| 导数 | 数值中心差分（一阶 1e-6 / 二阶 1e-4）对撞声称的 y′ / y″ |
| 定积分 | mpmath `quad` 数值积分 vs 声称值 |
| 不定积分 | 对声称原函数求数值导，与原被积函数比对 |

### 10.2 结果

| 批次 | 样本 | 通过 | 不通过 | 未判定 |
| --- | ---: | ---: | ---: | ---: |
| 50 题首轮（`r1x`） | 31 | 30 | **1** | 0 |
| 50 题二轮（`50`） | 18 | 18 | 0 | 0 |
| **200 题（r1–r4）** | **105** | **104** | **1** | **0** |
| **AI 题合计** | **154** | **152** | **2** | **0** |
| **备用题库（本轮新补）** | **60** | **60** | **0** | **0** |

- AI 题：**152/154 = 98.70%** 正确；可自动判定率 **154/154 = 100%**（无 unresolved）
- 备用题库：**60/60 = 100%** 正确（此前只由项目自己的引擎审计过，本轮补上了独立复核）
- 累计复核 **214 道题**，只有 2 道错，且这 2 道是**同一道题面**。

### 10.3 那 2 道错题：不是同一处错误，是**同一道题、两种错法**

题面（在两个不同轮次里被**重复生成**）：

```latex
y=\left(\frac{x^{2}+1}{x^{2}-1}\right)^{\arctan x}
```

正确答案（对数求导法）：
```latex
y' = u^{\arctan x}\left[\frac{\ln u}{1+x^{2}} \;-\; \frac{4x\arctan x}{x^{4}-1}\right],
\qquad u=\frac{x^{2}+1}{x^{2}-1}
```

| 轮次 | 生成器给出的答案 | 错在哪 | 相对误差（x=0.5/1.5/2.0） |
| --- | --- | --- | --- |
| `r1x` | `…[ln u/(1+x²) − 4x/((x²+1)(x²−1))]` | **缺 `arctan x` 因子** | 0.398 / 0.022 / 0.117 |
| `r2` | `…[ln u/(1+x²) **+** 4x·arctan x/(x⁴−1)]` | 因子对了但**符号反了**（应为 −） | 0.688 / 2.508 / 2.418 |
| 我推导的修正式 | `…[ln u/(1+x²) − 4x·arctan x/(x⁴−1)]` | — | **0（相对误差 1e-81 量级）** |

**裁决方式**：不采信任何一方的解析式，直接用 mpmath 80 位精度对 `y` 本身做数值求导当基准
（`mp.diff`），再把两份候选答案逐点比对。改正式在 8 个采样点上相对误差都 ≤ 2.4e-81。

> 这推翻了我自己上一轮的判断。上一轮我写的是「2 道错题是同一处错误的重复」——
> **错了**。它们是同一道题的**两个不同错误**：一个漏了因子，一个符号反了。
> 也就是说生成器在这道题上**两次都没算对，而且每次错的姿势还不一样**。

### 10.4 为什么闸门、`verify.mjs`、reviewer 都没拦住

三个环节对「符号求导 + 对数求导」这一类共用同一个盲点：
`y = f(x)^{g(x)}` 的求导结果**结构很复杂**，`UNVERIFIED_SHAPE` 与符号比对都容易滑过去，
而答案与解析「互相自洽」（解析里也是同样的错步骤），所以 `SOLUTION_MISMATCH` 也不响。

**唯一响了的信号是判题的 `uncertain`**（§9.1）—— 而它不在闸门链路上。

---

## 11. 用户视角正确率：199/200 = 99.50%

这是把 §10 的结论套回用户真实经历的结果（两者都有独立复核背书）：

| 来源 | 条数 | 数学正确性依据 |
| --- | ---: | --- |
| AI 放行题 | 105 | 独立复核 104 正确 / 1 错 |
| 回落备用题库 | 95 | 备用库 60/60 经独立复核确认正确 |
| **用户实际看到** | **200** | **199/200 = 99.50%** |

**两个指标必须分开看，你之前的判断是对的**：

```
AI generation acceptance rate = 52.5%   ← 效率问题（厨房产能）
user-visible correctness      = 99.50%  ← 信任问题（端上桌的东西）
```

**信任优先，且信任这一项按你的标准（≥98%）已经达标。** 错题率 0.50%，
且那 0.5% 不是「用户会自己撞上」的随机错 —— 是同一道题被反复生成时稳定出错（见 §13）。

---

## 12. 结论：可靠性阶段到底过没过

**按你定的两条标准，都过：**

| 你的标准 | 实测 | |
| --- | --- | --- |
| Wrong Approved = 0 | **0/105**（工具侧） | ✅ |
| Visible correctness ≥ 98% | **99.50%** | ✅ |

**但报告必须同时记下这句**：Wrong Approved = 0 是**工具侧的自证**，它证明的是「闸门没有自相矛盾」；
真正的独立复核给出了 1 处反例。所以正确的说法是：

> 可靠性阶段**可以收口**，但在收口时要把「判题 `uncertain` → 不出题」这个近乎零成本的补丁打上。
> 否则下一次生成器再回到这类复杂幂指函数时，同样会漏。

**→ 2026-09-21 已处理**：补丁落点在生成侧（更根本），见 §14。
修完的判定是：**正解仍 VERIFIED、错答 REJECTED、Tier B 一律不放行**，
且判题侧口径不变。历史 200 题回放 105 → 104（唯一降级的就是那道符号写反的题）。

**我支持进入 `Generation Quality Optimization` 阶段**，理由不是「98% 够了可以放松」，
而是**继续加验证器的边际收益已经很低**：闸门拦下的 146 次失败里，
85 次是 `UNVERIFIED_SHAPE`（生成器写不出可验证形状）、70 次是答案算错 ——
**这些都不是验证器的责任，是生成器的出题空间问题**。

---

## 13. 遗留问题与下一阶段建议

### 13.1 ✅ 已解决：前端 404（§1.1）
部署路径 `/calcdaily` → `/` 后重新部署，09-21 上午复测 **8/8 逐字节一致**，端到端全通。

### 13.2 🔴 P0 · 立刻：默认域名的访客警告页（§1.2）
`curl` 看不出这一层。把链接发给任何人（老师、面试官），**对方第一眼看到的是腾讯云的
「页面访问提示 / 风险提醒」**，必须点「确定访问」才进应用。
**要给外部使用，绑自定义域名是当前唯一干净的解法** —— 这也是托管就绪度的最后一块。

### 13.3 ✅ 已解决（Task 5K，见 §14）：1 道错题的止损
`y=((x²+1)/(x²−1))^{arctan x}` 这个题面在 4 轮里出现了 4 次（3 种不同题面变体），
其中 2 次答案算错。**这是生成器的固定难点，不是偶发**。

**已按下面的第 1 项落地，但落点比原建议更根本**：
- 原建议是「判题返回 `uncertain` 时不给用户出题」—— 那是在**判题侧**补救。
- 实际查明：漏点在**生成侧**，而且原因很具体 —— 答案里的 `\left[...\right]`
  让 parser 整条读不出来 → 确定性引擎只能给 `uncertain` → **Tier B 被旧闸门当成 VERIFIED**。
- 所以修的是：① parser 认 `[ ]`；② **Tier B 与 Tier C 一样不放行**（§14.3）。
  判题侧的口径**刻意没动**（§14.4）—— 用户正在做的题不能因为「机器验不了」被作废。

生成端的「幂指函数需要模板引导」仍属 §13.5 第三刀（P1，未做）。

### 13.4 建议：文档统一到唯一生产地址（✅ 本轮已完成）
`README.md:10`、`README.md:628`、`docs/PRD.md:6`、`docs/PRD.md:1863`
**四处原先都指向已删除的 v4 站**（现在返回 `INVALID_HOST`）。
已统一改为唯一生产地址（见 §2），且该地址 09-21 上午已复测可用。

### 13.5 下一阶段：Generation Quality Optimization（按数据排的三刀）

**第一刀 · 约束生成器只出可验证题型**
失败原因第一名是 `UNVERIFIED_SHAPE`（85 次），其中 derivative 占 66 次。
应明确禁止：复杂 Σ 极限、`cases` 分段、暂不支持的隐函数结构、无法机器验证的参数形式。
—— 高难度 ≠ 表达形式必须复杂：L12 可以是技巧复杂、变换复杂、推导难，**但最终形式仍可机器验证**。

**第二刀 · 模块分开用不同生成策略（数据已支持）**
| 模块 | 主要病因 | 建议方向 |
| --- | --- | --- |
| derivative | `UNVERIFIED_SHAPE` 66 次 | 收窄输出形式，改用骨架约束 |
| integral | `ANSWER_FAILS_VERIFICATION` 25 次 | 题面形状没问题，要治「算对」 |
| limit | 形状 19 + 答案 30 + 矛盾 8 | 治解析与答案一致性 |

导数进一步可按 `L4–6` 与 `L8–12` 分策略：20 个格子里 11 个从未放行过。

**第三刀 · 高难度题改 Template-guided generation**
后台先选经过验证的骨架（复合函数高阶导 / 参数方程二阶导 / 隐函数导数 / 洛必达相关结构），
AI 只负责实例化系数与函数、生成解答，再过 verifier。
这会同时改善正确率、可验证率、难度稳定性与题型多样性 —— 而且仍是动态生成，不是纯题库。

### 13.6 其他（低优先）
- **判题措辞**：10 条错答探针被判成「答案可疑」而非「答错」（不构成漏判，但会让学生困惑）。
- **独立复核产品化**：`verify_all.py` 目前是事后脚本。
  建议搬进 `tools/smoke/independent/`，让每轮报告自动带上真·独立复核。
  **注意它自身也有过 2 个假阴性**（见附录 A），搬之前先把极限点处理钉上测试。
- **线上验收流程**：`curl` 全绿之后**必须再用真实浏览器收尾**（见 §1.2）。
  建议把「状态码 + 哈希 + 浏览器首屏标题」三步固化成一个脚本。
- **题目多样性**：105 道放行只有 52 个题面。若后续做「每日一题」，重复感会很明显。

---

## 14. Task 5K · P0 修复：生成闸门不再放行「未验证」的 canonical answer

> 2026-09-21。**只处理这一个 P0**，不动 P1/P2。
> 代码已改完并全量验证；**尚未部署**（本机无部署凭据），部署指引见 §14.6。

### 14.1 病根：`tier !== C` 就等于 VERIFIED

`gateDecision()` 此前只拦 Tier C：

```js
if (profile.tier === TIER.C) return { ok:false, state: UNCERTAIN, ... };
return { ok:true, state: VERIFIED, ... };   // ← Tier A 和 Tier B 一起从这里出去
```

而 `verificationProfile()` 的三分法是：

| tier | 含义 | 旧闸门 |
| --- | --- | --- |
| A | 结构可读，且确定性验证给出了结论 | VERIFIED ✅ |
| **B** | **结构可读，但这一次数值没给出结论** | **VERIFIED ❌** |
| C | 结构完全读不懂 | UNCERTAIN → 回落备用题 |

**Tier B 的定义就是「我们没验证过」**，它和 Tier C 在这件事上没有区别。
把它当 VERIFIED，等于让「引擎从未独立复核过的标准答案」靠审核员的几个布尔进学生端。

### 14.2 那两道错答案是怎么从这里漏出去的（可复现）

`y=((x²+1)/(x²−1))^(arctan x)` 的答案里有一对方括号：

```
\left(\frac{x^2+1}{x^2-1}\right)^{\arctan x}\left[ \frac{\ln(...)}{1+x^2} - \frac{4x\arctan x}{x^4-1} \right]
                                                                    ↑ 这里
```

`toInfix` 的白名单只收 `+-*/^(),`，**方括号不在内** → 整条答案 unparseable
→ `verifyDerivative` 返回 `uncertain` → **Tier B** → 旧闸门放行。链路是：

```
[...] 解析不了 → verdict=uncertain → tier=B → (旧) VERIFIED → 进学生端
```

实测（修复前，`.workbuddy/evidence/task5k/repro-arc.js`）：

| 答案 | tier | verdict | 旧闸门 |
| --- | --- | --- | --- |
| r1 缺 `arctan x` 因子 | B | uncertain | **VERIFIED** ❌ |
| r2 第二项符号写反 | B | uncertain | **VERIFIED** ❌ |
| 正解 | B | uncertain | VERIFIED（对的，但理由是错的） |

注意第三行：正解也走同一条路。**旧闸门根本没有区分能力** —— 它给正解和错解同一个结论。

### 14.3 改了什么（两处，缺一不可）

**(1) 闸门策略：`gateStateFromProfile()` —— 三态的唯一映射**

```js
function gateStateFromProfile(profile) {
  if (!profile || !profile.readable) return GATE.UNCERTAIN;   // Tier C
  if (profile.verdict === 'equivalent')     return GATE.VERIFIED;
  if (profile.verdict === 'not_equivalent') return GATE.REJECTED;
  return GATE.UNCERTAIN;                                      // Tier B ← 本次的关键
}
```

`gateDecision()` 与后端 `reviewQuestion()` 都改成调这一条。
顺带把原因码拆开：Tier C → `UNVERIFIED_SHAPE`，Tier B → **新增 `UNVERIFIED_ANSWER`**。
两类病不同（一个要改题型约束，一个只要换数字/重采样），报告里必须分得开。

**(2) parser：`[ ]` 与 `( )` 同义**

`toInfix` 里在剥离 `\[ \]`（display-math 定界符）之后，把剩下的裸 `[ ]` 归一成圆括号。
这一步让**正解变成 Tier A / equivalent** —— 否则正确题面会整类落到 UNCERTAIN 去用备用题，
就是拿「误杀」换「不漏杀」。数值求导的接线本来就在（`verifyDerivative` 一直是
`verifyAnswerAgainstQuestion` 的一环），**卡住的只是 parser**。

修复后同一组数据：

| 答案 | tier | verdict | 新闸门 |
| --- | --- | --- | --- |
| r1 缺 `arctan x` 因子 | A | **not_equivalent** | **REJECTED** ✅ |
| r2 第二项符号写反 | A | **not_equivalent** | **REJECTED** ✅ |
| 正解 | A | equivalent | VERIFIED ✅ |

### 14.4 判题侧口径**刻意不动**

`approved()` 仍把 UNCERTAIN 当「可用」：

| 同一道 Tier B 题 | 结论 |
| --- | --- |
| `gateApproved()`（生成端） | **false** → 不展示，换备用题 |
| `approved()`（判题端） | **true** → 题目保留、答案保留、让用户重试 |

用户正在做的题不能因为「机器验不了」被判成「题目有异常」并作废 —— 那会白做一题还丢作答。
这条边界有测试钉着（`tests/math-engine.cjs` 的「Tier B 不放行，但判题侧口径不得跟着变严」）。

### 14.5 验证结果

| 检查 | 结果 |
| --- | --- |
| `npm test` | **249/249 通过**（原 244 → +5：3 条闸门回归 + 2 条矩阵守卫） |
| `npm run check:sync` | ✅ 业务逻辑段 1543 行逐字节一致 · 引擎副本逐字节一致 |
| **反向对照 A**（撤销闸门策略） | `math-engine.cjs` **2 项转红** —— 断言不是空转的 |
| **反向对照 B**（撤销方括号解析） | `math-engine.cjs` 1 项 + `wrong-canonical.cjs` 2 项转红 |
| `npm run probe:local` | **错答放行 0**、**合法写法误拒 0**（与改动前一致） |
| `npm run verify:browser` | 全部场景通过（含版本不匹配 → 备用题回落） |
| 备用题库回归 | **60/60 仍是 Tier A / equivalent** —— 新闸门没有误伤自己的兜底题库 |

**历史 200 题的回放影响**（用修好 parser 的引擎重算）：

| | 旧闸门 | 新闸门 |
| --- | ---: | ---: |
| 放行（VERIFIED） | 105（52.5%） | **104（52.0%）** |
| 降级 → UNCERTAIN | — | **0** |
| 降级 → REJECTED | — | **1**（正是那道 r2 符号写反的 arctan 题） |
| 由 UNCERTAIN 升为 VERIFIED | — | 0 |

**这里有一件必须说清楚的事**：这批 200 题的形态分级是 **A=105 / B=0 / C=95** ——
**Tier B 一条都没有**。也就是说，闸门策略这一刀在历史样本上的降级数是 **0**，
本次抓到的 1 道完全是 parser 修好后引擎给出的 `not_equivalent`。

> 所以「Tier B 不再放行」这条保护，**不能用这批线上数据证明**。
> 它成立的理由是结构性的：`correct:true` 只剩「`equivalent`」一条来路，
> 而 Tier B 按定义拿不到 `equivalent`。这一点由单元测试与反向对照守住。
> 线上那两道错答案之所以呈现为 Tier B，恰恰是因为 parser 读不出方括号 ——
> **两个修复各自都能拦住它**，这是有意留的冗余。

### 14.6 是否需要重新部署：**前后端都要**

| 部署物 | 要动吗 | 为什么 |
| --- | --- | --- |
| **后端**（云函数 `deepseek`） | **要** | 覆盖 `index.js` + `math-quality.js`。生成闸门在服务端跑 |
| **前端**（静态站） | **要** | 覆盖 `app.js` + `math-quality.js`。前端会**独立再跑一次**同一个闸门（`app.js` 的 `gateApproved`），这层是最后一道防线 |

顺序：**后端先、前端后**（沿用 `RELIABILITY-TASK5.md` §5 的约定）。
这一轮**不像 v1.1 那样是硬约束** —— 两边各跑一遍闸门，任一顺序都不会放行 Tier B；
后端先只是为了让接受率的下降是"确定发生"的，而不是"取决于哪边先更新"。

**上线后怎么确认装的是这一版**（这是新加的能力，见 §14.7）：

```bash
curl -s --noproxy '*' "https://calcdaily-d5g2titwue91551fb-1482769901.ap-shanghai.app.tcloudbase.com/api/deepseek?health=1"
# 找 "gate_policy":"strict-tier-b"
```

**不要**用「响应里出现了 `UNVERIFIED_ANSWER`」来判断 —— 那要正好抽到一道 Tier B 的题
才碰得到，而这批样本里 Tier B 是 0 条。健康检查的 `gate_policy` 才是可靠的判别项。

### 14.7 新增：部署指纹 `gate_policy`

**为什么不改 `VERSION`**：`quality-v2` 是前端逐次校验响应的**协议契约**，
改它会让 `tests/pipeline-v3.cjs` 的夹具变红。这次变的是「同一引擎版本内部的判据」，
属于策略而非契约 —— 照 Task #4 用 `judge_layer` 的先例，**加一个新字段**：

- `healthPayload` → `gate_policy: "strict-tier-b"`
- generate 成功响应**顶层** → 同一个值（**不放进 `versions`**：那是契约对象，形状被测试钉着）
- `tools/smoke/run.mjs` 的「部署指纹」段现在会显式报它，并在不是 `strict-tier-b`
  时写上「本次结果不能作为 P0 验收依据」

### 14.8 回归固化（防止这个洞再开一次）

| 位置 | 内容 |
| --- | --- |
| `tools/smoke/corpus.mjs` | 新增 2 条错答语料（缺因子 / 符号写反），各附独立数值证据 |
| `tests/math-engine.cjs` | 新增 Tier B 闸门测试、判题侧口径测试、幂指函数 3 例（2 拒 1 放） |
| `tests/wrong-canonical.cjs` | **修掉一条空转的断言**（见下），并加反向守卫 |
| `tests/smoke-matrix.cjs` | 新增 2 条矩阵守卫，锁住「默认矩阵逐题不变」 |

**顺带发现并修掉的一个测试 bug**：`wrong-canonical.cjs` 的 derivative 分支
用 `agreesWithDerivative(body, candidate)`，而那个函数算的是 **`g′` 与 `body` 对照**
（对不定积分成立：body 是被积函数）。用到导数题上，它比的是 `f(x)` 与 `g′(x)`
—— 两个互不相干的量。实测它对**正确答案**同样返回 `ok=0`：

| | 旧 helper | 语义正确的 helper |
| --- | --- | --- |
| `y=x^2` 配错解 `3x` | 0/7 | 0/7 |
| `y=x^2` 配**正解** `2x` | **0/7** ← 问题所在 | **7/7** |
| 幂指函数配**正解** | **0/4** | **4/4** |

于是 `assert.equal(check.ok, 0)` **恒真**，那条语料看似在测、其实什么都没测。
已新增 `functionDerivativeMatches()`（算 `f′` 与候选比）并在分支里加**反向守卫**：
同一个复核必须认得出该条语料的**正解**（`ok === checked`），否则直接报
「这条断言是空转的」。

### 14.9 定向复测的命令（部署后跑）

默认考点池里**没有**幂指函数/对数求导 —— 普通 50 题矩阵跑多少轮都碰不到那个形态。
为此给评测台加了一个**只影响本次**的考点追加参数：

```bash
npm run smoke -- --label task5k-deriv \
  --only derivative-L8,derivative-L10,derivative-L12 \
  --extra-topics 'derivative:幂指函数求导,对数求导法'
```

- 一轮 = **12 格**（L8/L10/L12 各 4 格），其中 **5 格**是幂指函数/对数求导法
  （`derivative-L8-2/-8-3/-10-1/-10-2/-12-1`）。
- 跑 **3 轮**即 36 道，落在你要求的 30~50 区间内。
- **默认矩阵逐题不变**（已与 `HEAD` 版本逐题比对确认），所以历史 200 题仍可直接对比。
- 验收标准：报告里 `gate_policy` = `strict-tier-b`，且 **independently confirmed wrong approved = 0**。

> 本轮**没有跑**这个测试：它需要先部署后端，而本机没有任何部署凭据
> （无 `tcb` / `cloudbase` / `vercel`，无 `~/.tcb`、`~/.config/cloudbase`）。
> 按你的要求「不 push、不部署」，交给你部署后再跑。
>
> **2026-09-21 已补跑，结果见 §15。**

---

## 15. Task 5K 部署后线上验收（2026-09-21）

### 15.0 本轮的边界

**只做三件事**：读线上接口、跑现有工具、出这份报告。
**没有做**：改生产代码 / 改测试 / 改 `MEMORY.md` / 改 skill / 新增 helper 或 regression /
commit / push / 部署。验收结束时 `git status` 与开跑时逐项一致（只有本报告这一个文件是新写的）。

三轮原始数据（工具输出的，不手工整理）：

```
.workbuddy/smoke/2026-09-21T07-21-02-task5k-deriv-r1/
.workbuddy/smoke/2026-09-21T07-24-42-task5k-deriv-r2/
.workbuddy/smoke/2026-09-21T07-25-16-task5k-deriv-r3/
  各含 questions.jsonl / report.json / report.md
```

### 15.1 Step 1 · 线上部署指纹 —— 通过

`GET <backend>?health=1`：

```json
{ "ok": true, "service": "deepseek", "adaptiveDifficultyModel": "v0-provisional",
  "protocol_version": 2, "generator_version": "generator-v2",
  "reviewer_version": "reviewer-v2", "judge_version": "judge-v2",
  "math_engine_version": "quality-v2", "gate_policy": "strict-tier-b",
  "pipeline": { "protocol": 2, "generator": "generator-v2", "reviewer": "reviewer-v2",
                "judge": "judge-v2", "math_engine": "quality-v2" } }
```

**判读规则（很容易用错，重申一次）**：
- `gate_policy = strict-tier-b` 才是 Task 5K 的判别项，它只出现在新版。
- `protocol_version` **不能**当判别项 —— 新旧版代码里都有它，两边都是 `2`。

### 15.2 Step 2 · 前端 7 文件逐字节对照 —— 7/7 通过

**先看状态码，再看哈希**（CloudBase 的 404 页每次内容不同，哈希会乱跳）：

| 文件 | HTTP | 本地 vs 线上 |
| --- | --- | --- |
| `index.html` | 200 | ✅ MATCH |
| `app.js` | 200 | ✅ MATCH |
| `math-quality.js` | 200 | ✅ MATCH |
| `fallback-bank.js` | 200 | ✅ MATCH |
| `storage.js` | 200 | ✅ MATCH |
| `auth.js` | 200 | ✅ MATCH |
| `cloudbase-client.js` | 200 | ✅ MATCH |

（`app.js` = `52cb70b1da39f41c…`、`math-quality.js` = `9823a5a1fbdff075…`，均为 Task 5K 版本。）

后端引擎侧另用 `npm run check:sync` 核对三处副本：业务段 1543 行逐字节一致、引擎副本一致。

### 15.3 Step 3 · 三轮定向线上测试

命令（三轮只有 `--label` 不同）：

```bash
npm run smoke -- --label task5k-deriv-r{1,2,3} \
  --only derivative-L8,derivative-L10,derivative-L12 \
  --extra-topics 'derivative:幂指函数求导,对数求导法'
```

| 轮次 | 放行 | 拒稿 | 错答探针被误批为对 | 合法探针被误拒 |
| --- | --- | --- | --- | --- |
| r1 | 5/12 | 7/12 | 0 | 0 |
| r2 | 4/12 | 8/12 | 0 | 0 |
| r3 | 6/12 | 6/12 | 0 | 0 |
| **合并** | **15/36** | **21/36** | **0** | **0** |

### 15.4 Step 4 · 合并分析（36 格）

| 指标 | 值 |
| --- | --- |
| total（格·轮） | 36 |
| AI approved | **15**（41.7%） |
| would fallback | 21 |
| VERIFIED / UNCERTAIN / REJECTED（其中 approved 的） | **15 / 0 / 0** |
| 放行题的 tier 分布 | **A: 15，B: 0，C: 0** |
| wrong approved | **0/15** |
| structurally bad | 0/15 |
| answer-solution mismatch | 0/15 |
| answer fails verification（放行题里） | 0/15 |
| canonical 保持不变 / verification 快照完好 | 15/15 / 15/15 |
| judge 重复一致 | **15/15** |
| judge 全部 equivalent | 15/15 |
| judge 响应带 versions | 15/15 |
| 错答探针：被误批为对 | **0/165**（55+44+66） |
| 错答探针：确定性覆盖率 | 81.8%（135/165；标量 0 / 结构 135） |
| 错答探针：仍落到模型 | 30/165 |
| 合法探针：被误拒 | **0/60**（20+16+24） |
| 合法探针：确定性覆盖率 | 100%（仍落模型 0） |
| 探针跳过（不适用） | 30 |
| judge 说参考答案可疑 / 判题把错答说成「答案可疑」 | 0 / 0 |
| Generate latency | avg **3.69s** / P95 **6.81s** / max 6.81s（n=15） |
| Judge latency | avg **0.080s** / P95 **0.154s**（n=45） |
| 重复题计数 | 15 道放行题里只有 **11 个不同函数**，多出 4 份重复（见下） |

**闸门拒稿原因分布（attempt 级，21 个被拒格 × 2 次尝试 = 42 条）**：

| 原因码 | 次数 | 含义 |
| --- | --- | --- |
| `UNVERIFIED_SHAPE` | 21 | **Tier C**：题干/答案形态读不懂 |
| `UNVERIFIED_ANSWER` | 12 | **Tier B**：读得懂，但这一次数值没结论 ← Task 5K 新增 |
| `ANSWER_FAILS_VERIFICATION` | 6 | 标准答案代回题目**数值不成立** |
| `GENERATION_REJECTED` | 3 | 审核员硬字段未过（与引擎无关） |

**逐格 × 三轮（OK = 放行并展示；其余为拒稿原因）**：

| 格 | 请求考点 | r1 | r2 | r3 | 放行 |
| --- | --- | --- | --- | --- | --- |
| derivative-L8-1 | 分段点处的可导性 | SHAPE | SHAPE | SHAPE | 0/3 |
| derivative-L8-2 | 幂指函数求导 | OK | OK | OK | 3/3 |
| derivative-L8-3 | 对数求导法 | **ANSWER** | **ANSWER** | **ANSWER** | 0/3 |
| derivative-L8-4 | 复合函数求导 | OK | OK | OK | 3/3 |
| derivative-L10-1 | 幂指函数求导 | OK | OK | OK | 3/3 |
| derivative-L10-2 | 对数求导法 | **ANSWER** | FAILS | OK | 1/3 |
| derivative-L10-3 | 复合函数求导 | OK | FAILS | OK | 2/3 |
| derivative-L10-4 | 隐函数求导 | SHAPE | SHAPE | SHAPE | 0/3 |
| derivative-L12-1 | 对数求导法 | OK | **ANSWER** | **ANSWER** | 1/3 |
| derivative-L12-2 | 复合函数求导 | FAILS | OK | OK | 2/3 |
| derivative-L12-3 | 隐函数求导 | SHAPE | SHAPE | SHAPE | 0/3 |
| derivative-L12-4 | 参数方程求导 | SHAPE | SHAPE | SHAPE | 0/3 |

**重复计数**：12 格 × 3 轮 = 36 次请求，其中 15 次放行。放行题去重后只有 **11 个不同函数**：

- `y=(x/(x+1))^x` 出现 **4 次**（r1-L8-2、r1-L10-1、r2-L10-1，r3-L10-2 写成 `(x/(1+x))^x`，同一函数）
- `y=((x²+1)/(x²−1))^(arctan x)` 出现 **2 次**（r2-L12-2、r3-L12-2）

也就是说 15 − 11 = **4 份冗余**。这是题目池太小（强制的「幂指函数求导」考点反复抽到同一道），
不是闸门问题，但会让成功率与延迟的样本独立度打折 —— 记录在案。

### 15.5 Step 5 · 独立数学复核 —— 15/15 正确，错放 **0**

**为什么不采信系统自报的 `VERIFIED`**：那是被测系统的输出，用它证明自己等于空转。
所以另做一套**完全不调用项目引擎**的复核：由人手工把每题 `expression` 的 `f(x)` 与
`answer` 的 `g(x)` 从 LaTeX 转写成纯 JS 函数，再用中心差分 `(f(x+h)−f(x−h))/2h`（h=1e-5）
数值求 `f′`，与 `g(x)` 对比。

去重后 **11 个不同函数 / 44 个采样点，全部相对误差 < 3×10⁻⁹**：

| 函数 f(x) | 采样点 | 最大相对误差 |
| --- | --- | --- |
| `(x/(x+1))^x` | 0.7 / 1 / 2 / 3 / 5 | 2.7e-10 |
| `√((x−1)(x−2)/((x−3)(x−4)))` | 4.5 / 5 / 6 / 8 | 2.3e-10 |
| `(x/√(1+x²))^(arctan x)` | 0.5 / 1 / 2 / 3 | 9.0e-10 |
| `(x+1)^(x²)√(x²+1)/(x+2)^(sin x)` | 0.5 / 1 / 2 / 3 | 2.9e-09 |
| `(sin x)^(tan x)` | 0.4 / 0.8 / 1.2 / 2.0 | 1.0e-09 |
| `ln((x²+1)/(x²−1)) + arctan x` | 1.5 / 2 / 3 / 5 | 1.1e-09 |
| `((x²+1)/(x²−1))^(arctan x)` | 1.5 / 2 / 3 / 5 | 3.2e-10 |
| `x^(sin x) + (sin x)^x` | 0.6 / 1 / 1.5 / 2.5 | 1.1e-10 |
| `ln((√(1+x²)−x)/(√(1+x²)+x))` | 0.5 / 1 / 2 / 4 | 4.9e-10 |
| `(sin x/x)^(1/(1−cos x))` | 1.0 / 1.5 / 2.0 / 2.8 | 1.2e-10 |
| `arctan((√(1+x²)−1)/x)` | 0.5 / 1 / 2 / 4 | 2.3e-10 |

> `independently_confirmed_correct = 15/15`（11 个不同函数）
> `independently_confirmed_wrong_approved = 0` ✅

**⚠️ 复核中发现的 1 处瑕疵（不影响答案，也不阻断验收）**：
`y=((x²+1)/(x²−1))^(arctan x)` 的**解析文字**里，中间步骤写成

```
y'/y = ln((x²+1)/(x²−1))/(1+x²) + arctan x · 4x/(x⁴−1)      ← 解析里是「+」
```

而正确应为 **−**（因为 `A'/A = −4x/(x⁴−1)`）。**给出的 `answer` 是对的**（15.5 已独立验证），
所以这是「解析文字与答案不一致」，不是「放行了错答案」。
现有工具抓不到它 —— `solution_mismatch` 只比对解析里**声称的最终答案**，而这段解析没有
明写最终答案（只写「再乘回 y」）。复现：r2-L12-2 与 r3-L12-2 的 `solution` 字段。
**建议（不属本轮范围）**：给 reviewer 加一条「中间步骤符号自检」的提示，或让
`solution_mismatch` 也校验 `y'/y` 这类中间式。

### 15.6 Step 6 · 历史错题专项（线上）

**先说清楚一个约束**：后端只有 `generate` / `judge` / `evaluate` 三个动作，
**没有**「把指定题目送进生成闸门算一次分类」的接口。所以三例不能直接问"生成闸门会怎么判"。

**用的探针**：`action=judge` 在处理任何请求前会先跑 `Quality.approved(q)`，
而 `approved()` 走的就是 `gateDecision()` → `gateStateFromProfile()` ——
**和生成闸门共用同一条三态映射**：

| 线上 judge 返回 | 说明部署端引擎的结论 |
| --- | --- |
| `reason: question_untrusted` | `approved()=false` → 状态 **REJECTED**（因为 UNCERTAIN 是放行的） |
| 继续正常判题 | 状态 ∈ {VERIFIED, UNCERTAIN} |

**这个探针有真实判别力**：修复**前**，这两个错答是 Tier B（verdict=uncertain）→ `approved()`
会返回 **true** → 探针**不会**报 `question_untrusted`。所以一旦线上报出 `question_untrusted`，
就同时证明了两件事：①错答被判 REJECTED；②**parser 的 `[ ]` 归一化也已经在线上生效**
（否则它仍停在 Tier B）。

构造方式：取 r3-L12-2 服务端返回的**真实题包**（`raw_question`，含 `verification`），
只替换 `answer` 并重算 `verification.content` 快照（否则会被判 `VERIFICATION_STALE`，污染结论）。
**对照组**用同一个包 + 原答案，用来证明构造本身没坏。

| 答案变体 | 本地预测（同源引擎） | **线上实测** | 判定 |
| --- | --- | --- | --- |
| **对照 · 正确** | tier A / equivalent / approved=true | `{"verdict":"equivalent","correct":true,"trusted":true,"method":"deterministic","judge_layer":"structural"}` | **VERIFIED** ✅ |
| **V1 · 缺 `arctan x` 因子** | tier A / not_equivalent / **REJECTED** | `{"verdict":"uncertain","trusted":false,"reason":"question_untrusted"}` | **REJECTED** ✅ |
| **V2 · 第二项符号写反** | tier A / not_equivalent / **REJECTED** | `{"verdict":"uncertain","trusted":false,"reason":"question_untrusted"}` | **REJECTED** ✅ |

对照组成立（构造有效），两个错答线上都被判不可信 —— **三例全部符合预期**。
另用现有脚本 `.workbuddy/evidence/task5k/repro-arc.js`（本地引擎）交叉确认：
两个错答 `tier=A / not_equivalent / issues=[ANSWER_FAILS_VERIFICATION]`，正解 `tier=A / equivalent`。

### 15.7 Step 7 · Tier B 专项

**线上直接证据（不需要构造）**：三轮里闸门共 **12 次**给出 Tier-B 专属原因码 `UNVERIFIED_ANSWER`
（= 每轮 2 个「格·轮」被拒 × 2 次尝试；涉及 `derivative-L8-3` 每轮必现、`derivative-L10-2`/`derivative-L12-1` 各 1 轮）。
每一次的响应都是：

```
generate_error_code = GENERATION_UNVERIFIED      rejection_reasons = ["UNVERIFIED_ANSWER", ...]
would_fallback      = true
```

`UNVERIFIED_ANSWER` 与 Tier B 的关系不是推测，是代码里的枚举关系：
`code: profile.readable ? UNVERIFIED_ANSWER : UNVERIFIED_SHAPE` ——
所以 **`UNVERIFIED_ANSWER` ⟺ readable=true 且 verdict ∉ {equivalent, not_equivalent} ⟺ Tier B**。

结论：**「uncertain → 不展示 → fallback」在线上被观测到 12 次；
「uncertain → VERIFIED」在线上 0 次**（36 格里 approved 的 15 道 **全部 tier=A，无一 B/C**）。
修复前这 12 次里每一次都会变成 `VERIFIED` 并进学生端。

**前端处置已确认**（读 `app.js`，与线上文件哈希一致）：
`isUnverifiedCode()` 认 `UNVERIFIED_SHAPE` / `UNVERIFIED_ANSWER` → 失败分类为
`GENERATE_UNVERIFIED` → 文案「题目无法独立验证，已改用备用题」。
另外浏览器拿到题后还会用**自己的引擎再跑一次 `gateDecision`** —— Tier B 在客户端也会被挡下（第二道防线）。

**构造的 Tier B 案例（补因果）**：`∫sin(x²)dx` 配 `(√π/2)·erf(x)+C`
→ 引擎 `tier=B / readable=true / verdict=uncertain`，则

| 侧 | 结果 |
| --- | --- |
| `gateDecision`（生成端） | `{ok:false, state:"UNCERTAIN", code:"UNVERIFIED_ANSWER", unverified:true}` → `gateApproved = false` |
| `approved()`（判题端） | `true`（口径刻意更松）→ 线上 judge 实测**未**回 `question_untrusted`，与设计一致 |

**诚实边界**：线上没有「把构造题送进生成闸门」的通道，所以构造只能证明**判题侧不误判**；
「uncertain → 不展示」的直接观测只能来自真实生成流 —— 即上面那 12 次。两者互补。

### 15.8 Step 8 · 验收结论

| 硬指标 | 要求 | 实测 | 结果 |
| --- | --- | --- | --- |
| `independently_confirmed_wrong_approved` | 0 | **0**（15 道放行题 11 个函数全部独立数值复核通过） | ✅ |
| `canonical_drift` | 0 | **0**（15/15 canonical 指纹不变、verification 快照完好） | ✅ |
| `judge_inconsistency` | 0 | **0**（45 次 judge 调用，15/15 题三次重复口径一致，全部 equivalent） | ✅ |

外加：线上 `gate_policy = strict-tier-b` ✅；前端 7/7 逐字节一致 ✅；
`npm test` **249/249 通过** ✅；`check:sync` 三处副本一致 ✅；
历史错题三例线上三态全对 ✅；Tier B 线上 12 次被拦、0 次放行 ✅。

> ### 结论：**Reliability v1.1 可以收口。**
>
> Task 5K 这一刀在**线上真实流量**里被观测生效：Tier B 不再等于 VERIFIED，
> 「引擎没验证过」的题一律不进学生端；而顺着同一根链条漏出去的
> `y=((x²+1)/(x²−1))^(arctan x)` 两种错答案，现在线上都被判 REJECTED。

**遗留（都不阻断收口）**：

1. **1 处解析文字符号错误**（r2/r3-L12-2 的 `solution` 中间式写成 `+`，应为 `−`；答案本身正确）。
   现有工具覆盖不到这类「中间步骤」错误，建议下一阶段补。
2. **题目池太浅**：15 道放行题只有 11 个不同函数（4 份冗余）。强考点反复抽同一道，
   会稀释成功率/延迟数据的独立性。建议扩「幂指函数求导」「对数求导法」的题面池。
3. **生成成功率 41.7%**（15/36）—— 这一专项池是「导数 L8/L10/L12 + 强制幂指函数/对数求导」，
   本来就最容易踩 `UNVERIFIED_SHAPE`（隐函数/参数方程/分段点可导性这类题干解析不了），
   与历史默认矩阵（105/200）不可直接比。属**已知能力边界**，非回归。
4. **错答探针 18.2%（30/165）仍落到模型判** —— 这一层只采信 `not_equivalent` 且置信度 ≥ 0.9，
   本轮 165 条错答探针**误批为对 0 条**，但确定性覆盖率仍有提升空间。
5. **默认域名的访客风险提醒页**（§13.2）与可靠性无关，仍是托管就绪度的最后一块。

### 15.9 复现命令

```bash
# 后端指纹（必看 gate_policy）
curl -s --noproxy '*' "<backend>?health=1" | grep -o '"gate_policy":"[^"]*"'

# 前端 7 文件对照（先看状态码，再看哈希）
SITE="https://calcdaily-calcdaily-d5g2titwue91551fb.webapps.tcloudbase.com"
for f in index.html app.js math-quality.js fallback-bank.js storage.js auth.js cloudbase-client.js; do
  code=$(curl -s --noproxy '*' -o /tmp/dl_$f -w '%{http_code}' "$SITE/$f")
  [ "$(shasum -a 256 "$f"|cut -d' ' -f1)" = "$(shasum -a 256 /tmp/dl_$f|cut -d' ' -f1)" ] \
    && echo "$f http=$code MATCH" || echo "$f http=$code DIFF"
done

# 三轮定向线上测试（36 格）
npm run smoke -- --label task5k-deriv-rN \
  --only derivative-L8,derivative-L10,derivative-L12 \
  --extra-topics 'derivative:幂指函数求导,对数求导法'

# 本地回归 + 副本一致性
npm test && npm run check:sync

# 历史错题三例（本地引擎）
node .workbuddy/evidence/task5k/repro-arc.js
```

---

## 附录 A · 复核脚本自身踩过的坑（值得留档）

独立复核工具不是一次写对的。以下 6 个坑都修在了 `verify_all.py` 里：

1. sympy 把**裸 `e`** 解析成 `Symbol('e')` 而不是自然常数 → 需替换为 `E`。
2. **`\pi`** 解析成 `Symbol('pi')` → `N(pi/2)` 返回 `0.5*pi` 而非数值。
3. **`\ln 2`** 解析成**两参** `log(2, E)` → `N()` 直接报错。
4. **`x(1+x²)`** 被解析成**函数调用** `x(...)` 而非乘法 → 求值 TypeError。
5. **★ 极限点**：v1 把**所有**极限都按 `x→0` 求，于是
   `lim_{x→1}(x²−1)/(x−1)=2`、`lim_{x→∞}(1+1/x)^{2x}=e²` 被误报成错题。
   本题面里 **60 道 AI 极限题恰好全部是 x→0**，所以没有污染上次的 154 题结论；但备用题库里确有非 0 极限点。
6. **★ 取样点撞极点**：mpmath 的单侧取样点是 `x0 ± 1/(k+1)`，即 `x0±1, x0±1/2, x0±1/3 …`。
   `lim_{x→0}(1+2x)^{1/x}` 左侧取样正好撞上 `x=−1/2`（底数为 0）→ 被判「数值极限失败」。
   改用 `u³` 重参数化（取样点 `x0±1, x0±1/8, x0±1/27 …`）后解决。

另外两个数值坑：
- **float64 灾难性相消**：`lim (cos x − e^{−x²/2})/x⁴` 在 x=1e-4 时算出 **0**（分子有效位已丢光）。
  换 40–50 位精度后相对误差 1.97e-18。**数值复核极限必须用高精度算术。**
- **一阶收敛的极限**：`lim (tan x − x)/(x²ln(1+x))` 误差按 10 倍线性下降（1.68e-3 → 1.67e-4），
  是一阶修正项而非答案错；解析展开 `=(1/3)(1+x/2+O(x²))→1/3` 与数值一致。

## 附录 B · 证据文件

```
.workbuddy/smoke/independent-review/
  verify_all.py              独立复核器（sympy + mpmath，与 JS 引擎零重叠）
  approved-fallback.json     备用题库 60 道    → result-fallback.txt   (60/60)
  approved-200.json          200 题放行 105 道 → result-200.txt        (104 正确 / 1 错)
  approved-50-firstrun.json  首轮 50 题 31 道  → result-50-firstrun.txt (30 / 1)
  approved-50.json           二轮 50 题 18 道  → result-50.txt         (18 / 0)

.workbuddy/smoke/2026-09-20T07-32-37-online-200-r1 … -r4/
  questions.jsonl / report.json / report.md   逐轮原始数据（含每格每题的完整字段）

.workbuddy/smoke/2026-09-21T07-21-02-task5k-deriv-r1/
.workbuddy/smoke/2026-09-21T07-24-42-task5k-deriv-r2/
.workbuddy/smoke/2026-09-21T07-25-16-task5k-deriv-r3/
  questions.jsonl / report.json / report.md   ← §15 线上验收的三轮原始数据
      （raw_question 里留着服务端返回的完整题包，§15.6 的线上探针就是拿它当模板）

.workbuddy/evidence/
  fallback-question.png  judge-network-failure.png
  task3-canonical-suspected.png  task3-display-correction.png
  online-prod-question.png  online-prod-judge-wrong.png
  task5k/                      ← §14 的分析脚本（都可直接 node/python 跑）
    repro-arc.js              修复前：三份答案分别得到什么（§14.2 那张表）
    after-fix.js              修复后：同上 + 判题侧口径对比
    tier-dist.js              历史 200 题的 tier 分布 + 备用题库 60 道复核
    impact.js                 新闸门对历史 200 题的影响（105 → 104 的来源）
    evidence-nums.js          给语料写证据用的精确数值（x=1.13 处 −30.5911 …）
    helper-bug.js             证明旧测试 helper 对**正解**同样给 ok=0（§14.8）
    negative-control.py       ★ 反向对照：撤销修复 → 确认新测试真的转红
```

## 附录 C · 复现命令

```bash
PROD='https://calcdaily-calcdaily-d5g2titwue91551fb.webapps.tcloudbase.com'
BE='https://calcdaily-d5g2titwue91551fb-1482769901.ap-shanghai.app.tcloudbase.com/api/deepseek'

# 后端版本自查（Task 5K 起多一项 gate_policy，见 §14.7）
curl -s --noproxy '*' "$BE?health=1"
# → 期望含 "gate_policy":"strict-tier-b"

# 前端 8 文件对照（★ 先看状态码，再看哈希 —— 404 页内容带时间戳，哈希会抖）
for f in index.html cloudbase-client.js storage.js auth.js math-quality.js \
         fallback-bank.js app.js vendor/mathjax/tex-svg.js; do
  printf '%-24s %s %s\n' "$f" \
    "$(curl -s --noproxy '*' -o /dev/null -w '%{http_code}' "$PROD/$f")" \
    "$(curl -s --noproxy '*' "$PROD/$f" | shasum -a 256 | cut -c1-16)"
done

# 200 题 benchmark（4 轮 × 50）
for i in 1 2 3 4; do npm run smoke -- --label "online-200-r$i"; done

# Task 5K 定向复测：导数 L8/L10/L12 + 强制幂指函数/对数求导（一轮 12 格，跑 3 轮 = 36 道）
for i in 1 2 3; do
  npm run smoke -- --label "task5k-deriv-$i" \
    --only derivative-L8,derivative-L10,derivative-L12 \
    --extra-topics 'derivative:幂指函数求导,对数求导法'
done

# 本地可跑的（不需要部署）
npm test                                  # 249 项
npm run check:sync                        # 三处副本一致性
npm run probe:local -- --reuse .workbuddy/smoke/2026-09-20T07-32-37-online-200-r1/questions.jsonl
npm run verify:browser
node .workbuddy/evidence/task5k/repro-arc.js
node .workbuddy/evidence/task5k/tier-dist.js
python3 .workbuddy/evidence/task5k/negative-control.py   # 反向对照，会自动还原引擎

# 独立数学复核（需 sympy + mpmath）
PY=~/.workbuddy/binaries/python/envs/default/bin/python3
$PY .workbuddy/smoke/independent-review/verify_all.py \
    .workbuddy/smoke/independent-review/approved-200.json
```

> 网络提示：本机设了 `HTTP_PROXY`/`HTTPS_PROXY`，所有 curl 都要带 `--noproxy '*'`，否则被拦成 502。
