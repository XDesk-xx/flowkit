# Design: D1 — policy-engine

## 设计决策

### D1-1: Policy 是纯函数

`canRun`、`next`、`diagnose` MUST 是纯函数——只读 `FormalFactSnapshot`，不修改任何状态，不调用 I/O。
所有事实来自 snapshot，所有决策基于 snapshot 内容。这保证 Policy 可重复执行、可测试、无副作用。

### D1-2: 不持久化 currentAction

Policy MUST NOT 保存 `currentAction`、current pointer 或并列流程状态。每次调用 `next(snapshot)` 都从
正式事实重新计算。`ContinuationContext.nextAllowedAction` 由 Policy 计算，不由 ContinuationContext 自身填充。
消除"内存流程状态"与"持久化事实"的不一致风险。

### D1-3: fail-closed 优先

`snapshot.conflicts` 非空时，Policy MUST 返回 blocked，不论其他事实如何。冲突优先于一切决策——
包括 lineage 推断、owner 决策边界和阶段推进。这是 C1 `One fact, one authority` 在 Policy 层的延续。

### D1-4: 结构转换 vs 语义前置条件

B1 `states.ts` 只定义结构转换边（哪个状态可以转到哪个状态）。D1 在此基础上添加语义前置条件
（owner 授权、Verification 为 passed 或 not-applicable、dependencies completed、lineage match 等）。D1 MUST NOT 修改 B1
的结构转换表，MUST NOT 绕过结构转换校验。结构转换是"能不能转"的物理边界，语义前置条件是"该不该转"
的业务规则。

### D1-5: owner 决策边界不可绕过

当 Policy 返回 `owner-decision` 时，Flowkit MUST 停在 owner 决策边界，不得自动推进。owner 的合法
选择包括：授权、改变范围、取消。Owner MUST NOT 直接绕过 verdict 推进。owner-decision 不是 blocked——
它是"系统已确定唯一需要的 Action，但需要 owner 授权才能执行"。

### D1-6: Action 完成不自动推进

Author 完成 Action 后只记录 `nextAction: review-*`。Policy MUST NOT 自动创建下一 reviewer Run。
Reviewer 真正执行统一入口 `review` 时，Policy 先计算唯一具体 Review Action，再创建对应 reviewer Run。
这保证 reviewer Run 的创建有明确的 reviewer 意图，而非 author 完成的副作用。

### D1-7: Verification-gated actions 在事实不可用时 blocked

C1 `FormalFactSnapshot` 当前不携带 Change Verification status（无字段、`openSpecArtifacts` 无
`change-verification` kind）。D1 对 verification-gated actions（`review-apply`、`archive`）采取：

- MUST NOT 从 Run 历史推断 Verification status
- MUST NOT 从 OpenSpec 产物存在性推断 Verification status
- MUST NOT 从聊天历史或 `.tmp` 推断任何正式事实
- Verification 事实不可用时 → `blocked: verification-facts-unavailable`
- 这是一个已知的上游契约缺口，由未来 change 扩展 snapshot

**owner authorization 处理**：`snapshot.ownerAuthorizations` 字段在 C1 契约中**存在**。C1 Reader 当前
返回空数组（占位），但契约不缺失。空数组时，authorization-gated actions 返回 `owner-decision`
（正确的 fail-closed）。C1 Reader 未来扩展填充该数组后，D1 行为自动正确，无需修改 D1。

### D1-8: Review/Revision lineage by reviewed Run

Policy MUST 使用 reviewed-Run lineage 追踪 Review/Revision 循环，替代"禁止任何已完成的 review-*"
的存在性规则：

- 每个 `ReviewVerdictFact` 携带 `reviewedRunId`，标识被审阅的 Run
- `Current Artifact Run` = latest completed Run in {S, revise-S}
- `Current Review` = latest completed review-S Run
- Lineage match = Current Review.reviewedRunId == Current Artifact Run.runId
- match + approved → 阶段完成
- match + changes-requested → revise-S
- no match → review-S（新 artifact 未被审阅）

**旧规则的问题**：旧规则使用"无 completed review-S Run"作为 review-S 的前置条件，禁止了 revise→review
循环——一旦 review-S 完成，review-S 永远不可再执行，阻断了 `changes-requested → revise → review` 循环。

**新规则的优势**：revise-S 完成后，Current Artifact Run 更新为 revise-S Run，而 Current Review 仍
指向之前的 artifact，no match → review-S 可再执行。正确支持 `delivery-lifecycle.md` Section 3.2 定义的
`changes-requested: revise-explore → review-explore` 循环。

