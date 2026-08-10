# Verification: Q1 — execution-model-correction

## 1. 验证范围

Q1 是 execution-model-correction 的 apply + 多轮 revise-apply：修改
`flowkit-formal-fact-reader-and-persistence` 的实现（closed Run schema、Core-owned
ResultRef、review 精确绑定、generation-aware mutable artifact lifecycle、completion
preflight、archive-aware resolution、verificationSummaryRef lifecycle、Bootstrap legacy
兼容）并同步更新正式文档（`docs/core-model.md`、`docs/delivery-lifecycle.md`、
`docs/verification-model.md`、`docs/bootstrap-reference.md`、`AGENTS.md`）。

当前验证主体是 `20260806-142-revise-apply` 落地后的代码（Git HEAD
`44a0e77e76adf5d728fcebc8b95b15ad587b30f7`），即经 `20260806-143-review-apply`
`approved`（candidate-overlay，零 Blocking Findings）并由本地执行者机械应用到冻结
Run-136 基线后、真实仓库验证通过的状态。142 的最终代码 delta 收敛 Q1-RA-011（bounded
legacy provenance）而不改变已 approved 契约：

- Q1-RA-011（bounded legacy provenance）：Reader admission 保留内部 `c1RunIds`
  provenance 集（仅 schemaVersion 2/C1 discriminator 通过的 Run）。C1-only immutable
  ResultRef 校验、C1 artifact generation / current effective-set 校验、C1 verification
  generation / current verificationSummaryRef 校验均只消费 `c1RunIds`。schemaVersion 1
  Bootstrap Run（含真实基线 136/138/140 的 completed revise）不再被追溯要求 C1
  source-review ResultRef tuple；legacy explore/propose 不进入 C1 producedResultRefs /
  effective-set 校验；legacy review-apply 不晋升为 C1 verification generation。unknown
  schemaVersion 仍被 unchanged three-way discriminator fail-closed。公开 RunFact 模型不变。

前序 Blocking Findings 保持 resolved（不回归）：
- Q1-RA-001：`writeRunResult` 不再 export，`completeRun` 唯一 terminal-completion 入口；
  Core 从 typed descriptor 派生全部 ResultRef。
- Q1-RA-002：`generation-resolver` exact lineage 分类（sourceReviewRun /
  sourceReviewVerdict / reviewedRunId），不靠 Run-ID 排序推断；pending revise 建立 bounded
  revision-window。
- Q1-RA-003：共享 `validateReviewEntry` 在 review-* 发布前校验 current effective set +
  specs namespace exact-set。
- Q1-RA-005：Run-ID descriptor grammar 与 producedArtifactTags closed 运行时校验。
- Q1-RA-006：共享 `validateReviewRunBinding` review exact-binding 唯一规则。
- Q1-RA-007：source-review requiredness 由 Action 决定（`requiresTuple` 只看
  `action === revise-*`）+ matching review stage + changes-requested-only；Writer/Reader
  同一 validator。
- Q1-RA-008：non-Run logical-ref / archive resolver fail-closed。
- Q1-RA-009：current verificationSummaryRef fail-closed。
- Q1-RA-010：top-level completed physical required fields 由 `runStatus + action` 决定；
  Writer/Reader 同一 applicability 矩阵。
- Q1-RA-004：schemaVersion 2 `ResultRef.kind` required + exact field-kind binding。

适用检查范围：focused + affected（serialization / result-ref-adapter / run-persistence /
formal-fact-reader 共享类型与 Reader 行为）。不新增 `flowkit-domain-and-state-schema` 与
`flowkit-policy-engine` delta；不新增 Action Registry / Lineage Registry / ResultRef Policy
Engine / Rule Provider / Generic Validator Registry / Workflow DSL / second state authority。

## 2. 适用检查与结果

以下命令均在落地后的干净 HEAD `44a0e77` 上真实执行（非照抄历史）。

