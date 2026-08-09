# Action: review-apply

- Run: `20260806-155-review-apply`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q2 orchestration-authority-boundary-correction`
- Role: Reviewer
- Review target: `20260806-154-apply`

## Goal

基于 Owner 对重新 Review 154 的明确授权，独立审查 154 Apply 当前 candidate。旧 155 reviewer candidate 已 abandoned，本 Run 不继承其 verdict。重点检查 154 引入的 active-only current-fact projection 是否与现有 canonical Archive / Checkpoint / resume 契约一致。

## Constraints

- Reviewer 只指出问题、证据、影响与验收结果，不替 Author 选择状态模型或实现方案。
- 不修改 Author artifacts、production code、tests、Manifest 或 OpenSpec artifacts。
- 只允许创建本 Reviewer-owned Run。
- 不授权 Archive、Checkpoint 或 Delivery Full Test。
- 不创建 Commit / Push。
