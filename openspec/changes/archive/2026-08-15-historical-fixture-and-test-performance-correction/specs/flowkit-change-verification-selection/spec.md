## MODIFIED Requirements

### Requirement: verificationScope 必须由 closed module 与 capability authority 选择

Core MUST 使用 source-controlled、closed、deterministic Verification Catalog 将每个 actual path 唯一映射到 seed module，按 reverse dependency consumer direction 计算 transitive closure，并与 formal current Change 的 structured OpenSpec delta capability ids/refs 做双向 relation validation。Catalog MUST 只拥有 module ownership、dependency relation、capability relation 与 stable logical check ids；current source bytes 定义 current Catalog，physical command、launcher、current Change literal 或人工 generation number MUST NOT 成为 selection identity。需要 point-in-time Catalog identity 时 MUST 使用 canonical Catalog projection 的 content fingerprint。最终 verificationScope MUST 是 relevant logical checks/scopes 的 lexical ordered、deduplicated minimal union；compatible affected test scopes MUST 在 execution 前 union/dedupe test files。

When a selected logical check owns a real external-tool integration target, physical execution MUST include that target rather than silently omitting or skipping it. The executor MUST propagate the executable identity from the current operation's existing external-tool adapter into that test process when the target requires it; this propagation is execution context, not a new selection identity or second tool authority.

#### Scenario: dependency consumer 被展开

- **WHEN** module `consumer` 的 `dependsOn` 包含 changed seed module `source`
- **THEN** verification selection MUST 包含 `source` 与 `consumer`
- **AND** MUST 递归包含所有 reverse dependency consumers

#### Scenario: ownership 或 capability relation 不完整

- **WHEN** actual path zero-match/multi-match，dependency graph cyclic，或 module 与当前 delta capability 存在 missing、unknown、stale、mismatch、ambiguous relation
- **THEN** selection MUST fail closed
- **AND** MUST NOT 降级为 `not-applicable`

#### Scenario: explicit not-applicable

- **WHEN** closed module/capability contract 明确声明并由 Core 证明 `noApplicable` predicate
- **THEN** selection MAY 产生 explicit `not-applicable`
- **AND** persisted binding MUST 保存 predicate authority 与证明 outcome

#### Scenario: current Change OpenSpec strict 使用 formal identity

- **WHEN** logical check `openspec-current-change-strict` 被选择
- **THEN** executor MUST 使用 formal current `changeId` 与 OpenSpec structured projection 执行 strict validation
- **AND** Catalog MUST NOT 保存 E1 Change id、E1 active path 或 `npx openspec validate <fixed-change>` 作为 lifecycle identity

#### Scenario: physical command 不改变 logical selection identity

- **WHEN** platform launcher 或 executor command representation 改变但 logical check contract 未改变
- **THEN** persisted logical selection identity MUST 保持由 logical check id 表达
- **AND** command/launcher resolution MUST 属于 Verification executor / OpenSpec adapter

#### Scenario: Catalog point-in-time identity 使用 content fingerprint

- **WHEN** current selection 需要保存当时使用的 Catalog identity
- **THEN** MUST 保存 canonical Catalog projection 的 content fingerprint
- **AND** MUST NOT 另外维护 `catalogGeneration`、Catalog schema generation 或独立 Catalog version lifecycle

#### Scenario: F1 与 G1 shaped consumer 可被选择

- **WHEN** actualChangeSet/capability relation 对应 F1-shaped archive/checkpoint 或 G1-shaped CLI/resume Change
- **THEN** Catalog MUST 为其生成非空、deterministic logical selection
- **AND** selection MUST NOT 依赖 `change-verification-selection-and-change-set` literal

#### Scenario: compatible affected tests 聚合执行

- **WHEN** 多个 selected module scopes 解析到同一 compatible Node test runner
- **THEN** executor MUST 先 union + dedupe test files 再执行
- **AND** MUST NOT 仅因 module 边界重复启动等价 test process

#### Scenario: selected OpenSpec runtime executes the real CLI integration target
- **WHEN** `tests-openspec-runtime` is selected for an actualChangeSet that includes the real OpenSpec integration target
- **THEN** its physical Node execution MUST include `tests/integration/openspec-1-7-real-cli.test.ts`
- **AND** the suite MUST execute rather than be silently skipped for lack of executable context

#### Scenario: OpenSpec executable identity is propagated from the current adapter
- **WHEN** the selected real OpenSpec integration suite requires an executable identity
- **THEN** the Verification executor MUST propagate the current operation's `OpenSpecCliAdapter.executable` into the Node test environment
- **AND** MUST NOT discover or persist a second OpenSpec executable authority

#### Scenario: failing real OpenSpec target fails the selected logical check
- **WHEN** the expected real OpenSpec integration physical target is replaced by a failing sentinel in a disposable verification fixture
- **THEN** `tests-openspec-runtime` MUST fail
- **AND** passing sibling unit targets MUST NOT satisfy the selected check
