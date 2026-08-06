# flowkit-integration-boundaries Specification

## Purpose

定义 Flowkit 与 OpenSpec、Git、Reviewer、项目验证工具、Archify、CodeGraph、Skill 和 Adapter 之间的事实权威、逻辑输入输出和权力边界，确保外部系统不会成为第二流程编排器。

## Requirements
### Requirement: Action Package 必须是逻辑执行输入视图

Action Package MUST 定义为针对当前 Delivery、Change、Run 和 Action 生成的逻辑执行输入视图。Action Package MUST NOT 被定义为固定的物理文件包、ZIP、Patch、JSON Manifest 或特定平台 Payload。

Action Package 至少 MUST 让执行者知道：当前 Delivery/Change/Action、当前角色、必须消费的正式输入、本次目标、允许和禁止的范围、必须产生的结果、适用的验证要求、现有 owner 授权。

#### Scenario: Action Package 不绑定物理载体

- **WHEN** Flowkit 为当前 Action 生成 Action Package
- **THEN** Action Package MUST 表达完整的逻辑执行输入
- **AND** MUST NOT 要求特定物理文件格式作为唯一载体
- **AND** 相同逻辑输入 MAY 通过不同媒介表达

#### Scenario: Action Package 包含 owner 授权状态

- **WHEN** 当前 Action 需要 owner 授权（如 Apply、Archive、Full Test）
- **THEN** Action Package MUST 标明哪些授权已存在、哪些尚未存在
- **AND** 执行者 MUST NOT 自行授予缺失的授权

### Requirement: Action Result 必须记录发生事实而非决定下一步

Action Result MUST 记录执行状态、结果摘要、产生或更新的正式结果引用、消费的 Findings/授权/输入引用、失败或阻塞诊断（适用时）。Action Result MAY 包含 `nextActionRecommendation`，但它 MUST 只能是建议。

Action Result MUST NOT 自行推进 Change 或 Delivery 状态。Action Result MUST NOT 复制外部工具的完整专业状态。

#### Scenario: Result 不自行推进状态

- **WHEN** 执行者完成 Action 并返回 Action Result
- **THEN** Flowkit MUST 校验并接纳正式事实
- **AND** Policy MUST 重新计算下一 Action
- **AND** Result 中的 `nextActionRecommendation` MUST NOT 替代 Policy

#### Scenario: Result 不复制外部工具状态

- **WHEN** Action 消费了 OpenSpec、Git 或 Verification 工具的输出
- **THEN** Result MUST 只保存摘要和引用
- **AND** MUST NOT 复制外部工具的完整内部状态

### Requirement: ResultRef 必须满足最低引用语义

ResultRef MUST 能唯一识别被引用结果。ResultRef MUST 能判断结果是否被替换或失效。ResultRef MUST 能让接收方读取或定位结果。ResultRef MUST NOT 绑定唯一 Provider。

C1 MUST NOT 把 Git Commit SHA 固定为所有结果引用的唯一形式。具体环境 MAY 把 ResultRef 映射为 Git revision、Run result、artifact version、content hash 或其他不可歧义的正式版本引用。

#### Scenario: ResultRef 不绑定单一 Provider

- **WHEN** 不同环境需要引用同一正式结果
- **THEN** ResultRef MAY 映射为不同具体形式
- **AND** 但 MUST 保持唯一识别和失效判断能力

#### Scenario: 被引用结果失效

- **WHEN** ResultRef 指向的结果被替换或修改
- **THEN** ResultRef MUST 能判断结果已失效
- **AND** 依赖该结果的 Review 或续接 MUST 标记为需要重新处理

### Requirement: Continuation Context 必须是生成视图而非状态权威

Continuation Context MUST 定义为从正式事实生成的可恢复视图。Continuation Context MUST NOT 成为新的状态权威。

Continuation Context 至少 MUST 包含：deliveryId、changeId、lastCompletedAction、lastActionResultRef、activeVerdict/Findings、尚未消费的 Non-blocking Findings、有效 owner 授权、当前关键约束、nextAllowedAction、下一 Action 所需输入引用。

`nextAllowedAction` MUST 由 Policy 计算，MUST NOT 由 Continuation Context 自行填写。

#### Scenario: 摘要丢失可重建

