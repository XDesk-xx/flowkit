## MODIFIED Requirements

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

## ADDED Requirements

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
