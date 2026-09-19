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
5. **判题先本地后远端**：`MathQuality.compare` 能定的结论绝不消耗 AI 调用。

## 数学验证引擎的坑（踩过的，别再犯）
- **`\frac` 的分子分母可以嵌套花括号**，`[^{}]*` 抓不住。要花括号平衡匹配 + 递归。
- **`\cos^2 x` 是 `(cos x)^2`**，不是 `cos(x^2)`，也不是把 token `cos` 平方。
- **`\sqrt{...}` 必须保留括号**。丢掉会变成 `sqrt 1+x^2` = `sqrt(1)+x^2`，静默算错。
- **数值采样不能取极小步长**。`e^x-1-x-x^2/2` 在 x=1e-6 因双精度相减抵消算出 -37.8。
  步长固定 1e-2~1e-4；极限用粗/细两套步长交叉核对，不一致就不下结论。
- **精确比较要覆盖指数写法**。`isExactForm` 只排除带小数点的字面量；
  `0` vs `1e-15`、`0` vs `1e-400` 必须判不等价。
- **`confidence` 必须 `typeof === 'number'`**，不能用 `Number()` 强转，否则 `'0.99'` 字符串能混过闸门。

## 测试
- `npm test` 跑 `tests/*.cjs`。Node 22 下 `node --test tests/` 不认目录，要用 `tests/*.cjs`。
- 分四类：`math-engine`（引擎）、`fallback-bank`（题库自检）、`wiring`（接线契约）、
  `reliability`（端到端回归 + 真实事故复现）。
- `wiring.cjs` 专门防「改完模块忘了改加载顺序 / 又塞回内联副本」这类只在运行时暴露的问题。
- `reliability.cjs` 的 `appHarness()` 用 `vm` 切片抽真实函数。注意：切片会连带
  `const FALLBACK_BANK = ...` 适配层，而 vm 里顶层 `const` 会遮蔽沙箱全局 →
  必须把 `FallbackBank` 模块本身喂进沙箱。

## 工作方式
- 改完必须先跑 `npm test`，再用真实浏览器验证。**只看代码会漏掉整类问题**——
  本轮最重要的 bug（网络故障被报成题目有问题）就是拦截接口后在浏览器里复现出来的。
- 项目没有 sudo/Homebrew 权限限制问题，但也没有构建步骤，直接改文件即可。
