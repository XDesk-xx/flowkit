# flowkit-delivery-change-creation-and-owner-input Specification

## Purpose

为 Flowkit 提供最小、可恢复且 fail-closed 的 Delivery/Change write-side，使 Owner 独立输入能够形成正式 provenance，并在不引入第二编排器、Decision DB 或自动 Git/Delivery 行为的前提下安全创建和激活 Change。
## Requirements
### Requirement: Delivery creation 必须由显式 Owner 输入创建最小 active Manifest

Flowkit MUST 提供 Delivery creation operation。创建输入 MUST 至少包含 Delivery id、goal、scope、branch、planned Changes、acceptance、architectureImpact、Full Test coverage plan、**typed per-Delivery Full Test execution contract** 与 Owner `sourceRef`。Execution contract MUST carry logical command identity、bounded `launcherMode=direct|npm-shim`、scope、timeout、result authority/protocol and expected terminal outcome；Writer MUST 校验后持久化调用方/Delivery contract supplied values，MUST NOT hard-code 当前 Flowkit repository 的 `npm run verify:full` 或 `120000` 作为所有 future Delivery 的 universal values。新 Delivery 主状态 MUST 直接为 `active`；创建前 MUST fail-closed 验证 repository 中不存在其它 active Delivery、Delivery id 唯一、planned Change key/id 唯一且 dependency graph 合法。创建 MUST 同时在新 Manifest 中记录对应 `create-delivery` Owner decision provenance。

Delivery creation MUST NOT 创建 Git branch、Commit、Push、PR、Run、Full Test 或 Archify asset。

#### Scenario: 成功创建 Delivery
- **WHEN** repository 中不存在 active Delivery
- **AND** create input、caller-supplied Full Test execution contract 与 planned Change graph 全部有效
- **AND** Owner 提供非空 `sourceRef`
- **THEN** Flowkit MUST 原子创建一个 `delivery.state=active` 的 Delivery Manifest
- **AND** Manifest MUST 原样语义持久化该 Delivery 自己的 Full Test execution contract
- **AND** Manifest MUST 包含 `create-delivery` Owner decision record
- **AND** MUST NOT 创建 Git boundary、Run、Full Test 或 Archify asset

#### Scenario: 已有 active Delivery 时拒绝创建
- **WHEN** repository 中已经存在 active Delivery
- **THEN** Delivery creation MUST fail closed
- **AND** MUST NOT 写入第二个 active Delivery Manifest

#### Scenario: 不同 Delivery 可以持久化不同 execution contract
- **WHEN** 两个独立 disposable repository 分别创建合法 Delivery
- **AND** 两次 create input 提供不同的 Full Test command/args/launcherMode/timeout
- **THEN** 各自 Manifest MUST 持久化其调用方提供的值
- **AND** Flowkit MUST NOT 将任一 current-repository instance 改写成 repository-global default

### Requirement: Change creation 必须只追加 planned Change 并验证 canonical dependency

Flowkit MUST 提供 Change creation operation。输入 MUST 至少包含 `key`、`id`、`goal`、`dependsOn`、`outputs`、`architectureImpact`、`required` 与 Owner `sourceRef`。`architectureImpact` MUST 作为 Change-level canonical persisted fact 与其它 Change fields 一起写入 Delivery Manifest；Delivery creation 的 initial planned Changes 与后续 `createChange` MUST 使用同一 persisted/read 语义，Reader/checkout/resume 后不得丢失。新 Change MUST 以 `state=planned` 加入唯一 active Delivery，且 MUST 在同一次 Manifest atomic publish 中记录 `create-change` Owner decision provenance。

`dependsOn` MUST 使用被依赖 Change 的 canonical `Change.id`；unknown、self、duplicate dependency 与 Delivery creation graph cycle MUST 被确定性拒绝。Change creation MUST NOT 自动创建 OpenSpec Change root、Run、Git boundary 或执行 activation。

#### Scenario: 成功追加 planned Change
- **WHEN** active Delivery 存在
- **AND** key/id 唯一且所有 dependency id 合法
- **AND** Owner 提供非空 `sourceRef`
- **THEN** Flowkit MUST 原子追加含原始 `architectureImpact` 的 `state=planned` Change 与 `create-change` Owner record
- **AND** checkout/resume 后 Reader MUST 恢复同一 `architectureImpact`
- **AND** MUST NOT 自动创建 OpenSpec Change root 或 Run

