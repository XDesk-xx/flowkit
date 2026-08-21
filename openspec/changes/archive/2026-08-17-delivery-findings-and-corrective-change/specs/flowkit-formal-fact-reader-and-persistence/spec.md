## ADDED Requirements

### Requirement: B1 必须以 Full-Test-specific retained result + occurrence-resolved Finding provenance 保留 failure authority

Delivery Manifest MAY 增加两个 bounded optional sections：`verification.fullTest.failureHistory[]` 与 `delivery.fullTestFindings[]`。Pre-B1 Manifest 缺少任一字段 MUST bounded read 为 empty，MUST NOT触发 rewrite/migration。

`failureHistory[]` MUST 是 Full-Test-specific **content-addressed deduplicated retention set**：每项 MUST 是 A1 structured terminal result closed schema、`status=failed`，并按 A1 canonical hash domain独立重算 `resultRef`。同一 `resultRef` MUST 最多出现一次；两个不同 failure occurrence MAY 合法引用同一 retained result entity。它 MUST NOT保存 passed result、raw logs、process output或 attempt history。

`fullTestFindings[]` 每项 MUST closed-schema包含：

```text
schemaVersion = 1
findingId
authorizationRef
sourceResultRef
severity = blocking
summary
affectedScope = delivery
requiredOwnerDecision = corrective-change-or-cancel-delivery
resolution.kind = corrective-change-created
resolution.changeId
resolution.ownerDecisionRef
```

Reader MUST 将 `authorizationRef` 解析到 current Delivery 的合法 delivery-scoped `authorize-full-test` Owner record，将 `sourceResultRef` 解析到 `failureHistory[]` exact retained result，并按 `deliveryId + authorizationRef + sourceResultRef` 的 frozen canonical hash domain独立重算 `findingId`。`findingId` 与 `authorizationRef` 作为 occurrence identity MUST 各自唯一；duplicate occurrence identity、mismatched source binding或 dangling authorization MUST 收集 FactConflict 并 fail closed。不同 Finding occurrence MAY 共用同一 `sourceResultRef`。

Persisted Finding 的 `summary` MUST 是 source Verification result `summary` 的 deterministic projection：Writer MUST 从 verified source result复制，MUST NOT接受 caller-authored summary；Reader MUST 要求 `finding.summary === retainedResult.summary` exact equality。其它 constant/derived projection字段也 MUST 按 frozen contract校验。

`resolution.changeId` MUST resolve 到 current Delivery Change，`resolution.ownerDecisionRef` MUST resolve 到 matching ordinary `create-change` Owner record。Current raw `fullTestStatus=failed` 时，Reader MUST 从 current `verification.fullTest.result` + latest applicable `authorize-full-test` Owner record纯派生 current Finding occurrence；该 current Finding不要求先持久化，并且其 `authorizationRef` MUST NOT已经作为 historical resolved occurrence存在于 `fullTestFindings[]`。Correction consumed 后 historical `fullTestFindings[]` MUST NOT 被重新解释为 current blocking finding。

#### Scenario: pre-B1 Manifest 无新字段仍合法读取
- **WHEN** legitimate historical/pre-B1 Manifest 没有 `failureHistory` 与 `fullTestFindings`
- **THEN** Reader MUST 把二者解释为 empty
- **AND** MUST 按既有 A1 current-result/fullTestStatus contract读取
- **AND** MUST NOT修改 Manifest bytes

#### Scenario: retained failed result 可由 fresh process 独立重算并去重
- **WHEN** post-correction Manifest 在 `failureHistory[]` 保存 exact failed structured result
- **THEN** fresh Reader MUST 按 A1 canonical hash domain重算其 `resultRef`
- **AND** one-or-more persisted Finding `sourceResultRef` MAY resolve 到同一 exact entity
- **AND** hash mismatch、duplicate physical resultRef entry 或 non-failed history item MUST fail closed

