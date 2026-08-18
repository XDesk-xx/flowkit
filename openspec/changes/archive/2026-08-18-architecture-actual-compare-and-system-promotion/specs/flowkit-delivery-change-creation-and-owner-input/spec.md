## MODIFIED Requirements

### Requirement: Authorization-only Owner record 必须匹配 current Policy gate

`flowkit owner record` 对 `authorize-apply`、`authorize-archive`、`authorize-checkpoint`、`authorize-full-test`、`authorize-delivery-finalize` 的持久化，MUST 在任何 Manifest mutation 前重新读取 current formal facts 并执行 current Policy。只有当 current Policy 正在请求完全相同的 Owner decision，且 canonical target 与 record target 完全一致时，record 才 MAY 被写入；否则 operation MUST fail closed 且 Manifest MUST 保持不变。

对于 exact current Delivery 的 `authorize-full-test`，当 Policy gate 基于 pure readiness projection 请求该 decision 时，write-side MUST 在同一次 atomic Manifest publication 中追加 deterministic Owner record 并把 persisted raw `delivery.fullTestStatus` 从 `not-ready|awaiting-user-decision` 更新为 `authorized`。该 publication 只关闭 authorization gate，MUST NOT 执行 Full Test。其它 authorization-only decision 继续只持久化其既有 bounded authority facts。

A1 MUST NOT 把“未来可能需要该 authorization”当作 admission 条件，也 MUST NOT 建立 generic authority-resolution tracking。create/activate provenance 仍由对应 mutation command 在其自身合法 boundary 内原子记录，不通过 standalone `owner record` 预写。

E1 MUST add `accept-architecture` to the bounded current-gate Owner record surface. The write-side MUST derive and bind the current architecture cycle and atomically publish acceptance plus accepted system source; callers MUST NOT inject arbitrary/stale cycle identity as acceptance authority.

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

#### Scenario: accept-architecture binds current cycle
- **WHEN** current Policy requests `accept-architecture` for a non-accepted current architecture cycle
- **AND** Owner explicitly records the decision with a sourceRef
- **THEN** the Owner record MUST bind that exact cycleRef through canonical `architectureCycleRef` provenance
- **AND** current cycle MUST become accepted
- **AND** acceptedSystemSource MUST be published from the same exact Actual/Compare evidence

#### Scenario: early or stale acceptance is rejected
- **WHEN** there is no current non-accepted architecture cycle or Policy is not requesting `accept-architecture`
- **THEN** Owner acceptance admission MUST fail closed without mutating Manifest bytes

### Requirement: Owner corrective Change 必须复用 existing create change surface 并绑定 exact failed Finding occurrence

B1 MUST 复用现有 `flowkit create change --input <json> --source-ref <owner-ref>` Owner write-side，不新增 `authorize-corrective-change` decision、corrective-specific Formal Action/Run 或自动创建机制。

普通 Change create input 保持现有字段；新增可选 closed `corrective` object，精确包含 `findingId`、`authorizationRef` 与 `sourceResultRef`。当 current Policy 为 `blocked: full-test-failed` 时，create input MUST 携带 `corrective`，其三字段 MUST exact match current derived Full-Test Finding occurrence，且 new Change MUST `required=true`。当 current Delivery 不在 `full-test-failed` boundary 时，携带 `corrective` MUST fail closed，避免把普通 Change伪装成 corrective provenance。

`corrective` input MUST NOT接受 `summary`、severity、resolution或其它 Finding projection字段。Writer MUST 从 verified current result与 current authorization fact派生这些 persisted fields。成功 corrective create MUST 继续产生 ordinary `decision=create-change` Owner record；Finding historical projection只引用该 `ownerDecisionRef`、new `changeId`、current `authorizationRef` 与 Verification `sourceResultRef`，Owner record仍是 corrective decision authority。Operation MUST NOT自动 activate new Change、自动 retry Full Test、重开 historical Change、执行 Git boundary或创建 Run。

E1 post-pass architecture remediation MAY reuse the same create-change operator only as a separate mutually-exclusive binding. It MUST NOT reinterpret B1 Full-Test-failed Finding/corrective authority.

#### Scenario: Owner 用现有 create change 创建 bounded corrective Change
- **WHEN** current Policy 为 `blocked: full-test-failed`
- **AND** Owner 提供合法 ordinary required Change input、non-empty sourceRef 与 exact current `corrective.findingId/authorizationRef/sourceResultRef`
- **THEN** Flowkit MUST 原子创建该 `state=planned` Change并记录 ordinary `create-change` Owner record
- **AND** MUST 同步完成 B1 occurrence-aware failure consumption/reset contract
- **AND** MUST NOT自动 activate 或执行新 Change

#### Scenario: failed boundary 缺少 corrective binding 拒绝普通 create
- **WHEN** current Policy 为 `blocked: full-test-failed`
- **AND** Owner 调用 `create change` 但 input 缺少 `corrective`
- **THEN** operation MUST fail closed
- **AND** MUST NOT创建 Change、Owner record或修改 Full Test facts

#### Scenario: stale 或伪造 corrective occurrence binding 拒绝
- **WHEN** supplied `corrective.findingId`、`authorizationRef` 或 `sourceResultRef` 任一不等于 current derived Finding occurrence
- **THEN** operation MUST fail closed
- **AND** Manifest MUST保持不变

#### Scenario: caller 不能注入 Finding summary
- **WHEN** corrective create input试图携带 `summary` 或其它未冻结 projection字段
- **THEN** closed input schema MUST reject该 input
- **AND** any persisted historical summary MUST only be derived from verified source result

#### Scenario: 非 failed boundary 不接受 corrective marker
- **WHEN** current Delivery 不在 `full-test-failed` boundary
- **AND** create input 携带 `corrective`
- **THEN** operation MUST fail closed
- **AND** ordinary create semantics MUST 继续要求无 corrective marker

#### Scenario: architecture remediation does not impersonate Full-Test-failed correction
- **WHEN** raw Full Test is `passed` and current architecture cycle awaits Owner acceptance
- **THEN** `change.corrective` MUST NOT be accepted as architecture remediation
- **AND** no Full-Test-failed Finding MUST be created or consumed

## ADDED Requirements

### Requirement: post-pass architecture remediation 必须 exact-bind current cycle 并原子失效 stale qualification
At a passed Full Test + non-accepted current architecture cycle boundary, a required new Change MUST carry `architectureRemediation.cycleRef` matching the exact current cycle. That cycle MUST bind the current delivery-scoped `authorize-full-test` Owner ref plus current technical Full Test resultRef; callers MUST NOT inject or override the authorization occurrence. Missing/stale/mismatched binding MUST fail closed before mutation. Successful admission MUST atomically append the planned Change and Owner provenance, remove current Full Test result, set raw Full Test `passed → not-ready`, and remove current architecture cycle.

#### Scenario: exact remediation binding re-enters fresh Full Test lifecycle
- **WHEN** Owner creates a required Change with the exact current architecture remediation cycleRef
- **THEN** the new Change MUST be planned
- **AND** old current Full Test result/current architecture cycle MUST no longer be current
- **AND** after normal Change completion+checkpoint readiness MUST project `awaiting-user-decision`
- **AND** fresh Owner `authorize-full-test` MUST be required before another Actual/Compare cycle

#### Scenario: stale remediation binding cannot mutate repository facts
- **WHEN** architectureRemediation cycleRef does not equal the current non-accepted cycle, including when it names a prior cycle from an earlier Full Test authorization occurrence
- **THEN** create-change MUST fail closed before any Manifest mutation
