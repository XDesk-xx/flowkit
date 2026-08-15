# flowkit-change-cli-end-to-end-and-performance Specification

## Purpose
为 Flowkit 提供跨 Change、跨 Delivery 可复用的完整 Change operator CLI，使人或外部 AI 能在不引入第二流程引擎的前提下准备、恢复并提交单个合法 Change Action，同时通过真实 CLI E2E、formal Verification closure 与成本观测证明长期可用性。
## Requirements
### Requirement: Change operator CLI MUST expose the complete single-boundary Change surface

Flowkit MUST expose `explore`、`review`、`revise`、`propose`、`apply`、`verify`、`archive` operator commands in addition to the existing diagnostic/write/recovery commands. `explore`、`review`、`revise`、`propose`、`apply` and `archive` MUST consume current formal facts and Policy before operating, and one CLI invocation MUST NOT automatically continue into a second Formal Action.

The CLI MUST NOT implement `while(next)`、approved-after-review auto-propose、changes-requested auto-revise、Delivery Full Test、Delivery Finalize、automatic checkpoint Commit/Push/Merge or provider/agent orchestration.

#### Scenario: one invocation stops at one Change Action boundary
- **WHEN** an operator invokes a Change Action command and the current boundary is admitted successfully
- **THEN** the CLI MUST return control after that one boundary
- **AND** MUST NOT automatically prepare the next Formal Action

#### Scenario: Delivery behavior does not become a Change CLI Action
- **WHEN** Policy reaches a Delivery Full Test or Delivery Finalize boundary
- **THEN** the Change operator CLI MUST NOT create a Standard Run for that Delivery behavior
- **AND** MUST leave the boundary to the Delivery execution model

### Requirement: Author and Reviewer commands MUST compose existing prepare, exact-resume and terminal-admission authority

`flowkit explore`、`flowkit propose` and `flowkit apply` MUST resolve `entry=next` and MUST proceed only when Policy resolves the exact corresponding Author action. `flowkit review` MUST resolve the explicit review entry. `flowkit revise` MUST proceed only when current Policy resolves one of `revise-explore | revise-propose | revise-apply`.

Without `--result <path>`, these commands MUST either prepare a new pending Run or exact-resume the one matching pending Run and MUST return the persisted Action Package identity needed by the external executor. With `--result <path>`, the command MUST exact-resume the current pending Run, validate that its formal action matches the command intent, and submit the logical Action Result through the existing Action Result admission service. The CLI MUST NOT fabricate a new Run to avoid semantic drift or a mismatched pending Run.

#### Scenario: prepare a new Author action
- **WHEN** Policy resolves `propose`
- **AND** no pending Run exists for the active Change
- **WHEN** the operator invokes `flowkit propose`
- **THEN** the CLI MUST prepare exactly one pending `propose` Run
- **AND** MUST return the persisted Action Package identity

#### Scenario: exact-resume an existing pending action
- **WHEN** the active Change has one valid pending `apply` Run
- **WHEN** the operator invokes `flowkit apply`
- **THEN** the CLI MUST exact-resume that Run
- **AND** MUST NOT allocate a replacement Run or new NNN

#### Scenario: admit the result against the exact pending Run
- **WHEN** a valid pending `review-propose` Run exists
- **AND** the operator invokes `flowkit review --result <path>` with a valid Reviewer logical result
- **THEN** the CLI MUST admit that result against the exact persisted Action Package
- **AND** MUST publish no additional lifecycle authority beyond the existing Reviewer Result contract

#### Scenario: mismatched command intent fails closed
- **WHEN** the current pending or Policy-resolved action is `propose`
- **AND** the operator invokes `flowkit apply`
- **THEN** the CLI MUST fail closed
- **AND** MUST NOT create, cancel, replace or terminalize the `propose` Run

### Requirement: review and revise intents MUST preserve blocker authority

`flowkit review` and `flowkit revise` are intent commands, not new Formal Actions. `review` MUST use the existing explicit review resolution and MAY create a same-stage direct re-review only when that resolution allows it. `revise` MUST use current Policy and MUST only admit an Author `revise-*` action. Owner、verification or external blocking authority MUST NOT be converted into Author revise by the CLI.

