# Action

- Delivery: `20260805-01-product-baseline`
- Change key: `C1`
- Change ID: `integration-boundaries`
- Action: `propose`
- Role: `author`

## Goal

将 C1 approved Explore 转化为正式 Proposal、Design、Spec 和 Tasks。定义环境中立的集成边界契约，回答 Explore 中的 Q1–Q8 收敛问题。

## Inputs

- C1 approved Explore（`openspec/changes/integration-boundaries/explore.md`）
- 021-review-explore approved verdict
- B1 已冻结的核心模型（`openspec/specs/flowkit-core-model/spec.md`）
- B1 已冻结的正式文档（`docs/core-model.md`、`docs/delivery-lifecycle.md`、`docs/verification-model.md`）
- Delivery group manifest

## Allowed work

- 创建 `openspec/changes/integration-boundaries/proposal.md`
- 创建 `openspec/changes/integration-boundaries/design.md`
- 创建 `openspec/changes/integration-boundaries/specs/flowkit-integration-boundaries/spec.md`
- 创建 `openspec/changes/integration-boundaries/tasks.md`
- 记录 Propose Run

## Prohibited work

- 不修改 B1 已 Checkpoint 的核心模型
- 不创建 `docs/integration-boundaries.md`（Apply 阶段创建）
- 不实现 Runner、CLI 或生产代码
- 不固定信息交换媒介
- 不引入 Materializer、Provider Registry、Workspace Capability 枚举
- 不运行 Full Test
- 不创建 review-propose Run

## Required output

- Proposal、Design、Spec、Tasks 四件套完整
- Spec 覆盖 Explore 全部冻结结论
- Design 回答 Q1–Q8 收敛问题
- 本 Run 的 `result.json` 记录执行状态和下一 Action 建议
- 下一 Action 为 `review-propose`
