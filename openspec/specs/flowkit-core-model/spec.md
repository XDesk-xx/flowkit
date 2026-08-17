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

Review 与 Revision Action MUST 使用 `review-<stage> ↔ revise-<stage>` 对称形式。`fix-review-findings` MUST NOT 是正式 Action；它 MAY 作为 `revise-apply` 的 goal 或方法类别。Delivery Full Test、Delivery Finalize 与 Change Checkpoint MUST NOT 是 Standard Formal Change Action。

#### Scenario: Apply Review 的 author blocker 请求修改

- **WHEN** `review-apply` Verdict 为 `changes-requested`
- **AND** 当前 matching Review 的全部 blocking findings 的 `blockingAuthority` 均为 `author`
- **THEN** 唯一合法 Revision Action MUST 为 `revise-apply`
- **AND** `revise-apply` MUST 只处理当前 author-actionable Findings，MUST NOT 扩张 Change 范围
- **AND** 修订后 MUST 重新运行适用的 Change Verification
- **AND** 验证通过后 MUST 再次进入 `review-apply`
- **AND** MUST NOT 自动运行 Delivery Full Test

#### Scenario: non-author blocker 不产生 Revision Action

- **WHEN** matching `changes-requested` Review 存在任一 `blockingAuthority ∈ {owner, verification, external}`
- **THEN** MUST NOT 推导 `revise-<stage>`
- **AND** MUST 停在对应 authority boundary

### Requirement: Review 必须是正式边界

Explore、Propose 和 Apply 结果 MUST 经过对应 Review Action。Review MAY 多轮执行。

Owner MAY 亲自承担 reviewer 角色，也 MAY 授权独立执行者承担 reviewer 角色，但正式 Review Action、Findings 和 Verdict MUST 存在。

#### Scenario: Owner 承担 reviewer

- **WHEN** owner 亲自审查当前 Action 结果
- **THEN** 该执行 MUST 记录为对应 Review Action
- **AND** MUST 产生正式 Verdict
- **AND** MUST NOT 被解释为跳过 Review

### Requirement: Revision/Fix 必须由 changes-requested 触发

`changes-requested` MUST 只表示当前 reviewed target 不可批准，不得单独等价为 `revise-required`。`revise-explore`、`revise-propose` 和 `revise-apply` MUST 仅在对应 Review lineage match、Verdict=`changes-requested`、存在 blocking finding，且当前 matching Review 的全部 blocking findings 均声明 `blockingAuthority=author` 时合法。

Review `approved` 时，Revision/Fix MUST 被视为不适用。存在任一 non-author blocking authority 时，Author Revision MUST 不适用，MUST NOT 创建 no-op/placeholder Revision Run。

#### Scenario: author-only blocking Review 进入 Revision

- **WHEN** Review 返回 `changes-requested`
- **AND** matching Review 至少存在一个 blocking finding
- **AND** 全部 blocking findings 的 `blockingAuthority=author`
- **THEN** Flowkit MUST 推导对应 Revision/Fix
- **AND** Revision/Fix 完成后 MUST 再次进入对应 Review
- **AND** 该循环 MAY 重复，直到 approved、出现 non-author blocker 或 Change 被取消

#### Scenario: mixed authority fail-closed

- **WHEN** matching `changes-requested` Review 同时包含 `author` blocker 与任一 non-author blocker
- **THEN** Flowkit MUST NOT 选择 `revise-*`
- **AND** MUST 停在 non-author authority boundary
- **AND** MUST NOT 通过只处理 author blocker 来制造并行或多解路径

#### Scenario: non-author blocker 禁止 no-op revise

- **WHEN** matching `changes-requested` Review 的 blocking findings 不包含可独立推进的 author-only集合
- **THEN** Author `revise` MUST 被拒绝
- **AND** MUST NOT 创建空 Revision Run、仅改文案的 authority 伪造或 placeholder mutation

### Requirement: Owner 不得绕过正式 Verdict

