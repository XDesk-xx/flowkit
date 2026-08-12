# flowkit-lean-run-and-action-package Specification

## Purpose

定义 Flowkit 当前 Standard Change Action 的 Lean Run preparation/resume/new-instance、logical Action Package 与 logical Action Result admission contract，使现有 deterministic Policy、Run persistence 与 ResultRef authority 被组合成唯一安全 execution surface。
## Requirements
### Requirement: Standard Change Action 必须使用固定且完整的 ActionDefinition catalog

B1 MUST定义且只定义十个 Standard Change Action definitions。每个 definition MUST固定 `action / role / goalClass / mutationClass / outputClass / terminalContract`，Apply MUST NOT临时决定这些值。Normative mapping：

| Action | Role | goalClass | mutationClass | outputClass | terminalContract |
|---|---|---|---|---|---|
| `explore` | author | `investigate-change` | `explore-planning-only` | `current-explore-artifact-set` | completed executionStatus+summary；Core派生current explore ref |
| `review-explore` | reviewer | `judge-explore` | `reviewer-result-only` | `review-verdict-findings` | completed必须有verdict并exact-bind reviewed Run |
| `revise-explore` | author | `close-explore-author-findings` | `explore-planning-revision-only` | `current-explore-artifact-set` | completed派生current explore ref并绑定source review |
| `propose` | author | `freeze-change-contract` | `proposal-bundle-only` | `current-proposal-bundle-set` | completed派生proposal/design/tasks/all delta specs完整ref set |
| `review-propose` | reviewer | `judge-proposal` | `reviewer-result-only` | `review-verdict-findings` | completed必须有verdict并exact-bind reviewed Run |
| `revise-propose` | author | `close-proposal-author-findings` | `proposal-bundle-revision-only` | `current-proposal-bundle-set` | completed派生完整Proposal bundle并绑定source review |
| `apply` | author | `implement-approved-contract` | `approved-implementation-and-verification` | `implementation-candidate-and-authority-files` | completed保留approved-review entry binding；caller不得声明ResultRef subset |
| `review-apply` | reviewer | `judge-implementation-and-verification` | `reviewer-result-only` | `review-verdict-findings-plus-verification-ref` | completed必须有verdict并Core派生verificationSummaryRef |
| `revise-apply` | author | `close-apply-author-findings` | `implementation-and-verification-revision` | `revised-implementation-candidate` | completed绑定source review；caller不得声明ResultRef |
| `archive` | author | `close-change` | `openspec-archive-and-change-completion` | `archive-operation-and-completed-state` | completed记录archive/Change completion；Checkpoint不成为Action output |

Reviewer definitions MUST NOT允许修改 reviewed Author target。`apply/revise-apply` 的具体文件集合仍由 approved contract决定，catalog只冻结它们的 mutation/output class。Catalog MUST是compile-time/static contract，MUST NOT支持runtime registry、router或dynamic discovery。Owner MUST NOT因其authority创建Standard Run。Failed/cancelled terminal继续遵守既有minimal failure/cancellation contract。

#### Scenario: 错误 Action→Role 被拒绝
- **WHEN** caller 尝试以 `role=reviewer` 准备 `action=explore`
- **THEN** B1 preparation/persistence MUST fail closed
- **AND** MUST NOT publish pending Run

#### Scenario: Apply 不得发明 Proposal 未冻结的 ActionDefinition
- **WHEN** implementation构造任一 Standard Action definition
- **THEN**其 role/goalClass/mutationClass/outputClass/terminalContract MUST与上述 normative mapping一致
- **AND** MUST NOT从 runtime configuration/provider input 改写这些字段

### Requirement: B1 必须提供 bounded dual-entry 的唯一高层 Run preparation surface

B1 execution preparation MUST只暴露两个 Policy-owned intent：normal `next` 与 explicit unified `review`。Caller MUST NOT直接指定任意 concrete Standard Action、NNN或Role。

对于 `entry=next`，service MUST读取 fresh FormalFactSnapshot并消费shared `next(snapshot)`；只有结果为十个 Standard Change Actions之一时才能进入pending resume/new Run preparation。若 `next()`为 owner-decision、blocked、done或Delivery behavior，MUST NOT创建Run。

对于 `entry=review`，service MUST读取fresh snapshot并调用shared `resolveReview(snapshot)`/`canRun(review-S)`等价Policy admission，由Policy解析具体same-stage `review-S`。该入口 MUST保留Q1 direct re-review：matching `changes-requested`包含non-author blocker时，`next()` MAY/SHALL继续blocked，但合法explicit review仍能创建新的Reviewer generation。Service MUST NOT自动把blocked `next()`转成review，MUST NOT复制blockingAuthority/Stage legality，也 MUST NOT允许caller指定其它concrete Action。