**数据来源**：C1 Reader 的 `readC1Run` 已从 `ContextFile.reviewedRunId` 提取 reviewed-Run 关联，存入
`ReviewVerdictFact.reviewedRunId`。D1 直接从 `snapshot.reviewVerdicts` 读取此字段。

### D1-9: blocked diagnosis 与 owner-decision 严格区分

`blocked` 表示"系统无法确定唯一合法下一 Action"（冲突、事实缺失、歧义、依赖未完成）。
`owner-decision` 表示"系统已确定唯一需要的 Action，但需要 owner 授权"（authorize-apply、
authorize-archive、authorize-full-test、authorize-delivery-finalize、activate-change）。
两者 MUST NOT 混淆：blocked 的解决需要改变事实（修复冲突、补充事实），owner-decision 的解决需要
owner 授权。

### D1-10: canRun(review-S) blocks on match+changes-requested

对每个阶段 S ∈ {explore, propose, apply}，`canRun(review-S)` MUST 仅在 Current Review = null
或无 lineage match（`Current Review.reviewedRunId ≠ Current Artifact Run.runId`）时 allowed。
当 lineage match 且 Current Verdict = changes-requested 时，`canRun(review-S)` MUST 返回
`allowed: false`（`unmetPreconditions` 含 `matching-changes-requested-requires-revision`）——此时
唯一合法 Action 是 `revise-S`。

统一 review 入口委托 `canRun(review-S)`，因此在 match+changes-requested 时统一 review 返回 blocked。
这防止了"在需要修订时执行另一次审查"的绕过，与 `delivery-lifecycle.md` 的
`changes-requested: revise-S → review-S` 循环一致：review-S 只在 revise-S 完成产生新 artifact
（no match）后才再次 allowed。

**与 D1-8 的关系**：D1-8 定义 lineage 模型（`next` 的决策树：match+cr → revise-S，no match → review-S）。
D1-10 将同样的约束应用到 `canRun(review-S)`——`next` 和 `canRun` 对 review-S 的允许条件 MUST 一致。
没有 D1-10 时，`canRun(review-S)` 可能在 match+cr 时 allowed，导致统一 review 入口绕过必需的 revise-S。

### D1-11: Archive task-completion gate + tasks-facts-unavailable fail-closed

`docs/delivery-lifecycle.md` Section 3.5 要求 Archive 前 "Tasks 已完成"。D1 `archive` 前置条件
MUST 包含 Tasks 全部完成。但 C1 `FormalFactSnapshot` 当前不携带 Tasks 完成状态——`openSpecArtifacts`
仅暴露 `change-tasks` kind 的 `exists`（产物存在性），无 completion 字段；`FormalFactSnapshot` 无
task-completion 字段。

D1 对此采取（与 D1-7 对 Verification 事实不可用同构的处理）：

- MUST NOT 从 Run 历史推断 Tasks 完成状态
- MUST NOT 从 OpenSpec 产物存在性（`change-tasks` exists）推断 Tasks 完成状态——存在 tasks.md ≠ tasks 已完成
- MUST NOT 从聊天历史或 `.tmp` 推断任何正式事实
- Tasks 完成事实不可用时 → `canRun(snapshot, 'archive')` 返回 `allowed: false`，
  `unmetPreconditions` 含 `tasks-facts-unavailable`；`next` 返回 `blocked: tasks-facts-unavailable`
- 这是一个已知的上游契约缺口，由未来 change 扩展 snapshot 携带 task-completion 字段

**`tasks-facts-unavailable` 与 `verification-facts-unavailable` 严格区分**：前者是 Tasks 完成事实
缺口（仅 archive 门控），后者是 Change Verification 事实缺口（review-apply/archive 门控）。二者属
不同事实维度，MUST NOT 混用。当 archive 同时面临两个缺口时，`unmetPreconditions` MUST 同时列出两者。

### D1-12: delivery-finalize requires FullTestStatus=passed（无 not-applicable）

`delivery-finalize` MUST 要求 `snapshot.deliveryFullTestStatus = passed`。B1 `FullTestStatus` 枚举为
`not-ready | awaiting-user-decision | authorized | passed | failed`——**不含 `not-applicable`**。
`not-applicable` 属 Change `VerificationStatus`（`not-run | passed | failed | not-applicable`），属
Change 级概念，不可与 Delivery 级 `FullTestStatus` 混淆。

任意非 `passed` 值（`not-ready`、`awaiting-user-decision`、`authorized`、`failed`、`undefined`）MUST 使
`canRun(snapshot, 'delivery-finalize')` 返回 `allowed: false`，`unmetPreconditions` 含 `full-test-not-passed`。
这与 `full-test` Action 的前置条件（D1-13：`deliveryFullTestStatus` = `authorized`）
互补——`full-test` 仅在 `authorized` 时 allowed，`delivery-finalize` 仅在 `passed` 时 allowed，
`awaiting-user-decision` 返回 `owner-decision: authorize-full-test`，`failed` 由 `blocked: full-test-failed` 处理。

