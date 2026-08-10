# Action: revise-propose

- Run: `20260810-022-revise-propose`
- Delivery: `20260810-01-change-execution-loop`
- Change: `A1 delivery-change-creation-and-owner-input`
- Action: `revise-propose`
- Role: author
- Execution Context: detached
- Owner authorization: not required（021 blocking findings are Author-actionable）
- GitHub Base: `448fa042de86d07e893bcc51da528f93eb7ced3a`
- Input Review Run: `20260810-021-review-propose`

## 目标

只修复 021 Reviewer 的两个 blocking findings，不提前进入 Apply：

1. `A1-RP-001`：把 authorization-only Owner record 的 current Policy gate timing/admission 从 Design/Task 提升为 normative MUST；
2. `A1-RP-002`：把 Change-level `architectureImpact` 冻结为 Delivery Manifest persisted/read formal fact，并保证 createDelivery initial Changes 与 createChange 同语义。

## Author mutation boundary

允许修改 A1 Proposal/Design/delta specs/tasks并完成本 Run；保持 016–021 Reviewer/Run artifacts 原样累计携带。

禁止修改 production code、tests、canonical specs/docs；禁止实现 B1/C1/D1/E1/F1/G1/03；禁止 Delivery Full Test、Archive、Checkpoint、Commit、Push。
