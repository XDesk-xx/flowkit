# Action

- Delivery: `20260805-01-product-baseline`
- Change key: `E1`
- Change ID: `baseline-finalization-corrections`
- Action: `archive`
- Role: `author`

## Goal

将 060-review-apply approved 的 E1 Change 归档：同步 delta spec 到主 spec，移动 Change 到 archive，更新 Manifest 投影。

## owner authorization

- 授权类型：`archive`
- 授权来源：owner 指令 "archive"
- 授权范围：E1 baseline-finalization-corrections Change 的 archive 阶段

## Inputs

- Source Review Run: `20260806-060-review-apply`（verdict: approved, nextAction: archive）
- E1 Change 全部 artifacts（explore, proposal, design, specs, tasks, verification）

## Allowed work

- 执行 `openspec archive baseline-finalization-corrections -y`（同步 delta spec + 移动到 archive）
- 更新 Manifest：E1 state → completed, fullTestStatus → awaiting-user-decision
- 验证 `openspec validate --specs --strict`
- 记录 Archive Run

## Prohibited work

- 不修改任何既有 Requirement/Scenario（delta sync 由 openspec archive 自动处理）
- 不运行 Full Test
- 不创建 Change Checkpoint Commit（由 owner 单独授权）
- 不自动 Git Commit

## Required output

- delta spec 同步到 `openspec/specs/flowkit-bootstrap-and-roadmap/spec.md`
- Change 移动到 `openspec/changes/archive/2026-08-06-baseline-finalization-corrections/`
- Manifest 更新（E1 completed, fullTestStatus awaiting-user-decision）
- 本 Run 的 result.json 记录执行状态和下一 Action 建议
- 下一 Action 为 `checkpoint`（Change Checkpoint Commit，需 owner 授权）
