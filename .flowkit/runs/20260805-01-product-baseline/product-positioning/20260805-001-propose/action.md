# Action

- Delivery: `20260805-01-product-baseline`
- Change key: `A1`
- Change ID: `product-positioning`
- Action: `propose`
- Role: `author`

## Goal

将已批准的 Explore 结论转化为 apply-ready 的 OpenSpec Change 契约。

## Inputs

- `openspec/changes/product-positioning/explore.md`
- `openspec/delivery-groups/20260805-01-product-baseline.yaml`
- 当前 Bootstrap 产品基线

## Allowed work

- 创建 `.openspec.yaml`
- 创建 `proposal.md`
- 创建 `design.md`
- 创建 capability delta spec
- 创建 `tasks.md`
- 创建 pending `verification.md`

## Prohibited work

- 不执行 Apply
- 不创建正式产品文档
- 不实现 Runner 或 CLI
- 不运行 Full Test
- 不推进到 Archive

## Required output

- 完整 Propose artifacts
- 结构化 Run 结果
- 可供独立 reviewer 使用的 committed Git 边界
