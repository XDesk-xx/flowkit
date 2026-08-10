# Tasks: D1 — policy-engine

## 1. Policy 专属类型

- [x]1.1 创建 `src/policy/types.ts`：定义 `CanRunResult` 接口（`action`、`allowed`、`unmetPreconditions`、`conflictDimensions`）
- [x]1.2 定义 `PolicyResult` 互斥联合类型（`action` | `owner-decision` | `blocked`）
- [x]1.3 定义 `OwnerDecision` 类型（`activate-change` | `authorize-apply` | `authorize-archive` | `authorize-full-test` | `authorize-delivery-finalize`）
- [x]1.4 定义 `OwnerDecisionContext` 接口（提供 owner 决策所需上下文）
- [x]1.5 定义 `BlockedDiagnosis` 接口（`reason`、`unmetPreconditions`、`conflicts`、`suggestedOwnerActions`）
- [x]1.6 定义 `BlockedReason` 枚举/联合（`formal-fact-conflict` | `no-active-delivery` | `no-actionable-change` | `verification-facts-unavailable` | `verification-failed` | `verification-not-run` | `tasks-facts-unavailable` | `ambiguous-state` | `dependency-incomplete` | `full-test-failed`）
- [x]1.7 全部类型为 `readonly`，不可变

## 2. Lineage 模型（D1-8）

- [x]2.1 创建 `src/policy/lineage.ts`：实现 reviewed-Run lineage 追踪
- [x]2.2 实现 `currentArtifactRun(runs, stage)`：返回 latest completed Run with action ∈ {S, revise-S}
- [x]2.3 实现 `currentReview(runs, reviewVerdicts, stage)`：返回 latest completed review-S Run
- [x]2.4 实现 `lineageMatch(currentReview, currentArtifactRun)`：判断 reviewedRunId == currentArtifactRun.runId
- [x]2.5 lineage 函数为纯函数，只读 snapshot 字段
- [x]2.6 正确处理 null Current Artifact Run（阶段未开始）和 null Current Review（未审查）

## 3. 阶段识别

- [x]3.1 创建 `src/policy/stage-detector.ts`：从 Run 历史识别当前活跃阶段
- [x]3.2 遍历 active Change 的全部 completed Run，按 Run ID 降序
- [x]3.3 第一个属于 {explore, revise-explore, review-explore} → explore 阶段
- [x]3.4 第一个属于 {propose, revise-propose, review-propose} → propose 阶段
- [x]3.5 第一个属于 {apply, revise-apply, review-apply} → apply 阶段
- [x]3.6 第一个属于 {archive} → archive 阶段
- [x]3.7 无 completed Run → explore 阶段（刚激活）
- [x]3.8 检查最新 terminal Run 的 status：failed/cancelled → 同一 Action 重试
- [x]3.9 阶段识别为纯函数

## 4. Action 前置条件矩阵

