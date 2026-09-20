# Judge 专项压力测试 · 本地判定版（Task #4 · D）

- 题源：`.workbuddy/smoke/2026-09-19T16-04-21-after-report/questions.jsonl`
- 题目数：41（可用 41）
- 错答探针定义 11 条 / 合法古怪探针定义 6 条
- 生成的探针：错答 395 条、合法 171 条，跳过 131 条

## 核心验收

| 指标 | 值 |
| --- | --- |
| **错答被放行（wrong_answer_accepted，须为 0）** | **0** |
| 错答被拒 | 141 |
| 错答落到模型（引擎判不了） | 254 |
| 合法写法被误拒（correct:false） | 4 |
| 合法写法落到模型 | 90 |
| 确定性覆盖率 · 错答探针 | 35.7%（标量 13 + 结构 128） |
| 确定性覆盖率 · 合法探针 | 47.4%（标量 13 + 结构 68） |

## 与 Task #4 之前的口径对比

Task #4 之前判题只调 `compare()`（标量专用），表达式形态一律落给模型。
`compare` 这次没动，所以「旧口径」可以直接算出来 —— 增益不是估的。

| 指标 | Task #4 之前 | Task #4 之后 |
| --- | --- | --- |
| 错答探针由确定性引擎判死 | 3.3%（13/395） | 35.7%（141/395） |
| 错答探针落到模型 | 382/395 | 254/395 |
| 合法探针由确定性引擎判死 | 7.6%（13/171） | 47.4%（81/171） |
| 错答被放行 | 取决于模型（实测线上 6/40 误批） | 0（结构上不可能 > 0） |

## 结论

- ✅ 没有任何一条错答探针被判成 `correct: true`。
- 这不是抽样运气：`correct:true` 只有一条来路 —— 确定性引擎判 `equivalent`。
  模型那条路按 Task #4 的规则只采信 `not_equivalent`，产不出 `correct:true`。
  所以「错答放行 = 0」是结构性保证，前提只是「线上跑的是这一版代码」。

- ⚠️ 还有 254 条错答引擎判不了、会去问模型。
  模型最多只能把它们判「错」，不会放行；但会多消耗一次模型调用，且判不出来时用户会看到「暂时无法可靠判断」。

## 仍未被引擎判死的错答（会落到模型）

