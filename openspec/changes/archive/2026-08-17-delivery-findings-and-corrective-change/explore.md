# Explore — delivery-findings-and-corrective-change

## 1. Problem

03 `20260817-01-delivery-execution-loop` 已在 canonical Base
`55622af3c2a62075e3d774d9d33c1ea222795eda` 完成 A1 Change Checkpoint。B1 是当前下一个 required Change，目标是把 A1 已经能够正式发布的 Delivery Full Test `failed` terminal result 收敛为：

```text
Full Test failed
→ minimal Delivery Finding
→ Owner decision
→ optional corrective Change
→ ordinary Change lifecycle
→ checkpoint
→ Delivery Ready again
→ fresh Owner Full Test authorization
```

必须保持：

```text
completed historical Change remains immutable
failed Full Test cannot silently Finalize
Owner—not Policy/Author/Reviewer—decides whether to create corrective Change
corrective Change uses ordinary 02 Change lifecycle
Full Test requires fresh Owner authorization after correction
```

B1 不建立 generic Finding DB，不自动创建 corrective Change，不重新打开 completed Change，也不重做 A1 Full Test executor。

## 2. Current Facts

### 2.1 Exact repository facts

- Git Base: `55622af3c2a62075e3d774d9d33c1ea222795eda`。
- Branch: `delivery/20260817-01-delivery-execution-loop`。
- Base commit 是 A1 的正式 Change Checkpoint：`chore(flowkit): checkpoint delivery-readiness-and-full-test-behavior`。
- 03 Delivery `state=active`，A1 `state=completed`，B1 `state=planned`，B1 依赖 A1，依赖已满足。
- Base 初始 Policy：`owner-decision activate-change`，唯一 eligible Change = `B1`，`doctor=ok / 0 findings`。
- Owner 已明确授权激活 B1 并执行 proof-based Explore。
- B1 已通过正式 write-side 激活：
  - Owner decision ref: `owner:f2d3a5654f89308f9811291b515fead1bb0ceb7159e2b70544037e73a57d9a0c`
  - `specDeltaMode=required`
  - OpenSpec metadata: `schema: spec-driven`
- Formal Explore Run: `20260817-018-explore`。
- 激活后：`stage=explore`，`next=explore`，`doctor=ok / 0 findings`。

### 2.2 A1 已交付的 B1 输入 seam

A1 已提供：

```text
FullTestStatus:
  not-ready
  awaiting-user-decision
  authorized
  passed
  failed

Verification-owned terminal result:
  schemaVersion
  status
  summary
  totalDurationMs
  checks[]
  resultRef = verification:full-test:<sha256>
```

Reader 对 terminal result 已 fail closed：

```text
passed|failed
→ 必须有 matching current result

not-ready|awaiting-user-decision|authorized
→ 不允许 current terminal result
```

Policy 已存在 B1 bootstrap bridge：

```text
fullTestStatus=failed
→ blocked: full-test-failed
→ suggestedOwnerActions:
   authorize-corrective-change
   cancel-delivery
```

并且不会自动重试 Full Test、不会自动创建 Change。

### 2.3 02 write-side 已存在普通 corrective Change 所需基础能力

现有 write-side 已提供：

```text
createChange()
→ append planned Change
→ append Owner create-change record

activateChange()
→ dependency check
→ Owner activation fact
→ planned → active
→ minimal OpenSpec metadata

ordinary Change lifecycle
→ Explore / Propose / Apply / Review / Archive / Checkpoint
```

因此 B1 不需要第二套 corrective lifecycle 或 corrective Action/Run。

### 2.4 当前 exact gap

Disposable future-Delivery proof 在 current code 上真实执行：

```text
future completed Change
→ Owner-authorized Full Test
→ valid Verification protocol status=failed
→ persisted failed + resultRef
→ Policy blocked: full-test-failed
```

随后显式 Owner `create change` 创建 corrective Change，实际 current behavior 是：

```text
old completed Change
→ remains completed ✅

corrective Change
→ planned ✅

fullTestStatus
→ still failed ❌

current terminal result
→ still present ❌

Policy
→ activate-change for corrective Change
```

这证明 B1 缺口不是“如何创建 Change”，而是：

> Owner corrective decision 与 failed-result consumption / Finding provenance / `failed → not-ready` reset 尚未形成一个 fail-closed、原子的 Delivery write-side contract。

