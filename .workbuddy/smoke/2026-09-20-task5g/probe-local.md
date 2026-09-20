# Judge 专项压力测试 · 本地判定版（Task #4 · D → Task #5A）

- 题源：`.workbuddy/smoke/2026-09-19T15-53-42-selftest3/questions.jsonl`
- 题目数：3（可用 3）
- 错答探针定义 11 条 / 合法古怪探针定义 6 条
- 生成的探针：错答 33 条、合法 15 条，跳过 3 条

## 核心验收

| 指标 | 值 |
| --- | --- |
| **错答被放行（wrong_answer_accepted，须为 0）** | **0** |
| 错答被拒 | 27 |
| 错答落到模型（引擎判不了） | 6 |
| **合法写法被误拒（真实误杀）** | **0** |
| 合法写法被拒，但原因是该题标准答案本身就错 | 0 |
| 合法写法落到模型 | 0 |
| 确定性覆盖率 · 错答探针 | 81.8%（标量 27 + 结构 0） |
| 确定性覆盖率 · 合法探针 | 100.0%（标量 15 + 结构 0） |

## 确定性覆盖率：增益拆解（三列都是当场算出来的）

列名写的是**这一列实际用了什么判定能力**，不是时间点 —— 这样不会有歧义：

- **只标量**：`git show HEAD:math-quality.js` 载入的旧引擎，判题只调 `compare()`；
- **＋结构层**：上面的旧 `compare()` 兜底，接当前这版结构检查（标量判不了才走它）；
- **＋常量/发散/中心**：当前完整引擎（标量层支持纯常量表达式，结构层多了发散检测与中心平均）。

所以「＋结构层 → ＋常量/发散/中心」之间那一跳，就是 Task #5A 单独贡献的部分。

| 指标 | 只标量 | ＋结构层 | ＋常量/发散/中心 |
| --- | --- | --- | --- |
| 错答探针由确定性引擎判死 | 6.1%（2/33） | 30.3%（10/33） | 81.8%（27/33） |
| 错答探针落到模型 | 31/33 | 23/33 | 6/33 |
| 合法探针由确定性引擎判死 | 20.0%（3/15） | 46.7%（7/15） | 100.0%（15/15） |
| 错答被放行 | 取决于模型（实测线上 6/40 误批） | 0（结构上不可能） | 0（结构上不可能） |

## 结论

- ✅ 没有任何一条错答探针被判成 `correct: true`。
- 这不是抽样运气：`correct:true` 只有一条来路 —— 确定性引擎判 `equivalent`。
  模型那条路按 Task #4 的规则只采信 `not_equivalent`，产不出 `correct:true`。
  所以「错答放行 = 0」是结构性保证，前提只是「线上跑的是这一版代码」。

- ⚠️ 还有 6 条错答引擎判不了、会去问模型。
  模型最多只能把它们判「错」，不会放行；但会多消耗一次模型调用，且判不出来时用户会看到「暂时无法可靠判断」。

## 仍未被引擎判死的错答（会落到模型）

| 题 | 模块 | 参考答案 | 探针 | 提交的答案 | 本地结论 |
| --- | --- | --- | --- | --- | --- |
| limit-L4-1 | limit | `\frac{1}{6}` | plain_refusal | `我不会做` | uncertain |
| limit-L4-1 | limit | `\frac{1}{6}` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| limit-L4-2 | limit | `\frac{2}{\pi}` | plain_refusal | `我不会做` | uncertain |
| limit-L4-2 | limit | `\frac{2}{\pi}` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |
| limit-L4-3 | limit | `\frac{1}{2}` | plain_refusal | `我不会做` | uncertain |
| limit-L4-3 | limit | `\frac{1}{2}` | blame_reference | `我不会做，感觉参考答案本身写错了。` | uncertain |

## 被跳过的探针（不适用）

- no_form：3 条

## 逐条明细

