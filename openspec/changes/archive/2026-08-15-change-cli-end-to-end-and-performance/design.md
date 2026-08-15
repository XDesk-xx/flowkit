## Context

See `proposal.md` and the approved Explore generation (`20260815-180-revise-explore`). The Base already owns the hard lifecycle semantics: Policy resolves the legal boundary; B1 prepares/resumes/admit results; Reviewer owns verdict/findings; Apply/revise-apply admission owns formal Change Verification publication; OpenSpec archive owns archive mutation; F1 owns checkpoint handoff. G1 must expose those capabilities through one operator surface without becoming the 03 Agent Adapter or a second workflow engine.

The Explore proofs established four design constraints that are treated as fixed inputs here:

1. current primitives are sufficient; missing work is CLI composition/E2E, not a new lifecycle state machine;
2. post-E2 exact pending Runs survive fresh checkout and future-Delivery-shaped use without chat/provider state;
3. G1 Verification closure requires the G1 E2E target to be added to both Catalog ownership and the physical `tests-cli` resolver;
4. performance work is observation-only unless a bounded correctness-preserving optimization has independent evidence.

## Goals / Non-Goals

**Goals:**

- provide a thin, process-testable Change CLI for one formal boundary at a time;
- keep Action preparation, exact resume and terminal admission inside existing services;
- make `review`/`revise` intent resolution preserve blocker authority;
- make `verify` read-only and keep Apply terminal Verification authority unchanged;
- execute real OpenSpec archive through the existing durable archive service;
- prove CLI E2E, future-Delivery genericity, selected physical Verification closure and bounded performance observation.

**Non-Goals:**

- no provider/Agent Adapter, session registry or `while(next)` runner;
- no Delivery Full Test/Finalize execution;
- no automatic checkpoint Commit/Push/Merge;
- no rewrite of Policy, B1 Run semantics, E2 Verification publication or F1 archive/checkpoint authority;
- no cache platform, parallel scheduler, generic evidence store or auto-review loop.

## Decisions

### 1. Keep `src/cli/main.ts` as dispatch and add one thin Change-action orchestration helper

Create `src/cli/change-action.ts` to own command-level composition and stable JSON output for Change operator commands. `main.ts` remains argument parsing/dispatch and delegates to the helper. The helper calls existing production services; it does not reimplement Policy or persistence.

Alternative rejected: place the entire orchestration in `main.ts`. This keeps file count lower but makes authority-sensitive prepare/resume/archive/result-admission branches harder to test independently.

Alternative rejected: create a generic Runner/service abstraction. That duplicates the future 03 single-action Agent Adapter scope and risks a second lifecycle engine.

### 2. Freeze action commands as two explicit modes: prepare/resume and `--result` admission

For `explore | propose | apply | review | revise`:

```text
flowkit <intent>
→ resolve formal boundary from current facts/Policy
→ if no pending Run: prepareNewExecution
→ if exact pending Run exists: resumeRun(expectedRunId)
→ stdout: stable JSON prepared/resumed view including Action Package
→ STOP

flowkit <intent> --result <logical-result.json>
→ locate current exact pending Run through the same formal context
→ resumeRun(expectedRunId)
→ assert pending formal action belongs to the invoked intent
→ parse logical Action Result input
→ admitActionResult(exact ActionPackage, logical result)
→ stdout: stable JSON admitted terminal view
→ STOP
```

Intent mapping is closed:

```text
explore → next must be explore
propose → next must be propose
apply   → next must be apply
review  → explicit review entry resolves review-explore|review-propose|review-apply
revise  → next must be revise-explore|revise-propose|revise-apply
```

The command never accepts a caller-supplied Formal Action name that can override Policy.

Alternative rejected: add a generic `flowkit result` command. Binding result admission to the same intent command keeps the human surface smaller and makes mismatched action/result fail-closed.

Alternative rejected: automatically call the next action after successful admission. That violates the single-action invariant and pre-implements 03 orchestration.

### 3. Exact pending Run identity wins over convenience

The CLI uses `prepareNewExecution` to discover whether a new Run is allowed. If it returns `exact-resume-required`, the CLI calls `resumeRun` for that exact runId. Result admission also starts from the persisted pending Run and its exact Action Package. Semantic drift, multiple pending Runs, a mismatched intent, stale external projection or terminal replay conflict propagate as failures; the CLI never allocates a replacement to recover convenience.

This preserves the approved future-Delivery/fresh-checkout proof boundary.

### 4. `review` and `revise` are intent aliases only

