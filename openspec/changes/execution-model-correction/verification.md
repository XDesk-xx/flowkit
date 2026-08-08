# Verification: Q1 — execution-model-correction

## 1. 验证范围

Q1 是 execution-model-correction 的 apply + 多轮 revise-apply：修改
`flowkit-formal-fact-reader-and-persistence` 的实现（closed Run schema、Core-owned
ResultRef、review 精确绑定、generation-aware mutable artifact lifecycle、completion
preflight、archive-aware resolution、verificationSummaryRef lifecycle、Bootstrap legacy
兼容）并同步更新正式文档（`docs/core-model.md`、`docs/delivery-lifecycle.md`、
`docs/verification-model.md`、`docs/bootstrap-reference.md`、`AGENTS.md`）。

`20260806-136-revise-apply` 修复 `20260806-135-review-apply` 的 2 项 Blocking Findings。
136 不做逐文件零碎 patch，也不新增第四套 validator，而是把当前共享 invariant 补完整：
requiredness 一律由 Action / top-level physical result 决定，绝不反向由字段存在决定。

- Q1-RA-007（source-review lineage requiredness + Action semantics）：
  - `requiresTuple` 现在只由 Action 决定 —— `revise-explore / revise-propose /
    revise-apply` 无条件要求完整 source-review tuple；`&& sourceReviewRun !== undefined`
    的 135 精确绕过边界已删除（guide §26 明确禁止恢复）。
  - 共享 `validateSourceReviewTuple` 增加 Action-owned lineage 证明：
    `expectedSourceReviewActionFor(reviseAction)` 映射
    revise-explore→review-explore / revise-propose→review-propose /
    revise-apply→review-apply；source review 的 admitted action 必须等于 expected
    review stage（wrong-review-stage fail closed）；admitted verdict 与 persisted
    `sourceReviewVerdict` 都必须 == `changes-requested`
    （verdict-not-changes-requested fail closed）。approved review 不得进入 revise-*。
  - Writer（completionPreflight）、Reader（validateImmutableRunResultRefs）调用同一
    validator；superseded / revision-window immutable evidence 仍严格（不因 mutable
    artifacts superseded 而忽略 sourceReviewRun/sourceReviewVerdict/reviewVerdictRef）。
  - `readAdmittedSourceReviewVerdicts` 现在同时暴露 source review 的 action，供 stage
    映射校验。
- Q1-RA-010（top-level completed physical result 的 Action-owned required fields）：
  - `validateActionResultApplicability(contextAction, runStatus, actionResult)` 现在接收
    top-level `runStatus`，requiredness 来自 `runStatus == completed` + context action，
    不再依赖 `actionResult.executionStatus`。
  - required matrix：completed artifact-producing（explore/revise-explore/propose/
    revise-propose）必须结构上带 `producedResultRefs`（完整性仍归
    `validateStageEffectiveSet`）；completed review-apply 必须带
    `verificationSummaryRef`（无论 executionStatus = completed/failed/blocked）；
    producedResultRefs 禁止非 artifact Actions；verificationSummaryRef 只允许
    review-apply；reviewVerdictRef 禁止 review-*。
  - `admitC1RunResult` 与 terminal `completionPreflight` 调用同一 applicability
    语义；superseded historical malformed physical result 仍在 physical admission
    层 conflict（不被 generation 分类豁免）。

前序 7 项 Blocking Findings 仍保持 resolved（不回归）：
- Q1-RA-001：`writeRunResult` 不再 export，`completeRun` 唯一 terminal-completion 入口。
- Q1-RA-003：共享 `validateStageEffectiveSet` 用于 preflight / review-entry / Reader。
- Q1-RA-005：Run-ID descriptor grammar 与 producedArtifactTags closed 运行时校验。
- Q1-RA-006：共享 `validateReviewRunBinding` review exact-binding 唯一规则。
- Q1-RA-008：non-Run logical-ref / archive resolver fail-closed。
- Q1-RA-009：current verificationSummaryRef fail-closed。

适用检查范围：focused + affected（serialization / result-ref-adapter / run-persistence /
formal-fact-reader 共享类型与 Reader 行为）。不新增 `flowkit-domain-and-state-schema` 与
`flowkit-policy-engine` delta；不新增 Action Registry / Lineage Registry / ResultRef Policy
Engine / Rule Provider / Generic Validator Registry / Workflow DSL / second state authority。

## 2. 适用检查与结果

