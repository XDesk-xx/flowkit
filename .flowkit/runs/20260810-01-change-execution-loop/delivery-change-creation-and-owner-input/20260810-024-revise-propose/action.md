# Action: revise-propose

- Run: `20260810-024-revise-propose`
- Delivery: `20260810-01-change-execution-loop`
- Change: `A1 delivery-change-creation-and-owner-input`
- Action: `revise-propose`
- Role: author
- Execution Context: detached
- Owner authorization: not required（023 blocking finding is Author-actionable）
- GitHub Base: `448fa042de86d07e893bcc51da528f93eb7ced3a`
- Input Review Run: `20260810-023-review-propose`

## 目标

只修复 023 Reviewer 收窄后的 `A1-RP-002` bootstrap compatibility blocker，不提前进入 Apply：

1. 冻结 pre-A1 source-controlled Delivery/Change exact identity legacy seam，保证 Base + A1 Apply 不因既有 Change 缺 `architectureImpact` self-brick；
2. legacy missing 只能读为 explicit unknown / pre-a1-legacy-missing，不得推断 true/false 或静默 backfill；
3. A1 write-side 新建的 Delivery/Change 从启用起继续 strict required/persist/recover `architectureImpact`，legacy seam 不得吞掉 future malformed Change。

## Author mutation boundary

允许修改 A1 Proposal/Design/delta specs/tasks并完成本 Run；保持 016–023 Reviewer/Run artifacts 原样累计携带。

禁止修改 production code、tests、canonical specs/docs；禁止回写 pre-A1 Manifest 的 architectureImpact；禁止实现 generic migration/authority registry、B1/C1/D1/E1/F1/G1/03；禁止 Delivery Full Test、Archive、Checkpoint、Commit、Push。
