# Action: revise-explore

- Run: `20260810-003-revise-explore`
- Delivery: `20260810-01-change-execution-loop`
- Change: `Q1 core-contract-alignment`
- Action: `revise-explore`
- Role: author
- Execution Context: detached
- Owner authorization: not required（Reviewer blocking findings are Author-actionable）
- GitHub Base: `95bb875b12dc682882ded6b89b829b8b6c407d74`
- Input Review Run: `20260810-002-review-explore`

## 目标

只修复 002 Reviewer 的两个 blocking findings，不提前进入 Proposal：

1. `Q1-RE-001`：补入仍冻结旧 Review→Revision 规则的 `flowkit-bootstrap-and-roadmap` canonical capability，并要求 Proposal 做 repo-wide canonical conflict scan 后冻结完整 affected capability set；
2. `Q1-RE-002`：补入“移除 Delivery FormalAction 后、03 A1 前”的 deterministic / fail-closed Policy 过渡契约问题，要求 Proposal 冻结而非 Apply 临时决定。

## Author mutation boundary

允许：

- 修改 `openspec/changes/core-contract-alignment/explore.md`；
- 完成本 `003-revise-explore` Run；
- 保持 001/002 Run 与 Reviewer-owned result 原样累计携带。

禁止：

- 修改 Reviewer-owned `002-review-explore` artifacts；
- 创建 Proposal / Design / Tasks / delta specs；
- 修改 production code、tests、canonical docs/specs；
- 决定 P1-P6 的具体实现形态；
- 实现 D1 Finding convergence 或 03 Delivery behavior model/executor；
- 运行 Delivery Full Test；
- Archive / Checkpoint / Commit / Push。
