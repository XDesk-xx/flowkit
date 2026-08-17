# Explore — delivery-readiness-and-full-test-behavior

## 1. Problem

03 `20260817-01-delivery-execution-loop` 已在 exact Base
`f132db761bd209e6aff72411108b8e3e1c9801f5` 完成 Delivery Start。A1 是第一个 required Change，目标是把 02 已存在的
“Delivery Full Test 过渡桥接事实”补成完整的 Delivery-level machine behavior：

```text
required Changes completed + checkpointed
→ Delivery Ready
→ awaiting-user-decision
→ Owner authorize Full Test
→ authorized
→ execute frozen Full Test Plan
→ passed | failed
```

同时必须保持：

```text
Delivery Full Test
≠ Standard Change Action
≠ Standard Run
≠ Change Verification
```

02 baseline 已经具有 `FullTestStatus` 五态、`authorize-full-test` Owner decision、Change Checkpoint recognition、
`npm run verify:full` 技术验证计划和 Q1→03 fail-closed bridge；但当前 bridge 尚不能形成完整 lifecycle：

- all required Changes completed + checkpointed 且 `fullTestStatus=not-ready` 时，Policy 返回 `ambiguous-state`；
- `awaiting-user-decision` 即使已有 delivery-scoped `authorize-full-test` fact，Policy 仍继续请求同一 Owner decision；
- `authorized` 时 Policy 固定 blocked 为 `delivery-behavior-not-implemented:full-test`；
- Delivery Manifest 只暴露 human-readable `verification.fullTest.plan: string[]`，FormalFactSnapshot 不读取 executable Full Test Plan；
- 没有 Delivery-level Full Test result projection（summary/resultRef/timing）；
- 当前 `scripts/verification.ts#verifyFullPlan()` 是可执行技术验证 helper，但不是 Owner-authorized lifecycle authority。

A1 需要连接这些已存在的 seam，而不是重造 Verification、Action/Run 或通用 workflow engine。

## 2. Current Facts

### 2.1 Exact repository facts

- Git Base: `f132db761bd209e6aff72411108b8e3e1c9801f5`。
- Branch: `delivery/20260817-01-delivery-execution-loop`。
- Delivery Start commit 已存在；Delivery `state=active`，`fullTestStatus=not-ready`。
- A1 `dependsOn=[]`，是当前唯一 eligible planned Change。
- Owner 已明确授权激活 A1；正式 activation ref：
  `owner:3cbeef44b31bc1e6e1f8f10590bf4b4dfb74911ebcf35448dc2feefe48ff5cbe`。
- A1 已通过正式 write-side 激活，OpenSpec metadata 为 `spec-driven` / required delta。
- Formal Explore Run：`20260817-001-explore`。
- 激活后：`status=stage: explore`，`next=explore`，`doctor=ok / 0 findings`。

### 2.2 Existing 02 baseline seams

当前代码已经提供：

```text
FullTestStatus =
  not-ready
  awaiting-user-decision
  authorized
  passed
  failed

OwnerDecision:
  authorize-full-test

Git facts:
  structured Change Checkpoint recognition

Verification helper:
  verifyFullPlan()
  quality → typecheck → lint → build → openspec-all → full(test:full)
```

`recordOwnerDecision()` 已支持 delivery-scoped `authorize-full-test`，并且 Owner fact 会按 Delivery id fail closed；
因此 A1 不需要新增 Owner authority system。

### 2.3 Current bridge counterfactual

对同一个“all required completed + checkpointed”的 synthetic snapshot 实测：

```text
not-ready
→ blocked: ambiguous-state

awaiting-user-decision / no auth
→ owner-decision: authorize-full-test

awaiting-user-decision / authorize-full-test fact exists
→ owner-decision: authorize-full-test   # authorization 尚未被 behavior 消费

authorized / authorize-full-test fact exists
→ blocked: delivery-behavior-not-implemented

failed
→ blocked: full-test-failed
   suggestedOwnerActions:
   authorize-corrective-change | cancel-delivery
```

这证明 A1 的缺口是 Delivery behavior representation + persistence/execution closure，不是 Standard Change lifecycle 缺失。