| 题 | 模块 | 参考答案 | 探针 | 提交的答案 | 本地结论 |
| --- | --- | --- | --- | --- | --- |
| limit-L4-1 | limit | `1/6` | plain_refusal | `我不会做` | uncertain |
| limit-L4-1 | limit | `1/6` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
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
| limit-L6-2 | limit | `1` | plain_refusal | `我不会做` | uncertain |
| limit-L6-2 | limit | `1` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| limit-L6-2 | limit | `1` | double_wrapped | `2\left(1\right)` | uncertain |
| limit-L6-2 | limit | `1` | double_paren | `2(1)` | uncertain |
| limit-L6-2 | limit | `1` | double_cdot | `2\cdot\left(1\right)` | uncertain |
| limit-L6-2 | limit | `1` | double_times | `2\times\left(1\right)` | uncertain |
| limit-L6-2 | limit | `1` | half_shorthand | `\frac12\left(1\right)` | uncertain |
| limit-L6-2 | limit | `1` | plus_one | `\left(1\right)+1` | uncertain |
| limit-L6-2 | limit | `1` | minus_one | `\left(1\right)-1` | uncertain |
| limit-L6-3 | limit | `\frac{1}{3}` | plain_refusal | `我不会做` | uncertain |
| limit-L6-3 | limit | `\frac{1}{3}` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| limit-L8-2 | limit | `e^{-1/3}` | plain_refusal | `我不会做` | uncertain |
| limit-L8-2 | limit | `e^{-1/3}` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| limit-L8-3 | limit | `-4` | plain_refusal | `我不会做` | uncertain |
| limit-L8-3 | limit | `-4` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| limit-L8-3 | limit | `-4` | double_wrapped | `2\left(-4\right)` | uncertain |
| limit-L8-3 | limit | `-4` | sign_flip | `-\left(-4\right)` | uncertain |
| limit-L8-3 | limit | `-4` | double_paren | `2(-4)` | uncertain |
| limit-L8-3 | limit | `-4` | double_cdot | `2\cdot\left(-4\right)` | uncertain |
| limit-L8-3 | limit | `-4` | double_times | `2\times\left(-4\right)` | uncertain |
| limit-L8-3 | limit | `-4` | half_shorthand | `\frac12\left(-4\right)` | uncertain |
| limit-L8-3 | limit | `-4` | plus_one | `\left(-4\right)+1` | uncertain |
| limit-L8-3 | limit | `-4` | minus_one | `\left(-4\right)-1` | uncertain |
| limit-L10-1 | limit | `-\frac{1}{3}` | plain_refusal | `我不会做` | uncertain |
| limit-L10-1 | limit | `-\frac{1}{3}` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| limit-L10-2 | limit | `-\frac{1}{6}` | plain_refusal | `我不会做` | uncertain |
| limit-L10-2 | limit | `-\frac{1}{6}` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| limit-L10-2 | limit | `-\frac{1}{6}` | double_wrapped | `2\left(-\frac{1}{6}\right)` | uncertain |
| limit-L10-2 | limit | `-\frac{1}{6}` | sign_flip | `-\left(-\frac{1}{6}\right)` | uncertain |
| limit-L10-2 | limit | `-\frac{1}{6}` | double_paren | `2(-\frac{1}{6})` | uncertain |
| limit-L10-2 | limit | `-\frac{1}{6}` | double_cdot | `2\cdot\left(-\frac{1}{6}\right)` | uncertain |
| limit-L10-2 | limit | `-\frac{1}{6}` | double_times | `2\times\left(-\frac{1}{6}\right)` | uncertain |
| limit-L10-2 | limit | `-\frac{1}{6}` | half_shorthand | `\frac12\left(-\frac{1}{6}\right)` | uncertain |
| limit-L10-2 | limit | `-\frac{1}{6}` | plus_one | `\left(-\frac{1}{6}\right)+1` | uncertain |
| limit-L10-2 | limit | `-\frac{1}{6}` | minus_one | `\left(-\frac{1}{6}\right)-1` | uncertain |
| limit-L12-2 | limit | `-\frac{2447e}{5760}` | plain_refusal | `我不会做` | uncertain |
| limit-L12-2 | limit | `-\frac{2447e}{5760}` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| limit-L12-2 | limit | `-\frac{2447e}{5760}` | far_number | `999999` | uncertain |
| limit-L12-2 | limit | `-\frac{2447e}{5760}` | double_wrapped | `2\left(-\frac{2447e}{5760}\right)` | uncertain |
| limit-L12-2 | limit | `-\frac{2447e}{5760}` | sign_flip | `-\left(-\frac{2447e}{5760}\right)` | uncertain |
| limit-L12-2 | limit | `-\frac{2447e}{5760}` | double_paren | `2(-\frac{2447e}{5760})` | uncertain |
| limit-L12-2 | limit | `-\frac{2447e}{5760}` | double_cdot | `2\cdot\left(-\frac{2447e}{5760}\right)` | uncertain |
| limit-L12-2 | limit | `-\frac{2447e}{5760}` | double_times | `2\times\left(-\frac{2447e}{5760}\right)` | uncertain |
| limit-L12-2 | limit | `-\frac{2447e}{5760}` | half_shorthand | `\frac12\left(-\frac{2447e}{5760}\right)` | uncertain |
| limit-L12-2 | limit | `-\frac{2447e}{5760}` | plus_one | `\left(-\frac{2447e}{5760}\right)+1` | uncertain |
| limit-L12-2 | limit | `-\frac{2447e}{5760}` | minus_one | `\left(-\frac{2447e}{5760}\right)-1` | uncertain |
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
| derivative-L4-2 | derivative | `0` | plain_refusal | `我不会做` | uncertain |
| derivative-L4-2 | derivative | `0` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| derivative-L4-2 | derivative | `0` | plus_one | `\left(0\right)+1` | uncertain |
| derivative-L4-2 | derivative | `0` | minus_one | `\left(0\right)-1` | uncertain |
| derivative-L4-3 | derivative | `可导，且 f'(0)=0` | plain_refusal | `我不会做` | uncertain |
| derivative-L4-3 | derivative | `可导，且 f'(0)=0` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| derivative-L4-3 | derivative | `可导，且 f'(0)=0` | far_number | `999999` | uncertain |
| derivative-L4-3 | derivative | `可导，且 f'(0)=0` | plus_one | `\left(0\right)+1` | uncertain |
| derivative-L4-3 | derivative | `可导，且 f'(0)=0` | minus_one | `\left(0\right)-1` | uncertain |
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
| derivative-L8-2 | derivative | `\frac{1}{2}\sqrt{\frac{(x-1)(x-2)}{(x-3)(x-4)}}\left(\frac{1}{x-1}+\frac{1}{x-2}-\frac{1}{x-3}-\frac{1}{x-4}\right)` | plain_refusal | `我不会做` | uncertain |
| derivative-L8-2 | derivative | `\frac{1}{2}\sqrt{\frac{(x-1)(x-2)}{(x-3)(x-4)}}\left(\frac{1}{x-1}+\frac{1}{x-2}-\frac{1}{x-3}-\frac{1}{x-4}\right)` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
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
| derivative-L10-1 | derivative | `\frac{(1+x^2)(\sin x+x\cos x)-2x^2\sin x}{(1+x^2)^2+x^2\sin^2 x}` | plain_refusal | `我不会做` | uncertain |
| derivative-L10-1 | derivative | `\frac{(1+x^2)(\sin x+x\cos x)-2x^2\sin x}{(1+x^2)^2+x^2\sin^2 x}` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| derivative-L10-2 | derivative | `-18/(x+2y)^3` | plain_refusal | `我不会做` | uncertain |
| derivative-L10-2 | derivative | `-18/(x+2y)^3` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| derivative-L10-2 | derivative | `-18/(x+2y)^3` | far_number | `999999` | uncertain |
| derivative-L10-2 | derivative | `-18/(x+2y)^3` | double_wrapped | `2\left(-18/(x+2y)^3\right)` | uncertain |
| derivative-L10-2 | derivative | `-18/(x+2y)^3` | sign_flip | `-\left(-18/(x+2y)^3\right)` | uncertain |
| derivative-L10-2 | derivative | `-18/(x+2y)^3` | double_paren | `2(-18/(x+2y)^3)` | uncertain |
| derivative-L10-2 | derivative | `-18/(x+2y)^3` | double_cdot | `2\cdot\left(-18/(x+2y)^3\right)` | uncertain |
| derivative-L10-2 | derivative | `-18/(x+2y)^3` | double_times | `2\times\left(-18/(x+2y)^3\right)` | uncertain |
| derivative-L10-2 | derivative | `-18/(x+2y)^3` | half_shorthand | `\frac12\left(-18/(x+2y)^3\right)` | uncertain |
| derivative-L10-2 | derivative | `-18/(x+2y)^3` | plus_one | `\left(-18/(x+2y)^3\right)+1` | uncertain |
| derivative-L10-2 | derivative | `-18/(x+2y)^3` | minus_one | `\left(-18/(x+2y)^3\right)-1` | uncertain |
| derivative-L10-4 | derivative | `2(1+t^2)` | plain_refusal | `我不会做` | uncertain |
| derivative-L10-4 | derivative | `2(1+t^2)` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| derivative-L10-4 | derivative | `2(1+t^2)` | far_number | `999999` | uncertain |
| derivative-L10-4 | derivative | `2(1+t^2)` | double_wrapped | `2\left(2(1+t^2)\right)` | uncertain |
| derivative-L10-4 | derivative | `2(1+t^2)` | sign_flip | `-\left(2(1+t^2)\right)` | uncertain |
| derivative-L10-4 | derivative | `2(1+t^2)` | double_paren | `2(2(1+t^2))` | uncertain |
| derivative-L10-4 | derivative | `2(1+t^2)` | double_cdot | `2\cdot\left(2(1+t^2)\right)` | uncertain |
| derivative-L10-4 | derivative | `2(1+t^2)` | double_times | `2\times\left(2(1+t^2)\right)` | uncertain |
| derivative-L10-4 | derivative | `2(1+t^2)` | half_shorthand | `\frac12\left(2(1+t^2)\right)` | uncertain |
| derivative-L10-4 | derivative | `2(1+t^2)` | plus_one | `\left(2(1+t^2)\right)+1` | uncertain |
| derivative-L10-4 | derivative | `2(1+t^2)` | minus_one | `\left(2(1+t^2)\right)-1` | uncertain |
| derivative-L12-1 | derivative | `\frac{d^2y}{dx^2}=-\frac{2xy}{(y^2-x)^3}` | plain_refusal | `我不会做` | uncertain |
| derivative-L12-1 | derivative | `\frac{d^2y}{dx^2}=-\frac{2xy}{(y^2-x)^3}` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| derivative-L12-1 | derivative | `\frac{d^2y}{dx^2}=-\frac{2xy}{(y^2-x)^3}` | far_number | `999999` | uncertain |
| derivative-L12-1 | derivative | `\frac{d^2y}{dx^2}=-\frac{2xy}{(y^2-x)^3}` | double_wrapped | `2\left(-\frac{2xy}{(y^2-x)^3}\right)` | uncertain |
| derivative-L12-1 | derivative | `\frac{d^2y}{dx^2}=-\frac{2xy}{(y^2-x)^3}` | sign_flip | `-\left(-\frac{2xy}{(y^2-x)^3}\right)` | uncertain |
| derivative-L12-1 | derivative | `\frac{d^2y}{dx^2}=-\frac{2xy}{(y^2-x)^3}` | double_paren | `2(-\frac{2xy}{(y^2-x)^3})` | uncertain |
| derivative-L12-1 | derivative | `\frac{d^2y}{dx^2}=-\frac{2xy}{(y^2-x)^3}` | double_cdot | `2\cdot\left(-\frac{2xy}{(y^2-x)^3}\right)` | uncertain |
| derivative-L12-1 | derivative | `\frac{d^2y}{dx^2}=-\frac{2xy}{(y^2-x)^3}` | double_times | `2\times\left(-\frac{2xy}{(y^2-x)^3}\right)` | uncertain |
| derivative-L12-1 | derivative | `\frac{d^2y}{dx^2}=-\frac{2xy}{(y^2-x)^3}` | half_shorthand | `\frac12\left(-\frac{2xy}{(y^2-x)^3}\right)` | uncertain |
| derivative-L12-1 | derivative | `\frac{d^2y}{dx^2}=-\frac{2xy}{(y^2-x)^3}` | plus_one | `\left(-\frac{2xy}{(y^2-x)^3}\right)+1` | uncertain |
| derivative-L12-1 | derivative | `\frac{d^2y}{dx^2}=-\frac{2xy}{(y^2-x)^3}` | minus_one | `\left(-\frac{2xy}{(y^2-x)^3}\right)-1` | uncertain |
| derivative-L12-2 | derivative | `\frac{5t^4+10t}{3t^2+3}` | plain_refusal | `我不会做` | uncertain |
| derivative-L12-2 | derivative | `\frac{5t^4+10t}{3t^2+3}` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| derivative-L12-2 | derivative | `\frac{5t^4+10t}{3t^2+3}` | far_number | `999999` | uncertain |
| derivative-L12-2 | derivative | `\frac{5t^4+10t}{3t^2+3}` | double_wrapped | `2\left(\frac{5t^4+10t}{3t^2+3}\right)` | uncertain |
| derivative-L12-2 | derivative | `\frac{5t^4+10t}{3t^2+3}` | sign_flip | `-\left(\frac{5t^4+10t}{3t^2+3}\right)` | uncertain |
| derivative-L12-2 | derivative | `\frac{5t^4+10t}{3t^2+3}` | double_paren | `2(\frac{5t^4+10t}{3t^2+3})` | uncertain |
| derivative-L12-2 | derivative | `\frac{5t^4+10t}{3t^2+3}` | double_cdot | `2\cdot\left(\frac{5t^4+10t}{3t^2+3}\right)` | uncertain |
| derivative-L12-2 | derivative | `\frac{5t^4+10t}{3t^2+3}` | double_times | `2\times\left(\frac{5t^4+10t}{3t^2+3}\right)` | uncertain |
| derivative-L12-2 | derivative | `\frac{5t^4+10t}{3t^2+3}` | half_shorthand | `\frac12\left(\frac{5t^4+10t}{3t^2+3}\right)` | uncertain |
| derivative-L12-2 | derivative | `\frac{5t^4+10t}{3t^2+3}` | plus_one | `\left(\frac{5t^4+10t}{3t^2+3}\right)+1` | uncertain |
| derivative-L12-2 | derivative | `\frac{5t^4+10t}{3t^2+3}` | minus_one | `\left(\frac{5t^4+10t}{3t^2+3}\right)-1` | uncertain |
| integral-L4-1 | integral | `-\frac{2}{1+\tan\frac{x}{2}}+C` | plain_refusal | `我不会做` | uncertain |
| integral-L4-1 | integral | `-\frac{2}{1+\tan\frac{x}{2}}+C` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| integral-L4-2 | integral | `3\ln|x-2|-2\ln|x-1|+C` | plain_refusal | `我不会做` | uncertain |
| integral-L4-2 | integral | `3\ln|x-2|-2\ln|x-1|+C` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| integral-L4-3 | integral | `\frac{\pi}{4}` | plain_refusal | `我不会做` | uncertain |
| integral-L4-3 | integral | `\frac{\pi}{4}` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| integral-L6-1 | integral | `\ln|x|+C` | plain_refusal | `我不会做` | uncertain |
| integral-L6-1 | integral | `\ln|x|+C` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| integral-L6-3 | integral | `\frac{x^2+1}{2}\arctan x-\frac{x}{2}+C` | plain_refusal | `我不会做` | uncertain |
| integral-L6-3 | integral | `\frac{x^2+1}{2}\arctan x-\frac{x}{2}+C` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| integral-L8-2 | integral | `\frac{e^{2x}}{13}(2\sin 3x-3\cos 3x)+C` | plain_refusal | `我不会做` | uncertain |
| integral-L8-2 | integral | `\frac{e^{2x}}{13}(2\sin 3x-3\cos 3x)+C` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| integral-L8-3 | integral | `\ln\left(x+1+\sqrt{x^2+2x+5}\right)+C` | plain_refusal | `我不会做` | uncertain |
| integral-L8-3 | integral | `\ln\left(x+1+\sqrt{x^2+2x+5}\right)+C` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| integral-L8-4 | integral | `\ln\left|1+\tan\frac{x}{2}\right|+C` | plain_refusal | `我不会做` | uncertain |
| integral-L8-4 | integral | `\ln\left|1+\tan\frac{x}{2}\right|+C` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| integral-L8-4 | integral | `\ln\left|1+\tan\frac{x}{2}\right|+C` | far_number | `999999` | uncertain |
| integral-L8-4 | integral | `\ln\left|1+\tan\frac{x}{2}\right|+C` | double_wrapped | `2\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)` | uncertain |
| integral-L8-4 | integral | `\ln\left|1+\tan\frac{x}{2}\right|+C` | sign_flip | `-\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)` | uncertain |
| integral-L8-4 | integral | `\ln\left|1+\tan\frac{x}{2}\right|+C` | double_paren | `2(\ln\left|1+\tan\frac{x}{2}\right|+C)` | uncertain |
| integral-L8-4 | integral | `\ln\left|1+\tan\frac{x}{2}\right|+C` | double_cdot | `2\cdot\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)` | uncertain |
| integral-L8-4 | integral | `\ln\left|1+\tan\frac{x}{2}\right|+C` | double_times | `2\times\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)` | uncertain |
| integral-L8-4 | integral | `\ln\left|1+\tan\frac{x}{2}\right|+C` | half_shorthand | `\frac12\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)` | uncertain |
| integral-L10-2 | integral | `\frac12\arcsin\frac{x^2+1}{\sqrt2\,x^2}+C` | plain_refusal | `我不会做` | uncertain |
| integral-L10-2 | integral | `\frac12\arcsin\frac{x^2+1}{\sqrt2\,x^2}+C` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| integral-L10-2 | integral | `\frac12\arcsin\frac{x^2+1}{\sqrt2\,x^2}+C` | far_number | `999999` | uncertain |
| integral-L10-2 | integral | `\frac12\arcsin\frac{x^2+1}{\sqrt2\,x^2}+C` | double_wrapped | `2\left(\frac12\arcsin\frac{x^2+1}{\sqrt2\,x^2}+C\right)` | uncertain |
| integral-L10-2 | integral | `\frac12\arcsin\frac{x^2+1}{\sqrt2\,x^2}+C` | sign_flip | `-\left(\frac12\arcsin\frac{x^2+1}{\sqrt2\,x^2}+C\right)` | uncertain |
| integral-L10-2 | integral | `\frac12\arcsin\frac{x^2+1}{\sqrt2\,x^2}+C` | double_paren | `2(\frac12\arcsin\frac{x^2+1}{\sqrt2\,x^2}+C)` | uncertain |
| integral-L10-2 | integral | `\frac12\arcsin\frac{x^2+1}{\sqrt2\,x^2}+C` | double_cdot | `2\cdot\left(\frac12\arcsin\frac{x^2+1}{\sqrt2\,x^2}+C\right)` | uncertain |
| integral-L10-2 | integral | `\frac12\arcsin\frac{x^2+1}{\sqrt2\,x^2}+C` | double_times | `2\times\left(\frac12\arcsin\frac{x^2+1}{\sqrt2\,x^2}+C\right)` | uncertain |
| integral-L10-2 | integral | `\frac12\arcsin\frac{x^2+1}{\sqrt2\,x^2}+C` | half_shorthand | `\frac12\left(\frac12\arcsin\frac{x^2+1}{\sqrt2\,x^2}+C\right)` | uncertain |
| integral-L10-3 | integral | `\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C` | plain_refusal | `我不会做` | uncertain |
| integral-L10-3 | integral | `\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| integral-L10-3 | integral | `\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C` | far_number | `999999` | uncertain |
| integral-L10-3 | integral | `\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C` | double_wrapped | `2\left(\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C\right)` | uncertain |
| integral-L10-3 | integral | `\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C` | sign_flip | `-\left(\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C\right)` | uncertain |
| integral-L10-3 | integral | `\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C` | double_paren | `2(\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C)` | uncertain |
| integral-L10-3 | integral | `\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C` | double_cdot | `2\cdot\left(\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C\right)` | uncertain |
| integral-L10-3 | integral | `\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C` | double_times | `2\times\left(\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C\right)` | uncertain |
| integral-L10-3 | integral | `\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C` | half_shorthand | `\frac12\left(\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C\right)` | uncertain |
| integral-L10-4 | integral | `\arctan x+\frac{1}{3}\arctan(x^3)+C` | plain_refusal | `我不会做` | uncertain |
| integral-L10-4 | integral | `\arctan x+\frac{1}{3}\arctan(x^3)+C` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| integral-L12-1 | integral | `-\frac12\ln\left|\frac{1+\sqrt{x^4+x^2+1}}{x^2}\right|+C` | plain_refusal | `我不会做` | uncertain |
| integral-L12-1 | integral | `-\frac12\ln\left|\frac{1+\sqrt{x^4+x^2+1}}{x^2}\right|+C` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| integral-L12-1 | integral | `-\frac12\ln\left|\frac{1+\sqrt{x^4+x^2+1}}{x^2}\right|+C` | far_number | `999999` | uncertain |
| integral-L12-1 | integral | `-\frac12\ln\left|\frac{1+\sqrt{x^4+x^2+1}}{x^2}\right|+C` | double_wrapped | `2\left(-\frac12\ln\left|\frac{1+\sqrt{x^4+x^2+1}}{x^2}\right|+C\right)` | uncertain |
| integral-L12-1 | integral | `-\frac12\ln\left|\frac{1+\sqrt{x^4+x^2+1}}{x^2}\right|+C` | sign_flip | `-\left(-\frac12\ln\left|\frac{1+\sqrt{x^4+x^2+1}}{x^2}\right|+C\right)` | uncertain |
| integral-L12-1 | integral | `-\frac12\ln\left|\frac{1+\sqrt{x^4+x^2+1}}{x^2}\right|+C` | double_paren | `2(-\frac12\ln\left|\frac{1+\sqrt{x^4+x^2+1}}{x^2}\right|+C)` | uncertain |
| integral-L12-1 | integral | `-\frac12\ln\left|\frac{1+\sqrt{x^4+x^2+1}}{x^2}\right|+C` | double_cdot | `2\cdot\left(-\frac12\ln\left|\frac{1+\sqrt{x^4+x^2+1}}{x^2}\right|+C\right)` | uncertain |
| integral-L12-1 | integral | `-\frac12\ln\left|\frac{1+\sqrt{x^4+x^2+1}}{x^2}\right|+C` | double_times | `2\times\left(-\frac12\ln\left|\frac{1+\sqrt{x^4+x^2+1}}{x^2}\right|+C\right)` | uncertain |
| integral-L12-1 | integral | `-\frac12\ln\left|\frac{1+\sqrt{x^4+x^2+1}}{x^2}\right|+C` | half_shorthand | `\frac12\left(-\frac12\ln\left|\frac{1+\sqrt{x^4+x^2+1}}{x^2}\right|+C\right)` | uncertain |

## 合法写法没被确定性判定（Task #4 之后这一侧的代价变高了）

| 题 | 模块 | 参考答案 | 探针 | 提交的答案 | 本地结论 |
| --- | --- | --- | --- | --- | --- |
| limit-L4-2 | limit | `\frac{2}{\pi}` | paren_wrap | `\left(\frac{2}{\pi}\right)` | uncertain |
| limit-L4-2 | limit | `\frac{2}{\pi}` | double_negation | `-\left(-\left(\frac{2}{\pi}\right)\right)` | uncertain |
| limit-L4-2 | limit | `\frac{2}{\pi}` | times_one | `1\cdot\left(\frac{2}{\pi}\right)` | uncertain |
| limit-L4-2 | limit | `\frac{2}{\pi}` | wrapped_twice | `\frac12\left(2\left(\frac{2}{\pi}\right)\right)` | uncertain |
| limit-L4-3 | limit | `\frac{1}{2}` | paren_wrap | `\left(\frac{1}{2}\right)` | uncertain |
| limit-L4-3 | limit | `\frac{1}{2}` | double_negation | `-\left(-\left(\frac{1}{2}\right)\right)` | uncertain |
| limit-L4-3 | limit | `\frac{1}{2}` | times_one | `1\cdot\left(\frac{1}{2}\right)` | uncertain |
| limit-L4-3 | limit | `\frac{1}{2}` | wrapped_twice | `\frac12\left(2\left(\frac{1}{2}\right)\right)` | uncertain |
| limit-L6-2 | limit | `1` | double_negation | `-\left(-\left(1\right)\right)` | uncertain |
| limit-L6-2 | limit | `1` | times_one | `1\cdot\left(1\right)` | uncertain |
| limit-L6-2 | limit | `1` | wrapped_twice | `\frac12\left(2\left(1\right)\right)` | uncertain |
| limit-L8-3 | limit | `-4` | double_negation | `-\left(-\left(-4\right)\right)` | uncertain |
| limit-L8-3 | limit | `-4` | times_one | `1\cdot\left(-4\right)` | uncertain |
| limit-L8-3 | limit | `-4` | wrapped_twice | `\frac12\left(2\left(-4\right)\right)` | uncertain |
| limit-L10-2 | limit | `-\frac{1}{6}` | paren_wrap | `\left(-\frac{1}{6}\right)` | uncertain |
| limit-L10-2 | limit | `-\frac{1}{6}` | double_negation | `-\left(-\left(-\frac{1}{6}\right)\right)` | uncertain |
| limit-L10-2 | limit | `-\frac{1}{6}` | times_one | `1\cdot\left(-\frac{1}{6}\right)` | uncertain |
| limit-L10-2 | limit | `-\frac{1}{6}` | wrapped_twice | `\frac12\left(2\left(-\frac{1}{6}\right)\right)` | uncertain |
| limit-L12-2 | limit | `-\frac{2447e}{5760}` | paren_wrap | `\left(-\frac{2447e}{5760}\right)` | uncertain |
| limit-L12-2 | limit | `-\frac{2447e}{5760}` | double_negation | `-\left(-\left(-\frac{2447e}{5760}\right)\right)` | uncertain |
| limit-L12-2 | limit | `-\frac{2447e}{5760}` | times_one | `1\cdot\left(-\frac{2447e}{5760}\right)` | uncertain |
| limit-L12-2 | limit | `-\frac{2447e}{5760}` | wrapped_twice | `\frac12\left(2\left(-\frac{2447e}{5760}\right)\right)` | uncertain |
| derivative-L4-1 | derivative | `\frac{\sin t}{1-\cos t}` | paren_wrap | `\left(\frac{\sin t}{1-\cos t}\right)` | uncertain |
| derivative-L4-1 | derivative | `\frac{\sin t}{1-\cos t}` | double_negation | `-\left(-\left(\frac{\sin t}{1-\cos t}\right)\right)` | uncertain |
| derivative-L4-1 | derivative | `\frac{\sin t}{1-\cos t}` | times_one | `1\cdot\left(\frac{\sin t}{1-\cos t}\right)` | uncertain |
| derivative-L4-1 | derivative | `\frac{\sin t}{1-\cos t}` | wrapped_twice | `\frac12\left(2\left(\frac{\sin t}{1-\cos t}\right)\right)` | uncertain |
| derivative-L4-2 | derivative | `0` | double_negation | `-\left(-\left(0\right)\right)` | uncertain |
| derivative-L4-2 | derivative | `0` | times_one | `1\cdot\left(0\right)` | uncertain |
| derivative-L4-2 | derivative | `0` | wrapped_twice | `\frac12\left(2\left(0\right)\right)` | uncertain |
| derivative-L4-3 | derivative | `可导，且 f'(0)=0` | paren_wrap | `\left(0\right)` | uncertain |
| derivative-L4-3 | derivative | `可导，且 f'(0)=0` | double_negation | `-\left(-\left(0\right)\right)` | uncertain |
| derivative-L4-3 | derivative | `可导，且 f'(0)=0` | times_one | `1\cdot\left(0\right)` | uncertain |
| derivative-L4-3 | derivative | `可导，且 f'(0)=0` | wrapped_twice | `\frac12\left(2\left(0\right)\right)` | uncertain |
| derivative-L6-3 | derivative | `\frac{2}{\sqrt{x^2+1}}` | paren_wrap | `\left(\frac{2}{\sqrt{x^2+1}}\right)` | uncertain |
| derivative-L6-3 | derivative | `\frac{2}{\sqrt{x^2+1}}` | double_negation | `-\left(-\left(\frac{2}{\sqrt{x^2+1}}\right)\right)` | uncertain |
| derivative-L6-3 | derivative | `\frac{2}{\sqrt{x^2+1}}` | times_one | `1\cdot\left(\frac{2}{\sqrt{x^2+1}}\right)` | uncertain |
| derivative-L6-3 | derivative | `\frac{2}{\sqrt{x^2+1}}` | wrapped_twice | `\frac12\left(2\left(\frac{2}{\sqrt{x^2+1}}\right)\right)` | uncertain |
| derivative-L8-3 | derivative | `\frac{-18}{(x+2y)^3}` | paren_wrap | `\left(\frac{-18}{(x+2y)^3}\right)` | uncertain |
| derivative-L8-3 | derivative | `\frac{-18}{(x+2y)^3}` | double_negation | `-\left(-\left(\frac{-18}{(x+2y)^3}\right)\right)` | uncertain |
| derivative-L8-3 | derivative | `\frac{-18}{(x+2y)^3}` | times_one | `1\cdot\left(\frac{-18}{(x+2y)^3}\right)` | uncertain |
| derivative-L8-3 | derivative | `\frac{-18}{(x+2y)^3}` | wrapped_twice | `\frac12\left(2\left(\frac{-18}{(x+2y)^3}\right)\right)` | uncertain |
| derivative-L10-2 | derivative | `-18/(x+2y)^3` | paren_wrap | `\left(-18/(x+2y)^3\right)` | uncertain |
| derivative-L10-2 | derivative | `-18/(x+2y)^3` | double_negation | `-\left(-\left(-18/(x+2y)^3\right)\right)` | uncertain |
| derivative-L10-2 | derivative | `-18/(x+2y)^3` | times_one | `1\cdot\left(-18/(x+2y)^3\right)` | uncertain |
| derivative-L10-2 | derivative | `-18/(x+2y)^3` | wrapped_twice | `\frac12\left(2\left(-18/(x+2y)^3\right)\right)` | uncertain |
| derivative-L10-4 | derivative | `2(1+t^2)` | paren_wrap | `\left(2(1+t^2)\right)` | uncertain |
| derivative-L10-4 | derivative | `2(1+t^2)` | double_negation | `-\left(-\left(2(1+t^2)\right)\right)` | uncertain |
| derivative-L10-4 | derivative | `2(1+t^2)` | times_one | `1\cdot\left(2(1+t^2)\right)` | uncertain |
| derivative-L10-4 | derivative | `2(1+t^2)` | wrapped_twice | `\frac12\left(2\left(2(1+t^2)\right)\right)` | uncertain |
| derivative-L12-1 | derivative | `\frac{d^2y}{dx^2}=-\frac{2xy}{(y^2-x)^3}` | paren_wrap | `\left(-\frac{2xy}{(y^2-x)^3}\right)` | uncertain |
| derivative-L12-1 | derivative | `\frac{d^2y}{dx^2}=-\frac{2xy}{(y^2-x)^3}` | double_negation | `-\left(-\left(-\frac{2xy}{(y^2-x)^3}\right)\right)` | uncertain |
| derivative-L12-1 | derivative | `\frac{d^2y}{dx^2}=-\frac{2xy}{(y^2-x)^3}` | times_one | `1\cdot\left(-\frac{2xy}{(y^2-x)^3}\right)` | uncertain |
| derivative-L12-1 | derivative | `\frac{d^2y}{dx^2}=-\frac{2xy}{(y^2-x)^3}` | wrapped_twice | `\frac12\left(2\left(-\frac{2xy}{(y^2-x)^3}\right)\right)` | uncertain |
| derivative-L12-2 | derivative | `\frac{5t^4+10t}{3t^2+3}` | paren_wrap | `\left(\frac{5t^4+10t}{3t^2+3}\right)` | uncertain |
| derivative-L12-2 | derivative | `\frac{5t^4+10t}{3t^2+3}` | double_negation | `-\left(-\left(\frac{5t^4+10t}{3t^2+3}\right)\right)` | uncertain |
| derivative-L12-2 | derivative | `\frac{5t^4+10t}{3t^2+3}` | times_one | `1\cdot\left(\frac{5t^4+10t}{3t^2+3}\right)` | uncertain |
| derivative-L12-2 | derivative | `\frac{5t^4+10t}{3t^2+3}` | wrapped_twice | `\frac12\left(2\left(\frac{5t^4+10t}{3t^2+3}\right)\right)` | uncertain |
| integral-L4-2 | integral | `3\ln|x-2|-2\ln|x-1|+C` | paren_wrap | `\left(3\ln|x-2|-2\ln|x-1|+C\right)` | not_equivalent |
| integral-L4-2 | integral | `3\ln|x-2|-2\ln|x-1|+C` | double_negation | `-\left(-\left(3\ln|x-2|-2\ln|x-1|+C\right)\right)` | not_equivalent |
| integral-L4-2 | integral | `3\ln|x-2|-2\ln|x-1|+C` | times_one | `1\cdot\left(3\ln|x-2|-2\ln|x-1|+C\right)` | not_equivalent |
| integral-L4-2 | integral | `3\ln|x-2|-2\ln|x-1|+C` | wrapped_twice | `\frac12\left(2\left(3\ln|x-2|-2\ln|x-1|+C\right)\right)` | not_equivalent |
| integral-L8-4 | integral | `\ln\left|1+\tan\frac{x}{2}\right|+C` | paren_wrap | `\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)` | uncertain |
| integral-L8-4 | integral | `\ln\left|1+\tan\frac{x}{2}\right|+C` | double_negation | `-\left(-\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)\right)` | uncertain |
| integral-L8-4 | integral | `\ln\left|1+\tan\frac{x}{2}\right|+C` | times_one | `1\cdot\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)` | uncertain |
| integral-L8-4 | integral | `\ln\left|1+\tan\frac{x}{2}\right|+C` | wrapped_twice | `\frac12\left(2\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)\right)` | uncertain |
| integral-L10-2 | integral | `\frac12\arcsin\frac{x^2+1}{\sqrt2\,x^2}+C` | paren_wrap | `\left(\frac12\arcsin\frac{x^2+1}{\sqrt2\,x^2}+C\right)` | uncertain |
| integral-L10-2 | integral | `\frac12\arcsin\frac{x^2+1}{\sqrt2\,x^2}+C` | double_negation | `-\left(-\left(\frac12\arcsin\frac{x^2+1}{\sqrt2\,x^2}+C\right)\right)` | uncertain |
| integral-L10-2 | integral | `\frac12\arcsin\frac{x^2+1}{\sqrt2\,x^2}+C` | times_one | `1\cdot\left(\frac12\arcsin\frac{x^2+1}{\sqrt2\,x^2}+C\right)` | uncertain |
| integral-L10-2 | integral | `\frac12\arcsin\frac{x^2+1}{\sqrt2\,x^2}+C` | wrapped_twice | `\frac12\left(2\left(\frac12\arcsin\frac{x^2+1}{\sqrt2\,x^2}+C\right)\right)` | uncertain |
| integral-L10-3 | integral | `\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C` | paren_wrap | `\left(\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C\right)` | uncertain |
| integral-L10-3 | integral | `\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C` | double_negation | `-\left(-\left(\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C\right)\right)` | uncertain |
| integral-L10-3 | integral | `\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C` | times_one | `1\cdot\left(\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C\right)` | uncertain |
| integral-L10-3 | integral | `\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C` | wrapped_twice | `\frac12\left(2\left(\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C\right)\right)` | uncertain |
| integral-L12-1 | integral | `-\frac12\ln\left|\frac{1+\sqrt{x^4+x^2+1}}{x^2}\right|+C` | paren_wrap | `\left(-\frac12\ln\left|\frac{1+\sqrt{x^4+x^2+1}}{x^2}\right|+C\right)` | uncertain |
| integral-L12-1 | integral | `-\frac12\ln\left|\frac{1+\sqrt{x^4+x^2+1}}{x^2}\right|+C` | double_negation | `-\left(-\left(-\frac12\ln\left|\frac{1+\sqrt{x^4+x^2+1}}{x^2}\right|+C\right)\right)` | uncertain |
| integral-L12-1 | integral | `-\frac12\ln\left|\frac{1+\sqrt{x^4+x^2+1}}{x^2}\right|+C` | times_one | `1\cdot\left(-\frac12\ln\left|\frac{1+\sqrt{x^4+x^2+1}}{x^2}\right|+C\right)` | uncertain |
| integral-L12-1 | integral | `-\frac12\ln\left|\frac{1+\sqrt{x^4+x^2+1}}{x^2}\right|+C` | wrapped_twice | `\frac12\left(2\left(-\frac12\ln\left|\frac{1+\sqrt{x^4+x^2+1}}{x^2}\right|+C\right)\right)` | uncertain |

