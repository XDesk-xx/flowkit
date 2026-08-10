# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `C1`
- Change ID: `formal-fact-reader-and-persistence`
- Action: `revise-explore`
- Role: `author`
- Owner authorization: not required（revise-explore 由 changes-requested 自动触发）

## Goal

处理 049-review-explore 的 1 个 P1 blocking finding：

- **C1-EX-009**：Q7 保留了覆盖能力的 result.json 写入路径——Q5 正确要求 temp-file + fs.link create-if-not-exists 并禁止 atomicWriteFile 用于 terminal 发布，但 Q7 write behavior 仍说 `atomicWriteFile(result.json, jsonString)`。A1 atomicWriteFile 使用 rename（替换已存在目标），通过第二条写入路径重新引入 C1-EX-006 terminal 覆盖缺陷

## Source review

- Review Run: `20260806-049-review-explore`
- Verdict: `changes-requested`
- Review Result SHA-256: `859d692375665f07718a0c426a2f2bd7a9ea8e9840adaf6de89542eeb67d5f60`
- Blocking Findings: C1-EX-009

## Allowed work

- 修订 `openspec/changes/formal-fact-reader-and-persistence/explore.md`
- 创建本 revise-explore Run
- 不扩张 Change 范围

## Prohibited work

- 不修改冻结 specs
- 不修改 036-049 terminal Runs
- 不编写生产源码或测试源码
- 不执行 Change Checkpoint 或 Full Test
- 不提交或推送

## Required output

- 修订后的 `explore.md`（Q7 移除 atomicWriteFile 发布路径，明确 adapter 不发布/替换 terminal result；新增一致性 fixture）
- 本 Run 的 `result.json`
- 下一 Action 为 `review-explore`