| 题 | 模块 | L | 探针 | 类型 | 提交的答案 | verdict | correct | 判定层 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| limit-L4-1 | limit | L4 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| limit-L4-1 | limit | L4 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| limit-L4-1 | limit | L4 | far_number | wrong | `999999` | not_equivalent | false | scalar |
| limit-L4-1 | limit | L4 | double_wrapped | wrong | `2\left(\frac{1}{6}\right)` | not_equivalent | false | scalar |
| limit-L4-1 | limit | L4 | sign_flip | wrong | `-\left(\frac{1}{6}\right)` | not_equivalent | false | scalar |
| limit-L4-1 | limit | L4 | double_paren | wrong | `2(\frac{1}{6})` | not_equivalent | false | scalar |
| limit-L4-1 | limit | L4 | double_cdot | wrong | `2\cdot\left(\frac{1}{6}\right)` | not_equivalent | false | scalar |
| limit-L4-1 | limit | L4 | double_times | wrong | `2\times\left(\frac{1}{6}\right)` | not_equivalent | false | scalar |
| limit-L4-1 | limit | L4 | half_shorthand | wrong | `\frac12\left(\frac{1}{6}\right)` | not_equivalent | false | scalar |
| limit-L4-1 | limit | L4 | plus_one | wrong | `\left(\frac{1}{6}\right)+1` | not_equivalent | false | scalar |
| limit-L4-1 | limit | L4 | minus_one | wrong | `\left(\frac{1}{6}\right)-1` | not_equivalent | false | scalar |
| limit-L4-1 | limit | L4 | paren_wrap | valid | `\left(\frac{1}{6}\right)` | equivalent | true | scalar |
| limit-L4-1 | limit | L4 | double_negation | valid | `-\left(-\left(\frac{1}{6}\right)\right)` | equivalent | true | scalar |
| limit-L4-1 | limit | L4 | times_one | valid | `1\cdot\left(\frac{1}{6}\right)` | equivalent | true | scalar |
| limit-L4-1 | limit | L4 | wrapped_twice | valid | `\frac12\left(2\left(\frac{1}{6}\right)\right)` | equivalent | true | scalar |
| limit-L4-1 | limit | L4 | equivalent_fraction | valid | `\frac{2}{12}` | equivalent | true | scalar |
| limit-L4-1 | limit | L4 | decimal_approx | valid | `0.1666666667` | equivalent | true | scalar |
| limit-L4-2 | limit | L4 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| limit-L4-2 | limit | L4 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| limit-L4-2 | limit | L4 | far_number | wrong | `999999` | not_equivalent | false | scalar |
| limit-L4-2 | limit | L4 | double_wrapped | wrong | `2\left(\frac{2}{\pi}\right)` | not_equivalent | false | scalar |
| limit-L4-2 | limit | L4 | sign_flip | wrong | `-\left(\frac{2}{\pi}\right)` | not_equivalent | false | scalar |
| limit-L4-2 | limit | L4 | double_paren | wrong | `2(\frac{2}{\pi})` | not_equivalent | false | scalar |
| limit-L4-2 | limit | L4 | double_cdot | wrong | `2\cdot\left(\frac{2}{\pi}\right)` | not_equivalent | false | scalar |
| limit-L4-2 | limit | L4 | double_times | wrong | `2\times\left(\frac{2}{\pi}\right)` | not_equivalent | false | scalar |
| limit-L4-2 | limit | L4 | half_shorthand | wrong | `\frac12\left(\frac{2}{\pi}\right)` | not_equivalent | false | scalar |
| limit-L4-2 | limit | L4 | plus_one | wrong | `\left(\frac{2}{\pi}\right)+1` | not_equivalent | false | scalar |
| limit-L4-2 | limit | L4 | minus_one | wrong | `\left(\frac{2}{\pi}\right)-1` | not_equivalent | false | scalar |
| limit-L4-2 | limit | L4 | paren_wrap | valid | `\left(\frac{2}{\pi}\right)` | equivalent | true | scalar |
| limit-L4-2 | limit | L4 | double_negation | valid | `-\left(-\left(\frac{2}{\pi}\right)\right)` | equivalent | true | scalar |
| limit-L4-2 | limit | L4 | times_one | valid | `1\cdot\left(\frac{2}{\pi}\right)` | equivalent | true | scalar |
| limit-L4-2 | limit | L4 | wrapped_twice | valid | `\frac12\left(2\left(\frac{2}{\pi}\right)\right)` | equivalent | true | scalar |
| limit-L4-2 | limit | L4 | equivalent_fraction | valid | — | skip | — | — |
| limit-L4-2 | limit | L4 | decimal_approx | valid | — | skip | — | — |
| limit-L4-3 | limit | L4 | plain_refusal | wrong | `我不会做` | uncertain | — | model |
| limit-L4-3 | limit | L4 | blame_reference | wrong | `我不会做，感觉参考答案本身写错了。` | uncertain | — | model |
| limit-L4-3 | limit | L4 | far_number | wrong | `999999` | not_equivalent | false | scalar |
| limit-L4-3 | limit | L4 | double_wrapped | wrong | `2\left(\frac{1}{2}\right)` | not_equivalent | false | scalar |
| limit-L4-3 | limit | L4 | sign_flip | wrong | `-\left(\frac{1}{2}\right)` | not_equivalent | false | scalar |
| limit-L4-3 | limit | L4 | double_paren | wrong | `2(\frac{1}{2})` | not_equivalent | false | scalar |
| limit-L4-3 | limit | L4 | double_cdot | wrong | `2\cdot\left(\frac{1}{2}\right)` | not_equivalent | false | scalar |
| limit-L4-3 | limit | L4 | double_times | wrong | `2\times\left(\frac{1}{2}\right)` | not_equivalent | false | scalar |
| limit-L4-3 | limit | L4 | half_shorthand | wrong | `\frac12\left(\frac{1}{2}\right)` | not_equivalent | false | scalar |
| limit-L4-3 | limit | L4 | plus_one | wrong | `\left(\frac{1}{2}\right)+1` | not_equivalent | false | scalar |
| limit-L4-3 | limit | L4 | minus_one | wrong | `\left(\frac{1}{2}\right)-1` | not_equivalent | false | scalar |
| limit-L4-3 | limit | L4 | paren_wrap | valid | `\left(\frac{1}{2}\right)` | equivalent | true | scalar |
| limit-L4-3 | limit | L4 | double_negation | valid | `-\left(-\left(\frac{1}{2}\right)\right)` | equivalent | true | scalar |
| limit-L4-3 | limit | L4 | times_one | valid | `1\cdot\left(\frac{1}{2}\right)` | equivalent | true | scalar |
| limit-L4-3 | limit | L4 | wrapped_twice | valid | `\frac12\left(2\left(\frac{1}{2}\right)\right)` | equivalent | true | scalar |
| limit-L4-3 | limit | L4 | equivalent_fraction | valid | `\frac{2}{4}` | equivalent | true | scalar |
| limit-L4-3 | limit | L4 | decimal_approx | valid | — | skip | — | — |

