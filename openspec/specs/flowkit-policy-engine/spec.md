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
- **AND** `action` 不在 B1 `CHANGE_ACTIONS` 或 `DELIVERY_ACTIONS` 中
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

`next(snapshot)` MUST 返回 `PolicyResult` 互斥联合类型：`action`（唯一合法 Action）、`owner-decision`（需 owner 授权）、`blocked`（无法推进）。`snapshot.conflicts` 非空时 MUST 返回 `blocked`。无 active Delivery 时 MUST 返回 `blocked`。有 active Change 时按 Change 生命周期决策树计算；**无 active Change 时 MUST 先判断是否存在已 completed 但尚未形成 Change Checkpoint 的 Change，若唯一则进入 `owner-decision: authorize-checkpoint`，Checkpoint 完成后才继续下一 Change 激活或 Delivery-level 流程。** 多解或歧义时 MUST 返回 `blocked`。

#### Scenario: PolicyResult 为互斥联合类型

- **WHEN** 调用 `next(snapshot)`
- **THEN** 返回值 MUST 恰好为以下之一：`{ kind: 'action', action }`、`{ kind: 'owner-decision', decision, context }`、`{ kind: 'blocked', diagnosis }`
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
- **AND** Git authority 尚无该 Change 的 `change-checkpoint` boundary
- **THEN** `next(snapshot)` MUST 返回 `owner-decision: authorize-checkpoint`
- **AND** context MUST 标识该 completed Change
- **AND** MUST NOT 通过重新投影该 Change 的历史 Runs 获得此结论

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

### Requirement: Review/Revision lineage by reviewed Run

Policy MUST 使用 reviewed-Run lineage 追踪 Review/Revision 循环，MUST NOT 使用"禁止任何已完成的 review-*"的存在性规则。对每个阶段 S ∈ {explore, propose, apply}：Current Artifact Run = latest completed Run with action ∈ {S, revise-S}；Current Review = latest completed review-S Run；Lineage match = Current Review ≠ null 且 Current Review.reviewedRunId == Current Artifact Run.runId。Lineage match + approved → 阶段完成；match + changes-requested → revise-S；no match → review-S。

#### Scenario: Current Artifact Run 为 null 时阶段未开始

- **WHEN** 阶段 S 的 Current Artifact Run 为 null
- **THEN** `next` MUST 返回 `action: S`（首次执行该阶段）

#### Scenario: Current Review 为 null 时需审查

- **WHEN** Current Artifact Run ≠ null
- **AND** Current Review = null
- **THEN** `next` MUST 返回 `action: review-S`
- **AND** 表示 Current Artifact Run 未被审阅

#### Scenario: Lineage match + approved 推进阶段

- **WHEN** Current Review.reviewedRunId == Current Artifact Run.runId
- **AND** Current Verdict = approved
- **THEN** 阶段 S 完成
- **AND** `next` MUST 推进到下一阶段（explore → propose；propose → owner-decision: authorize-apply）

#### Scenario: Lineage match + changes-requested 进入 revise

- **WHEN** Current Review.reviewedRunId == Current Artifact Run.runId
- **AND** Current Verdict = changes-requested
- **THEN** `next` MUST 返回 `action: revise-S`

#### Scenario: 无 Lineage match 时需审查新 artifact

- **WHEN** Current Review ≠ null
- **AND** Current Review.reviewedRunId ≠ Current Artifact Run.runId
- **THEN** `next` MUST 返回 `action: review-S`
- **AND** 表示 revise-S 产生的新 artifact 未被当前 review 覆盖

#### Scenario: 多轮 revise→review 循环正确支持

- **WHEN** 经历 explore → review(changes-requested) → revise-explore → review(changes-requested) → revise-explore → review(approved) 序列
- **THEN** 每步的 `next` 结果 MUST 与 lineage 模型一致
- **AND** revise-S 完成后 Current Artifact Run 更新为 revise-S Run
- **AND** Current Review 仍指向前一 artifact → no match → review-S 可再执行
- **AND** 最终 review(approved) 的 reviewedRunId 匹配最新 revise-S Run → 阶段完成

### Requirement: Change-level Action 前置条件矩阵

