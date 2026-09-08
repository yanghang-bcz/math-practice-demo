# CalcDaily 产品需求文档 PRD

> Adaptive Calculus Practice for Chinese Postgraduate Entrance Exams

**在线体验：**  
https://calcdaily-v4-calcdaily-d5g2titwue91551fb.webapps.tcloudbase.com/

---

## 1. 文档信息

| 项目 | 内容 |
|---|---|
| 产品名称 | CalcDaily |
| 产品类型 | 考研高等数学自适应每日练习 Web App |
| 当前版本 | v1.0 Beta |
| 当前阶段 | MVP 完成 / User Validation |
| 核心用户 | 中国大陆考研数学学习者 |
| 产品负责人 | Bryce |
| 平台 | Web / Desktop / Mobile Responsive |
| 文档状态 | User Testing Baseline |
| 更新时间 | 2026-09-08 |

---

# 2. 产品概述

CalcDaily 是一款面向中国考研高等数学学习者的**自适应每日刷题 Web App**。

它并不试图替代教材、课程或完整题库，而是解决一个更具体的问题：

> **学生已经开始复习以后，今天应该做什么题，以及这道题做完以后，下一道题应该是什么。**

传统刷题通常按照固定章节、固定题单或统一难度推进，但不同学生的能力水平不同，同一个学生在不同知识点上的掌握程度也并不一致。

CalcDaily 希望通过：

- 能力诊断
- 每日练习
- 动态难度调整
- Topic Mastery
- 错误类型识别
- 错题复习
- 学习分析

建立一个持续更新的学习闭环。

```text
能力诊断
   ↓
每日练习
   ↓
作答与判题
   ↓
能力 / 知识点状态更新
   ↓
动态选择下一题
   ↓
错题进入复习队列
   ↓
再次练习
```

CalcDaily 的核心不是生成更多题，而是：

> **让每一次作答真正改变之后的练习。**

---

# 3. 问题背景

## 3.1 固定题单难以匹配实时能力

传统考研数学练习通常按照：

- 章节
- 题型
- 固定难度
- 固定编排顺序

组织题目。

但两个学习同一章节的学生，实际能力可能完全不同。

容易出现：

- 基础较弱的学生连续遭遇过难题目；
- 基础较强的学生重复完成已经掌握的题目；
- 学生需要自己决定下一步做什么；
- 某个模块整体较强，但局部知识点仍然薄弱。

---

## 3.2 错题被记录，但没有真正进入后续学习

传统错题本能够回答：

> 我以前错过什么？

却未必能回答：

> 我什么时候应该重新做？

> 我现在是否已经掌握？

> 这次错误应该如何影响之后的练习？

因此容易产生：

> 错题记录不断增加，但真正发生的复习行为有限。

---

## 3.3 “答错”并不代表同一种问题

同样一道做错的题，原因可能分别是：

- 完全不会；
- 方法方向错误；
- 计算粗心；
- 输入错误。

如果系统统一将其解释为“数学能力不足”，会污染能力判断与复习策略。

---

## 3.4 学习数据不应该取代学习任务

早期 CalcDaily 曾将 Dashboard 作为默认首页。

后续重新审视用户打开学习产品时最主要的行为后，发现：

> 用户多数时候打开 CalcDaily，不是为了评价昨天学得怎么样，而是为了开始今天的学习。

因此将 **今日练习** 调整为默认首页，将数据集中至用户主动查看的 **学习分析** 页面。

---

# 4. 产品定位

## 4.1 一句话定位

> **根据学生当前表现动态决定下一道题的考研高数每日练习工具。**

---

## 4.2 核心价值

CalcDaily 希望减少学生在三个环节中的决策成本：

### 今天做什么？

由系统根据能力、知识点状态和训练策略生成练习。

### 做完以后下一题是什么？

根据最新作答结果动态调整，而不是提前一次性固定整套题目。

### 做错以后怎么办？

错误进入后续 Review Queue，而不是仅保留为历史记录。

---

# 5. 目标用户

当前 MVP 核心用户：