两种入口由Policy解析出Action后 MUST共享同一 continuation path：匹配pending则resume；否则Delivery-wide allocator产生下一NNN并创建pending Run。

#### Scenario: normal next 创建 pending Run
- **WHEN** `entry=next` 且shared `next()`返回一个Standard Change Action
- **AND** 当前不存在可恢复pending Run
- **THEN** preparation MUST通过Delivery-wide allocator产生下一NNN
- **AND** MUST创建对应fixed ActionDefinition的pending Run

#### Scenario: non-author blocker 下 explicit direct re-review 仍可进入
- **WHEN** latest matching Review为`changes-requested`且包含owner/verification/external blocker
- **AND** shared `next()`故意保持blocked authority boundary
- **AND** caller显式请求统一`entry=review`
- **THEN** preparation MUST通过shared `resolveReview/canRun`解析same-stage `review-S`
- **AND** no matching pending review时 MUST创建new Reviewer generation/NNN
- **AND** MUST NOT修改`next()`结果或自动触发review

#### Scenario: caller 指定任意 concrete Action 不构成 authority
- **WHEN** adapter/CLI试图直接请求`action=apply`或任意具体`review-S`
- **THEN**高层execution boundary MUST拒绝该bypass
- **AND** caller只能使用bounded `next` / unified `review` intent

### Requirement: same pending Run continuation 的 semantic identity 必须覆盖全部 package semantic authority identity

Pending Run本身 MUST是execution instance。B1 MUST持久化Core-derived compact semantic input fingerprint。Canonical descriptor MUST至少包含 delivery/change identity、resolved Action、完整 ActionDefinition identity/version、全部 `contractRefs` 的 exact `{ref, kind, versionFingerprint}`、handoff refs、适用 Review/Verification authority identity或无versioned ref时的规范化authority scalar、适用Owner authorization refs。

Descriptor MUST使用stable ordering/canonical serialization。任一 logical Action Package字段，只要其变化会改变 allowed mutation、required result、contract generation或execution prerequisite，且不能完全由已经纳入的versioned authority ref确定，就 MUST把该字段或其主要authority identity纳入descriptor。反之，provider/chat session、human summary、可由included refs完全派生的重复view、package field order、performance observation、完整authority正文/Git history/log MUST排除。Fingerprint MUST NOT是整个Action Package或专业事实正文的hash。

特别地，`contractRefs`新增/删除或任一`ref/kind/versionFingerprint`变化 MUST改变semantic fingerprint。

#### Scenario: semantic input未变化时恢复同一 Run
- **WHEN** exactly one pending Run的resolved Action/Role与current boundary匹配
- **AND** stored semantic input fingerprint与freshly derived fingerprint一致
- **THEN** preparation MUST返回同一 runId
- **AND** MUST NOT分配新 NNN

#### Scenario: contract ref version变化必须阻止旧pending resume
- **WHEN** pending Run建立后任一logical package `contractRef.versionFingerprint`发生变化
- **THEN** freshly derived semantic fingerprint MUST不同
- **AND** preparation MUST fail closed为pending-input-drift
- **AND** MUST NOT用旧runId执行新的contract generation

#### Scenario: 非语义展示变化不得制造 input drift
- **WHEN**只改变human-readable package summary、provider session或performance timing
- **THEN** semantic fingerprint MUST保持不变
- **AND** matching pending Run仍 MUST可resume

### Requirement: new execution instance 必须重新分配 Delivery-wide NNN

Failed/cancelled terminal retry、explicit new Reviewer execution、real author-actionable revise与new formal Action MUST产生新的 Run instance并重新分配 Delivery-wide monotonic NNN。换聊天、换 provider session、重新打开工具、普通 Commit或同一 pending execution继续工作 MUST NOT单独触发 new Run。Checkpoint MUST NOT消耗或重置 NNN。

#### Scenario: failed Run retry 使用新 NNN
- **WHEN** latest relevant Run为 terminal failed/cancelled且 Policy仍返回同一 Action
- **THEN**下一 preparation MUST创建 new Run instance
- **AND** new Run MUST使用新的 Delivery-wide NNN

### Requirement: logical Action Package 必须是 Change-only 最小执行视图