- **WHEN** Continuation Context 丢失
- **THEN** 后续执行者 MUST 能从正式事实重新生成 Continuation Context
- **AND** 重新生成的 Context MUST 与正式事实一致

#### Scenario: 摘要与正式事实冲突

- **WHEN** Continuation Context 与正式事实冲突
- **THEN** MUST 以正式事实为准
- **AND** Continuation Context MUST NOT 自行修改 Delivery、Change 或 Action 状态

### Requirement: 续接切点必须是边界语义而非新实体

续接切点 MUST 只定义为：当前阶段已有稳定、可引用的正式结果，并且 Continuation Context 可以从正式事实生成时，形成一个可续接切点。

续接切点 MUST NOT 是新的 Action、Run 类型、领域角色、流程状态、特殊 Commit、GitHub 事件、Push/Pull、PR/MR 或文件传输协议。

是否需要 Commit、文件复制、远端同步或其他操作 MUST 由当前项目环境与 D1 决定，MUST NOT 进入 C1 核心契约。

#### Scenario: 续接不要求特定 Git 操作

- **WHEN** 当前阶段形成稳定正式结果
- **AND** Continuation Context 可以从正式事实生成
- **THEN** 形成可续接切点
- **AND** 该切点 MUST NOT 要求 Commit、Push、Remote 或 PR 作为必要条件

#### Scenario: 续接切点不创建新实体

- **WHEN** 形成续接切点
- **THEN** MUST NOT 创建新的 Action、Run 类型或流程状态
- **AND** MUST NOT 创建特殊 Commit 类型

### Requirement: Review 必须通过 reviewedResultRef 绑定正式结果

Review MUST 通过 `reviewedResultRef` 绑定被审查的正式结果。`reviewedResultRef` MUST 唯一指向被审查的正式结果。

如果被审查结果发生变化，原 Approval MUST 对新结果失效，MUST 重新 Review。

Review 是否有效 MUST NOT 依赖是否使用 GitHub、Remote 或 PR。C1 MUST NOT 把 Git Commit SHA 固定为所有 Review 绑定的唯一形式。

#### Scenario: 被审查结果变化导致 Approval 失效

- **WHEN** Review 已对某结果给出 `approved` Verdict
- **AND** 该结果后来发生变化
- **THEN** 原 Approval MUST 对新结果失效
- **AND** MUST 重新 Review 新结果

#### Scenario: Review 不依赖特定平台

- **WHEN** Review 绑定被审查结果
- **THEN** `reviewedResultRef` MAY 映射为不同具体形式
- **AND** Review 有效性 MUST NOT 依赖 GitHub、Remote 或 PR

### Requirement: Adapter 必须只负责边界转换

Adapter MUST 只负责将 Flowkit Core 的逻辑执行输入呈现给执行者，并将执行者的逻辑 Action Result 传回 Flowkit。

Adapter MUST NOT：判断当前 Action、改写 Change 契约、跳过 Review、将 Non-blocking Finding 自动升级为 Blocking、自行授权 Apply/Archive/Full Test/Finalize、自行创建新的 Change、成为第二个编排器。

C1 MUST NOT 建立 Provider Registry、Adapter Registry 或动态路由平台。

#### Scenario: Adapter 不判断 Action

- **WHEN** Adapter 接收 Flowkit Core 的逻辑执行输入
- **THEN** Adapter MUST 只将其呈现给执行者
- **AND** MUST NOT 自行判断或修改当前 Action

#### Scenario: Adapter 不跳过 Review

- **WHEN** 执行者通过 Adapter 返回 Action Result
- **AND** 该 Action 需要正式 Review
- **THEN** Adapter MUST NOT 跳过 Review
- **AND** MUST NOT 自行判定 Result 已通过

### Requirement: Skill 必须只声明方法类别

Action Package MUST 通过方法类别声明所需 Skill，例如文档分析、契约审查、代码审查、安全审查、性能审查。

C1 MUST NOT 在核心契约中绑定具体 Skill 路径。C1 MUST NOT 绑定具体 Agent（Codex、ChatGPT 等）。C1 MUST NOT 让 Skill 决定流程。C1 MUST NOT 建立 Skill Registry、Router 或 DAG。

