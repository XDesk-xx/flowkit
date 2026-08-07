# Action: revise-apply

- Run: `20260806-128-revise-apply`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q1 execution-model-correction`
- Role: author
- Source Review: `20260806-127-review-apply` (`changes-requested`)

## Goal

Resolve all four Blocking Findings from `20260806-127-review-apply` with the
smallest safe production revision that makes the approved Q1 contract
unbypassable in the production API, Reader, and review-entry boundary:

- **Q1-RA-001** — Make the terminal-write entry point descriptor-driven.
  Callers provide only typed descriptors / tags / Run IDs; Core derives every
  applicable `ResultRef` from actual target bytes. Initial explore/propose
  unconditionally build the complete Core-expected produced set; `review-apply`
  unconditionally derives `verificationSummaryRef` from current `verification.md`.
- **Q1-RA-002** — Reader generation classification uses EXACT
  `sourceReviewRun` / `sourceReviewVerdict` / `reviewedRunId` lineage only
  (no Run-ID ordering inference); pending revise Runs open a bounded
  revision-window; verification generation uses the same exact lineage.
- **Q1-RA-003** — `review-explore` / `review-propose` entry validates the
  reviewed generation's current effective artifact set (and for review-propose
  the specs namespace exact-set) BEFORE the review Run is published, reusing
  the same shared lineage / effective-set semantics as Reader.
- **Q1-RA-004** — `schemaVersion` 2 `ResultRef.kind` is required and
  field-specific kind binding is exact equality (no legacy tolerance).

Owner-authorized extension (treated as part of Q1-RA-001 test fix, not extra
scope): split `tests/unit/persistence/q1-execution-model.test.ts` by long-term
product responsibility into module-level unit tests and cross-module execution
lifecycle / integration fixtures, instead of only renaming the file.

## Allowed work

- Modify Q1 production code under `src/persistence/` and `src/facts/` needed
  by Q1-RA-001 / Q1-RA-002 / Q1-RA-003 / Q1-RA-004.
- Refactor Q1 tests by product responsibility (module-level unit tests +
  cross-module lifecycle integration fixtures).
- Update `openspec/changes/execution-model-correction/verification.md`.
- Run focused + affected typecheck, lint, build, unit + integration tests.
- Run OpenSpec Change strict + canonical specs strict validation.

## Prohibited work

- Do not modify approved `explore.md` / `proposal.md` / `design.md` /
  delta `spec.md` contract artifacts (no contract change in this revision).
- Do not modify prior terminal Runs.
- Do not create an artifact snapshot / history store, Gate Registry, or second
  authority.
- Do not run Delivery Full Test.
- Do not archive, checkpoint, commit, push, or create a reviewer Run.

## Required output

A revised Q1 apply implementation that closes Q1-RA-001 / Q1-RA-002 /
Q1-RA-003 / Q1-RA-004, with tests reorganized by product responsibility, ready
for an independent `review-apply`.
