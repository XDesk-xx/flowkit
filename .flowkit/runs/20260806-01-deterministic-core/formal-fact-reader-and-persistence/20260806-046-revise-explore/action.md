# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `C1`
- Change ID: `formal-fact-reader-and-persistence`
- Action: `revise-explore`
- Role: `author`
- Owner authorization: not required（revise-explore 由 changes-requested 自动触发）

## Goal

处理 045-review-explore 的 1 个 P1 blocking finding：

- **C1-EX-007**：物理 ActionResult 投影没有可执行的校验器——Q5 声称 `actionResult` 通过 B1 Schema 校验，但 B1 `schema-validator.ts` 只导出 `validateRun`，没有 `validateActionResult`；且物理类型 `ActionResultWithoutRunRef` 故意省略必填的 `runRef`，B1 的 `ActionResult` 校验器（如果存在）无法接受该投影

## Source review

- Review Run: `20260806-045-review-explore`
- Verdict: `changes-requested`
- Review Result SHA-256: `d8716e499947736d7aaf1211a93f873bf3ac39116dc31fc45626b14b8375e295`
- Blocking Findings: C1-EX-007

## Allowed work

- 修订 `openspec/changes/formal-fact-reader-and-persistence/explore.md`
- 创建本 revise-explore Run
- 不扩张 Change 范围

## Prohibited work

- 不修改冻结 specs
- 不修改 036-045 terminal Runs
- 不编写生产源码或测试源码
- 不执行 Change Checkpoint 或 Full Test
- 不提交或推送

## Required output

- 修订后的 `explore.md`（Q5 定义 C1 拥有的 validateActionResultWithoutRunRef + 字段枚举 + 嵌套 ResultRef 校验 + malformed fixture）
- 本 Run 的 `result.json`
- 下一 Action 为 `review-explore`
