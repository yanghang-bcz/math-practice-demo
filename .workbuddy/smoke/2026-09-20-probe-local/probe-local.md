# Judge 专项压力测试 · 本地判定版（Task #4 · D）

- 题源：`.workbuddy/smoke/2026-09-19T16-04-21-after-report/questions.jsonl`
- 题目数：20（可用 41）
- 错答探针定义 11 条 / 合法古怪探针定义 6 条
- 生成的探针：错答 190 条、合法 85 条，跳过 65 条

## 核心验收

| 指标 | 值 |
| --- | --- |
| **错答被放行（wrong_answer_accepted，须为 0）** | **0** |
| 错答被拒 | 76 |
| 错答落到模型（引擎判不了） | 114 |
| 合法写法被误拒（correct:false） | 4 |
| 合法写法落到模型 | 40 |
| 确定性覆盖率 · 错答探针 | 40.0%（标量 9 + 结构 67） |
| 确定性覆盖率 · 合法探针 | 52.9%（标量 9 + 结构 36） |

## 与 Task #4 之前的口径对比

Task #4 之前判题只调 `compare()`（标量专用），表达式形态一律落给模型。
`compare` 这次没动，所以「旧口径」可以直接算出来 —— 增益不是估的。

| 指标 | Task #4 之前 | Task #4 之后 |
| --- | --- | --- |
| 错答探针由确定性引擎判死 | 4.7%（9/190） | 40.0%（76/190） |
| 错答探针落到模型 | 181/190 | 114/190 |
| 合法探针由确定性引擎判死 | 10.6%（9/85） | 52.9%（45/85） |
| 错答被放行 | 取决于模型（实测线上 6/40 误批） | 0（结构上不可能 > 0） |

## 结论

- ✅ 没有任何一条错答探针被判成 `correct: true`。
- 这不是抽样运气：`correct:true` 只有一条来路 —— 确定性引擎判 `equivalent`。
  模型那条路按 Task #4 的规则只采信 `not_equivalent`，产不出 `correct:true`。
  所以「错答放行 = 0」是结构性保证，前提只是「线上跑的是这一版代码」。

- ⚠️ 还有 114 条错答引擎判不了、会去问模型。
  模型最多只能把它们判「错」，不会放行；但会多消耗一次模型调用，且判不出来时用户会看到「暂时无法可靠判断」。

## 仍未被引擎判死的错答（会落到模型）

