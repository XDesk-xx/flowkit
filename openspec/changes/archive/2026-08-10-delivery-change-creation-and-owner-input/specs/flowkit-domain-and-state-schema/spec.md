## ADDED Requirements

### Requirement: A1 creation 与 Owner provenance 必须有最小 typed domain contract

Domain MUST 为 Delivery create input、Change create input 与 Owner decision provenance 定义 provider-neutral TypeScript type/interface。Owner record MUST 至少表达 `ref`、typed decision、`deliveryId`、可选 canonical `changeId` 与 `sourceRef`；Change create input MUST 表达 `architectureImpact`，且 `dependsOn` 的元素语义 MUST 为 Change.id。Change-level `architectureImpact` MUST 同时存在于 persisted/read Change contract（`Change`、`ChangeSummary`、`ChangeFact` 或等价正式投影），不得只存在于 create DTO 后被丢弃。

#### Scenario: Change create input 使用 id dependency
- **WHEN** 构造 Change create input
- **THEN** `dependsOn` 每个值 MUST 被解释为同 Delivery Change.id
- **AND** MUST NOT 被解释为 Change.key

#### Scenario: Owner record 不包含 provider session
- **WHEN** 构造 Owner decision record
- **THEN** type MUST 不要求 Chat/Agent/provider session 字段
- **AND** `sourceRef` MUST 保持 provider-neutral opaque string

### Requirement: Change architectureImpact 必须可持久化并可恢复，pre-A1 missing 必须显式 unknown

A1 write-side 创建的每个 Delivery Manifest Change item MUST 保存 boolean `architectureImpact`，且 FormalFact/Domain read model MUST 原样投影该值。Delivery create 的 initial planned Changes 与后续 createChange MUST 使用同一字段语义；checkout/resume MUST 能从 source-controlled Manifest 恢复该事实。

对 Base `448fa042de86d07e893bcc51da528f93eb7ced3a` 已存在、并由 A1 Proposal 冻结 exact `(deliveryId, Change.id)` legacy identity set 的 pre-A1 Change，若 Manifest 缺少该字段，read model MAY 使用显式 `unknown / pre-a1-legacy-missing` 表达缺失事实；该状态 MUST NOT 等价于 `true` 或 `false`。不在 exact legacy set 的 Change 缺失/畸形 `architectureImpact` MUST fail closed。

#### Scenario: createChange 后恢复 architectureImpact
- **WHEN** Owner 创建 `architectureImpact=true` 的 planned Change
- **AND** repository 重新 checkout/resume 并读取 Delivery Manifest
- **THEN** Change read model 与 ChangeFact MUST 仍表达 `architectureImpact=true`
- **AND** MUST NOT 依赖 Run、聊天或 transient create input 才能恢复

#### Scenario: pre-A1 legacy missing 不猜 boolean
- **WHEN** exact legacy identity set 中的 Change item 没有 `architectureImpact`
- **THEN** Domain/FormalFact read model MUST 表达 explicit unknown/legacy-missing
- **AND** MUST NOT 投影为 `architectureImpact=true`
- **AND** MUST NOT 投影为 `architectureImpact=false`

#### Scenario: future Change missing fail closed
- **WHEN** A1 write-side 创建或管理的非 legacy Change 缺失 `architectureImpact`
- **THEN** schema/read validation MUST fail closed
- **AND** MUST NOT 通过 legacy compatibility