D1 MUST 为全部 10 个 Change-level Action 定义语义前置条件。对每个阶段 S ∈ {explore, propose, apply}，`review-S` MUST 仅在 Current Artifact Run ≠ null 且（Current Review=null OR Current Review.reviewedRunId ≠ Current Artifact Run.runId）时 allowed——即存在未被当前 review 覆盖的 artifact。当 lineage match 且 Current Verdict=changes-requested 时，`canRun(review-S)` MUST 返回 `allowed: false`，此时唯一合法 Action 是 `revise-S`。`explore` 需 Change state=active 且 explore 阶段 Current Artifact Run=null。`revise-S` 需 lineage match + changes-requested。`propose` 需 explore 阶段 lineage match + approved 且 propose 阶段 Current Artifact Run=null。`apply` 需 propose 阶段 lineage match + approved 且 `ownerAuthorizations` 包含 apply scope。`review-apply` 需 apply 阶段 Current Artifact Run ≠ null 且（Current Review=null OR 无 lineage match）且 Change Verification 事实可用且为 passed 或 not-applicable。`archive` 需 apply 阶段 lineage match + approved、blocking findings=0、Verification 事实可用且为 passed 或 not-applicable、Tasks 事实可用且全部完成、`ownerAuthorizations` 包含 archive scope。C1 `FormalFactSnapshot` 当前不携带 Tasks 完成状态（`openSpecArtifacts` 仅暴露 `change-tasks` 存在性，无 completion 字段），D1 MUST NOT 从 Run 历史、OpenSpec 产物存在性或聊天历史推断 Tasks 完成状态；Tasks 完成事实不可用时 `canRun(snapshot, 'archive')` MUST 返回 `allowed: false` 且 `unmetPreconditions` 包含 `tasks-facts-unavailable`，`next` MUST 返回 `blocked: tasks-facts-unavailable`（D1-11）。

#### Scenario: explore 前置条件

- **WHEN** 校验 `canRun(snapshot, 'explore')`
- **AND** Change state=active
- **AND** explore 阶段 Current Artifact Run = null
- **THEN** 前置条件满足

#### Scenario: review-explore 允许在无 lineage match 时执行

- **WHEN** 校验 `canRun(snapshot, 'review-explore')`
- **AND** Current Artifact Run ≠ null
- **AND** Current Review = null OR Current Review.reviewedRunId ≠ Current Artifact Run.runId
- **THEN** 前置条件满足
- **AND** 已完成的 review-explore Run 历史 MUST NOT 禁止再次 review-explore

#### Scenario: review-S 在 match+changes-requested 时拒绝

- **WHEN** 校验 `canRun(snapshot, 'review-S')`（S ∈ {explore, propose, apply}）
- **AND** Current Review ≠ null
- **AND** Current Review.reviewedRunId == Current Artifact Run.runId（lineage match）
- **AND** Current Verdict = changes-requested
- **THEN** MUST 返回 `allowed: false`
- **AND** `unmetPreconditions` MUST 包含 `matching-changes-requested-requires-revision`
- **AND** 此时唯一合法 Action 是 `revise-S`

#### Scenario: review-propose 允许在无 lineage match 时执行

- **WHEN** 校验 `canRun(snapshot, 'review-propose')`
- **AND** propose 阶段 Current Artifact Run ≠ null
- **AND** Current Review (propose) = null OR Current Review.reviewedRunId ≠ Current Artifact Run.runId
- **THEN** 前置条件满足

#### Scenario: review-apply 允许在无 lineage match 时执行

- **WHEN** 校验 `canRun(snapshot, 'review-apply')`
- **AND** apply 阶段 Current Artifact Run ≠ null
- **AND** Current Review (apply) = null OR Current Review.reviewedRunId ≠ Current Artifact Run.runId
- **AND** Change Verification 事实可用且为 passed 或 not-applicable
- **THEN** 前置条件满足

#### Scenario: revise-explore 需 lineage match + changes-requested

- **WHEN** 校验 `canRun(snapshot, 'revise-explore')`
- **AND** Current Review ≠ null
- **AND** Current Review.reviewedRunId == Current Artifact Run.runId
- **AND** Current Verdict = changes-requested
- **THEN** 前置条件满足

#### Scenario: propose 需 explore approved

- **WHEN** 校验 `canRun(snapshot, 'propose')`
- **AND** explore 阶段 lineage match + approved
- **AND** propose 阶段 Current Artifact Run = null
- **THEN** 前置条件满足

#### Scenario: apply 需 propose approved + owner 授权

- **WHEN** 校验 `canRun(snapshot, 'apply')`
- **AND** propose 阶段 lineage match + approved
- **AND** `snapshot.ownerAuthorizations` 包含 apply scope
- **THEN** 前置条件满足
- **AND** `ownerAuthorizations` 无 apply scope 时 `next` 返回 `owner-decision: authorize-apply`

