# 前后对比：v1-v2格 → v1-L4

- 改造前：`https://calcdaily-d5g2titwue91551fb-1482769901.ap-shanghai.app.tcloudbase.com/api/deepseek` @ 2026-09-19T15:52:16.186Z
- 改造后：`https://calcdaily-d5g2titwue91551fb-1482769901.ap-shanghai.app.tcloudbase.com/api/deepseek` @ 2026-09-19T15:53:51.866Z

## 版本

- 改造前服务端自报：`{"ok":true,"service":"deepseek","adaptiveDifficultyModel":"v0-provisional"}`
- 改造后服务端自报：`{"ok":true,"service":"deepseek","adaptiveDifficultyModel":"v0-provisional"}`

## 指标对比

| 指标 | v1-v2格 | v1-L4 | 变化 |
| --- | --- | --- | --- |
| Generate success | 1/4 | 3/3 | ↑ 改善 +75.0pt |
| Generate success rate | 25.0% | 100.0% | ↑ 改善 +75.0pt |
| Gate reject（两轮全拒） | 3/4 | 0/3 | ↓ 改善 -75.0pt |
| Would fallback | 3/4 | 0/3 | ↓ 改善 -75.0pt |
| Wrong approved | 0/1 | 0/3 | ＝ 不变 |
| Structurally bad | 0/1 | 0/3 | ＝ 不变 |
| Answer-solution mismatch | 0/1 | 0/3 | ＝ 不变 |
| Answer fails verification | 0/1 | 0/3 | ＝ 不变 |
| Verification snapshot intact | 1/1 | 3/3 | ＝ 不变 |
| Server engine (verification.version) | quality-v1 | quality-v1 |  |
| Local engine (math-quality) | quality-v2 | quality-v2 |  |
| 焦点格(导数/积分 L8+12) 通过 | 1/4 | 0/0 |  |
| 焦点格 wrong approved | 0/1 | 0/0 |  |
| Judge 重复次数合计 | 3 | 6 | +3 |
| Judge 重复一致 | 1/1 | 2/2 | ＝ 不变 |
| judge 全部 equivalent | 1/1 | 2/2 | ＝ 不变 |
| judge 说参考答案可疑 | 0 | 0 | ＝ 不变 |
| judge 改写标准答案 | 无 | 无 |  |
| canonical 保持不变 | 1/1 | 2/2 | ＝ 不变 |
| judge 响应带 versions | 0/1 | 0/2 | ＝ 不变 |
| 错答探针被误批为对 | 1 | — |  |
| Generate latency avg | 3.2s | 3.1s | ↓ 改善 -0.1s |
| Generate latency P95 | 3.2s | 3.4s | ↑ 恶化 +0.2s |
| Generate latency max | 3.2s | 3.5s | ↑ 恶化 +0.3s |
| Judge latency avg | 1.2s | 0.5s | ↓ 改善 -0.7s |
| Judge latency P95 | 1.2s | 0.9s | ↓ 改善 -0.3s |
| 错答探针总数 | — | 8 |  |
| 错答探针被误批为对（须为0） | — | 2 |  |
| 判题把错答说成「答案可疑」 | — | 0 |  |

## 验收判定

- ✅ **Wrong approved = 0**：没有明确数学错误进入用户端。

按约定应先定位原因，暂不继续做 prefetch / retry / storage 优化。

- ❌ **错答探针有 2 条被误批为对**，未达标。

  判题误批错答的条目：
  - `limit-L4-1` 探针 `blame_reference`：提交「undefined」→ verdict=equivalent
  - `limit-L4-2` 探针 `blame_reference`：提交「undefined」→ verdict=equivalent