#### Scenario: unknown dependency 被拒绝
- **WHEN** create Change 的 `dependsOn` 包含当前 Delivery 中不存在的 Change.id
- **THEN** operation MUST fail closed
- **AND** Manifest MUST 保持不变

### Requirement: pre-A1 architectureImpact missing compatibility 必须 exact-bounded 且 non-inferential

A1 MUST 支持 Base `448fa042de86d07e893bcc51da528f93eb7ced3a` 已存在三份 source-controlled Delivery Manifest 的 exact `(deliveryId, Change.id)` legacy identity set。仅这些 pre-A1 Change 在缺少 Change-level `architectureImpact` 时 MAY 被 Reader 接纳；接纳结果 MUST 明确表达 unknown/legacy-missing，MUST NOT 伪造 `true` 或 `false`，MUST NOT 静默 backfill。

A1 `createDelivery` / `createChange` 创建的所有新 Change MUST 要求并持久化 boolean `architectureImpact`。任何不在 exact legacy set 的 Change 缺少或携带畸形值 MUST fail closed。Compatibility MUST NOT 按日期、字段缺失、Change state、key 命名或其它 fuzzy shape 自动扩张。

#### Scenario: Base + A1 Apply 不 self-brick
- **WHEN** Reader 加载 Base 中 pre-A1 exact legacy Change 且该 item 缺少 `architectureImpact`
- **THEN** Reader MUST 能继续形成不伪造 boolean 的 formal snapshot
- **AND** architectureImpact MUST 表达为 explicit unknown/legacy-missing

#### Scenario: future malformed Change 不能借 legacy seam 通过
- **WHEN** A1 write-side 启用后出现一个不在 exact legacy identity set 的 Change
- **AND** 该 Change 缺少 `architectureImpact`
- **THEN** Reader/validation MUST fail closed
- **AND** MUST NOT 把它视为 pre-A1 legacy

### Requirement: Owner decision provenance 必须是 Manifest 内最小 typed authority record

Active Delivery Manifest MUST 支持顶层 `ownerDecisions` records。每条 record MUST 只保存：确定性 `ref`、typed `decision`、`deliveryId`、可选 canonical `changeId` 与 opaque `sourceRef`。`ref` MUST 从 canonical record tuple 的内容 hash 派生，不得依赖随机值或当前时间。A1 MUST NOT 保存聊天正文、provider session、完整 approval transcript，也 MUST NOT 建立 Decision DB、Approval Registry、workflow inbox 或 event ledger。

A1 支持的 record decision vocabulary MUST 至少覆盖 `create-delivery`、`create-change` 与 current Policy 已存在的 `activate-change`、`authorize-apply`、`authorize-archive`、`authorize-checkpoint`、`authorize-full-test`、`authorize-delivery-finalize`。Change-scoped decision MUST 携带 canonical `changeId`；Delivery-scoped Full Test/Finalize decision MUST NOT 伪造 Change target。

#### Scenario: 完全相同 Owner record 重试
- **WHEN** 相同 canonical decision tuple 已存在
- **THEN** 再次记录 MUST 作为 idempotent success 处理
- **AND** MUST NOT 产生第二条语义重复 record

#### Scenario: malformed 或 unknown Owner record
- **WHEN** decision 未知、deliveryId 不匹配、required changeId 缺失、target Change 不存在或 sourceRef 为空
- **THEN** write operation MUST fail closed
- **AND** Reader MUST NOT 把该记录投影为有效 authorization

### Requirement: Owner provenance 只保证 structural non-inference

Flowkit MUST 只把显式 write operation 收到的 Owner input 记录为 Owner authority provenance。A1 MUST NOT 从 Run `ownerAuthorization`、Proposal/Design prose、Reviewer finding、聊天摘要、Git commit message 或其它 Agent 转述推断新的 Owner authority。`sourceRef` 是 opaque provenance reference；A1 MUST NOT 声称验证其外部身份真实性或提供 cryptographic authentication。

