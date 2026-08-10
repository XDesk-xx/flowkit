## ADDED Requirements

### Requirement: Reader 投影 current Explore 与 Verification artifact

FormalFactSnapshot 的 OpenSpec artifact projection MUST 支持 `change-explore` 与 `change-verification` 两种 artifact kind，并继续只表达 current canonical path 的存在性与路径。Reader MUST NOT 为此建立 artifact history registry，也 MUST NOT 从 historical ResultRef 重建当前路径。

#### Scenario: Explore artifact 存在
- **WHEN** active Change canonical path 存在 `explore.md`
- **THEN** `openSpecArtifacts` MUST 包含 kind=`change-explore`、对应 repository-relative path 且 exists=true 的 fact

#### Scenario: Verification artifact 存在
- **WHEN** active Change canonical path 存在 `verification.md`
- **THEN** `openSpecArtifacts` MUST 包含 kind=`change-verification`、对应 repository-relative path 且 exists=true 的 fact

#### Scenario: artifact 不存在只表达 current absence
- **WHEN** current canonical path 不存在目标 Explore 或 Verification artifact
- **THEN** 对应 fact MUST 表达 exists=false
- **AND** Reader MUST NOT 扫描 historical Run producedResultRefs 来寻找替代 current artifact

### Requirement: Change Verification status 从 verification.md 的最小 marker 投影

Active Change 的 `verification.md` MUST 使用单一机器可读 marker `<!-- flowkit-change-verification-status: <status> -->` 表达总体 Change Verification 状态，其中 `<status>` MUST 为 `not-run | passed | failed | not-applicable`。Reader MUST 从该 canonical Verification record 投影 `FormalFactSnapshot.changeVerificationStatus`，且只投影状态，不复制检查列表、日志或完整摘要。Verification record 仍是该事实 authority；Run 引用不得替代它。

#### Scenario: passed marker 投影为 passed
- **WHEN** active Change `verification.md` 包含唯一 marker `<!-- flowkit-change-verification-status: passed -->`
- **THEN** `snapshot.changeVerificationStatus` MUST 为 `passed`

#### Scenario: not-applicable marker 投影为 not-applicable
- **WHEN** active Change `verification.md` 包含唯一合法 `not-applicable` marker
- **THEN** `snapshot.changeVerificationStatus` MUST 为 `not-applicable`

#### Scenario: verification.md 尚不存在
- **WHEN** active Change current canonical path 尚无 `verification.md`
- **THEN** `snapshot.changeVerificationStatus` MUST 为 undefined
- **AND** MUST NOT 产生仅由“尚未执行 Verification”导致的 FactConflict

#### Scenario: verification.md 存在但 marker 缺失
- **WHEN** active Change `verification.md` 已存在但没有 status marker
- **THEN** Reader MUST 收集 `change-verification-status` FactConflict
- **AND** MUST NOT 从正文、Run、聊天或文件名猜测状态

#### Scenario: marker 重复或状态非法
- **WHEN** active Change `verification.md` 包含多个 status marker或 marker 值不属于 VerificationStatus
- **THEN** Reader MUST 收集 `change-verification-status` FactConflict
- **AND** MUST NOT 自动选择任一值

#### Scenario: Run verificationSummaryRef 不替代 marker authority
- **WHEN** historical Run result 引用了 `verification.md`
- **AND** current `verification.md` status marker 与历史摘要不同
- **THEN** current Change Verification status MUST 以 current canonical `verification.md` marker 为准
- **AND** historical ResultRef 仍只保持 point-in-time 语义

### Requirement: Active Change Tasks completion 从 canonical tasks.md 最小投影

Reader MUST 只从当前 active Change canonical `tasks.md` 投影 `FormalFactSnapshot.changeTasksComplete?: boolean`。该字段 MUST 只表达 required Markdown task checkbox 是否全部完成，不得携带 task registry、task owner、task execution history 或第二套 Task 状态。`tasks.md` 不存在时 completion fact MUST 为 undefined；存在时，任一 required `[ ]` task MUST 投影为 false，全部 required task 为 `[x]/[X]` MUST 投影为 true；没有 required checkbox 时 MUST 按空集合全部完成投影为 true。

#### Scenario: 所有 required tasks 已完成
- **WHEN** active Change `tasks.md` 中所有 required task checkbox 均为 `[x]` 或 `[X]`
- **THEN** `snapshot.changeTasksComplete` MUST 为 true

#### Scenario: 仍有 required task 未完成
- **WHEN** active Change `tasks.md` 至少包含一个 `[ ]` required task
- **THEN** `snapshot.changeTasksComplete` MUST 为 false

#### Scenario: tasks.md 不存在
- **WHEN** active Change canonical path 不存在 `tasks.md`
- **THEN** `snapshot.changeTasksComplete` MUST 为 undefined
- **AND** Reader MUST NOT 从 Run、聊天、Verification record 或 artifact existence 推断 completion

#### Scenario: 不建立第二套 Tasks authority
- **WHEN** Reader 投影 Tasks completion
- **THEN** MUST NOT 创建 Task Registry、Task 状态数据库或 Task execution engine
- **AND** `tasks.md` MUST 保持 current required Tasks 的唯一 OpenSpec authority
