# flowkit-change-verification-selection Specification

## Purpose
定义 Core 如何从正式 Git 与 workspace facts 派生 actualChangeSet，并经确定性的模块、依赖和 OpenSpec capability 关系生成可复验的最小 Change Verification。
## Requirements
### Requirement: Core 必须派生 canonical actualChangeSet

Core MUST 以 persisted canonical Git base → post-action workspace state 派生最终 candidate 的 normalized repository-relative actualChangeSet。Core MUST 另外以 persisted entry workspace state → post-action state 派生 observedActionMutations，并验证每个 observed path 都被 persisted declaration 覆盖。每个 actualChangeSet entry MUST 使用 `create`、`modify` 或 `delete` primitive，并包含 path kind；对 post-action 仍存在的 file MUST 包含最终 content fingerprint。第一版 MUST NOT 将 heuristic rename detection 作为 authoritative primitive。

#### Scenario: path 在 Action 后发生变化

- **WHEN** Core 观察到 canonical base 与 post-action state 中某个 repository path 的存在性、kind 或 bytes 发生变化
- **THEN** Core MUST 依据 base 与 post-action facts 将它分类为 `create`、`modify` 或 `delete`
- **AND** actualChangeSet MUST 使用 canonical path ordering

#### Scenario: entry 已包含合法 candidate bytes

- **WHEN** 某个 path 在 canonical base 与 entry state 之间已变化，且在 entry 与 post-action state 之间保持不变
- **THEN** actualChangeSet MUST 仍包含该 base → post-action change
- **AND** observedActionMutations MUST NOT 将它分类为本次 Action mutation 或 self-drift

#### Scenario: Action 修改 declaration 外 path

- **WHEN** entry → post-action observation 包含 persisted declaration 未覆盖且非 reserved Core-owned 的 path
- **THEN** post-action admission MUST fail closed
- **AND** MUST NOT 通过扩大 declaration 或回填 context 接受该 mutation

#### Scenario: rename-like bytes 被观察到

- **WHEN** 一个 path 被删除且另一个 path 以相同 bytes 创建
- **THEN** 第一版 actualChangeSet MUST 分别记录 `delete` 与 `create`
- **AND** MUST NOT 推断 authoritative rename

### Requirement: verificationScope 必须由 closed module 与 capability authority 选择

Core MUST 使用 source-controlled closed module map 将每个 actual path 唯一映射到 seed module，按 reverse dependency consumer direction 计算 transitive closure，并与当前 Change structured OpenSpec delta capability ids/refs 做双向 relation validation。最终 verificationScope MUST 是 relevant modules 固定 scopes 的 lexical ordered、deduplicated minimal union。

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
- **AND** record MUST 保存 predicate authority 与证明 outcome

### Requirement: Core 必须发布 immutable verification-selection record

Core MUST 发布与 Run context 分离的 immutable per-Run verification-selection record，保存 canonical base、actualChangeSet、module-map ref/fingerprint、seed modules、reverse closure、delta capability refs/ids、relation outcome、ordered scopes、renderer version 与 Markdown point-in-time fingerprint。canonical `verification.md` 与 record MUST 来自同一 stable selection payload；writer MUST 先 atomic publish deterministic Markdown，再 atomic create immutable record 作为 post-action commit marker，最后 terminal CAS。Author terminal logical result MUST NOT 提供最终 path、change kind、content fingerprint 或 verification scope。

#### Scenario: terminal result 尝试注入 post-action facts

- **WHEN** Author terminal logical result 携带 candidate manifest、最终 path、change kind、content fingerprint 或 verification scope
- **THEN** closed-schema admission MUST 拒绝该 result
- **AND** MUST NOT 合并或持久化这些 caller facts

#### Scenario: current record 与 Markdown 不一致

- **WHEN** 唯一 current applicable producer 的 persisted verification-selection record 与 current `verification.md` binding 不匹配
- **THEN** Verification projection MUST fail closed
- **AND** MUST NOT 把 Markdown 单独视为满足 Change Verification

#### Scenario: Markdown present 但 record absent

- **WHEN** Run pending 且只有 deterministic `verification.md` publication 可见
- **THEN** exact recovery MUST 重算并校验 Markdown bytes
- **AND** matching 时 MAY 创建 immutable record，mismatch 时 MUST fail closed
- **AND** Markdown 单独 MUST NOT 满足 Verification 或允许 terminal completed

#### Scenario: record present 但 Run pending

- **WHEN** immutable record 与 Markdown binding 有效但 terminal result 尚未发布
- **THEN** equivalent exact replay MUST 只执行 terminal CAS-last
- **AND** MUST NOT 修改或重发 record / Markdown

#### Scenario: terminal present

- **WHEN** Apply/revise-apply terminal completed 对 Reader 可见
- **THEN** result MUST exact-bind producing Run 的 immutable record；首次 completion preflight MUST 已验证当时 canonical Markdown
- **AND** equivalent replay MUST 返回既有 terminal；conflicting descriptor 或 immutable binding MUST fail closed

#### Scenario: revise-apply 产生 successor selection generation

- **WHEN** Apply terminal 经 review changes-requested 后完成合法 revise-apply，并发布新 record 与 `verification.md`
- **THEN** Formal Reader MUST 将新 revision producer record 选为唯一 current applicable lineage
- **AND** earlier Apply record/result MUST 保持 immutable historical point-in-time facts
- **AND** MUST NOT 用新 Markdown bytes 反向校验 earlier fingerprint

#### Scenario: historical record 可独立重渲染

- **WHEN** integrity check 需要验证 historical selection content
- **THEN** Core MAY 使用 immutable per-Run stable payload + renderer version 重渲染并比较 stored point-in-time fingerprint
- **AND** MUST NOT 读取 future mutable canonical path 作为 historical content authority
