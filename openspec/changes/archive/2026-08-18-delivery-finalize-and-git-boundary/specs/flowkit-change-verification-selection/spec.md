## ADDED Requirements

### Requirement: F1 Finalize integration 必须拥有 closed ownership 与 physical tests-execution coverage
Source-controlled Verification Catalog MUST give `tests/integration/f1-delivery-finalize-and-git-boundary.test.ts` exactly one owner under the execution module. The execution module and CLI relation MUST recognize `flowkit-delivery-finalize-and-git-boundary`, and `tests-execution` physical resolver MUST execute both the existing F1 archive/checkpoint integration and the new F1 Delivery Finalize integration plus relevant facts/policy/services unit tests.

#### Scenario: new F1 integration is physically executed
- **WHEN** F1 actualChangeSet includes finalization/Policy/Git boundary/CLI mutations
- **THEN** formal selection MUST include `tests-execution`
- **AND** the physical resolver MUST execute `tests/integration/f1-delivery-finalize-and-git-boundary.test.ts`
- **AND** that path MUST have exactly one verification module owner

#### Scenario: sentinel failure propagates through tests-execution
- **WHEN** a disposable copy makes the new F1 integration target fail
- **THEN** the formally resolved `tests-execution` command MUST fail
- **AND** unrelated unit/full-suite PASS MUST NOT substitute for physical closure

### Requirement: expected F1 actualChangeSet 必须形成 matched next-consumer selection
Before Review-Propose, a read-only prospective Catalog proof using expected F1 production/test paths and F1 delta capability refs MUST pass production `buildVerificationSelection()`. Every seed module MUST have an applicable delta capability and every delta capability MUST relate to the selected module closure.

#### Scenario: expected F1 selection reaches all affected check families
- **WHEN** expected F1 actualChangeSet spans CLI, domain, facts, persistence, policy, services, verification catalog and F1 integration/unit tests
- **THEN** capability relation MUST be `matched`
- **AND** selected checks MUST include OpenSpec current strict/archive-sync, `tests-cli`, `tests-execution`, `tests-openspec-runtime`, `tests-persistence`, `tests-serialization`, `tests-verification`, and `typecheck` as dependency closure requires
