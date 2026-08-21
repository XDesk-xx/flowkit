# Explore

## 1. Problem

F1 负责把已经存在于 Policy/Owner vocabulary 中的 Delivery Finalize gate 变成真正可执行、可恢复、可审查的 **Delivery behavior**，并形成严格的 Delivery Final Git boundary contract。

F1 不是现在就把 03 Delivery 关闭。当前 F1 刚激活，G1/H1 仍 planned，`fullTestStatus=not-ready`，正式 03 Actual 也尚未实例化。因此 **F1 Apply 必须实现可复用 Finalize/Delivery Final capability，但 MUST NOT 在 F1 Change 内执行 03 finalization 或创建 03 Delivery Final commit**。真正的 03 Finalize 要等 G1/H1 completed + checkpointed、fresh Delivery Full Test passed、Actual/Compare/architecture acceptance 完成以后再 dogfood。

本次 Explore 还发现两个现有产品 gap：

1. `authorize-delivery-finalize` 当前仅按 `decision + deliveryId` 匹配，无法区分 remediation 前后的不同 final candidate qualification；旧 Finalize 授权可能错误复用于 fresh Full Test / fresh architecture cycle。
2. `git-boundary-reader` 当前对 Delivery Final 采用 loose subject contains 识别；没有 formal trailers、没有 Owner point-in-time authority 的假 commit 也会被认成 `delivery-final`。

F1 Proposal 必须在不创建 Finalize Run、不复制 Full Test/Architecture/Git authority、不自动 Commit/Push/Merge 的前提下关闭这两个 gap。

## 2. Current Facts

- canonical Base: `b9a9e8108348b130cd5a30c6e57f8336abfe958b`
- Git boundary: `chore(flowkit): checkpoint architecture-actual-compare-and-system-promotion`
- A1 / B1 / C1 / D1 / E1: completed + checkpointed
- F1: planned -> Owner explicitly activated
- Owner activation ref: `owner:aedd9bb750cc3718eb6c0de386485714f8ae7d38dd489d08462aaa995edfdb52`
- formal Run: `20260818-074-explore`
- after activation: `stage=explore`, `next=explore`, `doctor=ok`
- Delivery raw/effective `fullTestStatus=not-ready`
- G1 / H1 remain planned
- current 03 `actual.architecture.json` remains absent, as required by E1 delayed-dogfood contract
- current Policy already implements the pre-F1 gate:
  - Full Test passed + architecture-impact=true + no cycle -> `architecture-actual-compare`
  - current cycle awaiting -> `accept-architecture`
  - accepted cycle + exact `acceptedSystemSource` -> `authorize-delivery-finalize`
  - after `authorize-delivery-finalize` exists -> `blocked: delivery-behavior-not-implemented:delivery-finalize`
- `authorize-delivery-finalize` already exists in Owner decision vocabulary and is Delivery-scoped
- Standard Change Action catalog excludes Delivery Finalize; historical `delivery-finalize` Runs are legacy-only compatibility facts
- `DeliveryManifestDocument` can mutate Full Test and Architecture lifecycle blocks but has no Delivery completed/finalization publication operation
- no production Delivery Finalize service/CLI exists
- Change Checkpoint already has a deterministic read-only Git handoff service with exact Owner authorization + preflight; Delivery Final has no equivalent
- current Git reader recognizes Delivery Final by loose subject matching and does not perform strict trailer / point-in-time Owner admission

## 3. Scope Boundary

### In scope

- deterministic finalization precondition/qualification projection
- Owner `authorize-delivery-finalize` exact-current qualification binding
- no-Run Delivery Finalize behavior
- atomic minimal finalization publication + `delivery.state: active -> completed`
- accepted Architecture binding when `architectureImpact=true`; explicit not-applicable branch when false
- crash/resume-safe finalization projection sufficient to reconstruct the Git handoff without chat state
- Delivery Final Git handoff/preflight
- exact Delivery Final subject/trailer identity
- point-in-time Manifest/Owner admission of Delivery Final boundary
- bounded historical Delivery Final compatibility without allowing fresh loose subjects
- PR Merge Commit topology expectation / post-merge read-only validation boundary
- F1 tests + Verification ownership / physical resolver closure

