## MODIFIED Requirements

### Requirement: Architecture mutation family 必须拥有 closed Verification ownership 与 physical check
The source-controlled Change Verification relation MUST keep bounded `architecture` ownership for `architecture/**`, `src/architecture/**` and dedicated D1 fixtures/tests, with stable logical `tests-architecture` and `typecheck`. The `architecture` module MUST relate to `flowkit-architecture-assets` and MUST NOT overlap existing CLI/external-tool/verification ownership.

The physical `tests-architecture` resolver MUST execute D1 targets that cover four reference visualization JSON files (Change/Delivery Workflow + Sequence), Delivery Current/Planned provenance, repository-evidence Architecture rendering, dynamic Delivery paths and JSON-vs-HTML authority boundary.

E1 MUST additionally give `architecture` unique ownership of `tests/integration/e1-architecture-actual-compare-and-system-promotion.test.ts`, and the `tests-architecture` physical resolver MUST execute both D1 and E1 Architecture integration targets plus architecture unit tests.

#### Scenario: all architecture asset classes are uniquely owned
- **WHEN** `actualChangeSet` includes `architecture/reference/json/*.json` or `architecture/<delivery-id>/json/current.architecture.json` / `planned.architecture.json`
- **THEN** each path MUST map uniquely to the `architecture` verification module
- **AND** formal selection MUST include `tests-architecture`

#### Scenario: E1 integration test is physically selected by architecture mutations
- **WHEN** E1 actualChangeSet contains `src/architecture/**`, Architecture CLI paths or E1 architecture integration test changes
- **THEN** selection MUST include `tests-architecture`
- **AND** physical resolver MUST execute `tests/integration/e1-architecture-actual-compare-and-system-promotion.test.ts`
- **AND** the path MUST have exactly one verification module owner

## ADDED Requirements

### Requirement: expected E1 actualChangeSet 必须形成完整 physical selected-check closure
A read-only Proposal preflight using expected E1 actualChangeSet and current E1 delta capability refs MUST produce a matched capability relation across architecture, CLI, core-model, execution, persistence and verification-selection mutations and MUST reach every affected physical test family.

#### Scenario: next-consumer dry selection reaches E1 checks
- **WHEN** expected E1 production/test paths are evaluated by `buildVerificationSelection()`
- **THEN** capability relation MUST be `matched`
- **AND** selection MUST include current OpenSpec strict/archive-sync checks
- **AND** MUST include `tests-architecture`, `tests-cli`, `tests-execution`, `tests-external-tools`, `tests-openspec-runtime`, `tests-persistence`, `tests-serialization`, `tests-verification`, and `typecheck` as dependency closure requires

### Requirement: E1 architecture lifecycle correctness 必须由结构回归与 external physical proof 双重证明
Formal E1 verification MUST test more than Archify process success. Structural regressions MUST cover delayed Actual instantiation, exact Full Test authorization-occurrence-to-cycle binding, explicit Owner acceptance, stale remediation rejection, fresh Full Test requirement, canonical Owner ref cycle binding/legacy compatibility and accepted-source future Delivery consumer.

#### Scenario: stale Full Test or remediation binding fails selected verification
- **WHEN** a disposable counterfactual allows old passed Full Test qualification or stale architecture cycle binding to survive remediation, including two fresh authorizations with identical technical result/Actual/compare bytes
- **THEN** formally selected E1 architecture/execution/persistence tests MUST fail
- **AND** unrelated renderer PASS MUST NOT substitute for lifecycle closure
