# flowkit-domain-and-state-schema Specification

## Purpose

冻结 Flowkit 确定性内核的领域层契约：定义 Delivery / Change / Run 领域对象、主状态联合类型与转换表、固定 Action Catalog、Run ID 分配规则与 terminal immutability 校验。本 spec 为后续 Formal Fact Reader、Policy Engine 和诊断 CLI 提供不可变的领域类型与 Schema 校验基础。

## Requirements
### Requirement: 领域对象 TypeScript 类型定义

B1 MUST 为 11 个领域对象（Delivery、Change、Run、ActionDefinition、ActionResult、ResultRef、ReviewVerdict、FindingSummary、VerificationSummary、OwnerAuthorizationRef、ContinuationContext）定义 TypeScript `interface` 或 `type`。领域对象 MUST 使用 `interface`/`type`，不使用 `class`（A1 的 `FlowkitError` 除外）。

#### Scenario: 11 个领域对象全部有类型定义

- **WHEN** 检查 `src/domain/types.ts`
- **THEN** MUST 存在 Delivery、Change、Run、ActionDefinition、ActionResult、ResultRef、ReviewVerdict、FindingSummary、VerificationSummary、OwnerAuthorizationRef、ContinuationContext 的 `interface` 或 `type` 定义
- **AND** 不使用 `class` 定义领域对象

#### Scenario: 类型编译通过

- **WHEN** 运行 `npm run typecheck`
- **THEN** 生产和测试 TypeScript 源码 MUST 通过类型检查

### Requirement: 主状态联合类型与冻结 spec 一致

Delivery/Change/Run 主状态联合类型 MUST 与冻结 spec 完全一致。RunStatus MUST 为 `pending | completed | failed | cancelled`，不含 `in-progress`（`in-progress` 仅存在于 ActionResult.ExecutionStatus）。

#### Scenario: DeliveryState 与冻结 spec 一致

- **WHEN** 检查 `DeliveryState` 类型定义
- **THEN** MUST 为 `'active' | 'completed' | 'cancelled'`

#### Scenario: ChangeState 与冻结 spec 一致

- **WHEN** 检查 `ChangeState` 类型定义
- **THEN** MUST 为 `'planned' | 'active' | 'completed' | 'cancelled'`

#### Scenario: RunStatus 与冻结 core-model.md Section 3.3 一致

- **WHEN** 检查 `RunStatus` 类型定义
- **THEN** MUST 为 `'pending' | 'completed' | 'failed' | 'cancelled'`
- **AND** MUST NOT 包含 `'in-progress'`

#### Scenario: ExecutionStatus 独立于 RunStatus

- **WHEN** 检查 `ExecutionStatus` 类型定义
- **THEN** MUST 为 `'in-progress' | 'completed' | 'failed' | 'blocked'`
- **AND** `in-progress` 仅存在于 ExecutionStatus，不进入 RunStatus 或 Run 状态转换

### Requirement: 结构状态转换表

B1 MUST 为 Delivery、Change、Run 三个实体分别定义结构状态转换表（`Record<State, readonly State[]>`）和泛型 `canTransition<S>(table, from, to)` 函数。terminal 状态 MUST 无出边。B1 只拥有结构转换边，语义前置条件属于 D1 Policy。

#### Scenario: Delivery 结构转换表

- **WHEN** 检查 `DELIVERY_STATE_TRANSITIONS`
- **THEN** `active` MUST 可转到 `completed` 或 `cancelled`
- **AND** `completed` 和 `cancelled` MUST 无出边

#### Scenario: Change 结构转换表

- **WHEN** 检查 `CHANGE_STATE_TRANSITIONS`
- **THEN** `planned` MUST 可转到 `active` 或 `cancelled`
- **AND** `active` MUST 可转到 `completed` 或 `cancelled`
- **AND** `completed` 和 `cancelled` MUST 无出边

#### Scenario: Run 结构转换表

- **WHEN** 检查 `RUN_STATE_TRANSITIONS`
- **THEN** `pending` MUST 可转到 `completed`、`failed` 或 `cancelled`
- **AND** `completed`、`failed`、`cancelled` MUST 无出边

#### Scenario: canTransition 为泛型函数

- **WHEN** 检查 `canTransition` 函数签名
- **THEN** MUST 接受 `Record<S, readonly S[]>` 表、`from: S`、`to: S` 参数
- **AND** 返回 `boolean`

