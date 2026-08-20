# flowkit-change-cli-end-to-end-and-performance Specification

## Purpose
为 Flowkit 提供跨 Change、跨 Delivery 可复用的完整 Change operator CLI，使人或外部 AI 能在不引入第二流程引擎的前提下准备、恢复并提交单个合法 Change Action，同时通过真实 CLI E2E、formal Verification closure 与成本观测证明长期可用性。
## Requirements
### Requirement: Change operator CLI MUST expose the complete single-boundary Change surface

Flowkit MUST expose `explore`、`review`、`revise`、`propose`、`apply`、`verify`、`archive` Change operator commands in addition to the existing diagnostic/write/recovery commands. `explore`、`review`、`revise`、`propose`、`apply` and `archive` MUST consume current formal facts and Policy before operating, and one Change operator invocation MUST NOT automatically continue into a second Formal Action。

The Change operator surface MUST NOT implement `while(next)`、approved-after-review auto-propose、changes-requested auto-revise、Delivery Finalize、automatic checkpoint Commit/Push/Merge or provider/agent orchestration。A1 MAY add a separate `flowkit delivery full-test` Delivery operator command, but that command MUST consume a Policy `delivery-behavior: full-test` result, MUST NOT be interpreted as a Change operator/FormalAction, and MUST NOT create a Standard Run/NNN。

#### Scenario: one invocation stops at one Change Action boundary
- **WHEN** an operator invokes a Change Action command and the current boundary is admitted successfully
- **THEN** the CLI MUST return control after that one boundary
- **AND** MUST NOT automatically prepare the next Formal Action

#### Scenario: Delivery behavior does not become a Change CLI Action
- **WHEN** Policy reaches a Delivery Full Test or Delivery Finalize boundary
- **THEN** the Change operator CLI MUST NOT create a Standard Run for that Delivery behavior
- **AND** MUST leave the boundary to the Delivery execution model

#### Scenario: explicit Delivery Full Test operator remains no-Run
- **WHEN** `flowkit delivery full-test` is invoked while Policy returns exact `delivery-behavior: full-test`
- **THEN** the command MAY execute exactly that one Delivery behavior
- **AND** MUST NOT allocate Standard Run、Run ID 或 Delivery-wide NNN
- **AND** MUST return control after terminal publication

#### Scenario: Delivery Full Test operator 物理执行 persisted binding
- **WHEN** `flowkit delivery full-test` 在 authorized boundary 执行
- **THEN** MUST先读取 current Delivery exact `verification.fullTest.execution.kind`
- **AND** `kind=command` MUST继续使用 persisted command+args+launcherMode+timeout解析 single physical launch，并通过 `FLOWKIT_FULL_TEST_RESULT_PATH` 消费同一 child的 `flowkit-full-test-result-v1`；`npm-shim`平台 normalization保持既有语义
- **AND** `kind=bounded-command-plan` MUST在 current Flowkit process内调用 Verification-owned executable-plan/aggregator，根据 persisted logical id/resolverId/perTargetTimeoutMs解析 ordered physical targets，每个 child独立 bounded，MUST NOT spawn `npm run verify:full`、`verify:step full` 或其它覆盖完整 logical union的 long wrapper
- **AND** both kinds MUST remain one Delivery Full Test behavior/no Run/no NNN
- **AND** breaking persisted route、platform normalization、physical closure or structured/semantic result contract MUST使正式 selected A1 CLI/integration tests fail

#### Scenario: outcome-unknown transport blocker 不创建新 attempt

- **WHEN** `flowkit delivery full-test` 的 prior Windows attempt 已持久化 current `executionBlock.reason=outcome-unknown`
- **THEN** subsequent operator invocation MUST fail closed before spawning the Full Test binding
- **AND** MUST NOT创建 Run/NNN、terminal `failed` 或 fabricated resultRef

#### Scenario: bounded target transport error不发布 terminal result
- **WHEN** bounded operator任一 physical target返回 `spawn-failed|timed-out-cancelled|outcome-unknown` 或 resolver closure error
- **THEN** operator MUST return execution-error and MUST NOT fabricate `passed|failed` terminal result/ref
- **AND** `outcome-unknown` MUST retain/persist the existing execution safety block semantics

