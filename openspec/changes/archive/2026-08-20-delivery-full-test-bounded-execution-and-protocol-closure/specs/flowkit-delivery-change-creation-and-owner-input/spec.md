## MODIFIED Requirements

### Requirement: Delivery creation 必须由显式 Owner 输入创建最小 active Manifest

Flowkit MUST 提供 Delivery creation operation。创建输入 MUST 至少包含 Delivery id、goal、scope、branch、planned Changes、acceptance、architectureImpact、Full Test coverage plan、**typed per-Delivery Full Test execution contract** 与 Owner `sourceRef`。Execution contract MUST 使用 closed `kind=command|bounded-command-plan` 判别联合并共享 `id/scope/resultProtocol/resultAuthority/expectedTerminalStatuses` base。`command` MUST carry logical command、args、bounded `launcherMode=direct|npm-shim` 与 positive timeout；`bounded-command-plan` MUST carry ordered non-empty logical checks，每项至少含 unique logical `id`、closed `resolverId` 与 positive `perTargetTimeoutMs`。Writer MUST 校验并语义持久化调用方/Delivery contract supplied values，MUST NOT hard-code 当前 Flowkit repository 的 `npm run verify:full`、six-check resolver set 或 `120000` 作为所有 future Delivery 的 universal values；`command` MUST remain a legal future execution shape rather than historical-only。新 Delivery 主状态 MUST 直接为 `active`；创建前 MUST fail-closed 验证 repository 中不存在其它 active Delivery、Delivery id 唯一、planned Change key/id 唯一且 dependency graph 合法。创建 MUST 同时在新 Manifest 中记录对应 `create-delivery` Owner decision provenance。

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
- **AND** 两次 create input 提供不同的合法 Full Test execution shape/fields（包括 `command` 与 `bounded-command-plan`）
- **THEN** 各自 Manifest MUST 持久化其调用方提供的 execution contract
- **AND** Flowkit MUST NOT 将任一 current-repository instance 改写成 repository-global default


#### Scenario: bounded plan 不编译 human coverage prose
- **WHEN** create input 同时提供 human `verification.fullTest.plan` prose 与 `kind=bounded-command-plan` execution contract
- **THEN** Writer MUST 只把 typed execution contract作为 executable binding
- **AND** MUST NOT从 human plan字符串推导 logical check/resolver/timeout


### Requirement: Change creation 必须只追加 planned Change 并验证 canonical dependency

Flowkit MUST 提供 Change creation operation。输入 MUST 至少包含 `key`、`id`、`goal`、`dependsOn`、`outputs`、`architectureImpact`、`required` 与 Owner `sourceRef`。`architectureImpact` MUST 作为 Change-level canonical persisted fact 与其它 Change fields 一起写入 Delivery Manifest；Delivery creation 的 initial planned Changes 与后续 `createChange` MUST 使用同一 persisted/read 语义，Reader/checkout/resume 后不得丢失。新 Change MUST 以 `state=planned` 加入唯一 active Delivery，且 MUST 在同一次 Manifest atomic publish 中记录 `create-change` Owner decision provenance。

当 current Full Test raw status=`authorized`、current executionBlock不存在且 Owner 创建 `required=true` Change 时，write-side MUST在同一次 atomic Manifest publication中追加 planned Change、追加 `create-change` Owner provenance并把 raw `fullTestStatus` 从 `authorized` 失效为 `not-ready`。历史 `authorize-full-test` Owner record MUST保留为 history，MUST NOT继续授权新 required candidate。

当 current `verification.fullTest.executionBlock.reason=outcome-unknown` 时，ordinary Change creation MUST fail closed before any Manifest mutation；MUST NOT清除 block、追加 Change或借 create-change 绕过未知 process-tree safety boundary。

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


#### Scenario: authorized required Change 原子失效旧 Full Test authorization
- **WHEN** raw `fullTestStatus=authorized`
- **AND** current executionBlock不存在
- **AND** Owner创建合法 `required=true` Change
- **THEN** same atomic publish MUST append the planned Change and `create-change` record
- **AND** MUST set raw `fullTestStatus=not-ready`
- **AND** prior `authorize-full-test` records MUST remain immutable history

#### Scenario: outcome-unknown 阻止 Change creation
- **WHEN** current `executionBlock.reason=outcome-unknown`
- **AND** Owner尝试创建 ordinary Change
- **THEN** create MUST fail closed before mutation
- **AND** Manifest bytes and executionBlock MUST remain unchanged


### Requirement: Activation 必须消费 Policy 合法边界与本次 Owner 明确输入

Flowkit MUST 提供 Change activation operation。Activation 前 MUST 重新加载 formal facts，并验证：Delivery active、目标 Change planned、无其它 active Change、dependencies completed、formal conflicts 为空、current Full Test不存在 `executionBlock.reason=outcome-unknown`，且 current Policy 的 `activate-change` boundary 包含所选目标。Operation MUST 使用本次显式 Owner `sourceRef` 生成 `activate-change` record；不得由 Agent 自行选择或伪造 Owner authority。

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


#### Scenario: outcome-unknown 阻止 Change activation
- **WHEN** current `verification.fullTest.executionBlock.reason=outcome-unknown`
- **AND** 一个 planned Change否则满足 activation 条件
- **THEN** activation MUST fail closed before Change/OpenSpec mutation
- **AND** executionBlock MUST remain unchanged
