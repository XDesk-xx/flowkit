## Context

See `proposal.md` and the approved Explore generation `20260815-202-revise-explore`. H1 is a post-G1 corrective Change inside the same 02 Delivery. G1/E1 are already archived historical facts and MUST NOT be reopened. Current production lifecycle semantics are not the problem: the defects are in test fixture temporal coupling and in the physical execution mapping of an already selected OpenSpec runtime check.

Owner Contract Reset after failed `20260815-206-apply` supersedes only the 204 Change/Delivery verification boundary: H1 Apply terminates at formal Change Verification; repository-wide Delivery Full Test remains after H1 archive + checkpoint and independent Owner authorization. All other approved design decisions remain unchanged.

The approved Explore proved five constraints that are fixed inputs for this design:

1. G1 post-archive failures are caused by test fixture reads from the former active G1 OpenSpec root; an immutable point-in-time source restores all seven G1 E2E scenarios.
2. Historical E1 real-OpenSpec conformance cannot be fixed by swapping active path for archive path, because comparing historical E1 delta completeness to post-E2 current canonical specs violates point-in-time authority.
3. `tests-openspec-runtime` currently owns the relevant logical scope but its physical resolver omits `tests/integration/openspec-1-7-real-cli.test.ts`; executable context is already available through `ExecuteVerificationSelectionInput.openSpecAdapter`.
4. H1 Manifest growth from 10 to 11 Changes exposes a stale current-corpus assertion in `a1-write-service.test.ts`; production A1/reader semantics remain correct.
5. In a clean same-environment proof, test-local reusable real-CLI boundary snapshots preserve 7/7 G1 coverage while reducing real CLI child processes 79→63 and G1 wall 79.786s→72.76s; public `test:full` remains 792/792 terminal PASS and improves 134.82s→131.91s without runner changes.

## Goals / Non-Goals

**Goals:**

- make G1 and historical OpenSpec fixtures independent from the repository's current active-Change lifecycle;
- preserve point-in-time historical authority instead of reading future current canonical completeness into historical deltas;
- close `openspec-runtime` logical→physical execution so the real OpenSpec target cannot be omitted or silently skipped;
- synchronize the current 02 corpus regression with the legitimately added H1 Change without weakening compatibility assertions;
- reduce repeated G1 lifecycle setup through test-local snapshots while retaining real process boundaries and the complete seven-scenario matrix;
- keep the exact Apply mutation surface bounded to the five paths proven in Explore.

**Non-Goals:**

- no production CLI, Policy, Formal Action, FormalFactReader, A1 service, OpenSpec adapter or archive-service change;
- no `scripts/verification.ts` rebatching/concurrency change;
- no module-map change;
- no reopening or rewriting E1/G1 archived facts or historical Runs;
- no cache platform, parallel scheduler, timeout policy, fixture registry or new persistent test authority;
- no Delivery Full Test/Finalize behavior and no 03 scope.

## Decisions

### 1. G1 fixture source is one explicit immutable archived point-in-time root

`tests/integration/g1-change-cli-end-to-end.test.ts` will stop reading `openspec/changes/change-cli-end-to-end-and-performance/**`. The test will use the known immutable archived G1 source `openspec/changes/archive/2026-08-15-change-cli-end-to-end-and-performance/**` as point-in-time fixture input.

The helper MUST NOT implement `active-or-archive` fallback, archive scanning or latest-match discovery. A historical fixture is test data, not a second OpenSpec lifecycle reader.

Alternative rejected: recreate an active G1 directory in the repository or dynamically discover whichever lifecycle path exists. That makes fixture correctness depend on current lifecycle state again and duplicates OpenSpec history interpretation.

### 2. Reusable G1 boundary snapshots are generated at test runtime by the real public CLI and exact-copied

Within `g1-change-cli-end-to-end.test.ts`, introduce test-local helpers for at most the two proven reusable boundaries:

```text
Explore-completed boundary
Approved-Proposal boundary
```

A template is generated once in a disposable repository by the same public CLI process path used by G1 acceptance. Targeted scenarios exact-copy that repository snapshot into their own isolated temp root, then continue through the scenario's real public CLI boundary.

The complete happy lifecycle MUST still start from the base fixture and run through archive/checkpoint readiness without using a pre-completed lifecycle snapshot. Archive/recovery, Verification failure, authority blocker, stale-target and future-Delivery assertions remain real-process tests.

Snapshots are ephemeral test runtime data only. They are not checked into the repository, not persisted by Flowkit and not a new lifecycle authority.

Alternative rejected: replace repeated setup with in-process `runCli()` calls. That reduced subprocess count further in proof but weakens the real process boundary and is unnecessary after the bounded snapshot proof passed.

### 3. Historical real OpenSpec conformance becomes self-contained synthetic point-in-time data

`tests/integration/openspec-1-7-real-cli.test.ts` will no longer copy E1 from either its former active path or its archived path and compare its historical delta to current canonical requirements.

For the historical MODIFIED/archive-sync conformance case, the test itself will construct the smallest canonical capability baseline and matching `MODIFIED Requirements` delta needed to prove OpenSpec 1.7 behavior. The assertions are limited to that point-in-time scenario set and real validate/archive semantics.

Historical E1 Run/selection compatibility remains owned by existing E2 historical compatibility tests; this real-CLI conformance test does not become a historical migration oracle.

Alternative rejected: copy the archived E1 delta and relax the current-canonical completeness assertion. That still couples an external-tool conformance test to one historical product Change and blurs which authority owns historical compatibility.

### 4. `tests-openspec-runtime` physical Node execution includes the real integration target and receives the existing adapter executable

