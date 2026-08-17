# flowkit-policy-engine Specification

## Purpose
TBD - created by archiving change policy-engine. Update Purpose after archive.
## Requirements
### Requirement: Policy 三函数为纯函数

D1 MUST 实现 `canRun`、`next`、`diagnose` 三个公开纯函数。三个函数 MUST 只读 `FormalFactSnapshot`，MUST NOT 修改任何状态，MUST NOT 调用 I/O。所有事实来自 snapshot，所有决策基于 snapshot 内容。

#### Scenario: canRun 为纯函数

- **WHEN** 调用 `canRun(snapshot, action)`
- **THEN** MUST 只读 `snapshot`
- **AND** MUST NOT 修改任何传入参数或外部状态
- **AND** MUST NOT 调用 I/O（文件系统、网络、子进程）
- **AND** 相同输入 MUST 产生相同输出

#### Scenario: next 为纯函数

- **WHEN** 调用 `next(snapshot)`
- **THEN** MUST 只读 `snapshot`
- **AND** MUST NOT 修改任何状态或调用 I/O
- **AND** 相同输入 MUST 产生相同输出

#### Scenario: diagnose 为纯函数

- **WHEN** 调用 `diagnose(snapshot)`
- **THEN** MUST 只读 `snapshot`
- **AND** MUST NOT 修改任何状态或调用 I/O
- **AND** 相同输入 MUST 产生相同输出

### Requirement: canRun 校验 Action 前置条件

`canRun(snapshot, action)` MUST 返回 `CanRunResult`，包含 `action`、`allowed`、`unmetPreconditions`、`conflictDimensions`。`snapshot.conflicts` 非空时 MUST 返回 `allowed: false` 并列出冲突维度。Action 不在 B1 `ACTION_CATALOG` 中时 MUST 返回 `allowed: false` 且 `unmetPreconditions` 包含 `unknown-action`。否则按 Action 特定前置条件检查，收集未满足条件。`allowed: true` 当且仅当 `unmetPreconditions` 为空且 `conflictDimensions` 为空。

#### Scenario: conflicts 非空时 canRun 拒绝

- **WHEN** 调用 `canRun(snapshot, action)`
- **AND** `snapshot.conflicts` 非空
- **THEN** MUST 返回 `allowed: false`
- **AND** `conflictDimensions` MUST 列出冲突维度
- **AND** 不论 Action 的其他前置条件是否满足

#### Scenario: 未知 Action 拒绝

- **WHEN** 调用 `canRun(snapshot, action)`
- **AND** `action` 不在 Change-only `ACTION_CATALOG` / `CHANGE_ACTIONS` 中
- **THEN** MUST 返回 `allowed: false`
- **AND** `unmetPreconditions` MUST 包含 `unknown-action`

#### Scenario: 前置条件全部满足时允许

- **WHEN** 调用 `canRun(snapshot, action)`
- **AND** `snapshot.conflicts` 为空
- **AND** `action` 在 B1 `ACTION_CATALOG` 中
- **AND** Action 的全部特定前置条件满足
- **THEN** MUST 返回 `allowed: true`
- **AND** `unmetPreconditions` MUST 为空
- **AND** `conflictDimensions` MUST 为空

#### Scenario: 前置条件部分不满足时拒绝

- **WHEN** 调用 `canRun(snapshot, action)`
- **AND** 部分 Action 特定前置条件不满足
- **THEN** MUST 返回 `allowed: false`
- **AND** `unmetPreconditions` MUST 列出全部未满足条件

### Requirement: next 计算唯一合法下一 Action

`next(snapshot)` MUST 返回 `PolicyResult` 互斥联合类型：`action`（唯一合法 Standard Change Action）、`owner-decision`（需 owner 授权）、`delivery-behavior`（唯一合法非 Action Delivery behavior）或 `blocked`（无法推进）。A1 只新增 `delivery-behavior: full-test`；Delivery Finalize 继续由 F1 实现。`snapshot.conflicts` 非空时 MUST 返回 `blocked`。无 active Delivery 时 MUST 返回 `blocked`。有 active Change 时按 Change 生命周期决策树计算；**无 active Change 时 MUST 先判断是否存在已 completed 但尚未形成 Change Checkpoint 的 Change。只有该 Change 的 matching archive Run 已合法 terminal completed 时，才可进入 `owner-decision: authorize-checkpoint`；若 archive Run仍 pending/non-terminal，则 MUST保持 archive recovery/blocked boundary。Checkpoint 完成后才继续下一 Change 激活或 Delivery-level 流程。** 多解或歧义时 MUST 返回 `blocked`。