#### Scenario: Run ownerAuthorization 不升级为 Owner fact
- **WHEN** 历史或 current Run context 含 `ownerAuthorization: explicit`
- **THEN** Reader MUST NOT 因该字符串创建 Owner decision record 或 authorization fact

### Requirement: Authorization-only Owner record 必须匹配 current Policy gate

`flowkit owner record` 对 `authorize-apply`、`authorize-archive`、`authorize-checkpoint`、`authorize-full-test`、`authorize-delivery-finalize` 的持久化，MUST 在任何 Manifest mutation 前重新读取 current formal facts 并执行 current Policy。只有当 current Policy 正在请求完全相同的 Owner decision，且 canonical target 与 record target 完全一致时，record 才 MAY 被写入；否则 operation MUST fail closed 且 Manifest MUST 保持不变。

对于 exact current Delivery 的 `authorize-full-test`，当 Policy gate 基于 pure readiness projection 请求该 decision 时，write-side MUST 在同一次 atomic Manifest publication 中追加 deterministic Owner record 并把 persisted raw `delivery.fullTestStatus` 从 `not-ready|awaiting-user-decision` 更新为 `authorized`。该 publication 只关闭 authorization gate，MUST NOT 执行 Full Test。其它 authorization-only decision 继续只持久化其既有 bounded authority facts。

A1 MUST NOT 把“未来可能需要该 authorization”当作 admission 条件，也 MUST NOT 建立 generic authority-resolution tracking。create/activate provenance 仍由对应 mutation command 在其自身合法 boundary 内原子记录，不通过 standalone `owner record` 预写。

#### Scenario: 提前 authorize-archive 被拒绝
- **WHEN** current Policy 尚未返回 `owner-decision: authorize-archive` for target Change.id
- **AND** 调用者尝试持久化该 authorize-archive record
- **THEN** operation MUST fail closed
- **AND** Manifest MUST byte-identical 保持不变

#### Scenario: current gate 与 target 完全匹配
- **WHEN** current Policy 正在请求某 authorization-only decision
- **AND** requested decision 与 canonical Delivery/Change target 和本次 record 完全一致
- **THEN** persistence MAY 写入该 deterministic Owner record
- **AND** MUST NOT 自动执行后续 Action、Git boundary 或 Delivery behavior

#### Scenario: authorize-full-test 原子进入 authorized
- **WHEN** current Policy 正在请求 exact current Delivery 的 `authorize-full-test`
- **AND** persisted raw Full Test status 仍为 readiness-compatible `not-ready|awaiting-user-decision`
- **THEN** write-side MUST atomic publish matching Owner record 与 `delivery.fullTestStatus=authorized`
- **AND** MUST NOT执行当前 Delivery 的 Full Test execution contract 或创建 Standard Run

### Requirement: Activation 必须消费 Policy 合法边界与本次 Owner 明确输入

Flowkit MUST 提供 Change activation operation。Activation 前 MUST 重新加载 formal facts，并验证：Delivery active、目标 Change planned、无其它 active Change、dependencies completed、formal conflicts 为空，且 current Policy 的 `activate-change` boundary 包含所选目标。Operation MUST 使用本次显式 Owner `sourceRef` 生成 `activate-change` record；不得由 Agent 自行选择或伪造 Owner authority。

成功 activation MUST 只完成目标 Change `planned → active` 与 minimal OpenSpec metadata initialization；MUST NOT 自动创建 `explore` Run、Commit、Checkpoint、Push、Full Test 或下一 Action。

#### Scenario: 合法 activation
- **WHEN** target Change 满足全部 activation preconditions
- **AND** Policy 的 eligible activation set 包含该 target
- **AND** Owner 提供显式 sourceRef
- **THEN** Flowkit MUST 将该 Change 变为 active 并记录 target-scoped `activate-change` record
- **AND** MUST NOT 自动创建 Explore Run

#### Scenario: dependency 未完成时拒绝 activation
- **WHEN** target Change 任一 dependency id 对应 Change 未 completed
- **THEN** activation MUST fail closed
- **AND** Manifest 与 OpenSpec metadata MUST 不被错误推进为 active lifecycle

### Requirement: Activation partial failure 必须有界且可幂等恢复

