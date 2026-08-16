## MODIFIED Requirements

### Requirement: Delivery Full Test 只 qualification 已 checkpoint 的 RC candidate

F1 completed + archived + checkpointed 后，Delivery MAY 按既有 Owner authorization contract 进入 `awaiting-user-decision → authorized`，随后由 Delivery-level Full Test behavior 对既有 checkpointed RC candidate 进行 qualification。Delivery Full Test MUST NOT 被表示为 Standard `full-test` Action/Run。Delivery Full Test passed MUST 表示既有 checkpointed RC candidate 获得 Delivery-level qualification/acceptance，MUST NOT 被解释为“现在才生成 F1 core release candidate”。Full Test failed MUST 使用既有 corrective Change lifecycle，MUST NOT reopen F1。

#### Scenario: F1 checkpoint 后等待 Full Test authorization

- **WHEN** F1 required output 已形成且 F1 completed/checkpointed
- **AND** 所有 required Changes 均 completed/checkpointed
- **THEN** Delivery MUST 等待 Owner authorize Full Test
- **AND** MUST NOT 要求 F1 再生成 RC artifact
- **AND** MUST NOT 创建 `full-test` Standard Run

#### Scenario: Full Test passed qualification candidate

- **WHEN** Owner-authorized Delivery Full Test behavior 对 checkpointed RC candidate passed
- **THEN** 该 candidate MUST 被视为获得 Delivery-level qualification/acceptance
- **AND** MUST NOT reopen F1 或产生第二份 F1 RC required output

#### Scenario: Full Test failed 不 reopen F1

- **WHEN** Owner-authorized Delivery Full Test behavior failed
- **THEN** F1 MUST 保持 completed/archived
- **AND** 后续修复 MUST 通过既有 owner-authorized corrective Change lifecycle
- **AND** 修复后 MUST 再次等待 Owner authorize Full Test