### Out of scope

- actually finalizing current 03 during F1 Apply
- creating 03 Delivery Final commit during F1 Change lifecycle
- Delivery Full Test implementation (A1 already owns it)
- Actual/Compare/architecture acceptance implementation (E1 already owns it)
- auto Commit / Push / PR / Merge
- squash/rebase migration engine
- Git hosting provider integration
- new Finalize Formal Action / Standard Run / Delivery-wide NNN
- Finalize Action Package
- copying Full Test logs, Change history, Architecture JSON bytes, or Git history into a new finalization database
- generic transaction/evidence/receipt platform
- G1 sync/Agent Adapter implementation
- H1 stable Runner/self-hosting implementation

## 4. Risk Scan

| Risk | yes/no | Why |
|---|---|---|
| Scope / prerequisite | yes | A/B/E capability exists, but current 03 is not final-ready and G/H remain planned |
| Cross-time facts | yes | F1 capability implementation time != later post-H1 03 Finalize time; Owner authorization must bind the exact later qualification |
| Schema / persistence migration | yes | Delivery needs a minimal completed/finalization projection; Owner ref needs bounded qualification binding |
| Self-hosting / activation persistence | yes | behavior must survive F1 checkpoint, G1/H1, then be dogfooded later and reused by future Deliveries |
| Authority duplication | yes | Full Test, Architecture, Owner, Manifest and Git each already own different facts |
| Generic reusable subsystem | yes | Finalize and Delivery Final must work for a different future deliveryId without 03 constants |
| Verification physical closure | yes | F1 will touch policy/domain/facts/persistence/services/CLI/Git reader plus a new integration target |
| External mutation | yes | Finalize writes Manifest; Delivery Final is a real Git commit created later by Executor |
| Performance claim | no | no performance improvement claim |

## 5. Applicable Proofs

### Proof A — Activation / prerequisite boundary

**Question:** is F1 the legal next Change on the new Base?

**Acceptance Boundary:** E1 completed + checkpointed, F1 planned with dependencies satisfied, no active Change, Policy requests F1 activation.

**Evidence:** on exact Base `b9a9e810...`, before activation:

```text
next   = owner-decision activate-change F1
doctor = ok / 0 findings
```

Owner activation recorded `owner:aedd9bb7...`; after activation:

```text
F1 state = active
stage    = explore
next     = explore
doctor   = ok / 0 findings
```

**Evidence Boundary:** current F1 Explore entry.

**Result: PASS**

### Proof B — Temporal / delayed 03 dogfood

**Question:** may F1 Apply actually finalize 03?

**Acceptance Boundary:** formal Delivery Finalize only after all required Changes completed + checkpointed, Full Test passed, architecture alignment accepted/not-applicable, formal facts conflict-free, and Owner independently authorizes Finalize.

**Evidence:** at F1 entry G1/H1 are still planned and Delivery `fullTestStatus=not-ready`; current 03 Actual has not yet been instantiated. Any F1-time `delivery.state=completed` or Delivery Final commit would exclude later G1/H1 implementation and violate the Delivery final-candidate contract.

**Evidence Boundary:** current 03 through F1 activation.

**Result: PASS for delayed behavior; FAIL for “finalize 03 during F1 Apply”.**

**Implication:** F1 implements reusable behavior now; real 03 dogfood occurs only after G1/H1 checkpoint + fresh Full Test + E1 Actual/Compare/acceptance.

### Proof C — Existing Policy/Owner no-Run boundary is reusable

**Question:** does F1 need a new Formal Action or Owner decision vocabulary?

**Acceptance Boundary:** Finalize remains a Delivery behavior; Owner gate remains independent from architecture acceptance; no Standard Run/NNN.

**Evidence:** current code/specs already provide:

```text
OWNER_DECISIONS includes authorize-delivery-finalize
AUTHORIZATION_ONLY_OWNER_DECISIONS includes authorize-delivery-finalize
Standard CHANGE_ACTIONS excludes delivery-finalize
Policy after accepted architecture returns authorize-delivery-finalize
Policy after matching authorization reaches delivery-behavior-not-implemented:delivery-finalize
```

