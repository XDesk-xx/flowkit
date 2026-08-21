## MODIFIED Requirements

### Requirement: Delivery-level Action 前置条件

Standard `canRun` MUST NOT 接受 `full-test` 或 `delivery-finalize`，因为二者不再是 Standard Formal Action。A1 MUST实现 Owner-authorized Delivery Full Test 的 machine behavior boundary；Delivery Finalize 仍后置到 F1。Policy 的 no-active-change 分支 MUST消费 current effective `fullTestStatus` 与 Owner authorization 做 deterministic transition，但不得把 Delivery behavior 伪装为 Action/Run。

After E1, architecture finalization remains Delivery behavior/Owner decisions outside the Standard Change Action catalog. For `architecture.impact=true`, Full Test passed MUST NOT directly qualify Finalize until a current Actual/Compare cycle exists and explicit Owner architecture acceptance is current.

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

- **WHEN** 无 active Change且所有 required Changes completed/checkpointed
- **AND** `deliveryFullTestStatus=passed`
- **AND** Owner finalize authorization 已存在
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
- **THEN** Policy MAY proceed to existing `authorize-delivery-finalize` boundary

### Requirement: full-test-failed Policy boundary 必须携带 exact current Finding occurrence 并在 corrective admission 后退出

当 current Delivery 有合法 failed Full Test result 时，Policy MUST 保持 `blocked: full-test-failed`，同时携带由 current result + current Full Test authorization fact确定性派生的 minimal Delivery Finding occurrence context，使 fresh process 能知道 exact `findingId/authorizationRef/sourceResultRef` 以供 Owner corrective create。Policy MUST NOT 自动创建 Change、自动 retry Full Test、自动 Finalize 或把 Finding prose解释成授权。

合法 corrective admission 原子完成后，raw `fullTestStatus=not-ready`、current terminal result 已退出 current authority且一个 ordinary required planned corrective Change 已存在；Policy MUST 因这些新 formal facts 退出 `full-test-failed` boundary，并继续使用既有 ordinary Change activation/lifecycle 与 A1 readiness/full-test authorization规则。Historical resolved occurrence—even with the same `sourceResultRef`—MUST NOT suppress or replace a later current occurrence with a different `authorizationRef`。

E1 architecture non-acceptance MUST remain separate from this failed boundary. A passed Full Test with an awaiting architecture cycle MUST NOT be projected as `full-test-failed` or consume Full-Test-failure Finding authority.

#### Scenario: failed boundary 暴露 current Finding occurrence context
- **WHEN** snapshot 有唯一合法 current failed Full Test result与 current authorization fact
- **THEN** `next/diagnose` MUST 返回 `blocked: full-test-failed`
- **AND** blocked context MUST 包含 exact derived `findingId`、`authorizationRef` 与 `sourceResultRef`
- **AND** owner actions MUST 继续只表示 corrective Change 或 cancel Delivery 的合法选择
- **AND** MUST NOT 自动执行任一 Owner choice

#### Scenario: 相同 sourceResultRef 的新 occurrence 不被历史 resolution 吞掉
- **WHEN** historical resolved Finding引用 `sourceResultRef=R`
- **AND** current failed result仍为 `R` 但 current `authorizationRef` 是新的 Owner fact
- **THEN** Policy MUST 暴露一个新的 current `findingId`
- **AND** MUST NOT把历史 occurrence的 resolution解释为 current failure已消费

#### Scenario: corrective admission 后不再停留 full-test-failed
- **WHEN** exact current failed result occurrence已通过合法 Owner corrective create 被消费
- **AND** raw `fullTestStatus=not-ready`
- **AND** current `verification.fullTest.result` 不存在
- **AND** new required corrective Change 为 `planned`
- **THEN** Policy MUST NOT 再返回 `blocked: full-test-failed`
- **AND** MUST 按既有 dependency/activation规则推进 ordinary corrective Change

#### Scenario: correction checkpoint 后 fresh authorization gate 恢复
- **WHEN** corrective Change completed + matching checkpointed
- **AND** 所有 required Changes completed/checkpointed且 formal conflicts=0
- **THEN** A1 readiness projection MUST 得到 `awaiting-user-decision`
- **AND** Policy MUST 请求新的 `authorize-full-test`
- **AND** MUST NOT 因历史 `authorize-full-test` record 自动返回 executable Full Test behavior

#### Scenario: architecture non-acceptance uses architecture gate not failure Finding
- **WHEN** Full Test is passed and current architecture cycle awaits Owner acceptance
- **THEN** Policy MUST NOT return `full-test-failed`
- **AND** any remediation create-change handoff MUST bind the architecture cycle rather than a Full Test Finding occurrence
