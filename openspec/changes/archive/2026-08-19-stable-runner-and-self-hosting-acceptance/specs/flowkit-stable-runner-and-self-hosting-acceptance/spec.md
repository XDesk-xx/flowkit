## Purpose

定义 Flowkit stable Runner 在独立安装、fresh checkout 与 future-Delivery-shaped disposable repository 中组合消费 01+02+03 已有 authority/lifecycle 的自托管验收边界，并保证该组合证明不演化为第二套自动编排器或新的 durable truth。

## ADDED Requirements

### Requirement: stable Runner MUST work from a fresh local distribution consumer

Flowkit MUST prove that the source-controlled stable `dist/bin/flowkit.js` can be packaged as a local distribution and installed into an independent consumer environment, then operate on a fresh repository without relying on the Flowkit source workspace `node_modules`, chat/session memory, or ambient OpenSpec/Archify PATH. Exact Git repository bytes remain the product authority; registry publication or tag creation MUST NOT be required for H1 acceptance.

#### Scenario: fresh consumer starts the stable runner
- **WHEN** a local Flowkit distribution produced from the H1 candidate is installed into an independent consumer
- **AND** the target repository is a fresh checkout without the source workspace `node_modules`
- **THEN** the installed `flowkit` runner MUST execute its version and repository diagnostic surfaces successfully
- **AND** managed OpenSpec/Archify use MUST resolve through the existing exact `FLOWKIT_HOME/tools` contract rather than ambient PATH

### Requirement: H1 MUST prove one future-Delivery-shaped end-to-end self-hosting lifecycle

H1 MUST include one disposable integration fixture that uses a different future-shaped Delivery identity and composes the already-existing Flowkit lifecycle from Delivery Start through Delivery Final. The fixture MUST cover Current/Planned architecture when applicable, at least two ordinary Change/checkpoint boundaries sufficient to prove sequencing, Owner-authorized Delivery Full Test, independently reconstructed Actual Architecture, Planned-vs-Actual compare, Owner architecture/finalize authority, Finalize with no Run, Delivery Final Git boundary, and a fresh checkout/resume after the final boundary.

The acceptance subject MUST be the Flowkit distribution installed into an independent consumer. For every Flowkit-owned lifecycle boundary that already has a stable CLI/runner surface, the fixture MUST execute that boundary through the independent consumer's installed runner against the disposable repository. The fixture MUST NOT import the Flowkit source workspace `src/**`, source `dist/**`, or source `node_modules` as a hidden second runtime for create/activate, Owner recording, Change Action prepare/admit/archive, diagnostics/resume, Architecture render/compare, Delivery Full Test, Finalize, final-handoff, or checkpoint-handoff.

The G1 single-action Adapter MAY be consumed from the independent consumer's installed package built `dist` artifact when no CLI surface exists; such consumption MUST resolve from the installed package root and MUST NOT reference the source workspace. This bounded exception MUST NOT introduce an Agent/Provider Registry, auto-loop, or new lifecycle authority.

The source-side test harness MAY construct fixture/external-role inputs, invoke the installed distribution, assert results, and perform authorized Executor Git mechanics after read-only handoff. It MUST NOT replace a Flowkit-owned lifecycle boundary with direct source-service calls. The fixture MUST consume existing Policy, Owner, Reviewer, Verification, OpenSpec, Archify, Git and G1 single-action Adapter authorities rather than synthesizing replacement authority. Its disposable Actual/Final artifacts MUST NOT be treated as the real 03 Delivery Actual/Final.

#### Scenario: future Delivery completes through the installed distribution and existing authorities
- **WHEN** the H1 disposable repository executes the future Delivery from Start through multiple Changes and their authorized checkpoints using the Flowkit distribution installed in an independent consumer
- **AND** every Flowkit-owned boundary with an existing stable CLI/runner surface is invoked from that installed distribution rather than the source workspace
- **AND** the Delivery reaches Ready, receives explicit Owner Full Test authorization, passes Full Test, forms and compares Actual Architecture, receives explicit Owner finalize authority, and forms Delivery Final
- **THEN** every boundary MUST be admitted by the existing Flowkit Policy/formal-fact model
- **AND** Full Test and Finalize MUST create no Standard Run
- **AND** source workspace `src/**`, source `dist/**`, and source `node_modules` MUST NOT provide hidden lifecycle execution
- **AND** the fixture MUST finish with a fresh checkout that resumes through the same installed distribution deterministically without chat/session/source-workspace state

#### Scenario: source-workspace lifecycle bypass is rejected
- **WHEN** the H1 harness could complete a Flowkit-owned lifecycle boundary only by importing the source workspace implementation instead of consuming the independent installed distribution
- **THEN** the H1 self-hosting acceptance MUST NOT treat that execution as evidence for the stable Runner boundary
- **AND** the fixture MUST fail closed or be changed to consume the existing installed CLI/runner surface

#### Scenario: single-action Agent Adapter remains single-action inside self-hosting
- **WHEN** the disposable self-hosting fixture uses the G1 Agent Adapter for a Change Action
- **THEN** the adapter MUST be loaded from the independent consumer's installed Flowkit built artifact rather than source workspace `src/**`
- **AND** one adapter invocation MUST execute at most one already-decided Change Action
- **AND** MUST return control after admission without auto-preparing the next Run, switching role, or synthesizing Owner/Reviewer authority

### Requirement: real 03 Actual MUST remain delayed until H1 is completed and checkpointed

H1 Apply/Verification MUST NOT generate or accept the real `architecture/20260817-01-delivery-execution-loop/json/actual.architecture.json`. The real 03 Actual lifecycle remains: H1 completed + H1 Change Checkpoint → Delivery Ready → explicit Owner Full Test authorization → passed Full Test → independently author Actual from the final repository → Archify validate/compare → architecture acceptance → Owner Finalize.

#### Scenario: H1 candidate does not prematurely create real 03 Actual
- **WHEN** H1 is still active or has not yet formed its canonical Change Checkpoint
- **THEN** the real 03 Actual Architecture MUST remain absent
- **AND** H1 self-hosting proof MUST use only disposable fixture architecture artifacts for its E2E acceptance

### Requirement: H1 performance and cost data MUST remain observation-only

H1 MUST record enough local test/report evidence to observe stable package footprint, Action/review counts, prepare/resume latency, Run corpus size, OpenSpec/Archify process counts, Change Verification wall time, Delivery Full Test wall time and architecture render/compare wall time where physically exercised. These observations MUST NOT become a new durable telemetry authority, Policy gate, dynamic scheduler, cache platform or automatic timeout tuner.

#### Scenario: performance observation does not alter lifecycle outcome
- **WHEN** H1 records package/runtime/timing observations from its disposable acceptance fixture
- **THEN** correctness MUST continue to be decided by existing lifecycle/Verification authorities
- **AND** timing variation alone MUST NOT synthesize a new Policy boundary or automatic optimization action
