## Context

E1 位于 D1 checkpoint 后，但 F1/G1/H1 尚未实现。D1 已提供 Delivery architecture path resolution、Current/Planned durable JSON、`actual` path reservation、`render current|planned`、mechanical compare与 exact managed Archify repository-evidence seam。A1/B1 已提供 Delivery Full Test lifecycle、failed Finding与 corrective Change；它们不覆盖 Full Test passed 后的 architecture acceptance/remediation。

065 Explore 已物理证明：

1. E1 Apply 不能产生 formal 03 Actual；正式 Actual 必须等待所有 required Changes completed+checkpointed 与 Full Test passed。
2. exact managed Archify 2.14.0 可以 validate/deliver final-shaped Actual，并对 Planned/Actual产生 deterministic revision-pinned compare evidence。
3. compare evidence不能决定 acceptance。
4. passed + non-accepted architecture cycle 下，ordinary createChange 不会失效旧 passed qualification；需要 bounded atomic post-pass remediation admission。
5. accepted Actual source可以跨 durable read/resume 边界被不同 future deliveryId consumer使用，而无需 global singleton。

## Goals / Non-Goals

### Goals

- 建立可在 post-Full-Test final candidate 上执行的 Actual/Compare capability。
- 将当前 Actual/Compare与 exact Full Test qualification occurrence（Owner authorize-full-test ref + technical resultRef）绑定成 compact current cycle。
- 建立独立 `accept-architecture` Owner authority与 Finalize 前 architecture gate。
- 建立 stale-cycle-safe post-pass remediation admission。
- 建立 accepted Actual source producer/persistence/fresh-reader/future-Delivery consumer contract。
- 关闭 E1 mutation surface与 physical Verification chain。

### Non-Goals

- E1 Apply 时生成正式 03 Actual。
- 自动 author Actual JSON。
- Archify/Reviewer/AI决定 architecture acceptance。
- global `system.architecture.json`、Architecture DB/Registry/history ledger。
- 自动 remediation Change或 generic Finding DB。
- F1 Finalize、G1 resume runner、H1 stable runner/self-hosting acceptance。

## Decisions

### 1. E1 capability completion 与 03 Actual instantiation 分离

E1 Apply只交付 reusable behavior/code/tests/specs。当前 03 `actual.architecture.json` MUST remain absent during E1 Apply。后续所有 required Changes completed+checkpointed、Owner Full Test authorization、Full Test passed 后，03 才通过本 capability author/validate/compare真正的 final Actual。

这与 A1“先实现 Full Test behavior，后续 Delivery dogfood”同构，避免 E1 intermediate Base污染 final architecture truth。

### 2. Actual JSON 仍由 human/AI 从 final repository 独立 author

Flowkit不推断或自动复制 Planned。正式 Actual durable source继续是：

`architecture/<delivery-id>/json/actual.architecture.json`

E1只负责：

- 检查文件存在；
- exact managed Archify validate with repository evidence；
- `flowkit architecture render actual` derived HTML；
- Planned-vs-Actual compare；
- compact refs/policy binding。

### 3. `architecture compare planned actual` 发布 current architecture cycle，但不接受 architecture

当且仅当：

- active Delivery `architecture.impact=true`；
- no active/planned required Change remains；
- current Delivery Full Test raw/effective status=`passed`且current result存在；
- Policy 当前 Delivery behavior=`architecture-actual-compare`；

`flowkit architecture compare planned actual` 才具有 formal cycle publication语义。

它必须：

1. validate Actual with exact managed Archify + repository root；
2. compute `actualArchitectureRef` from normalized logical path + JSON SHA-256 + current repository revision；
3. run exact managed Archify Planned-vs-Actual compare；
4. compute compact deterministic `compareRef` from exact Planned/Actual refs + stable structured compare result；
5. derive `fullTestAuthorizationRef` from current formal facts as the delivery-scoped `authorize-full-test` Owner ref that qualifies the current passed result; caller MUST NOT inject it；
6. compute `cycleRef` from `fullTestAuthorizationRef + fullTestResultRef + actualArchitectureRef + compareRef`；
7. atomically persist `architecture.currentCycle` with acceptance=`awaiting-owner-decision`。

