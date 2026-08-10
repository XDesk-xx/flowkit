# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `C1`
- Change ID: `formal-fact-reader-and-persistence`
- Action: `revise-explore`
- Role: `author`
- Owner authorization: not required（revise-explore 由 changes-requested 自动触发）

## Goal

处理 037-review-explore 的两个 P1 blocking findings，修订 explore.md：

- **C1-EX-001**：assertMutable 校验顺序错误——在已设为 terminal 的 Run 上调用 assertMutable 必然 throw，导致 result.json 永远无法写入
- **C1-EX-002**：新 Run 创建缺少原子发布边界——逐文件写入可在中断后暴露半建 Run

## Source review

- Review Run: `20260806-037-review-explore`
- Verdict: `changes-requested`
- Review Result SHA-256: `6a31e69bcac6cf237b333d17c3ee50b7a44a0bdcdb0898e3ce2b9ee93659b759`
- Blocking Findings: C1-EX-001, C1-EX-002

## Allowed work

- 修订 `openspec/changes/formal-fact-reader-and-persistence/explore.md`
- 创建本 revise-explore Run
- 不扩张 Change 范围（只处理当前 Findings）

## Prohibited work

- 不修改冻结 specs
- 不修改 036-037 terminal Runs
- 不编写生产源码或测试源码
- 不执行 Change Checkpoint 或 Full Test
- 不提交或推送

## Required output

- 修订后的 `explore.md`（Q5 重写，新增原子发布协议）
- 本 Run 的 `result.json`
- 下一 Action 为 `review-explore`