> 正在准备中国研究生入学考试数学科目的本科生。

当前范围聚焦：

- 高等数学
- 极限
- 导数
- 积分

---

## 5.1 用户类型

### 基础薄弱型

特点：

- 已学习过部分知识；
- 遗忘较多；
- 容易被连续高难题打断。

核心需求：

> 希望题目难度能够逐渐适应当前水平，而不是持续受挫。

---

### 常规复习型

特点：

- 已完成部分一轮学习；
- 有一定基础；
- 需要稳定刷题。

核心需求：

> 不希望每天重新花时间决定今天做什么。

---

### 强化阶段型

特点：

- 基础知识较完整；
- 希望暴露薄弱点；
- 能接受一定比例挑战题。

核心需求：

> 不希望把大量时间浪费在已经掌握的简单题上。

---

# 6. 产品目标

CalcDaily v1.0 主要验证以下假设。

## H1

用户愿意将部分选题权交给系统，而不是完全手动选择题目。

## H2

基于实时作答调整难度，可以使后续题目总体保持在用户可接受的难度范围。

## H3

将错题自动转化为后续复习任务，比单纯记录错题更容易形成真正的复习行为。

## H4

用户不需要理解 IRT、θ 或内部算法，也可以通过练习过程感受到系统的适应性。

---

# 7. Non-goals

当前版本明确不做：

- 视频课程
- 系统知识点教学
- AI 聊天教师
- 学习社区
- 好友系统
- 排行榜
- PK
- 积分商城
- 社交裂变
- 完整考研模拟卷
- 多学科扩张

当前首要任务是验证：

> **自适应每日练习闭环本身是否成立。**

---

# 8. 信息架构

```text
CalcDaily

├── 今日练习
│   ├── 每日练习
│   └── 首次能力诊断入口
│
├── 错题复习
│   ├── 待复习知识点
│   └── Review Session
│
├── 学习分析
│   ├── 当前水平
│   ├── 模块能力
│   ├── 薄弱考点
│   ├── 最近记录
│   └── 能力诊断入口
│
├── 学习记录
│
└── 设置
    ├── 自适应 / 固定难度
    ├── 手动等级
    ├── 训练模式
    └── 每日题量
```

---

# 9. 主导航

主导航按照使用频率组织：

1. 今日练习
2. 错题复习
3. 学习分析

分隔后：

4. 学习记录
5. 设置

能力诊断不作为长期主导航。

原因：

> 能力诊断属于首次使用和低频校准行为，而不是每天都需要完成的核心任务。

---

# 10. 首页

## 10.1 产品原则

首页只优先回答：

> **今天怎么开始？**

不承担完整 Dashboard 功能。

---

## 10.2 普通用户首页

展示：

- 时间问候
- 日期
- 今日练习
- 今日题量
- 当前模块
- 开始练习 CTA

示例：

```text
下午好，Bryce。

今日练习

10 题
极限 · 导数 · 积分

开始练习 →
```

---

## 10.3 首页不展示

默认首页不展示：

- 累计正确率
- 连续学习天数
- 大量历史数据
- Ability θ
- Confidence
- IRT 解释
- Adaptive Algorithm 解释
- “预计 XX 分钟”
- 薄弱点总结
- 励志文案

原因：

> 降低用户真正开始练习前的认知成本。

---

# 11. 首次使用与能力诊断

首次用户进入：

```text
打开 CalcDaily
       ↓
进入今日练习
       ↓
推荐能力诊断
       ↓
 ┌─────┴─────┐
 ↓           ↓
开始诊断    暂时跳过
 ↓           ↓
能力初始化   默认起点
 └─────┬─────┘
       ↓
   今日练习
```

推荐文案：

> **先看看从哪里开始。**

辅助说明：

> 做几道题，之后的练习会更合适。

---

## 11.1 诊断原则

能力诊断：

> 推荐，但不强制。

用户可以：

- 完成诊断；
- 跳过诊断；
- 通过正常练习逐渐完成能力校准；
- 后续从学习分析重新进入诊断。

