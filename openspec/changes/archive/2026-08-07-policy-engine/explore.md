# D1 policy-engine Explore Conclusion

> **Revision**: 071-revise-explore。修复 070-review-explore 的 D1-EX-001（lineage 模型）
> 和 D1-EX-002（verification/authorization facts 可用性）。全量 consistencyScan 覆盖全部
> 交叉引用维度。

## 1. 范围与边界

### 1.1 D1 拥有

D1 实现 Policy 引擎——从 `FormalFactSnapshot`（C1）计算唯一合法下一 Action、owner 决策边界或 blocked diagnosis。三个公开函数：

- `canRun(snapshot, action)` — 判断特定 Action 在当前事实下是否可执行
- `next(snapshot)` — 计算唯一合法下一 Action 或 owner 决策边界或 blocked diagnosis
- `diagnose(snapshot)` — 当 Policy 无法推进时生成 blocked diagnosis

### 1.2 D1 不拥有

- **不拥有** FormalFactSnapshot 的读取（C1 owns Reader）
- **不拥有** 状态转换的结构表（B1 owns `states.ts` 的 structural transitions）
- **不拥有** Action Catalog（B1 owns `actions.ts`）
- **不拥有** 领域类型定义（B1 owns `types.ts`）
- **不拥有** 持久化（C1 owns persistence）
- **不拥有** CLI 展示（E1 owns CLI）
- **不拥有** owner 授权存储（C1/D1 共同定义授权引用，存储由 C1 持久化层支持）
- **不拥有** Change Verification 执行与结果存储（属于项目验证工具 + C1 持久化）

### 1.3 消费的上游契约

| 上游 | 契约 | D1 用途 | 可用性 |
|---|---|---|---|
| B1 `types.ts` | `DeliveryState`, `ChangeState`, `RunStatus`, `ReviewVerdictValue`, `FormalAction`, `Role` | 类型约束 | ✅ 完整 |
| B1 `actions.ts` | `CHANGE_ACTIONS`, `DELIVERY_ACTIONS`, `isChangeAction`, `isDeliveryAction` | Action 枚举与校验 | ✅ 完整 |
| B1 `states.ts` | `canTransition`, `DELIVERY_STATE_TRANSITIONS`, `CHANGE_STATE_TRANSITIONS` | 结构转换校验 | ✅ 完整 |
| B1 `terminal.ts` | `assertMutable`, `isTerminal` | Run terminal 状态校验 | ✅ 完整 |
| C1 `formal-fact-snapshot.ts` | `FormalFactSnapshot` 及全部子类型 | Policy 输入 | ⚠️ 见下表 |
| C1 `formal-fact-reader.ts` | `readFormalFactSnapshot` | 读取正式事实（D1 调用） | ✅ 可调用 |

**C1 FormalFactSnapshot 字段可用性矩阵（D1-EX-002 修复）**：

| Snapshot 字段 | 契约存在 | Reader 当前填充 | D1 用途 | D1 行为 |
|---|---|---|---|---|
| `deliveryId` | ✅ | ✅ | 标识 active Delivery | 正常使用 |
| `deliveryState` | ✅ | ✅ | Delivery 状态门控 | 正常使用 |
| `deliveryFullTestStatus` | ✅ | ✅ | Full Test / Finalize 门控 | 正常使用 |
| `changes` | ✅ | ✅ | Change 列表、依赖、状态 | 正常使用 |
| `runs` | ✅ | ✅ | Run 历史、lineage 推断 | 正常使用 |
| `openSpecArtifacts` | ✅ | ✅ | OpenSpec 产物存在性 | 正常使用 |
| `gitBoundaries` | ✅ | ✅ (best-effort) | Git 正式边界 | 正常使用 |
| `ownerAuthorizations` | ✅ | ❌ 空数组（占位） | apply/archive/full-test/finalize 授权门控 | 空数组 → `owner-decision`（fail-closed，见 D1-7） |
| `reviewVerdicts` | ✅ | ✅ | review lineage 推断 | 正常使用（`reviewedRunId` 可用于 lineage，见 D1-8） |
| `conflicts` | ✅ | ✅ | fail-closed 优先 | 非空 → blocked |
| **Change Verification status** | ❌ 不存在 | ❌ | review-apply / archive 门控 | blocked: `verification-facts-unavailable`（见 D1-7） |
| **Tasks completion status** | ❌ 不存在 | ❌（`openSpecArtifacts` 仅暴露 `change-tasks` exists） | archive 门控（`delivery-lifecycle.md` 3.5 要求 Tasks 已完成） | blocked: `tasks-facts-unavailable`（见 D1-11） |

