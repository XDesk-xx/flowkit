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

---

## 2. 已冻结输入

B1 不重新讨论 A1 已冻结的产品定位：

> Flowkit 是以 Delivery 为编排核心、以 Change 为实施单元、以 Action 为执行步骤的确定性交付编排器。

以下内容作为 B1 的输入事实：

1. 固定层级为 `Delivery > Change > Action`；
2. 一个仓库最多只有一个活动 Delivery；
3. 一个活动 Delivery 中最多只有一个活动 Change；
4. Change 状态至少包括 `planned | active | completed | cancelled`；
5. Change 的四个主 Action 为 `explore | propose | apply | archive`；
6. Review 与 Revision 是主 Action 周围的必要闭环；
7. Change Verification 属于 Change 边界；
8. Full Test 属于 Delivery 边界，必须由 owner 明确授权；
9. Change 在 Archive 和 Change Checkpoint 后才成为 `completed`；
10. 不创建额外 `current.json`、pointer 文件或重复状态源；
11. Run 是一次执行实例，不等于 Action，也不是新的事实权威；
12. Change 级 Run 的正式路径已由 owner 确认：

```text
.flowkit/runs/<delivery-id>/<change-id>/<run-id>/
```

B1 只需要将该结构纳入正式模型，不再比较是否需要 Change 层。

---

## 3. 本次 Explore 要解决的问题

B1 需要回答：

> 在不建立重复状态和通用工作流平台的前提下，Flowkit 如何用最小模型确定当前 Delivery、当前 Change、唯一合法下一 Action、验证边界和 checkout 后的恢复结果？

需要消除的歧义包括：

- Delivery 和 Change 的状态分别保存什么；
- “当前 Action”是持久化字段还是确定性计算结果；
- Review、Revision 和 Verification 是否形成额外 Phase；
- Run 与 Action、流程状态和 Git Commit 的关系；
- Apply 修复后如何重新验证和复核；
- Change 完成与 Delivery Ready 的区别；
- Full Test 失败后是否重新打开已归档 Change；
- checkout 后如何只依赖正式事实恢复流程。

---

## 4. 最小实体模型

### 4.1 Delivery

Delivery 是交付主线和最终验收边界，至少表达：

- `id`、`state`、`branch`、`goal`；
- 范围和 Change 列表；
- Change 依赖；
- 架构影响声明；
- Change Verification 要求；
- Full Test 授权状态；
- Delivery 完成条件。

Delivery 主状态建议保持最小：

```text
active
completed
cancelled
```

`ready-for-full-test`、`awaiting-user-decision`、`full-test-failed` 和 `finalizing` 不作为 Delivery 主状态，而作为验证状态或由当前事实推导的流程结论。

`paused` 当前没有已确认场景，不在核心模型中预建；未来有真实需求时再通过 Change 增加。

### 4.2 Change

Change 正式状态固定为：

```text
planned
active
completed
cancelled
```

含义：

- `planned`：属于当前 Delivery，但尚未启动；
- `active`：当前唯一正在推进的 Change；
- `completed`：已完成 Review、Archive 和 Change Checkpoint；
- `cancelled`：明确终止，不再推进。

Change 不新增 `reviewing`、`revising`、`verifying` 或 `ready` 等主状态。这些是 Action 流程位置或 Policy 判断结果，不是 Change 生命周期状态。

### 4.3 Action

四个主 Action：

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

建议：

- 使用 `review-apply`，而不是只适用于源码的 `review-code`；
- Apply 后的修复统一使用 `fix-review-findings`；
- 不再同时保留语义重叠的 `revise-apply`；
- Change Verification 是 Apply/Fix 后的强制结果边界，不是第五个主 Action；
- Change Checkpoint 是 Archive 后的 Git 正式边界，不是业务 Action。

---

## 5. 不建立额外 Phase 层

正式层级仍然只有：

```text
Delivery
└─ Change
   └─ Action
```

Review、Revision、Verification 和 Checkpoint 分别表示：

- Review：独立判断 Action 结果；
- Revision/Fix：处理 Findings；
- Verification：确认当前 Apply 结果是否满足项目检查；
- Checkpoint：Change 完成的 Git 边界。

它们不形成新的 Phase 实体，避免同时维护 Change 状态、Phase 状态、Action 状态和 current pointer。

