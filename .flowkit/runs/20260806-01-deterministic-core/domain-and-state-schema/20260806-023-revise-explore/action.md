# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `B1`
- Change ID: `domain-and-state-schema`
- Action: `revise-explore`
- Role: `author`

## Goal

依据 `20260806-022-review-explore` 的 1 个 Blocking Finding 修订 B1 Explore。解决状态转换表只覆盖 Change、缺少 Delivery 和 Run 结构转换表的问题（B1-RE-006）：扩展 Q6 为三个实体分别定义结构转换表，更新验收标准和测试策略覆盖三个实体的 exhaustive matrix 测试。

## Source review

- Review Run: `20260806-022-review-explore`
- Verdict: `changes-requested`
- Blocking Findings: 1（B1-RE-006）
- Reviewed Result SHA-256: `eb8d8ca96c69d65ba6fd252791a0f6a677c53265e247237dd2610867516e9877`
- Resolved Findings: 5（B1-RE-001/002 在 015；B1-RE-003 在 017；B1-RE-004 在 019；B1-RE-005 在 021）

## Allowed work

- 修改 `openspec/changes/domain-and-state-schema/explore.md`
- 创建本 revise-explore Run

## Prohibited work

- 不修改冻结 specs/docs
- 不修改 Delivery Manifest
- 不修改 A1 archived artifacts 或 terminal Runs
- 不修改 013-022 terminal Runs
- 不创建代码文件
- 不执行 Propose、Apply、Archive 或 Full Test
- 不提交或推送

## Required output

- 修复后的 explore.md（Q6 含 Delivery/Change/Run 三个结构转换表）
- 本 Run 的 `result.json`
- 下一 Action 为 `review-explore`