Activation MUST 使用 deterministic two-step publish：先确保 `openspec/changes/<change-id>/.openspec.yaml` 为 exact minimal metadata，再以一次 atomic Manifest replace 同时追加 Owner decision 与执行 `planned → active`。如果 Manifest publish 失败，唯一允许残留的 partial state 是 `planned Change + exact preinitialized .openspec.yaml`。Retry MUST 接受并复用 exact metadata；mismatched/non-minimal metadata MUST fail closed。

A1 MUST NOT 为此建立通用 transaction journal、rollback engine 或 event log。

#### Scenario: Manifest publish 失败后的重试
- **WHEN** exact OpenSpec metadata 已成功创建
- **BUT** Manifest atomic publish 失败且 Change 仍 planned
- **THEN** retry MUST 识别 exact metadata 为可复用 partial state
- **AND** MUST NOT 创建第二份 metadata 或要求手工删除后才能重试

#### Scenario: 预存在 metadata 不匹配
- **WHEN** target OpenSpec `.openspec.yaml` 已存在但 bytes/contract 与 A1 expected metadata 不匹配
- **THEN** activation MUST fail closed
- **AND** MUST NOT 将 Manifest 切换为 active

### Requirement: Existing Manifest mutation 必须 preserve unrelated semantics

A1 对现有 Delivery Manifest 的写入 MUST 使用 bounded structured mutation：只允许定位并修改 owned `changes` item/state、`ownerDecisions`、A1 Full Test 的 `delivery.fullTestStatus`、`verification.fullTest.execution`、exceptional current `verification.fullTest.executionBlock` 与 `verification.fullTest.result`；所有其它 top-level/Change/verification fields MUST 原样保留。Duplicate/ambiguous owned key、unsupported owned-section shape、malformed supported YAML subset MUST fail closed；MUST NOT silent repair。最终 publish MUST 使用 atomic replace、LF、无 trailing whitespace、exactly one EOF newline。

#### Scenario: activation 不重写无关 Manifest section
- **WHEN** Manifest 包含 goal、technicalBaseline、scope、architecture、verification、acceptance 等 activation 不拥有的 section
- **AND** activation 成功
- **THEN** 这些 section 的 bytes/语义 MUST 保持不变

#### Scenario: outcome-unknown 只允许发布 current executionBlock

- **WHEN** authorized Full Test 的 Windows timeout 未能证明 owned process tree 已终止
- **THEN** write-side MAY 在保持 raw `fullTestStatus=authorized` 的同时原子发布唯一 current `verification.fullTest.executionBlock`
- **AND** MUST NOT 发布 `failed`、terminal result 或 `resultRef`
- **AND** MUST NOT把该 block 扩张成 attempt history / generic execution ledger

#### Scenario: Full Test publication 只改 bounded owned fields
- **WHEN** authorization 或 Full Test terminal publication 修改 current Delivery Manifest
- **THEN** unrelated scope/architecture/changes/acceptance 与 Full Test coverage intent MUST 保持原语义
- **AND** writer MUST NOT broad reserialize 或格式化整个 Manifest

### Requirement: A1 必须提供 bounded write CLI 且保持 diagnostics read-only

A1 MUST 提供最小 write CLI entry：`flowkit create delivery`、`flowkit create change`、`flowkit owner record`、`flowkit activate`。这些命令 MUST 只做参数/JSON input 解析并调用同一 A1 service/validation contract；不得复制 Policy decision tree。现有 `status`、`next`、`doctor`、`resume-context` MUST 继续 read-only。

G1 才负责完整 Change CLI/runner loop；A1 CLI MUST NOT 自动执行 `while(next)`、自动 Author/Reviewer、自动 Run creation、Commit/Push 或 Delivery behavior。

#### Scenario: diagnostic command 仍不可写
- **WHEN** 执行 `flowkit next` 或其它 diagnostic command
- **THEN** command MUST NOT 创建 Owner record、Change、Run 或执行 activation

#### Scenario: write command 不自动推进后续 Action
- **WHEN** `flowkit activate` 成功
- **THEN** command MUST 返回 activation result
- **AND** MUST NOT 自动开始 `explore`

### Requirement: A1 OpenSpec integration 必须限制为 minimal initializer

