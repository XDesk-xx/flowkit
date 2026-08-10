# Action: revise-explore

- Run: 20260806-112-revise-explore
- Delivery: 20260806-01-deterministic-core
- Change: Q1 (execution-model-correction)
- Source Review: 20260806-111-review-explore (verdict: changes-requested)
- Role: author

## Scope

最小安全修复 111-review-explore 的 1 个 blocking finding（Q1-RE-004）。只修改 `openspec/changes/execution-model-correction/explore.md`，不修改生产代码、测试、冻结文档或 terminal Runs。

## Blocking Finding Addressed

- **Q1-RE-004**：verificationSummaryRef has neither a Run-stable target nor an executable inclusion rule。110 用 `<active-change-id>`（mutable）而非 Run 的 immutable `context.changeId`——Q1 完成后 E1 变 active，历史 Q1 Run 的 verificationSummaryRef 会指向 E1 的 verification.md。且 `descriptor: 无` 但未定义何时 Core 应 attempt、何时 absent——unconditional resolver 会在 Explore/Propose（verification.md 不存在）时失败，conditional omission 又无法 record。

## Fix (minimal)

按 reviewer requiredResolution：

1. **Run-stable target**：所有 `<active-change-id>` → `<context.changeId>`（Run 自己的 immutable context，createRun 时持久化）。create/preflight/Reader 同一 context-derived resolver。历史 Q1 Run 在 E1 active 后仍指向 Q1 的 verification.md。
2. **Inclusion lifecycle（Action-owned，无 caller descriptor）**：
   - verification-eligible Actions（apply, revise-apply, review-apply, archive）：Core attempts resolve → exists → include；absent/unreadable → RESULT_REF_TARGET_MISSING, Run 保持 pending（requested-but-missing）。
   - non-eligible Actions（explore, propose, revise-explore, revise-propose, review-explore, review-propose）：verificationSummaryRef absent（Core 不 attempt）。
3. **Reader historical read**：用 Run 的 context.changeId 解析 path，不依赖当前 active Change。preflight 重新读取 → 重算 SHA-256 → 比较（replacement detection）。
4. 覆盖 reviewer 要求的全部 case：Explore/Propose before verification.md exists（non-eligible → absent）、eligible Run with valid summary（exists → include）、requested-but-missing（eligible + absent → pending）、historical Q1 read after another Change active（context.changeId → correct target）、replacement detection（preflight fingerprint mismatch）。

## Preflight

按 AGENTS.md revise 契约产物 preflight（4 步 + 代码层验证）执行，记录于 result.json。

## Commit Policy

No commit, checkpoint, or Full Test authorized or performed. No self-review.
