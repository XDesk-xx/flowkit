# B1 Explore：Flowkit 核心模型、生命周期与验证边界

## 1. 基本信息

- Delivery：`20260805-01-product-baseline`
- Change Key：`B1`
- Change ID：`core-model`
- Action：`explore`
- 当前结果：等待 `review-explore`
- 计划输出：
  - `docs/core-model.md`
  - `docs/delivery-lifecycle.md`
  - `docs/verification-model.md`

## 2. 已冻结输入

B1 不重新讨论 A1 已冻结的产品定位：

> Flowkit 是以 Delivery 为编排核心、以 Change 为实施单元、以 Action 为执行步骤的确定性交付编排器。

本次 Explore 继承以下事实：

1. 正式层级为 `Delivery > Change > Action`；
2. 一个仓库最多一个活动 Delivery；
3. 一个活动 Delivery 中最多一个活动 Change；
4. Change 状态至少为 `planned | active | completed | cancelled`；
5. 四个主 Action 为 `explore | propose | apply | archive`；
6. Review、Revision、Verification 和 Checkpoint 不增加新的实体层；
7. Change Verification 属于 Change 边界；
8. Full Test 属于 Delivery 边界，必须由 owner 明确授权；
9. Change 只有在 Archive 和 Change Checkpoint 后才是 `completed`；
10. 不创建 `current.json`、pointer 文件或其他重复状态源；
11. Run 是一次 Action 执行实例，不等于 Action，也不是新的事实权威；
12. Change 级 Run 路径固定为：

```text
.flowkit/runs/<delivery-id>/<change-id>/<run-id>/
```

## 3. 本次需要解决的问题

B1 需要用最小模型回答：

- Delivery 和 Change 分别保存哪些状态；
- 当前唯一合法 Action 如何确定；
- Review、Revision、Verification、Checkpoint 如何进入流程但不形成额外 Phase；
- Run 与 Action、角色和 Git Commit 的边界；
- 同一 Action 内的多轮讨论和普通 Commit 是否需要多个 Run；
- reviewer 如何通过统一入口确定具体 Review Action；
- Review Run 何时、由谁创建；
- 不同 Review 阶段如何使用 Skill，又不形成 Skill Router；
- Apply、Verification、Review 和 Findings 修复如何闭环；
- Full Test 和 checkout 恢复边界。

## 4. 最小实体与状态

### 4.1 Delivery

Delivery 表达交付主线、Change 列表与依赖、架构影响、验证要求和完成条件。

主状态保持最小：

```text
active
completed
cancelled
```

`ready-for-full-test`、`awaiting-user-decision`、`full-test-failed` 和 `finalizing` 是验证状态或推导结论，不是 Delivery 主状态。

当前没有真实场景要求 `paused`，不预建；未来有需求时通过 Change 增加。

### 4.2 Change

Change 状态固定为：

```text
planned
active
completed
cancelled
```

不新增 `reviewing`、`revising`、`verifying` 或 `ready`。这些属于 Action 位置或 Policy 结论。

### 4.3 Action

主 Action：

```text
explore
propose
apply
archive
```

辅助 Action：

```text
review-explore
revise-explore
review-propose
revise-propose
review-apply
fix-review-findings
```

采用 `review-apply`，不使用只面向源码的 `review-code`；Apply 后修复统一使用 `fix-review-findings`，不再并存 `revise-apply`。

## 5. 不增加 Phase 层

正式层级仍是：

```text
Delivery
└─ Change
   └─ Action
```

- Review：独立判断 Action 结果；
- Revision/Fix：处理 Findings；
- Verification：确认 Apply/Fix 后的项目检查；
- Checkpoint：Change 完成的 Git 边界。

它们都不形成新实体层或新主状态。

## 6. 唯一合法 Action 由 Policy 计算

不持久化 `currentAction`。Policy 根据以下正式事实计算唯一下一步：

- 活动 Delivery 和 Change；
- Change 依赖；
- OpenSpec artifacts；
- 已完成或失败的 Run；
- reviewer Verdict；
- Change Verification；
- owner 授权；
- Archive、Checkpoint 和 Git 边界。

输出只能是：

```text
一个合法 Action
一个 owner 决策边界
一个明确 blocked diagnosis
```

出现多解或冲突必须阻塞，不能任意选择。

### 6.1 Reviewer 统一入口

`review` 是 reviewer 的统一执行入口，不是正式 Action。

执行 `review` 时：

1. 找到唯一 `active` Delivery；
2. 找到其中唯一 `active` Change；
3. 由 Policy 计算唯一下一 Action；
4. 确认结果属于：

```text
review-explore
review-propose
review-apply
```

5. 创建并执行对应 reviewer Run。