Generated `actual.html` / `delta.html` / `delta.receipt.json` remain disposable and are not persisted as authority refs.

Repeated exact publication MAY be idempotent. Different current Full Test result/Actual bytes/compare evidence MUST create a different cycle and MUST NOT silently overwrite an accepted cycle.

### 4. Manifest architecture projection remains compact and current-state oriented

Proposed closed shape:

```yaml
architecture:
  impact: true
  archifyPlan: "required"
  currentCycle:
    schemaVersion: 1
    cycleRef: "architecture-cycle:<sha256>"
    fullTestAuthorizationRef: "<delivery-scoped authorize-full-test owner ref>"
    fullTestResultRef: "<verification-owned current passed result ref>"
    actualArchitectureRef:
      path: "architecture/<delivery-id>/json/actual.architecture.json"
      sha256: "<sha256>"
      repositoryRevision: "<exact git revision>"
    compareRef: "architecture-compare:<sha256>"
    acceptance:
      status: awaiting-owner-decision | accepted
      ownerDecisionRef: "<owner ref>" # accepted only
  acceptedSystemSource:
    schemaVersion: 1
    sourceDeliveryId: "<delivery-id>"
    actualArchitectureRef: { ...same compact ref... }
    compareRef: "architecture-compare:<sha256>"
    ownerAcceptanceRef: "owner:<sha256>"
```

`currentCycle` is current qualification, not a history DB. Its identity exact-binds both the fresh Owner authorization occurrence and the technical Full Test result, so identical result/Actual/compare bytes under a later authorization still form a different cycle. On architecture remediation it is removed. Historical point-in-time bytes remain Git authority plus Owner provenance. `acceptedSystemSource` exists only after explicit Owner acceptance and is the durable cross-Delivery producer fact.

### 5. `accept-architecture` is a dedicated Owner decision

Add Owner decision identity:

`accept-architecture`

It is Delivery-scoped, authorization-like, and may be recorded only when Policy currently requests that exact gate. Caller supplies Owner `sourceRef`; write-side derives and binds the current `cycleRef` rather than accepting an arbitrary caller-supplied cycle.

Owner decision record gains bounded optional `architectureCycleRef`, included in canonical Owner ref derivation by the existing `canonicalOwnerDecisionTuple()/ownerDecisionRefFor()` authority. The optional field extends the hash domain only when present; legacy/non-architecture records without it MUST preserve their exact pre-E1 canonical tuple/ref. On success, one atomic Manifest publication:

- appends the Owner decision;
- changes currentCycle acceptance to `accepted` and binds ownerDecisionRef;
- writes `acceptedSystemSource` from the same exact Actual/compare cycle.

`compare ok=true`, HTML existence, receipt bytes, Reviewer approval or Finalize authorization cannot synthesize this decision.

### 6. Policy adds a Delivery architecture behavior/gate before F1 Finalize

For `architecture.impact=true` after Full Test passed:

```text
no currentCycle
→ delivery-behavior: architecture-actual-compare

currentCycle.awaiting-owner-decision
→ owner-decision: accept-architecture

currentCycle.accepted + acceptedSystemSource exact-match
→ existing owner-decision: authorize-delivery-finalize
```

For `architecture.impact=false`, existing Full-Test-passed → Finalize authorization behavior remains applicable.

Architecture behavior is not a Standard Change Action/Run and consumes no NNN.

### 7. Post-pass architecture remediation reuses create-change surface but requires exact cycle binding

Extend ChangeCreateInput with bounded optional:

```json
{
  "architectureRemediation": {
    "cycleRef": "architecture-cycle:<sha256>"
  }
}
```

