# Action: revise-propose

- Run: `20260806-152-revise-propose`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q2 orchestration-authority-boundary-correction`
- Role: author
- Execution Context: detached
- GitHub Base: `6fe05c4cd28ebbdb6abf3640057a30bc01b1332d`
- Source Review: `20260806-151-review-propose`（changes-requested）

## 目标

只修复 151 Reviewer 的两个 Blocking Findings：统一 ResultRef 的 point-in-time / current-handoff 分层语义；在删除 historical replay 的同时恢复最小、Core-owned 的 current review-to-next-action exact handoff，并为 review-apply 冻结可 resume 的 entry-time verification binding。

## 约束

- 不恢复 global generation / supersession / revision-window model；
- 不把 sourceReviewRun/sourceReviewVerdict 扩张成所有非-revise Action 的持久状态机；
- 不做 post-archive relocation replay；
- 不修改 production code、tests、AGENTS 或 docs；
- 不修改 Explore；
- 不运行 Delivery Full Test；
- 不执行 Apply、Archive、Checkpoint、Commit 或 Push。