- [x]4.1 创建 `src/policy/preconditions.ts`：实现全部 12 个 Action 的语义前置条件
- [x]4.2 实现 `explore` 前置条件：Change state=active；explore 阶段 Current Artifact Run=null；无 pending explore Run
- [x]4.3 实现 `review-explore` 前置条件：Current Artifact Run ≠ null；Current Review=null OR Current Review.reviewedRunId ≠ Current Artifact Run.runId（无 lineage match）；match+changes-requested 时返回 `allowed: false`（D1-10）
- [x]4.4 实现 `revise-explore` 前置条件：Current Review ≠ null；lineage match；Current Verdict=changes-requested
- [x]4.5 实现 `propose` 前置条件：explore 阶段 lineage match+approved；propose 阶段 Current Artifact Run=null
- [x]4.6 实现 `review-propose` 前置条件：propose 阶段 Current Artifact Run ≠ null；Current Review(propose)=null OR reviewedRunId ≠ Current Artifact Run.runId（无 lineage match）；match+changes-requested 时返回 `allowed: false`（D1-10）
- [x]4.7 实现 `revise-propose` 前置条件：lineage match；Current Verdict=changes-requested
- [x]4.8 实现 `apply` 前置条件：propose 阶段 lineage match+approved；`ownerAuthorizations` 含 apply scope；无 completed apply Run
- [x]4.9 实现 `review-apply` 前置条件：apply 阶段 Current Artifact Run ≠ null；Current Review(apply)=null OR reviewedRunId ≠ Current Artifact Run.runId（无 lineage match）；Verification 事实可用且为 passed 或 not-applicable（不可用 → unmet）；match+changes-requested 时返回 `allowed: false`（D1-10）
- [x]4.10 实现 `revise-apply` 前置条件：lineage match；Current Verdict=changes-requested
- [x]4.11 实现 `archive` 前置条件：apply 阶段 lineage match+approved；blocking findings=0；Verification 事实可用且为 passed 或 not-applicable；Tasks 完成事实可用且全部完成（不可用 → unmet `tasks-facts-unavailable`，D1-11）；`ownerAuthorizations` 含 archive scope
- [x]4.12 实现 `full-test` 前置条件：所有 required Changes completed+checkpointed；`ownerAuthorizations` 含 full-test scope；`deliveryFullTestStatus` = `authorized`（D1-13：frozen `verification-model.md` Section 4.2 "未 authorized 时不得执行 Full Test"；`awaiting-user-decision` 是授权前状态 → `allowed: false` + `full-test-not-authorized` + `next` 返回 `owner-decision: authorize-full-test`；MUST NOT 在 `failed`/`passed`/`not-ready`/`awaiting-user-decision` 时 allowed）
- [x]4.13 实现 `delivery-finalize` 前置条件：所有 required Changes completed；所有 Change Checkpoint 完成；`snapshot.deliveryFullTestStatus` = passed（任意非 passed 值含 undefined → unmet `full-test-not-passed`，D1-12；MUST NOT 接受 `not-applicable`——B1 `FullTestStatus` 无此值）；`ownerAuthorizations` 含 finalize scope
- [x]4.14 前置条件函数为纯函数，返回 unmetPreconditions 列表
- [x]4.15 实现 `canRun(review-S)` 在 lineage match + changes-requested 时返回 `allowed: false`（D1-10，全部 3 个阶段 S ∈ {explore, propose, apply}）；`unmetPreconditions` 含 `matching-changes-requested-requires-revision`
- [x]4.16 实现 `archive` 的 Tasks 完成门控（D1-11）：snapshot 无 task-completion 字段时 `canRun(archive)` 返回 `allowed: false` 且 `unmetPreconditions` 含 `tasks-facts-unavailable`；`next` 返回 `blocked: tasks-facts-unavailable`；MUST NOT 从 Run 历史 / `change-tasks` exists / 聊天推断 Tasks 完成状态；`tasks-facts-unavailable` 与 `verification-facts-unavailable` 同时存在时两者都列入 `unmetPreconditions`
- [x]4.17 实现 `delivery-finalize` 严格 `deliveryFullTestStatus = passed` 门控（D1-12）：任意非 passed 值（`not-ready`/`awaiting-user-decision`/`authorized`/`failed`/`undefined`）→ `allowed: false` 且 `unmetPreconditions` 含 `full-test-not-passed`；MUST NOT 接受 `not-applicable`（B1 `FullTestStatus` 无此值，`not-applicable` 仅属 Change `VerificationStatus`）
- [x]4.18 实现 `full-test` 的 `awaiting-user-decision`/`failed`/`passed` 拒绝与 `full-test-failed` blocked（D1-13）：`deliveryFullTestStatus = awaiting-user-decision` → `allowed: false` + `full-test-not-authorized` + `next` 返回 `owner-decision: authorize-full-test`（当无 full-test scope）；MUST NOT 返回 `action: full-test`（frozen Section 4.2 "未 authorized 时不得执行 Full Test"）；`deliveryFullTestStatus = failed` → `allowed: false` + `full-test-already-failed` + `next` 返回 `blocked: full-test-failed` + `suggestedOwnerActions` 列出 owner 合法选择（授权创建 corrective Change 或取消 Delivery）；MUST NOT 返回 `action: full-test`；MUST NOT 自动创建 corrective Change（frozen `verification-model.md` Section 6）；`deliveryFullTestStatus = passed` → `allowed: false` + `full-test-already-passed`；corrective Change 创建后 `fullTestStatus` 返回 `not-ready` 时 `next` MUST NOT 再返回 `blocked: full-test-failed`

## 5. canRun 实现

- [x]5.1 创建 `src/policy/can-run.ts`：实现 `canRun(snapshot, action): CanRunResult`
- [x]5.2 `snapshot.conflicts` 非空 → `allowed: false`，`conflictDimensions` 列出冲突维度
- [x]5.3 Action 不在 B1 `ACTION_CATALOG` → `allowed: false`，`unmetPreconditions: ['unknown-action']`
- [x]5.4 调用 `preconditions` 收集 Action 特定未满足条件
- [x]5.5 `allowed: true` 当且仅当 `unmetPreconditions` 为空且 `conflictDimensions` 为空
- [x]5.6 canRun 为纯函数

## 6. next 实现

