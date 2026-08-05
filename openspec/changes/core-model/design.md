## Context

Flowkit 当前处于 Bootstrap 产品基线 Delivery。A1 已冻结产品定位和 `One fact, one authority`。B1 Explore 已通过独立 `review-explore`，无 Blocking Findings。

本设计将 Explore 结论转为正式核心模型，并收敛 reviewer 的三个 Non-blocking Findings：

1. `fullTestStatus` 归属 Flowkit 的 Delivery 验证子状态；Bootstrap 由 Delivery YAML 人工投影，自托管后由 Flowkit Delivery 状态承载；
2. 为 Delivery 和 Change 的 `cancelled` 增加最小 owner 授权转换；
3. B1 只描述抽象执行方法类别，不绑定具体 Skill 标识。

## Goals / Non-Goals

**Goals:**

- 定义 Delivery、Change、Action、Run 的最小正式模型
- 定义主状态、验证子状态和合法转换
- 定义 Review 必经、Revision/Fix 条件出现以及可多轮循环
- 明确 owner 可以承担 reviewer 角色，但不能绕过 `changes-requested`
- 定义 Policy 唯一下一 Action
- 定义统一 `review` 入口和 reviewer Run 创建时机
- 定义 Change Verification 与 Delivery Full Test
- 定义 checkout 后确定性恢复
- 为 C1、D1 和后续 Runner 实现提供稳定契约

**Non-Goals:**

- 不实现 Runner、CLI 或生产代码
- 不定义 JSON Schema、数据库结构或具体持久化格式
- 不定义 Action Package、Adapter 或 Skill 加载协议
- 不定义具体 Git 命令、Commit 时机和交互文案
- 不提供 Review waiver、Blocking Finding override 或自动 Full Test
- 不建立 Registry、Plugin、Evidence、Receipt 或通用工作流平台

## Decisions

### Decision 1: 保持三层实体模型

正式实体层级固定为：

```text
Delivery
└─ Change
   └─ Action
```

Run 是某个角色对某个 Action 的一次执行实例，不形成新的产品实体层。Review、Revision/Fix、Verification 和 Checkpoint 不形成额外 Phase。

### Decision 2: 固定最小状态

Delivery 主状态：

```text
active
completed
cancelled
```

Change 状态：

```text
planned
active
completed
cancelled
```

不预建 `paused`、`reviewing`、`revising`、`verifying` 或 `ready`。Full Test 等状态属于 Delivery 验证子状态或 Policy 推导结论，不是 Delivery 主状态。

### Decision 3: 固定 Action Catalog

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

B1 显式以 `fix-review-findings` 替代 Bootstrap v1 的 `revise-apply`。该命名只收窄 Apply Review 后的修复语义：

- 修复来源必须是当前 reviewer Findings；
- 修复不得借机扩张 Change；
- 修复后重新运行适用的 Change Verification；
- 不自动运行 Full Test。

`review-code` 不作为正式 Action，因为 Apply 结果可能包含代码、文档、配置或其他产物。

### Decision 4: Review 必经，Revision/Fix 条件出现

Explore：

```text
explore
→ review-explore
→ approved: propose
→ changes-requested: revise-explore → review-explore
```

Propose：

```text
propose
→ review-propose
→ approved: 等待 owner 授权 apply
→ changes-requested: revise-propose → review-propose
```

Apply：

```text
apply
→ Change Verification
→ review-apply
→ approved: 等待 owner 授权 archive
→ changes-requested: fix-review-findings
→ Change Verification
→ review-apply
```

规则：

- Review 是正式生命周期边界；
- Review 和 Revision/Fix 都可以多轮循环；
- Revision/Fix 不是被“跳过”，而是在 Review `approved` 时不适用；
- 只有对应 Verdict 为 `changes-requested` 时，Revision/Fix 才合法；
- 不记录 `skipped` Revision 状态。

### Decision 5: Owner 与 reviewer 角色分离

Owner 可以亲自承担 reviewer 角色，也可以授权独立执行者承担 reviewer 角色。无论执行者是谁，正式 Review Action、Findings 和 Verdict 都必须存在。

Owner 不得在 `changes-requested` 后直接推进下一主 Action。此时可以：

- 授权 author 执行对应 Revision/Fix；
- 明确改变范围或冻结决定后重新 Review；
- 取消 Change 或 Delivery。

B1 不引入 Review waiver、Finding override 或强制继续机制。

### Decision 6: Policy 计算唯一下一 Action

Flowkit 不保存 `currentAction`、`current-review.json` 或其他 pointer。Policy 根据 active Delivery/Change、dependencies、OpenSpec artifacts、committed Runs、Verdict、Verification、`fullTestStatus`、owner 授权以及 Archive/Checkpoint/Git 边界计算唯一下一步。

输出只能是：

```text
一个合法 Action
一个 owner 决策边界
一个明确 blocked diagnosis
```

多解或正式事实冲突时必须阻塞。

### Decision 7: `review` 是统一入口

`review` 是 reviewer 的统一执行入口，不是正式 Action。

执行时：

1. 找到唯一 active Delivery；
2. 找到唯一 active Change；
3. Policy 计算唯一下一 Action；
4. 确认它属于 `review-explore | review-propose | review-apply`；
5. 创建并执行对应 reviewer Run。

下一 Action 不是 Review 或无法唯一确定时，返回 blocked diagnosis。

