## ADDED Requirements

### Requirement: future archive Run 必须持久化无损、bounded 的 OpenSpec entry semantic projection

当前 ContextFile schema MUST为 future Run 提供 archive-only bounded projection，用于保存 archive entry 时由 OpenSpec structured status权威返回的 `version/changeId/changeRootLogical/artifactId→logicalPaths` keyed identity。该 projection MUST只在 `action=archive` 时存在，MUST使用 closed artifact-id shape并参与 archive `externalContextFingerprint` / `semanticInputFingerprint` reconstruction；MUST NOT保存raw status、instructions、archive outcome或完整Action Package，也 MUST NOT成为generic semantic ledger。

Post-relocation Reader/B1 MUST优先从该 persisted projection重建 archive OpenSpec semantic view，并 exact-check stored `semanticInputFingerprint`；MUST NOT调用已relocate active `getChangeStatus(changeId)`，也 MUST NOT从ResultRefs、文件名或目录规则猜artifactId mapping。Historical v2/v3 context保持read-only compatible且不得批量迁移。

#### Scenario: future 非默认 artifact paths relocation 后仍 exact-check
- **WHEN** future archive entry 的 OpenSpec structured status返回非默认或重排后的 proposal/specs/design/tasks logical paths
- **AND** ContextFile 已按artifactId keyed持久化该 bounded projection
- **AND** archive success 后active Change root已relocate
- **THEN** Reader/B1 MUST从persisted keyed projection重建与entry相同的archive external context
- **AND** reconstructed semantic descriptor MUST exact-match stored `semanticInputFingerprint`
- **AND** MUST NOT通过默认path inference或active status查询补全mapping

#### Scenario: future archive external semantic drift 继续 fail closed
- **WHEN** pending archive relocation 后适用 Owner authorization、Review/Verification binding、contract bytes、Run identity或OpenSpec semantic version发生不允许的变化
- **THEN** reconstructed semantic fingerprint MUST不能匹配 stored fingerprint
- **AND** terminal admission/recovery MUST fail closed
- **AND** MUST NOT改写stored projection/fingerprint或伪造completed result

### Requirement: pre-D2 archive context MAY通过 bounded OpenSpec-authority legacy adapter重建 keyed mapping

对于 `schemaVersion` 为历史 v2/v3、`action=archive` 且缺少 future keyed projection 的 immutable pending Run，Flowkit MAY在满足 durable known-success guard前提后使用 legacy reconstruction。该 reconstruction MUST在 disposable temp root 中将 structured terminalObservation指向的 archived Change bytes临时呈现到 guard记录的entry logical location，并调用受支持且版本一致的 OpenSpec CLI structured status；artifactId→logicalPaths MUST来自该OpenSpec structured输出，而非Flowkit默认path rule。

该临时 view MUST只用于 semantic reconstruction：MUST NOT写回 canonical OpenSpec tree、不得修改历史ContextFile、不得作为archive success proof、不得成为generic OpenSpec replay/migration subsystem。OpenSpec version/mapping/change identity/temp reconstruction任一不一致 MUST fail closed。

#### Scenario: D1/085 通过 OpenSpec authority重建 keyed mapping
- **WHEN** D1/085 为immutable schemaVersion 3 pending archive且无future projection
- **AND** durable observation=success、mutation guard classification=known-success
- **AND** observation archived path 与 guard/change identity一致
- **THEN** legacy adapter MUST在disposable temp OpenSpec view中调用同版本structured status取得proposal/specs/design/tasks keyed paths
- **AND** MUST用该structured mapping参与085 entry semantic compatibility check
- **AND** MUST NOT补写085 context或恢复canonical active D1 tree

#### Scenario: legacy reconstruction不能安全完成时拒绝恢复
- **WHEN** OpenSpec version不一致、structured status失败、artifact mapping不完整、change identity不匹配或temp view无法构造
- **THEN** legacy recovery MUST fail closed
- **AND** MUST NOT改写085、重跑archive或猜测默认artifact paths

### Requirement: completed-uncheckpointed Change 的 archive terminal fact 必须被 bounded 投影

FormalFactReader MUST为 current Delivery 中唯一 completed 且尚未形成 Change Checkpoint 的 target Change投影其 archive Run terminal status，供 Policy判断 checkpoint readiness。该 bounded projection MUST NOT要求加载全部历史 Finding/Run corpus；已经 checkpoint 的历史 Change pending archive MAY保留为审计/recovery fact，但 MUST NOT因此覆盖后续 active Change normal execution relevance。

#### Scenario: completed 但 archive Run pending 被 Policy看见
- **WHEN** Manifest Change=`completed`且Git尚无该 Change checkpoint
- **AND**该 Change matching archive Run仍pending
- **THEN** FormalFactSnapshot MUST提供足以让Policy拒绝`authorize-checkpoint`的archive terminal fact
- **AND** MUST NOT把pending Run伪装为completed

#### Scenario: 已 checkpoint 历史 pending 不劫持 current active Change
- **WHEN**历史 Change已有matching Change Checkpoint但遗留pending archive terminal-observation
- **AND**另一个 Change当前active
- **THEN**该历史pending MAY被diagnostic/explicit recovery读取
- **BUT** MUST NOT成为current active Change normal Action preparation或Policy的替代 target

### Requirement: Contract Reset 后 current generation projection 必须保留 Explore 并使旧 Proposal/downstream lineage 非 current

Owner Contract Reset 改变 Change contract generation 时，FormalFact projection MUST继续保留最近合法的 Explore artifact/review作为 fresh Proposal input；但此前 `propose/revise-propose/review-propose/apply/revise-apply/review-apply/archive` Runs若未携带当前完整 Contract Reset identity，MUST只能作为 immutable historical facts，MUST NOT被投影为 current proposal/downstream stage、current artifact、current review approval或当前 producer binding。

该规则 MUST通过现有 Owner fact refs / Run facts确定，不得新增 Generation Registry、Run rewrite或第二套 supersession store。

#### Scenario: 097 保留历史但不再是 current Apply
- **WHEN** 097-apply 已 completed
- **AND** Owner随后记录新的 Contract Reset identity并明确097 generation abandoned
- **THEN** Reader MUST继续读取097作为历史 completed Run
- **BUT** current proposal/downstream projection MUST NOT把097作为current Apply artifact
- **AND**旧091/095等未绑定当前reset identity的Review MUST NOT成为current approval

#### Scenario: 旧 revise producer 不得跨 Reset 重新成为 Current Artifact
- **WHEN** 历史 generation 中存在090-revise-propose与094-revise-apply
- **AND** 二者均不匹配当前完整 Contract Reset identity
- **THEN** Reader MUST继续保留二者作为 immutable historical completed Runs
- **BUT** proposal stage Current Artifact MUST NOT选择090-revise-propose
- **AND** apply stage Current Artifact MUST NOT选择094-revise-apply
- **AND**与二者关联的旧review lineage MUST NOT跨Reset成为current authority

#### Scenario: approved Explore 可继续成为 fresh Proposal handoff
- **WHEN** Contract Reset发生在已存在合法 approved Explore之后
- **AND** reset required outcome要求建立新的contract generation
- **THEN**最近合法 approved Explore artifact/review MUST仍可作为fresh `propose`的输入
- **AND** MUST NOT要求无关的`explore → review-explore`重跑
