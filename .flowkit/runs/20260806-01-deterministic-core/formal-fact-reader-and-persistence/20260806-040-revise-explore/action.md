# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `C1`
- Change ID: `formal-fact-reader-and-persistence`
- Action: `revise-explore`
- Role: `author`
- Owner authorization: not required（revise-explore 由 changes-requested 自动触发）

## Goal

处理 039-review-explore 的 1 个 P1 blocking finding 和 1 个 P2 non-blocking finding：

- **C1-EX-001 (P1)**：Terminal Run status 没有物理表示或映射——Q5 将 ActionResult.executionStatus 与 RunStatus 混淆；ExecutionStatus 值集（completed/failed/blocked/in-progress）与 RunStatus 值集（pending/completed/failed/cancelled）不同，ActionResult 没有 runStatus 字段，Reader 无法重建或校验 terminal 状态
- **C1-EX-004 (P2)**：staging 清理不应分配给只读 doctor——恢复表说 doctor 可清理 staging 目录，但 E1 诊断 CLI 是只读的，C1 不包含诊断 CLI

## Source review

- Review Run: `20260806-039-review-explore`
- Verdict: `changes-requested`
- Review Result SHA-256: `687dc2d7c2e28394d9bae16d0ba218be9a099109c77b73d5083afa42f0989a32`
- Blocking Findings: C1-EX-003
- Non-blocking Findings: C1-EX-004

## Allowed work

- 修订 `openspec/changes/formal-fact-reader-and-persistence/explore.md`
- 创建本 revise-explore Run
- 不扩张 Change 范围

## Prohibited work

- 不修改冻结 specs
- 不修改 036-039 terminal Runs
- 不编写生产源码或测试源码
- 不执行 Change Checkpoint 或 Full Test
- 不提交或推送

## Required output

- 修订后的 `explore.md`（Q5 新增 result.json 物理 schema + runStatus，恢复表移除 doctor 清理）
- 本 Run 的 `result.json`
- 下一 Action 为 `review-explore`
