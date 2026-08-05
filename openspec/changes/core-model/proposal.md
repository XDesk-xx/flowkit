## Why

A1 已正式冻结 Flowkit 的产品定位：

> Flowkit 是以 Delivery 为编排核心、以 Change 为实施单元、以 Action 为执行步骤的确定性交付编排器。

B1 Explore 已完成 Delivery、Change、Action、Run、Verification、Review 与 checkout 恢复边界的探索，并经独立 `review-explore` 批准。当前仍缺少可供后续 Change 和 Runner 实现直接引用的正式核心模型契约。

如果不在 B1 中冻结该契约，后续实现可能重新引入额外 Phase、`currentAction` 指针、Run/Skill 第二流程权威，或混淆 Change Verification 与 Delivery Full Test。

B1 将 approved Explore 转化为正式产品文档与 OpenSpec capability contract，并处理 reviewer 的三个 Non-blocking Findings：

- 明确 Full Test 状态的正式承载边界；
- 补充 Delivery 与 Change 的最小 `cancelled` 转换；
- 保持 Skill 描述为抽象执行方法，不绑定具体 Skill 标识。

## What Changes

- 新建 `docs/core-model.md`
  - 定义 Delivery、Change、Action、Run 的最小语义
  - 定义主状态、验证子状态及事实权威
  - 定义 Run 与 Action、角色、Git Commit 的边界
- 新建 `docs/delivery-lifecycle.md`
  - 定义唯一 active Delivery 与唯一 active Change
  - 定义 Action Catalog 和完整 Change 生命周期
  - 定义 Review 必经、Revision/Fix 条件出现及多轮闭环
  - 定义 owner 可以承担 reviewer 角色，但不得绕过正式 Verdict
  - 定义 Delivery/Change 的最小取消规则
  - 定义 Policy 的唯一下一 Action 推导
- 新建 `docs/verification-model.md`
  - 定义 Change Verification 与 Delivery Full Test 的边界
  - 定义 `fullTestStatus` 为 Flowkit 拥有的 Delivery 验证子状态
  - 定义 Full Test owner 授权和 corrective Change 闭环
- 固定 Delivery 主状态：`active | completed | cancelled`
- 固定 Change 状态：`planned | active | completed | cancelled`
- 固定主 Action：`explore | propose | apply | archive`
- 固定辅助 Action：
  - `review-explore | revise-explore`
  - `review-propose | revise-propose`
  - `review-apply | fix-review-findings`
- 显式以 `fix-review-findings` 替代 Bootstrap v1 中的 `revise-apply`
- 固定 `review` 为 reviewer 统一入口，而非正式 Action
- 固定 Review 为正式生命周期边界；Revision/Fix 仅在 `changes-requested` 时合法
- 固定同一角色、同一 Action、同一目标的多轮讨论和普通 Commit 属于同一个 Run
- 固定 reviewer 真正执行 Review 时才创建 reviewer Run
- 固定 Change 级 Run 路径：`.flowkit/runs/<delivery-id>/<change-id>/<run-id>/`
- 固定 Delivery 级 Run 路径：`.flowkit/runs/<delivery-id>/_delivery/<run-id>/`
- 固定当前合法 Action 由 Policy 推导，不保存 `currentAction` pointer
- 新增 `flowkit-core-model` capability spec

## Capabilities

### New Capabilities

- `flowkit-core-model`：定义 Flowkit 核心实体、状态、Action 生命周期、Review/Revision 闭环、Run 模型、Verification 边界、取消规则和 checkout 恢复要求。

### Modified Capabilities

无。

B1 消费 `flowkit-product-positioning`，但不改变 A1 已冻结的产品定位。

## Impact

- 新建：
  - `docs/core-model.md`
  - `docs/delivery-lifecycle.md`
  - `docs/verification-model.md`
  - `openspec/changes/core-model/specs/flowkit-core-model/spec.md`
- Apply 阶段填写 `openspec/changes/core-model/verification.md`
- 不修改 Runner、CLI 或生产代码
- 不定义 C1 的 Action Package、Adapter、Schema、Skill 标识或外部工具协议
- 不定义 D1 的具体展示、授权、Commit、Push、Handoff 和 reviewer 操作步骤
- 不引入 Skill Registry、Skill Router、Plugin、Evidence 或 Receipt
- 不运行 Full Test
