## ADDED Requirements

### Requirement: Policy dependency resolution 必须按 Change.id

Policy 的 dependency completion 判断 MUST 将 `Change.dependsOn` 每个值解析为同 Delivery 的 `Change.id`。Unknown id、dependency 未 completed 或 identity ambiguity MUST fail closed；Policy MUST NOT 使用 Change.key 代替 persisted dependency id。

#### Scenario: 真实 Manifest shape 可进入 activation decision
- **WHEN** Q1 的 `key=Q1`、`id=core-contract-alignment`、state=completed
- **AND** A1 `dependsOn=[core-contract-alignment]` 且无其它阻塞
- **THEN** Policy MUST 认为 dependency completed
- **AND** MUST NOT 返回 `dependency-incomplete:Q1`

### Requirement: Owner authorization gate 必须按 Delivery 与 Change applicability 匹配

Policy MUST 只消费与 current Delivery、current decision 以及适用 target Change.id 匹配的 Owner authorization fact。Change-scoped apply/archive/activation/checkpoint record MUST 不得授权其它 Change；Delivery-scoped Full Test/Finalize record MUST 不得跨 Delivery。Record presence 只关闭已有合法 Owner gate，MUST NOT 自动调度 Action、re-review、Git boundary 或 Delivery behavior。

#### Scenario: A1 apply auth 不授权 B1
- **WHEN** snapshot 只有 `authorize-apply` for `changeId=A1-id`
- **AND** current apply gate 属 `changeId=B1-id`
- **THEN** Policy MUST 视为 B1 apply authorization 缺失
- **AND** MUST 返回对应 owner-decision 而不是允许 apply

### Requirement: Authorization-only write admission 必须精确匹配 current Owner decision boundary

A1 write-side 在持久化 authorization-only record 前 MUST 使用 current Policy 结果作为合法性 gate：结果必须是 `owner-decision`，requested decision 必须与 record decision 相同，且 Change-scoped canonical Change.id 或 Delivery-scoped Delivery.id target 必须完全匹配。Policy 本身仍为 pure decision authority，不执行 persistence；service/CLI MUST 消费该结果而不得复制一套 lifecycle decision tree。

#### Scenario: future gate 不能提前授权
- **WHEN** Policy 当前没有请求 `authorize-apply` for Change A
- **THEN** A1 MUST NOT 因为未来可能到达 Apply gate 而允许写入该 record
- **AND** current Manifest MUST 保持不变
