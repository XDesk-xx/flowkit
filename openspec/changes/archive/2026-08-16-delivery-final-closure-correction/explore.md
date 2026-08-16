# Explore — delivery-final-closure-correction

## 1. Problem

02 Delivery 已完成 Q1→H1 的 Change lifecycle，并在 exact checkpoint Base
`1783983440e4d1b29d6282bc5c1af55d390f392d` 上进入最终 Delivery 收口阶段。
H1 checkpoint 后的 Owner-authorized canonical Windows Delivery Full Test 报告了 793 tests / 792 PASS / 1 FAIL：
G1 changed-surface archive recovery regression 将 OpenSpec executable 硬编码到 repo-local
`node_modules/.bin/openspec.cmd`，而 canonical machine 只有 PATH/global OpenSpec 1.7.0。

重新做 Delivery-level closure scan 后，发现该失败不是单点 Windows fixture，而是同一最终收口边界上的四类缺口：

1. OpenSpec executable 存在 nominal-vs-resolved / test-local discovery authority 分裂；
2. public Delivery Full Test 可以在 `FLOWKIT_OPENSPEC_BIN` 缺失时把整套 real OpenSpec conformance silent-skip 后仍返回 PASS；
3. current A1 regression 仍绑定 live 02 Manifest Change count，创建本 corrective Change 自身即导致 11→12 后失败；
4. real OpenSpec archive 稳定产生 EOF-only whitespace，当前 Bootstrap Executor 每次都需要额外向 Owner 请求“删除空行”，说明 checkpoint mechanics authority 未被产品 contract 表达。

本 Change 目标不是继续扩展 02 功能，而是关闭上述已知 Delivery Full Test / checkpoint closure defects，
使本 Change completed + checkpointed 后的下一次 Owner-authorized Delivery Full Test具备完整、无 silent-skip、跨环境成立的 acceptance boundary。

## 2. Current Facts

### 2.1 Exact repository facts

- Git Base: `1783983440e4d1b29d6282bc5c1af55d390f392d`。
- Branch: `delivery/20260810-01-change-execution-loop`。
- Base working tree clean。
- H1 `historical-fixture-and-test-performance-correction` 已 completed + checkpointed。
- Base Manifest 的 `delivery.fullTestStatus` 仍为 `not-ready`；该 exact snapshot 早于用户本地 Full Test projection 的持久化，因此本 Explore 不伪造 `failed` 到这个 Base。
- 用户提供的 canonical Windows Full Test 失败报告作为触发本 corrective Change 的 external/canonical evidence 使用，不冒充此 exact Base 已持久化的 Manifest fact。

### 2.2 Current I1 formal facts

Owner 已明确授权创建并激活：

- key: `I1`
- id: `delivery-final-closure-correction`
- required: `true`
- architectureImpact: `false`
- dependsOn: `historical-fixture-and-test-performance-correction`

Owner refs：

- create: `owner:434ec7365173b9a1fcbdbc59f6188ff33ed1f39201e1a5ea96f3081861f652af`
- activate: `owner:350a031040acad27fb58218bb1b7812eb5b2d36f6e5b62fed0230ca7f73a438e`

Formal Explore Run：`20260815-212-explore`。

### 2.3 Current external-tool facts

- OpenSpec 1.7.0 is the tested executable contract.
- Production `OpenSpecCliAdapter` already has Windows preference semantics: search all PATH entries for `openspec.ps1`, then fallback to `openspec.cmd`.
- `src/shared/external-command.ts` already owns real `.ps1` / `.cmd` launcher mechanics.
- Therefore this Change MUST NOT add a second launcher implementation and MUST NOT require adding OpenSpec as a repo-local devDependency merely to satisfy a test.

## 3. Scope Boundary

### In scope

