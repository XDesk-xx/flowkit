# Action: revise-explore

- Run: `20260811-033-revise-explore`
- Delivery: `20260810-01-change-execution-loop`
- Change: `B1 lean-run-and-action-package`
- Action: `revise-explore`
- Role: `author`
- Execution Context: `detached`
- GitHub Base: `da4eeb6a7e3787a44ea17fcff8b8ef08f9e05de1`
- Source Review: `20260811-032-review-explore` / `changes-requested`
- Blocking Finding: `B1-RE-001`

## Revision scope

仅关闭 032 Reviewer 的 Author blocker `B1-RE-001`，不提前进入 Proposal：

1. 新增 confirmed canonical drift：docs 已将 Delivery Full Test / Finalize 排除于 Standard Change Action Package，但 canonical `flowkit-integration-boundaries` spec 仍把 Full Test 作为 Action Package Owner authorization 示例；
2. 明确 B1 logical Action Package 只服务十个 Standard Change Actions，Delivery Full Test / Finalize 继续属于 Delivery behavior、不得创建 Standard Run 或进入 B1 package；
3. 明确 B1 owns logical package preparation/generation，后置 integration / provider transport / stable adapter 只做 physical mapping/execution，不拥有 lifecycle decision；
4. 将 `docs/integration-boundaries.md`、`openspec/specs/flowkit-integration-boundaries/spec.md`、`docs/core-model.md` 提升为 Proposal 必须明确对齐的 canonical surface。

## Mutation boundary

允许：

- 修改 `openspec/changes/lean-run-and-action-package/explore.md`；
- 创建并完成本 `033-revise-explore` Run；
- 原样累计携带 031/032 Author/Reviewer artifacts。

禁止：

- 修改 032 Reviewer-owned artifacts；
- 创建 Proposal / Design / Tasks / delta specs；
- 修改 production code、tests 或 canonical docs/specs；
- 把 Delivery Full Test / Finalize 重新纳入 Standard Change Action / Run / Action Package；
- 实现 C1/D1/E1/F1/G1/03 scope；
- 运行 Delivery Full Test；
- Archive / Checkpoint / Commit / Push。
