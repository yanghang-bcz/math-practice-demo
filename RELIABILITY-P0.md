# CalcDaily AI 数学可靠性 P0 修复

本地修改，不自动 commit、push 或部署。保留现有 UI、自适应公式、Auth、CloudBase 配置及同步流程。

## 行为与文件

- `math-quality.js`：前后端共用确定性规则。使用 BigInt 有理数精确比较数值、分数、小数、科学计数法和百分数；区分不存在、正无穷、负无穷。中文“无穷/发散”含糊时交给三态判题，不默认等同正无穷或不存在。简单解析矛盾、无效答案和已声明坏题先拦截。
- `api/deepseek.js`：保留 Vercel 接口；生成 draft → 本地校验 → 独立 DeepSeek reviewer → 审核通过后返回。最多两次生成尝试（一次重试），失败返回错误，由前端走原备用题。reviewer 在独立请求中求解并返回六个布尔字段、confidence、issues、independent_answer、reason。六项必须全真、无 issues、confidence ≥ 0.9、独立答案无确定性矛盾。难度 evaluate 与质量审核职责分开。
- `cloudbase/deepseek/index.js`、`math-quality.js`、`package.json`：当前 HTTP function 的完整部署目录，入口基于本机 Downloads/deepseek/index.js，保留原路由、OPTIONS、端口与请求解析。数学逻辑与 Vercel 同步；未连接线上确认实际正在运行的源码。
- `app.js`：生成返回值和每次显示前检查 verification 及题目内容快照；旧缓存和预取草稿不能显示。数值明确不等时不请求 AI。AI 必须给 equivalent / not_equivalent 且 trusted 才写学习数据；uncertain、异常、未审核题作废，显示指定文案和“重新生成 / 继续”，不写 history、session results、ability、topic mastery、review queue 或练习统计。保留已验证内容相同的原 fallback bank。后台难度评估不能恢复已作废题目。添加请求超时及元数据。
- `storage.js`：仅在原有 question_json 中保留追踪元数据和解析，无数据库表结构变更。
- `index.html`：先加载 math-quality.js；加入顶部/底部 safe-area 和横屏边缘适配。
- `tests/reliability.cjs`：数学可靠性回归。
- `tests/cloudbase-regression.cjs`：基于既有迁移测试调整的游客、账号隔离、同步与并发回归。旧注册流程测试不适用于当前认证实现，未作为本次通过项目。

## 问题反馈

答题反馈下可点击“反馈题目问题”；异常作废时也自动记录。记录包含 question_id、题目、canonical_answer、solution、user_answer、judge_result、verification_result。保存在本机 `calcDaily.questionIssues.v1`（最多 100 条），并发出 `calcdaily:question-issue` 浏览器事件供后续接入收集服务。当前不会自动发送反馈到云端。后端被拒绝的草稿及审核结果写 HTTP function 日志。

元数据包括 question_id、model、generator_prompt_version、review_prompt_version、verification。verification 内容快照用于发现旧缓存和意外内容改写，不是密码学签名或反作弊机制。

## GitHub Desktop 提交清单

只勾选：

- app.js
- math-quality.js
- storage.js
- index.html
- api/deepseek.js
- cloudbase/deepseek/index.js
- cloudbase/deepseek/math-quality.js
- cloudbase/deepseek/package.json
- tests/reliability.cjs
- tests/cloudbase-regression.cjs
- RELIABILITY-P0.md

建议 commit 标题：`Fix AI question quality gate and trusted grading`

不要顺带提交原有 `.DS_Store`、`node_modules/**/.DS_Store`、`math-practice-demo.code-workspace`。

## 部署顺序

1. **先部署 CloudBase 的 deepseek HTTP function**：上传 `cloudbase/deepseek/` 目录的三个文件，启动命令 `npm start`，使用支持 fetch/AbortSignal.timeout 的 Node 18+。保留现有 DEEPSEEK_API_KEY、路由 `/api/deepseek`、端口和跨域配置。保持原模型 deepseek-v4-flash。单次上游请求 45 秒，生成最多四次串行请求，函数/网关超时应覆盖约 180 秒；若平台提前超时，前端会安全进入备用题，需要在真实环境验证延迟及配额。
2. **再部署静态托管**：更新根目录 `app.js`、`math-quality.js`、`storage.js`、`index.html`，其余原静态资源继续保留。不要只上传 app.js，必须包含新规则脚本。强制刷新浏览器。先发前端、后发后端会导致旧后端返回题被拦截，暂时全部使用 fallback。
3. 如果仍使用 Vercel 后端，也部署 `api/deepseek.js` 和根目录 `math-quality.js`。当前前端连接 CloudBase HTTP URL，所以只更新 Vercel API 不会修复线上实际出题接口。
4. Auth、cloudbase-client.js、数据库、同步 function 无需重新配置或迁移。本次没有部署网站或云函数。

## 验证

执行：

```
node --test tests/reliability.cjs
node tests/cloudbase-regression.cjs
node --check app.js
node --check storage.js
node --check math-quality.js
node --check api/deepseek.js
node --check cloudbase/deepseek/index.js
git diff --check
```

已通过 28 项数学可靠性回归 + 9 项 CloudBase 模拟回归，并通过 JS 语法和差异空白检查。覆盖坏题直出、答案解析矛盾、1/2 与 0 不等却被 AI 接受、独立审核失败/重试、缓存坏题、三态判题、作废不写学习数据、大数精度及同步隔离等。

测试使用模拟模型和数据库，没有消耗真实 DeepSeek 调用，没有进行真实注册、云同步、线上部署或 iPhone 真机验收。上线后请检查游客/登录、诊断/日常/复习、预取、断网恢复、账号切换、iPhone 刘海屏及横屏。AI reviewer 仍可能和生成器犯相同错误；confidence 是门槛，不是正确率保证。尚未接入符号计算器，复杂符号等价仍依赖 AI，不确定时作废。
