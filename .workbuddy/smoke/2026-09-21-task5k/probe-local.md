# Judge 专项压力测试 · 本地判定版（Task #4 · D → Task #5A）

- 题源：`.workbuddy/smoke/2026-09-20T07-32-37-online-200-r1/questions.jsonl`
- 题目数：24（可用 24）
- 错答探针定义 11 条 / 合法古怪探针定义 6 条
- 生成的探针：错答 240 条、合法 103 条，跳过 65 条

## 核心验收

| 指标 | 值 |
| --- | --- |
| **错答被放行（wrong_answer_accepted，须为 0）** | **0** |
| 错答被拒 | 192 |
| 错答落到模型（引擎判不了） | 48 |
| **合法写法被误拒（真实误杀）** | **0** |
| 合法写法被拒，但原因是该题标准答案本身就错 | 0 |
| 合法写法落到模型 | 0 |
| 确定性覆盖率 · 错答探针 | 80.0%（标量 84 + 结构 108） |
| 确定性覆盖率 · 合法探针 | 100.0%（标量 47 + 结构 56） |

## 确定性覆盖率：增益拆解（三列都是当场算出来的）

列名写的是**这一列实际用了什么判定能力**，不是时间点 —— 这样不会有歧义：

- **只标量**：`git show HEAD:math-quality.js` 载入的旧引擎，判题只调 `compare()`；
- **＋结构层**：上面的旧 `compare()` 兜底，接当前这版结构检查（标量判不了才走它）；
- **＋常量/发散/中心**：当前完整引擎（标量层支持纯常量表达式，结构层多了发散检测与中心平均）。

所以「＋结构层 → ＋常量/发散/中心」之间那一跳，就是 Task #5A 单独贡献的部分。

| 指标 | 只标量 | ＋结构层 | ＋常量/发散/中心 |
| --- | --- | --- | --- |
| 错答探针由确定性引擎判死 | 35.0%（84/240） | 80.0%（192/240） | 80.0%（192/240） |
| 错答探针落到模型 | 156/240 | 48/240 | 48/240 |
| 合法探针由确定性引擎判死 | 45.6%（47/103） | 100.0%（103/103） | 100.0%（103/103） |
| 错答被放行 | 取决于模型（实测线上 6/40 误批） | 0（结构上不可能） | 0（结构上不可能） |

## 结论

- ✅ 没有任何一条错答探针被判成 `correct: true`。
- 这不是抽样运气：`correct:true` 只有一条来路 —— 确定性引擎判 `equivalent`。
  模型那条路按 Task #4 的规则只采信 `not_equivalent`，产不出 `correct:true`。
  所以「错答放行 = 0」是结构性保证，前提只是「线上跑的是这一版代码」。

- ⚠️ 还有 48 条错答引擎判不了、会去问模型。
  模型最多只能把它们判「错」，不会放行；但会多消耗一次模型调用，且判不出来时用户会看到「暂时无法可靠判断」。

## 仍未被引擎判死的错答（会落到模型）

