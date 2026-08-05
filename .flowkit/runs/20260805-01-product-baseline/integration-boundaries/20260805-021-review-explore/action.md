# Action

- Delivery: `20260805-01-product-baseline`
- Change key: `C1`
- Change ID: `integration-boundaries`
- Action: `review-explore`
- Role: `reviewer`

## Goal

独立复核 C1 `20260805-020-revise-explore` 对 `C1-RE-001` 的修订结果，判断当前 Explore 是否满足进入 Propose 的 review-explore 条件。

## Review range

- Base ref: `8de9fbd7c49d89570dcee94cbe52a74f88f64a22`
- Head ref: `0585c056e18a529cd2b61381d24d4af1760cb6a1`

## Allowed work

- 读取固定范围、正式 C1 Explore artifact 和 source Revise Run
- 运行适用的只读验证
- 只写入本 Review Run

## Prohibited work

- 不修改 C1 正式产物、先前 Runs 或 Delivery 状态
- 不执行 Full Test、Propose、Apply、Archive 或生产实现
- 不提交或推送

## Required output

记录 Findings、复核验证、Verdict 和唯一推荐的下一 Action。
