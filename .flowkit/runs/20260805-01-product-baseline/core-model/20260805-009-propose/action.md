# Action

- Delivery: `20260805-01-product-baseline`
- Change key: `B1`
- Change ID: `core-model`
- Action: `propose`
- Role: `author`

## Goal

将 approved B1 Explore 转化为完整、可验证并可进入 `review-propose` 的 Proposal、Design、Capability Spec 和 Tasks。

## Inputs

- `docs/product-positioning.md`
- `openspec/specs/flowkit-product-positioning/spec.md`
- `openspec/delivery-groups/20260805-01-product-baseline.yaml`
- `openspec/changes/core-model/explore.md`
- `.flowkit/runs/20260805-01-product-baseline/core-model/20260805-007-explore/result.json`
- `.flowkit/runs/20260805-01-product-baseline/core-model/20260805-008-review-explore/result.json`
- owner 对进入 Propose 及提交普通 Commit 的授权

## Required decisions

- Delivery、Change、Action、Run 的正式核心模型
- 最小状态、取消规则和 owner 授权边界
- Action Catalog 及 `revise-apply → fix-review-findings` 命名替换
- Review 必经、Revision/Fix 条件出现和多轮闭环
- owner 承担 reviewer 角色时仍保留正式 Review
- Policy 唯一下一 Action和统一 `review` 入口
- Run 创建、路径和编号
- Change Verification 与 Full Test 状态权威
- checkout 恢复和抽象 Skill 方法边界
- NB-001、NB-002、NB-003 的处理

## Allowed work

- 创建 `proposal.md`
- 创建 `design.md`
- 创建 `specs/flowkit-core-model/spec.md`
- 创建 `tasks.md`
- 创建并完成本次 `009-propose` Run

## Prohibited work

- 不执行 Apply
- 不创建三份正式 docs
- 不修改 A1 产品定位
- 不定义 C1 的具体 Schema、Adapter、Action Package 或 Skill 标识
- 不定义 D1 的具体 Git 命令和互动步骤
- 不实现 Runner、CLI 或生产代码
- 不引入 Registry、Plugin、Evidence 或 Receipt
- 不运行 Full Test
- 不预建空的 `review-propose` Run

## Required output

- 完整 `proposal.md`
- 完整 `design.md`
- 完整 capability delta
- 完整 `tasks.md`
- Reviewer Findings 的明确处理
- 下一步为 `review-propose`
