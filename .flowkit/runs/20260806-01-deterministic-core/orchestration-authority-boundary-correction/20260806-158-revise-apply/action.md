# Action: revise-apply

- Run: `20260806-158-revise-apply`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q2 orchestration-authority-boundary-correction`
- Role: Author
- Source review: `20260806-157-review-apply`

## Owner decision input

Owner 已明确决定：按照 OpenSpec 原则，OpenSpec archive 成功即视为 Change 关闭；Change Checkpoint 是其后的 Flowkit/Git 下一流程，不属于 Change lifecycle。158 只据此修正 157 Finding，不由 Author 或 Reviewer重新选择 lifecycle。

## Goal

关闭 157 的两个 Blocking Findings：明确 Owner decision 来源；修正 Checkpoint Git recovery 在 legacy + structured 混合格式以及 cross-Delivery identity 下的不确定性。

## Constraints

- 不重新设计 Archive/Checkpoint 生命周期。
- 不恢复 completed Change Run replay。
- 不新增第二套 checkpoint 状态文件。
- Reviewer-owned 157 Run 不修改。
- 不运行 Delivery Full Test、Archive、Checkpoint、Commit 或 Push。
