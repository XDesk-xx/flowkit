## MODIFIED Requirements

### Requirement: 固定 Action Catalog

B1 MUST 定义固定的 Standard Formal Action Catalog，且 Catalog MUST 只包含 10 个 Change Action：`explore`、`review-explore`、`revise-explore`、`propose`、`review-propose`、`revise-propose`、`apply`、`review-apply`、`revise-apply`、`archive`。`full-test` 与 `delivery-finalize` MUST NOT 是 Standard Formal Action；`review`、`revise` 与 `change-checkpoint` 也 MUST NOT 进入 Catalog。Delivery Full Test / Finalize 的 Delivery behavior machine representation 后置到 Delivery Execution Loop，不得通过保留 Delivery Action 兼容当前模型。

#### Scenario: CHANGE_ACTIONS 包含且仅包含 10 个 Change Action

- **WHEN** 检查 Standard Formal Action Catalog
- **THEN** MUST 包含且仅包含 10 项：`explore`、`review-explore`、`revise-explore`、`propose`、`review-propose`、`revise-propose`、`apply`、`review-apply`、`revise-apply`、`archive`
- **AND** MUST 使用 `const` 数组 + `as const`
- **AND** `FormalAction` MUST 等价于 Change Action union

#### Scenario: Delivery behavior 不进入 Standard Action Catalog

- **WHEN** 检查 Standard Formal Action Catalog
- **THEN** MUST NOT 包含 `full-test` 或 `delivery-finalize`
- **AND** MUST NOT 通过另一个 current `DELIVERY_ACTIONS` Catalog 把二者重新并入 `FormalAction`
- **AND** Delivery Full Test / Finalize MUST NOT 因兼容历史而获得新的 Standard Run

#### Scenario: Catalog 不含统一入口与 Git boundary

- **WHEN** 检查 Standard Formal Action Catalog
- **THEN** MUST NOT 包含 `review`、`revise` 或 `change-checkpoint`

#### Scenario: Action Catalog 不使用 enum

- **WHEN** 检查领域 Action 定义
- **THEN** MUST 使用 `const` 数组 + `as const`
- **AND** MUST NOT 使用 `enum`
