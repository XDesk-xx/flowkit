# Explore

## 1. Problem

E1 不是再次设计 D1 的 Current / Planned，而是为 Delivery 后半段建立 Actual / Compare / architecture acceptance / next System Architecture source 的正式能力。

本次 Explore 最重要的问题是时序：E1 当前执行时，F1 / G1 / H1 尚未完成，Delivery `fullTestStatus=not-ready`。因此 **E1 Apply 不能把当前 `8cf17ed...` repository 冒充成 03 formal Actual**。E1 必须先实现可在 Delivery Full Test passed 后调用的 architecture behavior；03 自身 Actual/Compare/acceptance 在所有 required Changes completed + checkpointed、Full Test passed 后再 dogfood。

## 2. Current Facts

- canonical Base: `8cf17ed0981717227f9b01ffdef94dae6532366a`
- Git boundary: `chore(flowkit): checkpoint architecture-baseline-and-delivery-plan`
- A1 / B1 / C1 / D1: completed + checkpointed
- E1: planned -> Owner explicitly activated
- Owner activation ref: `owner:25f59b20ba8106aeb40834fd9d87e4b191b56a2a4ff6352ecdc0f43c780d5fb1`
- formal Run: `20260818-063-explore`
- Flowkit after activation: `stage=explore`, `next=explore`, `doctor=ok`
- D1 durable assets already exist:
  - `architecture/20260817-01-delivery-execution-loop/json/current.architecture.json`
  - `architecture/20260817-01-delivery-execution-loop/json/planned.architecture.json`
  - four non-authoritative reference Workflow/Sequence JSON files
- no `actual.architecture.json`
- D1 `ArchitectureService` already resolves `actualJson/actualHtml` and compare accepts `current|planned|actual`, but public render is still `current|planned` only.
- exact managed Archify remains `2.14.0`; repository evidence is architecture-only.

## 3. Scope Boundary

### In scope

- post-Full-Test Actual Architecture authoring contract from final candidate repository facts
- `flowkit architecture render actual` thin binding
- Planned-vs-Actual exact managed Archify compare
- compact durable architecture lifecycle projection / refs without copying JSON or receipts into a database
- explicit Owner architecture acceptance fact
- architecture rejection/non-acceptance stopping Finalize and allowing Owner to explicitly create a bound architecture-remediation required Change
- accepted Actual ref as the source for the next Delivery Current
- next-Delivery Current binding to accepted Actual + that future Delivery's exact Git baseline
- E1 tests and Change Verification ownership/physical closure

### Out of scope

- generating formal 03 Actual during E1 Apply
- modifying D1 Current/Planned/reference semantics
- Archify deciding acceptance
- HTML/compare receipt as architecture authority
- generic Architecture DB/Registry/freshness ledger
- automatic corrective Change
- Delivery Finalize implementation (F1)
- sync/resume implementation (G1)
- stable Runner/self-hosting acceptance (H1)
- per-Change architecture regeneration

## 4. Risk Scan

| Risk | yes/no | Why |
|---|---|---|
| Scope / prerequisite | yes | D1/C1 runtime exists, but E1 acceptance/promotion facts do not yet exist |
| Cross-time facts | yes | E1 implementation time != post-H1 Full-Test-passed Actual authoring time |
| Schema / persistence migration | yes | Delivery Manifest/formal snapshot needs minimal architecture acceptance/ref projection |
| Self-hosting / activation persistence | yes | behavior implemented in E1 must survive F1/G1/H1 and be dogfooded later in same Delivery, then next Delivery |
| Authority duplication | yes | Git, authored Actual JSON, Archify compare, Owner acceptance and Flowkit projection must remain separate |
| Generic reusable subsystem | yes | next Delivery must consume accepted prior Actual without 03-specific constants |
| Verification physical closure | yes | E1 will touch architecture + execution/persistence/policy + CLI/tests |
| External mutation | yes | Archify deliver/compare writes disposable HTML/receipt |
| Performance claim | no | no performance improvement claim |

## 5. Applicable Proofs

### Proof A — Activation / prerequisite

**Acceptance Boundary:** D1 checkpointed; E1 is unique eligible Change; exact managed tools available.

**Evidence:** before activation `next=owner-decision activate-change E1`, `doctor=ok`; activation recorded `owner:25f59...`; after activation `E1 active / stage=explore / next=explore / doctor=ok`.

**Result: PASS**

