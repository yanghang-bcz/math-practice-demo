# CalcDaily v1.2 CloudBase 发布、回滚和线上验收手册

状态：只做准备，未部署。以docs/AI-RELIABILITY-INTEGRATION.md的风险/准入条件为前提。

## 1. 文件与产物

正式仓库：`/Users/emobcccz/Documents/GitHub/math-practice-demo`。

仓库外产物目录：

`/Users/emobcccz/.codex/.chatgpt-projects/g-p-69aed7ee2424819192fda2d3828aa78d/calcdaily-integration-20261021/release/`

| 产物 | 用途 |
|---|---|
| frontend-overlay.zip | 仅修改的app.js、math-quality.js；对现有站点原位替换，不能当成删除式完整站点部署 |
| frontend-full.zip | 当前完整白名单静态站点：原index、认证/存储配置、题库、CSS、vendor均保留；新建独立静态发布可用 |
| cloudbase-backend.zip | ZIP根目录四件：index.js、math-quality.js、package.json、可执行scf_bootstrap |
| rollback-dev-*.zip | 合并前开发工作树回退候选；**未证实与现网一致，不能冒充生产备份** |
| artifact-manifest.json | 上述ZIP的SHA-256、大小和来源 |

源码hash：`docs/AI-RELIABILITY-DEPLOYMENT-MANIFEST.json`。若使用Vercel入口，额外发布api/deepseek.js及根math-quality.js；CloudBase实际生效入口不是api/deepseek.js。

不上传仓库根目录/.git/.workbuddy/tests/verification/docs/.env或服务端Key到静态托管。不要因CLI默认不采用.gitignore而误传整个仓库；只上传白名单产物。SDK已有Publishable Key是公开客户端配置，保持原值；绝不把DEEPSEEK_API_KEY填到前端。

## 2. 发布前保存生产回滚点

1. 在控制台确认环境为 `calcdaily-d5g2titwue91551fb`、地域ap-shanghai、现有函数deepseek及HTTP路由/api/deepseek。旧README存在不同拼写，以当前cloudbase-client.js和控制台为准；若不一致先停止。
2. 下载现网app.js、math-quality.js、index.html以及站点当前版本/全量资源；记录hash和缓存配置。
3. 下载实际deepseek生产代码包，记录执行版本/别名、路由、运行时、35秒超时、内存、环境变量名称与绑定存在性、网关CORS和认证配置。密钥值只保留在安全的服务端配置/受控备份，不进入仓库或本报告。
4. 确认可用的上一生产版本确实能被恢复；若当前路由指向LATEST，不能把“保存过旧代码”当成“已有不受修改影响的生产版本”。若平台/HTTP路由支持固定版本，先记录旧版本及其路由关系。
5. 使用已有测试环境/不接管生产路由的测试函数验证部署包，保留原Node20.19或确认兼容的Node20运行时；本次声明>=20.3，不建议依赖未实测Node18。测试长尾/冷启动，而非在生产反复注入挂起。

