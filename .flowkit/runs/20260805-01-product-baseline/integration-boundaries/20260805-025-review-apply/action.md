# Action

- Delivery: `20260805-01-product-baseline`
- Change key: `C1`
- Change ID: `integration-boundaries`
- Action: `review-apply`
- Role: `reviewer`

## Goal

独立复核 C1 `20260805-024-apply` 的正式文档、Verification 和任务完成情况，判断当前 C1 是否满足进入 Archive 的 review-apply 条件。

## Review range

- Base ref: `1a97837549c88cf76db0f998f8eb846b5eb9d896`
- Head ref: `f848384e7aa881b1b387908f192843ecbb76a5e0`

## Allowed work

- 读取固定范围、正式 C1 artifacts 和 source Apply Run
- 运行适用的只读验证
- 只写入本 Review Run

## Prohibited work

- 不修改 C1 正式产物、先前 Runs 或 Delivery 状态
- 不执行 Full Test、Archive 或生产实现
- 不提交或推送

## Required output

记录 Findings、复核验证、Verdict 和唯一推荐的下一 Action。