A1 activation MUST只创建/验证 target Change minimal `.openspec.yaml` metadata，并 MUST NOT import/vendor OpenSpec runtime，也 MUST NOT在A1实现planningHome、artifactPaths、contextFiles、status/instructions、validation或archive adapter。完整OpenSpec 1.7 thin integration属于 `flowkit-openspec-1-7-thin-integration` capability。

C1 checkpoint之后新创建的 Change MUST在 pre-activation/activation request 中显式提供 `specDeltaMode: required | skip`。该值不需要建立第二个Manifest字段；activation成功后 `.openspec.yaml` 即成为该OpenSpec metadata事实的authority。Activation MUST按该 activation-time declaration写入：

```text
specDeltaMode = required
→ schema: spec-driven
→ created: YYYY-MM-DD

specDeltaMode = skip
→ schema: spec-driven
→ created: YYYY-MM-DD
→ skip_specs: true
```

A1 MUST NOT从goal、outputs、后续Proposal正文或spec文件数量猜测该值，也 MUST NOT在Propose/Revise-Propose期间silent rewrite metadata。若activation因partial retry发现`.openspec.yaml`已经存在，requested `specDeltaMode` MUST与既有metadata语义精确一致，否则fail closed。Activation完成后 `.openspec.yaml` 是当前 OpenSpec metadata authority。

Current C1已经以`schema: spec-driven`激活并被Review/Run semantic binding，C1实现 MUST NOT retroactively silent-migrate该metadata。为保证当前Delivery在C1 checkpoint后继续推进，C1 checkpoint前已经存在的 exact planned D1–G1 identities MAY省略 `specDeltaMode`，并仅在该bounded set中解释为`required`；不得形成未来通用default。

#### Scenario: activation 不调用完整 OpenSpec adapter

- **WHEN** A1激活一个planned Change
- **THEN**只允许依据已持久化的creation/pre-activation contract初始化minimal OpenSpec metadata
- **AND** MUST NOT执行OpenSpec archive、spec sync、validation或artifact path orchestration

#### Scenario: current C1 metadata 不被回写迁移

- **WHEN** C1自身已经以`schema: spec-driven`进入Explore/Review/Propose generation
- **THEN** C1 MUST保持该`.openspec.yaml` generation直到Change archive
- **AND** MUST NOT因新adapter、zero-delta支持或future metadata contract改写current C1 metadata

#### Scenario: future non-zero-delta Change metadata

- **WHEN** C1 checkpoint之后新Change activation显式提供`specDeltaMode=required`
- **THEN** activation metadata MUST包含`schema: spec-driven`与`created`
- **AND** MUST NOT写入`skip_specs: true`

#### Scenario: future zero-delta Change metadata

- **WHEN** C1 checkpoint之后新Change activation显式提供`specDeltaMode=skip`
- **THEN** activation metadata MUST包含`schema: spec-driven`、`created`与`skip_specs: true`
- **AND** Change MUST可以进入OpenSpec 1.7合法zero-delta lifecycle而无需Propose修改metadata

#### Scenario: new Change missing zero-delta declaration 被提前拒绝

- **WHEN** C1 checkpoint之后新Change activation request缺少`specDeltaMode`
- **THEN** pre-activation/activation MUST fail closed
- **AND** MUST NOT等到active/propose后才通过OpenSpec validation暴露不可修复metadata dead-end

#### Scenario: 当前 Delivery 既有 planned Change 使用 bounded compatibility

- **WHEN** Change identity恰为当前Delivery在C1 checkpoint前已经存在的 D1、E1、F1 或 G1
- **AND**activation request未显式提供`specDeltaMode`
- **THEN** A1 MAY仅对该exact bounded set解释为`required`
- **AND** MUST NOT把缺省`false`扩展到C1 checkpoint后新创建的Change

### Requirement: Delivery Manifest writer 必须兼容纯 CRLF working-tree input并 canonical write LF

A1 bounded Delivery Manifest mutation contract MUST接受语义相同的纯 LF或纯 CRLF working-tree bytes。CRLF MUST在document parse/mutation seam内部normalize为同一logical lines；successful mutation MUST统一写canonical LF、无trailing whitespace且exactly one EOF newline。混合/非法 carriage return、tabs、duplicate/ambiguous owned keys与unsupported YAML shape MUST继续fail-closed。