## 3. Scope Boundary

### In scope

- `failed` Full Test 的 deterministic Delivery-level projection；
- minimal Delivery Finding，至少能够表达：
  - stable finding identity；
  - `sourceResultRef`；
  - blocking severity；
  - summary；
  - affected scope；
  - required Owner decision；
- Owner corrective-Change decision boundary；
- Owner 显式 corrective Change creation；
- corrective Change 与 exact failed Full Test result/finding 的 bounded provenance binding；
- atomic `failed → not-ready` reset；
- current terminal Full Test result 在 reset 时退出 current authority；
- completed historical Changes immutable；
- corrective Change 复用普通 `planned → active → ... → archive → checkpoint` lifecycle；
- corrective checkpoint 后重新进入 Delivery Ready projection；
- fresh Owner Full Test authorization requirement；
- diagnostics / resume 从 repository formal facts 重建；
- future-Delivery genericity；
- Change Verification physical closure；
- Proposal 阶段预先冻结完整 bounded `flowkitMutationScope`。

### Out of scope

- automatic corrective Change；
- automatic Full Test retry；
- reopening completed/archived Change；
- generic Finding DB / Finding Registry / Evidence platform；
- generic waiver / force-finalize；
- Delivery Finalize implementation（F1）；
- architecture lifecycle / Archify（C1/D1/E1）；
- corrective-specific Formal Action / Run；
- background recovery loop；
- changing A1 Full Test execution protocol or process-tree contract；
- new Git boundary beyond ordinary Change Checkpoint。

## 4. Mandatory Risk Scan

| Risk | yes/no | Why |
|---|---|---|
| Scope expansion / missing prerequisite | yes | B1 touches failed Full Test facts, Owner create/activation write-side and ordinary Change lifecycle; must prove A1/02 already provide those seams and avoid building a second lifecycle. |
| Cross-time facts | yes | Full Test result exists before Owner decision; corrective Change exists later; reset must not erase provenance too early; new Full Test authorization exists only after corrective checkpoint. |
| Schema / persistence migration | yes | Current Manifest has current Full Test terminal result but no bounded Delivery Finding/corrective provenance contract; reset to non-terminal cannot retain current terminal result. |
| Self-hosting / writer changes itself | yes | B1 changes Delivery write-side/Reader/Policy that later C1–H1 and this same 03 Delivery will consume after B1 Checkpoint. |
| Authority duplication | yes | Verification owns failed result truth; Owner owns corrective decision; Flowkit may project/bind but must not invent either authority. |
| Generic reusable subsystem | yes | Delivery Finding/corrective semantics must work for future Delivery ids and arbitrary Change ids, not only 03/B1. |
| Activation must persist across Change/Delivery boundaries | yes | After B1 Checkpoint, later Changes and fresh processes must reconstruct current failure/correction state without chat memory. |
| Candidate/formal-fact mutation affects existing consumers | yes | Domain, Manifest persistence, Reader, Policy, Owner write-side, diagnostics/CLI and tests are direct consumers. |
| Verification selection must reach actual executed targets | yes | New corrective path tests must be physically selected by formal Change Verification; logical selection alone is insufficient. |
| External tool performs real mutation | no | B1 does not add a new external CLI operation. Corrective Change later uses existing OpenSpec/Change lifecycle; B1 itself only changes Flowkit repository/formal-fact write-side. |
| Change claims performance improvement | no | B1 makes no performance optimization claim. |

## 5. Applicable Proofs

### Proof 1 — Scope / Prerequisite Closure

**Question**

Can B1 close the failed-Full-Test loop using A1 + 02 primitives without adding a second corrective lifecycle, generic Finding database, or new Standard Action?

**Acceptance Boundary**

B1 must have enough existing primitives to consume an A1 failed result, stop at Owner authority, create one bounded corrective Change, run the ordinary Change lifecycle, and return to Full Test readiness.

**Method**

Inspect exact Base consumers for:

```text
deliveryFullTestStatus / deliveryFullTestResult
full-test-failed Policy diagnosis
createChange / activateChange
Change checkpoint recognition
Owner decision provenance
A1 public future-Delivery Full Test tests
```

Run the existing A1 public behavior + Policy failure regressions.

**Evidence**

Focused baseline command executed:

```text
node --import tsx --test \
  tests/integration/a1-delivery-readiness-and-full-test-behavior.test.ts \
  tests/unit/policy/next.test.ts \
  tests/unit/policy/diagnose.test.ts
```

Result:

```text
58 tests
58 PASS
0 FAIL
```

Existing primitives already prove:

- Verification-owned `failed + resultRef` can be physically published for a different Delivery id；
- `failed` maps to `full-test-failed` and never auto-runs；
- Owner choices are surfaced without creating a Change；
- `createChange()` can append a normal planned Change with Owner provenance；
- `activateChange()` can activate a planned Change through ordinary dependency/Owner checks；
- A1 remains generic across a different multi-Change Delivery and fresh CLI processes。

**Evidence Boundary**

Covers B1 entry facts through ordinary corrective Change creation/activation prerequisites.

**Gap**

Missing only the B1-specific current failure projection/provenance + atomic reset semantics.

**Result: PASS.**

**Implication**

Proposal must reuse ordinary `create/change activation/Change lifecycle`; no corrective Action/Run or generic Finding subsystem is justified.

---

### Proof 2 — Verification Authority Retention + Stale-ref Fail-closed

**Question**

When B1 changes `failed → not-ready` and therefore must clear the current `verification.fullTest.result`, where does the exact Verification-owned failed result remain so that a Delivery Finding never becomes the only historical failure truth?

**Acceptance Boundary**

After corrective admission:

```text
current Full Test slot
→ no terminal result, because status is non-terminal

exact failed structured result
→ still durably readable as Verification-owned authority

Delivery Finding
→ only references/projects that result via sourceResultRef

fresh process
→ can independently resolve + validate sourceResultRef
```

The retention mechanism must be bounded to Delivery Full Test failures; it must not store raw logs and must not become a generic Evidence/Finding database.

**Method**

A disposable candidate encoding was exercised without modifying production code:

```yaml
verification:
  fullTest:
    result: <current terminal only>
    failureHistory:
      - <exact FullTestTerminalResult bytes after it exits current authority>

delivery:
  fullTestFindings:
    - findingId
      sourceResultRef
      severity
      summary
      affectedScope
      requiredOwnerDecision
      state
      correctiveChangeId
```

The proof reader uses the same A1 canonical hash domain:

```text
schemaVersion/status/summary/totalDurationMs/checks
→ canonical compact JSON
→ SHA-256
→ verification:full-test:<hash>
```

It validates every retained result and requires every Finding `sourceResultRef` to resolve to either the current result or one exact entry in `verification.fullTest.failureHistory`.

The disposable corrective-admission writer performs:

```text
validate current raw status = failed
validate supplied sourceResultRef = current canonical failed resultRef
append exact current failed result to failureHistory (content-addressed/deduped)
append minimal Full Test Finding referencing the same resultRef
append ordinary planned corrective Change
clear current verification.fullTest.result
failed → not-ready
```

It then starts fresh processes to read the post-reset Manifest and separately mutates the Finding to a non-existent resultRef.

**Evidence**

Exact proof result identity:

```text
sourceResultRef =
verification:full-test:0479a2631311340ea3d9a125f6be166d9c8e1463916d962a7d70ca86aab6ef31
```

After reset, the physical authority is:

```text
openspec/delivery-groups/<delivery-id>.yaml
└─ verification.fullTest.failureHistory[0]
   └─ exact structured failed result
      resultRef = verification:full-test:0479a263...
```

Fresh-process reconstruction:

```text
status = not-ready
currentResultRef = null
failureHistoryRefs = [verification:full-test:0479a263...]
findingSourceRefs = [verification:full-test:0479a263...]
correctionConsumed = true
```

Stale/mismatched write-side input:

```text
sourceResultRef = verification:full-test:0000...
→ FAIL-CLOSED before corrective admission
```

Stale/mismatched persisted Finding:

```text
Finding.sourceResultRef = verification:full-test:0000...
→ fresh process exit 2
→ FAIL-CLOSED: dangling sourceResultRef
```

No raw stdout/stderr or generic evidence corpus is retained. The exact structured terminal result is retained once under a Full-Test-specific Verification subtree; the Finding remains a derived Flowkit projection/reference.

**Evidence Boundary**

Covers the post-reset durable physical authority, exact resultRef recomputation, fresh-process provenance reconstruction, stale write-side rejection, and stale persisted-ref rejection.

