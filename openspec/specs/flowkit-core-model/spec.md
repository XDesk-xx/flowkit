# flowkit-core-model Specification

## Purpose

定义 Flowkit 的 Delivery、Change、Action 和 Run 核心模型，以及生命周期、Review/Revise、Verification、Full Test、Checkpoint 和 Policy 的正式边界，为后续 Runner 实现提供确定性流程契约。
## Requirements
### Requirement: Flowkit 必须使用三层核心模型

Flowkit MUST 使用 `Delivery > Change > Action` 作为正式实体层级。Run MUST 表示某个角色对某个 Action 的一次执行实例，MUST NOT 被定义为第四个产品实体层。Review、Revision/Fix、Verification 和 Checkpoint MUST NOT 形成额外 Phase。

#### Scenario: Review 不产生额外 Phase

- **WHEN** Change 进入 Review、Revision/Fix、Verification 或 Checkpoint
- **THEN** Flowkit MUST 保持 Delivery、Change、Action 三层模型
- **AND** MUST NOT 创建并列 Phase 状态权威

### Requirement: Delivery 和 Change 必须使用最小状态

Delivery 主状态 MUST 为 `active | completed | cancelled`。Change 状态 MUST 为 `planned | active | completed | cancelled`。

Flowkit MUST NOT 预建 `paused`、`reviewing`、`revising`、`verifying` 或 `ready` 等主状态。

#### Scenario: Review 期间 Change 保持 active

- **WHEN** active Change 进入任一 Review Action
- **THEN** Change 主状态 MUST 保持 `active`
- **AND** Review 位置 MUST 由 artifacts、Runs 和 Verdict 推导

### Requirement: 同时只能存在一个活动 Delivery 和 Change

一个仓库 MUST 最多存在一个 active Delivery。一个 active Delivery 中 MUST 最多存在一个 active Change。

#### Scenario: 第二个 Change 启动被阻塞

- **WHEN** 当前 Delivery 已存在 active Change
- **AND** 请求激活另一个 planned Change
- **THEN** Flowkit MUST 返回 blocked diagnosis

### Requirement: Change 激活和完成必须满足固定条件

`planned → active` MUST 要求 Delivery active、没有其他 active Change、dependencies 均 completed，并且 owner 明确授权。

Change 只有在 review-apply approved、Blocking Findings 为 0、Change Verification passed/not-applicable、Tasks 完成、owner 授权 Archive，并且 OpenSpec Archive operation success 后，Flowkit MUST 将自己的 Change 状态记录为 `completed`。**Change Checkpoint 不属于 Change 的完成条件**；它是 Change 已关闭后的 Flowkit/Git 正式边界。

#### Scenario: Archive 未完成

- **WHEN** review-apply 已 approved
- **BUT** OpenSpec Archive 尚未成功
- **THEN** Change MUST 保持 active

#### Scenario: Archive 成功即关闭 Change

- **WHEN** OpenSpec Archive operation success
- **THEN** Flowkit MUST 记录 Change 为 `completed`
- **AND** Change MUST 不再作为 active Change
- **AND** MUST NOT 等待 Change Checkpoint 才进入 completed

#### Scenario: Checkpoint 不重新打开 Change

- **WHEN** Change 已因 OpenSpec Archive success 进入 completed
- **AND** Change Checkpoint 尚未形成
- **THEN** Change MUST 保持 completed
- **AND** Flowkit MUST 将 Checkpoint 作为关闭后的 Git/恢复边界处理

### Requirement: Action Catalog 必须固定

主 Action MUST 为 `explore | propose | apply | archive`。

辅助 Action MUST 为：

```text
review-explore
revise-explore
review-propose
revise-propose
review-apply
revise-apply
```

Review 与 Revision Action MUST 使用 `review-<stage> ↔ revise-<stage>` 对称形式。`fix-review-findings` MUST NOT 是正式 Action；它 MAY 作为 `revise-apply` 的 goal 或方法类别。B1 MUST NOT 同时保留 `review-code` 作为正式 Action。

#### Scenario: Apply Review 请求修改

- **WHEN** review-apply Verdict 为 changes-requested
- **THEN** 唯一合法 Revision Action MUST 为 revise-apply
- **AND** revise-apply MUST 只处理当前 Findings，MUST NOT 扩张 Change 范围
- **AND** 修订后 MUST 重新运行适用的 Change Verification
- **AND** 验证通过后 MUST 再次进入 review-apply
- **AND** MUST NOT 自动运行 Full Test

### Requirement: Review 必须是正式边界

Explore、Propose 和 Apply 结果 MUST 经过对应 Review Action。Review MAY 多轮执行。

Owner MAY 亲自承担 reviewer 角色，也 MAY 授权独立执行者承担 reviewer 角色，但正式 Review Action、Findings 和 Verdict MUST 存在。

#### Scenario: Owner 承担 reviewer

