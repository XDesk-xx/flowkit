# Explore

## 1. Problem

I1 `delivery-full-test-bounded-execution-and-protocol-closure` 已经通过 archive + checkpoint，并证明其核心修复有效：Delivery Full Test 不再把整个 `full` scope 放进单一 120 秒 process lifetime，而是按 bounded physical targets 执行。

I1 checkpoint 后的两次真实 Full Test 暴露出新的兼容性缺口：

1. Windows 本地 technical Full Test 在约 32 秒后到达真实失败，而不是旧 120 秒整体 timeout。两个 legacy `kind: command` case 因 Windows command path 经 Delivery Manifest write → YAML read 后被破坏，最终 `spawn-failed`。
2. exact base `2ee79244128b62ea9ddb0388afc1ea08e746e298` 的 detached authoritative Delivery Full Test 在 Linux 上约 59.8 秒后失败。前五个 logical checks PASS，`full` 在 `tests/unit/external-command.test.ts` 的 PowerShell fallback negative fixture 上失败；fixture 依赖 ambient `PATH` 将 bare missing executable 解释为 `ENOENT`，但当前环境合法返回 `EACCES`。
3. 两次失败都证明 bounded executor 已掌握 physical target 与 transport diagnostics，但 technical `verify:full` 顶层只显示 logical `full failed`，定位成本不必要地后移。

Owner 已决定：因为 detached Full Test 也失败，原本准备延后到 04 的 Windows legacy defect 不再 defer；J1 必须作为当前 03 Delivery corrective Change 一次收掉这些直接 Full Test blocker，并避免再把同类问题后移成 K1/L1。

J1 不重新设计 I1 bounded Full Test 架构，也不扩大为 generic Verification / scheduler / telemetry platform。

## 2. Current Facts

### 2.1 Canonical / lifecycle facts

```text
Git base:
2ee79244128b62ea9ddb0388afc1ea08e746e298

I1:
delivery-full-test-bounded-execution-and-protocol-closure
→ completed + archived + checkpointed

Authoritative detached Full Test authorization:
owner:9b18910b4bd5c7af3cea466e46f1739818d1a8f04c6516fe7f096f8eabab6785

Authoritative detached Full Test result:
verification:full-test:f250af14a7de3789d522c8cd9548c746e60a8655b29500105c9b2c2002de11eb
→ failed

Delivery Finding:
full-test-failure:674b292ab9012894a5d1ea63d9e7d31dda319a0753e0362fde6ef7f23fc25562

J1 create-change:
owner:1e0bb9574e4438886be395d3c94ff3a2dce93ffbffebbd330a7df5101c86268c

J1 activate-change:
owner:353eab6c5f1263a373268983f7c29ca45ba2fd9ff52474b1294c8415926c37c4

J1:
state = active
architectureImpact = false
formal stage = explore
```

After corrective Change creation, Delivery Full Test is `not-ready`. J1 must complete + checkpoint before Delivery can become ready again, and the next authoritative Delivery Full Test requires a fresh independent Owner authorization.

### 2.2 I1 architecture fact

Current 03 Manifest uses:

```text
kind: bounded-command-plan
```

for the real Delivery Full Test. The Windows defect occurs on the still-supported legacy typed shape:

```text
kind: command
```

which remains a legal future/compatibility contract. Therefore the defect cannot be dismissed merely because current 03 uses bounded-command-plan.

### 2.3 Windows local failure fact

Owner-provided local execution evidence:

```text
quality       passed
 typecheck     passed
 lint          passed
 build         passed
 openspec-all  passed
 full          failed
```

The `full` phase reached a real test failure rather than timing out. In `tests/integration/a1-delivery-readiness-and-full-test-behavior.test.ts`, the two legacy command protocol cases failed with `spawn-failed` / exit 2.

Current writer/reader boundary:

```text
src/persistence/delivery-manifest-document.ts
→ JSON.stringify(value)

src/facts/yaml-parser.ts
→ sequential replacement of escaped quote, backslash, \n, \t
```

For a Windows-shaped command such as:

```text
C:\nvm4w\nodejs\node.exe
```

