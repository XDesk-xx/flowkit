# Proposal: D1 — Review Findings and Blocker Authority

## Why

Q1 已经把 `changes-requested ≠ revise-required` 与 `blockingAuthority` routing 落入 Policy，但 Reviewer-owned Finding 仍停留在 transitional minimum：缺少完整 contract/evidence/acceptance、stable identity 与跨 review generation convergence；同时真实 detached 执行又暴露三项会直接破坏 D1 handoff/resume 的 corrective——OpenSpec artifact-producing Action 会被自身输出制造 semantic drift、Owner Contract Reset 无法以 structured formal fact 跨 role 传递、Windows OpenSpec npm PowerShell shim 无法作为一等 launcher 执行。

D1 必须在不建立第二 authority plane、不重做 Q1 lifecycle routing 的前提下，把 Reviewer Finding contract、Owner fact handoff、same-Run semantic identity 与 Windows `.ps1` compatibility 一次收口，使后续 detached Author/Reviewer 不再依赖聊天或 provider session 才能正确续接。

## What Changes

- 新增完整但 Lean 的 Reviewer Finding contract：blocking finding 使用 structured `problem / contractRef / invariant / evidence / impact / requiredOutcome / acceptance / blockingAuthority`；non-blocking finding保留问题/证据/影响但不得携带 lifecycle blocking authority。
- 为 Reviewer finding 冻结 stable ID 与 machine convergence：同一 stage 的 previous matching Review 与 current Review 之间显式分类 `new / still-open / resolved / superseded`；同一 ID 的 identity tuple 不得静默改变，supersede 必须显式引用 replacement finding。
- 保留 Q1 authority split：Reviewer Result拥有完整 Finding/convergence；FormalFactReader/Policy只消费 current verdict 与最小 blocking-authority projection；B1 Action Package只携带当前 Action 所需的 bounded finding view，不建立 `.flowkit/findings`、Evidence ledger 或自动 Review loop。
- 扩展既有 A1 `Manifest.ownerDecisions` authority store，使 active Change 可接纳 bounded structured `contract-reset` Owner fact；`sourceRef` 只保留 provenance locator，不再承担 decision semantics。Run/context/Action Package 只携带 Core-validated projection，不成为第二 Owner authority。
- 将 applicable structured Owner fact/ref 纳入 detached Action handoff 与 `semanticInputFingerprint`。Owner fact改变时，匹配 pending execution MUST fail closed；Reviewer换会话时 MUST 能从 Core-admitted formal facts验证既有 Owner decision，而不是要求 Owner 重复输入。
- 增加最小 reset-aware lineage currentness：completed Run 仍是不可改写的历史事实，但 producer/review 只有在其准备时绑定的 applicable Contract Reset identity 与 current identity 一致时，才能继续作为当前 artifact generation / approval。新的 Reset 不得静默继承旧 approval；Policy 必须回到对应 stage 的新 producer → review 边界，而不是把旧 generation 当成 revise 来源。
- 将 Finding convergence 的 previous Review 选择从“同 stage latest completed Review”收紧为实际近邻 lineage：direct re-review 只沿同一 reviewed target，revise 后 review 只沿 producer 的 `sourceReviewRun`；Owner Reset 产生的新 producer generation 不继承 abandoned/superseded generation findings。
- 将 B1 OpenSpec same-Run identity 从 raw execution context hash 改为 action-sensitive semantic projection：
  - `propose/revise-propose` 排除 Action 自己创建的 artifact existence / existing output paths；
  - `apply/revise-apply` 排除合法 task progress / derived state；
  - OpenSpec instruction、resolved output identity、apply `contextFiles`、contract/review/Owner facts 等真正 external input 继续进入 fingerprint 并 fail closed。
  - raw OpenSpec structured context 仍完整提供给 executor/Author。