如果下一 Action 不是 Review、无法唯一确定或存在冲突，返回 blocked diagnosis。

因此：

```text
review
→ 统一入口

review-explore / review-propose / review-apply
→ 正式 Action
```

## 7. Change 推进规则

### 7.1 启动

`planned → active` 必须满足：

- Delivery 为 `active`；
- 没有其他 active Change；
- 所有依赖 Change 已 `completed`；
- owner 明确授权。

### 7.2 Explore

```text
explore
→ review-explore
→ approved：propose
→ changes-requested：revise-explore → review-explore
```

Review 前，owner 与 author 对同一份 Explore 的多轮讨论和收敛仍属于同一次 `explore`，不构成 `revise-explore`。只有 reviewer 返回 `changes-requested` 后才能进入 `revise-explore`。

### 7.3 Propose

```text
propose
→ review-propose
→ approved：等待 owner 允许 apply
→ changes-requested：revise-propose → review-propose
```

Proposal 未批准不能 Apply。

### 7.4 Apply

```text
apply
→ focused / affected verification
→ review-apply
→ approved：archive
→ changes-requested：fix-review-findings
→ focused / affected verification
→ review-apply
```

固定边界：

- Apply/Fix 后必须完成适用的 Change Verification；
- Verification 失败不能进入 `review-apply`；
- `fix-review-findings` 和 Review 都不自动运行 Full Test；
- Blocking Findings 未清零不能 Archive。

### 7.5 Archive 与完成

```text
review-apply approved
+ Blocking Findings = 0
+ Change Verification passed / not-applicable
+ Tasks complete
+ owner 授权 Archive
→ archive
→ sync delta specs（存在时）
→ Change Checkpoint Commit
→ Change.state = completed
```

## 8. Verification

### 8.1 Change Verification

最小状态：

```text
not-run
passed
failed
not-applicable
```

验证事实属于项目验证工具；Flowkit 只消费标准状态、摘要和结果引用。

### 8.2 Delivery Full Test

所有 required Changes 完成 Archive 和 Checkpoint 后：

```text
not-ready
→ awaiting-user-decision
→ authorized
→ passed | failed
```

Full Test 失败时：

- 不重新打开已归档 Change；
- 在当前 Delivery 新建 corrective Change；
- corrective Change 完整走闭环；
- 再次等待 owner 授权 Full Test。

## 9. Run 模型

### 9.1 Action 与 Run

```text
Action
→ 逻辑流程步骤

Run
→ 某个角色对该 Action 的一次执行实例
```

Run 最小状态：

```text
pending
completed
failed
cancelled
```

Run 保存本次任务、输入、范围、结果摘要、Findings/Verdict 或验证引用，以及建议下一步；不拥有 Change 契约、流程状态、Git 历史或专业事实。

### 9.2 同一 Action 的继续执行

同一个角色围绕同一个 Action 和目标进行多轮讨论、内容完善或普通 Git Commit，不创建新的 Run。

当前 B1 Explore 初稿、owner 讨论和最终收敛都属于：

```text
20260805-007-explore
```

仅在以下情况创建新 Run：

- 正式 Action 变化；
- 执行角色变化；
- 上一次 Run 失败或取消，需要重试。

Git Commit 只记录文件和历史，不决定 Run 数量。

### 9.3 Review Run 创建时机

Author 完成当前 Action 后，在自己的 `result.json` 中记录：

```text
nextAction: review-explore | review-propose | review-apply
```

Author 不预建空的 reviewer Run，也不创建 pending Review 占位目录。

Reviewer 真正执行 `review` 时：

1. Policy 解析唯一具体 Review Action；
2. 创建新的 reviewer Run；
3. 读取 Action Package 和完整待审边界；
4. 执行审查并写入该 Run 的 `result.json`。

当前示例：

```text
007-explore
→ author 的 Explore Run

008-review-explore
→ reviewer 真正开始审查时创建
```

Reviewer 审查当前 Action 的完整最终结果和对应 Git 边界，不只审查最后一个普通 Commit。

### 9.4 Review Skill 边界

具体 Review Action 可以声明执行方法或 Skill：

- `review-explore`：通常不需要代码审查 Skill；
- `review-propose`：检查契约完整性和边界一致性；
- 涉及源码的 `review-apply`：可使用 `code-review-and-quality`。

Skill 只提供当前 Action 内的方法，不得决定当前 Delivery、Change、Action、是否 Review、是否 Full Test、下一 Action、Archive 或 Finalize。

B1 只冻结语义边界；具体 Action Package 字段、Skill 标识和 Adapter 协议由 C1 定义，Bootstrap 操作说明由 D1 定义。

不引入：

```text
Skill Registry
Skill Router
动态 Skill 发现
Prompt Registry
```

### 9.5 Run 路径

Change 级：

