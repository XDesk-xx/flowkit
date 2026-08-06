# Action

- Delivery: `20260805-01-product-baseline`
- Change key: `E1`
- Change ID: `baseline-finalization-corrections`
- Action: `explore`
- Role: `author`

## Goal

识别 Delivery Final Audit 中发现的基线收口问题，确认 corrective Change 的必要性，定义 E1 范围边界，为 Proposal 阶段准备关键问题。

## Activation

author 启动 explore 时激活 E1：Manifest 中 E1 state `planned → active`。

## Inputs

- Finalization Reference: `ref/product-baseline-finalization-reference.md`
- D1 Checkpoint Commit: `77c4c36`
- A1–D1 已冻结的正式产物
- Delivery Manifest

## Allowed work

- 激活 E1（manifest `planned → active`）
- 创建 `openspec/changes/baseline-finalization-corrections/explore.md`
- 记录 Run

## Prohibited work

- 不修改 A1–D1 的 archived Change 历史
- 不重新打开任何 completed Change
- 不创建正式输出文档（属于 Apply 阶段）
- 不创建 Proposal / Spec / Tasks（属于 Propose 阶段）
- 不运行 Full Test
- 不自动 Git Commit

## Required output

- `explore.md` 包含已验证的问题、corrective Change 理由、E1 范围和关键问题
- 本 Run 的 `result.json`
- 下一 Action 为 `review-explore`
