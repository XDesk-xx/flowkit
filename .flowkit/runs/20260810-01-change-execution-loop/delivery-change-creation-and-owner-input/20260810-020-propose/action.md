# Action: propose

- Run: `20260810-020-propose`
- Delivery: `20260810-01-change-execution-loop`
- Change: `A1 delivery-change-creation-and-owner-input`
- Role: author
- Execution Context: detached
- Owner authorization: not-required（019 review-explore approved）
- GitHub Base: `448fa042de86d07e893bcc51da528f93eb7ced3a`
- Input Review Run: `20260810-019-review-explore`

## 目标

基于 019 approved Explore，冻结 A1 Delivery/Change creation、Owner decision/authorization provenance、Change activation 与 canonical dependency identity 的完整 Proposal/Design/Specs/Tasks contract。

## Proposal freeze boundary

本 Run 允许：

- 创建/完成 proposal.md、design.md、tasks.md 与 proposal 声明的 delta specs；
- 基于 repo-wide canonical evidence 冻结 Change.id dependency identity、Owner provenance physical source/schema/applicability、Manifest writer、activation ordering/retry、minimal write CLI/API 与 OpenSpec initializer seam；
- 执行 OpenSpec 1.7 status/instructions/strict validation 与只读代码/规范调查。

本 Run 禁止：

- 修改 production code、tests、canonical specs/docs/AGENTS；
- 实现 create/owner/activate write-side；
- 实现 B1/C1/D1/E1/F1/G1/03 scope；
- 运行 Delivery Full Test；
- Archive / Checkpoint / Commit / Push。
