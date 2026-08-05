# Action

- Delivery: `20260805-01-product-baseline`
- Change key: `C1`
- Change ID: `integration-boundaries`
- Action: `archive`
- Role: `author`

## Goal

在 `027-review-apply` 已 approved 且 owner 已授权后，同步 capability 主规范、归档 C1 Change，并通过包含本 Run 的 Change Checkpoint Commit 完成 C1。

## Inputs

- `.flowkit/runs/20260805-01-product-baseline/integration-boundaries/20260805-027-review-apply/result.json`
- `openspec/changes/integration-boundaries/`
- `openspec/delivery-groups/20260805-01-product-baseline.yaml`
- owner 对直接 Archive 和 Change Checkpoint 的授权

## Allowed work

- 将 delta spec 同步到 `openspec/specs/flowkit-integration-boundaries/spec.md`
- 将 Change 移动到 `openspec/changes/archive/2026-08-05-integration-boundaries/`
- 将 Delivery YAML 中 C1 的 `state` 更新为 `completed`
- 记录 Archive Run
- 创建 Change Checkpoint Commit

## Prohibited work

- 不启动 D1
- 不修改其他 Change 的状态
- 不运行 Full Test
- 不完成 Delivery Finalize
- 不修改已批准的集成边界内容

## Required output

- 主 capability spec 已同步
- C1 Change 已归档
- C1 当前状态为 `completed`
- Archive Run 完成
- 本次提交构成 C1 Change Checkpoint