该兼容修复 MUST NOT改变 Owner deterministic ref/idempotency、Change.id dependency、architectureImpact legacy boundary、unknown section preservation或activation two-step semantics；`.gitattributes` MAY作为hygiene但MUST NOT替代runtime compatibility。

#### Scenario: CRLF activate 与 LF语义一致
- **WHEN**合法 Delivery Manifest在Windows working tree为纯CRLF
- **AND** `flowkit activate`满足既有A1 preconditions
- **THEN** activation MUST成功产生与LF input相同的semantic mutation
- **AND** written Manifest MUST为canonical LF

#### Scenario: CRLF owner/create change均可写
- **WHEN**合法CRLF Manifest执行 `owner record` 或 `create change`
- **THEN** operation MUST遵守全部既有A1 authority/validation/idempotency contract
- **AND** successful output MUST为canonical LF

### Requirement: Contract Reset 必须复用 Manifest ownerDecisions 并使用 structured semantics

Flowkit MUST在现有 Delivery Manifest `ownerDecisions` authority store中支持 bounded `decision=contract-reset` record。该 record MUST是 active Change-scoped，并至少包含 deterministic `ref`、`decision`、`deliveryId`、canonical `changeId`、non-empty `scope`、non-empty unique `requiredOutcomes[]` 与 opaque `sourceRef`。

`sourceRef` MUST只作为 provenance locator；Contract Reset 的 scope/required outcome MUST由 structured fields表达，MUST NOT通过 sourceRef命名、Run prose、聊天摘要或 Reviewer interpretation推断。Flowkit MUST NOT为 Contract Reset建立第二 Decision DB、Approval Registry、authority event ledger或 chat transcript store。

#### Scenario: structured Contract Reset admission
- **WHEN** Delivery与 target Change均 active、formal facts无 conflict
- **AND** Owner独立明确输入 target scope、requiredOutcomes与 sourceRef
- **THEN** Flowkit MAY把 bounded `contract-reset` record追加到 existing `ownerDecisions`
- **AND** MUST NOT自动创建 Run、修改 Proposal、推进 lifecycle或执行下一 Action

#### Scenario: sourceRef 不能替代语义字段
- **WHEN** caller只提供一个名称暗示 required outcome 的 sourceRef
- **BUT**没有 structured scope/requiredOutcomes
- **THEN** Contract Reset admission MUST fail closed

### Requirement: Contract Reset ref 必须 deterministic、idempotent 且限定 current scope

`contract-reset` ref MUST从 normalized canonical tuple派生：`decision + deliveryId + changeId + scope + sorted(unique(requiredOutcomes)) + sourceRef`。完全相同 normalized tuple重试 MUST返回同一 ref且不得追加第二条语义重复 record。

对于同一 `(deliveryId, changeId, scope)`，Manifest append order中的 latest valid Contract Reset MUST是 current applicable reset；更早 record只保留历史 provenance，不再作为 current package semantic fact。该规则 MUST只服务 bounded active Change Contract Reset，不得扩展成 generic generation-management framework。

#### Scenario: 同 scope 新 Reset supersede current projection
- **WHEN**同一 active Change/scope 已有一个 valid Contract Reset
- **AND** Owner随后明确记录新的 structured Contract Reset
- **THEN**两条 records MAY都保留在 Manifest历史中
- **AND** Reader/current Action handoff MUST只把 latest valid record作为该 scope current fact

#### Scenario: 相同 Reset 重试幂等
- **WHEN** normalized decision tuple完全相同
- **THEN** write MUST返回同一 owner ref
- **AND** Manifest record数量 MUST不增加

### Requirement: Contract Reset write-side 必须保持 Owner authority non-inference

Standalone Contract Reset admission MUST重新读取 current formal facts并确认 Delivery active、target Change active、target identity exact、formal conflicts为空。它 MUST消费本次显式 Owner structured input，但 MUST NOT要求把 Contract Reset伪装成 `authorize-*` Policy gate，也 MUST NOT从 Agent prose、Run context或旧 sourceRef自动生成新的 Reset。

