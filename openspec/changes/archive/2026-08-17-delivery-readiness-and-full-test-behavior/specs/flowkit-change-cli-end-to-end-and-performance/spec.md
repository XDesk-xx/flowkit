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
- **THEN** MUST 使用 current Delivery `verification.fullTest.execution.command + args + launcherMode` 解析唯一 physical launch；current 03 `npm-shim` MUST 在 non-win32 使用 `npm`，在 win32 使用 `npm.cmd` 并通过既有 ComSpec `.cmd/.bat` launcher
- **AND** MUST 通过 `FLOWKIT_FULL_TEST_RESULT_PATH` 消费同一 child process 产生的 `flowkit-full-test-result-v1`
- **AND** MUST NOT绕过 persisted binding 直接调用独立 internal Full Test runner 作为第二 authority
- **AND** breaking persisted route、platform normalization 或 structured protocol MUST 使正式 selected A1 CLI/integration tests fail


#### Scenario: outcome-unknown transport blocker 不创建新 attempt

- **WHEN** `flowkit delivery full-test` 的 prior Windows attempt 已持久化 current `executionBlock.reason=outcome-unknown`
- **THEN** subsequent operator invocation MUST fail closed before spawning the Full Test binding
- **AND** MUST NOT创建 Run/NNN、terminal `failed` 或 fabricated resultRef