**关键约束（D1-EX-002）**：
- D1 **不**从 Run 历史推断 Verification status（reviewer 明确禁止）
- D1 **不**从 OpenSpec 产物存在性推断 Verification status（`openSpecArtifacts` 无 `change-verification` kind）
- D1 **不**从聊天历史或 `.tmp` 推断任何正式事实
- 当 Verification 事实不可用时，D1 对 verification-gated actions 返回 `blocked`，由未来 change 扩展 snapshot

### 1.4 下游消费者

| 下游 | 消费 D1 | 用途 |
|---|---|---|
| E1 `diagnostic-cli` | `next(snapshot)`, `diagnose(snapshot)` | `flowkit next`, `flowkit doctor` |
| E1 `diagnostic-cli` | `canRun(snapshot, action)` | `flowkit status` 中展示可执行 Action |
| E1 `diagnostic-cli` | ContinuationContext `nextAllowedAction` | `flowkit resume-context` |
| 未来 Adapter | `next(snapshot)` | 自动化流程驱动 |

## 2. Policy 三函数契约

### 2.1 `canRun(snapshot: FormalFactSnapshot, action: FormalAction): CanRunResult`

**输入**：FormalFactSnapshot + 待校验 Action
**输出**：`CanRunResult`

```typescript
interface CanRunResult {
  readonly action: FormalAction;
  readonly allowed: boolean;
  readonly unmetPreconditions: readonly string[];
  readonly conflictDimensions: readonly string[];
}
```

**规则**：
- `snapshot.conflicts` 非空 → `allowed: false`，`conflictDimensions` 列出冲突维度
- Action 不在 `ACTION_CATALOG` 中 → `allowed: false`，`unmetPreconditions: ['unknown-action']`
- 否则按 Action 特定前置条件检查（见 Section 3），收集未满足条件
- `allowed: true` 当且仅当 `unmetPreconditions` 为空且 `conflictDimensions` 为空

### 2.2 `next(snapshot: FormalFactSnapshot): PolicyResult`

**输入**：FormalFactSnapshot
**输出**：`PolicyResult`（互斥联合类型）

```typescript
type PolicyResult =
  | { readonly kind: 'action'; readonly action: FormalAction }
  | { readonly kind: 'owner-decision'; readonly decision: OwnerDecision; readonly context: OwnerDecisionContext }
  | { readonly kind: 'blocked'; readonly diagnosis: BlockedDiagnosis };
```

**规则**：
- `snapshot.conflicts` 非空 → `blocked`（冲突优先于一切）
- 无 active Delivery → `blocked`
- 无 active Change 且有 planned required Change 且 dependencies 满足 → `owner-decision: activate-change`
- 无 active Change 且无可激活 Change → `blocked` 或 `owner-decision: delivery-finalize`（当所有 required completed）
- 有 active Change → 按 Change 生命周期决策树计算（见 Section 4）
- 多解或歧义 → `blocked`

### 2.3 `diagnose(snapshot: FormalFactSnapshot): BlockedDiagnosis`

**输入**：FormalFactSnapshot
**输出**：`BlockedDiagnosis`

```typescript
interface BlockedDiagnosis {
  readonly reason: string;
  readonly unmetPreconditions: readonly string[];
  readonly conflicts: readonly FactConflict[];
  readonly suggestedOwnerActions: readonly string[];
}
```

**规则**：`diagnose` 是 `next` 的诊断变体——当 `next` 返回 `blocked` 时，`diagnose` 提供更详细的原因和建议。`diagnose` 不返回 `action` 或 `owner-decision`，只返回 blocked 信息。

## 3. Action 前置条件矩阵

### 3.0 Lineage 模型定义（D1-EX-001 修复）

Policy 使用 **reviewed-Run lineage** 追踪 Review/Revision 循环，而非"禁止任何已完成的 review-*"的存在性规则。

对于每个阶段 S ∈ {explore, propose, apply}：

| 概念 | 定义 |
|---|---|
| **Artifact Run** | completed Run with action ∈ {S, revise-S}（如 explore 阶段：explore, revise-explore） |
| **Current Artifact Run** | Artifact Run 中 Run ID 最大的那个。null 表示该阶段未开始 |
| **Review Run** | completed Run with action = review-S |
| **Current Review** | Review Run 中 Run ID 最大的那个。null 表示从未 review |
| **Current Verdict** | Current Review 的 verdict。null 表示 Current Review 为 null |
| **Lineage match** | Current Review ≠ null 且 Current Review.reviewedRunId == Current Artifact Run.runId |

**阶段判定规则**（用于 `next` 和 `canRun`）：