当 active Change存在current Contract Reset时，Policy MUST把该reset解释为新的proposal contract generation boundary：最近合法approved Explore可继续作为handoff；旧 `propose/revise-propose/review-propose/apply/revise-apply/review-apply/archive` Runs若不匹配current reset identity，MUST不参与current stage/currentArtifactRun/current review/lineage。若尚无current propose producer，`next(snapshot)` MUST返回`action: propose`。stage detection、`next`与`canRun` MUST使用同一reset-aware projection，MUST NOT通过all-historical stage fallback重新激活旧approval。

#### Scenario: PolicyResult 为互斥联合类型

- **WHEN** 调用 `next(snapshot)`
- **THEN** 返回值 MUST 恰好为以下之一：`{ kind: 'action', action }`、`{ kind: 'owner-decision', decision, context }`、`{ kind: 'delivery-behavior', behavior: 'full-test', context }`、`{ kind: 'blocked', diagnosis }`
- **AND** MUST NOT 同时返回多种 kind

#### Scenario: conflicts 非空时 blocked

- **WHEN** 调用 `next(snapshot)`
- **AND** `snapshot.conflicts` 非空
- **THEN** MUST 返回 `{ kind: 'blocked', diagnosis }`
- **AND** 冲突优先于一切其他决策

#### Scenario: 无 active Delivery 时 blocked

- **WHEN** 调用 `next(snapshot)`
- **AND** 无 active Delivery
- **THEN** MUST 返回 `{ kind: 'blocked', diagnosis }`
- **AND** diagnosis.reason MUST 标识 `no-active-delivery`

#### Scenario: 多解或歧义时 blocked

- **WHEN** 调用 `next(snapshot)`
- **AND** 正式事实无法确定唯一合法下一 Action
- **THEN** MUST 返回 `{ kind: 'blocked', diagnosis }`
- **AND** diagnosis.reason MUST 标识 `ambiguous-state`

#### Scenario: Archive 后无 active Change 时进入 Checkpoint 边界

- **WHEN** Manifest 显示某 required Change 已 `completed`
- **AND** 当前无 active Change
- **AND**该 Change matching archive Run 已合法terminal completed
- **AND** Git authority 尚无该 Change 的 `change-checkpoint` boundary
- **THEN** `next(snapshot)` MUST 返回 `owner-decision: authorize-checkpoint`
- **AND** context MUST 标识该 completed Change
- **AND** MUST NOT 通过重新投影无关历史 Runs 获得此结论

#### Scenario: Change completed 但 archive Run non-terminal 不得提前 Checkpoint

- **WHEN** Manifest 显示某 Change 已 `completed`
- **AND** 当前无 active Change且Git尚无该 Change checkpoint
- **BUT** matching archive Run仍pending或其它non-terminal状态
- **THEN** `next(snapshot)` MUST NOT返回 `authorize-checkpoint`
- **AND** MUST返回bounded blocked/recovery diagnosis，使同一archive continuation先合法terminalize

#### Scenario: authorized Full Test 返回 Delivery behavior

- **WHEN** 当前无 active Change
- **AND** 所有 required Changes completed/checkpointed
- **AND** current effective `deliveryFullTestStatus=authorized`
- **AND** matching delivery-scoped `authorize-full-test` Owner fact 已存在
- **THEN** `next(snapshot)` MUST 返回 `kind=delivery-behavior, behavior=full-test`
- **AND** MUST NOT 返回 `action: full-test`、创建 Standard Run 或自动执行该 behavior

#### Scenario: Checkpoint 完成后才继续下一流程

- **WHEN** completed Change 已存在对应 `change-checkpoint` Git boundary
- **AND** 当前无 active Change
- **THEN** Policy MUST 不再返回该 Change 的 `authorize-checkpoint`
- **AND** MUST 根据剩余 planned Change / Delivery Full Test 条件计算唯一下一边界