### Proof B — Temporal / delayed dogfood

**Question:** can E1 Apply create the formal 03 Actual now?

**Acceptance Boundary:** formal Actual must be independently reconstructed from the Delivery final candidate after all required Changes are completed/checkpointed and Delivery Full Test passed.

**Evidence:** at Base `8cf17ed...`, F1/G1/H1 are still planned and `fullTestStatus=not-ready`. Current Policy only reaches Delivery Full Test after all required Changes complete. Therefore an Actual authored now would omit future F1/G1/H1 repository effects and would violate the final-repository requirement.

**Result: PASS for delayed behavior; FAIL for “create formal Actual during E1 Apply”.**

**Implication:** E1 implements the behavior and persistence contract now; formal 03 Actual is authored later during 03 dogfood after Full Test passed. No `actual.architecture.json` is added by E1 Change Apply itself.

### Proof C — Actual / render / compare physical feasibility

**Question:** can a final-shaped authored Actual be validated/rendered and compared to Planned using only exact managed Archify?

**Method:** created a disposable non-authoritative Actual-shaped Architecture from the existing Planned shape, rebound its repository evidence to `8cf17ed...`, introduced one synthetic semantic drift, then invoked exact managed Archify 2.14.0 with explicit `--repo-root`.

**Evidence:**

```text
validate actual        PASS
deliver actual         PASS / 9 of 9 checks
compare planned actual PASS / revision-pinned / 28 of 28 checks
```

Compare summary detected exactly one changed component plus provenance/presentation change. Running the exact same compare twice produced byte-identical JSON/receipt SHA256:

`35789fdeb4c14ff370ff6b813f4f7f83fac171d3d0945d68c9feb175c5a441d9`

**Result: PASS**

**Implication:** no Archify reimplementation is needed. E1 only needs to expose actual render plus formal lifecycle binding around existing thin compare.

### Proof D — Compare authority / Owner acceptance

**Question:** may compare success itself set architecture accepted?

**Evidence:** Archify compare returns deterministic structural evidence, but explicitly states that runtime impact, causality, risk and mergeability are not inferred. Current Flowkit Owner decision schema has no architecture-acceptance decision/fact, and current formal snapshot has no architecture alignment/accepted-Actual projection.

**Result: PASS (gap identified).**

**Implication:** Proposal must add one bounded explicit Owner architecture-acceptance fact or an equivalently explicit write-side contract. `compare ok=true`, generated HTML, receipt existence, Reviewer prose or AI interpretation MUST NOT create acceptance. A dedicated acceptance fact is preferable to silently collapsing architecture acceptance into `authorize-delivery-finalize`, because v6 keeps architecture acceptance before F1 Finalize authorization.

### Proof E — Post-pass architecture remediation / stale qualification invalidation

**Question:** Full Test 已 passed 后，若当前 Actual / Compare 尚未被 Owner 接受，Owner 如何创建 remediation Change，且不复用旧 passed qualification？

**Acceptance Boundary:** remediation admission 必须以当前 non-accepted architecture cycle 为精确输入；同一原子 publication 中新增 required planned Change，并使旧 Full Test current result、旧 Actual / Compare / acceptance cycle 不再 current。Change 完成 + matching checkpoint 后只能重新得到 `awaiting-user-decision`，必须 fresh Owner authorize Full Test；fresh pass 后才允许重新 author Actual / Compare。

**Method:** 在 disposable persisted fixture 中构造：

```text
raw fullTestStatus = passed
current Full Test result = old candidate
current architecture cycle = awaiting-owner-decision
  actual fingerprint = actual-old-bbb
  compare fingerprint = compare-old-ccc
```

prototype 一个最小 post-pass admission：仍由 Owner 显式 `create-change`，但输入必须带当前 architecture cycle 的 exact `cycleId + actualFingerprint + compareFingerprint` 绑定，并且 Change 必须 `required=true`。该 prototype 不使用 B1 `corrective` / Full-Test-failed Finding；字段名仅为 Explore candidate，不在本阶段冻结。

**Evidence:** admission 后 fresh durable read 得到：

```text
new Change state                 = planned
raw fullTestStatus               = not-ready
current Full Test result present = false
current architecture cycle       = none
old Full Test result             = historical / invalidated by remediation Change
old architecture cycle           = historical / invalidated by remediation Change
```

然后只模拟普通 Change lifecycle completion + matching checkpoint，不写任何 Full Test authorization，pure readiness projection 得到：