未完成诊断时，系统可以从约 **L6** 的中间区域开始探索。

---

# 12. 每日练习

每日题量支持：

- 8 题
- 10 题
- 12 题

默认：

> 10 题

核心原则：

> **一次 Daily Session 的题目不在开始时全部固定。**

每道题作答结束后，系统重新决定下一题。

---

# 13. 单题流程

```text
系统选择目标模块 / Topic / 难度
          ↓
生成题目
          ↓
用户作答
          ↓
提交答案
          ↓
AI 数学等价判断
          ↓
     ┌────┴────┐
     ↓         ↓
   正确       错误
     ↓         ↓
能力更新    选择错误类型
     ↓         ↓
Topic 更新  能力 / Topic 更新
     ↓         ↓
     │      Review Queue
     └────┬────┘
          ↓
重新选择下一题
```

---

# 14. Adaptive Ability Model

CalcDaily 使用简化的：

> **1PL-IRT + Elo-style update**

作为当前能力更新基础。

预测用户答对题目的概率：

```text
P = 1 / (1 + exp(-0.9 × (θ - b)))
```

其中：

- `P`：系统预测正确概率
- `θ`：用户当前能力
- `b`：题目难度

---

## 14.1 能力更新

```text
θ_new = θ_old + K × (R - P) × W
```

其中：

- `R`：真实作答结果
- `P`：预测答对概率
- `W`：错误类型影响权重
- `K`：更新速度

动态学习率：

```text
K(n) = 0.15 + 0.35 × exp(-n / 30)
```

设计目的：

- 新用户样本少时调整更快；
- 随着作答数量增加逐渐稳定；
- 避免长期用户能力值被单题大幅改变。

---

# 15. L1–L12 难度展示

前端使用：

> **L1–L12**

向用户表达当前练习难度。

但 L12 仅作为 UI 层的 **soft anchor**。

系统内部能力值可以继续变化，并不强制截断在 12。

原因：

> 避免高水平用户达到 L12 后系统完全失去进一步区分能力。

---

# 16. Module Ability

系统分别维护：

- Limit Ability
- Derivative Ability
- Integral Ability

而不是只记录一个统一数学能力值。

原因：

> 同一个学生在极限、导数和积分中的能力水平可能存在明显差异。

---

# 17. Topic Mastery

除 Module Ability 外，系统同时维护更细粒度的 Topic Mastery。

例如：

```text
Derivative

├── Composite Derivative
├── Implicit Differentiation
├── Higher-order Derivative
└── Parametric Derivative
```

一个学生可能整体导数能力较高，但持续在：

> 隐函数与参数方程结合的高阶导数

出现问题。

因此下一题选择不仅依赖模块能力，也考虑局部知识点表现。

---

# 18. 错误类型

当用户答错题目时，可选择错误原因。

## 不会做

缺乏知识或完全无法建立解题路径。

---

## 方法想错

具备相关基础，但核心方法选择错误。

---

## 计算粗心

主要方法正确，但执行过程中出现计算问题。

---

## 输入失误

真实思路和答案并不存在数学问题，仅发生输入错误。

---

# 19. 输入失误特殊处理

输入失误：

- 不降低能力估计；
- 不进入正式错误统计；
- 不影响 Topic Mastery；
- 不进入 Review Queue。

原因：

> 系统不应将交互层错误误判为数学能力下降。

---

# 20. 下一题选择

Adaptive Engine 综合以下信息决定下一题。

## 用户状态

- Module Ability
- Topic Mastery
- Recent Attempts
- Error Type
- Question Exposure

## 用户设置

- Adaptive / Fixed
- Training Mode
- Daily Count
- Enabled Modules

## 题目属性

- Module
- Topic
- Difficulty
- Historical Exposure
- Recent Repetition

---

# 21. 训练模式

## Balanced

均衡：

- 当前能力题
- 巩固题
- 少量挑战题

---

## Foundation

偏向：

- 基础题
- 薄弱知识点
- 历史错误 Topic

---

## Sprint

偏向：

- 考研常规难度
- 中高难题
- 当前薄弱点

