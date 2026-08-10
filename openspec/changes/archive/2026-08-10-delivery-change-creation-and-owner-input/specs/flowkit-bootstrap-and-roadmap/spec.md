## ADDED Requirements

### Requirement: A1 product write-side 必须取代后续 Bootstrap 手工 creation/activation

A1 可用后，正常后续 Change 的 Delivery/Change creation、Owner provenance 与 activation MUST 使用 A1 product write-side；Bootstrap 手工 mutation 只保留本 Delivery 自举历史与 emergency/recovery 语境。Activation 继续不是 Git boundary，且成功 activation 的 Manifest/OpenSpec metadata 变化 MUST 随当前 Change 正常工作进入后续 Checkpoint。

#### Scenario: 正常 activation 不创建 Change Start Commit
- **WHEN** A1 product activation 成功
- **THEN** MUST NOT 创建独立 Change Start Commit
- **AND** activation bytes MAY 随该 Change 后续工作进入 Change Checkpoint

### Requirement: 历史 Bootstrap Owner strings 必须保持不可升级

A1 MUST NOT 回写或迁移 Q1 001–015 等既有 Run 中的 `ownerAuthorization: explicit/not-required`，也 MUST NOT 从这些字符串生成新的 `ownerDecisions`。新 Owner provenance contract 从 A1 product write-side 启用后适用于新记录。

#### Scenario: checkout 历史 Q1 Runs
- **WHEN** repository 包含 pre-A1 Bootstrap Run ownerAuthorization strings
- **THEN** Reader MUST 保持这些 Run bytes 原样
- **AND** MUST NOT 将其升级成 Owner authority record

### Requirement: pre-A1 architectureImpact compatibility 必须是 frozen bootstrap seam

A1 MUST 把 Base `448fa042de86d07e893bcc51da528f93eb7ced3a` 中已存在 Delivery/Change identities 的 missing `architectureImpact` 视为 bounded Bootstrap compatibility，而不是新 schema 的一般可选字段。Compatibility 只允许 Reader 保留 unknown；不得修改历史 Manifest、不得从其它事实 backfill，也不得让 A1 后新建 Change 省略该字段。

#### Scenario: bootstrap seam 不扩张到 future Change
- **WHEN** A1 product write-side 已启用
- **AND** future createDelivery/createChange 创建新的 Change
- **THEN** `architectureImpact` MUST required and persisted
- **AND** pre-A1 compatibility MUST NOT 适用于该 Change
