## MODIFIED Requirements

### Requirement: Delivery-level Action 前置条件

Standard `canRun` MUST NOT 接受 `full-test` 或 `delivery-finalize`，因为二者都不是 Standard Formal Action。A1 MUST实现 Owner-authorized Delivery Full Test machine behavior；F1 MUST实现 qualification-bound Delivery Finalize machine behavior。Policy 的 no-active-change 分支 MUST消费 current effective `fullTestStatus`、Architecture disposition、exact finalization qualification 与 Owner authorization 做 deterministic transition，但不得把 Delivery behavior 伪装为 Action/Run。

After E1, architecture finalization remains Delivery behavior/Owner decisions outside the Standard Change Action catalog. For `architecture.impact=true`, Full Test passed MUST NOT directly qualify Finalize until a current Actual/Compare cycle exists and explicit Owner architecture acceptance is current. After F1, only an Owner Finalize authorization bound to the exact current finalization qualification MAY expose `delivery-behavior: delivery-finalize`.

#### Scenario: Standard canRun 不接受 full-test

- **WHEN** 调用 Standard `canRun` 请求 `full-test`
- **THEN** MUST 不把它识别为 `FormalAction`
- **AND** MUST NOT 创建或允许 Standard Run

#### Scenario: Standard canRun 不接受 delivery-finalize

- **WHEN** 调用 Standard `canRun` 请求 `delivery-finalize`
- **THEN** MUST 不把它识别为 `FormalAction`
- **AND** MUST NOT 创建或允许 Standard Run

#### Scenario: authorized Full Test 在 03 前 blocked

- **WHEN** bounded historical/pre-A1 snapshot 中无 active Change且所有 required Changes completed/checkpointed
- **AND** `deliveryFullTestStatus=authorized`
- **AND** A1 executable binding或 Delivery behavior executor在该 historical snapshot 中不可用
- **THEN** `next` MUST 返回 deterministic blocked diagnosis
- **AND** MUST NOT 返回 `action: full-test`、Standard Run 或 fabricated terminal result

#### Scenario: authorized Full Test 在 A1 后可执行

- **WHEN** current A1+ snapshot 中无 active Change且所有 required Changes completed/checkpointed
- **AND** `deliveryFullTestStatus=authorized`
- **AND** matching Owner Full Test authorization 与 executable binding 均存在
- **AND** current `verification.fullTest.executionBlock` 不存在
- **THEN** `next` MUST 返回 `delivery-behavior: full-test`
- **AND** MUST NOT 返回 `action: full-test` 或创建 Standard Run

#### Scenario: authorized + outcome-unknown block 不允许 Full Test 重入

- **WHEN** no active Change
- **AND** current effective `deliveryFullTestStatus=authorized`
- **AND** current `verification.fullTest.executionBlock.reason=outcome-unknown`
- **THEN** Policy MUST 返回 deterministic blocked boundary（例如 `full-test-execution-outcome-unknown`）
- **AND** MUST NOT 返回 `delivery-behavior: full-test`
- **AND** MUST NOT返回 Standard Action/Run

#### Scenario: passed + finalize authorized 在 03 前 blocked

- **WHEN** bounded historical/pre-F1 snapshot 中无 active Change且所有 required Changes completed/checkpointed
- **AND** `deliveryFullTestStatus=passed`
- **AND** Owner finalize authorization 已存在
- **AND** F1 Finalize behavior/qualification facts在该snapshot中不可用
- **THEN** `next` MUST 返回 deterministic blocked diagnosis
- **AND** MUST NOT 返回 `action: delivery-finalize`

#### Scenario: passed Full Test requests architecture behavior before Finalize
- **WHEN** all required Changes are completed/checkpointed
- **AND** Delivery Full Test status is `passed`
- **AND** architecture impact is true
- **AND** no current architecture cycle exists
- **THEN** Policy MUST return a Delivery architecture actual/compare behavior boundary
- **AND** MUST NOT request Finalize authorization

#### Scenario: compare cycle requests Owner architecture acceptance
- **WHEN** current architecture cycle exists with acceptance `awaiting-owner-decision`
- **THEN** Policy MUST return Owner decision `accept-architecture` bound to that Delivery/cycle context
- **AND** MUST NOT infer acceptance from compare success

