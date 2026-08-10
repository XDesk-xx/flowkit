# Action: archive

- Run: `20260806-168-archive`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q2 orchestration-authority-boundary-correction`
- Role: Author

## Goal

在 167 review-apply 已批准且 Owner 当前明确执行 archive 的前提下，调用 OpenSpec archive。OpenSpec 负责 archive operation、relocation 与 spec sync；只有 OpenSpec archive 成功后，Flowkit 才将 Q2 orchestration state 记为 completed/closed。

## Constraints

- 只执行 Q2 Archive，不修改已审 production code/tests。
- 不在 Archive 后重新扫描 OpenSpec 归档路径证明其内部结果。
- Checkpoint 不属于本 Run；本 Run 不 commit/push。
- 不运行 Delivery Full Test。