---

## Challenge

提高高于当前能力水平的挑战题比例。

---

# 22. Adaptive / Fixed Difficulty

## Adaptive

系统根据实时作答动态调整题目。

---

## Fixed

用户自行指定：

- 极限等级
- 导数等级
- 积分等级

系统按照用户设定的固定难度进行练习。

---

# 23. AI System

AI 并不是 CalcDaily 的独立 Chat 功能。

它作为基础能力嵌入学习流程。

当前 DeepSeek 主要承担三类任务。

---

## 23.1 Generate

根据：

- Module
- Topic
- Target Difficulty
- Recent Questions
- Generation Constraints

动态生成题目。

典型输出包括：

```json
{
  "question": "...",
  "answer": "...",
  "solution": "...",
  "module": "...",
  "topic": "...",
  "difficulty": 6
}
```

---

## 23.2 Judge

判断：

> 用户答案与标准答案在数学意义上是否等价。

不只依赖字符串完全一致。

---

## 23.3 Evaluate

辅助评估：

- 题目难度
- 题目属性
- Topic 匹配程度

---

# 24. AI Response Validation

模型输出不得被前端无条件接受。

需要检查：

- JSON 是否可解析；
- Question 是否为空；
- Answer 是否为空；
- Solution 是否为空；
- Module 是否合法；
- Topic 是否合理；
- Difficulty 是否在允许范围；
- 必填字段是否完整。

不合法时进入：

> Retry / Fallback

---

# 25. AI Reliability

AI 产品稳定性不只等于：

> 请求有没有成功。

还包括：

- 响应时间是否稳定；
- 输出是否符合结构；
- 模型失败能否恢复；
- 用户是否需要承担 AI 的异常。

建议持续记录：

- Generate Success Rate
- Judge Success Rate
- Evaluate Success Rate
- Response Latency
- P95 Latency
- Retry Rate
- Validation Failure Rate
- Fallback Trigger Rate

---

## 25.1 错误分类

内部至少区分：

```text
NETWORK_ERROR
TIMEOUT
HTTP_ERROR
RATE_LIMIT
MODEL_ERROR
JSON_PARSE_ERROR
VALIDATION_ERROR
```

---

## 25.2 Retry

适用于：

- Network Error
- Timeout
- 429
- 500
- 502
- 503
- 504

原则：

> 有限重试，不无限请求。

---

## 25.3 Fallback

AI 暂时不可用时：

> 核心学习流程不应完全失效。

因此保留 fallback question mechanism。

---

# 26. Question Prefetch

为了降低生成等待时间，CalcDaily 支持：

> Speculative Question Prefetch

在用户处理当前题时提前准备可能的下一题。

但用户完成当前题后，最终下一题仍需要以最新能力状态为准。

需要避免：

- Duplicate Request
- Stale Response
- Race Condition
- Old Response Override

---

# 27. 错题复习 Review Queue

CalcDaily 不将错题只保存在历史列表。

符合条件的错误会进入：

> Review Queue

系统记录：

- Module
- Topic
- Difficulty
- Error History
- Review Progress
- Current Review State

---

## 27.1 当前复习规则

目前使用连续正确：

```text
0/3 → 1/3 → 2/3 → 3/3
```

表示复习进度。

达到 `3/3` 后：

> 对应知识点退出当前高频复习队列。

---

## 27.2 设计原则

> **错题不是过去发生过什么，而是未来应该再做什么。**

---

# 28. 学习分析

学习分析集中展示：

- 今日完成题数
- 连续学习天数
- 待复习数量
- 累计正确率
- 极限能力
- 导数能力
- 积分能力
- 薄弱考点
- Topic Mastery
- 最近练习记录

学习分析不是默认首页。

用户需要时主动查看。

---

# 29. 学习记录

学习记录主要负责：

> 时间维度上的学习行为回顾。

包括：

- 连续学习天数
- 最近 28 天学习情况

连续学习仅描述行为，不作为能力判断依据。

---

# 30. 用户系统

CalcDaily 支持：

## Guest Mode