### 2.4 Existing Full Test technical executor facts

`verifyFullPlan()` 当前固定六个技术 steps：

```text
quality
→ typecheck
→ lint
→ build
→ openspec-all
→ full (npm run test:full)
```

现有 unit regression 已证明：

- `verify:change` 不会调用 Full Test；
- Full Test step 通过公共 `npm run test:full`；
- resolved OpenSpec executable 会传播给 full-test environment；
- plan fail-fast；
- final `full` step 能记录 passed/failed 与 duration。

本 Explore 只把这些当作技术 feasibility evidence；没有 Owner Delivery Full Test authorization，因此没有运行 Delivery Full Test。

## 3. Scope Boundary

### In scope

- deterministic Delivery readiness projection；
- required Change completed + Checkpoint presence closure；
- current Change-level Blocking Findings closure 的既有 completion invariant；
- Full Test Plan availability / executable binding；
- Owner `authorize-full-test` delivery-scoped authority gate；
- non-Action / no-Run Delivery behavior Policy representation；
- `fullTestStatus` lifecycle；
- Owner-authorized Full Test execution；
- minimal Full Test result projection：summary / resultRef / timing；
- passed / failed deterministic persistence；
- diagnostics / resume from repository formal facts；
- Delivery-level performance observation；
- physical verification coverage for the new CLI/Policy/read/write paths。

### Out of scope

- Delivery Finding / corrective Change creation（B1）；
- architecture lifecycle / Archify（C1/D1/E1）；
- Delivery Finalize implementation（F1）；
- Full Test as Standard Action or Run；
- `_delivery/**` Run、Full Test NNN、Full Test Action Package；
- automatic Full Test authorization；
- automatic Full Test retry；
- generic Delivery behavior framework / Registry；
- Verification platform / Evidence platform；
- new scheduler / concurrency / cache platform；
- changing OpenSpec executable authority（C1）；
- running Delivery Full Test during Explore。

## 4. Mandatory Risk Scan

| Risk | yes/no | Why |
|---|---|---|
| Scope expansion / missing prerequisite | yes | A1 depends on Checkpoint recognition, Owner authorization and technical full verification seams; it must prove these already exist and avoid pulling B1/C1 into A1. |
| Cross-time facts | yes | readiness exists only after final required Checkpoint; authorization exists later; Full Test result exists only after execution. |
| Schema / persistence migration | yes | active Delivery Manifest currently stores only `fullTestStatus` + string coverage plan; A1 needs executable-plan binding and terminal result projection. |
| Self-hosting / writer changes itself | yes | A1 changes Reader/Policy/write-side that later Changes and the same 03 Delivery will consume after A1 Checkpoint. |
| Authority duplication | yes | Owner, Git, Verification and Flowkit lifecycle facts must remain separate; `npm run verify:full` cannot become authorization authority. |
| Generic reusable subsystem | yes | readiness / Full Test behavior must work for future Delivery ids, not only 03/A1. |
| Activation must persist across Change/Delivery boundaries | yes | after A1 Checkpoint, B1 and later Changes plus future Deliveries must read the new behavior from repository facts without chat/session memory. |
| Candidate/formal-fact mutation affects existing consumers | yes | domain types, formal reader, Policy, owner write-side, diagnostics, CLI and verification selection are all direct consumers. |
| Verification selection must reach actual executed targets | yes | new lifecycle CLI/service tests must be physically selected by Change Verification; logical selection alone is insufficient. |
| External tool performs real mutation | yes | 当前 `verifyFullPlan()` 的 `build` 会真实写入 ignored/generated `dist/`，完整测试还会产生 process-local / temporary artifacts；因此必须证明这些物理 mutation 不会成为 durable lifecycle authority，并证明 `authorized` 的 at-least-once re-entry 安全。OpenSpec archive/Archify mutation 仍不属于 A1。 |
| Change claims performance improvement | no | A1 only promises timing/performance observation, not an optimization. It must avoid duplicate Full Test execution but no before/after optimization proof is required. |

## 5. Applicable Proofs

