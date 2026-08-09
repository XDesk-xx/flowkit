## MODIFIED Requirements

### Requirement: Verification 事实不可用时 blocked

`FormalFactSnapshot` MAY 携带 active Change 的 `changeVerificationStatus`。D1 对 verification-gated actions（`review-apply`、`archive`）MUST 只从该 Snapshot fact 读取 Verification status，MUST NOT 从 Run 历史、OpenSpec artifact existence、Verification 正文自由文本或聊天历史推断状态。`changeVerificationStatus` 缺失时 MUST 返回 `blocked: verification-facts-unavailable`；`failed` 与 `not-run` MUST 分别映射为 `verification-failed` 与 `verification-not-run`；`passed` 或 `not-applicable` MUST 满足既有 Verification gate。该修改只接通 D1 已冻结的 status-aware gate，不改变其业务语义。

#### Scenario: Verification 事实不可用时 review-apply blocked

- **WHEN** apply 阶段 Current Artifact Run ≠ null
- **AND** Change Verification 事实不可用（snapshot.changeVerificationStatus 缺失）
- **THEN** `next` MUST 返回 `{ kind: 'blocked', diagnosis: { reason: 'verification-facts-unavailable' } }`
- **AND** `canRun(snapshot, 'review-apply')` MUST 返回 `allowed: false` 且 `unmetPreconditions` 包含 `verification-facts-unavailable`

#### Scenario: Verification 事实不可用时 archive blocked

- **WHEN** apply 阶段 lineage match + approved
- **AND** Change Verification 事实不可用
- **THEN** `next` MUST 返回 `blocked: verification-facts-unavailable`
- **AND** `canRun(snapshot, 'archive')` MUST 返回 `allowed: false`

#### Scenario: 不从 Run 历史推断 Verification

- **WHEN** Policy 计算 verification-gated action 的前置条件
- **AND** snapshot 无 `changeVerificationStatus`
- **THEN** MUST NOT 从 Run 历史推断 Verification status
- **AND** MUST NOT 从 OpenSpec 产物存在性或 Verification 正文自由文本推断 Verification status
- **AND** MUST NOT 从聊天历史或 `.tmp` 推断任何正式事实

#### Scenario: verification-facts-unavailable 与 verification-failed 区分

- **WHEN** 生成 blocked diagnosis
- **AND** Verification 事实不可用
- **THEN** reason MUST 为 `verification-facts-unavailable`
- **AND** MUST NOT 为 `verification-failed` 或 `verification-not-run`
- **AND** `verification-failed` 和 `verification-not-run` MUST 仅在事实可用但结果不通过时适用

#### Scenario: passed 或 not-applicable 满足既有 gate

- **WHEN** `snapshot.changeVerificationStatus` 为 `passed` 或 `not-applicable`
- **THEN** Verification gate MUST 为 satisfied
- **AND** `canRun` / `next` MUST 继续评估该 Action 的其他冻结前置条件

#### Scenario: failed 与 not-run 保持 distinct blocked reason

- **WHEN** `snapshot.changeVerificationStatus=failed`
- **THEN** Verification gate MUST blocked 为 `verification-failed`
- **WHEN** `snapshot.changeVerificationStatus=not-run`
- **THEN** Verification gate MUST blocked 为 `verification-not-run`


## ADDED Requirements

### Requirement: Tasks completion fact 接通既有 Archive gate

Policy MUST 从 `FormalFactSnapshot.changeTasksComplete` 消费当前 active Change 的最小 Tasks completion fact，并保留 D1 已冻结的 Archive 前置条件：事实不可用不得 Archive，required tasks 未全部完成不得 Archive，全部完成后才继续评估 archive owner authorization。Policy MUST NOT 从 Run 历史、OpenSpec artifact existence、Verification 正文或聊天推断 Tasks completion。

#### Scenario: Tasks completion fact 不可用
- **WHEN** apply lineage match + approved 且 Verification gate satisfied
- **AND** `snapshot.changeTasksComplete` 为 undefined
- **THEN** `next` MUST 返回 `blocked: tasks-facts-unavailable`
- **AND** `canRun(snapshot, 'archive')` MUST 为 `allowed: false` 且包含 `tasks-facts-unavailable`

#### Scenario: Required Tasks 未完成
- **WHEN** apply lineage match + approved 且 Verification gate satisfied
- **AND** `snapshot.changeTasksComplete=false`
- **THEN** `next` MUST 返回 `blocked: tasks-incomplete`
- **AND** `canRun(snapshot, 'archive')` MUST 为 `allowed: false` 且包含 `tasks-incomplete`
- **AND** MUST NOT 把该状态误报为 `tasks-facts-unavailable`

#### Scenario: Required Tasks 全部完成
- **WHEN** apply lineage match + approved 且 Verification gate satisfied
- **AND** `snapshot.changeTasksComplete=true`
- **THEN** Tasks gate MUST satisfied
- **AND** 若无 archive authorization，`next` MUST 进入 `owner-decision: authorize-archive`
- **AND** 若已有 archive authorization，`canRun(snapshot, 'archive')` MUST 允许继续执行 archive

#### Scenario: tasks-incomplete 不是新 lifecycle state
- **WHEN** Policy 返回 `tasks-incomplete`
- **THEN** 它 MUST 仅作为 blocked diagnosis / unmet precondition
- **AND** MUST NOT 新增 Task state machine、Action 或 registry