无需注册即可开始练习。

数据保存在本地。

---

## Account Mode

支持：

- 邮箱注册
- 邮箱验证
- 登录
- Nickname
- 云端学习数据
- 跨设备同步

---

## 30.1 Guest → Account

游客登录后应尽量保留已有学习记录。

产品原则：

> 注册账号不应该意味着用户之前的学习数据重新归零。

---

# 31. 数据模型

当前核心数据实体包括：

```text
profiles
user_state
user_settings
module_progress
topic_progress
attempts
review_queue
checkins
```

---

## profiles

用户基础信息。

---

## user_state

用户整体学习状态。

---

## user_settings

保存：

- Difficulty Mode
- Training Mode
- Daily Count
- Module Preferences

---

## module_progress

保存模块级：

- Ability
- Attempts
- Confidence
- Related Progress

---

## topic_progress

保存知识点级：

- Mastery
- Error History
- Recent Performance

---

## attempts

记录单题作答：

- Question
- Module
- Topic
- Difficulty
- User Answer
- Correctness
- Error Type
- Timestamp

---

## review_queue

保存待复习知识点和进度。

---

## checkins

保存每日学习行为。

---

# 32. 技术架构

```text
User Browser
     ↓
CalcDaily Frontend
     ↓
Tencent CloudBase
     ├── Authentication
     ├── PostgreSQL
     ├── Static Hosting
     └── HTTP Functions
              ↓
          DeepSeek API
```

---

# 33. 当前技术栈

## Frontend

- HTML
- JavaScript
- Tailwind CSS
- MathJax

## Backend & Infrastructure

- Tencent CloudBase
- CloudBase Authentication
- PostgreSQL
- CloudBase HTTP Functions
- Cloud Sync
- Static Hosting

## AI

- DeepSeek
- Question Generation
- Mathematical Equivalence Judging
- Difficulty Evaluation
- Question Prefetch
- Fallback Strategy

---

# 34. 安全设计

DeepSeek API Key：

> 仅保存在服务端。

前端不直接调用带密钥的模型接口。

浏览器通过：

> CloudBase HTTP Function

请求 AI 服务。

---

# 35. 中国大陆访问适配

CalcDaily 核心用户位于中国大陆。

部署过程中重点处理：

- 从海外部署迁移至腾讯 CloudBase；
- Tailwind CSS 本地编译；
- MathJax 本地部署；
- 减少海外 CDN 依赖；
- DeepSeek API 服务端代理；
- 国内静态托管。

设计原则：

> 技术架构最终必须服务真实用户的可访问性，而不是只保证开发者本机可以运行。

---

# 36. UI Design Principles

CalcDaily 的 UI 目标不是：

> 第一眼非常炫。

而是：

> **长期学习时尽量不产生额外视觉负担。**

当前设计方向：

> **Soft Academic × Quiet Tech**

设计原则：

- Task-first Homepage
- Quiet Visual Hierarchy
- Limited Color System
- Structured Whitespace
- Low-distraction Motion
- Collapsible Navigation
- No Excessive Gamification
- No Algorithm Bragging
- No Motivational Copy Overload

---

# 37. 视觉系统

## 基础色

| Token | Value | 用途 |
|---|---|---|
| Paper | `#F7F6F2` | 页面背景 |
| Surface | `#FFFDF9` | 普通内容表面 |
| Ink | `#2B2926` | 主文字 |
| Muted | `#77736D` | 次级信息 |
| Clay | `#C96545` | CTA / 当前任务 |
| Sage | `#627A66` | 正确 / 完成 |

---

## Spacing

使用以 8px 为核心的节奏：

```text
4
8
12
16
24
32
48
64
```

---

## Radius

主要使用：

```text
8
10
12
16
```

避免不同组件随意使用大量圆角值。

---

# 38. Motion

动效仅服务于：

- 页面进入
- 操作反馈
- 状态变化

主要规则：

### Page Transition

- `translateY ≈ 8px`
- `opacity 0 → 1`
- `≈ 240ms`

### Daily Hero

