## ADDED Requirements

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