Existing E1 integration physically reaches `decision: authorize-delivery-finalize` after Actual -> Compare -> Owner acceptance; baseline E1 integration re-run: `2/2 PASS`.

Historical `.flowkit` contains old Finalize Runs, but `legacy-recognizer` already classifies `delivery-finalize` only as historical delivery action compatibility; current Standard Run model remains Change-only.

**Evidence Boundary:** current reusable Policy/Owner gate.

**Result: PASS**

**Implication:** Proposal should add one `delivery-finalize` **delivery behavior**, not a Formal Action/Run/Action Package.

### Proof D — Finalize authorization occurrence identity / stale authorization replay

**Question:** can existing Delivery-scoped `authorize-delivery-finalize` safely survive a post-pass remediation + fresh Full Test cycle?

**Acceptance Boundary:** Owner Finalize authorization must apply only to the exact current final candidate qualification. Any new Full Test authorization/result or new accepted Architecture cycle must require a fresh Owner Finalize authorization.

**Method:** called production `next()` with a synthetic future Delivery that has:

```text
fresh fullTestStatus = passed
fresh accepted architecture cycle/source
ownerAuthorizations contains an older authorize-delivery-finalize record
```

Because current `hasOwnerAuthorization()` matches only `decision + deliveryId`, the old record is indistinguishable from an authorization for the fresh cycle.

**Evidence:** production Policy returned:

```text
kind   = blocked
reason = delivery-behavior-not-implemented:delivery-finalize
```

rather than requesting a fresh `authorize-delivery-finalize` decision.

A disposable qualification-identity prototype then hashed only existing formal refs:

```text
deliveryId
+ current fullTestAuthorizationRef
+ current fullTestResultRef
+ architecture disposition:
    accepted -> exact cycleRef + ownerAcceptanceRef
    not-applicable -> literal not-applicable
```

Results:

```text
same technical result + fresh Full Test authorization -> qualificationRef changes
same Full Test occurrence + fresh accepted architecture cycle -> qualificationRef changes
architecture not-applicable + fresh Full Test authorization -> qualificationRef changes
different deliveryId -> qualificationRef changes
```

**Evidence Boundary:** future-Delivery-shaped Owner qualification selection, including architecture true/false branches.

**Result: PASS (gap identified + minimal identity shape feasible).**

**Implication:** Proposal must freeze a deterministic Finalize qualification ref (exact field name left to Proposal) and bind `authorize-delivery-finalize` canonical Owner provenance to that qualification. Caller MUST NOT inject it. Records without the new optional binding must preserve historical canonical Owner refs; fresh post-F1 Finalize authorization must be qualification-bound. This is not a new Owner authority, only exact applicability identity.

### Proof D2 — Post-pass required Change freshness / old qualification invalidation

**Question:** after Full Test has passed (and, when applicable, Architecture has been accepted), can Owner legally add a new required Change without re-running the final qualification cycle?

**Acceptance Boundary:** every required Change that becomes part of the Delivery after a passed Full Test must invalidate that old final-candidate qualification. Finalize must remain unreachable until the new Change is completed + checkpointed, a fresh Full Test occurrence passes, and, when `architectureImpact=true`, a fresh Actual/Compare/Owner-acceptance cycle is formed.

**Method:** executed two disposable next-consumer fixtures through the real `createChange()` / `next()` / Full Test / Architecture paths:

```text
A. architectureImpact=true
   Full Test passed
   -> Actual / Compare
   -> Owner accept-architecture
   -> Policy asks authorize-delivery-finalize

B. architectureImpact=false
   Full Test passed
   -> Policy asks authorize-delivery-finalize
```

First, the current production `createChange()` was called with an ordinary new `required=true` Change after those boundaries. This reproduced Reviewer finding `F1-RE-001`:

```text
current production ordinary createChange()
-> appends new planned required Change
-> old delivery.fullTestStatus remains passed
-> old Full Test result remains current
-> when architectureImpact=true:
   old accepted currentCycle remains current
   old acceptedSystemSource remains current
```

Therefore the 074 qualification inputs can remain byte-for-byte unchanged even though the required Change set has changed.

