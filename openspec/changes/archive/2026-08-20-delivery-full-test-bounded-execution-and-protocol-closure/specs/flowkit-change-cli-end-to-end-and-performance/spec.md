## MODIFIED Requirements

### Requirement: Change operator CLI MUST expose the complete single-boundary Change surface

Flowkit MUST expose `explore`、`review`、`revise`、`propose`、`apply`、`verify`、`archive` Change operator commands in addition to the existing diagnostic/write/recovery commands. `explore`、`review`、`revise`、`propose`、`apply` and `archive` MUST consume current formal facts and Policy before operating, and one Change operator invocation MUST NOT automatically continue into a second Formal Action。

The Change operator surface MUST NOT implement `while(next)`、approved-after-review auto-propose、changes-requested auto-revise、Delivery Finalize、automatic checkpoint Commit/Push/Merge or provider/agent orchestration。A1 MAY add a separate `flowkit delivery full-test` Delivery operator command, but that command MUST consume a Policy `delivery-behavior: full-test` result, MUST NOT be interpreted as a Change operator/FormalAction, and MUST NOT create a Standard Run/NNN。

#### Scenario: one invocation stops at one Change Action boundary
- **WHEN** an operator invokes a Change Action command and the current boundary is admitted successfully
- **THEN** the CLI MUST return control after that one boundary
- **AND** MUST NOT automatically prepare the next Formal Action

#### Scenario: Delivery behavior does not become a Change CLI Action
- **WHEN** Policy reaches a Delivery Full Test or Delivery Finalize boundary
- **THEN** the Change operator CLI MUST NOT create a Standard Run for that Delivery behavior
- **AND** MUST leave the boundary to the Delivery execution model

#### Scenario: explicit Delivery Full Test operator remains no-Run
- **WHEN** `flowkit delivery full-test` is invoked while Policy returns exact `delivery-behavior: full-test`
- **THEN** the command MAY execute exactly that one Delivery behavior
- **AND** MUST NOT allocate Standard Run、Run ID 或 Delivery-wide NNN
- **AND** MUST return control after terminal publication

#### Scenario: Delivery Full Test operator 物理执行 persisted binding
- **WHEN** `flowkit delivery full-test` 在 authorized boundary 执行
- **THEN** MUST先读取 current Delivery exact `verification.fullTest.execution.kind`
- **AND** `kind=command` MUST继续使用 persisted command+args+launcherMode+timeout解析 single physical launch，并通过 `FLOWKIT_FULL_TEST_RESULT_PATH` 消费同一 child的 `flowkit-full-test-result-v1`；`npm-shim`平台 normalization保持既有语义
- **AND** `kind=bounded-command-plan` MUST在 current Flowkit process内调用 Verification-owned executable-plan/aggregator，根据 persisted logical id/resolverId/perTargetTimeoutMs解析 ordered physical targets，每个 child独立 bounded，MUST NOT spawn `npm run verify:full`、`verify:step full` 或其它覆盖完整 logical union的 long wrapper
- **AND** both kinds MUST remain one Delivery Full Test behavior/no Run/no NNN
- **AND** breaking persisted route、platform normalization、physical closure or structured/semantic result contract MUST使正式 selected A1 CLI/integration tests fail

#### Scenario: outcome-unknown transport blocker 不创建新 attempt

- **WHEN** `flowkit delivery full-test` 的 prior Windows attempt 已持久化 current `executionBlock.reason=outcome-unknown`
- **THEN** subsequent operator invocation MUST fail closed before spawning the Full Test binding
- **AND** MUST NOT创建 Run/NNN、terminal `failed` 或 fabricated resultRef


#### Scenario: bounded target transport error不发布 terminal result
- **WHEN** bounded operator任一 physical target返回 `spawn-failed|timed-out-cancelled|outcome-unknown` 或 resolver closure error
- **THEN** operator MUST return execution-error and MUST NOT fabricate `passed|failed` terminal result/ref
- **AND** `outcome-unknown` MUST retain/persist the existing execution safety block semantics

#### Scenario: heavy override 必须保持默认 case 语义闭合
- **WHEN** `full` resolver 用 static heavy override 替换某个 discovered test file 的默认执行方式
- **THEN** resolver MUST 显式证明该文件默认注册的 required test cases/selectors/assertion semantics 全部被 bounded targets消费，而不是仅证明 file path 出现在 partition union
- **AND** missing、overlap、title drift 或 branch drift MUST fail closed before any partial Full Test execution
- **AND** current H1 file MUST map its installed-runner diagnostics smoke to an independent bounded target and its future-Delivery E2E case to `FLOWKIT_H1_FORMAL_PHASE=1..26` bounded targets so the FORMAL_PHASE branch cannot silently delete the smoke case
