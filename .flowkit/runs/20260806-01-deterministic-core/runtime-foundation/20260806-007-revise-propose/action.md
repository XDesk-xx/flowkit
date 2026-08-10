# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `A1`
- Change ID: `runtime-foundation`
- Action: `revise-propose`
- Role: `author`

## Goal

依据 `20260806-006-review-propose` 的 1 个 Blocking Finding 修订 A1 Proposal。修复 tsconfig.test.json 继承生产 rootDir=src 但包含 tests/ 外部文件导致 typecheck 无法工作的问题。不扩大 A1 范围，不修改 explore.md 或先前 terminal Runs。

## Source review

- Review Run: `20260806-006-review-propose`
- Verdict: `changes-requested`
- Blocking Findings: 1（A1-RP-001）
- Review Result SHA-256: `2b6d6ddc021e04c4116516a3ed4e2b8a8c44131800722218e852a8682c85fe91`

## Allowed work

- 修改 `openspec/changes/runtime-foundation/design.md`
- 修改 `openspec/changes/runtime-foundation/specs/flowkit-runtime-foundation/spec.md`
- 修改 `openspec/changes/runtime-foundation/tasks.md`
- 创建本 revise-propose Run

## Prohibited work

- 不修改 Delivery Manifest 或冻结 specs/docs
- 不修改 explore.md（已 approved）
- 不修改 proposal.md（无需修改）
- 不修改 001-006 terminal Runs
- 不创建代码文件
- 不执行 Apply、Archive 或 Full Test
- 不提交或推送

## Required output

- 修复后的 proposal 产物（design.md、spec.md、tasks.md）
- 本 Run 的 `result.json`
- 下一 Action 为 `review-propose`
