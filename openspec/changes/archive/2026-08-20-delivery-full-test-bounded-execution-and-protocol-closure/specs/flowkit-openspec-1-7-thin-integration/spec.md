## MODIFIED Requirements

### Requirement: same OpenSpec managed identity 必须传播到 nested Verification / archive / retry / Full Test technical children

C1 MUST represent managed OpenSpec resolution as a command + args-prefix invocation rather than forcing `process.execPath + entrypoint` into a single executable string. Nested Flowkit processes/checks MUST reconstruct or receive the same managed identity through `FLOWKIT_HOME`; compatibility execution MAY continue carrying exact `FLOWKIT_OPENSPEC_BIN` where required.

`Change Verification`, disposable archive-sync, public `verify --retry`, real-process integration tests and Delivery Full Test technical verification children MUST NOT silently fall back to a different ambient OpenSpec identity when the parent used managed OpenSpec. For `kind=bounded-command-plan`, this obligation applies to every physical target whose execution/test descendants may resolve OpenSpec; a single parent/wrapper propagation proof is insufficient.

#### Scenario: managed identity survives Verification child execution
- **WHEN** parent Flowkit resolves OpenSpec from a valid `FLOWKIT_HOME`
- **AND** formal Change Verification launches tests/operations requiring OpenSpec
- **THEN** every applicable Full Test physical child MUST resolve the same managed tool home/version/entrypoint
- **AND** must not replace it with ambient PATH

#### Scenario: managed identity survives Delivery Full Test technical environment
- **WHEN** Delivery Full Test technical execution is executed after Owner authorization
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


#### Scenario: bounded Full Test target environment does not persist machine path authority
- **WHEN** bounded Full Test resolves physical targets on two machines/checkouts with different absolute `FLOWKIT_HOME` paths
- **THEN** each execution MUST reconstruct the managed identity from the current environment/resolver
- **AND** the Delivery Manifest MUST NOT need the machine-specific absolute tool path or PATH bytes to preserve execution identity