**移除"Full Test passed 或 not-applicable"**：旧文案错误地将 Change Verification 的 `not-applicable`
混入 Delivery FullTestStatus。若未来 Delivery 需支持"Full Test 不适用"语义，必须先扩展 B1 `FullTestStatus`
枚举（属 B1 范畴，非 D1），D1 行为随后自动正确，无需修改 D1——这与 D1-7 对 owner authorization 空数组的
延展性设计一致。

### D1-13: full-test eligibility restricted to authorized；awaiting-user-decision → owner-decision；failed → blocked

`full-test` Action 的前置条件 MUST 限制为 frozen `verification-model.md` Section 4.2 的 `authorized` 状态：
`deliveryFullTestStatus` = `authorized`。frozen Section 4.2 明确规定 "只有 owner 明确授权后才能进入 `authorized`"
和 "未 authorized 时不得执行 Full Test"。`awaiting-user-decision` 是**授权前**状态，MUST NOT 允许 `full-test`；
`next` 在此状态返回 `owner-decision: authorize-full-test`（当 `ownerAuthorizations` 无 full-test scope）。

旧前置条件 `deliveryFullTestStatus ≠ passed`（081 之前）错误地将 `failed` 包含为 eligible；
083 修复将 eligible 收紧为 `{awaiting-user-decision, authorized}` 但仍错误地包含 `awaiting-user-decision`
（D1-PR-006）。085 修复最终收紧为仅 `authorized`——这是 frozen Section 4.2 "未 authorized 时不得执行 Full Test"
的唯一正确解读。

**各 `FullTestStatus` 值的 `full-test` 行为**：

| `deliveryFullTestStatus` | `canRun(full-test)` | `next` | 说明 |
|---|---|---|---|
| `not-ready` | `allowed: false`（`full-test-not-authorized`） | blocked（required Changes 未全部 completed） | required Changes 未完成时不运行 Full Test |
| `awaiting-user-decision` | `allowed: false`（`full-test-not-authorized`） | `owner-decision: authorize-full-test`（无 full-test scope 时） | 授权前状态，owner 需授权才能进入 `authorized` |
| `authorized` | allowed（若 ownerAuthorizations 含 full-test scope） | `action: full-test` | owner 已授权，Full Test 可执行 |
| `passed` | `allowed: false`（`full-test-already-passed`） | 推进到 `delivery-finalize` 路径 | Full Test 已通过，不重复执行 |
| `failed` | `allowed: false`（`full-test-already-failed`） | `blocked: full-test-failed` | owner 决策：corrective Change 或取消 |
| `undefined` | `allowed: false`（`full-test-not-authorized`） | blocked | 事实缺失，fail-closed |

**授权转换模型**（frozen Section 4.2）：

- `awaiting-user-decision → authorized` 转换由 owner 明确授权触发
- owner 授权记录在 `ownerAuthorizations`（full-test scope）且 `deliveryFullTestStatus` 转换为 `authorized`
- 两个事实应原子更新（C1 负责一致性）；D1 只读 snapshot，将 `deliveryFullTestStatus` 视为权威 Full Test 生命周期状态
- `authorized` + `ownerAuthorizations` 含 full-test scope → `action: full-test`（两个事实一致，正常路径）
- `authorized` + `ownerAuthorizations` 无 full-test scope → `owner-decision: authorize-full-test`（防御性，事实不一致时 fail-closed）

**`failed` 的处理（frozen Section 6 对齐）**：

- `fullTestStatus` 保持 `failed`，MUST NOT 自动重置
- Policy MUST 返回 `blocked: full-test-failed`，MUST NOT 返回 `action: full-test`
- Policy MUST NOT 自动创建 corrective Change（corrective Change 创建属于 owner 明确授权）
- `suggestedOwnerActions` MUST 列出 owner 的合法选择：
  - 授权创建 corrective Change（corrective Change 创建后 `fullTestStatus` 返回 `not-ready`）
  - 取消 Delivery
- 只有 owner 明确授权 corrective Change 后，`fullTestStatus` 才返回 `not-ready`，重新进入 Full Test 生命周期
- corrective Change 按 `planned` → `active` 普通 Change 规则推进，完整执行 Explore/Propose/Apply/Review/Archive/Checkpoint
- 所有 required Changes 再次 completed 后重新进入 `awaiting-user-decision`，再次等待 owner 授权 Full Test

