# Action

- Delivery: `20260805-01-product-baseline`
- Change key: `B1`
- Change ID: `core-model`
- Action: `revise-apply`
- Role: `author`
- Goal: `fix-review-findings`

## Goal

处理 `20260805-012-review-apply` 的全部 Findings，使 B1 核心模型恢复统一的 review/revise 调度，并在 Full Test 失败后保持 owner 的范围授权权威。

## Inputs

- Remote base: `f7008be68e9042ec3ab29534e377354c66a7f14c`
- Source Review Run: `20260805-012-review-apply`
- Verdict: `changes-requested`
- Blocking Findings: `B-001`, `B-002`
- Non-blocking Findings: `N-001`

## Required changes

- Full Test failed 后停在 owner 决策边界
- corrective Change 只能在 owner 明确授权后创建
- 正式 Action 恢复为 `revise-apply`
- 新增非正式统一入口 `revise`
- `fix-review-findings` 下沉为 `revise-apply` goal
- revise-apply 仅处理当前 Findings，不扩张范围
- 修订后重新执行适用 Change Verification
- 修复正式文档替换字符

## Prohibited work

- 不修改 A1 产品定位
- 不超出 B1 Findings 范围
- 不定义 C1 的具体 Action Package 字段或 Skill 协议
- 不定义 D1 的具体 Git/交互命令
- 不实现 Runner、CLI 或生产代码
- 不运行 Full Test
- 不创建 `014-review-apply` Run
- 不 Commit 或 Push，直到 owner 确认

## Required output

- B1 Proposal、Design、Capability Spec、Tasks 与三份正式文档保持一致
- `verification.md` 记录本轮修订验证
- 内容修订完成后重新执行全部适用 Change Verification
- 仅在验证全部 passed/not-applicable 后将本 Run 标记 completed，并使下一 Action 为 `review-apply`
- 验证环境缺失时保持本 Run pending，并记录明确 blocked diagnosis
