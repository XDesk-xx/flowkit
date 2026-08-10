# Action: propose

- Run: `20260810-005-propose`
- Delivery: `20260810-01-change-execution-loop`
- Change: `Q1 core-contract-alignment`
- Action: `propose`
- Role: author
- Execution Context: detached
- Owner authorization: not required
- GitHub Base: `95bb875b12dc682882ded6b89b829b8b6c407d74`
- Input Review Run: `20260810-004-review-explore`
- Input Review Verdict: `approved`

## 目标

基于 approved Explore 冻结 Q1 的最小实现 contract，生成 OpenSpec 1.7 `spec-driven` Proposal artifact set：

- `proposal.md`
- `design.md`
- 六个受影响 active capability 的 delta specs
- `tasks.md`

Proposal 必须完整关闭 Explore P1-P6，特别是：

1. `changes-requested ≠ revise-required` 的 blocking authority machine contract；
2. author-only revision、mixed/non-author fail-closed 与 explicit direct re-review；
3. pre-Q1 immutable Reviewer finding 的 bounded read compatibility；
4. Standard FormalAction / schemaVersion 2 Run 收敛为 Change-only；
5. 历史 Delivery-level Run 的 bounded read/NNN compatibility；
6. 移除 `full-test` / `delivery-finalize` Action 后、03 A1 前的 deterministic/fail-closed Delivery bridge。

## Author mutation boundary

允许：

- 创建/修改 Q1 的 Proposal、Design、Delta Specs、Tasks；
- 完成本 `005-propose` Run；
- 基于 approved Explore 做 repo-wide canonical conflict scan 并冻结 affected contract surface；
- 运行 OpenSpec Change strict validation 与 Proposal artifact 结构/文本卫生检查。

禁止：

- 修改 001-004 terminal Run artifacts 或 Reviewer-owned Review result；
- 修改 production code、tests、canonical docs/specs/AGENTS；
- 实施 tasks 或生成 `verification.md`；
- 实现 D1 Finding convergence / Finding DB；
- 实现 A1 Owner provenance ingestion；
- 实现 03 Delivery behavior model/executor；
- 运行 Delivery Full Test；
- Archive / Checkpoint / Commit / Push。