### Proof 1 — Scope / Prerequisite Closure

**Question**

Can A1 be completed using already-delivered 02 primitives without importing B1 corrective findings, C1 external-tool runtime or a new workflow framework?

**Acceptance Boundary**

A1 must be able to determine readiness, gate Owner authorization, execute a frozen Full Test and persist a terminal Delivery result using current 02 Change/Checkpoint/Owner/Verification seams.

**Method**

Inspect exact Base consumers for:

```text
fullTestStatus
Owner authorize-full-test
Change Checkpoint recognition
Policy no-active-change branch
verifyFullPlan / verify:full
formal diagnostics
```

Run the focused baseline regressions for Policy, Owner write-side, diagnostics and verification-plan behavior.

**Evidence**

Targeted baseline tests:

```text
86 tests
86 PASS
0 FAIL
```

Relevant existing capabilities:

- `getCompletedUncheckpointedChanges()` already proves required Checkpoint closure before Full Test branch；
- `allRequiredCompleted()` is Delivery-id-agnostic；
- `recordOwnerDecision()` already admits only the current exact `authorize-full-test` gate；
- `FullTestStatus` already contains the five required lifecycle values；
- `verifyFullPlan()` already provides a stable full verification execution seam；
- failed state already maps to `full-test-failed` and does not auto-create corrective Change。

**Evidence Boundary**

Covers exact current 02 baseline through the A1 entry boundary and the technical Full Test executor seam.

**Gap**

A1 still must implement readiness projection, executable-plan binding, non-Action Delivery behavior execution and terminal persistence. Those are exactly A1 scope, not missing prerequisites.

**Result: PASS.**

**Implication**

Do not pull B1/C1 into A1 and do not create a generic Delivery workflow layer.

---

### Proof 2 — Temporal / Lifecycle + Physical Mutation / Re-entry Feasibility

**Question**

Can the five Full Test states be produced without requiring future facts too early, and can `authorized` remain the only non-terminal resumable lifecycle state even though the exact Full Test plan performs real filesystem work?

**Acceptance Boundary**

Facts must appear no earlier than their real lifecycle time:

```text
T0 required Changes remain
T1 final required Change completed + Checkpoint exists
T2 Delivery Ready / awaiting-user-decision
T3 Owner authorize-full-test fact
T4 authorized Full Test execution
T5 passed | failed result
```

In addition, crash/re-entry must be safe at both physical windows:

```text
W1: interruption mid-plan after generated outputs already exist
W2: all six checks succeed, but lifecycle passed|failed publication has not happened yet
```

No generated output, stdout/stderr, partial timing, or previous successful process may be mistaken for current Verification authority.

**Method**

1. Trace Reader/Policy/write-side timing using only persisted Delivery facts.
2. On exact Base `f132db761bd209e6aff72411108b8e3e1c9801f5`, execute the exact `verifyFullPlan()` steps and inspect repository mutation after every step.
3. Distinguish Git/formal durable facts from ignored/generated/process-local outputs.
4. Leave generated `dist/` in place and execute the later/full step again, representing re-entry after a mid-plan interruption.
5. After one successful full step, deliberately do not publish any Delivery lifecycle result and execute the same full step again, representing the post-success/pre-publication crash window.

**Evidence**

The exact plan is:

```text
quality
→ typecheck
→ lint
→ build
→ openspec-all
→ full (npm run test:full)
```

Physical mutation scan on exact Base:

| Step | Physical result | Repository/formal durable mutation | Disposable/generated mutation |
|---|---|---|---|
| `quality` | PASS | none | process output only |
| `typecheck` | PASS | none | process output only |
| `lint` | PASS | none | process output only |
| `build` | PASS | none | `dist/**` generated; 252 files; ignored by Git |
| `openspec-all` | PASS, 17/17 | none | process output only |
| `full` | PASS, 811/811 | none | test/process-local temporary output; existing ignored `dist/**` is not lifecycle authority |

For the first five steps, a SHA-256 repository tree scan excluding `.git`, `node_modules`, `dist`, `.tmp`, and `coverage` remained byte-identical after every step. After `build`, `git status --short --ignored` showed only:

```text
!! dist/
!! node_modules/
```

No tracked or ordinary untracked repository fact changed.

The full step then ran successfully with the already-generated `dist/` still present:

```text
tests 811
pass  811
fail  0
step: full status=passed
duration ≈ 52.668s
```

This covers W1: re-entry after a partial plan may repeat quality/typecheck/lint/build and may overwrite/recreate ignored `dist/**`, but no Delivery/OpenSpec/Git authority is advanced by those physical steps.

For W2, after that successful full step the repository was intentionally left without any new A1 lifecycle publication. The same full step was executed again against the same repository facts and again passed:

```text
tests 811
pass  811
fail  0
step: full status=passed
duration ≈ 52.870s
```

Between the two successful technical executions, no Delivery lifecycle fact was published. A second SHA-256 repository scan was byte-identical to the first post-success scan, and the aggregate `dist/**` SHA-256 remained `cfc5e058f3fac46f7d124e873b746f1e25e35495122deb56d1cca0324207ec88`. Thus:

```text
generated dist/**
stdout/stderr
per-step timing
prior successful process
```

cannot be interpreted as current Delivery Full Test authority. A1 Proposal must publish terminal `passed|failed` only through the bounded Delivery write-side after the *current* plan execution returns.

A feasible minimal lifecycle sequence is therefore:

```text
not-ready
  + required Changes not all completed/checkpointed
→ remain not-ready

all required completed/checkpointed
  + conflicts=0
  + executable Full Test Plan available
→ awaiting-user-decision

Owner authorize-full-test
→ durable Owner fact
→ authorized

authorized
→ execute exact plan at-least-once
→ on interruption: remain authorized
→ on fresh process: re-execute from plan start
→ only after current execution returns terminal result:
   atomically publish passed | failed + minimal result projection
```

`authorized` is sufficient as the non-terminal resumable lifecycle state because every pre-publication physical mutation is either read-only with respect to durable repository facts or bounded generated output (`dist/**`) that is reproducible and non-authoritative.

**Evidence Boundary**

Covers readiness → authorization → exact physical plan execution, W1 mid-plan interruption, W2 post-success/pre-publication interruption, fresh re-entry semantics, and the boundary that separates generated files from durable lifecycle authority.

**Gap**

Proposal still must freeze the atomic write-side publication contract for terminal result/status so partial Manifest publication cannot occur. That is an implementation detail inside A1 scope, not an unproven re-entry assumption.

**Result: PASS.**

**Implication**

Do not add a `running` state, Delivery Run, attempt ledger, or session-local continuation state. Re-entry is bounded at-least-once execution from `authorized`; generated `dist/**` may be overwritten, but only the explicit A1 Delivery result publication can create current Full Test lifecycle authority.

---

### Proof 3 — Authority Boundary Proof

**Question**

Can A1 preserve One fact, one authority while connecting Git, Owner and Verification into Delivery lifecycle state?

**Acceptance Boundary**

```text
Git
→ Change Checkpoint existence

Reviewer / Change lifecycle
→ completed Change already implies approved/Blocking=0 at closure

Owner
→ authorize-full-test

Verification
→ actual check execution/result

Flowkit
→ readiness + fullTestStatus lifecycle + accepted result reference/timing projection
```

No authority may be copied into a second durable truth.

**Method**

Map every A1 required fact to its current authoritative source and reject designs that move authority into a Run or raw command exit code alone.

**Evidence**

- Checkpoint is already read from Git formal boundaries; no manifest checkpoint mirror is required.
- Owner authorization is already a signed/hashed Manifest Owner decision record scoped to Delivery id.
- Verification plan already returns process result/timing; Flowkit only needs a minimal lifecycle projection/ref, not raw logs.
- `npm run verify:full` by itself has no Owner fact and therefore cannot authorize lifecycle execution.
- Standard Action catalog remains Change-only.

**Evidence Boundary**

Covers all A1 lifecycle facts and the downstream B1 handoff requirement for a failed Full Test source result.

**Gap**

Proposal must freeze the minimal Delivery-level result reference shape without reusing Change Run `ResultRef` as if Full Test were a Run.

