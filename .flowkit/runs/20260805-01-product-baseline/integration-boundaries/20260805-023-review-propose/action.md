# Action

- Delivery: `20260805-01-product-baseline`
- Change key: `C1`
- Change ID: `integration-boundaries`
- Action: `review-propose`
- Role: `reviewer`

## Goal

独立复核 C1 `20260805-022-propose` 的 Proposal、Design、Spec 和 Tasks，判断是否满足进入 Apply 的 review-propose 条件。

## Review range

- Base ref: `22045603bb145bfb48d5075778b673a61d3d8786`
- Head ref: `3533fa209c9d744a07decc82d7d7bc86c2ac8113`

## Allowed work

- 读取固定范围、approved Explore、正式 Proposal bundle 和 source Propose Run
- 运行适用的只读验证
- 只写入本 Review Run

## Prohibited work

- 不修改 C1 正式 Proposal bundle、先前 Runs 或 Delivery 状态
- 不执行 Full Test、Apply、Archive 或生产实现
- 不提交或推送

## Required output

记录 Findings、复核验证、Verdict 和唯一推荐的下一 Action。
