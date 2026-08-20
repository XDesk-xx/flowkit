## ADDED Requirements

### Requirement: selected heavy Change Verification checks MUST use deterministic bounded physical execution

When formal Change Verification selects logical `tests-cli` or `tests-execution`, the executor MUST resolve and execute the source-controlled bounded physical mapping owned by that logical check. Whether the current Change itself carries the H1 self-hosting capability MUST NOT decide whether the same selected heavy physical targets receive bounded execution. Physical fanout remains execution representation and MUST NOT alter persisted logical selection identity.

Each physical Node target MUST retain the existing independent `120000ms` timeout/process ownership. This requirement MUST NOT introduce timeout inflation, runtime timing classification, dynamic scheduling, a Verification platform, or a second selection authority.

For `tests-cli`, bounded execution MUST preserve the same selected test semantics as the logical check: ordinary compatible files, diagnostic real-process coverage, G1 Change named cases, G1 Adapter named cases, and H1 coverage. Non-H1 selection MUST retain the legacy npm-installed diagnostic smoke; H1 selection MAY retain the existing dedup of that legacy smoke only because H1 separately executes its own installed-runner diagnostics smoke. H1 physical coverage MUST include one installed-runner smoke target plus the future-Delivery E2E decomposition `FLOWKIT_H1_FORMAL_PHASE=1..26`.

For `tests-execution`, bounded execution MUST preserve existing per-file coverage plus the existing B1 suite/case fanout. A selected historical regression fixture MUST resolve the formal historical boundary it claims to exercise; later repository HEAD MUST NOT silently substitute for that boundary.

#### Scenario: I1 selects tests-cli without carrying H1 capability

- **WHEN** an I1-shaped actualChangeSet deterministically selects logical `tests-cli`
- **AND** the current Change capability set does not include `flowkit-stable-runner-and-self-hosting-acceptance`
- **THEN** the executor MUST still use the bounded `tests-cli` physical mapping
- **AND** MUST NOT fall back to one monolithic Node process merely because H1 capability is absent
- **AND** non-H1 diagnostic real-process coverage MUST remain present

#### Scenario: H1 semantics remain complete under bounded tests-cli

- **WHEN** selected `tests-cli` resolves the H1 integration file
- **THEN** physical mapping MUST execute the installed-runner diagnostics smoke as an independent bounded target
- **AND** MUST execute the future-Delivery E2E semantics through phases 1 through 26 using one shared state root
- **AND** missing smoke, missing phase, overlap, title drift or branch drift MUST fail closed rather than silently reduce coverage

#### Scenario: selected tests-execution remains affected while historical fixture is repaired

- **WHEN** the actualChangeSet changes formal-fact/execution consumers so `tests-execution` is selected
- **AND** a historical checkpoint fixture requires the G1 checkpoint tree
- **THEN** the fixture MUST locate the formal G1 Git checkpoint boundary rather than assume current `HEAD` is G1
- **AND** the executor MUST keep the logical `tests-execution` check selected
- **AND** base failure alone MUST NOT be used to waive or delete the selected target

#### Scenario: physical sentinel proves target reachability

- **WHEN** a disposable Verification regression claims a selected target is physically executed
- **THEN** all mandatory bounded predecessors before that target MUST be executable/passing in the fixture
- **AND** the intended sentinel or environment assertion MUST actually be reached
- **AND** merely observing the target path in a planned command string MUST NOT satisfy physical execution closure
