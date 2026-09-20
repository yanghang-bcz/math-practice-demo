# 50 题 reliability smoke test — finalcheck

- 目标：`https://calcdaily-d5g2titwue91551fb-1482769901.ap-shanghai.app.tcloudbase.com/api/deepseek`
- 时间：2026-09-19T15:56:27.714Z
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
| Generate success | 1/1 |
| Generate success rate | 100.0% |
| Gate reject（两轮全拒） | 0/1 |
| Would fallback | 0/1 |
| Wrong approved | 0/1 |
| Structurally bad | 0/1 |
| Answer-solution mismatch | 0/1 |
| Answer fails verification | 0/1 |
| Verification snapshot intact | 1/1 |
| Server engine (verification.version) | quality-v2 |
| Local engine (math-quality) | quality-v2 |
| 焦点格(导数/积分 L8+12) 通过 | 0/0 |
| 焦点格 wrong approved | 0/0 |
| Judge 重复次数合计 | 0 |
| Judge 重复一致 | 0/0 |
| judge 全部 equivalent | 0/0 |
| judge 说参考答案可疑 | 0 |
| judge 改写标准答案 | 无 |
| canonical 保持不变 | 0/0 |
| judge 响应带 versions | 0/0 |
| 错答探针总数 | 0 |
| 错答探针被误批为对（须为0） | 0 |
| 判题把错答说成「答案可疑」 | 0 |
| Generate latency avg | 3.1s |
| Generate latency P95 | 3.1s |
| Generate latency max | 3.1s |
| Judge latency avg | n/a |
| Judge latency P95 | n/a |

## 按模块 × 难度

| 格子 | 通过/总数 | wrong approved | 引擎 issue |
| --- | --- | --- | --- |
| limit L4 | 1/1 | 0 | — |

## 判题重复一致性

| 题 | 模块 | 难度 | N 次 verdict | 一致 | 全 equivalent | method | 说答案可疑 | 错答探针（verdict） | 误批为对 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

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
