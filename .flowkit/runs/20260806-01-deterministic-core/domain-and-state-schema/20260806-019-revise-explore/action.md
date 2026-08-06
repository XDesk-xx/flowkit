# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `B1`
- Change ID: `domain-and-state-schema`
- Action: `revise-explore`
- Role: `author`

## Goal

依据 `20260806-018-review-explore` 的 1 个 Blocking Finding 修订 B1 Explore。解决 11 个领域对象缺少字段级契约和 B1/C1 所有权边界的问题（B1-RE-004）：添加领域对象契约矩阵，为每个对象明确 B1 所有权、最小字段和校验期望。

## Source review

- Review Run: `20260806-018-review-explore`
- Verdict: `changes-requested`
- Blocking Findings: 1（B1-RE-004）
- Reviewed Result SHA-256: `8cc3c09b323795c35f5379e8470d25534a069d02a4fc940041dbc3ff96524882`
- Resolved Findings: 3（B1-RE-001, B1-RE-002 在 015 解决；B1-RE-003 在 017 解决）

## Allowed work

- 修改 `openspec/changes/domain-and-state-schema/explore.md`
- 创建本 revise-explore Run

## Prohibited work

- 不修改冻结 specs/docs
- 不修改 Delivery Manifest
- 不修改 A1 archived artifacts 或 terminal Runs
- 不修改 013/014/015/016/017/018 terminal Runs
- 不创建代码文件
- 不执行 Propose、Apply、Archive 或 Full Test
- 不提交或推送

## Required output

- 修复后的 explore.md（含 Section 5.1 领域对象契约矩阵）
- 本 Run 的 `result.json`
- 下一 Action 为 `review-explore`
