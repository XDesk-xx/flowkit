# Action

- Delivery: `20260805-01-product-baseline`
- Change key: `B1`
- Change ID: `core-model`
- Action: `apply`
- Role: `author`

## Goal

根据已批准的 B1 Proposal、Design、Capability Spec 和 Tasks，创建核心模型、生命周期和 Verification 三份正式文档，完成 Change Verification，并使结果可进入 `review-apply`。

## Inputs

- `docs/product-positioning.md`
- `openspec/specs/flowkit-product-positioning/spec.md`
- `openspec/delivery-groups/20260805-01-product-baseline.yaml`
- `openspec/changes/core-model/explore.md`
- `openspec/changes/core-model/proposal.md`
- `openspec/changes/core-model/design.md`
- `openspec/changes/core-model/specs/flowkit-core-model/spec.md`
- `openspec/changes/core-model/tasks.md`
- `.flowkit/runs/20260805-01-product-baseline/core-model/20260805-010-review-propose/result.json`
- owner 对 B1 Apply 的明确授权

## Review-Propose Findings

- NB-001：Apply 开始时优先创建 `verification.md`，声明适用检查及状态
- NB-002：在 Design 实施计划前明确 `review-propose approved + owner Apply authorization` 前置门

## Allowed work

- 创建 `docs/core-model.md`
- 创建 `docs/delivery-lifecycle.md`
- 创建 `docs/verification-model.md`
- 创建并完成 `openspec/changes/core-model/verification.md`
- 更新 `design.md` 的 Apply 前置门
- 完成 `tasks.md`
- 执行适用的 Change Verification
- 创建并完成本次 Apply Run

## Prohibited work

- 不修改 A1 产品定位
- 不实现 Runner、CLI 或生产代码
- 不定义 C1 的 Action Package、Adapter、Schema 或具体 Skill 标识
- 不定义 D1 的具体 Commit、Push、Handoff 或 Checkpoint 命令
- 不引入 Registry、Plugin、Evidence 或 Receipt
- 不运行 Full Test
- 不预建空的 `review-apply` Run
- 不 Commit 或 Push，直到 owner 另行授权

## Required output

- 三份正式 B1 文档
- 完整 `verification.md`
- 完成后的 `tasks.md`
- Review-Propose Findings 的处理结果
- 下一 Action 为 `review-apply`