当 Review Verdict 为 `changes-requested` 时，Owner MUST NOT 直接推进下一主 Action。Flowkit MUST 先消费 Reviewer-owned blocking authority：author-only blocker 进入 Author Revision；owner / verification / external blocker 使 `next()` 停在对应 non-author authority boundary。只要当前 matching Review 含任一 non-author blocker（包括 mixed author+non-author），explicit same-stage re-review MUST 在 Policy 层保持合法，unchanged candidate target MUST 可进入新的 Reviewer generation，而不是制造 Author Revision。Policy 不负责机器证明 non-author authority fact 是否已经到位；是否值得现在重新 Review 由显式执行者确认。新的 Reviewer generation MUST 使用执行时最新可用 authority facts 重新评估完整 target；只有新的 matching Review 把剩余 blockers 重新分类为 author-only 后，Author Revision 才重新适用。

#### Scenario: 请求绕过 changes-requested

- **WHEN** reviewer 返回 `changes-requested`
- **AND** owner 请求直接推进下一主 Action
- **THEN** Flowkit MUST 阻塞
- **AND** MUST NOT 把 Owner 请求解释为 Reviewer approval

#### Scenario: Owner blocker 不交给 Author 伪修复

- **WHEN** matching blocking finding 的 `blockingAuthority=owner`
- **THEN** Flowkit MUST NOT 创建 Author Revision
- **AND** explicit same-stage Review MUST 保持合法
- **AND** unchanged target MUST 可进入新的 Reviewer generation
- **AND** Policy MUST NOT 把“新 Owner 独立事实是否已到位”作为该 Review 的 machine admission prerequisite

#### Scenario: mixed blocker 始终允许显式 direct re-review

- **WHEN** matching `changes-requested` Review 同时包含 `author` 与 non-author blocker
- **AND** 显式执行 same-stage Review
- **AND** candidate target bytes 未变化
- **THEN** Flowkit MUST 允许创建新的同阶段 Review execution
- **AND** MUST NOT 先创建 Author Revision
- **AND** 新 Reviewer generation MUST 使用执行时最新可用 authority facts 重新评估完整 target
- **AND** 只有新的 matching Review 为 author-only 时 Revision 才 MUST 按 author-only 规则合法

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

`revise` MUST 是 Author 的统一入口，MUST NOT 成为正式 Action。执行 `revise` 时，Flowkit MUST 从当前 stage 的 matching `changes-requested` Review 与 blocking authority 唯一解析 `revise-explore | revise-propose | revise-apply`。只有 author-only blocking Review 才可解析 Revision。

#### Scenario: 当前 Verdict 对应 Apply Review 且全部 blocker 属于 Author

- **WHEN** 当前 matching Verdict 来自 `review-apply` 且为 `changes-requested`
- **AND** 至少一个 blocking finding 存在
- **AND** 全部 blocking findings 的 `blockingAuthority=author`
- **AND** Author 执行 `revise`
- **THEN** Flowkit MUST 创建并执行 `revise-apply` Run
- **AND** MUST NOT 创建名为 `fix-review-findings` 的正式 Action Run

#### Scenario: non-author 或 mixed blocker 时 revise blocked

- **WHEN** 当前 matching Verdict 为 `changes-requested`
- **AND** 任一 blocking finding 的 `blockingAuthority ∈ {owner, verification, external}`
- **THEN** `revise` MUST 返回 blocked diagnosis
- **AND** MUST NOT 创建 Revision Run

#### Scenario: 没有唯一可修订 Review

- **WHEN** 不存在有效 matching `changes-requested` Review、blocking finding 缺失、或事实存在冲突/多解
- **THEN** Flowkit MUST 返回 blocked diagnosis
- **AND** MUST NOT 创建 Revision Run

### Requirement: Run 必须表示一次 Action 执行

每个 current Standard Run MUST 绑定一个 Delivery、一个 Change、一个正式 Change Action 和一个角色。Delivery Full Test / Delivery Finalize MUST NOT 创建 Standard Run。

同一角色、同一 Action、同一目标内的多轮讨论、内容完善和普通 Commit MUST 保持在同一个 Run。

#### Scenario: 同一 Propose 内有多个 Commit

- **WHEN** author 在同一次 Propose 中产生多个普通 Commit
- **AND** Action、角色、目标未改变
- **THEN** Flowkit MUST 继续使用同一个 Propose Run

#### Scenario: Full Test 与 Finalize 不创建 Standard Run