#### Scenario: legacy 与 structured Checkpoint 混合时不得回退

- **WHEN** 当前 Delivery 的 completed Changes 中既有 legacy 无 `changeId` checkpoint，又有后续 structured `changeId` checkpoint
- **THEN** Policy MUST 同时承认两类 Git boundary
- **AND** MUST NOT 因 structured boundary 出现而把 legacy 已 checkpoint 的 Change 重新返回为 `authorize-checkpoint`

#### Scenario: 其他 Delivery 的同名 Checkpoint 不属于当前 Delivery

- **WHEN** Git history 中存在其他 Delivery 的同名 `<change-id>` checkpoint
- **THEN** 当前 Delivery 的 checkpoint recovery MUST 忽略该 boundary
- **AND** MUST 只消费 Git reader 已限定为当前 Delivery ownership 的 checkpoint facts

#### Scenario: archive Run completed 但 Change 仍 active 为不一致状态

- **WHEN** active Change 的 current stage 已存在 completed `archive` Run
- **BUT** Manifest 仍声明该 Change 为 `active`
- **THEN** `next(snapshot)` MUST fail closed 为 `blocked: ambiguous-state`
- **AND** MUST NOT 直接把 active Change 当作 checkpoint-pending 状态

#### Scenario: Contract Reset 后回到 fresh Proposal generation

- **WHEN** active Change历史上已有旧proposal/apply/review/archive Runs
- **AND** Owner记录新的Contract Reset并声明旧generation abandoned
- **AND**当前reset identity尚无completed propose producer
- **THEN** `next(snapshot)` MUST返回`action: propose`
- **AND** MUST NOT返回`apply`、`review-apply`或`archive`
- **AND**旧revise-propose/review-propose/revise-apply/review-apply artifact或approval MUST NOT跨reset generation继续生效

#### Scenario: reset-aware stage 与 lineage 使用同一 current Run projection

- **WHEN** current Contract Reset identity存在
- **THEN** active stage、Current Artifact、Current Review、`next`与`canRun` MUST基于同一current reset-aware Run/Review projection
- **AND** Proposal之前的合法 Explore handoff MAY继续使用
- **AND** Proposal及之后 MUST NOT因全历史Run fallback重新选择旧generation

#### Scenario: revise producer 与 base producer 使用同一 Reset currentness
- **WHEN** proposal stage历史中存在090-revise-propose且apply stage历史中存在094-revise-apply
- **AND** 两个Run均不匹配current完整Contract Reset identity
- **THEN** stage detection与Current Artifact MUST NOT选择090或094
- **AND** `next`/`canRun` MUST与reset-aware review lineage保持一致
- **AND** fresh generation不得因旧revise producer存在而跳过新的producer/review边界

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

Standard `canRun` MUST NOT 接受 `full-test` 或 `delivery-finalize`，因为二者不再是 Standard Formal Action。A1 MUST实现 Owner-authorized Delivery Full Test 的 machine behavior boundary；Delivery Finalize 仍后置到 F1。Policy 的 no-active-change 分支 MUST消费 current effective `fullTestStatus` 与 Owner authorization 做 deterministic transition，但不得把 Delivery behavior 伪装为 Action/Run。

#### Scenario: Standard canRun 不接受 full-test

- **WHEN** 调用 Standard `canRun` 请求 `full-test`
- **THEN** MUST 不把它识别为 `FormalAction`
- **AND** MUST NOT 创建或允许 Standard Run

#### Scenario: Standard canRun 不接受 delivery-finalize

- **WHEN** 调用 Standard `canRun` 请求 `delivery-finalize`
- **THEN** MUST 不把它识别为 `FormalAction`
- **AND** MUST NOT 创建或允许 Standard Run

#### Scenario: authorized Full Test 在 03 前 blocked

- **WHEN** bounded historical/pre-A1 snapshot 中无 active Change且所有 required Changes completed/checkpointed
- **AND** `deliveryFullTestStatus=authorized`
- **AND** A1 executable binding或 Delivery behavior executor在该 historical snapshot 中不可用
- **THEN** `next` MUST 返回 deterministic blocked diagnosis
- **AND** MUST NOT 返回 `action: full-test`、Standard Run 或 fabricated terminal result

