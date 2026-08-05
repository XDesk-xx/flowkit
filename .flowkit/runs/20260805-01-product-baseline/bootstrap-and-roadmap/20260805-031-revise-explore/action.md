# Action

- Delivery: `20260805-01-product-baseline`
- Change key: `D1`
- Change ID: `bootstrap-and-roadmap`
- Action: `revise-explore`
- Role: `author`

## Goal

处理 `20260805-030-review-explore` 的 D1-RE-001 Blocking Finding，并修正 owner 先前确认的 §7.4 "Change Start Commit" 伪边界错误。保留 D1 已确认的全部探索结论、媒介中立、C1/D1 分界和 A1/B1/C1 冻结范围。

## Inputs

- Source Review Run: `20260805-030-review-explore`
- Verdict: `changes-requested`
- Blocking Findings: `D1-RE-001`
- Owner-confirmed correction: §7.4 "Change Start Commit" 不是正式 Git 边界（reference §8.1 仅冻结 3 种正式边界：Delivery Start、Change Checkpoint、Delivery Final）

## Required changes

- §5.1：补"本次目标改变"为新 Run 边界，明确只有正式 Action、执行角色和本次目标三者均未改变时才复用同一 Run
- §7：移除 §7.4 "Change Start Commit" 伪边界；在 §7.1 补注 Change 激活不属于正式 Git 边界；重编号 §7.5–7.10 → §7.4–7.9，对齐 reference §8 结构

## Prohibited work

- 不修改 D1 的探索结论、媒介中立、C1/D1 分界
- 不重新打开或修改 A1、B1、C1
- 不创建 Proposal、Design、Spec 或 Tasks
- 不运行 Full Test
- 不创建 review-explore Run

## Required output

- `explore.md` 通过 `git diff --check`、U+FFFD 扫描
- 本 Run 的 `result.json` 记录修正结果
- 下一 Action 为 `review-explore`
