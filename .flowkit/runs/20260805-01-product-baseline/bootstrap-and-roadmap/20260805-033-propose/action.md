# Action

- Delivery: `20260805-01-product-baseline`
- Change key: `D1`
- Change ID: `bootstrap-and-roadmap`
- Action: `propose`
- Role: `author`

## Goal

将 032-review-explore approved 的 D1 Explore 结论转化为正式 Proposal 四件套（proposal.md、design.md、spec.md、tasks.md），定义 Bootstrap 操作规则、Git 正式边界模型、Run 操作规则、续接切点操作性定义、owner 授权边界、四份正式输出文档结构和后续开发路线，新增 `flowkit-bootstrap-and-roadmap` capability spec。

## Inputs

- Source Explore Run: `20260805-029-explore`（经 031 revise → 032 approved）
- Source Review Run: `20260805-032-review-explore`（verdict: approved）
- A1 已冻结的产品定位
- B1 已冻结的核心模型
- C1 已冻结的集成边界
- 参考材料（`ref/d1-bootstrap-and-roadmap-reference.md`）

## Allowed work

- 创建 `openspec/changes/bootstrap-and-roadmap/proposal.md`
- 创建 `openspec/changes/bootstrap-and-roadmap/design.md`
- 创建 `openspec/changes/bootstrap-and-roadmap/specs/flowkit-bootstrap-and-roadmap/spec.md`
- 创建 `openspec/changes/bootstrap-and-roadmap/tasks.md`
- 记录 Propose Run

## Prohibited work

- 不重新打开或修改 A1、B1、C1 已 Checkpoint 的冻结内容
- 不创建正式输出文档（`docs/bootstrap-reference.md` 等）—— 属于 Apply 阶段
- 不实现 Runner、CLI 或生产代码
- 不固定信息交换媒介
- 不运行 Full Test
- 不创建 review-propose Run
- 不自动 Git Commit

## Required output

- Proposal 四件套完整记录 D1 的正式契约
- 本 Run 的 `result.json` 记录执行状态和下一 Action 建议
- 下一 Action 为 `review-propose`