- one resolved OpenSpec executable authority shared by adapter-backed runtime and Delivery verification consumers;
- remove G1 repo-local `node_modules/.bin/openspec(.cmd)` assumption;
- make public `test:full` physically execute real OpenSpec 1.7 conformance and fail closed rather than silent-skip;
- replace the real-OpenSpec POSIX-only counting shell wrapper with a platform-neutral injected runner while still spawning the real executable;
- replace live current-Delivery count fixture coupling with a stable point-in-time/synthetic temporal fixture while preserving exact semantic assertions;
- explicitly make EOF-only terminal whitespace normalization part of authorized checkpoint mechanics, bounded to redundant EOF blank lines / exactly one final newline;
- close Verification Module Map ownership for any newly changed verification executor path;
- preserve/measure performance; only adopt performance implementation if proof demonstrates bounded benefit;
- prove next corrective / future-Delivery-shaped consumers do not depend on 02 identity or local OpenSpec installation layout.

### Out of scope

- adding `@fission-ai/openspec` to `package.json` merely to make G1 pass;
- changing OpenSpec 1.7 source or vendoring/forking OpenSpec;
- new Registry / executable platform / cache platform / scheduler framework;
- changing Formal Action / Policy / Owner Full Test authority;
- reopening completed H1 or historical Changes;
- weakening exact assertions to `>=` / optional skip;
- broad formatter/prettier authority during checkpoint;
- automatic Git commit/push/checkpoint;
- changing test concurrency, global timeout, or process-heavy batching without performance proof.

## 4. Mandatory Risk Scan

| Risk | yes/no | Why |
|---|---|---|
| Scope expansion / missing prerequisite | yes | Delivery Full Test executor script is currently outside Verification Module Map ownership; checkpoint normalization also needs an explicit bounded authority contract. |
| Cross-time facts | yes | A1 test reads a live Delivery Manifest whose Change count grows when corrective Changes are created. |
| Schema / persistence migration | no | No Run/Manifest schema migration is required. |
| Self-hosting / writer changes itself | yes | `scripts/verification.ts` is part of the verification mechanism that will verify this Change. |
| Authority duplication | yes | G1, adapter `.executable`, verification script, and real suite currently derive/use OpenSpec executable differently. |
| Generic reusable subsystem | yes | executable resolution and checkpoint mechanics must survive next Delivery, not only 02. |
| Activation must persist across Change/Delivery boundaries | yes | corrected resolver/verification behavior is repository-global product behavior after checkpoint. |
| Candidate/formal-fact mutation affects existing consumers | yes | I1 Manifest insertion already changes current corpus 11→12; verification script mutation affects formal selection. |
| Verification selection must reach actual executed targets | yes | current Delivery Full Test can return PASS while real OpenSpec suite executes zero tests. |
| External tool performs real mutation | yes | OpenSpec archive mutates canonical specs and relocates Change artifacts. |
| Change claims performance improvement | no | This Change claims no optimization; it MUST avoid material regression and must not introduce unproved runner tuning. Performance proof remains mandatory per Owner request. |

## 5. Applicable Proofs

### Proof 1 — External Executable Authority Proof

**Question**

Can production OpenSpec invocation, formal Change Verification, G1 real-process coverage and Delivery Full Test consume one resolved executable identity rather than independent layout guesses?

**Acceptance Boundary**

A PATH/global OpenSpec 1.7 executable MUST be sufficient. No affected consumer may require repo-local `node_modules/.bin/openspec(.cmd)`. Windows `.ps1` preference / `.cmd` fallback MUST describe the executable actually invoked, not a nominal label.

**Method**

1. Inspect all active OpenSpec executable consumers.
2. Run current adapter through a deterministic Windows platform seam with cmd-only / ps1-only / both / explicit executable fixtures.
3. Run G1 with real OpenSpec available on PATH but remove repo-local `.bin/openspec*`.
4. Build a disposable shared-resolver prototype that extracts the adapter's current Windows resolution rule into a minimal `openspec-executable.ts`; both adapter and Delivery verification consume it, while actual `.ps1/.cmd` launch continues through existing `src/shared/external-command.ts`.

**Evidence**

Current Windows cmd-only counterfactual:

```text
adapter.executable        = openspec.ps1
actual invoked executable = <absolute PATH>/openspec.cmd
```

Thus current public `.executable` is nominal and is not a reliable authority for downstream propagation.

Current G1 with PATH OpenSpec present and repo-local OpenSpec absent:

```text
7 tests
6 PASS / 1 FAIL
failure = OPENSPEC_SPAWN_FAILED
```

Only the changed-surface archive recovery case fails because it constructs:

```text
<project>/node_modules/.bin/openspec(.cmd)
```

