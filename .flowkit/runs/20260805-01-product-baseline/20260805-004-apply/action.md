# Action

- Delivery: `20260805-01-product-baseline`
- Change key: `A1`
- Change ID: `product-positioning`
- Action: `apply`
- Role: `author`

## Goal

实施已经批准的 A1 Proposal，建立正式产品定位文档，完成任务和适用验证，并形成可供独立 reviewer 审查的 committed Apply 边界。

## Inputs

- `openspec/changes/product-positioning/explore.md`
- `openspec/changes/product-positioning/proposal.md`
- `openspec/changes/product-positioning/design.md`
- `openspec/changes/product-positioning/specs/flowkit-product-positioning/spec.md`
- `openspec/changes/product-positioning/tasks.md`
- `openspec/changes/product-positioning/verification.md`
- owner 对修订后 Propose 的批准

## Allowed work

- 创建 `docs/product-positioning.md`
- 更新 `tasks.md`
- 完成适用的文档和范围验证
- 更新 `verification.md`
- 记录本次 Apply Run

## Prohibited work

- 不实现 Runner、CLI 或状态机
- 不定义外部工具具体协议
- 不修改 Delivery 状态
- 不运行 Full Test
- 不进入 Archive

## Required output

- 正式产品定位文档
- 完成的任务清单
- 可审查的验证结果
- Apply Run 结果
- 下一步为 `review-apply`