```text
.flowkit/runs/<delivery-id>/<change-id>/<run-id>/
├─ action.md
├─ context.json
└─ result.json
```

使用语义 `change-id`；路径和 `context.json` 字段不一致时阻塞；归档 Change 的 Run 保留原位置。

Delivery 级 Run 候选位置：

```text
.flowkit/runs/<delivery-id>/_delivery/<run-id>/
```

`_delivery` 需由 `review-explore` 确认，确认前不创建。

Run ID 保持：

```text
YYYYMMDD-NNN-action
```

`NNN` 在 Delivery 内单调递增且唯一，不因 Change 分目录而重置。

## 10. Bootstrap、恢复与权威

Bootstrap 阶段：

- Delivery YAML 是 Delivery/Change 编排状态的人工维护投影；
- OpenSpec 保存 Change 契约；
- `.flowkit/runs/` 保存 committed 执行记录；
- Git 保存文件和边界历史；
- 人工按未来 Policy 判断下一步。

不创建：

```text
.flowkit/state.json
.flowkit/current.json
.flowkit/manifest.yaml
```

Checkout 后恢复：

1. 找唯一 active Delivery；
2. 校验 Delivery Branch；
3. 找零个或一个 active Change；
4. 校验依赖、OpenSpec 和 Runs；
5. 校验 Run 路径、字段、Verdict、Verification 和 Git 边界；
6. Policy 计算唯一下一步；
7. 执行 `review` 时，下一步必须是唯一 Review Action；
8. 缺失、冲突或多解时阻塞。

恢复不依赖聊天历史、`.tmp`、未提交日志、人工记忆、current pointer、预建 pending Review Run 或写入状态文件的当前 Commit SHA。

## 11. B1 与后续 Change 的边界

### B1 负责

- Delivery、Change、Action、Run 的核心语义；
- 状态、转换和阻塞规则；
- reviewer 统一入口与正式 Review Action 的关系；
- 同一 Action 和新 Run 的边界；
- Skill 使用的流程权威边界；
- Verification、Full Test 和 checkout 恢复位置。

### C1 负责

- OpenSpec、Git、Reviewer、Archify、CodeGraph 和验证工具的输入输出；
- Action Package、Skill 声明、Adapter、Schema 和错误协议。

### D1 负责

- owner、author、reviewer 的具体协作步骤；
- 展示、授权、Commit、Push、Handoff 和 Checkpoint 操作规范；
- Bootstrap 手工执行说明。

## 12. 探索结论

B1 Explore 建议冻结：

1. Delivery 主状态为 `active | completed | cancelled`，暂不预建 `paused`；
2. Change 状态为 `planned | active | completed | cancelled`；
3. Review、Revision、Verification 和 Checkpoint 不形成额外 Phase；
4. 当前合法 Action 由 Policy 计算，不保存 current pointer；
5. 主 Action 为 `explore | propose | apply | archive`；
6. Apply 审查使用 `review-apply`，修复使用 `fix-review-findings`；
7. Change Verification 是 Apply/Fix 后的强制边界；
8. Full Test 是 Delivery 级 owner 授权边界；
9. Full Test 失败创建 corrective Change，不重开归档 Change；
10. Change 级 Run 使用 `.flowkit/runs/<delivery-id>/<change-id>/<run-id>/`；
11. Delivery 级 Run 候选目录为 `_delivery/`；
12. Run ID 在 Delivery 内唯一并单调递增；
13. Run 不是流程状态或专业事实的第二权威；
14. reviewer 使用统一入口 `review`，正式 Action 仍是三种具体 Review Action；
15. `review` 只能执行 Policy 唯一计算出的 Review Action；
16. 同一角色、同一 Action 的多轮讨论和普通 Commit 属于同一 Run；
17. Review Run 在 reviewer 真正执行时创建，author 不预建占位 Run；
18. Review Action 可声明执行 Skill，但 Skill 不拥有流程；
19. checkout 后只依赖正式状态、OpenSpec、Git 和 committed Run 恢复。

## 13. Review 重点

`review-explore` 应审查整个 B1 Explore，而不是只审查本轮新增段落：

1. 是否隐含额外 Phase 或重复状态；
2. Policy 推导下一 Action 是否足以确定性恢复；
3. `review-apply + fix-review-findings` 命名是否合理；
4. 是否需要 `paused`；
5. `_delivery` 是否适合作为 Delivery 级 Run 目录；
6. Full Test 状态是否仍可收缩；
7. B1 是否越过 C1 或 D1；
8. 统一 `review` 入口是否保持确定性；
9. reviewer 执行时才创建 Review Run 是否正确；
10. 同一 Action 与新 Run 的边界是否清晰；
11. 阶段 Skill 是否保持轻量并避免第二流程权威。