#### Scenario: review-apply 需 Verification 事实可用且为 passed 或 not-applicable

- **WHEN** 校验 `canRun(snapshot, 'review-apply')`
- **AND** apply 阶段 Current Artifact Run ≠ null
- **AND** Current Review (apply) = null OR Current Review.reviewedRunId ≠ Current Artifact Run.runId
- **AND** Change Verification 事实可用且为 passed 或 not-applicable
- **THEN** 前置条件满足
- **AND** Verification 事实不可用时 `next` 返回 `blocked: verification-facts-unavailable`

#### Scenario: archive 需 apply approved + findings 清零 + Verification 为 passed 或 not-applicable + Tasks 完成 + owner 授权

- **WHEN** 校验 `canRun(snapshot, 'archive')`
- **AND** apply 阶段 lineage match + approved
- **AND** blocking findings = 0
- **AND** Change Verification 事实可用且为 passed 或 not-applicable
- **AND** Tasks 完成事实可用且全部完成
- **AND** `snapshot.ownerAuthorizations` 包含 archive scope
- **THEN** 前置条件满足

#### Scenario: Tasks 完成事实不可用时 archive blocked

- **WHEN** 校验 `canRun(snapshot, 'archive')`
- **AND** apply 阶段 lineage match + approved
- **AND** Change Verification 事实可用且为 passed 或 not-applicable
- **AND** Tasks 完成事实不可用（snapshot 无 task-completion 字段）
- **THEN** MUST 返回 `allowed: false`
- **AND** `unmetPreconditions` MUST 包含 `tasks-facts-unavailable`
- **AND** `next` MUST 返回 `blocked: tasks-facts-unavailable`
- **AND** MUST NOT 从 Run 历史、OpenSpec 产物存在性或聊天历史推断 Tasks 完成状态

### Requirement: Delivery-level Action 前置条件

D1 MUST 为 `full-test` 和 `delivery-finalize` 两个 Delivery-level Action 定义语义前置条件。`full-test` MUST 要求所有 required Changes completed 且 checkpointed、`snapshot.ownerAuthorizations` 包含 full-test scope、`snapshot.deliveryFullTestStatus` = `authorized`（frozen `verification-model.md` Section 4.2：owner 明确授权后进入 `authorized`，"未 authorized 时不得执行 Full Test"；`awaiting-user-decision` 是授权前状态，MUST NOT 允许 `full-test`，`next` 返回 `owner-decision: authorize-full-test`；`failed` 按 Section 6 要求 blocked；`passed` 表示 Full Test 已完成；`not-ready` 表示 required Changes 尚未全部 completed）（D1-13）。`delivery-finalize` MUST 要求所有 required Changes completed、所有 Change Checkpoint 完成、`snapshot.deliveryFullTestStatus` = passed、`snapshot.ownerAuthorizations` 包含 finalize scope。B1 `FullTestStatus` 枚举为 `not-ready | awaiting-user-decision | authorized | passed | failed`，不含 `not-applicable`（`not-applicable` 属 Change `VerificationStatus`，不可与 Delivery `FullTestStatus` 混淆）；任意非 `passed` 值（含 `undefined`）MUST 使 `canRun(snapshot, 'delivery-finalize')` 返回 `allowed: false`（D1-12）。

#### Scenario: full-test 前置条件

- **WHEN** 校验 `canRun(snapshot, 'full-test')`
- **AND** 所有 required Changes state=completed 且已 checkpointed
- **AND** `snapshot.ownerAuthorizations` 包含 full-test scope
- **AND** `snapshot.deliveryFullTestStatus` = `authorized`
- **THEN** 前置条件满足

#### Scenario: full-test 在 awaiting-user-decision 时拒绝

- **WHEN** 校验 `canRun(snapshot, 'full-test')`
- **AND** `snapshot.deliveryFullTestStatus` = `awaiting-user-decision`
- **THEN** MUST 返回 `allowed: false`
- **AND** `unmetPreconditions` MUST 包含 `full-test-not-authorized`
- **AND** `next` MUST 返回 `{ kind: 'owner-decision', decision: 'authorize-full-test' }`（当 `ownerAuthorizations` 无 full-test scope）
- **AND** MUST NOT 返回 `action: full-test`（frozen `verification-model.md` Section 4.2：owner 明确授权后才能进入 `authorized`，`awaiting-user-decision` 是授权前状态，"未 authorized 时不得执行 Full Test"）