| 题 | 模块 | 参考答案 | 探针 | 提交的答案 | 本地结论 |
| --- | --- | --- | --- | --- | --- |
| limit-L4-1 | limit | `1/6` | plain_refusal | `我不会做` | uncertain |
| limit-L4-1 | limit | `1/6` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| derivative-L4-1 | derivative | `\frac{\sin t}{1-\cos t}` | plain_refusal | `我不会做` | uncertain |
| derivative-L4-1 | derivative | `\frac{\sin t}{1-\cos t}` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| derivative-L4-1 | derivative | `\frac{\sin t}{1-\cos t}` | far_number | `999999` | uncertain |
| derivative-L4-1 | derivative | `\frac{\sin t}{1-\cos t}` | double_wrapped | `2\left(\frac{\sin t}{1-\cos t}\right)` | uncertain |
| derivative-L4-1 | derivative | `\frac{\sin t}{1-\cos t}` | sign_flip | `-\left(\frac{\sin t}{1-\cos t}\right)` | uncertain |
| derivative-L4-1 | derivative | `\frac{\sin t}{1-\cos t}` | double_paren | `2(\frac{\sin t}{1-\cos t})` | uncertain |
| derivative-L4-1 | derivative | `\frac{\sin t}{1-\cos t}` | double_cdot | `2\cdot\left(\frac{\sin t}{1-\cos t}\right)` | uncertain |
| derivative-L4-1 | derivative | `\frac{\sin t}{1-\cos t}` | double_times | `2\times\left(\frac{\sin t}{1-\cos t}\right)` | uncertain |
| derivative-L4-1 | derivative | `\frac{\sin t}{1-\cos t}` | half_shorthand | `\frac12\left(\frac{\sin t}{1-\cos t}\right)` | uncertain |
| derivative-L4-1 | derivative | `\frac{\sin t}{1-\cos t}` | plus_one | `\left(\frac{\sin t}{1-\cos t}\right)+1` | uncertain |
| derivative-L4-1 | derivative | `\frac{\sin t}{1-\cos t}` | minus_one | `\left(\frac{\sin t}{1-\cos t}\right)-1` | uncertain |
| integral-L4-1 | integral | `-\frac{2}{1+\tan\frac{x}{2}}+C` | plain_refusal | `我不会做` | uncertain |
| integral-L4-1 | integral | `-\frac{2}{1+\tan\frac{x}{2}}+C` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| limit-L4-2 | limit | `\frac{2}{\pi}` | plain_refusal | `我不会做` | uncertain |
| limit-L4-2 | limit | `\frac{2}{\pi}` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| limit-L4-2 | limit | `\frac{2}{\pi}` | far_number | `999999` | uncertain |
| limit-L4-2 | limit | `\frac{2}{\pi}` | double_wrapped | `2\left(\frac{2}{\pi}\right)` | uncertain |
| limit-L4-2 | limit | `\frac{2}{\pi}` | sign_flip | `-\left(\frac{2}{\pi}\right)` | uncertain |
| limit-L4-2 | limit | `\frac{2}{\pi}` | double_paren | `2(\frac{2}{\pi})` | uncertain |
| limit-L4-2 | limit | `\frac{2}{\pi}` | double_cdot | `2\cdot\left(\frac{2}{\pi}\right)` | uncertain |
| limit-L4-2 | limit | `\frac{2}{\pi}` | double_times | `2\times\left(\frac{2}{\pi}\right)` | uncertain |
| limit-L4-2 | limit | `\frac{2}{\pi}` | half_shorthand | `\frac12\left(\frac{2}{\pi}\right)` | uncertain |
| limit-L4-2 | limit | `\frac{2}{\pi}` | plus_one | `\left(\frac{2}{\pi}\right)+1` | uncertain |
| limit-L4-2 | limit | `\frac{2}{\pi}` | minus_one | `\left(\frac{2}{\pi}\right)-1` | uncertain |
| derivative-L4-2 | derivative | `0` | plain_refusal | `我不会做` | uncertain |
| derivative-L4-2 | derivative | `0` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| derivative-L4-2 | derivative | `0` | plus_one | `\left(0\right)+1` | uncertain |
| derivative-L4-2 | derivative | `0` | minus_one | `\left(0\right)-1` | uncertain |
| integral-L4-2 | integral | `3\ln|x-2|-2\ln|x-1|+C` | plain_refusal | `我不会做` | uncertain |
| integral-L4-2 | integral | `3\ln|x-2|-2\ln|x-1|+C` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| limit-L4-3 | limit | `\frac{1}{2}` | plain_refusal | `我不会做` | uncertain |
| limit-L4-3 | limit | `\frac{1}{2}` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| limit-L4-3 | limit | `\frac{1}{2}` | double_wrapped | `2\left(\frac{1}{2}\right)` | uncertain |
| limit-L4-3 | limit | `\frac{1}{2}` | sign_flip | `-\left(\frac{1}{2}\right)` | uncertain |
| limit-L4-3 | limit | `\frac{1}{2}` | double_paren | `2(\frac{1}{2})` | uncertain |
| limit-L4-3 | limit | `\frac{1}{2}` | double_cdot | `2\cdot\left(\frac{1}{2}\right)` | uncertain |
| limit-L4-3 | limit | `\frac{1}{2}` | double_times | `2\times\left(\frac{1}{2}\right)` | uncertain |
| limit-L4-3 | limit | `\frac{1}{2}` | half_shorthand | `\frac12\left(\frac{1}{2}\right)` | uncertain |
| limit-L4-3 | limit | `\frac{1}{2}` | plus_one | `\left(\frac{1}{2}\right)+1` | uncertain |
| limit-L4-3 | limit | `\frac{1}{2}` | minus_one | `\left(\frac{1}{2}\right)-1` | uncertain |
| derivative-L4-3 | derivative | `可导，且 f'(0)=0` | plain_refusal | `我不会做` | uncertain |
| derivative-L4-3 | derivative | `可导，且 f'(0)=0` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| derivative-L4-3 | derivative | `可导，且 f'(0)=0` | far_number | `999999` | uncertain |
| derivative-L4-3 | derivative | `可导，且 f'(0)=0` | plus_one | `\left(0\right)+1` | uncertain |
| derivative-L4-3 | derivative | `可导，且 f'(0)=0` | minus_one | `\left(0\right)-1` | uncertain |
| integral-L4-3 | integral | `\frac{\pi}{4}` | plain_refusal | `我不会做` | uncertain |
| integral-L4-3 | integral | `\frac{\pi}{4}` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| integral-L6-1 | integral | `\ln|x|+C` | plain_refusal | `我不会做` | uncertain |
| integral-L6-1 | integral | `\ln|x|+C` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| limit-L6-2 | limit | `1` | plain_refusal | `我不会做` | uncertain |
| limit-L6-2 | limit | `1` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| limit-L6-2 | limit | `1` | double_wrapped | `2\left(1\right)` | uncertain |
| limit-L6-2 | limit | `1` | double_paren | `2(1)` | uncertain |
| limit-L6-2 | limit | `1` | double_cdot | `2\cdot\left(1\right)` | uncertain |
| limit-L6-2 | limit | `1` | double_times | `2\times\left(1\right)` | uncertain |
| limit-L6-2 | limit | `1` | half_shorthand | `\frac12\left(1\right)` | uncertain |
| limit-L6-2 | limit | `1` | plus_one | `\left(1\right)+1` | uncertain |
| limit-L6-2 | limit | `1` | minus_one | `\left(1\right)-1` | uncertain |
| derivative-L6-3 | derivative | `\frac{2}{\sqrt{x^2+1}}` | plain_refusal | `我不会做` | uncertain |
| derivative-L6-3 | derivative | `\frac{2}{\sqrt{x^2+1}}` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| derivative-L6-3 | derivative | `\frac{2}{\sqrt{x^2+1}}` | far_number | `999999` | uncertain |
| derivative-L6-3 | derivative | `\frac{2}{\sqrt{x^2+1}}` | double_wrapped | `2\left(\frac{2}{\sqrt{x^2+1}}\right)` | uncertain |
| derivative-L6-3 | derivative | `\frac{2}{\sqrt{x^2+1}}` | sign_flip | `-\left(\frac{2}{\sqrt{x^2+1}}\right)` | uncertain |
| derivative-L6-3 | derivative | `\frac{2}{\sqrt{x^2+1}}` | double_paren | `2(\frac{2}{\sqrt{x^2+1}})` | uncertain |
| derivative-L6-3 | derivative | `\frac{2}{\sqrt{x^2+1}}` | double_cdot | `2\cdot\left(\frac{2}{\sqrt{x^2+1}}\right)` | uncertain |
| derivative-L6-3 | derivative | `\frac{2}{\sqrt{x^2+1}}` | double_times | `2\times\left(\frac{2}{\sqrt{x^2+1}}\right)` | uncertain |
| derivative-L6-3 | derivative | `\frac{2}{\sqrt{x^2+1}}` | half_shorthand | `\frac12\left(\frac{2}{\sqrt{x^2+1}}\right)` | uncertain |
| derivative-L6-3 | derivative | `\frac{2}{\sqrt{x^2+1}}` | plus_one | `\left(\frac{2}{\sqrt{x^2+1}}\right)+1` | uncertain |
| derivative-L6-3 | derivative | `\frac{2}{\sqrt{x^2+1}}` | minus_one | `\left(\frac{2}{\sqrt{x^2+1}}\right)-1` | uncertain |
| limit-L6-3 | limit | `\frac{1}{3}` | plain_refusal | `我不会做` | uncertain |
| limit-L6-3 | limit | `\frac{1}{3}` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| derivative-L8-2 | derivative | `\frac{1}{2}\sqrt{\frac{(x-1)(x-2)}{(x-3)(x-4)}}\left(\frac{1}{x-1}+\frac{1}{x-2}-\frac{1}{x-3}-\frac{1}{x-4}\right)` | plain_refusal | `我不会做` | uncertain |
| derivative-L8-2 | derivative | `\frac{1}{2}\sqrt{\frac{(x-1)(x-2)}{(x-3)(x-4)}}\left(\frac{1}{x-1}+\frac{1}{x-2}-\frac{1}{x-3}-\frac{1}{x-4}\right)` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| integral-L6-3 | integral | `\frac{x^2+1}{2}\arctan x-\frac{x}{2}+C` | plain_refusal | `我不会做` | uncertain |
| integral-L6-3 | integral | `\frac{x^2+1}{2}\arctan x-\frac{x}{2}+C` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| derivative-L8-3 | derivative | `\frac{-18}{(x+2y)^3}` | plain_refusal | `我不会做` | uncertain |
| derivative-L8-3 | derivative | `\frac{-18}{(x+2y)^3}` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| derivative-L8-3 | derivative | `\frac{-18}{(x+2y)^3}` | far_number | `999999` | uncertain |
| derivative-L8-3 | derivative | `\frac{-18}{(x+2y)^3}` | double_wrapped | `2\left(\frac{-18}{(x+2y)^3}\right)` | uncertain |
| derivative-L8-3 | derivative | `\frac{-18}{(x+2y)^3}` | sign_flip | `-\left(\frac{-18}{(x+2y)^3}\right)` | uncertain |
| derivative-L8-3 | derivative | `\frac{-18}{(x+2y)^3}` | double_paren | `2(\frac{-18}{(x+2y)^3})` | uncertain |
| derivative-L8-3 | derivative | `\frac{-18}{(x+2y)^3}` | double_cdot | `2\cdot\left(\frac{-18}{(x+2y)^3}\right)` | uncertain |
| derivative-L8-3 | derivative | `\frac{-18}{(x+2y)^3}` | double_times | `2\times\left(\frac{-18}{(x+2y)^3}\right)` | uncertain |
| derivative-L8-3 | derivative | `\frac{-18}{(x+2y)^3}` | half_shorthand | `\frac12\left(\frac{-18}{(x+2y)^3}\right)` | uncertain |
| derivative-L8-3 | derivative | `\frac{-18}{(x+2y)^3}` | plus_one | `\left(\frac{-18}{(x+2y)^3}\right)+1` | uncertain |
| derivative-L8-3 | derivative | `\frac{-18}{(x+2y)^3}` | minus_one | `\left(\frac{-18}{(x+2y)^3}\right)-1` | uncertain |

## 合法写法没被确定性判定（Task #4 之后这一侧的代价变高了）