#### Scenario: authorized Full Test 在 A1 后可执行

- **WHEN** current A1+ snapshot 中无 active Change且所有 required Changes completed/checkpointed
- **AND** `deliveryFullTestStatus=authorized`
- **AND** matching Owner Full Test authorization 与 executable binding 均存在
- **AND** current `verification.fullTest.executionBlock` 不存在
- **THEN** `next` MUST 返回 `delivery-behavior: full-test`
- **AND** MUST NOT 返回 `action: full-test` 或创建 Standard Run

#### Scenario: authorized + outcome-unknown block 不允许 Full Test 重入

- **WHEN** no active Change
- **AND** current effective `deliveryFullTestStatus=authorized`
- **AND** current `verification.fullTest.executionBlock.reason=outcome-unknown`
- **THEN** Policy MUST 返回 deterministic blocked boundary（例如 `full-test-execution-outcome-unknown`）
- **AND** MUST NOT 返回 `delivery-behavior: full-test`
- **AND** MUST NOT返回 Standard Action/Run

#### Scenario: passed + finalize authorized 在 03 前 blocked

- **WHEN** 无 active Change且所有 required Changes completed/checkpointed
- **AND** `deliveryFullTestStatus=passed`
- **AND** Owner finalize authorization 已存在
- **THEN** `next` MUST 返回 deterministic blocked diagnosis
- **AND** MUST NOT 返回 `action: delivery-finalize`

### Requirement: fail-closed 冲突优先于一切决策

`snapshot.conflicts` 非空时，`next` MUST 返回 `blocked`，`canRun` MUST 返回 `allowed: false`。冲突优先于 lineage 推断、owner 决策边界、阶段推进和 Action 前置条件。这是 C1 `One fact, one authority` 在 Policy 层的延续。

#### Scenario: conflicts 优先于 lineage 推断

- **WHEN** `snapshot.conflicts` 非空
- **AND** 存在可推进的 lineage 状态
- **THEN** `next` MUST 返回 `blocked`
- **AND** MUST NOT 返回 `action` 或 `owner-decision`

#### Scenario: conflicts 优先于 owner 决策

- **WHEN** `snapshot.conflicts` 非空
- **AND** 存在可推进的 owner-decision 场景
- **THEN** `next` MUST 返回 `blocked`
- **AND** MUST NOT 返回 `owner-decision`

#### Scenario: canRun 在冲突时拒绝一切 Action

- **WHEN** `snapshot.conflicts` 非空
- **THEN** 对任意 Action，`canRun` MUST 返回 `allowed: false`
- **AND** `conflictDimensions` MUST 列出冲突维度

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

### Requirement: Verification 事实不可用时 blocked

`FormalFactSnapshot` MAY 携带 active Change 的 `changeVerificationStatus`。D1 对 verification-gated actions（`review-apply`、`archive`）MUST 只从该 Snapshot fact 读取 Verification status，MUST NOT 从 Run 历史、OpenSpec artifact existence、Verification 正文自由文本或聊天历史推断状态。`changeVerificationStatus` 缺失时 MUST 返回 `blocked: verification-facts-unavailable`；`failed` 与 `not-run` MUST 分别映射为 `verification-failed` 与 `verification-not-run`；`passed` 或 `not-applicable` MUST 满足既有 Verification gate。该修改只接通 D1 已冻结的 status-aware gate，不改变其业务语义。

#### Scenario: Verification 事实不可用时 review-apply blocked

- **WHEN** apply 阶段 Current Artifact Run ≠ null
- **AND** Change Verification 事实不可用（snapshot.changeVerificationStatus 缺失）
- **THEN** `next` MUST 返回 `{ kind: 'blocked', diagnosis: { reason: 'verification-facts-unavailable' } }`
- **AND** `canRun(snapshot, 'review-apply')` MUST 返回 `allowed: false` 且 `unmetPreconditions` 包含 `verification-facts-unavailable`

#### Scenario: Verification 事实不可用时 archive blocked

- **WHEN** apply 阶段 lineage match + approved
- **AND** Change Verification 事实不可用
- **THEN** `next` MUST 返回 `blocked: verification-facts-unavailable`
- **AND** `canRun(snapshot, 'archive')` MUST 返回 `allowed: false`

