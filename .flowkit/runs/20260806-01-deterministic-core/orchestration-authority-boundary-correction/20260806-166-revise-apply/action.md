# Action: revise-apply

- Run: `20260806-166-revise-apply`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q2 orchestration-authority-boundary-correction`
- Role: Author
- Source review: `20260806-165-review-apply` (`changes-requested`)

## Goal

仅关闭 165 的 Q2-RA-001：消费本次执行上下文中由 Owner 独立提供的正式 lifecycle decision，更新 Owner decision provenance 与因此必要的文档一致性。

## Owner decision input

本 Run 的 Owner decision authority 来自 package 之外、本次执行上下文中 Owner 的直接输入。Author artifacts 只记录该输入的 provenance，不创建、替代或持久化第二套 Owner decision authority。

Owner 明确确认的 lifecycle 模型：

- OpenSpec archive operation 成功后，Flowkit 将该 Change 记为 `completed / closed`；
- Change Checkpoint 是其后的 Git persistence / synchronization / recovery boundary；
- Checkpoint 不参与 Change completion 的判定；
- OpenSpec 负责 archive operation、relocation 和 spec sync；
- Flowkit 负责消费 archive 结果并更新自身 orchestration state；
- Git 负责 Checkpoint 持久化边界。

## Constraints

- 不修改无关 production code 或 tests。
- 不新增 owner-decision 文件、schema、ResultRef、Run field 或 persistence。
- 不执行 Archive、Checkpoint、Delivery Full Test、Commit 或 Push。
- 仅同步与该 Owner decision provenance 直接相关的 Proposal/Design/Tasks/Verification 文本。