Change `logicalNodeSelectors('tests-openspec-runtime')` in `src/verification/change-selection/evidence.ts` to include:

```text
tests/integration/openspec-1-7-real-cli.test.ts
```

When any Node logical scope includes `tests-openspec-runtime`, the union/deduped Node `runCommand` environment will additionally provide:

```text
FLOWKIT_OPENSPEC_BIN = input.openSpecAdapter.executable
```

The executable is therefore the same executable identity already selected by the current Verification/OpenSpec adapter operation. It is not independently discovered and is not persisted as new selection authority.

This environment propagation may be applied to the whole compatible Node union because unrelated tests ignore the variable. Logical check identity, selection fingerprint and module ownership remain unchanged.

Alternative rejected: teach the integration test to discover `openspec` from PATH. That creates a second executable-selection rule and can silently test a different binary than formal Verification.

### 5. Verification regression proves omission, skip and failure cannot be hidden

Extend `tests/unit/verification/change-selection/evidence.test.ts` with a closed `openspec-runtime` selection fixture and disposable physical files that prove:

- the generated command includes `tests/integration/openspec-1-7-real-cli.test.ts`;
- a failing sentinel in that target makes `tests-openspec-runtime` evidence fail even when sibling unit targets pass;
- the child test process receives `FLOWKIT_OPENSPEC_BIN` equal to the supplied adapter's `executable`.

The regression MUST use the existing `executeVerificationSelection` public execution surface. It must not assert only the selector array implementation.

### 6. Current 02 corpus count remains exact, not weakened

Update `tests/unit/services/a1-write-service.test.ts` so its current 02 Delivery expectation is 11 Changes and includes H1's explicit `architectureImpact=false` where the test enumerates current explicit values. Keep the legacy eight missing-value compatibility assertions and D2/E2 explicit-false assertions intact.

Alternative rejected: use `>=10`, ignore the new Change or modify production reader behavior. The test intends to detect current corpus drift, so the current expected corpus must be exact.

### 7. Performance acceptance is structural and comparative, not an absolute wall-clock gate

Apply must retain the same seven G1 scenarios and record the real CLI child-process count. The optimized candidate MUST not exceed the correctness-only baseline count of 79; the approved proof demonstrates 63 is feasible. Wall-clock values are observations, not brittle absolute assertions.

H1 Apply MUST stop at Change Verification: the selected/focused/affected correctness checks, real OpenSpec physical coverage and the bounded process-count performance regression must pass without deleting required cases, enlarging timeout, changing concurrency or skipping required real OpenSpec coverage. `public test:full` is not a Change-level acceptance and MUST NOT be required or executed as part of H1 Apply; after H1 archive + checkpoint makes the Delivery ready, formal Delivery Full Test remains a separate Owner-authorized Delivery behavior.

## flowkitMutationScope

```json
{
  "schemaVersion": 1,
  "actions": {
    "apply": {
      "selectors": [
        { "kind": "exact", "path": "openspec/changes/historical-fixture-and-test-performance-correction/tasks.md" },
        { "kind": "exact", "path": "openspec/changes/historical-fixture-and-test-performance-correction/verification.md" },
        { "kind": "exact", "path": "src/verification/change-selection/evidence.ts" },
        { "kind": "exact", "path": "tests/integration/g1-change-cli-end-to-end.test.ts" },
        { "kind": "exact", "path": "tests/integration/openspec-1-7-real-cli.test.ts" },
        { "kind": "exact", "path": "tests/unit/services/a1-write-service.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/evidence.test.ts" }
      ]
    },
    "revise-apply": {
      "selectors": [
        { "kind": "exact", "path": "openspec/changes/historical-fixture-and-test-performance-correction/tasks.md" },
        { "kind": "exact", "path": "openspec/changes/historical-fixture-and-test-performance-correction/verification.md" },
        { "kind": "exact", "path": "src/verification/change-selection/evidence.ts" },
        { "kind": "exact", "path": "tests/integration/g1-change-cli-end-to-end.test.ts" },
        { "kind": "exact", "path": "tests/integration/openspec-1-7-real-cli.test.ts" },
        { "kind": "exact", "path": "tests/unit/services/a1-write-service.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/evidence.test.ts" }
      ]
    }
  }
}
```

## Risks / Trade-offs

- **[Risk] archived G1 fixture is mistaken for runtime lifecycle discovery** → Use one literal point-in-time test source only; no active/archive fallback or scanning helper.
- **[Risk] reusable snapshots hide setup behavior** → Keep one full happy lifecycle from base and require every targeted scenario to cross its actual boundary via the real CLI process.
- **[Risk] snapshot copy leaks mutable state between tests** → Templates are immutable after creation; each scenario exact-copies into its own disposable root and cleans it independently.
- **[Risk] real OpenSpec integration increases selected Node union cost** → It is required physical coverage; use existing union/dedupe execution and do not create another process per logical module.
- **[Risk] propagated executable accidentally becomes selection identity** → Keep it only in child execution env; selection/catalog fingerprints remain unchanged.
- **[Risk] performance fluctuates by host** → Gate H1 on the seven-scenario targeted coverage, formal Change Verification and deterministic child-process-count non-regression; report wall time as observation. Repository-wide `test:full` remains a Delivery Full Test concern after checkpoint and Owner authorization.

## Migration Plan

No production schema, persisted Run, Manifest schema or lifecycle migration is introduced. H1 only changes tests and the current physical Verification execution mapping. Existing historical E1/G1 artifacts remain immutable.

If Apply is rejected before checkpoint, rollback is ordinary candidate reversion within H1. No archived Change or historical Run needs migration or rewrite.
