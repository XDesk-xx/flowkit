## ADDED Requirements

### Requirement: Full Test operator surfaces MUST identify the failing bounded physical target

Technical `verify:full` and Owner-authorized `flowkit delivery full-test` MUST consume the existing bounded Full Test execution result without constructing a second executable plan. When bounded execution terminates unsuccessfully, the human/operator-facing output MUST identify the failing logical check、physical target and typed outcome, and MUST preserve applicable spawn/process-tree root diagnostic already present in the bounded executor result.

For authoritative `flowkit delivery full-test`, this richer operator summary MUST NOT change the persisted `FullTestProtocolPayload`、logical `checks[]`、resultRef hash domain or existing `outcome-unknown` executionBlock contract. A normal terminal `failed` Full Test MAY publish the existing logical failure authority while showing current physical detail to the operator; transport/protocol execution-error MUST continue to follow existing fail-closed publication rules.

#### Scenario: technical verify:full failure is directly locatable

- **WHEN** a bounded physical target fails during technical `verify:full`
- **THEN** technical output MUST include the failing logical check id、physical target id and typed outcome
- **AND** applicable spawn/process-tree diagnostic MUST NOT be silently dropped by an intermediate projection

#### Scenario: authoritative terminal failed summary includes physical target without changing persisted protocol

- **WHEN** Owner-authorized bounded Delivery Full Test forms a legal terminal `failed` logical result
- **THEN** the operator-facing result MUST identify the physical target that caused the terminal logical failure
- **AND** the persisted terminal result MUST remain the existing logical-only protocol with no new physical diagnostic fields

#### Scenario: bounded transport error remains non-terminal authority

- **WHEN** a bounded physical target returns spawn-failed、timed-out-cancelled、outcome-unknown or another execution-error path
- **THEN** operator output MUST identify the failing target and available root diagnostic
- **AND** the command MUST continue to obey the existing no-fabricated-terminal-result / outcome-unknown safety rules