#### Scenario: 不从 Run 历史推断 Verification

- **WHEN** Policy 计算 verification-gated action 的前置条件
- **AND** snapshot 无 `changeVerificationStatus`
- **THEN** MUST NOT 从 Run 历史推断 Verification status
- **AND** MUST NOT 从 OpenSpec 产物存在性或 Verification 正文自由文本推断 Verification status
- **AND** MUST NOT 从聊天历史或 `.tmp` 推断任何正式事实

#### Scenario: verification-facts-unavailable 与 verification-failed 区分

- **WHEN** 生成 blocked diagnosis
- **AND** Verification 事实不可用
- **THEN** reason MUST 为 `verification-facts-unavailable`
- **AND** MUST NOT 为 `verification-failed` 或 `verification-not-run`
- **AND** `verification-failed` 和 `verification-not-run` MUST 仅在事实可用但结果不通过时适用

#### Scenario: passed 或 not-applicable 满足既有 gate

- **WHEN** `snapshot.changeVerificationStatus` 为 `passed` 或 `not-applicable`
- **THEN** Verification gate MUST 为 satisfied
- **AND** `canRun` / `next` MUST 继续评估该 Action 的其他冻结前置条件

#### Scenario: failed 与 not-run 保持 distinct blocked reason

- **WHEN** `snapshot.changeVerificationStatus=failed`
- **THEN** Verification gate MUST blocked 为 `verification-failed`
- **WHEN** `snapshot.changeVerificationStatus=not-run`
- **THEN** Verification gate MUST blocked 为 `verification-not-run`

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

### Requirement: blocked diagnosis 条件

D1 MUST 为以下 blocked 原因生成对应 diagnosis：`formal-fact-conflict`（conflicts 非空）、`no-active-delivery`（无 active Delivery）、`no-actionable-change`（无 active Change 且无可激活 Change）、`verification-facts-unavailable`（Verification 事实不可用）、`verification-failed`（事实可用但不通过）、`verification-not-run`（事实可用但未运行）、`tasks-facts-unavailable`（Tasks 完成事实不可用，仅 archive 门控）、`ambiguous-state`（多解或歧义）、`dependency-incomplete`（依赖未完成）、`full-test-failed`（Full Test 失败，`deliveryFullTestStatus` = `failed`）。`tasks-facts-unavailable` MUST 与 `verification-facts-unavailable` 区分——前者表示 Tasks 完成事实不可用（archive 门控），后者表示 Change Verification 事实不可用（review-apply/archive 门控）。`full-test-failed` MUST 严格遵循 frozen `verification-model.md` Section 6：`fullTestStatus` 保持 `failed`，Policy MUST NOT 自动创建 corrective Change 或自动重试 `full-test`，MUST 返回 `blocked` 并在 `suggestedOwnerActions` 列出 owner 的合法选择（授权创建 corrective Change 或取消 Delivery）；只有 owner 明确授权 corrective Change 后 `fullTestStatus` 才返回 `not-ready`，重新进入 Full Test 生命周期（D1-13）。

#### Scenario: conflicts 非空 diagnosis

- **WHEN** `snapshot.conflicts` 非空
- **THEN** `diagnose` MUST 返回 reason=`formal-fact-conflict`
- **AND** `conflicts` MUST 列出 `snapshot.conflicts` 内容

#### Scenario: 无 active Delivery diagnosis

- **WHEN** 无 active Delivery
- **THEN** `diagnose` MUST 返回 reason=`no-active-delivery`

#### Scenario: Verification 事实不可用 diagnosis

- **WHEN** verification-gated action 的 Verification 事实不可用
- **THEN** `diagnose` MUST 返回 reason=`verification-facts-unavailable`
- **AND** MUST NOT 返回 `verification-failed` 或 `verification-not-run`

#### Scenario: Tasks 完成事实不可用 diagnosis

- **WHEN** archive 门控的 Tasks 完成事实不可用
- **THEN** `diagnose` MUST 返回 reason=`tasks-facts-unavailable`
- **AND** MUST NOT 返回 `verification-facts-unavailable`（二者属不同事实缺口）
- **AND** MUST NOT 从 Run 历史、OpenSpec 产物存在性或聊天历史推断 Tasks 完成状态

