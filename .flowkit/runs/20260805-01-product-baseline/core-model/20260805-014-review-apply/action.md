# Action

- Delivery: `20260805-01-product-baseline`
- Change key: `B1`
- Change ID: `core-model`
- Action: `review-apply`
- Role: `reviewer`

## Goal

独立复核 B1 `20260805-013-revise-apply` 对先前 review-apply Findings 的修订结果，并判断是否可以进入 Archive。

## Review range

- Base ref: `f7008be68e9042ec3ab29534e377354c66a7f14c`
- Head ref: `515dd185d6eefeb300249af53642bc915e565e00`

## Allowed work

- 读取固定范围、正式 B1 artifacts 和 source Revise Run
- 运行适用的只读验证
- 只写入本 Review Run

## Prohibited work

- 不修改 B1 正式产物、先前 Runs 或 Delivery 状态
- 不执行 Full Test、Archive 或生产实现
- 不修复 Findings

## Required output

记录 Findings、复核验证、Verdict 和唯一推荐的下一 Action。