- [x]6.1 创建 `src/policy/next.ts`：实现 `next(snapshot): PolicyResult` 决策树
- [x]6.2 `snapshot.conflicts` 非空 → `blocked`（冲突优先）
- [x]6.3 无 active Delivery → `blocked: no-active-delivery`
- [x]6.4 无 active Change 且有 planned required Change 且 dependencies 满足 → `owner-decision: activate-change`
- [x]6.5 无 active Change 且无可激活 Change → `blocked` 或 `owner-decision: authorize-delivery-finalize`
- [x]6.6 有 active Change → 调用 stage-detector 识别阶段，按 lineage 模型决策
- [x]6.7 explore 阶段：lineage match+approved → `action: propose`；match+changes-requested → `action: revise-explore`；no match → `action: review-explore`；null artifact → `action: explore`
- [x]6.8 propose 阶段：lineage match+approved → `owner-decision: authorize-apply`；match+changes-requested → `action: revise-propose`；no match → `action: review-propose`；null artifact → `action: propose`
- [x]6.9 apply 阶段：lineage match+approved → Verification 不可用 → `blocked: verification-facts-unavailable`；Verification 为 passed 或 not-applicable → `owner-decision: authorize-archive`；Verification 为 failed 或 not-run → `blocked`；match+changes-requested → `action: revise-apply`；no match → `action: review-apply`
- [x]6.10 archive 阶段：`owner-decision: authorize-checkpoint`（Git 边界）
- [x]6.11 最新 Run failed/cancelled → `action: <same-action>`（重试）
- [x]6.12 多解或歧义 → `blocked: ambiguous-state`
- [x]6.13 next 为纯函数，不持久化 currentAction

## 7. diagnose 实现

- [x]7.1 创建 `src/policy/diagnose.ts`：实现 `diagnose(snapshot): BlockedDiagnosis`
- [x]7.2 `diagnose` 是 `next` 的诊断变体，当 `next` 返回 blocked 时提供详细原因
- [x]7.3 `diagnose` 只返回 blocked 信息，MUST NOT 返回 action 或 owner-decision
- [x]7.4 生成对应 reason：`formal-fact-conflict`、`no-active-delivery`、`no-actionable-change`、`verification-facts-unavailable`、`verification-failed`、`verification-not-run`、`tasks-facts-unavailable`、`ambiguous-state`、`dependency-incomplete`、`full-test-failed`（`deliveryFullTestStatus = failed` 时返回，`suggestedOwnerActions` 列出 owner 合法选择：授权创建 corrective Change 或取消 Delivery；MUST NOT 自动重试 `full-test` 或自动创建 corrective Change，per D1-13 + frozen `verification-model.md` Section 6）
- [x]7.5 `suggestedOwnerActions` 列出可缓解 blocked 的 owner actions
- [x]7.6 diagnose 为纯函数

## 8. owner 决策边界 + blocked diagnosis

- [x]8.1 创建 `src/policy/owner-decision.ts`：owner-decision 类型与判断
- [x]8.2 创建 `src/policy/blocked-diagnosis.ts`：blocked diagnosis 类型与生成
- [x]8.3 `ownerAuthorizations` 空数组 → authorization-gated actions 返回 `owner-decision`（非 blocked）
- [x]8.4 `ownerAuthorizations` 含对应 scope → 正常推进
- [x]8.5 owner-decision 不可自动推进（D1-5）
- [x]8.6 blocked 与 owner-decision 严格区分（D1-9）

## 9. 统一 review/revise 入口解析

- [x]9.1 实现 `review` 统一入口解析：确定阶段 S → 检查 `canRun(review-S)` → 解析为 `review-S` 或 blocked
- [x]9.2 实现 `revise` 统一入口解析：确定阶段 S → 检查 Current Verdict=changes-requested + lineage match → 解析为 `revise-S` 或 blocked
- [x]9.3 无法唯一解析时返回 blocked
- [x]9.4 `review` 和 `revise` 自身不是正式 Action
- [x]9.5 表驱动测试：统一 review 在 match+changes-requested 时 blocked（`canRun(review-S)` allowed: false），revise-S 完成产生新 artifact（no match）后恢复 allowed

## 10. 单元测试 + 表驱动测试

