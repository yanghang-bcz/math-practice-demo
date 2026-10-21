# CalcDaily v1.2 — AI Delivery Reliability 修复交付

2026-10-21，Asia/Shanghai。P0 验证后再进行 P1。修复位于当前项目中的 `calcdaily-reliability-fix/` 独立副本；原仓库 `/Users/emobcccz/Documents/GitHub/math-practice-demo` 未被修改。没有部署、commit、push，也没有新增生产模型调用或修改云平台配置。审计附件只读保存在 `verification/audit-reference/`。

## 1. 交付与实际修改

生产文件只有以下五个，均为覆盖更新，不能删除站点其余文件：

| 文件 | 实际修改函数/区域 | 作用 |
|---|---|---|
| `app.js` | `API_TIMEOUTS/API_BUDGETS`、`apiFailureKind`、`apiRetryable`、`apiCall`、`markApiRequestFailure` | 分类保真、旧服务质量500兼容、共享剩余预算、body超时、受限重试与Retry-After |
| 同上 | `generateOneQuestion`、`scheduleSessionPrefetch`、`scheduleSpeculativePrefetch`、`prefetchWarmup`、`consumeSessionPrefetch`、`consumeWarmup` | 后台只缓存AI；失败立即删除；60秒成功缓存TTL；兼容计划复用；后台失败不污染状态栏 |
| 同上 | `ensureCurrentQuestion`、新增 `ensureCurrentQuestionOwned`、`startDaily`、`startDiagnosis` | 每会话题号单飞、await后身份校验、开始会话的warmup归属保护、已提交题目不可被旧结果覆盖 |
| 同上 | `renderActiveSession`、`diagLog`、`recentFallbackIds`、`mergeState` | 实际展示才计一次fallback/通知；交付来源与等待时间；记录最近已展示题库ID并持久化，覆盖未答便重开情形 |
| `math-quality.js` | `toInfix`、`splitDefinition`、`expandFuncPowers`、`tryParse`、`numericDerivative`、`extractIntegral`、`verifyDerivative`、`verifyIntegral`、`issues`、新增有界域内采样点 | 修复审计解析误拒、语义改写和中间结论误读 |
| `cloudbase/deepseek/index.js` | HTTP入口、`readJsonBody`；新增 `failureResponse/requestCancellation/withinBudget/deadlineError`；`CALL_POLICY/callDeepSeek/callDeepSeekOnce/readUpstreamJson` | 结构化错误、请求截止与断开取消、body错误保真、关联请求的上游日志 |
| 同上 | `moduleGuidance`、`generateDraftQuestions`、`generateQuestions`、新增 `generateWithinBudget` | 能力约束、自检要求、拒因反馈、失败表达式排除、能力预检、保留完整严格审核 |
| `cloudbase/deepseek/math-quality.js` | 根引擎同步副本 | 逐字节一致 |
| `api/deepseek.js` | Vercel HTTP入口与同一业务段 | 与CloudBase契约、请求身份和预算一致；业务段逐字节一致 |

新增测试：`tests/delivery-p0.cjs`、`tests/delivery-p1.cjs`、`tests/delivery-deadline.cjs`。

原测试的必要适配只有三处文件：`tests/pipeline-v3.cjs`、`tests/reliability.cjs` 补VM的AbortController/计时器；`tests/client-retry.cjs` 的坏JSON模拟改抛真实解析使用的SyntaxError，避免把网络body中断模拟成普通JSON错误。原断言未放宽。

新增验证工具：`tools/delivery-browser.cjs`（真实Chrome+本地站点+拦截API）、`tools/delivery-evidence.cjs`（审计夹具比较和hash清单）。没有改动HTML、CSS、题库内容、IRT公式、自适应学习、Topic Mastery或错题复习规则。

## 2. 根因与修复契约

