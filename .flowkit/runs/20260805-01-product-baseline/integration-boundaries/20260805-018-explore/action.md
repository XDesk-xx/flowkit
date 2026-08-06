# Action

- Delivery: `20260805-01-product-baseline`
- Change key: `C1`
- Change ID: `integration-boundaries`
- Action: `explore`
- Role: `author`

## Goal

在 B1 已冻结的核心模型之上，明确 Flowkit 与外部执行者、OpenSpec、Git、Review、Verification、Archify、CodeGraph 和 Skill 之间的集成边界。重点是识别此前文档中将信息交换媒介（GitHub、Push、PR、Remote Author、Local Materializer、Worktree 拓扑等）误写为流程规则的设计偏离，并收口为环境中立的逻辑集成契约。

## Inputs

- B1 已冻结的核心模型（`openspec/specs/flowkit-core-model/spec.md`）
- B1 已冻结的正式文档（`docs/core-model.md`、`docs/delivery-lifecycle.md`、`docs/verification-model.md`）
- A1 已冻结的产品定位（`openspec/specs/flowkit-product-positioning/spec.md`、`docs/product-positioning.md`）
- Delivery group manifest（`openspec/delivery-groups/20260805-01-product-baseline.yaml`）
- 参考纠偏材料（`ref/` 目录中的候选文档）

## Allowed work

- 创建 `openspec/changes/integration-boundaries/explore.md`
- 识别设计偏离并记录纠正方向
- 定义 C1 的逻辑集成边界范围
- 定义 C1 与 D1 的分界
- 识别后续 Propose 需要收敛的问题
- 记录 Explore Run

## Prohibited work

- 不重新打开或修改 B1 已 Checkpoint 的核心模型
- 不修改 A1 产品定位
- 不创建 Proposal、Design、Spec 或 Tasks
- 不实现 Runner、CLI 或生产代码
- 不固定信息交换媒介（GitHub、Push、PR、Patch、ZIP、Worktree 拓扑等）
- 不引入 Materializer、Provider Registry、Workspace Capability 枚举
- 不运行 Full Test
- 不创建 review-explore Run

## Required output

- `openspec/changes/integration-boundaries/explore.md` 完整记录 C1 的探索结论
- 本 Run 的 `result.json` 记录执行状态和下一 Action 建议
- 下一 Action 为 `review-explore`
