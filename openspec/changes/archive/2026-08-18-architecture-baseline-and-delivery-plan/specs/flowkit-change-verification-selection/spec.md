## ADDED Requirements

### Requirement: Architecture mutation family 必须拥有 closed Verification ownership 与 physical check
The source-controlled Change Verification relation MUST keep bounded `architecture` ownership for `architecture/**`, `src/architecture/**` and dedicated D1 fixtures/tests, with stable logical `tests-architecture` and `typecheck`. The `architecture` module MUST relate to `flowkit-architecture-assets` and MUST NOT overlap existing CLI/external-tool/verification ownership.

The physical `tests-architecture` resolver MUST execute D1 targets that cover four reference visualization JSON files (Change/Delivery Workflow + Sequence), Delivery Current/Planned provenance, repository-evidence Architecture rendering, dynamic Delivery paths and JSON-vs-HTML authority boundary.

#### Scenario: all architecture asset classes are uniquely owned
- **WHEN** `actualChangeSet` includes `architecture/reference/json/*.json` or `architecture/<delivery-id>/json/current.architecture.json` / `planned.architecture.json`
- **THEN** each path MUST map uniquely to the `architecture` verification module
- **AND** formal selection MUST include `tests-architecture`

### Requirement: CLI-owned D1 paths 必须保持 cli-diagnostics ownership 并具有 D1 capability relation
`src/cli/architecture.ts`, `src/cli/main.ts`, and `tests/unit/cli/architecture.test.ts` MUST remain uniquely owned by existing `cli-diagnostics`. `cli-diagnostics.capabilityIds` MUST include `flowkit-architecture-assets` while preserving existing ownership selectors/capabilities.

#### Scenario: D1 CLI paths satisfy capability admission without artificial ownership movement
- **WHEN** expected D1 `actualChangeSet` includes Architecture CLI paths and current delta capability refs include `flowkit-architecture-assets`, `flowkit-change-verification-selection`, and `flowkit-external-tool-runtime`
- **THEN** `buildVerificationSelection()` MUST NOT throw `VERIFICATION_CAPABILITY_SELECTION_FAILED`
- **AND** `selection.capabilityRelation.kind` MUST be `matched`
- **AND** CLI paths MUST still have exactly one owner: `cli-diagnostics`

### Requirement: expected D1 actualChangeSet 必须形成完整 physical selected-check closure
A read-only Proposal preflight using the prospective D1 module map and expected D1 actualChangeSet MUST include all four final reference paths plus cleanup of superseded `delivery-lifecycle.lifecycle.json`, Current/Planned, Architecture service, CLI, Archify adapter, Verification mapping and D1 tests. It MUST select `architecture`, `cli-diagnostics`, `external-tools`, and `verification-selection` as seed modules, include `openspec-runtime` through reverse dependency closure, and select all applicable physical checks.

#### Scenario: next-consumer dry selection reaches all relevant D1 checks
- **WHEN** the expected D1 actualChangeSet is evaluated against D1 capability refs
- **THEN** formal selection MUST include `tests-architecture`, `tests-cli`, `tests-external-tools`, `tests-openspec-runtime`, `tests-verification`, and `typecheck`
- **AND** MUST include current OpenSpec strict/archive-sync checks
- **AND** capability relation MUST be `matched`

### Requirement: reference completeness 必须由结构回归与 physical renderer 双重证明
Formal D1 verification MUST NOT treat renderer success alone as complete-lifecycle acceptance. Tests MUST assert required Workflow graph steps/loops and Sequence participants/messages/authority ordering for both Change and Delivery, and exact managed Archify MUST validate/deliver all four native reference files.

#### Scenario: structural simplification fails selected verification
- **WHEN** a disposable counterfactual removes a required Change review/revise/STOP edge, Delivery corrective/fresh-authorization edge, or required Sequence participant/message
- **THEN** formally selected `tests-architecture` MUST fail even if Archify can still render the JSON

#### Scenario: breaking native Sequence or repository-evidence route fails physical verification
- **WHEN** a disposable counterfactual breaks Sequence validate/deliver support or the Architecture `--repo-root` route
- **THEN** the selected architecture/external-tool physical checks MUST fail
- **AND** unrelated full-suite PASS MUST NOT substitute for physical closure
