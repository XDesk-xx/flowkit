## MODIFIED Requirements

### Requirement: Delivery Architecture durable source 必须以 Delivery-scoped JSON 保存
Flowkit MUST place formal Delivery Architecture source at `architecture/<delivery-id>/json/**`. D1 MUST create Current and Planned for the current 03 Delivery and MUST NOT create Actual.

E1 MUST extend the same Delivery-scoped asset family with independently-authored Actual only at the post-required-Changes, post-Full-Test final candidate boundary. E1 capability implementation itself MUST NOT create the current 03 formal Actual while later required Changes remain.

#### Scenario: D1 creates Current and Planned but not Actual
- **WHEN** D1 Apply completes Architecture asset authoring
- **THEN** `architecture/20260817-01-delivery-execution-loop/json/current.architecture.json` MUST exist
- **AND** `architecture/20260817-01-delivery-execution-loop/json/planned.architecture.json` MUST exist
- **AND** `architecture/20260817-01-delivery-execution-loop/json/actual.architecture.json` MUST NOT be created by D1

#### Scenario: E1 capability completion does not instantiate 03 Actual early
- **WHEN** E1 Apply completes while later required 03 Changes are still planned or Delivery Full Test has not passed
- **THEN** `architecture/20260817-01-delivery-execution-loop/json/actual.architecture.json` MUST remain absent as formal 03 Actual
- **AND** E1 MUST provide reusable post-Full-Test Actual/Compare behavior for later dogfood

#### Scenario: formal Actual is independently authored from final repository
- **WHEN** all required Changes are completed/checkpointed and current Delivery Full Test has passed
- **THEN** human/AI architecture authoring MAY create Delivery-owned `actual.architecture.json` from final repository facts
- **AND** Flowkit MUST NOT satisfy this by copying Planned and treating it as final fact

### Requirement: Flowkit Architecture CLI 必须保持 thin exact-Archify binding
`flowkit architecture render current|planned` MUST resolve active Delivery-scoped JSON/HTML paths and invoke exact managed Archify validation/delivery with repository evidence enabled. Mechanical compare MAY generate derived output but MUST NOT interpret drift as lifecycle acceptance. Reference Workflow/Sequence rendering does not create a new Flowkit lifecycle Action.

E1 MUST extend render to `actual`. At the explicit post-Full-Test architecture behavior boundary, `flowkit architecture compare planned actual` MUST still delegate exact managed Archify compare and MAY publish only compact Actual/Compare refs bound to the exact current passed Full Test qualification occurrence (`fullTestAuthorizationRef` + `fullTestResultRef`); it MUST NOT interpret drift as acceptance.

#### Scenario: render current delegates without creating authority
- **WHEN** `flowkit architecture render current` is invoked for a valid Current JSON
- **THEN** Flowkit MUST delegate validation/delivery to exact managed Archify with explicit repository root
- **AND** success MUST NOT create architecture acceptance, Owner decision, Reviewer verdict or Policy next state

#### Scenario: render actual delegates to exact managed Archify
- **WHEN** a valid post-Full-Test Actual JSON exists
- **THEN** `flowkit architecture render actual` MUST validate/deliver it through exact managed Archify with explicit repository root
- **AND** generated HTML MUST remain derived/non-authoritative

#### Scenario: planned-vs-actual compare publishes evidence not approval
- **WHEN** Policy requests post-Full-Test architecture actual/compare behavior and `flowkit architecture compare planned actual` succeeds
- **THEN** Flowkit MUST derive and bind the delivery-scoped Owner `authorize-full-test` ref that qualifies the current passed result, the current technical Full Test resultRef, exact Actual content/revision and deterministic compare evidence in a current architecture cycle
- **AND** cycleRef MUST include the Full Test authorization occurrence so a fresh authorization cannot recreate an old cycle even when result/Actual/compare bytes are identical
- **AND** current cycle acceptance MUST remain `awaiting-owner-decision`
- **AND** compare success MUST NOT synthesize Owner acceptance

## ADDED Requirements

### Requirement: Accepted Actual 必须形成 compact cross-Delivery source 而非 global singleton
After explicit Owner architecture acceptance, Flowkit MUST persist a compact accepted system source bound to the source Delivery, exact Actual logical path/content fingerprint/repository revision, compareRef and Owner acceptance ref. The source MUST be independently readable in a fresh process and MUST NOT copy Actual into repository-global `system.architecture.json`.

#### Scenario: different future Delivery consumes accepted source
- **WHEN** a different future Delivery explicitly consumes a prior accepted system source
- **THEN** the consumer MUST verify the prior Actual content fingerprint and Owner acceptance binding
- **AND** the future Delivery MUST author its own `architecture/<future-delivery-id>/json/current.architecture.json`
- **AND** its repository evidence MUST bind the future Delivery's own exact Start Git revision
- **AND** generic behavior MUST NOT hardcode 03 delivery/revision constants
