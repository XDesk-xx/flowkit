## ADDED Requirements

### Requirement: known-success archive continuation 不得依赖已 relocation 的 active Change status

OpenSpec archive child返回并 durable 持久化可接纳 success terminalObservation 后，只要 `inspectOpenSpecArchiveRecovery` 或等价 classification证明 current `OpenSpecArchiveMutationSurfaceV1` 与stored F不同且observation与requested Change一致，C1/B1 MUST把该状态作为 `known-success` operational proof继续同一 archive Run terminal admission。

Post-relocation continuation MUST NOT再次要求 canonical active `OpenSpecCliAdapter.getChangeStatus(changeId)` 成功，也 MUST NOT通过恢复canonical active Change目录、重跑archive、扫描archive tree或historical replay重新证明OpenSpec success。Future archive MUST从ContextFile持久化的 bounded keyed OpenSpec entry projection重建 external context；pre-D2 legacy Run only MAY在disposable temp root中把 archived bytes交给同版本OpenSpec structured status重建 keyed mapping。两条路径都 MUST先完成archive-specific entry semantic check，然后仅从 durable success observation构造Core-owned archive completion并调用existing terminal writer。

#### Scenario: structured success relocation 后同一 Run completed
- **WHEN** fresh pending archive已durable arm F并spawn OpenSpec
- **AND** durable terminalObservation为合法success
- **AND** post V1与F不同且active Change root已relocate
- **AND** future archive entry persisted keyed projection重建出的semantic identity exact-match stored fingerprint
- **THEN**同一 archive Run MUST通过existing Core terminal writer写入completed result
- **AND** MUST NOT再次调用active Change status作为terminal前置
- **AND** MUST NOT spawn第二次OpenSpec archive

#### Scenario: process crash 后 known-success continuation复用 durable observation
- **WHEN**success terminalObservation已durable保存但process在result.json发布前终止
- **AND**新session重算post V1仍为known-success
- **THEN**恢复 MUST使用同一observation + same Run entry semantic identity继续terminal admission
- **AND** missing process memory MUST NOT把它降级为outcome-unknown

#### Scenario: legacy 085 mapping只能由 disposable OpenSpec structured status重建
- **WHEN** pre-D2 pending archive缺少future keyed projection但已有known-success durable observation
- **THEN** Flowkit MAY在disposable temp OpenSpec root中临时呈现observation指向的archived Change bytes并调用同版本OpenSpec structured status
- **AND** keyed artifactPaths authority MUST来自OpenSpec输出
- **AND** temp view MUST NOT写回canonical tree或作为archive success proof
- **AND** MUST NOT通过默认proposal/design/tasks/specs路径规则补全mapping

### Requirement: archive-terminal explicit recovery surface 必须保持极窄

Flowkit MAY提供 `recover archive-terminal` machine surface，专门处理历史 durable known-success pending archive。该surface MUST不接受caller-supplied success payload，不得调用OpenSpec mutating archive，不得成为generic Run completion/cancellation API；它 MUST复用同一archive continuation semantic check与Core terminal writer，并在eligible candidate为0个或多个、observation非success、mutation classification非known-success或semantic drift时fail closed。

#### Scenario: existing D1/085 被正式恢复
- **WHEN**当前repository存在唯一历史D1/085 pending archive
- **AND**其 durable observation=success、post V1!=F、entry semantic identity exact-match
- **THEN** `recover archive-terminal` MUST只通过Core-owned terminal writer新增085 completed result
- **AND** MUST NOT rerun D1 archive、恢复active D1 tree或重写既有action/context

#### Scenario: ambiguous 或非known-success recovery被拒绝
- **WHEN**不存在唯一eligible known-success pending archive
- **OR** candidate为failure/outcome-unknown/recovery-required/semantic-drift
- **THEN** recovery surface MUST fail closed
- **AND** MUST NOT发布任何terminal result或触发mutation
