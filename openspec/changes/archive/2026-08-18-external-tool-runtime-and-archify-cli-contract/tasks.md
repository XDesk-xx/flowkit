## 1. Managed external-tool runtime

- [x] 1.1 Add absolute/default `FLOWKIT_HOME` resolution and the closed `FLOWKIT_HOME/tools/{openspec,archify}` static descriptor model; do not introduce Registry/discovery/install lifecycle.
- [x] 1.2 Implement exact distribution SHA256 + package name/version + entrypoint validation and command+argsPrefix managed invocation with bounded fail-closed error codes.
- [x] 1.3 Add disposable/unit regressions for missing distribution, wrong hash, wrong package/version, missing entrypoint, relative/invalid `FLOWKIT_HOME`, valid poisoned-PATH managed resolution and source/tag wrapper-name irrelevance.

## 2. OpenSpec managed migration and compatibility

- [x] 2.1 Migrate default OpenSpec production invocation to managed `FLOWKIT_HOME` command+argsPrefix while keeping explicit/injected executable compatibility.
- [x] 2.2 Preserve `FLOWKIT_OPENSPEC_BIN` and historical POSIX/Windows `.ps1`-first/`.cmd` fallback only when managed identity is unavailable; malformed managed home MUST fail closed instead of falling through.
- [x] 2.3 Update nested Change Verification/archive-sync/verify-retry/full-test technical env propagation so managed route carries `FLOWKIT_HOME` and legacy route carries exact `FLOWKIT_OPENSPEC_BIN` only as needed; explicitly migrate `tests/unit/cli/change-action.test.ts` so its canonical managed retry case does not require legacy env.
- [x] 2.4 Re-run existing real OpenSpec 1.7 archive/recovery/retry/Windows launcher regressions and add counterfactuals proving no nested ambient-identity drift; keep a separately-labelled `FLOWKIT_OPENSPEC_BIN` retry case only as compatibility coverage, and prove managed `test:full` passes with that variable absent.
- [x] 2.5 Correct managed-vs-injected identity semantics: remove runner-presence executable inference; keep observational runners on normal resolver/managed identity; migrate fake/injected runner consumers to explicit `executable`/`invocation` seams without changing the approved precedence.

## 3. Archify exact CLI and generated artifact behavior

- [x] 3.1 Add thin `ArchifyCliAdapter` using only exact managed `archify@2.14.0` and support doctor, validate/deliver architecture|workflow|lifecycle, compare architecture; do not import Archify internals or add ambient override.
- [x] 3.2 Parse only bounded structured/process success semantics and fail closed on spawn/timeout/nonzero/malformed/incoherent outputs.
- [x] 3.3 Add exact offline physical fixtures proving doctor, validate, deliver, compare and architecture/workflow/lifecycle renderer execution against official `archify.zip` SHA256 `1b610a4d...`.
- [x] 3.4 Prove same JSON can regenerate the same HTML after deletion, compare receipt/JSON output coherence, and invalid generation does not get admitted as success or replace last-good artifact.
- [x] 3.5 Physically build and integrity-test a synthetic D1-shaped review ZIP from JSON+HTML+receipt outputs, while asserting it is transport only and no formal repository `architecture/**` asset is created.

## 4. Formal Verification closure

- [x] 4.1 Add `flowkit-external-tool-runtime` and `flowkit-integration-boundaries` to closed capability authority, add stable `tests-external-tools`, and freeze non-overlapping ownership: new Archify/shared-runtime unit tests under `tests/unit/external-tools/**`; existing `tests/unit/integrations/**` remain `openspec-runtime`; retry CLI test remains `cli-diagnostics`.
- [x] 4.2 Map `tests-external-tools` to the actual C1 physical integration/unit targets in the formal evidence executor; preserve downstream existing OpenSpec/verification dependency closure.
- [x] 4.3 Add module-map/evidence regressions proving representative external-tools/OpenSpec/CLI paths each have exactly one owner, a negative overlap counterexample for `tests/unit/integrations`, and a sentinel showing a broken managed Archify/OpenSpec physical route makes the formally selected check fail.
- [x] 4.4 Verify actual C1 candidate mutations all map to exactly one ownership module and every selected logical check reaches an actual physical file/command.
- [x] 4.5 Admit the Reset-only test-surface expansion for `tests/unit/services/b1-openspec-action-context.test.ts`, preserve its existing `execution` unique ownership, and prove the added mutation selects the physical `tests-execution` check without ownership overlap.

## 5. Apply quality / archive preflight

- [x] 5.1 Keep Apply mutations inside the approved `flowkitMutationScope`; required scope expansion MUST stop for Proposal authority.
- [x] 5.2 Run focused/affected tests, typecheck, lint, build, quality and current Change OpenSpec strict; these technical gates MUST NOT impersonate Delivery Full Test lifecycle authority.
- [x] 5.3 Run exact-candidate real OpenSpec archive-sync and post-archive canonical `--all --strict` validation before Review-Apply/Archive authority.
- [x] 5.4 Confirm `git diff --check`, no Tool Registry/installer/Archify vendoring/receipt database/new Action/Run, and no formal Current/Planned/Actual Architecture assets entered C1.
- [x] 5.5 Re-run formal Change Verification against the exact Reset Apply candidate and require physical closure for all selected checks, including OpenSpec real-process/runtime, archive, managed/legacy retry, G1 and Full Test environment regressions; preserve 035 failed Verification as immutable historical authority.
