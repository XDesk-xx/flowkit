# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `C1`
- Change ID: `formal-fact-reader-and-persistence`
- Action: `revise-explore`
- Role: `author`
- Owner authorization: not required（revise-explore 由 changes-requested 自动触发）

## Goal

处理 043-review-explore 的 1 个 P1 blocking finding：

- **C1-EX-006**：Terminal result 发布没有独占单写者声明——Q5 阶段 2 使用 `atomicWriteFile`（temp + rename）写入 result.json，这是原子*替换*操作，不是原子*create-if-not-exists*。两个 writer 可都通过 assertMutable 后分别发布不同 result.json，后写者覆盖先写者的 terminal 结果。

## Source review

- Review Run: `20260806-043-review-explore`
- Verdict: `changes-requested`
- Review Result SHA-256: `2f2a805afdd2ac6888e8743d0c6a9c1c62db2cfdb3af43650336a5cba12dbe77`
- Blocking Findings: C1-EX-006

## Allowed work

- 修订 `openspec/changes/formal-fact-reader-and-persistence/explore.md`
- 创建本 revise-explore Run
- 不扩张 Change 范围

## Prohibited work

- 不修改冻结 specs
- 不修改 036-043 terminal Runs
- 不编写生产源码或测试源码
- 不执行 Change Checkpoint 或 Full Test
- 不提交或推送

## Required output

- 修订后的 `explore.md`（Q5 阶段 2 重写为独占完成发布协议 + 并发 writer fixture）
- 本 Run 的 `result.json`
- 下一 Action 为 `review-explore`