- **WHEN** Delivery 进入 Full Test 或 Finalize behavior boundary
- **THEN** MUST NOT 创建 `full-test` 或 `delivery-finalize` Standard Run
- **AND** MUST NOT 使用缺失 Change identity 的 current Standard Run 表达 Delivery behavior

### Requirement: Reviewer Run 必须在真正执行时创建

Author 完成 Action 后 MUST 只记录推荐下一 Review Action，MUST NOT 预建空 reviewer Run 或 pending Review 占位目录。

#### Scenario: Reviewer 开始审查

- **WHEN** author Run completed
- **AND** Policy 下一 Action 为 review-propose
- **AND** reviewer 执行 review
- **THEN** Flowkit MUST 创建新的 review-propose Run

### Requirement: Run 路径和编号必须固定

Current Standard Run MUST 使用 `.flowkit/runs/<delivery-id>/<change-id>/<run-id>/`。Run ID MUST 使用 `YYYYMMDD-NNN-action`，且 `NNN` MUST 在 Delivery 内唯一并单调递增。历史已存在的 Delivery-level Run path MAY 被 bounded legacy reader/NNN enumeration 识别，但 MUST NOT 成为 current Run path、Action Catalog 或新 Run 创建能力。

#### Scenario: current Run 路径必须含 Change identity

- **WHEN** 创建新的 Standard Run
- **THEN** path MUST 为 `.flowkit/runs/<delivery-id>/<change-id>/<run-id>/`
- **AND** context MUST 同时携带 matching Delivery / Change identity
- **AND** 缺失或冲突 MUST fail closed

#### Scenario: 历史 Delivery-level Run 只读兼容

- **WHEN** repository history 中存在旧 Delivery-level Run
- **THEN** Flowkit MAY 为历史读取或 Delivery-wide NNN 唯一性识别该 path
- **AND** MUST NOT 迁移、改写或复制该 terminal Run
- **AND** MUST NOT 允许创建新的同类 Run

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

它 MUST 属于 Flowkit 拥有的 Delivery 验证子状态，MUST NOT 成为 Delivery 主状态。项目 Verification capability MUST 继续拥有技术检查结果；Flowkit 只拥有 readiness/effective lifecycle projection、Owner authorization binding 与 minimal terminal result projection。Delivery Full Test MUST 是 Owner-authorized Delivery verification behavior，MUST NOT 是 Standard Formal Action、Standard Run、Action Package 或 Delivery-wide NNN consumer。

`awaiting-user-decision` MAY 是由 current repository formal facts 纯推导出的 effective projection：当 persisted `delivery.fullTestStatus=not-ready`，但所有 required Changes 已 completed、matching Change Checkpoints 已存在、formal conflicts=0 且 current Delivery 的 typed executable Full Test contract 合法可用时，current effective Full Test status MUST 为 `awaiting-user-decision`。该 projection MUST NOT 通过 `status`、`next`、`doctor` 或 `resume-context` 写回 Manifest。

#### Scenario: Owner 授权 Full Test

- **WHEN** current effective `fullTestStatus=awaiting-user-decision`
- **AND** owner 明确授权 exact current Delivery 的 `authorize-full-test`
- **THEN** Owner authority record 与 persisted `delivery.fullTestStatus=authorized` MUST 在同一次 atomic Manifest publication 中形成
- **AND** MUST NOT 因授权本身执行 Full Test
- **AND** MUST NOT 创建 `full-test` Standard Run

#### Scenario: Delivery Ready 纯投影 awaiting-user-decision

- **WHEN** persisted `delivery.fullTestStatus=not-ready`
- **AND** 所有 required Changes 已 completed
- **AND** 所有 required Change Checkpoints 已由 Git authority 接纳
- **AND** current formal conflicts=0
- **AND** current Delivery 的 typed executable Full Test contract 合法可用
- **THEN** current effective `fullTestStatus` MUST 投影为 `awaiting-user-decision`
- **AND** diagnostic/Policy read path MUST NOT 修改 Manifest bytes

#### Scenario: authorized 返回非 Action Delivery behavior