```
1. Current Artifact Run = null
   → 阶段 S 未开始（需先执行 S）

2. Current Review = null
   → Current Artifact Run 未被审阅 → next: review-S

3. Lineage match (Current Review.reviewedRunId == Current Artifact Run.runId):
   → verdict = approved   → 阶段 S 完成，推进到下一阶段
   → verdict = changes-requested → next: revise-S

4. 无 Lineage match (Current Review.reviewedRunId ≠ Current Artifact Run.runId)
   → Current Artifact Run 是新产物（如 revise-S 刚完成），未被当前 review 覆盖
   → next: review-S
```

**多轮 Revision 正确性验证**：

| 步骤 | Current Artifact | Current Review | Lineage match? | next action |
|---|---|---|---|---|
| explore 完成 | explore | null | — | review-explore |
| review (cr) | explore | review (cr, reviewed=explore) | ✅ match, cr | revise-explore |
| revise 完成 | revise-explore | review (cr, reviewed=explore) | ❌ no match | review-explore |
| review (cr) | revise-explore | review (cr, reviewed=revise-explore) | ✅ match, cr | revise-explore |
| revise 完成 | revise-explore#2 | review (cr, reviewed=revise-explore#1) | ❌ no match | review-explore |
| review (approved) | revise-explore#2 | review (approved, reviewed=revise-explore#2) | ✅ match, approved | propose |

> **关键洞察**：revise-S 完成后，Current Artifact Run 变为 revise-S Run，但 Current Review 仍指向**之前的** artifact。因此 reviewedRunId ≠ Current Artifact Run.runId，review-S 被允许再次执行。这就是 D1-EX-001 的修复核心——lineage 追踪替代存在性禁止。

### 3.1 Change-level Actions（需要 active Change）

| Action | 前置条件 |
|---|---|
| `explore` | Change state=active；Current Artifact Run (explore 阶段) = null；无 pending explore Run |
| `review-explore` | Current Artifact Run ≠ null；**无 lineage match 或 lineage match + changes-requested 之外的情况**；具体：Current Review = null OR Current Review.reviewedRunId ≠ Current Artifact Run.runId（即存在未审阅 artifact） |
| `revise-explore` | Current Review ≠ null；lineage match；Current Verdict = changes-requested |
| `propose` | explore 阶段 lineage match + approved；Current Artifact Run (propose 阶段) = null；无 pending propose Run |
| `review-propose` | Current Artifact Run (propose 阶段) ≠ null；Current Review (propose) = null OR reviewedRunId ≠ Current Artifact Run.runId |
| `revise-propose` | Current Review (propose) ≠ null；lineage match；Current Verdict = changes-requested |
| `apply` | propose 阶段 lineage match + approved；`snapshot.ownerAuthorizations` 包含 apply scope 授权；无 completed apply Run |
| `review-apply` | Current Artifact Run (apply 阶段) ≠ null；**Change Verification 事实可用且 passed**（D1-EX-002：不可用 → blocked）；Current Review (apply) = null OR reviewedRunId ≠ Current Artifact Run.runId |
| `revise-apply` | Current Review (apply) ≠ null；lineage match；Current Verdict = changes-requested |
| `archive` | apply 阶段 lineage match + approved；blocking findings=0；**Change Verification 事实可用且 passed**（D1-EX-002：不可用 → blocked）；**Tasks 完成事实可用且全部完成**（D1-11：不可用 → blocked `tasks-facts-unavailable`，MUST NOT 从 `change-tasks` exists / Run 历史 / 聊天推断）；`snapshot.ownerAuthorizations` 包含 archive scope 授权 |

**D1-EX-001 修复说明**：
- 旧规则 `review-explore: 无 completed review-explore Run` → 阻断了 revise→review 循环
- 新规则使用 lineage match：只要 Current Artifact Run 未被当前 review 以 approved 覆盖，review-S 就可执行
- 这允许 `explore → review(cr) → revise → review(cr) → revise → review(approved) → propose` 的多轮循环

**D1-EX-002 修复说明**：
- `review-apply` 和 `archive` 的 Verification 前置条件标注为"事实可用且 passed"
- 当 snapshot 不携带 Verification status 时，`canRun` 返回 `allowed: false`，`unmetPreconditions: ['verification-facts-unavailable']`
- `next` 返回 `blocked: verification-facts-unavailable`
- D1 不从 Run 历史或 OpenSpec 产物推断 Verification status

### 3.2 Delivery-level Actions

