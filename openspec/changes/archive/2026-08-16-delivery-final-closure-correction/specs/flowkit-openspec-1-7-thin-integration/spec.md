## ADDED Requirements

### Requirement: OpenSpec executable resolution 必须只有一个实际 invocation authority

Flowkit MUST 将 OpenSpec executable 的实际 invocation identity 作为 C1 thin integration 的单一 execution authority。显式 executable 存在时 MUST 使用该 exact identity；未显式指定时，non-Windows MAY 使用 PATH-resolved `openspec`，Windows MUST 在完整 PATH 上先解析 `openspec.ps1`、仅在不存在时 fallback `openspec.cmd`。Adapter invocation、Change Verification、project verification 与 real OpenSpec integration tests MUST 复用同一个 resolved identity，MUST NOT把 constructor nominal shim name、repo-local `node_modules/.bin` 假设或另一套 test-side discovery 持久化/解释为第二 authority。

Executable resolution 只拥有 identity discovery；`.ps1` / `.cmd` / direct executable 的实际 process-launch semantics MUST继续由既有 shared external-command boundary拥有。项目 MUST NOT仅为满足测试 discovery 假设而要求 OpenSpec 成为 repo-local dependency。

#### Scenario: Windows cmd-only PATH 使用实际 resolved identity

- **WHEN** Windows execution environment 的 PATH 中不存在 `openspec.ps1` 但存在 supported `openspec.cmd`
- **THEN** OpenSpec adapter MUST resolve并调用该 `.cmd` executable
- **AND** downstream Verification / real integration test context MUST消费同一个 resolved identity，而不是 nominal `openspec.ps1`

#### Scenario: repo-local OpenSpec 不存在但 PATH executable 可用

- **WHEN** supported OpenSpec 可由正式 resolver从 PATH取得，而 repository `node_modules/.bin/openspec(.cmd)` 不存在
- **THEN** production 与 required integration regression MUST仍可执行
- **AND** MUST NOT要求新增 OpenSpec project dependency来满足测试

#### Scenario: OpenSpec executable 不可解析时 fail closed

- **WHEN**没有 explicit executable 且正式 environment 中不存在可接纳的 OpenSpec executable
- **THEN** required OpenSpec operation / verification MUST fail closed
- **AND** MUST NOT通过 silent skip、默认成功或 test-local fallback伪造 coverage

### Requirement: Proposal terminal admission 必须执行真实 disposable archive-sync preflight

当 formal current Change 存在 OpenSpec delta 且 Propose / revise-propose 准备 terminal admission 时，Flowkit MUST 在 strict validation 通过后，使用当前 exact proposal bundle + canonical `openspec/specs` 在 disposable repository 中调用真实 OpenSpec archive semantics。该 preflight MUST 复用当前 `OpenSpecCliAdapter` 已解析的 executable identity 与既有 structured archive result parser，只消费 OpenSpec 的 success/failure authority；Flowkit MUST NOT 自己实现 Requirement / Scenario merge engine。preflight 产生的 mutation MUST 只发生在 disposable repository，canonical candidate 不得被提前 archive。

同一 reusable preflight MUST 可被 Change Verification 以 stable logical check `openspec-current-change-archive-sync` 调用，使最终 Apply/revise-apply verification 在 Owner archive authorization 前再次证明 exact current candidate 的 archive-sync compatibility。Explore MAY 使用同一 preflight helper 作为 External Mutation Proof，但该 helper 不成为新的 Formal Action 或 Policy authority。

#### Scenario: strict PASS 但 archive merge 不完整时 Proposal fail closed

- **WHEN** `openspec validate <current-change> --strict` PASS，但 real disposable archive 返回 `archive_spec_update_failed` 或其他 structured archive failure
- **THEN** Propose / revise-propose terminal admission MUST fail closed
- **AND** Reviewer MUST NOT 收到一个被 Flowkit terminalized 为 completed 的 archive-incompatible Proposal generation

#### Scenario: disposable preflight 使用 exact current candidate 且不污染 canonical repository

- **WHEN** archive-sync preflight 执行
- **THEN** disposable repository MUST 来自当前 exact `openspec/` candidate bytes，并包含当前 canonical specs 与 current Change delta
- **AND** MUST 使用当前 adapter/resolver 的 resolved OpenSpec executable identity
- **AND** success/failure 后 MUST 清理 disposable mutation surface
- **AND** canonical current Change、canonical specs 与 Run history MUST NOT 因 preflight 被 relocation 或改写

#### Scenario: Change Verification 在 archive authorization 前重证 archive-sync

- **WHEN** current matched Change Verification 执行 `openspec-current-change-archive-sync`
- **THEN** MUST 调用与 Proposal admission 相同的 reusable real OpenSpec archive-sync preflight
- **AND** structured archive failure、timeout、outcome-unknown 或 executable failure MUST 使 formal Change Verification fail closed
- **AND** PASS MUST 表示真实 disposable archive structured success，而不是 synthetic merge simulation