| 题 | 模块 | 参考答案 | 探针 | 提交的答案 | 本地结论 |
| --- | --- | --- | --- | --- | --- |
| derivative-L4-1 | derivative | `\frac{\sin t}{1-\cos t}` | paren_wrap | `\left(\frac{\sin t}{1-\cos t}\right)` | uncertain |
| derivative-L4-1 | derivative | `\frac{\sin t}{1-\cos t}` | double_negation | `-\left(-\left(\frac{\sin t}{1-\cos t}\right)\right)` | uncertain |
| derivative-L4-1 | derivative | `\frac{\sin t}{1-\cos t}` | times_one | `1\cdot\left(\frac{\sin t}{1-\cos t}\right)` | uncertain |
| derivative-L4-1 | derivative | `\frac{\sin t}{1-\cos t}` | wrapped_twice | `\frac12\left(2\left(\frac{\sin t}{1-\cos t}\right)\right)` | uncertain |
| limit-L4-2 | limit | `\frac{2}{\pi}` | paren_wrap | `\left(\frac{2}{\pi}\right)` | uncertain |
| limit-L4-2 | limit | `\frac{2}{\pi}` | double_negation | `-\left(-\left(\frac{2}{\pi}\right)\right)` | uncertain |
| limit-L4-2 | limit | `\frac{2}{\pi}` | times_one | `1\cdot\left(\frac{2}{\pi}\right)` | uncertain |
| limit-L4-2 | limit | `\frac{2}{\pi}` | wrapped_twice | `\frac12\left(2\left(\frac{2}{\pi}\right)\right)` | uncertain |
| derivative-L4-2 | derivative | `0` | double_negation | `-\left(-\left(0\right)\right)` | uncertain |
| derivative-L4-2 | derivative | `0` | times_one | `1\cdot\left(0\right)` | uncertain |
| derivative-L4-2 | derivative | `0` | wrapped_twice | `\frac12\left(2\left(0\right)\right)` | uncertain |
| integral-L4-2 | integral | `3\ln|x-2|-2\ln|x-1|+C` | paren_wrap | `\left(3\ln|x-2|-2\ln|x-1|+C\right)` | not_equivalent |
| integral-L4-2 | integral | `3\ln|x-2|-2\ln|x-1|+C` | double_negation | `-\left(-\left(3\ln|x-2|-2\ln|x-1|+C\right)\right)` | not_equivalent |
| integral-L4-2 | integral | `3\ln|x-2|-2\ln|x-1|+C` | times_one | `1\cdot\left(3\ln|x-2|-2\ln|x-1|+C\right)` | not_equivalent |
| integral-L4-2 | integral | `3\ln|x-2|-2\ln|x-1|+C` | wrapped_twice | `\frac12\left(2\left(3\ln|x-2|-2\ln|x-1|+C\right)\right)` | not_equivalent |
| limit-L4-3 | limit | `\frac{1}{2}` | paren_wrap | `\left(\frac{1}{2}\right)` | uncertain |
| limit-L4-3 | limit | `\frac{1}{2}` | double_negation | `-\left(-\left(\frac{1}{2}\right)\right)` | uncertain |
| limit-L4-3 | limit | `\frac{1}{2}` | times_one | `1\cdot\left(\frac{1}{2}\right)` | uncertain |
| limit-L4-3 | limit | `\frac{1}{2}` | wrapped_twice | `\frac12\left(2\left(\frac{1}{2}\right)\right)` | uncertain |
| derivative-L4-3 | derivative | `可导，且 f'(0)=0` | paren_wrap | `\left(0\right)` | uncertain |
| derivative-L4-3 | derivative | `可导，且 f'(0)=0` | double_negation | `-\left(-\left(0\right)\right)` | uncertain |
| derivative-L4-3 | derivative | `可导，且 f'(0)=0` | times_one | `1\cdot\left(0\right)` | uncertain |
| derivative-L4-3 | derivative | `可导，且 f'(0)=0` | wrapped_twice | `\frac12\left(2\left(0\right)\right)` | uncertain |
| limit-L6-2 | limit | `1` | double_negation | `-\left(-\left(1\right)\right)` | uncertain |
| limit-L6-2 | limit | `1` | times_one | `1\cdot\left(1\right)` | uncertain |
| limit-L6-2 | limit | `1` | wrapped_twice | `\frac12\left(2\left(1\right)\right)` | uncertain |
| derivative-L6-3 | derivative | `\frac{2}{\sqrt{x^2+1}}` | paren_wrap | `\left(\frac{2}{\sqrt{x^2+1}}\right)` | uncertain |
| derivative-L6-3 | derivative | `\frac{2}{\sqrt{x^2+1}}` | double_negation | `-\left(-\left(\frac{2}{\sqrt{x^2+1}}\right)\right)` | uncertain |
| derivative-L6-3 | derivative | `\frac{2}{\sqrt{x^2+1}}` | times_one | `1\cdot\left(\frac{2}{\sqrt{x^2+1}}\right)` | uncertain |
| derivative-L6-3 | derivative | `\frac{2}{\sqrt{x^2+1}}` | wrapped_twice | `\frac12\left(2\left(\frac{2}{\sqrt{x^2+1}}\right)\right)` | uncertain |
| derivative-L8-3 | derivative | `\frac{-18}{(x+2y)^3}` | paren_wrap | `\left(\frac{-18}{(x+2y)^3}\right)` | uncertain |
| derivative-L8-3 | derivative | `\frac{-18}{(x+2y)^3}` | double_negation | `-\left(-\left(\frac{-18}{(x+2y)^3}\right)\right)` | uncertain |
| derivative-L8-3 | derivative | `\frac{-18}{(x+2y)^3}` | times_one | `1\cdot\left(\frac{-18}{(x+2y)^3}\right)` | uncertain |
| derivative-L8-3 | derivative | `\frac{-18}{(x+2y)^3}` | wrapped_twice | `\frac12\left(2\left(\frac{-18}{(x+2y)^3}\right)\right)` | uncertain |

## 被跳过的探针（不适用）

- no_form：35 条
- not_applicable：30 条

## 逐条明细