Admission is allowed only when:

- raw/effective Full Test=`passed`;
- `architecture.currentCycle.acceptance.status=awaiting-owner-decision`;
- binding exactly matches current cycle, whose `fullTestAuthorizationRef` and `fullTestResultRef` still match the current passed qualification occurrence;
- new Change `required=true`;
- no B1 `corrective` binding is present.

At this boundary, passed-state ordinary required create-change without architectureRemediation MUST fail closed. Stale/mismatched binding MUST fail before any bytes mutate.

Successful atomic publication:

```text
append required planned Change
+ append create-change Owner record bound to invalidated architectureCycleRef
+ remove verification.fullTest.result
+ delivery.fullTestStatus: passed -> not-ready
+ remove architecture.currentCycle
```

No Full-Test-failed Finding is created. After remediation Change completed + matching checkpoint, existing readiness projection yields `awaiting-user-decision`; fresh `authorize-full-test` and new passed result are required before a new Actual/Compare cycle can be published.

An already accepted architecture cycle is not a remediation boundary; further post-acceptance scope changes require another explicit contract/legal boundary rather than silently reusing E1 remediation.

### 8. Accepted Actual promotion is a source ref, not a global JSON singleton

`acceptedSystemSource` MUST be serializable and independently verifiable from repository facts. Reader validates:

- sourceDeliveryId consistency;
- the accepted cycle/Owner acceptance binding carries the exact Full Test authorization occurrence provenance;
- normalized Actual logical path under that Delivery;
- Actual JSON SHA-256 exact match;
- repositoryRevision shape;
- compareRef shape;
- Owner acceptance ref points to `accept-architecture` bound to the same cycle/source.

E1 provides a bounded consumer helper that accepts an explicit prior accepted source and future Delivery Start facts. The future Delivery authors its own:

`architecture/<future-delivery-id>/json/current.architecture.json`

using prior accepted Actual as architecture source while rebinding repository evidence to the future Delivery's exact Start Git revision. No repository-global `system.architecture.json` is created.

E1 does not auto-discover “latest” via chat/time ordering and does not implement G1 resume orchestration; it only makes the durable producer/reader contract available.

### 9. Verification ownership extends `tests-architecture` to E1 integration

`architecture` module retains unique ownership of `architecture/**`, `src/architecture/**`, `tests/unit/architecture/**` and adds exact E1 integration ownership:

`tests/integration/e1-architecture-actual-compare-and-system-promotion.test.ts`

The `tests-architecture` physical resolver MUST execute D1 integration + E1 integration + unit architecture tests.

Domain/facts/policy/services/persistence remain in their existing unique modules. CLI remains `cli-diagnostics`. Verification mapping files remain `verification-selection`; no artificial ownership movement.

Expected E1 selection must reach, as applicable:

```text
openspec-current-change-archive-sync
openspec-current-change-strict
tests-architecture
tests-cli
tests-execution
tests-openspec-runtime
tests-persistence
tests-serialization
tests-verification
typecheck
```

### 10. Proposal-to-Apply machine closure is mandatory

Before Review-Propose, fresh Proposal MUST pass:

- production `deriveMutationDeclaration(apply)` and `deriveMutationDeclaration(revise-apply)`;
- read-only `buildVerificationSelection(expected E1 actualChangeSet, E1 delta capability refs)` with matched relation;
- OpenSpec current strict and `--all --strict`;
- staging-aware `git diff --cached --check`;
- exact managed Archify Actual validate/deliver + Planned-vs-Actual compare feasibility using disposable final-shaped source;
- future-Delivery accepted-source read/validate/render prototype from Explore remains represented by tests/tasks, not as production Actual bytes.

## Proposal Preflight Evidence

The revised Proposal generation physically completed the following read-only next-consumer checks:

