# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `A1`
- Change ID: `runtime-foundation`
- Action: `archive`
- Role: `author`
- Owner authorization: explicit（用户确认 archive）

## Goal

将 011-review-apply approved 的 A1 runtime-foundation 归档：应用 spec deltas 到冻结 specs，移动 change 到 archive，更新 manifest A1 状态为 completed。

## Source review

- Review Run: `20260806-011-review-apply`
- Verdict: `approved`
- Review Result SHA-256: `ef82b1c296dc11ad6c203611919ee93c60ec45a2b22259d9d6554be39ff67259`

## Allowed work

- 执行 `openspec archive runtime-foundation`
- 修改 Delivery Manifest（A1: active → completed）
- 创建本 archive Run

## Prohibited work

- 不修改冻结 specs（由 openspec archive 自动应用 deltas）
- 不修改 archived change artifacts
- 不修改 001-011 terminal Runs
- 不执行 Change Checkpoint 或 Full Test
- 不提交或推送

## Required output

- Change moved to `openspec/changes/archive/2026-08-06-runtime-foundation/`
- Frozen spec created at `openspec/specs/flowkit-runtime-foundation/spec.md`（11 ADDED Requirements）
- Manifest A1 state: `completed`
- 本 Run 的 `result.json`
- 下一 Action 为 `change-checkpoint`（需 owner 授权 Git Commit）
