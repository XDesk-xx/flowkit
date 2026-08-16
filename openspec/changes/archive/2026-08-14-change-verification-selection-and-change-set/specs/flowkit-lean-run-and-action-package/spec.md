## MODIFIED Requirements

### Requirement: B1 必须提供 bounded dual-entry 的唯一高层 Run preparation surface

B1 new execution preparation MUST 只暴露两个 Policy-owned intents：normal `next` 与 explicit unified `review`。Caller MUST NOT 直接指定 concrete Standard Action、NNN 或 Role。

对于 `intent=next`，service MUST 读取 fresh FormalFactSnapshot 并消费 shared `next(snapshot)`；只有结果为十个 Standard Change Actions 之一且当前不存在 pending Run 时，才能进入 new Run preparation。对于 `intent=review`，service MUST 读取 fresh snapshot 并调用 shared `resolveReview(snapshot)` / `canRun(review-S)` 等价 Policy admission，由 Policy 解析 concrete same-stage `review-S`；non-author blocker 下的 explicit direct re-review MUST 继续可创建新 Reviewer generation，且 MUST NOT 改变 blocked `next()`。

任一 new execution intent 遇到 pending Run MUST 返回 `exact-resume-required` 与 Core-derived persisted target identity，MUST NOT 隐式 resume、通过另一 intent 改选 Action 或分配新 NNN。pending continuation MUST 只通过 `resumeRun(expectedRunId)` 执行；该 API 不重新调用 Policy。两个 new intents 在无 pending 时共享同一 Core-only allocator/create path。

#### Scenario: normal next 创建 pending Run

- **WHEN** `intent=next` 且 shared `next()` 返回一个 Standard Change Action
- **AND** 当前不存在 pending Run
- **THEN** preparation MUST 通过 Delivery-wide allocator 产生下一 NNN
- **AND** MUST 创建对应 fixed ActionDefinition 的 pending Run

#### Scenario: non-author blocker 下 explicit direct re-review 仍可进入

- **WHEN** latest matching Review 为 `changes-requested` 且包含 owner/verification/external blocker
- **AND** shared `next()` 保持 blocked authority boundary
- **AND** caller 显式请求统一 `intent=review`
- **THEN** preparation MUST 通过 shared `resolveReview/canRun` 解析 same-stage `review-S`
- **AND** 无 pending Run 时 MUST 创建 new Reviewer generation / NNN
- **AND** MUST NOT 修改 `next()` 结果、要求 Author revision 或自动触发 review

#### Scenario: new preparation 遇到 pending Run

- **WHEN** `next` 或 `review` intent 解析到一个 legal Action，但 current Change 已存在 pending Run
- **THEN** preparation MUST 返回 `exact-resume-required` 与 persisted `expectedRunId`
- **AND** MUST NOT resume、terminalize、改选或分配另一个 Run

#### Scenario: caller 指定任意 concrete Action 不构成 authority

- **WHEN** adapter/CLI 试图直接请求 `action=apply` 或任意具体 `review-S`
- **THEN** high-level new execution boundary MUST 拒绝该 bypass
- **AND** caller 只能使用 bounded `next` / unified `review` intent

## ADDED Requirements

### Requirement: new preparation 与 exact Run resume 必须是不同入口

Core MUST 分离 Policy-selected new execution preparation 与 target-pinned resume。`resumeRun(expectedRunId)` MUST 只读取指定 persisted Run identity 并按同一 schema/package version 重建 entry package，MUST NOT 通过 `next`、`resolveReview` 或其它 Policy intent 选择 Action，也 MUST NOT 调用 allocator。

#### Scenario: exact pending Run 被恢复

- **WHEN** caller 使用 `expectedRunId` 请求恢复且指定 Run 仍 pending、Action/Role/fingerprint 全部匹配
- **THEN** Core MUST 为同一个 Run 重建 exact ActionPackage
- **AND** MUST NOT 创建其他 Run

#### Scenario: target 已 terminal

- **WHEN** exact retry 指向已 terminal Run
- **THEN** Core MUST 返回 persisted terminal state 或 exact idempotent replay outcome
- **AND** MUST NOT 调用 new preparation 或创建下一 Action generation

#### Scenario: target identity 不匹配

- **WHEN** requested Run missing、ambiguous，或 Action、Role、Delivery、Change、semantic fingerprint 不匹配
- **THEN** exact resume MUST fail closed

