# Action: propose

- Run: `20260811-035-propose`
- Delivery: `20260810-01-change-execution-loop`
- Change: `B1 lean-run-and-action-package`
- Role: author
- Execution Context: detached
- Owner authorization: not-required（034 review-explore approved）
- GitHub Base: `da4eeb6a7e3787a44ea17fcff8b8ef08f9e05de1`
- Input Review Run: `20260811-034-review-explore`

## 目标

基于 034 approved Explore，冻结 B1 Lean Run execution preparation、ActionDefinition、same-Run continuation、logical Action Package、Action Result admission 与 bounded Windows CRLF compatibility 的完整 Proposal/Design/Specs/Tasks contract。

## Proposal freeze boundary

本 Run 允许：

- 创建/完成 proposal.md、design.md、tasks.md 与声明的 delta specs；
- 基于 031→034 Explore/Review 链与 repo-wide canonical evidence 冻结唯一安全 Run preparation/admission surface；
- 冻结 Change-only Action Package 与后置 adapter/transport ownership；
- 冻结 Delivery Manifest CRLF input compatibility + canonical LF output 的 bounded correction；
- 执行 OpenSpec status/strict validation、typecheck 与只读代码/规范调查。

本 Run 禁止：

- 修改 production code、tests、canonical specs/docs/AGENTS；
- 实现 B1 Apply；
- 实现 C1/D1/E1/F1/G1/03 scope；
- 运行 Delivery Full Test；
- Archive / Checkpoint / Commit / Push。
