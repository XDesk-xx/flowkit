# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `C1`
- Change ID: `formal-fact-reader-and-persistence`
- Action: `revise-explore`
- Role: `author`
- Owner authorization: not required（revise-explore 由 changes-requested 自动触发）

## Goal

处理 047-review-explore 的 1 个 P1 blocking finding：

- **C1-EX-008**：`RunResultFile` 的 `executionStatus` 在 envelope 和 `actionResult` 两处重复，但没有跨字段一致性规则——`runStatus:completed` + 顶层 `executionStatus:completed` + 嵌套 `actionResult.executionStatus:failed` 会被接受，Policy-facing 重建事实不一致

## Source review

- Review Run: `20260806-047-review-explore`
- Verdict: `changes-requested`
- Review Result SHA-256: `2a4b092668380fa581cfd3eb0a5634f1d93442407ea758b0da270970e0c4a6bf`
- Blocking Findings: C1-EX-008

## Allowed work

- 修订 `openspec/changes/formal-fact-reader-and-persistence/explore.md`
- 创建本 revise-explore Run
- 不扩张 Change 范围

## Prohibited work

- 不修改冻结 specs
- 不修改 036-047 terminal Runs
- 不编写生产源码或测试源码
- 不执行 Change Checkpoint 或 Full Test
- 不提交或推送

## Required output

- 修订后的 `explore.md`（RunResultFile 移除顶层 executionStatus，从 actionResult 派生；组合表更新；mismatch fixture）
- 本 Run 的 `result.json`
- 下一 Action 为 `review-explore`