- `translateY ≈ 10px`
- `≈ 280ms`

### CTA

箭头 Hover：

```text
→ 右移约 3px
```

### Review State

状态变化允许轻微 Scale Feedback。

---

## 38.1 不使用

- 大幅弹跳
- Shake 错误动画
- 持续背景动画
- 卡片持续漂浮
- 视差滚动
- 过度 Hover 动画

---

## 38.2 Reduced Motion

支持：

```css
@media (prefers-reduced-motion: reduce)
```

尊重系统级减少动态效果设置。

---

# 39. 专注模式

桌面 Sidebar：

> 默认展开。

用户可以主动收起。

收起后：

- Sidebar 完全隐藏；
- 主练习区域扩展；
- 保留低干扰恢复入口。

刷新页面后：

> 默认重新展开。

该功能属于临时专注状态，而不是长期个人设置。

---

# 40. 核心页面状态

核心页面应至少考虑：

## Loading

- AI 正在生成题目
- AI 正在判题
- 云端正在同步

## Empty

例如：

> 当前没有需要复习的内容。

## Error

例如：

> 当前题目暂时生成失败。

用户应能够：

- Retry
- 返回
- 继续其他功能

---

# 41. 关键 Edge Cases

当前重点覆盖：

- AI API Timeout
- AI 返回非法 JSON
- AI 生成重复题
- 用户重复点击 Submit
- 用户提交过程中刷新页面
- 网络中断
- Cloud Sync 失败
- Guest 登录后数据合并
- MathJax 渲染异常
- AI 判题失败
- 用户答案为空
- Review Queue 重复入队
- Daily Session 中途退出
- Prefetch 旧请求晚于新请求返回

---

# 42. Analytics Plan

用户测试阶段建议记录以下事件。

| Event | Trigger | Properties |
|---|---|---|
| `app_open` | 打开产品 | user_type |
| `daily_view` | 进入今日练习 | diagnosis_state |
| `daily_start` | 开始练习 | count, mode |
| `diagnosis_view` | 看到诊断入口 | source |
| `diagnosis_start` | 开始诊断 | source |
| `diagnosis_skip` | 跳过诊断 | source |
| `question_view` | 展示题目 | module, topic, difficulty |
| `answer_submit` | 提交答案 | module, difficulty |
| `answer_result` | 获得结果 | correct, latency |
| `error_type_select` | 选择错误原因 | type |
| `review_view` | 查看错题复习 | queue_size |
| `review_start` | 开始复习 | queue_size |
| `review_answer` | 完成复习题 | correct, streak |
| `daily_complete` | 完成每日练习 | count |
| `ai_retry` | AI 自动重试 | action, error |
| `ai_failure` | AI 最终失败 | action, error |

---

# 43. Success Metrics

当前尚未完成正式用户测试，因此不虚构 Baseline。

后续重点关注：

## Activation

- First Question Start Rate
- Daily Start Rate
- Diagnosis Start Rate
- Diagnosis Completion Rate
- Diagnosis Skip Rate

## Practice

- Daily Practice Completion Rate
- Average Questions per Session
- Session Drop-off Rate

## Review

- Review Entry Rate
- Due Review Completion Rate
- Review Session Completion Rate
- 3/3 Completion Rate

## Retention

- D1
- D3
- D7

## AI

- Generation Success Rate
- Judge Success Rate
- Average Latency
- P95 Latency
- Retry Rate
- Fallback Rate

---

# 44. User Testing Plan

当前阶段进入：

> **User Validation**

第一轮计划招募约：

> **8–12 名真实考研数学学习者**

第一轮主要寻找：

- Usability Issue
- Product Hypothesis Evidence
- AI Trust Issue
- Review Behaviour
- Adaptive Difficulty Feedback

而不是追求统计显著性。

---

# 45. 第一轮测试重点

## Q1

第一次打开以后，用户是否知道该做什么？

## Q2

用户是否愿意进行能力诊断？

## Q3

为什么部分用户选择跳过诊断？

## Q4

练习难度总体是否合适？

## Q5

