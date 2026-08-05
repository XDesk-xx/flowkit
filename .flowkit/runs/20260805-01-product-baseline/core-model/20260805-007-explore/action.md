# Action

- Delivery: `20260805-01-product-baseline`
- Change key: `B1`
- Change ID: `core-model`
- Action: `explore`
- Role: `author`

## Goal

在 A1 已完成的产品定位基础上，探索并形成 Flowkit 的最小核心模型、Change 生命周期、Action 合法性、Verification 边界、Run 归属和 checkout 恢复规则。

## Inputs

- `openspec/specs/flowkit-product-positioning/spec.md`
- `docs/product-positioning.md`
- `openspec/delivery-groups/20260805-01-product-baseline.yaml`
- 已冻结的 Bootstrap 流程结论
- owner 对 B1 启动和 Explore 的授权

## Required decisions

- Delivery、Change、Action 的最小状态模型
- Review、Revision、Verification 和 Checkpoint 是否形成额外 Phase
- 唯一合法下一 Action 如何确定
- Apply、Verification、Review 和 Findings 修复闭环
- Full Test 的 Delivery 级授权边界
- Change 级 Run 的正式目录
- Delivery 级 Run 的候选目录
- checkout 后确定性恢复所需事实

## Allowed work

- 创建 `openspec/changes/core-model/explore.md`
- 记录本次 Explore Run
- 提出需要 review-explore 确认的候选结论

## Prohibited work

- 不执行 Propose
- 不创建 B1 Proposal、Design、Specs 或 Tasks
- 不修改 A1 已冻结的产品定位
- 不定义 C1 的具体工具协议
- 不定义 D1 的具体 Git 命令和互动时机
- 不运行 Full Test

## Required output

- 完整、可审查的 B1 Explore 文档
- 明确的建议结论和 Review 重点
- 下一步为 `review-explore`