writer output contains escaped backslashes. The reader first creates new backslashes and then interprets newly-created `\n` / `\t` sequences again. This is a double-unescape semantic defect in the formal fact reader, not an isolated fixture issue.

### 2.4 Detached Linux Full Test failure fact

The authoritative detached Full Test on the exact base reached terminal failure without the old monolithic timeout:

```text
quality       PASS   ~1.5s
 typecheck     PASS   ~5.9s
 lint          PASS   ~3.9s
 build         PASS   ~2.6s
 openspec-all  PASS   ~0.3s
 full          FAIL   ~45.6s
 total                ~59.8s
```

Exact failing physical target:

```text
ordinary:tests/unit/external-command.test.ts
```

Two failures used bare fake launcher names such as:

```text
__missing_pwsh__
```

and assumed executable lookup would return `ENOENT`. In the detached environment, ambient `PATH` contained an inaccessible directory, so `spawn()` legally returned `EACCES`.

Production `runCommand()` currently falls back from PowerShell Core to Windows PowerShell only when:

```text
spawned = false
spawnError.code = ENOENT
```

This production rule is correct and must remain unchanged: `EACCES` is not proof that the launcher is absent and must not be silently converted into fallback.

### 2.5 Diagnostics fact

`runBoundedCommands()` already produces bounded physical execution facts including:

```text
logicalCheckId
physicalTargetId
outcome
exitCode
durationMs
stdout
stderr
spawnError
processTreeDiagnostics
```

But `src/verification/full-test/executor.ts` currently projects only the first seven fields, dropping `spawnError` and `processTreeDiagnostics`.

Then `scripts/verification.ts` reduces `execution-error` to:

```text
{ exitCode: 2, durationMs: 0 }
```

and a terminal failed logical check to exit 1 without printing the bounded physical failure diagnostics.

The Full Test protocol itself intentionally remains logical-check authority. Physical diagnostics are execution details and must not become a second durable Verification truth.

## 3. Scope Boundary

### In scope

```text
1. Delivery Manifest double-quoted scalar semantic round-trip closure
   - writer-emitted JSON-compatible escaped string
   - reader must decode once
   - legacy kind: command command/args must round-trip exactly
   - Windows-shaped backslash paths and escape-boundary characters included

2. Deterministic PowerShell launcher negative fixtures
   - missing launcher condition must be owned by the test
   - no ambient PATH dependency for ENOENT expectation
   - production ENOENT-only fallback semantics remain unchanged

3. Bounded physical failure diagnostics propagation
   - preserve spawnError + processTreeDiagnostics through bounded Full Test executor diagnostics
   - technical verify:full surfaces failing logical/physical target and bounded failure details
   - authoritative `flowkit delivery full-test` operator output surfaces the same failing physical target without changing persisted protocol bytes
   - stdout/stderr remain bounded by existing external-command limits
   - Full Test protocol / result authority remains unchanged

4. Verification closure for J1 itself
   - focused regression
   - exact writer → reader semantic round-trip
   - write → read → execute regression
   - deterministic hostile-PATH counterexample
   - disposable exact-candidate full physical plan execution
   - fresh real-Windows post-fix evidence before claiming Windows OS-semantic closure
```

### Out of scope

```text
reopening or redesigning I1
changing bounded physical partition architecture
raising the 120s per-target timeout
treating EACCES as launcher absent
generic YAML implementation replacement/platform
generic Verification scheduler
dynamic timeout tuning
performance telemetry platform
changing Full Test protocol to persist physical diagnostics
new Evidence / Finding platform
04 Skill implementation
OpenSpec 1.9 migration
```

The methodological lessons from this corrective Change should be carried to 04 Skill Retrospective, but J1 only implements the concrete product/test/diagnostic closure required for current 03.

## 4. Risk Scan