| 问题 | 根因 | 修复与用户行为 |
|---|---|---|
| 数学拒稿误报连接异常 | Gate拒稿没有HTTP身份，顶层按500处理；前端先按5xx重试，任何有code的失败又被归为数学拒稿 | 质量结果HTTP422，code保留GENERATION_REJECTED/GENERATION_UNVERIFIED，stage=quality；不可HTTP重试；展示严格验证的备用题并说明审核原因，不改连接故障状态。旧服务器质量500仍按业务code识别，不盲重试 |
| 网络、模型、超时、格式混淆 | body读取异常被吞；错误码/HTTP状态没有分开 | UPSTREAM_UNREACHABLE/network、UPSTREAM_REJECTED或RATE_LIMITED/model、UPSTREAM_TIMEOUT/timeout、UPSTREAM_PROTOCOL_ERROR或FORMAT_ERROR/format分别保留；HTTP424表示已处理的上游依赖失败；坏模型格式422；真正未处理服务器异常仍500 |
| 标准答案不可信未独立呈现 | 只暴露通用拒稿 | 返回reason_code=CANONICAL_UNTRUSTED（审核员怀疑标准答案或独立答案明确冲突），保留code、rejection_reasons、逐轮feedback。不会作为可信新题展示 |
| 前端协议失败 | 请求身份错、版本错、空/坏响应易混为网络 | CLIENT_PROTOCOL_ERROR独立归类，不重试，使用备用题并报告服务响应异常 |
| 多层超时叠加 | 单轮25+18×2秒，生成两轮，平台35秒先杀 | 服务端整请求30秒绝对deadline，草稿9秒×最多2、审核5秒×每候选1次；两轮理论28秒，实际始终受deadline约束。CloudBase请求体读取另限2秒，合计最多约32秒，留出平台返回余量 |
| 前端继续等/重发旧请求 | 单次60秒/总体90秒；无前后台归属 | generate单次33秒、总体34秒；把剩余预算减2秒发给后端，服务端再取30秒上限。超时和质量拒稿不再HTTP重试；早期可恢复网络/限流仍最多重试一次。401/400服务端不再外层重试，429读取Retry-After且受剩余预算限制 |
| 三类前端竞态 | 调度与消费兼容标准不同；前台无单飞；后台失败提前变成可缓存fallback | 调度也调用plansCompatible；按session+sequence单飞；await后检查activeSession、sequence、owner及空槽位。正式提交的fallback是该槽位终态，晚到AI不得覆盖。后台失败抛出并立即清缓存，不产生长期fallback缓存 |
| 连续备用题重复 | 仅历史已答题参与排除，未答的已展示题不可见 | 维护最近40个已展示bankId，保存/恢复；题库选择继续使用现有严格题库，不扩题库、不改学习策略 |

所有错误结果包含身份回显、versions、stage、reason_code、retryable、fallback_allowed、report_service_error、gate_state/tier、rejection_reasons和attempt_history。前端同时保留HTTP状态和业务码。generate业务失败允许备用题；网络/模型/协议/真实服务异常在兜底同时报告服务异常，质量拒稿只解释质量原因。judge/evaluate仍按各自原有恢复路径处理，不拿备用题替换正在判分的题。

`health`仍表示服务配置/存活，不证明上游余额、配额或数学出题成功。版本标签为兼容已有题目历史而保留；部署真实性必须通过本次SHA-256清单核对，不能只看手工版本号。

## 3. 数学修复与质量门槛

- 函数定义左侧规范化明确的left/right定界修饰，隐函数仍不可当成显函数。
- 语法编译与定义域合法采样分开；ln(x−3)不再因为固定试点全在域外而被判语法失败。
- 原8个采样点保留；只有不足4个合法点时才补充有界域内候选，仍需至少4个有效点，容差不变。不得用扩大采样引入接近零值来放过漏系数答案。
- 中心差分的Richardson系数改为(4D(h/2)−D(h))/3。
- 支持直立e、积分直立d、10及以上整数函数幂；只对白名单做等价规范化。
- 支持明确的2/10常数底对数；未知下标不再静默删除，返回不确定。复杂/含糊底数写法仍可拒绝支持。
- 解答一致性只提取明确的最终答案、原极限和结果结论，局部“第一项极限/第二项极限”不再逐一与最终答案比较；显式最终矛盾仍被拦截，完整解答仍必须经过Reviewer硬审核。
- 点值求导目前缺少完整求值点协议，正反向统一UNCERTAIN并禁止新生成；不再把答案2误判错误或把未求值的2x放行为点值答案。正确点值题尚不能作为新AI题放行。