| Action | 前置条件 |
|---|---|
| `full-test` | 所有 required Changes completed + checkpointed；`snapshot.ownerAuthorizations` 包含 full-test scope 授权；`deliveryFullTestStatus` = `authorized`（D1-13：frozen `verification-model.md` Section 4.2 "未 authorized 时不得执行 Full Test"；`awaiting-user-decision` 是授权前状态 → `owner-decision: authorize-full-test`；`failed` → `blocked: full-test-failed` per Section 6；`passed` → rejected） |
| `delivery-finalize` | 所有 required Changes completed；所有 Change Checkpoint 完成；**`snapshot.deliveryFullTestStatus` = passed**（D1-12：任意非 passed 值含 undefined → `allowed: false`；B1 `FullTestStatus` 无 `not-applicable`，`not-applicable` 仅属 Change `VerificationStatus`）；`snapshot.ownerAuthorizations` 包含 finalize scope 授权 |

### 3.3 owner 决策边界

以下情况 Policy 返回 `owner-decision` 而非 `action`：

| 场景 | decision | 说明 |
|---|---|---|
| 无 active Change，有可激活 planned required Change | `activate-change` | owner 授权激活 |
| review-propose approved，等待 apply 授权 | `authorize-apply` | owner 授权 apply；`snapshot.ownerAuthorizations` 无 apply scope |
| review-apply approved，等待 archive 授权 | `authorize-archive` | owner 授权 archive；`snapshot.ownerAuthorizations` 无 archive scope |
| 所有 required Changes completed，`deliveryFullTestStatus` = `awaiting-user-decision` | `authorize-full-test` | owner 授权 Full Test；`snapshot.ownerAuthorizations` 无 full-test scope |
| Full Test passed，所有条件满足 | `authorize-delivery-finalize` | owner 授权 Finalize；`snapshot.ownerAuthorizations` 无 finalize scope |

**D1-EX-002 说明**：`snapshot.ownerAuthorizations` 字段在 C1 契约中存在。当 Reader 返回空数组（当前占位行为）时，所有 authorization-gated actions 返回 `owner-decision`。这是正确的 fail-closed 行为——门控工作正常，只是在 C1 Reader 扩展填充前始终要求 owner 授权。

**D1-13 说明（085-revise-propose）**：`full-test` 仅在 `deliveryFullTestStatus` = `authorized` 时 allowed（frozen Section 4.2 "未 authorized 时不得执行 Full Test"）。`awaiting-user-decision` 是授权前状态 → `owner-decision: authorize-full-test`（非 `action: full-test`）。`full-test-failed`（`deliveryFullTestStatus` = `failed`）**不属** owner-decision——owner 有多个合法选择（授权创建 corrective Change 或取消 Delivery），系统无法确定唯一 Action，故返回 `blocked: full-test-failed`，`suggestedOwnerActions` 列出选项。这与 `authorize-full-test`（单一授权动作，`deliveryFullTestStatus` = `awaiting-user-decision`）不同。per frozen `verification-model.md` Section 6：`fullTestStatus` 保持 `failed`，只有 owner 明确授权 corrective Change 后才返回 `not-ready`。

## 4. Change 生命周期决策树

`next(snapshot)` 在有 active Change 时的决策流程：

### 4.1 阶段识别

```text
1. snapshot.conflicts 非空?
   → blocked (conflict)

2. 找到 active Change 的全部 terminal Run（按 Run ID 排序）

3. 检查最新 terminal Run 的 status：
   → failed  → action: <same-action>（重试，授权 scope 仍在）
   → cancelled → action: <same-action>（重试，授权 scope 仍在）

4. 确定当前活跃阶段：
   a. 遍历全部 completed Run，按 Run ID 降序
   b. 第一个属于 {explore, revise-explore, review-explore} 的 Run → explore 阶段
   c. 第一个属于 {propose, revise-propose, review-propose} 的 Run → propose 阶段
   d. 第一个属于 {apply, revise-apply, review-apply} 的 Run → apply 阶段
   e. 第一个属于 {archive} 的 Run → archive 阶段
   f. 无 completed Run → explore 阶段（刚激活）
```

### 4.2 阶段内决策（使用 Lineage 模型）

对当前活跃阶段 S，应用 Section 3.0 的 lineage 规则：

```text
阶段 S（S ∈ {explore, propose, apply}）:

1. Current Artifact Run = null
   → action: S（首次执行该阶段）

2. Current Review = null OR Current Review.reviewedRunId ≠ Current Artifact Run.runId
   → 存在未审阅 artifact
   → action: review-S

3. Lineage match (Current Review.reviewedRunId == Current Artifact Run.runId):
   → verdict = approved
     → S = explore: action: propose（进入 propose 阶段）
     → S = propose: owner-decision: authorize-apply
     → S = apply:
       → Change Verification 事实不可用 → blocked (verification-facts-unavailable)
       → Verification not passed → blocked (verification-failed 或 verification-not-run)
       → Verification passed AND Tasks 完成事实不可用 → blocked (tasks-facts-unavailable)（D1-11）
       → Verification passed AND Tasks 完成事实可用且全部完成 → owner-decision: authorize-archive
   → verdict = changes-requested
     → action: revise-S
```

