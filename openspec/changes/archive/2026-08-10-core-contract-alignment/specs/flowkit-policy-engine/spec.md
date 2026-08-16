## MODIFIED Requirements

### Requirement: Review/Revision lineage by reviewed Run

Policy MUST 使用 reviewed-Run lineage 追踪每个阶段 S ∈ {explore, propose, apply} 的 Current Artifact Run 与 Current Review。Lineage match + `approved` 表示阶段完成；no match 表示当前 artifact 需要 Review。Lineage match + `changes-requested` MUST 继续读取该 matching Review 的 `blockingAuthorities`：author-only → `revise-S`；包含任一 non-author authority → 停在 non-author review blocker boundary，不得机械 revise。

#### Scenario: Lineage match + author-only changes-requested 进入 revise

- **WHEN** Current Review.reviewedRunId == Current Artifact Run.runId
- **AND** Current Verdict=`changes-requested`
- **AND** `blockingAuthorities` 非空且全部为 `author`
- **THEN** `next` MUST 返回 `action: revise-S`

#### Scenario: Lineage match + non-author changes-requested 不进入 revise

- **WHEN** Current Review.reviewedRunId == Current Artifact Run.runId
- **AND** Current Verdict=`changes-requested`
- **AND** `blockingAuthorities` 包含 `owner`、`verification` 或 `external`
- **THEN** `next` MUST 返回 blocked authority boundary
- **AND** MUST NOT 返回 `revise-S`

#### Scenario: mixed authority 唯一 fail-closed

- **WHEN** `blockingAuthorities` 同时包含 `author` 与任一 non-author authority
- **THEN** non-author boundary MUST 优先于 Author Revision
- **AND** Policy MUST NOT 任意挑选一个 blocker 方向推进

#### Scenario: revise 后新 artifact 重新进入 Review

- **WHEN** author-only `revise-S` 完成并成为新的 Current Artifact Run
- **AND** Current Review 仍指向前一个 artifact
- **THEN** lineage MUST no-match
- **AND** `next` MUST 返回 `review-S`

### Requirement: Change-level Action 前置条件矩阵

Policy MUST 为全部 10 个 Change-level Action 定义语义前置条件。`revise-S` MUST 要求 lineage match + `changes-requested` + 非空 author-only blocking authorities。matching `changes-requested` 包含任一 non-author authority时 `canRun(revise-S)` MUST false。`review-S` 在通常 no-match 时 MUST allowed；对 matching `changes-requested` **只要包含任一 non-author authority（pure 或 mixed）**，explicit same-stage `review-S` MUST 作为合法 direct re-review admission 被确定性允许，且 candidate target 未变化 MUST NOT 成为拒绝理由。Policy MUST NOT 把“相关 non-author authority fact 是否已到位”作为 `canRun(review-S)` machine prerequisite。`next()` MUST 继续返回 blocked authority boundary，MUST NOT 自动形成 review loop，也 MUST NOT 提前执行 Author mutation。其他 explore/propose/apply/review-apply/archive 的既有 Verification、Tasks 与 Owner gates 保持。

#### Scenario: author-only revise 前置条件

- **WHEN** 校验 `canRun(snapshot, 'revise-S')`
- **AND** lineage match
- **AND** Current Verdict=`changes-requested`
- **AND** `blockingAuthorities` 非空且全部为 `author`
- **THEN** MUST 返回 allowed

#### Scenario: non-author 或 mixed blocker 拒绝 revise

- **WHEN** 校验 `canRun(snapshot, 'revise-S')`
- **AND** matching `changes-requested`
- **AND** `blockingAuthorities` 包含任一 non-author authority
- **THEN** MUST 返回 `allowed: false`
- **AND** unmet preconditions MUST 表达 non-author blocker
- **AND** MUST NOT 创建 Revision Run

#### Scenario: pure 或 mixed non-author boundary 的 explicit direct re-review admission 是确定规则

- **WHEN** matching `changes-requested` 的 `blockingAuthorities` 包含任一 `{owner, verification, external}`
- **AND** authority set MAY 同时包含 `author`
- **AND** 校验 explicit same-stage `canRun(review-S)`
- **THEN** `canRun(review-S)` MUST 返回 allowed
- **AND** candidate artifact Run 与上一轮 Review target 未变化 MUST NOT 使该 Action 非法
- **AND** Policy MUST NOT 要求或推断“相关 non-author authority fact 已到位”作为 admission prerequisite
- **AND** `next(snapshot)` MUST NOT 自动返回 `review-S`
- **AND** `next(snapshot)` MUST 保持 blocked authority boundary
- **AND** MUST NOT 因旧 mixed verdict 提前创建 Author Revision Run
- **AND** Q1 MUST NOT 新增 generic authority-resolution event/ref、automatic Reviewer loop 或 Finding convergence engine

