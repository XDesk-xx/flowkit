# Action

- Delivery: `20260805-01-product-baseline`
- Change key: `E1`
- Change ID: `baseline-finalization-corrections`
- Action: `revise-propose`
- Role: `author`

## Goal

根据 054-review-propose 的 E1-RP-007 修正 Proposal 中 Requirement/Scenario 修改边界的自相矛盾。

## Source Review

- Review Run: `20260806-054-review-propose`
- Verdict: `changes-requested`

## Finding addressed

### E1-RP-007（Blocking）：Proposal/Explore 对 Requirement 修改边界仍自相矛盾

explore Q1/Q2 和 design Non-Goals 无条件写"不修改 Requirement/Scenario"，但 spec.md 实际新增 ADDED Requirement。

修正（4 处统一）：
- explore.md Q1（L229）：不修改任何既有 Requirement/Scenario，唯一例外是 owner 已授权的 flowkit-bootstrap-and-roadmap ADDED Requirement 及其 3 个 Scenario
- explore.md Q2（L235）：同上
- design.md Non-Goals（L20）：同上
- proposal.md Impact（L54）：同上

所有其他 Requirement/Scenario 仍保持冻结。不得扩大到其他 capability。

## Prohibited work

- 不修改 050–054 Run（terminal）
- 不创建正式输出文档（属于 Apply 阶段）
- 不运行 Full Test
- 不自动 Git Commit

## Required output

- explore.md、design.md、proposal.md 已修正
- `openspec validate baseline-finalization-corrections --strict` 通过
- 本 Run 的 `result.json`
- 下一 Action 为 `review-propose`