### 4.3 archive 阶段

```text
最新 completed Run = archive:
  → owner-decision: authorize-checkpoint（Git 边界，非正式 Action）
```

### 4.4 Change completed

```text
Change state = completed:
  → 无 active Change → 回到 Delivery 级决策
```

### 4.5 无法确定唯一阶段

```text
→ blocked (ambiguous-state)
```

### 4.6 统一 review/revise 入口解析

`review` 和 `revise` 不是正式 Action。Policy 必须根据正式事实将它们唯一解析：

**`review` 入口**：
1. 确定当前活跃阶段 S（Section 4.1）
2. 检查 `canRun(review-S)` 是否 allowed
3. allowed → 解析为 `review-S`
4. not allowed → blocked（说明当前不需要 review，或前置条件未满足）

**`revise` 入口**：
1. 确定当前活跃阶段 S
2. 检查 Current Review 的 verdict
3. verdict = changes-requested AND lineage match → 解析为 `revise-S`
4. 否则 → blocked（无有效 changes-requested，或 verdict 已被 superseded）

如果无法唯一解析（无对应阶段、多解、无 changes-requested verdict），返回 blocked。

> **D1-EX-001 修复**：旧版 Section 4.1 的统一入口说"根据当前生命周期阶段解析"，但未定义阶段判定算法，且 Section 3 禁止已完成的 review-* 再次执行。新版使用 lineage 模型明确定义阶段判定和 review/revise 解析，允许 revise→review 循环。

## 5. Blocked Diagnosis 条件

| 条件 | reason | 说明 |
|---|---|---|
| `conflicts` 非空 | `formal-fact-conflict` | fail-closed 优先 |
| 无 active Delivery | `no-active-delivery` | — |
| 无 active Change 且无可激活 Change | `no-actionable-change` | — |
| Change Verification 事实不可用 | `verification-facts-unavailable` | D1-EX-002：snapshot 无 verification status 字段 |
| Change Verification failed | `verification-failed` | 当未来 change 扩展 snapshot 后适用 |
| Change Verification not-run | `verification-not-run` | 当未来 change 扩展 snapshot 后适用 |
| Tasks 完成事实不可用 | `tasks-facts-unavailable` | D1-11：snapshot 无 task-completion 字段，仅 archive 门控；与 `verification-facts-unavailable` 严格区分 |
| 多解或歧义 | `ambiguous-state` | — |
| 依赖未完成 | `dependency-incomplete` | — |
| Full Test failed | `full-test-failed` | `deliveryFullTestStatus` = `failed`；blocked（非 owner-decision，owner 有多个选择）；`suggestedOwnerActions` 列出 corrective Change 或取消 Delivery；per frozen Section 6 `fullTestStatus` 保持 `failed` 直到 owner 授权 corrective Change（D1-13） |

> **D1-EX-002 修复**：新增 `verification-facts-unavailable` 作为独立 blocked reason，与 `verification-failed` 和 `verification-not-run` 区分。前者表示事实不可用（当前 snapshot 的固有限制），后两者表示事实可用但结果不通过。
>
> **D1-11 修复（081-revise-propose）**：新增 `tasks-facts-unavailable` 作为独立 blocked reason，覆盖 archive 的 Tasks 完成门控。`delivery-lifecycle.md` Section 3.5 要求 Archive 前 "Tasks 已完成"，但 C1 snapshot 仅暴露 `change-tasks` 存在性，无 completion 字段。D1 不从 Run 历史 / 产物存在性 / 聊天推断完成状态，事实不可用时 blocked。`tasks-facts-unavailable`（archive Tasks 门控）与 `verification-facts-unavailable`（review-apply/archive Verification 门控）属不同事实维度，MUST NOT 混用。
>
> **D1-12 修复（081-revise-propose）**：`delivery-finalize` MUST 要求 `deliveryFullTestStatus = passed`。B1 `FullTestStatus` 无 `not-applicable`（该值属 Change `VerificationStatus`）。旧文案 "Full Test passed 或 not-applicable" 错误混入 Change 级概念，已移除。
>
> **D1-13 修复（085-revise-propose）**：`full-test` 前置条件最终收紧为 `deliveryFullTestStatus = authorized`（frozen Section 4.2 "未 authorized 时不得执行 Full Test"）。083 曾收紧为 `{awaiting-user-decision, authorized}` 但仍错误包含 `awaiting-user-decision`（D1-PR-006：`awaiting-user-decision` 是授权前状态，owner 授权后才进入 `authorized`）。`awaiting-user-decision` 现返回 `owner-decision: authorize-full-test`（非 `action: full-test`）。`failed` 返回 `blocked: full-test-failed`，`suggestedOwnerActions` 列出 corrective Change 或取消 Delivery；MUST NOT 自动重试 `full-test` 或自动创建 corrective Change。`full-test-failed` 是 blocked（非 owner-decision），因为 owner 有多个合法选择，系统无法确定唯一 Action（per D1-9）。

