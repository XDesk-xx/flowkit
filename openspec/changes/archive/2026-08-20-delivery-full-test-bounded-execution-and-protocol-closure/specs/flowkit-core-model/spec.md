## MODIFIED Requirements

### Requirement: Full Test 必须使用 Delivery 验证子状态

`fullTestStatus` MUST 为 `not-ready | awaiting-user-decision | authorized | passed | failed`。

它 MUST 属于 Flowkit 拥有的 Delivery 验证子状态，MUST NOT 成为 Delivery 主状态。项目 Verification capability MUST 继续拥有 logical check解释、physical target resolver/aggregation与技术检查结果；Flowkit Delivery lifecycle 只拥有 readiness/effective projection、Owner authorization binding、execution safety block 与 minimal terminal result projection。Delivery Full Test MUST 是 Owner-authorized Delivery verification behavior，MUST NOT 是 Standard Formal Action、Standard Run、Action Package 或 Delivery-wide NNN consumer。

`awaiting-user-decision` MAY 是由 current repository formal facts 纯推导出的 effective projection：当 persisted `delivery.fullTestStatus=not-ready`，但所有 required Changes 已 completed、matching Change Checkpoints 已存在、formal conflicts=0 且 current Delivery 的 typed executable Full Test contract 合法可用时，current effective Full Test status MUST 为 `awaiting-user-decision`。该 projection MUST NOT 通过 `status`、`next`、`doctor` 或 `resume-context` 写回 Manifest。

For architecture-impacting Deliveries after E1, a passed Full Test qualifies only the exact current architecture cycle derived from the delivery-scoped Owner authorization occurrence plus that passed technical result. A legal post-pass architecture remediation MUST invalidate the old passed qualification before new required work proceeds.

For `kind=bounded-command-plan`, one logical Full Test MAY execute multiple physical targets without creating additional Full Test authority/Run/attempt identity. Each actual spawned child MUST own an independent bounded timeout/process-tree outcome; the in-process orchestrator MUST NOT itself be wrapped in another global 120s child budget. `checks[]` remains logical check authority; physical target diagnostics are execution detail.

Physical target duration means one child wall duration；logical check duration means first target start through logical terminal/fail-fast；`totalDurationMs` means whole logical orchestration wall duration and need not equal the sum of logical durations.

When a new `required=true` Change is lawfully created while raw Full Test status is `authorized` and no outcome-unknown block exists, the old authorization MUST lose qualification in the same atomic write and raw status MUST become `not-ready`; historical Owner authorization remains immutable provenance. An `outcome-unknown` executionBlock MUST prevent ordinary Change create/activate until credibly resolved.

#### Scenario: Owner 授权 Full Test

- **WHEN** current effective `fullTestStatus=awaiting-user-decision`
- **AND** owner 明确授权 exact current Delivery 的 `authorize-full-test`
- **THEN** Owner authority record 与 persisted `delivery.fullTestStatus=authorized` MUST 在同一次 atomic Manifest publication 中形成
- **AND** MUST NOT 因授权本身执行 Full Test
- **AND** MUST NOT 创建 `full-test` Standard Run

#### Scenario: Delivery Ready 纯投影 awaiting-user-decision

- **WHEN** persisted `delivery.fullTestStatus=not-ready`
- **AND** 所有 required Changes 已 completed
- **AND** 所有 required Change Checkpoints 已由 Git authority 接纳
- **AND** current formal conflicts=0
- **AND** current Delivery 的 typed executable Full Test contract 合法可用
- **THEN** current effective `fullTestStatus` MUST 投影为 `awaiting-user-decision`
- **AND** diagnostic/Policy read path MUST NOT 修改 Manifest bytes

#### Scenario: authorized 返回非 Action Delivery behavior

- **WHEN** current persisted/effective `fullTestStatus=authorized`
- **AND** matching delivery-scoped Owner authorization 已存在
- **THEN** Policy MUST 暴露唯一 `delivery-behavior: full-test` boundary
- **AND** MUST NOT 返回 `action: full-test`
- **AND** Standard `canRun` MUST NOT 接受 `full-test`