#### Scenario: exhaustive matrix 测试覆盖三个实体

- **WHEN** 运行状态转换测试
- **THEN** Delivery、Change、Run 三个实体 MUST 分别遍历所有 `State × State` 组合
- **AND** 验证 `canTransition` 对合法转换返回 `true`，对非法转换返回 `false`

### Requirement: 固定 Action Catalog

B1 MUST 定义固定的 Standard Formal Action Catalog，且 Catalog MUST 只包含 10 个 Change Action：`explore`、`review-explore`、`revise-explore`、`propose`、`review-propose`、`revise-propose`、`apply`、`review-apply`、`revise-apply`、`archive`。`full-test` 与 `delivery-finalize` MUST NOT 是 Standard Formal Action；`review`、`revise` 与 `change-checkpoint` 也 MUST NOT 进入 Catalog。Delivery Full Test / Finalize 的 Delivery behavior machine representation 后置到 Delivery Execution Loop，不得通过保留 Delivery Action 兼容当前模型。

#### Scenario: CHANGE_ACTIONS 包含且仅包含 10 个 Change Action

- **WHEN** 检查 Standard Formal Action Catalog
- **THEN** MUST 包含且仅包含 10 项：`explore`、`review-explore`、`revise-explore`、`propose`、`review-propose`、`revise-propose`、`apply`、`review-apply`、`revise-apply`、`archive`
- **AND** MUST 使用 `const` 数组 + `as const`
- **AND** `FormalAction` MUST 等价于 Change Action union

#### Scenario: Delivery behavior 不进入 Standard Action Catalog

- **WHEN** 检查 Standard Formal Action Catalog
- **THEN** MUST NOT 包含 `full-test` 或 `delivery-finalize`
- **AND** MUST NOT 通过另一个 current `DELIVERY_ACTIONS` Catalog 把二者重新并入 `FormalAction`
- **AND** Delivery Full Test / Finalize MUST NOT 因兼容历史而获得新的 Standard Run

#### Scenario: Catalog 不含统一入口与 Git boundary

- **WHEN** 检查 Standard Formal Action Catalog
- **THEN** MUST NOT 包含 `review`、`revise` 或 `change-checkpoint`

#### Scenario: Action Catalog 不使用 enum

- **WHEN** 检查领域 Action 定义
- **THEN** MUST 使用 `const` 数组 + `as const`
- **AND** MUST NOT 使用 `enum`
### Requirement: Run ID 纯函数契约

B1 MUST 提供 Run ID 纯解析/校验/分配契约，包含 `parseRunId`、`validateRunIdUniqueness`、`allocateNextNnn`、`validateCandidateNnn` 四个纯函数。B1 MUST 操作传入的 Run-ID 字符串 fixture，MUST NOT 执行文件系统遍历（文件系统遍历和持久化属于 C1）。

#### Scenario: parseRunId 校验完整格式

- **WHEN** 调用 `parseRunId` 传入合法 `YYYYMMDD-NNN-action` 字符串
- **THEN** MUST 返回 `ParsedRunId`（含 date、nnn、action）
- **WHEN** 传入不匹配格式的字符串
- **THEN** MUST throw `FlowkitError('RUN_ID_INVALID_FORMAT')`
- **WHEN** NNN 超出 001-999 范围
- **THEN** MUST throw `FlowkitError('RUN_ID_NNN_OUT_OF_RANGE')`

#### Scenario: validateRunIdUniqueness 拒绝 Delivery-wide 重复 NNN

- **WHEN** 调用 `validateRunIdUniqueness` 传入含重复 NNN 的 Run-ID 列表
- **THEN** MUST throw `FlowkitError('RUN_ID_DUPLICATE_NNN')`
- **AND** MUST 扫描 Change 级和 _delivery 级 Run 的 NNN

#### Scenario: allocateNextNnn 返回 max+1 并 fail-closed

- **WHEN** 调用 `allocateNextNnn` 传入非空 Run-ID 列表
- **THEN** MUST 先校验唯一性，再返回 max(NNN)+1
- **WHEN** 传入空列表
- **THEN** MUST 返回 1
- **WHEN** nextNnn > 999
- **THEN** MUST throw `FlowkitError('RUN_ID_NNN_EXHAUSTED')`
- **AND** MUST NOT 输出无效 ID