## 6. 设计决策

### D1-1: Policy 是纯函数

`canRun`、`next`、`diagnose` 必须是纯函数——只读 `FormalFactSnapshot`，不修改任何状态，不调用 I/O。所有事实来自 snapshot，所有决策基于 snapshot 内容。

### D1-2: 不持久化 `currentAction`

Policy 不保存 `currentAction`、current pointer 或并列流程状态。每次调用 `next(snapshot)` 都从正式事实重新计算。`ContinuationContext.nextAllowedAction` 由 Policy 计算，不由 ContinuationContext 自身填充。

### D1-3: fail-closed 优先

`snapshot.conflicts` 非空时，Policy MUST 返回 blocked，不论其他事实如何。冲突优先于一切决策。

### D1-4: 结构转换 vs 语义前置条件

B1 `states.ts` 只定义结构转换边（哪个状态可以转到哪个状态）。D1 在此基础上添加语义前置条件（owner 授权、Verification passed、dependencies completed 等）。D1 MUST NOT 修改 B1 的结构转换表，MUST NOT 绕过结构转换校验。

### D1-5: owner 决策边界不可绕过

当 Policy 返回 `owner-decision` 时，Flowkit 必须停在 owner 决策边界，不得自动推进。owner 的合法选择包括：授权、改变范围、取消。Owner 不得直接绕过 verdict 推进。

### D1-6: Action 完成不自动推进

Author 完成 Action 后只记录 `nextAction: review-*`。Policy 不自动创建下一 reviewer Run。Reviewer 真正执行统一入口 `review` 时，Policy 先计算唯一具体 Review Action，再创建对应 reviewer Run。

### D1-7: Verification-gated actions 在事实不可用时 blocked（D1-EX-002 修复）

C1 `FormalFactSnapshot` 当前不携带 Change Verification status（无字段、`openSpecArtifacts` 无 `change-verification` kind）。D1 对 verification-gated actions（`review-apply`、`archive`）采取以下策略：

- **不从** Run 历史推断 Verification status（reviewer 明确禁止）
- **不从** OpenSpec 产物存在性推断 Verification status
- **不从** 聊天历史或 `.tmp` 推断任何正式事实
- 当 Verification 事实不可用时 → `blocked: verification-facts-unavailable`
- 这是一个**已知的上游契约缺口**，由未来 change（corrective C1 或 D1 扩展）添加 verification status 到 snapshot

**owner authorization 处理**：
- `snapshot.ownerAuthorizations` 字段在 C1 契约中**存在**
- C1 Reader 当前返回空数组（占位），但**契约不缺失**
- 空数组时，authorization-gated actions 返回 `owner-decision`（正确的 fail-closed）
- C1 Reader 未来扩展填充该数组后，D1 行为自动正确，**无需修改 D1**

### D1-8: Review/Revision lineage by reviewed Run（D1-EX-001 修复）

Policy 使用 **reviewed-Run lineage** 追踪 Review/Revision 循环：

- 每个 `ReviewVerdictFact` 携带 `reviewedRunId`，标识被审阅的 Run
- `Current Artifact Run` = latest completed Run in {S, revise-S}
- `Current Review` = latest completed review-S Run
- Lineage match = Current Review.reviewedRunId == Current Artifact Run.runId
- match + approved → 阶段完成
- match + changes-requested → revise-S
- no match → review-S（新 artifact 未被审阅）

**旧规则的问题**：旧规则使用"无 completed review-S Run"作为 review-S 的前置条件，这禁止了 revise→review 循环——一旦 review-S 完成，review-S 永远不可再执行。

**新规则的优势**：lineage 模型允许 revise-S 完成后，Current Artifact Run 更新为 revise-S Run，而 Current Review 仍指向之前的 artifact，no match → review-S 可再执行。这正确支持 `delivery-lifecycle.md` Section 3.2 定义的 `changes-requested: revise-explore → review-explore` 循环。

