# Action

- Delivery: `20260805-01-product-baseline`
- Change key: `D1`
- Change ID: `bootstrap-and-roadmap`
- Action: `explore`
- Role: `author`

## Goal

在 A1、B1、C1 已冻结的产品定位、核心模型和集成边界之上，把抽象的流程模型转化为可执行的 Bootstrap 操作基线，并明确后续代码 Delivery 的推进顺序和首次自托管切换条件。重点是识别旧 Bootstrap 表述中将执行者、交接媒介、PR 和 Git Commit 误写为流程规则的偏离，并收口为环境中立的操作规则。

## Inputs

- A1 已冻结的产品定位（`openspec/specs/flowkit-product-positioning/spec.md`、`docs/product-positioning.md`）
- B1 已冻结的核心模型（`openspec/specs/flowkit-core-model/spec.md`、`docs/core-model.md`、`docs/delivery-lifecycle.md`、`docs/verification-model.md`）
- C1 已冻结的集成边界（`openspec/specs/flowkit-integration-boundaries/spec.md`、`docs/integration-boundaries.md`）
- Delivery group manifest（`openspec/delivery-groups/20260805-01-product-baseline.yaml`）
- 参考材料（`ref/d1-bootstrap-and-roadmap-reference.md`）

## Allowed work

- 创建 `openspec/changes/bootstrap-and-roadmap/explore.md`
- 识别 Bootstrap 操作规则和旧表述偏离
- 定义 D1 的正式输出范围
- 定义 D1 与 C1 的分界
- 识别后续 Propose 需要收敛的问题
- 记录 Explore Run

## Prohibited work

- 不重新打开或修改 A1、B1、C1 已 Checkpoint 的冻结内容
- 不创建 Proposal、Design、Spec 或 Tasks
- 不实现 Runner、CLI 或生产代码
- 不固定信息交换媒介（GitHub、Push、PR、Patch、ZIP、Worktree 拓扑等）
- 不引入 Materializer、Provider Registry、Workspace Capability 枚举
- 不建立第二套 bootstrap-only 状态系统
- 不运行 Full Test
- 不创建 review-explore Run

## Required output

- `openspec/changes/bootstrap-and-roadmap/explore.md` 完整记录 D1 的探索结论
- 本 Run 的 `result.json` 记录执行状态和下一 Action 建议
- 下一 Action 为 `review-explore`
