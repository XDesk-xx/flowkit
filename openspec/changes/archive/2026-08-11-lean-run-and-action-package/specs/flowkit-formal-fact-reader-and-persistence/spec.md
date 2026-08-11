## ADDED Requirements

### Requirement: Current Run create path 必须 defense-in-depth 强制 Run-ID 与 Action→Role

Current Standard Run persistence MUST在publish前验证完整 Run-ID grammar、Delivery-wide NNN monotonic/uniqueness、Run-ID action suffix与 formal Action一致，以及 Action→Role匹配。即使内部 caller直接调用低层 create primitive，也 MUST NOT能够创建 malformed/non-monotonic/duplicate NNN或错误 role的 current Run。Historical legacy Runs仍只 bounded read，不迁移重写。

#### Scenario: 低层 malformed Run-ID 被拒绝
- **WHEN** internal caller直接请求创建 `runId=not-a-run-id`
- **THEN** persistence MUST fail before pending publish

#### Scenario: Delivery-wide duplicate NNN 被拒绝
- **WHEN**另一个 Change目录已经存在同一 Delivery NNN
- **THEN** current Run create MUST拒绝candidate

### Requirement: ContextFile 必须持久化 compact semantic input fingerprint

Current schemaVersion 2 pending Run context MUST保存由B1 preparation Core-derived的semantic input fingerprint，且Reader/serialization MUST验证其shape。Fingerprint descriptor必须至少绑定完整ActionDefinition identity/version与全部versioned `contractRefs` identity，并遵守B1 inclusion/exclusion rule。Fingerprint仅作为same-pending execution identity，不成为OpenSpec/Review/Verification/Owner authority或全package hash store。

#### Scenario: pending reload保留semantic identity
- **WHEN** repository checkout/resume读取一个B1 prepared pending Run
- **THEN** Reader MUST恢复同一semantic input fingerprint
- **AND** preparation MUST能据此判定resume或input drift

### Requirement: Terminal admission 必须继续通过 completeRun/Core-owned ResultRef

B1 logical result admission MUST复用 current `completeRun`/result-ref resolver/serialization validators。Caller MUST NOT获得直接指定 runRef、ResultRef kind/path/fingerprint或缩小required produced artifact set的能力。

#### Scenario: B1 admission不创建第二套 result writer
- **WHEN** logical Action Result被接纳
- **THEN** terminal `result.json` MUST仍由existing Core terminal publish path产生
- **AND** first terminal writer MUST继续 wins/create-once

### Requirement: pending resume 必须对 contract generation drift fail closed

Persistence/Reader恢复pending Run后，B1 preparation重新派生semantic descriptor时 MUST使用current contractRefs identity/version。若与stored fingerprint不同，MUST保留原pending bytes并返回input-drift diagnosis；MUST NOT重写stored fingerprint或发布第二pending Run。

#### Scenario: contractRef drift 不被 checkout/resume 吞掉
- **WHEN** checkout后pending Run的stored fingerprint对应旧contractRef版本
- **AND** current contractRef versionFingerprint已变化
- **THEN** resume MUST fail closed
- **AND** pending context/result MUST保持未改写
