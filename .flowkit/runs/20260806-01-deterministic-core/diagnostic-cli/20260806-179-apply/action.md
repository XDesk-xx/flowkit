# Action: apply

- Run: `20260806-179-apply`
- Delivery: `20260806-01-deterministic-core`
- Change: `E1 diagnostic-cli`
- Role: author
- Execution Context: detached
- Base identity: `5fe8a0b096564052e41418e726962b5a35b9d423`
- Owner contract decision: explicit（178 approved 后 Owner 撤销“Tasks completion projection 后置”决定，并授权 E1 最小补齐 Archive Tasks completion fact + Policy gate）
- Original approved Proposal handoff: `20260806-174-review-propose`

## 目标

在不扩大 E1 scope 的前提下，执行 Owner 新 contract：只从 current active Change canonical `tasks.md` 投影最小 required Tasks completion fact，并接通既有 Archive Tasks gate。

## 本轮允许

- 最小 reconcile `proposal.md / design.md / specs/** / tasks.md / verification.md` 中与旧 defer decision 冲突的 contract；
- 修改 `FormalFactSnapshot` / `FormalFactReader` 与既有 Policy Archive Tasks gate 所需代码；
- 增加对应 focused / affected tests；
- `tasks-incomplete` 仅作为事实可用但 required task 未完成的 blocked diagnosis。

## 禁止

- 不建立 Task Registry、Task 状态数据库、Task execution engine 或第二套 OpenSpec authority；
- 不增加新的 Task lifecycle state / Action；
- 不执行 Archive、Checkpoint、Commit、Push 或 Delivery Full Test；
- 不自行批准当前 candidate。

## 说明

178 verdict 为 `approved`，因此现有 closed Run contract 不允许把本轮伪装成 `revise-apply`（revise-* 只能消费 `changes-requested`）。本 Run 是 Owner contract reset 后的新 Apply generation；完成后必须由新的 `review-apply` 重新审查。
