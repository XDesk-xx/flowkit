# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `C1`
- Change ID: `formal-fact-reader-and-persistence`
- Action: `revise-propose`
- Role: `author`
- Owner authorization: not required（revise 由 changes-requested 自动触发）

## Goal

处理 055-review-propose 的 3 个 P1 blocking findings：

- C1-PR-001: YAML manifest parsing contract is not frozen
- C1-PR-002: context.json has no physical schema or validation contract
- C1-PR-003: no compatibility boundary for existing formal Bootstrap Runs

并执行全量一致性扫描，确保修订不引入新矛盾。

## Source review

- Review Run: `20260806-055-review-propose`
- Verdict: `changes-requested`
- Review Result SHA-256: `b755df42a70a5990a84bb07e767ab460f454adaa0a1fdae1b0a107a0ec444f6e`

## Allowed work

- 修改 `proposal.md`、`design.md`、`specs/`、`tasks.md`
- 创建本 revise-propose Run
- 执行 `openspec validate --strict`
- 执行全量一致性扫描

## Prohibited work

- 不修改冻结 specs
- 不修改 036-055 terminal Runs
- 不编写生产源码或测试源码
- 不执行 Change Checkpoint 或 Full Test
- 不提交或推送
- 不扩张 Change 范围（只处理 C1-PR-001/002/003）

## Required output

- 修订后的 `proposal.md`、`design.md`、`specs/flowkit-formal-fact-reader-and-persistence/spec.md`、`tasks.md`
- `openspec validate --strict` 通过
- 全量一致性扫描结果（0 剩余矛盾）
- 本 Run 的 `result.json`
- 下一 Action 为 `review-propose`