#### Scenario: non-author blocker rejects revise
- **WHEN** the latest Review is `changes-requested`
- **AND** all current blocking findings are owned by Owner, Verification or External authority
- **WHEN** the operator invokes `flowkit revise`
- **THEN** the CLI MUST fail closed without preparing a revise Run

#### Scenario: author blocker allows revise
- **WHEN** Policy resolves `revise-apply` because the current blocker is Author-actionable
- **WHEN** the operator invokes `flowkit revise`
- **THEN** the CLI MUST prepare or exact-resume the `revise-apply` Run
- **AND** MUST preserve the source Review lineage in the Action Package

### Requirement: verify MUST remain a read-only projection of formal Change Verification authority

`flowkit verify` MUST discover the current active Change's Change Verification status and authority artifact from the existing FormalFact/OpenSpec structured projection. It MUST NOT construct a Change verification path from a CLI-local `openspec/changes/<changeId>` rule. When the projected authority publication exists, the command MAY read that exact projected logical path to report published selection identity/logical check ids. It MUST NOT independently execute and publish a second Verification result, overwrite `verification.md`, create a Run, or change lifecycle state. Apply/revise-apply terminal admission MUST remain the authority that executes selected Change Verification and publishes its formal binding.

#### Scenario: verify reports current formal status through structured projection
- **WHEN** the current Change has a conflict-free FormalFact/OpenSpec projection whose projected Change Verification artifact exists
- **WHEN** the operator invokes `flowkit verify`
- **THEN** the CLI MUST report the projected formal Verification status and MAY report selection identity/logical check ids read from that projected authority publication
- **AND** MUST NOT reconstruct the Change-root path, rerun Verification or republish Verification

#### Scenario: verify before formal publication remains non-mutating
- **WHEN** the current Change has a valid projected Change Verification artifact path but no publication exists yet
- **WHEN** the operator invokes `flowkit verify`
- **THEN** the CLI MUST report the formal absence/not-run state deterministically
- **AND** MUST NOT create a substitute Verification truth

#### Scenario: missing or conflicting Verification projection fails closed
- **WHEN** the active Change's FormalFact/OpenSpec structured Verification projection is missing, ambiguous or conflicting
- **WHEN** the operator invokes `flowkit verify`
- **THEN** the CLI MUST fail closed
- **AND** MUST NOT fall back to constructing `openspec/changes/<changeId>/verification.md` or another guessed path

### Requirement: archive MUST use the existing durable OpenSpec archive execution contract

`flowkit archive` MUST operate only when Policy resolves the `archive` Formal Action. It MUST prepare or exact-resume the pending archive Run, invoke the existing OpenSpec archive service for that exact Action Package, and only admit completed archive terminal state after the durable archive service reports known success. Outcome-unknown or mutation-surface recovery states MUST remain pending/recovery-required under the existing archive recovery contract.

Archive completion MUST NOT automatically Commit、Push or create a Change Checkpoint. Checkpoint remains a Git boundary handled separately by Owner authorization and the existing checkpoint handoff/Executor contract.

#### Scenario: known-success archive can complete
- **WHEN** Owner archive authorization exists and Policy resolves `archive`
- **AND** OpenSpec archive returns durable known success with the required mutation-surface change
- **THEN** `flowkit archive` MUST allow the exact archive Run to become completed
- **AND** the Change MAY project completed according to the existing archive contract

#### Scenario: outcome unknown does not retry automatically
- **WHEN** the OpenSpec archive service returns outcome-unknown or recovery-required
- **THEN** `flowkit archive` MUST return recovery-required
- **AND** MUST NOT allocate a replacement archive Run or automatically retry the external mutation

#### Scenario: archive does not checkpoint
- **WHEN** archive completes successfully
- **THEN** the CLI MUST NOT automatically create a Git commit or push
- **AND** checkpoint readiness MUST remain a separate Git boundary fact

### Requirement: Change CLI MUST remain generic across Change and Delivery identities and exact checkout/resume

The operator CLI MUST discover repository/current Delivery/current Change from formal repository facts and MUST NOT hardcode the current G1/F1/E2 Change identity or `20260810-01-change-execution-loop`. A pending post-E2 Run committed to Git and reopened in a fresh checkout MUST exact-resume the same `deliveryId / changeId / action / role / runId / semanticInputFingerprint` using formal repository facts only.

