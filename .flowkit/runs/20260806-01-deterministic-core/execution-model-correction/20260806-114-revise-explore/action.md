# Action: revise-explore

- Run: 20260806-114-revise-explore
- Delivery: 20260806-01-deterministic-core
- Change: Q1 (execution-model-correction)
- Source Review: 20260806-113-review-explore (verdict: changes-requested)
- Role: author

## Scope

最小安全修复 113-review-explore 的 1 个 blocking finding（Q1-RE-004 重开：lifecycle inversion）。只修改 `openspec/changes/execution-model-correction/explore.md`，不修改生产代码、测试、冻结文档或 terminal Runs。

## Blocking Finding Addressed

- **Q1-RE-004**（重开）：verificationSummaryRef eligibility is ordered before the Verification it requires。112 把 apply/revise-apply 设为 verification-eligible，但正式 lifecycle 是 apply/revise-apply → Change Verification → review-apply（verification-model.md:63-73）。Change Verification 在 apply/revise-apply **之后**执行，所以 apply 的 preflight 时 verification.md 还不存在 = deadlock。Archive 也不 stable（relocates Change artifacts）。

## Fix (minimal)

按 reviewer requiredResolution，将 eligibility 收窄到 lifecycle 中 verification.md 已存在且路径稳定的点：

1. **eligibility 从 `{apply, revise-apply, review-apply, archive}` 改为 `{review-apply only}`**：
   - review-apply 在 Change Verification 之后执行，verification.md 已存在 → eligible
   - apply/revise-apply：Change Verification 在其后执行，preflight 时 verification.md 不存在 → non-eligible（deadlock 避免）
   - archive：relocates Change artifacts to archive path，openspec/changes/<change-id>/verification.md 路径不稳定 → non-eligible

2. **覆盖 reviewer 要求的全部 case**：
   - first apply before verification → non-eligible → absent
   - revised apply before re-verification → non-eligible → absent
   - review-apply with passed/not-applicable verification → eligible → exists → include
   - archive relocation → non-eligible → absent

3. 更新 inclusion lifecycle block、per-category derivation、Section 4.3 preflight、Section 5 tests、Section 7 acceptance、Section 8 cross-reference matrix。

## Preflight

按 AGENTS.md revise 契约产物 preflight（4 步 + 代码层验证）执行，记录于 result.json。

## Commit Policy

No commit, checkpoint, or Full Test authorized or performed. No self-review.
