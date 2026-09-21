# 50 题 reliability smoke test — online-50-v2

- 目标：`https://calcdaily-d5g2titwue91551fb-1482769901.ap-shanghai.app.tcloudbase.com/api/deepseek`
- 时间：2026-09-20T07:29:51.338Z
- 引擎版本：`quality-v2`
- 并发：3（并发会影响 P95，读数时注意）

## 服务端自报版本

```json
{
  "ok": true,
  "service": "deepseek",
  "adaptiveDifficultyModel": "v0-provisional",
  "protocol_version": 2,
  "generator_version": "generator-v2",
  "reviewer_version": "reviewer-v2",
  "judge_version": "judge-v2",
  "math_engine_version": "quality-v2",
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
| Generate success | 18/50 |
| Generate success rate | 36.0% |
| Gate reject（两轮全拒） | 32/50 |
| Would fallback | 32/50 |
| Wrong approved | 0/18 |
| Structurally bad | 0/18 |
| Answer-solution mismatch | 0/18 |
| Answer fails verification | 0/18 |
| Verification snapshot intact | 18/18 |
| Server engine (verification.version) | quality-v2 |
| Local engine (math-quality) | quality-v2 |
| 焦点格(导数/积分 L8+12) 通过 | 7/24 |
| 焦点格 wrong approved | 0/7 |
| Judge 重复次数合计 | 30 |
| Judge 重复一致 | 10/10 |
| judge 全部 equivalent | 10/10 |
| judge 说参考答案可疑 | 0 |
| judge 改写标准答案 | 无 |
| canonical 保持不变 | 10/10 |
| judge 响应带 versions | 10/10 |
| 错答探针总数（不含跳过） | 100 |
| 错答探针被误批为对（须为0） | 0 |
| 合法探针总数（不含跳过） | 45 |
| 合法探针被误拒（越少越好） | 0 |
| 探针跳过（不适用） | 25 |
| 判题把错答说成「答案可疑」 | 3 |
| 错答探针·标量层判定 | 41/100 |
| 错答探针·结构层判定 | 39/100 |
| 错答探针·确定性覆盖率 | 80.0% |
| 错答探针·仍落到模型 | 17/100 |
| 合法探针·确定性覆盖率 | 100.0% |
| 合法探针·仍落到模型 | 0/45 |
| 合法探针·判定层不可识别（旧版后端） | 0/45 |
| Generate latency avg | 3.5s |
| Generate latency P95 | 5.7s |
| Generate latency max | 7.2s |
| Judge latency avg | 0.1s |
| Judge latency P95 | 0.1s |

## 闸门拒稿原因分布

| 原因 | 次数 |
| --- | --- |
| UNVERIFIED_SHAPE | 19 |
| SOLUTION_MISMATCH | 5 |
| ANSWER_FAILS_VERIFICATION | 33 |
| GENERATION_REJECTED | 11 |

## 按模块 × 难度

| 格子 | 通过/总数 | wrong approved | 引擎 issue |
| --- | --- | --- | --- |
| derivative L10 | 1/4 | 0 | — |
| derivative L12 | 0/4 | 0 | — |
| derivative L4 | 1/3 | 0 | — |
| derivative L6 | 0/3 | 0 | — |
| derivative L8 | 0/4 | 0 | — |
| integral L10 | 0/4 | 0 | — |
| integral L12 | 2/4 | 0 | — |
| integral L4 | 3/3 | 0 | — |
| integral L6 | 2/3 | 0 | — |
| integral L8 | 4/4 | 0 | — |
| limit L10 | 0/3 | 0 | — |
| limit L12 | 0/2 | 0 | — |
| limit L4 | 2/3 | 0 | — |
| limit L6 | 1/3 | 0 | — |
| limit L8 | 2/3 | 0 | — |

## 判题重复一致性

| 题 | 模块 | 难度 | N 次 verdict | 一致 | 全 equivalent | method | 说答案可疑 | 错答探针（key:verdict:层） | 误批为对 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| limit-L4-1 | limit | L4 | equivalent/equivalent/equivalent | 是 | 是 | deterministic | 0 | plain_refusal:not_equivalent:model<br>blame_reference:uncertain:model<br>far_number:not_equivalent:scalar<br>double_wrapped:not_equivalent:scalar<br>sign_flip:not_equivalent:scalar<br>double_paren:not_equivalent:scalar<br>double_cdot:not_equivalent:scalar<br>double_times:not_equivalent:scalar<br>half_shorthand:not_equivalent:scalar<br>plus_one:not_equivalent:scalar<br>minus_one:not_equivalent:scalar | 0 |
| limit-L6-3 | limit | L6 | equivalent/equivalent/equivalent | 是 | 是 | deterministic | 0 | plain_refusal:not_equivalent:model<br>blame_reference:not_equivalent:model<br>far_number:not_equivalent:scalar<br>double_wrapped:not_equivalent:scalar<br>sign_flip:not_equivalent:scalar<br>double_paren:not_equivalent:scalar<br>double_cdot:not_equivalent:scalar<br>double_times:not_equivalent:scalar<br>half_shorthand:not_equivalent:scalar<br>plus_one:not_equivalent:scalar<br>minus_one:not_equivalent:scalar | 0 |
| limit-L8-2 | limit | L8 | equivalent/equivalent/equivalent | 是 | 是 | deterministic | 0 | plain_refusal:not_equivalent:model<br>blame_reference:uncertain:model<br>far_number:not_equivalent:scalar<br>double_wrapped:not_equivalent:scalar<br>sign_flip:not_equivalent:scalar<br>double_paren:not_equivalent:scalar<br>double_cdot:not_equivalent:scalar<br>double_times:not_equivalent:scalar<br>half_shorthand:not_equivalent:scalar<br>plus_one:not_equivalent:scalar<br>minus_one:not_equivalent:scalar | 0 |
| derivative-L4-2 | derivative | L4 | equivalent/equivalent/equivalent | 是 | 是 | deterministic | 0 | plain_refusal:not_equivalent:model<br>blame_reference:canonical_suspected:?<br>far_number:not_equivalent:structural<br>double_wrapped:not_equivalent:structural<br>sign_flip:not_equivalent:structural<br>double_paren:not_equivalent:structural<br>double_cdot:not_equivalent:structural<br>double_times:not_equivalent:structural<br>half_shorthand:not_equivalent:structural<br>plus_one:not_equivalent:structural<br>minus_one:not_equivalent:structural | 0 |
| derivative-L10-4 | derivative | L10 | equivalent/equivalent/equivalent | 是 | 是 | deterministic | 0 | plain_refusal:not_equivalent:model<br>blame_reference:canonical_suspected:?<br>far_number:not_equivalent:structural<br>double_wrapped:not_equivalent:structural<br>sign_flip:not_equivalent:structural<br>double_paren:not_equivalent:structural<br>double_cdot:not_equivalent:structural<br>double_times:not_equivalent:structural<br>half_shorthand:not_equivalent:structural<br>plus_one:not_equivalent:structural<br>minus_one:not_equivalent:structural | 0 |
| integral-L4-1 | integral | L4 | equivalent/equivalent/equivalent | 是 | 是 | deterministic | 0 | plain_refusal:not_equivalent:model<br>blame_reference:canonical_suspected:?<br>far_number:not_equivalent:structural<br>double_wrapped:not_equivalent:structural<br>sign_flip:not_equivalent:structural<br>double_paren:not_equivalent:structural<br>double_cdot:not_equivalent:structural<br>double_times:not_equivalent:structural<br>half_shorthand:not_equivalent:structural<br>plus_one:skip<br>minus_one:skip | 0 |
| integral-L6-2 | integral | L6 | equivalent/equivalent/equivalent | 是 | 是 | deterministic | 0 | plain_refusal:not_equivalent:model<br>blame_reference:not_equivalent:model<br>far_number:not_equivalent:scalar<br>double_wrapped:not_equivalent:scalar<br>sign_flip:not_equivalent:scalar<br>double_paren:not_equivalent:scalar<br>double_cdot:not_equivalent:scalar<br>double_times:not_equivalent:scalar<br>half_shorthand:not_equivalent:scalar<br>plus_one:skip<br>minus_one:skip | 0 |
| integral-L8-1 | integral | L8 | equivalent/equivalent/equivalent | 是 | 是 | deterministic | 0 | plain_refusal:not_equivalent:model<br>blame_reference:not_equivalent:model<br>far_number:not_equivalent:scalar<br>double_wrapped:not_equivalent:scalar<br>sign_flip:not_equivalent:scalar<br>double_paren:not_equivalent:scalar<br>double_cdot:not_equivalent:scalar<br>double_times:not_equivalent:scalar<br>half_shorthand:not_equivalent:scalar<br>plus_one:skip<br>minus_one:skip | 0 |
| integral-L8-2 | integral | L8 | equivalent/equivalent/equivalent | 是 | 是 | deterministic | 0 | plain_refusal:not_equivalent:model<br>blame_reference:uncertain:model<br>far_number:not_equivalent:structural<br>double_wrapped:not_equivalent:structural<br>sign_flip:not_equivalent:structural<br>double_paren:not_equivalent:structural<br>double_cdot:not_equivalent:structural<br>double_times:not_equivalent:structural<br>half_shorthand:not_equivalent:structural<br>plus_one:skip<br>minus_one:skip | 0 |
| integral-L12-3 | integral | L12 | equivalent/equivalent/equivalent | 是 | 是 | deterministic | 0 | plain_refusal:not_equivalent:model<br>blame_reference:uncertain:model<br>far_number:not_equivalent:structural<br>double_wrapped:not_equivalent:structural<br>sign_flip:not_equivalent:structural<br>double_paren:not_equivalent:structural<br>double_cdot:not_equivalent:structural<br>double_times:not_equivalent:structural<br>half_shorthand:not_equivalent:structural<br>plus_one:skip<br>minus_one:skip | 0 |

## 部署指纹

- 判题响应带 `judge_layer`：model, scalar, structural → 线上是 Task #4 之后的判题。

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
