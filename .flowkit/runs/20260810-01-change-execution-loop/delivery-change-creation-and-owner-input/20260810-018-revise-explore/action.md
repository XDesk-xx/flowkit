# Action: revise-explore

- Run: `20260810-018-revise-explore`
- Delivery: `20260810-01-change-execution-loop`
- Change: `A1 delivery-change-creation-and-owner-input`
- Action: `revise-explore`
- Role: `author`
- Execution Context: `detached`
- GitHub Base: `448fa042de86d07e893bcc51da528f93eb7ced3a`
- Source Review: `20260810-017-review-explore` / `changes-requested`
- Blocking Finding: `A1-RE-001`
- Owner scope decision: dependency identity drift 并入 A1，不新增 Q2

## Revision scope

仅关闭 017 Reviewer 的 Author blocker `A1-RE-001`，不提前进入 Proposal：

1. 保留 detached ZIP 缺 `.git` 导致 checkpoint 不可观察的 transport gap；
2. 新增独立 confirmed gap：Delivery Manifest `dependsOn` 的真实 persisted value 使用 Change `id`，而 current Policy `dependenciesMet()` 按 Change `key` 解析，Policy fixtures 也使用 key 语义；
3. 明确真实 Q1 checkpoint 后 dependency identity mismatch 仍会使 A1 被错误判定 `dependency-incomplete`；
4. 将问题纳入 A1 的 dependency / create-Change validation / activation contract；
5. 要求 Proposal repo-wide 冻结唯一 dependency identity，并同步 Manifest / FormalFactReader / Policy / creation validation / diagnostics / real-Manifest-shape regression tests。

## Mutation boundary

允许：

- 修改 `openspec/changes/delivery-change-creation-and-owner-input/explore.md`；
- 创建并完成本 `018-revise-explore` Run；
- 原样累计携带 016/017 Author/Reviewer artifacts。

禁止：

- 修改 017 Reviewer-owned artifacts；
- 在 Explore 阶段直接选择 `Change.id` 或 `Change.key` 为最终 normative identity；
- 创建 Proposal / Design / Tasks / delta specs；
- 修改 production code、tests 或 canonical specs/docs；
- 重开 Q1 或新增 Q2；
- 实现 B1/C1/D1/E1/F1/G1/03 scope；
- 运行 Delivery Full Test；
- Archive / Checkpoint / Commit / Push。
