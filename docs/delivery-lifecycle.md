# Flowkit Delivery 与 Change 生命周期

## 1. 核心不变量

Flowkit 必须保持：

1. 一个仓库最多一个 `active` Delivery；
2. 一个 active Delivery 中最多一个 `active` Change；
3. 当前合法下一 Action 由 Policy 根据正式事实计算；
4. 不持久化 `currentAction`、current pointer 或并列流程状态；
5. Review 是正式边界；
6. Revision/Fix 仅在 matching `changes-requested` 的 blocking authorities 非空且全部为 `author` 时合法；
7. owner 授权不能被 reviewer、Skill 或验证工具替代。

## 2. Delivery 生命周期

Delivery 主状态：

```text
active
completed
cancelled
```

### 2.1 Delivery 完成

Delivery 只有在以下条件全部满足后才可以进入 `completed`：

- 所有 required Changes 为 `completed`；
- 所有 Change 已 Archive 并形成 Change Checkpoint；
- 所有 Blocking Findings 已清零；
- 正式文档不存在已知冲突；
- Delivery 验证条件满足；
- owner 明确授权 Finalize；
- Delivery 完成边界已经形成。

### 2.2 Delivery 取消

```text
active → cancelled
```

规则：

- 只有 owner 可以授权；
- completed Delivery 不得转为 cancelled；
- 已 completed Changes 保持 completed；
- 所有未 completed Changes 在同一逻辑取消边界中变为 cancelled；
- 正式 artifacts、committed Runs 和 Git 历史保留；
- cancelled Delivery 不进入 Full Test、Finalize 或 completed。

具体命令、确认提示和 Git 操作属于 D1。

## 3. Change 生命周期

Change 状态：

```text
planned
active
completed
cancelled
```

### 3.1 激活

```text
planned → active
```

必须满足：

- 所属 Delivery 为 active；
- 当前没有其他 active Change；
- declared dependencies 均为 completed；
- owner 明确授权。

任一条件不满足时必须返回 blocked diagnosis。

### 3.2 Explore

```text
explore
→ review-explore
→ approved: propose
→ changes-requested + author-only blockers: revise-explore → review-explore
→ changes-requested + any non-author blocker: blocked authority boundary
   └─ explicit same-stage review-explore 合法；next() 不自动触发
```

Review 前，owner 与 author 对同一份 Explore 的讨论和收敛仍属于同一次 `explore`。

`changes-requested` 本身不等价于 revise-required。只有当前 matching Review 的 blocking authorities 非空且全部为 `author` 时，`revise-explore` 才合法；存在任一 non-author blocker 时 Author revise 不合法。

### 3.3 Propose

```text
propose
→ review-propose
→ approved: 等待 owner 授权 apply
→ changes-requested + author-only blockers: revise-propose → review-propose
→ changes-requested + any non-author blocker: blocked authority boundary
   └─ explicit same-stage review-propose 合法；next() 不自动触发
```

`review-propose` approved 只表示 Proposal 合法，不自动开始 Apply。

Apply 必须同时满足：

- review-propose Verdict 为 approved；
- owner 明确授权 Apply。

### 3.4 Apply

```text
apply
→ Change Verification
→ review-apply
→ approved: 等待 owner 授权 archive
→ changes-requested + author-only blockers: revise-apply
   → Change Verification
   → review-apply
→ changes-requested + any non-author blocker: blocked authority boundary
   └─ explicit same-stage review-apply 合法；next() 不自动触发
```

规则：

- Apply/Revision 后必须执行适用的 focused、affected、lint、typecheck 或文档检查；
- Verification 为 failed 或 not-run 时不能进入 review-apply；
- `revise-apply` 仅在 matching Review 为 author-only blocking 时合法，并且必须只处理当前 `review-apply` Findings，不得扩张 Change 范围；
- `fix-review-findings` 是 `revise-apply` 的 goal，而不是正式 Action；
- 修订后必须重新验证；
- Apply、Revision、Review 和 Archive 都不得自动运行 Full Test。


### 3.4.1 Non-author blocker 与显式 re-review

对于任一阶段的 matching `changes-requested` Review：

