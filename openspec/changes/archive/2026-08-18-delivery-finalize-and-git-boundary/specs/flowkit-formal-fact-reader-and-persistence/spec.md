## ADDED Requirements

### Requirement: F1 finalization projection 必须可持久化、可逆验证且不复制外部 authority
Delivery Manifest persistence MUST support an optional closed `delivery.finalization` projection containing only schemaVersion, qualificationRef, ownerAuthorizationRef, and candidateRef. FormalFactSnapshot/Reader MUST also expose or deterministically derive the unique latest admitted pre-final Git revision needed by the current qualification without persisting a duplicate Git truth in the Manifest. Reader MUST validate format, exact Owner binding, passed Full Test and architecture disposition consistency. The persistence layer MUST support the strict inverse projection required to reconstruct pre-Finalize active Manifest bytes. Pre-F1 manifests without finalization remain readable.

#### Scenario: completed F1 Manifest projects minimal finalization facts
- **WHEN** Manifest has `delivery.state=completed` and F1 finalization block
- **THEN** Reader MUST expose only the bounded finalization refs required for handoff/admission
- **AND** current qualification verification MUST re-derive `qualifiedBaseRevision` from admitted Git boundary facts
- **AND** MUST NOT copy Full Test logs, Architecture JSON/receipt bytes, or Git history into snapshot state

#### Scenario: malformed or duplicate finalization block fails closed
- **WHEN** finalization keys are missing/duplicated/malformed or inconsistent with passed/architecture facts
- **THEN** Reader MUST emit a formal-fact conflict

### Requirement: Owner finalizationQualificationRef 必须作为 bounded provenance 被读取验证
Owner Manifest records MAY contain optional `finalizationQualificationRef`. Reader MUST validate its typed ref shape and expose it on Owner decision/authorization facts. Field-absent historical records remain readable and retain prior identity semantics.

#### Scenario: malformed Owner qualification binding is rejected
- **WHEN** Owner record carries an invalid finalizationQualificationRef
- **THEN** Reader MUST fail closed rather than treating it as authorization

### Requirement: Delivery Final Git reader 必须区分 candidate 与 admitted boundary
Git reader MUST emit current/future Delivery Final candidates with parsed exact subject/trailer identity rather than directly granting boundary authority. FormalFactReader MUST perform point-in-time Manifest/Owner/finalization/candidateRef admission. Strict mode activates at the recognized F1 Change Checkpoint; ancestor historical finals MAY retain bounded legacy compatibility.

#### Scenario: post-cutover wrong trailers remain candidate/non-boundary
- **WHEN** a post-F1-checkpoint commit has finalize-like subject but missing/duplicate/wrong trailers
- **THEN** Git/Reader MUST NOT project a formal `delivery-final` boundary

#### Scenario: point-in-time commit facts bind admitted boundary
- **WHEN** a strict candidate commit is evaluated
- **THEN** Reader MUST validate its first parent, exact changed path set, point-in-time completed Manifest, matching qualification-bound Owner record, re-derived `qualifiedBaseRevision`, and reconstructed candidateRef
- **AND** first parent MUST exact-equal the re-derived qualified revision
- **AND** only a fully matching candidate MAY become `GitBoundaryFact(kind=delivery-final)`