#### Scenario: 两次相同 failed payload 可保留两个独立 corrective provenance
- **WHEN** occurrence A 与 occurrence B 有不同合法 `authorizationRef`
- **AND** 两者 `sourceResultRef` 因 structured failed payload完全相同而相同
- **THEN** `failureHistory[]` MUST 只需要一份 exact retained result
- **AND** `fullTestFindings[]` MUST 能保存两个不同 `findingId/authorizationRef` 的 resolved provenance
- **AND** fresh Reader MUST 分别重算并识别两个 occurrence，不得 overwrite/collide

#### Scenario: stale Finding source 或 authorization binding fail closed
- **WHEN** persisted `fullTestFindings[]` item 指向不存在/hash 不匹配的 `sourceResultRef`
- **OR** `authorizationRef` 不存在、不是 matching Delivery-scoped `authorize-full-test` fact
- **OR** recomputed occurrence `findingId` 与 persisted id不一致
- **THEN** Reader MUST 收集 bounded Full Test Finding/provenance FactConflict
- **AND** Policy MUST NOT猜测 historical failure authority或允许 lifecycle advance

#### Scenario: historical Finding summary 漂移 fail closed
- **WHEN** persisted Finding 的 `sourceResultRef` 可合法解析
- **BUT** persisted `summary` 不等于 retained failed result `summary`
- **THEN** Reader MUST 收集 bounded FactConflict before lifecycle advance
- **AND** MUST NOT把 contradictory human projection视为合法 provenance

#### Scenario: createChange-only old shape 不冒充 correction consumed
- **WHEN** Manifest 仍为 raw `failed` + current terminal result
- **AND** 仅存在一个后来创建的 ordinary planned Change
- **BUT** 没有合法 `failureHistory + fullTestFindings` corrective admission facts
- **THEN** Reader MUST 继续把 current failure occurrence投影为未消费
- **AND** MUST NOT 因 Change 的存在推断 correction 已发生

### Requirement: B1 corrective admission 必须以一次 atomic Manifest publication 转移 current failure authority

合法 Owner corrective create MUST 在一次 atomic Manifest replace 中同时完成：append ordinary required planned Change、append existing `create-change` Owner record、**ensure** exact current failed result retained once in `verification.fullTest.failureHistory[]`、append matching current occurrence resolved `delivery.fullTestFindings[]` provenance、移除 current `verification.fullTest.result`、并将 raw `delivery.fullTestStatus` 从 `failed` 改为 `not-ready`。

Writer MUST 从 current verified result + current authorization fact派生 `findingId/authorizationRef/sourceResultRef/summary` 等 provenance字段；caller只提供 frozen corrective binding，不得提供 summary/severity等 projection字段。若 current `sourceResultRef` 已在 `failureHistory[]`，Writer MUST exact validate并 reuse；若不存在才 append。Writer MUST preserve unrelated Delivery/Change/verification fields；任何 input/current finding mismatch、malformed optional B1 section、duplicate occurrence identity、partial mutation 或 publish failure MUST fail closed，MUST NOT留下“status reset 但 authority 未保留”或“Change created 但 failure consumption 不完整”的 durable state。

#### Scenario: corrective admission 原子完成 occurrence-aware mutation
- **WHEN** current failed result/finding occurrence 与 Owner corrective create input exact match且普通 Change input合法
- **THEN** writer MUST 用一次 atomic replace发布 new planned Change + create-change Owner record + retained/reused failed result + current occurrence resolved Finding + current result removal + `failed→not-ready`
- **AND** persisted Finding summary MUST 从 verified source result派生
- **AND** unrelated Manifest semantics MUST 保持不变

#### Scenario: repeated identical failed result reuse retained entity
- **WHEN** prior resolved Finding已经保留 `sourceResultRef=R`
- **AND** later Full Test cycle以不同 `authorizationRef` 再次产生 exact same failed result `R`
- **THEN** corrective admission MUST NOT append duplicate `failureHistory` entity
- **AND** MUST append a new distinct occurrence Finding/resolution referencing `R`

#### Scenario: mismatch 时 Manifest 完全不变
- **WHEN** supplied findingId/authorizationRef/sourceResultRef 与 current derived Finding occurrence不匹配
- **OR** current Full Test facts/optional B1 sections存在冲突
- **THEN** corrective admission MUST fail closed before publish
- **AND** Manifest bytes MUST 保持不变