只有deterministic=equivalent、原审核员全部硬字段通过、置信度通过、canonical完整时才可下发。Tier B/C、未知语法、数值不确定均不能作为新生成题放行。没有调整Quality Gate、最低有效点数、数值容差、置信度阈值。

P1只增加：可验证的高难显函数组合、禁止未支持的分段/数列/参数/反常积分指引、不定积分最终原函数求导回代要求、再生成传入能力/数学拒因及失败表达式、unsupported候选提前停止Reviewer浪费。不修改计划targetDifficulty和指定topic来追通过率；题目难度保真与多样性仍需独立线上盲评，prompt改进不等于已证明模型表现改善。

## 4. 可对比证据与测试结果

| 指标 | 原代码/原证据 | 修复后本地结果 |
|---|---|---|
| 原历史测试 | 249/249通过，未覆盖这些缺陷 | 原249项全部仍通过；最终全部287/287通过 |
| 新P0回归反向验证 | 32项中30失败、2通过 | 32/32通过；部分失败证明旧代码缺少新契约/截止功能，其余直接重现旧数学、重试、缓存与竞态缺陷，不能称为30个独立线上bug |
| 审计9个可支持的正确数学夹具 | 严格Gate通过1/9 | 9/9通过；模拟Reviewer全硬字段true以隔离引擎，不能冒充真实模型审核实验 |
| 同批正题符号改错 | 配套负向测试 | 9/9不能放行，历史漏因子、错符号、Tier B及canonical回归继续通过 |
| 审计点值正/反夹具 | 正确标量判错，未求值导函数可通过 | 两者均UNCERTAIN，均不得新题放行 |
| 12个保存的线上成功响应 | 原审计12/12能接受 | 本次真实Chrome中12/12仍通过严格闸门；没有重新调用生产接口 |
| 超时上界 | 单轮约61.8秒、两轮约124秒；平台35秒 | 服务端deadline30秒；真实本地挂起实验约30.003秒返回HTTP424/UPSTREAM_TIMEOUT（单次独立实验）；最终整套测试中同项再次通过 |
| 前台并发 | 本地复现2次出题、快AI被慢fallback覆盖 | 同槽只发1次；已提交fallback、会话切换、题号推进后旧响应均不能写回 |
| 失败缓存 | 2小时前fallback可消费 | 失败立即清除；旧fallback不消费，成功AI缓存TTL60秒 |
| fallback计数 | 生成失败/ready重复计数 | 实际展示1次只计1次；后台失败不计展示fallback |
| 连续练习 | 原审计未答/重开可重复同bankId | Chrome连续3题备用题使用3个不同bankId，均可正常判题与下一题 |
| 浏览器验收 | 原审计3题正常流程+离线竞态复现 | 9/9真实Chrome场景通过，未捕获页面未处理异常；本地API回放/故障注入，不是生产指标 |

原15次生产样本维持原始口径：15/15收到HTTP响应、12/15返回AI题、3/15最终质量拒稿；请求均值4.09秒，P95为8.69秒。没有修复后的线上样本，因此不能报告线上网络率、备用题率、首题P95或数学正确率已经改善。

复现：项目根目录运行 `node --test tests/*.cjs`（含真实等待约30秒的测试）、`node tools/check-sync.mjs`。Chrome验证运行 `node tools/delivery-browser.cjs`；可用PLAYWRIGHT_MODULE和CHROME_PATH指定本机安装。该工具只启动临时本地站点并拦截全部远程请求，不触达生产模型；测试钩子只注入测试响应，不写入生产app.js。

