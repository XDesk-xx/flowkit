## ADDED Requirements

### Requirement: Flowkit 必须定位为确定性交付编排器

Flowkit MUST 被定义为以 Delivery 为编排核心、以 Change 为实施单元、以 Action 为执行步骤的确定性交付编排器。

Flowkit MUST NOT 被定义为仅管理 OpenSpec Change 的包装器，也 MUST NOT 被定义为面向任意任务的通用工作流平台。

#### Scenario: 正式产品定义保持一致

- **WHEN** 项目文档、OpenSpec 契约或产品说明描述 Flowkit
- **THEN** MUST 使用与“确定性交付编排器”一致的定义
- **AND** MUST 保持 Delivery、Change、Action 三层关系
- **AND** MUST NOT 引入冲突的第二产品定义

### Requirement: Delivery 必须是编排核心

Delivery MUST 表达一条完整交付主线，并承载交付目标、Change 集合、依赖以及最终验证和完成边界的高层语义。

Delivery MUST NOT 只是 Change 的临时标签或无语义分组。

#### Scenario: Change 完成不等于 Delivery 完成

- **WHEN** 一个 Change 完成自身闭环
- **THEN** Flowkit MUST NOT 将该事实直接解释为 Delivery 完成
- **AND** Delivery MUST 保留独立的最终验收边界

### Requirement: Change 必须是 Delivery 内的实施单元

Change MUST 表达一个边界明确、能够独立实施和审查的变更目标。每个 Change MUST 属于一个 Delivery，并通过自身流程形成局部闭环，但 MUST NOT 取代 Delivery 的最终验收职责。

#### Scenario: Change 保持局部边界

- **WHEN** author 执行一个 Change
- **THEN** 工作 MUST 保持在该 Change 和所属 Delivery 的已确认范围内
- **AND** MUST NOT 静默扩展 Delivery 目标

### Requirement: Action 必须表示显式流程步骤

Action MUST 表示当前一次明确、受前置条件约束的流程步骤，并具有明确目标和预期结果。Action MUST NOT 与 Git Commit 建立一一对应关系。

#### Scenario: Action 与 Commit 保持分离

- **WHEN** author 完成一个 Action
- **THEN** Flowkit MUST NOT 仅因为 Action 完成就要求创建专用 Commit
- **AND** Commit MUST 只在保存、交接或正式边界需要时创建

### Requirement: 确定性必须约束流程合法性判断

对于相同的已知流程事实和输入，Flowkit MUST 产生相同的允许、阻塞或下一步判断。

确定性 MUST 主要约束流程合法性，而 MUST NOT 被解释为自动替代 owner、author 或 reviewer 的专业判断。

#### Scenario: 相同输入产生相同判断

- **WHEN** 两次评估具有相同的流程事实和输入
- **THEN** Flowkit MUST 返回相同的流程判断
- **AND** MUST NOT 因具体执行宿主不同而改变流程语义

### Requirement: Flowkit 必须拥有最小流程事实

Flowkit MUST 拥有 Delivery 和 Change 的流程状态、边界以及下一步合法性判断。

Flowkit MUST 只保存推进流程所需的最小外部事实引用、执行状态和结果摘要，MUST NOT 复制外部系统已经拥有的完整专业事实。

#### Scenario: Flowkit 不复制完整外部事实

- **WHEN** 外部系统已经拥有完整契约、历史、架构模型、依赖图或测试结果
- **THEN** Flowkit MUST 只保存流程需要的引用或最小摘要
- **AND** MUST NOT 建立第二份完整权威副本

### Requirement: 一个事实必须只有一个主要权威

Flowkit MUST 遵循 `One fact, one authority` 原则。其他系统 MAY 引用、消费、投影或验证该事实，但 MUST NOT 成为第二个独立权威。

高层权威归属 MUST 保持如下：

- Delivery 和 Change 的流程状态由 Flowkit 拥有
- Change 的需求和实施契约由 OpenSpec 拥有
- 文件内容、版本历史和同步事实由 Git 拥有
- 被接受的正式架构表达由 Archify 拥有
- 代码依赖和影响范围上下文由 CodeGraph 拥有
- Findings 和 Verdict 由 Reviewer 拥有
- 测试和静态检查结果由项目验证工具拥有

#### Scenario: 权威冲突必须被阻塞

- **WHEN** 两个系统对同一事实给出相互冲突的权威声明
- **THEN** 流程 MUST 被视为存在边界冲突
- **AND** MUST NOT 在未解决冲突前继续推进

### Requirement: 外部集成必须保持轻量

Flowkit MUST 决定何时需要外部专业工作、提供最小上下文、接收结果并判断流程是否可以继续。外部系统、Skill 或执行宿主 MUST NOT 成为第二个流程编排器。

#### Scenario: 外部工具不决定流程状态

- **WHEN** 外部工具完成专业工作
- **THEN** 其结果 MUST 返回当前流程边界
- **AND** 外部工具 MUST NOT 自行推进 Change 或 Delivery

### Requirement: 正式产品角色必须保持中立

Flowkit 的正式产品模型 MUST 使用执行者中立的角色名称，至少包括 `owner`、`author`、`reviewer`。

正式产品契约 MUST NOT 依赖具体宿主、模型、编辑器或执行工具名称。

#### Scenario: 运行环境映射角色

- **WHEN** 某种人工或工具承担 author 或 reviewer 职责
- **THEN** 该映射 MAY 由运行环境决定
- **AND** MUST NOT 改变 Flowkit 的正式角色语义

### Requirement: Flowkit 必须明确产品非目标

Flowkit MUST NOT 被实现为通用任务工作流引擎、通用执行者编排平台、通用 Skill/Plugin 平台、OpenSpec 替代品、Git 平台、测试平台、Code Review 工具、Archify/CodeGraph 内部实现、Evidence/Receipt 系统、通用审计平台、自动 Git 操作系统或自动决定 Full Test 的系统。

#### Scenario: 新机制必须具有当前交付理由

- **WHEN** 提议增加新的平台级抽象或通用机制
- **THEN** Proposal MUST 说明其直接服务的当前 Delivery 场景
- **AND** 没有当前场景时 MUST NOT 将其加入核心产品

### Requirement: 产品定位必须形成正式文档

项目 MUST 在 `docs/product-positioning.md` 保存 Flowkit 的正式产品定位说明。

该文档 MUST 包含一句话产品定义、三层关系、最小职责、确定性的含义、事实权威、角色中立、产品非目标以及与后续 Change 的边界。

#### Scenario: 后续 Change 必须消费产品定位

- **WHEN** 后续 Change 设计核心模型、集成协议或 Runner
- **THEN** MUST 读取并遵守 `docs/product-positioning.md`
- **AND** 发生冲突时 MUST 通过明确 Change 修改产品定位
- **AND** MUST NOT 静默偏离
