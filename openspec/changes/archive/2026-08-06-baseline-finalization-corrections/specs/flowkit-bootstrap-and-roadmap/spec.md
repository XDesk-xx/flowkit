## ADDED Requirements

### Requirement: Delivery Final Audit corrective Change 路径

当 Delivery Final Audit 发现已 Checkpoint 产物的问题时，Flowkit MUST 停在 owner 决策边界，不得自动创建 corrective Change，不得重新打开已 Checkpoint 的 Change，也不得直接塞入 Delivery Final Commit。只有 owner 明确授权后，Flowkit 才创建 corrective Change。

#### Scenario: 发现已 Checkpoint 产物问题

- **WHEN** Delivery Final Audit 发现已 Checkpoint 产物的问题
- **THEN** Policy MUST 停在 owner 决策边界
- **AND** MUST NOT 自动创建 corrective Change
- **AND** MUST NOT 重新打开已 Checkpoint 的 Change
- **AND** MUST NOT 直接塞入 Delivery Final Commit

#### Scenario: owner 授权后创建 corrective Change

- **WHEN** owner 明确授权创建 corrective Change
- **THEN** Flowkit MUST 创建 corrective Change
- **AND** corrective Change MUST 按普通 Change 生命周期完成 Checkpoint

#### Scenario: corrective Change 完成后进入 Full Test

- **WHEN** corrective Change 完成 Checkpoint
- **THEN** Delivery fullTestStatus MUST 转换为 `awaiting-user-decision`
- **AND** Full Test 仍需 owner 明确授权
