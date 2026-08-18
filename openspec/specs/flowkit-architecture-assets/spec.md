# flowkit-architecture-assets Specification

## Purpose
定义 Flowkit 两类 Architecture JSON source 的正式边界：长期但非权威的 `architecture/reference/json/**` visualization source，以及 Delivery-scoped `architecture/<delivery-id>/json/**` Current/Planned/Actual asset family；D1 reference 同时保留 Workflow 完整编排视角与 Sequence 交互时序视角，但它们都只能由 canonical formal facts 单向派生。
## Requirements
### Requirement: Architecture reference visualization source 必须 durable 但非 lifecycle authority
Flowkit MUST keep long-lived human/AI-readable reference visualization source under `architecture/reference/json/**`. D1 MUST create exactly four final reference sources:

```text
change-lifecycle.workflow.json
change-lifecycle.sequence.json
delivery-lifecycle.workflow.json
delivery-lifecycle.sequence.json
```

Authority direction MUST remain `Owner decisions + Flowkit Policy + OpenSpec + canonical code/tests/Git facts → architecture/reference visualization projection`. Reference JSON MUST NOT decide Policy, lifecycle state, Change contract, next Action, Owner authorization or development decision. If reference and canonical formal facts conflict, the reference MUST be treated as stale and updated; `formal facts win`.

#### Scenario: reference is stale rather than authoritative
- **WHEN** any Workflow or Sequence reference disagrees with current canonical Policy/OpenSpec/code/tests/Git facts
- **THEN** Flowkit MUST treat that reference as stale visualization source
- **AND** MUST NOT change formal facts merely to match the reference

#### Scenario: no duplicate lifecycle authority
- **WHEN** D1 keeps both Workflow and Sequence views
- **THEN** the two views MUST remain complementary projections of the same formal facts
- **AND** neither view MUST become a lifecycle/next-Action authority
- **AND** D1 MUST NOT introduce repository-global `system.architecture.json`

### Requirement: complete Change reference 必须同时提供 Workflow 与 Sequence 互补视角
`change-lifecycle.workflow.json` MUST be valid Archify `workflow` and MUST structurally expose explore/review/revise boundaries, author-only revise loops, non-author STOP boundaries, Owner apply/archive/checkpoint gates, Change Verification, OpenSpec archive, completed and separate Git checkpoint. It MUST make `changes-requested ≠ revise-required` visible without relying only on cards.

`change-lifecycle.sequence.json` MUST be valid Archify `sequence` and MUST expose the complementary participant interaction order among Owner, Policy, Author, Reviewer, Verification, OpenSpec and Git. Sequence MUST NOT replace the Workflow orchestration graph.

#### Scenario: Change views physically render and preserve complete lifecycle semantics
- **WHEN** exact managed Archify 2.14.0 validates and delivers both Change reference files
- **THEN** workflow and sequence renderers MUST both pass
- **AND** structural regressions MUST assert required Change actions/loops/stop boundaries and sequence participant handoffs
- **AND** generated HTML MUST remain derived/non-authoritative

### Requirement: complete Delivery reference 必须同时提供 Workflow 与 Sequence 互补视角
`delivery-lifecycle.workflow.json` MUST be valid Archify `workflow` and MUST structurally expose Delivery Start, Current/Planned, required Change + Checkpoint loop, Delivery Ready, Owner Full Test authorization, passed/failed split, failed Finding/Owner corrective decision/corrective Change/checkpoint/fresh Ready/fresh authorization loop, passed Actual/Compare/architecture acceptance/Owner finalize/Delivery Final/Merge/next Current path.

`delivery-lifecycle.sequence.json` MUST be valid Archify `sequence` and MUST expose the complementary interaction order among Owner, Policy, Change execution roles, Verification, Archify, architecture assets and Git. Full Test and Finalize MUST remain Delivery behaviors, not Change Actions/Runs.

#### Scenario: Delivery views physically render and preserve corrective/final paths
- **WHEN** exact managed Archify 2.14.0 validates and delivers both Delivery reference files
- **THEN** workflow and sequence renderers MUST both pass
- **AND** structural regressions MUST assert passed/failed branch, corrective loop, fresh authorization and finalization path

### Requirement: D1 不保存完整 Delivery 的 Lifecycle reference 示例
D1 MUST NOT create `delivery-lifecycle.lifecycle.json` or `full-test-lifecycle.lifecycle.json` as final durable source. Archify `lifecycle` remains a valid type for separately scoped bounded state machines, but the complete Delivery D1 reference SHALL use Workflow + Sequence.

#### Scenario: lifecycle example is absent from final D1 source
- **WHEN** D1 Apply completes
- **THEN** no D1 durable Full Test Lifecycle example MUST exist
- **AND** the superseded `delivery-lifecycle.lifecycle.json` candidate path MUST be absent

### Requirement: human review order 必须只作为 presentation contract
The recommended human review presentation order MUST be Change Workflow, Change Sequence, Delivery Workflow, Delivery Sequence, Current System Architecture, then 03 Planned Architecture. This order MUST NOT create lifecycle state, Policy next boundary or formal Action order.