#### Scenario: validateCandidateNnn 先校验候选为有效 NNN

- **WHEN** 调用 `validateCandidateNnn` 传入 0、负数、小数或非有限值（NaN/Infinity）
- **THEN** MUST throw `FlowkitError('RUN_ID_NNN_OUT_OF_RANGE')`
- **AND** 此校验 MUST 在单调性校验之前执行

#### Scenario: validateCandidateNnn 拒绝非单调/复用 NNN

- **WHEN** 调用 `validateCandidateNnn` 传入 candidateNnn <= max(NNN)
- **THEN** MUST throw `FlowkitError('RUN_ID_NNN_NOT_MONOTONIC')`

#### Scenario: validateCandidateNnn 允许缺号

- **WHEN** 调用 `validateCandidateNnn` 传入 candidateNnn > max(NNN)+1
- **THEN** MUST NOT throw（缺号合法，跳过的编号不回填）

#### Scenario: Run ID 函数不执行文件系统遍历

- **WHEN** 检查 `src/domain/run-id.ts`
- **THEN** 函数 MUST 只操作传入的 Run-ID 字符串参数
- **AND** MUST NOT 调用文件系统 API（fs.readdir、fs.readFile 等）

### Requirement: terminal immutability 校验

B1 MUST 提供 `isTerminal(status: RunStatus): boolean` 和 `assertMutable(run: Run): void` 校验函数。terminal 状态为 `completed`、`failed`、`cancelled`。

#### Scenario: isTerminal 识别 terminal 状态

- **WHEN** 调用 `isTerminal` 传入 `completed`、`failed` 或 `cancelled`
- **THEN** MUST 返回 `true`
- **WHEN** 传入 `pending`
- **THEN** MUST 返回 `false`

#### Scenario: assertMutable 拒绝 terminal Run

- **WHEN** 调用 `assertMutable` 传入 status 为 terminal 的 Run
- **THEN** MUST throw `FlowkitError('RUN_TERMINAL')`
- **WHEN** 传入 status 为 `pending` 的 Run
- **THEN** MUST NOT throw

### Requirement: Schema 校验拒绝未知主状态

B1 MUST 提供 type guard 和运行时校验函数，拒绝未知主状态。Schema 校验 MUST 拒绝 `in-progress` 等未冻结状态作为 Run 状态。

#### Scenario: type guard 识别合法状态

- **WHEN** 调用 `isDeliveryState` 传入 `active`
- **THEN** MUST 返回 `true`
- **WHEN** 传入未知状态字符串
- **THEN** MUST 返回 `false`

#### Scenario: Schema 校验拒绝 in-progress 为 Run 状态

- **WHEN** 运行 Schema 校验传入 Run status 为 `in-progress`
- **THEN** MUST throw `FlowkitError`
- **AND** `in-progress` MUST 被拒绝为未知 Run 状态

### Requirement: outputs 概念类型定义

B1 MUST 在 Change 类型上定义 `outputs?: readonly string[]` 字段，文档注释 MUST 明确语义边界（不是文件白名单、不是 actualChangeSet、不是 control artifacts 清单）。B1 MUST NOT 实现运行时校验。

#### Scenario: outputs 字段存在且可选

- **WHEN** 检查 `Change` interface
- **THEN** MUST 包含 `outputs?: readonly string[]` 字段

#### Scenario: outputs 文档注释明确语义边界

- **WHEN** 检查 `outputs` 字段文档注释
- **THEN** MUST 明确 outputs 不等于完整允许修改文件白名单
- **AND** MUST 明确 outputs 不等于 Git actualChangeSet

### Requirement: Archify 最小字段

B1 MUST 在 Delivery 类型上定义 `architecture: ArchitectureInfo` 字段（含 `impact: boolean` 和 `archifyPlan: 'required' | 'not-required' | 'deferred'`）。B1 MUST NOT 创建 `archifyStatus` 字段。

#### Scenario: architecture 字段存在

- **WHEN** 检查 `Delivery` interface
- **THEN** MUST 包含 `architecture: ArchitectureInfo` 字段

#### Scenario: 不存在 archifyStatus

- **WHEN** 检查领域对象类型定义
- **THEN** MUST NOT 存在 `archifyStatus` 字段

### Requirement: ResultRef provider-neutral 与 Review/Verification 类型

