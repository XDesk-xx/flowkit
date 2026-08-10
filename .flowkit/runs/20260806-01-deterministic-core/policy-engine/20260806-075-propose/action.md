# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `D1`
- Change ID: `policy-engine`
- Action: `propose`
- Role: `author`
- Owner authorization: not required（propose 由 explore approved 自动触发）

## Goal

基于 074-review-explore approved 的 D1 explore conclusion（`.tmp/explore/policy-engine/conclusion.md`），
生成 D1 policy-engine 的正式 proposal 产物：

- `proposal.md`：变更动机、内容、capability、影响
- `design.md`：设计决策、架构、所有权边界、不做
- `specs/flowkit-policy-engine/spec.md`：ADDED Requirements + Scenarios
- `tasks.md`：编号检查清单

## Source review

- Review Run: `20260806-074-review-explore`
- Verdict: `approved`
- Review Result SHA-256: `c672e7621062bb95c8dba3b68a8fee38d5529d8bef6ae86cfb3e811bae8792e9`
- Reviewed Run: `20260806-073-revise-explore`（lineage match + approved）
- Resolved findings: D1-EX-001（Lineage 模型）、D1-EX-002（verification/authorization facts 可用性）、D1-EX-003（071 inputRef provenance 修正）

## Allowed work

- 生成 `proposal.md`、`design.md`、`specs/flowkit-policy-engine/spec.md`、`tasks.md`
- 创建本 propose Run
- 执行 `openspec validate policy-engine --strict`
- 执行 `npm run typecheck` 和 `npm run lint`（确认无回归）

## Prohibited work

- 不修改冻结 specs（`openspec/specs/flowkit-domain-and-state-schema/`、`openspec/specs/flowkit-formal-fact-reader-and-persistence/`）
- 不修改 069-074 terminal Runs
- 不编写生产源码或测试源码（属 apply 阶段）
- 不修改 delivery manifest
- 不执行 Change Checkpoint 或 Full Test
- 不提交或推送（AGENTS.md 规则 #6）

## Required output

- `openspec/changes/policy-engine/proposal.md`
- `openspec/changes/policy-engine/design.md`
- `openspec/changes/policy-engine/specs/flowkit-policy-engine/spec.md`
- `openspec/changes/policy-engine/tasks.md`
- `openspec validate policy-engine --strict` 通过
- 本 Run 的 `result.json`
- 下一 Action 为 `review-propose`
