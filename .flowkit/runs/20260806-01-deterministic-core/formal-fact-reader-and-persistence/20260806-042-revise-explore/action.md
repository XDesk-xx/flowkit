# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `C1`
- Change ID: `formal-fact-reader-and-persistence`
- Action: `revise-explore`
- Role: `author`
- Owner authorization: not required（revise-explore 由 changes-requested 自动触发）

## Goal

处理 041-review-explore 的 1 个 P1 blocking finding：

- **C1-EX-005**：ResultRef content-hash 设计自引用——`ActionResult.runRef.versionFingerprint` 定义为 `result.json` 内容的 SHA-256，但 `result.json` 包含 `actionResult.runRef.versionFingerprint`，哈希值是被哈希内容的一部分，写入路径没有稳定的构造规则

## Source review

- Review Run: `20260806-041-review-explore`
- Verdict: `changes-requested`
- Review Result SHA-256: `163cf222c0c6c87504c9892f1fe1e09779ddbe1c84bf192f4bc2ca5826fa3116`
- Blocking Findings: C1-EX-005

## Allowed work

- 修订 `openspec/changes/formal-fact-reader-and-persistence/explore.md`
- 创建本 revise-explore Run
- 不扩张 Change 范围

## Prohibited work

- 不修改冻结 specs
- 不修改 036-041 terminal Runs
- 不编写生产源码或测试源码
- 不执行 Change Checkpoint 或 Full Test
- 不提交或推送

## Required output

- 修订后的 `explore.md`（Q5/Q7 定义非自引用序列化边界 + 读写行为 + fixture）
- 本 Run 的 `result.json`
- 下一 Action 为 `review-explore`
