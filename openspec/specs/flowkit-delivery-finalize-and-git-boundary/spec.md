# flowkit-delivery-finalize-and-git-boundary Specification

## Purpose
TBD - created by archiving change delivery-finalize-and-git-boundary. Update Purpose after archive.
## Requirements
### Requirement: Delivery Finalize 必须是 qualification-bound no-Run Delivery behavior
Flowkit MUST implement Delivery Finalize as a Delivery behavior rather than a Standard Change Action/Run. The behavior MUST require the exact current finalization qualification and an explicit Owner `authorize-delivery-finalize` record bound to that qualification. Finalize MUST NOT create a Run, consume Delivery-wide NNN, execute Git commit/push/PR/merge, or infer authorization from Full Test/Architecture evidence.

#### Scenario: exact qualification authorization enables Finalize behavior
- **WHEN** all required Changes are completed/checkpointed
- **AND** Full Test is passed
- **AND** architecture is accepted or explicitly not-applicable
- **AND** a current exact finalization qualification exists
- **AND** Owner has recorded `authorize-delivery-finalize` for that exact qualification
- **THEN** Policy MUST expose `delivery-behavior: delivery-finalize`
- **AND** MUST NOT expose a Standard Action or create a Run

#### Scenario: stale Finalize authorization cannot be reused
- **WHEN** a prior `authorize-delivery-finalize` record binds qualification Q1
- **AND** fresh Full Test or fresh architecture acceptance produces qualification Q2
- **AND** Q1 != Q2
- **THEN** Q1 MUST NOT authorize Q2
- **AND** Policy MUST request a fresh Owner Finalize authorization

### Requirement: Finalization qualification 必须绑定 fresh Full Test occurrence 与 architecture disposition
Flowkit MUST derive a deterministic delivery-scoped finalization qualification from existing formal refs. The closed identity MUST include deliveryId, current Full Test Owner authorization ref, current Full Test resultRef, an exact `qualifiedBaseRevision` derived from the current Delivery's formally admitted pre-final Git boundary, and architecture disposition. The qualified Git revision MUST be the unique latest admitted pre-final Delivery boundary revision (normally latest Change Checkpoint; Delivery Start only when no checkpoint is legitimately present), and ambiguity/topology mismatch MUST fail closed. For architecture-impact=true it MUST bind the exact accepted current architecture cycle and Owner acceptance ref and require `actualArchitectureRef.repositoryRevision` to equal that revision; for architecture-impact=false it MUST bind an explicit not-applicable literal. Callers MUST NOT inject the derived identity or revision.

#### Scenario: fresh Full Test authorization changes qualification
- **WHEN** technical Full Test result and architecture evidence are byte-identical across two runs
- **BUT** the Owner `authorize-full-test` occurrence ref differs
- **THEN** the two finalization qualification refs MUST differ

#### Scenario: fresh accepted architecture changes qualification
- **WHEN** Full Test occurrence remains the same
- **BUT** accepted architecture cycle or Owner acceptance ref differs
- **THEN** finalization qualification MUST differ

#### Scenario: architecture-not-applicable qualification is explicit
- **WHEN** Delivery architecture impact is false
- **THEN** qualification MUST bind explicit `not-applicable`
- **AND** MUST NOT synthesize an architecture cycle/source

#### Scenario: qualified base revision comes only from admitted Git boundary
- **WHEN** Flowkit derives a current Finalize qualification
- **THEN** `qualifiedBaseRevision` MUST come from the unique latest formally admitted pre-final Delivery Git boundary
- **AND** caller/session/current arbitrary HEAD MUST NOT override that revision
- **AND** architecture-impact=true accepted Actual `repositoryRevision` MUST exact-match it

### Requirement: Finalize 必须在 completed publication 前执行 bounded read-only candidate preflight
Before mutating `delivery.state`, Flowkit MUST perform read-only Git/index/worktree preflight while the Delivery remains active. The index MUST be empty. Current HEAD MUST exact-equal the current qualification's formal `qualifiedBaseRevision` and remain stable; Flowkit MUST NOT recapture a different clean HEAD as a new candidate base. Dirty/untracked paths MUST be limited to the Delivery Manifest and, when architecture impact is true, the Delivery durable Actual Architecture JSON. Any unrelated path or HEAD mismatch MUST fail closed before Manifest mutation.