#### Scenario: different Change identities use the same command composition
- **WHEN** two repositories expose different active Change identities under valid Delivery facts
- **THEN** the same Change CLI command MUST resolve each repository's own current Policy boundary
- **AND** MUST NOT depend on a specific Change literal

#### Scenario: future Delivery checkout resumes exact pending Run
- **WHEN** a future Delivery contains a persisted pending Standard Change Run
- **AND** the repository is reopened from a fresh checkout without chat/provider session state
- **THEN** the CLI MUST exact-resume the same pending Run identity
- **AND** MUST rely only on Git/OpenSpec/Manifest/Run formal facts

### Requirement: G1 CLI E2E MUST cover the complete Change lifecycle failure and recovery matrix

G1 MUST provide disposable-repository CLI-process E2E coverage for the normal Change lifecycle and the contract-required failure/recovery paths. At minimum the matrix MUST cover happy path、missing Owner activation、Author blocker、Owner blocker、Verification blocker、External blocker、direct re-review、no-op revise rejection、stale review target、pending Run exact resume、Change Verification failure、missing OpenSpec artifact、archive failure/recovery、archive success→completed、completed→checkpoint readiness、checkpoint recognition and fresh checkout/resume.

The E2E harness MUST exercise the public CLI process surface for the boundary under test rather than replacing G1 acceptance with only direct service calls.

#### Scenario: happy path completes through archive and checkpoint readiness
- **WHEN** a disposable repository supplies the required Owner and Reviewer facts and valid Author outputs
- **THEN** the CLI-process E2E MUST execute the Change from Explore through archive success
- **AND** MUST observe completed→checkpoint readiness without automatic Git checkpoint mutation

#### Scenario: authority blockers stop at the correct boundary
- **WHEN** the E2E fixture produces Owner, Verification or External blocking authority
- **THEN** the CLI MUST stop at that authority boundary
- **AND** MUST NOT create an Author no-op revise Run

### Requirement: G1 formal Verification selection MUST physically execute the CLI E2E target

Changes to the G1 CLI production/test surface MUST map deterministically through the source-controlled Verification Catalog to stable logical check ids. The selected `tests-cli` physical resolver MUST include the G1 CLI E2E test target, and the chain `actualChangeSet → module ownership → capability relation → logical check id → physical target → formal result` MUST fail closed when the expected target fails.

#### Scenario: G1 CLI E2E is a selected physical target
- **WHEN** current G1 `actualChangeSet` includes the CLI/E2E implementation surface
- **THEN** formal Change Verification MUST select the logical CLI check through the deterministic Catalog
- **AND** the physical CLI check MUST include `tests/integration/g1-change-cli-end-to-end.test.ts`

#### Scenario: failing E2E target fails selected Verification
- **WHEN** the selected G1 CLI E2E target fails in a disposable verification fixture
- **THEN** the formal selected Verification execution MUST fail
- **AND** a passing unrelated/full test command MUST NOT be used to claim closure for the selected target

### Requirement: G1 MUST observe execution cost without introducing a performance authority platform

G1 acceptance MUST record a bounded performance observation for Action Package size、Run average size、prepare latency、exact `resumeRun` latency、focused/affected verification wall time、selected logical check count、OpenSpec process count、Review rounds and reopened finding count. Measurements MUST distinguish exact resume from `resume-context` diagnostic latency and reopened findings from still-open finding recurrence.

The Change MUST NOT introduce a global cache platform、parallel scheduler、automatic Review loop or new evidence/receipt registry solely from these observations. Any optimization included in G1 MUST preserve current authority/correctness and be backed by a specific regression.

#### Scenario: required metrics are measured separately
- **WHEN** G1 acceptance captures performance observations
- **THEN** exact resume latency MUST be reported separately from `resume-context`
- **AND** reopened finding count MUST be reported separately from total Review rounds
- **AND** selected logical check count and OpenSpec process count MUST be recorded explicitly

#### Scenario: observation does not authorize platform expansion
- **WHEN** a metric shows non-zero or slow cost
- **THEN** G1 MUST NOT infer authority to add cache/scheduler/auto-review infrastructure without an independently proven current requirement