B1 MUST 生成 provider-neutral logical Action Package，并只服务十个 Standard Change Actions。Package MUST 至少提供 current Delivery/Change/Run/action/role、ActionDefinition boundary、current contract/handoff refs、适用 Review findings + blockingAuthority最小 view、适用 Owner authorization refs、verification requirement/plan view与required logical result contract。专业事实仍由各自 authority拥有；Package MUST NOT建立第二 authority或加载整个 completed Run/history/log corpus。

#### Scenario: Delivery Full Test 不产生 Action Package
- **WHEN** current lifecycle boundary是 Delivery Full Test或Delivery Finalize behavior
- **THEN** B1 Action Package generator MUST拒绝把它解释为 Standard Change Action
- **AND** MUST NOT创建 Standard Run或 B1 Action Package

#### Scenario: Apply package 携带适用 Owner ref
- **WHEN** current Action为 `apply` 且Policy要求/已消费适用 Owner authorization
- **THEN** Action Package MAY包含对应 Owner authorization ref/minimal view
- **AND** MUST NOT复制 Owner source transcript或创造新 authority

### Requirement: logical Action Result admission 必须复用 Core terminal persistence

B1 MUST提供与 Action Package对称的薄 logical result admission。Caller只可提交 executionStatus、summary与 ActionDefinition允许的 review/failure descriptor。Admission MUST验证目标 Run仍 pending且 Action/Role/semantic input/entry binding匹配，然后调用现有 Core terminal persistence。RunRef、produced/consumed ResultRefs、reviewVerdictRef、verificationSummaryRef及所有 kind/path/fingerprint MUST由 Core从真实 authority bytes派生。

#### Scenario: caller不能伪造 ResultRef
- **WHEN** logical result尝试提交 caller-built ResultRef/runRef/fingerprint
- **THEN** admission MUST拒绝该字段或忽略其 authority claim
- **AND** terminal result只能包含 Core-derived refs

### Requirement: Lean Run preparation 不得恢复历史重型 replay

B1 preparation/package generation MUST只读取 current formal facts、current active Change Run corpus与必要近邻 lineage。MUST NOT重新加载 completed Change历史 Run corpus、provider transcript、全部 stdout/log、Git history copy、Evidence/Receipt ledger或global artifact registry。

#### Scenario: completed Change历史增长不进入 current package
- **WHEN** Delivery包含多个 completed/checkpointed Change的大量历史 Runs
- **AND** current active Change package被prepare
- **THEN** package inputs MUST仍限定在current formal facts/active Change relevant corpus
- **AND** MUST NOT因为completed history数量线性复制历史内容

### Requirement: Action Package 必须携带 applicable Contract Reset 的 bounded Owner fact view

B1 logical Action Package MUST为 current active Change 的全部 Standard Change Actions携带 current applicable Contract Reset `ownerFactRefs` bounded projection，并继续为 existing authorization gates保留其 action-specific Owner authorization semantics。Package MUST NOT复制 Manifest全部 ownerDecisions、聊天 transcript或 provider session，也 MUST NOT成为第二 Owner authority。

Contract Reset view MUST至少包含 stable `ref`、decision kind、Delivery/Change target、scope、requiredOutcomes与 sourceRef，并 MUST可由 Core从 Manifest authority重新验证。

#### Scenario: Review package 跨会话获得 Reset
- **WHEN** current Change存在 Core-admitted Contract Reset
- **AND** Reviewer在新的 detached session准备 `review-*`
- **THEN** Action Package MUST包含 matching bounded Owner fact view
- **AND** Reviewer MUST不需要 Owner重复同一已接纳 decision才能验证该 fact

### Requirement: applicable Contract Reset 必须参与 same-pending semantic identity

B1 semantic descriptor MUST包含 current Action applicable Contract Reset 的 normalized stable identity。新增或替换同 Change/scope current Contract Reset MUST改变 `semanticInputFingerprint`；matching pending Run MUST fail closed为 input drift，且 MUST NOT重写 stored fingerprint。

Authorization-only Owner refs仍 MUST遵守既有 action-specific applicability，不得因为 Contract Reset handoff而泛化成所有 Action gate。

#### Scenario: pending Reviewer 遇到 Owner Reset 漂移
- **WHEN** pending `review-*` Run已准备
- **AND** Owner随后为同一 Change记录新的 current Contract Reset
- **THEN** fresh semantic fingerprint MUST变化
- **AND** resume MUST返回 pending-input-drift

### Requirement: Review Action Package 必须提供 immediate previous matching Finding convergence input

当 current Action为 `review-*` 且存在 previous matching Review时，B1 MUST向 Reviewer提供 versioned previous Review result ref与 bounded previous findings identity/fields，以便 Reviewer产生 current convergence。B1 MUST只使用 immediate previous matching Review，不加载整个历史 Review corpus。

