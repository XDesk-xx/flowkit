## Context

D1 runs on exact Base `9d27efef586bcb3204647c78785c9c30a64be4a2` after C1 Change Checkpoint. 053 Proposal was approved by 054 and implemented in 055. 056 correctly found that renderer-valid reference JSON had compressed away complete lifecycle information. 057 attempted a revise-apply but its formal Verification failed; the Owner subsequently issued Contract Reset `owner:517890aabaf47af297deb6b86282ea7c5502372c1945bee89725ba70b24bda89`, superseding the failed 057 generation without mutating historical Run/Verification bytes.

The Owner additionally confirmed the preview-model decision: keep both Workflow and Sequence views for Change and Delivery, omit the Full Test Lifecycle example, and keep Current / Planned Architecture unchanged. This is a physical reference-asset contract correction, so D1 reopens at fresh Proposal rather than continuing hidden revise-apply.

Three Git identities remain distinct:

```text
Current system fact     = main @ 74d46f0920c0dfc6f19b5b264cf9de138f4c2bec
03 planning provenance = Delivery Start @ f132db761bd209e6aff72411108b8e3e1c9801f5
D1 implementation Base = 9d27efef586bcb3204647c78785c9c30a64be4a2
```

## Goals / Non-Goals

**Goals:**
- Keep four long-lived, non-authoritative reference visualization JSON sources: Change Workflow + Sequence and Delivery Workflow + Sequence.
- Make Workflow the complete orchestration view and Sequence the complementary participant-interaction/timing view; neither is lifecycle authority.
- Preserve the first formal 03 Current and Planned Delivery Architecture JSON and their exact time boundaries.
- Keep `architecture/reference/**` and `architecture/<delivery-id>/**` as distinct asset classes with one-way authority flow from formal facts to visualization/reference.
- Extend exact managed Archify validate/deliver support minimally to `sequence` without changing C1 identity/precedence or architecture-only repo-root semantics.
- Preserve generic Delivery-scoped path/service and thin Current/Planned Architecture CLI.
- Keep generated HTML default-not-committed while durable JSON remains tracked.
- Keep Verification ownership non-overlapping and prove the expected D1 actualChangeSet reaches every relevant physical check.

**Non-Goals:**
- Persisting the Full Test Lifecycle example in D1.
- Creating `actual.architecture.json`, architecture acceptance or accepted Actual/SystemArchitectureRef promotion.
- Introducing global `system.architecture.json`, architecture DB/Registry, reference-as-Policy, lifecycle Actions or HTML freshness state.
- Adding Dataflow reference assets or maintaining additional durable state-machine duplicates.
- Planned-vs-Actual drift interpretation or Finalize behavior.

## Decisions

### 1. D1 keeps two JSON asset classes and four durable reference views

Final D1 target:

```text
architecture/
├─ .gitignore
├─ reference/
│  └─ json/
│     ├─ change-lifecycle.sequence.json
│     ├─ change-lifecycle.workflow.json
│     ├─ delivery-lifecycle.sequence.json
│     └─ delivery-lifecycle.workflow.json
└─ 20260817-01-delivery-execution-loop/
   └─ json/
      ├─ current.architecture.json
      └─ planned.architecture.json
```

The failed 057 candidate path `architecture/reference/json/delivery-lifecycle.lifecycle.json` is explicitly superseded and MUST be absent from the final Apply candidate. `full-test-lifecycle.lifecycle.json` is not a D1 durable asset.

`architecture/reference/json/**` remains Git-tracked durable **visualization source**. Authority direction is strictly:

```text
Owner decisions
+ Flowkit Policy
+ OpenSpec
+ canonical code/tests/Git facts
↓
architecture/reference visualization projection
```

Never the reverse. If a reference conflicts with formal facts, it is stale and must be updated; `formal facts win`.

### 2. Workflow and Sequence are complementary, not competing authorities

Change:

```text
change-lifecycle.workflow.json
→ diagram_type = workflow
→ complete orchestration / branches / loops / stop boundaries

change-lifecycle.sequence.json
→ diagram_type = sequence
→ participant interactions / authorizations / review-result returns / external authority handoffs
```

Delivery:

```text
delivery-lifecycle.workflow.json
→ diagram_type = workflow
→ complete Delivery orchestration / required Change loop / Full Test split / corrective loop / architecture+finalize path

delivery-lifecycle.sequence.json
→ diagram_type = sequence
→ Owner / Policy / Change execution / Verification / Archify / architecture assets / Git interaction order
```

Both views MUST derive from the same canonical formal facts. Sequence is not a second lifecycle truth and MUST NOT decide next Action merely because its messages imply an order.

No D1 durable `lifecycle` reference is required. Lifecycle remains appropriate for a separately scoped bounded state machine only.

Recommended human review order is presentation only:

```text
1. Change Workflow
2. Change Sequence
3. Delivery Workflow
4. Delivery Sequence
5. Current System Architecture
6. 03 Planned Architecture
```

### 3. Complete Change Workflow content is structural, not card-only

The Change Workflow MUST visibly represent:

```text
explore
→ review-explore
├─ approved → propose
├─ author blocker → revise-explore → re-review
└─ owner / verification / external blocker → STOP

propose
→ review-propose
├─ approved → Owner authorize apply
├─ author blocker → revise-propose → re-review
└─ non-author blocker → STOP

apply
→ Change Verification
→ review-apply
├─ approved → Owner authorize archive
├─ author blocker → revise-apply → re-verification → re-review
└─ non-author blocker → STOP

→ OpenSpec archive
→ Change completed
→ Owner authorize checkpoint
→ Git Change Checkpoint
```

It MUST make `changes-requested ≠ revise-required` visible. The Sequence view MUST expose the corresponding participant handoffs without replacing the Workflow graph.

### 4. Complete Delivery Workflow content is structural, not a monolithic Lifecycle state machine

The Delivery Workflow MUST visibly represent:

```text
Delivery Start
→ resolve/freeze Current
→ form Planned when architectureImpact=true
→ activate required Change
→ ordinary Change lifecycle
→ Change Checkpoint
→ repeat until required Changes completed
→ Delivery Ready
→ Owner authorize Full Test
→ Full Test

failed
→ Delivery Finding
→ Owner decision
→ optional corrective Change
→ ordinary Change lifecycle
→ corrective Checkpoint
→ fresh Delivery Ready
→ fresh Owner Full Test authorization

passed
→ Actual Architecture
→ Planned vs Actual Compare
→ architecture acceptance
→ Owner authorize finalize
→ Delivery Final
→ Merge Commit
→ Accepted Actual becomes next Delivery Current source
```

Full Test and Finalize remain Delivery behaviors, not Change Actions or Runs. The Delivery Sequence view complements this graph with authority interaction ordering.

### 5. Current and Planned Architecture remain unchanged in semantic boundary

Current remains authored from exact pre-03 `main @ 74d46f0920c0dfc6f19b5b264cf9de138f4c2bec` and validated/delivered against that exact repository root. Planned remains reconciled from original Delivery Start `f132db761bd209e6aff72411108b8e3e1c9801f5`. No preview/reset/reviewer Base replaces either provenance.

### 6. JSON tracked; all Architecture HTML remains disposable

`architecture/.gitignore` remains:

```gitignore
*/html/
```

It covers product reference and Delivery generated HTML while leaving all JSON source trackable. HTML is local derived output, safe to delete/regenerate, non-authoritative and has no freshness ledger.

### 7. Exact Archify adapter adds Sequence as a bounded renderable type

`ArchifyCliAdapter` keeps exact managed identity. `ArchifyRenderableType` becomes:

```text
architecture | workflow | sequence | lifecycle
```

`validate` / `deliver` may use `sequence`. `--repo-root` remains valid only for `architecture`; supplying repository evidence for workflow/sequence/lifecycle MUST fail closed. The adapter MUST NOT inspect JSON to infer type/evidence needs.

This is a backward-compatible render-type extension required by D1 durable reference assets; it does not add ambient resolution, Registry or second Archify engine.

### 8. Architecture service owns Delivery path/tool mapping only

`src/architecture/**` continues to provide Delivery-scoped Current/Planned JSON+HTML resolution and thin render/compare orchestration. Public D1 CLI remains:

```text
flowkit architecture render current
flowkit architecture render planned
flowkit architecture compare <base-kind> <head-kind>
```

Reference Workflow/Sequence JSON remains reproducible through exact managed Archify validate/deliver and does not create new Flowkit lifecycle commands.

### 9. Verification ownership remains non-overlapping

Prospective map remains:

```text
architecture/** + src/architecture/** + D1 dedicated tests → architecture module
src/cli/**                                      → cli-diagnostics
src/integrations/archify/**                     → external-tools
src/verification/change-selection/**            → verification-selection
```

`cli-diagnostics.capabilityIds` retains `flowkit-architecture-assets`; `architecture` owns `tests-architecture`; external-tools owns the adapter Sequence extension tests. Reference Workflow+Sequence and Current/Planned rendering are exercised by the D1 physical integration path.

### 10. Read-only next-consumer selection proof remains mandatory

The expected D1 actualChangeSet now includes all four final reference JSON paths plus the superseded `delivery-lifecycle.lifecycle.json` cleanup path, Current/Planned, Architecture service, CLI, Archify adapter, Verification mapping and D1 tests.

Expected selected chain remains:

```text
seedModuleIds:
  architecture
  cli-diagnostics
  external-tools
  verification-selection

moduleIds:
  architecture
  cli-diagnostics
  external-tools
  openspec-runtime
  verification-selection

capabilityRelation:
  matched

verificationScopes:
  openspec-current-change-archive-sync
  openspec-current-change-strict
  tests-architecture
  tests-cli
  tests-external-tools
  tests-openspec-runtime
  tests-verification
  typecheck
```

### 11. Proposal feasibility uses all accepted visualization shapes

Before Apply authorization, exact managed `archify@2.14.0` MUST physically validate + deliver disposable candidates for:

```text
Change Workflow      → workflow
Change Sequence      → sequence
Delivery Workflow    → workflow
Delivery Sequence    → sequence
Current              → architecture + exact pre-03 --repo-root
Planned              → architecture + repository-evidence --repo-root
```

No Full Test Lifecycle durable asset is generated. Renderer PASS alone is insufficient: structural Proposal/Apply tests must assert the required nodes/edges/participants/messages/loops.

### 12. Proposal-to-Apply machine closure is mandatory

Fresh Proposal closure MUST include:
- production `deriveMutationDeclaration(apply)` / validator PASS;
- production `deriveMutationDeclaration(revise-apply)` / validator PASS;
- read-only `buildVerificationSelection(expected D1 actualChangeSet, D1 capability refs)` matched PASS;
- OpenSpec current strict and `--all --strict` PASS;
- staging-aware `git diff --cached --check` PASS;
- exact managed Archify Workflow/Sequence/Architecture validate+deliver feasibility PASS.

## Risks / Trade-offs

- [Four reference views drift] → They share the same one-way formal-facts authority rule and structural regression suite; conflicts mark the view stale, never formal facts wrong.
- [Sequence becomes lifecycle authority] → Explicitly classify it as interaction projection only; no Policy reader consumes reference JSON.
- [Adapter scope expands beyond D1] → Add only native `sequence` validate/deliver; preserve exact managed identity and architecture-only repo-root.
- [Current/Planned temporal contamination] → Preserve exact `74d46f0` / `f132db7` boundaries.
- [Generated HTML enters checkpoint] → keep scoped `architecture/.gitignore` and verify no `architecture/**/html/**` in candidate Git boundary.

## Migration Plan

1. Fresh Apply removes superseded `delivery-lifecycle.lifecycle.json` and authors four final reference JSON views; keep Current/Planned, no Actual.
2. Extend exact Archify adapter minimally for `sequence` validate/deliver and update external-tool regressions.
3. Strengthen D1 structural tests across Workflow and Sequence views while preserving Current/Planned/provenance tests.
4. Keep thin Current/Planned render/compare CLI and existing Verification ownership/capability relation.
5. Physically validate/render all six D1 visualization sources with exact managed Archify; run counterfactual structural/physical closure.
6. Complete new formal Change Verification and Review-Apply. Historical 057 remains immutable failed authority.

## flowkitMutationScope