| 题 | 模块 | 参考答案 | 探针 | 提交的答案 | 本地结论 |
| --- | --- | --- | --- | --- | --- |
| limit-L4-1 | limit | `\frac{1}{3}` | plain_refusal | `我不会做` | uncertain |
| limit-L4-1 | limit | `\frac{1}{3}` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| limit-L4-3 | limit | `e^{-1/3}` | plain_refusal | `我不会做` | uncertain |
| limit-L4-3 | limit | `e^{-1/3}` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| limit-L10-2 | limit | `-\frac{e}{2}` | plain_refusal | `我不会做` | uncertain |
| limit-L10-2 | limit | `-\frac{e}{2}` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| limit-L12-1 | limit | `1/2` | plain_refusal | `我不会做` | uncertain |
| limit-L12-1 | limit | `1/2` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| derivative-L4-2 | derivative | `\frac{2(1-x^2)}{(1+x^2)^2}` | plain_refusal | `我不会做` | uncertain |
| derivative-L4-2 | derivative | `\frac{2(1-x^2)}{(1+x^2)^2}` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| derivative-L6-3 | derivative | `\frac{1}{x(1+x^2)}` | plain_refusal | `我不会做` | uncertain |
| derivative-L6-3 | derivative | `\frac{1}{x(1+x^2)}` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| derivative-L8-2 | derivative | `\left(\frac{x}{x+1}\right)^x\left(\ln\frac{x}{x+1}+\frac{1}{x+1}\right)` | plain_refusal | `我不会做` | uncertain |
| derivative-L8-2 | derivative | `\left(\frac{x}{x+1}\right)^x\left(\ln\frac{x}{x+1}+\frac{1}{x+1}\right)` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| derivative-L10-1 | derivative | `\frac{\sqrt{x^2+1}\,\sin x}{e^x\cos x}\left(\frac{x}{x^2+1}+\cot x-1+\tan x\right)` | plain_refusal | `我不会做` | uncertain |
| derivative-L10-1 | derivative | `\frac{\sqrt{x^2+1}\,\sin x}{e^x\cos x}\left(\frac{x}{x^2+1}+\cot x-1+\tan x\right)` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| derivative-L10-4 | derivative | `\frac{2x}{(x^2+1)^2}` | plain_refusal | `我不会做` | uncertain |
| derivative-L10-4 | derivative | `\frac{2x}{(x^2+1)^2}` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| integral-L4-1 | integral | `\ln\left|1+\tan\frac{x}{2}\right|+C` | plain_refusal | `我不会做` | uncertain |
| integral-L4-1 | integral | `\ln\left|1+\tan\frac{x}{2}\right|+C` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| integral-L4-2 | integral | `\frac{1}{2}\ln(x^2+2x+5)+\frac{1}{2}\arctan\frac{x+1}{2}+C` | plain_refusal | `我不会做` | uncertain |
| integral-L4-2 | integral | `\frac{1}{2}\ln(x^2+2x+5)+\frac{1}{2}\arctan\frac{x+1}{2}+C` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| integral-L6-2 | integral | `\frac{\pi}{4}` | plain_refusal | `我不会做` | uncertain |
| integral-L6-2 | integral | `\frac{\pi}{4}` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| integral-L6-3 | integral | `\frac{1}{2}x^2e^{2x}-\frac{1}{2}xe^{2x}+\frac{1}{4}e^{2x}+C` | plain_refusal | `我不会做` | uncertain |
| integral-L6-3 | integral | `\frac{1}{2}x^2e^{2x}-\frac{1}{2}xe^{2x}+\frac{1}{4}e^{2x}+C` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| integral-L8-1 | integral | `\frac{\pi}{8}\ln 2` | plain_refusal | `我不会做` | uncertain |
| integral-L8-1 | integral | `\frac{\pi}{8}\ln 2` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| integral-L8-3 | integral | `-\ln\left|\frac{1+\sqrt{x^2+x+1}}{x}+\frac12\right|+C` | plain_refusal | `我不会做` | uncertain |
| integral-L8-3 | integral | `-\ln\left|\frac{1+\sqrt{x^2+x+1}}{x}+\frac12\right|+C` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| integral-L8-4 | integral | `\frac{2}{\sqrt{3}}\arctan\left(\frac{2\tan\frac{x}{2}+1}{\sqrt{3}}\right)+C` | plain_refusal | `我不会做` | uncertain |
| integral-L8-4 | integral | `\frac{2}{\sqrt{3}}\arctan\left(\frac{2\tan\frac{x}{2}+1}{\sqrt{3}}\right)+C` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| integral-L10-3 | integral | `\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C` | plain_refusal | `我不会做` | uncertain |
| integral-L10-3 | integral | `\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| integral-L10-4 | integral | `\arctan x+\frac{1}{3}\arctan(x^3)+C` | plain_refusal | `我不会做` | uncertain |
| integral-L10-4 | integral | `\arctan x+\frac{1}{3}\arctan(x^3)+C` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |

## 被跳过的探针（不适用）

- no_form：41 条
- not_applicable：24 条

## 逐条明细

| 题 | 模块 | L | 探针 | 类型 | 提交的答案 | verdict | correct | 判定层 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| limit-L4-1 | limit | L4 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| limit-L4-1 | limit | L4 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| limit-L4-1 | limit | L4 | far_number | wrong | `999999` | not_equivalent | false | scalar |
| limit-L4-1 | limit | L4 | double_wrapped | wrong | `2\left(\frac{1}{3}\right)` | not_equivalent | false | scalar |
| limit-L4-1 | limit | L4 | sign_flip | wrong | `-\left(\frac{1}{3}\right)` | not_equivalent | false | scalar |
| limit-L4-1 | limit | L4 | double_paren | wrong | `2(\frac{1}{3})` | not_equivalent | false | scalar |
| limit-L4-1 | limit | L4 | double_cdot | wrong | `2\cdot\left(\frac{1}{3}\right)` | not_equivalent | false | scalar |
| limit-L4-1 | limit | L4 | double_times | wrong | `2\times\left(\frac{1}{3}\right)` | not_equivalent | false | scalar |
| limit-L4-1 | limit | L4 | half_shorthand | wrong | `\frac12\left(\frac{1}{3}\right)` | not_equivalent | false | scalar |
| limit-L4-1 | limit | L4 | plus_one | wrong | `\left(\frac{1}{3}\right)+1` | not_equivalent | false | scalar |
| limit-L4-1 | limit | L4 | minus_one | wrong | `\left(\frac{1}{3}\right)-1` | not_equivalent | false | scalar |
| limit-L4-1 | limit | L4 | paren_wrap | valid | `\left(\frac{1}{3}\right)` | equivalent | true | scalar |
| limit-L4-1 | limit | L4 | double_negation | valid | `-\left(-\left(\frac{1}{3}\right)\right)` | equivalent | true | scalar |
| limit-L4-1 | limit | L4 | times_one | valid | `1\cdot\left(\frac{1}{3}\right)` | equivalent | true | scalar |
| limit-L4-1 | limit | L4 | wrapped_twice | valid | `\frac12\left(2\left(\frac{1}{3}\right)\right)` | equivalent | true | scalar |
| limit-L4-1 | limit | L4 | equivalent_fraction | valid | `\frac{2}{6}` | equivalent | true | scalar |
| limit-L4-1 | limit | L4 | decimal_approx | valid | `0.3333333333` | equivalent | true | scalar |
| limit-L4-3 | limit | L4 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| limit-L4-3 | limit | L4 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| limit-L4-3 | limit | L4 | far_number | wrong | `999999` | not_equivalent | false | scalar |
| limit-L4-3 | limit | L4 | double_wrapped | wrong | `2\left(e^{-1/3}\right)` | not_equivalent | false | scalar |
| limit-L4-3 | limit | L4 | sign_flip | wrong | `-\left(e^{-1/3}\right)` | not_equivalent | false | scalar |
| limit-L4-3 | limit | L4 | double_paren | wrong | `2(e^{-1/3})` | not_equivalent | false | scalar |
| limit-L4-3 | limit | L4 | double_cdot | wrong | `2\cdot\left(e^{-1/3}\right)` | not_equivalent | false | scalar |
| limit-L4-3 | limit | L4 | double_times | wrong | `2\times\left(e^{-1/3}\right)` | not_equivalent | false | scalar |
| limit-L4-3 | limit | L4 | half_shorthand | wrong | `\frac12\left(e^{-1/3}\right)` | not_equivalent | false | scalar |
| limit-L4-3 | limit | L4 | plus_one | wrong | `\left(e^{-1/3}\right)+1` | not_equivalent | false | scalar |
| limit-L4-3 | limit | L4 | minus_one | wrong | `\left(e^{-1/3}\right)-1` | not_equivalent | false | scalar |
| limit-L4-3 | limit | L4 | paren_wrap | valid | `\left(e^{-1/3}\right)` | equivalent | true | scalar |
| limit-L4-3 | limit | L4 | double_negation | valid | `-\left(-\left(e^{-1/3}\right)\right)` | equivalent | true | scalar |
| limit-L4-3 | limit | L4 | times_one | valid | `1\cdot\left(e^{-1/3}\right)` | equivalent | true | scalar |
| limit-L4-3 | limit | L4 | wrapped_twice | valid | `\frac12\left(2\left(e^{-1/3}\right)\right)` | equivalent | true | scalar |
| limit-L4-3 | limit | L4 | equivalent_fraction | valid | — | skip | — | — |
| limit-L4-3 | limit | L4 | decimal_approx | valid | — | skip | — | — |
| limit-L6-3 | limit | L6 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| limit-L6-3 | limit | L6 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| limit-L6-3 | limit | L6 | far_number | wrong | `999999` | not_equivalent | false | scalar |
| limit-L6-3 | limit | L6 | double_wrapped | wrong | `2\left(\frac{1}{3}\right)` | not_equivalent | false | scalar |
| limit-L6-3 | limit | L6 | sign_flip | wrong | `-\left(\frac{1}{3}\right)` | not_equivalent | false | scalar |
| limit-L6-3 | limit | L6 | double_paren | wrong | `2(\frac{1}{3})` | not_equivalent | false | scalar |
| limit-L6-3 | limit | L6 | double_cdot | wrong | `2\cdot\left(\frac{1}{3}\right)` | not_equivalent | false | scalar |
| limit-L6-3 | limit | L6 | double_times | wrong | `2\times\left(\frac{1}{3}\right)` | not_equivalent | false | scalar |
| limit-L6-3 | limit | L6 | half_shorthand | wrong | `\frac12\left(\frac{1}{3}\right)` | not_equivalent | false | scalar |
| limit-L6-3 | limit | L6 | plus_one | wrong | `\left(\frac{1}{3}\right)+1` | not_equivalent | false | scalar |
| limit-L6-3 | limit | L6 | minus_one | wrong | `\left(\frac{1}{3}\right)-1` | not_equivalent | false | scalar |
| limit-L6-3 | limit | L6 | paren_wrap | valid | `\left(\frac{1}{3}\right)` | equivalent | true | scalar |
| limit-L6-3 | limit | L6 | double_negation | valid | `-\left(-\left(\frac{1}{3}\right)\right)` | equivalent | true | scalar |
| limit-L6-3 | limit | L6 | times_one | valid | `1\cdot\left(\frac{1}{3}\right)` | equivalent | true | scalar |
| limit-L6-3 | limit | L6 | wrapped_twice | valid | `\frac12\left(2\left(\frac{1}{3}\right)\right)` | equivalent | true | scalar |
| limit-L6-3 | limit | L6 | equivalent_fraction | valid | `\frac{2}{6}` | equivalent | true | scalar |
| limit-L6-3 | limit | L6 | decimal_approx | valid | `0.3333333333` | equivalent | true | scalar |
| limit-L8-2 | limit | L8 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| limit-L8-2 | limit | L8 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| limit-L8-2 | limit | L8 | far_number | wrong | `999999` | not_equivalent | false | scalar |
| limit-L8-2 | limit | L8 | double_wrapped | wrong | `2\left(\frac{1}{3}\right)` | not_equivalent | false | scalar |
| limit-L8-2 | limit | L8 | sign_flip | wrong | `-\left(\frac{1}{3}\right)` | not_equivalent | false | scalar |
| limit-L8-2 | limit | L8 | double_paren | wrong | `2(\frac{1}{3})` | not_equivalent | false | scalar |
| limit-L8-2 | limit | L8 | double_cdot | wrong | `2\cdot\left(\frac{1}{3}\right)` | not_equivalent | false | scalar |
| limit-L8-2 | limit | L8 | double_times | wrong | `2\times\left(\frac{1}{3}\right)` | not_equivalent | false | scalar |
| limit-L8-2 | limit | L8 | half_shorthand | wrong | `\frac12\left(\frac{1}{3}\right)` | not_equivalent | false | scalar |
| limit-L8-2 | limit | L8 | plus_one | wrong | `\left(\frac{1}{3}\right)+1` | not_equivalent | false | scalar |
| limit-L8-2 | limit | L8 | minus_one | wrong | `\left(\frac{1}{3}\right)-1` | not_equivalent | false | scalar |
| limit-L8-2 | limit | L8 | paren_wrap | valid | `\left(\frac{1}{3}\right)` | equivalent | true | scalar |
| limit-L8-2 | limit | L8 | double_negation | valid | `-\left(-\left(\frac{1}{3}\right)\right)` | equivalent | true | scalar |
| limit-L8-2 | limit | L8 | times_one | valid | `1\cdot\left(\frac{1}{3}\right)` | equivalent | true | scalar |
| limit-L8-2 | limit | L8 | wrapped_twice | valid | `\frac12\left(2\left(\frac{1}{3}\right)\right)` | equivalent | true | scalar |
| limit-L8-2 | limit | L8 | equivalent_fraction | valid | `\frac{2}{6}` | equivalent | true | scalar |
| limit-L8-2 | limit | L8 | decimal_approx | valid | `0.3333333333` | equivalent | true | scalar |
| limit-L10-1 | limit | L10 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| limit-L10-1 | limit | L10 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| limit-L10-1 | limit | L10 | far_number | wrong | `999999` | not_equivalent | false | scalar |
| limit-L10-1 | limit | L10 | double_wrapped | wrong | `2\left(e^{-1/3}\right)` | not_equivalent | false | scalar |
| limit-L10-1 | limit | L10 | sign_flip | wrong | `-\left(e^{-1/3}\right)` | not_equivalent | false | scalar |
| limit-L10-1 | limit | L10 | double_paren | wrong | `2(e^{-1/3})` | not_equivalent | false | scalar |
| limit-L10-1 | limit | L10 | double_cdot | wrong | `2\cdot\left(e^{-1/3}\right)` | not_equivalent | false | scalar |
| limit-L10-1 | limit | L10 | double_times | wrong | `2\times\left(e^{-1/3}\right)` | not_equivalent | false | scalar |
| limit-L10-1 | limit | L10 | half_shorthand | wrong | `\frac12\left(e^{-1/3}\right)` | not_equivalent | false | scalar |
| limit-L10-1 | limit | L10 | plus_one | wrong | `\left(e^{-1/3}\right)+1` | not_equivalent | false | scalar |
| limit-L10-1 | limit | L10 | minus_one | wrong | `\left(e^{-1/3}\right)-1` | not_equivalent | false | scalar |
| limit-L10-1 | limit | L10 | paren_wrap | valid | `\left(e^{-1/3}\right)` | equivalent | true | scalar |
| limit-L10-1 | limit | L10 | double_negation | valid | `-\left(-\left(e^{-1/3}\right)\right)` | equivalent | true | scalar |
| limit-L10-1 | limit | L10 | times_one | valid | `1\cdot\left(e^{-1/3}\right)` | equivalent | true | scalar |
| limit-L10-1 | limit | L10 | wrapped_twice | valid | `\frac12\left(2\left(e^{-1/3}\right)\right)` | equivalent | true | scalar |
| limit-L10-1 | limit | L10 | equivalent_fraction | valid | — | skip | — | — |
| limit-L10-1 | limit | L10 | decimal_approx | valid | — | skip | — | — |
| limit-L10-2 | limit | L10 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| limit-L10-2 | limit | L10 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| limit-L10-2 | limit | L10 | far_number | wrong | `999999` | not_equivalent | false | scalar |
| limit-L10-2 | limit | L10 | double_wrapped | wrong | `2\left(-\frac{e}{2}\right)` | not_equivalent | false | scalar |
| limit-L10-2 | limit | L10 | sign_flip | wrong | `-\left(-\frac{e}{2}\right)` | not_equivalent | false | scalar |
| limit-L10-2 | limit | L10 | double_paren | wrong | `2(-\frac{e}{2})` | not_equivalent | false | scalar |
| limit-L10-2 | limit | L10 | double_cdot | wrong | `2\cdot\left(-\frac{e}{2}\right)` | not_equivalent | false | scalar |
| limit-L10-2 | limit | L10 | double_times | wrong | `2\times\left(-\frac{e}{2}\right)` | not_equivalent | false | scalar |
| limit-L10-2 | limit | L10 | half_shorthand | wrong | `\frac12\left(-\frac{e}{2}\right)` | not_equivalent | false | scalar |
| limit-L10-2 | limit | L10 | plus_one | wrong | `\left(-\frac{e}{2}\right)+1` | not_equivalent | false | scalar |
| limit-L10-2 | limit | L10 | minus_one | wrong | `\left(-\frac{e}{2}\right)-1` | not_equivalent | false | scalar |
| limit-L10-2 | limit | L10 | paren_wrap | valid | `\left(-\frac{e}{2}\right)` | equivalent | true | scalar |
| limit-L10-2 | limit | L10 | double_negation | valid | `-\left(-\left(-\frac{e}{2}\right)\right)` | equivalent | true | scalar |
| limit-L10-2 | limit | L10 | times_one | valid | `1\cdot\left(-\frac{e}{2}\right)` | equivalent | true | scalar |
| limit-L10-2 | limit | L10 | wrapped_twice | valid | `\frac12\left(2\left(-\frac{e}{2}\right)\right)` | equivalent | true | scalar |
| limit-L10-2 | limit | L10 | equivalent_fraction | valid | — | skip | — | — |
| limit-L10-2 | limit | L10 | decimal_approx | valid | — | skip | — | — |
| limit-L12-1 | limit | L12 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| limit-L12-1 | limit | L12 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| limit-L12-1 | limit | L12 | far_number | wrong | `999999` | not_equivalent | false | scalar |
| limit-L12-1 | limit | L12 | double_wrapped | wrong | `2\left(1/2\right)` | not_equivalent | false | scalar |
| limit-L12-1 | limit | L12 | sign_flip | wrong | `-\left(1/2\right)` | not_equivalent | false | scalar |
| limit-L12-1 | limit | L12 | double_paren | wrong | `2(1/2)` | not_equivalent | false | scalar |
| limit-L12-1 | limit | L12 | double_cdot | wrong | `2\cdot\left(1/2\right)` | not_equivalent | false | scalar |
| limit-L12-1 | limit | L12 | double_times | wrong | `2\times\left(1/2\right)` | not_equivalent | false | scalar |
| limit-L12-1 | limit | L12 | half_shorthand | wrong | `\frac12\left(1/2\right)` | not_equivalent | false | scalar |
| limit-L12-1 | limit | L12 | plus_one | wrong | `\left(1/2\right)+1` | not_equivalent | false | scalar |
| limit-L12-1 | limit | L12 | minus_one | wrong | `\left(1/2\right)-1` | not_equivalent | false | scalar |
| limit-L12-1 | limit | L12 | paren_wrap | valid | `\left(1/2\right)` | equivalent | true | scalar |
| limit-L12-1 | limit | L12 | double_negation | valid | `-\left(-\left(1/2\right)\right)` | equivalent | true | scalar |
| limit-L12-1 | limit | L12 | times_one | valid | `1\cdot\left(1/2\right)` | equivalent | true | scalar |
| limit-L12-1 | limit | L12 | wrapped_twice | valid | `\frac12\left(2\left(1/2\right)\right)` | equivalent | true | scalar |
| limit-L12-1 | limit | L12 | equivalent_fraction | valid | `(2)/(4)` | equivalent | true | scalar |
| limit-L12-1 | limit | L12 | decimal_approx | valid | — | skip | — | — |
| derivative-L4-2 | derivative | L4 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| derivative-L4-2 | derivative | L4 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| derivative-L4-2 | derivative | L4 | far_number | wrong | `999999` | not_equivalent | false | structural |
| derivative-L4-2 | derivative | L4 | double_wrapped | wrong | `2\left(\frac{2(1-x^2)}{(1+x^2)^2}\right)` | not_equivalent | false | structural |
| derivative-L4-2 | derivative | L4 | sign_flip | wrong | `-\left(\frac{2(1-x^2)}{(1+x^2)^2}\right)` | not_equivalent | false | structural |
| derivative-L4-2 | derivative | L4 | double_paren | wrong | `2(\frac{2(1-x^2)}{(1+x^2)^2})` | not_equivalent | false | structural |
| derivative-L4-2 | derivative | L4 | double_cdot | wrong | `2\cdot\left(\frac{2(1-x^2)}{(1+x^2)^2}\right)` | not_equivalent | false | structural |
| derivative-L4-2 | derivative | L4 | double_times | wrong | `2\times\left(\frac{2(1-x^2)}{(1+x^2)^2}\right)` | not_equivalent | false | structural |
| derivative-L4-2 | derivative | L4 | half_shorthand | wrong | `\frac12\left(\frac{2(1-x^2)}{(1+x^2)^2}\right)` | not_equivalent | false | structural |
| derivative-L4-2 | derivative | L4 | plus_one | wrong | `\left(\frac{2(1-x^2)}{(1+x^2)^2}\right)+1` | not_equivalent | false | structural |
| derivative-L4-2 | derivative | L4 | minus_one | wrong | `\left(\frac{2(1-x^2)}{(1+x^2)^2}\right)-1` | not_equivalent | false | structural |
| derivative-L4-2 | derivative | L4 | paren_wrap | valid | `\left(\frac{2(1-x^2)}{(1+x^2)^2}\right)` | equivalent | true | structural |
| derivative-L4-2 | derivative | L4 | double_negation | valid | `-\left(-\left(\frac{2(1-x^2)}{(1+x^2)^2}\right)\right)` | equivalent | true | structural |
| derivative-L4-2 | derivative | L4 | times_one | valid | `1\cdot\left(\frac{2(1-x^2)}{(1+x^2)^2}\right)` | equivalent | true | structural |
| derivative-L4-2 | derivative | L4 | wrapped_twice | valid | `\frac12\left(2\left(\frac{2(1-x^2)}{(1+x^2)^2}\right)\right)` | equivalent | true | structural |
| derivative-L4-2 | derivative | L4 | equivalent_fraction | valid | — | skip | — | — |
| derivative-L4-2 | derivative | L4 | decimal_approx | valid | — | skip | — | — |
| derivative-L6-3 | derivative | L6 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| derivative-L6-3 | derivative | L6 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| derivative-L6-3 | derivative | L6 | far_number | wrong | `999999` | not_equivalent | false | structural |
| derivative-L6-3 | derivative | L6 | double_wrapped | wrong | `2\left(\frac{1}{x(1+x^2)}\right)` | not_equivalent | false | structural |
| derivative-L6-3 | derivative | L6 | sign_flip | wrong | `-\left(\frac{1}{x(1+x^2)}\right)` | not_equivalent | false | structural |
| derivative-L6-3 | derivative | L6 | double_paren | wrong | `2(\frac{1}{x(1+x^2)})` | not_equivalent | false | structural |
| derivative-L6-3 | derivative | L6 | double_cdot | wrong | `2\cdot\left(\frac{1}{x(1+x^2)}\right)` | not_equivalent | false | structural |
| derivative-L6-3 | derivative | L6 | double_times | wrong | `2\times\left(\frac{1}{x(1+x^2)}\right)` | not_equivalent | false | structural |
| derivative-L6-3 | derivative | L6 | half_shorthand | wrong | `\frac12\left(\frac{1}{x(1+x^2)}\right)` | not_equivalent | false | structural |
| derivative-L6-3 | derivative | L6 | plus_one | wrong | `\left(\frac{1}{x(1+x^2)}\right)+1` | not_equivalent | false | structural |
| derivative-L6-3 | derivative | L6 | minus_one | wrong | `\left(\frac{1}{x(1+x^2)}\right)-1` | not_equivalent | false | structural |
| derivative-L6-3 | derivative | L6 | paren_wrap | valid | `\left(\frac{1}{x(1+x^2)}\right)` | equivalent | true | structural |
| derivative-L6-3 | derivative | L6 | double_negation | valid | `-\left(-\left(\frac{1}{x(1+x^2)}\right)\right)` | equivalent | true | structural |
| derivative-L6-3 | derivative | L6 | times_one | valid | `1\cdot\left(\frac{1}{x(1+x^2)}\right)` | equivalent | true | structural |
| derivative-L6-3 | derivative | L6 | wrapped_twice | valid | `\frac12\left(2\left(\frac{1}{x(1+x^2)}\right)\right)` | equivalent | true | structural |
| derivative-L6-3 | derivative | L6 | equivalent_fraction | valid | — | skip | — | — |
| derivative-L6-3 | derivative | L6 | decimal_approx | valid | — | skip | — | — |
| derivative-L8-2 | derivative | L8 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| derivative-L8-2 | derivative | L8 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| derivative-L8-2 | derivative | L8 | far_number | wrong | `999999` | not_equivalent | false | structural |
| derivative-L8-2 | derivative | L8 | double_wrapped | wrong | `2\left(\left(\frac{x}{x+1}\right)^x\left(\ln\frac{x}{x+1}+\frac{1}{x+1}\right)\right)` | not_equivalent | false | structural |
| derivative-L8-2 | derivative | L8 | sign_flip | wrong | `-\left(\left(\frac{x}{x+1}\right)^x\left(\ln\frac{x}{x+1}+\frac{1}{x+1}\right)\right)` | not_equivalent | false | structural |
| derivative-L8-2 | derivative | L8 | double_paren | wrong | `2(\left(\frac{x}{x+1}\right)^x\left(\ln\frac{x}{x+1}+\frac{1}{x+1}\right))` | not_equivalent | false | structural |
| derivative-L8-2 | derivative | L8 | double_cdot | wrong | `2\cdot\left(\left(\frac{x}{x+1}\right)^x\left(\ln\frac{x}{x+1}+\frac{1}{x+1}\right)\right)` | not_equivalent | false | structural |
| derivative-L8-2 | derivative | L8 | double_times | wrong | `2\times\left(\left(\frac{x}{x+1}\right)^x\left(\ln\frac{x}{x+1}+\frac{1}{x+1}\right)\right)` | not_equivalent | false | structural |
| derivative-L8-2 | derivative | L8 | half_shorthand | wrong | `\frac12\left(\left(\frac{x}{x+1}\right)^x\left(\ln\frac{x}{x+1}+\frac{1}{x+1}\right)\right)` | not_equivalent | false | structural |
| derivative-L8-2 | derivative | L8 | plus_one | wrong | `\left(\left(\frac{x}{x+1}\right)^x\left(\ln\frac{x}{x+1}+\frac{1}{x+1}\right)\right)+1` | not_equivalent | false | structural |
| derivative-L8-2 | derivative | L8 | minus_one | wrong | `\left(\left(\frac{x}{x+1}\right)^x\left(\ln\frac{x}{x+1}+\frac{1}{x+1}\right)\right)-1` | not_equivalent | false | structural |
| derivative-L8-2 | derivative | L8 | paren_wrap | valid | `\left(\left(\frac{x}{x+1}\right)^x\left(\ln\frac{x}{x+1}+\frac{1}{x+1}\right)\right)` | equivalent | true | structural |
| derivative-L8-2 | derivative | L8 | double_negation | valid | `-\left(-\left(\left(\frac{x}{x+1}\right)^x\left(\ln\frac{x}{x+1}+\frac{1}{x+1}\right)\right)\right)` | equivalent | true | structural |
| derivative-L8-2 | derivative | L8 | times_one | valid | `1\cdot\left(\left(\frac{x}{x+1}\right)^x\left(\ln\frac{x}{x+1}+\frac{1}{x+1}\right)\right)` | equivalent | true | structural |
| derivative-L8-2 | derivative | L8 | wrapped_twice | valid | `\frac12\left(2\left(\left(\frac{x}{x+1}\right)^x\left(\ln\frac{x}{x+1}+\frac{1}{x+1}\right)\right)\right)` | equivalent | true | structural |
| derivative-L8-2 | derivative | L8 | equivalent_fraction | valid | — | skip | — | — |
| derivative-L8-2 | derivative | L8 | decimal_approx | valid | — | skip | — | — |
| derivative-L10-1 | derivative | L10 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| derivative-L10-1 | derivative | L10 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| derivative-L10-1 | derivative | L10 | far_number | wrong | `999999` | not_equivalent | false | structural |
| derivative-L10-1 | derivative | L10 | double_wrapped | wrong | `2\left(\frac{\sqrt{x^2+1}\,\sin x}{e^x\cos x}\left(\frac{x}{x^2+1}+\cot x-1+\tan x\right)\right)` | not_equivalent | false | structural |
| derivative-L10-1 | derivative | L10 | sign_flip | wrong | `-\left(\frac{\sqrt{x^2+1}\,\sin x}{e^x\cos x}\left(\frac{x}{x^2+1}+\cot x-1+\tan x\right)\right)` | not_equivalent | false | structural |
| derivative-L10-1 | derivative | L10 | double_paren | wrong | `2(\frac{\sqrt{x^2+1}\,\sin x}{e^x\cos x}\left(\frac{x}{x^2+1}+\cot x-1+\tan x\right))` | not_equivalent | false | structural |
| derivative-L10-1 | derivative | L10 | double_cdot | wrong | `2\cdot\left(\frac{\sqrt{x^2+1}\,\sin x}{e^x\cos x}\left(\frac{x}{x^2+1}+\cot x-1+\tan x\right)\right)` | not_equivalent | false | structural |
| derivative-L10-1 | derivative | L10 | double_times | wrong | `2\times\left(\frac{\sqrt{x^2+1}\,\sin x}{e^x\cos x}\left(\frac{x}{x^2+1}+\cot x-1+\tan x\right)\right)` | not_equivalent | false | structural |
| derivative-L10-1 | derivative | L10 | half_shorthand | wrong | `\frac12\left(\frac{\sqrt{x^2+1}\,\sin x}{e^x\cos x}\left(\frac{x}{x^2+1}+\cot x-1+\tan x\right)\right)` | not_equivalent | false | structural |
| derivative-L10-1 | derivative | L10 | plus_one | wrong | `\left(\frac{\sqrt{x^2+1}\,\sin x}{e^x\cos x}\left(\frac{x}{x^2+1}+\cot x-1+\tan x\right)\right)+1` | not_equivalent | false | structural |
| derivative-L10-1 | derivative | L10 | minus_one | wrong | `\left(\frac{\sqrt{x^2+1}\,\sin x}{e^x\cos x}\left(\frac{x}{x^2+1}+\cot x-1+\tan x\right)\right)-1` | not_equivalent | false | structural |
| derivative-L10-1 | derivative | L10 | paren_wrap | valid | `\left(\frac{\sqrt{x^2+1}\,\sin x}{e^x\cos x}\left(\frac{x}{x^2+1}+\cot x-1+\tan x\right)\right)` | equivalent | true | structural |
| derivative-L10-1 | derivative | L10 | double_negation | valid | `-\left(-\left(\frac{\sqrt{x^2+1}\,\sin x}{e^x\cos x}\left(\frac{x}{x^2+1}+\cot x-1+\tan x\right)\right)\right)` | equivalent | true | structural |
| derivative-L10-1 | derivative | L10 | times_one | valid | `1\cdot\left(\frac{\sqrt{x^2+1}\,\sin x}{e^x\cos x}\left(\frac{x}{x^2+1}+\cot x-1+\tan x\right)\right)` | equivalent | true | structural |
| derivative-L10-1 | derivative | L10 | wrapped_twice | valid | `\frac12\left(2\left(\frac{\sqrt{x^2+1}\,\sin x}{e^x\cos x}\left(\frac{x}{x^2+1}+\cot x-1+\tan x\right)\right)\right)` | equivalent | true | structural |
| derivative-L10-1 | derivative | L10 | equivalent_fraction | valid | — | skip | — | — |
| derivative-L10-1 | derivative | L10 | decimal_approx | valid | — | skip | — | — |
| derivative-L10-4 | derivative | L10 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| derivative-L10-4 | derivative | L10 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| derivative-L10-4 | derivative | L10 | far_number | wrong | `999999` | not_equivalent | false | structural |
| derivative-L10-4 | derivative | L10 | double_wrapped | wrong | `2\left(\frac{2x}{(x^2+1)^2}\right)` | not_equivalent | false | structural |
| derivative-L10-4 | derivative | L10 | sign_flip | wrong | `-\left(\frac{2x}{(x^2+1)^2}\right)` | not_equivalent | false | structural |
| derivative-L10-4 | derivative | L10 | double_paren | wrong | `2(\frac{2x}{(x^2+1)^2})` | not_equivalent | false | structural |
| derivative-L10-4 | derivative | L10 | double_cdot | wrong | `2\cdot\left(\frac{2x}{(x^2+1)^2}\right)` | not_equivalent | false | structural |
| derivative-L10-4 | derivative | L10 | double_times | wrong | `2\times\left(\frac{2x}{(x^2+1)^2}\right)` | not_equivalent | false | structural |
| derivative-L10-4 | derivative | L10 | half_shorthand | wrong | `\frac12\left(\frac{2x}{(x^2+1)^2}\right)` | not_equivalent | false | structural |
| derivative-L10-4 | derivative | L10 | plus_one | wrong | `\left(\frac{2x}{(x^2+1)^2}\right)+1` | not_equivalent | false | structural |
| derivative-L10-4 | derivative | L10 | minus_one | wrong | `\left(\frac{2x}{(x^2+1)^2}\right)-1` | not_equivalent | false | structural |
| derivative-L10-4 | derivative | L10 | paren_wrap | valid | `\left(\frac{2x}{(x^2+1)^2}\right)` | equivalent | true | structural |
| derivative-L10-4 | derivative | L10 | double_negation | valid | `-\left(-\left(\frac{2x}{(x^2+1)^2}\right)\right)` | equivalent | true | structural |
| derivative-L10-4 | derivative | L10 | times_one | valid | `1\cdot\left(\frac{2x}{(x^2+1)^2}\right)` | equivalent | true | structural |
| derivative-L10-4 | derivative | L10 | wrapped_twice | valid | `\frac12\left(2\left(\frac{2x}{(x^2+1)^2}\right)\right)` | equivalent | true | structural |
| derivative-L10-4 | derivative | L10 | equivalent_fraction | valid | — | skip | — | — |
| derivative-L10-4 | derivative | L10 | decimal_approx | valid | — | skip | — | — |
| integral-L4-1 | integral | L4 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| integral-L4-1 | integral | L4 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| integral-L4-1 | integral | L4 | far_number | wrong | `999999` | not_equivalent | false | structural |
| integral-L4-1 | integral | L4 | double_wrapped | wrong | `2\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)` | not_equivalent | false | structural |
| integral-L4-1 | integral | L4 | sign_flip | wrong | `-\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)` | not_equivalent | false | structural |
| integral-L4-1 | integral | L4 | double_paren | wrong | `2(\ln\left|1+\tan\frac{x}{2}\right|+C)` | not_equivalent | false | structural |
| integral-L4-1 | integral | L4 | double_cdot | wrong | `2\cdot\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)` | not_equivalent | false | structural |
| integral-L4-1 | integral | L4 | double_times | wrong | `2\times\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)` | not_equivalent | false | structural |
| integral-L4-1 | integral | L4 | half_shorthand | wrong | `\frac12\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)` | not_equivalent | false | structural |
| integral-L4-1 | integral | L4 | plus_one | wrong | — | skip | — | — |
| integral-L4-1 | integral | L4 | minus_one | wrong | — | skip | — | — |
| integral-L4-1 | integral | L4 | paren_wrap | valid | `\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)` | equivalent | true | structural |
| integral-L4-1 | integral | L4 | double_negation | valid | `-\left(-\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)\right)` | equivalent | true | structural |
| integral-L4-1 | integral | L4 | times_one | valid | `1\cdot\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)` | equivalent | true | structural |
| integral-L4-1 | integral | L4 | wrapped_twice | valid | `\frac12\left(2\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)\right)` | equivalent | true | structural |
| integral-L4-1 | integral | L4 | equivalent_fraction | valid | — | skip | — | — |
| integral-L4-1 | integral | L4 | decimal_approx | valid | — | skip | — | — |
| integral-L4-2 | integral | L4 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| integral-L4-2 | integral | L4 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| integral-L4-2 | integral | L4 | far_number | wrong | `999999` | not_equivalent | false | structural |
| integral-L4-2 | integral | L4 | double_wrapped | wrong | `2\left(\frac{1}{2}\ln(x^2+2x+5)+\frac{1}{2}\arctan\frac{x+1}{2}+C\right)` | not_equivalent | false | structural |
| integral-L4-2 | integral | L4 | sign_flip | wrong | `-\left(\frac{1}{2}\ln(x^2+2x+5)+\frac{1}{2}\arctan\frac{x+1}{2}+C\right)` | not_equivalent | false | structural |
| integral-L4-2 | integral | L4 | double_paren | wrong | `2(\frac{1}{2}\ln(x^2+2x+5)+\frac{1}{2}\arctan\frac{x+1}{2}+C)` | not_equivalent | false | structural |
| integral-L4-2 | integral | L4 | double_cdot | wrong | `2\cdot\left(\frac{1}{2}\ln(x^2+2x+5)+\frac{1}{2}\arctan\frac{x+1}{2}+C\right)` | not_equivalent | false | structural |
| integral-L4-2 | integral | L4 | double_times | wrong | `2\times\left(\frac{1}{2}\ln(x^2+2x+5)+\frac{1}{2}\arctan\frac{x+1}{2}+C\right)` | not_equivalent | false | structural |
| integral-L4-2 | integral | L4 | half_shorthand | wrong | `\frac12\left(\frac{1}{2}\ln(x^2+2x+5)+\frac{1}{2}\arctan\frac{x+1}{2}+C\right)` | not_equivalent | false | structural |
| integral-L4-2 | integral | L4 | plus_one | wrong | — | skip | — | — |
| integral-L4-2 | integral | L4 | minus_one | wrong | — | skip | — | — |
| integral-L4-2 | integral | L4 | paren_wrap | valid | `\left(\frac{1}{2}\ln(x^2+2x+5)+\frac{1}{2}\arctan\frac{x+1}{2}+C\right)` | equivalent | true | structural |
| integral-L4-2 | integral | L4 | double_negation | valid | `-\left(-\left(\frac{1}{2}\ln(x^2+2x+5)+\frac{1}{2}\arctan\frac{x+1}{2}+C\right)\right)` | equivalent | true | structural |
| integral-L4-2 | integral | L4 | times_one | valid | `1\cdot\left(\frac{1}{2}\ln(x^2+2x+5)+\frac{1}{2}\arctan\frac{x+1}{2}+C\right)` | equivalent | true | structural |
| integral-L4-2 | integral | L4 | wrapped_twice | valid | `\frac12\left(2\left(\frac{1}{2}\ln(x^2+2x+5)+\frac{1}{2}\arctan\frac{x+1}{2}+C\right)\right)` | equivalent | true | structural |
| integral-L4-2 | integral | L4 | equivalent_fraction | valid | — | skip | — | — |
| integral-L4-2 | integral | L4 | decimal_approx | valid | — | skip | — | — |
| integral-L6-2 | integral | L6 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| integral-L6-2 | integral | L6 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| integral-L6-2 | integral | L6 | far_number | wrong | `999999` | not_equivalent | false | scalar |
| integral-L6-2 | integral | L6 | double_wrapped | wrong | `2\left(\frac{\pi}{4}\right)` | not_equivalent | false | scalar |
| integral-L6-2 | integral | L6 | sign_flip | wrong | `-\left(\frac{\pi}{4}\right)` | not_equivalent | false | scalar |
| integral-L6-2 | integral | L6 | double_paren | wrong | `2(\frac{\pi}{4})` | not_equivalent | false | scalar |
| integral-L6-2 | integral | L6 | double_cdot | wrong | `2\cdot\left(\frac{\pi}{4}\right)` | not_equivalent | false | scalar |
| integral-L6-2 | integral | L6 | double_times | wrong | `2\times\left(\frac{\pi}{4}\right)` | not_equivalent | false | scalar |
| integral-L6-2 | integral | L6 | half_shorthand | wrong | `\frac12\left(\frac{\pi}{4}\right)` | not_equivalent | false | scalar |
| integral-L6-2 | integral | L6 | plus_one | wrong | — | skip | — | — |
| integral-L6-2 | integral | L6 | minus_one | wrong | — | skip | — | — |
| integral-L6-2 | integral | L6 | paren_wrap | valid | `\left(\frac{\pi}{4}\right)` | equivalent | true | scalar |
| integral-L6-2 | integral | L6 | double_negation | valid | `-\left(-\left(\frac{\pi}{4}\right)\right)` | equivalent | true | scalar |
| integral-L6-2 | integral | L6 | times_one | valid | `1\cdot\left(\frac{\pi}{4}\right)` | equivalent | true | scalar |
| integral-L6-2 | integral | L6 | wrapped_twice | valid | `\frac12\left(2\left(\frac{\pi}{4}\right)\right)` | equivalent | true | scalar |
| integral-L6-2 | integral | L6 | equivalent_fraction | valid | — | skip | — | — |
| integral-L6-2 | integral | L6 | decimal_approx | valid | — | skip | — | — |
| integral-L6-3 | integral | L6 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| integral-L6-3 | integral | L6 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| integral-L6-3 | integral | L6 | far_number | wrong | `999999` | not_equivalent | false | structural |
| integral-L6-3 | integral | L6 | double_wrapped | wrong | `2\left(\frac{1}{2}x^2e^{2x}-\frac{1}{2}xe^{2x}+\frac{1}{4}e^{2x}+C\right)` | not_equivalent | false | structural |
| integral-L6-3 | integral | L6 | sign_flip | wrong | `-\left(\frac{1}{2}x^2e^{2x}-\frac{1}{2}xe^{2x}+\frac{1}{4}e^{2x}+C\right)` | not_equivalent | false | structural |
| integral-L6-3 | integral | L6 | double_paren | wrong | `2(\frac{1}{2}x^2e^{2x}-\frac{1}{2}xe^{2x}+\frac{1}{4}e^{2x}+C)` | not_equivalent | false | structural |
| integral-L6-3 | integral | L6 | double_cdot | wrong | `2\cdot\left(\frac{1}{2}x^2e^{2x}-\frac{1}{2}xe^{2x}+\frac{1}{4}e^{2x}+C\right)` | not_equivalent | false | structural |
| integral-L6-3 | integral | L6 | double_times | wrong | `2\times\left(\frac{1}{2}x^2e^{2x}-\frac{1}{2}xe^{2x}+\frac{1}{4}e^{2x}+C\right)` | not_equivalent | false | structural |
| integral-L6-3 | integral | L6 | half_shorthand | wrong | `\frac12\left(\frac{1}{2}x^2e^{2x}-\frac{1}{2}xe^{2x}+\frac{1}{4}e^{2x}+C\right)` | not_equivalent | false | structural |
| integral-L6-3 | integral | L6 | plus_one | wrong | — | skip | — | — |
| integral-L6-3 | integral | L6 | minus_one | wrong | — | skip | — | — |
| integral-L6-3 | integral | L6 | paren_wrap | valid | `\left(\frac{1}{2}x^2e^{2x}-\frac{1}{2}xe^{2x}+\frac{1}{4}e^{2x}+C\right)` | equivalent | true | structural |
| integral-L6-3 | integral | L6 | double_negation | valid | `-\left(-\left(\frac{1}{2}x^2e^{2x}-\frac{1}{2}xe^{2x}+\frac{1}{4}e^{2x}+C\right)\right)` | equivalent | true | structural |
| integral-L6-3 | integral | L6 | times_one | valid | `1\cdot\left(\frac{1}{2}x^2e^{2x}-\frac{1}{2}xe^{2x}+\frac{1}{4}e^{2x}+C\right)` | equivalent | true | structural |
| integral-L6-3 | integral | L6 | wrapped_twice | valid | `\frac12\left(2\left(\frac{1}{2}x^2e^{2x}-\frac{1}{2}xe^{2x}+\frac{1}{4}e^{2x}+C\right)\right)` | equivalent | true | structural |
| integral-L6-3 | integral | L6 | equivalent_fraction | valid | — | skip | — | — |
| integral-L6-3 | integral | L6 | decimal_approx | valid | — | skip | — | — |
| integral-L8-1 | integral | L8 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| integral-L8-1 | integral | L8 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| integral-L8-1 | integral | L8 | far_number | wrong | `999999` | not_equivalent | false | scalar |
| integral-L8-1 | integral | L8 | double_wrapped | wrong | `2\left(\frac{\pi}{8}\ln 2\right)` | not_equivalent | false | scalar |
| integral-L8-1 | integral | L8 | sign_flip | wrong | `-\left(\frac{\pi}{8}\ln 2\right)` | not_equivalent | false | scalar |
| integral-L8-1 | integral | L8 | double_paren | wrong | `2(\frac{\pi}{8}\ln 2)` | not_equivalent | false | scalar |
| integral-L8-1 | integral | L8 | double_cdot | wrong | `2\cdot\left(\frac{\pi}{8}\ln 2\right)` | not_equivalent | false | scalar |
| integral-L8-1 | integral | L8 | double_times | wrong | `2\times\left(\frac{\pi}{8}\ln 2\right)` | not_equivalent | false | scalar |
| integral-L8-1 | integral | L8 | half_shorthand | wrong | `\frac12\left(\frac{\pi}{8}\ln 2\right)` | not_equivalent | false | scalar |
| integral-L8-1 | integral | L8 | plus_one | wrong | — | skip | — | — |
| integral-L8-1 | integral | L8 | minus_one | wrong | — | skip | — | — |
| integral-L8-1 | integral | L8 | paren_wrap | valid | `\left(\frac{\pi}{8}\ln 2\right)` | equivalent | true | scalar |
| integral-L8-1 | integral | L8 | double_negation | valid | `-\left(-\left(\frac{\pi}{8}\ln 2\right)\right)` | equivalent | true | scalar |
| integral-L8-1 | integral | L8 | times_one | valid | `1\cdot\left(\frac{\pi}{8}\ln 2\right)` | equivalent | true | scalar |
| integral-L8-1 | integral | L8 | wrapped_twice | valid | `\frac12\left(2\left(\frac{\pi}{8}\ln 2\right)\right)` | equivalent | true | scalar |
| integral-L8-1 | integral | L8 | equivalent_fraction | valid | — | skip | — | — |
| integral-L8-1 | integral | L8 | decimal_approx | valid | — | skip | — | — |
| integral-L8-3 | integral | L8 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| integral-L8-3 | integral | L8 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| integral-L8-3 | integral | L8 | far_number | wrong | `999999` | not_equivalent | false | structural |
| integral-L8-3 | integral | L8 | double_wrapped | wrong | `2\left(-\ln\left|\frac{1+\sqrt{x^2+x+1}}{x}+\frac12\right|+C\right)` | not_equivalent | false | structural |
| integral-L8-3 | integral | L8 | sign_flip | wrong | `-\left(-\ln\left|\frac{1+\sqrt{x^2+x+1}}{x}+\frac12\right|+C\right)` | not_equivalent | false | structural |
| integral-L8-3 | integral | L8 | double_paren | wrong | `2(-\ln\left|\frac{1+\sqrt{x^2+x+1}}{x}+\frac12\right|+C)` | not_equivalent | false | structural |
| integral-L8-3 | integral | L8 | double_cdot | wrong | `2\cdot\left(-\ln\left|\frac{1+\sqrt{x^2+x+1}}{x}+\frac12\right|+C\right)` | not_equivalent | false | structural |
| integral-L8-3 | integral | L8 | double_times | wrong | `2\times\left(-\ln\left|\frac{1+\sqrt{x^2+x+1}}{x}+\frac12\right|+C\right)` | not_equivalent | false | structural |
| integral-L8-3 | integral | L8 | half_shorthand | wrong | `\frac12\left(-\ln\left|\frac{1+\sqrt{x^2+x+1}}{x}+\frac12\right|+C\right)` | not_equivalent | false | structural |
| integral-L8-3 | integral | L8 | plus_one | wrong | — | skip | — | — |
| integral-L8-3 | integral | L8 | minus_one | wrong | — | skip | — | — |
| integral-L8-3 | integral | L8 | paren_wrap | valid | `\left(-\ln\left|\frac{1+\sqrt{x^2+x+1}}{x}+\frac12\right|+C\right)` | equivalent | true | structural |
| integral-L8-3 | integral | L8 | double_negation | valid | `-\left(-\left(-\ln\left|\frac{1+\sqrt{x^2+x+1}}{x}+\frac12\right|+C\right)\right)` | equivalent | true | structural |
| integral-L8-3 | integral | L8 | times_one | valid | `1\cdot\left(-\ln\left|\frac{1+\sqrt{x^2+x+1}}{x}+\frac12\right|+C\right)` | equivalent | true | structural |
| integral-L8-3 | integral | L8 | wrapped_twice | valid | `\frac12\left(2\left(-\ln\left|\frac{1+\sqrt{x^2+x+1}}{x}+\frac12\right|+C\right)\right)` | equivalent | true | structural |
| integral-L8-3 | integral | L8 | equivalent_fraction | valid | — | skip | — | — |
| integral-L8-3 | integral | L8 | decimal_approx | valid | — | skip | — | — |
| integral-L8-4 | integral | L8 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| integral-L8-4 | integral | L8 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| integral-L8-4 | integral | L8 | far_number | wrong | `999999` | not_equivalent | false | structural |
| integral-L8-4 | integral | L8 | double_wrapped | wrong | `2\left(\frac{2}{\sqrt{3}}\arctan\left(\frac{2\tan\frac{x}{2}+1}{\sqrt{3}}\right)+C\right)` | not_equivalent | false | structural |
| integral-L8-4 | integral | L8 | sign_flip | wrong | `-\left(\frac{2}{\sqrt{3}}\arctan\left(\frac{2\tan\frac{x}{2}+1}{\sqrt{3}}\right)+C\right)` | not_equivalent | false | structural |
| integral-L8-4 | integral | L8 | double_paren | wrong | `2(\frac{2}{\sqrt{3}}\arctan\left(\frac{2\tan\frac{x}{2}+1}{\sqrt{3}}\right)+C)` | not_equivalent | false | structural |
| integral-L8-4 | integral | L8 | double_cdot | wrong | `2\cdot\left(\frac{2}{\sqrt{3}}\arctan\left(\frac{2\tan\frac{x}{2}+1}{\sqrt{3}}\right)+C\right)` | not_equivalent | false | structural |
| integral-L8-4 | integral | L8 | double_times | wrong | `2\times\left(\frac{2}{\sqrt{3}}\arctan\left(\frac{2\tan\frac{x}{2}+1}{\sqrt{3}}\right)+C\right)` | not_equivalent | false | structural |
| integral-L8-4 | integral | L8 | half_shorthand | wrong | `\frac12\left(\frac{2}{\sqrt{3}}\arctan\left(\frac{2\tan\frac{x}{2}+1}{\sqrt{3}}\right)+C\right)` | not_equivalent | false | structural |
| integral-L8-4 | integral | L8 | plus_one | wrong | — | skip | — | — |
| integral-L8-4 | integral | L8 | minus_one | wrong | — | skip | — | — |
| integral-L8-4 | integral | L8 | paren_wrap | valid | `\left(\frac{2}{\sqrt{3}}\arctan\left(\frac{2\tan\frac{x}{2}+1}{\sqrt{3}}\right)+C\right)` | equivalent | true | structural |
| integral-L8-4 | integral | L8 | double_negation | valid | `-\left(-\left(\frac{2}{\sqrt{3}}\arctan\left(\frac{2\tan\frac{x}{2}+1}{\sqrt{3}}\right)+C\right)\right)` | equivalent | true | structural |
| integral-L8-4 | integral | L8 | times_one | valid | `1\cdot\left(\frac{2}{\sqrt{3}}\arctan\left(\frac{2\tan\frac{x}{2}+1}{\sqrt{3}}\right)+C\right)` | equivalent | true | structural |
| integral-L8-4 | integral | L8 | wrapped_twice | valid | `\frac12\left(2\left(\frac{2}{\sqrt{3}}\arctan\left(\frac{2\tan\frac{x}{2}+1}{\sqrt{3}}\right)+C\right)\right)` | equivalent | true | structural |
| integral-L8-4 | integral | L8 | equivalent_fraction | valid | — | skip | — | — |
| integral-L8-4 | integral | L8 | decimal_approx | valid | — | skip | — | — |
| integral-L10-3 | integral | L10 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| integral-L10-3 | integral | L10 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| integral-L10-3 | integral | L10 | far_number | wrong | `999999` | not_equivalent | false | structural |
| integral-L10-3 | integral | L10 | double_wrapped | wrong | `2\left(\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C\right)` | not_equivalent | false | structural |
| integral-L10-3 | integral | L10 | sign_flip | wrong | `-\left(\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C\right)` | not_equivalent | false | structural |
| integral-L10-3 | integral | L10 | double_paren | wrong | `2(\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C)` | not_equivalent | false | structural |
| integral-L10-3 | integral | L10 | double_cdot | wrong | `2\cdot\left(\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C\right)` | not_equivalent | false | structural |
| integral-L10-3 | integral | L10 | double_times | wrong | `2\times\left(\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C\right)` | not_equivalent | false | structural |
| integral-L10-3 | integral | L10 | half_shorthand | wrong | `\frac12\left(\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C\right)` | not_equivalent | false | structural |
| integral-L10-3 | integral | L10 | plus_one | wrong | — | skip | — | — |
| integral-L10-3 | integral | L10 | minus_one | wrong | — | skip | — | — |
| integral-L10-3 | integral | L10 | paren_wrap | valid | `\left(\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C\right)` | equivalent | true | structural |
| integral-L10-3 | integral | L10 | double_negation | valid | `-\left(-\left(\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C\right)\right)` | equivalent | true | structural |
| integral-L10-3 | integral | L10 | times_one | valid | `1\cdot\left(\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C\right)` | equivalent | true | structural |
| integral-L10-3 | integral | L10 | wrapped_twice | valid | `\frac12\left(2\left(\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C\right)\right)` | equivalent | true | structural |
| integral-L10-3 | integral | L10 | equivalent_fraction | valid | — | skip | — | — |
| integral-L10-3 | integral | L10 | decimal_approx | valid | — | skip | — | — |
| integral-L10-4 | integral | L10 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| integral-L10-4 | integral | L10 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| integral-L10-4 | integral | L10 | far_number | wrong | `999999` | not_equivalent | false | structural |
| integral-L10-4 | integral | L10 | double_wrapped | wrong | `2\left(\arctan x+\frac{1}{3}\arctan(x^3)+C\right)` | not_equivalent | false | structural |
| integral-L10-4 | integral | L10 | sign_flip | wrong | `-\left(\arctan x+\frac{1}{3}\arctan(x^3)+C\right)` | not_equivalent | false | structural |
| integral-L10-4 | integral | L10 | double_paren | wrong | `2(\arctan x+\frac{1}{3}\arctan(x^3)+C)` | not_equivalent | false | structural |
| integral-L10-4 | integral | L10 | double_cdot | wrong | `2\cdot\left(\arctan x+\frac{1}{3}\arctan(x^3)+C\right)` | not_equivalent | false | structural |
| integral-L10-4 | integral | L10 | double_times | wrong | `2\times\left(\arctan x+\frac{1}{3}\arctan(x^3)+C\right)` | not_equivalent | false | structural |
| integral-L10-4 | integral | L10 | half_shorthand | wrong | `\frac12\left(\arctan x+\frac{1}{3}\arctan(x^3)+C\right)` | not_equivalent | false | structural |
| integral-L10-4 | integral | L10 | plus_one | wrong | — | skip | — | — |
| integral-L10-4 | integral | L10 | minus_one | wrong | — | skip | — | — |
| integral-L10-4 | integral | L10 | paren_wrap | valid | `\left(\arctan x+\frac{1}{3}\arctan(x^3)+C\right)` | equivalent | true | structural |
| integral-L10-4 | integral | L10 | double_negation | valid | `-\left(-\left(\arctan x+\frac{1}{3}\arctan(x^3)+C\right)\right)` | equivalent | true | structural |
| integral-L10-4 | integral | L10 | times_one | valid | `1\cdot\left(\arctan x+\frac{1}{3}\arctan(x^3)+C\right)` | equivalent | true | structural |
| integral-L10-4 | integral | L10 | wrapped_twice | valid | `\frac12\left(2\left(\arctan x+\frac{1}{3}\arctan(x^3)+C\right)\right)` | equivalent | true | structural |
| integral-L10-4 | integral | L10 | equivalent_fraction | valid | — | skip | — | — |
| integral-L10-4 | integral | L10 | decimal_approx | valid | — | skip | — | — |
| integral-L12-2 | integral | L12 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| integral-L12-2 | integral | L12 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| integral-L12-2 | integral | L12 | far_number | wrong | `999999` | not_equivalent | false | structural |
| integral-L12-2 | integral | L12 | double_wrapped | wrong | `2\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)` | not_equivalent | false | structural |
| integral-L12-2 | integral | L12 | sign_flip | wrong | `-\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)` | not_equivalent | false | structural |
| integral-L12-2 | integral | L12 | double_paren | wrong | `2(\ln\left|1+\tan\frac{x}{2}\right|+C)` | not_equivalent | false | structural |
| integral-L12-2 | integral | L12 | double_cdot | wrong | `2\cdot\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)` | not_equivalent | false | structural |
| integral-L12-2 | integral | L12 | double_times | wrong | `2\times\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)` | not_equivalent | false | structural |
| integral-L12-2 | integral | L12 | half_shorthand | wrong | `\frac12\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)` | not_equivalent | false | structural |
| integral-L12-2 | integral | L12 | plus_one | wrong | — | skip | — | — |
| integral-L12-2 | integral | L12 | minus_one | wrong | — | skip | — | — |
| integral-L12-2 | integral | L12 | paren_wrap | valid | `\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)` | equivalent | true | structural |
| integral-L12-2 | integral | L12 | double_negation | valid | `-\left(-\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)\right)` | equivalent | true | structural |
| integral-L12-2 | integral | L12 | times_one | valid | `1\cdot\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)` | equivalent | true | structural |
| integral-L12-2 | integral | L12 | wrapped_twice | valid | `\frac12\left(2\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)\right)` | equivalent | true | structural |
| integral-L12-2 | integral | L12 | equivalent_fraction | valid | — | skip | — | — |
| integral-L12-2 | integral | L12 | decimal_approx | valid | — | skip | — | — |
| integral-L12-3 | integral | L12 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| integral-L12-3 | integral | L12 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| integral-L12-3 | integral | L12 | far_number | wrong | `999999` | not_equivalent | false | structural |
| integral-L12-3 | integral | L12 | double_wrapped | wrong | `2\left(\arctan x+\frac{1}{3}\arctan(x^3)+C\right)` | not_equivalent | false | structural |
| integral-L12-3 | integral | L12 | sign_flip | wrong | `-\left(\arctan x+\frac{1}{3}\arctan(x^3)+C\right)` | not_equivalent | false | structural |
| integral-L12-3 | integral | L12 | double_paren | wrong | `2(\arctan x+\frac{1}{3}\arctan(x^3)+C)` | not_equivalent | false | structural |
| integral-L12-3 | integral | L12 | double_cdot | wrong | `2\cdot\left(\arctan x+\frac{1}{3}\arctan(x^3)+C\right)` | not_equivalent | false | structural |
| integral-L12-3 | integral | L12 | double_times | wrong | `2\times\left(\arctan x+\frac{1}{3}\arctan(x^3)+C\right)` | not_equivalent | false | structural |
| integral-L12-3 | integral | L12 | half_shorthand | wrong | `\frac12\left(\arctan x+\frac{1}{3}\arctan(x^3)+C\right)` | not_equivalent | false | structural |
| integral-L12-3 | integral | L12 | plus_one | wrong | — | skip | — | — |
| integral-L12-3 | integral | L12 | minus_one | wrong | — | skip | — | — |
| integral-L12-3 | integral | L12 | paren_wrap | valid | `\left(\arctan x+\frac{1}{3}\arctan(x^3)+C\right)` | equivalent | true | structural |
| integral-L12-3 | integral | L12 | double_negation | valid | `-\left(-\left(\arctan x+\frac{1}{3}\arctan(x^3)+C\right)\right)` | equivalent | true | structural |
| integral-L12-3 | integral | L12 | times_one | valid | `1\cdot\left(\arctan x+\frac{1}{3}\arctan(x^3)+C\right)` | equivalent | true | structural |
| integral-L12-3 | integral | L12 | wrapped_twice | valid | `\frac12\left(2\left(\arctan x+\frac{1}{3}\arctan(x^3)+C\right)\right)` | equivalent | true | structural |
| integral-L12-3 | integral | L12 | equivalent_fraction | valid | — | skip | — | — |
| integral-L12-3 | integral | L12 | decimal_approx | valid | — | skip | — | — |
| integral-L12-4 | integral | L12 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| integral-L12-4 | integral | L12 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| integral-L12-4 | integral | L12 | far_number | wrong | `999999` | not_equivalent | false | scalar |
| integral-L12-4 | integral | L12 | double_wrapped | wrong | `2\left(\frac{\pi}{4}\right)` | not_equivalent | false | scalar |
| integral-L12-4 | integral | L12 | sign_flip | wrong | `-\left(\frac{\pi}{4}\right)` | not_equivalent | false | scalar |
| integral-L12-4 | integral | L12 | double_paren | wrong | `2(\frac{\pi}{4})` | not_equivalent | false | scalar |
| integral-L12-4 | integral | L12 | double_cdot | wrong | `2\cdot\left(\frac{\pi}{4}\right)` | not_equivalent | false | scalar |
| integral-L12-4 | integral | L12 | double_times | wrong | `2\times\left(\frac{\pi}{4}\right)` | not_equivalent | false | scalar |
| integral-L12-4 | integral | L12 | half_shorthand | wrong | `\frac12\left(\frac{\pi}{4}\right)` | not_equivalent | false | scalar |
| integral-L12-4 | integral | L12 | plus_one | wrong | — | skip | — | — |
| integral-L12-4 | integral | L12 | minus_one | wrong | — | skip | — | — |
| integral-L12-4 | integral | L12 | paren_wrap | valid | `\left(\frac{\pi}{4}\right)` | equivalent | true | scalar |
| integral-L12-4 | integral | L12 | double_negation | valid | `-\left(-\left(\frac{\pi}{4}\right)\right)` | equivalent | true | scalar |
| integral-L12-4 | integral | L12 | times_one | valid | `1\cdot\left(\frac{\pi}{4}\right)` | equivalent | true | scalar |
| integral-L12-4 | integral | L12 | wrapped_twice | valid | `\frac12\left(2\left(\frac{\pi}{4}\right)\right)` | equivalent | true | scalar |
| integral-L12-4 | integral | L12 | equivalent_fraction | valid | — | skip | — | — |
| integral-L12-4 | integral | L12 | decimal_approx | valid | — | skip | — | — |

