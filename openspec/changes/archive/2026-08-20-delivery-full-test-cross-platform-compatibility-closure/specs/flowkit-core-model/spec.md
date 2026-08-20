## ADDED Requirements

### Requirement: Bounded Full Test physical failure diagnostics MUST remain visible execution detail without becoming durable authority

When `kind=bounded-command-plan` executes physical targets, the current execution result MUST preserve enough bounded terminal context to identify the failing logical check、physical target、typed process outcome、duration、bounded stdout/stderr以及 any `spawnError` / process-tree diagnostics already produced by the low-level command transport.

These physical diagnostics are point-in-time execution detail. Verification or Delivery operator surfaces MAY render them for diagnosis, but MUST NOT promote them into persisted logical `checks[]`、a new Full Test result schema/hash domain、a new Run/attempt identity、or a second Verification authority. Existing `outcome-unknown` executionBlock semantics remain the only durable process-safety block added by bounded execution.

#### Scenario: bounded failure retains physical identity

- **WHEN** a bounded logical check terminates because one physical target exits nonzero or returns a transport failure
- **THEN** the current execution result MUST identify the failing `logicalCheckId` and `physicalTargetId`
- **AND** MUST retain applicable typed outcome、spawn/process-tree diagnostic and bounded output context

#### Scenario: rendered physical diagnostics do not alter logical result authority

- **WHEN** a technical or authoritative operator displays the physical failure context
- **THEN** the persisted Full Test result MUST continue to use the existing logical-only protocol and resultRef rules
- **AND** the display MUST NOT create another durable physical-target ledger or Verification result