#### Scenario: presentation order does not become lifecycle order
- **WHEN** a human or AI reviews the six D1 visualizations in the recommended order
- **THEN** the ordering MUST affect presentation only
- **AND** Flowkit Policy MUST continue to derive lifecycle/next Action exclusively from formal facts

### Requirement: Delivery Architecture durable source 必须以 Delivery-scoped JSON 保存
Flowkit MUST place formal Delivery Architecture source at `architecture/<delivery-id>/json/**`. D1 MUST create Current and Planned for the current 03 Delivery and MUST NOT create Actual.

#### Scenario: D1 creates Current and Planned but not Actual
- **WHEN** D1 Apply completes Architecture asset authoring
- **THEN** `architecture/20260817-01-delivery-execution-loop/json/current.architecture.json` MUST exist
- **AND** `architecture/20260817-01-delivery-execution-loop/json/planned.architecture.json` MUST exist
- **AND** `architecture/20260817-01-delivery-execution-loop/json/actual.architecture.json` MUST NOT be created by D1

### Requirement: 03 Bootstrap Current 与 Planned 必须绑定各自真实时间边界
For Delivery `20260817-01-delivery-execution-loop`, Current MUST be authored from exact pre-03 `main @ 74d46f0920c0dfc6f19b5b264cf9de138f4c2bec` plus accepted 02 facts/specs. Planned MUST be authored from original 03 Delivery Start facts at `f132db761bd209e6aff72411108b8e3e1c9801f5`. D1 implementation/reset/preview Bases MUST NOT replace either provenance boundary.

#### Scenario: current is not contaminated by 03 implementation
- **WHEN** D1 authors/reuses formal Current after 03 branch mutations
- **THEN** Current repository provenance MUST remain `74d46f0920c0dfc6f19b5b264cf9de138f4c2bec`
- **AND** D1 MUST validate/render it against the exact pre-03 repository root

#### Scenario: planned retains original Delivery Start provenance
- **WHEN** D1 reconciles 03 Planned during Bootstrap
- **THEN** Planned planning provenance MUST bind `f132db761bd209e6aff72411108b8e3e1c9801f5`
- **AND** intermediate/reviewer/reset Bases MUST NOT be represented as original planning authority

### Requirement: Architecture authoring authority 必须与 Git Delivery facts Archify 和 Flowkit lifecycle 分权
Git/repository facts MUST remain authority for code bytes and revision-pinned evidence. Delivery Manifest/OpenSpec MUST remain authority for planned intent. AI/human Author MAY author typed JSON from those facts. Exact managed Archify validates/renders/compares supplied JSON but MUST NOT author Flowkit lifecycle truth or decide acceptance. Flowkit only resolves bounded paths/invocations/results.

#### Scenario: old review and preview packages inform but do not become authority
- **WHEN** D1 uses `archify-flowkit-review-v3-cn-104c14cc.zip` or the Owner-approved preview as authoring input
- **THEN** information density/composition MAY be reused
- **BUT** formal Workflow/Sequence/Current/Planned JSON MUST remain derived from current canonical formal facts and frozen provenance

### Requirement: generated Architecture HTML 必须保持 disposable 且默认不进入 Git
Flowkit MUST treat `architecture/**/html/**` as generated derived views. D1 MUST make them default-not-committed while leaving `architecture/**/json/**` trackable. HTML MAY be deleted/rebuilt and MUST NOT become freshness authority.

#### Scenario: generated HTML is safely disposable
- **WHEN** generated reference or Delivery HTML is deleted or absent
- **THEN** the corresponding durable JSON MUST remain valid source
- **AND** missing/stale HTML alone MUST NOT block Change or Delivery lifecycle

### Requirement: architecture path 与 provenance resolution 必须按 Delivery facts 泛化
Delivery Architecture path resolution MUST derive from active Delivery identity and MUST NOT hardcode 03 id/revisions into generic runtime behavior. A future Delivery MUST be able to derive its own Current/Planned paths/provenance. Reference JSON stays at stable product-level `architecture/reference/json/**` and remains non-authoritative projection.

#### Scenario: future Delivery derives its own paths and provenance
- **WHEN** a future Delivery has a different deliveryId and Start facts
- **THEN** Current/Planned paths MUST resolve under `architecture/<that-delivery-id>/json/**`
- **AND** generic runtime MUST NOT inject the 03 delivery id, `74d46f0...` or `f132db7...`

### Requirement: Flowkit Architecture CLI 必须保持 thin exact-Archify binding
`flowkit architecture render current|planned` MUST resolve active Delivery-scoped JSON/HTML paths and invoke exact managed Archify validation/delivery with repository evidence enabled. Mechanical compare MAY generate derived output but MUST NOT interpret drift as lifecycle acceptance. Reference Workflow/Sequence rendering does not create a new Flowkit lifecycle Action.

#### Scenario: render current delegates without creating authority
- **WHEN** `flowkit architecture render current` is invoked for a valid Current JSON
- **THEN** Flowkit MUST delegate validation/delivery to exact managed Archify with explicit repository root
- **AND** success MUST NOT create architecture acceptance, Owner decision, Reviewer verdict or Policy next state
