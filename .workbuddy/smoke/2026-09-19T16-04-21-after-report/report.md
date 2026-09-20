# 50 题 reliability smoke test — after-report

- 目标：`https://calcdaily-d5g2titwue91551fb-1482769901.ap-shanghai.app.tcloudbase.com/api/deepseek`
- 时间：2026-09-19T16:04:39.709Z
- 引擎版本：`quality-v2`
- 并发：3（并发会影响 P95，读数时注意）

## 服务端自报版本

```json
{
  "ok": true,
  "service": "deepseek",
  "adaptiveDifficultyModel": "v0-provisional",
  "protocol_version": 2,
  "pipeline": {
    "protocol": 2,
    "generator": "generator-v2",
    "reviewer": "reviewer-v2",
    "judge": "judge-v2",
    "math_engine": "quality-v2"
  }
}
```

响应里的版本集合：

```json
[
  {
    "protocol": 2,
    "generator": "generator-v2",
    "reviewer": "reviewer-v2",
    "judge": "judge-v2",
    "math_engine": "quality-v2"
  }
]
```

## 关键指标

| 指标 | 值 |
| --- | --- |
| Generate success | 41/41 |
| Generate success rate | 100.0% |
| Gate reject（两轮全拒） | 0/41 |
| Would fallback | 0/41 |
| Wrong approved | 0/41 |
| Structurally bad | 0/41 |
| Answer-solution mismatch | 0/41 |
| Answer fails verification | 0/41 |
| Verification snapshot intact | 41/41 |
| Server engine (verification.version) | quality-v2 |
| Local engine (math-quality) | quality-v2 |
| 焦点格(导数/积分 L8+12) 通过 | 18/18 |
| 焦点格 wrong approved | 0/18 |
| Judge 重复次数合计 | 30 |
| Judge 重复一致 | 10/10 |
| judge 全部 equivalent | 10/10 |
| judge 说参考答案可疑 | 0 |
| judge 改写标准答案 | 无 |
| canonical 保持不变 | 10/10 |
| judge 响应带 versions | 10/10 |
| 错答探针总数 | 40 |
| 错答探针被误批为对（须为0） | 6 |
| 判题把错答说成「答案可疑」 | 0 |
| Generate latency avg | 3.1s |
| Generate latency P95 | 6.3s |
| Generate latency max | 6.7s |
| Judge latency avg | 0.5s |
| Judge latency P95 | 0.9s |

## 按模块 × 难度

| 格子 | 通过/总数 | wrong approved | 引擎 issue |
| --- | --- | --- | --- |
| derivative L10 | 3/3 | 0 | — |
| derivative L12 | 3/3 | 0 | — |
| derivative L4 | 3/3 | 0 | — |
| derivative L6 | 2/2 | 0 | — |
| derivative L8 | 2/2 | 0 | — |
| integral L10 | 3/3 | 0 | — |
| integral L12 | 3/3 | 0 | — |
| integral L4 | 3/3 | 0 | — |
| integral L6 | 3/3 | 0 | — |
| integral L8 | 4/4 | 0 | — |
| limit L10 | 2/2 | 0 | — |
| limit L12 | 1/1 | 0 | — |
| limit L4 | 3/3 | 0 | — |
| limit L6 | 3/3 | 0 | — |
| limit L8 | 3/3 | 0 | — |

## 判题重复一致性

