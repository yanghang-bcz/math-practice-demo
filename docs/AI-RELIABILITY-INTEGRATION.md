# CalcDaily v1.2 正式仓库安全整合与部署前验收

日期：2026-10-21（Asia/Shanghai）。本报告取代原独立副本报告中的发布结论；原报告保留为 `DELIVERY-RELIABILITY-ORIGINAL-REPORT.md`。

## 结论

已将修复按差异补丁安全整合到 `/Users/emobcccz/Documents/GitHub/math-practice-demo` 的 `codex/calcdaily-v1.2-reliability` 分支。本地验收通过，可以进入有备份的受控发布准备；**尚不能认定生产验收通过，也不能保证跨实例或供应商层面的绝对零重复计费**。

没有部署、commit、push、修改线上配置、访问真实账号/数据库或新增生产模型调用。Git index保持未暂存；main引用与当前HEAD仍为 `ab0e0a00c28b8a04f073c337bdd9056e3b163040`。

## 1. 仓库保护与整合方式

开始时仓库位于main，有原有未提交成果：`.workbuddy/memory/MEMORY.md`、`cloudbase/.DS_Store`、`package.json`，以及网络稳定性工具、报告、证据等未跟踪文件。未stash、reset、clean，也没有整体解压覆盖。

修复包五个生产文件的original_sha256均与正式仓库工作树一致；ZIP中修复文件hash全部正确，包内报告与独立副本报告相同。先保存工作树、未提交diff、分支/HEAD和文件hash，再通过 `git apply --check`，创建修复分支并应用八个已有文件的补丁；新文件单独加入。没有安全合并冲突。

仓库外备份：

`/Users/emobcccz/.codex/.chatgpt-projects/g-p-69aed7ee2424819192fda2d3828aa78d/calcdaily-integration-20261021/working-tree-before.tar.gz`

备份权限600，包含Git跟踪及非忽略未跟踪的原工作文件；不含Git对象库和被忽略文件。旁边保存before-manifest.json、before-meta.json、before-diff.patch。被忽略的原文件未被本次操作修改。

`verification/integration-audit.json` 给出逐文件保护结果。账号、云同步、UI与原有网络工具等保护文件hash均与备份一致：`auth.js`、`storage.js`、`cloudbase-client.js`、`index.html`、`fallback-bank.js`、`tailwind.css`、根 `package.json`、`tools/net-stability.mjs`、原记忆文件和DS_Store。

## 2. 完整diff范围摘要

完整补丁：`verification/integration-complete.diff`，相对本次操作前的工作树生成，包含新文件；不混入用户原有未提交修改。直接运行git diff会显示原记忆文件等原有变动，不能把它们算成本次修改。

| 类别 | 文件 | 本次变化 |
|---|---|---|
| 前端 | app.js | 错误分类、共享预算、生成HTTP单次提交、随机请求nonce、会话题号单飞、await后归属检查、预取复用/失效、展示计数与备用题轮转 |
| 数学引擎 | math-quality.js、cloudbase/deepseek/math-quality.js | 审计中的LaTeX、定义域、中间极限、Richardson修复；未知形态仍UNCERTAIN；原严格阈值不变 |
| 后端 | cloudbase/deepseek/index.js、api/deepseek.js | 结构化业务结果、错误/身份回显、入口统一截止、取消传播、模型调用预算、候选能力预检、拒因反馈、同实例请求复用 |
| 运行时声明 | cloudbase/deepseek/package.json | Node最低声明改为>=20.3，符合AbortSignal.any使用；生产仍须确认原Node20.19运行时，不自动修改线上配置 |
| 原测试适配 | tests/client-retry.cjs、pipeline-v3.cjs、reliability.cjs | 补VM平台对象、真实SyntaxError；明确生成不自动重提，判题重试仍覆盖；数学断言未放宽 |
| 新测试 | tests/delivery-p0.cjs、delivery-p1.cjs、delivery-deadline.cjs、delivery-integration.cjs、delivery-metrics.cjs | 审计回归、超时、幂等边界、混合版本、合成用户数据往返、指标口径 |
| 测试夹具 | tests/fixtures/delivery/ | 数学探针、去掉网关headers的历史响应、旧客户端相关函数、合成v2状态；不含实际用户学习缓存/账号凭证 |
| 验收工具 | tools/delivery-browser.cjs、live-session-collector.js、reliability-metrics.mjs、reliability-live-check.mjs | 本地Chrome回归、本地导出实际展示、离线指标、必须显式--live才发请求的只读发布检查 |
| 保护/文档 | .gitignore、docs/AI-RELIABILITY-*、原报告归档 | 忽略本地验收痕迹及.env文件，部署清单、操作及回滚说明 |