#### Scenario: unrelated drift blocks while Delivery remains active
- **WHEN** exact Finalize qualification and Owner authorization exist
- **AND** an unrelated source/index/worktree mutation exists before Finalize publication
- **THEN** preflight MUST fail closed
- **AND** Delivery Manifest bytes MUST remain unchanged
- **AND** `delivery.state` MUST remain `active`

#### Scenario: clean post-qualification commit is rejected when architecture applies
- **WHEN** Full Test passed and an accepted architecture cycle binds qualified Git revision H1
- **AND** an ordinary clean commit advances HEAD to H2 after that qualification
- **THEN** Finalize preflight MUST fail before Manifest mutation because H2 != `qualifiedBaseRevision` H1
- **AND** MUST NOT absorb H2 into a new candidateRef using the old Full Test/Architecture qualification

#### Scenario: clean post-qualification commit is rejected when architecture is not applicable
- **WHEN** Full Test passed with architecture impact false and qualification binds formal pre-final revision H1
- **AND** an ordinary clean commit advances HEAD to H2 after that qualification
- **THEN** Finalize preflight MUST fail before Manifest mutation because H2 != `qualifiedBaseRevision` H1
- **AND** fresh qualification MUST be required before H2 can be finalized

#### Scenario: bounded final candidate passes preflight
- **WHEN** index is empty
- **AND** HEAD exact-equals `qualifiedBaseRevision` and is stable
- **AND** dirty paths are exactly within the bounded final candidate set
- **THEN** Flowkit MAY derive the final candidate identity and proceed to atomic Finalize publication

### Requirement: Delivery final candidate ref 必须绑定 pre-publication exact bytes 且可逆重建
Flowkit MUST derive `delivery-final-candidate:<sha256>` from deliveryId, the qualification-covered `qualifiedBaseRevision`, sorted bounded candidate paths, and exact SHA-256 bytes of the **pre-Finalize active** Manifest plus applicable Actual JSON. The finalization publication MUST NOT include itself in the hash. A completed Manifest MUST support a strict deterministic inverse projection that removes only the F1 finalization block and restores `completed -> active`; this inverse projection MUST reproduce the exact pre-publication Manifest bytes used by candidateRef.

#### Scenario: completed Manifest revalidates the stored candidateRef
- **WHEN** a valid completed F1 Manifest contains a stored candidateRef
- **THEN** inverse projection plus re-derived `qualifiedBaseRevision`/Actual bytes MUST reproduce the same candidateRef
- **AND** any additional semantic/whitespace mutation outside the exact Finalize-owned state/block change MUST fail closed

#### Scenario: malformed inverse projection is rejected
- **WHEN** finalization block is duplicate/malformed or state cannot be uniquely restored
- **THEN** candidate reconstruction MUST fail closed

### Requirement: Finalize publication 必须原子关闭 Delivery 且只保存最小 binding
After exact preflight succeeds, Flowkit MUST atomically publish `delivery.state=completed` and a closed `delivery.finalization` object containing only `schemaVersion=1`, exact `qualificationRef`, exact `ownerAuthorizationRef`, and exact `candidateRef`. The publication MUST leave Full Test/Architecture evidence at their existing authorities and MUST NOT persist a future Git commit SHA.

#### Scenario: successful publication is minimal and crash-safe
- **WHEN** active Delivery passes exact Finalize preconditions/preflight
- **THEN** one atomic Manifest write MUST produce `state=completed` plus the closed finalization binding
- **AND** no Git mutation or Run MUST be created
- **AND** a process crash after publication MUST leave sufficient durable facts to rebuild the Git handoff

#### Scenario: stale finalization input cannot overwrite completed facts
- **WHEN** requested/current qualification, Owner ref, or candidateRef does not exactly match the persisted finalization facts
- **THEN** Finalize MUST fail closed rather than rewriting completed state