| # | 检查 | 命令 / 方法 | 适用性 | 状态 | 摘要 |
|---|---|---|---|---|---|
| 1 | TypeScript typecheck | `npm run typecheck` | 适用（共享类型/Reader） | passed | `tsc --noEmit` + `tsconfig.test.json` 均通过，0 error |
| 2 | ESLint | `npm run lint` | 适用（src + tests） | passed | `eslint .` 通过，0 warning/error |
| 3 | Build | `npm run build` | 适用（tsc emit） | passed | `tsc` 通过，dist 生成正常 |
| 4 | focused + affected unit + integration tests | `npm test` | 适用（Q1 + persistence/serialization/facts Reader 行为 + 跨模块 lifecycle） | passed | 584 tests, 584 pass, 0 fail |
| 5 | 模块级 unit tests（按产品职责归位） | `tests/unit/persistence/{serialization,result-ref-adapter,run-persistence}.test.ts` + `tests/unit/facts/formal-fact-reader.test.ts` | 适用 | passed | serialization: `validateActionResultApplicability` 接收 runStatus，required/forbidden matrix（review-apply executionStatus=failed/blocked 缺 verificationSummaryRef reject；completed explore/propose/revise-propose 缺 producedResultRefs reject；带合法字段 pass）+ `admitC1RunResult` 负例（Q1-RA-010）；run-persistence: terminal completion 对 revise-explore/revise-apply 全 tuple 缺失、revise-propose 完整 fresh set 但 tuple 缺失、approved source review、wrong-stage changes-requested review 全部 reject 且 result.json 不 publish（Q1-RA-007）；formal-fact-reader: persisted revise-explore tuple 全缺 → immutable-ref-required、persisted revise-propose sourced from approved review → immutable-ref-verdict-not-cr、superseded historical propose 缺 producedResultRefs → run-result-schema（Q1-RA-007/010） |
| 6 | 跨模块 lifecycle integration fixtures | `tests/integration/execution-model-lifecycle.test.ts` | 适用 | passed | generation-aware Reader（legitimate revise 后 superseded 无假冲突 / 无 lineage 覆盖 fail-closed）；revise-propose effective-set（namespace drift 拒绝 / subset overlay 通过 / undeclared singleton 保持 pending）；verification generation-aware；archive relocation（post-archive active+archive ambiguity fail-closed）；RA-006 invalid review 不能打开合法 lineage；RA-007 superseded generation 的 immutable Run-result refs 仍严格 |
| 7 | OpenSpec change strict validation | `npx openspec validate execution-model-correction --strict` | 适用 | passed | Change 'execution-model-correction' is valid |
| 8 | Canonical specs strict validation | `npx openspec validate --specs --strict` | 适用 | passed | 7 canonical specs passed, 0 failed |
| 9 | whitespace / diff 检查 | `git diff --check` | 适用 | passed | exit 0，无 whitespace 错误（仅 Windows LF/CRLF 良性警告） |
| 10 | 契约与正式文档一致性 | 人工对照 proposal/design/tasks | 适用 | passed | closed schema 字段、ResultRef kind 映射、Core-owned ResultRef authority、review-entry validation、exact lineage generation-aware 规则、archive lifecycle、Bootstrap 例外均与 design.md Q1-1..Q1-13 一致；RA-007/010 为共享 invariant 收口，不改变已 approved 契约 |
| 11 | 未新增禁止产物 | 人工确认 | 适用 | passed | 未新增 test:focused/affected/full 脚本、Gate Registry、自动 review/revise loop、completed Run editor、artifact history registry、Action Registry、Lineage Registry、ResultRef Policy Engine、Rule Provider、Generic Validator Registry 或 Workflow DSL |

## 3. Q1 关键 invariant 验证

