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

Core MUST 使用 source-controlled、closed、deterministic Verification Catalog 将每个 actual path 唯一映射到 seed module，按 reverse dependency consumer direction 计算 transitive closure，并与 formal current Change 的 structured OpenSpec delta capability ids/refs 做双向 relation validation。Catalog MUST 只拥有 module ownership、dependency relation、capability relation 与 stable logical check ids；current source bytes 定义 current Catalog，physical command、launcher、current Change literal 或人工 generation number MUST NOT 成为 selection identity。需要 point-in-time Catalog identity 时 MUST 使用 canonical Catalog projection 的 content fingerprint。最终 verificationScope MUST 是 relevant logical checks/scopes 的 lexical ordered、deduplicated minimal union；compatible affected test scopes MUST 在 execution 前 union/dedupe test files。

When a selected logical check owns a real external-tool integration target, physical execution MUST include that target rather than silently omitting or skipping it. The executor MUST propagate the resolved invocation identity from the current operation's existing external-tool adapter/resolver into that test process when the target requires it; this propagation is execution context, not a new selection identity or second tool authority. Verification-tooling paths that change the public project verification executor MUST be exact-owned by the Catalog and their direct verification-plan regression MUST be present in the selected physical target set.

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

#### Scenario: current Change archive-sync compatibility 使用真实 disposable OpenSpec
- **WHEN** formal current Change 的 matched verification selection 已包含 OpenSpec delta capability
- **THEN** selection MUST 包含 stable logical check `openspec-current-change-archive-sync`
- **AND** executor MUST 在 disposable repository 中使用当前 operation 已解析的同一个 OpenSpec executable identity 对 exact current Change 执行真实 `archive --yes` mutation
- **AND** 只有 structured archive success 才能使该 check PASS；`openspec validate --strict` PASS、synthetic fixture PASS 或 test-local merge simulation MUST NOT 代替该证据
- **AND** disposable preflight MUST NOT mutation canonical candidate，也 MUST NOT 在 Flowkit 内复制 OpenSpec Requirement / Scenario merge engine

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
- **THEN** the Verification executor MUST propagate the current operation's actually resolved OpenSpec invocation identity into the Node test environment
- **AND** Windows `.ps1` / `.cmd` fallback MUST therefore propagate the executable that will actually be invoked
- **AND** MUST NOT discover or persist a second OpenSpec executable authority

#### Scenario: failing real OpenSpec target fails the selected logical check
- **WHEN** the expected real OpenSpec integration physical target is replaced by a failing sentinel in a disposable verification fixture
- **THEN** `tests-openspec-runtime` MUST fail
- **AND** passing sibling unit targets MUST NOT satisfy the selected check

#### Scenario: changed public verification plan is physically executed
- **WHEN** actualChangeSet includes the public project verification executor or its direct verification-plan regression
- **THEN** both paths MUST exact-one map through the source-controlled Verification Catalog to an applicable logical check
- **AND** the selected physical execution MUST include `tests/unit/verification/verification-plan.test.ts`
- **AND** a failing sentinel in that target MUST make the same formal selected check fail

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

### Requirement: failed Change Verification 必须支持 exact-candidate re-verification 且保留 point-in-time history

当唯一 current completed Apply/revise-apply 已发布 formal Change Verification=`failed`，且 candidate bytes 不需要 Author mutation 时，Flowkit MUST提供显式、manual-triggered re-verification behavior，使 Verification authority能够针对 **同一 exact Apply target** 重新执行相同 deterministic selection。该行为 MUST NOT是 Formal Action、Run、Revision 或 Policy auto-continue，也 MUST NOT修改 producing Apply terminal result。

Re-verification admission MUST exact-check producing Apply persisted compact entry/mutation declaration、current post-action candidate identity、current OpenSpec structured projection 与原 selection fingerprint。Core MAY忽略的仅是 validated current `verification.md` 与其 fingerprint-addressed `verification-history/**` Core-owned authority bytes；任何其他 path drift MUST fail closed。Selection MUST从同一 exact candidate/current source Catalog 重建并与 origin selection fingerprint完全一致；不得用 retry 机会扩大/缩小 checks。

每次 retry 完整执行 selected checks 后，Core MUST先以 content fingerprint create-if-absent 保存被 supersede 的 current `verification.md` exact bytes，再 atomic publish新的 current `verification.md`。新 publication MUST保存 origin Apply、origin terminal verification fingerprint、immediate predecessor ref/fingerprint、post-action candidate fingerprint 与 selection fingerprint。Repeated retry MUST形成可验证 chain，并保留每份 failed/pass predecessor point-in-time publication。Raw stdout/log MUST继续属于执行工具，不得复制成 history platform。

#### Scenario: failed Verification 在 exact candidate 不变时可以重证
- **WHEN** current completed Apply/revise-apply 的 formal Verification 为 `failed`
- **AND** current candidate identity 与其 post-action identity完全相同
- **AND** reconstructed deterministic selection fingerprint与 origin selection完全相同
- **THEN** explicit re-verification MAY执行相同 selected checks并发布新的 formal Verification authority
- **AND** producing Apply terminal result MUST保持 immutable
- **AND** MUST NOT创建 Formal Action/Run或 no-op revise

#### Scenario: exact candidate drift 禁止 re-verification
- **WHEN**除 current Verification/history authority bytes外任一 candidate path state/content与 producing Apply post-action identity不同
- **THEN** re-verification MUST fail closed before selected checks publication
- **AND** MUST要求通过正常 Author mutation lifecycle形成新的 candidate，而不是把 drift 解释成 Verification retry

#### Scenario: retry 不得改变 logical selection
- **WHEN** re-verification 对 exact candidate重建 current deterministic selection
- **AND**其 selection fingerprint 与 origin Apply publication不同
- **THEN** retry MUST fail closed
- **AND** MUST NOT以 future/current Catalog变化重写 origin selection truth

#### Scenario: superseded failed publication exact bytes 必须保留
- **WHEN** re-verification 即将 supersede current failed `verification.md`
- **THEN** Core MUST先按 current publication SHA-256 保存 exact immutable history bytes
- **AND** history ref MUST由 validated Verification authority directory + fingerprint派生
- **AND** existing same-fingerprint history bytes不一致时 MUST fail closed

#### Scenario: retry PASS 后 existing Policy 可进入 review-apply
- **WHEN** explicit re-verification 完成并发布 current formal status `passed`
- **AND** Reader 已验证 publication chain、origin Apply、candidate 与 selection identity
- **THEN** `FormalFactSnapshot.changeVerificationStatus` MUST投影 `passed`
- **AND** existing verification gate/Policy MAY按既有规则解析 `review-apply`
- **AND** retry behavior本身 MUST NOT直接创建 Reviewer Run或决定 next

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
