<div align="center">

<h1>Calc Daily</h1>

<p>
  Adaptive Calculus Practice for Chinese Postgraduate Entrance Exams
</p>

<p>
  <a href="https://calcdaily-v4-calcdaily-d5g2titwue91551fb.webapps.tcloudbase.com/">
    <strong>在线体验 →</strong>
  </a>
  &nbsp;&nbsp;&nbsp;
  <a href="./docs/PRD.md">
    <strong>完整 PRD →</strong>
  </a>
</p>

</div>

---

## About CalcDaily

**CalcDaily** 是一款面向中国考研高等数学学习者的自适应每日刷题 Web App。

它并不是一个简单的「输入 Prompt → AI 生成一道题」项目。

我真正想解决的是一个更具体的问题：

> 学生已经开始复习以后，**今天应该做什么题，以及这道题做完以后，下一道题应该是什么。**

传统刷题通常按照固定章节、固定题单或统一难度推进，但不同学生的能力不同，同一个学生在不同知识点上的掌握程度也不同。

因此 CalcDaily 尝试建立一个持续更新的学习闭环：

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

核心不是生成更多题，而是：

> **让每一次作答真正改变之后的练习。**

---

## Core Features

### Adaptive Daily Practice

每日练习并不会在 Session 开始时一次性固定全部题目。

每完成一道题，系统都会结合：

- 当前模块能力
- 知识点掌握度
- 题目难度
- 最近作答表现
- 错误类型
- 当前训练模式

重新决定下一道题。

当前支持：

- 极限
- 导数
- 积分
- 8 / 10 / 12 题每日练习
- 自适应难度
- 固定难度
- 基础巩固 / 均衡 / 考研冲刺 / 高阶挑战模式

---

### Ability Diagnosis

首次使用时，CalcDaily 会推荐进行能力诊断，用于快速建立初始能力估计。

但诊断并不是强制流程。

用户可以：

- 完成能力诊断
- 暂时跳过
- 通过之后的正常练习逐渐完成能力校准
- 在「学习分析」中重新进行诊断

这是一次刻意的产品取舍：

> 诊断有价值，但不应该成为开始学习之前必须跨过的一道门槛。

---

### Adaptive Ability Model

CalcDaily 内部使用简化的 **1PL-IRT + Elo-style update** 估计用户能力。

预测答对概率：

$$
P=\frac{1}{1+e^{-0.9(\theta-b)}}
$$

能力更新：

$$
\theta_{new}=\theta_{old}+K(R-P)W
$$

其中：

- $\theta$ 为当前能力
- $b$ 为题目难度
- $R$ 为真实作答结果
- $P$ 为系统预测正确概率
- $W$ 用于处理不同错误类型的影响

同时采用动态学习速率：

$$
K(n)=0.15+0.35e^{-n/30}
$$

新用户调整更快，随着答题样本增加逐渐趋于稳定。

前端使用 **L1–L12** 表达难度等级，但内部能力值并不会被强制限制在 L12。

---

### Module Ability + Topic Mastery

CalcDaily 不只记录一个笼统的“数学水平”。

系统分别维护：

- 极限能力
- 导数能力
- 积分能力

同时记录更细粒度的 **Topic Mastery**。

例如，一个学生的导数整体水平可能较高，但仍然可能持续在：

> 隐函数与参数方程结合的高阶导数

出现错误。

因此 Adaptive Engine 不只根据模块能力出题，也会考虑局部知识点表现。

---

### Error-aware Learning

CalcDaily 不把所有错误简单视为一次“答错”。

用户可以区分：

- **不会做**
- **方法想错**
- **计算粗心**
- **输入失误**

不同错误会产生不同的学习影响。

其中 **输入失误**：

- 不降低能力估计
- 不计入错误统计
- 不影响 Topic Mastery
- 不进入错题复习队列

避免把交互错误错误地解释成数学能力下降。

---

### Review Queue

CalcDaily 没有把错题设计成一个只负责保存历史记录的“错题本”。

错误会进入后续学习流程。

系统记录：

- 错误知识点
- 历史错误
- 当前复习状态
- 连续答对进度

当前复习机制以：

```text
0/3 → 1/3 → 2/3 → 3/3
```

表达连续复习表现。

达到条件后，该知识点退出当前高频复习队列。

