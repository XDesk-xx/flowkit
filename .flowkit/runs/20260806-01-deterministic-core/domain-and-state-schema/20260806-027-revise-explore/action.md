# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `B1`
- Change ID: `domain-and-state-schema`
- Action: `revise-explore`
- Role: `author`

## Goal

依据 `20260806-026-review-explore` 的 1 个 Blocking Finding 修订 B1 Explore。解决 `validateCandidateNnn` 不校验候选是否为有效 NNN 值的问题（B1-RE-008）：候选 `number` 参数未要求是 1-999 范围内的有限整数，0、负数、小数、非有限值不会被显式拒绝。修复：在 `validateCandidateNnn` 单调性校验前增加有限整数 1-999 前置校验，throw `RUN_ID_NNN_OUT_OF_RANGE`（与 parseRunId 的 001-999 语法对齐）；新增对应 fixture 测试。

## Source review

- Review Run: `20260806-026-review-explore`
- Verdict: `changes-requested`
- Blocking Findings: 1（B1-RE-008）
- Reviewed Result SHA-256: `c2ee3935a72725d34f4d0c1594b5b9f8ccb31bec13929f8deb8d8af114032904`
- Resolved Findings: 7（B1-RE-001/002 在 015；B1-RE-003 在 017；B1-RE-004 在 019；B1-RE-005 在 021；B1-RE-006 在 023；B1-RE-007 在 025）

## Allowed work

- 修改 `openspec/changes/domain-and-state-schema/explore.md`
- 创建本 revise-explore Run

## Prohibited work

- 不修改冻结 specs/docs
- 不修改 Delivery Manifest
- 不修改 A1 archived artifacts 或 terminal Runs
- 不修改 013-026 terminal Runs
- 不创建代码文件
- 不执行 Propose、Apply、Archive 或 Full Test
- 不提交或推送

## Required output

- 修复后的 explore.md（Q3 `validateCandidateNnn` 含有限整数 1-999 前置校验）
- 本 Run 的 `result.json`
- 下一 Action 为 `review-explore`
