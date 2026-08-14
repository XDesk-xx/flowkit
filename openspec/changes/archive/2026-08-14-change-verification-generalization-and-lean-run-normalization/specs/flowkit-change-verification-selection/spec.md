## MODIFIED Requirements

### Requirement: verificationScope 必须由 closed module 与 capability authority 选择

Core MUST 使用 source-controlled、closed、deterministic Verification Catalog 将每个 actual path 唯一映射到 seed module，按 reverse dependency consumer direction 计算 transitive closure，并与 formal current Change 的 structured OpenSpec delta capability ids/refs 做双向 relation validation。Catalog MUST 只拥有 module ownership、dependency relation、capability relation 与 stable logical check ids；current source bytes 定义 current Catalog，physical command、launcher、current Change literal 或人工 generation number MUST NOT 成为 selection identity。需要 point-in-time Catalog identity 时 MUST 使用 canonical Catalog projection 的 content fingerprint。最终 verificationScope MUST 是 relevant logical checks/scopes 的 lexical ordered、deduplicated minimal union；compatible affected test scopes MUST 在 execution 前 union/dedupe test files。

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

### Requirement: Change Verification 必须持久化 immutable point-in-time authority binding

Core MUST 保持 `verification.md` 为 Change Verification formal authority，并让 completed Apply/revise-apply terminal exact-bind 一个 immutable point-in-time selection/publication identity。E2 checkpoint 前，E2 自身 MAY 继续使用 pre-E2 runner 已存在的 per-Run selection/evidence sidecar 物理协议，但 E2 MUST NOT 新增 sidecar file type、selection/evidence schema generation、renderer generation 或 Catalog generation；current selection MUST 来自 current source Catalog，point-in-time truth MUST 由 persisted selection/evidence bytes、content/internal fingerprints、terminal/result binding 与 `verification.md` publication fingerprint 固定。Historical E1 sidecars MUST 保持 immutable + bounded legacy-readable，并且 MUST NOT 因 future current Catalog/renderer 改变而 stale。recognized E2 checkpoint 后，或 fresh/downstream repository 不存在 Flowkit pre-E2 migration lineage时，prospective writer MUST 将 minimal selection/publication binding 持久化在 producing Run 的 `result.json` terminal binding 中，不得再生成 entry/selection/evidence per-Run sidecar。Author terminal logical result MUST NOT 提供最终 path、change kind、content fingerprint、verification scope 或 raw evidence。

#### Scenario: terminal result 尝试注入 post-action facts

- **WHEN** Author terminal logical result 携带 candidate manifest、最终 path、change kind、content fingerprint、verification scope 或 raw verification evidence
- **THEN** closed-schema admission MUST 拒绝该 result
- **AND** MUST NOT 合并或持久化这些 caller facts

#### Scenario: current record 与 Markdown 不一致

- **WHEN** 唯一 current applicable producer 的 persisted point-in-time binding 与 current canonical `verification.md` bytes 不匹配
- **THEN** Verification projection MUST fail closed
- **AND** MUST NOT 把 Markdown 单独视为满足 Change Verification

#### Scenario: Markdown present 但 record absent

- **WHEN** Run pending 且只有 deterministic `verification.md` publication 可见
- **THEN** exact recovery MUST 从 persisted context + current candidate 重算 selection/checks/publication
- **AND** matching publication MAY 继续完成 pending binding，mismatch MUST fail closed
- **AND** Markdown 单独 MUST NOT 满足 Verification 或允许 terminal completed

#### Scenario: record present 但 Run pending

- **WHEN** pre-E2 current runner 已发布 immutable selection/evidence binding 与 matching Markdown，但 producing Run 仍 pending
- **THEN** equivalent exact replay MUST 校验 persisted binding 后按既有 terminal CAS-last 语义继续
- **AND** MUST NOT 因此为 post-E2 writer保留 sidecar contract

#### Scenario: terminal present

- **WHEN** Apply/revise-apply terminal completed 对 Reader 可见
- **THEN** result MUST exact-bind producing Run 的 point-in-time selection/publication identity；首次 completion preflight MUST 已验证当时 canonical Markdown
- **AND** equivalent replay MUST 返回既有 terminal；conflicting descriptor 或 immutable binding MUST fail closed

#### Scenario: revise-apply 产生 successor selection generation

- **WHEN** Apply terminal 经 review changes-requested 后完成合法 revise-apply，并发布新的 point-in-time selection/publication binding
- **THEN** Formal Reader MUST 将新 revision producer binding 选为唯一 current applicable lineage
- **AND** earlier Apply record/result MUST 保持 immutable historical point-in-time facts
- **AND** MUST NOT 用新 Markdown bytes、future Catalog 或人工 generation number 反向校验 earlier binding

#### Scenario: historical record 可独立重渲染

- **WHEN** integrity check 需要验证 historical E1 selection/publication content
- **THEN** persisted selection/evidence bytes、persisted fingerprints、terminal/result binding 与 point-in-time Markdown fingerprint MUST 足以完成校验
- **AND** latest reader MUST NOT 要求重新运行 historical renderer、重建过去 Markdown 或读取 future mutable canonical path 作为 historical authority
- **AND** historical bytes 已存在的 renderer/schema discriminator MAY 作为 bounded legacy field 被读取，但 MUST NOT 扩张为 future version family

#### Scenario: E2 migration 不新增 sidecar generation

- **WHEN** E2 自身 Apply/revise-apply 在 recognized E2 checkpoint 前执行 generic Change Verification
- **THEN** MUST 使用 current source Catalog 与 current formal Change identity
- **AND** MAY 复用 current runner 已存在的 sidecar physical protocol
- **AND** MUST NOT 引入新的 sidecar schema generation、renderer generation 或 Catalog generation

#### Scenario: checkpoint 后停止 per-Run verification sidecar writer

- **WHEN** recognized E2 Change Checkpoint 已存在并创建后续 Standard Run，或 fresh/downstream repository 使用 current implementation 创建 Standard Run
- **THEN** new writer MUST 将 minimal selection/publication binding 写入 terminal `result.json`
- **AND** MUST NOT 生成 `entry-workspace.json`、`verification-selection.json` 或 `verification-evidence.json`

#### Scenario: future Catalog 改变不反向使历史 stale

- **WHEN** current source Catalog 在 E2 checkpoint 后或后续 Change 中合法改变
- **THEN** historical terminal validation MUST 只使用其 persisted point-in-time content identity
- **AND** MUST NOT 要求 historical Catalog fingerprint 等于 future current Catalog fingerprint

## RENAMED Requirements

- FROM: `### Requirement: Core 必须发布 immutable verification-selection record`
- TO: `### Requirement: Change Verification 必须持久化 immutable point-in-time authority binding`