> 错题不是过去发生过什么，而是未来应该再做什么。

---

### AI-native Question System

DeepSeek 被嵌入 CalcDaily 的核心学习流程，而不是作为独立 Chatbot 存在。

当前主要承担：

#### Generate

根据模块、知识点和目标难度生成题目。

#### Judge

判断用户答案与标准答案是否数学等价。

#### Evaluate

辅助评估题目难度与属性。

同时加入：

- JSON 输出约束
- Response Validation
- Retry
- Fallback
- Question Prefetch
- 异常处理

尽量降低模型不稳定性对连续学习流程的影响。

---

### Learning Analysis

学习数据集中放在独立的 **学习分析** 页面，包括：

- 今日完成情况
- 连续学习
- 待复习数量
- 累计正确率
- 极限 / 导数 / 积分能力
- 薄弱考点
- Topic Mastery
- 最近练习记录

这些内容没有被放在默认首页。

---

## Product Decisions

CalcDaily 经历过多轮产品迭代。

很多最终保留下来的设计，并不是最初版本就存在。

### 01 · Dashboard 不再是首页

早期版本将学习数据仪表盘作为默认入口。

后来我重新审视了学习产品最核心的使用场景：

> 用户打开 CalcDaily，大多数时候不是为了评价过去，而是为了开始今天的学习。

因此重新设计信息架构：

```text
Before
Dashboard → Daily Practice

After
Daily Practice → Learning Analysis
```

「今日练习」成为默认首页。

学习数据被移动至用户主动查看的「学习分析」。

---

### 02 · 能力诊断退出主导航

能力诊断属于首次使用和低频校准功能。

它不应该长期与：

- 今日练习
- 错题复习
- 学习分析

占据相同的信息层级。

因此诊断入口最终只保留在：

- 首次使用首页
- 学习分析

---

### 03 · 不预测“今天需要学习多久”

早期曾考虑根据题量显示：

> 预计约 XX 分钟

最终删除。

不同学生完成同一道考研数学题的时间差异可能非常大。

对学习时间做一个看似精准、实际并不可靠的预测，并不能帮助用户做出更好的决策。

---

### 04 · Adaptive 应该被体验，而不是被解释

早期界面曾展示：

- Ability θ
- Confidence
- Adaptive algorithm
- 系统为什么推荐这道题

这些信息后来被逐渐移出主要界面。

用户不需要理解 IRT 或内部能力参数。

> 如果 Adaptive 有价值，它应该体现在“接下来的题越来越合适”，而不是产品不断告诉用户自己很智能。

---

### 05 · AI 是基础设施，而不是产品中心

CalcDaily 没有为了体现 AI 而额外加入一个 AI Chat 页面。

AI 只出现在真正需要它的位置：

```text
生成
判题
评估
```

产品关注的并不是：

> 能不能再增加一个 AI 功能。

而是：

> AI 能不能改善下一次真实学习行为。

---

## Product Architecture

```text
                         ┌───────────────────┐
                         │ Ability Diagnosis │
                         └─────────┬─────────┘
                                   │
                                   ▼
┌───────────────┐        ┌───────────────────┐
│ User Settings │───────▶│  Daily Practice   │
└───────────────┘        └─────────┬─────────┘
                                   │
                                   ▼
                         ┌───────────────────┐
                         │ Question Generate │
                         └─────────┬─────────┘
                                   │
                                   ▼
                         ┌───────────────────┐
                         │    User Answer    │
                         └─────────┬─────────┘
                                   │
                                   ▼
                         ┌───────────────────┐
                         │     AI Judge      │
                         └─────────┬─────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
            Ability Update                Topic Mastery
                    │                             │
                    └──────────────┬──────────────┘
                                   ▼
                        Adaptive Next Question
                                   │
                       Wrong Answer if needed
                                   │
                                   ▼
                             Review Queue
```

---

## Product Experience

### Main Navigation

```text
今日练习
错题复习
学习分析

────────

学习记录
设置
```

能力诊断不作为长期主导航。

Desktop 侧边栏支持主动收起，在需要长时间做题时减少视觉干扰。

---

## AI Reliability

AI 产品的稳定性不仅意味着：

> 请求是否成功。

也包括：

- 响应速度是否稳定
- 输出是否符合结构
- 模型失败能否恢复
- 用户是否需要承担错误