#### Scenario: Full Test failed diagnosis

- **WHEN** `snapshot.deliveryFullTestStatus` = `failed`
- **THEN** `diagnose` MUST 返回 reason=`full-test-failed`
- **AND** `suggestedOwnerActions` MUST 列出 owner 的合法选择（授权创建 corrective Change 或取消 Delivery）
- **AND** MUST NOT 返回 `action: full-test`
- **AND** MUST NOT 自动创建 corrective Change（frozen `verification-model.md` Section 6）

#### Scenario: full-test-failed 后 corrective Change 重置 fullTestStatus

- **WHEN** `snapshot.deliveryFullTestStatus` = `failed`
- **AND** owner 明确授权创建 corrective Change
- **AND** corrective Change 创建后 `snapshot.deliveryFullTestStatus` 返回 `not-ready`
- **THEN** `next` MUST NOT 再返回 `blocked: full-test-failed`
- **AND** corrective Change 按 `planned` → `active` 普通 Change 规则推进
- **AND** 所有 required Changes 再次 completed 后重新进入 `awaiting-user-decision`
- **AND** MUST NOT 自动重试 `full-test`（需重新等待 owner 授权 full-test scope）

#### Scenario: 歧义状态 diagnosis

- **WHEN** 正式事实无法确定唯一阶段或唯一 Action
- **THEN** `diagnose` MUST 返回 reason=`ambiguous-state`

### Requirement: 不持久化 currentAction

Policy MUST NOT 保存 `currentAction`、current pointer 或并列流程状态。每次调用 `next(snapshot)` 都 MUST 从正式事实重新计算。`ContinuationContext.nextAllowedAction` MUST 由 Policy 计算，MUST NOT 由 ContinuationContext 自身填充。

#### Scenario: next 每次从事实重新计算

- **WHEN** 多次调用 `next(snapshot)` 且 snapshot 相同
- **THEN** 每次结果 MUST 相同
- **AND** MUST NOT 依赖前次调用的内存状态

#### Scenario: nextAllowedAction 由 Policy 计算

- **WHEN** 构造 `ContinuationContext`
- **THEN** `nextAllowedAction` MUST 由 Policy `next` 计算
- **AND** MUST NOT 由 ContinuationContext 自身填充或维护

### Requirement: 语义前置条件不修改 B1 结构转换表

D1 MUST 在 B1 `states.ts` 结构转换边的基础上添加语义前置条件。D1 MUST NOT 修改 B1 的 `DELIVERY_STATE_TRANSITIONS`、`CHANGE_STATE_TRANSITIONS` 结构转换表。D1 MUST NOT 绕过 B1 `canTransition` 结构转换校验。结构转换是"能不能转"的物理边界，语义前置条件是"该不该转"的业务规则。

#### Scenario: 不修改 B1 结构转换表

- **WHEN** D1 实现 Action 前置条件
- **THEN** MUST NOT 修改 `src/domain/states.ts` 的结构转换表
- **AND** MUST 在结构转换之上添加语义前置条件

#### Scenario: 不绕过结构转换校验

- **WHEN** D1 判断 Action 可执行性
- **AND** 结构转换不允许该状态转换
- **THEN** D1 MUST NOT 通过语义前置条件绕过结构转换校验
- **AND** `canRun` MUST 返回 `allowed: false`

### Requirement: 不自创 Action 或状态

D1 MUST 使用 B1 Change-only `CHANGE_ACTIONS` / `ACTION_CATALOG` 的固定 Action Catalog，MUST NOT 自创 Action。D1 MUST 使用 B1 `DeliveryState`、`ChangeState`、`RunStatus` 状态枚举，MUST NOT 自创状态。`review` 和 `revise` 是统一执行入口，不是正式 Action。

#### Scenario: 使用 B1 固定 Action Catalog

- **WHEN** D1 引用 Action
- **THEN** MUST 引用 B1 Change-only `CHANGE_ACTIONS` / `ACTION_CATALOG` 中的 Action
- **AND** MUST NOT 定义新的 Action 值

#### Scenario: review 和 revise 不是正式 Action

