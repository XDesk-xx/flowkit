## ADDED Requirements

### Requirement: Delivery Full Test failure correction 必须分离 Verification 内容身份与 Finding occurrence 身份

B1 MUST 把 genuine Verification-owned Delivery Full Test `failed` terminal result 投影为一个 deterministic current Full-Test Delivery Finding，并停在 Owner 决策边界。Finding MUST 只引用/投影 failed result，不得取代 Verification result authority；Owner corrective decision MUST 继续由显式 `create-change` Owner write-side 拥有。

`sourceResultRef=verification:full-test:<sha256>` MUST 继续作为 A1 Verification content identity。Current failure occurrence MUST 绑定该轮最新、合法、delivery-scoped `authorize-full-test` Owner decision `authorizationRef=owner:<sha256>`。Flowkit MUST 按以下 frozen canonical domain 派生 Finding occurrence identity：

```text
payload fields/order:
{"schemaVersion":1,"deliveryId":<delivery-id>,"authorizationRef":<owner-ref>,"sourceResultRef":<verification-ref>}

encoding:
JSON.stringify 等价的单行 UTF-8 JSON
→ no whitespace
→ no trailing newline
→ SHA-256 lowercase hex

findingId:
full-test-failure:<sha256>
```

Finding MUST 投影 `findingId`、`authorizationRef`、`sourceResultRef`、`severity=blocking`、`summary=currentResult.summary`、`affectedScope=delivery`、`requiredOwnerDecision=corrective-change-or-cancel-delivery`。Flowkit MUST NOT 把 raw stdout/stderr、process logs 或 generic evidence复制进 Finding。

#### Scenario: genuine failed result 产生唯一 current failure occurrence Finding
- **WHEN** current Delivery raw/effective `fullTestStatus=failed`
- **AND** current `verification.fullTest.result` 是合法、hash 可重算的 failed terminal result
- **AND** latest applicable Delivery-scoped `authorize-full-test` Owner record 可合法解析
- **THEN** Flowkit MUST 从 `deliveryId + authorizationRef + sourceResultRef` 投影唯一 current Finding occurrence
- **AND** Finding `sourceResultRef` MUST 等于该 current Verification resultRef
- **AND** Finding `authorizationRef` MUST 等于该轮 Full Test authorization fact ref
- **AND** MUST NOT 创建 Standard Action、Run、corrective Change 或新的 Verification truth

#### Scenario: 两轮相同 failed payload 仍形成不同 Finding occurrence
- **WHEN** 两轮独立 Full Test cycle 各自有不同 `authorize-full-test` Owner record
- **AND** 两轮 Verification structured failed payload byte-identical，因此 `sourceResultRef` 相同
- **THEN** 两轮 `findingId` MUST 因不同 `authorizationRef` 而不同
- **AND** 第一轮 historical resolution MUST NOT 使第二轮 current Finding 被视为已解决
- **AND** MUST NOT引入 attempt counter、attempt ledger 或新的 Full Test authority

#### Scenario: completed historical Change 不因 failure/correction 被重开
- **WHEN** Full Test failure 来源于已经 completed/checkpointed 的 Delivery candidate
- **AND** Owner 后续创建 corrective Change
- **THEN** 所有既有 completed/archived Changes MUST 保持 immutable/completed
- **AND** correction MUST 通过一个新的 ordinary planned Change 表达

#### Scenario: correction 后重新等待独立 Full Test authorization
- **WHEN** corrective Change 已按 ordinary Change lifecycle completed + checkpointed
- **AND** Delivery 再次满足 A1 readiness 条件
- **THEN** effective Full Test status MUST 回到 `awaiting-user-decision`
- **AND** prior Full Test Owner authorization MUST NOT 自动授权新的 Delivery candidate
- **AND** Owner MUST 再次显式 `authorize-full-test`
