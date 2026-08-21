## ADDED Requirements

### Requirement: Archify integration 必须保持 external authority 与 C1/D1/E1 responsibility boundary

Archify MUST remain an external professional authority for typed architecture validation/render/compare behavior. Flowkit C1 MAY pin exact Archify runtime identity, invoke the CLI and consume bounded structured results, but MUST NOT import Archify internal modules, reimplement its renderer/schema, or let Archify decide Flowkit Policy/Reviewer/Owner lifecycle outcomes.

C1 MUST stop at runtime/operation feasibility. D1 remains the first Change authorized to author formal Current/System and Planned Architecture assets; E1 remains responsible for formal Actual Architecture, Planned-vs-Actual compare lifecycle interpretation and promotion/acceptance.

#### Scenario: C1 renderer proof does not become formal Current/Planned/Actual
- **WHEN** C1 physically validates/delivers/compares synthetic Architecture JSON
- **THEN** those artifacts MUST be test/review evidence only
- **AND** MUST NOT create accepted Current/Planned/Actual Architecture refs or mutate Delivery architecture lifecycle state

#### Scenario: Archify compare result does not decide lifecycle next
- **WHEN** Archify returns a structured architecture compare result
- **THEN** Flowkit MAY preserve/consume that result only where a later Delivery contract requires it
- **BUT** Archify MUST NOT produce Reviewer verdict, Owner acceptance, Policy next boundary or automatic Finalize authority

### Requirement: synthetic review ZIP 必须只作为普通 transport proof

C1 MUST physically prove that generated JSON + HTML + receipt files can be packaged into an ordinary integrity-checkable ZIP for later D1 human/Reviewer inspection. This proof MUST NOT introduce an Archify ZIP command/lifecycle, repository artifact registry, receipt database or durable Architecture truth.

#### Scenario: D1-shaped review ZIP can be physically produced
- **WHEN** C1 has generated synthetic architecture/workflow/lifecycle JSON, HTML and receipt outputs
- **THEN** a disposable ZIP containing those review artifacts MUST be physically creatable and integrity-testable
- **AND** its contents MUST explicitly remain non-authoritative synthetic evidence
- **AND** D1 MUST still author the real formal Architecture JSON from its own authorized repository facts