#### Scenario: full-test 在 failed 时拒绝并返回 blocked

- **WHEN** 校验 `canRun(snapshot, 'full-test')`
- **AND** `snapshot.deliveryFullTestStatus` = `failed`
- **THEN** MUST 返回 `allowed: false`
- **AND** `unmetPreconditions` MUST 包含 `full-test-already-failed`
- **AND** `next` MUST 返回 `{ kind: 'blocked', diagnosis: { reason: 'full-test-failed' } }`
- **AND** `suggestedOwnerActions` MUST 列出 owner 的合法选择（授权创建 corrective Change 或取消 Delivery）
- **AND** MUST NOT 返回 `action: full-test`（frozen `verification-model.md` Section 6：`fullTestStatus` 保持 `failed`，只有 owner 授权 corrective Change 后才返回 `not-ready`）

#### Scenario: full-test 在 passed 时拒绝

- **WHEN** 校验 `canRun(snapshot, 'full-test')`
- **AND** `snapshot.deliveryFullTestStatus` = `passed`
- **THEN** MUST 返回 `allowed: false`
- **AND** `unmetPreconditions` MUST 包含 `full-test-already-passed`
- **AND** MUST NOT 再次执行 `full-test`（Full Test 已通过，应推进到 `delivery-finalize`）

#### Scenario: delivery-finalize 前置条件

- **WHEN** 校验 `canRun(snapshot, 'delivery-finalize')`
- **AND** 所有 required Changes state=completed
- **AND** 所有 Change Checkpoint 完成
- **AND** `snapshot.deliveryFullTestStatus` = passed
- **AND** `snapshot.ownerAuthorizations` 包含 finalize scope
- **THEN** 前置条件满足

#### Scenario: delivery-finalize 在非 passed FullTestStatus 时拒绝

- **WHEN** 校验 `canRun(snapshot, 'delivery-finalize')`
- **AND** `snapshot.deliveryFullTestStatus` ∈ {`not-ready`, `awaiting-user-decision`, `authorized`, `failed`, `undefined`}
- **THEN** MUST 返回 `allowed: false`
- **AND** `unmetPreconditions` MUST 包含 `full-test-not-passed`
- **AND** MUST NOT 接受 `not-applicable` 作为 FullTestStatus（B1 `FullTestStatus` 无此值；`not-applicable` 仅属 Change `VerificationStatus`）

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

当 Policy 返回 `owner-decision` 时，Flowkit MUST 停在 owner 决策边界，MUST NOT 自动推进。owner-decision 场景包括：activate-change（无 active Change 且有可激活 planned required Change）、authorize-apply（review-propose approved，等待 apply 授权）、authorize-archive（review-apply approved，等待 archive 授权）、authorize-full-test（所有 required Changes completed，`deliveryFullTestStatus` = `awaiting-user-decision`，等待 owner 授权 full-test scope）、authorize-delivery-finalize（Full Test passed，所有条件满足）。owner-decision 不是 blocked——系统已确定唯一需要的 Action，但需要 owner 授权。`full-test-failed`（`deliveryFullTestStatus` = `failed`）不属 owner-decision——owner 有多个合法选择（corrective Change 或取消），系统无法确定唯一 Action，故返回 `blocked: full-test-failed` 并在 `suggestedOwnerActions` 列出选项（D1-13）。

#### Scenario: 无 active Change 且有可激活 Change

- **WHEN** `next(snapshot)` 计算
- **AND** 无 active Change
- **AND** 有 planned required Change 且 dependencies 满足
- **THEN** MUST 返回 `{ kind: 'owner-decision', decision: 'activate-change' }`

#### Scenario: review-propose approved 等待 apply 授权

- **WHEN** propose 阶段 lineage match + approved
- **AND** `snapshot.ownerAuthorizations` 无 apply scope
- **THEN** MUST 返回 `{ kind: 'owner-decision', decision: 'authorize-apply' }`
- **AND** MUST NOT 自动执行 apply

#### Scenario: review-apply approved 等待 archive 授权

- **WHEN** apply 阶段 lineage match + approved
- **AND** Verification 为 passed 或 not-applicable
- **AND** `snapshot.ownerAuthorizations` 无 archive scope
- **THEN** MUST 返回 `{ kind: 'owner-decision', decision: 'authorize-archive' }`
- **AND** MUST NOT 自动执行 archive

#### Scenario: 所有 required completed 等待 full-test 授权