#### Scenario: Agent 不能从 Review finding 自动写 Reset
- **WHEN** Reviewer finding建议 Owner改变 contract
- **BUT** Owner没有独立明确提交 structured Contract Reset input
- **THEN** A1 write-side MUST NOT创建 `contract-reset` record

### Requirement: Contract Reset 只改变 current contract identity，不重写 completed history

新的 current `contract-reset` MUST supersede同 scope更早 Reset的 current projection，但 MUST NOT修改、删除或反向 invalidate 已完成 Run/Review Result。其 lifecycle影响由 Reader/Policy基于 current Reset identity与 Run prepared identity确定，而不是通过写入 generation/supersession event。

#### Scenario: Reset 保留旧 completed provenance
- **WHEN** Owner在一个已有 completed producer/review的 active Change上记录新的 Contract Reset
- **THEN** Manifest MUST追加/选择新的 current structured Owner fact
- **AND** earlier Run/result bytes与terminal status MUST保持不变
- **AND** Flowkit MUST NOT创建 generic generation event record来“关闭”旧 Run

### Requirement: Owner corrective Change 必须复用 existing create change surface 并绑定 exact failed Finding occurrence

B1 MUST 复用现有 `flowkit create change --input <json> --source-ref <owner-ref>` Owner write-side，不新增 `authorize-corrective-change` decision、corrective-specific Formal Action/Run 或自动创建机制。

普通 Change create input 保持现有字段；新增可选 closed `corrective` object，精确包含 `findingId`、`authorizationRef` 与 `sourceResultRef`。当 current Policy 为 `blocked: full-test-failed` 时，create input MUST 携带 `corrective`，其三字段 MUST exact match current derived Full-Test Finding occurrence，且 new Change MUST `required=true`。当 current Delivery 不在 `full-test-failed` boundary 时，携带 `corrective` MUST fail closed，避免把普通 Change伪装成 corrective provenance。

`corrective` input MUST NOT接受 `summary`、severity、resolution或其它 Finding projection字段。Writer MUST 从 verified current result与 current authorization fact派生这些 persisted fields。成功 corrective create MUST 继续产生 ordinary `decision=create-change` Owner record；Finding historical projection只引用该 `ownerDecisionRef`、new `changeId`、current `authorizationRef` 与 Verification `sourceResultRef`，Owner record仍是 corrective decision authority。Operation MUST NOT自动 activate new Change、自动 retry Full Test、重开 historical Change、执行 Git boundary或创建 Run。

#### Scenario: Owner 用现有 create change 创建 bounded corrective Change
- **WHEN** current Policy 为 `blocked: full-test-failed`
- **AND** Owner 提供合法 ordinary required Change input、non-empty sourceRef 与 exact current `corrective.findingId/authorizationRef/sourceResultRef`
- **THEN** Flowkit MUST 原子创建该 `state=planned` Change并记录 ordinary `create-change` Owner record
- **AND** MUST 同步完成 B1 occurrence-aware failure consumption/reset contract
- **AND** MUST NOT自动 activate 或执行新 Change

#### Scenario: failed boundary 缺少 corrective binding 拒绝普通 create
- **WHEN** current Policy 为 `blocked: full-test-failed`
- **AND** Owner 调用 `create change` 但 input 缺少 `corrective`
- **THEN** operation MUST fail closed
- **AND** MUST NOT创建 Change、Owner record或修改 Full Test facts

#### Scenario: stale 或伪造 corrective occurrence binding 拒绝
- **WHEN** supplied `corrective.findingId`、`authorizationRef` 或 `sourceResultRef` 任一不等于 current derived Finding occurrence
- **THEN** operation MUST fail closed
- **AND** Manifest MUST保持不变

#### Scenario: caller 不能注入 Finding summary
- **WHEN** corrective create input试图携带 `summary` 或其它未冻结 projection字段
- **THEN** closed input schema MUST reject该 input
- **AND** any persisted historical summary MUST only be derived from verified source result

#### Scenario: 非 failed boundary 不接受 corrective marker
- **WHEN** current Delivery 不在 `full-test-failed` boundary
- **AND** create input 携带 `corrective`
- **THEN** operation MUST fail closed
- **AND** ordinary create semantics MUST 继续要求无 corrective marker