`review` uses the existing explicit review resolver through `prepareNewExecution(entry='review')`; it may produce a direct same-stage re-review when current authority permits. `revise` uses `entry='next'` and then asserts that the resolved action is one of the three Author revise actions. Therefore `changes-requested` with owner/verification/external blockers does not become revise.

No new `review` or `revise` Formal Action is added to the domain catalog.

### 5. `verify` is a read-only authority projection, not a second Verification execution path

`flowkit verify` consumes the same existing FormalFact/OpenSpec operation projection used by current lifecycle reads. It identifies the active Change from formal facts, requires a conflict-free structured OpenSpec projection for that Change, and discovers the `change-verification` artifact through the projected logical artifact/path fact. The CLI MUST NOT independently reconstruct `openspec/changes/<changeId>/verification.md` or maintain another Change-root rule.

The returned transport view contains the already-projected formal Verification status and, only when the projected authority artifact exists, may read that exact projected logical path to expose publication fields such as `selectionFingerprint` and selected logical check ids. Those fields are parsed from the authoritative `verification.md` publication; they are not persisted or recomputed by the CLI. Missing, ambiguous, or conflicting structured/formal projection fails closed rather than falling back to a guessed path. A valid projected artifact that does not yet exist is reported as the formal `not-run/unavailable` state without creating a substitute truth.

It does not call `executeVerificationSelection`, does not write `verification.md`, and does not create a Run. The only formal Change Verification execution/publication remains Apply/revise-apply terminal admission. This uses existing `FormalFactReader` / OpenSpec projection APIs from the already approved `src/cli/main.ts` + `src/cli/change-action.ts` implementation surface, so no Apply mutation-scope expansion is required.

Alternatives rejected:

- standalone truth-producing `flowkit verify`: would reopen E2 execution-time semantics and allow a second current Verification truth;
- CLI-local `openspec/changes/<changeId>` path construction: would duplicate OpenSpec/FormalFact path authority and drift from structured projection semantics.

### 6. `archive` is the only action command that owns its mechanical external mutation step

`flowkit archive` resolves `next=archive`, prepares/resumes that exact archive Run, then invokes `invokeOpenSpecArchive(repoRoot, actionPackage)`. Outcomes are handled as follows:

```text
success
→ admitActionResult(exact package, completed archive logical result)
→ STOP

terminal-failure
→ return terminal failure already recorded by archive service
→ STOP

recovery-required
→ keep same pending/recovery state
→ return recovery-required
→ STOP
```

The command never performs checkpoint Commit/Push. Existing `recover archive-terminal` remains the explicit recovery surface for durable archive ambiguity.

### 7. G1 process E2E uses disposable Git repositories and the real CLI entrypoint

Add `tests/integration/g1-change-cli-end-to-end.test.ts`. The fixture creates a minimal repository with real Manifest/OpenSpec/Run/Git facts and invokes `dist/bin/flowkit.js` (or the same production CLI entrypoint used by existing process tests) as a child process. Service-level fixtures may prepare exact contract inputs, but each acceptance boundary listed in the spec must be exercised through the CLI process itself.

The matrix is grouped so shared setup does not hide authority boundaries:

```text
happy lifecycle + result admission
review/revise authority matrix
pending/stale/exact-resume matrix
verification failure/closure matrix
real OpenSpec archive success/failure/recovery matrix
completed/checkpoint readiness/recognition matrix
fresh checkout + future Delivery identity matrix
```

No test depends on the live repository being G1 or on chat/provider state.

### 8. Close formal Verification to the new G1 E2E target

Update `src/verification/change-selection/module-map.ts` so the new G1 E2E path is owned by `cli-diagnostics` and remains related to `flowkit-change-cli-end-to-end-and-performance`. Update `src/verification/change-selection/evidence.ts` so `tests-cli` physically resolves `tests/integration/g1-change-cli-end-to-end.test.ts` in addition to the existing diagnostic/unit CLI targets.

Add/adjust module-map and evidence regressions with a sentinel/failure case proving that failure of the G1 E2E target fails selected `tests-cli` verification. Full-suite success is not a substitute for this selected-target proof.

### 9. Performance acceptance is a bounded observation attached to G1 verification/review, not a new durable authority

The G1 E2E/acceptance harness records in its execution output and final Author/Reviewer summaries:

```text
Action Package size
Run average size
prepare latency
exact resumeRun latency
focused / affected wall time
selected logical check count
OpenSpec process count
Review rounds
reopened finding count
```

