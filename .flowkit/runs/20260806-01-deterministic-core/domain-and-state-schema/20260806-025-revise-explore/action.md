# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `B1`
- Change ID: `domain-and-state-schema`
- Action: `revise-explore`
- Role: `author`

## Goal

依据 `20260806-024-review-explore` 的 1 个 Blocking Finding 修订 B1 Explore。解决 Run-ID 设计只分配 max(NNN)+1、缺少校验唯一性/单调性/三位数耗尽的问题（B1-RE-007）：扩展 Q3 为纯解析/校验/分配契约（parseRunId / validateRunIdUniqueness / allocateNextNnn / validateCandidateNnn），B1 操作传入 Run-ID fixture 不执行文件系统遍历，文件系统遍历和原子持久化属于 C1；更新 Section 3.1、Section 4、验收标准、Q10 测试策略、结论和 Review 重点覆盖完整校验契约。

## Source review

- Review Run: `20260806-024-review-explore`
- Verdict: `changes-requested`
- Blocking Findings: 1（B1-RE-007）
- Reviewed Result SHA-256: `5feaa82fd8facc6ff4d7b7b04418188b6646b02eeb3e058d15c962f18a2a4091`
- Resolved Findings: 6（B1-RE-001/002 在 015；B1-RE-003 在 017；B1-RE-004 在 019；B1-RE-005 在 021；B1-RE-006 在 023）

## Allowed work

- 修改 `openspec/changes/domain-and-state-schema/explore.md`
- 创建本 revise-explore Run

## Prohibited work

- 不修改冻结 specs/docs
- 不修改 Delivery Manifest
- 不修改 A1 archived artifacts 或 terminal Runs
- 不修改 013-024 terminal Runs
- 不创建代码文件
- 不执行 Propose、Apply、Archive 或 Full Test
- 不提交或推送

## Required output

- 修复后的 explore.md（Q3 含纯解析/校验/分配契约，B1 操作 fixture 不执行文件系统遍历）
- 本 Run 的 `result.json`
- 下一 Action 为 `review-explore`