- **WHEN** current persisted/effective `fullTestStatus=authorized`
- **AND** matching delivery-scoped Owner authorization 已存在
- **THEN** Policy MUST 暴露唯一 `delivery-behavior: full-test` boundary
- **AND** MUST NOT 返回 `action: full-test`
- **AND** Standard `canRun` MUST NOT 接受 `full-test`

#### Scenario: Q1 后 03 前 authorized 状态 fail-closed

- **WHEN** bounded historical/pre-A1 repository facts显示 `fullTestStatus=authorized`
- **AND** current readable snapshot缺少 A1 executable Full Test binding或对应 Delivery behavior executor尚不可用
- **THEN** Policy MUST保持 deterministic/fail-closed
- **AND** MUST NOT把该 historical gap 解释为 `action: full-test`、Standard Run 或 fabricated terminal result

#### Scenario: authorized crash 可 bounded re-entry

- **WHEN** Full Test 从 `authorized` 开始执行
- **AND** child checks 期间进程中断，或 checks 已完成但 terminal result 尚未 atomic publish
- **THEN** durable lifecycle authority MUST 保持 `authorized`
- **AND** 只有 prior child/process tree 已被证明 terminal 时 fresh process 才 MAY 从同一 persisted executable Full Test contract 起点重新执行
- **AND** ignored/generated `dist/**`、stdout/stderr、partial timing 或 previous successful child process MUST NOT 被解释为 current terminal Full Test authority

#### Scenario: Windows outcome-unknown 禁止重入

- **WHEN** authorized Full Test timeout
- **AND** owned Windows whole-process-tree cancellation 无法证明 prior tree terminal
- **THEN** raw `fullTestStatus` MUST 保持 `authorized`
- **AND** Flowkit MUST 持久化 current `executionBlock.reason=outcome-unknown`
- **AND** MUST NOT 发布 Verification `failed`/`resultRef`
- **AND** 在 block 被显式、可信地关闭前 MUST NOT 开始新的 Full Test attempt

#### Scenario: transport failure 不冒充 Verification failed

- **WHEN** Full Test 发生 spawn failure、proven timed-out-cancelled、missing/malformed/stale/mismatched protocol 或 child/protocol disagreement
- **THEN** Flowkit MUST NOT 生成 `verification:full-test:<hash>`
- **AND** MUST NOT 把 lifecycle status 改成 `failed`
- **AND** process 已证明 terminal 的 failure MAY 保持 `authorized` 供后续显式重入

#### Scenario: Full Test terminal result 原子发布

- **WHEN** current persisted Full Test execution contract 的 physical command terminal 完成并产生合法 `flowkit-full-test-result-v1`，且 protocol status 与 terminal child exit 一致
- **THEN** Flowkit MUST 将 effective/persisted `fullTestStatus` 原子更新为 `passed` 或 `failed`
- **AND** MUST 同步持久化 `schemaVersion/status/summary/totalDurationMs/checks[{id,status,durationMs}]/resultRef`
- **AND** `resultRef` MUST 由排除自身后的固定字段顺序 canonical JSON payload 做 SHA-256 得出
- **AND** raw stdout/stderr MUST NOT 被复制进 Standard Run 或 Manifest evidence corpus

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

### Requirement: Change dependency identity 必须统一使用 Change.id

Delivery Manifest `dependsOn` 的 canonical dependency identity MUST 为被依赖 Change 的 `id`，不得使用 `Change.key` 作为 dependency authority。`Change.key` 继续作为 Delivery 内短标签/展示标识；dependency completion、creation validation 与 activation precondition MUST 解析同一个 Change.id contract。

#### Scenario: completed dependency id 满足 activation dependency
- **WHEN** planned Change 的 `dependsOn` 包含 `core-contract-alignment`
- **AND** 当前 Delivery 中 `id=core-contract-alignment` 的 Change 为 completed
- **THEN** dependency MUST 被视为 completed
- **AND** MUST NOT 因该 Change 的 key 为 `Q1` 而报告 dependency incomplete

### Requirement: Creation 与 activation 必须保持 lifecycle authority 分层

Delivery/Change creation 与 Change activation 是 lifecycle mutation operation，不是新的 Formal Change Action。Policy MUST 继续拥有 activation 合法边界，Owner MUST 提供 scope/selection authority，write operation 只执行已合法且被明确授权的 mutation。