因此 CalcDaily 将 AI Reliability 视为产品能力的一部分。

关注：

- Generate Success Rate
- Judge Success Rate
- Response Latency
- Retry Rate
- Validation Failure
- Fallback Trigger

---

## Account & Cloud Sync

CalcDaily 支持：

### Guest Mode

无需注册即可开始学习，本地保存数据。

### Account Mode

支持：

- 邮箱注册
- 邮箱验证
- 登录
- Nickname
- 云端学习记录
- 跨设备同步

游客模式产生的数据在登录后仍需要尽量被保留，而不是因为注册账号而重新开始。

---

## Tech Stack

### Frontend

- HTML
- JavaScript
- Tailwind CSS
- MathJax

### Backend & Infrastructure

- Tencent CloudBase
- CloudBase Authentication
- CloudBase HTTP Functions
- PostgreSQL
- Cloud Sync
- Static Hosting

### AI

- DeepSeek
- Question Generation
- Mathematical Equivalence Judging
- Difficulty Evaluation
- Question Prefetch
- Fallback Strategy

---

## China-first Deployment

CalcDaily 的核心用户主要位于中国大陆，因此部署过程中也考虑了实际网络环境。

包括：

- 从海外部署迁移至腾讯 CloudBase
- Tailwind CSS 本地编译
- MathJax 本地部署
- 减少海外 CDN 依赖
- DeepSeek API 通过服务端 HTTP Function 调用
- API Key 不暴露至浏览器

这部分并不是产品最显眼的功能，但直接决定了真实用户能否稳定使用。

---

## Design Principles

CalcDaily 的设计目标不是成为一个第一眼非常炫的展示型网站。

而是：

> **一个可以持续打开、持续做题，而不会不断争夺注意力的学习工具。**

当前设计原则包括：

- Task-first homepage
- Quiet visual hierarchy
- Limited color system
- Low-distraction motion
- Structured whitespace
- Collapsible navigation
- No unnecessary algorithm explanation
- No motivational copy overload
- No excessive gamification

---

## Current Status

### v1.0 Beta

目前已经完成：

- [x] 每日练习
- [x] 能力诊断
- [x] Adaptive Difficulty
- [x] Fixed Difficulty
- [x] Topic Mastery
- [x] Error Classification
- [x] Wrong-answer Review Queue
- [x] Learning Analysis
- [x] Learning Records
- [x] DeepSeek Question Generation
- [x] Mathematical Answer Judging
- [x] AI Difficulty Evaluation
- [x] Question Prefetch
- [x] Guest Mode
- [x] Account System
- [x] Cloud Sync
- [x] Mainland China Deployment
- [x] Responsive UI
- [x] Focus / Collapsible Sidebar

---

## What Comes Next

CalcDaily 当前不再优先增加功能。

下一阶段进入 **User Validation**。

计划首先邀请真实考研数学学习者测试，并重点验证：

1. 用户第一次打开是否知道如何开始；
2. 用户是否愿意进行能力诊断；
3. 自适应题目难度是否真正合适；
4. 用户是否能够信任 AI 判题；
5. Review Queue 是否真的能够促进二次复习；
6. 哪些功能真实产生价值，哪些只是设计者自己的假设。

之后的版本迭代将更多依据真实用户行为，而不是继续增加功能数量。

---

## Project Philosophy

CalcDaily 并不是一次为了快速完成作品集而生成的项目。

从最初的刷题 Demo，到后来加入：

- 自适应能力模型
- Topic Mastery
- 错误类型
- Review Queue
- AI 判题
- Prefetch
- Auth
- Cloud Sync
- 国内部署
- 信息架构重构
- 多轮 UI 收敛

很多今天看起来“理所当然”的设计，实际上都经历过推翻和重新判断。

我在这个项目里真正想练习的也不是：

> 如何把功能做得越来越多。

而是：

> **如何定义一个问题、建立产品机制、做出取舍，并最终用真实用户行为验证自己的判断。**

---

<div align="center">

**CalcDaily · v1.0 Beta**

[在线体验](https://calcdaily-v4-calcdaily-d5g2titwue91551fb.webapps.tcloudbase.com/)
&nbsp;·&nbsp;
[完整 PRD](./docs/PRD.md)

</div>