**Gap**

Proposal must freeze the exact closed schema/key names and atomic writer behavior, but it may not replace this proven authority shape with hash-only provenance or copied Finding fields.

**Result: PASS.**

**Implication**

The bounded authority-preserving design is:

```text
current result
→ on correction move exact failed structured result into Full-Test-specific failureHistory

Finding
→ reference only

corrective provenance
→ reference Finding/result
```

This closes `B1-RE-001` without introducing a generic history/evidence platform.

---

### Proof 3 — Migration / Self-hosting / Activation Persistence

**Question**

Can the B1 persistence concept activate at the real Change Checkpoint boundary, keep legitimate pre-B1 Manifests readable, and remain reconstructible by fresh later/future consumers without falling back to the old createChange-only behavior?

**Acceptance Boundary**

Activation timeline must be explicit:

```text
Base 55622af
→ current A1 reader/writer starts B1 Explore/Proposal/Apply
→ B1 candidate semantics are not canonical during detached work
→ authorized B1 Change Checkpoint
→ new repository-global reader/writer semantics become canonical
→ fresh process / later C1-H1 / future Delivery consume them
```

Compatibility requirements:

```text
pre-B1 manifest with no failureHistory/fullTestFindings
→ readable

post-B1 manifest with retained failed result + finding
→ readable and validated

old createChange-only shape
→ must NOT be inferred as consumed correction
```

**Method**

A disposable proof repository was created with a minimal B1 candidate reader/writer concept only; no production source was changed.

1. Commit a legitimate pre-B1 Manifest with no B1 fields.
2. Commit a B1-checkpoint-shaped Manifest produced by the proof corrective admission:
   - exact failed result moved to `verification.fullTest.failureHistory`；
   - `delivery.fullTestFindings` references it；
   - current result removed；
   - status reset to `not-ready`；
   - ordinary corrective Change exists。
3. Clone the repository fresh and read both manifests in a new process.
4. Add a later C1-shaped consumer on top of the checkpoint and read it in a fresh process.
5. Add a different future Delivery id carrying the same bounded schema and read it in a fresh process.
6. Separately read an old createChange-only fixture where a corrective-shaped planned Change exists but status remains `failed` and the current result remains present.

**Evidence**

Disposable Git activation boundary:

```text
pre-B1 baseline commit:
f4141a8f2b5930afed978dd24e1e3a7264beb52c

B1 checkpoint-shaped commit:
4a0d5817e037b99bcd5263baf36594f9ea4807dc
```

Fresh clone reads legitimate pre-B1 Manifest:

```text
preB1Compatible = true
status = not-ready
failureHistoryRefs = []
findingSourceRefs = []
```

Fresh clone reads post-B1 checkpoint Manifest:

```text
preB1Compatible = false
status = not-ready
currentResultRef = null
failureHistoryRefs = [verification:full-test:0479a263...]
findingSourceRefs = [verification:full-test:0479a263...]
correctionConsumed = true
```

Later same-Delivery C1-shaped consumer:

```text
commit = 645b3505d637bd08973f445bad0b17d122836d43
fresh read = PASS
correctionConsumed = true
```

Different future Delivery consumer:

```text
deliveryId = 20991231-23-future-delivery
commit = 1aa033e140f9ba3fb094e4a2af62cce6c9ccf857
fresh read = PASS
failureHistory/resultRef relation remains valid
```

Old createChange-only fixture:

```text
planned corrective-shaped Change exists
status = failed
currentResultRef = verification:full-test:0479a263...
failureHistoryRefs = []
findingSourceRefs = []
correctionConsumed = false
```

Therefore checkpoint/resume does not silently infer “correction consumed” merely because a planned Change exists. The new semantics require the exact B1 retention/finding/reset facts.

**Evidence Boundary**

Covers pre-B1 bounded read, checkpoint-shaped activation, fresh clone reconstruction, later same-Delivery consumer, different future Delivery consumer, and explicit rejection of createChange-only fallback semantics.

**Gap**

Apply must implement and formally verify the same transition in production bytes; Explore does not claim the disposable proof script itself is product authority.

**Result: PASS.**

**Implication**

B1 may use a backward-compatible optional read shape:

```text
missing failureHistory/fullTestFindings
→ legitimate historical pre-B1 state

present fields
→ closed-schema validation + resultRef resolution required
```

The canonical activation point is the authorized B1 Change Checkpoint, not mid-Run or chat/session state. This closes `B1-RE-002`.

---

### Proof 4 — Corrective Lifecycle Re-entry + Fresh Full Test Authorization

**Question**

After B1 resets a failed Delivery and the corrective Change completes normally, does existing A1 logic force a fresh Owner Full Test authorization, even if an older `authorize-full-test` fact still exists?

**Acceptance Boundary**

Required lifecycle:

```text
failed
→ Owner corrective decision
→ not-ready
→ corrective planned/active
→ completed + checkpointed
→ awaiting-user-decision
→ fresh Owner authorize-full-test
→ authorized
```

The pre-correction Full Test authorization must not silently authorize the post-correction candidate.

**Method**

Disposable future Delivery `20991231-12-b1-reentry`:

1. Complete/checkpoint baseline `X1`.
2. Record first Owner Full Test authorization.
3. Execute a real Verification-owned failed Full Test.
4. Create corrective `X2` using ordinary Change creation.
5. Apply the now-proven disposable B1 correction concept: retain the exact failed result under Full-Test-specific failure history, persist the minimal Finding/source binding, clear current result, and reset `failed → not-ready`.
6. Activate `X2` via ordinary activation.
7. Simulate ordinary completed + Checkpoint endpoint for `X2`.
8. Start fresh CLI processes and read `status` / `next`.
9. Record a second Owner Full Test authorization through the public Owner write-side.

**Evidence**

Fresh process after corrective Checkpoint and before new authorization:

```text
delivery: 20991231-12-b1-reentry
full-test: awaiting-user-decision
conflicts: 0

next:
kind: owner-decision
decision: authorize-full-test
context-full-test: awaiting-user-decision
```

The old Full Test authorization fact was intentionally retained, but it did not authorize the new candidate.

After explicit fresh Owner record:

```text
raw fullTestStatus = authorized
effective fullTestStatus = authorized
authorize-full-test records = 2
historical X1 = completed
corrective X2 = completed
```

**Evidence Boundary**

Covers a different future Delivery id, a baseline Change + corrective Change, real Git checkpoint facts, fresh process reconstruction, retained failure provenance, and fresh Owner re-authorization.

**Gap**

Production implementation remains for Apply.

**Result: PASS.**

**Implication**

Do not invalidate/delete old Owner Full Test records. A1's lifecycle already guarantees fresh authorization by returning to `awaiting-user-decision`; B1 only needs the correct correction-admission/reset boundary.

---

### Proof 5 — Historical Immutability + Owner Boundary

**Question**

Can B1 correct a failed Delivery without reopening the completed Change that produced the candidate, and without synthesizing Owner authority?

**Acceptance Boundary**

```text
historical completed Change
→ remains completed

failed result
→ blocks Delivery progression

corrective Change
→ created only from explicit Owner operation
```

**Method**

Use the disposable failed-result/corrective-create proof and inspect both Change states plus current Policy and Owner write-side behavior.

**Evidence**

Observed:

```text
before correction:
  X1 = completed
  Policy = blocked/full-test-failed

after explicit create-change owner operation:
  X1 = completed
  X2 = planned
```

No state transition reopens X1. Current Policy itself never creates X2; the mutation occurs only after an explicit Owner write-side invocation carrying `sourceRef` and producing a stable `owner:create-change` provenance record.

The revised proof additionally requires correction admission to match the exact current failed result/finding identity before that ordinary Change creation is accepted as corrective consumption.

**Evidence Boundary**

Covers the core authority/immutability acceptance boundary plus stale/mismatched failure identity rejection.

**Gap**

Proposal must freeze the bounded Owner corrective input shape.

**Result: PASS.**

**Implication**

A dedicated `reopen-change` path is invalid. A separate autonomous corrective scheduler is unnecessary.

---

### Proof 6 — Mutation Surface + Verification Physical Closure

**Question**

Can B1's expected implementation surface remain bounded and be reached by the existing formal Verification architecture?

**Acceptance Boundary**

Proposal must freeze a complete bounded `flowkitMutationScope`, and Apply must prove:

```text
actualChangeSet
→ verification module
→ capability id
→ logical check
→ physical test target
→ formal result
```