| 题 | 模块 | L | 探针 | 类型 | 提交的答案 | verdict | correct | 判定层 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| limit-L4-1 | limit | L4 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| limit-L4-1 | limit | L4 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| limit-L4-1 | limit | L4 | far_number | wrong | `999999` | not_equivalent | false | scalar |
| limit-L4-1 | limit | L4 | double_wrapped | wrong | `2\left(1/6\right)` | not_equivalent | false | structural |
| limit-L4-1 | limit | L4 | sign_flip | wrong | `-\left(1/6\right)` | not_equivalent | false | structural |
| limit-L4-1 | limit | L4 | double_paren | wrong | `2(1/6)` | not_equivalent | false | structural |
| limit-L4-1 | limit | L4 | double_cdot | wrong | `2\cdot\left(1/6\right)` | not_equivalent | false | structural |
| limit-L4-1 | limit | L4 | double_times | wrong | `2\times\left(1/6\right)` | not_equivalent | false | structural |
| limit-L4-1 | limit | L4 | half_shorthand | wrong | `\frac12\left(1/6\right)` | not_equivalent | false | structural |
| limit-L4-1 | limit | L4 | plus_one | wrong | `\left(1/6\right)+1` | not_equivalent | false | structural |
| limit-L4-1 | limit | L4 | minus_one | wrong | `\left(1/6\right)-1` | not_equivalent | false | structural |
| limit-L4-1 | limit | L4 | paren_wrap | valid | `\left(1/6\right)` | equivalent | true | structural |
| limit-L4-1 | limit | L4 | double_negation | valid | `-\left(-\left(1/6\right)\right)` | equivalent | true | structural |
| limit-L4-1 | limit | L4 | times_one | valid | `1\cdot\left(1/6\right)` | equivalent | true | structural |
| limit-L4-1 | limit | L4 | wrapped_twice | valid | `\frac12\left(2\left(1/6\right)\right)` | equivalent | true | structural |
| limit-L4-1 | limit | L4 | equivalent_fraction | valid | `(2)/(12)` | equivalent | true | scalar |
| limit-L4-1 | limit | L4 | decimal_approx | valid | `0.1666666667` | equivalent | true | scalar |
| derivative-L4-1 | derivative | L4 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| derivative-L4-1 | derivative | L4 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| derivative-L4-1 | derivative | L4 | far_number | wrong | `999999` | uncertain | — | model |
| derivative-L4-1 | derivative | L4 | double_wrapped | wrong | `2\left(\frac{\sin t}{1-\cos t}\right)` | uncertain | — | model |
| derivative-L4-1 | derivative | L4 | sign_flip | wrong | `-\left(\frac{\sin t}{1-\cos t}\right)` | uncertain | — | model |
| derivative-L4-1 | derivative | L4 | double_paren | wrong | `2(\frac{\sin t}{1-\cos t})` | uncertain | — | model |
| derivative-L4-1 | derivative | L4 | double_cdot | wrong | `2\cdot\left(\frac{\sin t}{1-\cos t}\right)` | uncertain | — | model |
| derivative-L4-1 | derivative | L4 | double_times | wrong | `2\times\left(\frac{\sin t}{1-\cos t}\right)` | uncertain | — | model |
| derivative-L4-1 | derivative | L4 | half_shorthand | wrong | `\frac12\left(\frac{\sin t}{1-\cos t}\right)` | uncertain | — | model |
| derivative-L4-1 | derivative | L4 | plus_one | wrong | `\left(\frac{\sin t}{1-\cos t}\right)+1` | uncertain | — | model |
| derivative-L4-1 | derivative | L4 | minus_one | wrong | `\left(\frac{\sin t}{1-\cos t}\right)-1` | uncertain | — | model |
| derivative-L4-1 | derivative | L4 | paren_wrap | valid | `\left(\frac{\sin t}{1-\cos t}\right)` | uncertain | — | model |
| derivative-L4-1 | derivative | L4 | double_negation | valid | `-\left(-\left(\frac{\sin t}{1-\cos t}\right)\right)` | uncertain | — | model |
| derivative-L4-1 | derivative | L4 | times_one | valid | `1\cdot\left(\frac{\sin t}{1-\cos t}\right)` | uncertain | — | model |
| derivative-L4-1 | derivative | L4 | wrapped_twice | valid | `\frac12\left(2\left(\frac{\sin t}{1-\cos t}\right)\right)` | uncertain | — | model |
| derivative-L4-1 | derivative | L4 | equivalent_fraction | valid | — | skip | — | — |
| derivative-L4-1 | derivative | L4 | decimal_approx | valid | — | skip | — | — |
| integral-L4-1 | integral | L4 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| integral-L4-1 | integral | L4 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| integral-L4-1 | integral | L4 | far_number | wrong | `999999` | not_equivalent | false | structural |
| integral-L4-1 | integral | L4 | double_wrapped | wrong | `2\left(-\frac{2}{1+\tan\frac{x}{2}}+C\right)` | not_equivalent | false | structural |
| integral-L4-1 | integral | L4 | sign_flip | wrong | `-\left(-\frac{2}{1+\tan\frac{x}{2}}+C\right)` | not_equivalent | false | structural |
| integral-L4-1 | integral | L4 | double_paren | wrong | `2(-\frac{2}{1+\tan\frac{x}{2}}+C)` | not_equivalent | false | structural |
| integral-L4-1 | integral | L4 | double_cdot | wrong | `2\cdot\left(-\frac{2}{1+\tan\frac{x}{2}}+C\right)` | not_equivalent | false | structural |
| integral-L4-1 | integral | L4 | double_times | wrong | `2\times\left(-\frac{2}{1+\tan\frac{x}{2}}+C\right)` | not_equivalent | false | structural |
| integral-L4-1 | integral | L4 | half_shorthand | wrong | `\frac12\left(-\frac{2}{1+\tan\frac{x}{2}}+C\right)` | not_equivalent | false | structural |
| integral-L4-1 | integral | L4 | plus_one | wrong | — | skip | — | — |
| integral-L4-1 | integral | L4 | minus_one | wrong | — | skip | — | — |
| integral-L4-1 | integral | L4 | paren_wrap | valid | `\left(-\frac{2}{1+\tan\frac{x}{2}}+C\right)` | equivalent | true | structural |
| integral-L4-1 | integral | L4 | double_negation | valid | `-\left(-\left(-\frac{2}{1+\tan\frac{x}{2}}+C\right)\right)` | equivalent | true | structural |
| integral-L4-1 | integral | L4 | times_one | valid | `1\cdot\left(-\frac{2}{1+\tan\frac{x}{2}}+C\right)` | equivalent | true | structural |
| integral-L4-1 | integral | L4 | wrapped_twice | valid | `\frac12\left(2\left(-\frac{2}{1+\tan\frac{x}{2}}+C\right)\right)` | equivalent | true | structural |
| integral-L4-1 | integral | L4 | equivalent_fraction | valid | — | skip | — | — |
| integral-L4-1 | integral | L4 | decimal_approx | valid | — | skip | — | — |
| limit-L4-2 | limit | L4 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| limit-L4-2 | limit | L4 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| limit-L4-2 | limit | L4 | far_number | wrong | `999999` | uncertain | — | model |
| limit-L4-2 | limit | L4 | double_wrapped | wrong | `2\left(\frac{2}{\pi}\right)` | uncertain | — | model |
| limit-L4-2 | limit | L4 | sign_flip | wrong | `-\left(\frac{2}{\pi}\right)` | uncertain | — | model |
| limit-L4-2 | limit | L4 | double_paren | wrong | `2(\frac{2}{\pi})` | uncertain | — | model |
| limit-L4-2 | limit | L4 | double_cdot | wrong | `2\cdot\left(\frac{2}{\pi}\right)` | uncertain | — | model |
| limit-L4-2 | limit | L4 | double_times | wrong | `2\times\left(\frac{2}{\pi}\right)` | uncertain | — | model |
| limit-L4-2 | limit | L4 | half_shorthand | wrong | `\frac12\left(\frac{2}{\pi}\right)` | uncertain | — | model |
| limit-L4-2 | limit | L4 | plus_one | wrong | `\left(\frac{2}{\pi}\right)+1` | uncertain | — | model |
| limit-L4-2 | limit | L4 | minus_one | wrong | `\left(\frac{2}{\pi}\right)-1` | uncertain | — | model |
| limit-L4-2 | limit | L4 | paren_wrap | valid | `\left(\frac{2}{\pi}\right)` | uncertain | — | model |
| limit-L4-2 | limit | L4 | double_negation | valid | `-\left(-\left(\frac{2}{\pi}\right)\right)` | uncertain | — | model |
| limit-L4-2 | limit | L4 | times_one | valid | `1\cdot\left(\frac{2}{\pi}\right)` | uncertain | — | model |
| limit-L4-2 | limit | L4 | wrapped_twice | valid | `\frac12\left(2\left(\frac{2}{\pi}\right)\right)` | uncertain | — | model |
| limit-L4-2 | limit | L4 | equivalent_fraction | valid | — | skip | — | — |
| limit-L4-2 | limit | L4 | decimal_approx | valid | — | skip | — | — |
| derivative-L4-2 | derivative | L4 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| derivative-L4-2 | derivative | L4 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| derivative-L4-2 | derivative | L4 | far_number | wrong | `999999` | not_equivalent | false | scalar |
| derivative-L4-2 | derivative | L4 | double_wrapped | wrong | — | skip | — | — |
| derivative-L4-2 | derivative | L4 | sign_flip | wrong | — | skip | — | — |
| derivative-L4-2 | derivative | L4 | double_paren | wrong | — | skip | — | — |
| derivative-L4-2 | derivative | L4 | double_cdot | wrong | — | skip | — | — |
| derivative-L4-2 | derivative | L4 | double_times | wrong | — | skip | — | — |
| derivative-L4-2 | derivative | L4 | half_shorthand | wrong | — | skip | — | — |
| derivative-L4-2 | derivative | L4 | plus_one | wrong | `\left(0\right)+1` | uncertain | — | model |
| derivative-L4-2 | derivative | L4 | minus_one | wrong | `\left(0\right)-1` | uncertain | — | model |
| derivative-L4-2 | derivative | L4 | paren_wrap | valid | `\left(0\right)` | equivalent | true | scalar |
| derivative-L4-2 | derivative | L4 | double_negation | valid | `-\left(-\left(0\right)\right)` | uncertain | — | model |
| derivative-L4-2 | derivative | L4 | times_one | valid | `1\cdot\left(0\right)` | uncertain | — | model |
| derivative-L4-2 | derivative | L4 | wrapped_twice | valid | `\frac12\left(2\left(0\right)\right)` | uncertain | — | model |
| derivative-L4-2 | derivative | L4 | equivalent_fraction | valid | — | skip | — | — |
| derivative-L4-2 | derivative | L4 | decimal_approx | valid | — | skip | — | — |
| integral-L4-2 | integral | L4 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| integral-L4-2 | integral | L4 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| integral-L4-2 | integral | L4 | far_number | wrong | `999999` | not_equivalent | false | structural |
| integral-L4-2 | integral | L4 | double_wrapped | wrong | `2\left(3\ln|x-2|-2\ln|x-1|+C\right)` | not_equivalent | false | structural |
| integral-L4-2 | integral | L4 | sign_flip | wrong | `-\left(3\ln|x-2|-2\ln|x-1|+C\right)` | not_equivalent | false | structural |
| integral-L4-2 | integral | L4 | double_paren | wrong | `2(3\ln|x-2|-2\ln|x-1|+C)` | not_equivalent | false | structural |
| integral-L4-2 | integral | L4 | double_cdot | wrong | `2\cdot\left(3\ln|x-2|-2\ln|x-1|+C\right)` | not_equivalent | false | structural |
| integral-L4-2 | integral | L4 | double_times | wrong | `2\times\left(3\ln|x-2|-2\ln|x-1|+C\right)` | not_equivalent | false | structural |
| integral-L4-2 | integral | L4 | half_shorthand | wrong | `\frac12\left(3\ln|x-2|-2\ln|x-1|+C\right)` | not_equivalent | false | structural |
| integral-L4-2 | integral | L4 | plus_one | wrong | — | skip | — | — |
| integral-L4-2 | integral | L4 | minus_one | wrong | — | skip | — | — |
| integral-L4-2 | integral | L4 | paren_wrap | valid | `\left(3\ln|x-2|-2\ln|x-1|+C\right)` | not_equivalent | false | structural |
| integral-L4-2 | integral | L4 | double_negation | valid | `-\left(-\left(3\ln|x-2|-2\ln|x-1|+C\right)\right)` | not_equivalent | false | structural |
| integral-L4-2 | integral | L4 | times_one | valid | `1\cdot\left(3\ln|x-2|-2\ln|x-1|+C\right)` | not_equivalent | false | structural |
| integral-L4-2 | integral | L4 | wrapped_twice | valid | `\frac12\left(2\left(3\ln|x-2|-2\ln|x-1|+C\right)\right)` | not_equivalent | false | structural |
| integral-L4-2 | integral | L4 | equivalent_fraction | valid | — | skip | — | — |
| integral-L4-2 | integral | L4 | decimal_approx | valid | — | skip | — | — |
| limit-L4-3 | limit | L4 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| limit-L4-3 | limit | L4 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| limit-L4-3 | limit | L4 | far_number | wrong | `999999` | not_equivalent | false | scalar |
| limit-L4-3 | limit | L4 | double_wrapped | wrong | `2\left(\frac{1}{2}\right)` | uncertain | — | model |
| limit-L4-3 | limit | L4 | sign_flip | wrong | `-\left(\frac{1}{2}\right)` | uncertain | — | model |
| limit-L4-3 | limit | L4 | double_paren | wrong | `2(\frac{1}{2})` | uncertain | — | model |
| limit-L4-3 | limit | L4 | double_cdot | wrong | `2\cdot\left(\frac{1}{2}\right)` | uncertain | — | model |
| limit-L4-3 | limit | L4 | double_times | wrong | `2\times\left(\frac{1}{2}\right)` | uncertain | — | model |
| limit-L4-3 | limit | L4 | half_shorthand | wrong | `\frac12\left(\frac{1}{2}\right)` | uncertain | — | model |
| limit-L4-3 | limit | L4 | plus_one | wrong | `\left(\frac{1}{2}\right)+1` | uncertain | — | model |
| limit-L4-3 | limit | L4 | minus_one | wrong | `\left(\frac{1}{2}\right)-1` | uncertain | — | model |
| limit-L4-3 | limit | L4 | paren_wrap | valid | `\left(\frac{1}{2}\right)` | uncertain | — | model |
| limit-L4-3 | limit | L4 | double_negation | valid | `-\left(-\left(\frac{1}{2}\right)\right)` | uncertain | — | model |
| limit-L4-3 | limit | L4 | times_one | valid | `1\cdot\left(\frac{1}{2}\right)` | uncertain | — | model |
| limit-L4-3 | limit | L4 | wrapped_twice | valid | `\frac12\left(2\left(\frac{1}{2}\right)\right)` | uncertain | — | model |
| limit-L4-3 | limit | L4 | equivalent_fraction | valid | `\frac{2}{4}` | equivalent | true | scalar |
| limit-L4-3 | limit | L4 | decimal_approx | valid | — | skip | — | — |
| derivative-L4-3 | derivative | L4 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| derivative-L4-3 | derivative | L4 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| derivative-L4-3 | derivative | L4 | far_number | wrong | `999999` | uncertain | — | model |
| derivative-L4-3 | derivative | L4 | double_wrapped | wrong | — | skip | — | — |
| derivative-L4-3 | derivative | L4 | sign_flip | wrong | — | skip | — | — |
| derivative-L4-3 | derivative | L4 | double_paren | wrong | — | skip | — | — |
| derivative-L4-3 | derivative | L4 | double_cdot | wrong | — | skip | — | — |
| derivative-L4-3 | derivative | L4 | double_times | wrong | — | skip | — | — |
| derivative-L4-3 | derivative | L4 | half_shorthand | wrong | — | skip | — | — |
| derivative-L4-3 | derivative | L4 | plus_one | wrong | `\left(0\right)+1` | uncertain | — | model |
| derivative-L4-3 | derivative | L4 | minus_one | wrong | `\left(0\right)-1` | uncertain | — | model |
| derivative-L4-3 | derivative | L4 | paren_wrap | valid | `\left(0\right)` | uncertain | — | model |
| derivative-L4-3 | derivative | L4 | double_negation | valid | `-\left(-\left(0\right)\right)` | uncertain | — | model |
| derivative-L4-3 | derivative | L4 | times_one | valid | `1\cdot\left(0\right)` | uncertain | — | model |
| derivative-L4-3 | derivative | L4 | wrapped_twice | valid | `\frac12\left(2\left(0\right)\right)` | uncertain | — | model |
| derivative-L4-3 | derivative | L4 | equivalent_fraction | valid | — | skip | — | — |
| derivative-L4-3 | derivative | L4 | decimal_approx | valid | — | skip | — | — |
| integral-L4-3 | integral | L4 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| integral-L4-3 | integral | L4 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| integral-L4-3 | integral | L4 | far_number | wrong | `999999` | not_equivalent | false | structural |
| integral-L4-3 | integral | L4 | double_wrapped | wrong | `2\left(\frac{\pi}{4}\right)` | not_equivalent | false | structural |
| integral-L4-3 | integral | L4 | sign_flip | wrong | `-\left(\frac{\pi}{4}\right)` | not_equivalent | false | structural |
| integral-L4-3 | integral | L4 | double_paren | wrong | `2(\frac{\pi}{4})` | not_equivalent | false | structural |
| integral-L4-3 | integral | L4 | double_cdot | wrong | `2\cdot\left(\frac{\pi}{4}\right)` | not_equivalent | false | structural |
| integral-L4-3 | integral | L4 | double_times | wrong | `2\times\left(\frac{\pi}{4}\right)` | not_equivalent | false | structural |
| integral-L4-3 | integral | L4 | half_shorthand | wrong | `\frac12\left(\frac{\pi}{4}\right)` | not_equivalent | false | structural |
| integral-L4-3 | integral | L4 | plus_one | wrong | — | skip | — | — |
| integral-L4-3 | integral | L4 | minus_one | wrong | — | skip | — | — |
| integral-L4-3 | integral | L4 | paren_wrap | valid | `\left(\frac{\pi}{4}\right)` | equivalent | true | structural |
| integral-L4-3 | integral | L4 | double_negation | valid | `-\left(-\left(\frac{\pi}{4}\right)\right)` | equivalent | true | structural |
| integral-L4-3 | integral | L4 | times_one | valid | `1\cdot\left(\frac{\pi}{4}\right)` | equivalent | true | structural |
| integral-L4-3 | integral | L4 | wrapped_twice | valid | `\frac12\left(2\left(\frac{\pi}{4}\right)\right)` | equivalent | true | structural |
| integral-L4-3 | integral | L4 | equivalent_fraction | valid | — | skip | — | — |
| integral-L4-3 | integral | L4 | decimal_approx | valid | — | skip | — | — |
| limit-L6-1 | limit | L6 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| limit-L6-1 | limit | L6 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| limit-L6-1 | limit | L6 | far_number | wrong | `999999` | uncertain | — | model |
| limit-L6-1 | limit | L6 | double_wrapped | wrong | `2\left(\frac{2}{\pi}\right)` | uncertain | — | model |
| limit-L6-1 | limit | L6 | sign_flip | wrong | `-\left(\frac{2}{\pi}\right)` | uncertain | — | model |
| limit-L6-1 | limit | L6 | double_paren | wrong | `2(\frac{2}{\pi})` | uncertain | — | model |
| limit-L6-1 | limit | L6 | double_cdot | wrong | `2\cdot\left(\frac{2}{\pi}\right)` | uncertain | — | model |
| limit-L6-1 | limit | L6 | double_times | wrong | `2\times\left(\frac{2}{\pi}\right)` | uncertain | — | model |
| limit-L6-1 | limit | L6 | half_shorthand | wrong | `\frac12\left(\frac{2}{\pi}\right)` | uncertain | — | model |
| limit-L6-1 | limit | L6 | plus_one | wrong | `\left(\frac{2}{\pi}\right)+1` | uncertain | — | model |
| limit-L6-1 | limit | L6 | minus_one | wrong | `\left(\frac{2}{\pi}\right)-1` | uncertain | — | model |
| limit-L6-1 | limit | L6 | paren_wrap | valid | `\left(\frac{2}{\pi}\right)` | uncertain | — | model |
| limit-L6-1 | limit | L6 | double_negation | valid | `-\left(-\left(\frac{2}{\pi}\right)\right)` | uncertain | — | model |
| limit-L6-1 | limit | L6 | times_one | valid | `1\cdot\left(\frac{2}{\pi}\right)` | uncertain | — | model |
| limit-L6-1 | limit | L6 | wrapped_twice | valid | `\frac12\left(2\left(\frac{2}{\pi}\right)\right)` | uncertain | — | model |
| limit-L6-1 | limit | L6 | equivalent_fraction | valid | — | skip | — | — |
| limit-L6-1 | limit | L6 | decimal_approx | valid | — | skip | — | — |
| derivative-L6-2 | derivative | L6 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| derivative-L6-2 | derivative | L6 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| derivative-L6-2 | derivative | L6 | far_number | wrong | `999999` | not_equivalent | false | scalar |
| derivative-L6-2 | derivative | L6 | double_wrapped | wrong | — | skip | — | — |
| derivative-L6-2 | derivative | L6 | sign_flip | wrong | — | skip | — | — |
| derivative-L6-2 | derivative | L6 | double_paren | wrong | — | skip | — | — |
| derivative-L6-2 | derivative | L6 | double_cdot | wrong | — | skip | — | — |
| derivative-L6-2 | derivative | L6 | double_times | wrong | — | skip | — | — |
| derivative-L6-2 | derivative | L6 | half_shorthand | wrong | — | skip | — | — |
| derivative-L6-2 | derivative | L6 | plus_one | wrong | `\left(0\right)+1` | uncertain | — | model |
| derivative-L6-2 | derivative | L6 | minus_one | wrong | `\left(0\right)-1` | uncertain | — | model |
| derivative-L6-2 | derivative | L6 | paren_wrap | valid | `\left(0\right)` | equivalent | true | scalar |
| derivative-L6-2 | derivative | L6 | double_negation | valid | `-\left(-\left(0\right)\right)` | uncertain | — | model |
| derivative-L6-2 | derivative | L6 | times_one | valid | `1\cdot\left(0\right)` | uncertain | — | model |
| derivative-L6-2 | derivative | L6 | wrapped_twice | valid | `\frac12\left(2\left(0\right)\right)` | uncertain | — | model |
| derivative-L6-2 | derivative | L6 | equivalent_fraction | valid | — | skip | — | — |
| derivative-L6-2 | derivative | L6 | decimal_approx | valid | — | skip | — | — |
| integral-L6-1 | integral | L6 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| integral-L6-1 | integral | L6 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| integral-L6-1 | integral | L6 | far_number | wrong | `999999` | not_equivalent | false | structural |
| integral-L6-1 | integral | L6 | double_wrapped | wrong | `2\left(\ln|x|+C\right)` | not_equivalent | false | structural |
| integral-L6-1 | integral | L6 | sign_flip | wrong | `-\left(\ln|x|+C\right)` | not_equivalent | false | structural |
| integral-L6-1 | integral | L6 | double_paren | wrong | `2(\ln|x|+C)` | not_equivalent | false | structural |
| integral-L6-1 | integral | L6 | double_cdot | wrong | `2\cdot\left(\ln|x|+C\right)` | not_equivalent | false | structural |
| integral-L6-1 | integral | L6 | double_times | wrong | `2\times\left(\ln|x|+C\right)` | not_equivalent | false | structural |
| integral-L6-1 | integral | L6 | half_shorthand | wrong | `\frac12\left(\ln|x|+C\right)` | not_equivalent | false | structural |
| integral-L6-1 | integral | L6 | plus_one | wrong | — | skip | — | — |
| integral-L6-1 | integral | L6 | minus_one | wrong | — | skip | — | — |
| integral-L6-1 | integral | L6 | paren_wrap | valid | `\left(\ln|x|+C\right)` | equivalent | true | structural |
| integral-L6-1 | integral | L6 | double_negation | valid | `-\left(-\left(\ln|x|+C\right)\right)` | equivalent | true | structural |
| integral-L6-1 | integral | L6 | times_one | valid | `1\cdot\left(\ln|x|+C\right)` | equivalent | true | structural |
| integral-L6-1 | integral | L6 | wrapped_twice | valid | `\frac12\left(2\left(\ln|x|+C\right)\right)` | equivalent | true | structural |
| integral-L6-1 | integral | L6 | equivalent_fraction | valid | — | skip | — | — |
| integral-L6-1 | integral | L6 | decimal_approx | valid | — | skip | — | — |
| limit-L6-2 | limit | L6 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| limit-L6-2 | limit | L6 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| limit-L6-2 | limit | L6 | far_number | wrong | `999999` | not_equivalent | false | scalar |
| limit-L6-2 | limit | L6 | double_wrapped | wrong | `2\left(1\right)` | uncertain | — | model |
| limit-L6-2 | limit | L6 | sign_flip | wrong | `-\left(1\right)` | not_equivalent | false | scalar |
| limit-L6-2 | limit | L6 | double_paren | wrong | `2(1)` | uncertain | — | model |
| limit-L6-2 | limit | L6 | double_cdot | wrong | `2\cdot\left(1\right)` | uncertain | — | model |
| limit-L6-2 | limit | L6 | double_times | wrong | `2\times\left(1\right)` | uncertain | — | model |
| limit-L6-2 | limit | L6 | half_shorthand | wrong | `\frac12\left(1\right)` | uncertain | — | model |
| limit-L6-2 | limit | L6 | plus_one | wrong | `\left(1\right)+1` | uncertain | — | model |
| limit-L6-2 | limit | L6 | minus_one | wrong | `\left(1\right)-1` | uncertain | — | model |
| limit-L6-2 | limit | L6 | paren_wrap | valid | `\left(1\right)` | equivalent | true | scalar |
| limit-L6-2 | limit | L6 | double_negation | valid | `-\left(-\left(1\right)\right)` | uncertain | — | model |
| limit-L6-2 | limit | L6 | times_one | valid | `1\cdot\left(1\right)` | uncertain | — | model |
| limit-L6-2 | limit | L6 | wrapped_twice | valid | `\frac12\left(2\left(1\right)\right)` | uncertain | — | model |
| limit-L6-2 | limit | L6 | equivalent_fraction | valid | — | skip | — | — |
| limit-L6-2 | limit | L6 | decimal_approx | valid | — | skip | — | — |
| derivative-L6-3 | derivative | L6 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| derivative-L6-3 | derivative | L6 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| derivative-L6-3 | derivative | L6 | far_number | wrong | `999999` | uncertain | — | model |
| derivative-L6-3 | derivative | L6 | double_wrapped | wrong | `2\left(\frac{2}{\sqrt{x^2+1}}\right)` | uncertain | — | model |
| derivative-L6-3 | derivative | L6 | sign_flip | wrong | `-\left(\frac{2}{\sqrt{x^2+1}}\right)` | uncertain | — | model |
| derivative-L6-3 | derivative | L6 | double_paren | wrong | `2(\frac{2}{\sqrt{x^2+1}})` | uncertain | — | model |
| derivative-L6-3 | derivative | L6 | double_cdot | wrong | `2\cdot\left(\frac{2}{\sqrt{x^2+1}}\right)` | uncertain | — | model |
| derivative-L6-3 | derivative | L6 | double_times | wrong | `2\times\left(\frac{2}{\sqrt{x^2+1}}\right)` | uncertain | — | model |
| derivative-L6-3 | derivative | L6 | half_shorthand | wrong | `\frac12\left(\frac{2}{\sqrt{x^2+1}}\right)` | uncertain | — | model |
| derivative-L6-3 | derivative | L6 | plus_one | wrong | `\left(\frac{2}{\sqrt{x^2+1}}\right)+1` | uncertain | — | model |
| derivative-L6-3 | derivative | L6 | minus_one | wrong | `\left(\frac{2}{\sqrt{x^2+1}}\right)-1` | uncertain | — | model |
| derivative-L6-3 | derivative | L6 | paren_wrap | valid | `\left(\frac{2}{\sqrt{x^2+1}}\right)` | uncertain | — | model |
| derivative-L6-3 | derivative | L6 | double_negation | valid | `-\left(-\left(\frac{2}{\sqrt{x^2+1}}\right)\right)` | uncertain | — | model |
| derivative-L6-3 | derivative | L6 | times_one | valid | `1\cdot\left(\frac{2}{\sqrt{x^2+1}}\right)` | uncertain | — | model |
| derivative-L6-3 | derivative | L6 | wrapped_twice | valid | `\frac12\left(2\left(\frac{2}{\sqrt{x^2+1}}\right)\right)` | uncertain | — | model |
| derivative-L6-3 | derivative | L6 | equivalent_fraction | valid | — | skip | — | — |
| derivative-L6-3 | derivative | L6 | decimal_approx | valid | — | skip | — | — |
| integral-L6-2 | integral | L6 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| integral-L6-2 | integral | L6 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| integral-L6-2 | integral | L6 | far_number | wrong | `999999` | not_equivalent | false | structural |
| integral-L6-2 | integral | L6 | double_wrapped | wrong | `2\left(\frac{\pi}{4}\right)` | not_equivalent | false | structural |
| integral-L6-2 | integral | L6 | sign_flip | wrong | `-\left(\frac{\pi}{4}\right)` | not_equivalent | false | structural |
| integral-L6-2 | integral | L6 | double_paren | wrong | `2(\frac{\pi}{4})` | not_equivalent | false | structural |
| integral-L6-2 | integral | L6 | double_cdot | wrong | `2\cdot\left(\frac{\pi}{4}\right)` | not_equivalent | false | structural |
| integral-L6-2 | integral | L6 | double_times | wrong | `2\times\left(\frac{\pi}{4}\right)` | not_equivalent | false | structural |
| integral-L6-2 | integral | L6 | half_shorthand | wrong | `\frac12\left(\frac{\pi}{4}\right)` | not_equivalent | false | structural |
| integral-L6-2 | integral | L6 | plus_one | wrong | — | skip | — | — |
| integral-L6-2 | integral | L6 | minus_one | wrong | — | skip | — | — |
| integral-L6-2 | integral | L6 | paren_wrap | valid | `\left(\frac{\pi}{4}\right)` | equivalent | true | structural |
| integral-L6-2 | integral | L6 | double_negation | valid | `-\left(-\left(\frac{\pi}{4}\right)\right)` | equivalent | true | structural |
| integral-L6-2 | integral | L6 | times_one | valid | `1\cdot\left(\frac{\pi}{4}\right)` | equivalent | true | structural |
| integral-L6-2 | integral | L6 | wrapped_twice | valid | `\frac12\left(2\left(\frac{\pi}{4}\right)\right)` | equivalent | true | structural |
| integral-L6-2 | integral | L6 | equivalent_fraction | valid | — | skip | — | — |
| integral-L6-2 | integral | L6 | decimal_approx | valid | — | skip | — | — |
| limit-L6-3 | limit | L6 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| limit-L6-3 | limit | L6 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| limit-L6-3 | limit | L6 | far_number | wrong | `999999` | not_equivalent | false | scalar |
| limit-L6-3 | limit | L6 | double_wrapped | wrong | `2\left(\frac{1}{3}\right)` | not_equivalent | false | structural |
| limit-L6-3 | limit | L6 | sign_flip | wrong | `-\left(\frac{1}{3}\right)` | not_equivalent | false | structural |
| limit-L6-3 | limit | L6 | double_paren | wrong | `2(\frac{1}{3})` | not_equivalent | false | structural |
| limit-L6-3 | limit | L6 | double_cdot | wrong | `2\cdot\left(\frac{1}{3}\right)` | not_equivalent | false | structural |
| limit-L6-3 | limit | L6 | double_times | wrong | `2\times\left(\frac{1}{3}\right)` | not_equivalent | false | structural |
| limit-L6-3 | limit | L6 | half_shorthand | wrong | `\frac12\left(\frac{1}{3}\right)` | not_equivalent | false | structural |
| limit-L6-3 | limit | L6 | plus_one | wrong | `\left(\frac{1}{3}\right)+1` | not_equivalent | false | structural |
| limit-L6-3 | limit | L6 | minus_one | wrong | `\left(\frac{1}{3}\right)-1` | not_equivalent | false | structural |
| limit-L6-3 | limit | L6 | paren_wrap | valid | `\left(\frac{1}{3}\right)` | equivalent | true | structural |
| limit-L6-3 | limit | L6 | double_negation | valid | `-\left(-\left(\frac{1}{3}\right)\right)` | equivalent | true | structural |
| limit-L6-3 | limit | L6 | times_one | valid | `1\cdot\left(\frac{1}{3}\right)` | equivalent | true | structural |
| limit-L6-3 | limit | L6 | wrapped_twice | valid | `\frac12\left(2\left(\frac{1}{3}\right)\right)` | equivalent | true | structural |
| limit-L6-3 | limit | L6 | equivalent_fraction | valid | `\frac{2}{6}` | equivalent | true | scalar |
| limit-L6-3 | limit | L6 | decimal_approx | valid | `0.3333333333` | equivalent | true | scalar |
| derivative-L8-2 | derivative | L8 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| derivative-L8-2 | derivative | L8 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| derivative-L8-2 | derivative | L8 | far_number | wrong | `999999` | not_equivalent | false | structural |
| derivative-L8-2 | derivative | L8 | double_wrapped | wrong | `2\left(\frac{1}{2}\sqrt{\frac{(x-1)(x-2)}{(x-3)(x-4)}}\left(\frac{1}{x-1}+\frac{1}{x-2}-\frac{1}{x-3}-\frac{1}{x-4}\right)\right)` | not_equivalent | false | structural |
| derivative-L8-2 | derivative | L8 | sign_flip | wrong | `-\left(\frac{1}{2}\sqrt{\frac{(x-1)(x-2)}{(x-3)(x-4)}}\left(\frac{1}{x-1}+\frac{1}{x-2}-\frac{1}{x-3}-\frac{1}{x-4}\right)\right)` | not_equivalent | false | structural |
| derivative-L8-2 | derivative | L8 | double_paren | wrong | `2(\frac{1}{2}\sqrt{\frac{(x-1)(x-2)}{(x-3)(x-4)}}\left(\frac{1}{x-1}+\frac{1}{x-2}-\frac{1}{x-3}-\frac{1}{x-4}\right))` | not_equivalent | false | structural |
| derivative-L8-2 | derivative | L8 | double_cdot | wrong | `2\cdot\left(\frac{1}{2}\sqrt{\frac{(x-1)(x-2)}{(x-3)(x-4)}}\left(\frac{1}{x-1}+\frac{1}{x-2}-\frac{1}{x-3}-\frac{1}{x-4}\right)\right)` | not_equivalent | false | structural |
| derivative-L8-2 | derivative | L8 | double_times | wrong | `2\times\left(\frac{1}{2}\sqrt{\frac{(x-1)(x-2)}{(x-3)(x-4)}}\left(\frac{1}{x-1}+\frac{1}{x-2}-\frac{1}{x-3}-\frac{1}{x-4}\right)\right)` | not_equivalent | false | structural |
| derivative-L8-2 | derivative | L8 | half_shorthand | wrong | `\frac12\left(\frac{1}{2}\sqrt{\frac{(x-1)(x-2)}{(x-3)(x-4)}}\left(\frac{1}{x-1}+\frac{1}{x-2}-\frac{1}{x-3}-\frac{1}{x-4}\right)\right)` | not_equivalent | false | structural |
| derivative-L8-2 | derivative | L8 | plus_one | wrong | `\left(\frac{1}{2}\sqrt{\frac{(x-1)(x-2)}{(x-3)(x-4)}}\left(\frac{1}{x-1}+\frac{1}{x-2}-\frac{1}{x-3}-\frac{1}{x-4}\right)\right)+1` | not_equivalent | false | structural |
| derivative-L8-2 | derivative | L8 | minus_one | wrong | `\left(\frac{1}{2}\sqrt{\frac{(x-1)(x-2)}{(x-3)(x-4)}}\left(\frac{1}{x-1}+\frac{1}{x-2}-\frac{1}{x-3}-\frac{1}{x-4}\right)\right)-1` | not_equivalent | false | structural |
| derivative-L8-2 | derivative | L8 | paren_wrap | valid | `\left(\frac{1}{2}\sqrt{\frac{(x-1)(x-2)}{(x-3)(x-4)}}\left(\frac{1}{x-1}+\frac{1}{x-2}-\frac{1}{x-3}-\frac{1}{x-4}\right)\right)` | equivalent | true | structural |
| derivative-L8-2 | derivative | L8 | double_negation | valid | `-\left(-\left(\frac{1}{2}\sqrt{\frac{(x-1)(x-2)}{(x-3)(x-4)}}\left(\frac{1}{x-1}+\frac{1}{x-2}-\frac{1}{x-3}-\frac{1}{x-4}\right)\right)\right)` | equivalent | true | structural |
| derivative-L8-2 | derivative | L8 | times_one | valid | `1\cdot\left(\frac{1}{2}\sqrt{\frac{(x-1)(x-2)}{(x-3)(x-4)}}\left(\frac{1}{x-1}+\frac{1}{x-2}-\frac{1}{x-3}-\frac{1}{x-4}\right)\right)` | equivalent | true | structural |
| derivative-L8-2 | derivative | L8 | wrapped_twice | valid | `\frac12\left(2\left(\frac{1}{2}\sqrt{\frac{(x-1)(x-2)}{(x-3)(x-4)}}\left(\frac{1}{x-1}+\frac{1}{x-2}-\frac{1}{x-3}-\frac{1}{x-4}\right)\right)\right)` | equivalent | true | structural |
| derivative-L8-2 | derivative | L8 | equivalent_fraction | valid | — | skip | — | — |
| derivative-L8-2 | derivative | L8 | decimal_approx | valid | — | skip | — | — |
| integral-L6-3 | integral | L6 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| integral-L6-3 | integral | L6 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| integral-L6-3 | integral | L6 | far_number | wrong | `999999` | not_equivalent | false | structural |
| integral-L6-3 | integral | L6 | double_wrapped | wrong | `2\left(\frac{x^2+1}{2}\arctan x-\frac{x}{2}+C\right)` | not_equivalent | false | structural |
| integral-L6-3 | integral | L6 | sign_flip | wrong | `-\left(\frac{x^2+1}{2}\arctan x-\frac{x}{2}+C\right)` | not_equivalent | false | structural |
| integral-L6-3 | integral | L6 | double_paren | wrong | `2(\frac{x^2+1}{2}\arctan x-\frac{x}{2}+C)` | not_equivalent | false | structural |
| integral-L6-3 | integral | L6 | double_cdot | wrong | `2\cdot\left(\frac{x^2+1}{2}\arctan x-\frac{x}{2}+C\right)` | not_equivalent | false | structural |
| integral-L6-3 | integral | L6 | double_times | wrong | `2\times\left(\frac{x^2+1}{2}\arctan x-\frac{x}{2}+C\right)` | not_equivalent | false | structural |
| integral-L6-3 | integral | L6 | half_shorthand | wrong | `\frac12\left(\frac{x^2+1}{2}\arctan x-\frac{x}{2}+C\right)` | not_equivalent | false | structural |
| integral-L6-3 | integral | L6 | plus_one | wrong | — | skip | — | — |
| integral-L6-3 | integral | L6 | minus_one | wrong | — | skip | — | — |
| integral-L6-3 | integral | L6 | paren_wrap | valid | `\left(\frac{x^2+1}{2}\arctan x-\frac{x}{2}+C\right)` | equivalent | true | structural |
| integral-L6-3 | integral | L6 | double_negation | valid | `-\left(-\left(\frac{x^2+1}{2}\arctan x-\frac{x}{2}+C\right)\right)` | equivalent | true | structural |
| integral-L6-3 | integral | L6 | times_one | valid | `1\cdot\left(\frac{x^2+1}{2}\arctan x-\frac{x}{2}+C\right)` | equivalent | true | structural |
| integral-L6-3 | integral | L6 | wrapped_twice | valid | `\frac12\left(2\left(\frac{x^2+1}{2}\arctan x-\frac{x}{2}+C\right)\right)` | equivalent | true | structural |
| integral-L6-3 | integral | L6 | equivalent_fraction | valid | — | skip | — | — |
| integral-L6-3 | integral | L6 | decimal_approx | valid | — | skip | — | — |
| limit-L8-1 | limit | L8 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| limit-L8-1 | limit | L8 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| limit-L8-1 | limit | L8 | far_number | wrong | `999999` | not_equivalent | false | scalar |
| limit-L8-1 | limit | L8 | double_wrapped | wrong | `2\left(1\right)` | uncertain | — | model |
| limit-L8-1 | limit | L8 | sign_flip | wrong | `-\left(1\right)` | not_equivalent | false | scalar |
| limit-L8-1 | limit | L8 | double_paren | wrong | `2(1)` | uncertain | — | model |
| limit-L8-1 | limit | L8 | double_cdot | wrong | `2\cdot\left(1\right)` | uncertain | — | model |
| limit-L8-1 | limit | L8 | double_times | wrong | `2\times\left(1\right)` | uncertain | — | model |
| limit-L8-1 | limit | L8 | half_shorthand | wrong | `\frac12\left(1\right)` | uncertain | — | model |
| limit-L8-1 | limit | L8 | plus_one | wrong | `\left(1\right)+1` | uncertain | — | model |
| limit-L8-1 | limit | L8 | minus_one | wrong | `\left(1\right)-1` | uncertain | — | model |
| limit-L8-1 | limit | L8 | paren_wrap | valid | `\left(1\right)` | equivalent | true | scalar |
| limit-L8-1 | limit | L8 | double_negation | valid | `-\left(-\left(1\right)\right)` | uncertain | — | model |
| limit-L8-1 | limit | L8 | times_one | valid | `1\cdot\left(1\right)` | uncertain | — | model |
| limit-L8-1 | limit | L8 | wrapped_twice | valid | `\frac12\left(2\left(1\right)\right)` | uncertain | — | model |
| limit-L8-1 | limit | L8 | equivalent_fraction | valid | — | skip | — | — |
| limit-L8-1 | limit | L8 | decimal_approx | valid | — | skip | — | — |
| derivative-L8-3 | derivative | L8 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| derivative-L8-3 | derivative | L8 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| derivative-L8-3 | derivative | L8 | far_number | wrong | `999999` | uncertain | — | model |
| derivative-L8-3 | derivative | L8 | double_wrapped | wrong | `2\left(\frac{-18}{(x+2y)^3}\right)` | uncertain | — | model |
| derivative-L8-3 | derivative | L8 | sign_flip | wrong | `-\left(\frac{-18}{(x+2y)^3}\right)` | uncertain | — | model |
| derivative-L8-3 | derivative | L8 | double_paren | wrong | `2(\frac{-18}{(x+2y)^3})` | uncertain | — | model |
| derivative-L8-3 | derivative | L8 | double_cdot | wrong | `2\cdot\left(\frac{-18}{(x+2y)^3}\right)` | uncertain | — | model |
| derivative-L8-3 | derivative | L8 | double_times | wrong | `2\times\left(\frac{-18}{(x+2y)^3}\right)` | uncertain | — | model |
| derivative-L8-3 | derivative | L8 | half_shorthand | wrong | `\frac12\left(\frac{-18}{(x+2y)^3}\right)` | uncertain | — | model |
| derivative-L8-3 | derivative | L8 | plus_one | wrong | `\left(\frac{-18}{(x+2y)^3}\right)+1` | uncertain | — | model |
| derivative-L8-3 | derivative | L8 | minus_one | wrong | `\left(\frac{-18}{(x+2y)^3}\right)-1` | uncertain | — | model |
| derivative-L8-3 | derivative | L8 | paren_wrap | valid | `\left(\frac{-18}{(x+2y)^3}\right)` | uncertain | — | model |
| derivative-L8-3 | derivative | L8 | double_negation | valid | `-\left(-\left(\frac{-18}{(x+2y)^3}\right)\right)` | uncertain | — | model |
| derivative-L8-3 | derivative | L8 | times_one | valid | `1\cdot\left(\frac{-18}{(x+2y)^3}\right)` | uncertain | — | model |
| derivative-L8-3 | derivative | L8 | wrapped_twice | valid | `\frac12\left(2\left(\frac{-18}{(x+2y)^3}\right)\right)` | uncertain | — | model |
| derivative-L8-3 | derivative | L8 | equivalent_fraction | valid | — | skip | — | — |
| derivative-L8-3 | derivative | L8 | decimal_approx | valid | — | skip | — | — |

