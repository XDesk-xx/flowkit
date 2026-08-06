# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `C1`
- Change ID: `formal-fact-reader-and-persistence`
- Action: `revise-propose`
- Role: `author`
- Owner authorization: not required（revise 由 changes-requested 自动触发）

## Goal

处理 059-review-propose 的 3 个 P1 blocking findings：

- C1-PR-006: schema-validation failure is an unsafe Bootstrap discriminator（降级路径，不是 fail-closed）
- C1-PR-007: ContextFile.inputRef cannot map to B1 Run.inputRef（string 无法映射 ResultRef）
- C1-PR-008: ContextFile contradicts Delivery-level Run support（changeId 强制必填与 B1 矛盾）

并执行全量一致性扫描（含真实 Run 语料证据），确保修订不引入新矛盾。

## Source review

- Review Run: `20260806-059-review-propose`
- Verdict: `changes-requested`
- Review Result SHA-256: `cd4bd0c2a3d67b621d78c45e02723839b7164bb688bea660780aab060500c978`

## Allowed work

- 修改 `proposal.md`、`design.md`、`specs/`、`tasks.md`
- 创建本 revise-propose Run
- 执行 `openspec validate --strict`
- 执行 `npm run typecheck`、`npm run lint`
- 执行全量一致性扫描（含真实 Run 语料证据）

## Prohibited work

- 不修改冻结 specs
- 不修改 036-059 terminal Runs
- 不编写生产源码或测试源码
- 不执行 Change Checkpoint 或 Full Test
- 不提交或推送
- 不扩张 Change 范围（只处理 C1-PR-006/007/008）

## Required output

- 修订后的 `proposal.md`、`design.md`、`specs/flowkit-formal-fact-reader-and-persistence/spec.md`、`tasks.md`
- `openspec validate --strict` 通过
- `npm run typecheck` 通过
- `npm run lint` 通过
- 全量一致性扫描结果（含真实 Run 语料证据，0 剩余矛盾）
- 本 Run 的 `result.json`
- 下一 Action 为 `review-propose`