- Windows OpenSpec thin integration 增加 `.ps1` first-class compatibility：默认 Windows shim resolution 优先 `openspec.ps1`，仅在 `.ps1` shim 不存在时 fallback 到 `openspec.cmd`；`.ps1` 通过 bounded PowerShell launcher 执行，`.cmd/.bat` 继续复用现有 ComSpec mechanics，explicit executable 始终保持调用者 authority。
- 保留 non-Windows direct-spawn 语义；不使用 `shell:true`、`Invoke-Expression`、PowerShell profile side effects，不建立 generic shell/launcher framework。
- 保留历史 Q1 transitional ReviewFinding 的 bounded read compatibility；D1 新写入 Reviewer Result 使用 versioned complete finding/convergence contract，不迁移重写历史 completed Run。
- 明确 canonical Windows `EPERM rename` 观察仍不属于 D1：当前 detached execution 未复现，不引入 speculative run-persistence retry framework。

## Capabilities

### New Capabilities

- `flowkit-review-findings-and-blocker-authority`: 定义 Reviewer-owned complete Finding schema、stable identity、跨 matching Review convergence、direct re-review closure 与 Policy/B1 最小 projection boundary。

### Modified Capabilities

- `flowkit-delivery-change-creation-and-owner-input`: 在现有 `ownerDecisions` authority store 中增加 bounded structured `contract-reset` record，冻结其 target/scope/required-outcome/ref semantics，且不建立第二 Owner decision store。
- `flowkit-formal-fact-reader-and-persistence`: 读取/校验 versioned complete ReviewFinding + convergence；投影 structured Owner Contract Reset；扩展 current Run context 的 bounded Owner fact refs，并保持历史 transitional Run 只读兼容。
- `flowkit-lean-run-and-action-package`: 为 Reviewer/Author package 提供 relevant finding convergence + applicable Owner fact projection，并把 action-sensitive OpenSpec semantic projection与 Owner fact identity纳入 pending Run fingerprint。
- `flowkit-openspec-1-7-thin-integration`: 将 raw OpenSpec execution view 与 semantic identity projection 分离，精确排除 propose/apply Action-owned mutation，同时保持 external structured context 与 fail-closed contract identity。
- `flowkit-runtime-foundation`: 扩展 shared external-command 的 Windows `.ps1` PowerShell launcher mechanics，并保持 `.cmd/.bat` ComSpec 与 non-Windows direct spawn 行为。

## Impact

- **主要 production surfaces**：`src/persistence/serialization.ts`、`src/persistence/run-persistence.ts`、`src/facts/**`、`src/domain/types.ts`、`src/domain/a1-types.ts`、`src/domain/owner-provenance.ts`、`src/services/a1-write-service.ts`、`src/services/b1-run-execution-service.ts`、`src/policy/lineage.ts`、`src/policy/next.ts`、`src/shared/external-command.ts`、`src/integrations/openspec/**`。
- **JSON / machine handoff**：新 Reviewer Result 将携带 versioned complete Finding/convergence；current `context.json` 增加 bounded structured Owner fact/ref projection；logical Action Package增加 Owner fact/convergence view。历史 completed Run不被重写。
- **verification**：finding closed-schema/identity/convergence、direct re-review、Owner contract-reset create→persist→read→consume、Owner-fact pending drift、approved 后 Reset 不得直接 apply、reset 后新 generation 不继承旧 findings、历史 completed Run 不被反向判 invalid、propose/apply self-mutation resume、external-input drift、Windows `.ps1`/`.cmd` launcher matrix、explicit executable、Linux/macOS regression、OpenSpec strict validation。
- **不改变**：Q1 `changes-requested` routing、Owner authority source、OpenSpec authority、Verification authority、Checkpoint/Full Test/Finalize边界。
- **不引入**：global Finding DB、Decision DB、Approval Registry、authority event ledger、chat transcript persistence、generic generation-management、generic shell registry、automatic Reviewer/Author loop、EPERM retry framework。