#### Scenario: heavy override 必须保持默认 case 语义闭合
- **WHEN** `full` resolver 用 static heavy override 替换某个 discovered test file 的默认执行方式
- **THEN** resolver MUST 显式证明该文件默认注册的 required test cases/selectors/assertion semantics 全部被 bounded targets消费，而不是仅证明 file path 出现在 partition union
- **AND** missing、overlap、title drift 或 branch drift MUST fail closed before any partial Full Test execution
- **AND** current H1 file MUST map its installed-runner diagnostics smoke to an independent bounded target and its future-Delivery E2E case to `FLOWKIT_H1_FORMAL_PHASE=1..26` bounded targets so the FORMAL_PHASE branch cannot silently delete the smoke case

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

Bare `flowkit verify` MUST continue to discover the current active Change's Change Verification status and authority artifact from the existing FormalFact/OpenSpec structured projection. It MUST NOT construct a Change verification path from a CLI-local `openspec/changes/<changeId>` rule. When the projected authority publication exists, bare `flowkit verify` MAY read that exact projected logical path to report published selection identity/logical check ids. Bare `flowkit verify` MUST NOT independently rerun Verification, overwrite `verification.md`, create a Run, or change lifecycle state.

An explicit `flowkit verify --retry` submode MAY execute and publish a new formal Change Verification authority only when the unique current Apply/revise-apply producer is already `completed`, current formal Verification is `failed`, and Core proves the current candidate is byte-identical to that producer's post-action candidate after excluding only Core-owned current Verification/history publication paths. `--retry` MUST remain Verification behavior rather than a Formal Action: it MUST NOT allocate a Run/NNN, mutate the Apply terminal result, manufacture revise-apply, change Policy, widen selection, or modify candidate product/contract bytes. It MUST reuse the same deterministic logical selection and current external-tool authority.

Before replacing current `verification.md`, retry MUST preserve the exact previous publication at a deterministic immutable history ref derived from the validated projected Verification authority directory and the previous publication SHA-256. The new current publication MUST link to the previous fingerprint/ref, the origin Apply run, origin Apply verification fingerprint, exact post-action candidate fingerprint and unchanged selection fingerprint. Repeated retries MUST form a finite chain. Missing/corrupt/cyclic history, candidate drift, selection drift, producer ambiguity or any non-`failed` current state MUST fail closed.

#### Scenario: verify reports current formal status through structured projection
- **WHEN** the current Change has a conflict-free FormalFact/OpenSpec projection whose projected Change Verification artifact exists
- **WHEN** the operator invokes bare `flowkit verify`
- **THEN** the CLI MUST report the projected formal Verification status and MAY report selection identity/logical check ids read from that projected authority publication
- **AND** MUST NOT reconstruct the Change-root path, rerun Verification or republish Verification

#### Scenario: verify before formal publication remains non-mutating
- **WHEN** the current Change has a valid projected Change Verification artifact path but no publication exists yet
- **WHEN** the operator invokes bare `flowkit verify`
- **THEN** the CLI MUST report the formal absence/not-run state deterministically
- **AND** MUST NOT create a substitute Verification truth

#### Scenario: missing or conflicting Verification projection fails closed
- **WHEN** the active Change's FormalFact/OpenSpec structured Verification projection is missing, ambiguous or conflicting
- **WHEN** the operator invokes `flowkit verify` or `flowkit verify --retry`
- **THEN** the CLI MUST fail closed
- **AND** MUST NOT fall back to constructing `openspec/changes/<changeId>/verification.md` or another guessed path

#### Scenario: explicit retry can supersede failed Verification on the exact same Apply candidate
- **WHEN** the unique current Apply/revise-apply Run is completed with a valid failed Verification terminal binding
- **AND** current `verification.md` is the valid current publication for that producer
- **AND** current candidate identity and deterministic selection exactly match the producing Apply post-action identity/selection
- **WHEN** the operator invokes `flowkit verify --retry`
- **THEN** Core MUST execute the same selected Change Verification against that exact candidate
- **AND** MUST preserve the previous publication exact bytes under immutable fingerprint-addressed Verification history before atomically publishing the new current authority
- **AND** MUST NOT create a Run, Formal Action, no-op revise or candidate mutation

#### Scenario: retry candidate or selection drift fails closed
- **WHEN** product/spec/test/contract bytes differ from the producing Apply post-action candidate, or deterministic selection no longer equals the origin selection fingerprint
- **WHEN** the operator invokes `flowkit verify --retry`
- **THEN** retry MUST fail closed before executing/publishing a superseding authority
- **AND** current failed `verification.md` and Apply terminal result MUST remain unchanged