Disposable correction using the adapter's default resolver:

```text
7 / 7 PASS
```

Shared-resolver prototype:

```text
Windows cmd-only      -> absolute openspec.cmd
Windows ps1+cmd       -> absolute openspec.ps1
explicit executable   -> exact explicit value
POSIX                  -> openspec
```

Prototype TypeScript compilation PASS; adapter / resolver-related verification tests PASS.

**Evidence Boundary**

Covers production adapter invocation identity, G1 PATH-only real OpenSpec, Windows ps1/cmd precedence, and Delivery verification's ability to consume the same resolver without duplicating launcher semantics.

**Gap**

None for feasibility. Proposal must freeze exact source/test paths and keep the resolver minimal.

**Result: PASS for corrected design; current design FAIL.**

**Implication**

Do not install OpenSpec as a local devDependency merely to satisfy G1. Introduce exactly one small resolved-executable helper and reuse existing shared external-command launch semantics.

---

### Proof 2 — Cross-platform / Environment Counterfactual

**Question**

Does the corrected design work when repository-local OpenSpec is absent and when Windows exposes only one legal shim form?

**Acceptance Boundary**

At minimum:

- PATH/global OpenSpec + no repo-local `.bin`;
- Windows cmd-only;
- Windows ps1-only;
- Windows both (ps1 wins);
- explicit executable;
- POSIX PATH command.

Affected tests MUST not encode an uncontracted install layout.

**Method**

Use disposable PATH fixtures and injected platform seams; separately remove repo-local OpenSpec from a G1 disposable repository while keeping real 1.7.0 on PATH.

**Evidence**

- PATH-only G1 current: 6/7 FAIL one archive recovery case.
- PATH-only G1 corrected: 7/7 PASS.
- shared resolver returns cmd-only / ps1-preferred / explicit / POSIX identities as required.
- The current real OpenSpec suite contains a POSIX-only `openspec-count.sh` wrapper. This would become a new Windows failure once silent skip is removed.
- Feasible correction: use the adapter's injected `runner` to count args in memory and delegate to existing platform-aware `runCommand`; the real executable still spawns, but no `.sh` fixture is required.

**Evidence Boundary**

Covers the actual hidden Windows/local-install assumption that caused the canonical Full Test failure and the second POSIX-only fixture that silent-skip had hidden.

**Gap**

None for feasibility.

**Result: PASS for corrected design; current design FAIL.**

---

### Proof 3 — Delivery Full Test Physical Verification Closure Sentinel

**Question**

Can public Delivery `test:full` / `verify:full` return PASS while the required real OpenSpec conformance target never executes?

**Acceptance Boundary**

The frozen Delivery Full Test MUST physically execute `tests/integration/openspec-1-7-real-cli.test.ts`. A sentinel failure inside that target MUST make public Full Test fail. Missing executable propagation MUST fail closed rather than skip the suite.

**Method**

Construct a disposable reduced Full Test repository containing the real OpenSpec integration target, inject a guaranteed failure sentinel in its first case, and compare current behavior with/without `FLOWKIT_OPENSPEC_BIN`. Then prototype executable propagation in public `test:full` itself.

**Evidence**

Current behavior with `FLOWKIT_OPENSPEC_BIN` unset:

```text
OpenSpec 1.7 real CLI conformance # SKIP
# tests 0
# pass 0
# fail 0
# skipped 0
exit = 0
```

Current `verify:step full` on the same reduced fixture also reports:

```text
step: full status=passed
exit = 0
```

The sentinel never ran.

With resolved OpenSpec executable propagated:

```text
5 tests execute
4 PASS / 1 FAIL
sentinel observed
full step = failed
exit != 0
```

Corrected prototype makes `test:full` resolve and propagate OpenSpec before spawning the complete test corpus. The real suite itself fails fast if the variable is absent; it no longer owns a skip policy.

**Evidence Boundary**

Covers the actual public Full Test entry point, physical target execution and fail propagation, not merely logical check selection.

**Gap**

None for feasibility.

**Result: PASS for corrected design; current design FAIL.**

**Implication**

This is a blocking closure defect. Full Test must not be rerun as final acceptance until silent skip is removed.

---