A disposable prospective writer then used the already-established A1/E1 invalidation primitives in **one publication** with the new Change:

```text
append required Change + create-change Owner record
+ remove current Full Test result
+ passed -> not-ready
+ when architectureImpact=true:
    remove currentCycle
    remove current acceptedSystemSource
```

The proof then completed + checkpointed the new Change and called production Policy again.

Observed for both architecture branches:

```text
post-pass required Change created
-> old Finalize path unavailable
-> new Change completed + checkpointed
-> next = authorize-full-test
-> old authorize-delivery-finalize cannot make Policy skip the fresh Full Test gate
```

For `architectureImpact=true`, after the second Full Test passed:

```text
next = architecture-actual-compare
not authorize-delivery-finalize
-> fresh Actual observation
-> fresh Compare
-> fresh architecture cycleRef (different from old cycle)
-> fresh Owner accept-architecture
-> only then Finalize becomes eligible again
```

For `architectureImpact=false`, after the second Full Test passed, Finalize eligibility returned without inventing an Architecture cycle.

**Evidence Boundary:** production `createChange()` gap reproduction plus disposable prospective writer -> production Policy -> checkpoint -> fresh Full Test -> fresh Architecture cycle for both applicability branches.

**Result: PASS**

**Implication:** Proposal must make post-pass scope extension fail-safe at the **Change creation write-side**, not merely add Change/checkpoint identity to Finalize authorization. The minimal accepted direction is: any newly admitted `required=true` Change while the current Delivery is qualified by `fullTestStatus=passed` atomically invalidates the old Full Test qualification; if Architecture is applicable and an accepted current cycle/source exists, that current architecture qualification is invalidated in the same publication. Historical Owner decisions remain immutable; only the current qualification projection is cleared. After the new Change checkpoint, Policy must require a fresh Full Test, and Architecture-applicable Deliveries must then require fresh Actual/Compare/acceptance. This introduces no Finding DB, automatic Change, new Delivery Action or Run.

### Proof E — Minimal finalization projection can remain one-fact-one-authority

**Question:** what must Flowkit persist when Finalize behavior executes, without copying other authorities?

**Acceptance Boundary:** after valid Owner authorization, Finalize must close Delivery and be recoverable after process/session loss, but must not duplicate Full Test/Architecture/Git truth.

**Evidence / design feasibility:** all substantive evidence already has durable primary authorities:

```text
Full Test result/ref            -> verification.fullTest + Verification authority
Full Test Owner occurrence      -> ownerDecisions
accepted Architecture cycle     -> architecture.currentCycle
acceptedSystemSource            -> architecture.acceptedSystemSource
Owner Finalize authorization    -> ownerDecisions
Git boundary SHA/tree/history   -> Git (exists only after later commit)
```

Therefore a minimal Flowkit-owned publication only needs to record that the exact current qualification was finalized by the exact Owner authorization, while `delivery.state` changes to `completed`. A disposable prototype used the closed shape:

```text
delivery:
  state: completed
  fullTestStatus: passed
  finalization:
    schemaVersion: 1
    qualificationRef: <derived-current-qualification>
    ownerAuthorizationRef: <exact authorize-delivery-finalize Owner ref>
```

The prototype does **not** copy Full Test logs, Actual JSON, compare receipt, Change list/history or commit SHA.

**Evidence Boundary:** persisted Finalize state sufficient to reconstruct an exact Git handoff after a crash, before a Git final boundary exists.

**Result: PASS**

**Implication:** Proposal may choose an equivalent compact shape, but finalization publication must be atomic with `active -> completed`, qualification-bound, idempotent for exact same refs, and fail closed on mismatched/stale qualification. It MUST NOT store a future commit SHA that does not yet exist.

### Proof F — Current Delivery Final Git recognition is not strict enough

**Question:** can the current Git reader distinguish a real formal Delivery Final from a same-looking ordinary commit?

**Acceptance Boundary:** current/future Delivery Final must require exact formal identity and matching point-in-time Owner/Manifest finalization facts.

**Method:** disposable Git repo with exact Delivery Start, followed by an ordinary commit:

```text
notes finalize 20991231-01-future-delivery without formal trailers
```