```text
effective fullTestStatus = awaiting-user-decision
authorize-full-test fact  = absent
Actual authoring allowed  = false
```

再显式加入 fresh Owner `authorize-full-test` 并形成 fresh passed result 后，才满足新的 Actual authoring precondition。整个 fixture 没有 Full-Test-failed Finding，也没有自动创建 Change。

**Result: PASS**

**Implication:** 063 的“ordinary createChange 会自然回到 fresh Full Test”结论被否定。Proposal 必须冻结一个 bounded post-pass architecture-remediation admission。最小可行方向是扩展 Owner `create-change` write-side：只有 `fullTestStatus=passed` + current non-accepted architecture cycle + exact remediation binding 时，原子执行：

```text
append required planned remediation Change
+ record Owner create-change provenance / binding
+ invalidate/remove current Full Test qualification/result
+ invalidate current Actual/Compare/acceptance binding
+ raw fullTestStatus -> not-ready
```

它不是 B1 failed corrective path，不创建 generic Finding DB，也不是自动 recovery。Proposal 冻结具体字段名和 persistence placement。

### Proof F — Accepted Actual promotion / future-Delivery persistence consumer

**Question:** E1 proposed accepted Actual source 能否真实跨 durable read / resume 边界，被一个不同 Delivery 的 Current consumer 使用，而不依赖 03 常量或 global singleton？

**Acceptance Boundary:** synthetic prior Delivery 的 independently-authored Actual + explicit Owner acceptance 必须形成可序列化 source fact；fresh read 后仍能唯一解析 exact Actual path/fingerprint/repository revision；different future Delivery 必须把该 source 与自己的 exact Git Start baseline 结合形成自己的 `current.architecture.json`，并能被 exact managed Archify repository-evidence validate/deliver。

**Method:** disposable prototype 使用两个与 03 无关的 deliveryId：

```text
prior  = 20991231-01-prior-proof
future = 21000101-01-future-proof
```

1. 在 synthetic Git repo 独立 author prior Actual（不是复制当前 03 Planned），并以 synthetic prior-final Git revision 作为 repository evidence。
2. exact managed Archify 2.14.0 `validate architecture` + `deliver architecture`。
3. 计算 Actual JSON SHA256，并持久化一个 candidate accepted-system source：

```text
sourceDeliveryId
actualArchitectureRef:
  path
  sha256
  repositoryRevision
compareRef
ownerAcceptanceRef
```

4. 只复制 durable serialized fact + referenced Actual 到 fresh resume directory，再重新 parse/verify fingerprint，模拟 checkout/resume 后无聊天、无内存对象的读取。
5. synthetic repo 再产生一个不同 future Delivery Start Git revision。future consumer 读取 prior accepted source，复用 prior accepted Actual 的结构作为 Current source，但把 repository evidence 重新绑定到 future Delivery 自己的 exact Start revision，并写入 future 自己的 `architecture/<future-id>/json/current.architecture.json`。
6. 对 future Current 再执行 exact managed Archify 2.14.0 repository-evidence `validate + deliver`。

**Evidence:**

```text
prior Actual validate             PASS
prior Actual deliver              PASS
fresh durable read source         unique / fingerprint matched
future deliveryId                 != prior deliveryId
future Start revision             != prior Actual repository revision
future Current repository revision = future Start exact Git revision
future Current validate           PASS
future Current deliver            PASS
architecture/system.architecture.json absent
```

本次实际 synthetic revisions / fingerprints 由 fixture 动态生成；consumer derivation artifact 不含当前 03 delivery id、`74d46f0`、`f132db7` 或 E1 Base SHA。

**Result: PASS**

**Implication:** E1 可以在 Proposal 中冻结一个 compact, durable accepted-Actual/SystemArchitecture source ref，持久化在 completed prior Delivery 的 formal architecture projection 中；next Delivery 从该 source + 自己的 exact Start Git facts形成新的 Delivery-owned Current。不得复制 prior Actual 到 repository-global `system.architecture.json`。字段名与 exact reader/writer placement仍留给 Proposal，但 producer → serialization → fresh read → different future Delivery consumer 的可行性已经覆盖。

### Proof G — Mutation surface / Verification closure

**Expected implementation families:**

