# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `C1`
- Change ID: `formal-fact-reader-and-persistence`
- Action: `revise-explore`
- Role: `author`
- Owner authorization: not required（revise-explore 由 changes-requested 自动触发）

## Goal

处理 051-review-explore 的 1 个 P1 blocking finding，并进行全文档一致性扫描以打破"修旧引新"循环：

- **C1-EX-010**：writeRunResult 输入类型和序列化归属矛盾——Q5 声明 `writeRunResult(runPath, resultFile: RunResultFile)` 并在函数内部校验+序列化；Q7 说"序列化为 JSON 字符串交给 writeRunResult"。输入类型矛盾（object vs string），序列化归属矛盾（Q5 内部 vs Q7 adapter）

## Source review

- Review Run: `20260806-051-review-explore`
- Verdict: `changes-requested`
- Review Result SHA-256: `b20fb54733e7b3df22f511753cf8266edf01bf2d34d9681708111e820993be62`
- Blocking Findings: C1-EX-010

## Allowed work

- 修订 `openspec/changes/formal-fact-reader-and-persistence/explore.md`
- 创建本 revise-explore Run
- 不扩张 Change 范围

## Prohibited work

- 不修改冻结 specs
- 不修改 036-051 terminal Runs
- 不编写生产源码或测试源码
- 不执行 Change Checkpoint 或 Full Test
- 不提交或推送

## Required output

- 修订后的 `explore.md`（Q7 write behavior 与 Q5 签名一致 + 全文档一致性扫描结果）
- 本 Run 的 `result.json`（含一致性扫描报告）
- 下一 Action 为 `review-explore`
