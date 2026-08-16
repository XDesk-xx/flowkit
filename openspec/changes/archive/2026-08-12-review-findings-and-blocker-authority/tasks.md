# Tasks: D1 — Review Findings and Blocker Authority

## 1. Reviewer Finding v2 and convergence

- [x] 1.1 扩展 `ReviewFinding` closed schema为 version 2 complete contract，并保留 unversioned Q1 transitional finding 的 read-only compatibility。
- [x] 1.2 增加 within-review Finding ID uniqueness与 blocking/non-blocking field integrity validation。
- [x] 1.3 实现 previous matching Review → current Review 的 `new / still-open / resolved / superseded` convergence schema与 terminal admission validation。
- [x] 1.4 扩展 FormalFactReader / Result persistence，使 latest matching Review继续提供最小 verdict + blockingAuthorities，而完整 Finding/convergence仍归 Reviewer Result。

## 2. Structured Owner Contract Reset authority

- [x] 2.1 在 existing A1 `ownerDecisions` 中增加 active Change-scoped `contract-reset` structured record、canonical normalization与 deterministic ref/idempotency。
- [x] 2.2 扩展 A1 write-side/CLI input admission，要求显式 `scope + requiredOutcomes + sourceRef`，不从 sourceRef/chat/Run prose推断语义。
- [x] 2.3 扩展 FormalFactReader typed projection，选择同 Delivery/Change/scope 最新 valid Contract Reset，同时保留现有 authorization-only Policy projection。
- [x] 2.4 增加 malformed/unknown/cross-Change/duplicate/idempotent/latest-scope Owner fact tests，确认 Manifest仍是唯一 authority store。

## 3. B1 handoff and semantic identity

- [x] 3.1 将 current `context.json` 升级到 schemaVersion 3并写入 bounded `ownerFactRefs` projection；历史 v1/v2继续只读兼容。
- [x] 3.2 扩展 logical Action Package：Reviewer/Author只获得 applicable Owner facts与 relevant previous Finding/convergence view，不复制完整 history/chat。
- [x] 3.3 将 applicable Contract Reset identity纳入全部 current Change Standard Action的 semantic descriptor，并覆盖 Owner fact change → `PENDING_INPUT_DRIFT`。
- [x] 3.4 实现 reset-aware completed lineage currentness：producer/review approval只在 prepared/current Contract Reset identity一致时生效；Reset 后回到 normal producer→review，不继承旧 approval，也不把旧 Review误作 revise source。
- [x] 3.5 将 Review convergence previous baseline 收紧到实际近邻 lineage：same-target direct re-review 或 revise producer 的 exact `sourceReviewRun`；新 Reset generation无 baseline且不得继承 abandoned generation findings。
- [x] 3.6 保留 authorization-only refs的既有 action-specific gate semantics，确认 D1没有修改 Q1 Policy decision tree。
- [x] 3.7 关闭 082 `D1-RA-001`：提供仅适用于 Contract Reset-only semantic drift 的 stale pending recovery surface；旧 pending 正式 `cancelled` 后允许 normal reset generation 继续，其他 drift 继续 fail closed。

## 4. OpenSpec action-sensitive semantic projection

- [x] 4.1 从 raw `OpenSpecPreparedActionContextView` 分离 semantic fingerprint projection；raw context继续完整提供给 Author/executor。
- [x] 4.2 为 `propose/revise-propose` 排除 self-owned artifact existence/existing output paths，同时保留 artifact instruction/resolved output/dependency/template identity。
- [x] 4.3 为 `apply/revise-apply` 排除 task progress/state，同时保留 exact apply contextFiles与其它 external prerequisite identity。
- [x] 4.4 增加 same-pending self-mutation resume 与真正 external OpenSpec/contract drift fail-closed regression。

## 5. Windows PowerShell shim compatibility

- [x] 5.1 扩展 `src/shared/external-command.ts`：Windows `.ps1` 使用 bounded PowerShell launcher；保留 `.cmd/.bat` ComSpec与 non-Windows direct-spawn。
- [x] 5.2 实现 PowerShell launcher resolution：`pwsh.exe`优先、`powershell.exe` fallback；argv逐项传递，禁用 profile/shell eval。
- [x] 5.3 扩展 `OpenSpecCliAdapter` Windows default shim discovery：`openspec.ps1` first，只有 shim不存在时 fallback `openspec.cmd`；explicit executable保持 authority。
- [x] 5.4 覆盖 `.ps1` success、missing PowerShell、missing shim、spawn/exit/timeout、`.cmd` fallback、explicit `.ps1/.cmd/custom` 与 Linux/macOS regression。

## 6. Canonical contract alignment

- [x] 6.1 更新 D1 new capability与 A1/fact-persistence/B1/OpenSpec/runtime canonical specs，保持 One fact, one authority 与 Q1 routing不变。
- [x] 6.2 检查 docs/AGENTS 仅在存在真实 contract drift时做最小同步；不得覆盖 Base `ea9b34b...` 的 unrelated `AGENTS.md` maintenance changes。
- [x] 6.3 明确 Windows Run publish `EPERM rename` 仍不进入 D1实现，不新增 speculative persistence retry。

## 7. Verification

- [x] 7.1 运行 Finding v2/convergence focused tests，包括 first review、direct re-review、resolved/still-open/superseded/new、duplicate ID、same-ID identity drift。
- [x] 7.2 运行 Owner Contract Reset create→persist→read→consume与 detached role handoff tests，确认 Reviewer无需聊天即可验证 Core-admitted fact。
- [x] 7.3 运行 B1 pending semantic identity + reset-aware lineage tests：Owner fact drift、approved 后 Reset 不得直接 apply、Reset 后新 producer必须重新 review、新 generation不继承旧 findings、历史 completed Run保持历史有效、propose self-write resume、apply task-progress resume、external contract/context drift。
- [x] 7.4 运行 Windows launcher/OpenSpec adapter focused matrix与 non-Windows regression。
- [x] 7.5 运行 affected tests、typecheck、lint、build、quality、OpenSpec strict validation；Delivery Full Test保持 not-run，除非 Owner另行授权。
- [x] 7.6 运行 reset-vs-pending recovery regression：`PENDING_INPUT_DRIFT` 保持 fail closed、diagnostic=`recovery-required`、explicit recovery→cancelled、new generation 可创建、mixed drift recovery 被拒绝。