## 被跳过的探针（不适用）

- no_form：75 条
- not_applicable：56 条

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
| limit-L8-2 | limit | L8 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| limit-L8-2 | limit | L8 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| limit-L8-2 | limit | L8 | far_number | wrong | `999999` | not_equivalent | false | structural |
| limit-L8-2 | limit | L8 | double_wrapped | wrong | `2\left(e^{-1/3}\right)` | not_equivalent | false | structural |
| limit-L8-2 | limit | L8 | sign_flip | wrong | `-\left(e^{-1/3}\right)` | not_equivalent | false | structural |
| limit-L8-2 | limit | L8 | double_paren | wrong | `2(e^{-1/3})` | not_equivalent | false | structural |
| limit-L8-2 | limit | L8 | double_cdot | wrong | `2\cdot\left(e^{-1/3}\right)` | not_equivalent | false | structural |
| limit-L8-2 | limit | L8 | double_times | wrong | `2\times\left(e^{-1/3}\right)` | not_equivalent | false | structural |
| limit-L8-2 | limit | L8 | half_shorthand | wrong | `\frac12\left(e^{-1/3}\right)` | not_equivalent | false | structural |
| limit-L8-2 | limit | L8 | plus_one | wrong | `\left(e^{-1/3}\right)+1` | not_equivalent | false | structural |
| limit-L8-2 | limit | L8 | minus_one | wrong | `\left(e^{-1/3}\right)-1` | not_equivalent | false | structural |
| limit-L8-2 | limit | L8 | paren_wrap | valid | `\left(e^{-1/3}\right)` | equivalent | true | structural |
| limit-L8-2 | limit | L8 | double_negation | valid | `-\left(-\left(e^{-1/3}\right)\right)` | equivalent | true | structural |
| limit-L8-2 | limit | L8 | times_one | valid | `1\cdot\left(e^{-1/3}\right)` | equivalent | true | structural |
| limit-L8-2 | limit | L8 | wrapped_twice | valid | `\frac12\left(2\left(e^{-1/3}\right)\right)` | equivalent | true | structural |
| limit-L8-2 | limit | L8 | equivalent_fraction | valid | — | skip | — | — |
| limit-L8-2 | limit | L8 | decimal_approx | valid | — | skip | — | — |
| limit-L8-3 | limit | L8 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| limit-L8-3 | limit | L8 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| limit-L8-3 | limit | L8 | far_number | wrong | `999999` | not_equivalent | false | scalar |
| limit-L8-3 | limit | L8 | double_wrapped | wrong | `2\left(-4\right)` | uncertain | — | model |
| limit-L8-3 | limit | L8 | sign_flip | wrong | `-\left(-4\right)` | uncertain | — | model |
| limit-L8-3 | limit | L8 | double_paren | wrong | `2(-4)` | uncertain | — | model |
| limit-L8-3 | limit | L8 | double_cdot | wrong | `2\cdot\left(-4\right)` | uncertain | — | model |
| limit-L8-3 | limit | L8 | double_times | wrong | `2\times\left(-4\right)` | uncertain | — | model |
| limit-L8-3 | limit | L8 | half_shorthand | wrong | `\frac12\left(-4\right)` | uncertain | — | model |
| limit-L8-3 | limit | L8 | plus_one | wrong | `\left(-4\right)+1` | uncertain | — | model |
| limit-L8-3 | limit | L8 | minus_one | wrong | `\left(-4\right)-1` | uncertain | — | model |
| limit-L8-3 | limit | L8 | paren_wrap | valid | `\left(-4\right)` | equivalent | true | scalar |
| limit-L8-3 | limit | L8 | double_negation | valid | `-\left(-\left(-4\right)\right)` | uncertain | — | model |
| limit-L8-3 | limit | L8 | times_one | valid | `1\cdot\left(-4\right)` | uncertain | — | model |
| limit-L8-3 | limit | L8 | wrapped_twice | valid | `\frac12\left(2\left(-4\right)\right)` | uncertain | — | model |
| limit-L8-3 | limit | L8 | equivalent_fraction | valid | — | skip | — | — |
| limit-L8-3 | limit | L8 | decimal_approx | valid | — | skip | — | — |
| limit-L10-1 | limit | L10 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| limit-L10-1 | limit | L10 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| limit-L10-1 | limit | L10 | far_number | wrong | `999999` | not_equivalent | false | scalar |
| limit-L10-1 | limit | L10 | double_wrapped | wrong | `2\left(-\frac{1}{3}\right)` | not_equivalent | false | structural |
| limit-L10-1 | limit | L10 | sign_flip | wrong | `-\left(-\frac{1}{3}\right)` | not_equivalent | false | structural |
| limit-L10-1 | limit | L10 | double_paren | wrong | `2(-\frac{1}{3})` | not_equivalent | false | structural |
| limit-L10-1 | limit | L10 | double_cdot | wrong | `2\cdot\left(-\frac{1}{3}\right)` | not_equivalent | false | structural |
| limit-L10-1 | limit | L10 | double_times | wrong | `2\times\left(-\frac{1}{3}\right)` | not_equivalent | false | structural |
| limit-L10-1 | limit | L10 | half_shorthand | wrong | `\frac12\left(-\frac{1}{3}\right)` | not_equivalent | false | structural |
| limit-L10-1 | limit | L10 | plus_one | wrong | `\left(-\frac{1}{3}\right)+1` | not_equivalent | false | structural |
| limit-L10-1 | limit | L10 | minus_one | wrong | `\left(-\frac{1}{3}\right)-1` | not_equivalent | false | structural |
| limit-L10-1 | limit | L10 | paren_wrap | valid | `\left(-\frac{1}{3}\right)` | equivalent | true | structural |
| limit-L10-1 | limit | L10 | double_negation | valid | `-\left(-\left(-\frac{1}{3}\right)\right)` | equivalent | true | structural |
| limit-L10-1 | limit | L10 | times_one | valid | `1\cdot\left(-\frac{1}{3}\right)` | equivalent | true | structural |
| limit-L10-1 | limit | L10 | wrapped_twice | valid | `\frac12\left(2\left(-\frac{1}{3}\right)\right)` | equivalent | true | structural |
| limit-L10-1 | limit | L10 | equivalent_fraction | valid | — | skip | — | — |
| limit-L10-1 | limit | L10 | decimal_approx | valid | `-0.3333333333` | equivalent | true | scalar |
| limit-L10-2 | limit | L10 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| limit-L10-2 | limit | L10 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| limit-L10-2 | limit | L10 | far_number | wrong | `999999` | not_equivalent | false | scalar |
| limit-L10-2 | limit | L10 | double_wrapped | wrong | `2\left(-\frac{1}{6}\right)` | uncertain | — | model |
| limit-L10-2 | limit | L10 | sign_flip | wrong | `-\left(-\frac{1}{6}\right)` | uncertain | — | model |
| limit-L10-2 | limit | L10 | double_paren | wrong | `2(-\frac{1}{6})` | uncertain | — | model |
| limit-L10-2 | limit | L10 | double_cdot | wrong | `2\cdot\left(-\frac{1}{6}\right)` | uncertain | — | model |
| limit-L10-2 | limit | L10 | double_times | wrong | `2\times\left(-\frac{1}{6}\right)` | uncertain | — | model |
| limit-L10-2 | limit | L10 | half_shorthand | wrong | `\frac12\left(-\frac{1}{6}\right)` | uncertain | — | model |
| limit-L10-2 | limit | L10 | plus_one | wrong | `\left(-\frac{1}{6}\right)+1` | uncertain | — | model |
| limit-L10-2 | limit | L10 | minus_one | wrong | `\left(-\frac{1}{6}\right)-1` | uncertain | — | model |
| limit-L10-2 | limit | L10 | paren_wrap | valid | `\left(-\frac{1}{6}\right)` | uncertain | — | model |
| limit-L10-2 | limit | L10 | double_negation | valid | `-\left(-\left(-\frac{1}{6}\right)\right)` | uncertain | — | model |
| limit-L10-2 | limit | L10 | times_one | valid | `1\cdot\left(-\frac{1}{6}\right)` | uncertain | — | model |
| limit-L10-2 | limit | L10 | wrapped_twice | valid | `\frac12\left(2\left(-\frac{1}{6}\right)\right)` | uncertain | — | model |
| limit-L10-2 | limit | L10 | equivalent_fraction | valid | — | skip | — | — |
| limit-L10-2 | limit | L10 | decimal_approx | valid | `-0.1666666667` | equivalent | true | scalar |
| limit-L12-2 | limit | L12 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| limit-L12-2 | limit | L12 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| limit-L12-2 | limit | L12 | far_number | wrong | `999999` | uncertain | — | model |
| limit-L12-2 | limit | L12 | double_wrapped | wrong | `2\left(-\frac{2447e}{5760}\right)` | uncertain | — | model |
| limit-L12-2 | limit | L12 | sign_flip | wrong | `-\left(-\frac{2447e}{5760}\right)` | uncertain | — | model |
| limit-L12-2 | limit | L12 | double_paren | wrong | `2(-\frac{2447e}{5760})` | uncertain | — | model |
| limit-L12-2 | limit | L12 | double_cdot | wrong | `2\cdot\left(-\frac{2447e}{5760}\right)` | uncertain | — | model |
| limit-L12-2 | limit | L12 | double_times | wrong | `2\times\left(-\frac{2447e}{5760}\right)` | uncertain | — | model |
| limit-L12-2 | limit | L12 | half_shorthand | wrong | `\frac12\left(-\frac{2447e}{5760}\right)` | uncertain | — | model |
| limit-L12-2 | limit | L12 | plus_one | wrong | `\left(-\frac{2447e}{5760}\right)+1` | uncertain | — | model |
| limit-L12-2 | limit | L12 | minus_one | wrong | `\left(-\frac{2447e}{5760}\right)-1` | uncertain | — | model |
| limit-L12-2 | limit | L12 | paren_wrap | valid | `\left(-\frac{2447e}{5760}\right)` | uncertain | — | model |
| limit-L12-2 | limit | L12 | double_negation | valid | `-\left(-\left(-\frac{2447e}{5760}\right)\right)` | uncertain | — | model |
| limit-L12-2 | limit | L12 | times_one | valid | `1\cdot\left(-\frac{2447e}{5760}\right)` | uncertain | — | model |
| limit-L12-2 | limit | L12 | wrapped_twice | valid | `\frac12\left(2\left(-\frac{2447e}{5760}\right)\right)` | uncertain | — | model |
| limit-L12-2 | limit | L12 | equivalent_fraction | valid | — | skip | — | — |
| limit-L12-2 | limit | L12 | decimal_approx | valid | — | skip | — | — |
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
| derivative-L10-1 | derivative | L10 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| derivative-L10-1 | derivative | L10 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| derivative-L10-1 | derivative | L10 | far_number | wrong | `999999` | not_equivalent | false | structural |
| derivative-L10-1 | derivative | L10 | double_wrapped | wrong | `2\left(\frac{(1+x^2)(\sin x+x\cos x)-2x^2\sin x}{(1+x^2)^2+x^2\sin^2 x}\right)` | not_equivalent | false | structural |
| derivative-L10-1 | derivative | L10 | sign_flip | wrong | `-\left(\frac{(1+x^2)(\sin x+x\cos x)-2x^2\sin x}{(1+x^2)^2+x^2\sin^2 x}\right)` | not_equivalent | false | structural |
| derivative-L10-1 | derivative | L10 | double_paren | wrong | `2(\frac{(1+x^2)(\sin x+x\cos x)-2x^2\sin x}{(1+x^2)^2+x^2\sin^2 x})` | not_equivalent | false | structural |
| derivative-L10-1 | derivative | L10 | double_cdot | wrong | `2\cdot\left(\frac{(1+x^2)(\sin x+x\cos x)-2x^2\sin x}{(1+x^2)^2+x^2\sin^2 x}\right)` | not_equivalent | false | structural |
| derivative-L10-1 | derivative | L10 | double_times | wrong | `2\times\left(\frac{(1+x^2)(\sin x+x\cos x)-2x^2\sin x}{(1+x^2)^2+x^2\sin^2 x}\right)` | not_equivalent | false | structural |
| derivative-L10-1 | derivative | L10 | half_shorthand | wrong | `\frac12\left(\frac{(1+x^2)(\sin x+x\cos x)-2x^2\sin x}{(1+x^2)^2+x^2\sin^2 x}\right)` | not_equivalent | false | structural |
| derivative-L10-1 | derivative | L10 | plus_one | wrong | `\left(\frac{(1+x^2)(\sin x+x\cos x)-2x^2\sin x}{(1+x^2)^2+x^2\sin^2 x}\right)+1` | not_equivalent | false | structural |
| derivative-L10-1 | derivative | L10 | minus_one | wrong | `\left(\frac{(1+x^2)(\sin x+x\cos x)-2x^2\sin x}{(1+x^2)^2+x^2\sin^2 x}\right)-1` | not_equivalent | false | structural |
| derivative-L10-1 | derivative | L10 | paren_wrap | valid | `\left(\frac{(1+x^2)(\sin x+x\cos x)-2x^2\sin x}{(1+x^2)^2+x^2\sin^2 x}\right)` | equivalent | true | structural |
| derivative-L10-1 | derivative | L10 | double_negation | valid | `-\left(-\left(\frac{(1+x^2)(\sin x+x\cos x)-2x^2\sin x}{(1+x^2)^2+x^2\sin^2 x}\right)\right)` | equivalent | true | structural |
| derivative-L10-1 | derivative | L10 | times_one | valid | `1\cdot\left(\frac{(1+x^2)(\sin x+x\cos x)-2x^2\sin x}{(1+x^2)^2+x^2\sin^2 x}\right)` | equivalent | true | structural |
| derivative-L10-1 | derivative | L10 | wrapped_twice | valid | `\frac12\left(2\left(\frac{(1+x^2)(\sin x+x\cos x)-2x^2\sin x}{(1+x^2)^2+x^2\sin^2 x}\right)\right)` | equivalent | true | structural |
| derivative-L10-1 | derivative | L10 | equivalent_fraction | valid | — | skip | — | — |
| derivative-L10-1 | derivative | L10 | decimal_approx | valid | — | skip | — | — |
| derivative-L10-2 | derivative | L10 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| derivative-L10-2 | derivative | L10 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| derivative-L10-2 | derivative | L10 | far_number | wrong | `999999` | uncertain | — | model |
| derivative-L10-2 | derivative | L10 | double_wrapped | wrong | `2\left(-18/(x+2y)^3\right)` | uncertain | — | model |
| derivative-L10-2 | derivative | L10 | sign_flip | wrong | `-\left(-18/(x+2y)^3\right)` | uncertain | — | model |
| derivative-L10-2 | derivative | L10 | double_paren | wrong | `2(-18/(x+2y)^3)` | uncertain | — | model |
| derivative-L10-2 | derivative | L10 | double_cdot | wrong | `2\cdot\left(-18/(x+2y)^3\right)` | uncertain | — | model |
| derivative-L10-2 | derivative | L10 | double_times | wrong | `2\times\left(-18/(x+2y)^3\right)` | uncertain | — | model |
| derivative-L10-2 | derivative | L10 | half_shorthand | wrong | `\frac12\left(-18/(x+2y)^3\right)` | uncertain | — | model |
| derivative-L10-2 | derivative | L10 | plus_one | wrong | `\left(-18/(x+2y)^3\right)+1` | uncertain | — | model |
| derivative-L10-2 | derivative | L10 | minus_one | wrong | `\left(-18/(x+2y)^3\right)-1` | uncertain | — | model |
| derivative-L10-2 | derivative | L10 | paren_wrap | valid | `\left(-18/(x+2y)^3\right)` | uncertain | — | model |
| derivative-L10-2 | derivative | L10 | double_negation | valid | `-\left(-\left(-18/(x+2y)^3\right)\right)` | uncertain | — | model |
| derivative-L10-2 | derivative | L10 | times_one | valid | `1\cdot\left(-18/(x+2y)^3\right)` | uncertain | — | model |
| derivative-L10-2 | derivative | L10 | wrapped_twice | valid | `\frac12\left(2\left(-18/(x+2y)^3\right)\right)` | uncertain | — | model |
| derivative-L10-2 | derivative | L10 | equivalent_fraction | valid | — | skip | — | — |
| derivative-L10-2 | derivative | L10 | decimal_approx | valid | — | skip | — | — |
| derivative-L10-4 | derivative | L10 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| derivative-L10-4 | derivative | L10 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| derivative-L10-4 | derivative | L10 | far_number | wrong | `999999` | uncertain | — | model |
| derivative-L10-4 | derivative | L10 | double_wrapped | wrong | `2\left(2(1+t^2)\right)` | uncertain | — | model |
| derivative-L10-4 | derivative | L10 | sign_flip | wrong | `-\left(2(1+t^2)\right)` | uncertain | — | model |
| derivative-L10-4 | derivative | L10 | double_paren | wrong | `2(2(1+t^2))` | uncertain | — | model |
| derivative-L10-4 | derivative | L10 | double_cdot | wrong | `2\cdot\left(2(1+t^2)\right)` | uncertain | — | model |
| derivative-L10-4 | derivative | L10 | double_times | wrong | `2\times\left(2(1+t^2)\right)` | uncertain | — | model |
| derivative-L10-4 | derivative | L10 | half_shorthand | wrong | `\frac12\left(2(1+t^2)\right)` | uncertain | — | model |
| derivative-L10-4 | derivative | L10 | plus_one | wrong | `\left(2(1+t^2)\right)+1` | uncertain | — | model |
| derivative-L10-4 | derivative | L10 | minus_one | wrong | `\left(2(1+t^2)\right)-1` | uncertain | — | model |
| derivative-L10-4 | derivative | L10 | paren_wrap | valid | `\left(2(1+t^2)\right)` | uncertain | — | model |
| derivative-L10-4 | derivative | L10 | double_negation | valid | `-\left(-\left(2(1+t^2)\right)\right)` | uncertain | — | model |
| derivative-L10-4 | derivative | L10 | times_one | valid | `1\cdot\left(2(1+t^2)\right)` | uncertain | — | model |
| derivative-L10-4 | derivative | L10 | wrapped_twice | valid | `\frac12\left(2\left(2(1+t^2)\right)\right)` | uncertain | — | model |
| derivative-L10-4 | derivative | L10 | equivalent_fraction | valid | — | skip | — | — |
| derivative-L10-4 | derivative | L10 | decimal_approx | valid | — | skip | — | — |
| derivative-L12-1 | derivative | L12 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| derivative-L12-1 | derivative | L12 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| derivative-L12-1 | derivative | L12 | far_number | wrong | `999999` | uncertain | — | model |
| derivative-L12-1 | derivative | L12 | double_wrapped | wrong | `2\left(-\frac{2xy}{(y^2-x)^3}\right)` | uncertain | — | model |
| derivative-L12-1 | derivative | L12 | sign_flip | wrong | `-\left(-\frac{2xy}{(y^2-x)^3}\right)` | uncertain | — | model |
| derivative-L12-1 | derivative | L12 | double_paren | wrong | `2(-\frac{2xy}{(y^2-x)^3})` | uncertain | — | model |
| derivative-L12-1 | derivative | L12 | double_cdot | wrong | `2\cdot\left(-\frac{2xy}{(y^2-x)^3}\right)` | uncertain | — | model |
| derivative-L12-1 | derivative | L12 | double_times | wrong | `2\times\left(-\frac{2xy}{(y^2-x)^3}\right)` | uncertain | — | model |
| derivative-L12-1 | derivative | L12 | half_shorthand | wrong | `\frac12\left(-\frac{2xy}{(y^2-x)^3}\right)` | uncertain | — | model |
| derivative-L12-1 | derivative | L12 | plus_one | wrong | `\left(-\frac{2xy}{(y^2-x)^3}\right)+1` | uncertain | — | model |
| derivative-L12-1 | derivative | L12 | minus_one | wrong | `\left(-\frac{2xy}{(y^2-x)^3}\right)-1` | uncertain | — | model |
| derivative-L12-1 | derivative | L12 | paren_wrap | valid | `\left(-\frac{2xy}{(y^2-x)^3}\right)` | uncertain | — | model |
| derivative-L12-1 | derivative | L12 | double_negation | valid | `-\left(-\left(-\frac{2xy}{(y^2-x)^3}\right)\right)` | uncertain | — | model |
| derivative-L12-1 | derivative | L12 | times_one | valid | `1\cdot\left(-\frac{2xy}{(y^2-x)^3}\right)` | uncertain | — | model |
| derivative-L12-1 | derivative | L12 | wrapped_twice | valid | `\frac12\left(2\left(-\frac{2xy}{(y^2-x)^3}\right)\right)` | uncertain | — | model |
| derivative-L12-1 | derivative | L12 | equivalent_fraction | valid | — | skip | — | — |
| derivative-L12-1 | derivative | L12 | decimal_approx | valid | — | skip | — | — |
| derivative-L12-2 | derivative | L12 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| derivative-L12-2 | derivative | L12 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| derivative-L12-2 | derivative | L12 | far_number | wrong | `999999` | uncertain | — | model |
| derivative-L12-2 | derivative | L12 | double_wrapped | wrong | `2\left(\frac{5t^4+10t}{3t^2+3}\right)` | uncertain | — | model |
| derivative-L12-2 | derivative | L12 | sign_flip | wrong | `-\left(\frac{5t^4+10t}{3t^2+3}\right)` | uncertain | — | model |
| derivative-L12-2 | derivative | L12 | double_paren | wrong | `2(\frac{5t^4+10t}{3t^2+3})` | uncertain | — | model |
| derivative-L12-2 | derivative | L12 | double_cdot | wrong | `2\cdot\left(\frac{5t^4+10t}{3t^2+3}\right)` | uncertain | — | model |
| derivative-L12-2 | derivative | L12 | double_times | wrong | `2\times\left(\frac{5t^4+10t}{3t^2+3}\right)` | uncertain | — | model |
| derivative-L12-2 | derivative | L12 | half_shorthand | wrong | `\frac12\left(\frac{5t^4+10t}{3t^2+3}\right)` | uncertain | — | model |
| derivative-L12-2 | derivative | L12 | plus_one | wrong | `\left(\frac{5t^4+10t}{3t^2+3}\right)+1` | uncertain | — | model |
| derivative-L12-2 | derivative | L12 | minus_one | wrong | `\left(\frac{5t^4+10t}{3t^2+3}\right)-1` | uncertain | — | model |
| derivative-L12-2 | derivative | L12 | paren_wrap | valid | `\left(\frac{5t^4+10t}{3t^2+3}\right)` | uncertain | — | model |
| derivative-L12-2 | derivative | L12 | double_negation | valid | `-\left(-\left(\frac{5t^4+10t}{3t^2+3}\right)\right)` | uncertain | — | model |
| derivative-L12-2 | derivative | L12 | times_one | valid | `1\cdot\left(\frac{5t^4+10t}{3t^2+3}\right)` | uncertain | — | model |
| derivative-L12-2 | derivative | L12 | wrapped_twice | valid | `\frac12\left(2\left(\frac{5t^4+10t}{3t^2+3}\right)\right)` | uncertain | — | model |
| derivative-L12-2 | derivative | L12 | equivalent_fraction | valid | — | skip | — | — |
| derivative-L12-2 | derivative | L12 | decimal_approx | valid | — | skip | — | — |
| derivative-L12-4 | derivative | L12 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| derivative-L12-4 | derivative | L12 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| derivative-L12-4 | derivative | L12 | far_number | wrong | `999999` | not_equivalent | false | scalar |
| derivative-L12-4 | derivative | L12 | double_wrapped | wrong | — | skip | — | — |
| derivative-L12-4 | derivative | L12 | sign_flip | wrong | — | skip | — | — |
| derivative-L12-4 | derivative | L12 | double_paren | wrong | — | skip | — | — |
| derivative-L12-4 | derivative | L12 | double_cdot | wrong | — | skip | — | — |
| derivative-L12-4 | derivative | L12 | double_times | wrong | — | skip | — | — |
| derivative-L12-4 | derivative | L12 | half_shorthand | wrong | — | skip | — | — |
| derivative-L12-4 | derivative | L12 | plus_one | wrong | `\left(0\right)+1` | uncertain | — | model |
| derivative-L12-4 | derivative | L12 | minus_one | wrong | `\left(0\right)-1` | uncertain | — | model |
| derivative-L12-4 | derivative | L12 | paren_wrap | valid | `\left(0\right)` | equivalent | true | scalar |
| derivative-L12-4 | derivative | L12 | double_negation | valid | `-\left(-\left(0\right)\right)` | uncertain | — | model |
| derivative-L12-4 | derivative | L12 | times_one | valid | `1\cdot\left(0\right)` | uncertain | — | model |
| derivative-L12-4 | derivative | L12 | wrapped_twice | valid | `\frac12\left(2\left(0\right)\right)` | uncertain | — | model |
| derivative-L12-4 | derivative | L12 | equivalent_fraction | valid | — | skip | — | — |
| derivative-L12-4 | derivative | L12 | decimal_approx | valid | — | skip | — | — |
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
| integral-L8-1 | integral | L8 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| integral-L8-1 | integral | L8 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| integral-L8-1 | integral | L8 | far_number | wrong | `999999` | not_equivalent | false | structural |
| integral-L8-1 | integral | L8 | double_wrapped | wrong | `2\left(\frac{\pi}{4}\right)` | not_equivalent | false | structural |
| integral-L8-1 | integral | L8 | sign_flip | wrong | `-\left(\frac{\pi}{4}\right)` | not_equivalent | false | structural |
| integral-L8-1 | integral | L8 | double_paren | wrong | `2(\frac{\pi}{4})` | not_equivalent | false | structural |
| integral-L8-1 | integral | L8 | double_cdot | wrong | `2\cdot\left(\frac{\pi}{4}\right)` | not_equivalent | false | structural |
| integral-L8-1 | integral | L8 | double_times | wrong | `2\times\left(\frac{\pi}{4}\right)` | not_equivalent | false | structural |
| integral-L8-1 | integral | L8 | half_shorthand | wrong | `\frac12\left(\frac{\pi}{4}\right)` | not_equivalent | false | structural |
| integral-L8-1 | integral | L8 | plus_one | wrong | — | skip | — | — |
| integral-L8-1 | integral | L8 | minus_one | wrong | — | skip | — | — |
| integral-L8-1 | integral | L8 | paren_wrap | valid | `\left(\frac{\pi}{4}\right)` | equivalent | true | structural |
| integral-L8-1 | integral | L8 | double_negation | valid | `-\left(-\left(\frac{\pi}{4}\right)\right)` | equivalent | true | structural |
| integral-L8-1 | integral | L8 | times_one | valid | `1\cdot\left(\frac{\pi}{4}\right)` | equivalent | true | structural |
| integral-L8-1 | integral | L8 | wrapped_twice | valid | `\frac12\left(2\left(\frac{\pi}{4}\right)\right)` | equivalent | true | structural |
| integral-L8-1 | integral | L8 | equivalent_fraction | valid | — | skip | — | — |
| integral-L8-1 | integral | L8 | decimal_approx | valid | — | skip | — | — |
| integral-L8-2 | integral | L8 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| integral-L8-2 | integral | L8 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| integral-L8-2 | integral | L8 | far_number | wrong | `999999` | not_equivalent | false | structural |
| integral-L8-2 | integral | L8 | double_wrapped | wrong | `2\left(\frac{e^{2x}}{13}(2\sin 3x-3\cos 3x)+C\right)` | not_equivalent | false | structural |
| integral-L8-2 | integral | L8 | sign_flip | wrong | `-\left(\frac{e^{2x}}{13}(2\sin 3x-3\cos 3x)+C\right)` | not_equivalent | false | structural |
| integral-L8-2 | integral | L8 | double_paren | wrong | `2(\frac{e^{2x}}{13}(2\sin 3x-3\cos 3x)+C)` | not_equivalent | false | structural |
| integral-L8-2 | integral | L8 | double_cdot | wrong | `2\cdot\left(\frac{e^{2x}}{13}(2\sin 3x-3\cos 3x)+C\right)` | not_equivalent | false | structural |
| integral-L8-2 | integral | L8 | double_times | wrong | `2\times\left(\frac{e^{2x}}{13}(2\sin 3x-3\cos 3x)+C\right)` | not_equivalent | false | structural |
| integral-L8-2 | integral | L8 | half_shorthand | wrong | `\frac12\left(\frac{e^{2x}}{13}(2\sin 3x-3\cos 3x)+C\right)` | not_equivalent | false | structural |
| integral-L8-2 | integral | L8 | plus_one | wrong | — | skip | — | — |
| integral-L8-2 | integral | L8 | minus_one | wrong | — | skip | — | — |
| integral-L8-2 | integral | L8 | paren_wrap | valid | `\left(\frac{e^{2x}}{13}(2\sin 3x-3\cos 3x)+C\right)` | equivalent | true | structural |
| integral-L8-2 | integral | L8 | double_negation | valid | `-\left(-\left(\frac{e^{2x}}{13}(2\sin 3x-3\cos 3x)+C\right)\right)` | equivalent | true | structural |
| integral-L8-2 | integral | L8 | times_one | valid | `1\cdot\left(\frac{e^{2x}}{13}(2\sin 3x-3\cos 3x)+C\right)` | equivalent | true | structural |
| integral-L8-2 | integral | L8 | wrapped_twice | valid | `\frac12\left(2\left(\frac{e^{2x}}{13}(2\sin 3x-3\cos 3x)+C\right)\right)` | equivalent | true | structural |
| integral-L8-2 | integral | L8 | equivalent_fraction | valid | — | skip | — | — |
| integral-L8-2 | integral | L8 | decimal_approx | valid | — | skip | — | — |
| integral-L8-3 | integral | L8 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| integral-L8-3 | integral | L8 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| integral-L8-3 | integral | L8 | far_number | wrong | `999999` | not_equivalent | false | structural |
| integral-L8-3 | integral | L8 | double_wrapped | wrong | `2\left(\ln\left(x+1+\sqrt{x^2+2x+5}\right)+C\right)` | not_equivalent | false | structural |
| integral-L8-3 | integral | L8 | sign_flip | wrong | `-\left(\ln\left(x+1+\sqrt{x^2+2x+5}\right)+C\right)` | not_equivalent | false | structural |
| integral-L8-3 | integral | L8 | double_paren | wrong | `2(\ln\left(x+1+\sqrt{x^2+2x+5}\right)+C)` | not_equivalent | false | structural |
| integral-L8-3 | integral | L8 | double_cdot | wrong | `2\cdot\left(\ln\left(x+1+\sqrt{x^2+2x+5}\right)+C\right)` | not_equivalent | false | structural |
| integral-L8-3 | integral | L8 | double_times | wrong | `2\times\left(\ln\left(x+1+\sqrt{x^2+2x+5}\right)+C\right)` | not_equivalent | false | structural |
| integral-L8-3 | integral | L8 | half_shorthand | wrong | `\frac12\left(\ln\left(x+1+\sqrt{x^2+2x+5}\right)+C\right)` | not_equivalent | false | structural |
| integral-L8-3 | integral | L8 | plus_one | wrong | — | skip | — | — |
| integral-L8-3 | integral | L8 | minus_one | wrong | — | skip | — | — |
| integral-L8-3 | integral | L8 | paren_wrap | valid | `\left(\ln\left(x+1+\sqrt{x^2+2x+5}\right)+C\right)` | equivalent | true | structural |
| integral-L8-3 | integral | L8 | double_negation | valid | `-\left(-\left(\ln\left(x+1+\sqrt{x^2+2x+5}\right)+C\right)\right)` | equivalent | true | structural |
| integral-L8-3 | integral | L8 | times_one | valid | `1\cdot\left(\ln\left(x+1+\sqrt{x^2+2x+5}\right)+C\right)` | equivalent | true | structural |
| integral-L8-3 | integral | L8 | wrapped_twice | valid | `\frac12\left(2\left(\ln\left(x+1+\sqrt{x^2+2x+5}\right)+C\right)\right)` | equivalent | true | structural |
| integral-L8-3 | integral | L8 | equivalent_fraction | valid | — | skip | — | — |
| integral-L8-3 | integral | L8 | decimal_approx | valid | — | skip | — | — |
| integral-L8-4 | integral | L8 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| integral-L8-4 | integral | L8 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| integral-L8-4 | integral | L8 | far_number | wrong | `999999` | uncertain | — | model |
| integral-L8-4 | integral | L8 | double_wrapped | wrong | `2\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)` | uncertain | — | model |
| integral-L8-4 | integral | L8 | sign_flip | wrong | `-\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)` | uncertain | — | model |
| integral-L8-4 | integral | L8 | double_paren | wrong | `2(\ln\left|1+\tan\frac{x}{2}\right|+C)` | uncertain | — | model |
| integral-L8-4 | integral | L8 | double_cdot | wrong | `2\cdot\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)` | uncertain | — | model |
| integral-L8-4 | integral | L8 | double_times | wrong | `2\times\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)` | uncertain | — | model |
| integral-L8-4 | integral | L8 | half_shorthand | wrong | `\frac12\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)` | uncertain | — | model |
| integral-L8-4 | integral | L8 | plus_one | wrong | — | skip | — | — |
| integral-L8-4 | integral | L8 | minus_one | wrong | — | skip | — | — |
| integral-L8-4 | integral | L8 | paren_wrap | valid | `\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)` | uncertain | — | model |
| integral-L8-4 | integral | L8 | double_negation | valid | `-\left(-\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)\right)` | uncertain | — | model |
| integral-L8-4 | integral | L8 | times_one | valid | `1\cdot\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)` | uncertain | — | model |
| integral-L8-4 | integral | L8 | wrapped_twice | valid | `\frac12\left(2\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)\right)` | uncertain | — | model |
| integral-L8-4 | integral | L8 | equivalent_fraction | valid | — | skip | — | — |
| integral-L8-4 | integral | L8 | decimal_approx | valid | — | skip | — | — |
| integral-L10-2 | integral | L10 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| integral-L10-2 | integral | L10 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| integral-L10-2 | integral | L10 | far_number | wrong | `999999` | uncertain | — | model |
| integral-L10-2 | integral | L10 | double_wrapped | wrong | `2\left(\frac12\arcsin\frac{x^2+1}{\sqrt2\,x^2}+C\right)` | uncertain | — | model |
| integral-L10-2 | integral | L10 | sign_flip | wrong | `-\left(\frac12\arcsin\frac{x^2+1}{\sqrt2\,x^2}+C\right)` | uncertain | — | model |
| integral-L10-2 | integral | L10 | double_paren | wrong | `2(\frac12\arcsin\frac{x^2+1}{\sqrt2\,x^2}+C)` | uncertain | — | model |
| integral-L10-2 | integral | L10 | double_cdot | wrong | `2\cdot\left(\frac12\arcsin\frac{x^2+1}{\sqrt2\,x^2}+C\right)` | uncertain | — | model |
| integral-L10-2 | integral | L10 | double_times | wrong | `2\times\left(\frac12\arcsin\frac{x^2+1}{\sqrt2\,x^2}+C\right)` | uncertain | — | model |
| integral-L10-2 | integral | L10 | half_shorthand | wrong | `\frac12\left(\frac12\arcsin\frac{x^2+1}{\sqrt2\,x^2}+C\right)` | uncertain | — | model |
| integral-L10-2 | integral | L10 | plus_one | wrong | — | skip | — | — |
| integral-L10-2 | integral | L10 | minus_one | wrong | — | skip | — | — |
| integral-L10-2 | integral | L10 | paren_wrap | valid | `\left(\frac12\arcsin\frac{x^2+1}{\sqrt2\,x^2}+C\right)` | uncertain | — | model |
| integral-L10-2 | integral | L10 | double_negation | valid | `-\left(-\left(\frac12\arcsin\frac{x^2+1}{\sqrt2\,x^2}+C\right)\right)` | uncertain | — | model |
| integral-L10-2 | integral | L10 | times_one | valid | `1\cdot\left(\frac12\arcsin\frac{x^2+1}{\sqrt2\,x^2}+C\right)` | uncertain | — | model |
| integral-L10-2 | integral | L10 | wrapped_twice | valid | `\frac12\left(2\left(\frac12\arcsin\frac{x^2+1}{\sqrt2\,x^2}+C\right)\right)` | uncertain | — | model |
| integral-L10-2 | integral | L10 | equivalent_fraction | valid | — | skip | — | — |
| integral-L10-2 | integral | L10 | decimal_approx | valid | — | skip | — | — |
| integral-L10-3 | integral | L10 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| integral-L10-3 | integral | L10 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| integral-L10-3 | integral | L10 | far_number | wrong | `999999` | uncertain | — | model |
| integral-L10-3 | integral | L10 | double_wrapped | wrong | `2\left(\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C\right)` | uncertain | — | model |
| integral-L10-3 | integral | L10 | sign_flip | wrong | `-\left(\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C\right)` | uncertain | — | model |
| integral-L10-3 | integral | L10 | double_paren | wrong | `2(\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C)` | uncertain | — | model |
| integral-L10-3 | integral | L10 | double_cdot | wrong | `2\cdot\left(\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C\right)` | uncertain | — | model |
| integral-L10-3 | integral | L10 | double_times | wrong | `2\times\left(\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C\right)` | uncertain | — | model |
| integral-L10-3 | integral | L10 | half_shorthand | wrong | `\frac12\left(\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C\right)` | uncertain | — | model |
| integral-L10-3 | integral | L10 | plus_one | wrong | — | skip | — | — |
| integral-L10-3 | integral | L10 | minus_one | wrong | — | skip | — | — |
| integral-L10-3 | integral | L10 | paren_wrap | valid | `\left(\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C\right)` | uncertain | — | model |
| integral-L10-3 | integral | L10 | double_negation | valid | `-\left(-\left(\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C\right)\right)` | uncertain | — | model |
| integral-L10-3 | integral | L10 | times_one | valid | `1\cdot\left(\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C\right)` | uncertain | — | model |
| integral-L10-3 | integral | L10 | wrapped_twice | valid | `\frac12\left(2\left(\sqrt{2}\arctan\left(\frac{\tan\frac{x}{2}+1}{\sqrt{2}}\right)+C\right)\right)` | uncertain | — | model |
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
| integral-L12-1 | integral | L12 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| integral-L12-1 | integral | L12 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| integral-L12-1 | integral | L12 | far_number | wrong | `999999` | uncertain | — | model |
| integral-L12-1 | integral | L12 | double_wrapped | wrong | `2\left(-\frac12\ln\left|\frac{1+\sqrt{x^4+x^2+1}}{x^2}\right|+C\right)` | uncertain | — | model |
| integral-L12-1 | integral | L12 | sign_flip | wrong | `-\left(-\frac12\ln\left|\frac{1+\sqrt{x^4+x^2+1}}{x^2}\right|+C\right)` | uncertain | — | model |
| integral-L12-1 | integral | L12 | double_paren | wrong | `2(-\frac12\ln\left|\frac{1+\sqrt{x^4+x^2+1}}{x^2}\right|+C)` | uncertain | — | model |
| integral-L12-1 | integral | L12 | double_cdot | wrong | `2\cdot\left(-\frac12\ln\left|\frac{1+\sqrt{x^4+x^2+1}}{x^2}\right|+C\right)` | uncertain | — | model |
| integral-L12-1 | integral | L12 | double_times | wrong | `2\times\left(-\frac12\ln\left|\frac{1+\sqrt{x^4+x^2+1}}{x^2}\right|+C\right)` | uncertain | — | model |
| integral-L12-1 | integral | L12 | half_shorthand | wrong | `\frac12\left(-\frac12\ln\left|\frac{1+\sqrt{x^4+x^2+1}}{x^2}\right|+C\right)` | uncertain | — | model |
| integral-L12-1 | integral | L12 | plus_one | wrong | — | skip | — | — |
| integral-L12-1 | integral | L12 | minus_one | wrong | — | skip | — | — |
| integral-L12-1 | integral | L12 | paren_wrap | valid | `\left(-\frac12\ln\left|\frac{1+\sqrt{x^4+x^2+1}}{x^2}\right|+C\right)` | uncertain | — | model |
| integral-L12-1 | integral | L12 | double_negation | valid | `-\left(-\left(-\frac12\ln\left|\frac{1+\sqrt{x^4+x^2+1}}{x^2}\right|+C\right)\right)` | uncertain | — | model |
| integral-L12-1 | integral | L12 | times_one | valid | `1\cdot\left(-\frac12\ln\left|\frac{1+\sqrt{x^4+x^2+1}}{x^2}\right|+C\right)` | uncertain | — | model |
| integral-L12-1 | integral | L12 | wrapped_twice | valid | `\frac12\left(2\left(-\frac12\ln\left|\frac{1+\sqrt{x^4+x^2+1}}{x^2}\right|+C\right)\right)` | uncertain | — | model |
| integral-L12-1 | integral | L12 | equivalent_fraction | valid | — | skip | — | — |
| integral-L12-1 | integral | L12 | decimal_approx | valid | — | skip | — | — |
| integral-L12-2 | integral | L12 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| integral-L12-2 | integral | L12 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| integral-L12-2 | integral | L12 | far_number | wrong | `999999` | uncertain | — | model |
| integral-L12-2 | integral | L12 | double_wrapped | wrong | `2\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)` | uncertain | — | model |
| integral-L12-2 | integral | L12 | sign_flip | wrong | `-\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)` | uncertain | — | model |
| integral-L12-2 | integral | L12 | double_paren | wrong | `2(\ln\left|1+\tan\frac{x}{2}\right|+C)` | uncertain | — | model |
| integral-L12-2 | integral | L12 | double_cdot | wrong | `2\cdot\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)` | uncertain | — | model |
| integral-L12-2 | integral | L12 | double_times | wrong | `2\times\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)` | uncertain | — | model |
| integral-L12-2 | integral | L12 | half_shorthand | wrong | `\frac12\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)` | uncertain | — | model |
| integral-L12-2 | integral | L12 | plus_one | wrong | — | skip | — | — |
| integral-L12-2 | integral | L12 | minus_one | wrong | — | skip | — | — |
| integral-L12-2 | integral | L12 | paren_wrap | valid | `\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)` | uncertain | — | model |
| integral-L12-2 | integral | L12 | double_negation | valid | `-\left(-\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)\right)` | uncertain | — | model |
| integral-L12-2 | integral | L12 | times_one | valid | `1\cdot\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)` | uncertain | — | model |
| integral-L12-2 | integral | L12 | wrapped_twice | valid | `\frac12\left(2\left(\ln\left|1+\tan\frac{x}{2}\right|+C\right)\right)` | uncertain | — | model |
| integral-L12-2 | integral | L12 | equivalent_fraction | valid | — | skip | — | — |
| integral-L12-2 | integral | L12 | decimal_approx | valid | — | skip | — | — |
| integral-L12-4 | integral | L12 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| integral-L12-4 | integral | L12 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| integral-L12-4 | integral | L12 | far_number | wrong | `999999` | not_equivalent | false | structural |
| integral-L12-4 | integral | L12 | double_wrapped | wrong | `2\left(\frac{\pi}{4}\right)` | not_equivalent | false | structural |
| integral-L12-4 | integral | L12 | sign_flip | wrong | `-\left(\frac{\pi}{4}\right)` | not_equivalent | false | structural |
| integral-L12-4 | integral | L12 | double_paren | wrong | `2(\frac{\pi}{4})` | not_equivalent | false | structural |
| integral-L12-4 | integral | L12 | double_cdot | wrong | `2\cdot\left(\frac{\pi}{4}\right)` | not_equivalent | false | structural |
| integral-L12-4 | integral | L12 | double_times | wrong | `2\times\left(\frac{\pi}{4}\right)` | not_equivalent | false | structural |
| integral-L12-4 | integral | L12 | half_shorthand | wrong | `\frac12\left(\frac{\pi}{4}\right)` | not_equivalent | false | structural |
| integral-L12-4 | integral | L12 | plus_one | wrong | — | skip | — | — |
| integral-L12-4 | integral | L12 | minus_one | wrong | — | skip | — | — |
| integral-L12-4 | integral | L12 | paren_wrap | valid | `\left(\frac{\pi}{4}\right)` | equivalent | true | structural |
| integral-L12-4 | integral | L12 | double_negation | valid | `-\left(-\left(\frac{\pi}{4}\right)\right)` | equivalent | true | structural |
| integral-L12-4 | integral | L12 | times_one | valid | `1\cdot\left(\frac{\pi}{4}\right)` | equivalent | true | structural |
| integral-L12-4 | integral | L12 | wrapped_twice | valid | `\frac12\left(2\left(\frac{\pi}{4}\right)\right)` | equivalent | true | structural |
| integral-L12-4 | integral | L12 | equivalent_fraction | valid | — | skip | — | — |
| integral-L12-4 | integral | L12 | decimal_approx | valid | — | skip | — | — |