#### Scenario: Q1 后 03 前 authorized 状态 fail-closed

- **WHEN** bounded historical/pre-A1 repository facts显示 `fullTestStatus=authorized`
- **AND** current readable snapshot缺少 A1 executable Full Test binding或对应 Delivery behavior executor尚不可用
- **THEN** Policy MUST保持 deterministic/fail-closed
- **AND** MUST NOT把该 historical gap 解释为 `action: full-test`、Standard Run 或 fabricated terminal result

#### Scenario: authorized crash 可 bounded re-entry

- **WHEN** Full Test 从 `authorized` 开始执行
- **AND** child checks 期间进程中断，或 checks 已完成但 terminal result 尚未 atomic publish
- **THEN** durable lifecycle authority MUST 保持 `authorized`
- **AND** 只有 prior child/process tree 已被证明 terminal 时 fresh process 才 MAY 从同一 persisted executable Full Test contract 起点重新执行
- **AND** ignored/generated `dist/**`、stdout/stderr、partial timing 或 previous successful child process MUST NOT 被解释为 current terminal Full Test authority

#### Scenario: Windows outcome-unknown 禁止重入

- **WHEN** authorized Full Test timeout
- **AND** owned Windows whole-process-tree cancellation 无法证明 prior tree terminal
- **THEN** raw `fullTestStatus` MUST 保持 `authorized`
- **AND** Flowkit MUST 持久化 current `executionBlock.reason=outcome-unknown`
- **AND** MUST NOT 发布 Verification `failed`/`resultRef`
- **AND** 在 block 被显式、可信地关闭前 MUST NOT 开始新的 Full Test attempt

#### Scenario: transport failure 不冒充 Verification failed

- **WHEN** Full Test 发生 spawn failure、proven timed-out-cancelled、bounded resolver/coverage closure error、missing/malformed/stale/mismatched legacy protocol、bounded aggregation semantic error或 child/protocol disagreement
- **THEN** Flowkit MUST NOT 生成 `verification:full-test:<hash>`
- **AND** MUST NOT 把 lifecycle status 改成 `failed`
- **AND** process 已证明 terminal 的 failure MAY 保持 `authorized` 供后续显式重入

#### Scenario: Full Test terminal result 原子发布

- **WHEN** current persisted Full Test execution contract完成其合法 execution shape
- **AND** `kind=command` 已满足 existing child/protocol coherence，或 `kind=bounded-command-plan` 已由 Verification aggregator产生相对 frozen logical plan合法的 PASS/FAILED payload
- **THEN** Flowkit MUST 将 effective/persisted `fullTestStatus` 原子更新为 `passed` 或 `failed`
- **AND** MUST 同步持久化 `schemaVersion/status/summary/totalDurationMs/checks[{id,status,durationMs}]/resultRef`
- **AND** `resultRef` MUST 由排除自身后的固定字段顺序 canonical JSON payload 做 SHA-256 得出
- **AND** raw stdout/stderr MUST NOT 被复制进 Standard Run 或 Manifest evidence corpus

#### Scenario: post-pass architecture remediation invalidates qualification
- **WHEN** a required architecture-remediation Change is admitted against the exact current non-accepted architecture cycle
- **THEN** raw Full Test status MUST leave `passed`
- **AND** the old current Full Test result MUST cease to qualify the Delivery
- **AND** a fresh Full Test authorization/result MUST be required after remediation checkpoint


#### Scenario: bounded logical authority can outlive a single child budget
- **WHEN** one bounded Full Test logical check resolves multiple physical targets
- **THEN** each spawned target MUST have its own persisted per-target timeout semantics
- **AND** total logical/Full Test wall time MAY exceed one target timeout without timeout inflation
- **AND** no extra Full Test Run/attempt authority is created

#### Scenario: required work invalidates authorized candidate
- **WHEN** raw Full Test status is `authorized` without outcome-unknown block
- **AND** Owner lawfully creates a new required Change
- **THEN** raw status MUST atomically become `not-ready` with that create publication
- **AND** a fresh authorization MUST be required after the new Change checkpoint
