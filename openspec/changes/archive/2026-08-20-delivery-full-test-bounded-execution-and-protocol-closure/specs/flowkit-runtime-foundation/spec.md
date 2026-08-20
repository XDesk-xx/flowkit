## ADDED Requirements

### Requirement: shared external-command 必须提供无业务语义的 ordered bounded physical execution primitive

`src/shared/external-command.ts` MAY expose an ordered bounded helper built on the existing `runCommand()` transport. The helper MUST execute caller-resolved physical targets in deterministic order, apply each target's own positive timeout/process-tree ownership, preserve the existing typed transport outcomes `exited | spawn-failed | timed-out-cancelled | outcome-unknown`, and return bounded per-target diagnostics.

The helper MUST NOT interpret exit code as Verification passed/failed, MUST NOT resolve Full Test logical checks, MUST NOT persist lifecycle facts, and MUST NOT create a scheduler/parallelism/timing authority. A caller MAY stop after the first target whose raw outcome requires fail-fast, but the transport layer MUST preserve the raw typed outcome for the domain owner to interpret.

#### Scenario: independent target timeout ownership
- **WHEN** one logical caller submits ordered physical targets A and B with the same 120000ms target timeout
- **THEN** A and B MUST each receive an independent transport timeout budget when spawned
- **AND** the helper MUST NOT apply a single 120000ms wall budget to A+B as a union

#### Scenario: transport ambiguity remains typed
- **WHEN** target cancellation cannot prove the owned process tree terminal
- **THEN** helper MUST return `outcome-unknown` for that target
- **AND** MUST NOT map it to domain `failed` or continue as if the target were safely terminal
