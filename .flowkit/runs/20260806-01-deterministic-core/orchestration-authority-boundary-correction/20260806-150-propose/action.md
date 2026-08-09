# Action: propose

- Run: `20260806-150-propose`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q2 orchestration-authority-boundary-correction`
- Role: author
- Execution Context: detached
- GitHub Base: `6fe05c4cd28ebbdb6abf3640057a30bc01b1332d`
- Consumed Review: `20260806-149-review-explore`（approved）

## 目标

把 148 Explore 已确认的 authority reset 收敛为最小可实施 Proposal：Flowkit 只拥有当前 Action 安全流转所需的编排事实，不重复维护或证明 OpenSpec、Git、Reviewer、Verification 已拥有的事实。

## 约束

- 本 Action 只生成 Proposal / Design / delta Specs / Tasks；
- 不修改 production code、tests、AGENTS 或 docs；
- `pending` 只作为 Run 的非 terminal 执行状态，不成为 Action 状态或 artifact lifecycle authority；
- 不建立新的 generation/provenance/archive resolver；
- 不修改历史 terminal Runs；
- 不实现 E1；
- 不运行 Delivery Full Test；
- 不执行 Archive、Checkpoint、Commit 或 Push。

## 下一步

完成 OpenSpec strict 后交给独立 Reviewer 执行 `review-propose`。
