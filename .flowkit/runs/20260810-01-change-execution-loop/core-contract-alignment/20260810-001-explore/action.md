# Action: explore

- Run: `20260810-001-explore`
- Delivery: `20260810-01-change-execution-loop`
- Change: `Q1 core-contract-alignment`
- Role: author
- Execution Context: detached
- Owner authorization: explicit（Owner 当前明确授权开始 Explore Q1）
- GitHub Base: `95bb875b12dc682882ded6b89b829b8b6c407d74`

## 目标

基于 Delivery Start exact Base 与 `02-change-execution-loop-delivery-implementation-reference-v3.md`，调查 Q1 必须修正的真实 canonical drift：

1. `changes-requested ≠ revise-required` 与 blocker authority；
2. non-author blocker direct re-review / no-op revise prohibition；
3. Standard Run 收敛为 Change-only，Delivery Full Test / Finalize 不再作为 Standard Formal Run Action；
4. docs / specs / code / AGENTS 的最小一致性影响面。

## Owner 授权边界

Q1 无依赖，当前 Delivery active 且无其他 active Change。Owner 明确授权本次 Bootstrap/detached activation 与 Explore。

该授权只允许：

- Manifest `Q1 planned → active`；
- 创建 `openspec/changes/core-contract-alignment/.openspec.yaml`；
- 创建 `openspec/changes/core-contract-alignment/explore.md`；
- 创建并完成本 `001-explore` Run；
- 读取 current canonical docs/specs/src/tests 与 GitHub exact Base；
- 执行只读调查。

## 禁止工作

- 不创建 Proposal / Design / Tasks / delta specs；
- 不修改 production code、tests、canonical specs/docs contract；
- 不实现 D1 typed Finding convergence；
- 不实现 Delivery Full Test / Finalize executor；
- 不运行 Delivery Full Test；
- 不执行 Archive / Checkpoint / Commit / Push；
- 不进入 A1 或 03 scope。