```json
{
  "schemaVersion": 1,
  "actions": {
    "apply": {
      "selectors": [
        { "kind": "exact", "path": "architecture/.gitignore" },
        { "kind": "exact", "path": "architecture/20260817-01-delivery-execution-loop/json/current.architecture.json" },
        { "kind": "exact", "path": "architecture/20260817-01-delivery-execution-loop/json/planned.architecture.json" },
        { "kind": "exact", "path": "architecture/reference/json/change-lifecycle.sequence.json" },
        { "kind": "exact", "path": "architecture/reference/json/change-lifecycle.workflow.json" },
        { "kind": "exact", "path": "architecture/reference/json/delivery-lifecycle.lifecycle.json" },
        { "kind": "exact", "path": "architecture/reference/json/delivery-lifecycle.sequence.json" },
        { "kind": "exact", "path": "architecture/reference/json/delivery-lifecycle.workflow.json" },
        { "kind": "exact", "path": "openspec/changes/architecture-baseline-and-delivery-plan/tasks.md" },
        { "kind": "exact", "path": "openspec/changes/architecture-baseline-and-delivery-plan/verification.md" },
        { "kind": "prefix", "path": "src/architecture" },
        { "kind": "exact", "path": "src/cli/architecture.ts" },
        { "kind": "exact", "path": "src/cli/main.ts" },
        { "kind": "exact", "path": "src/integrations/archify/archify-cli-adapter.ts" },
        { "kind": "exact", "path": "src/verification/change-selection/evidence.ts" },
        { "kind": "exact", "path": "src/verification/change-selection/module-map.ts" },
        { "kind": "prefix", "path": "tests/fixtures/d1-architecture-baseline-and-delivery-plan" },
        { "kind": "exact", "path": "tests/integration/d1-architecture-baseline-and-delivery-plan.test.ts" },
        { "kind": "prefix", "path": "tests/unit/architecture" },
        { "kind": "exact", "path": "tests/unit/cli/architecture.test.ts" },
        { "kind": "exact", "path": "tests/unit/external-tools/archify-cli-adapter.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/evidence.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/module-map.test.ts" }
      ]
    },
    "revise-apply": {
      "selectors": [
        { "kind": "exact", "path": "architecture/.gitignore" },
        { "kind": "exact", "path": "architecture/20260817-01-delivery-execution-loop/json/current.architecture.json" },
        { "kind": "exact", "path": "architecture/20260817-01-delivery-execution-loop/json/planned.architecture.json" },
        { "kind": "exact", "path": "architecture/reference/json/change-lifecycle.sequence.json" },
        { "kind": "exact", "path": "architecture/reference/json/change-lifecycle.workflow.json" },
        { "kind": "exact", "path": "architecture/reference/json/delivery-lifecycle.lifecycle.json" },
        { "kind": "exact", "path": "architecture/reference/json/delivery-lifecycle.sequence.json" },
        { "kind": "exact", "path": "architecture/reference/json/delivery-lifecycle.workflow.json" },
        { "kind": "exact", "path": "openspec/changes/architecture-baseline-and-delivery-plan/tasks.md" },
        { "kind": "exact", "path": "openspec/changes/architecture-baseline-and-delivery-plan/verification.md" },
        { "kind": "prefix", "path": "src/architecture" },
        { "kind": "exact", "path": "src/cli/architecture.ts" },
        { "kind": "exact", "path": "src/cli/main.ts" },
        { "kind": "exact", "path": "src/integrations/archify/archify-cli-adapter.ts" },
        { "kind": "exact", "path": "src/verification/change-selection/evidence.ts" },
        { "kind": "exact", "path": "src/verification/change-selection/module-map.ts" },
        { "kind": "prefix", "path": "tests/fixtures/d1-architecture-baseline-and-delivery-plan" },
        { "kind": "exact", "path": "tests/integration/d1-architecture-baseline-and-delivery-plan.test.ts" },
        { "kind": "prefix", "path": "tests/unit/architecture" },
        { "kind": "exact", "path": "tests/unit/cli/architecture.test.ts" },
        { "kind": "exact", "path": "tests/unit/external-tools/archify-cli-adapter.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/evidence.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/module-map.test.ts" }
      ]
    }
  }
}
```
