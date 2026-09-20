# 50 题 reliability smoke test — selftest

- 目标：`https://calcdaily-d5g2titwue91551fb-1482769901.ap-shanghai.app.tcloudbase.com/api/deepseek`
- 时间：2026-09-19T15:51:20.192Z
- 引擎版本：`quality-v2`
- 并发：3（并发会影响 P95，读数时注意）

## 服务端自报版本

```json
{
  "ok": true,
  "service": "deepseek",
  "adaptiveDifficultyModel": "v0-provisional"
}
```

响应里的版本集合：

```json
[]
```

## 关键指标

| 指标 | 值 |
| --- | --- |
| Generate success | 3/3 |
| Generate success rate | 100.0% |
| Gate reject（两轮全拒） | 0/3 |
| Would fallback | 0/3 |
| Wrong approved | 0/3 |
| Structurally bad | 0/3 |
| Answer-solution mismatch | 0/3 |
| Answer fails verification | 0/3 |
| Verification snapshot intact | 3/3 |
| 焦点格(导数/积分 L8+12) 通过 | 0/0 |
| 焦点格 wrong approved | 0/0 |
| Judge 重复次数合计 | 2 |
| Judge 重复一致 | 1/1 |
| judge 全部 equivalent | 0/1 |
| judge 说参考答案可疑 | 0 |
| judge 改写标准答案 | 无 |
| canonical 保持不变 | 1/1 |
| judge 响应带 versions | 0/1 |
| 错答探针被误批为对 | 0 |
| Generate latency avg | 3.9s |
| Generate latency P95 | 4.3s |
| Generate latency max | 4.3s |
| Judge latency avg | 0.1s |
| Judge latency P95 | 0.1s |

## 按模块 × 难度

| 格子 | 通过/总数 | wrong approved | 引擎 issue |
| --- | --- | --- | --- |
| limit L4 | 3/3 | 0 | — |

## 判题重复一致性

| 题 | 模块 | 难度 | 3 次 verdict | 一致 | 全 equivalent | method | reason | 说答案可疑 | 探针 verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| limit-L4-1 | limit | L4 | uncertain/uncertain | 是 | 否 |  |  | 0 | uncertain |

## 复核方法与它的局限

- 独立复核用的是项目自己的确定性引擎 `math-quality.js`。它和服务端跑的是同一份代码，
  所以它证明的是「服务端的闸门有没有真的执行、返回的题目有没有被改过」，
  **不等于**换一个数学系学生重算一遍。
- 其中 `ANSWER_FAILS_VERIFICATION`（把 standard answer 代回题目做数值验证）和
  `SOLUTION_MISMATCH`（解析里声称的最终答案与 answer 对撞）是抓「算错却放行」的主力。
- 要更强的独立性，需要再接一个外部解答模型做第二意见 —— 当前脚本没有接。