**Result: PASS.**

**Implication**

Full Test result persistence must be Delivery-level and minimal; no `_delivery` Run, Action Package, evidence ledger or duplicate Verification store.

---

### Proof 4 — Delivery Behavior Representation / No-Run Proof

**Question**

Can Policy expose an executable Full Test boundary without reintroducing `full-test` into Standard Formal Actions?

**Acceptance Boundary**

After Owner authorization:

```text
next
→ one deterministic executable Delivery boundary
```

but:

```text
canRun('full-test') = invalid/not Standard Action
no Run allocated
no NNN consumed
no Change Action Package
```

**Method**

Inspect the current closed `PolicyResult` union and Q1→03 bridge.

**Evidence**

Current bridge intentionally uses:

```text
authorized
→ blocked: delivery-behavior-not-implemented
```

and canonical specs already forbid returning `action: full-test`. Therefore the missing representation is not another Action; a bounded non-Action Policy result / Delivery behavior execution seam is structurally feasible and is exactly where the bridge is designed to be replaced.

The current CLI/diagnostics formatter already has a single place to render all `PolicyResult` variants, so adding a Delivery-behavior projection can remain bounded rather than introducing a second router.

**Evidence Boundary**

Covers Policy decision, CLI presentation and execution-entry separation.

**Gap**

Proposal must freeze the exact discriminant/CLI spelling. It must remain bounded to Delivery behavior required by 03 and MUST NOT become a generic behavior Registry.

**Result: PASS.**

**Implication**

Replace the temporary `delivery-behavior-not-implemented:full-test` bridge with one explicit Full Test behavior boundary; do not add `full-test` to `FormalAction`.

---

### Proof 5 — Persistence / Self-hosting / Activation Persistence

**Question**

Will A1 behavior survive A1 Checkpoint, fresh processes, later 03 Changes and future Deliveries without chat or same-session state?

**Acceptance Boundary**

```text
A1 Checkpoint
→ B1 fresh process
→ later 03 Changes
→ Delivery Ready at end of 03
→ future Delivery with a different identity/change graph
→ fresh process reread
```

must consume repository/formal facts only.

**Method**

Trace persistent inputs, then execute the future-Delivery-shaped disposable prototype described in Proof 6 rather than relying only on static source inspection.

**Evidence**

Persistent inputs already have repository authority:

- `delivery.fullTestStatus` persists in the Delivery Manifest.
- Owner facts persist in `ownerDecisions`.
- Checkpoints are reconstructed from Git history.
- the technical Full Test plan is repository code / Delivery contract input, not chat/session state.

The disposable future-Delivery prototype uses those same current Reader/Policy/write-side surfaces and survives a completely new Node process after Owner authorization. The fresh process reconstructs the different Delivery id, both Change states/checkpoints, Owner authorization, `authorized` Full Test status and the same current Policy bridge solely from repository files + Git history.

A bounded migration is feasible without internal schema versioning:

1. historical completed Delivery manifests stay read-only;
2. current/future active Delivery contracts gain the minimum A1 executable-plan/result fields;
3. future `create delivery` emits the new shape after A1 activation/checkpoint;
4. Reader fails closed for active future Deliveries missing required Full Test facts;
5. no historical Delivery Run is reinterpreted as new Full Test authority.

**Evidence Boundary**

Reaches a future-Delivery-shaped consumer and fresh-process reread, not merely current 03/B1 inspection.

**Gap**

Proposal must freeze exact persisted fields and bounded legacy-read behavior. No cross-Delivery feasibility gap remains.

**Result: PASS.**

**Implication**

No Context/ActionPackage/schema-version ladder is needed. Activation is repository-global after the normal A1 checkpoint because future consumers reconstruct the behavior from formal repository facts.

---

### Proof 6 — Genericity / Next-consumer Proof

**Question**

Is A1 generic enough for B1 and future Deliveries, rather than hard-coded to A1/03?

**Acceptance Boundary**

The behavior must work for:

```text
current 03 Delivery
+
B1 failed-Full-Test consumer seam
+
future Delivery with a different id and non-A1 multi-Change graph
+
fresh process/re-read
```

