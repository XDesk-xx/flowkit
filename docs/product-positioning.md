# Flowkit 产品定位

## 1. 一句话定义

> Flowkit 是以 Delivery 为编排核心、以 Change 为实施单元、以 Action 为执行步骤的确定性交付编排器。

这一定义是 Flowkit 的唯一正式产品定位。其他文档可以解释它，但不得建立冲突的第二定义。

## 2. 核心模型

```text
Delivery
└─ Change
   └─ Action
```

### 2.1 Delivery：编排核心

Delivery 表达一条完整交付主线，承载交付目标、Change 集合、Change 依赖以及最终验证和完成边界的高层语义。

Delivery 不是 Change 的临时标签，也不是没有交付语义的分组。单个 Change 完成自身闭环，不等于 Delivery 已经完成。

### 2.2 Change：实施单元

Change 表达一个边界明确、能够独立实施和审查的变更目标。

每个 Change 属于一个 Delivery，并在所属 Delivery 的交付上下文中形成局部闭环。Change 不能取代 Delivery 的最终验收职责，也不能静默扩展 Delivery 目标。

### 2.3 Action：流程步骤

Action 表达当前一次明确、受前置条件约束的流程步骤，并具有明确目标和预期结果。

Action 与 Git Commit 不建立一一对应关系。完成一个 Action，不自动要求为该 Action 创建专用 Commit。具体 Commit、交接和 Checkpoint 规则由后续流程规范定义。

## 3. Flowkit 的最小职责

Flowkit 只拥有完成确定性交付编排所需的最小流程事实和判断能力：

1. Delivery 和 Change 的流程状态；
2. Delivery 与 Change 的范围和归属边界；
3. 当前 Action 是否满足前置条件；
4. 当前结果是否允许流程继续；
5. 下一步应当允许、阻塞还是等待 owner 决策。

Flowkit 不替代 author 完成专业工作，也不替代 reviewer、架构工具或项目验证工具给出专业结论。

## 4. 确定性的含义

“确定性”主要约束流程合法性判断：

> 对于相同的已知流程事实和输入，Flowkit 应产生相同的允许、阻塞或下一步判断。

确定性不表示：

- 产品范围可以自动决定；
- 架构取舍可以自动决定；
- reviewer 的专业判断可以被伪造或自动替代；
- 所有外部工具都必须由 Flowkit 内部实现；
- 所有流程都必须无人参与地自动推进。

当流程到达需要授权或专业判断的边界时，Flowkit 应明确停止并等待对应结果。

## 5. One fact, one authority

Flowkit 遵循：

> One fact, one authority。

一个事实只能有一个主要权威来源。其他系统可以引用、消费、投影或验证该事实，但不能独立维护与主要权威冲突的完整副本。

### 5.1 高层事实归属

| 事实 | 主要权威 |
|---|---|
| Delivery 和 Change 的流程状态 | Flowkit |
| Change 的需求和实施契约 | OpenSpec |
| 文件内容、版本历史和同步事实 | Git |
| 被接受的正式架构表达 | Archify |
| 代码依赖和影响范围上下文 | CodeGraph |
| Findings 和 Verdict | Reviewer |
| 测试和静态检查结果 | 项目验证工具 |

### 5.2 Flowkit 可以保存的外部信息

Flowkit 可以保存推进流程所需的：

- 外部事实引用；
- 某次外部动作的执行状态；
- 当前流程需要的最小结果摘要；
- 是否满足当前流程要求的判断结果。

### 5.3 Flowkit 不应复制的外部事实

Flowkit 不应重复保存：

- OpenSpec 中的完整 Change 契约；
- Git 已拥有的完整历史；
- Archify 已拥有的完整架构模型；
- CodeGraph 已拥有的完整依赖图；
- reviewer 的完整推理过程；
- 项目验证工具的完整内部状态和原始日志。

## 6. 轻量外部集成

Flowkit 与外部系统的高层协作方式是：