```text
architecture/<delivery-id>/json/actual.architecture.json  # later dogfood, not E1 Apply candidate
src/architecture/**
src/cli/**
src/domain/**
src/facts/**
src/persistence/**
src/policy/**
src/services/**
tests/unit/architecture/**
tests/unit/domain/**
tests/unit/facts|policy|persistence|services/**
tests/integration/<E1 architecture lifecycle test>
src/verification/change-selection/**  # if E1 dedicated integration fixture/test path is added
```

Current ownership already covers production architecture/core/execution/persistence/CLI paths. However a new dedicated integration path named for E1 is not covered by the D1-specific `architecture` test selectors, so Proposal must close this instead of waiting for Apply selection failure.

Expected physical chain must include, as applicable:

```text
tests-architecture
tests-cli
tests-execution
tests-persistence
tests-serialization
tests-external-tools
tests-openspec-runtime
tests-verification
typecheck
OpenSpec current strict/archive-sync
```

**Result: PASS with Proposal mutation-surface requirement.**

## 6. Rejected Approaches

1. **Create `actual.architecture.json` now from `8cf17ed...`** — rejected: not final repository, omits F1/G1/H1.
2. **Copy Planned to Actual and edit a few fields** — rejected: violates independent reconstruction.
3. **Treat Archify compare PASS/no process error as architecture acceptance** — rejected: compare is structural evidence only.
4. **Persist HTML/receipt as second acceptance authority** — rejected: D1/C1 authority boundary forbids this.
5. **Global `system.architecture.json` or Architecture Registry** — rejected: duplicate durable truth/overdesign.
6. **Make E1 itself run Delivery Full Test** — rejected: Full Test is Owner-authorized Delivery behavior after all required Changes complete.
7. **Collapse architecture acceptance silently into Finalize authorization** — rejected as default: loses the explicit pre-F1 acceptance boundary frozen by v6; Proposal should keep a distinct acceptance fact unless Reviewer/Owner changes that contract.

## 7. Feasible Proposal Boundary

E1 can enter Proposal with this boundary:

1. implement post-Full-Test Actual authoring/validation/render/compare support, including `render actual`;
2. do not create the formal 03 Actual during E1 Apply;
3. define a minimal architecture lifecycle projection in formal Delivery facts: applicability, Actual ref/fingerprint, compare binding, acceptance status/Owner acceptance ref, accepted Actual ref;
4. add an explicit bounded Owner architecture-acceptance write-side fact; compare evidence cannot synthesize it;
5. make Policy require architecture acceptance after Full Test passed and before `authorize-delivery-finalize` when `architecture.impact=true`;
6. add a bounded Owner post-pass architecture-remediation `create-change` admission: exact-bind the current non-accepted Actual/Compare cycle, atomically invalidate the old passed Full Test/current architecture cycle, append a required planned Change, and return raw Full Test to `not-ready`; after its checkpoint only fresh `awaiting-user-decision -> authorize-full-test -> Full Test passed` may create the next Actual cycle; no B1 Finding reuse, no auto-corrective behavior, no generic Finding DB;
7. persist a compact accepted-Actual/SystemArchitecture source ref in the completed prior Delivery formal architecture projection; prove/read it by exact path + content fingerprint + repository revision + Owner acceptance ref, and let a different next Delivery form its own Current from that source plus its own exact Start Git baseline, without a global architecture singleton;
8. keep promotion/ref semantics independent from F1 Delivery Final Git mutation; next Delivery still binds its Current to its own exact Git baseline;
9. close E1 test ownership and physical Verification selection in Proposal;
10. later in 03 dogfood, after H1 checkpoint + Owner Full Test pass, independently author the real 03 Actual, compare it, obtain Owner architecture acceptance, then proceed to F1 Finalize behavior.

## 8. Open Decisions

No new Owner scope decision is required before Proposal if the v6 intent is read as “E1 implements the capability now and 03 dogfoods it later”. Proposal must freeze the exact minimal persisted field names and the exact Owner acceptance decision/CLI spelling.

Reviewer should specifically challenge:

- whether distinct architecture acceptance before Finalize is preserved;
- whether Actual creation is correctly delayed rather than silently moved into E1 Apply;
- whether accepted Actual/SystemArchitectureRef avoids duplicate truth;
- whether the bounded post-pass architecture-remediation admission atomically invalidates stale Full Test and architecture-cycle qualification before ordinary Change lifecycle resumes;
- whether E1 Verification selection reaches every new architecture/execution/persistence test target.