证据：`verification/final-tests.txt`、`baseline-tests.txt`、`p0-all-tests.txt`、`p0-regressions.txt`、`new-regressions-against-original.txt`、`deadline-30s.txt`、`final-browser-results.json`、`final-browser-output.txt`、`math-before-after.json`、`comparison-summary.json`、`final-sync.txt`、`deployment-manifest.json`、`changes.patch`。

## 5. 尚未解决及实际边界

1. 未部署，线上仍是旧行为；所有生产改善指标待测。未启用CloudBase日志付费功能、未接受费用条款、未修改35秒平台配置。
2. 点值、复杂对数底/下标、隐函数、参数方程、特殊函数、极窄/远移定义域及其他引擎不支持形态仍可能UNCERTAIN并降级。未放宽审核。指定不支持考点不会被偷偷换成另一考点；原Topic Mastery和弱项计划未改，因此这类请求仍可能需要备用题。
3. 不保证所有正确数学题均能被数值引擎证明；有限数值采样不是符号证明。独立Reviewer及原有负向保护仍必需。
4. 生成再试仍最多两轮；第二轮通过prompt要求更换结构并携带失败表达式，不能保证随机模型绝不再次产生相似结构。线上需实际测量，不能按prompt存在就认定重复失败率已下降。
5. 同一页面/会话槽位已单飞；没有建立跨实例持久化幂等存储或跨标签页请求协调。网络传输恢复仍可能让不同实例重复计算，但客户端不会重复提交展示；模型调用成本需上线观察。
6. 诊断记录仅保留最近200条，不是永久分析仓库。长会话测试需及时分批导出，按session+sequence去重。没有为日志新增外部上传、用户数据发送或后台采集服务。
7. 题库仍是原60题，原有L9–12覆盖缺口未用低难度贴高标签掩盖；本次只修轮换，不新增未经复核题目。
8. 30秒deadline验证基于本地真实计时和注入上游挂起；平台排队、冷启动、网关/CORS、上游真实长尾及断网状态仍需部署后在实际浏览器验收。2秒请求体预算基于小JSON请求，不支持慢速大体积上传。

## 6. 需要重新部署的文件及发布检查（未执行）

CloudBase生产：前端覆盖 `app.js`、`math-quality.js`；deepseek云函数覆盖 `cloudbase/deepseek/index.js`、`cloudbase/deepseek/math-quality.js`。若仍保留Vercel接口，同时更新 `api/deepseek.js` 与根引擎。无须部署测试脚本、verification、原审计附件或此报告。

先保存当前前后端包以便回滚；维护窗口暂停新练习后协调发布前后端，确认静态缓存已更新，再恢复流量。不要只更新api/deepseek.js而漏掉CloudBase真实入口。云函数执行上限可继续保持35秒。

逐文件核对 `verification/deployment-manifest.json` 中SHA-256，验证根与云函数引擎一致、两后端业务段一致。静态资源可直接核对下载hash；后端需由实际部署包或构建来源核对，不可用health手工版本号替代部署包证明。先用受控请求确认新响应的stage/retryable/request_id，再开放完整练习流量。需要回滚时整体回滚配套前后端文件。

## 7. 部署后的真实线上验收方案

### 7.1 先验收行为，再做分布测量