用户是否能感受到合理的难度变化？

## Q6

用户是否信任 AI 判题？

## Q7

错误类型是否容易理解？

## Q8

用户是否理解错题为什么进入 Review Queue？

## Q9

第二次打开时是否主动进入错题复习？

## Q10

AI 响应速度是否明显影响继续做题意愿？

---

# 46. 测试原则

测试期间：

> **除阻断性 Bug 外冻结版本。**

避免：

```text
测试用户 A
↓
立即修改产品
↓
测试用户 B
↓
两个人实际测试的是不同产品
```

测试完成后统一整理：

```text
观察
↓
问题
↓
假设
↓
产品决策
↓
v1.1
```

---

# 47. 风险

## Risk 1：AI 出题质量不稳定

可能产生：

- 错题
- 无解题
- 难度错误
- Topic 错误
- 用户信任下降

应对：

- Validation
- Retry
- Difficulty Evaluation
- Fallback
- 后续 AI Benchmark

---

## Risk 2：AI 判题错误

如果正确答案被判错：

> 用户对整个学习系统的信任可能下降。

AI 判题属于高风险核心能力。

后续应建立独立 Evaluation Dataset。

---

## Risk 3：Adaptive 调整过弱

用户可能完全感受不到适应性。

---

## Risk 4：Adaptive 调整过强

题目可能表现得像随机变化。

需要用户测试找到合理区间。

---

## Risk 5：用户不主动复习

即使 Review Queue 机制存在，用户仍可能持续只做新题。

需要验证：

- 入口
- 时机
- 状态表达
- 用户动机

---

## Risk 6：系统复杂性暴露过多

Ability、Topic Mastery、Diagnosis、Review、AI 等能力如果全部解释给用户：

> 产品认知成本会快速上升。

因此遵循：

> **复杂性留在系统内部，界面只展示用户当前行动真正需要的信息。**

---

# 48. Open Questions

当前待用户测试进一步回答：

1. 能力诊断最合适的题量是多少？
2. 多大比例用户会主动跳过诊断？
3. 诊断后的推荐是否明显优于直接开始？
4. 连续答对 3 次作为当前复习完成条件是否合理？
5. 用户是否需要主动选择训练模块？
6. 8 / 10 / 12 三档题量是否都值得保留？
7. 用户是否理解 Adaptive 与 Fixed 的区别？
8. 手动等级功能是否真的有使用价值？
9. AI 响应达到多少秒后开始明显影响体验？
10. 用户希望看到多详细的解析？
11. 哪些学习数据会被真正主动查看？
12. Review 最适合在什么时候提醒？

---

# 49. 后续 AI Evaluation

后续可以建立：

> **CalcDaily Math AI Benchmark**

例如通过人工验证的 200–300 道考研高数测试样本，对 AI 能力进行系统评价。

指标可包括：

- Question Correctness
- Answer Correctness
- Solution Correctness
- Difficulty Accuracy
- Topic Classification Accuracy
- Judge Accuracy
- LaTeX Quality

用于比较：

- 不同模型
- 不同 Prompt
- 不同 Generation Strategy
- 不同 Judge Strategy

---

# 50. 当前不优先的未来方向

只有在核心闭环得到真实用户验证之后，再考虑：

- 高数更多章节
- 线性代数
- 概率论
- 真题模式
- 更完整 Review Scheduling
- 更系统 AI Benchmark
- 更丰富的数据分析

原则：

> **先证明一个闭环成立，再扩大产品边界。**

---

# 51. 关键产品决策记录