| 题 | 模块 | 难度 | N 次 verdict | 一致 | 全 equivalent | method | 说答案可疑 | 错答探针（verdict） | 误批为对 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| limit-L4-1 | limit | L4 | equivalent/equivalent/equivalent | 是 | 是 | deterministic | 0 | plain_refusal:not_equivalent<br>blame_reference:not_equivalent<br>far_number:not_equivalent<br>double_wrapped:equivalent ←correct! | ⚠️ 1 |
| limit-L6-1 | limit | L6 | equivalent/equivalent/equivalent | 是 | 是 | ai | 0 | plain_refusal:not_equivalent<br>blame_reference:not_equivalent<br>far_number:not_equivalent<br>double_wrapped:not_equivalent | 0 |
| limit-L8-1 | limit | L8 | equivalent/equivalent/equivalent | 是 | 是 | deterministic | 0 | plain_refusal:not_equivalent<br>blame_reference:not_equivalent<br>far_number:not_equivalent<br>double_wrapped:not_equivalent | 0 |
| limit-L10-1 | limit | L10 | equivalent/equivalent/equivalent | 是 | 是 | deterministic | 0 | plain_refusal:not_equivalent<br>blame_reference:not_equivalent<br>far_number:not_equivalent<br>double_wrapped:equivalent ←correct! | ⚠️ 1 |
| derivative-L8-2 | derivative | L8 | equivalent/equivalent/equivalent | 是 | 是 | ai | 0 | plain_refusal:not_equivalent<br>blame_reference:uncertain<br>far_number:not_equivalent<br>double_wrapped:equivalent ←correct! | ⚠️ 1 |
| derivative-L10-1 | derivative | L10 | equivalent/equivalent/equivalent | 是 | 是 | ai | 0 | plain_refusal:not_equivalent<br>blame_reference:uncertain<br>far_number:not_equivalent<br>double_wrapped:not_equivalent | 0 |
| derivative-L12-1 | derivative | L12 | equivalent/equivalent/equivalent | 是 | 是 | ai | 0 | plain_refusal:not_equivalent<br>blame_reference:uncertain<br>far_number:not_equivalent<br>double_wrapped:not_equivalent | 0 |
| integral-L8-1 | integral | L8 | equivalent/equivalent/equivalent | 是 | 是 | ai | 0 | plain_refusal:not_equivalent<br>blame_reference:not_equivalent<br>far_number:not_equivalent<br>double_wrapped:equivalent ←correct! | ⚠️ 1 |
| integral-L10-2 | integral | L10 | equivalent/equivalent/equivalent | 是 | 是 | ai | 0 | plain_refusal:not_equivalent<br>blame_reference:uncertain<br>far_number:not_equivalent<br>double_wrapped:equivalent ←correct! | ⚠️ 1 |
| integral-L12-1 | integral | L12 | equivalent/equivalent/equivalent | 是 | 是 | ai | 0 | plain_refusal:not_equivalent<br>blame_reference:uncertain<br>far_number:not_equivalent<br>double_wrapped:equivalent ←correct! | ⚠️ 1 |

## 判题误批错答（零容忍）

学生答案明显是错的，判题却给了 `correct: true`。

- `limit-L4-1` 探针 `double_wrapped`（正确值的 2 倍（系数×括号，引擎解析不了））：verdict=equivalent
  - 提交的「答案」：2\left(1/6\right)
- `limit-L10-1` 探针 `double_wrapped`（正确值的 2 倍（系数×括号，引擎解析不了））：verdict=equivalent
  - 提交的「答案」：2\left(-\frac{1}{3}\right)
- `derivative-L8-2` 探针 `double_wrapped`（正确值的 2 倍（系数×括号，引擎解析不了））：verdict=equivalent
  - 提交的「答案」：2\left(\frac{1}{2}\sqrt{\frac{(x-1)(x-2)}{(x-3)(x-4)}}\left(\frac{1}{x-1}+\frac{1}{x-2}-\frac{1}{x-3}-\frac{1}{x-4}\right)\right)
- `integral-L8-1` 探针 `double_wrapped`（正确值的 2 倍（系数×括号，引擎解析不了））：verdict=equivalent
  - 提交的「答案」：2\left(\frac{\pi}{4}\right)
- `integral-L10-2` 探针 `double_wrapped`（正确值的 2 倍（系数×括号，引擎解析不了））：verdict=equivalent
  - 提交的「答案」：2\left(\frac12\arcsin\frac{x^2+1}{\sqrt2\,x^2}+C\right)
- `integral-L12-1` 探针 `double_wrapped`（正确值的 2 倍（系数×括号，引擎解析不了））：verdict=equivalent
  - 提交的「答案」：2\left(-\frac12\ln\left|\frac{1+\sqrt{x^4+x^2+1}}{x^2}\right|+C\right)

## 复核方法与它的局限

- 独立复核用的是项目自己的确定性引擎 `math-quality.js`。它和服务端跑的是同一份代码，
  所以它证明的是「服务端的闸门有没有真的执行、返回的题目有没有被改过」，
  **不等于**换一个数学系学生重算一遍。
- 其中 `ANSWER_FAILS_VERIFICATION`（把 standard answer 代回题目做数值验证）和
  `SOLUTION_MISMATCH`（解析里声称的最终答案与 answer 对撞）是抓「算错却放行」的主力。
  - 覆盖不到的一类：解析里裸写的**符号**答案，例如「最终答案为 3x」。
    抽取正则只认纯数字或 `\(...\)` 包裹的式子，而且 `compare(3x, 2x)` 本身就返回 `uncertain`。
    这条边界在 `tests/smoke-matrix.cjs` 里有测试钉着。
- 要更强的独立性，需要再接一个外部解答模型做第二意见 —— 当前脚本没有接。