**数据来源**：C1 Reader 的 `readC1Run` 函数已从 `ContextFile.reviewedRunId`（C1 Run）和 `extractLegacyReviewedRunId`（Bootstrap Run）提取 reviewed-Run 关联，存入 `ReviewVerdictFact.reviewedRunId`。D1 可直接从 `snapshot.reviewVerdicts` 读取此字段。

## 7. 推荐文件结构

```text
src/policy/
├── can-run.ts           — canRun(snapshot, action) 实现
├── next.ts              — next(snapshot) 决策树实现
├── diagnose.ts          — diagnose(snapshot) 诊断实现
├── preconditions.ts     — Action 前置条件矩阵（Section 3）
├── lineage.ts           — Lineage 模型（Section 3.0, D1-8）
├── stage-detector.ts    — 阶段识别（Section 4.1）
├── owner-decision.ts    — owner 决策边界类型与判断
├── blocked-diagnosis.ts — blocked diagnosis 类型与生成
└── types.ts             — Policy 专属类型（CanRunResult, PolicyResult, etc.）
```

> **变更**：新增 `lineage.ts`（D1-8 lineage 模型）和 `stage-detector.ts`（阶段识别从 `next.ts` 拆出）。

## 8. 测试策略

### 8.1 状态转换规则表驱动测试

- 为每个 (snapshot, expected-next-action) 组合编写表驱动测试
- 覆盖全部 12 个 Action 的前置条件
- 覆盖全部 owner-decision 场景
- 覆盖全部 blocked diagnosis 条件（含 `verification-facts-unavailable`）

### 8.2 冲突 fail-closed 测试

- `conflicts` 非空时，不论其他事实如何，`next` MUST 返回 blocked
- `canRun` MUST 返回 `allowed: false`

### 8.3 生命周期全覆盖测试（D1-EX-001 修复）

**单轮路径**：
- explore → review-explore (approved) → propose → review-propose (approved) → apply → review-apply (approved) → archive

**多轮 Revision 闭环**（每个阶段）：
- explore → review (cr) → revise-explore → review (cr) → revise-explore → review (approved) → propose
- propose → review (cr) → revise-propose → review (approved) → apply
- apply → review (cr) → revise-apply → review (approved) → archive

**Lineage 正确性测试**：
- revise-S 完成后，Current Artifact Run = revise-S Run，Current Review.reviewedRunId ≠ revise-S Run → review-S allowed
- review-S (approved) 后，Current Review.reviewedRunId == Current Artifact Run → 阶段完成
- review-S (cr) 后，lineage match + cr → revise-S allowed

**failed/cancelled Run 重试**：
- 最新 Run = failed → 同一 Action 可重试
- 最新 Run = cancelled → 同一 Action 可重试
- 重试不需要 owner 重新授权

### 8.4 Verification 事实不可用测试（D1-EX-002 修复）

- apply 阶段 lineage match + approved + Verification 事实不可用 → `blocked: verification-facts-unavailable`
- `canRun(review-apply)` 在 Verification 事实不可用时 → `allowed: false`, `unmetPreconditions: ['verification-facts-unavailable']`
- `canRun(archive)` 在 Verification 事实不可用时 → `allowed: false`
- D1 不从 Run 历史推断 Verification

### 8.5 Owner authorization 测试（D1-EX-002 修复）

- `snapshot.ownerAuthorizations` 为空数组 → apply/archive/full-test/finalize 返回 `owner-decision`
- `snapshot.ownerAuthorizations` 包含对应 scope → 正常推进
- 空数组不产生 `blocked`，而是 `owner-decision`（授权门控正常工作）

### 8.6 边界测试

- 无 active Delivery
- 无 active Change
- 依赖未完成
- Full Test failed
- 多解/歧义状态

## 9. 交叉引用契约