| 决策 | 初始方案 | 当前方案 | 原因 |
|---|---|---|---|
| 默认首页 | Dashboard | 今日练习 | 高频任务优先于数据查看 |
| 能力诊断 | 主导航长期存在 | 首次推荐 + 学习分析入口 | 属于低频行为 |
| 诊断流程 | 倾向先完成 | 推荐但允许跳过 | 降低首次启动阻力 |
| Daily 题目 | Session 开始时固定 | 每题后动态决定 | 让最新表现影响下一题 |
| 难度系统 | 单一等级 | Module Ability + Topic Mastery | 处理局部薄弱点 |
| 错误 | 对 / 错 | 四类错误原因 | 不同错误不应等价处理 |
| 输入失误 | 普通错误 | 不影响能力与复习 | 防止交互错误污染模型 |
| 首页时间 | 显示预计时间 | 删除 | 个体差异过大 |
| 算法解释 | 首页展示 | 隐藏 | Adaptive 应被体验而非解释 |
| 数据 | 首页大量展示 | 集中到学习分析 | 避免数据干扰启动 |
| 错题状态 | 文字 Badge | 圆点 + 复习进度 | 降低视觉噪音 |
| Sidebar | 始终固定 | 可主动收起 | 支持专注刷题 |
| AI | 强调 AI 功能 | 作为基础设施 | AI 服务任务，而非成为任务 |
| UI | 展示型 Dashboard | Quiet / Productive UI | 支持长期学习 |

---

# 52. 产品原则

## Principle 1

> **开始学习比查看学习数据重要。**

---

## Principle 2

> **系统应该承担选题复杂性。**

不要把本应由产品解决的问题重新交还给学生。

---

## Principle 3

> **Adaptive 应该被体验，而不是被解释。**

---

## Principle 4

> **不同错误应该产生不同处理。**

---

## Principle 5

> **错题不是历史记录，而是未来学习任务。**

---

## Principle 6

> **AI 的不稳定性应该尽可能由产品系统吸收。**

---

## Principle 7

> **界面应该减少认知负担，而不是展示系统复杂度。**

---

# 53. 当前版本状态

## CalcDaily v1.0 Beta

目前已经完成：

### Product

- [x] 每日练习
- [x] 能力诊断
- [x] Adaptive Difficulty
- [x] Fixed Difficulty
- [x] Module Ability
- [x] Topic Mastery
- [x] Error Classification
- [x] Review Queue
- [x] Learning Analysis
- [x] Learning Records
- [x] Settings

### AI

- [x] Question Generation
- [x] Mathematical Equivalence Judging
- [x] Difficulty Evaluation
- [x] Question Prefetch
- [x] Fallback Mechanism

### Account & Infrastructure

- [x] Guest Mode
- [x] Email Registration
- [x] Email Verification
- [x] Login
- [x] Nickname
- [x] Cloud Sync
- [x] PostgreSQL
- [x] CloudBase HTTP Function
- [x] Mainland China Hosting
- [x] Local Tailwind Build
- [x] Local MathJax

### UX

- [x] Task-first Homepage
- [x] Responsive Layout
- [x] Collapsible Sidebar
- [x] Low-distraction Motion
- [x] Reduced Motion Support

---

# 54. 当前阶段

CalcDaily 当前核心产品与技术闭环已经基本完成。

项目进入：

> **User Validation Phase**

下一阶段不再优先增加功能数量。

核心工作变为：

```text
Product Hypothesis
        ↓
   Real Users
        ↓
Observed Behaviour
        ↓
     Evidence
        ↓
Product Decision
        ↓
      v1.1
```

---

# 55. v1.0 → v1.1 决策原则

任何新功能进入下一版本前，都应首先回答：

1. 用户遇到的真正问题是什么？
2. 问题出现频率有多高？
3. 是否影响核心学习流程？
4. 当前功能为什么无法解决？
5. 是否存在比增加新功能更简单的解决方案？

避免因单个用户提出：

> “能不能加一个 XX？”

就直接进入开发。

---

# 56. 产品愿景

CalcDaily 最终希望解决的不是：

> 如何让学生每天多做几道题。

而是：

> **在学生持续学习的过程中，如何根据已经发生的学习行为，降低下一步学习决策的成本。**

因此 CalcDaily 的核心价值并不是：

> AI 可以生成无限题目。

而是：

> **让每一次作答都能够改变之后发生的事情。**

---

## CalcDaily · v1.0 Beta

**Live Product:**  
https://calcdaily-v4-calcdaily-d5g2titwue91551fb.webapps.tcloudbase.com/