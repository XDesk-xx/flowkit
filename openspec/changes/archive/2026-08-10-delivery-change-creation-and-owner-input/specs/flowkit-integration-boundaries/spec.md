## ADDED Requirements

### Requirement: Owner authority record、Run reference 与 Manifest lifecycle 必须保持单一 authority

Owner 独立输入的 formal provenance MUST 由 Delivery Manifest `ownerDecisions` 拥有；Run 只能保存 owner authorization reference/执行上下文，不得复制或创造 authority。Delivery/Change lifecycle state 继续由 Delivery Manifest 拥有，Policy 只消费 Reader projection，write CLI/service 只执行已合法的 mutation。

#### Scenario: Run 与 Owner record 不冲突
- **WHEN** Run action/context 声称 owner authorization explicit
- **BUT** Manifest 中不存在适用 Owner decision record
- **THEN** Policy MUST 不把 Run 文本当成 authorization authority

### Requirement: A1 OpenSpec seam 必须停在 metadata initialization

A1 activation 与 OpenSpec 的集成 MUST 仅创建/验证 target Change minimal `.openspec.yaml` metadata。OpenSpec artifact lifecycle、structured paths/context、validation、archive 与 sync 继续属于 OpenSpec/C1 authority；A1 MUST NOT import OpenSpec runtime 或复制其完整 path/state machine。

#### Scenario: metadata initializer 不拥有 archive
- **WHEN** A1 初始化新 active Change 的 OpenSpec metadata
- **THEN** A1 MUST NOT 创建 proposal/design/specs/tasks 或执行 archive
- **AND** 后续 OpenSpec lifecycle MUST 仍由对应正式 Change Action/C1 integration 处理

### Requirement: legacy missing architectureImpact 不得跨 authority 推断

当 pre-A1 exact legacy Change 缺少 Change-level `architectureImpact` 时，A1 只能表达该事实为 unknown/legacy-missing。Delivery-level `architecture.impact`、OpenSpec prose、Run、Git commit、Change goal/outputs 均不是该缺失 Change-level boolean 的替代 authority，MUST NOT 用于推断或 backfill。

#### Scenario: Delivery architecture impact 不下推到 Change
- **WHEN** Delivery-level `architecture.impact=true`
- **AND** 某 exact pre-A1 legacy Change 缺少 Change-level `architectureImpact`
- **THEN** Reader MUST NOT 推断该 Change 为 `architectureImpact=true`
- **AND** MUST 保持 explicit unknown/legacy-missing