### Decision 8: Run 边界固定

Run 最小状态：

```text
pending
completed
failed
cancelled
```

同一角色、同一 Action、同一目标内的多轮讨论、内容完善和普通 Git Commit 属于同一个 Run。

仅在正式 Action 改变、执行角色改变，或前一 Run failed/cancelled 需要重试时创建新 Run。

Author 完成 Action 后只记录 `nextAction: review-*`，不预建空 reviewer Run。Reviewer 真正执行 `review` 时才创建 reviewer Run。

Change 级路径：

```text
.flowkit/runs/<delivery-id>/<change-id>/<run-id>/
```

Delivery 级路径：

```text
.flowkit/runs/<delivery-id>/_delivery/<run-id>/
```

Run ID 使用 `YYYYMMDD-NNN-action`，`NNN` 在 Delivery 内唯一且单调递增。

### Decision 9: 最小取消规则

Change 可以 `planned → cancelled` 或 `active → cancelled`；Delivery 可以 `active → cancelled`。

共同规则：

- 仅 owner 可以授权；
- completed 实体不得转为 cancelled；
- 已产生的 OpenSpec artifacts、committed Runs 和 Git 历史必须保留；
- cancelled Change 不满足 dependency completion；
- 依赖 cancelled Change 的 Change 保持 blocked；
- 取消 Delivery 时，未 completed Changes 变为 cancelled，completed Changes 保持 completed；
- cancelled Delivery 不进入 Full Test、Finalize 或 completed。

具体命令、提示和工作区处理属于 D1；持久化 Schema 属于 C1 或后续实现。

### Decision 10: Change Verification

状态：

```text
not-run
passed
failed
not-applicable
```

项目验证工具拥有完整结果；Flowkit 只拥有推进流程需要的状态、摘要与引用。Apply/Fix 后所有适用检查必须为 `passed | not-applicable`，才能进入 `review-apply`。

### Decision 11: Full Test 是 Delivery 验证子状态

`fullTestStatus`：

```text
not-ready
awaiting-user-decision
authorized
passed
failed
```

权威边界：

- Flowkit 拥有 `fullTestStatus`；
- 项目验证工具拥有完整 Full Test 结果；
- Delivery 级 Run 可记录授权、执行或结果消费，但不是状态权威；
- Bootstrap 由 Delivery YAML 人工投影；
- 自托管后由 Flowkit Delivery 状态承载；
- 具体 Schema、序列化路径和 Adapter 由 C1 或后续实现定义。

所有 required Changes completed 后进入 `awaiting-user-decision`；只有 owner 可授权。失败时创建 corrective Change，不重开已归档 Change；corrective Change 创建后回到 `not-ready`。

### Decision 12: Skill 保持抽象

Action 可以声明文档审查、契约审查、代码审查、安全审查或性能审查等执行方法类别。

B1 不绑定具体 Skill 标识。Skill 不得决定 Delivery、Change、Action、Review、Full Test、下一 Action、Archive 或 Finalize。具体 Skill 字段、标识、加载和 Adapter 属于 C1。

### Decision 13: Checkout 恢复只依赖正式事实

恢复依赖 active Delivery/Change、Branch、dependencies、OpenSpec artifacts、committed Runs、Verdict、Verification、`fullTestStatus`、owner 授权以及 Archive/Checkpoint/Git 边界。

不得依赖聊天历史、`.tmp`、未提交日志、人工记忆、current pointer、预建 pending Review Run 或写入状态文件的当前 Commit SHA。

## Risks / Trade-offs

| 风险 | 等级 | 缓解措施 |
|---|---|---|
| 状态过少 | 中 | 只实现当前真实流程，未来通过 Change 增加 |
| `cancelled` 规则过轻 | 低 | B1 冻结语义，D1/C1 处理操作与 Schema |
| Full Test 状态与测试结果混淆 | 高 | Flowkit 只拥有流程状态，完整结果仍归验证工具 |
| Owner 承担 reviewer 被误解为跳过 Review | 中 | 正式 Review Action、Findings/Verdict 始终存在 |
| Run 被误解为状态权威 | 中 | 明确 Run 只记录一次执行 |
| Skill 名称提前固化 | 中 | B1 只使用抽象执行方法类别 |

## 实施计划

前置条件：以下步骤仅在 `review-propose` Verdict 为 `approved` 且 owner 明确授权 Apply 后开始。

1. 优先创建 `verification.md`，列出所有适用检查及初始 `not-run` 状态
2. 创建 `docs/core-model.md`
3. 创建 `docs/delivery-lifecycle.md`
4. 创建 `docs/verification-model.md`
5. 对照 capability spec 完成文档
6. 处理 reviewer 的 NB-001、NB-002、NB-003
7. 运行 OpenSpec strict validation
8. 运行文档检查和 `git diff --check`
9. 更新 `verification.md`
10. 提交 `review-apply`

## 回滚

删除 B1 新增的正式文档和 `flowkit-core-model` capability delta，并恢复 B1 对其他文档的修改。B1 不涉及运行时数据或生产代码。

## 待解决问题

没有 Blocking Open Questions。

以下内容留给后续 Change：

- Action Package、Adapter、Schema、Skill 声明协议：C1
- 展示、授权、Commit、Push、Handoff、reviewer 操作：D1
- 生产 Runner 与持久化实现：后续 Delivery
