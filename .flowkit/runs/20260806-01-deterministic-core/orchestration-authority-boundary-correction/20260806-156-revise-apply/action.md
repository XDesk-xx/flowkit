# Action: revise-apply

- Run: `20260806-156-revise-apply`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q2 orchestration-authority-boundary-correction`
- Role: Author
- Source review: `20260806-155-review-apply`

## Goal

按 155 Blocking Finding 与 Owner 明确冻结的 OpenSpec/Flowkit 边界修正：OpenSpec archive success 即关闭 Change；Change Checkpoint 是关闭后的 Flowkit/Git 下一流程，不属于 Change lifecycle，也不要求 completed Change 历史 Runs 重新进入 current Policy projection。

## Proposal artifact modification rationale

155 明确指出 canonical lifecycle contract 自相矛盾，Owner 已决定唯一语义。为使当前 Change delta 在后续 OpenSpec archive 时能正确同步 canonical contract，本 revise-apply 允许最小修改相关 delta spec/tasks；这是对 Review Finding 的 contract correction，不扩张 Q2 scope。

## Constraints

- 只处理 Q2-RA-001。
- Reviewer-owned 155 Run 不修改。
- 不恢复 historical Run replay。
- Checkpoint 继续是 Git formal boundary，不变成 Change Action。
- 不运行 Delivery Full Test。