- blocking authorities 全部为 `author`：Author revise 合法，Policy 可推导对应 `revise-*`；
- 包含任一 `owner / verification / external`：Author revise 不合法，`next()` 必须保持 blocked 在 non-author authority boundary；
- 在后一种情况下，explicit same-stage `review-*` 在 Policy 层必须合法，unchanged target 也可进入新的 Reviewer execution / Review generation；
- 每次显式 re-review 都由 Reviewer 使用执行时最新可用 authority facts 重新判断 Findings / Verdict；
- Policy 只判断 Action 是否合法，不机器证明“现在是否值得重审”，也不自动调度或触发 re-review。

### 3.5 Archive 与完成

Change 只有在以下条件全部满足时才能进入 Archive：

- review-apply Verdict 为 approved；
- Blocking Findings 为 0；
- Change Verification 为 passed 或 not-applicable；
- Tasks 已完成；
- owner 明确授权 Archive。

随后：

```text
Flowkit 前置 gate 通过
→ 调用 OpenSpec archive
→ OpenSpec 自己完成 delta spec sync / relocation，并返回 success 或 failure
→ success 后 Flowkit 记录 Change.state = completed
→ Change 关闭
→ 下一 Flowkit/Git 边界：Change Checkpoint
```

Flowkit 不在 OpenSpec archive 成功后扫描 archive 目录、重新解释 specs merge，或再次证明 OpenSpec 已经拥有的 archive 事实。

Review approved 但尚未 Archive 时，Change 仍为 active。OpenSpec Archive 成功后，即使 Change Checkpoint 尚未形成，Change 也已经 completed；Checkpoint 不要求重新激活 Change，也不要求重新投影该 Change 的历史 Runs。

### 3.6 Change 取消

```text
planned → cancelled
active  → cancelled
```

规则：

- 只有 owner 可以授权；
- completed Change 不得转为 cancelled；
- 已产生的 OpenSpec artifacts、committed Runs 和 Git 历史保留；
- cancelled 不等于 completed；
- cancelled Change 不满足 dependency completion；
- 依赖 cancelled Change 的其他 Change 保持 blocked，直到 owner 取消、替换或重新规划依赖。

### 3.7 Change artifact 生命周期

active Change 的正式 artifact 位于 `openspec/changes/<changeId>/`：

```text
explore.md / proposal.md / design.md / specs/** / tasks.md / verification.md
```

这些是 **mutable current-state canonical path**，不是每个 terminal Run 的 immutable history store：

- 合法 `revise-explore` / `revise-propose` MAY 覆盖同一路径；历史 `producedResultRefs` / `verificationSummaryRef` 只表达 point-in-time 版本，不因后续合法 current bytes 变化产生历史 conflict；
- Reader 只把当前 Policy 真正需要的 active Change Runs 投影为 Change-level facts，不通过 `current / superseded / revision-window` 重放 completed Change 的 mutable artifact 历史；
- 当前 Review 或下一 Action handoff MAY 在 entry / review completion 边界 exact-check 当前被消费版本；一旦 handoff 成功，前序 mutable ref 不继续充当后续 Action 的 artifact authority；
- `pending` 只属于 Run，表示尚无 terminal result；它不是 Action 状态，也不是 artifact revision window；
- archive 的 relocation、delta spec sync 与 operation success/failure 由 OpenSpec authority 负责；Flowkit 只做 archive 前置 gate/handoff，并记录 operation 结果，不做 post-archive path replay；
- `.tmp/**` 只作可删除 scratch，resume / review / archive 不得依赖其作为唯一事实来源；
- terminal `result.json` 发布继续保持 Core-owned preflight 与 create-once；preflight 失败不发布 terminal result，Run 保持 `pending`，修正当前输入后可重试。

## 4. Review 与 Revision/Fix 多轮闭环

Review 可以多轮执行：

```text
review
→ changes-requested
→ revise/fix
→ review
→ ...
→ approved
```

Revision/Fix 不是被“跳过”，而是在 Review approved 时不适用。

不得创建：

- `revisionStatus: skipped`；
- 空 Revision Run；
- Review waiver；
- Blocking Finding override；
- 强制继续状态。

Owner 可以承担 reviewer 角色，但正式 Review Action、Findings 和 Verdict 必须存在。

当 Verdict 为 changes-requested 时，owner 的合法选择是：

- 授权 author 执行 Revision/Fix；
- 明确改变范围或冻结决定后重新 Review；
- 取消 Change 或 Delivery。