#### Scenario: repeated retry preserves every superseded formal publication
- **WHEN** a previous explicit retry produced another failed current Verification publication for the same exact Apply candidate
- **WHEN** the operator invokes `flowkit verify --retry` again
- **THEN** Core MUST preserve that immediately previous publication under its own immutable content-fingerprint history ref
- **AND** the new publication MUST link to it while retaining the same origin Apply/candidate/selection identity
- **AND** Formal Reader MUST be able to validate a finite chain back to the original Apply terminal binding

#### Scenario: retry is not admitted outside verification-failed completed-Apply boundary
- **WHEN** current Verification is `passed`, `not-run`, `not-applicable` or unavailable, or the current Apply/revise-apply producer is pending/missing/ambiguous
- **WHEN** the operator invokes `flowkit verify --retry`
- **THEN** the CLI MUST fail closed
- **AND** MUST NOT publish a new Verification authority

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

The E2E harness MUST exercise the public CLI process surface for the boundary under test rather than replacing G1 acceptance with only direct service calls. Fixture inputs that represent an already completed/archived Change MUST be point-in-time test data and MUST NOT depend on that Change remaining active in the current repository lifecycle.

For performance-sensitive targeted scenarios, the harness MAY exact-copy reusable boundary snapshots only when those snapshots were produced by the same public CLI lifecycle in disposable setup and the scenario continues through the real public process boundary under test. At least one complete happy lifecycle MUST continue from the base repository through archive/checkpoint readiness, and snapshot reuse MUST NOT remove any required failure/recovery scenario.

#### Scenario: happy path completes through archive and checkpoint readiness
- **WHEN** a disposable repository supplies the required Owner and Reviewer facts and valid Author outputs
- **THEN** the CLI-process E2E MUST execute the Change from Explore through archive success
- **AND** MUST observe completed→checkpoint readiness without automatic Git checkpoint mutation

#### Scenario: authority blockers stop at the correct boundary
- **WHEN** the E2E fixture produces Owner, Verification or External blocking authority
- **THEN** the CLI MUST stop at that authority boundary
- **AND** MUST NOT create an Author no-op revise Run

#### Scenario: archived G1 remains a valid E2E fixture source
- **WHEN** G1 has been archived and checkpointed and its former active OpenSpec path no longer exists
- **THEN** the G1 E2E harness MUST still execute the complete required matrix from point-in-time fixture data
- **AND** MUST NOT recreate an active G1 Change or discover fixture content by scanning active/archive lifecycle locations

#### Scenario: targeted scenarios may reuse a real-CLI boundary snapshot
- **WHEN** a targeted G1 E2E scenario starts from a reusable Explore-completed or approved-Proposal boundary
- **THEN** that boundary snapshot MUST have been produced by the public CLI in disposable setup and exact-copied as test input
- **AND** the boundary actually under test MUST still execute through the real CLI process
- **AND** the complete happy lifecycle and required recovery/failure matrix MUST remain covered

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

Where repeated lifecycle fixture construction dominates process cost, test-local reuse MAY reduce duplicate CLI/OpenSpec subprocesses only if the before/after comparison uses the same correctness matrix, the optimized path reduces real CLI child-process count, and the H1 Change Verification path still proves the changed/affected correctness and required real OpenSpec physical execution without deleting required cases, skipping required real OpenSpec execution, enlarging timeout, or changing runner concurrency. Repository-wide `test:full` is Delivery Full Test scope and is not an H1 Change-level acceptance.

#### Scenario: required metrics are measured separately
- **WHEN** G1 acceptance captures performance observations
- **THEN** exact resume latency MUST be reported separately from `resume-context`
- **AND** reopened finding count MUST be reported separately from total Review rounds
- **AND** selected logical check count and OpenSpec process count MUST be recorded explicitly

#### Scenario: observation does not authorize platform expansion
- **WHEN** a metric shows non-zero or slow cost
- **THEN** G1 MUST NOT infer authority to add cache/scheduler/auto-review infrastructure without an independently proven current requirement

#### Scenario: fixture optimization preserves coverage and reduces duplicate process work
- **WHEN** reusable point-in-time boundary snapshots are introduced for targeted G1 E2E scenarios
- **THEN** the same seven-scenario correctness matrix MUST remain terminal PASS
- **AND** real CLI child-process count MUST be lower than the same-environment correctness-only baseline
- **AND** H1 formal Change Verification MUST pass without timeout/concurrency policy expansion or skipped required real OpenSpec coverage
- **AND** repository-wide `test:full` MUST remain outside H1 Apply and require the later Owner-authorized Delivery Full Test boundary