**Method**

Use a disposable repository with a deliberately different identity:

```text
Delivery: 20991231-01-future-delivery-proof

X1 future-input-preparation
→ X2 future-consumer-check
```

Both Changes are required, neither uses A1/03 identity, and X2 depends on X1.

Exercise:

```text
create Delivery
→ mark X1/X2 completed
→ create two strict Change Checkpoint Git boundaries
→ project awaiting-user-decision
→ record delivery-scoped Owner authorize-full-test
→ persist authorized
→ start a brand-new Node process
→ read Formal Facts + Policy again
```

**Evidence**

The prototype produced:

```text
deliveryId:
20991231-01-future-delivery-proof

changeGraph:
X1 future-input-preparation   completed
X2 future-consumer-check      completed
dependsOn(X2) = X1

checkpointCount = 2

before authorization:
next.kind     = owner-decision
next.decision = authorize-full-test

Owner decision:
owner:e6e96cbd668264025a2276b610135d1345d4bc162b5b7b947830054c81fcbc58
deliveryId = 20991231-01-future-delivery-proof
```

A brand-new Node process then re-read the disposable repository and observed:

```text
fullTestStatus = authorized
owner authorize-full-test fact = present for exact future Delivery id
change count = 2
checkpoint count = 2
conflicts = 0

next
→ blocked: delivery-behavior-not-implemented
```

That final temporary bridge is the expected exact pre-A1 behavior. The important genericity result is that the Reader, checkpoint projection, Owner write-side and Policy reach the same A1 entry seam without any `20260817-01-*`, `A1`, or current-Delivery count dependency.

The immediate B1 seam remains:

```text
failed
→ full-test-failed
→ Owner decision boundary
```

so B1 can consume A1 terminal failure without reopening completed Changes.

**Evidence Boundary**

Covers current generic helpers, immediate B1 handoff semantics, a different future Delivery id, a non-A1 multi-Change dependency graph, strict checkpoint recognition, delivery-scoped Owner authorization, and fresh-process reread.

**Gap**

None for Explore genericity/activation feasibility. Proposal/Apply must still convert this proof shape into permanent regression coverage, but that is Verification Closure work rather than a missing feasibility consumer.

**Result: PASS.**

**Implication**

No current-Delivery ordinal/count, A1 key, or `20260817-01-*` identity may appear in production readiness/full-test behavior. The future-Delivery-shaped regression becomes a Proposal/Apply acceptance test, not a deferred Explore proof.

---

### Proof 7 — Mutation Surface + Verification Closure

**Question**

Can the required A1 mutation surface be closed, and can formal Change Verification physically execute the affected lifecycle tests?

**Acceptance Boundary**

Every changed product/test path must map through:

```text
actualChangeSet
→ Verification Module Map
→ logical check
→ physical resolver
→ actual test/command
→ formal Verification result
```

**Method**

Scan direct consumers of `fullTestStatus`, `PolicyResult`, Owner record, Manifest Full Test fields, diagnostics and `verifyFullPlan`.

**Evidence**

Expected mutation families are bounded to:

```text
src/domain/**                 # Delivery behavior/result contract only if needed
src/facts/**                  # executable plan/result/readiness facts
src/policy/**                 # readiness + Delivery behavior result
src/persistence/**            # manifest atomic mutation/parser
src/services/**               # Owner/full-test behavior write-side
src/cli/** + src/diagnostics/**
scripts/verification.ts       # reuse/expose frozen technical plan as needed
src/verification/change-selection/module-map.ts
relevant unit/integration tests
OpenSpec delta + current Delivery manifest contract fields
```

Current Verification Module Map already owns the major source families:

- `src/cli`, `src/diagnostics` → `tests-cli`;
- `src/facts`, `src/policy`, `src/services` → `tests-execution`;
- `src/persistence` → `tests-persistence`;
- `scripts/verification.ts`, selection code → `tests-verification`;
- `src/domain` → `tests-serialization`;
- all shared mutations include `typecheck` through reverse dependencies.