No `Flowkit-Delivery`, no `Flowkit-Boundary`, no `Owner-Authorization` trailers were present.

**Evidence:** current production `readGitBoundaryProjection()` nevertheless returned that commit as:

```text
kind = delivery-final
```

because current reader only checks subject contains `finalize|delivery-final` and deliveryId.

A disposable strict prototype then used:

```text
subject exactly:
chore(flowkit): finalize <delivery-id>

exact single trailers:
Flowkit-Delivery: <delivery-id>
Flowkit-Boundary: delivery-final
Owner-Authorization: <exact Owner ref>
```

and read the Manifest **at the candidate commit** via `git show <sha>:openspec/delivery-groups/<delivery-id>.yaml`. It accepted only when point-in-time facts also showed:

```text
delivery.state = completed
fullTestStatus = passed
delivery.finalization.qualificationRef = expected exact qualification
delivery.finalization.ownerAuthorizationRef = trailer Owner ref
matching authorize-delivery-finalize Owner record exists
```

Prototype exact candidate: PASS.

**Evidence Boundary:** strict current/future Delivery Final candidate + point-in-time authority admission.

**Result: PASS (current reader gap proven; strict design feasible).**

**Implication:** F1 must refactor Delivery Final from direct `boundaries[]` loose recognition into candidate -> strict identity -> FormalFactReader point-in-time admission, analogous to current strict Change Checkpoint boundary. Git owns commit bytes/SHA; Flowkit only admits the boundary using Owner/Manifest facts.

### Proof G — Historical compatibility and Merge Commit topology

**Question:** can strict future Delivery Final rules coexist with existing historical finals and branch deletion?

**Acceptance Boundary:** existing completed Deliveries remain readable without rewriting Git; new/future Delivery Finals are strict; Merge Commit preserves topology even after remote/local delivery branch deletion.

**Evidence:** current repository contains materially different historical Delivery Final forms:

```text
20260805 product-baseline final -> verbose legacy body, no current strict trailers
20260806 deterministic-core final -> exact subject + Flowkit-Delivery/Flowkit-Boundary trailers
20260810 change-execution-loop final -> exact subject + verbose body/Owner text, not current checkpoint-style Owner trailer
```

Therefore globally declaring all legacy finals invalid would break historical compatibility.

Disposable Git topology proof:

```text
Delivery branch final commit
→ git merge --no-ff into main
→ delete Delivery branch
```

After deletion:

```text
final commit remains reachable = true
final is ancestor of merge commit = true
```

**Evidence Boundary:** Git-history preservation semantics plus known historical corpus diversity.

**Result: PASS**

**Implication:** Proposal must freeze a bounded compatibility/cutover rule: fresh post-F1 Delivery Final candidates require strict identity + Owner admission; historical already-finalized deliveries remain readable through an ancestry/version-bounded compatibility path. No Git history rewrite. PR guidance remains **Create a merge commit**; Flowkit MUST NOT auto-merge. A post-merge validator MAY verify a multi-parent Merge Commit preserves the Delivery Final ancestry, but remote provider state is not a new authority.

### Proof H — Pre-finalize candidate preflight / crash-safe Git boundary ordering

**Question:** how can Finalize avoid publishing `delivery.state=completed` before discovering that the repository candidate was already contaminated by unrelated worktree/index drift?

**Acceptance Boundary:** all read-only Git/worktree/index checks that can establish the exact current final candidate must pass while the Delivery is still `active`. Only then may Finalize publish `active -> completed`. The later Git commit remains Executor-owned and may happen after a crash/resume.

**Disposable proof:** created a Git repository at its latest recognized Change checkpoint, then added exactly the kinds of post-checkpoint Delivery-level bytes expected before Finalize:

```text
openspec/delivery-groups/<delivery-id>.yaml
  -> Full Test / Owner / architecture-acceptance qualification facts

architecture/<delivery-id>/json/actual.architecture.json
  -> accepted durable Actual (architectureImpact=true)
```

A read-only prototype preflight required:

```text
index = empty before Finalize publication
HEAD = current checkpoint ancestry source
working-tree/untracked mutation set
  subset of explicitly allowed final-candidate paths
candidateRef = sha256(
  HEAD
  + exact allowed changed path names
  + exact allowed current bytes
)
```