```text
deriveMutationDeclaration(apply)        PASS / 26 selectors
deriveMutationDeclaration(revise-apply) PASS / 26 selectors

prospective E1 buildVerificationSelection(expected actualChangeSet)
  capabilityRelation = matched
  seed modules = architecture, change-contract, cli-diagnostics, core-model, execution, persistence, verification-selection
  closure modules additionally reaches external-tools + openspec-runtime
  selected checks =
    openspec-current-change-archive-sync
    openspec-current-change-strict
    tests-architecture
    tests-cli
    tests-execution
    tests-external-tools
    tests-openspec-runtime
    tests-persistence
    tests-serialization
    tests-verification
    typecheck

exact managed Archify 2.14.0 disposable final-shaped proof
  validate Actual architecture PASS / 9 of 9 checks
  deliver Actual architecture  PASS
  compare Planned vs Actual    PASS

OpenSpec current strict PASS
OpenSpec --all --strict 20/20 PASS
```

The prospective Catalog proof changes only the two mappings already declared by this Proposal: E1 integration ownership under `architecture` and its physical inclusion in `tests-architecture`. It is disposable proof, not candidate production mutation.

A separate occurrence-identity proof reuses two distinct delivery-scoped `authorize-full-test` Owner refs while deliberately keeping the Full Test payload/resultRef, Actual ref and compare ref identical. Including `fullTestAuthorizationRef` in the cycle hash yields two different cycleRefs; the first remediation binding is therefore stale against the second fresh qualification. A canonical Owner-ref proof also confirms that adding `architectureCycleRef` changes relevant E1 Owner refs while omitting the field preserves the pre-E1 tuple/ref exactly. The disposable proof produced one shared technical resultRef with two distinct authorization refs, two distinct cycleRefs, stable legacy Owner ref under the absent-field prospective tuple, and distinct acceptance Owner refs when only `architectureCycleRef` differed.

## Risks / Trade-offs

- [Current cycle becomes history database] → keep only one current cycle + one accepted source; use Git/Owner refs for historical provenance.
- [Compare accidentally becomes approval] → dedicated `accept-architecture` gate and explicit policy ordering.
- [Passed Full Test reused after remediation] → cycle identity binds fresh authorize-full-test occurrence + technical result; bounded exact cycle remediation atomically removes current result and sets raw status not-ready.
- [Owner record schema grows generically] → add only bounded `architectureCycleRef` through existing owner-provenance canonical hash authority; absent field preserves legacy refs; no arbitrary metadata bag.
- [Future Current duplicates prior Actual authority] → next Delivery owns a point-in-time Current snapshot; accepted source remains prior Actual ref, no global singleton.
- [E1 scope swallows F1/G1/H1] → no Finalize implementation, no automatic next Delivery creation/resume runner, no 03 Actual during E1 Apply.

## Migration Plan

1. Add bounded architecture lifecycle domain refs/current projection and `accept-architecture` decision identity.
2. Extend Delivery Manifest reader/writer for optional E1 fields while preserving pre-E1 manifests.
3. Extend Policy with post-Full-Test architecture behavior/Owner gate.
4. Extend ArchitectureService/CLI for `render actual` and formal `compare planned actual` cycle publication.
5. Extend createChange with stale-safe post-pass architectureRemediation binding + atomic Full Test/current-cycle invalidation.
6. Add accepted source reader/future Current source helper without global singleton.
7. Extend E1 integration/unit tests and verification ownership/physical resolver.
8. Run formal Change Verification; do not instantiate formal 03 Actual during E1 Apply.

## flowkitMutationScope

