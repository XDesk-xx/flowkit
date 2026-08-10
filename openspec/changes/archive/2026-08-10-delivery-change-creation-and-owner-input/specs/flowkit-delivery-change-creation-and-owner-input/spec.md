## Purpose

为 Flowkit 提供最小、可恢复且 fail-closed 的 Delivery/Change write-side，使 Owner 独立输入能够形成正式 provenance，并在不引入第二编排器、Decision DB 或自动 Git/Delivery 行为的前提下安全创建和激活 Change。

## ADDED Requirements

### Requirement: Delivery creation 必须由显式 Owner 输入创建最小 active Manifest

Flowkit MUST 提供 Delivery creation operation。创建输入 MUST 至少包含 Delivery id、goal、scope、branch、planned Changes、acceptance、architectureImpact、Full Test Plan declaration/status 与 Owner `sourceRef`。新 Delivery 主状态 MUST 直接为 `active`；创建前 MUST fail-closed 验证 repository 中不存在其它 active Delivery、Delivery id 唯一、planned Change key/id 唯一且 dependency graph 合法。创建 MUST 同时在新 Manifest 中记录对应 `create-delivery` Owner decision provenance。

Delivery creation MUST NOT 创建 Git branch、Commit、Push、PR、Run、Full Test 或 Archify asset。

#### Scenario: 成功创建 Delivery
- **WHEN** repository 中不存在 active Delivery
- **AND** create input 与 planned Change graph 全部有效
- **AND** Owner 提供非空 `sourceRef`
- **THEN** Flowkit MUST 原子创建一个 `delivery.state=active` 的 Delivery Manifest
- **AND** Manifest MUST 包含 `create-delivery` Owner decision record
- **AND** MUST NOT 创建 Git boundary、Run、Full Test 或 Archify asset

#### Scenario: 已有 active Delivery 时拒绝创建
- **WHEN** repository 中已经存在 active Delivery
- **THEN** Delivery creation MUST fail closed
- **AND** MUST NOT 写入第二个 active Delivery Manifest

### Requirement: Change creation 必须只追加 planned Change 并验证 canonical dependency

Flowkit MUST 提供 Change creation operation。输入 MUST 至少包含 `key`、`id`、`goal`、`dependsOn`、`outputs`、`architectureImpact`、`required` 与 Owner `sourceRef`。`architectureImpact` MUST 作为 Change-level canonical persisted fact 与其它 Change fields 一起写入 Delivery Manifest；Delivery creation 的 initial planned Changes 与后续 `createChange` MUST 使用同一 persisted/read 语义，Reader/checkout/resume 后不得丢失。新 Change MUST 以 `state=planned` 加入唯一 active Delivery，且 MUST 在同一次 Manifest atomic publish 中记录 `create-change` Owner decision provenance。

`dependsOn` MUST 使用被依赖 Change 的 canonical `Change.id`；unknown、self、duplicate dependency 与 Delivery creation graph cycle MUST 被确定性拒绝。Change creation MUST NOT 自动创建 OpenSpec Change root、Run、Git boundary 或执行 activation。

#### Scenario: 成功追加 planned Change
- **WHEN** active Delivery 存在
- **AND** key/id 唯一且所有 dependency id 合法
- **AND** Owner 提供非空 `sourceRef`
- **THEN** Flowkit MUST 原子追加含原始 `architectureImpact` 的 `state=planned` Change 与 `create-change` Owner record
- **AND** checkout/resume 后 Reader MUST 恢复同一 `architectureImpact`
- **AND** MUST NOT 自动创建 OpenSpec Change root 或 Run

#### Scenario: unknown dependency 被拒绝
- **WHEN** create Change 的 `dependsOn` 包含当前 Delivery 中不存在的 Change.id
- **THEN** operation MUST fail closed
- **AND** Manifest MUST 保持不变

### Requirement: pre-A1 architectureImpact missing compatibility 必须 exact-bounded 且 non-inferential

A1 MUST 支持 Base `448fa042de86d07e893bcc51da528f93eb7ced3a` 已存在三份 source-controlled Delivery Manifest 的 exact `(deliveryId, Change.id)` legacy identity set。仅这些 pre-A1 Change 在缺少 Change-level `architectureImpact` 时 MAY 被 Reader 接纳；接纳结果 MUST 明确表达 unknown/legacy-missing，MUST NOT 伪造 `true` 或 `false`，MUST NOT 静默 backfill。

A1 `createDelivery` / `createChange` 创建的所有新 Change MUST 要求并持久化 boolean `architectureImpact`。任何不在 exact legacy set 的 Change 缺少或携带畸形值 MUST fail closed。Compatibility MUST NOT 按日期、字段缺失、Change state、key 命名或其它 fuzzy shape 自动扩张。

