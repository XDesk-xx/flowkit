## ADDED Requirements

### Requirement: full-test-failed Policy boundary 必须携带 exact current Finding occurrence 并在 corrective admission 后退出

当 current Delivery 有合法 failed Full Test result 时，Policy MUST 保持 `blocked: full-test-failed`，同时携带由 current result + current Full Test authorization fact确定性派生的 minimal Delivery Finding occurrence context，使 fresh process 能知道 exact `findingId/authorizationRef/sourceResultRef` 以供 Owner corrective create。Policy MUST NOT 自动创建 Change、自动 retry Full Test、自动 Finalize 或把 Finding prose解释成授权。

合法 corrective admission 原子完成后，raw `fullTestStatus=not-ready`、current terminal result 已退出 current authority且一个 ordinary required planned corrective Change 已存在；Policy MUST 因这些新 formal facts 退出 `full-test-failed` boundary，并继续使用既有 ordinary Change activation/lifecycle 与 A1 readiness/full-test authorization规则。Historical resolved occurrence—even with the same `sourceResultRef`—MUST NOT suppress or replace a later current occurrence with a different `authorizationRef`。

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
