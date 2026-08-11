# Action: revise-propose

- Run: `20260811-037-revise-propose`
- Delivery: `20260810-01-change-execution-loop`
- Change: `B1 lean-run-and-action-package`
- Action: `revise-propose`
- Role: `author`
- Execution Context: `detached`
- GitHub Base: `da4eeb6a7e3787a44ea17fcff8b8ef08f9e05de1`
- Source Review: `20260811-036-review-propose` / `changes-requested`
- Blocking Findings: `B1-RP-001`, `B1-RP-002`, `B1-RP-003`

## Revision scope

仅关闭 036 Reviewer 的三个 Author blocker，不重新打开已批准 Explore，也不提前进入 Apply：

1. 冻结 normal next()-driven progression 与 Q1 explicit direct re-review 的 bounded dual-entry semantics；
2. 冻结十个 Standard Change Actions 的完整 ActionDefinition normative mapping；
3. 将 contractRefs identity/version 纳入 semanticInputFingerprint canonical descriptor，并给出 package identity inclusion/exclusion rule。

## Mutation boundary

允许：

- 修改 B1 `proposal.md`、`design.md`、`tasks.md` 与 affected delta specs；
- 创建并完成本 `037-revise-propose` Run；
- 执行 OpenSpec strict、typecheck 与只读验证；
- 原样累计携带 031–036 Author/Reviewer artifacts。

禁止：

- 修改 036 Reviewer-owned artifacts；
- 修改 production code、tests、canonical docs/specs/AGENTS；
- 实现 Apply；
- 重开 034 已关闭的 Action Package / Full Test / C1 ownership finding；
- 实现 C1/D1/E1/F1/G1/03 scope；
- 运行 Delivery Full Test；
- Archive / Checkpoint / Commit / Push。