Exact resume and `resume-context` remain separate metrics. Reopened finding count uses the approved lineage criterion and is not replaced by total review rounds. Tests may assert metric availability/non-negative values and bounded invariants, but MUST NOT use brittle absolute wall-clock thresholds as correctness gates.

A request-local optimization MAY only be implemented if it is local to the G1 CLI call, preserves output/authority exactly, and receives a dedicated regression. The default Apply plan contains no cache/scheduler optimization task.

### 10. Stable JSON output is a transport view, not a new authority

New mutating operator commands return one JSON object on stdout and errors on stderr with non-zero exit code. The JSON contains only current execution identity/status and, for prepare/resume, the Action Package required by the external executor. It is a transport view of persisted/formal facts and MUST NOT be persisted as a new session state by Flowkit.

Existing human-readable `status | next | doctor | resume-context` output remains unchanged unless an E2E compatibility fix is strictly required.

## flowkitMutationScope

```json
{
  "schemaVersion": 1,
  "actions": {
    "apply": {
      "selectors": [
        { "kind": "exact", "path": "openspec/changes/change-cli-end-to-end-and-performance/tasks.md" },
        { "kind": "exact", "path": "openspec/changes/change-cli-end-to-end-and-performance/verification.md" },
        { "kind": "exact", "path": "src/cli/change-action.ts" },
        { "kind": "exact", "path": "src/cli/main.ts" },
        { "kind": "exact", "path": "src/services/b1-run-execution-service.ts" },
        { "kind": "exact", "path": "src/verification/change-selection/evidence.ts" },
        { "kind": "exact", "path": "src/verification/change-selection/module-map.ts" },
        { "kind": "exact", "path": "tests/integration/diagnostic-cli-process.test.ts" },
        { "kind": "exact", "path": "tests/integration/diagnostic-cli.test.ts" },
        { "kind": "exact", "path": "tests/integration/g1-change-cli-end-to-end.test.ts" },
        { "kind": "exact", "path": "tests/unit/cli/change-action.test.ts" },
        { "kind": "exact", "path": "tests/unit/services/b1-run-execution-service.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/evidence.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/module-map.test.ts" }
      ]
    },
    "revise-apply": {
      "selectors": [
        { "kind": "exact", "path": "openspec/changes/change-cli-end-to-end-and-performance/tasks.md" },
        { "kind": "exact", "path": "openspec/changes/change-cli-end-to-end-and-performance/verification.md" },
        { "kind": "exact", "path": "src/cli/change-action.ts" },
        { "kind": "exact", "path": "src/cli/main.ts" },
        { "kind": "exact", "path": "src/services/b1-run-execution-service.ts" },
        { "kind": "exact", "path": "src/verification/change-selection/evidence.ts" },
        { "kind": "exact", "path": "src/verification/change-selection/module-map.ts" },
        { "kind": "exact", "path": "tests/integration/diagnostic-cli-process.test.ts" },
        { "kind": "exact", "path": "tests/integration/diagnostic-cli.test.ts" },
        { "kind": "exact", "path": "tests/integration/g1-change-cli-end-to-end.test.ts" },
        { "kind": "exact", "path": "tests/unit/cli/change-action.test.ts" },
        { "kind": "exact", "path": "tests/unit/services/b1-run-execution-service.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/evidence.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/module-map.test.ts" }
      ]
    }
  }
}
```

## Risks / Trade-offs

- **[Risk] CLI dual-mode commands become too clever** → Keep mapping closed, delegate all lifecycle decisions to `prepareNewExecution/resumeRun/admitActionResult`, and test mismatched intent/stale/pending states explicitly.
- **[Risk] `verify` is misunderstood as a rerun command** → Name remains required by G1, but output/help explicitly states `mode=projection`; no executor/publication call is reachable from that command.
- **[Risk] archive process crash leaves ambiguous external mutation** → Reuse the existing durable archive guard/recovery surface; never auto-retry.
- **[Risk] new E2E increases affected verification cost** → Aggregate it under existing `tests-cli` execution and observe cost; do not create a new process per module/check unless required.
- **[Risk] wall-clock performance numbers are noisy** → Treat timing as observation, record measurement method/sample and avoid strict absolute thresholds.
- **[Trade-off] no generic `result` command** → A small amount of dispatch duplication is accepted to keep result admission visibly bound to the user's current intent.

## Migration Plan

No schema or persistence migration is introduced. The existing CLI gains new commands; existing diagnostic/write/recovery commands retain their behavior. New G1 tests and Verification Catalog mappings activate with the same Apply bytes. Rollback is ordinary Git reversion of G1 implementation before checkpoint; no Run/history migration or compatibility rewrite is required.