However the closed map/capability contract must be reviewed when A1 adds any new path/capability identity. Proposal must not assume “full repository tests PASS” proves formal physical selection.

Required counterfactual at Apply:

```text
break the actual Delivery Full Test CLI/behavior route in a disposable fixture
→ formal selected A1 tests MUST fail
```

and:

```text
run bare Change Verification
→ MUST NOT execute Delivery Full Test lifecycle merely because A1 touches full-test code
```

**Evidence Boundary**

Covers mutation families, current logical selectors and the physical sentinel required for Apply.

**Gap**

Exact file list is Proposal/Apply dependent; verification closure must be re-evaluated against actualChangeSet.

**Result: PASS for feasibility.**

**Implication**

A1 Proposal must explicitly freeze the physical CLI/service regression and any Module Map update required by the actual paths.

---

### Proof 8 — Full Test Plan / Performance Observation Feasibility

**Question**

Can A1 execute a frozen plan once, capture timing and avoid turning every technical test invocation into Delivery Full Test lifecycle authority?

**Acceptance Boundary**

- only Owner-authorized Delivery behavior obtains Full Test lifecycle semantics;
- the plan has a deterministic executable identity/method and bounded timeout contract;
- terminal publication records total/per-check timing sufficient for 03 performance observation;
- `status` / `next` / `doctor` never execute the Full Test;
- Change Verification remains separate.

**Method**

Inspect `verifyFullPlan()` / `runVerificationPlan()` and physically execute the technical plan on an exact disposable Base. This is feasibility proof execution only: no Owner Full Test lifecycle authorization is recorded and no A1 Delivery result is published.

**Evidence**

Current helper physically demonstrated:

```text
runs six steps in fixed order
fails fast
captures per-step duration
propagates resolved OpenSpec executable into full environment
full step: 811/811 PASS twice on exact Base
build: only ignored dist/** repository output
technical execution alone: no Delivery lifecycle mutation
```

The active Delivery Manifest currently carries a broad coverage list, while the executable helper carries six concrete commands. This is enough to prove feasibility, but the two must not remain unbound parallel truths.

A minimal Proposal can preserve the current coverage list and add exactly one typed executable-plan binding (check/method/scope/timeout/result authority/expected terminal outcome), or equivalently normalize the plan into one canonical typed representation. The exact shape belongs to Proposal; A1 must have only one executable authority.

**Evidence Boundary**

Covers deterministic technical execution, timing collection, failure propagation and separation from lifecycle authorization.

**Gap**

Exact plan persistence schema and timeout value must be frozen in Proposal using current repository timing expectations; no scheduler/concurrency redesign is required.

**Result: PASS.**

**Implication**

Do not call `npm run verify:full` from `next/status/doctor`, and do not treat a manual `npm run test:full` PASS as a Delivery Full Test result.

## 6. Rejected Approaches

### 6.1 Re-add `full-test` to Standard Formal Action / Run

Rejected because 02 canonical contract explicitly removed it. It would recreate `_delivery` Runs, consume NNN and violate 03 scope.

### 6.2 Auto-run Full Test immediately after final Checkpoint

Rejected because Owner authorization is a mandatory independent authority boundary.

### 6.3 Treat `npm run verify:full` / `npm run test:full` as lifecycle authority

Rejected because technical command execution does not prove Owner authorization and cannot own `fullTestStatus`.

### 6.4 Let pure `next/status/doctor` mutate Delivery state or execute tests

Rejected because Policy/diagnostics are read/projection surfaces. Write-side behavior must be explicit and fail closed.

### 6.5 Add a generic Delivery Behavior Registry / workflow engine

Rejected as overdesign. A1 needs only the bounded Delivery behavior representation required for Full Test; F1 can later add Finalize behavior through the same small typed seam if appropriate.

### 6.6 Implement B1 corrective Change / Delivery Finding now

Rejected. A1 only preserves `failed` + result reference/timing so B1 has a clean next-consumer boundary.

### 6.7 Store raw Full Test logs or evidence corpus in Run/Manifest

Rejected. Verification owns raw results; Flowkit stores only lifecycle status + minimal result reference/summary/timing.