```text
Flowkit
→ 判断何时需要某项专业工作
→ 提供当前流程所需的最小上下文
→ 接收结构化结果或结果引用
→ 判断流程是否可以继续

外部系统
→ 完成自身专业职责
```

因此：

- OpenSpec 不编排整个 Delivery；
- Git 不决定当前 Action；
- Archify 不决定 Change 是否完成；
- CodeGraph 不决定是否允许 Apply；
- reviewer 不自行推进 Change；
- 项目验证工具不自行触发 Delivery Final；
- Skill、Adapter 或执行宿主不能成为隐藏的第二流程编排器。

具体输入输出格式、调用协议和失败处理由后续集成边界定义。

## 7. 正式角色中立

Flowkit 的正式产品模型使用执行者中立的角色：

- `owner`：拥有范围、授权和最终决策；
- `author`：执行当前允许的工作；
- `reviewer`：独立检查结果并返回 Findings 和 Verdict。

具体由人工、宿主或工具承担某一角色，属于运行环境映射，不改变正式角色语义。

正式产品文档、状态契约和流程说明不得把具体执行工具名称定义为产品角色。

## 8. 正式 Run 记录的定位

正式 Run 记录可以通过 Git 承载某一次 Action 的任务、上下文和结果摘要，以支持跨环境交接和恢复。

Run 表示一次执行实例，不等于 Action 本身，也不是新的事实权威。Run 中发现的重要产品、需求或架构决策，必须回写到对应的正式权威位置；不能只停留在 Run 结果中。

A1 只冻结这一高层定位。Run 的正式 Schema、生命周期、目录和交接规则由后续 Change 定义。

## 9. Flowkit 是什么

Flowkit 是：

- Delivery 驱动的交付编排器；
- Change 闭环的流程协调者；
- Action 合法性的确定性判断者；
- Delivery 与 Change 边界的维护者；
- 外部专业系统之间的轻量协调层；
- Bootstrap 与未来自托管共用规则的承载者。

## 10. Flowkit 不是什么

Flowkit 不是：

- 通用任务工作流引擎；
- 通用执行者编排平台；
- 通用 Skill 平台；
- 通用插件平台；
- OpenSpec 替代品；
- Git 操作平台；
- 测试平台；
- Code Review 工具；
- Archify 或 CodeGraph 的内部实现；
- Evidence 或 Receipt 系统；
- 通用审计平台；
- 自动提交、推送、合并或回滚系统；
- 自动决定是否运行 Full Test 的系统；
- 自动替代 owner 做产品和流程决策的系统。

新增平台级抽象或通用机制时，Proposal 必须说明它直接服务的当前 Delivery 场景。没有当前场景时，不应将其加入 Flowkit 核心。

## 11. 与后续 Change 的边界

### 11.1 B1：core-model

B1 再定义：

- Delivery、Change、Action 的正式字段；
- 活动 Delivery 和活动 Change 规则；
- Action 状态、前置条件和转换；
- Verification 和 Full Test 的流程位置；
- checkout 后的流程恢复；
- Run 与核心状态之间的正式关系。

### 11.2 C1：integration-boundaries

C1 再定义：

- OpenSpec、Git、Archify、CodeGraph、Reviewer 和项目验证工具的具体职责；
- 外部输入输出和结构化结果；
- thin integration 的具体要求；
- 外部失败、不可用和冲突的处理边界。

### 11.3 D1：bootstrap-and-roadmap

D1 再定义：

- Bootstrap 阶段的具体互动规则；
- owner、author、reviewer 的协作方式；
- 内容展示、授权、Review 和 Revision 规则；
- Commit、Push、交接和 Checkpoint 边界；
- 仓库级开发指令；
- 后续开发路线和自托管切换条件。

## 12. 变更原则

后续 Change 必须读取并遵守本文件。

若后续设计与本产品定位冲突，必须通过明确 Change 修改本文件和对应 OpenSpec 契约；不得以代码、Run、Skill、Adapter 或临时文档静默改变产品定位。