#### Scenario: activation 不成为 Action
- **WHEN** Owner 明确选择并授权一个 eligible planned Change
- **THEN** activation operation MAY 将其切换为 active
- **AND** MUST NOT 新增 `activate` FormalAction 或 Standard Run

### Requirement: Standard Run execution instance 必须遵守 ActionDefinition 与 same-pending 语义

每个 current Standard Run MUST匹配 fixed Standard Change ActionDefinition及其唯一执行 Role。Pending Run本身 MUST代表一个 execution instance；同一 pending Action在semantic input未变化时 MUST继续同一 Run，MUST NOT因聊天/provider session变化创建新 Run。Failed/cancelled retry、new Reviewer execution、real revise或new Action MUST使用 new Run instance与新的 Delivery-wide NNN。

#### Scenario: pending continuation不消耗 NNN
- **WHEN** current pending Run仍匹配current Action与semantic input
- **THEN** continuation MUST复用该 runId
- **AND** Checkpoint或session变化 MUST NOT消耗/重置 NNN

### Requirement: logical Action Package ownership 属 B1 且只覆盖 Standard Change Actions

B1 MUST拥有 Standard Change Action的logical Action Package preparation contract。Delivery Full Test与Delivery Finalize MUST继续作为 Delivery behavior，MUST NOT拥有 Standard Run或B1 Action Package。后置 adapter/transport MUST只物理映射/执行已冻结 package，不得成为 lifecycle authority。

#### Scenario: Full Test 不借 Action Package 回到 Run catalog
- **WHEN** Delivery进入 Full Test behavior boundary
- **THEN** MUST NOT创建 Standard Run或B1 Action Package

### Requirement: B1 Run preparation 必须保留 explicit direct re-review execution generation

当Q1 Policy使`next()`因non-author blocker保持blocked时，B1 MUST NOT把该blocked结果解释为“所有Run入口都禁止”。显式统一`review`入口 MUST继续由shared Policy解析；合法same-stage direct re-review在没有matching pending review时 MUST创建新的Reviewer execution generation/NNN，在matching pending review时 MUST按semantic identity resume。该例外 MUST NOT扩展为caller任意指定其它Action。

#### Scenario: blocked next 与合法 review entry 可同时成立
- **WHEN** current matching changes-requested包含non-author blocker
- **THEN** `next()` MAY保持blocked authority boundary
- **AND** explicit unified review MUST仍可由Policy合法解析same-stage review

### Requirement: Standard Action 必须分离 entry 与 post-action facts

Standard Action entry contract MUST 只包含当时可知的 immutable inputs。对 `apply` / `revise-apply`，这些 inputs MUST 包含 canonical base、persisted entry workspace identity、Policy-first typed allowed-mutation declaration、applicable contract / Owner facts 与 semantic input fingerprint。最终 actual changes 与 verification facts MUST 只属于 post-action Core-owned authority，MUST NOT 回填 immutable entry context。

#### Scenario: Action 产生 declaration 范围内输出

- **WHEN** Action 在 persisted typed allowed-mutation declaration 范围内产生 post-entry output
- **THEN** entry semantic identity MUST 保持 immutable
- **AND** Core MUST 在 post-action record 中观察并分类实际输出

### Requirement: mutation declaration 必须来自 approved Design authority

对 `apply` / `revise-apply`，Core MUST 在 Policy 选择 Action 后，从 matching `review-propose` approved current Proposal bundle 的唯一 closed `flowkitMutationScope` block 派生同名 Action entry。declaration MUST 是有限、非空且可决定性匹配的允许范围，不是 candidate manifest；caller、executor 与 terminal result MUST NOT 提供、替换、合并或扩大它。

#### Scenario: Design declaration 无效

- **WHEN** approved Design 缺失对应 Action entry，或 selector 为空、非 normalized、包含 repository root/glob、重复、重叠或无法唯一归属
- **THEN** preparation MUST fail closed
- **AND** MUST NOT 使用 ActionDefinition、manifest outputs 或 caller paths 作为 fallback

### Requirement: workspace observation 不得伪造写入来源证明

