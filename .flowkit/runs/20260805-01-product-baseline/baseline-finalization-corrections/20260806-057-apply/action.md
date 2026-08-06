# Action

- Delivery: `20260805-01-product-baseline`
- Change key: `E1`
- Change ID: `baseline-finalization-corrections`
- Action: `apply`
- Role: `author`

## Goal

根据 056-review-propose approved 的 E1 Proposal，实施 25 个 tasks：修正 3 个 capability spec 的 TBD Purpose、修正 2 处错误 CJK 字符、确认 Manifest 投影、记录 A1 历史例外、确认最小 delta spec、创建 verification.md 并执行全部验证检查。

## owner authorization

- 授权类型：`apply`
- 授权来源：owner 指令 "apply"
- 授权范围：E1 baseline-finalization-corrections Change 的 apply 阶段

## Inputs

- Source Review Run: `20260806-056-review-propose`（verdict: approved）
- Proposal 四件套：proposal.md、design.md、specs/flowkit-bootstrap-and-roadmap/spec.md、tasks.md
- Approved Explore：explore.md（经 042–055 多轮 explore/revise → 056 approved）

## Allowed work

- 替换 `openspec/specs/flowkit-core-model/spec.md` 的 TBD Purpose
- 替换 `openspec/specs/flowkit-integration-boundaries/spec.md` 的 TBD Purpose
- 替换 `openspec/specs/flowkit-bootstrap-and-roadmap/spec.md` 的 TBD Purpose
- 修正 `docs/delivery-lifecycle.md` L74 错误 CJK 字符（`兞他` → `其他`）
- 修正 `docs/verification-model.md` L127 错误 CJK 字符（`第二奔` → `第二套`）
- 确认 Manifest 投影（E1 state、fullTestStatus、outputs）
- 确认 delta spec（specs/flowkit-bootstrap-and-roadmap/spec.md 已在 propose 阶段创建）
- 创建 `openspec/changes/baseline-finalization-corrections/verification.md`
- 执行验证检查（OpenSpec strict、Purpose 扫描、CJK 检查、U+FFFD、whitespace、git diff --check）
- 记录 Apply Run

## Prohibited work

- 不修改任何既有 Requirement/Scenario（唯一例外：owner 已授权的 flowkit-bootstrap-and-roadmap ADDED Requirement 及其 3 个 Scenario）
- 不重新打开 A1–D1 的 archived Change 历史
- 不修改产品定位、Action Catalog、Review/Revise 语义
- 不新增 Runner、CLI、状态持久化实现
- 不运行 Full Test（Delivery 级，需 owner 授权）
- 不创建 review-apply Run
- 不自动 Git Commit

## Required output

- 3 个 capability spec 的 Purpose 替换为正式文本
- 2 处错误 CJK 字符修正
- verification.md 记录适用检查项、A1 历史例外和 A1–D1 一致性确认
- 本 Run 的 `result.json` 记录执行状态和下一 Action 建议
- 下一 Action 为 `review-apply`