- **WHEN** 所有 required Changes state=completed
- **AND** `snapshot.deliveryFullTestStatus` = `awaiting-user-decision`
- **AND** `snapshot.ownerAuthorizations` 无 full-test scope
- **THEN** MUST 返回 `{ kind: 'owner-decision', decision: 'authorize-full-test' }`

#### Scenario: Full Test passed 等待 finalize 授权

- **WHEN** Full Test passed
- **AND** 所有条件满足
- **AND** `snapshot.ownerAuthorizations` 无 finalize scope
- **THEN** MUST 返回 `{ kind: 'owner-decision', decision: 'authorize-delivery-finalize' }`

### Requirement: ownerAuthorizations 空数组时 owner-decision

`snapshot.ownerAuthorizations` 字段在 C1 契约中存在。当 Reader 返回空数组（当前占位行为）时，所有 authorization-gated actions（apply、archive、full-test、delivery-finalize）MUST 返回 `owner-decision`。这是正确的 fail-closed 行为——授权门控正常工作，只是在 C1 Reader 扩展填充前始终要求 owner 授权。空数组 MUST NOT 产生 `blocked`。

#### Scenario: 空数组时 authorization-gated actions 返回 owner-decision

- **WHEN** `snapshot.ownerAuthorizations` 为空数组
- **AND** 存在可推进的 authorization-gated 场景（如 review-propose approved）
- **THEN** `next` MUST 返回 `{ kind: 'owner-decision', ... }`
- **AND** MUST NOT 返回 `blocked`

#### Scenario: 包含对应 scope 时正常推进

- **WHEN** `snapshot.ownerAuthorizations` 包含对应 scope
- **AND** 其他前置条件满足
- **THEN** authorization-gated action 的 `canRun` MUST 返回 `allowed: true`

#### Scenario: 空数组不产生 blocked

- **WHEN** `snapshot.ownerAuthorizations` 为空数组
- **THEN** 空数组本身 MUST NOT 导致 `blocked`
- **AND** blocked 的原因 MUST 是其他事实（冲突、事实缺失、歧义等）

### Requirement: Verification 事实不可用时 blocked

C1 `FormalFactSnapshot` 当前不携带 Change Verification status。D1 对 verification-gated actions（`review-apply`、`archive`）MUST NOT 从 Run 历史、OpenSpec 产物存在性或聊天历史推断 Verification status。Verification 事实不可用时 MUST 返回 `blocked: verification-facts-unavailable`。`verification-facts-unavailable` MUST 与 `verification-failed` 和 `verification-not-run` 区分——前者表示事实不可用（snapshot 固有限制），后两者表示事实可用但结果不通过。

#### Scenario: Verification 事实不可用时 review-apply blocked

- **WHEN** apply 阶段 Current Artifact Run ≠ null
- **AND** Change Verification 事实不可用（snapshot 无 verification status）
- **THEN** `next` MUST 返回 `{ kind: 'blocked', diagnosis: { reason: 'verification-facts-unavailable' } }`
- **AND** `canRun(snapshot, 'review-apply')` MUST 返回 `allowed: false` 且 `unmetPreconditions` 包含 `verification-facts-unavailable`

#### Scenario: Verification 事实不可用时 archive blocked

- **WHEN** apply 阶段 lineage match + approved
- **AND** Change Verification 事实不可用
- **THEN** `next` MUST 返回 `blocked: verification-facts-unavailable`
- **AND** `canRun(snapshot, 'archive')` MUST 返回 `allowed: false`

#### Scenario: 不从 Run 历史推断 Verification

- **WHEN** Policy 计算 verification-gated action 的前置条件
- **AND** snapshot 无 Verification status 字段
- **THEN** MUST NOT 从 Run 历史推断 Verification status
- **AND** MUST NOT 从 OpenSpec 产物存在性推断 Verification status
- **AND** MUST NOT 从聊天历史或 `.tmp` 推断任何正式事实

#### Scenario: verification-facts-unavailable 与 verification-failed 区分

- **WHEN** 生成 blocked diagnosis
- **AND** Verification 事实不可用
- **THEN** reason MUST 为 `verification-facts-unavailable`
- **AND** MUST NOT 为 `verification-failed` 或 `verification-not-run`
- **AND** `verification-failed` 和 `verification-not-run` 仅在事实可用但结果不通过时适用（未来 change 扩展 snapshot 后）

### Requirement: 统一 review/revise 入口解析

