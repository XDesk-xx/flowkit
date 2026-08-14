## MODIFIED Requirements

### Requirement: B1 preparation 必须消费 shared Policy 的 bounded dual-entry 而不得复制 decision tree

B1 new execution preparation MUST 以 fresh FormalFactSnapshot 消费 shared Policy，并且只接受 `next` 与 `review` 两个 high-level intents。`next` MUST 调用 shared `next(snapshot)`；`review` MUST 调用 shared `resolveReview(snapshot)` / `canRun(review-S)` 等价 unified review admission。Caller MUST NOT 直接指定 concrete Action。

matching `changes-requested` 含任一 non-author blocker 时，shared `next()` MUST 继续保持 blocked authority boundary；explicit `review` MUST 仍可通过 Policy 解析 same-stage `review-S`。B1 MUST NOT 自行判断 non-author fact 是否到位、自动 review、要求 Author revision 或复制 blockingAuthority/Stage legality。

Policy 解析 concrete Action 后，new preparation MUST 先检查 current pending identity。若存在 pending Run，new preparation MUST 返回 `exact-resume-required`，MUST NOT 沿 shared continuation path 隐式恢复、改选或分配 NNN；继续该 execution 只能调用不经过 Policy 的 `resumeRun(expectedRunId)`。

#### Scenario: direct re-review 不改变 blocked next

- **WHEN** non-author blocker 使 `next()` 返回 blocked
- **AND** explicit unified `review` 经 shared Policy 允许 same-stage `review-S`
- **THEN** B1 MAY 在无 pending 时创建 new Reviewer generation
- **AND** subsequent `next()` semantics MUST 仍完全由 shared Policy 计算
- **AND** B1 MUST NOT 把 review recommendation 当 authority

#### Scenario: pending Run 阻止两个 new preparation intents

- **WHEN** `next` 或 `review` 已经由 Policy 解析 concrete Action
- **AND** current Change 存在 pending Run
- **THEN** B1 MUST 返回 `exact-resume-required` 与 persisted target identity
- **AND** MUST NOT 调用另一 Policy intent、恢复 target 或创建新 NNN

#### Scenario: concrete caller-selected Action 被拒绝

- **WHEN** caller 绕过 bounded intent 直接要求 `review-propose`、`apply` 或其它 Action
- **THEN** B1 high-level new preparation MUST 拒绝

## ADDED Requirements

### Requirement: Policy new Action selection 不得成为 retry 入口

Policy MUST 只根据 current formal facts 计算新的 legal boundary。target-pinned resume 与 terminal replay MUST 在指定 persisted Run identity 上执行，MUST NOT 调用 Policy 选择另一 Action，也 MUST NOT 以 timeout、retry 或 declaration 为理由推进 lifecycle。

#### Scenario: caller retry 指向已完成 Run

- **WHEN** expected Run 已 terminal 且 current Policy 已指向下一 Action
- **THEN** exact retry MUST 返回 expected Run 的 persisted terminal state
- **AND** MUST NOT 准备 Policy 当前下一 Action

### Requirement: Policy 必须先于 mutation declaration 选择 Action

Policy MUST 先从 formal facts 决定唯一 legal Action；仅在选择 `apply` / `revise-apply` 后，Core 才能从 matching approved Design 派生同名 declaration entry。declaration MUST NOT 反向选择、创造或推进 Action。

#### Scenario: Core-derived Action entry 缺失或 identity 不匹配

- **WHEN** approved `flowkitMutationScope` 缺失 Policy-selected Action entry，或该 entry 与 persisted context v5 / ActionPackage v2 identity 不匹配
- **THEN** preparation 或 resume MUST 产生 deterministic fail-closed diagnostic
- **AND** MUST NOT 接受 caller/terminal declaration 作为修复
