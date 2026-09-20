# 前后对比（可对得上的格子）

> 说明：改造前的完整 50 题基线随旧后端一起消失了。这里只对比**当初验证测试台时实际打过、
> 且两个版本都有样本**的格子。n 很小，只作方向性参考，不要当统计结论。

| 格子 | 改造前 v1.0 通过 | 改造后 v2 通过 |
| --- | --- | --- |
| derivative-L10 | —（无样本） | 3/3 |
| derivative-L12 | —（无样本） | 3/3 |
| derivative-L4 | —（无样本） | 3/3 |
| derivative-L6 | —（无样本） | 2/2 |
| derivative-L8 | 1/4 | 2/2 |
| integral-L10 | —（无样本） | 3/3 |
| integral-L12 | —（无样本） | 3/3 |
| integral-L4 | —（无样本） | 3/3 |
| integral-L6 | —（无样本） | 3/3 |
| integral-L8 | —（无样本） | 4/4 |
| limit-L10 | —（无样本） | 2/2 |
| limit-L12 | —（无样本） | 1/1 |
| limit-L4 | 3/3 | 3/3 |
| limit-L6 | —（无样本） | 3/3 |
| limit-L8 | —（无样本） | 3/3 |

**仅限有改造前样本的那几个格子**：改造前 4/7 → 改造后 5/5

## 判题：把「指责参考答案」的句子当答案提交

| | 改造前 v1.0 | 改造后 v2 |
| --- | --- | --- |
| 直接实验（同题，提交「我不会做，感觉参考答案本身写错了。」） | `equivalent` / `correct: true` —— **错答被判对** | `not_equivalent` 或 `uncertain`，从不判对 |
| 50 题评测里的 `blame_reference` 探针 | 未纳入（当时还没这条探针） | 10 条全部未判对；另有 1 条走 `canonical_suspected`（作废该题、不冤枉学生） |

## 响应里的版本指纹

| | 改造前 v1.0 | 改造后 v2 |
| --- | --- | --- |
| `?health=1` | 只有 `ok` / `service` / `adaptiveDifficultyModel` | 增加 `protocol_version: 2` + `pipeline{...}` |
| `verification.version` | `quality-v1` | `quality-v2` |
| 拒稿原因 | `rejection_reasons` 为空 | 可枚举：`HARD_FIELD_FALSE:answer_correct`、`ANSWER_FAILS_VERIFICATION`、`SOLUTION_MISMATCH`、`CANONICAL_SUSPECTED` |
| judge 失败原因 | 无 `reason` 字段 | 必带 `reason`（`empty_input` / `question_untrusted` / `judge_unavailable` / `canonical_suspected` / `ok`） |