| # | 检查 | 命令 | 适用性 | 状态 | 真实结果 |
|---|---|---|---|---|---|
| 1 | TypeScript typecheck | `npm run typecheck` | 适用（共享类型/Reader） | passed | `tsc --noEmit` + `tsconfig.test.json` 均通过，0 error，exit 0 |
| 2 | ESLint | `npm run lint` | 适用（src + tests） | passed | `eslint .` 通过，0 warning/error，exit 0 |
| 3 | Build | `npm run build` | 适用（tsc emit） | passed | `tsc` 通过，dist 生成正常，exit 0 |
| 4 | 完整测试套件（unit + integration） | `npm test` | 适用（Q1 + persistence/serialization/facts Reader 行为 + 跨模块 lifecycle） | passed | 597 tests, 597 pass, 0 fail, 0 cancelled/skipped |
| 5 | 模块级 unit tests | `tests/unit/persistence/{serialization,result-ref-adapter,run-persistence}.test.ts` + `tests/unit/facts/formal-fact-reader.test.ts` + `tests/unit/facts/formal-fact-reader-ra007-admission.test.ts` + `tests/unit/facts/formal-fact-reader-ra011-legacy-provenance.test.ts` | 适用 | passed | 覆盖 closed schema / ResultRef.kind required / field-kind binding / Core-owned ResultRef authority / completion preflight / validateReviewEntry / review exact binding / RA-007 revise integrity admission（pending/completed/failed/cancelled + wrong-stage + approved-source reject）/ RA-010 top-level physical required fields / RA-011 bounded legacy provenance（136/138/140 legacy revise 不要求 C1 tuple / legacy explore-propose 不进 C1 effective-set / legacy review-apply 不进 C1 verification generation / C1 completed revise 仍严格 / unknown schemaVersion fail-closed） |
| 6 | 跨模块 lifecycle integration fixtures | `tests/integration/execution-model-lifecycle.test.ts` | 适用 | passed | generation-aware Reader（legitimate revise 后 superseded 无假冲突 / 无 lineage 覆盖 fail-closed / superseded generation immutable refs 仍严格）；revise-propose effective-set（namespace drift 拒绝 / subset overlay 通过 / undeclared singleton 保持 pending）；verification generation-aware；archive relocation（active+archive ambiguity fail-closed）；RA-006 invalid review 不能打开合法 lineage |
| 7 | OpenSpec change strict validation | `npx openspec validate execution-model-correction --strict` | 适用 | passed | Change 'execution-model-correction' is valid，exit 0 |
| 8 | Canonical specs strict validation | `npx openspec validate --specs --strict` | 适用 | passed | 8 canonical specs passed, 0 failed，exit 0 |
| 9 | whitespace / diff 检查 | `git diff --check` | 适用 | passed | exit 0，无 whitespace 错误（仅 Windows LF/CRLF 良性警告） |
| 10 | 契约与正式文档一致性 | 人工对照 proposal/design/tasks | 适用 | passed | closed schema 字段、ResultRef kind 映射、Core-owned ResultRef authority、review-entry validation、exact lineage generation-aware 规则、archive lifecycle、Bootstrap 例外、RA-011 bounded legacy provenance 均与 design.md Q1-1..Q1-13 一致 |
| 11 | 未新增禁止产物 | 人工确认 | 适用 | passed | 未新增 test:focused/affected/full 脚本、Gate Registry、自动 review/revise loop、completed Run editor、artifact history registry、Action Registry、Lineage Registry、ResultRef Policy Engine、Rule Provider、Generic Validator Registry 或 Workflow DSL |

## 3. Q1 关键 invariant 验证

