# Action

- Delivery: `20260805-01-product-baseline`
- Change key: `E1`
- Change ID: `baseline-finalization-corrections`
- Action: `revise-propose`
- Role: `author`

## Goal

根据 owner 范围决策和 049-review-propose 的 E1-RP-003，为 E1 增加最小 delta，使 E1 成为有效的 OpenSpec Change。

## Owner Decision

Owner 授权 E1 为现有 `flowkit-bootstrap-and-roadmap` capability 增加一个最小 ADDED Requirement，冻结 Delivery Final Audit → corrective Change → Full Test 的行为。

不创建新 capability。不重新打开 A1–D1。不把具体错别字分别建模为 Requirement。不扩张到 Runner 或 CLI 实现。

## Source Review

- Review Run: `20260806-049-review-propose`
- Verdict: `changes-requested`
- Blocking Finding: E1-RP-003（移除越界 delta 后，E1 不再是有效的 OpenSpec Change）

## Changes made

1. explore.md Q1 更新：允许对现有 `flowkit-bootstrap-and-roadmap` 增加最小 ADDED Requirement
2. explore.md §4.5 新增：E. 增加最小 delta to flowkit-bootstrap-and-roadmap
3. 创建 `specs/flowkit-bootstrap-and-roadmap/spec.md`：1 个 Requirement + 2 个 Scenario
4. proposal.md 新增 section E + 更新 Capabilities 和 Impact
5. design.md 新增 D8：最小 delta on flowkit-bootstrap-and-roadmap
6. tasks.md 新增 Section 5（创建最小 delta spec）+ Section 7 恢复 openspec validate baseline-finalization-corrections --strict

## Prohibited work

- 不修改 049-review-propose Run（terminal）
- 不创建正式输出文档（属于 Apply 阶段）
- 不运行 Full Test
- 不自动 Git Commit

## Required output

- explore.md、proposal.md、design.md、tasks.md、spec.md 已修正
- `openspec validate baseline-finalization-corrections --strict` 通过
- 本 Run 的 `result.json`
- 下一 Action 为 `review-propose`