### Proof 4 — Temporal / Lifecycle Fixture Proof

**Question**

Does creating a legitimate future corrective Change invalidate A1 regression purely because the live current Delivery contains one more Change?

**Acceptance Boundary**

A test for historical/current architectureImpact compatibility MUST preserve exact semantic counts at a stable point in time, while a future corrective Change with explicit `architectureImpact` can be appended without invalidating the historical assertion. Do not weaken exactness with `>=`.

**Method**

1. Create/activate I1 normally, producing the real 11→12 Manifest transition.
2. Run current A1 regression.
3. Build a synthetic point-in-time fixture with the same legacy semantic population, then append a future corrective Change.

**Evidence**

Current repository after legitimate I1 creation:

```text
a1-write-service.test.ts
22 tests
21 PASS / 1 FAIL
12 !== 11
```

Synthetic temporal prototype:

- historical fixture remains exact at 11;
- pre-A1 legacy missing `architectureImpact` remains exact at 8;
- known explicit current-era Changes remain explicit false;
- append one future corrective Change with `architectureImpact:false`;
- expanded count exact 12;
- legacy count still exact 8;
- future value preserved;
- conflicts = 0.

Result:

```text
22 / 22 PASS
```

**Evidence Boundary**

Covers this I1 creation and a later corrective Change-shaped expansion without binding the test to the live repository lifecycle.

**Gap**

None for feasibility.

**Result: PASS for synthetic point-in-time design; current live-count design FAIL.**

---

### Proof 5 — Archive → Checkpoint Real External Mutation Proof

**Question**

Is the repeated post-archive EOF whitespace issue a stable real OpenSpec mutation that can safely be treated as bounded checkpoint mechanics without a second Owner business authorization each time?

**Acceptance Boundary**

Using real OpenSpec 1.7 archive:

- reproduce the exact whitespace finding;
- normalization may only collapse redundant EOF blank lines and preserve exactly one final newline;
- semantic/internal content must not be reformatted;
- `git diff --check` and OpenSpec strict must pass afterwards;
- normalized bytes should equal the already accepted canonical H1 checkpoint where applicable;
- Owner checkpoint authorization remains required, but no second authorization is required solely for the approved deterministic EOF normalization.

**Method**

Reconstruct exact pre-H1-archive state in a disposable Git repository; invoke real `openspec archive ... --json --yes`; inspect diff; apply EOF-only pure normalization; validate again and byte-compare with Base `1783983`.

**Evidence**

Real OpenSpec 1.7 archive reproduces exactly:

```text
openspec/specs/flowkit-change-cli-end-to-end-and-performance/spec.md:195:
new blank line at EOF

openspec/specs/flowkit-change-verification-selection/spec.md:170:
new blank line at EOF
```

After EOF-only normalization:

```text
git diff --check = PASS
OpenSpec strict       = 17/17 PASS
```

Both normalized canonical spec files are byte-for-byte equal to the accepted current H1 checkpoint at Base `1783983`.

**Evidence Boundary**

Covers the real external archive mutation and the exact checkpoint normalization that already produced the accepted canonical bytes.

**Gap**

None for the bounded EOF rule. No evidence supports broad formatting authority.

**Result: PASS for bounded checkpoint-mechanics normalization; current authority expression INCOMPLETE.**

**Implication**

Proposal may add an explicit handoff/contract rule: an existing exact Owner `authorize-checkpoint` covers this deterministic EOF-only hygiene mechanic. Semantic edits, interior formatting, broad formatter output, or unrelated files still STOP.

---

### Proof 6 — Mutation Surface + Physical Verification Closure

**Question**

Can all required corrections be implemented and then formally verified without discovering unowned changed paths or logical-only false-green coverage at Apply time?

**Acceptance Boundary**

For every expected production/test mutation:

```text
actualChangeSet
→ exactly one Verification Module Map owner
→ logical check id
→ physical resolver
→ actual regression target
→ formal selected Verification result
```

No required path may zero-match the module map, and a direct behavior regression for a changed verification executor must not be omitted from the physical target set.

**Method**

