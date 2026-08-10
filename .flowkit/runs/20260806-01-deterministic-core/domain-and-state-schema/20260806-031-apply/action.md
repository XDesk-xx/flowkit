# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `B1`
- Change ID: `domain-and-state-schema`
- Action: `apply`
- Role: `author`

## Goal

依据 `20260806-030-review-propose` 的 `approved` Verdict 实现 B1 的 44 项 tasks。创建 6 个源文件（types.ts、states.ts、actions.ts、run-id.ts、terminal.ts、schema-validator.ts）和 6 个测试文件，全部使用构造 fixture。运行 typecheck、build、test、lint 四项验证。

## Source review

- Review Run: `20260806-030-review-propose`
- Verdict: `approved`
- Blocking Findings: 0
- Non-Blocking Findings: 0
- nextActionRecommendation: `await-owner-authorization-for-apply`

## Allowed work

- 创建 `src/domain/` 下的 6 个源文件
- 创建 `tests/unit/domain/` 下的 6 个测试文件
- 修改 `openspec/changes/domain-and-state-schema/tasks.md`（标记 checkbox）
- 创建本 apply Run

## Prohibited work

- 不修改冻结 specs/docs
- 不修改 Delivery Manifest
- 不修改 A1 已有 tracked 文件
- 不修改 013-030 terminal Runs
- 不执行 Archive 或 Full Test
- 不创建 Git Commit

## Required output

- 6 个源文件 + 6 个测试文件
- tasks.md 全部 44 项标记 [x]
- 本 Run 的 `result.json`
- 下一 Action 为 `review-apply`