- **WHEN** D1 解析统一入口 `review` 或 `revise`
- **THEN** MUST 解析为具体的 `review-S` 或 `revise-S` 正式 Action
- **AND** `review` 和 `revise` 自身 MUST NOT 出现在 B1 Action Catalog 中

### Requirement: failed/cancelled Run 可重试

当最新 terminal Run 的 status 为 `failed` 或 `cancelled` 时，同一 Action MUST 可重试，MUST NOT 要求 owner 重新授权（授权 scope 仍在）。重试执行同一 Action，不改变阶段或 Action 类型。

#### Scenario: failed Run 可重试

- **WHEN** 最新 terminal Run status = failed
- **THEN** `next` MUST 返回 `action: <same-action>`
- **AND** MUST NOT 要求 owner 重新授权

#### Scenario: cancelled Run 可重试

- **WHEN** 最新 terminal Run status = cancelled
- **THEN** `next` MUST 返回 `action: <same-action>`
- **AND** MUST NOT 要求 owner 重新授权

### Requirement: 阶段识别从 Run 历史

D1 MUST 从 active Change 的全部 completed Run（按 Run ID 排序）识别当前活跃阶段。遍历全部 completed Run 按 Run ID 降序，第一个属于 {explore, revise-explore, review-explore} 的 Run → explore 阶段；第一个属于 {propose, revise-propose, review-propose} 的 Run → propose 阶段；第一个属于 {apply, revise-apply, review-apply} 的 Run → apply 阶段；第一个属于 {archive} 的 Run → archive 阶段。无 completed Run → explore 阶段（刚激活）。

#### Scenario: 从 Run 历史识别 explore 阶段

- **WHEN** 按 Run ID 降序遍历 completed Run
- **AND** 第一个匹配的 Run 属于 {explore, revise-explore, review-explore}
- **THEN** 当前活跃阶段 MUST 为 explore

#### Scenario: 从 Run 历史识别 propose 阶段

- **WHEN** 按 Run ID 降序遍历 completed Run
- **AND** 第一个匹配的 Run 属于 {propose, revise-propose, review-propose}
- **THEN** 当前活跃阶段 MUST 为 propose

#### Scenario: 无 completed Run 时 explore 阶段

- **WHEN** active Change 无 completed Run
- **THEN** 当前活跃阶段 MUST 为 explore
- **AND** 表示 Change 刚激活

### Requirement: D1 不实现 CLI 和执行循环

D1 MUST NOT 实现诊断 CLI（status / next / doctor / resume-context）、完整 Change 创建和执行循环、OpenSpec apply/archive 集成、Review/Findings 写入闭环、Change Verification 调度、actualChangeSet 计算、自动 Commit/Push/Merge。这些属于后续 Change（E1、F1 等）。

#### Scenario: 不实现诊断 CLI

- **WHEN** D1 交付
- **THEN** MUST NOT 实现 `flowkit status`、`flowkit next`、`flowkit doctor`、`flowkit resume-context` 命令
- **AND** CLI 展示属 E1

#### Scenario: 不实现自动 Commit/Push/Merge

- **WHEN** D1 交付
- **THEN** MUST NOT 实现自动 Git Commit、Push 或 Merge
- **AND** Git 操作由 owner 通过 flowkit-git-workflow skill 授权执行

### Requirement: Tasks completion fact 接通既有 Archive gate

Policy MUST 从 `FormalFactSnapshot.changeTasksComplete` 消费当前 active Change 的最小 Tasks completion fact，并保留 D1 已冻结的 Archive 前置条件：事实不可用不得 Archive，required tasks 未全部完成不得 Archive，全部完成后才继续评估 archive owner authorization。Policy MUST NOT 从 Run 历史、OpenSpec artifact existence、Verification 正文或聊天推断 Tasks completion。

#### Scenario: Tasks completion fact 不可用
- **WHEN** apply lineage match + approved 且 Verification gate satisfied
- **AND** `snapshot.changeTasksComplete` 为 undefined
- **THEN** `next` MUST 返回 `blocked: tasks-facts-unavailable`
- **AND** `canRun(snapshot, 'archive')` MUST 为 `allowed: false` 且包含 `tasks-facts-unavailable`