#### Scenario: Base + A1 Apply 不 self-brick
- **WHEN** Reader 加载 Base 中 pre-A1 exact legacy Change 且该 item 缺少 `architectureImpact`
- **THEN** Reader MUST 能继续形成不伪造 boolean 的 formal snapshot
- **AND** architectureImpact MUST 表达为 explicit unknown/legacy-missing

#### Scenario: future malformed Change 不能借 legacy seam 通过
- **WHEN** A1 write-side 启用后出现一个不在 exact legacy identity set 的 Change
- **AND** 该 Change 缺少 `architectureImpact`
- **THEN** Reader/validation MUST fail closed
- **AND** MUST NOT 把它视为 pre-A1 legacy

### Requirement: Owner decision provenance 必须是 Manifest 内最小 typed authority record

Active Delivery Manifest MUST 支持顶层 `ownerDecisions` records。每条 record MUST 只保存：确定性 `ref`、typed `decision`、`deliveryId`、可选 canonical `changeId` 与 opaque `sourceRef`。`ref` MUST 从 canonical record tuple 的内容 hash 派生，不得依赖随机值或当前时间。A1 MUST NOT 保存聊天正文、provider session、完整 approval transcript，也 MUST NOT 建立 Decision DB、Approval Registry、workflow inbox 或 event ledger。

A1 支持的 record decision vocabulary MUST 至少覆盖 `create-delivery`、`create-change` 与 current Policy 已存在的 `activate-change`、`authorize-apply`、`authorize-archive`、`authorize-checkpoint`、`authorize-full-test`、`authorize-delivery-finalize`。Change-scoped decision MUST 携带 canonical `changeId`；Delivery-scoped Full Test/Finalize decision MUST NOT 伪造 Change target。

#### Scenario: 完全相同 Owner record 重试
- **WHEN** 相同 canonical decision tuple 已存在
- **THEN** 再次记录 MUST 作为 idempotent success 处理
- **AND** MUST NOT 产生第二条语义重复 record

#### Scenario: malformed 或 unknown Owner record
- **WHEN** decision 未知、deliveryId 不匹配、required changeId 缺失、target Change 不存在或 sourceRef 为空
- **THEN** write operation MUST fail closed
- **AND** Reader MUST NOT 把该记录投影为有效 authorization

### Requirement: Owner provenance 只保证 structural non-inference

Flowkit MUST 只把显式 write operation 收到的 Owner input 记录为 Owner authority provenance。A1 MUST NOT 从 Run `ownerAuthorization`、Proposal/Design prose、Reviewer finding、聊天摘要、Git commit message 或其它 Agent 转述推断新的 Owner authority。`sourceRef` 是 opaque provenance reference；A1 MUST NOT 声称验证其外部身份真实性或提供 cryptographic authentication。

#### Scenario: Run ownerAuthorization 不升级为 Owner fact
- **WHEN** 历史或 current Run context 含 `ownerAuthorization: explicit`
- **THEN** Reader MUST NOT 因该字符串创建 Owner decision record 或 authorization fact

### Requirement: Authorization-only Owner record 必须匹配 current Policy gate

`flowkit owner record` 对 `authorize-apply`、`authorize-archive`、`authorize-checkpoint`、`authorize-full-test`、`authorize-delivery-finalize` 的持久化，MUST 在任何 Manifest mutation 前重新读取 current formal facts 并执行 current Policy。只有当 current Policy 正在请求完全相同的 Owner decision，且 canonical target 与 record target 完全一致时，record 才 MAY 被写入；否则 operation MUST fail closed 且 Manifest MUST 保持不变。

A1 MUST NOT 把“未来可能需要该 authorization”当作 admission 条件，也 MUST NOT 建立 generic authority-resolution tracking。create/activate provenance 仍由对应 mutation command 在其自身合法 boundary 内原子记录，不通过 standalone `owner record` 预写。

#### Scenario: 提前 authorize-archive 被拒绝
- **WHEN** current Policy 尚未返回 `owner-decision: authorize-archive` for target Change.id
- **AND** 调用者尝试持久化该 authorize-archive record
- **THEN** operation MUST fail closed
- **AND** Manifest MUST byte-identical 保持不变

#### Scenario: current gate 与 target 完全匹配
- **WHEN** current Policy 正在请求某 authorization-only decision
- **AND** requested decision 与 canonical Delivery/Change target 和本次 record 完全一致
- **THEN** persistence MAY 写入该 deterministic Owner record
- **AND** MUST NOT 自动执行后续 Action、Git boundary 或 Delivery behavior

### Requirement: Activation 必须消费 Policy 合法边界与本次 Owner 明确输入

Flowkit MUST 提供 Change activation operation。Activation 前 MUST 重新加载 formal facts，并验证：Delivery active、目标 Change planned、无其它 active Change、dependencies completed、formal conflicts 为空，且 current Policy 的 `activate-change` boundary 包含所选目标。Operation MUST 使用本次显式 Owner `sourceRef` 生成 `activate-change` record；不得由 Agent 自行选择或伪造 Owner authority。

