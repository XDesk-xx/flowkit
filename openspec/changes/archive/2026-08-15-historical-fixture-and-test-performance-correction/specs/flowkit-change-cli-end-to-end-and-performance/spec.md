## MODIFIED Requirements

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