Web函数需正确打包启动文件、赋可执行权限并监听9000；包内保持既有scf_bootstrap，未擅自改线上启动命令。[腾讯云Web函数启动说明](https://cloud.tencent.com/document/product/583/56126)

## 3. 发布顺序（由你执行）

### A. 先更新前端配套文件

维护窗口内暂停开启新的练习，原会话先完成/退出；不删除学习数据。新前端能识别旧后端质量500，优先完成前端更新并核对两个hash，再更新后端。

推荐在现有静态托管原路径替换app.js与math-quality.js；使用完整部署入口时上传frontend-full.zip。需要原位CLI上传时，先核对本机CLI帮助支持相应参数，再解压overlay到单独目录执行：

```sh
tcb hosting deploy /ABSOLUTE/PATH/frontend-overlay-unpacked -e calcdaily-d5g2titwue91551fb --safe --verify
```

目录里只能有这两个前端文件。**不加--prune**，不运行对仓库根目录的全量上传，以免删除原资源或公开非前端文件。--safe/--verify的行为及支持情况应与本机CLI对应核对；不支持则通过控制台备份后逐文件更新。[CloudBase静态托管文件发布与一致性校验](https://docs.cloudbase.net/cli-v1/hosting)

关闭测试浏览器的旧标签页后重新打开、强制刷新，核对下载文件SHA；验证原账号入口、历史和备用题仍可打开。此时旧后端可能尚未升级，health里没有delivery_contract是预期的阶段状态。

### B. 再更新现有deepseek后端

1. 打开同环境的现有deepseek函数代码页，选择本地ZIP上传cloudbase-backend.zip；ZIP根必须直接包含四个运行文件，不能额外嵌套cloudbase/deepseek文件夹。
2. 保留HTTP函数类型、9000端口、现有/api/deepseek映射及DEEPSEEK_API_KEY绑定；本次不改RLS、用户库、账号鉴权、内存或并发配置，超时保持35秒。
3. 如果现有HTTP路由支持版本/别名，先在未承接生产流量的目标验证，确认后再切流；否则在维护窗口更新后立即执行下面的只读检查和少量真实练习，失败按回滚操作处理。不要假设修改LATEST不会影响现网。
4. 更新后记录**实际上传ZIP的SHA-256**、生效版本/别名、时间和平台调用ID；health手工版本字段不能替代后端包证据。若控制台重新打包导致ZIP不同，至少逐文件核对实际生效内容hash和构建来源。
5. CORS保持允许实际站点Origin、POST和Content-Type；SDK认证域名继续使用原配置。新预览域名未必已被放行，不能把curl成功代替浏览器CORS验证。

发布只更新函数代码和配套静态资源，不执行数据库迁移，也不自动开通收费日志。

## 4. 发布后的只读检查

在正式仓库目录，由你显式执行：

```sh
node tools/reliability-live-check.mjs --live \
  --api-url https://calcdaily-d5g2titwue91551fb-1482769901.ap-shanghai.app.tcloudbase.com/api/deepseek \
  --site-url https://calcdaily-calcdaily-d5g2titwue91551fb.webapps.tcloudbase.com/ \
  --manifest docs/AI-RELIABILITY-DEPLOYMENT-MANIFEST.json \
  --out verification/live-preflight.json
```

此脚本只GET health、静态文件和OPTIONS预检，不调用模型、不部署、不传账号凭证。检查新delivery_contract、30秒预算、strict-tier-b、CORS和静态hash；不会假称已验证后端包hash、真实余额/模型可用性或冷启动。

随后用独立验收账号/游客实际做少量首题和连续10题，覆盖三个模块、常用指定topic、L4/L8/L12、判题与下一题；再验证真实登录、退出、保留历史、跨设备同步及错题复习。不得使用真实账号“清空学习数据”来做验收。对故障机制使用隔离测试浏览器的请求拦截，标为injected，不混入自然失败率。

冷启动/长尾门槛：在生产等价环境观察从函数入口到响应<=30秒，平台35秒之前没有强杀/缺失业务响应；同时记录冷启动和网关时间。若5秒余量被持续吃尽，停止放量，先确定入口之外耗时；不靠提高执行上限掩盖问题。

## 5. 本地采集与七项指标

在独立验收浏览器、开始练习前，把tools/live-session-collector.js粘贴到控制台执行。它只在当前页面本地观察AI请求、诊断事件和DOM展示，等待MathJax完成及绘制帧后记录首题可作答时间；不采集Cookie、Authorization、密码、邮箱或账号ID，不上传数据、不清空/回写学习缓存。

完成一小批后：

```js
await CalcDailyAcceptance.download();
// 受控故障注入批次必须改用：
await CalcDailyAcceptance.download({source:'injected'});
// 需要停止时：
CalcDailyAcceptance.stop();
```

页面刷新/关闭会结束当前采集，需先导出；长会话及时分批，数据截断时指标脚本拒绝计算。若安装前预取已经成功，会明确产生缺失分母，成功预取利用率输出null，不把它算成100%。

离线计算自然流量：

```sh
node tools/reliability-metrics.mjs --events /ABSOLUTE/PATH/calcdaily-acceptance.json \
  --review /ABSOLUTE/PATH/independent-review.json --out verification/live-metrics.json
```

独立数学复核文件格式：

```json
{"method":"independent","rows":[{"question_id":"真实已展示AI题ID","verdict":"correct"}]}
```

verdict取correct/incorrect/uncertain；由独立人工推导或独立符号复核填写，不能把原生成模型自评/同一引擎再次运行当独立复核。无复核文件时正确率为null；任一incorrect进入release_blockers。数学题面可从本地导出questions关联，未展示预取不能进入已展示题的正确率分母。

| 指标 | 计算与限制 |
|---|---|
| 真实网络失败率 | generate真实HTTP尝试中的浏览器传输TypeError/断流 ÷ 尝试数；浏览器超时、上游网络失败另列。422/424有响应不等于连接失败 |
| 数学拒稿率 | 按request_id合并后的最终quality拒稿 ÷ 逻辑生成请求；身份缺失/请求未完成时为null。逐候选拒稿率需服务端日志，不由HTTP比例猜测 |
| 用户备用题比例 | 实际可见且可作答的唯一session+sequence中fallback数 ÷ 所有已展示槽位；完全无题/被取消启动另报 |
| 成功预取利用率 | 实际展示的预取AI题唯一请求数 ÷ 后台成功question_ready唯一请求数；分母缺失输出null，不能把“消耗缓存”直接当展示 |
| 首题等待/P95 | 点击开始→公式渲染和输入可用，包含预取等待/恢复；nearest-rank P95。无题启动不删掉：all-session P95留null，并另报已展示样本P95和无题次数 |
| 重复备用题比例 | 同模块窗口20内重复bank_id ÷ 实际备用展示数；同时报相邻重复，bankId缺失输出null |
| 独立数学正确率 | 独立复核正确的已展示AI题 ÷ 所有被抽中复核的已展示AI题；uncertain不算正确，明确错题阻断发布 |

至少100个自然首题会话后再初步判断P95；匹配模块/等级/topic/历史/网络条件与基线。独立API采样、注入实验、自然浏览器样本分开。HTTP200比例不能替代用户实际AI交付率。供应商调用/计费需平台调用ID、请求ID、候选及上游日志对齐；无完整日志时保持未知，不由客户端次数推算账单。

## 6. 生产回滚

触发：明确错误数学题放行；账号/云同步异常；旧请求覆盖已展示题；平台35秒强杀/30秒受控响应明显失效；备用/无题比例、P95或调用成本明显恶化。

1. 停止放量/新练习，保留正在进行的学习状态和原始事件，不清空浏览器数据，不撤销/重算用户IRT记录。
2. 优先把deepseek路由/版本恢复到**发布前实存并验证的生产版本**；没有版本路由时恢复发布前下载的实际生产函数包和原配置。不要直接把开发rollback-dev包称为生产恢复点。
3. 可先保留新前端，因为新前端兼容旧质量500并阻止自动重提。若前端自身有回归，再恢复配套的旧生产app.js+math-quality.js或原完整站点版本，并刷新缓存。保持认证/同步配置和用户库不变。
4. 重新核对静态文件、函数包/版本/路由hash和health，再做三个模块的小样本练习及真实账号同步检查。回滚后仍未通过则维持暂停放量，不盲目切回有已知数学错题问题的旧版。
5. 保留失败版本ZIP、hash、时间、请求/平台调用ID和账单线索用于定位；记录哪一项指标恢复。没有数据库迁移，因此无需数据库结构回滚；不要整库回灌覆盖用户新学习记录。

本次没有执行上述发布、切流、日志开通、回滚或线上验收命令。