1. Derive direct consumers from Proofs 1–5.
2. Prototype the minimum source-controlled module ownership extension for the public verification executor.
3. Extend the existing `tests-verification` physical resolver with the direct `verification-plan.test.ts` regression.
4. Enumerate the exact physical command emitted by `executeVerificationSelection()`.
5. Inject a disposable failing sentinel into `verification-plan.test.ts`; require the same formal selected `tests-verification` execution to fail, then restore the file and require the same selection to pass.
6. Run TypeScript and the affected module-map/evidence/verification-plan regressions.

**Evidence**

Current module selection for:

```text
scripts/verification.ts
```

fails with:

```text
VERIFICATION_MODULE_SELECTION_FAILED
Actual change path must map to exactly one verification module
```

The 212 prototype added exact ownership selectors for:

```text
scripts/verification.ts
tests/unit/verification/verification-plan.test.ts
```

to the existing `verification-selection` module. Reviewer 213 correctly identified that ownership alone was insufficient because current `logicalNodeSelectors('tests-verification')` did not physically execute `verification-plan.test.ts`.

214 disposable correction therefore also adds:

```text
tests/unit/verification/verification-plan.test.ts
```

to the physical `tests-verification` resolver in `src/verification/change-selection/evidence.ts`.

After that correction, both planned paths map exactly once:

```text
scripts/verification.ts
→ seed module: verification-selection
→ scopes: openspec-current-change-strict, tests-verification, typecheck

tests/unit/verification/verification-plan.test.ts
→ seed module: verification-selection
→ scopes: openspec-current-change-strict, tests-verification, typecheck
```

The formal product executor `executeVerificationSelection()` then emitted a physical Node command containing:

```text
tests/unit/verification/verification-plan.test.ts
```

alongside the existing E1/E2/affected/change-selection verification regressions.

Disposable same-selection sentinel proof:

```text
corrected physical resolver + original verification-plan.test.ts
→ tests-verification formal evidence = PASS

inject:
  I1 verification plan physical sentinel
  → assert.fail('I1-RE-001 sentinel')

same executeVerificationSelection()
same tests-verification logical selection
same physical resolver
→ formal evidence = FAILED

restore original verification-plan.test.ts
→ same formal selection = PASS
```

This is stronger than a targeted direct test run: the failure is observed through the same formal selected Verification executor whose closure I1 changes.

Supporting checks on the corrected disposable source:

```text
npm run typecheck                                           PASS
module-map + evidence + verification-plan targeted tests   15/15 PASS
formal tests-verification baseline                         PASS
sentinel formal tests-verification                         FAIL as expected
restored formal tests-verification                         PASS
```

An earlier combined closure prototype covering resolver/checkpoint/A1/G1/real-OpenSpec paths passed 61/61 targeted tests; 214 specifically closes the missing logical→physical link identified by Reviewer 213.

**Evidence Boundary**

Covers the complete self-verification chain for the planned public verification executor mutation:

```text
scripts/verification.ts
+ verification-plan.test.ts
→ module ownership
→ tests-verification
→ physical resolver
→ verification-plan.test.ts actually executes
→ sentinel controls formal Verification PASS/FAIL
```

This reaches the Proposal acceptance boundary rather than stopping at logical selection.

**Feasible implementation/test mutation surface**

Proposal-ready source-controlled paths are:

```text
scripts/verification.ts
src/integrations/openspec/openspec-cli-adapter.ts
src/integrations/openspec/openspec-executable.ts        # new minimal resolver
src/services/f1-checkpoint-boundary-service.ts
src/verification/change-selection/evidence.ts
src/verification/change-selection/module-map.ts
tests/integration/g1-change-cli-end-to-end.test.ts
tests/integration/openspec-1-7-real-cli.test.ts
tests/unit/integrations/openspec-cli-adapter.test.ts
tests/unit/services/a1-write-service.test.ts
tests/unit/services/f1-checkpoint-boundary-service.test.ts
tests/unit/verification/change-selection/evidence.test.ts
tests/unit/verification/change-selection/module-map.test.ts
tests/unit/verification/verification-plan.test.ts
```

OpenSpec Proposal/Design/spec deltas/Tasks and `verification.md` are normal Change contract/control artifacts in addition to implementation paths.