**为何 `full-test-failed` 是 blocked 而非 owner-decision**：per D1-9，owner-decision 表示"系统已确定唯一
需要的 Action，但需要 owner 授权"；blocked 表示"系统无法确定唯一合法下一 Action"。Full Test failed 时 owner
有**多个**合法选择（corrective Change 或取消），系统无法确定唯一 Action，故属 blocked。`suggestedOwnerActions`
提供 owner 的选项列表，但最终决策由 owner 做出。这与 `authorize-full-test`（单一授权动作）不同。

**与 D1-12 的互补关系**：D1-12 定义 `delivery-finalize` 仅在 `passed` 时 allowed；D1-13 定义 `full-test` 仅在
`authorized` 时 allowed。`awaiting-user-decision` 返回 `owner-decision: authorize-full-test`（非 `action: full-test`）；
`passed` 和 `failed` 都不允许 `full-test`——`passed` 推进到 finalize，`failed` 进入 owner 决策 blocked。
四者（D1-12 delivery-finalize、D1-13 full-test authorized-only、frozen Section 4.2 授权转换、frozen Section 6 failed recovery）
共同构成完整的 Full Test 生命周期门控。

## 架构

```
src/
  policy/
    types.ts              — Policy 专属类型（CanRunResult, PolicyResult, OwnerDecision, BlockedDiagnosis）
    lineage.ts            — Lineage 模型（D1-8：reviewedRunId 追踪，Current Artifact/Review 计算）
    stage-detector.ts     — 阶段识别（从 Run 历史识别 explore/propose/apply/archive）
    preconditions.ts      — Action 前置条件矩阵（Section 3，12 个 Action 语义前置条件）
    can-run.ts            — canRun(snapshot, action) 实现
    next.ts               — next(snapshot) 决策树实现
    diagnose.ts           — diagnose(snapshot) 诊断实现
    owner-decision.ts     — owner 决策边界类型与判断
    blocked-diagnosis.ts  — blocked diagnosis 类型与生成
```

## B1/C1/D1 所有权边界

| 归属 | B1 拥有 | C1 拥有 | D1 拥有 |
|---|---|---|---|
| 类型 | DeliveryState, ChangeState, RunStatus, ActionResult, Run, ResultRef | FormalFactSnapshot, FactConflict, ReviewVerdictFact | CanRunResult, PolicyResult, OwnerDecision, BlockedDiagnosis |
| 纯函数 | allocateNextNnn, assertMutable, isTerminal, canTransition | readFormalFactSnapshot, validateContextFile | canRun, next, diagnose, lineage 计算, stage 检测 |
| 结构转换 | DELIVERY_STATE_TRANSITIONS, CHANGE_STATE_TRANSITIONS | — | — （D1 添加语义前置条件，不修改结构表）|
| Action Catalog | CHANGE_ACTIONS, DELIVERY_ACTIONS | — | — （D1 使用 B1 catalog，不自创）|
| 文件系统 | — | createRun, writeRunResult, result-ref-adapter | — （D1 无 I/O）|

## 消费的上游契约

| 上游 | 契约 | D1 用途 | 可用性 |
|---|---|---|---|
| B1 `types.ts` | DeliveryState, ChangeState, RunStatus, ReviewVerdictValue, FormalAction, Role | 类型约束 | ✅ 完整 |
| B1 `actions.ts` | CHANGE_ACTIONS, DELIVERY_ACTIONS, isChangeAction, isDeliveryAction | Action 枚举与校验 | ✅ 完整 |
| B1 `states.ts` | canTransition, DELIVERY_STATE_TRANSITIONS, CHANGE_STATE_TRANSITIONS | 结构转换校验 | ✅ 完整 |
| B1 `terminal.ts` | assertMutable, isTerminal | Run terminal 状态校验 | ✅ 完整 |
| C1 `formal-fact-snapshot.ts` | FormalFactSnapshot 及全部子类型 | Policy 输入 | ⚠️ Verification status 缺失（D1-7 blocked）|
| C1 `formal-fact-reader.ts` | readFormalFactSnapshot | 读取正式事实（D1 调用） | ✅ 可调用 |

## 不做

- 不实现诊断 CLI（status / next / doctor / resume-context）—— E1
- 不实现完整 Change 创建和执行循环
- 不实现 OpenSpec apply / archive 集成
- 不实现 Review / Findings 写入闭环
- 不实现 Change Verification 调度
- 不实现 actualChangeSet 计算
- 不实现自动 Commit / Push / Merge
- 不修改 B1 结构转换表（只添加语义前置条件）
- 不自创 Action 或状态（使用 B1 catalog）
- 不从 Run 历史 / OpenSpec 产物 / 聊天推断正式事实
- 不引入外部运行时依赖