- **WHEN** owner 亲自审查当前 Action 结果
- **THEN** 该执行 MUST 记录为对应 Review Action
- **AND** MUST 产生正式 Verdict
- **AND** MUST NOT 被解释为跳过 Review

### Requirement: Revision/Fix 必须由 changes-requested 触发

`revise-explore`、`revise-propose` 和 `revise-apply` MUST 仅在对应 Review Verdict 为 `changes-requested` 时合法。

Review approved 时，Revision/Fix MUST 被视为不适用，MUST NOT 创建 skipped 状态或空 Run。

#### Scenario: Review 多轮闭环

- **WHEN** Review 返回 changes-requested
- **THEN** Flowkit MUST 推导对应 Revision/Fix
- **AND** Revision/Fix 完成后 MUST 再次进入对应 Review
- **AND** 该循环 MAY 重复，直到 approved 或 Change 被取消

### Requirement: Owner 不得绕过正式 Verdict

当 Review Verdict 为 changes-requested 时，owner MUST NOT 直接推进下一主 Action。Owner MAY 授权 Revision/Fix、改变范围后重新 Review，或取消 Change/Delivery。

#### Scenario: 请求绕过 changes-requested

- **WHEN** reviewer 返回 changes-requested
- **AND** owner 请求直接推进
- **THEN** Flowkit MUST 阻塞
- **AND** MUST 指出 Revision/Fix 或取消是合法选择

### Requirement: Policy 必须计算唯一合法下一 Action

Flowkit MUST 根据正式事实计算唯一下一 Action，MUST NOT 依赖 `currentAction` 或其他 pointer。

Policy 输出 MUST 为一个合法 Action、一个 owner 决策边界或一个 blocked diagnosis。

#### Scenario: 正式事实产生多解

- **WHEN** 相同正式事实可推出多个 Action
- **THEN** Flowkit MUST 阻塞并报告冲突
- **AND** MUST NOT 任意选择

### Requirement: `review` 必须只是统一入口

`review` MUST 是 reviewer 的统一入口，MUST NOT 成为正式 Action。执行 `review` 时，Flowkit MUST 先由 Policy 计算唯一合法下一 Action，并确认其属于 `review-explore | review-propose | review-apply`。

#### Scenario: 下一 Action 不是 Review

- **WHEN** 执行 `review`
- **BUT** Policy 下一 Action 不是 Review Action
- **THEN** Flowkit MUST 返回 blocked diagnosis
- **AND** MUST NOT 创建 reviewer Run

### Requirement: `revise` 必须只是统一入口

`revise` MUST 是 author 的统一入口，MUST NOT 成为正式 Action。执行 `revise` 时，Flowkit MUST 从当前唯一有效的 `changes-requested` Verdict 解析唯一合法的 `revise-explore | revise-propose | revise-apply`。

#### Scenario: 当前 Verdict 对应 Apply Review

- **WHEN** 当前唯一有效 Verdict 来自 review-apply 且为 changes-requested
- **AND** author 执行 revise
- **THEN** Flowkit MUST 创建并执行 revise-apply Run
- **AND** MUST NOT 创建名为 fix-review-findings 的正式 Action Run

#### Scenario: 没有唯一可修订 Verdict

- **WHEN** 不存在有效 changes-requested Verdict，或存在冲突/多解
- **THEN** Flowkit MUST 返回 blocked diagnosis
- **AND** MUST NOT 创建 Revision Run

### Requirement: Run 必须表示一次 Action 执行

每个 Run MUST 绑定一个 Delivery、零个或一个 Change、一个正式 Action 和一个角色。

同一角色、同一 Action、同一目标内的多轮讨论、内容完善和普通 Commit MUST 保持在同一个 Run。

#### Scenario: 同一 Propose 内有多个 Commit

- **WHEN** author 在同一次 Propose 中产生多个普通 Commit
- **AND** Action、角色、目标未改变
- **THEN** Flowkit MUST 继续使用同一个 Propose Run

### Requirement: Reviewer Run 必须在真正执行时创建

Author 完成 Action 后 MUST 只记录推荐下一 Review Action，MUST NOT 预建空 reviewer Run 或 pending Review 占位目录。

#### Scenario: Reviewer 开始审查

- **WHEN** author Run completed
- **AND** Policy 下一 Action 为 review-propose
- **AND** reviewer 执行 review
- **THEN** Flowkit MUST 创建新的 review-propose Run

### Requirement: Run 路径和编号必须固定

Change 级 Run MUST 使用 `.flowkit/runs/<delivery-id>/<change-id>/<run-id>/`。Delivery 级 Run MUST 使用 `.flowkit/runs/<delivery-id>/_delivery/<run-id>/`。

Run ID MUST 使用 `YYYYMMDD-NNN-action`，且 `NNN` MUST 在 Delivery 内唯一并单调递增。

#### Scenario: 路径与 context 冲突

