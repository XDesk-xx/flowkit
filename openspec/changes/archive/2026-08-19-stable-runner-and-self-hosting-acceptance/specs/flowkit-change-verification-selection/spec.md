## ADDED Requirements

### Requirement: H1 stable-runner/self-hosting mutation family MUST have closed physical Verification coverage

H1 production/test mutations for the stable CLI checkpoint handoff, checkpoint exact-plan projection, H1 self-hosting fixture and Verification ownership/resolver wiring MUST be covered by the closed module/capability map. Formal H1 Change Verification MUST select an existing logical Node check whose physical resolver includes the H1 self-hosting integration target; running isolated A→G regressions or a repository-wide test command outside formal selection MUST NOT substitute for this physical closure.

#### Scenario: expected H1 change set has matched capability ownership
- **WHEN** expected H1 production/test paths are evaluated by the production Verification selection builder
- **THEN** capability relation MUST be `matched`
- **AND** every changed path MUST have one closed module owner
- **AND** selected checks MUST include the existing logical checks required by the actual dependency closure, including the H1 physical Node test route and `typecheck`

#### Scenario: H1 E2E target is physically executed
- **WHEN** formal H1 selected Node verification executes
- **THEN** its physical resolver MUST include `tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts` or an equivalently frozen H1-owned target
- **AND** the target MUST exercise stable-package/fresh-checkout and future-Delivery-shaped self-hosting acceptance rather than only unit stubs

#### Scenario: H1 sentinel failure propagates through formal selection
- **WHEN** a disposable copy makes the H1-owned integration target deterministically fail
- **THEN** the formally selected logical check MUST fail
- **AND** unrelated A→G/unit/full-suite PASS results MUST NOT be accepted as H1 physical closure


### Requirement: H1 detached formal Verification MUST bound process-heavy physical execution without weakening logical coverage

When `flowkit-stable-runner-and-self-hosting-acceptance` is part of the current selected capability set, Flowkit MUST keep the existing logical `tests-cli` and `tests-execution` authorities while executing their process-heavy physical targets as deterministic bounded command groups. Every physical command MUST keep the existing 120,000ms hard timeout and any timeout/non-zero/spawn failure MUST fail the owning logical check. The aggregate logical evidence MUST represent all executed groups and MUST NOT silently omit a required target merely to fit one shared process timeout.

#### Scenario: H1 tests-cli uses bounded physical groups and still executes full self-hosting
- **WHEN** formal H1 Change Verification selects `tests-cli`
- **THEN** A1/B1 diagnostics, existing G1 Change CLI cases, existing G1 Adapter cases, and all H1 formal self-hosting phases MUST be physically executed through bounded commands
- **AND** all results MUST aggregate into the single existing `tests-cli` logical evidence
- **AND** no H1 full-E2E branch MAY be skipped

#### Scenario: H1 safely deduplicates the weaker legacy installed-bin smoke
- **WHEN** H1 formal `tests-cli` already executes the candidate package through the independent installed-distribution full self-hosting branch
- **THEN** the legacy `diagnostic-cli-process` npm-installed-bin smoke MAY be omitted from that H1-specific physical union
- **AND** the remaining diagnostic real-process cases MUST still execute
- **AND** non-H1 `tests-cli` selection MUST retain its pre-H1 execution behavior

#### Scenario: H1 tests-execution preserves complete case coverage while bounding worker lifetime
- **WHEN** formal H1 Change Verification selects `tests-execution`
- **THEN** all existing selected execution files/cases MUST execute
- **AND** heavy suites MAY be partitioned into bounded file/suite/case commands
- **AND** no source test/assertion MAY be skipped or weakened as a substitute for the partition
- **AND** all physical outcomes MUST aggregate into one existing `tests-execution` logical evidence

#### Scenario: physical-group failure propagates to the original logical authority
- **WHEN** any bounded H1 `tests-cli` or `tests-execution` physical group deterministically fails, times out, or cannot be spawned
- **THEN** the owning logical check MUST be `failed`
- **AND** formal Change Verification MUST NOT publish `passed`