for the new failed/finding/corrective path.

**Method**

Static direct-consumer scan for:

```text
fullTestStatus
deliveryFullTestResult
full-test-failed
createChange
ChangeCreateInput
appendChange
Owner decision kinds
```

Then inspect current source-controlled `VERIFICATION_MODULE_MAP`.

**Evidence**

Expected product mutation surface is bounded to existing responsibilities:

```text
src/domain/**
  minimal Full-Test Finding / retained-result types

src/facts/**
  bounded historical-result + finding projection and fresh-process read

src/persistence/**
  Full-Test-specific failureHistory + atomic corrective reset

src/policy/**
  failed/finding Owner boundary projection

src/services/a1-write-service.ts (or one bounded delivery write service)
  exact-source corrective creation/reset admission

src/diagnostics/** / src/cli/** only if needed
  human/machine projection or bounded corrective input surface

src/verification/change-selection/** only if actual capability closure requires mapping update

related tests/**
OpenSpec B1 artifacts
```

Current Verification modules already own the required path families:

```text
core-model
→ src/domain
→ tests-serialization + typecheck

execution
→ src/facts + src/policy + src/services + related tests
→ tests-execution + typecheck

persistence
→ src/persistence + tests/unit/persistence
→ tests-persistence + typecheck

cli-diagnostics
→ src/cli + src/diagnostics + public integration tests
→ tests-cli + typecheck

verification-selection
→ module map / selection regressions
→ tests-verification + OpenSpec checks + typecheck
```

The closed capability set already includes the likely B1 delta authorities:

```text
flowkit-core-model
flowkit-policy-engine
flowkit-formal-fact-reader-and-persistence
flowkit-delivery-change-creation-and-owner-input
flowkit-diagnostic-cli
flowkit-change-cli-end-to-end-and-performance
```

**Evidence Boundary**

Covers Proposal-level mutation-surface feasibility and existing physical resolver families. The revised authority/migration proofs now also identify the concrete persistence surfaces that must be exercised.

**Gap**

No B1 production implementation exists yet, so exact formal selected target set cannot be proven until Apply. Proposal must explicitly require:

- real failed result → retained failureHistory → Finding → corrective reset regression；
- pre-B1 manifest bounded-read regression；
- B1 checkpoint/fresh-process/later/future-consumer regression；
- stale/mismatched `sourceResultRef` fail-closed regression；
- old createChange-only does not count as consumed correction regression；
- corrective checkpoint → fresh Owner re-authorization integration regression；
- completed historical Change immutability regression；
- counterfactual route-break proving formal selected checks physically execute the new corrective regression；
- archive-sync preflight before terminal Apply。

**Result: PASS for Proposal readiness; Apply must close the physical target set.**

**Implication**

B1 does not need a new Verification framework, but Proposal must freeze the mutation scope up front and explicitly include the new retention/migration regressions.

## 6. Rejected Approaches

### 6.1 Reopen the completed Change that preceded Full Test

Rejected:

```text
Full Test failure is Delivery-level evidence
≠ historical Change Verification failure
```

Reopening would rewrite accepted history and violate the frozen 03 model.

### 6.2 Auto-create a corrective Change from Policy or Full Test runner

Rejected because it synthesizes Owner scope authority.

### 6.3 Treat `full-test-failed` as an Author blocker/revise loop

Rejected because there is no active Author Change target to revise; the next scope choice belongs to Owner.

### 6.4 Keep `fullTestStatus=failed` after corrective Change creation

Rejected because B1 explicitly requires reset to `not-ready`, and it leaves the Delivery lifecycle ambiguous about whether the new candidate is still the failed candidate.

### 6.5 Reset to `not-ready` while leaving `verification.fullTest.result` as current result

Rejected by A1 Reader closed-schema invariant; it becomes a formal fact conflict.

### 6.6 Delete the failed result with no corrective provenance

Rejected because the corrective Change would lose its exact failure source binding.

### 6.7 Generic Delivery Finding DB / Evidence history

Rejected as unnecessary scope expansion. B1 needs only:

```text
verification.fullTest.failureHistory[]
→ exact structured failed Full Test results only

delivery.fullTestFindings[]
→ minimal derived Delivery Finding/provenance only
```

This bounded Full-Test-specific retention is not a generic Evidence/history platform.