成功 activation MUST 只完成目标 Change `planned → active` 与 minimal OpenSpec metadata initialization；MUST NOT 自动创建 `explore` Run、Commit、Checkpoint、Push、Full Test 或下一 Action。

#### Scenario: 合法 activation
- **WHEN** target Change 满足全部 activation preconditions
- **AND** Policy 的 eligible activation set 包含该 target
- **AND** Owner 提供显式 sourceRef
- **THEN** Flowkit MUST 将该 Change 变为 active 并记录 target-scoped `activate-change` record
- **AND** MUST NOT 自动创建 Explore Run

#### Scenario: dependency 未完成时拒绝 activation
- **WHEN** target Change 任一 dependency id 对应 Change 未 completed
- **THEN** activation MUST fail closed
- **AND** Manifest 与 OpenSpec metadata MUST 不被错误推进为 active lifecycle

### Requirement: Activation partial failure 必须有界且可幂等恢复

Activation MUST 使用 deterministic two-step publish：先确保 `openspec/changes/<change-id>/.openspec.yaml` 为 exact minimal metadata，再以一次 atomic Manifest replace 同时追加 Owner decision 与执行 `planned → active`。如果 Manifest publish 失败，唯一允许残留的 partial state 是 `planned Change + exact preinitialized .openspec.yaml`。Retry MUST 接受并复用 exact metadata；mismatched/non-minimal metadata MUST fail closed。

A1 MUST NOT 为此建立通用 transaction journal、rollback engine 或 event log。

#### Scenario: Manifest publish 失败后的重试
- **WHEN** exact OpenSpec metadata 已成功创建
- **BUT** Manifest atomic publish 失败且 Change 仍 planned
- **THEN** retry MUST 识别 exact metadata 为可复用 partial state
- **AND** MUST NOT 创建第二份 metadata 或要求手工删除后才能重试

#### Scenario: 预存在 metadata 不匹配
- **WHEN** target OpenSpec `.openspec.yaml` 已存在但 bytes/contract 与 A1 expected metadata 不匹配
- **THEN** activation MUST fail closed
- **AND** MUST NOT 将 Manifest 切换为 active

### Requirement: Existing Manifest mutation 必须 preserve unrelated semantics

A1 对现有 Delivery Manifest 的写入 MUST 使用 bounded structured mutation：只允许定位并修改 A1-owned `changes` item/state 与 `ownerDecisions` section，所有未拥有的 top-level/Change fields MUST 原样保留。Duplicate/ambiguous owned key、unsupported owned-section shape、malformed supported YAML subset MUST fail closed；MUST NOT silent repair。最终 publish MUST 使用 atomic replace、LF、无 trailing whitespace、exactly one EOF newline。

#### Scenario: activation 不重写无关 Manifest section
- **WHEN** Manifest 包含 goal、technicalBaseline、scope、architecture、verification、acceptance 等 A1 不拥有的 section
- **AND** activation 成功
- **THEN** 这些 section 的 bytes/语义 MUST 保持不变

### Requirement: A1 必须提供 bounded write CLI 且保持 diagnostics read-only

A1 MUST 提供最小 write CLI entry：`flowkit create delivery`、`flowkit create change`、`flowkit owner record`、`flowkit activate`。这些命令 MUST 只做参数/JSON input 解析并调用同一 A1 service/validation contract；不得复制 Policy decision tree。现有 `status`、`next`、`doctor`、`resume-context` MUST 继续 read-only。

G1 才负责完整 Change CLI/runner loop；A1 CLI MUST NOT 自动执行 `while(next)`、自动 Author/Reviewer、自动 Run creation、Commit/Push 或 Delivery behavior。

#### Scenario: diagnostic command 仍不可写
- **WHEN** 执行 `flowkit next` 或其它 diagnostic command
- **THEN** command MUST NOT 创建 Owner record、Change、Run 或执行 activation

#### Scenario: write command 不自动推进后续 Action
- **WHEN** `flowkit activate` 成功
- **THEN** command MUST 返回 activation result
- **AND** MUST NOT 自动开始 `explore`

### Requirement: A1 OpenSpec integration 必须限制为 minimal initializer

A1 MAY 直接创建 activation 所需的 minimal `.openspec.yaml`，但 MUST NOT import/vendor OpenSpec runtime，也 MUST NOT 在 A1 实现 planningHome、artifactPaths、contextFiles、status/instructions、validation 或 archive adapter。完整 OpenSpec 1.7 thin integration 属 C1。

#### Scenario: activation 不调用完整 OpenSpec adapter
- **WHEN** A1 激活一个 planned Change
- **THEN** 只允许初始化该 Change 的 minimal metadata
- **AND** MUST NOT 执行 OpenSpec archive、spec sync 或 artifact path orchestration
