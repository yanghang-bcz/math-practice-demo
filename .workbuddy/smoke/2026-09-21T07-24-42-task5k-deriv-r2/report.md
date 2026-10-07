# 50 题 reliability smoke test — task5k-deriv-r2

- 目标：`https://calcdaily-d5g2titwue91551fb-1482769901.ap-shanghai.app.tcloudbase.com/api/deepseek`
- 时间：2026-09-21T07:25:12.062Z
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
  "gate_policy": "strict-tier-b",
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
| Generate success | 4/12 |
| Generate success rate | 33.3% |
| Gate reject（两轮全拒） | 8/12 |
| Would fallback | 8/12 |
| Wrong approved | 0/4 |
| Structurally bad | 0/4 |
| Answer-solution mismatch | 0/4 |
| Answer fails verification | 0/4 |
| Verification snapshot intact | 4/4 |
| Server engine (verification.version) | quality-v2 |
| Local engine (math-quality) | quality-v2 |
| 焦点格(导数/积分 L8+12) 通过 | 4/12 |
| 焦点格 wrong approved | 0/4 |
| Judge 重复次数合计 | 12 |
| Judge 重复一致 | 4/4 |
| judge 全部 equivalent | 4/4 |
| judge 说参考答案可疑 | 0 |
| judge 改写标准答案 | 无 |
| canonical 保持不变 | 4/4 |
| judge 响应带 versions | 4/4 |
| 错答探针总数（不含跳过） | 44 |
| 错答探针被误批为对（须为0） | 0 |
| 合法探针总数（不含跳过） | 16 |
| 合法探针被误拒（越少越好） | 0 |
| 探针跳过（不适用） | 8 |
| 判题把错答说成「答案可疑」 | 0 |
| 错答探针·标量层判定 | 0/44 |
| 错答探针·结构层判定 | 36/44 |
| 错答探针·确定性覆盖率 | 81.8% |
| 错答探针·仍落到模型 | 8/44 |
| 合法探针·确定性覆盖率 | 100.0% |
| 合法探针·仍落到模型 | 0/16 |
| 合法探针·判定层不可识别（旧版后端） | 0/16 |
| Generate latency avg | 3.8s |
| Generate latency P95 | 6.2s |
| Generate latency max | 6.8s |
| Judge latency avg | 0.1s |
| Judge latency P95 | 0.2s |

## 闸门拒稿原因分布

| 原因 | 次数 |
| --- | --- |
| UNVERIFIED_SHAPE | 6 |
| GENERATION_REJECTED | 2 |
| UNVERIFIED_ANSWER | 4 |
| ANSWER_FAILS_VERIFICATION | 4 |

## 按模块 × 难度

| 格子 | 通过/总数 | wrong approved | 引擎 issue |
| --- | --- | --- | --- |
| derivative L10 | 1/4 | 0 | — |
| derivative L12 | 1/4 | 0 | — |
| derivative L8 | 2/4 | 0 | — |

## 判题重复一致性

| 题 | 模块 | 难度 | N 次 verdict | 一致 | 全 equivalent | method | 说答案可疑 | 错答探针（key:verdict:层） | 误批为对 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| derivative-L8-2 | derivative | L8 | equivalent/equivalent/equivalent | 是 | 是 | deterministic | 0 | plain_refusal:not_equivalent:model<br>blame_reference:uncertain:model<br>far_number:not_equivalent:structural<br>double_wrapped:not_equivalent:structural<br>sign_flip:not_equivalent:structural<br>double_paren:not_equivalent:structural<br>double_cdot:not_equivalent:structural<br>double_times:not_equivalent:structural<br>half_shorthand:not_equivalent:structural<br>plus_one:not_equivalent:structural<br>minus_one:not_equivalent:structural | 0 |
| derivative-L8-4 | derivative | L8 | equivalent/equivalent/equivalent | 是 | 是 | deterministic | 0 | plain_refusal:not_equivalent:model<br>blame_reference:uncertain:model<br>far_number:not_equivalent:structural<br>double_wrapped:not_equivalent:structural<br>sign_flip:not_equivalent:structural<br>double_paren:not_equivalent:structural<br>double_cdot:not_equivalent:structural<br>double_times:not_equivalent:structural<br>half_shorthand:not_equivalent:structural<br>plus_one:not_equivalent:structural<br>minus_one:not_equivalent:structural | 0 |
| derivative-L10-1 | derivative | L10 | equivalent/equivalent/equivalent | 是 | 是 | deterministic | 0 | plain_refusal:not_equivalent:model<br>blame_reference:uncertain:model<br>far_number:not_equivalent:structural<br>double_wrapped:not_equivalent:structural<br>sign_flip:not_equivalent:structural<br>double_paren:not_equivalent:structural<br>double_cdot:not_equivalent:structural<br>double_times:not_equivalent:structural<br>half_shorthand:not_equivalent:structural<br>plus_one:not_equivalent:structural<br>minus_one:not_equivalent:structural | 0 |
| derivative-L12-2 | derivative | L12 | equivalent/equivalent/equivalent | 是 | 是 | deterministic | 0 | plain_refusal:not_equivalent:model<br>blame_reference:uncertain:model<br>far_number:not_equivalent:structural<br>double_wrapped:not_equivalent:structural<br>sign_flip:not_equivalent:structural<br>double_paren:not_equivalent:structural<br>double_cdot:not_equivalent:structural<br>double_times:not_equivalent:structural<br>half_shorthand:not_equivalent:structural<br>plus_one:not_equivalent:structural<br>minus_one:not_equivalent:structural | 0 |

## 部署指纹

- 判题响应带 `judge_layer`：model, structural → 线上是 Task #4 之后的判题。
- health 带 `gate_policy: strict-tier-b` → 线上跑的是 Task 5K 之后的生成闸门。

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