```json
{
  "schemaVersion": 1,
  "actions": {
    "apply": {
      "selectors": [
        { "kind": "exact", "path": "openspec/changes/architecture-actual-compare-and-system-promotion/tasks.md" },
        { "kind": "exact", "path": "openspec/changes/architecture-actual-compare-and-system-promotion/verification.md" },
        { "kind": "prefix", "path": "src/architecture" },
        { "kind": "exact", "path": "src/cli/architecture.ts" },
        { "kind": "exact", "path": "src/cli/main.ts" },
        { "kind": "exact", "path": "src/domain/a1-types.ts" },
        { "kind": "exact", "path": "src/domain/owner-provenance.ts" },
        { "kind": "exact", "path": "src/facts/formal-fact-reader.ts" },
        { "kind": "exact", "path": "src/facts/formal-fact-snapshot.ts" },
        { "kind": "exact", "path": "src/persistence/delivery-manifest-document.ts" },
        { "kind": "exact", "path": "src/policy/next.ts" },
        { "kind": "exact", "path": "src/policy/owner-decision.ts" },
        { "kind": "exact", "path": "src/policy/types.ts" },
        { "kind": "exact", "path": "src/services/a1-write-service.ts" },
        { "kind": "exact", "path": "src/verification/change-selection/evidence.ts" },
        { "kind": "exact", "path": "src/verification/change-selection/module-map.ts" },
        { "kind": "exact", "path": "tests/integration/e1-architecture-actual-compare-and-system-promotion.test.ts" },
        { "kind": "prefix", "path": "tests/unit/architecture" },
        { "kind": "exact", "path": "tests/unit/cli/architecture.test.ts" },
        { "kind": "prefix", "path": "tests/unit/domain" },
        { "kind": "exact", "path": "tests/unit/facts/formal-fact-reader.test.ts" },
        { "kind": "exact", "path": "tests/unit/persistence/delivery-manifest-document.test.ts" },
        { "kind": "prefix", "path": "tests/unit/policy" },
        { "kind": "exact", "path": "tests/unit/services/a1-write-service.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/evidence.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/module-map.test.ts" }
      ]
    },
    "revise-apply": {
      "selectors": [
        { "kind": "exact", "path": "openspec/changes/architecture-actual-compare-and-system-promotion/tasks.md" },
        { "kind": "exact", "path": "openspec/changes/architecture-actual-compare-and-system-promotion/verification.md" },
        { "kind": "prefix", "path": "src/architecture" },
        { "kind": "exact", "path": "src/cli/architecture.ts" },
        { "kind": "exact", "path": "src/cli/main.ts" },
        { "kind": "exact", "path": "src/domain/a1-types.ts" },
        { "kind": "exact", "path": "src/domain/owner-provenance.ts" },
        { "kind": "exact", "path": "src/facts/formal-fact-reader.ts" },
        { "kind": "exact", "path": "src/facts/formal-fact-snapshot.ts" },
        { "kind": "exact", "path": "src/persistence/delivery-manifest-document.ts" },
        { "kind": "exact", "path": "src/policy/next.ts" },
        { "kind": "exact", "path": "src/policy/owner-decision.ts" },
        { "kind": "exact", "path": "src/policy/types.ts" },
        { "kind": "exact", "path": "src/services/a1-write-service.ts" },
        { "kind": "exact", "path": "src/verification/change-selection/evidence.ts" },
        { "kind": "exact", "path": "src/verification/change-selection/module-map.ts" },
        { "kind": "exact", "path": "tests/integration/e1-architecture-actual-compare-and-system-promotion.test.ts" },
        { "kind": "prefix", "path": "tests/unit/architecture" },
        { "kind": "exact", "path": "tests/unit/cli/architecture.test.ts" },
        { "kind": "prefix", "path": "tests/unit/domain" },
        { "kind": "exact", "path": "tests/unit/facts/formal-fact-reader.test.ts" },
        { "kind": "exact", "path": "tests/unit/persistence/delivery-manifest-document.test.ts" },
        { "kind": "prefix", "path": "tests/unit/policy" },
        { "kind": "exact", "path": "tests/unit/services/a1-write-service.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/evidence.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/module-map.test.ts" }
      ]
    }
  }
}
```