Owner 不得直接绕过 Verdict 推进下一主 Action。

## 5. Policy：唯一合法下一 Action

Flowkit 不保存 `currentAction`。Policy 使用以下正式事实计算唯一下一步：

- active Delivery 和 Change；
- Change dependencies；
- OpenSpec artifacts；
- committed Runs；
- reviewer Verdict；
- Change Verification；
- Delivery `fullTestStatus`；
- owner 授权事实；
- Archive、Checkpoint 和 Git 边界。

输出只能是：

```text
一个合法 Action
一个 owner 决策边界
一个明确 blocked diagnosis
```

如果相同事实可以推出多个 Action，或事实之间冲突，Policy 必须阻塞并报告冲突。

## 6. 统一 `review` 入口

`review` 是 reviewer 的统一执行入口，不是正式 Action。

执行步骤：

1. 找到唯一 active Delivery；
2. 找到其中唯一 active Change；
3. Policy 计算唯一下一 Action；
4. 确认它属于：
   - `review-explore`
   - `review-propose`
   - `review-apply`
5. 创建并执行对应 reviewer Run。

如果下一 Action 不是 Review、结果不唯一或存在冲突，返回 blocked diagnosis，并且不创建 reviewer Run。

## 7. 统一 `revise` 入口

`revise` 是 author 的统一执行入口，不是正式 Action。

执行步骤：

1. 找到唯一 active Delivery；
2. 找到其中唯一 active Change；
3. 读取当前唯一有效的 `changes-requested` Verdict；
4. Policy 解析对应的：
   - `revise-explore`
   - `revise-propose`
   - `revise-apply`
5. 创建并执行对应 author Run。

如果不存在 `changes-requested`、结果不唯一、Verdict 已失效或存在冲突，返回 blocked diagnosis，并且不创建 Revision Run。

`revise-apply` 的默认 goal 是 `fix-review-findings`；goal 和 Skill 协议由 C1 定义，不改变正式 Action 名称。

## 8. Run 与生命周期

同一角色、同一 Action、同一目标的多轮工作属于同一个 Run。

Author 完成 Action 后只记录 `nextAction: review-*`；Reviewer 真正开始 Review 时才创建下一 reviewer Run。

Git Commit 只记录文件历史，不决定 Action 或 Run 数量。

## 9. Checkout 后恢复

恢复步骤：

1. 找到唯一 active Delivery；
2. 校验 Delivery Branch；
3. 找到零个或一个 active Change；
4. 校验 dependencies；
5. 校验 OpenSpec artifacts；
6. 读取并校验 committed Runs；
7. 校验 Run 路径、上下文、状态和编号；
8. 校验 Verdict、Change Verification、`fullTestStatus`、Archive、Checkpoint 和 Git 边界；
9. 由 Policy 计算唯一合法下一步；
10. 缺失、冲突或多解时返回 blocked diagnosis。

恢复不得依赖：

- 聊天历史；
- `.tmp`；
- 未提交日志；
- 人工记忆；
- current pointer；
- 预建 pending Review Run；
- 写入状态文件的当前 Commit SHA。

## 10. D1 所属的具体交互

以下内容不由本文件定义，统一由 D1 冻结：

- Action 完成后如何向 owner 展示；
- owner 如何授权 Apply、Archive、Full Test 和 Finalize；
- 何时创建普通 Commit；
- 何时 Push；
- 如何切换 author 与 reviewer；
- reviewer 如何执行统一 `review`；
- author 如何执行统一 `revise`；
- Checkpoint 的具体 Git 操作。

## 11. A1 Creation 与 Activation Boundary

正常产品 write-side：

```text
create Delivery
→ Delivery active

create Change
→ Change planned

Policy: owner-decision activate-change
+ Owner explicit sourceRef
→ minimal OpenSpec metadata
→ atomic Manifest publish(owner decision + planned→active)
→ next() = explore
```

`dependsOn` 必须按 `Change.id` 判断 completed dependency。Activation 不是 Formal Action，也不产生 Standard Run 或独立 Git boundary。

Authorization-only Owner record（Apply / Archive / Checkpoint / Full Test / Finalize）只能在 fresh formal snapshot 的 current Policy 正在请求完全相同 decision 与 canonical target 时写入；否则 fail-closed 且 Manifest byte-identical。
