# Action

- Delivery: `20260805-01-product-baseline`
- Change key: `C1`
- Change ID: `integration-boundaries`
- Action: `apply`
- Role: `author`

## Goal

将 C1 approved Proposal 转为正式文档 `docs/integration-boundaries.md`，创建 `verification.md`，完成 tasks.md 全部项目。

## Inputs

- C1 approved Proposal（`023-review-propose` approved verdict）
- Proposal、Design、Spec、Tasks 四件套
- B1 已冻结的核心模型文档

## Allowed work

- 创建 `docs/integration-boundaries.md`
- 创建 `openspec/changes/integration-boundaries/verification.md`
- 更新 `openspec/changes/integration-boundaries/tasks.md`（标记全部完成）
- 记录 Apply Run

## Prohibited work

- 不修改 B1 已 Checkpoint 的核心模型文档
- 不修改 C1 Proposal、Design、Spec
- 不实现 Runner、CLI 或生产代码
- 不运行 Full Test
- 不创建 review-apply Run

## Required output

- `docs/integration-boundaries.md` 覆盖 Design D1–D13 和 Spec 11 个 Requirement
- `verification.md` 声明适用检查和 not-run 状态
- `tasks.md` 全部 `[x]`
- 本 Run 的 `result.json` 记录执行状态和下一 Action 建议
- 下一 Action 为 `review-apply`
