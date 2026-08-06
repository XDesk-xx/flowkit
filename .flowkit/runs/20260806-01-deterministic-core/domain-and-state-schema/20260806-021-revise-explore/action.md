# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `B1`
- Change ID: `domain-and-state-schema`
- Action: `revise-explore`
- Role: `author`

## Goal

依据 `20260806-020-review-explore` 的 1 个 Blocking Finding 修订 B1 Explore。解决 RunStatus 引入未冻结 `in-progress` 状态的问题（B1-RE-005）：RunStatus 与冻结 `docs/core-model.md` Section 3.3 一致（`pending | completed | failed | cancelled`），`in-progress` 仅保留在 ActionResult.ExecutionStatus。

## Source review

- Review Run: `20260806-020-review-explore`
- Verdict: `changes-requested`
- Blocking Findings: 1（B1-RE-005）
- Reviewed Result SHA-256: `289a5e0426b5c201c00968c224b046604cdfb7a3bd502fa9e526a7e93fc0776a`
- Resolved Findings: 4（B1-RE-001/002 在 015 解决；B1-RE-003 在 017 解决；B1-RE-004 在 019 解决）

## Allowed work

- 修改 `openspec/changes/domain-and-state-schema/explore.md`
- 创建本 revise-explore Run

## Prohibited work

- 不修改冻结 specs/docs
- 不修改 Delivery Manifest
- 不修改 A1 archived artifacts 或 terminal Runs
- 不修改 013-020 terminal Runs
- 不创建代码文件
- 不执行 Propose、Apply、Archive 或 Full Test
- 不提交或推送

## Required output

- 修复后的 explore.md（RunStatus 不含 `in-progress`）
- 本 Run 的 `result.json`
- 下一 Action 为 `review-explore`