具体 Skill 标识 MAY 由项目配置、Adapter 或 Agent 环境解释。

#### Scenario: Skill 不绑定具体标识

- **WHEN** Action Package 声明所需方法类别
- **THEN** MUST 只使用抽象方法类别
- **AND** MUST NOT 绑定具体 Skill 路径或 Agent 标识

#### Scenario: Skill 不决定流程

- **WHEN** Skill 执行其方法
- **THEN** Skill MUST 只在当前 Action 内执行
- **AND** MUST NOT 决定下一 Action 或流程状态

### Requirement: 外部工具必须遵守权威边界

OpenSpec MUST 拥有 Change 契约，MUST NOT 决定 Delivery、当前 Action 或 owner 授权。Flowkit MUST NOT 复制 OpenSpec 全部内部状态。

Git MUST 拥有受版本管理文件、Diff 和历史。Git Commit MUST NOT 等同于续接切点或信息交换媒介。Change Checkpoint 和 Delivery Final MUST 仍是正式 Git 边界。

Verification 工具 MUST 拥有原始检查结果。Flowkit MUST 只消费标准状态、摘要和结果引用。Full Test 授权边界 MUST 继续沿用 B1，MUST NOT 由 Adapter、Agent、Skill 或验证工具自行突破。

Archify MUST 只接收 Delivery 架构上下文并返回架构结果引用。CodeGraph MUST 只接收变化范围或查询上下文并返回依赖、影响范围和相关测试上下文。两者 MUST NOT 决定 Flowkit 下一 Action 或产生最终 Review Verdict。

#### Scenario: Git 边界不等于续接切点

- **WHEN** Flowkit 判断是否形成续接切点
- **THEN** MUST NOT 把 Git Commit 作为唯一判断条件
- **AND** Git 边界 MUST NOT 等同于续接切点
- **AND** MUST NOT 等同于信息交换媒介

#### Scenario: Archify 不决定下一 Action

- **WHEN** Archify 返回架构结果
- **THEN** Archify MUST NOT 决定 Flowkit 下一 Action
- **AND** MUST NOT 产生最终 Review Verdict

#### Scenario: Verification 工具不突破 Full Test 授权

- **WHEN** Verification 工具返回测试结果
- **THEN** Full Test 授权 MUST 继续由 owner 控制
- **AND** Verification 工具 MUST NOT 自行触发 Full Test

### Requirement: Flowkit 必须对信息交换媒介保持中立

Flowkit MUST NOT 把以下任何方式固定为流程前提：GitHub、GitLab 或其他平台；Remote 存在；Push 或 Pull；PR 或 MR；本地或远程执行；一个或多个 AI；ChatGPT、Codex 或其他 Provider；Patch、ZIP 或共享目录；PowerShell、Shell 或特定操作系统；Worktree 数量；Materializer 存在；封闭的 Workspace Capability 枚举；封闭的协作拓扑枚举。

Flowkit MUST 只检查：正式结果可读取、上下文可恢复、Policy 可计算下一 Action。

#### Scenario: 不固定特定平台

- **WHEN** Flowkit 推进流程
- **THEN** MUST NOT 要求 GitHub、GitLab 或特定 Forge 作为前提
- **AND** MUST NOT 要求 Remote、Push 或 PR 作为流程前提

#### Scenario: 不固定执行位置

- **WHEN** 执行者执行 Action
- **THEN** Flowkit MUST NOT 要求本地或远程执行
- **AND** MUST NOT 要求特定 AI Provider
- **AND** MUST NOT 要求特定 Worktree 拓扑

### Requirement: C1 必须不修改 B1 已冻结文档

C1 MUST NOT 修改 B1 已 Checkpoint 的核心模型文档和 `flowkit-core-model` capability spec。

C1 MUST 新建 `docs/integration-boundaries.md` 和 `flowkit-integration-boundaries` capability spec。若发现 B1 真正冲突，MUST 提出新的 corrective Change，MUST NOT 在 C1 中静默改写。

#### Scenario: 发现 B1 冲突

- **WHEN** C1 发现与 B1 已冻结文档存在真正冲突
- **THEN** MUST 提出新的 corrective Change
- **AND** MUST NOT 在 C1 中静默修改 B1 文档