| Risk | yes/no | Why |
|---|---|---|
| Scope expansion / missing prerequisite | yes | A narrow `\n` hotfix would leave the same writer/reader escape-language mismatch for other escapes; diagnostics could also expand into protocol authority if not bounded. |
| Cross-time facts | yes | J1 is a corrective Change after an authoritative Full Test failure; J1 completion must not rewrite I1 or the failed Full Test history, and a later Delivery Full Test needs fresh Owner authorization. |
| Schema / persistence migration | yes | YAML reader semantics affect formal persisted strings globally; compatibility must be proven against current repository YAML and writer-produced values. |
| Self-hosting / writer changes itself | no | J1 does not switch current runtime authority or persistence schema version mid-Delivery; it corrects existing reader semantics. |
| Authority duplication | yes | Physical diagnostics must remain execution detail; Full Test logical protocol and Verification resultRef remain authoritative. |
| Generic reusable subsystem | yes | YAML parser and external-command runtime are shared infrastructure; proof cannot be J1-only. |
| Activation must persist across Change/Delivery boundaries | no | No runtime activation mechanism changes; code becomes current only after normal checkpoint/final Git boundaries. |
| Candidate/formal-fact mutation affects existing consumers | yes | `yaml-parser.ts`, verification executor, and verification script have broad consumers; direct/affected regression and full-plan dry execution are required. |
| Verification selection must reach actual executed targets | yes | J1 modifies formal fact reader + verification transport/display paths; Proposal must derive actual logical scopes and prove their physical targets, not merely name tests. |
| External tool performs real mutation | no | J1 itself does not add a new external mutation operation. Managed OpenSpec is only consumed by tests/full-plan execution. |
| Change claims performance improvement | no | J1 does not claim a performance improvement. The absence of old 120s monolithic timeout is an I1 fact, not a J1 performance claim. |

Additional cross-platform proof risk:

```text
platform='win32' simulation
≠ real Windows OS-semantic evidence
```

J1 must distinguish host-independent Windows-shaped serialization proof from real Windows execution proof.

## 5. Applicable Proofs

### Proof A — Corrective lifecycle / authority boundary

**Question:** Can J1 close the Full Test defects without reopening I1 or synthesizing new Full Test authority?

**Acceptance Boundary:** I1 historical completion remains immutable; failed Full Test + Finding remain historical facts; J1 uses normal Change lifecycle; next authoritative Full Test only after J1 completion + checkpoint + fresh Owner authorization.

**Method:** Inspect Delivery Manifest, Owner decisions, Full Test history, Finding, J1 dependency/state, Policy.

**Evidence:**

```text
I1 = completed
J1 dependsOn I1
J1 = active / explore
Full Test historical result = failed
Delivery current fullTest = not-ready
```

**Evidence Boundary:** Current formal Delivery / Change lifecycle facts at exact base `2ee79244128b62ea9ddb0388afc1ea08e746e298`.

**Gap:** None for entering Proposal.

**Result:** PASS

**Implication:** Proposal must modify only J1 candidate bytes. It must not mutate I1 history or run an authoritative Delivery Full Test during Apply.

---

### Proof B — YAML semantic round-trip, not escape-specific patching

**Question:** Can the writer/reader contract be made symmetric in one decode step and remain backward-compatible with current repository YAML?

**Acceptance Boundary:** Values written by current `JSON.stringify()`-based double-quoted scalar writer must read back exactly once, including Windows-shaped backslashes and JSON escape boundaries; existing repository YAML must preserve parsed semantics.

**Method:** Disposable exact-base patch changes double-quoted scalar decoding to one JSON-compatible decode. Execute current parser/persistence regression, scan all repository YAML with current vs patched reader, exercise an edge matrix, and execute a writer/read/spawn counterexample.

**Evidence:**

1. Current reader reproduces corruption for Windows-shaped strings containing literal `\n` / `\t` sequences.
2. Existing `yaml-parser` + `delivery-manifest-document` focused regression under the single-decode prototype:

```text
26 / 26 PASS
```

3. Repository YAML compatibility scan:

```text
yamlFiles:     40
currentParsed: 40
currentFailed: 0
fixedFailed:   0
semanticSame:  40
semanticDiff:  0
```

4. `JSON.stringify` round-trip edge matrix:

```text
15 / 15 exact
```

including quote, backslash, Windows `\n`/`\t`-shaped paths, literal escape text, actual newline/tab/carriage return/backspace/formfeed, Unicode, NUL/control character, and literal `\uXXXX` / `\r` forms.

