# Flowkit 核心模型

## 1. 目的与边界

本文冻结 Flowkit 的核心语义模型，为后续集成边界、Bootstrap 操作规范和 Runner 实现提供稳定输入。

Flowkit 的正式产品定位保持不变：

> Flowkit 是以 Delivery 为编排核心、以 Change 为实施单元、以 Action 为执行步骤的确定性交付编排器。

本文只定义核心语义、状态和权威边界，不定义具体 JSON Schema、CLI、Adapter、Skill 标识、Git 命令或持久化实现。

## 2. 正式层级

```text
Delivery
└─ Change
   └─ Action
```

### 2.1 Delivery

Delivery 是完整交付主线和最终验收边界，至少承载：

- 交付目标；
- Change 集合与依赖；
- 架构影响声明；
- Change Verification 要求；
- Delivery Full Test 状态；
- Delivery 完成条件。

单个 Change 完成不等于 Delivery 完成。

### 2.2 Change

Change 是 Delivery 内边界明确、可独立实施和审查的变更单元。

每个 Change 必须属于一个 Delivery，并在该 Delivery 中完成 Explore、Propose、Apply、Review 和 Archive 生命周期。OpenSpec archive operation 成功后，由 Flowkit 记录 Change 为 `completed`，该 Change 随即关闭；Change Checkpoint 是关闭后的 Flowkit/Git 正式边界，不属于 Change 完成条件。

### 2.3 Action

Action 是一个受前置条件约束、目标明确的正式流程步骤。

Action 与 Git Commit 不一一对应。同一个 Action 可以包含多轮讨论、内容完善和多个普通 Commit。

### 2.4 Run

Run 是某个角色对某个正式 Action 的一次执行实例，是流程推进、精确交接和恢复所需的最小执行信封（execution envelope）。

Run 不构成第四个产品实体层，不拥有 Change 契约、流程状态、Git 历史、Findings、测试结果或其他专业事实的主要权威。

Run 的 `result.json` 使用 closed Core-validated schema：只保存执行状态、动作结果摘要和 Core 派生的 ResultRef，拒绝 `blockingFindings`、`verification[]`、`consistencyScan`、`commitPolicy` 等自由重型 bookkeeping 字段。所有 ResultRef（run-result、produced-artifact、verification-summary）的 kind、path 和 fingerprint 均由 Core 从真实目标派生，不由 Agent 手工填写。

## 3. 状态模型

### 3.1 Delivery 主状态

```text
active
completed
cancelled
```

- `active`：当前正在推进的唯一 Delivery；
- `completed`：所有 required Changes 完成，Delivery 验收条件满足并形成完成边界；
- `cancelled`：owner 明确终止，不再允许继续推进。

不预建 `paused`。Full Test 等状态属于 Delivery 验证子状态，不是 Delivery 主状态。

### 3.2 Change 状态

```text
planned
active
completed
cancelled
```

- `planned`：属于当前 Delivery，但尚未激活；
- `active`：当前唯一正在推进的 Change；
- `completed`：已完成 Review、Verification，且 OpenSpec archive operation 已成功并由 Flowkit 记录关闭；Change Checkpoint 可在其后尚未形成；
- `cancelled`：owner 明确终止，不再推进。

不使用 `reviewing`、`revising`、`verifying` 或 `ready` 作为 Change 主状态。

### 3.3 Run 状态

```text
pending
completed
failed
cancelled
```

Run 状态只描述一次执行实例，不代替 Change 或 Delivery 状态。

## 4. Action Catalog

### 4.1 Standard Change Action

Standard Formal Action Catalog 固定为 10 个 Change Action：

```text
explore
review-explore
revise-explore
propose
review-propose
revise-propose
apply
review-apply
revise-apply
archive
```

Delivery Full Test、Delivery Finalize 与 Change Checkpoint 都不是 Standard Formal Action，也不创建 Standard Run。Delivery behavior 的完整 machine representation 后置到 Delivery Execution Loop。

Review 与 Revision Action 保持按阶段对称：`review-<stage> ↔ revise-<stage>`。

`review` 和 `revise` 是统一执行入口，不是正式 Action。Policy 必须根据正式事实把它们唯一解析为具体的 `review-*` 或 `revise-*` Action。

`fix-review-findings` 不再是正式 Action；它是 `revise-apply` 的默认 goal，表示本轮修订只处理当前 `review-apply` Findings。具体 goal 字段和 Skill 方法协议属于 C1。

`revise-apply` 必须：

- 仅在当前 matching `review-apply` 为 `changes-requested` 且 blocking authorities 全部为 `author` 时合法；
- 只处理当前 Findings，不得扩张 Change 范围；
- 完成后重新执行适用的 Change Verification；
- 验证通过后返回 `review-apply`；
- 不自动运行 Full Test。

`review-code` 不作为正式 Action，因为 Apply 结果可能包含代码、文档、配置或其他正式产物。

## 5. Review、Revision、Verification 与 Checkpoint

Review、Revision/Fix、Verification 和 Checkpoint 不形成额外 Phase 实体。