#### Scenario: explicit re-review 创建新的 Reviewer generation

- **WHEN** matching `changes-requested` 包含任一 non-author authority
- **AND** 显式执行同阶段 `review-S`
- **THEN** MUST 创建新的 `review-S` execution Run / Review generation
- **AND** reviewed target MAY 与上一轮相同
- **AND** 新 Reviewer MUST 使用执行时最新可用的 authority facts 重新评估完整 target
- **AND** Policy MUST NOT machine-prove 该 Review 是否“值得现在执行”
- **AND** 如果新 matching Review 只剩 `author` blocker，后续 `revise-S` MUST 按 author-only 规则合法

#### Scenario: review-apply 既有 Verification gate 保持

- **WHEN** `review-apply` 对新的/未覆盖 apply artifact 执行
- **THEN** Change Verification 事实仍 MUST 可用且为 `passed` 或 `not-applicable`
- **AND** Verification 事实不可用/failed/not-run MUST 继续 fail-closed

#### Scenario: archive 既有 gate 保持

- **WHEN** 校验 `archive`
- **THEN** MUST 继续要求 apply stage approved、blocking findings=0、Verification satisfied、Tasks complete、Owner archive authorization
- **AND** Q1 MUST NOT 放宽 Archive gate

### Requirement: Delivery-level Action 前置条件

Standard `canRun` MUST NOT 接受 `full-test` 或 `delivery-finalize`，因为二者不再是 Standard Formal Action。Delivery Full Test / Finalize 的完整 machine behavior contract 后置到 03。Q1→03 期间 Policy 的 no-active-change 分支 MUST 继续消费 `fullTestStatus` 与 Owner authorization 做 deterministic/fail-closed transition，但不得把 Delivery behavior 伪装为 Action/Run。

#### Scenario: Standard canRun 不接受 full-test

- **WHEN** 调用 Standard `canRun` 请求 `full-test`
- **THEN** MUST 不把它识别为 `FormalAction`
- **AND** MUST NOT 创建或允许 Standard Run

#### Scenario: Standard canRun 不接受 delivery-finalize

- **WHEN** 调用 Standard `canRun` 请求 `delivery-finalize`
- **THEN** MUST 不把它识别为 `FormalAction`
- **AND** MUST NOT 创建或允许 Standard Run

#### Scenario: authorized Full Test 在 03 前 blocked

- **WHEN** 无 active Change且所有 required Changes completed/checkpointed
- **AND** `deliveryFullTestStatus=authorized`
- **THEN** `next` MUST 返回 deterministic blocked diagnosis
- **AND** blocked reason MUST 表达 Delivery behavior 尚未由当前 Change 实现
- **AND** MUST NOT 返回 `action: full-test`

#### Scenario: passed + finalize authorized 在 03 前 blocked

- **WHEN** 无 active Change且所有 required Changes completed/checkpointed
- **AND** `deliveryFullTestStatus=passed`
- **AND** Owner finalize authorization 已存在
- **THEN** `next` MUST 返回 deterministic blocked diagnosis
- **AND** MUST NOT 返回 `action: delivery-finalize`

### Requirement: owner 决策边界不可绕过

当 Policy 返回 `owner-decision` 时，Flowkit MUST 停在 Owner 决策边界，MUST NOT 自动推进。Q1 继续保留既有 `activate-change`、`authorize-apply`、`authorize-archive`、`authorize-full-test` 与 `authorize-delivery-finalize` decision vocabulary；这些 decision 是 authority boundary，不是 Standard Action。对于 Review 的 owner blocker，如果 Finding 未唯一指定某个既有 Owner authorization scope，Q1 MUST 返回 blocked non-author boundary，而不是伪造新的通用 Owner decision。

#### Scenario: 所有 required completed 等待 Full Test 授权

- **WHEN** 所有 required Changes completed/checkpointed
- **AND** `deliveryFullTestStatus=awaiting-user-decision`
- **AND** 对应 Owner authorization 尚不存在
- **THEN** MUST 返回 `owner-decision: authorize-full-test`
- **AND** MUST NOT 创建 Full Test Run

#### Scenario: Full Test passed 等待 finalize 授权

- **WHEN** `deliveryFullTestStatus=passed`
- **AND** finalize authorization 尚不存在
- **THEN** MUST 返回 `owner-decision: authorize-delivery-finalize`
- **AND** MUST NOT 创建 Finalize Run

#### Scenario: Review owner blocker 不伪造通用 decision