5. Host-independent write → read → execute proof using an executable path containing literal backslash + `n`:

```text
current reader → path corrupted → spawn-failed ENOENT
single-decode reader → exact path preserved → exit 0 / ROUNDTRIP_OK
```

**Evidence Boundary:** Formal string serialization semantics are host-independent and fully exercised on the exact-base code shape. Current repository YAML backward compatibility is covered.

**Gap:** A fresh post-fix real-Windows legacy command execution is still required before claiming Windows OS-semantic closure; that belongs to Apply/Verification acceptance, not to this feasibility proof.

**Result:** PASS for semantic feasibility; real-Windows post-fix execution remains a required future Verification fact.

**Implication:** Proposal must freeze a symmetric writer/reader escape language, not a Windows-path special case or reordered chained replacements.

---

### Proof C — Negative PowerShell fixture determinism

**Question:** Is the detached Linux Full Test failure a production fallback defect or an ambient-dependent negative fixture?

**Acceptance Boundary:** Test-owned “launcher absent” premise deterministically produces absence independent of ambient PATH; production continues to fall back only on `ENOENT`, and permission errors remain terminal.

**Method:** Create a hostile PATH counterexample and compare bare fake launcher names with test-owned absolute nonexistent paths. Patch only test fixtures and execute the complete external-command regression.

**Evidence:**

```text
bare __missing_pwsh__ + hostile PATH
→ spawn-failed / EACCES

absolute test-owned nonexistent launcher + valid fallback
→ exit 0 / fallback works

absolute test-owned two nonexistent launchers
→ POWERSHELL_NOT_FOUND
```

After replacing ambient-dependent negative fixtures with test-owned absolute nonexistent paths:

```text
tests/unit/external-command.test.ts
14 / 14 PASS
```

`src/shared/external-command.ts` production fallback logic was not changed.

**Evidence Boundary:** The negative fixture premise is fully owned and deterministic on POSIX; the production decision rule remains unchanged and is covered by existing simulated win32 branch tests.

**Gap:** This proof does not claim that simulated `platform: 'win32'` equals real Windows process semantics. J1 does not change the PowerShell production behavior, so no new OS-specific behavior is introduced here.

**Result:** PASS

**Implication:** Proposal must change the fixture, not loosen production `ENOENT` semantics to accept `EACCES`.

---

### Proof D — Diagnostics propagation without authority expansion

**Question:** Can J1 surface the physical failure that the bounded executor already knows without changing Full Test protocol authority?

**Acceptance Boundary:** On bounded execution failure, technical `verify:full` can identify the failing logical/physical target and preserve bounded spawn/process-tree diagnostics; persisted Full Test protocol remains logical-check-only authority and does not gain physical diagnostic state.

**Method:** Trace result fields from `runBoundedCommands()` through `executeBoundedFullTest()` to `scripts/verification.ts`. Apply a disposable projection/formatting prototype and run focused executor + verification-plan regressions.

**Evidence:**

Current loss points:

```text
runBoundedCommands
→ has spawnError / processTreeDiagnostics

executeBoundedFullTest diagnostic projection
→ drops both

scripts/verification.ts
→ drops diagnostics on execution-error
→ does not print physical diagnostics on terminal failed check
```

Disposable prototype:

```text
- carries spawnError / processTreeDiagnostics through execution diagnostics
- formats only the terminal/failing physical target for technical output
- prints bounded stdout/stderr already constrained by existing runtime limits
- leaves FullTestProtocolPayload unchanged
```

Focused regression:

```text
executor + verification-plan
11 / 11 PASS
```

The added proof explicitly observes:

```text
logical check id
physical target id
spawn-failed outcome
spawn error code/message
process-tree diagnostic
```

without adding those fields to `FullTestProtocolPayload`.

A second direct consumer scan found that `runDeliveryFullTest()` also returned only the logical payload summary for terminal failed bounded execution. A disposable service prototype augments only the operator-facing returned summary with the failing bounded diagnostic while persisting the original logical-only protocol unchanged. The complete `delivery-full-test-service` regression passed:

```text
10 / 10 PASS
```

The focused service proof asserts both sides of the authority boundary:

