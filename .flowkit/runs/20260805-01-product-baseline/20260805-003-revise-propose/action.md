# Action

- Delivery: `20260805-01-product-baseline`
- Change key: `A1`
- Change ID: `product-positioning`
- Action: `revise-propose`
- Role: `author`

## Goal

处理 review-propose Run `20260805-002-review-propose` 的 Blocking Finding `B-001`，收缩 A1 capability spec 中越过 D1 的 Commit 时机规则。

## Input

- `.flowkit/runs/20260805-01-product-baseline/20260805-002-review-propose/result.json`
- `openspec/changes/product-positioning/specs/flowkit-product-positioning/spec.md`

## Allowed work

- 只修改 `Action 与 Commit 保持分离` Scenario
- 删除 A1 中具体的 Commit 时机规定
- 保留“Action 完成不自动要求专用 Commit”的高层产品约束
- 记录本次 revise-propose Run 结果

## Prohibited work

- 不修改已批准的产品定位
- 不改变 Proposal 的其他范围
- 不定义 D1 的 Commit 或跨环境交接策略
- 不执行 Apply
- 不运行 Full Test
- 不推进 Change 状态

## Required output

- Blocking Finding `B-001` 被明确解决
- capability spec 不再规定具体 Commit 时机
- 普通 Commit 形成新的审查边界
- 下一步返回 `review-propose`