ResultRef MUST 是 provider-neutral 逻辑引用（`ref` + `versionFingerprint` + `kind?`），MUST NOT 固定 `runPath` 为 mandatory 字段。ReviewVerdict、FindingSummary、VerificationSummary MUST 有完整类型定义。

#### Scenario: ResultRef 不含 mandatory runPath

- **WHEN** 检查 `ResultRef` interface
- **THEN** MUST 包含 `ref: string` 和 `versionFingerprint: string`
- **AND** MAY 包含 `kind?: string`
- **AND** MUST NOT 包含 mandatory `runPath` 字段

#### Scenario: ReviewVerdict 包含完整字段

- **WHEN** 检查 `ReviewVerdict` interface
- **THEN** MUST 包含 `verdict`、`blockingFindings`、`nonBlockingFindings`、`reviewedResultRef`

#### Scenario: VerificationSummary 与 verification-model.md 一致

- **WHEN** 检查 `VerificationCheck` interface
- **THEN** MUST 包含 name、scope、applicability、commands、status、summary
- **AND** `VerificationSummary` MUST 包含 `checks` 和 `overallStatus`

### Requirement: 领域对象契约矩阵

B1 MUST 为 11 个领域对象定义所有权边界和最小字段。ActionResult、ContinuationContext MUST 标记为逻辑最小字段（物理传输由 C1 定义）。ResultRef、OwnerAuthorizationRef MUST 标记为 provider-neutral 引用（adapter 映射由 C1 定义）。ActionDefinition MUST 包含 role/goal/preconditions/allowedOutputs/completionConditions。

#### Scenario: ActionDefinition 包含 integration-boundaries 要求的字段

- **WHEN** 检查 `ActionDefinition` interface
- **THEN** MUST 包含 `action`、`role`、`goal`、`preconditions`、`allowedOutputs`、`completionConditions`

#### Scenario: ActionResult 标记为逻辑最小字段

- **WHEN** 检查领域对象契约矩阵
- **THEN** ActionResult MUST 标记为"B1 拥有逻辑最小字段"
- **AND** 物理传输 schema 由 C1 定义

#### Scenario: ContinuationContext 不自行填写 nextAllowedAction

- **WHEN** 检查 `ContinuationContext` 文档注释
- **THEN** MUST 明确 `nextAllowedAction` 由 Policy 计算
- **AND** MUST NOT 由 ContinuationContext 自行填写

### Requirement: 测试策略

B1 全部测试 MUST 使用构造 fixture，MUST NOT 依赖真实 Git 仓库或文件系统。

#### Scenario: 测试不依赖文件系统

- **WHEN** 检查 `tests/unit/domain/` 测试文件
- **THEN** MUST 使用构造的 fixture 数据
- **AND** MUST NOT 读取真实 Git 仓库或文件系统

#### Scenario: Run ID 测试覆盖完整校验场景

- **WHEN** 运行 Run ID 测试
- **THEN** MUST 覆盖格式校验、唯一性拒绝、候选输入校验（0/负数/小数/非有限值）、单调性拒绝、缺号允许、NNN 耗尽 fail-closed、空列表

### Requirement: B1 范围边界

B1 MUST NOT 实现 Policy 引擎、FormalFactSnapshot、fact reader、原子持久化、诊断 CLI 命令或 Archify runtime。B1 MUST NOT 引入外部运行时依赖。

#### Scenario: 不存在 Policy 引擎

- **WHEN** 检查 `src/domain/` 源码
- **THEN** MUST NOT 存在 `canRun`、`next`、`diagnose` 等 Policy 函数

#### Scenario: 不存在 fact reader 或持久化

- **WHEN** 检查 `src/domain/` 源码
- **THEN** MUST NOT 存在 FormalFactSnapshot、fact reader 或文件系统持久化实现

#### Scenario: 不引入外部运行时依赖

- **WHEN** 检查 `package.json` dependencies
- **THEN** B1 MUST NOT 新增外部运行时依赖（如 Zod、JSON Schema 库）

### Requirement: A1 creation 与 Owner provenance 必须有最小 typed domain contract