```text
operator result summary
→ contains logical/physical target + outcome

persisted deliveryFullTestResult.summary
→ remains original logical protocol summary
```

**Evidence Boundary:** In-process diagnostic projection plus technical `verify:full` and authoritative Full Test operator-display feasibility, with durable protocol bytes unchanged.

**Gap:** Proposal/Apply must add a user-facing regression that exercises the technical failure display path, not only the formatter helper.

**Result:** PASS for feasibility with one Apply-level technical-output acceptance remaining.

**Implication:** Physical diagnostics remain non-authoritative execution detail. J1 must not create a second Verification record/protocol.

---

### Proof E — Cross-platform claim depth

**Question:** What can J1 legitimately claim from Linux, simulated win32, and Owner-provided real Windows evidence?

**Acceptance Boundary:** Every compatibility claim names the evidence boundary; host simulation is not promoted to real OS proof.

**Method:** Classify each required behavior by whether it is pure/string semantic or OS semantic.

**Evidence:**

```text
YAML writer/read semantic equality
→ host-independent
→ Windows-shaped strings can be proved on Linux

PowerShell fallback branch selection
→ pure decision logic can be simulated with platform='win32'

real Windows command path → CreateProcess/spawn
→ OS-semantic
→ requires real Windows execution before final cross-platform PASS claim

ambient POSIX PATH ENOENT/EACCES counterexample
→ real Linux detached evidence already observed
```

Owner supplied a real Windows pre-fix failure, proving the defect exists on Windows. The current detached environment cannot by itself prove the post-fix Windows OS execution succeeds.

**Evidence Boundary:** Claim classification is complete; post-fix Windows execution evidence does not yet exist.

**Gap:** Fresh real-Windows targeted/technical Full Test evidence after Apply.

**Result:** UNKNOWN for post-fix real-Windows OS-semantic closure by design; this is an explicit Verification requirement, not hidden as PASS.

**Implication:** Proposal must require real Windows post-fix evidence before J1 is considered cross-platform closed. Linux-only PASS cannot satisfy that acceptance by itself.

---

### Proof F — Candidate mutation surface and formal Verification selection

**Question:** Does the minimal expected J1 implementation route through the existing deterministic Change Verification map without requiring a new Verification mechanism?

**Acceptance Boundary:** Every expected production/test mutation maps to exactly one ownership module, and selected logical checks cover the actual shared consumers.

**Method:** Model the minimal likely implementation paths and run the current source-controlled module selection.

Expected implementation surface used for the proof:

```text
src/facts/yaml-parser.ts
tests/unit/facts/yaml-parser.test.ts
tests/unit/persistence/delivery-manifest-document.test.ts
tests/integration/a1-delivery-readiness-and-full-test-behavior.test.ts
tests/unit/external-command.test.ts
src/verification/full-test/executor.ts
scripts/verification.ts
tests/unit/verification/full-test/executor.test.ts
tests/unit/verification/verification-plan.test.ts
src/services/delivery-full-test-service.ts
tests/unit/services/delivery-full-test-service.test.ts
```

Selected seed modules:

```text
cli-diagnostics
execution
openspec-runtime
persistence
verification-selection
```

Selected verification scopes before current-Change OpenSpec closure:

```text
openspec-current-change-archive-sync
openspec-current-change-strict
tests-cli
tests-execution
tests-openspec-runtime
tests-persistence
tests-verification
typecheck
```

**Evidence Boundary:** Current module map against the expected minimal production/test surface.

**Gap:** Proposal must freeze exact mutation selectors and capability deltas; Apply admission must derive the final actualChangeSet and confirm the same-or-stronger closed selection. If Proposal adds another production path, this proof must be recomputed rather than assumed.

**Result:** PASS

**Implication:** No new Verification catalog/scheduler is required. J1 can use the current formal Change Verification mechanism.

---

### Proof G — Disposable complete Full Test physical-plan dry execution

**Question:** After the two compatibility corrections, does the exact candidate-shaped repository expose another downstream Full Test blocker that would otherwise become K1/L1?

**Acceptance Boundary:** The frozen Full Test physical plan can execute every selected physical target to terminal PASS in a disposable environment with managed tools, without writing Delivery Full Test lifecycle facts.