- **WHEN** Run 路径与 context 中的 Delivery/Change 不一致
- **THEN** Flowkit MUST 阻塞并报告 scope conflict

### Requirement: Change 和 Delivery 取消必须由 owner 授权

Change MAY 从 planned 或 active 转换为 cancelled。Delivery MAY 从 active 转换为 cancelled。上述转换 MUST 由 owner 明确授权。

Completed 实体 MUST NOT 转为 cancelled。取消 MUST 保留正式 artifacts、committed Runs 和 Git 历史。Cancelled Change MUST NOT 满足 dependency completion。

#### Scenario: 取消 active Delivery

- **WHEN** owner 取消 active Delivery
- **THEN** 未 completed Changes MUST 变为 cancelled
- **AND** completed Changes MUST 保持 completed
- **AND** Delivery MUST NOT 进入 Full Test、Finalize 或 completed

### Requirement: Change Verification 必须位于 Change 边界

Change Verification 状态 MUST 为 `not-run | passed | failed | not-applicable`。项目验证工具 MUST 拥有完整结果；Flowkit MUST 只保存流程状态、摘要和结果引用。

#### Scenario: Verification 未通过

- **WHEN** 任一适用检查为 failed 或 not-run
- **THEN** review-apply MUST NOT 合法

### Requirement: Full Test 必须使用 Delivery 验证子状态

`fullTestStatus` MUST 为 `not-ready | awaiting-user-decision | authorized | passed | failed`。

它 MUST 属于 Flowkit 拥有的 Delivery 验证子状态，MUST NOT 成为 Delivery 主状态。项目验证工具 MUST 继续拥有完整 Full Test 结果。

Bootstrap 阶段 Delivery YAML MUST 作为人工投影；自托管后 Flowkit Delivery 状态 MUST 成为唯一流程权威。Delivery 级 Run MUST NOT 成为 `fullTestStatus` 权威。

#### Scenario: Owner 授权 Full Test

- **WHEN** fullTestStatus 为 awaiting-user-decision
- **AND** owner 明确授权
- **THEN** fullTestStatus MUST 进入 authorized
- **AND** Full Test MAY 执行

### Requirement: Full Test 失败必须进入 owner 决策边界

Full Test failed 时，Flowkit MUST NOT 重新打开已 archived/completed Change，也 MUST NOT 自动创建 Change 或扩张 Delivery 范围。`fullTestStatus` MUST 保持 failed，直到 owner 作出合法决策。

#### Scenario: Full Test 失败等待 owner

- **WHEN** Full Test 返回 failed
- **THEN** Policy MUST 返回 owner 决策边界或 blocked diagnosis
- **AND** MUST NOT 自动创建 corrective Change
- **AND** MUST NOT 自动 Finalize Delivery

#### Scenario: Owner 授权 corrective Change

- **WHEN** fullTestStatus 为 failed
- **AND** owner 明确授权 corrective Change 的创建
- **THEN** Flowkit MUST 创建该 Change
- **AND** fullTestStatus MUST 返回 not-ready
- **AND** corrective Change MUST 按普通 Change 生命周期完成
- **AND** 所有 required Changes 再次 completed 后 MUST 再次等待 owner 授权 Full Test

### Requirement: Skill 必须保持 Action 内方法边界

Action MAY 声明文档审查、契约审查、代码审查、安全审查或性能审查等方法类别。B1 MUST NOT 绑定具体 Skill 标识。

Skill MUST NOT 决定 Delivery、Change、Action、Review、Full Test、下一 Action、Archive 或 Finalize。

#### Scenario: Action 使用专业方法

- **WHEN** Review Action 需要某类专业审查方法
- **THEN** Action Package MAY 声明该方法类别
- **AND** Skill MUST 只在当前 Action 内工作

### Requirement: Checkout 后必须确定性恢复

Flowkit MUST 只依赖 active Delivery/Change、Branch、dependencies、OpenSpec artifacts、committed Runs、Verdict、Verification、fullTestStatus、owner 授权、Archive、Checkpoint 和 Git 边界恢复。

恢复 MUST NOT 依赖聊天历史、`.tmp`、未提交日志、人工记忆、current pointer、预建 pending Review Run 或写入状态文件的当前 Commit SHA。

#### Scenario: 恢复结果不唯一

- **WHEN** 正式事实无法推出唯一下一 Action
- **THEN** Flowkit MUST 返回 blocked diagnosis
- **AND** MUST NOT 猜测

### Requirement: 核心模型必须形成正式文档

项目 MUST 创建 `docs/core-model.md`、`docs/delivery-lifecycle.md` 和 `docs/verification-model.md`，并 MUST 与 `flowkit-core-model` capability contract 一致。

#### Scenario: 后续 Change 消费 B1 契约

- **WHEN** C1、D1 或后续 Runner Change 定义协议或实现
- **THEN** MUST 读取并遵守 B1 正式文档
- **AND** MUST NOT 静默偏离

