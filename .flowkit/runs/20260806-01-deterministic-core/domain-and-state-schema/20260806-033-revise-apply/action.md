# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `B1`
- Change ID: `domain-and-state-schema`
- Action: `revise-apply`
- Role: `author`

## Goal

依据 `20260806-032-review-apply` 的 3 个 Blocking Findings 修订 B1 Apply 产物：

- **B1-RA-001**：创建 `verification.md` 正式 Change Verification 记录（result.json 不能替代）；
- **B1-RA-002**：修复 `VerificationCheck.applicability` 从 `'always'|'conditional'` 改为 approved Explore 定义的 `'applicable'|'not-applicable'`；
- **B1-RA-003**：修复领域类型字段级契约——Run/ActionDefinition/ActionResult/ContinuationContext 的 action 字段从 `string` 改为 `ChangeAction | DeliveryAction`；Run.inputRef 从 `string` 改为 `ResultRef`；ChangeSummary 补充 `dependsOn` 和 `outputs` 字段。

## Source review

- Review Run: `20260806-032-review-apply`
- Verdict: `changes-requested`
- Blocking Findings: 3（B1-RA-001/002/003）
- nextActionRecommendation: `revise-apply`

## Allowed work

- 修改 `src/domain/types.ts`、`src/domain/schema-validator.ts`
- 修改 `tests/unit/domain/types.test.ts`、`tests/unit/domain/schema-validator.test.ts`
- 创建 `openspec/changes/domain-and-state-schema/verification.md`
- 创建本 revise-apply Run

## Prohibited work

- 不修改冻结 specs/docs
- 不修改 Delivery Manifest
- 不修改 A1 已有 tracked 文件
- 不修改 013-032 terminal Runs
- 不执行 Archive 或 Full Test
- 不创建 Git Commit

## Required output

- 修复后的源码和测试
- `verification.md` 正式 Change Verification 记录
- 本 Run 的 `result.json`
- 下一 Action 为 `review-apply`
