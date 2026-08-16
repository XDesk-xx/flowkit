## ADDED Requirements

### Requirement: Change dependency identity 必须统一使用 Change.id

Delivery Manifest `dependsOn` 的 canonical dependency identity MUST 为被依赖 Change 的 `id`，不得使用 `Change.key` 作为 dependency authority。`Change.key` 继续作为 Delivery 内短标签/展示标识；dependency completion、creation validation 与 activation precondition MUST 解析同一个 Change.id contract。

#### Scenario: completed dependency id 满足 activation dependency
- **WHEN** planned Change 的 `dependsOn` 包含 `core-contract-alignment`
- **AND** 当前 Delivery 中 `id=core-contract-alignment` 的 Change 为 completed
- **THEN** dependency MUST 被视为 completed
- **AND** MUST NOT 因该 Change 的 key 为 `Q1` 而报告 dependency incomplete

### Requirement: Creation 与 activation 必须保持 lifecycle authority 分层

Delivery/Change creation 与 Change activation 是 lifecycle mutation operation，不是新的 Formal Change Action。Policy MUST 继续拥有 activation 合法边界，Owner MUST 提供 scope/selection authority，write operation 只执行已合法且被明确授权的 mutation。

#### Scenario: activation 不成为 Action
- **WHEN** Owner 明确选择并授权一个 eligible planned Change
- **THEN** activation operation MAY 将其切换为 active
- **AND** MUST NOT 新增 `activate` FormalAction 或 Standard Run