### Requirement: Delivery Final Git handoff 必须可由 completed facts 独立重建
Flowkit MUST provide a read-only handoff for explicit deliveryId after Finalize publication. The handoff MUST revalidate the completed finalization projection, re-derived qualification `qualifiedBaseRevision`, current HEAD exact-match, bounded dirty paths, empty index, and reconstructed candidateRef. It MUST return exact subject/trailers and bounded paths but MUST NOT stage, commit, push, create PR, or merge.

#### Scenario: fresh process reconstructs the same handoff
- **WHEN** Finalize publication completed and the original process/session is gone
- **AND** repository bytes still match the bound candidate
- **THEN** `delivery final-handoff --delivery <id>` MUST return the same deterministic subject/trailers/paths

#### Scenario: post-publication unrelated drift blocks handoff without reopening Delivery
- **WHEN** completed Delivery acquires unrelated worktree/index drift before commit
- **THEN** handoff MUST fail closed
- **AND** Delivery MUST remain completed
- **AND** removing only the unrelated drift MUST allow the same handoff to be reconstructed again

### Requirement: current/future Delivery Final 必须使用 strict Git identity 与 point-in-time admission
A current/future Delivery Final commit MUST be single-parent with exact subject `chore(flowkit): finalize <delivery-id>` and exactly one each of `Flowkit-Delivery: <delivery-id>`, `Flowkit-Boundary: delivery-final`, and `Owner-Authorization: <owner-ref>`. Git parsing alone MUST produce only a candidate. FormalFactReader MUST admit it only after point-in-time Manifest/Owner/finalization validation, re-derivation of the same formal `qualifiedBaseRevision`, exact equality of commit first parent to that revision, and candidateRef reconstruction from that parent plus commit blobs.

#### Scenario: loose subject is not a formal Delivery Final
- **WHEN** a commit merely contains `finalize` or the deliveryId in its subject
- **BUT** exact current trailers/finalization facts are absent
- **THEN** it MUST NOT become a current/future formal Delivery Final boundary

#### Scenario: strict candidate is admitted only when all authorities bind
- **WHEN** exact subject/trailers are valid
- **AND** point-in-time Manifest is completed with passed Full Test and closed finalization projection
- **AND** Owner trailer matches a qualification-bound `authorize-delivery-finalize` record
- **AND** candidate first parent exact-matches re-derived `qualifiedBaseRevision`
- **AND** inverse candidate reconstruction matches candidateRef and changed paths are bounded
- **THEN** FormalFactReader MAY project a `delivery-final` boundary

### Requirement: strict Delivery Final cutover 必须由 recognized F1 Change Checkpoint 激活
F1 MUST preserve historical Delivery Final readability without keeping loose recognition for future commits. The formally admitted Change Checkpoint for `delivery-finalize-and-git-boundary` is the activation/cutover boundary. Historical Delivery Final commits that are ancestors of that checkpoint MAY use bounded legacy recognition. Commits after that checkpoint, including current 03 Final and future Deliveries, MUST use strict F1 admission.

#### Scenario: historical ancestor remains readable
- **WHEN** a legacy Delivery Final commit is an ancestor of the recognized F1 Change Checkpoint
- **THEN** bounded legacy read compatibility MAY project it without rewriting Git history

#### Scenario: post-cutover loose final is rejected
- **WHEN** a Delivery Final-shaped commit is after the recognized F1 Change Checkpoint
- **AND** it does not satisfy strict F1 identity/admission
- **THEN** it MUST NOT be projected as a formal Delivery Final

### Requirement: Delivery Final merge closure 必须保留 Merge Commit topology
Flowkit MUST document and verify the Git topology expectation that the Delivery branch Final commit is merged to main with a merge commit rather than squash/rebase. F1 MUST NOT automatically perform provider merge operations.

#### Scenario: branch deletion does not erase admitted Delivery Final ancestry
- **WHEN** Delivery Final is merged using a multi-parent merge commit
- **AND** the Delivery branch ref is later deleted
- **THEN** the Delivery Final commit MUST remain reachable as an ancestor of main merge history