**Method:** On an exact-base disposable worktree, apply only the YAML single-decode prototype and deterministic PowerShell fixture correction; provide a real directory-form `node_modules` and the same managed `FLOWKIT_HOME`; invoke the same bounded Full Test resolver/executor directly rather than `flowkit delivery full-test`.

A first disposable attempt used a `node_modules` symlink to save space. `entry-workspace` correctly rejected that repository-internal symlink. This was classified as a proof-harness artifact because the canonical project uses an ignored directory-form `node_modules`, not a tracked/untracked symlink. The harness was corrected instead of expanding J1 scope.

Corrected compatibility-only dry execution result:

```text
logical check: full
physical targets: 154
status: passed
Full Test payload: all full-test checks passed
full physical duration: ~299.1s
```

After diagnostics propagation and authoritative operator-summary prototypes were also added, the prototype bytes were frozen and the complete physical plan was executed again from the beginning. Final stable combined prototype evidence:

```text
focused regression: 61 / 61 PASS
ESLint: PASS
typecheck: PASS
logical check: full
physical targets: 154
status: passed
Full Test payload: all full-test checks passed
full physical duration: ~311.3s
```

This second run started after all prototype production/test mutations were fixed, so its result is not contaminated by code changing while the plan was in flight.

The run traversed ordinary tests, diagnostics targets, G1 targets, H1 installed-runner smoke + 26 phases, and B1 suite/preparation targets using the managed tool environment.

No authoritative Delivery Full Test status/result/Finding was written by this proof.

**Evidence Boundary:** Complete Linux detached physical plan on the candidate-shaped compatibility corrections, including heavyweight downstream consumers.

**Gap:** This remains non-authoritative technical proof and cannot replace the post-J1 authoritative Delivery Full Test. It also cannot replace the required real-Windows post-fix OS-semantic evidence.

**Result:** PASS

**Implication:** No additional product blocker is currently evidenced beyond the three J1 outputs. J1 Proposal can remain small instead of preemptively creating K1/L1-sized scope.

---

### Proof H — Genericity / next-consumer boundary

**Question:** Do the fixes remain valid beyond current 03's bounded-command-plan instance?

**Acceptance Boundary:** Legacy `kind: command` remains valid for a future Delivery; current bounded-command-plan remains unchanged; YAML correction applies to the shared writer/reader contract; negative fixture correction does not alter runtime semantics.

**Method:** Trace typed union readers/writers and current Manifest shape, then separate current-instance behavior from reusable contract behavior.

**Evidence:**

```text
current 03 Full Test
→ bounded-command-plan

legacy command
→ still legal typed execution variant

YAML reader/writer
→ shared persistence boundary

PowerShell fixture change
→ test-owned premise only

bounded executor architecture
→ unchanged
```

**Evidence Boundary:** Current code/type contract and candidate-shaped proofs.

**Gap:** Future Delivery behavior will still be covered by normal Change/Delivery verification; no activation mechanism is introduced here.

**Result:** PASS

**Implication:** J1 closes a real compatibility contract without coupling the fix only to current 03 Manifest bytes.

## 6. Rejected Approaches

### Reject: only reorder chained YAML `.replace()` calls

Reason:

```text
writer language = JSON.stringify-compatible escapes
reader language = ad-hoc sequential replacements
```

Reordering one escape may fix `\n` while leaving `\t`, `\r`, `\b`, `\f`, Unicode/control escapes, or newly-created escape sequences inconsistent. The correct boundary is single semantic decode of the same quoted-scalar language the writer emits.

### Reject: Windows-path special case

The bug is not “nvm path handling”; it is reader/writer escape-language asymmetry. A path-specific patch would be another latent K1.

### Reject: treat `EACCES` as launcher absent

`EACCES` can represent a real permission/search problem. Fallback must remain `ENOENT`-only. The test must own its absence premise.

### Reject: continue using bare fake executable names for negative PATH tests

Bare names are ambient-environment-dependent. Test-owned absolute nonexistent paths or explicitly-owned PATH are required when the expected error code is part of the assertion.

### Reject: persist physical diagnostics in Full Test protocol

