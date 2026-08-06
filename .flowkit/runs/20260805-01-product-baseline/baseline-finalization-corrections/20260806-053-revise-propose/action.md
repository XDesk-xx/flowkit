# Action

- Delivery: `20260805-01-product-baseline`
- Change key: `E1`
- Change ID: `baseline-finalization-corrections`
- Action: `revise-propose`
- Role: `author`

## Goal

根据 052-review-propose 的 2 个 Blocking Findings 修正 Proposal。

## Source Review

- Review Run: `20260806-052-review-propose`
- Verdict: `changes-requested`

## Findings addressed

### E1-RP-005（Blocking）：最小 delta 仍绕过 corrective Change 的 owner 授权边界

spec.md 原文规定发现问题时 MUST 创建 corrective Change，未要求 owner 明确授权。

修正：
- spec.md Requirement 改为"Policy MUST 停在 owner 决策边界，不得自动创建 corrective Change。只有 owner 明确授权后，Flowkit 才创建 corrective Change。"
- 新增 Scenario：owner 授权后创建 corrective Change
- 共 3 个 Scenario（发现问题停 owner 边界、owner 授权后创建、Checkpoint 后进 Full Test）
- design.md D8 更新：加入 owner 授权前置约束
- explore.md §4.5 更新：流程图加入 owner 决策边界
- tasks.md 5.2 更新：3 个 Scenario

### E1-RP-006（Blocking）：已完成的 050 Revision Run 在被审查后被原位改写

050 Run 在 051 审查后被修改（移除 ref/a.md 引用），违反 terminal Run 不覆盖约束。

修正：
- 不修改 050 和 051 Run
- 创建新的 053-revise-propose Run 承载本次修正
- 053 引用 052 的 Findings

## Prohibited work

- 不修改 050-revise-propose 和 051-review-propose Run（terminal）
- 不修改 052-review-propose Run（terminal）
- 不创建正式输出文档（属于 Apply 阶段）
- 不运行 Full Test
- 不自动 Git Commit

## Required output

- spec.md、design.md、explore.md、tasks.md 已修正
- `openspec validate baseline-finalization-corrections --strict` 通过
- 本 Run 的 `result.json`
- 下一 Action 为 `review-propose`