IRT、updateAbility、updateTopicMastery、makeDailyPlan、chooseWeakTopic、correctProbability、updateReviewItem及相关学习策略未修改。没有修改HTML/CSS、认证/存储源文件、题库内容或SQL/RLS。

## 3. 相对原修复包补强的安全点

1. **入口30秒预算**：从HTTP handler入口记录deadline，读取请求体的时间占用同一30秒；不再出现“最多2秒读body，再额外跑30秒”。正常请求代码返回到35秒上限之间理论保留5秒；它不包含已证明的云平台冷启动/排队SLO，须线上复核。
2. **生成只提交一次**：generate HTTP最多一次，即使调用方传attempts=4也不能自动重提。响应丢失可能发生在上游已经接受并计费之后，前端不能把它当“肯定没执行过”。服务端仍保留最多两轮有拒因反馈的候选恢复；判题和评估原有恢复策略保留。
3. **同实例复用**：同一request_id及相同业务输入的并发/120秒内重放复用同一Promise/结果；改变业务输入但复用ID在模型调用前返回409。失败结果也复用，不再自动重新付出模型调用。缓存最多256项，满时429且不启动模型，过期后清理。此容量限制与120秒窗口需上线观察，不是全局幂等服务。
4. **请求身份**：新前端使用随机nonce，避免不同页面在同一毫秒从相同计数起点产生相同ID。
5. **兼容/可观测性**：保留protocol=2、原canonical字段、数学版本与strict-tier-b；增加delivery_contract=v1.2-safe-merge、请求预算/重放范围说明和upstream_status，旧客户端可忽略新增字段。真实未处理服务器故障保留5xx，已处理的质量/上游失败分类返回。
6. **输入与配置**：非JSON对象请求按400处理；未配置服务密钥的响应明确retryable=false，不回传密钥值。

## 4. 协议兼容矩阵

| 前端/后端 | 本地结果 | 发布含义 |
|---|---|---|
| 旧/旧 | 成功响应仍可读；旧质量500仍会重试两次（基线缺陷） | 不能宣称原组合满足v1.2可靠性目标 |
| 新/旧 | 识别旧质量500的业务码，不重试；旧成功响应正常读入 | 支持先发布新前端；旧后端忽略budget_ms时前端仍有33/34秒上限 |
| 旧/新 | 成功响应字段兼容；质量422正常进入原备用题路径且不再5xx重试 | 不崩溃/不强制修改数据；旧解析器可能拒绝新支持形态并降级，旧UI仍可能给出泛化错误提示 |
| 新/新 | 严格审核、分类错误、单飞和受控截止 | 推荐正式目标组合 |

四种组合均做了API兼容回归，新前端/旧后端质量500另外做真实Chrome验证。**没有声称旧前端会自动获得新版UI错误归因、解析覆盖或跨实例幂等能力。** 首选前端完整配套更新后再发布后端，并让测试客户端关闭旧标签页/强制刷新。已有旧缓存客户端仍是残余风险。

质量错误HTTP422、已处理的模型依赖错误HTTP424、真实内部故障5xx。保留code、reason_code、stage、retryable、request_id、versions；upstream_status单列原401/402/429/5xx。新旧成功响应结构不变，不能为了兼容放行UNCERTAIN题。

## 5. 用户数据兼容方案

沿用calcDaily.v2、旧calcDaily.v1迁移路径及version=2；无数据库列变更、无SQL迁移，不清空LocalStorage，不重置历史、账号、Ability、Topic Mastery或错题。

