## ADDED Requirements

### Requirement: C1 external-tool mutations 必须闭合到独立 physical Verification target

C1 MUST extend the source-controlled Verification module/capability relation so production changes under the shared external-tool runtime and Archify adapter are owned by a bounded module and select a stable logical physical check for managed external-tool behavior. Formal Verification MUST physically execute the C1 managed OpenSpec/Archify integration tests; manual Explore proof alone MUST NOT satisfy Apply verification.

The mapping MUST remain closed/source-controlled and MUST NOT become a dynamic tool/test registry. Changes to shared external-tool code MUST propagate to existing OpenSpec-runtime consumers and verification-selection consumers as dependency closure requires.

#### Scenario: external-tool runtime change selects physical managed-tool tests
- **WHEN** `actualChangeSet` includes a path owned by the C1 shared external-tool/Archify module
- **THEN** selection MUST include the C1 external-tool capability and logical physical check
- **AND** the resolver MUST map that check to the actual C1 unit/integration test files
- **AND** formal Verification result MUST bind the physical process outcome

#### Scenario: breaking managed Archify route makes formal selected check fail
- **WHEN** a disposable counterfactual breaks the managed Archify identity/invocation route used by the C1 physical target
- **THEN** the formal selected external-tool check MUST fail
- **AND** a passing unrelated full repository test or manually-run proof MUST NOT be accepted as selection closure

#### Scenario: OpenSpec migration remains covered by existing physical consumers
- **WHEN** C1 changes canonical OpenSpec managed resolution or propagation
- **THEN** Verification closure MUST also include existing real OpenSpec/archive/retry/launcher regressions selected through dependency/capability mapping
- **AND** MUST prove nested consumers execute the same managed identity where applicable

#### Scenario: C1 unit-test ownership remains non-overlapping
- **WHEN** C1 adds Archify/shared-runtime unit tests
- **THEN** those tests MUST live under `tests/unit/external-tools/**` and resolve only to `external-tools`
- **AND** existing `tests/unit/integrations/**` OpenSpec regressions MUST continue to resolve only to `openspec-runtime`
- **AND** any source-controlled selector layout that makes one path match both modules MUST fail module-map validation

#### Scenario: shared runtime mutation reaches both new and existing physical coverage
- **WHEN** `actualChangeSet` contains shared external-tool production code
- **THEN** the seed module MUST be `external-tools`
- **AND** selection MUST include `tests-external-tools`
- **AND** reverse dependency closure MUST also include the existing OpenSpec runtime physical check
