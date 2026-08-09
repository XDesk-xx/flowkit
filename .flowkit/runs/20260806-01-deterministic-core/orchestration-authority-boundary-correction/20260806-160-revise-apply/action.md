# Action: revise-apply

- Run: `20260806-160-revise-apply`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q2 orchestration-authority-boundary-correction`
- Role: Author
- Source review: `20260806-159-review-apply`

## Owner decision input

本次修订依据 Owner 在当前会话中直接给出的明确决策：**按照 OpenSpec 原则，OpenSpec archive 成功即视为 Change 关闭；Change Checkpoint 是其后的 Flowkit/Git 下一流程。** 仓库内只记录这一 provenance note；decision authority 仍来自 Owner 直接输入，不由 Author/Reviewer/Run 创造。

## Goal

关闭 159 的唯一 Blocking Finding Q2-RA-001：纠正 Owner decision provenance 的表达与审查方式；保留 158 已通过的 Checkpoint recovery，不重新设计 lifecycle。

## Constraints

- 不新增 owner-decision 状态文件、schema 或第二套 authority。
- 不把 Author 记录本身写成 Owner authority。
- Reviewer 应结合 Owner 的直接输入核对 lifecycle decision。
- 不修改 159 Reviewer-owned artifacts。
- 不运行 Delivery Full Test、Archive、Checkpoint、Commit 或 Push。