---

## 6. 唯一合法 Action 由 Policy 计算

建议：

> “当前唯一合法 Action”是 Flowkit Policy 根据正式事实计算出的结果，而不是额外手工维护的 `currentAction` 指针。

计算输入包括：

- 活动 Delivery 和 Change 的状态；
- Change 依赖是否完成；
- OpenSpec artifacts 是否存在和完成；
- 相关 Run 的状态；
- reviewer Verdict；
- Change Verification 结果；
- owner 授权事实；
- Archive 和 Checkpoint 是否完成；
- Git HEAD 是否包含所引用边界。

Policy 输出只能是：

```text
一个合法 Action
一个需要 owner 决策的边界
一个明确 blocked diagnosis
```

如果同一组正式事实能推出两个不同下一 Action，必须阻塞并报告冲突，不能任意选择。

---

## 7. Change 合法推进规则

### 7.1 启动 Change

`planned → active` 必须满足：

- 所属 Delivery 为 `active`；
- 没有其他 `active` Change；
- 所有 `dependsOn` Change 均为 `completed`；
- owner 明确授权启动。

### 7.2 Explore

```text
explore
→ review-explore
→ approved：propose
→ changes-requested：revise-explore → review-explore
```

Explore 可以自由调查，但进入 Review 前必须形成可持久化结论。

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

- Apply 和修复后必须执行适用的 Change Verification；
- Verification 失败不能进入 review-apply；
- `fix-review-findings` 不自动运行 Full Test；
- Review 不自动运行 Full Test；
- Blocking Findings 未清零不能 Archive。

### 7.5 Archive 和完成

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

Change 只有在 Archive 和 Checkpoint 同时完成后才是 `completed`。

---

## 8. Verification 模型

### 8.1 Change Verification

最小状态：

```text
not-run
passed
failed
not-applicable
```

验证事实属于项目验证工具；Flowkit 只保存检查标识、标准状态、摘要和结果引用。

Apply 或 `fix-review-findings` 后，所有适用检查必须达到：

```text
passed | not-applicable
```

才能进入 review-apply。

### 8.2 Delivery Full Test

所有 required Changes 完成 Archive 和 Checkpoint 后，Delivery 才可能进入：

```text
fullTestStatus = awaiting-user-decision
```

建议最小机器状态：

```text
not-ready
awaiting-user-decision
authorized
passed
failed
```

流程为：

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
- 再次回到 owner 的 Full Test 授权边界。

---

## 9. Run 模型

### 9.1 Action 与 Run

```text
Action
→ 逻辑流程步骤

Run
→ 某个 author 或 reviewer 对该 Action 的一次执行实例
```

一个 Action 可以有多个 Run。

Run 状态至少需要：

```text
pending
completed
failed
cancelled
```

Run 只保存本次任务、输入上下文、固定范围、输出摘要、Findings/Verdict 或验证引用，以及建议下一步。

Run 不拥有 Change 契约、当前流程状态、Git 历史、正式产品/架构决定或测试工具的完整日志。

### 9.2 Change 级 Run 目录

正式路径：

```text
.flowkit/runs/<delivery-id>/<change-id>/<run-id>/
├─ action.md
├─ context.json
└─ result.json
```

规则：

- 使用语义 `change-id`，不使用本地 key（如 `B1`）；
- 路径表达 Run 的 Delivery/Change 归属；
- `context.json` 仍保留 `deliveryId`、`changeKey`、`changeId` 用于校验；
- 路径归属和文件字段不一致时必须阻塞；
- 已归档 Change 的 Run 保留原位置，不随 OpenSpec Change 一起移动。

### 9.3 Delivery 级 Run

Full Test、Delivery Review 和 Delivery Finalize 不属于某个 Change。

建议使用保留目录：

```text
.flowkit/runs/<delivery-id>/_delivery/<run-id>/
```

`_delivery` 不是 Change ID，只表示 Delivery 级执行。该决定需要在 review-explore 中确认；确认前不创建 Delivery 级 Run。

### 9.4 Run ID

当前 Bootstrap 使用：

```text
YYYYMMDD-NNN-action
```

建议：

- `NNN` 在一个 Delivery 内单调递增；
- Run 即使按 Change 分目录，仍保持 Delivery 内唯一；
- 不因目录迁移改变既有 `runId`；
- Run ID 不编码流程权威状态。

