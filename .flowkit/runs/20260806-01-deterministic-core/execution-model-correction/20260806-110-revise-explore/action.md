# Action: revise-explore

- Run: 20260806-110-revise-explore
- Delivery: 20260806-01-deterministic-core
- Change: Q1 (execution-model-correction)
- Source Review: 20260806-109-review-explore (verdict: changes-requested)
- Role: author

## Scope

最小安全修复 109-review-explore 的 1 个 blocking finding（Q1-RE-001 重开）。只修改 `openspec/changes/execution-model-correction/explore.md`，不修改生产代码、测试、冻结文档或 terminal Runs。

## Blocking Finding Addressed

- **Q1-RE-001**（重开）：Non-Run artifact provenance still leaves kind and produced-artifact roots caller-defined。108 的 `buildArtifactResultRef` 声明 kind 由 caller 指定，allowed-kind 表给 produced-artifact 只说"path root 由 Action 定义"，per-category flow 接受 caller 的 artifactPath/verificationPath descriptor。既无 Core-owned field→kind 映射，也无 executable Action→path-root 规则。

## Fix (minimal)

按 reviewer requiredResolution，使 category selection Core-owned：

1. `buildArtifactResultRef` kind 改为 Core 内部 validated enum，由 result field 决定（producedResultRefs→produced-artifact、verificationSummaryRef→verification-summary），caller 不选择。
2. 定义 Core-owned field→kind→path mapping：
   - verificationSummaryRef → kind=verification-summary，path 固定为 `openspec/changes/<active-change-id>/verification.md`（Core 从 active change id 派生，caller 不提供 path）。
   - producedResultRefs → kind=produced-artifact，path 由 Core-owned Action+tag→path mapping 派生（caller 只提供 tag，不提供 path、不选择 kind）。
3. 定义 executable produced-artifact tag→path mapping（per Action）：explore/revise-explore→'explore'；propose/revise-propose→'proposal'/'design'/'specs'/'tasks'；apply/revise-apply/review-*/archive→无 producedResultRefs。
4. Reject：tag 不在 Action permitted set、traversal、绝对路径、result.json target、kind/field mismatch。
5. 同一 resolver + validation 用于 createRun / writeRunResult preflight / Reader。C1 delta 收紧 `validateResultRefProjection`：kind enum + field→kind binding + path root per kind。
6. 测试覆盖 valid targets + 每个 rejected mismatched kind/path case。

## Preflight

按 AGENTS.md revise 契约产物 preflight（4 步 + 代码层验证）执行，记录于 result.json。

## Commit Policy

No commit, checkpoint, or Full Test authorized or performed. No self-review.
