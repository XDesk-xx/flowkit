# Action: propose

- Run: `20260806-116-propose`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q1 execution-model-correction`
- Role: author
- Source Review: `20260806-115-review-explore` (`approved`)

## Goal

将 115 已批准的 Q1 Explore 冻结为正式 OpenSpec Proposal / Design / delta Specs / Tasks，
不改变已批准 Explore 的语义边界。

## Inputs

- `openspec/changes/execution-model-correction/explore.md`
- `openspec/delivery-groups/20260806-01-deterministic-core.yaml`
- `20260806-115-review-explore/result.json`
- 当前 canonical specs / docs / persistence implementation

## Allowed work

- 创建或更新本 Change 的 `proposal.md`、`design.md`、`specs/**`、`tasks.md`
- 运行 OpenSpec proposal-level validation
- 记录本 Author Run 的最小执行结果

## Prohibited work

- 不修改生产代码或测试代码
- 不重新打开 A1–D1
- 不修改 D1 Policy 业务语义
- 不运行 Delivery Full Test
- 不执行 review-propose
- 不 Archive / Checkpoint / Commit / Push
- 不实现具体 focused/affected/full npm scripts

## Required output

- `openspec/changes/execution-model-correction/proposal.md`
- `openspec/changes/execution-model-correction/design.md`
- `openspec/changes/execution-model-correction/specs/**`
- `openspec/changes/execution-model-correction/tasks.md`
- terminal `116-propose/result.json`