### 6.8 Reuse old Full Test authorization after correction

Rejected. Disposable fresh-process proof shows A1 already supports the correct model: return to `awaiting-user-decision` and require a new Owner authorization record.

## 7. Feasible Proposal Boundary

The following is now proven sufficiently to enter Proposal:

```text
A1 valid failed terminal result
↓
Flowkit exposes one deterministic blocking Full-Test Delivery Finding
  source authority = current Verification result/resultRef
↓
Policy remains at Owner boundary
↓
Owner explicitly chooses corrective Change
↓
write-side validates exact current failed result/finding identity
↓
atomic correction admission:
  retain exact failed structured result under
    verification.fullTest.failureHistory[]
  persist bounded delivery.fullTestFindings[] projection
  create one ordinary required planned Change
  current verification.fullTest.result exits current authority
  failed → not-ready
↓
ordinary activation + ordinary 02 Change lifecycle
↓
Archive + authorized Change Checkpoint
↓
new B1 repository-global semantics become canonical
↓
fresh process / later Change / future Delivery bounded-read the same facts
↓
corrective checkpoint restores Ready eligibility
↓
awaiting-user-decision
↓
Owner must explicitly authorize Full Test again
```

Authority remains singular:

```text
Verification Full Test structured result
→ primary failed-result truth

Flowkit Delivery Finding
→ bounded reference/projection only

Owner create-change fact
→ corrective scope/decision authority
```

Proposal MUST preserve the proven authority relationship. A hash-only provenance record or copied Finding fields without a resolvable retained Verification result are not acceptable alternatives.

Proposal should prefer existing `createChange` / activation / Change lifecycle primitives and add only the minimum corrective binding/reset semantics.

Proposal MUST freeze a complete bounded `flowkitMutationScope` before Review-Propose. It MUST NOT defer mutation-scope discovery to Apply.

## 8. Open Decisions for Proposal

The feasibility-critical choices are no longer open. Proposal must keep these proven boundaries:

1. **Failure-result authority**
   - `verification.fullTest.result` remains current-terminal-only；
   - an exact failed structured result that exits current authority is retained in a Full-Test-specific bounded history subtree；
   - no raw logs / generic Evidence history。

2. **Delivery Finding authority**
   - Finding is a deterministic bounded projection/reference；
   - `sourceResultRef` must resolve to the exact current/retained Verification result；
   - stale/mismatched refs fail closed in write-side and fresh read。

3. **Activation compatibility**
   - pre-B1 manifests lacking the optional B1 fields remain legitimate historical inputs；
   - post-B1 fields use closed-schema validation；
   - repository-global semantics become canonical at the authorized B1 Change Checkpoint；
   - later/future consumers must not depend on chat/session state or revert to createChange-only inference。

4. **Owner corrective create surface**
   - reuse existing Owner `create change` authority where possible；
   - Proposal may choose the smallest exact input spelling for `findingId/sourceResultRef` binding；
   - no separate autonomous corrective action/scheduler is introduced。

5. **Exact schema spelling / placement details**
   - Proposal may freeze final key names and rendering order for the proven conceptual slots, provided it preserves the two-authority shape above and remains bounded to Full Test failure history/provenance。

No Owner scope decision is required to proceed to Proposal.

## 9. 019 Reviewer Finding Closure

### B1-RE-001 — resolved

Reviewer required a durable Verification authority after `failed → not-ready`.

Revised proof demonstrates:

```text
exact failed FullTestTerminalResult
→ retained physically under Full-Test-specific Verification failure history
→ canonical resultRef independently recomputed
→ Finding.sourceResultRef resolves in fresh process
→ stale/mismatched refs fail closed
```

The Finding is not the historical failure authority and no generic Evidence DB is introduced.

### B1-RE-002 — resolved

Reviewer required migration/self-hosting activation persistence proof.

Revised proof explicitly establishes:

```text
Base 55622af current implementation starts B1
→ detached B1 candidate is non-canonical
→ authorized B1 Change Checkpoint is activation boundary
→ pre-B1 manifests bounded-read without new fields
→ post-B1 checkpoint fresh clone reconstructs new fields
→ later same-Delivery consumer PASS
→ future Delivery-shaped consumer PASS
→ createChange-only fixture remains unconsumed failed state
```

Evidence Boundary now covers the required activation and historical/future compatibility boundary.