`AGENTS.md` is explicitly **out of the Proposal-ready mutation surface** for I1. The checkpoint no-extra-authorization semantic will be expressed through the canonical OpenSpec checkpoint contract / generated handoff; I1 does not need an additional operator-copy mutation to satisfy the required outcome. This removes the conditional ownership branch called out by Reviewer 213 rather than deferring it to Proposal.

Explicitly unsupported by current proof:

```text
AGENTS.md
package.json / package-lock.json
scripts/platform-command.ts
Policy / Formal Actions
Run schema / persistence schema
process-heavy batching / concurrency / timeout changes
OpenSpec vendoring
```

**Gap**

None for the required mutation surface or formal physical Verification closure.

**Result: PASS.**

**Implication**

Proposal must freeze both sides of the self-verification correction together:

```text
module-map ownership
+
tests-verification physical resolver coverage
+
regression sentinel in evidence tests
```

It must not include `scripts/verification.ts` without the corresponding `evidence.ts` / module-map / regression paths, and it must not add `AGENTS.md`.

---

### Proof 7 — Performance Proof

**Question**

Do the correctness fixes materially regress known process-heavy targets, and is there proof that changing Full Test batching/concurrency is necessary or beneficial?

**Acceptance Boundary**

- preserve the complete correctness matrix;
- no material standalone G1 / real OpenSpec regression;
- do not add scheduler/concurrency/batching changes unless same-environment evidence shows bounded benefit.

**Method**

Same detached environment before/after standalone measurements; separate process-heavy isolation experiment for public full suite.

**Evidence**

G1 standalone:

```text
before: 7/7 PASS, 69 real CLI subprocess, 29.52s
after:  7/7 PASS, 69 real CLI subprocess, 29.94s
```

Delta ~1.4%, noise-level; no new process count.

Real OpenSpec standalone:

```text
before: 5/5 PASS, 9.44s
after:  5/5 PASS, 9.47s
```

Effectively unchanged.

On this detached host, current public full suite with real OpenSpec enabled did not terminal within a bounded 180s observation window. A counterfactual that moved G1 + real OpenSpec into existing process-heavy isolation also did not terminal within the same 180s boundary; even the first existing isolated diagnostic test became unusually slow in that run. Therefore the host observation does not demonstrate a product-level batching improvement.

**Evidence Boundary**

Covers standalone changed heavy targets and shows the proposed correctness design does not materially increase their cost. It does NOT prove a global runner performance defect.

**Gap**

Full-suite wall time remains environment-sensitive. This is an observation for later canonical/full-test reporting, not authorization to redesign runner scheduling.

**Result: PASS for no-material-regression / reject runner optimization.**

**Implication**

`scripts/verification.ts` may change only for executable/physical-coverage closure. Proposal MUST NOT add concurrency, timeout, scheduler or process-heavy batching changes from this proof.

---

### Proof 8 — Future Corrective Change / Next-Delivery Shaped Proof

**Question**

Will the corrected contracts work after 02, or do they depend on I1/current Delivery identity?

**Acceptance Boundary**

At least:

- a future corrective Change appended after a stable historical fixture;
- a different future Delivery with an active Change using OpenSpec projection/resolution;
- future checkpoint handoff semantics without 02-specific identity.

**Method**

Use a synthetic future Delivery `20990401-01-self-hosted-delivery` / active `future-closure`, plus the existing future-shaped F1 checkpoint fixture. Check OpenSpec resolved execution, FormalFactSnapshot / Policy next, and temporal expansion.

**Evidence**

Future Delivery-shaped repository with prototype resolver and real OpenSpec:

```text
changeRoot = openspec/changes/future-closure
formal conflicts = 0
next = action/explore
resolved OpenSpec executable = expected real executable
```

No new resolver/verification/checkpoint production path contains the I1 identity or current 02 Delivery identity.

F1 checkpoint handoff regression already uses a future Delivery identity `20990301-01-f1-handoff`; bounded normalization contract prototype passes there.

Proof 4 synthetic future corrective Change adds another Change after the historical point-in-time corpus without invalidating the legacy semantics.

**Evidence Boundary**

Covers a later Change and a different Delivery-shaped consumer.

**Gap**

None for the required genericity claim.

**Result: PASS.**

## 6. Rejected Approaches

### Add OpenSpec as a project devDependency

