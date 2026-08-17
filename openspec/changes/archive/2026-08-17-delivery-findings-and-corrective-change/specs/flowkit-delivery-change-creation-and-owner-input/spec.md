## ADDED Requirements

### Requirement: Owner corrective Change 必须复用 existing create change surface 并绑定 exact failed Finding occurrence

B1 MUST 复用现有 `flowkit create change --input <json> --source-ref <owner-ref>` Owner write-side，不新增 `authorize-corrective-change` decision、corrective-specific Formal Action/Run 或自动创建机制。

普通 Change create input 保持现有字段；新增可选 closed `corrective` object，精确包含 `findingId`、`authorizationRef` 与 `sourceResultRef`。当 current Policy 为 `blocked: full-test-failed` 时，create input MUST 携带 `corrective`，其三字段 MUST exact match current derived Full-Test Finding occurrence，且 new Change MUST `required=true`。当 current Delivery 不在 `full-test-failed` boundary 时，携带 `corrective` MUST fail closed，避免把普通 Change伪装成 corrective provenance。

`corrective` input MUST NOT接受 `summary`、severity、resolution或其它 Finding projection字段。Writer MUST 从 verified current result与 current authorization fact派生这些 persisted fields。成功 corrective create MUST 继续产生 ordinary `decision=create-change` Owner record；Finding historical projection只引用该 `ownerDecisionRef`、new `changeId`、current `authorizationRef` 与 Verification `sourceResultRef`，Owner record仍是 corrective decision authority。Operation MUST NOT自动 activate new Change、自动 retry Full Test、重开 historical Change、执行 Git boundary或创建 Run。

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
