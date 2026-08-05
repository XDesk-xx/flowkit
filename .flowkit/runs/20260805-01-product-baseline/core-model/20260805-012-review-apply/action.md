# Action

- Delivery: `20260805-01-product-baseline`
- Change key: `B1`
- Change ID: `core-model`
- Action: `review-apply`
- Role: `reviewer`

## Goal

独立审查 B1 Apply 结果，判断其是否满足批准后的核心模型契约、A1 产品定位和 B1 范围边界。

## Review range

- Base ref: `94b17299ebe1d05ed4fd3482e836cd72556061a3`
- Head ref: `82e9d5cabd5e4b51b8a0c1dc12c854f8ff84c53d`

## Allowed work

- 读取正式产物、Apply Run 和固定 Git 范围
- 运行适用的只读验证
- 只写入本 Review Run 的记录

## Prohibited work

- 不修改 B1 正式文档、OpenSpec artifacts、Delivery 状态或 Apply Run
- 不执行 Archive、Full Test 或生产实现
- 不修复 Findings

## Required output

记录 Blocking Findings、Non-blocking Findings、已执行验证、Verdict 和唯一推荐的下一 Action。