---

## 10. Bootstrap 与自托管状态权威

### Bootstrap

- Delivery YAML 是 Delivery/Change 编排状态的正式人工维护投影；
- OpenSpec 保存 Change 契约；
- `.flowkit/runs/` 保存 committed 执行记录；
- Git 保存文件和边界历史；
- 人工按未来 Policy 判断下一步。

Bootstrap 可以使用 `.flowkit/runs/`，但不创建伪 runtime 状态：

```text
.flowkit/state.json
.flowkit/current.json
.flowkit/manifest.yaml
```

### 自托管后

- `.flowkit/` 成为流程状态权威；
- Delivery YAML 可作为声明输入或投影，但不能形成双权威；
- B1 只冻结 one fact, one authority 和最小恢复语义；
- 具体迁移与兼容方式不在本 Delivery 实现。

---

## 11. Checkout 后恢复

恢复流程建议固定为：

1. 找到唯一 `active` Delivery；
2. 校验 Delivery Branch；
3. 找到零个或一个 `active` Change；
4. 校验 Change 依赖和 OpenSpec 目录；
5. 读取对应 Delivery/Change 下的 Runs；
6. 校验 Run 路径、字段、状态和引用；
7. 校验 Verdict、Verification 和 Git 边界；
8. 由 Policy 计算唯一合法下一步；
9. 缺失、冲突或多解时返回 blocked diagnosis。

恢复不能依赖聊天历史、`.tmp`、未提交日志、人工记忆、current pointer 或写入状态文件的“当前 Commit SHA”。

---

## 12. B1 与后续 Change 的边界

### B1 负责

- Delivery、Change、Action、Run 的核心语义；
- 状态枚举；
- 合法转换和阻塞规则；
- Change Verification 与 Full Test 的流程位置；
- checkout 后恢复所需的最小事实；
- Run 的层级归属和流程关系。

### C1 负责

- OpenSpec、Git、Reviewer、Archify、CodeGraph 和验证工具的具体输入输出；
- Adapter、Schema 和错误协议；
- 外部结果如何转换为 Flowkit 可消费结构。

### D1 负责

- owner、author、reviewer 的具体协作步骤；
- 何时展示内容和请求授权；
- 普通 Commit、Push、Handoff 和 Checkpoint 的操作规范；
- Bootstrap 手工执行说明。

B1 可以定义“某边界必须存在 Commit/Checkpoint”，但不定义具体 Git 命令或每次交互的提交时机。

---

## 13. 探索结论

B1 Explore 建议冻结：

1. Delivery 主状态保持最小，不把验证阶段扩张为主状态；
2. Change 状态固定为 `planned | active | completed | cancelled`；
3. Review、Revision、Verification 和 Checkpoint 不形成额外 Phase 层；
4. 当前合法 Action 由 Policy 根据正式事实计算，不维护 current pointer；
5. 四个主 Action 为 `explore | propose | apply | archive`；
6. Apply 审查使用 `review-apply`，修复统一使用 `fix-review-findings`；
7. Change Verification 是 Apply/Fix 后的强制边界，不是第五个主 Action；
8. Full Test 只在所有 Changes checkpointed 后进入 owner 授权边界；
9. Full Test 失败创建 corrective Change，不重新打开归档 Change；
10. Change 级 Run 路径固定为 `.flowkit/runs/<delivery-id>/<change-id>/<run-id>/`；
11. Delivery 级 Run 建议放入 `_delivery/`；
12. Run ID 在 Delivery 内唯一并单调递增；
13. Run 不是流程状态或专业事实的第二权威；
14. checkout 后只依赖正式状态、OpenSpec、Git 和 committed Run 确定性恢复。

---

## 14. Review 重点

review-explore 应重点判断：

1. 是否仍然隐含额外 Phase 层；
2. “当前 Action 计算而非持久化指针”是否足以确定性恢复；
3. `review-apply + fix-review-findings` 命名是否应成为正式标准；
4. Delivery 主状态是否需要 `paused`；
5. Delivery 级 Run 使用 `_delivery` 是否合适；
6. Full Test 最小状态是否需要进一步收缩；
7. B1 是否越过 C1 或 D1 的协议边界。