### 6.8 Introduce schema/version ladders for the Manifest change

Rejected. Use bounded legacy read for historical manifests and current repository facts; product version remains the repository Delivery head.

## 7. Feasible Proposal Boundary

A1 can enter Proposal with the following boundary proven feasible:

1. **Delivery readiness is deterministic and generic.**
   - required Changes completed；
   - required Checkpoints present；
   - formal conflicts = 0；
   - current Change-level blocking closure is implied by valid completed/archive lifecycle；
   - executable Full Test Plan available。

2. **`awaiting-user-decision` must be a real Delivery lifecycle projection.**
   - it is reached only after readiness；
   - it does not itself run Verification；
   - exact persistence/projection point must be frozen without making Policy read-side mutating。

3. **Owner authorization remains the existing delivery-scoped Owner fact.**
   - no Agent/Reviewer synthesis；
   - early/stale authorization rejected；
   - after authorization, the Delivery becomes `authorized` through the bounded write/behavior path。

4. **Policy gains an explicit non-Action Delivery behavior boundary for Full Test.**
   - Standard `FormalAction` catalog unchanged；
   - no Standard Run / NNN / Action Package；
   - current temporary `delivery-behavior-not-implemented:full-test` bridge is replaced by executable behavior semantics。

5. **Full Test Plan obtains one executable authority.**
   - Delivery contract retains coverage intent；
   - executable binding must include check/method, scope, timeout, result authority and expected terminal outcome；
   - no unbound Manifest-plan vs code-plan dual truth。

6. **Full Test execution reuses current Verification mechanics.**
   - no second test platform；
   - resolved OpenSpec identity remains the 02 baseline until C1 migrates it；
   - no C1 `FLOWKIT_HOME/tools` work in A1。

7. **Terminal result is Delivery-level minimal persistence.**
   - `passed | failed`；
   - summary；
   - resultRef；
   - timing；
   - raw logs remain Verification/tool output；
   - historical Change Runs remain untouched。

8. **Resume is repository-fact based.**
   - `authorized` is sufficient for retry/resume if terminal publication did not occur；
   - no `running` state and no chat/session dependency。

9. **B1 next-consumer remains clean.**
   - failed A1 result remains `failed`；
   - Policy does not auto retry or auto create corrective Change；
   - B1 later consumes failed resultRef to form Delivery Finding/Owner decision。

10. **Verification Closure is mandatory at Apply.**
    - physical behavior/CLI test；
    - future-Delivery-shaped fixture；
    - counterfactual route-break sentinel；
    - actualChangeSet → selected physical tests closure；
    - Change Verification MUST NOT impersonate Delivery Full Test lifecycle。

## 8. Open Decisions for Proposal

Explore does not need further Owner authority. Proposal must freeze these implementation details without changing the above boundary：

1. exact `PolicyResult` discriminant/name for the bounded Delivery Full Test behavior；
2. exact CLI spelling for executing that already-decided Delivery behavior；
3. exact atomic persistence point for `not-ready → awaiting-user-decision → authorized`；
4. exact active/future Delivery Manifest executable-plan shape and bounded legacy-read rule；
5. exact Delivery-level resultRef/persistence shape；
6. exact Full Test timeout value and timing fields；
7. exact source/test mutation list and Verification Module Map additions, if actual paths require them。

None of these open details require a new Change, new Registry, new Run type or re-opening 02 design.

## 9. Explore Conclusion

```text
Result: PASS
```

A1 is feasible on exact Base `f132db761bd209e6aff72411108b8e3e1c9801f5` with no missing external prerequisite.
The existing 02 bridge intentionally stops exactly where A1 begins. The correct next design is a minimal Delivery-level behavior layer that connects deterministic readiness, existing Owner authorization and existing Verification execution while preserving the invariant:

```text
Full Test is Owner-authorized Delivery behavior
and is never a Standard Change Action / Run.
```

No **Owner-authorized Delivery Full Test lifecycle behavior** was executed during this Explore. The existing technical verification plan was executed only inside disposable proof work; it produced no Delivery Full Test lifecycle authority.
