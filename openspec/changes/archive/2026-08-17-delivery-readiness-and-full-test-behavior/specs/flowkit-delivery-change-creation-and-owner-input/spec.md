## MODIFIED Requirements

### Requirement: Delivery creation 必须由显式 Owner 输入创建最小 active Manifest

Flowkit MUST 提供 Delivery creation operation。创建输入 MUST 至少包含 Delivery id、goal、scope、branch、planned Changes、acceptance、architectureImpact、Full Test coverage plan、**typed per-Delivery Full Test execution contract** 与 Owner `sourceRef`。Execution contract MUST carry logical command identity、bounded `launcherMode=direct|npm-shim`、scope、timeout、result authority/protocol and expected terminal outcome；Writer MUST 校验后持久化调用方/Delivery contract supplied values，MUST NOT hard-code 当前 Flowkit repository 的 `npm run verify:full` 或 `120000` 作为所有 future Delivery 的 universal values。新 Delivery 主状态 MUST 直接为 `active`；创建前 MUST fail-closed 验证 repository 中不存在其它 active Delivery、Delivery id 唯一、planned Change key/id 唯一且 dependency graph 合法。创建 MUST 同时在新 Manifest 中记录对应 `create-delivery` Owner decision provenance。

Delivery creation MUST NOT 创建 Git branch、Commit、Push、PR、Run、Full Test 或 Archify asset。

#### Scenario: 成功创建 Delivery
- **WHEN** repository 中不存在 active Delivery
- **AND** create input、caller-supplied Full Test execution contract 与 planned Change graph 全部有效
- **AND** Owner 提供非空 `sourceRef`
- **THEN** Flowkit MUST 原子创建一个 `delivery.state=active` 的 Delivery Manifest
- **AND** Manifest MUST 原样语义持久化该 Delivery 自己的 Full Test execution contract
- **AND** Manifest MUST 包含 `create-delivery` Owner decision record
- **AND** MUST NOT 创建 Git boundary、Run、Full Test 或 Archify asset

#### Scenario: 已有 active Delivery 时拒绝创建
- **WHEN** repository 中已经存在 active Delivery
- **THEN** Delivery creation MUST fail closed
- **AND** MUST NOT 写入第二个 active Delivery Manifest

#### Scenario: 不同 Delivery 可以持久化不同 execution contract
- **WHEN** 两个独立 disposable repository 分别创建合法 Delivery
- **AND** 两次 create input 提供不同的 Full Test command/args/launcherMode/timeout
- **THEN** 各自 Manifest MUST 持久化其调用方提供的值
- **AND** Flowkit MUST NOT 将任一 current-repository instance 改写成 repository-global default

### Requirement: Authorization-only Owner record 必须匹配 current Policy gate

`flowkit owner record` 对 `authorize-apply`、`authorize-archive`、`authorize-checkpoint`、`authorize-full-test`、`authorize-delivery-finalize` 的持久化，MUST 在任何 Manifest mutation 前重新读取 current formal facts 并执行 current Policy。只有当 current Policy 正在请求完全相同的 Owner decision，且 canonical target 与 record target 完全一致时，record 才 MAY 被写入；否则 operation MUST fail closed 且 Manifest MUST 保持不变。

对于 exact current Delivery 的 `authorize-full-test`，当 Policy gate 基于 pure readiness projection 请求该 decision 时，write-side MUST 在同一次 atomic Manifest publication 中追加 deterministic Owner record 并把 persisted raw `delivery.fullTestStatus` 从 `not-ready|awaiting-user-decision` 更新为 `authorized`。该 publication 只关闭 authorization gate，MUST NOT 执行 Full Test。其它 authorization-only decision 继续只持久化其既有 bounded authority facts。

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

#### Scenario: authorize-full-test 原子进入 authorized
- **WHEN** current Policy 正在请求 exact current Delivery 的 `authorize-full-test`
- **AND** persisted raw Full Test status 仍为 readiness-compatible `not-ready|awaiting-user-decision`
- **THEN** write-side MUST atomic publish matching Owner record 与 `delivery.fullTestStatus=authorized`
- **AND** MUST NOT执行当前 Delivery 的 Full Test execution contract 或创建 Standard Run

### Requirement: Existing Manifest mutation 必须 preserve unrelated semantics

A1 对现有 Delivery Manifest 的写入 MUST 使用 bounded structured mutation：只允许定位并修改 owned `changes` item/state、`ownerDecisions`、A1 Full Test 的 `delivery.fullTestStatus`、`verification.fullTest.execution`、exceptional current `verification.fullTest.executionBlock` 与 `verification.fullTest.result`；所有其它 top-level/Change/verification fields MUST 原样保留。Duplicate/ambiguous owned key、unsupported owned-section shape、malformed supported YAML subset MUST fail closed；MUST NOT silent repair。最终 publish MUST 使用 atomic replace、LF、无 trailing whitespace、exactly one EOF newline。

#### Scenario: activation 不重写无关 Manifest section
- **WHEN** Manifest 包含 goal、technicalBaseline、scope、architecture、verification、acceptance 等 activation 不拥有的 section
- **AND** activation 成功
- **THEN** 这些 section 的 bytes/语义 MUST 保持不变


#### Scenario: outcome-unknown 只允许发布 current executionBlock

- **WHEN** authorized Full Test 的 Windows timeout 未能证明 owned process tree 已终止
- **THEN** write-side MAY 在保持 raw `fullTestStatus=authorized` 的同时原子发布唯一 current `verification.fullTest.executionBlock`
- **AND** MUST NOT 发布 `failed`、terminal result 或 `resultRef`
- **AND** MUST NOT把该 block 扩张成 attempt history / generic execution ledger

#### Scenario: Full Test publication 只改 bounded owned fields
- **WHEN** authorization 或 Full Test terminal publication 修改 current Delivery Manifest
- **THEN** unrelated scope/architecture/changes/acceptance 与 Full Test coverage intent MUST 保持原语义
- **AND** writer MUST NOT broad reserialize 或格式化整个 Manifest
