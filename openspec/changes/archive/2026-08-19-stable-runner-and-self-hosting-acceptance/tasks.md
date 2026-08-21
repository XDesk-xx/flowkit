## 1. Public read-only checkpoint handoff

- [x] 1.1 Extend `prepareCheckpointBoundaryHandoff()` to derive and return exact `baseRevision`, sorted current candidate paths, and per-path EOF-only normalization operations from repository/formal facts while keeping the service read-only.
- [x] 1.2 Bound candidate derivation to the current Delivery Manifest, current Change Run corpus, unique archived OpenSpec Change tree, archived delta→canonical spec mappings, and final approved Apply/revise-apply MutationDeclaration selectors; fail closed on unrelated dirty/index paths.
- [x] 1.3 Add EOF hygiene classification so only redundant terminal blank lines become `collapse-redundant-eof-blank-lines + ensure-exactly-one-final-newline`; trailing spaces/tabs, internal/semantic drift or unsupported broad formatting fail closed.
- [x] 1.4 Expose `flowkit checkpoint-handoff --delivery <id>` as a JSON read-only CLI facade with no write options; prove the command leaves worktree/index/history/Owner facts/Run corpus unchanged.
- [x] 1.5 Extend checkpoint handoff unit regressions for exact G1-shaped candidate closure, unrelated dirty path, non-EOF hygiene, empty/non-empty index, exact Owner binding and deterministic subject/trailers/preflight.

## 2. Stable runner fresh-consumer acceptance

- [x] 2.1 Build a local Flowkit distribution from the H1 candidate and install it into an independent temporary consumer without using a registry or the source workspace `node_modules`; record the installed package root used by the E2E.
- [x] 2.2 From that installed distribution, execute `--version`, diagnostics/resume and every already-public Flowkit-owned lifecycle surface needed by the H1 fixture (create/activate, Owner record, Change Action prepare/admit/archive, architecture render/compare, Delivery Full Test/Finalize/final-handoff and checkpoint-handoff as applicable) against a fresh target checkout using exact managed `FLOWKIT_HOME` OpenSpec/Archify distributions only.
- [x] 2.3 Add a guard/assertion proving the H1 target does not execute Flowkit-owned lifecycle steps from source workspace `src/**`, source `dist/**` or source `node_modules`; source harness is limited to fixture/external-role inputs, assertions and authorized Executor Git mechanics.
- [x] 2.4 Record package compressed/unpacked/file-count and runner entry timing observations in test/report output only; do not add durable telemetry state or Policy gates.

## 3. Future-Delivery-shaped self-hosting E2E

- [x] 3.1 Add the minimal source-controlled H1 fixture/support needed to create a different future-shaped disposable Delivery with architecture impact and at least two normal Changes; once the independent consumer is installed, use that installed distribution as the Flowkit execution subject for the whole fixture.
- [x] 3.2 Form fixture Current/Planned JSON as bounded external authoring input, then consume the existing installed Flowkit architecture render boundary plus exact managed Archify validation contract; prove HTML remains disposable/non-authoritative and do not introduce a new architecture-authoring CLI.
- [x] 3.3 Execute both Change lifecycles through review/apply/Verification/archive using the installed Flowkit CLI/runner surfaces; at least one Change Action must consume G1 `runSingleActionAgent()` from the independent consumer's installed built `dist` artifact (not source `src/**`) and prove one provider invocation + return-control/no-next-Run.
- [x] 3.4 Record explicit Owner checkpoint authorization through the installed owner surface; for each checkpoint consume the installed public read-only checkpoint handoff and let only the Executor fixture perform allowed EOF normalization, preflight, stage and Git Change Checkpoint mechanics; verify no Checkpoint Run/Adapter/automatic Owner authority exists.
- [x] 3.5 Reach Delivery Ready, record explicit Owner Full Test authorization through the installed Flowkit surface, execute installed Delivery Full Test with no Run, and require PASS before architecture Actual/Compare.
- [x] 3.6 Independently author the fixture Actual from the final fixture repository as external authoring input, run exact managed Archify validation and installed Flowkit architecture render/compare boundaries, bind architecture acceptance/SystemArchitectureRef source through existing authority, and keep the real 03 Actual absent.
- [x] 3.7 Record explicit Owner Finalize authorization and execute Finalize/final-handoff through the installed distribution, let the Executor fixture form the Delivery Final Git boundary, then fresh-clone and prove deterministic resume/final history authority using the same installed distribution with no chat/session/source-workspace runtime dependency.

## 4. H1 Verification ownership and physical closure

- [x] 4.1 Add `flowkit-stable-runner-and-self-hosting-acceptance` to the closed Verification capability set and assign H1 production/test paths to existing modules without introducing a new logical check.
- [x] 4.2 Add `tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts` to the existing `tests-cli` physical resolver and update module-map/evidence regressions for unique ownership.
- [x] 4.3 Run production `buildVerificationSelection()` against the frozen expected H1 production/test paths and H1 delta capabilities; require `capabilityRelation=matched` and the existing dependency-closed logical checks.
- [x] 4.4 In a disposable copy, make the H1 integration target deterministically fail and prove the formally selected `tests-cli` physical route fails; restore the target before formal Verification.

## 5. Self-hosting acceptance and change verification readiness

- [x] 5.1 Run H1 targeted unit/integration regressions, `typecheck`, `lint`, `build`, managed OpenSpec/Archify representative checks and `git diff --check` without increasing timeout merely to hide process-heavy execution.
- [x] 5.2 Record H1 E2E observations: Action/review counts, prepare/resume latency, Run corpus size, OpenSpec/Archify process counts, Change Verification wall time, Delivery Full Test wall time, architecture render/compare wall time and longest phase.
- [x] 5.3 Run OpenSpec current/all strict validation and confirm the real 03 `actual.architecture.json` is still absent during H1 Apply/Verification.
- [x] 5.4 Complete formal H1 Change Verification so the selected physical resolver actually executes the H1 integration target; preserve 108 failed/retry Verification history under the existing authority model.
- [x] 5.5 Hand off to `review-apply` only after formal Verification authority is satisfied; do not execute real 03 Delivery Full Test, Actual/Compare, Finalize or Delivery Final inside H1 Apply.


## 6. Detached Verification physical-execution optimization（Owner Reset）

- [x] 6.1 Keep the existing `tests-cli` / `tests-execution` logical authorities but add H1-selected bounded physical-group execution in `evidence.ts`; each external command retains the existing 120s hard timeout and first failure fails the logical check.
- [x] 6.2 For H1 `tests-cli`, physically execute A1/B1, remaining diagnostic surfaces, every existing G1 Change/Adapter case and all 26 H1 formal phases; safely deduplicate only the weaker legacy npm-installed diagnostic smoke because H1 full installed-package acceptance supersedes it, while non-H1 behavior stays unchanged.
- [x] 6.3 For H1 `tests-execution`, execute the complete existing file/case set through short-lived workers, partitioning `b1-run-execution-service.test.ts` by existing suites/bounded case groups without changing source assertions or coverage.
- [x] 6.4 Add focused Verification routing regressions proving H1 full-branch failure and heavy execution-group failure propagate through the original logical checks, and prove the H1-only installed-smoke dedup does not affect non-H1 selection.
- [x] 6.5 Re-run detached production selection/formal Change Verification on the optimized current generation; require `tests-cli` and `tests-execution` PASS without timeout inflation, retain all prior 108 failed Verification publications/history, then proceed to review-apply only after the new current Verification authority is passed.