The prototype then introduced an unrelated source mutation after Owner Finalize authorization but **before** Finalize publication:

```text
src/unrelated.ts
```

Observed:

```text
preflight -> FAIL unrelated-drift
Manifest bytes -> unchanged
delivery.state -> active
```

After removing only the unrelated drift, the same expected Actual + Manifest candidate passed and reproduced the same `candidateRef`. Only then did the disposable Finalize publication write:

```text
delivery.state: completed
finalization:
  candidateRef: <exact pre-finalize candidate>
  ownerAuthorizationRef: <exact Owner finalize ref>
```

No Git commit was created by that publication.

**Result: PASS**

**Implication:** 074 ordering is superseded. Proposal must freeze this order:

```text
T0 Policy derives exact Finalize qualification
   + matches exact Owner authorize-delivery-finalize record

T1 read-only FinalCandidatePreflight while Delivery is active
   - exact current checkpoint ancestry / HEAD context
   - index hygiene
   - bounded expected Delivery-level dirty paths only
   - exact candidateRef over current allowed bytes
   - fail closed on unrelated source/index/worktree drift

T2 re-check current qualification/candidate and atomically publish
   active -> completed
   + minimal finalization projection bound to candidateRef + Owner ref

T3 deterministic Delivery Final handoff is reconstructed from durable completed facts

T4 Executor stages only the bounded handoff paths, runs staged hygiene,
   and creates the exact Delivery Final commit

T5 FormalFactReader admits strict Delivery Final identity + point-in-time Manifest/Owner facts

T6 later PR Merge Commit preserves Delivery Final ancestry
```

Commit SHA remains unavailable and unnecessary at T1/T2. Finalize still does not commit, push, create PR or merge.

### Proof I — Post-publication drift and crash/resume recovery

**Question:** does moving candidate preflight before publication make a crash between Finalize and Git commit recoverable without a rollback/reopen engine?

**Acceptance Boundary:** after T2 succeeds, Git handoff must be reproducible from durable completed facts; unrelated drift introduced *after* publication must not be silently committed, but removing that external drift must restore the same mechanical handoff without rewriting Finalize history.

**Method / Evidence:** after the disposable T2 publication, the process was treated as crashed before commit. A fresh handoff read only the completed Manifest, its bound `candidateRef`, and current Git/worktree facts. It reconstructed the expected final-boundary path set and exact trailers.

Then an unrelated post-publication source mutation was introduced. The handoff preflight failed closed. After deleting that unrelated mutation, with no change to the completed Manifest/finalization facts, the same handoff succeeded and created:

```text
chore(flowkit): finalize <delivery-id>

Flowkit-Delivery: <delivery-id>
Flowkit-Boundary: delivery-final
Owner-Authorization: <exact Owner ref>
```

Expected pre-finalization Delivery-level mutations (`actual.architecture.json` when applicable and the Delivery Manifest) were accepted rather than misclassified as unrelated drift.

**Evidence Boundary:** unrelated drift before T2, crash after T2, unrelated drift after T2, and eventual strict mechanical Git commit.

**Result: PASS**

**Implication:** there is no need for a rollback engine or Finalize Run. The crucial invariant is that **pre-existing candidate drift is rejected before `active -> completed`**. Drift that occurs only after a valid publication is an external Git/worktree condition: Delivery Final commit is blocked until the drift is removed, while the durable completed/finalization facts remain sufficient to resume the same handoff. Proposal should store/bind a compact `candidateRef` (exact name left to Proposal) rather than future commit SHA or a repository ledger.

### Proof J — Mutation surface / Verification physical closure

**Expected implementation families:**