Rejected. It would make `node_modules/.bin/openspec(.cmd)` exist but would preserve the wrong test-local discovery authority and mutate `package.json/package-lock.json` without product need.

### Keep the real OpenSpec suite optional / skipped

Rejected. Delivery Full Test contract requires OpenSpec integration coverage. A suite-level skip with zero tests and exit 0 is a false-green path.

### Merely change A1 expected count 11 → 12

Rejected. The next corrective Change would produce 13 and repeat the defect. Exactness must bind a stable point-in-time fixture, not the mutable live Manifest.

### Run Prettier / broad whitespace normalization at checkpoint

Rejected. Proof only authorizes redundant EOF blank-line collapse + exactly one final newline. Broader formatting could mutate semantic or unrelated content.

### Add G1 / real OpenSpec to process-heavy batching or change concurrency/timeout

Rejected. Performance proof did not show bounded benefit. No scheduler work enters this Change.

### Duplicate `.ps1/.cmd` launcher behavior in `scripts/platform-command.ts`

Rejected. `src/shared/external-command.ts` already owns that platform launch fact. The corrected design reuses it instead of creating a second launcher authority.

## 7. Feasible Proposal Boundary

Explore evidence supports a Proposal that freezes the following outcomes:

1. Extract one minimal OpenSpec invocation resolver from the adapter's existing Windows PATH logic.
2. Adapter invocation and Change Verification propagation consume the resolved invocation identity.
3. Delivery verification's OpenSpec strict step consumes the same resolver and existing shared external-command launcher.
4. public `test:full` resolves/propagates `FLOWKIT_OPENSPEC_BIN` before test children start; real OpenSpec conformance no longer owns a silent skip.
5. Real OpenSpec invocation-count regression uses an injected platform-aware runner around the real executable, not a POSIX `.sh` wrapper.
6. G1 recovery regression uses official adapter resolution, not repo-local `.bin` construction.
7. A1 legacy/current regression moves to a stable synthetic point-in-time corpus plus a future-expansion assertion; no `>=` weakening.
8. Checkpoint handoff declares EOF-only deterministic normalization as checkpoint mechanics covered by the already-required exact Owner checkpoint authorization; no auto commit/push and no broad formatter authority.
9. Verification Module Map gains exact ownership for the changed public verification executor/test so I1 can verify itself.
10. No package dependency, runner concurrency, timeout, scheduler or process-heavy batching change.

The Proposal should modify only existing relevant capabilities; no new generic executable Registry or formatter capability is justified.

## 8. Open Decisions for Proposal

No unresolved implementation-feasibility decision remains.

The 212 optional `AGENTS.md` duplication is now explicitly rejected for I1 so that the final closure Change remains bounded and its verification ownership is fully proven before Proposal. The checkpoint authority semantic is already feasible through canonical OpenSpec checkpoint contract + generated Executor handoff; a duplicate operator instruction is not required to close the Delivery.

No Owner Contract Reset is required. No proof requires expansion into Policy, Formal Action catalog, package dependencies, runner scheduling or Delivery executor implementation.

## 9. Proposal Readiness

Reviewer 213 finding `I1-RE-001` is author-actionable and is addressed by the 214 disposable physical-closure proof above; formal convergence remains Reviewer-owned until re-review.

```text
External executable authority        PASS (current FAIL; corrected design proven)
Cross-platform/environment           PASS (current FAIL; corrected design proven)
Delivery Full Test physical closure  PASS (current FAIL; corrected design proven)
Temporal/lifecycle fixture            PASS (current FAIL; corrected design proven)
Archive→checkpoint real mutation     PASS (bounded normalization proven)
Mutation Surface + physical closure  PASS (formal sentinel fail/restore proven)
Performance                          PASS / no runner optimization authorized
Future Change / next Delivery        PASS
```

**Overall Proposal readiness: YES.**

Reviewer should specifically verify that Proposal does not weaken the proof boundaries by:

- restoring any local-install assumption;
- allowing real OpenSpec suite skip;
- omitting `scripts/verification.ts` module ownership or `verification-plan.test.ts` physical resolver coverage;
- converting EOF-only normalization into generic formatting authority;
- changing test scheduler/concurrency without new evidence;
- fixing A1 by merely changing 11→12.
