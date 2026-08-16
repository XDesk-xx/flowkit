## ADDED Requirements

### Requirement: Reader 必须验证并投影 bounded current Contract Reset facts

FormalFactReader MUST从 Delivery Manifest `ownerDecisions`验证 `contract-reset` structured records、deterministic ref、Delivery/Change target、scope与 requiredOutcomes。Malformed/unknown/cross-Change records MUST产生 FactConflict。对于每个 `(deliveryId, changeId, scope)`，Reader MUST只投影 latest valid Contract Reset作为 current bounded Owner fact，同时保留既有 `ownerAuthorizations` projection供 Policy authorization gates使用。

Run `ownerAuthorization`、context owner projection或聊天文字 MUST NOT创建新的 Owner fact。

#### Scenario: latest same-scope Reset 被投影
- **WHEN**同一 active Change/scope存在两条 valid Contract Reset records
- **THEN** Reader MUST把 Manifest 中 latest valid record投影为 current Contract Reset
- **AND** earlier record MUST NOT作为 current Action semantic fact重复投影

#### Scenario: context projection 不反向升级 authority
- **WHEN**历史或 current `context.json` 含 `ownerFactRefs`
- **BUT** Manifest不存在对应 valid Owner record
- **THEN** Reader MUST NOT由 context创造 Owner authority

### Requirement: current context.json 必须携带 bounded applicable Owner fact projection

D1之后新创建的 current Standard Run context MUST使用 `schemaVersion: 3`，并 MAY携带 machine-owned `ownerFactRefs`，每项仅保存 current Action applicable Contract Reset 的 bounded verified projection：`ref / decision / deliveryId / changeId / scope / requiredOutcomes / sourceRef`。

`ownerFactRefs` MUST是 execution input projection而不是 Owner authority store；其内容 MUST能从 current Manifest formal facts重新验证。Historical context schemaVersion 1/2 MUST继续 read-only compatibility，D1 MUST NOT迁移重写 completed Run context。

#### Scenario: detached Reviewer reload Owner fact
- **WHEN** Reviewer在新的 detached session读取一个 D1之后准备的 Run context
- **AND** Manifest含 matching current Contract Reset
- **THEN** context MUST提供 bounded ownerFactRefs以支持 handoff
- **AND** Reader MUST仍以 Manifest record作为 authority validation source

### Requirement: Review Result persistence 必须支持 versioned Finding v2 与 convergence

RunResultFile MUST允许 D1 `reviewFindingSchemaVersion: 2`、complete `reviewFindings` 与 `reviewFindingConvergence` closed fields，并在 terminal publish前验证 Finding v2、ID uniqueness、verdict integrity与 convergence关系。D1之后新 completed `review-*` writer MUST写 version 2。

缺少 `reviewFindingSchemaVersion` 的 existing Q1 transitional Review Result MUST继续使用现有 v1 shape read-only admission；D1 MUST NOT用新 writer继续创建 unversioned v1 findings。

#### Scenario: existing transitional Reviewer Result 仍可读取
- **WHEN** repository包含 D1 Apply之前已完成且无 finding schema version 的 review Run
- **THEN** Reader MUST继续读取其 verdict/blockingAuthority transitional facts
- **AND** MUST NOT要求修改该 completed result.json

#### Scenario: new Review 必须写 v2
- **WHEN** D1 implementation生效后新的 `review-*` terminal result被提交
- **THEN** Core writer MUST输出 `reviewFindingSchemaVersion: 2`
- **AND** MUST拒绝新写 transitional `requiredChange`-only finding

### Requirement: Reader 必须重建 reset-aware current Review 与近邻 convergence authority

Reader MUST以 reviewed producer binding、Run prepared Contract Reset identity与 current Manifest Reset identity共同判断 Review 是否仍是 current lifecycle Review。只有 identity匹配的 current Review verdict/blockingAuthorities可以进入 Policy projection；mismatch 的 completed Review继续保留历史事实但不得继续充当 current approval。

Finding full payload与 convergence relationship MUST保持 Reviewer Result-owned；FormalFactSnapshot MAY提供 B1/Reviewer handoff所需的 bounded exact refs/identity，但 MUST NOT复制 evidence corpus为 Policy state。previous convergence baseline MUST由 actual producer/review lineage解析，不得仅按同 stage latest completed Review扫描。

#### Scenario: resolved finding 不继续阻塞 Policy
- **WHEN** previous Review有 blocking finding
- **AND** latest matching Review v2将其 convergence标记 resolved且 current findings已无该 blocker
- **THEN** Policy projection MUST使用 latest Review current blockingAuthorities
- **AND** MUST NOT因 previous blocker历史存在继续阻塞

#### Scenario: approved Review 遇到新 Reset 后不再 current
- **WHEN** completed `review-propose` approved producer P1
- **AND** P1/R1 prepared Contract Reset identity为 CR1
- **AND** current Manifest同 scope Reset已变为 CR2
- **THEN** Reader MUST仍读取 P1/R1为completed history
- **BUT** MUST NOT把 R1 approval投影为 current propose-stage approval

#### Scenario: legacy context 不被回填
- **WHEN** historical completed Run context schemaVersion为1/2且没有 `ownerFactRefs`
- **THEN** D1 migration MUST NOT重写或合成其 historical Owner binding
- **AND**在没有 current structured Contract Reset时继续使用既有 legacy lifecycle规则