```text
src/domain/**                         # finalization qualification/projection identity if needed
src/facts/formal-fact-snapshot.ts
src/facts/formal-fact-reader.ts
src/facts/git-boundary-reader.ts
src/persistence/delivery-manifest-document.ts
src/policy/next.ts
src/policy/types.ts
src/policy/owner-decision.ts          # only if exact qualification matching belongs here
src/services/a1-write-service.ts      # derive/bind authorize-delivery-finalize qualification
src/services/<delivery-finalize>.ts
src/services/<delivery-final-boundary-handoff>.ts
src/cli/main.ts                       # thin Delivery behavior entry / read-only handoff if frozen
src/diagnostics/**                    # only if new delivery behavior context requires rendering
tests/unit/domain|facts|policy|persistence|services|cli|diagnostics/**
tests/integration/<F1 delivery finalize lifecycle test>
src/verification/change-selection/module-map.ts
src/verification/change-selection/evidence.ts
```

Current Verification ownership already covers most production families. However the `execution` module and physical `tests-execution` resolver currently name only the historical `tests/integration/f1-archive-and-checkpoint-boundary.test.ts`; a new F1 Delivery Finalize integration target would not be physically executed unless Proposal explicitly extends both ownership and logical-node selectors.

Expected next-consumer chain must prove:

```text
actualChangeSet
→ exact-one module ownership
→ F1 capability relation
→ tests-execution / tests-cli / tests-persistence / tests-serialization / tests-verification / typecheck as applicable
→ physical inclusion of the new F1 integration target
→ disposable sentinel failure propagates to formal selected check
```

OpenSpec current strict + archive-sync remain mandatory because F1 modifies long-lived lifecycle/Git contracts.

**Evidence Boundary:** Proposal-required mutation/verification design surface.

**Result: PASS (gap located before Proposal).**

## 6. Rejected Approaches

- **Finalize as Standard Action/Run** — violates frozen v8 and current core spec; historical Finalize Runs are legacy-only.
- **F1 Apply directly finalizes 03** — temporally invalid because G1/H1 are not finished and Full Test/Actual are not final-ready.
- **Delivery-scoped forever-valid Finalize authorization** — stale after remediation/fresh Full Test; production proof demonstrates replay.
- **Reuse `accept-architecture` as Finalize authorization** — collapses two Owner authorities that E1 intentionally keeps separate.
- **Store Delivery Final commit SHA in Finalize publication before commit** — circular temporal fact; Git SHA does not yet exist.
- **Recognize Delivery Final by subject contains** — current proof shows false positive.
- **Commit automatically inside Flowkit Finalize service** — mixes Delivery behavior with Executor/Git authority and creates an unsafe hidden transaction.
- **Publish `delivery.state=completed` before read-only final-candidate preflight** — can leave a half-closed Delivery when pre-existing unrelated drift is discovered only afterward.
- **Auto Push/PR/Merge or enforce provider settings** — outside F1; only handoff/expectation/read-only closure validation is in scope.
- **Copy Full Test/Architecture/Git history into a final record** — duplicates existing authorities and creates a new evidence store.
- **Invalidate all historical Delivery Finals under the new strict rule** — breaks bounded compatibility and would require Git history rewrite.

## 7. Feasible Proposal Boundary

Proposal is ready to freeze the following minimal design:

1. **Post-pass required-Change freshness**
   - production currently permits an ordinary required Change after `fullTestStatus=passed`; F1 must close that gap;
   - admitting a new post-pass `required=true` Change atomically invalidates the current Full Test result/status qualification in the same Manifest publication;
   - when Architecture is applicable and a current accepted cycle/source exists, the current architecture qualification is invalidated in the same publication;
   - historical Full Test/Owner/architecture facts remain in their existing historical authorities where applicable, but they are no longer the current qualification;
   - after the new Change is completed + checkpointed, Policy requires a **fresh Owner Full Test authorization + fresh Full Test**; architecture-applicable Deliveries then require fresh Actual/Compare/Owner acceptance before Finalize can become eligible again;
   - architecture-not-applicable Deliveries still require the fresh Full Test cycle.

2. **Finalize qualification identity**
   - deterministic and delivery-scoped;
   - derived from current latest `authorize-full-test` occurrence + current Full Test result;
   - when architecture impact=true, also binds exact accepted current architecture cycle/source;
   - when impact=false, binds explicit architecture-not-applicable disposition;
   - fresh Full Test authorization/result or fresh accepted cycle produces a different qualification;
   - callers cannot inject/override it;
   - Change-set freshness is guaranteed by item 1; simply hashing Change/checkpoint identity without invalidating Full Test is explicitly insufficient.

