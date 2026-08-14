## 1. Generic Verification Catalog

- [x] 1.1 Replace E1-specific path/capability/physical-command selection data with a source-controlled closed Catalog that maps ownership, reverse dependencies, capability relations and stable logical check ids.
- [x] 1.2 Resolve `openspec-current-change-strict` through formal current `changeId` / OpenSpec structured projection; remove fixed E1 Change/path/command literals from current selection/execution.
- [x] 1.3 Use canonical Catalog content fingerprint as point-in-time selection identity when needed; do not add `catalogGeneration` or any Catalog version lifecycle.
- [x] 1.4 Add deterministic synthetic-change-a / synthetic-change-b / F1-shaped / G1-shaped selection coverage, including zero/multi-match and capability mismatch fail-closed cases.

## 2. Historical E1 bounded compatibility

- [x] 2.1 Preserve historical E1 Run and sidecar bytes immutable; latest reader recognizes only the bounded historical shapes that actually exist in repository history plus the post-E2 current structural shape.
- [x] 2.2 Remove future/current Catalog comparison from historical selection validation; validate historical persisted shape, internal/content fingerprints, evidence/result binding and point-in-time `verification.md` fingerprint only.
- [x] 2.3 Stop requiring historical Markdown regeneration for integrity. Existing historical renderer/schema discriminator fields may be read as bounded legacy fields but E2 must not add new renderer/schema generations.
- [x] 2.4 Add regression proving historical 127/133-shaped terminals remain readable after current Catalog and current publication implementation change, without rewriting historical Runs.
- [x] 2.5 Rename canonical verification authority Requirement identity away from the pre-E2 `verification-selection record` sidecar name while preserving all historical scenarios and bounded legacy facts.

## 3. E2 self-migration on current runner

- [x] 3.1 Keep E2 Apply/revise-apply entry/resume on the current pre-E2 runner/persistence protocol until recognized E2 checkpoint; do not self-activate the prospective writer from production code presence alone.
- [x] 3.2 Make E2's current Apply/revise-apply use generic current-Change selection and deterministic verification publication while temporarily reusing only the already-existing sidecar physical protocol required by the current runner.
- [x] 3.3 Do not introduce a new selection/evidence schema generation, renderer generation, Context generation or ActionPackage generation for E2 migration; bind E2 point-in-time verification through persisted content fingerprints and the existing terminal binding.
- [x] 3.4 Cover E2 current-run crash/replay for Action mutation, verification execution, Markdown publication before result, and equivalent/conflicting terminal replay.

## 4. Prospective three-file current writer

- [x] 4.1 Implement post-E2 current `context.json` structural shape with canonical Git Base + lexical compact entry delta + mutation declaration/applicable fact identity embedded in the Run; do not create `entry-workspace.json`.
- [x] 4.2 Implement post-E2 `result.json` compact terminal binding for actualChangeSet/selection, selected logical check ids, Catalog content fingerprint, selection fingerprint, verification status and `verification.md` publication fingerprint; do not create selection/evidence sidecars.
- [x] 4.3 Make latest reader structurally distinguish the post-E2 current shape from the bounded pre-E2 historical shapes and fail closed on ambiguous/mixed/unknown shapes. E2 is not authorized to introduce a new `formatVersion`; if structural discrimination proves impossible, return to Proposal instead of inventing a component version.
- [x] 4.4 Prove every prospective Run directory contains only `action.md`, `context.json`, and terminal `result.json`, with `verification.md` remaining Change-owned.
- [x] 4.5 Gate prospective writer activation exclusively on recognized E2 Change Checkpoint; F1 is the first formal post-E2 consumer/dogfood.
- [x] 4.6 Rename canonical ActionPackage Requirement identity away from the `ActionPackage v2` component-version name without introducing any replacement version-family identity.
- [x] 4.7 Make the E2 checkpoint a bounded self-migration guard only: repositories containing the Flowkit pre-E2 migration lineage stay legacy before checkpoint and three-file after it; fresh/downstream repositories without that lineage default to the current three-file writer without a fake checkpoint.

## 5. Affected execution and test isolation

- [x] 5.1 Aggregate compatible logical affected scopes, resolve test files, lexical union/dedupe them, and execute one compatible Node test process instead of one process per module scope.
- [x] 5.2 Create lifecycle-independent `synthetic-change-a`, `synthetic-change-b`, and `historical-e1` fixtures; remove tests that depend on `process.cwd()` containing an active E1 Change.
- [x] 5.3 Add regression for the formal dependency graph `E1 → E2 → F1 → G1`: E2 incomplete prevents F1 intended activation; E2 completed + recognized checkpoint makes F1 the first post-E2 consumer.
- [x] 5.4 Update `tests/integration/e1-change-verification-selection.test.ts` so historical E1 explicitly models the pre-E2 Flowkit migration lineage without an E2 checkpoint; add fresh/downstream consumer regression proving no fake migration checkpoint is needed.

## 6. Crash/recovery and authority regression

- [x] 6.1 Cover all five 136 Explore crash points with the E2 current-run path and prospective three-file path; undeclared mutation, Base drift, Owner/contract drift and ambiguous persistence shape must fail closed.
- [x] 6.2 Prove pending `verification.md` publication never becomes satisfied Verification without matching terminal binding, while completed historical terminal replay does not read future current Markdown or future Catalog.
- [x] 6.3 Prove revise-apply successor publication becomes the current lineage while earlier Apply/sidecar/result facts remain immutable point-in-time history.

## 7. Verification and quality

- [x] 7.1 Run focused E2 verification, affected verification, typecheck, lint and build; all selected checks must pass.
- [x] 7.2 Run OpenSpec strict validation for E2 and canonical specs; use disposable archive/sync probe to confirm every MODIFIED/RENAMED delta preserves required canonical scenarios.
- [x] 7.3 Confirm `git diff --check` and quality hard guards pass and that Change Verification did not exercise Delivery Full Test lifecycle authority.
- [x] 7.4 Confirm no new internal component version family, Registry, generic migration framework, schema platform, Evidence ledger, cache platform or F1/G1/03 implementation entered E2.