新增recentDisplayedFallbackIds为可选有界数组：旧状态缺失时默认为[]；新读入时只保留字符串且最多40项；旧reader保留/忽略附加字段即可继续工作。题目上的deliveryOrigin、deliveryWaitMs、deliveryFailure、_deliveryDisplayed等为可选交付元数据，不属于canonical数学字段。临时_delivery中的Promise为不可枚举属性，不序列化到学习状态。

新/旧mergeState双向往返测试验证profile/settings/stats/history/reviews/checkins完整保留。CloudBase仍使用原state_json JSON快照；活动会话仍按原storage.js只在本机保存。可选字段缺失只影响交付诊断/轮转，不改变评分或复习计划。

## 6. 验证结果

| 验证 | 结果与证据 |
|---|---|
| 正式分支全量 | **308/308**，verification/integration-unit-tests.txt，约30秒真实等待用例包含在内 |
| 数学专项 | **92/92**，verification/integration-math-tests.txt；是全量测试的子集，不相加计总数 |
| 真实Chrome | **11/11**，verification/final-browser-results.json，无页面未处理异常；仅本地API回放/故障注入 |
| 30秒截止 | 全量中的真实30秒handler挂起测试通过；额外验证请求体读取占入口预算 |
| 发布ZIP本地启动 | **5/5**，verification/backend-artifact-smoke.json；实际HTTP并发/重放只发生一组draft+review，冲突409，600ms注入预算触发上游取消并返回超时，无效body400 |
| 副本与语法 | 根/云函数引擎逐字节一致，两后端业务段一致；修改的JS语法检查、git diff --check通过 |
| 既有成果 | 保护文件hash不变；没有暂存/提交；完整差异单独输出 |
| 敏感内容 | 新增/修改内容模式扫描未发现私钥、DeepSeek sk-key、腾讯SecretId或字面Bearer长token；没有将.env或服务端密钥放进前端/包 |

本地Node为v24.20.0；既有生产审计记录Node20.19、35秒。**未把本地测试说成真实CloudBase 35秒执行实测，也未验证真实账号登录/跨设备同步或供应商账单。** 这些是受控发布验收条件。认证/同步源文件未改、原CloudBase/同步回归仍通过，但不能代替真实账号验收。

## 7. 发布前风险与准入条件

- 当前没有跨实例持久化幂等存储。新前端不自动重提、同实例可复用，但旧缓存前端、人工重复点击形成不同ID、不同实例/重启/过期窗口仍不能保证exactly-once；供应商对已接受但取消的请求是否计费也不能由本地证明。若准入条件是绝对零重复计费，**本次仍不满足该绝对条件，不能直接全量放行**。
- 同实例256项/120秒缓存可达到容量上限；到达时受控429并使用备用题，不重复执行付费请求。需观察实际实例流量，不擅自调整云并发/内存或数据库。
- 5秒理论余量尚需在生产等价Node20.19测试环境与实际网关检查冷启动、body读取、取消、日志和返回时长；事件循环阻塞与平台调度无法仅靠Promise定时器作绝对保证。
- 历史标签仍为quality-v2以兼容已有题目；版本字串不能区分本次构建。必须核对静态SHA和后端部署包hash。
- 点值求导、隐函数/参数/未知语法等仍可能UNCERTAIN；质量门槛没有降低。高难题难度保真和独立数学正确率仍需真实样本。
- 独立副本/本地开发回退包不等于当前生产包。**部署前必须下载生产静态资源、云函数包及配置**；未取得可信生产回滚点就不开始发布。
- 线上API日志持久化/付费条款未启用。没有授权就不替用户开通；没有完整日志时上游调用级成功率、逐候选拒稿率和计费次数必须标未知。
- 密钥仅由服务端process.env.DEEPSEEK_API_KEY读取；没有读取/修改线上密钥值。部署负责人需确认原环境变量绑定保留，不能用health configured=true当作余额/Key有效性证明。

具体发布、回滚及采集命令见 `AI-RELIABILITY-DEPLOYMENT.md`。本次没有执行其中的线上命令。