- **WHEN** matching `changes-requested` Review 包含 `blockingAuthority=owner`
- **AND** finding 没有唯一映射到既有 OwnerDecision enum 的正式 machine scope
- **THEN** Policy MUST 返回 blocked non-author authority boundary
- **AND** MUST NOT 自创 Owner decision 或从 Finding prose 推断授权

### Requirement: ownerAuthorizations 空数组时 owner-decision

`snapshot.ownerAuthorizations` 为空数组时，既有 apply/archive 与 `awaiting-user-decision` / passed 的 Owner authorization gate MUST 继续返回对应 owner-decision；空数组本身 MUST NOT 产生 blocked。对于已经进入 `authorized` 的 Delivery Full Test 或已经有 finalize authorization 的 passed Delivery，由于 03 behavior 尚未实现，Q1→03 过渡 MUST 返回 Delivery-behavior blocked，而不是 Action。

#### Scenario: apply/archive 缺授权仍返回 owner-decision

- **WHEN** `snapshot.ownerAuthorizations` 为空
- **AND** 当前 Change 已到 apply/archive 的唯一 authorization gate
- **THEN** `next` MUST 返回对应 owner-decision
- **AND** MUST NOT 自动推进

#### Scenario: Delivery behavior 已授权但 executor 未实现时 blocked

- **WHEN** Full Test/Finalize 所需 Owner authorization 已存在
- **AND** 03 Delivery behavior machine model/executor 尚未实现
- **THEN** `next` MUST 返回 Delivery-behavior blocked
- **AND** MUST NOT 把 authorization presence 转成 `full-test` / `delivery-finalize` Action

### Requirement: 统一 review/revise 入口解析

`review` 和 `revise` MUST 继续只是统一入口。`revise` 只能在 matching `changes-requested` + author-only blocking authorities 时解析为具体 `revise-S`。`review` 在通常 no-match 时 MUST 解析为 `review-S`；matching `changes-requested` 只要包含任一 non-author authority（pure 或 mixed），显式 `review` MUST 确定性解析为同阶段 `review-S`，无需 Policy machine-prove 新 authority fact 是否到位；`next` 仍不得自动选择该路径。无法唯一解析 stage 时 MUST blocked。

#### Scenario: revise 入口解析为 author-only revise-S

- **WHEN** 当前 stage 为 S
- **AND** matching Verdict=`changes-requested`
- **AND** blocking authorities 非空且全部为 `author`
- **THEN** `revise` MUST 解析为 `revise-S`

#### Scenario: revise 入口遇到 non-author blocker 时 blocked

- **WHEN** matching Verdict=`changes-requested`
- **AND** blocking authorities 包含任一 non-author authority
- **THEN** `revise` MUST blocked
- **AND** MUST NOT 创建 Revision Run

#### Scenario: 显式 direct re-review

- **WHEN** matching Verdict=`changes-requested`
- **AND** blocking authorities 包含任一 `{owner, verification, external}`，无论是否同时包含 `author`
- **AND** 显式执行 unified `review`
- **THEN** unified review MUST 解析为同阶段 `review-S`
- **AND** reviewed target MAY 与上一轮相同
- **AND** MUST 创建新的 Reviewer execution Run
- **AND** MUST NOT 创建 Author Revision Run
- **AND** Policy MUST NOT 以“尚未证明新 non-author fact 到位”为由拒绝该 Review
- **AND** 新 Review result MUST 成为后续 authority/revise 判断使用的 matching Review

### Requirement: diagnose 生成 blocked diagnosis

`diagnose(snapshot)` MUST 返回 `BlockedDiagnosis`，并继续包含 `reason`、`unmetPreconditions`、`conflicts`、`suggestedOwnerActions`。Q1 MUST 增加稳定 blocked reason 以区分 non-author Review blocker 与 Q1→03 Delivery behavior 尚未实现的过渡阻塞；diagnose MUST NOT 把二者转换为 Action。

#### Scenario: non-author Review blocker diagnosis

- **WHEN** matching `changes-requested` 含任一 non-author blocking authority
- **THEN** `diagnose` MUST 返回稳定 non-author-review-blocker reason
- **AND** unmet preconditions MUST 表达该 boundary
- **AND** MUST NOT 返回 `revise-*`

#### Scenario: Delivery behavior transition diagnosis

- **WHEN** no-active-change Delivery 已到 `authorized` Full Test behavior或已授权 Finalize behavior
- **AND** 03 machine behavior 尚未实现
- **THEN** `diagnose` MUST 返回稳定 delivery-behavior-not-implemented reason
- **AND** MUST NOT 返回 `full-test` / `delivery-finalize` Action