| Invariant | 验证方式 | 结果 |
|---|---|---|
| revise-* source-review requiredness 由 Action 决定（Q1-RA-007） | `requiresTuple` 在 Writer completionPreflight 与 Reader validateImmutableRunResultRefs 均只由 `action === revise-*` 决定；guide §26 禁止的 `&& sourceReviewRun !== undefined` 已删除；revise-explore / revise-apply 全 tuple 缺失 → terminal reject + result.json 不 publish + Reader immutable-ref-required conflict；revise-propose 完整 fresh produced set 但 tuple 全缺 → 仍因 source-review requiredness reject（非 artifact completeness，负例带完整 fresh set 证明） | passed |
| source review stage matching（Q1-RA-007） | `expectedSourceReviewActionFor`：revise-explore→review-explore、revise-propose→review-propose、revise-apply→review-apply；wrong-stage changes-requested review（review-explore CR 作为 revise-propose source）→ terminal reject + Reader immutable-ref-wrong-stage conflict | passed |
| source review verdict == changes-requested（Q1-RA-007） | admitted verdict 与 persisted sourceReviewVerdict 都必须 == changes-requested；approved source review（path/hash/verdict 内部一致）→ terminal reject + Reader immutable-ref-verdict-not-cr conflict | passed |
| superseded / window immutable evidence 仍严格（Q1-RA-007） | immutable 校验独立于 mutable generation class；integration: superseded generation tampered reviewVerdictRef → FactConflict | passed |
| top-level physical required fields（Q1-RA-010） | `validateActionResultApplicability(contextAction, runStatus, actionResult)` 基于 `runStatus == completed` + context action：completed artifact-producing → producedResultRefs MUST exist（存在≠完整，完整性归 validateStageEffectiveSet）；completed review-apply → verificationSummaryRef MUST exist（不看 executionStatus）；Writer 与 Reader 同一语义 | passed |
| review-apply requiredness 不依赖 executionStatus（Q1-RA-010） | executionStatus=failed / blocked 的 top-level completed review-apply 缺 verificationSummaryRef → admission/Reader reject（unit 负例） | passed |
| superseded historical malformed 仍 conflict（Q1-RA-010） | 缺 producedResultRefs 的 completed propose（即使后续 R0→P1 使其 superseded-in-shape）→ Reader run-result-schema conflict at physical admission（unit 负例） | passed |
| shared review exact binding（Q1-RA-006） | `validateReviewRunBinding` 唯一规则，terminal preflight / Reader / sibling lineage 复用；expected target 从 reviewedRunId 重新派生 | passed |
| immutable Run result binding | review exact binding via createRun；Reader validateReviewExactBindings 复用共享 validator | passed |
| review inputRef 结构 required（Q1-RA-006） | validateContextFile：schemaVersion 2 review-* 必须带 run-result inputRef | passed |
| sibling lineage 只消费 validated review（Q1-RA-006） | readRunVerdict 先完整 admission + 共享 binding proof；invalid review 不纳入 lineage | passed |
| C1 result admission（Q1-RA-006/010） | admitC1RunResult（validateRunResultFileCombination + validateActionResultWithoutRunRef + validateActionResultApplicability + validateReviewVerdictIntegrity）统一用于 Reader 与 review-entry | passed |
| non-ENOENT read failure（Q1-RA-006） | EISDIR → run-result FactConflict，不投影 pending | passed |
| mutable artifact generation (Q1-RA-002) | P0→R0(CR)→P1 合法 exact lineage，P0 superseded 无假 FactConflict；无 lineage 覆盖 fail-closed | passed |
| pending revision-window (Q1-RA-002) | classifyArtifactGenerations 接收 allReviseRuns（含 pending），pending revise 建立 bounded revision-window | passed |
| Core-owned ResultRef authority (Q1-RA-001) | completeRun descriptor-driven input；writeRunResult 不再 export | passed |
| review-entry validation (Q1-RA-003) | validateReviewEntry 无条件按 reviewedRun 的 stage 校验完整 effective set | passed |
| current effective set | validateStageEffectiveSet 共享 validator 在 preflight / review-entry / Reader 三处复用 | passed |
| exact specs namespace | enumerateSpecsNamespace + extractSpecsLogicalIdentities；initial propose completeness check 精确匹配 Core-expected set | passed |
| Run-ID descriptor grammar (Q1-RA-005) | validateRunIdDescriptor 复用 parseRunId；filesystem resolution 前验证 | passed |
| producedArtifactTags runtime closed (Q1-RA-005) | validateCompleteRunInput 运行时校验每个 tag ∈ permittedProducedArtifactTags(action) | passed |
| terminal create-once unchanged | assertMutable + fs.link first-writer-wins 不变 | passed |
| closed schema reject heavy fields | 拒绝 blockingFindings/verification/consistencyScan/commitPolicy | passed |
| ResultRef.kind required (Q1-RA-004) | missing/empty/unknown kind reject；field-kind exact binding | passed |
| archive relocation | resolveArchiveAwareArtifactPath：active/archive 二选一；active+archive ambiguity fail-closed | passed |
| verificationSummaryRef generation (Q1-9) | Reader validateVerificationGenerationAware 分类 review-apply generation；current 验证 verificationSummaryRef ↔ 当前 verification.md bytes | passed |

## 4. Full Test

未运行。Q1 apply / revise-apply / review-apply / archive 均不自动运行 Delivery Full Test。
Full Test 需要 Delivery ready + owner explicit authorization，当前未授权，`fullTestStatus`
保持未运行。

## 5. 结果引用与环境说明

- 环境：Windows 11，Node.js >=22，TypeScript 5.5，tsx 4.x；
- Run：`20260806-136-revise-apply`（author），source review `20260806-135-review-apply` changes-requested；
- 源 review 结果：`.flowkit/runs/20260806-01-deterministic-core/execution-model-correction/20260806-135-review-apply/result.json`
  （content-sha256:fdf3954e80c5486abac71152b2cfd1209e73c123d9e84e115c8782d031cf5a62）；
- 被 revise 的上一个 apply Run：`20260806-126-apply`；
- 无 Git commit 自动产生（AGENTS.md rule #6：Run / Action 不自动 Commit）。

## 6. 总体 Change Verification 状态

```text
passed
```

所有适用 focused + affected 检查通过；未运行 owner 未授权的 Delivery Full Test；未新增禁止
产物或第二套权威。Q1 execution-model-correction revise-apply 修复 135 全部 2 项 Blocking
Findings（Q1-RA-007 source-review requiredness 由 Action 决定 + matching review stage +
changes-requested-only / Q1-RA-010 top-level completed physical required fields 由
runStatus+action 决定且 Writer/Reader 同一矩阵），且前序 resolved findings
（RA-001/003/005/006/008/009）保持 resolved，满足 Change Verification 边界，可进入下一次
`review-apply`。
