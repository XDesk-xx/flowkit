## MODIFIED Requirements

### Requirement: Change 激活和完成必须满足固定条件

`planned → active` MUST 要求 Delivery active、没有其他 active Change、dependencies 均 completed，并且 owner 明确授权。

Change 只有在 review-apply approved、Blocking Findings 为 0、Change Verification passed/not-applicable、Tasks 完成、owner 授权 Archive，并且 OpenSpec Archive operation success 后，Flowkit MUST 将自己的 Change 状态记录为 `completed`。**Change Checkpoint 不属于 Change 的完成条件**；它是 Change 已关闭后的 Flowkit/Git 正式边界。

#### Scenario: Archive 未完成

- **WHEN** review-apply 已 approved
- **BUT** OpenSpec Archive 尚未成功
- **THEN** Change MUST 保持 active

#### Scenario: Archive 成功即关闭 Change

- **WHEN** OpenSpec Archive operation success
- **THEN** Flowkit MUST 记录 Change 为 `completed`
- **AND** Change MUST 不再作为 active Change
- **AND** MUST NOT 等待 Change Checkpoint 才进入 completed

#### Scenario: Checkpoint 不重新打开 Change

- **WHEN** Change 已因 OpenSpec Archive success 进入 completed
- **AND** Change Checkpoint 尚未形成
- **THEN** Change MUST 保持 completed
- **AND** Flowkit MUST 将 Checkpoint 作为关闭后的 Git/恢复边界处理
