# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `B1`
- Change ID: `domain-and-state-schema`
- Action: `archive`
- Role: `author`
- Owner authorization: explicit（用户确认 archive）

## Goal

将 034-review-apply approved 的 B1 domain-and-state-schema 归档：应用 spec deltas 到冻结 specs，移动 change 到 archive，更新 manifest B1 状态为 completed。

## Source review

- Review Run: `20260806-034-review-apply`
- Verdict: `approved`
- Review Result SHA-256: `0ca8e28172a257c5f4941ea7f2ba6f8cebea0da0a4602b7515969cebab325eea`

## Allowed work

- 执行 `openspec archive domain-and-state-schema`
- 修改 Delivery Manifest（B1: active → completed）
- 补全冻结 spec 的 Purpose 段（移除 TBD 占位符，符合项目硬约束）
- 创建本 archive Run

## Prohibited work

- 不修改冻结 specs 的 Requirements（由 openspec archive 自动应用 deltas）
- 不修改 archived change artifacts
- 不修改 013-034 terminal Runs
- 不执行 Change Checkpoint 或 Full Test
- 不提交或推送

## Required output

- Change moved to `openspec/changes/archive/2026-08-06-domain-and-state-schema/`
- Frozen spec created at `openspec/specs/flowkit-domain-and-state-schema/spec.md`（ADDED Requirements）
- Manifest B1 state: `completed`
- 本 Run 的 `result.json`
- 下一 Action 为 `change-checkpoint`（需 owner 授权 Git Commit）
