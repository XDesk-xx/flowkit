# Action

- Delivery: `20260805-01-product-baseline`
- Change key: `D1`
- Change ID: `bootstrap-and-roadmap`
- Action: `apply`
- Role: `author`

## Goal

根据 036-review-propose approved 的 D1 Proposal，创建四份正式输出文档和 verification.md，将 approved Explore 和 Proposal 结论转化为可执行的 Bootstrap 操作基线。

## owner authorization

- 授权类型：`apply`
- 授权来源：owner 指令 "apply"
- 授权范围：D1 bootstrap-and-roadmap Change 的 apply 阶段

## Inputs

- Source Review Run: `20260805-036-review-propose`（verdict: approved）
- Proposal 四件套：proposal.md、design.md、spec.md、tasks.md
- Approved Explore：explore.md（经 031 revise → 032 approved）

## Allowed work

- 创建 `docs/bootstrap-reference.md`
- 创建 `docs/development-roadmap.md`
- 创建 `AGENTS.md`
- 创建 `.codex/skills/flowkit-git-workflow/SKILL.md`
- 创建 `openspec/changes/bootstrap-and-roadmap/verification.md`
- 记录 Apply Run

## Prohibited work

- 不修改 A1、B1、C1 已 Checkpoint 的冻结文档和 capability spec
- 不修改 `docs/delivery-lifecycle.md`（B1 冻结文档）
- 不实现 Runner、CLI 或生产代码
- 不运行 Full Test
- 不创建 review-apply Run
- 不自动 Git Commit

## Required output

- 四份正式文档与 A1/B1/C1 冻结事实一致
- verification.md 记录适用检查项和一致性确认
- 本 Run 的 `result.json` 记录执行状态和下一 Action 建议
- 下一 Action 为 `review-apply`