Physical diagnostics are execution detail; logical checks remain Verification authority. Persisting both as competing truth would violate the existing authority boundary.

### Reject: raise timeout / add scheduler

Neither observed J1 defect is a timeout problem. I1 already removed the monolithic timeout root cause. J1 must not use timeout inflation to hide failures.

### Reject: run authoritative Delivery Full Test during J1 Apply

Change Verification / disposable full-plan proof does not own Delivery Full Test lifecycle authority. The authoritative Full Test must wait for J1 completed + checkpointed and fresh Owner authorization.

### Reject: claim cross-platform PASS from Linux + `platform: 'win32'` simulation

Simulation proves branch/argv logic only. Real Windows OS behavior remains a distinct evidence boundary.

### Reject: expand J1 into 04 Skill / engineering-health work

The lessons are real and should feed 04, especially cross-platform claim depth, deterministic negative fixtures, semantic serialization round-trip, and disposable full-plan proof. J1 should implement only the direct corrective product boundary.

## 7. Feasible Proposal Boundary

J1 can proceed to Proposal with a small corrective design that freezes the following:

### 7.1 YAML writer/reader symmetry

```text
current double-quoted writer
→ JSON.stringify-compatible scalar bytes

reader
→ one compatible decode
→ never recursively reinterpret escape sequences created by decoding
```

Acceptance must include:

```text
writer → read exact equality
Windows-shaped command/path
args with backslash escape-shaped substrings
quote/backslash/control escape matrix
existing repository YAML semantic compatibility
legacy kind: command write → read → execute
```

### 7.2 PowerShell negative fixture ownership

```text
missing launcher fixture
→ test-owned absolute nonexistent path
```

Do not modify production fallback policy:

```text
fallback only on ENOENT
EACCES remains terminal
```

Acceptance includes a hostile-PATH counterexample proving the fixture no longer depends on ambient lookup.

### 7.3 Technical bounded diagnostics

Preserve through the bounded execution diagnostic projection:

```text
logicalCheckId
physicalTargetId
outcome
exitCode
durationMs
stdout
stderr
spawnError
processTreeDiagnostics
```

On technical `verify:full` failure, surface the terminal/failing physical diagnostic in human-readable output. On authoritative `flowkit delivery full-test` failure, surface the same bounded terminal target in the operator-facing result summary while persisting the original logical protocol unchanged. Keep:

```text
FullTestProtocolPayload
resultRef
checks[] logical authority
```

unchanged.

### 7.4 Verification closure before approval

Proposal must freeze exact mutation selectors and applicable OpenSpec capability deltas. Apply must prove:

```text
focused YAML/persistence regression
legacy command write-read-execute regression
external-command deterministic negative fixture regression
diagnostics propagation + technical/operator output regression
formal Change Verification selection/physical execution
complete disposable Full Test physical-plan dry execution
```

The complete disposable full-plan proof is technical/non-authoritative and MUST NOT write Delivery Full Test lifecycle facts.

Before J1 is claimed as real Windows compatible, require fresh post-fix real-Windows evidence for the legacy command write → read → execute path. Until that exists, Windows OS-semantic closure remains explicitly UNKNOWN, not silently PASS.

After J1 completion + checkpoint, Delivery returns to Ready eligibility and requires a fresh Owner authorization for the next authoritative Delivery Full Test.

## 8. Open Decisions

No new Owner product decision is required to enter Proposal. Owner has already frozen the corrective intent and the requirement to close the current Full Test defects rather than defer them.

Proposal/Reviewer must nevertheless preserve these explicit evidence boundaries:

```text
1. Do not reinterpret Linux disposable full-plan PASS as real-Windows PASS.
2. Do not approve J1 cross-platform closure without fresh post-fix Windows execution evidence.
3. Do not promote physical diagnostics into a second durable Full Test authority.
4. Do not expand J1 into timeout/scheduler/telemetry/Skill work.
5. If Apply changes the expected mutation surface, recompute formal Verification selection and disposable full-plan closure before approval.
```

The only current known evidence gap is the intentionally future post-fix real-Windows execution check. All feasibility questions necessary to freeze the J1 implementation approach are otherwise closed.