Author `revise-*` package MUST继续获得关闭 current author-owned blockers所需的 `problem / contractRef / invariant / requiredOutcome / acceptance / blockingAuthority` 最小 view；Policy继续只消费 blocking authority projection。

#### Scenario: direct re-review 获得 prior findings
- **WHEN** same-stage direct re-review合法开始
- **THEN** Reviewer package MUST包含 immediate previous matching Review findings与 exact result ref
- **AND** Reviewer MUST能够把旧 findings分类 resolved/still-open/superseded并识别 new findings

### Requirement: completed producer/review currentness 必须匹配 current Contract Reset identity

D1之后准备的 Standard Run MUST能从 persisted `ownerFactRefs` 派生 bounded Contract Reset identity。Completed Run MUST继续保持不可改写的历史事实，但 producer generation与 review verdict只有在其 prepared Contract Reset identity与 current FormalFactSnapshot identity一致时，才能参与 current lifecycle projection。

当 current Reset 在 approved review之后改变时，旧 producer/review MUST保留历史 completed状态，但旧 approval MUST失去 current lifecycle效力；Policy/lineage MUST回到对应 stage的 normal producer Action并要求新的 Review，MUST NOT直接推进下一 stage，也 MUST NOT把旧 Review机械当成 `revise-*` source。

#### Scenario: approved proposal 后 Reset 不得直接 apply
- **WHEN** `review-propose` 已 approved 当前 proposal producer
- **AND** Owner随后记录新的 current Contract Reset
- **THEN**旧 proposal/review MUST继续作为 completed history存在
- **BUT**旧 approval MUST NOT满足 current propose-stage approval
- **AND** next boundary MUST重新要求 normal `propose` producer与新的 `review-propose`，不得直接 `apply`

#### Scenario: 历史 Run 不被反向判 invalid
- **WHEN** Owner记录新的 Contract Reset
- **THEN** earlier completed Runs MUST保持其原 terminal status/result
- **AND** reset-aware currentness MUST只影响它们是否还能作为 current lifecycle generation/approval

### Requirement: Review convergence baseline 必须沿实际 producer/review lineage

B1 为 `review-*` 准备 previous Finding view时 MUST优先使用明确 lineage：same-target direct re-review使用同一 `reviewedRunId`/same reset identity 的 immediate prior Review；review `revise-*` producer时使用 producer context 的 exact `sourceReviewRun`。Normal producer在新的 Contract Reset identity下形成新 generation时 MUST没有来自旧 generation的 previous Finding baseline。

#### Scenario: revise 后 Review 使用 sourceReviewRun
- **WHEN** current reviewed producer是 `revise-propose`
- **AND**其 context `sourceReviewRun=R1`
- **THEN** Reviewer package previous Finding baseline MUST来自 exact R1
- **AND** MUST NOT改用同 stage另一个更晚但不在该 producer lineage上的 Review

### Requirement: OpenSpec semantic fingerprint 必须使用 action-sensitive projection而不是 raw context hash

B1 MUST继续把 raw OpenSpec structured context提供给当前 Action执行者，但 `externalContextFingerprint` MUST来自 action-sensitive semantic projection，不能直接 hash完整 raw view。

对 `propose/revise-propose`，projection MUST排除 Action-owned artifact existence/current output set与 `existingOutputLogicalPaths`，同时 MUST保留 OpenSpec version/change identity、artifact instruction/template、schema、resolved output identity、dependencies/unlocks等 external contract semantics。

对 `apply/revise-apply`，projection MUST排除合法 task progress与 derived OpenSpec state，同时 MUST保留 exact apply contextFiles identity与其它 non-action-owned prerequisite semantics。

#### Scenario: propose 自写 output 不制造 drift
- **WHEN** pending propose Run合法创建 proposal/design/specs/tasks outputs
- **AND**只有 output existence/existing paths因此变化
- **THEN** fresh semantic fingerprint MUST保持相同
- **AND** same Run MUST仍可 resume/admit

#### Scenario: apply task progress 不制造 drift
- **WHEN** pending apply Run合法更新 tasks completion并改变 OpenSpec progress/state
- **THEN** fresh semantic fingerprint MUST保持相同
- **AND** same Run MUST仍可 resume/admit

#### Scenario: external contract/input drift 继续 fail closed
- **WHEN** artifact instruction semantics、resolved output identity、apply contextFiles、contractRefs、Review facts或 applicable Owner facts改变
- **THEN** semantic fingerprint MUST变化
- **AND** pending execution MUST fail closed