#### Scenario: Required Tasks 未完成
- **WHEN** apply lineage match + approved 且 Verification gate satisfied
- **AND** `snapshot.changeTasksComplete=false`
- **THEN** `next` MUST 返回 `blocked: tasks-incomplete`
- **AND** `canRun(snapshot, 'archive')` MUST 为 `allowed: false` 且包含 `tasks-incomplete`
- **AND** MUST NOT 把该状态误报为 `tasks-facts-unavailable`

#### Scenario: Required Tasks 全部完成
- **WHEN** apply lineage match + approved 且 Verification gate satisfied
- **AND** `snapshot.changeTasksComplete=true`
- **THEN** Tasks gate MUST satisfied
- **AND** 若无 archive authorization，`next` MUST 进入 `owner-decision: authorize-archive`
- **AND** 若已有 archive authorization，`canRun(snapshot, 'archive')` MUST 允许继续执行 archive

#### Scenario: tasks-incomplete 不是新 lifecycle state
- **WHEN** Policy 返回 `tasks-incomplete`
- **THEN** 它 MUST 仅作为 blocked diagnosis / unmet precondition
- **AND** MUST NOT 新增 Task state machine、Action 或 registry

### Requirement: Policy dependency resolution 必须按 Change.id

Policy 的 dependency completion 判断 MUST 将 `Change.dependsOn` 每个值解析为同 Delivery 的 `Change.id`。Unknown id、dependency 未 completed 或 identity ambiguity MUST fail closed；Policy MUST NOT 使用 Change.key 代替 persisted dependency id。

#### Scenario: 真实 Manifest shape 可进入 activation decision
- **WHEN** Q1 的 `key=Q1`、`id=core-contract-alignment`、state=completed
- **AND** A1 `dependsOn=[core-contract-alignment]` 且无其它阻塞
- **THEN** Policy MUST 认为 dependency completed
- **AND** MUST NOT 返回 `dependency-incomplete:Q1`

### Requirement: Owner authorization gate 必须按 Delivery 与 Change applicability 匹配

Policy MUST 只消费与 current Delivery、current decision 以及适用 target Change.id 匹配的 Owner authorization fact。Change-scoped apply/archive/activation/checkpoint record MUST 不得授权其它 Change；Delivery-scoped Full Test/Finalize record MUST 不得跨 Delivery。Record presence 只关闭已有合法 Owner gate，MUST NOT 自动调度 Action、re-review、Git boundary 或 Delivery behavior。

#### Scenario: A1 apply auth 不授权 B1
- **WHEN** snapshot 只有 `authorize-apply` for `changeId=A1-id`
- **AND** current apply gate 属 `changeId=B1-id`
- **THEN** Policy MUST 视为 B1 apply authorization 缺失
- **AND** MUST 返回对应 owner-decision 而不是允许 apply

### Requirement: Authorization-only write admission 必须精确匹配 current Owner decision boundary

A1 write-side 在持久化 authorization-only record 前 MUST 使用 current Policy 结果作为合法性 gate：结果必须是 `owner-decision`，requested decision 必须与 record decision 相同，且 Change-scoped canonical Change.id 或 Delivery-scoped Delivery.id target 必须完全匹配。Policy 本身仍为 pure decision authority，不执行 persistence；service/CLI MUST 消费该结果而不得复制一套 lifecycle decision tree。

#### Scenario: future gate 不能提前授权
- **WHEN** Policy 当前没有请求 `authorize-apply` for Change A
- **THEN** A1 MUST NOT 因为未来可能到达 Apply gate 而允许写入该 record
- **AND** current Manifest MUST 保持不变

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

#### Scenario: pending Run存在时不复制 Policy推进

- **WHEN** `next` 或 `review` 已经由 Policy 解析 concrete Action
- **AND** current Change 存在 pending Run
- **THEN** new preparation MUST 返回 `exact-resume-required` 与 persisted target identity
- **AND** MUST NOT 调用另一 Policy intent、隐式恢复 target、推导下一 Stage/Action 或创建新 NNN
- **AND** continuation MUST 只通过 `resumeRun(expectedRunId)` 绑定该 persisted Run identity

#### Scenario: concrete caller-selected Action 被拒绝

- **WHEN** caller 绕过 bounded intent 直接要求 `review-propose`、`apply` 或其它 Action
- **THEN** B1 high-level new preparation MUST 拒绝

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