3. **Owner Finalize applicability**
   - `authorize-delivery-finalize` remains the same Owner decision;
   - its canonical record/ref gains a bounded optional qualification binding for F1;
   - current/future Policy only accepts a record matching the exact current qualification;
   - legacy records without the new field retain historical canonical refs/readability.

4. **Pre-finalize final-candidate identity**
   - before `active -> completed`, Finalize performs a read-only Git/worktree/index preflight;
   - index must satisfy the frozen pre-finalize staging rule (recommended minimal rule: empty; Executor stages only after publication);
   - changed/untracked paths must be a bounded final-candidate allowlist derived from formal Delivery facts (at minimum the Delivery Manifest and, when applicable, the durable Actual JSON; Proposal may freeze any additional genuinely required final-boundary metadata path);
   - unrelated source/index/worktree drift fails closed **while state is still active**;
   - a deterministic `candidateRef` binds current HEAD/checkpoint context + exact allowed path names/bytes; broad “commit whatever is dirty” is forbidden.

5. **Delivery Finalize behavior**
   - no Standard Action/Run/NNN;
   - only executes after exact qualification + Owner authorization + pre-finalize candidate preflight all match current facts;
   - atomically writes `delivery.state=completed` + compact finalization projection bound to qualification + preflight `candidateRef` + Owner ref;
   - idempotent for the same exact finalization facts; mismatched/stale input fails closed;
   - does not create Git commit, push, PR or merge;
   - does not store a commit SHA that does not yet exist.

6. **Crash-safe Delivery Final handoff**
   - reconstructible from completed Delivery facts using explicit deliveryId after process/session loss;
   - re-verifies that current post-publication worktree still corresponds to the bound pre-finalize candidate plus the exact expected finalization publication;
   - post-publication unrelated drift blocks commit but does not require reopening/re-writing the completed Delivery; removing that drift restores the same handoff;
   - exact subject `chore(flowkit): finalize <delivery-id>`;
   - exact single trailers at least `Flowkit-Delivery`, `Flowkit-Boundary: delivery-final`, and exact `Owner-Authorization`;
   - Executor stages only bounded handoff paths and performs `git diff --cached --check` before commit.

7. **Strict Delivery Final admission**
   - Git reader emits candidate rather than directly granting authority;
   - FormalFactReader validates exact identity plus point-in-time Manifest completed/finalization/Owner/candidate binding;
   - fresh malformed/wrong/duplicate trailer candidates are not formal boundaries;
   - bounded pre-F1 historical final compatibility remains read-only.

8. **Merge topology expectation**
   - no automatic merge;
   - Delivery PR must use Merge Commit rather than squash/rebase;
   - optional read-only post-merge validator may confirm multi-parent merge preserves Delivery Final ancestry;
   - branch deletion does not destroy authority because merge/main history retains the final commit.

9. **Verification closure**
   - new F1 integration test path receives exact-one ownership;
   - `tests-execution` physical resolver actually executes it;
   - sentinel proves failure propagation;
   - expected F1 actualChangeSet is dry-run through production `buildVerificationSelection()` before review-propose.

## 8. Open Decisions for Proposal

075 closure: `F1-RE-001` and `F1-RE-002` are addressed by Proof D2 and the revised Proof H/I ordering above; neither requires a new Owner decision before Proposal.

The following implementation names/placement are intentionally left for Proposal rather than silently frozen in Explore:

- exact type/field name for `qualificationRef` and minimal `delivery.finalization` projection;
- whether Finalize behavior and final-boundary handoff are one service with two read/write operations or two thin services;
- exact CLI spelling (`delivery finalize`, plus any explicit read-only handoff/preflight command if needed);
- exact bounded historical Delivery Final cutover mechanism (must be ancestry/version bounded, never generic loose future recognition);
- whether post-merge topology validation belongs in F1 service API or only in H1 acceptance fixtures.

No Owner decision is required before Proposal for these implementation choices. Reviewer should primarily verify that Evidence Boundary covers stale authorization, no-Run behavior, crash recovery, strict Git admission, historical compatibility, and physical Verification closure.