若系统没有 exclusive worktree / lease authority，Core MUST 将 actualChangeSet 解释为 base/entry/post path 与 bytes 的观察结果，而非特定 actor 的来源证明。

#### Scenario: declared root 内出现 observed mutation

- **WHEN** Core 仅拥有 persisted snapshots 与 content fingerprints
- **THEN** Core MUST NOT 声称 hash 能证明 mutation 来源
- **AND** contract MUST 保留 single-writer bootstrap requirement 或明确的 authority limitation

### Requirement: Delivery Full Test failure correction 必须分离 Verification 内容身份与 Finding occurrence 身份

B1 MUST 把 genuine Verification-owned Delivery Full Test `failed` terminal result 投影为一个 deterministic current Full-Test Delivery Finding，并停在 Owner 决策边界。Finding MUST 只引用/投影 failed result，不得取代 Verification result authority；Owner corrective decision MUST 继续由显式 `create-change` Owner write-side 拥有。

`sourceResultRef=verification:full-test:<sha256>` MUST 继续作为 A1 Verification content identity。Current failure occurrence MUST 绑定该轮最新、合法、delivery-scoped `authorize-full-test` Owner decision `authorizationRef=owner:<sha256>`。Flowkit MUST 按以下 frozen canonical domain 派生 Finding occurrence identity：

```text
payload fields/order:
{"schemaVersion":1,"deliveryId":<delivery-id>,"authorizationRef":<owner-ref>,"sourceResultRef":<verification-ref>}

encoding:
JSON.stringify 等价的单行 UTF-8 JSON
→ no whitespace
→ no trailing newline
→ SHA-256 lowercase hex

findingId:
full-test-failure:<sha256>
```

Finding MUST 投影 `findingId`、`authorizationRef`、`sourceResultRef`、`severity=blocking`、`summary=currentResult.summary`、`affectedScope=delivery`、`requiredOwnerDecision=corrective-change-or-cancel-delivery`。Flowkit MUST NOT 把 raw stdout/stderr、process logs 或 generic evidence复制进 Finding。

#### Scenario: genuine failed result 产生唯一 current failure occurrence Finding
- **WHEN** current Delivery raw/effective `fullTestStatus=failed`
- **AND** current `verification.fullTest.result` 是合法、hash 可重算的 failed terminal result
- **AND** latest applicable Delivery-scoped `authorize-full-test` Owner record 可合法解析
- **THEN** Flowkit MUST 从 `deliveryId + authorizationRef + sourceResultRef` 投影唯一 current Finding occurrence
- **AND** Finding `sourceResultRef` MUST 等于该 current Verification resultRef
- **AND** Finding `authorizationRef` MUST 等于该轮 Full Test authorization fact ref
- **AND** MUST NOT 创建 Standard Action、Run、corrective Change 或新的 Verification truth

#### Scenario: 两轮相同 failed payload 仍形成不同 Finding occurrence
- **WHEN** 两轮独立 Full Test cycle 各自有不同 `authorize-full-test` Owner record
- **AND** 两轮 Verification structured failed payload byte-identical，因此 `sourceResultRef` 相同
- **THEN** 两轮 `findingId` MUST 因不同 `authorizationRef` 而不同
- **AND** 第一轮 historical resolution MUST NOT 使第二轮 current Finding 被视为已解决
- **AND** MUST NOT引入 attempt counter、attempt ledger 或新的 Full Test authority

#### Scenario: completed historical Change 不因 failure/correction 被重开
- **WHEN** Full Test failure 来源于已经 completed/checkpointed 的 Delivery candidate
- **AND** Owner 后续创建 corrective Change
- **THEN** 所有既有 completed/archived Changes MUST 保持 immutable/completed
- **AND** correction MUST 通过一个新的 ordinary planned Change 表达

#### Scenario: correction 后重新等待独立 Full Test authorization
- **WHEN** corrective Change 已按 ordinary Change lifecycle completed + checkpointed
- **AND** Delivery 再次满足 A1 readiness 条件
- **THEN** effective Full Test status MUST 回到 `awaiting-user-decision`
- **AND** prior Full Test Owner authorization MUST NOT 自动授权新的 Delivery candidate
- **AND** Owner MUST 再次显式 `authorize-full-test`