#### Scenario: accepted architecture unlocks later Finalize authorization
- **WHEN** Full Test remains passed
- **AND** current architecture cycle is accepted
- **AND** acceptedSystemSource exactly matches that cycle
- **THEN** Policy MUST derive the exact current finalization qualification
- **AND** if no matching qualification-bound Owner record exists, MUST return `owner-decision: authorize-delivery-finalize`

#### Scenario: exact F1 Finalize authorization exposes Delivery behavior
- **WHEN** all required Changes are completed/checkpointed
- **AND** Full Test is passed and architecture gate is accepted/not-applicable
- **AND** exact current finalization qualification Q is available
- **AND** Owner authorization record binds exactly Q
- **THEN** `next` MUST return `delivery-behavior: delivery-finalize` with Q context
- **AND** MUST NOT return `action: delivery-finalize` or create a Standard Run

### Requirement: ownerAuthorizations 空数组时 owner-decision

`snapshot.ownerAuthorizations` 为空数组时，既有 apply/archive 与 `awaiting-user-decision` / passed 的 Owner authorization gate MUST 继续返回对应 owner-decision；空数组本身 MUST NOT 产生 blocked。对于已经进入 `authorized` 的 Delivery Full Test，如果 executable binding不可用则保持bounded historical blocked，否则使用A1 behavior。对于 passed Delivery，pre-F1 bounded snapshot在Finalize executor不可用时 MAY blocked；F1+ snapshot则必须先派生 exact qualification并根据 matching Owner record返回 fresh `authorize-delivery-finalize` 或 `delivery-behavior: delivery-finalize`。

#### Scenario: apply/archive 缺授权仍返回 owner-decision

- **WHEN** `snapshot.ownerAuthorizations` 为空
- **AND** 当前 Change 已到 apply/archive 的唯一 authorization gate
- **THEN** `next` MUST 返回对应 owner-decision
- **AND** MUST NOT 自动推进

#### Scenario: Delivery behavior 已授权但 executor 未实现时 blocked

- **WHEN** bounded historical Full Test/Finalize snapshot已有所需 Owner authorization
- **AND** 对应 Delivery behavior machine model/executor在该 historical snapshot 尚未实现
- **THEN** `next` MUST 返回 Delivery-behavior blocked
- **AND** MUST NOT 把 authorization presence 转成 `full-test` / `delivery-finalize` Action

#### Scenario: F1+ passed Delivery 空 authorization requests exact Finalize decision

- **WHEN** F1+ snapshot 已满足 passed + architecture accepted/not-applicable
- **AND** current finalization qualification可确定
- **AND** `snapshot.ownerAuthorizations` 不含matching finalize record
- **THEN** `next` MUST 返回 `owner-decision: authorize-delivery-finalize`
- **AND** context MUST expose exact current qualification for write-side binding

## ADDED Requirements

### Requirement: Finalize Owner authorization applicability 必须 exact-match current qualification
Policy MUST compare `authorize-delivery-finalize` Owner records against the exact current finalization qualification, not merely decision + deliveryId. A field-absent historical finalize record or a record bound to a prior qualification MUST NOT authorize a fresh F1+ qualification.

#### Scenario: prior qualification authorization is stale
- **WHEN** current qualification is Q2
- **AND** Owner history contains only finalize record for Q1 where Q1 != Q2
- **THEN** Policy MUST request fresh `authorize-delivery-finalize`
- **AND** MUST NOT expose Finalize behavior

#### Scenario: matching qualification authorization is current
- **WHEN** current qualification is Q
- **AND** exactly applicable Owner finalize record binds Q
- **THEN** Policy MAY expose `delivery-behavior: delivery-finalize`

### Requirement: completed Delivery 必须退出 normal active lifecycle Policy
After F1 Finalize atomically publishes `delivery.state=completed`, standard `next`/`canRun` active-Delivery orchestration MUST NOT continue Full Test, Architecture, Change activation, or Finalize behavior. Git Delivery Final handoff is an explicit completed-Delivery read-only service, not a Policy Action.

#### Scenario: completed Delivery does not re-enter Finalize
- **WHEN** persisted Delivery state is `completed`
- **THEN** normal active lifecycle Policy MUST NOT return `delivery-finalize` behavior or Owner Finalize decision
- **AND** Delivery Final handoff MUST be obtained through its explicit read-only boundary
