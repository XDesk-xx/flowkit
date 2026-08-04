# Action

- Delivery: `20260805-01-product-baseline`
- Change key: `A1`
- Change ID: `product-positioning`
- Action: `archive`
- Role: `author`

## Goal

在 review-apply 已批准且 owner 已授权后，同步 capability 主规范、归档 A1 Change，并通过包含本 Run 的 Change Checkpoint Commit 完成 A1。

## Inputs

- `.flowkit/runs/20260805-01-product-baseline/20260805-005-review-apply/result.json`
- `openspec/changes/product-positioning/`
- `openspec/delivery-groups/20260805-01-product-baseline.yaml`
- owner 对直接 Archive 和 Change Checkpoint 的授权

## Allowed work

- 将 delta spec 同步到 `openspec/specs/flowkit-product-positioning/spec.md`
- 将 Change 移动到 `openspec/changes/archive/2026-08-05-product-positioning/`
- 将 Delivery YAML 中 A1 的 `state` 更新为 `completed`
- 记录 Archive Run
- 创建 Change Checkpoint Commit

## Prohibited work

- 不启动 B1
- 不修改其他 Change 的状态
- 不运行 Full Test
- 不完成 Delivery Finalize
- 不修改已批准的产品定位内容

## Required output

- 主 capability spec 已同步
- A1 Change 已归档
- A1 当前状态为 `completed`
- Archive Run 完成
- 本次提交构成 A1 Change Checkpoint
