## Purpose

定义 Flowkit Reviewer-owned Finding 的完整、稳定、可收敛 machine contract，并在不建立第二 authority plane 的前提下支持 direct re-review 与 blocker authority handoff。

## ADDED Requirements

### Requirement: Reviewer Finding v2 必须是完整 closed contract

D1 之后新写入的 completed `review-*` Result MUST 使用 `reviewFindingSchemaVersion: 2`，其 `reviewFindings` 每项 MUST 使用 closed schema，并至少包含 `id`、`severity`、`title`、`problem`、`contractRef`、`invariant`、non-empty `evidence[]` 与 `impact`。Blocking finding 还 MUST 包含 exactly one `blockingAuthority`、non-empty `requiredOutcome` 与 non-empty `acceptance[]`；non-blocking finding MUST NOT 包含这三个 lifecycle-blocking fields。

Core MUST拒绝 unknown fields、empty required fields、duplicate finding IDs、blocking/non-blocking field组合不一致。完整 Finding authority属于 Reviewer Result；Policy MUST NOT复制 evidence/impact/acceptance正文作为 decision authority。

#### Scenario: author blocking finding 完整入库
- **WHEN** Reviewer完成一个 `review-*` 并提交 blocking finding with `blockingAuthority=author`
- **THEN** Result MUST包含完整 problem/contract/invariant/evidence/impact/requiredOutcome/acceptance
- **AND** Core MUST在 terminal publish前校验 closed schema

#### Scenario: non-blocking finding 不得携带 lifecycle authority
- **WHEN** Reviewer提交 `severity=non-blocking`
- **THEN** finding MUST NOT携带 `blockingAuthority`、`requiredOutcome` 或 `acceptance`
- **AND** 该 finding MUST NOT单独导致 Author revise boundary

### Requirement: Finding ID 必须在 matching Review generations 中保持稳定 identity

同一 reviewed stage 的 previous matching Review 与 current Review 之间，Finding `id` MUST作为稳定 identity key。若 current finding复用 previous ID，则 `contractRef + invariant` MUST保持一致；evidence、problem wording、impact或acceptance MAY按新证据更新。若问题 identity改变，Reviewer MUST分配新 ID并通过 `superseded` convergence关系连接旧 ID，不得静默复用旧 ID表达不同问题。

同一 completed Review Result内 finding IDs MUST唯一。

#### Scenario: still-open finding 保留 ID
- **WHEN** previous matching Review存在 finding `D1-RP-001`
- **AND** current Review确认同一 contractRef/invariant问题仍未关闭
- **THEN** current finding MUST继续使用 `D1-RP-001`
- **AND** convergence MUST标记其为 `still-open`

#### Scenario: identity 改变必须 supersede
- **WHEN** Reviewer发现旧 finding 的真实 violated invariant 已改变
- **THEN** current Review MUST使用新 finding ID
- **AND** convergence MUST把旧 ID标记为 `superseded` 并引用新 ID

### Requirement: matching Review convergence 必须显式覆盖 previous/current finding union

当 current `review-*` 存在 immediate previous matching Review 时，completed Result MUST携带 `reviewFindingConvergence`，并对 previous/current finding ID union 中每个 ID exactly once 分类为 `new | still-open | resolved | superseded`。无 previous matching Review 时 convergence MUST为空数组。

约束：`new`/`still-open` 必须对应 current finding；`resolved`/`superseded` 的旧 ID MUST不再出现在 current findings；`superseded` MUST提供 `supersededByFindingId` 且该 target MUST是 current `new` finding。Core MUST在 terminal publish前验证这些关系。

#### Scenario: direct re-review 关闭 owner blocker
- **WHEN** previous matching Review有 owner blocking finding
- **AND**新的 Core-admitted Owner fact已满足 acceptance 且 target bytes无需 Author mutation
- **AND** Reviewer执行 explicit same-stage re-review
- **THEN** current Review MAY标记旧 finding `resolved`
- **AND** current verdict按 current findings重新产生，不需要 no-op revise

#### Scenario: approved review 仍记录 closure
- **WHEN** previous matching Review有 blocking findings
- **AND** current Review已无 blocking finding
- **THEN** current verdict MAY为 `approved`
- **AND** convergence MUST显式把 previous findings分类为 `resolved` 或 `superseded`

### Requirement: convergence 只使用实际近邻 lineage Review，不建立全局 Finding store

D1 MUST仅使用 current reviewed target、实际 lineage 上的 immediate previous Review Result 与 current Review Result完成 finding convergence。previous baseline MUST按以下 bounded 规则解析，而 MUST NOT仅选择同 stage latest completed Review：direct re-review 只沿同一 `reviewedRunId` 且 Contract Reset identity一致的最近 Review；review 一个 `revise-*` producer 时只沿该 producer 的 exact `sourceReviewRun`；Owner Reset 后的新 normal producer generation没有 previous convergence baseline。

它 MUST NOT建立 `.flowkit/findings`、global Finding registry、Evidence ledger、authority-resolution event store、generation registry或整个历史 Review replay。

#### Scenario: 历史 Review 增长不扩大 convergence corpus
- **WHEN**同一 Change 已有多个更早 completed review generations
- **AND** current Reviewer准备新的 same-stage Review
- **THEN** convergence input MUST限制为 actual lineage immediate previous Review
- **AND** MUST NOT加载全部历史 Review findings作为新的 authority database

#### Scenario: Reset 后新 generation 不继承 abandoned findings
- **WHEN** proposal generation P1 的 Review R1 已有 findings或 approval
- **AND** Owner随后记录新的 current Contract Reset
- **AND** Flowkit创建新的 normal proposal producer P2
- **THEN** review P2 MUST NOT把 R1作为 convergence baseline
- **AND** P2 的 first Review convergence MUST为空，除非存在 P2 自身 same-target direct re-review lineage

### Requirement: Reviewer authority 与 Policy projection 必须继续分离

Reviewer Result MUST拥有完整 verdict、Finding 与 convergence。FormalFactReader/Policy MUST继续只消费计算 lifecycle boundary所需的 current verdict、reviewed target binding 与 deduplicated blocking authorities；evidence、impact、acceptance与 convergence prose MUST不成为第二 Policy authority。

B1 Action Package MAY携带当前 Action所需的 bounded finding/convergence view，但该 view MUST可追溯到 versioned Reviewer Result ref，并 MUST NOT取代 Reviewer Result authority。

#### Scenario: Policy 只读取 blocking authorities
- **WHEN** current Review Result同时含丰富 evidence/acceptance与 blockingAuthority
- **THEN** Policy lifecycle routing MUST只依赖 current verdict/authority projection与既有 preconditions
- **AND** MUST NOT解释 evidence prose来决定 next