| Invariant | 验证方式 | 结果 |
|---|---|---|
| bounded legacy provenance（Q1-RA-011） | `formal-fact-reader-ra011-legacy-provenance.test.ts`：schemaVersion 1 completed revise 136/138/140 不要求 C1 source-review tuple；legacy explore/propose 不进 C1 producedResultRefs/effective-set；legacy review-apply 不进 C1 verification generation；schemaVersion 2 completed revise 仍要求完整 terminal source-review tuple；unknown schemaVersion 仍 fail-closed | passed |
| revise-* source-review requiredness 由 Action 决定（Q1-RA-007） | `formal-fact-reader-ra007-admission.test.ts`：valid pending revise 开 revision-window 无需 terminal reviewVerdictRef；unadmitted predecessor / 缺 reviewVerdictRef 的 completed / failed / cancelled / invalid inputRef / invalid consumedInputRefs 均不开 revision-window 或不可 supersede | passed |
| source review stage matching + changes-requested-only（Q1-RA-007） | `expectedSourceReviewActionFor` stage 映射；wrong-stage / approved source review → reject | passed |
| superseded / window immutable evidence 仍严格（Q1-RA-007） | immutable 校验独立于 mutable generation class；superseded tampered reviewVerdictRef → FactConflict | passed |
| top-level physical required fields（Q1-RA-010） | `validateActionResultApplicability(contextAction, runStatus, actionResult)` 基于 `runStatus == completed` + action；completed review-apply 缺 verificationSummaryRef reject（不看 executionStatus）；Writer/Reader 同一矩阵 | passed |
| shared review exact binding（Q1-RA-006） | `validateReviewRunBinding` 唯一规则，terminal preflight / Reader / sibling lineage 复用 | passed |
| immutable Run result binding | review exact binding via createRun；Reader validateReviewExactBindings 复用共享 validator | passed |
| C1 result admission（Q1-RA-006/010） | admitC1RunResult 统一用于 Reader 与 review-entry | passed |
| mutable artifact generation (Q1-RA-002) | P0→R0(CR)→P1 合法 exact lineage，P0 superseded 无假 FactConflict；无 lineage 覆盖 fail-closed | passed |
| pending revision-window (Q1-RA-002) | classifyArtifactGenerations 接收 allReviseRuns（含 pending），pending revise 建立 bounded revision-window | passed |
| Core-owned ResultRef authority (Q1-RA-001) | completeRun descriptor-driven input；writeRunResult 不再 export | passed |
| review-entry validation (Q1-RA-003) | validateReviewEntry 无条件按 reviewed Run 的 stage 校验完整 effective set | passed |
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

完整测试套件 `npm test`（仓库定义的完整 unit + integration suite）已由 owner 显式授权并
真实执行：**597 tests, 597 pass, 0 fail**。这是 Q1 Change Verification 的完整测试套件执行。

正式 Delivery-level Full Test（`full-test` action，D1-13）**未执行**且当前不可执行：
`full-test` precondition 要求所有 required Changes completed + checkpointed，而 E1
(diagnostic-cli) / F1 (core-hardening-and-release-candidate) 仍为 `planned`，命中
`required-changes-not-completed`。因此 `delivery.fullTestStatus` 保持 `not-ready`
（见 `openspec/delivery-groups/20260806-01-deterministic-core.yaml`）。不把 Change-level
完整测试套件执行虚构为 Delivery-level Full Test 门禁通过。

## 5. 结果引用与环境说明

- 环境：Windows 11，Node.js >=22，TypeScript 5.5，tsx 4.x；
- 当前验证主体：`20260806-142-revise-apply` 落地后的代码，Git HEAD
  `44a0e77e76adf5d728fcebc8b95b15ad587b30f7`；
- 142 source review：`20260806-141-review-apply` changes-requested；
- 143 candidate-overlay review：`20260806-143-review-apply` approved，零 Blocking Findings；
- 142 result：`.flowkit/runs/20260806-01-deterministic-core/execution-model-correction/20260806-142-revise-apply/result.json`
  （content-sha256:3b0cbfb9654b66448bd91fbc9d6d850a090f7515619a311d3f61ceebee847813）；
- 143 result：`.flowkit/runs/20260806-01-deterministic-core/execution-model-correction/20260806-143-review-apply/result.json`
  （approved，candidate-overlay，formalRepositoryApproval=false）。

## 6. 总体 Change Verification 状态

```text
passed
```

落地后的 142 最终代码在干净 HEAD `44a0e77` 上：typecheck / lint / build / `npm test`
（597 pass）/ OpenSpec change strict / canonical specs strict / git diff --check 全部真实
通过；RA-011 resolved 且 RA-001..RA-010 保持 resolved（不回归）；未新增禁止产物或第二套
权威。完整测试套件已 owner 授权运行（597 pass），但正式 Delivery-level Full Test 门禁
未执行（E1/F1 planned，`fullTestStatus` 保持 `not-ready`）。Q1 execution-model-correction
当前代码满足 Change Verification 边界。
