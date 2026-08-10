# Action: archive

- Run: `20260810-015-archive`
- Delivery: `20260810-01-change-execution-loop`
- Change: `Q1 / core-contract-alignment`
- Action: `archive`
- Role: `author`
- Execution Context: `detached`
- GitHub Base: `95bb875b12dc682882ded6b89b829b8b6c407d74`
- Consumed Review: `20260810-014-review-apply` (approved)
- Owner Authorization: explicit authorize archive

## Goal

在 014 review-apply 已 approved、Change Verification passed 且 Owner 当前明确授权 archive 的前提下，执行 Q1 OpenSpec archive。OpenSpec 负责 delta-spec sync assessment、archive relocation 与 operation result；只有 archive 成功后，Flowkit 才将 Q1 state 记为 completed。

## Constraints

- 不修改已审 production code/tests 或 approved Proposal/Design/Tasks semantics。
- delta specs 已在 Apply 阶段同步到 canonical specs；Archive 前必须重新验证该事实。
- Checkpoint 不属于本 Run；本 Run 不 commit/push。
- 不运行 Delivery Full Test。
- 不实现 A1/D1/03 scope。
