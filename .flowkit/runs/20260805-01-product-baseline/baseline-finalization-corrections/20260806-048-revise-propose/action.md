# Action

- Delivery: `20260805-01-product-baseline`
- Change key: `E1`
- Change ID: `baseline-finalization-corrections`
- Action: `revise-propose`
- Role: `author`

## Goal

根据 047-review-propose 的 1 个 Blocking Finding 和 1 个 Non-blocking Finding 修正 Proposal。

## Source Review

- Review Run: `20260806-047-review-propose`
- Verdict: `changes-requested`

## Findings addressed

### E1-RP-001（Blocking）：Proposal 新增 capability 和 Requirement，越出已批准的 E1 Explore 范围

045-review-explore 已批准的 Explore Q1 明确：E1 不创建新 capability。046-propose 却创建 `flowkit-baseline-finalization-corrections` capability 并新增 7 个 Requirement 和 15 个 Scenario。

修正：
- 删除 `specs/flowkit-baseline-finalization-corrections/spec.md` 及 `specs/` 目录
- proposal.md Capabilities 改为"E1 不创建新 capability"
- design.md 移除 D6（不创建新 capability 的产品语义），D7→D6, D8→D7
- tasks.md 移除 `openspec validate baseline-finalization-corrections --strict` 任务

### E1-RP-002（Non-blocking）：tasksTotal 与 checklist 不一致

046 result.json 记录 tasksTotal=17，但 tasks.md 实际有 22 个未完成 checkbox。

修正：048 result.json 记录校正后的实际 checklist 数量 21（移除 spec validation 任务后）。不修改 046 Run。

## Prohibited work

- 不修改 046-propose 和 047-review-propose Run（terminal）
- 不创建正式输出文档（属于 Apply 阶段）
- 不运行 Full Test
- 不自动 Git Commit

## Required output

- Proposal 四件套已修正（3 份文件，spec.md 已删除）
- 本 Run 的 `result.json`
- 下一 Action 为 `review-propose`
