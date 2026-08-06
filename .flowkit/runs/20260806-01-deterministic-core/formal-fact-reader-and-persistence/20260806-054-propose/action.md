# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `C1`
- Change ID: `formal-fact-reader-and-persistence`
- Action: `propose`
- Role: `author`
- Owner authorization: not required（propose 由 explore approved 自动触发）

## Goal

基于 053-review-explore approved 的 explore.md，生成 C1 的正式 proposal 产物：

- `proposal.md`：变更动机、内容、capability、影响
- `design.md`：设计决策、架构、接口边界
- `specs/flowkit-formal-fact-reader-and-persistence/spec.md`：ADDED Requirements + Scenarios
- `tasks.md`：编号检查清单

## Source review

- Review Run: `20260806-053-review-explore`
- Verdict: `approved`
- Review Result SHA-256: `d4b1ea6fa1c30f2a55c8a1225dfb3cdc3822073e8da40d1978c773e3d495f0c7`

## Allowed work

- 生成 `proposal.md`、`design.md`、`specs/`、`tasks.md`
- 创建本 propose Run
- 执行 `openspec validate --strict`

## Prohibited work

- 不修改冻结 specs
- 不修改 036-053 terminal Runs
- 不编写生产源码或测试源码
- 不执行 Change Checkpoint 或 Full Test
- 不提交或推送

## Required output

- `proposal.md`、`design.md`、`specs/flowkit-formal-fact-reader-and-persistence/spec.md`、`tasks.md`
- `openspec validate formal-fact-reader-and-persistence --strict` 通过
- 本 Run 的 `result.json`
- 下一 Action 为 `review-propose`