Domain MUST 为 Delivery create input、Change create input 与 Owner decision provenance 定义 provider-neutral TypeScript type/interface。Owner record MUST 至少表达 `ref`、typed decision、`deliveryId`、可选 canonical `changeId` 与 `sourceRef`；Change create input MUST 表达 `architectureImpact`，且 `dependsOn` 的元素语义 MUST 为 Change.id。Change-level `architectureImpact` MUST 同时存在于 persisted/read Change contract（`Change`、`ChangeSummary`、`ChangeFact` 或等价正式投影），不得只存在于 create DTO 后被丢弃。

#### Scenario: Change create input 使用 id dependency
- **WHEN** 构造 Change create input
- **THEN** `dependsOn` 每个值 MUST 被解释为同 Delivery Change.id
- **AND** MUST NOT 被解释为 Change.key

#### Scenario: Owner record 不包含 provider session
- **WHEN** 构造 Owner decision record
- **THEN** type MUST 不要求 Chat/Agent/provider session 字段
- **AND** `sourceRef` MUST 保持 provider-neutral opaque string

### Requirement: Change architectureImpact 必须可持久化并可恢复，pre-A1 missing 必须显式 unknown

A1 write-side 创建的每个 Delivery Manifest Change item MUST 保存 boolean `architectureImpact`，且 FormalFact/Domain read model MUST 原样投影该值。Delivery create 的 initial planned Changes 与后续 createChange MUST 使用同一字段语义；checkout/resume MUST 能从 source-controlled Manifest 恢复该事实。

对 Base `448fa042de86d07e893bcc51da528f93eb7ced3a` 已存在、并由 A1 Proposal 冻结 exact `(deliveryId, Change.id)` legacy identity set 的 pre-A1 Change，若 Manifest 缺少该字段，read model MAY 使用显式 `unknown / pre-a1-legacy-missing` 表达缺失事实；该状态 MUST NOT 等价于 `true` 或 `false`。不在 exact legacy set 的 Change 缺失/畸形 `architectureImpact` MUST fail closed。

#### Scenario: createChange 后恢复 architectureImpact
- **WHEN** Owner 创建 `architectureImpact=true` 的 planned Change
- **AND** repository 重新 checkout/resume 并读取 Delivery Manifest
- **THEN** Change read model 与 ChangeFact MUST 仍表达 `architectureImpact=true`
- **AND** MUST NOT 依赖 Run、聊天或 transient create input 才能恢复

#### Scenario: pre-A1 legacy missing 不猜 boolean
- **WHEN** exact legacy identity set 中的 Change item 没有 `architectureImpact`
- **THEN** Domain/FormalFact read model MUST 表达 explicit unknown/legacy-missing
- **AND** MUST NOT 投影为 `architectureImpact=true`
- **AND** MUST NOT 投影为 `architectureImpact=false`

#### Scenario: future Change missing fail closed
- **WHEN** A1 write-side 创建或管理的非 legacy Change 缺失 `architectureImpact`
- **THEN** schema/read validation MUST fail closed
- **AND** MUST NOT 通过 legacy compatibility

### Requirement: B1 execution schema 必须保持受限且 provider-neutral

Domain MUST提供 fixed ActionDefinition与logical ActionPackage/logical result input的受限 schema。ActionDefinition MUST至少机器表达 `action/role/goalClass/mutationClass/outputClass/terminalContract`并只允许Proposal冻结的十个mapping。Current Run context MUST支持compact Core-derived semantic input fingerprint。Schema MUST NOT加入provider session、chat transcript、Registry entry、Evidence receipt或新的lifecycle主状态。

#### Scenario: provider session 不进入 Run identity
- **WHEN**同一 pending Run在不同 provider/chat session中继续
- **THEN** Domain execution identity MUST仍由 runId + semantic input fingerprint表达
- **AND** MUST NOT要求 provider session id

### Requirement: semantic identity descriptor 必须显式表达 versioned contract inputs

Domain semantic identity descriptor MUST能够规范表达排序后的 `contractRefs {ref,kind,versionFingerprint}`、ActionDefinition identity/version、handoff/review/verification/Owner authority identity，并允许对没有versioned ref但会改变执行语义的authority scalar做canonical encoding。它 MUST NOT退化成整个ActionPackage blob hash或provider/session identity。

#### Scenario: contractRefs 可稳定 canonicalize
- **WHEN**相同 contractRefs 以不同输入顺序提供
- **THEN** canonical descriptor MUST产生相同identity
- **AND**任一 ref/kind/versionFingerprint变化 MUST产生不同semantic fingerprint