- Review：独立判断当前 Action 的完整结果；
- Revision：处理 author-only `changes-requested` blocking Findings；
- Verification：确认 Apply/Revision 后的适用检查；
- Checkpoint：Change 已由 Archive 关闭后的 Git 正式边界，用于持久化/同步/恢复；它不反向决定 Change 是否 completed。

Review 是正式生命周期边界。`changes-requested` 只表示当前 target 不可批准：只有 matching Review 的 blocking authorities 非空且全部为 `author` 时 Revision 才适用；存在任一 `owner / verification / external` blocker 时 Author Revision 不合法，`next()` 停在 non-author authority boundary。此时显式 same-stage re-review 在 Policy 层合法并创建新的 Reviewer execution，但是否值得现在重审由显式执行者判断，Policy 不自动调度 Review。Review `approved` 时不创建 skipped 状态或空 Run。

## 6. 角色

正式角色保持中立：

- `owner`：拥有范围、授权、取消和最终决策；
- `author`：执行当前合法 Action；
- `reviewer`：独立检查并返回 Findings 和 Verdict。

Owner 可以承担 reviewer 角色，但仍必须执行正式 Review Action 并产生 Verdict；这不等于跳过 Review。

Full Test failed 时，Flowkit 必须停在 owner 决策边界，不得自动扩张 Delivery 范围。只有 owner 明确授权 corrective Change 后，才创建该 Change；随后 `fullTestStatus` 返回 `not-ready`，corrective Change 按普通 Change 生命周期推进。

## 7. Run 边界

### 7.1 同一 Run

同一角色、同一 Action、同一目标内的以下活动保持在同一个 Run：

- 多轮讨论；
- 内容完善；
- 多个普通 Git Commit；
- 当前 Action 内的补充检查。

### 7.2 新 Run

仅在以下边界创建新 Run：

- 正式 Action 改变；
- 执行角色改变；
- 前一个 Run `failed` 或 `cancelled`，需要重试同一 Action。

### 7.3 Review Run

Author 完成当前 Action 后只记录推荐的 `nextAction: review-*`。

Author 不预建空 reviewer Run。Reviewer 真正执行统一入口 `review` 时，Policy 先计算唯一具体 Review Action，再创建对应 reviewer Run。

Author 执行统一入口 `revise` 时，Policy 必须从当前唯一 matching `changes-requested` Review 及其 `blockingAuthorities` 解析对应 `revise-explore | revise-propose | revise-apply`。只有 author-only blockers 才能解析 Revision；包含任一 non-author blocker、不存在 authority、冲突或多解时必须阻塞，并且不创建 Revision Run。对于含 non-author blocker 的 matching Review，显式统一入口 `review` 可解析为同阶段新的 Review generation，即使 target bytes 未变化；`next()` 不自动选择该路径。

### 7.4 Run 路径

Change 级 Run：

```text
.flowkit/runs/<delivery-id>/<change-id>/<run-id>/
├─ action.md
├─ context.json
└─ result.json
```

Current Standard Run 只使用 Change 级路径。历史已存在的 Delivery-level Run（包括旧 `_delivery` / top-level 形状）只能由 bounded legacy reader 与 Delivery-wide NNN enumeration 识别，用于历史兼容；不得作为 current Policy fact、current Run path 或新 Run 创建能力，也不得被迁移/改写。

Run ID 使用：

```text
YYYYMMDD-NNN-action
```

`NNN` 在整个 Delivery 内唯一并单调递增，不因 Change 目录变化而重置。

路径与 Run 上下文字段冲突时必须阻塞。

## 8. 事实权威

B1 继续遵循 `One fact, one authority`：

| 事实 | 主要权威 |
|---|---|
| Delivery 和 Change 的流程状态 | Flowkit |
| Change 契约 | OpenSpec |
| 文件内容、历史和同步事实 | Git |
| Findings 和 Verdict | Reviewer |
| 测试与静态检查结果 | 项目验证工具 |
| 被接受的架构表达 | Archify |
| 代码依赖和影响范围 | CodeGraph |

Run 可以保存当前流程需要的输入、摘要和引用，但不能成为第二事实权威。

## 9. Skill 边界

Action 可以声明所需的执行方法类别，例如：

- 文档审查；
- 契约审查；
- 代码审查；
- 安全审查；
- 性能审查。

B1 不绑定具体 Skill 标识。

Skill 只在当前 Action 内提供方法，不得决定 Delivery、Change、Action、是否 Review、是否 Full Test、下一 Action、Archive 或 Finalize。

具体 Action Package、Skill 字段、标识、加载和 Adapter 协议属于 C1。

## 10. 与后续 Change 的边界

### C1：integration-boundaries

负责具体 Action Package、Adapter、Schema、Skill 声明以及外部工具输入输出协议。

### D1：bootstrap-and-roadmap

负责展示、授权、Commit、Push、Handoff、Checkpoint 和 reviewer 的具体交互步骤。

### 后续 Runner Delivery

负责生产代码、持久化实现、Policy 执行器和 CLI。

任何后续实现若与本文冲突，必须通过明确 Change 修改正式契约，不得以代码、Run 或临时说明静默偏离。