- [x]10.1 创建 `tests/unit/policy/types.test.ts`：类型不可变性测试
- [x]10.2 创建 `tests/unit/policy/lineage.test.ts`：Current Artifact Run / Current Review / lineage match 计算
- [x]10.3 创建 `tests/unit/policy/stage-detector.test.ts`：阶段识别全部分支
- [x]10.4 创建 `tests/unit/policy/preconditions.test.ts`：12 个 Action 前置条件
- [x]10.5 创建 `tests/unit/policy/can-run.test.ts`：canRun 全部分支
- [x]10.6 创建 `tests/unit/policy/next.test.ts`：next 决策树全部分支
- [x]10.7 创建 `tests/unit/policy/diagnose.test.ts`：diagnose 全部 blocked reason
- [x]10.8 表驱动状态转换测试：每个 (snapshot, expected-next-action) 组合
- [x]10.9 冲突 fail-closed 测试：conflicts 非空时 next blocked、canRun allowed=false
- [x]10.10 单轮生命周期路径测试：explore → review(approved) → propose → review(approved) → apply → review(approved) → archive
- [x]10.11 多轮 Revision 闭环测试（每个阶段）：cr → revise → cr → revise → approved
- [x]10.12 Lineage 正确性测试：revise-S 完成后 no match → review-S allowed；review(approved) 后 match → 阶段完成
- [x]10.13 failed/cancelled Run 重试测试：不要求 owner 重新授权
- [x]10.14 Verification 事实不可用测试：review-apply/archive blocked；canRun unmetPreconditions 含 `verification-facts-unavailable`
- [x]10.15 Owner authorization 测试：空数组 → owner-decision（非 blocked）；含 scope → 正常推进
- [x]10.16 边界测试：无 active Delivery、无 active Change、依赖未完成、Full Test failed、多解/歧义
- [x]10.17 统一 review/revise 入口解析测试
- [x]10.18 不自创 Action/状态测试：使用 B1 catalog
- [x]10.19 纯函数测试：相同输入相同输出，无状态修改
- [x]10.20 表驱动测试（D1-10）：每个阶段 S ∈ {explore, propose, apply} 的 `canRun(review-S)` 在 match+changes-requested 时 `allowed: false`；统一 review 入口在此状态下 blocked；revise-S 完成后 no match → `canRun(review-S)` 恢复 `allowed: true` → 统一 review 解析为 review-S
- [x]10.21 表驱动测试（D1-11）：`canRun(archive)` 在 Tasks 完成事实不可用时 `allowed: false` 且 `unmetPreconditions` 含 `tasks-facts-unavailable`；`next` 返回 `blocked: tasks-facts-unavailable`；`diagnose` reason=`tasks-facts-unavailable` 且 ≠ `verification-facts-unavailable`；`tasks-facts-unavailable` + `verification-facts-unavailable` 同时存在时 `unmetPreconditions` 含两者；断言不从 `change-tasks` exists 推断完成
- [x]10.22 表驱动测试（D1-12）：`canRun(delivery-finalize)` 对 `deliveryFullTestStatus` ∈ {`not-ready`, `awaiting-user-decision`, `authorized`, `failed`, `undefined`} 每个 → `allowed: false` 且 `unmetPreconditions` 含 `full-test-not-passed`；仅 `passed` → `allowed: true`；断言 `not-applicable` 不被接受为 FullTestStatus（类型层面或运行时校验）
- [x]10.23 表驱动测试（D1-13）：`canRun(full-test)` 对 `deliveryFullTestStatus` 每个 FullTestStatus 值的行为——`authorized`（+ ownerAuthorizations 含 full-test scope）→ `allowed: true`；`awaiting-user-decision` → `allowed: false` + `full-test-not-authorized` + `next` 返回 `owner-decision: authorize-full-test`（无 full-test scope 时）；MUST NOT `action: full-test`（frozen Section 4.2）；`failed` → `allowed: false` + `full-test-already-failed` + `next` 返回 `blocked: full-test-failed` + `suggestedOwnerActions` 含 corrective Change 和取消 Delivery；`passed` → `allowed: false` + `full-test-already-passed`；`not-ready` → `allowed: false`；`undefined` → `allowed: false`；断言 `awaiting-user-decision`/`failed` 时 `next` MUST NOT 返回 `action: full-test`；断言 `authorized` + 无 full-test scope → `owner-decision: authorize-full-test`（防御性 fail-closed）；断言 corrective Change 重置 `fullTestStatus` 为 `not-ready` 后 `next` MUST NOT 再返回 `blocked: full-test-failed`，required Changes 再次 completed 后重新进入 `awaiting-user-decision`（仍非 `authorized`，需 owner 再次授权）

## 11. 验证

- [x]11.1 `npm run typecheck` 通过（生产 + 测试）
- [x]11.2 `npm run build` 通过
- [x]11.3 `npm test` 通过
- [x]11.4 `npm run lint` 通过
- [x]11.5 `openspec validate policy-engine --strict` 通过
- [x]11.6 不存在新增手写 `.mjs` 源码
- [x]11.7 不引入外部运行时依赖
- [x]11.8 不修改 B1 结构转换表（`src/domain/states.ts`）
- [x]11.9 不自创 Action 或状态
- [x]11.10 不从 Run 历史 / OpenSpec 产物 / 聊天推断正式事实
- [x]11.11 不实现诊断 CLI、完整 Change 执行循环、自动 Commit/Push/Merge
