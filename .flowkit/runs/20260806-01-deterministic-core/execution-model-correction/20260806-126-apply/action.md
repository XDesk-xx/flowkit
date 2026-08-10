# Action: apply

- Run: `20260806-126-apply`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q1 execution-model-correction`
- Role: author
- Source Review: `20260806-125-review-propose` (`approved`)

## Goal

实现 Q1 execution-model-correction 的全部代码和文档变更：Lean Run closed schema、
Core-owned ResultRef、Review 精确绑定、generation-aware mutable artifact lifecycle、
completion preflight、verificationSummaryRef lifecycle、archive lifecycle、Bootstrap legacy
compatibility、正式文档更新和 verification.md。

## Inputs

- `openspec/changes/execution-model-correction/proposal.md`
- `openspec/changes/execution-model-correction/design.md`
- `openspec/changes/execution-model-correction/specs/**`
- `openspec/changes/execution-model-correction/tasks.md`
- `openspec/changes/execution-model-correction/explore.md`
- `20260806-125-review-propose/result.json` (`approved`)
- `ref/Q1-apply.md`（owner 建议：先走通整条链再落代码）
- 当前 canonical specs / docs / persistence implementation

## Allowed work

- 修改 `src/persistence/serialization.ts`、`src/persistence/result-ref-adapter.ts`、
  `src/persistence/run-persistence.ts`、`src/facts/formal-fact-reader.ts`
- 新增/修改相关测试文件
- 新增 generation-aware lineage / effective-set / archive-aware resolver 辅助模块
- 更新 `docs/core-model.md`、`docs/delivery-lifecycle.md`、`docs/verification-model.md`、
  `docs/bootstrap-reference.md`、`AGENTS.md`
- 创建 `openspec/changes/execution-model-correction/verification.md`
- 运行 focused / affected checks、typecheck、lint、build、openspec strict validation

## Prohibited work

- 不重新打开 A1–D1 的历史状态或 terminal Runs
- 不修改 D1 Policy 业务语义（canRun / next / diagnose）
- 不运行 Delivery Full Test
- 不执行 review-apply / archive / checkpoint / commit / push
- 不实现具体 focused/affected/full npm scripts（属 F1）
- 不建立通用 completed Run editor
- 不建立 per-Run artifact snapshot/history store

## Required output

- 修改后的 `src/persistence/serialization.ts`（closed schema + typed reviewFindings + 收紧 ResultRef validation）
- 修改后的 `src/persistence/result-ref-adapter.ts`（buildArtifactResultRef + kind enum + resolver）
- 修改后的 `src/persistence/run-persistence.ts`（Core-derived ResultRef + completion preflight）
- 修改后的 `src/facts/formal-fact-reader.ts`（generation-aware validation + archive-aware resolver）
- 新增/修改的测试文件
- 更新后的 `docs/core-model.md`、`docs/delivery-lifecycle.md`、`docs/verification-model.md`、
  `docs/bootstrap-reference.md`、`AGENTS.md`
- `openspec/changes/execution-model-correction/verification.md`
- 更新后的 `openspec/changes/execution-model-correction/tasks.md`（勾选已完成项）
- terminal `126-apply/result.json`