| 共享概念 | 出现位置 | 一致性要求 |
|---|---|---|
| `FormalFactSnapshot` | C1 spec, C1 `formal-fact-snapshot.ts`, D1 Section 1.3 | D1 消费但不修改 C1 的 snapshot 定义 |
| `conflicts` fail-closed | C1 spec (Reader 不择优), D1 Section 2.1/2.2/4.1/D1-3 | D1 MUST 在 conflicts 非空时 blocked |
| Action Catalog | B1 `actions.ts`, D1 Section 3 | D1 MUST 使用 B1 的固定 catalog，不自创 Action |
| 状态转换 | B1 `states.ts`, D1 Section 3/4/D1-4 | D1 在 B1 结构转换上添加语义前置条件，不修改结构表 |
| `nextAllowedAction` | B1 `types.ts` ContinuationContext, D1 Section 2/D1-2 | D1 Policy 计算 nextAllowedAction，ContinuationContext 不自行填充 |
| owner 决策边界 | `delivery-lifecycle.md` Section 5/6, D1 Section 3.3/4/D1-5 | D1 MUST 在 owner-decision 时停住，不自动推进 |
| 统一 review/revise | `delivery-lifecycle.md` Section 6/7, D1 Section 4.6 | D1 负责将 review/revise 唯一解析为具体 review-*/revise-* |
| **Review/Revision lineage** | `delivery-lifecycle.md` Section 3.2-3.4/4, C1 `ReviewVerdictFact.reviewedRunId`, D1 Section 3.0/3.1/4/D1-8 | D1 使用 reviewedRunId 追踪 lineage，允许 revise→review 循环；与 `delivery-lifecycle.md` Section 3.2 的 `changes-requested: revise-explore → review-explore` 一致 |
| **Verification facts 可用性** | `delivery-lifecycle.md` Section 5 (Policy inputs), C1 `FormalFactSnapshot` (无 verification 字段), D1 Section 1.3/3.1/5/D1-7 | D1 在事实不可用时 blocked；`delivery-lifecycle.md` 列 Verification 为 Policy 输入，但 C1 snapshot 未携带 → D1 fail-closed |
| **ownerAuthorizations 字段** | C1 `FormalFactSnapshot.ownerAuthorizations`, C1 `formal-fact-reader.ts` `collectOwnerAuthorizations` (占位), D1 Section 1.3/3.3/D1-7 | D1 使用 snapshot 字段；空数组 → owner-decision；C1 Reader 扩展填充后 D1 自动正确 |
| **Change Verification status** | `delivery-lifecycle.md` Section 3.4/3.5, C1 snapshot (不存在), D1 Section 3.1/5/D1-7 | `delivery-lifecycle.md` 要求 Verification for review-apply/archive；C1 snapshot 未提供；D1 blocked 直到未来 change 扩展 |
| **stage 判定** | `delivery-lifecycle.md` Section 3.2-3.5, D1 Section 4.1 | D1 阶段判定与 `delivery-lifecycle.md` 的阶段顺序一致：explore → propose → apply → archive |
| **多轮 Review 闭环** | `delivery-lifecycle.md` Section 4, D1 Section 3.0/4.6/D1-8 | `delivery-lifecycle.md` Section 4 明确允许 review 多轮；D1 lineage 模型支持此循环 |
| **Full Test 生命周期 / full-test eligibility** | `verification-model.md` Section 4.2/6, D1 Section 3.2/3.3/5/D1-13 | `full-test` 仅在 `authorized` allowed（frozen Section 4.2 "未 authorized 时不得执行 Full Test"）；`awaiting-user-decision` → `owner-decision: authorize-full-test`（授权前状态）；`failed` → `blocked: full-test-failed`（owner 决策：corrective Change 或取消）；`passed` → 推进 `delivery-finalize`；corrective Change 重置 `fullTestStatus` 为 `not-ready` per frozen Section 6 |

## 10. 修订记录

### 071-revise-explore（2026-08-07）

修复 070-review-explore 的 2 个 P1 blocking findings：

**D1-EX-001: Lifecycle stage selection cannot progress after a completed review**
- 根因：Section 3.1 使用"无 completed review-S Run"作为 review-S 前置条件，禁止了 revise→review 循环
- 修复：引入 Lineage 模型（Section 3.0, D1-8），通过 `reviewedRunId` 追踪 review 与 artifact 的审阅关系
- 影响章节：Section 3.0（新增）、3.1（重写）、4.1-4.6（重构）、4.6（更新）、6（D1-8 新增）、8.3（扩展）、9（更新）

**D1-EX-002: Policy gates require formal facts that the declared snapshot does not provide**
- 根因：Section 3 声称 Policy 消费 C1 FormalFactSnapshot 判断 Verification 和 owner authorization，但 snapshot 无 Verification status 字段，ownerAuthorizations 为空占位
- 修复：
  - Verification：D1 对 verification-gated actions 返回 `blocked: verification-facts-unavailable`（D1-7），不 infer
  - ownerAuthorizations：确认字段在 C1 契约中存在，空数组 → `owner-decision`（正确 fail-closed），C1 Reader 扩展后 D1 自动正确
- 影响章节：Section 1.3（新增可用性矩阵）、3.1（标注 Verification 依赖）、3.3（说明 authorization 行为）、5（新增 blocked reason）、6（D1-7 新增）、8.4-8.5（新增测试）、9（更新）
