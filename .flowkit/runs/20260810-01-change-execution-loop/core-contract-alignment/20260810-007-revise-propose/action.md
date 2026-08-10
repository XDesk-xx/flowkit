# Action: revise-propose

- Run: `20260810-007-revise-propose`
- Delivery: `20260810-01-change-execution-loop`
- Change: `Q1 core-contract-alignment`
- Action: `revise-propose`
- Role: author
- Execution Context: detached
- Owner authorization: not required（006 Reviewer blocking findings are Author-actionable）
- GitHub Base: `95bb875b12dc682882ded6b89b829b8b6c407d74`
- Input Review Run: `20260810-006-review-propose`

## 目标

只修复 006 Reviewer 的两个 blocking findings，不进入 Apply：

1. `Q1-RP-001`：消除 mixed author+non-author blocker 的恢复 dead-end。保持 `next()` fail-closed 与 Author revise 禁止，但在相关 non-author authority fact 实际到位后，允许对 unchanged target 显式创建新的同阶段 Reviewer generation；新 Review 重新评估完整 target，只有新的 matching Review 变成 author-only 后才允许 Author Revision。
2. `Q1-RP-002`：把 active `flowkit-diagnostic-cli` 纳入 affected capability set，冻结新 `BlockedReason` 在 `flowkit next` 的稳定呈现和 `flowkit doctor` 的 deterministic severity mapping，同时保持 CLI 只消费 PolicyResult、不成为第二 decision tree。

## Author mutation boundary

允许：

- 修改 Q1 `proposal.md`、`design.md`、`tasks.md` 与受 006 findings 影响的 delta specs；
- 新增 `flowkit-diagnostic-cli` delta spec；
- 完成本 `007-revise-propose` Run；
- 运行 OpenSpec strict validation 与 Proposal artifact/text/package hygiene 检查；
- 原样累计携带 001-006 terminal artifacts，包括 Reviewer-owned 006 Review。

禁止：

- 修改 Reviewer-owned 002/004/006 Review artifacts；
- 修改 production code、tests、canonical docs/specs/AGENTS；
- 实施 tasks 或生成 `verification.md`；
- 实现 authority event ledger、Finding convergence/DB 或 automatic Reviewer loop；
- 提前执行 Author mutation 关闭 mixed blocker；
- 实现 03 Delivery behavior model/executor；
- 运行 Delivery Full Test；
- Archive / Checkpoint / Commit / Push。
