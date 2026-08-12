## ADDED Requirements

### Requirement: Contract Reset 必须复用 Manifest ownerDecisions 并使用 structured semantics

Flowkit MUST在现有 Delivery Manifest `ownerDecisions` authority store中支持 bounded `decision=contract-reset` record。该 record MUST是 active Change-scoped，并至少包含 deterministic `ref`、`decision`、`deliveryId`、canonical `changeId`、non-empty `scope`、non-empty unique `requiredOutcomes[]` 与 opaque `sourceRef`。

`sourceRef` MUST只作为 provenance locator；Contract Reset 的 scope/required outcome MUST由 structured fields表达，MUST NOT通过 sourceRef命名、Run prose、聊天摘要或 Reviewer interpretation推断。Flowkit MUST NOT为 Contract Reset建立第二 Decision DB、Approval Registry、authority event ledger或 chat transcript store。

#### Scenario: structured Contract Reset admission
- **WHEN** Delivery与 target Change均 active、formal facts无 conflict
- **AND** Owner独立明确输入 target scope、requiredOutcomes与 sourceRef
- **THEN** Flowkit MAY把 bounded `contract-reset` record追加到 existing `ownerDecisions`
- **AND** MUST NOT自动创建 Run、修改 Proposal、推进 lifecycle或执行下一 Action

#### Scenario: sourceRef 不能替代语义字段
- **WHEN** caller只提供一个名称暗示 required outcome 的 sourceRef
- **BUT**没有 structured scope/requiredOutcomes
- **THEN** Contract Reset admission MUST fail closed

### Requirement: Contract Reset ref 必须 deterministic、idempotent 且限定 current scope

`contract-reset` ref MUST从 normalized canonical tuple派生：`decision + deliveryId + changeId + scope + sorted(unique(requiredOutcomes)) + sourceRef`。完全相同 normalized tuple重试 MUST返回同一 ref且不得追加第二条语义重复 record。

对于同一 `(deliveryId, changeId, scope)`，Manifest append order中的 latest valid Contract Reset MUST是 current applicable reset；更早 record只保留历史 provenance，不再作为 current package semantic fact。该规则 MUST只服务 bounded active Change Contract Reset，不得扩展成 generic generation-management framework。

#### Scenario: 同 scope 新 Reset supersede current projection
- **WHEN**同一 active Change/scope 已有一个 valid Contract Reset
- **AND** Owner随后明确记录新的 structured Contract Reset
- **THEN**两条 records MAY都保留在 Manifest历史中
- **AND** Reader/current Action handoff MUST只把 latest valid record作为该 scope current fact

#### Scenario: 相同 Reset 重试幂等
- **WHEN** normalized decision tuple完全相同
- **THEN** write MUST返回同一 owner ref
- **AND** Manifest record数量 MUST不增加

### Requirement: Contract Reset write-side 必须保持 Owner authority non-inference

Standalone Contract Reset admission MUST重新读取 current formal facts并确认 Delivery active、target Change active、target identity exact、formal conflicts为空。它 MUST消费本次显式 Owner structured input，但 MUST NOT要求把 Contract Reset伪装成 `authorize-*` Policy gate，也 MUST NOT从 Agent prose、Run context或旧 sourceRef自动生成新的 Reset。

#### Scenario: Agent 不能从 Review finding 自动写 Reset
- **WHEN** Reviewer finding建议 Owner改变 contract
- **BUT** Owner没有独立明确提交 structured Contract Reset input
- **THEN** A1 write-side MUST NOT创建 `contract-reset` record

### Requirement: Contract Reset 只改变 current contract identity，不重写 completed history

新的 current `contract-reset` MUST supersede同 scope更早 Reset的 current projection，但 MUST NOT修改、删除或反向 invalidate 已完成 Run/Review Result。其 lifecycle影响由 Reader/Policy基于 current Reset identity与 Run prepared identity确定，而不是通过写入 generation/supersession event。

#### Scenario: Reset 保留旧 completed provenance
- **WHEN** Owner在一个已有 completed producer/review的 active Change上记录新的 Contract Reset
- **THEN** Manifest MUST追加/选择新的 current structured Owner fact
- **AND** earlier Run/result bytes与terminal status MUST保持不变
- **AND** Flowkit MUST NOT创建 generic generation event record来“关闭”旧 Run
