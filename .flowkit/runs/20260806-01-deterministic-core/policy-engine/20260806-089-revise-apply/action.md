# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `D1`
- Change ID: `policy-engine`
- Action: `revise-apply`
- Role: `author`
- Owner authorization: not-required

## Goal

修复 088-review-apply 的 P1 finding D1-RA-001：`next()` 在 apply 阶段无 lineage match 分支返回 `action: review-apply` 前未检查 Change Verification 事实，绕过了 `canRun(review-apply)` 强制的 verification gate。在当前 C1 snapshot（无 Verification 事实）下，`next()` 报告 review-apply 为合法 Action，而其自身 `canRun` 契约拒绝它——违反 fail-closed 原则与 spec（spec.md:209-216 review-apply 需 Verification 事实可用且 passed；不可用时 `next` 返回 `blocked: verification-facts-unavailable`）。

修复后 `next()` 与 `canRun(review-apply)` 一致：Verification 事实不可用时返回 `blocked: verification-facts-unavailable`，永不返回 `action: review-apply`。

## Source review

- Review Run: `20260806-088-review-apply`
- Verdict: `changes-requested`
- Review Result SHA-256: `c49495cebbffbd52d8b220e6772534f9d6bda17ef5cc0454e10c18753b3dc27d`
- Finding: `D1-RA-001` (P1) — `next()` bypasses the Verification-facts gate before review-apply

## Root cause

`src/policy/next.ts` `decideApplyStage` 的 `!lineage.match` 分支直接 `return actionResult('review-apply')`，未调用 `isVerificationFactAvailable(snapshot)`。而 `canRun(review-apply)` 经 `preconditions.reviewSPreconditions` 在 apply 阶段加 `verification-facts-unavailable`。两者不一致：`next()` 放行、`canRun` 拒绝。

## Fix

在 `decideApplyStage` 的 `!lineage.match` 分支返回 `action: review-apply` 之前，加 `isVerificationFactAvailable(snapshot)` 门控：不可用 → `blocked: verification-facts-unavailable`；可用 → `action: review-apply`（D1 不可达，前向兼容）。

关键约束：门控**仅加在该分支**，不提升到 revise-apply 分支之前——因为 `canRun(revise-apply)`（`reviseSPreconditions`）不要求 Verification 事实，提升会制造新的不一致（`next` 阻断 revise-apply 而 `canRun` 放行）。

## Allowed work

- 修改 `src/policy/next.ts`（`decideApplyStage` 的 `!lineage.match` 分支加 verification gate）
- 修改 `tests/unit/policy/next.test.ts`（更新断言旧错误行为的两个测试）
- 执行 `npm run typecheck`、`npm run build`、`npm run lint`、`npm test`、`npx openspec validate policy-engine --strict`
- 创建本 revise-apply Run

## Prohibited work

- 不修改 proposal bundle（proposal.md / design.md / spec.md / tasks.md）
- 不修改冻结 specs（B1/C1 archived specs）
- 不修改 B1 结构转换表（`src/domain/states.ts`）
- 不修改 069-088 terminal Runs
- 不修改 `src/policy/preconditions.ts`（canRun 路径已正确，088 确认）
- 不执行 Change Checkpoint 或 Full Test
- 不提交或推送（AGENTS.md rule #6）
- 不扩张 Change 范围
- 不引入新问题（尤其不破坏 next() 与 canRun 在 revise-apply / archive 路径的一致性）

## Required output

- 修复后的 `src/policy/next.ts`
- 更新后的 `tests/unit/policy/next.test.ts`
- `npm run typecheck` / `build` / `lint` / `test` / `openspec validate --strict` 全通过
- 本 Run 的 `result.json`（含 findingsAddressed + consistencyScan，0 contradictions）
- 下一 Action 为 `review-apply`
