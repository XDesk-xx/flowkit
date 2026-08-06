# Action

- Delivery: `20260805-01-product-baseline`
- Change key: `E1`
- Change ID: `baseline-finalization-corrections`
- Action: `propose`
- Role: `author`

## Goal

根据 045-review-explore approved 的 E1 Explore，创建 Proposal 四件套。

## Source Review

- Review Run: `20260806-045-review-explore`
- Verdict: `approved`

## Allowed work

- 创建 `proposal.md`、`design.md`、`specs/flowkit-baseline-finalization-corrections/spec.md`、`tasks.md`
- 记录 Run

## Prohibited work

- 不修改 A1–D1 的 archived Change 历史
- 不修改正式输出文档（属于 Apply 阶段）
- 不运行 Full Test
- 不自动 Git Commit

## Required output

- Proposal 四件套已创建
- `openspec validate baseline-finalization-corrections --strict` 通过
- 本 Run 的 `result.json`
- 下一 Action 为 `review-propose`