#### Scenario: pending Reviewer Run 只按 exact identity 恢复

- **WHEN** explicit `review` 已创建 pending same-stage Reviewer Run
- **AND** caller 需要继续该 execution
- **THEN** caller MUST 使用 persisted `expectedRunId` 调用 `resumeRun`
- **AND** MUST NOT 再次调用 `review` intent 创建或猜测另一个 Reviewer generation

### Requirement: timeout 必须表达 outcome-unknown

transport timeout、caller cancellation 或无法确认完整 process-tree termination 的外部命令 MUST 表达为 `outcome-unknown`。caller MUST inspect expected persisted Run before retry，且 MUST NOT 把 timeout 当作 writer 未执行或已停止的证明。

#### Scenario: writer 在 caller timeout 后晚完成

- **WHEN** caller timeout 后原 writer 将 expected Run terminalize
- **THEN** retry MUST 返回该 terminal state
- **AND** MUST NOT 创建下一 Reviewer 或 Author Run

### Requirement: terminal replay 必须 exact 且幂等

terminal admission MUST 绑定 exact persisted Run、ActionPackage 与 canonical logical descriptor。对需要 Core-owned post-action authority 的 Apply/revise-apply，admission MUST 按 `fresh post-action observation → deterministic verification.md publication → immutable verification-selection record atomic create → terminal result CAS-last` 执行。相同 Run 上 canonical logical descriptor 相同的重复提交 MUST 按 persisted publication state exact recovery 或返回既有 terminal state；descriptor、Role、Action、record 或 identity 不同的重复提交 MUST fail closed。

#### Scenario: concurrent callers 提交相同 terminal descriptor

- **WHEN** 多个 caller 对同一 pending Run 提交 canonical-equivalent terminal descriptor
- **THEN** 至多一个 writer MUST 发布 terminal result
- **AND** 其余 caller MUST 读取并返回同一 persisted terminal state

#### Scenario: record present 而 Run 仍 pending

- **WHEN** immutable verification-selection record 与 matching Markdown 已完整发布，但 producing Run 仍 pending
- **AND** exact replay 的 package 与 logical descriptor canonical-equivalent
- **THEN** admission MUST 校验既有 binding 后只执行 terminal CAS
- **AND** MUST NOT 重发或修改 record / Markdown

#### Scenario: completed terminal 缺失 post-action binding

- **WHEN** Apply/revise-apply Run 已存在 completed terminal result，但 required immutable record 缺失或 binding 不匹配
- **THEN** Reader/admission MUST fail closed 为 conflict
- **AND** MUST NOT 通过 terminal-time backfill 修复历史 terminal authority

### Requirement: ActionPackage v2 必须携带 typed declaration identity

new writer MUST 使用 ActionPackage v2 Action-discriminated closed union。`apply` / `revise-apply` variant MUST 保存 selected Action、approved Design source ResultRef/fingerprint 与 canonical ordered selectors；其他 Action variant MUST NOT 伪造 declaration。ActionPackage v1 MUST 保持原语义并由 explicit compatibility reader 处理，MUST NOT 静默获得 v2 declaration 语义。

#### Scenario: historical ActionPackage v1 被读取

- **WHEN** Reader 遇到 immutable ActionPackage v1
- **THEN** Reader MUST 按 v1 contract 读取
- **AND** MUST NOT 假定其包含 typed mutation declaration 或 exact retry fields

#### Scenario: context 与 ActionPackage version 不可交叉合成

- **WHEN** Reader/resume 处理 context v2/v3/v4 与 ActionPackage v1 historical identity，或 context v5 与 ActionPackage v2 current identity
- **THEN** MUST 使用对应同代 closed contract
- **AND** MUST NOT 从 v1/v2-v4 缺失字段合成 v2/v5 authority，也不得把 v5 context 降级为 v1 package

### Requirement: pending self-drift 必须基于 persisted entry identity

pending continuation MUST 从 persisted entry identity 恢复。declaration 覆盖的 Action-owned mutation MUST NOT 单独构成 self-drift；undeclared/unowned path、declaration source drift、applicable Owner/contract change 或其他 semantic input drift MUST fail closed。

#### Scenario: undeclared path 在 pending 期间变化

- **WHEN** post-entry workspace 出现 declaration 未覆盖的 path change
- **THEN** resume MUST 被拒绝为 semantic drift
- **AND** MUST NOT 通过扩大 declaration 或重写 context 恢复