1. 使用独立游客浏览器，不覆盖真实学习数据；记录客户端/静态资源hash、后端构建包hash、时区、网络/代理条件、设备与请求ID。
2. 先做limit/derivative/integral × L4/L8/L12 × topic=null/常用指定考点的同分布基线；包括有实际学习历史触发的弱项考点。受控真实模型验收建议每格至少5次，并注明样本量；不要因某格失败而把它从分母删掉。
3. 每轮从点击练习到实际展示/完成或明确失败，保存Network HAR与 `CalcDailyDiag.dump()`；每小批及时导出，避免200条环形缓存覆盖。后台API请求、实际展示题目分别计数，并按request_id/question_id和session_id+question_sequence关联。
4. 正常线上页面不注入生产模型错误。质量拒稿、429、断流、晚到AI/备用题等故障机制先在隔离浏览器以请求拦截重现，再单独记录自然发生的生产事件；注入样本不能混入真实失败率。
5. 验证首题、连续至少10题、答题后下一题、未答重开、双击开始、快速离开/返回、新会话、后台预取失败后恢复；每槽位只允许一个正式题目，已展示题不得被旧请求覆盖。
6. 生产长尾测试在有控制的测试环境注入上游挂起，确认云函数在平台35秒前主动返回结构化超时；再观察真实长尾。不要用反复让生产上游挂起来测压力。
7. 日志页尚未启用：如需开启有费用/条款的日志存储，由部署负责人确认后配置。记录每个上游span、attempt、候选闸门、数学拒因、平台调用ID；不记录密钥。缺日志时必须写“上游调用级成功率未知”，不能以HTTP比例替代。

### 7.2 七项指标的分母、证据和通过条件

| 指标 | 计算口径 | 数据与验收 |
|---|---|---|
| 真实网络失败率 | 自然请求中真实fetch/传输断流失败次数 ÷ 全部真实HTTP尝试；另报重试后的逻辑请求最终网络失败率 | Network/HAR + http_attempt 的network/timeout分开；HTTP422质量拒稿不计网络。客户端到网关与服务器到模型的网络失败分别统计 |
| 数学审核拒稿率 | 最终因quality拒稿的逻辑生成请求数 ÷ 全部逻辑生成请求数；另报逐候选拒稿率 | 合并attempt_history/后端日志；区分REJECTED、UNCERTAIN解析能力、CANONICAL_UNTRUSTED；题面缺失时不能认定真数学错误 |
| 用户实际看到备用题比例 | source=fallback 的唯一question_displayed槽位数 ÷ 全部唯一已展示槽位数 | 用session+sequence去重；未展示的失败预取不计。另报点击后完全无题的交付失败率与AI交付比例，禁止只报HTTP200 |
| 成功预取利用率 | 最终展示且origin=prefetch/warmup的唯一AI题数 ÷ 后台成功question_ready的唯一AI题数 | 按request_id关联；完成的预取不等于已被利用。报告未消费原因、TTL作废、计划不兼容、会话结束；判分前后预测不匹配独立列示 |
| 首题等待与P95 | 从用户点击开始到首题可见且能作答，包含warmup等待、前台恢复、重试、渲染；按会话采样 | 浏览器端记录时间线；duration_ms可作交付提交参照但不能替代公式渲染完成。报均值/中位/P95，P95按排序ceil(.95N)；冷/暖启动、预取命中/未命中分组，超时/无题不删样本 |
| 重复备用题比例 | 与最近同模块已展示fallback bankId重复的备用题展示数 ÷ 同模块备用题展示数；同时报相邻重复与窗口20内重复 | question_displayed.bank_id与本地保存的最近ID；覆盖未答重开，题池耗尽后轮换另列。至少一组同模块连续10次备用交付应不重复，不能只用三模块各一题替代 |
| 独立复核数学正确率 | 独立核验正确的实际已展示AI题数 ÷ 全部被抽中复核的已展示AI题数；不确定题单列、不算正确 | 由独立人工推导/符号复核，不能仅重复运行本次同一引擎或让原生成模型自评；逐题保存题面、答案、解法、域和结论。任何明确错题放行都阻断上线验收并回滚，不用低错误率平均掉 |

建议至少积累100个自然首题会话再报告P95，并给出样本量和区间；短期样本只能初步说明，不能代表长期可靠性。对照组必须匹配topic/level/历史分布、网络路径与设备条件。阶段性验收应同时看到：质量失败不再误报连接、零已知竞态覆盖、零失败预取长期缓存、独立复核无明确错题、真实用户AI交付比例改善且等待/每展示题模型调用数没有异常上升。不得预设或杜撰线上改善百分比。