`review` 和 `revise` 不是正式 Action。Policy MUST 根据正式事实将 `review` 唯一解析为具体 `review-S`，将 `revise` 唯一解析为具体 `revise-S`。`review` 入口：确定当前活跃阶段 S，检查 `canRun(review-S)` 是否 allowed，allowed → 解析为 `review-S`，not allowed → blocked。`revise` 入口：确定当前活跃阶段 S，检查 Current Verdict = changes-requested 且 lineage match → 解析为 `revise-S`，否则 blocked。无法唯一解析时返回 blocked。

#### Scenario: review 入口解析为当前阶段 review-S

- **WHEN** 解析统一入口 `review`
- **AND** 当前活跃阶段为 S
- **AND** `canRun(review-S)` allowed
- **THEN** MUST 解析为 `review-S`

#### Scenario: review 入口在无对应阶段时 blocked

- **WHEN** 解析统一入口 `review`
- **AND** 当前无活跃阶段或 `canRun(review-S)` not allowed
- **THEN** MUST 返回 `blocked`

#### Scenario: 统一 review 在 match+changes-requested 时 blocked

- **WHEN** 解析统一入口 `review`
- **AND** 当前活跃阶段为 S
- **AND** lineage match 且 Current Verdict = changes-requested
- **THEN** `canRun(review-S)` MUST 返回 `allowed: false`
- **AND** 统一 review MUST 返回 `blocked`
- **AND** 此时唯一合法 Action 是 `revise-S`
- **AND** 统一 review 保持 blocked 直到 revise-S 完成产生新 artifact

#### Scenario: 统一 review 在 revise-S 完成后恢复 allowed

- **WHEN** 解析统一入口 `review`
- **AND** revise-S 已完成，Current Artifact Run 更新为 revise-S Run
- **AND** Current Review.reviewedRunId ≠ Current Artifact Run.runId（no match）
- **THEN** `canRun(review-S)` MUST 返回 `allowed: true`
- **AND** 统一 review MUST 解析为 `review-S`

#### Scenario: revise 入口解析为当前阶段 revise-S

- **WHEN** 解析统一入口 `revise`
- **AND** 当前活跃阶段为 S
- **AND** Current Verdict = changes-requested
- **AND** lineage match
- **THEN** MUST 解析为 `revise-S`

#### Scenario: revise 入口在无有效 changes-requested 时 blocked

- **WHEN** 解析统一入口 `revise`
- **AND** 无 changes-requested verdict 或 verdict 已被 superseded
- **THEN** MUST 返回 `blocked`

### Requirement: diagnose 生成 blocked diagnosis

`diagnose(snapshot)` MUST 返回 `BlockedDiagnosis`，包含 `reason`、`unmetPreconditions`、`conflicts`、`suggestedOwnerActions`。`diagnose` 是 `next` 的诊断变体——当 `next` 返回 `blocked` 时，`diagnose` 提供更详细的原因和建议。`diagnose` MUST NOT 返回 `action` 或 `owner-decision`，只返回 blocked 信息。

#### Scenario: diagnose 返回 blocked diagnosis

- **WHEN** 调用 `diagnose(snapshot)`
- **AND** `next(snapshot)` 返回 `blocked`
- **THEN** MUST 返回 `BlockedDiagnosis`
- **AND** MUST 包含 `reason`、`unmetPreconditions`、`conflicts`、`suggestedOwnerActions`

#### Scenario: diagnose 不返回 action 或 owner-decision

- **WHEN** 调用 `diagnose(snapshot)`
- **THEN** MUST 只返回 blocked 信息
- **AND** MUST NOT 返回 `action` 或 `owner-decision`

#### Scenario: blocked diagnosis 包含建议的 owner actions

- **WHEN** `diagnose` 生成 blocked diagnosis
- **AND** blocked 原因可通过 owner action 缓解（如授权）
- **THEN** `suggestedOwnerActions` MUST 列出建议的 owner actions

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

D1 MUST 使用 B1 `CHANGE_ACTIONS` 和 `DELIVERY_ACTIONS` 的固定 Action Catalog，MUST NOT 自创 Action。D1 MUST 使用 B1 `DeliveryState`、`ChangeState`、`RunStatus` 状态枚举，MUST NOT 自创状态。`review` 和 `revise` 是统一执行入口，不是正式 Action。

#### Scenario: 使用 B1 固定 Action Catalog

- **WHEN** D1 引用 Action
- **THEN** MUST 引用 B1 `CHANGE_ACTIONS` 或 `DELIVERY_ACTIONS` 中的 Action
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

