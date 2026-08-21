## ADDED Requirements

### Requirement: OpenSpec canonical invocation 必须迁移到 managed `FLOWKIT_HOME` identity 且保留 bounded compatibility

When a valid managed OpenSpec `1.7.0` tool home is present, OpenSpec canonical invocation MUST resolve through the C1 managed external-tool runtime and execute `process.execPath + exact openspec.js entrypoint`. Ambient PATH/shim discovery MUST NOT outrank a valid managed tool identity.

Compatibility MUST remain bounded:

```text
1. explicit/injected executable/invocation for controlled tests or existing adapter seams
2. valid managed FLOWKIT_HOME OpenSpec 1.7.0 (canonical managed route)
3. legacy FLOWKIT_OPENSPEC_BIN when managed identity is unavailable
4. historical ambient POSIX/Windows shim resolution only as compatibility fallback
```

Windows historical `.ps1`-first then `.cmd` fallback behavior MUST remain regression-covered for the legacy route; C1 MUST NOT delete those compatibility semantics merely because canonical managed execution no longer requires them.

A `runner` callback is an execution transport/observation seam only and MUST NOT itself create explicit/injected executable authority. Tests or controlled callers that intentionally inject executable identity MUST use the explicit `executable` or `invocation` seam. Therefore an observational runner with no explicit executable/invocation MUST continue to consume the same resolver precedence as production, including canonical managed `FLOWKIT_HOME` identity.

#### Scenario: observational runner preserves managed authority
- **WHEN** a valid managed OpenSpec 1.7.0 identity exists
- **AND** a caller supplies a runner callback only to observe/forward process execution
- **AND** no explicit executable/invocation is supplied
- **THEN** resolution MUST remain `managed`
- **AND** the runner MUST receive `process.execPath + exact openspec.js entrypoint + operation args`

#### Scenario: fake runner executable authority is explicit
- **WHEN** a controlled test intends to replace OpenSpec executable identity while using a fake runner
- **THEN** the test MUST supply explicit `executable` or `invocation` authority
- **AND** runner presence alone MUST NOT change the resolver source or precedence

#### Scenario: managed OpenSpec outranks ambient shim discovery
- **WHEN** a valid managed OpenSpec 1.7.0 identity exists
- **AND** ambient PATH contains another OpenSpec command/shim
- **THEN** canonical resolution MUST use the managed exact Node entrypoint
- **AND** MUST NOT execute ambient PATH as the canonical identity

#### Scenario: legacy FLOWKIT_OPENSPEC_BIN remains a bounded fallback
- **WHEN** no valid managed OpenSpec tool home is available
- **AND** a non-empty `FLOWKIT_OPENSPEC_BIN` compatibility value is supplied
- **THEN** existing compatibility invocation MUST remain available
- **AND** MUST be identified as compatibility rather than managed identity

#### Scenario: Windows shim behavior remains historically compatible
- **WHEN** managed identity and `FLOWKIT_OPENSPEC_BIN` are unavailable on Windows
- **THEN** the legacy resolver MUST continue complete `.ps1` search before `.cmd` fallback
- **AND** existing Windows launcher safety semantics MUST remain unchanged

### Requirement: same OpenSpec managed identity 必须传播到 nested Verification / archive / retry / Full Test technical children

C1 MUST represent managed OpenSpec resolution as a command + args-prefix invocation rather than forcing `process.execPath + entrypoint` into a single executable string. Nested Flowkit processes/checks MUST reconstruct or receive the same managed identity through `FLOWKIT_HOME`; compatibility execution MAY continue carrying exact `FLOWKIT_OPENSPEC_BIN` where required.

`Change Verification`, disposable archive-sync, public `verify --retry`, real-process integration tests and Delivery Full Test technical verification children MUST NOT silently fall back to a different ambient OpenSpec identity when the parent used managed OpenSpec.

#### Scenario: managed identity survives Verification child execution
- **WHEN** parent Flowkit resolves OpenSpec from a valid `FLOWKIT_HOME`
- **AND** formal Change Verification launches tests/operations requiring OpenSpec
- **THEN** the child MUST resolve the same managed tool home/version/entrypoint
- **AND** must not replace it with ambient PATH

#### Scenario: managed identity survives Delivery Full Test technical environment
- **WHEN** Delivery Full Test technical command is executed after Owner authorization
- **AND** parent Flowkit uses managed OpenSpec
- **THEN** the child environment MUST preserve `FLOWKIT_HOME` so `verify:full` resolves the same exact managed identity
- **AND** this propagation MUST NOT create a new Delivery Full Test authority or Run

#### Scenario: public verify retry has a canonical managed route
- **WHEN** `FLOWKIT_HOME` contains a valid managed OpenSpec 1.7.0 identity
- **AND** `FLOWKIT_OPENSPEC_BIN` is absent
- **AND** ambient PATH cannot provide OpenSpec
- **THEN** public `verify --retry` regression coverage MUST execute successfully through the managed identity
- **AND** a separate legacy `FLOWKIT_OPENSPEC_BIN` retry case MAY remain only as compatibility coverage

#### Scenario: managed Full Test technical children do not require legacy executable env
- **WHEN** public `test:full` runs with a valid managed OpenSpec tool home
- **AND** no legacy `FLOWKIT_OPENSPEC_BIN` is supplied
- **THEN** its OpenSpec-dependent child regressions MUST receive `FLOWKIT_HOME` and execute the managed identity
- **AND** the test suite MUST NOT fail merely because a historical regression unconditionally requires the legacy variable


#### Scenario: Reset generation re-closes physical OpenSpec regressions
- **WHEN** the managed-vs-injected execution identity correction is applied
- **THEN** formal Change Verification MUST physically execute and pass the affected OpenSpec real-process/runtime checks
- **AND** archive, public `verify --retry`, G1 and Full Test environment regressions MUST remain green under their intended managed/compatibility identities
- **AND** a failed superseded Verification publication MUST NOT be rewritten as if it had passed
