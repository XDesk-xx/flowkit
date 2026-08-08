# Verification: Q1 — execution-model-correction

## 1. 验证范围

Q1 是 execution-model-correction 的 apply + 多轮 revise-apply：修改
`flowkit-formal-fact-reader-and-persistence` 的实现（closed Run schema、Core-owned
ResultRef、review 精确绑定、generation-aware mutable artifact lifecycle、completion
preflight、archive-aware resolution、verificationSummaryRef lifecycle、Bootstrap legacy
兼容）并同步更新正式文档（`docs/core-model.md`、`docs/delivery-lifecycle.md`、
`docs/verification-model.md`、`docs/bootstrap-reference.md`、`AGENTS.md`）。

`20260806-132-revise-apply` 修复 `20260806-131-review-apply` 的 4 项 Blocking Findings：
- Q1-RA-006：C1 terminal result 采用共享两阶段 admission（`admitC1RunResult` 统一
  `validateRunResultFileCombination` + `validateActionResultWithoutRunRef` +
  `validateReviewVerdictIntegrity`），物理校验通过后才 promote 任何正式 fact；review
  exact binding（reviewedRunId ↔ inputRef target ↔ actual bytes）失败或被 schema 拒绝的
  review 一律不进入 `reviewVerdicts`（也不能作为 lineage 被 generation 分类消费）；
  review-entry sibling lineage 同样只消费 exact-validated review（`readRunVerdict` 先完整
  admission + binding 证明）；non-ENOENT result 读取失败 → FactConflict，绝不投影 pending。
- Q1-RA-007：Reader 新增 `validateImmutableRunResultRefs`，对每个 Run 严格验证非 review
  `inputRef`、`consumedInputRefs[*]`、`reviewVerdictRef`（kind==run-result、Core-allowed
  canonical target、target 存在可读、实际 SHA-256 匹配；reviewVerdictRef 还必须精确指向
  `sourceReviewRun/result.json` 且 `sourceReviewVerdict` 与被引用 review 实际 verdict 一致）。
  immutable refs 校验独立于 mutable generation class —— superseded / revision-window 中
  仍严格，不可被合法 mutable supersession 掩盖。
- Q1-RA-008：non-Run logical ref 在 normalize 前先拒绝 POSIX absolute（leading `/`）与
  Windows drive；`assertCanonicalArtifactRoot` 强制 `openspec/changes/<changeId>/` 根身份
  + 无 traversal + 非 result.json 目标；`resolveArchiveAwareArtifactPath` 入口即断言
  canonical root；archive 目录只接受精确 `YYYY-MM-DD-<changeId>` grammar（含真实日历日期），
  `endsWith` 后缀匹配与 malformed date 一律不匹配；active + 唯一 exact archive 才解析，
  active + 多个 exact archive 或 malformed 共存 → fail-closed。
- Q1-RA-009：current review-apply 的 `verificationSummaryRef` 强制四层校验 —— 缺失
  actionResult / 缺失 summary ref / malformed → `verification-summary-missing|malformed`；
  kind 必须 `verification-summary`；logical ref 必须精确等于 Core 派生
  `openspec/changes/<changeId>/verification.md`；archive-aware 物理解析 + 当前 bytes
  SHA-256 匹配，缺失/ambiguous/替换一律 FactConflict。合法 changes-requested →
  revise-apply 的 superseded verification generation 不回归（Q1-9 保持）。

前序 3 项 Blocking Findings 仍保持 resolved（不回归）：
- Q1-RA-001：`writeRunResult` 不再 export，`completeRun` 唯一 terminal-completion 入口。
- Q1-RA-003：共享 `validateStageEffectiveSet` 用于 preflight / review-entry / Reader。
- Q1-RA-005：Run-ID descriptor grammar 与 producedArtifactTags closed 运行时校验。

适用检查范围：focused + affected（serialization / result-ref-adapter / run-persistence /
formal-fact-reader 共享类型与 Reader 行为）。不新增 `flowkit-domain-and-state-schema` 与
`flowkit-policy-engine` delta（RA-006/007/008/009 属 Reader/结果读取 fail-closed 边界，
不新增 Run 主状态或 Policy 状态）。

## 2. 适用检查与结果

| # | 检查 | 命令 / 方法 | 适用性 | 状态 | 摘要 |
|---|---|---|---|---|---|
| 1 | TypeScript typecheck | `npm run typecheck` | 适用（共享类型/Reader） | passed | `tsc --noEmit` + `tsconfig.test.json` 均通过，0 error |
| 2 | ESLint | `npm run lint` | 适用（src + tests） | passed | `eslint .` 通过，0 warning/error |
| 3 | Build | `npm run build` | 适用（tsc emit） | passed | `tsc` 通过，dist 生成正常 |
| 4 | focused + affected unit + integration tests | `npm test` | 适用（Q1 + persistence/serialization/facts Reader 行为 + 跨模块 lifecycle） | passed | 542 tests, 542 pass, 0 fail |
| 5 | 模块级 unit tests（按产品职责归位） | `tests/unit/persistence/{serialization,result-ref-adapter,run-persistence}.test.ts` + `tests/unit/facts/formal-fact-reader.test.ts` | 适用 | passed | serialization: closed schema / ResultRef.kind required (Q1-RA-004) / field-kind binding / reviewedRunId Run-ID grammar (Q1-RA-005) / 新增共享 `admitC1RunResult` admission pipeline (Q1-RA-006)；result-ref-adapter: ResultRef construction / Run-ID descriptor fail-closed (Q1-RA-005) / `normalizeArtifactLogicalRef` POSIX·Windows absolute + traversal 先验后 normalize / `assertCanonicalArtifactRoot` / archive 精确 `YYYY-MM-DD-<changeId>` grammar（含真实日历日期校验）+ malformed 不匹配 + active+exact archive ambiguity fail-closed (Q1-RA-008)；run-persistence: `completeRun` 唯一 public terminal API (Q1-RA-001) / completion preflight Action-requiredness / review-entry 无条件 stage completeness (Q1-RA-003) / descriptor runtime fail-closed (Q1-RA-005) / `readRunVerdict` 先完整 admission + exact binding 证明才返回 verdict（review-entry lineage 不消费 invalid review，Q1-RA-006）；formal-fact-reader: C1 result 两阶段 admission（closed-schema 违规 / verdict-integrity 违规 / 无 inputRef / broken hash binding 的 review → 不进入 `reviewVerdicts`，Q1-RA-006）/ non-ENOENT result 读取失败 → `run-result` FactConflict（不投影 pending）/ `validateImmutableRunResultRefs`（wrong kind / missing target / path-shaped target / fingerprint mismatch → FactConflict，含 superseded 仍严格，Q1-RA-007）/ current review-apply verificationSummaryRef missing / malformed / wrong kind / wrong path / missing target → 各维度 FactConflict（Q1-RA-009） |
| 6 | 跨模块 lifecycle integration fixtures | `tests/integration/execution-model-lifecycle.test.ts` | 适用 | passed | generation-aware Reader（legitimate revise 后 superseded 无假冲突 / 无 lineage 覆盖 fail-closed）；revise-propose effective-set（namespace drift 拒绝 / subset overlay 通过 / undeclared singleton 保持 pending）；verification generation-aware；archive relocation（post-archive active+archive ambiguity fail-closed）；RA-006 invalid review 不能打开合法 lineage（closed-schema 违规 / exact-binding-broken 的 review 不 admitted）；RA-007 superseded generation 的 immutable Run-result refs 仍严格（tampered reviewVerdictRef fingerprint → FactConflict） |
| 7 | OpenSpec change strict validation | `npx openspec validate execution-model-correction --strict` | 适用 | passed | Change 'execution-model-correction' is valid |
| 8 | Canonical specs strict validation | `npx openspec validate --specs --strict` | 适用 | passed | 8 canonical specs passed, 0 failed |
| 9 | whitespace / diff 检查 | `git diff --check` | 适用 | passed | exit 0，无 whitespace 错误（仅 Windows LF/CRLF 良性警告） |
| 10 | 契约与正式文档一致性 | 人工对照 proposal/design/tasks | 适用 | passed | closed schema 字段、ResultRef kind 映射、Core-owned ResultRef authority、review-entry validation、exact lineage generation-aware 规则、archive lifecycle、Bootstrap 例外均与 design.md Q1-1..Q1-13 一致；RA-006/007/008/009 为 Reader 结果读取/immutable ref/admission 边界修复，不改变已 approved 契约 |
| 11 | 未新增禁止产物 | 人工确认 | 适用 | passed | 未新增 test:focused/affected/full 脚本、Gate Registry、自动 review/revise loop、completed Run editor 或 artifact history registry |

## 3. Q1 关键 invariant 验证

| Invariant | 验证方式 | 结果 |
|---|---|---|
| immutable Run result binding | run-persistence.test: review exact binding via createRun；Reader `validateReviewExactBindings` 校验 inputRef.ref ↔ reviewedRunId result.json path + SHA-256，broken binding 的 verdict 从 `reviewVerdicts` 移除（Q1-RA-006） | passed |
| C1 result admission（Q1-RA-006） | 共享 `admitC1RunResult`（validateRunResultFileCombination + validateActionResultWithoutRunRef + validateReviewVerdictIntegrity）在 Reader 与 review-entry 统一使用；closed-schema 违规 / verdict-integrity 违规 / 无 inputRef / broken hash 的 review → 不进入 `reviewVerdicts`（unit + integration 负例） | passed |
| non-ENOENT read failure（Q1-RA-006） | result.json 为目录（EISDIR）→ `run-result` FactConflict，不投影 pending（unit 负例） | passed |
| review-entry lineage 只消费 validated review（Q1-RA-006） | `readRunVerdict` 先完整 admission + reviewedRunId ↔ inputRef ↔ actual bytes 证明；binding/schema 失败 → undefined（review 不纳入 lineage）；integration: closed-schema 违规 / binding-broken 的历史 review 不能打开合法 supersession lineage | passed |
| immutable Run-result refs（Q1-RA-007） | `validateImmutableRunResultRefs` 对非 review inputRef / consumedInputRefs / reviewVerdictRef 验证 kind==run-result、Core-allowed canonical target、target 存在、SHA-256 匹配、reviewVerdictRef == sourceReviewRun/result.json 且 sourceReviewVerdict 与被引用 review verdict 一致；superseded generation 中 tampered ref 仍报 FactConflict（integration 负例） | passed |
| non-Run logical-ref canonical identity（Q1-RA-008） | `normalizeArtifactLogicalRef` 在 strip 前拒绝 POSIX absolute 与 Windows drive；`assertCanonicalArtifactRoot` 强制 `openspec/changes/<changeId>/` 根 + 无 traversal + 非 result.json；`resolveArchiveAwareArtifactPath` 入口断言（unit + adapter 负例） | passed |
| archive exact grammar（Q1-RA-008） | `changeIdFromArchiveDirectoryName` 只接受 `YYYY-MM-DD-<changeId>`（含真实日历日期）；`2026-02-02-C1-extra`、`2026-02-02`、`C1`、`2026-13-99-C1`、`2026-02-30-C1` 不匹配；active + exact archive 唯一解析，多 exact / malformed 共存 fail-closed（adapter 负例） | passed |
| verificationSummaryRef fail-closed（Q1-RA-009） | current review-apply：missing actionResult / missing summary ref → `verification-summary-missing`；malformed → `verification-summary-malformed`；wrong kind → `verification-summary-kind`；wrong path → `verification-summary-path`；missing target → `verification-summary-missing`；fingerprint mismatch → `verification-summary-replaced`（unit 负例全覆盖）；legitimate superseded verification generation 不回归（integration） | passed |
| mutable artifact generation (Q1-RA-002) | integration lifecycle: P0→R0(CR)→P1 合法 exact lineage（`isLegitimateArtifactSuccessor` 校验 reviewedRunId/sourceReviewRun/sourceReviewVerdict），P0 superseded 无假 FactConflict；无 lineage 覆盖 fail-closed | passed |
| pending revision-window (Q1-RA-002) | `classifyArtifactGenerations` 接收 `allReviseRuns`（含 pending），pending revise 建立 bounded revision-window，canonical bytes 变化不产生 false mutable conflict | passed |
| Core-owned ResultRef authority (Q1-RA-001) | run-persistence.test: `completeRun` descriptor-driven input；`writeRunResult` 不再 export；initial explore/propose Core 无条件建立完整 expected set；review-apply Core 自动派生 verificationSummaryRef；completion preflight Action-requiredness fail-closed | passed |
| review-entry validation (Q1-RA-003) | run-persistence.test: `validateReviewEntry` 无条件按 reviewedRun 的 stage 校验完整 effective set；explore empty/partial set、propose singleton 缺失（含 specs namespace 为空但 singleton 缺失）在 publish 前 reject | passed |
| Reader current-generation fail-closed (Q1-RA-003) | formal-fact-reader.test: current-generation propose empty/partial produced set → `artifact-effective-set-incomplete` FactConflict | passed |
| current effective set | `validateStageEffectiveSet` 共享 validator 在 preflight / review-entry / Reader 三处复用；`readRunProducedResultRefs` 对 missing/malformed/无 actionResult 直接 throw | passed |
| exact specs namespace | `enumerateSpecsNamespace` + `extractSpecsLogicalIdentities`；initial propose completeness check 精确匹配 Core-expected set；revise-propose terminal preflight exact-compare effective specs identities 与当前 canonical namespace | passed |
| Run-ID descriptor grammar (Q1-RA-005) | `validateRunIdDescriptor` 复用 `parseRunId`；reviewedRunId/sourceReviewRun/consumedRunIds 在 filesystem resolution 前验证；`resolveRunResultPath` 对 path-shaped runId（../x、a/b、C:\tmp\x、result.json）fail-closed | passed |
| producedArtifactTags runtime closed (Q1-RA-005) | `validateCompleteRunInput` 运行时校验每个 tag ∈ `permittedProducedArtifactTags(action)`；unknown tag、Action-disallowed tag、revise-propose 空/undefined changed-tag set、apply 携带 tag 全部 reject | passed |
| terminal create-once unchanged | run-persistence.test: `assertMutable + fs.link` first-writer-wins 不变（经 `completeRun` product-centric 覆盖） | passed |
| closed schema reject heavy fields | serialization.test: 拒绝 blockingFindings/verification/consistencyScan/commitPolicy | passed |
| ResultRef.kind required (Q1-RA-004) | serialization.test: missing/empty/unknown kind reject；field-kind exact binding | passed |
| archive relocation | `resolveArchiveAwareArtifactPath`：active/archive 二选一；Reader current-generation validators 均经 archive-aware 解析。integration lifecycle: post-archive 经唯一 archive target 解析无假冲突；active+archive 同时存在 ambiguity fail-closed | passed |
| verificationSummaryRef generation (Q1-9) | Reader `validateVerificationGenerationAware` 分类 review-apply generation；current 验证 verificationSummaryRef ↔ 当前 verification.md bytes；superseded（合法 changes-requested → revise-apply exact lineage）跳过；无 lineage 替换 fail-closed | passed |

## 4. Full Test

未运行。Q1 apply / revise-apply / review-apply / archive 均不自动运行 Delivery Full Test。
Full Test 需要 Delivery ready + owner explicit authorization，当前未授权，`fullTestStatus`
保持未运行。

## 5. 结果引用与环境说明

- 环境：Windows 11，Node.js >=22，TypeScript 5.5，tsx 4.x；
- Run：`20260806-132-revise-apply`（author），source review `20260806-131-review-apply` changes-requested；
- 源 review 结果：`.flowkit/runs/20260806-01-deterministic-core/execution-model-correction/20260806-131-review-apply/result.json`
  （content-sha256:867cc17bf2021e769b14e5bbc6cbb96ddc5ab7ae5148bbe4dfee70e925267262）；
- 被 revise 的上一个 apply Run：`20260806-126-apply`；
- 无 Git commit 自动产生（AGENTS.md rule #6：Run / Action 不自动 Commit）。

## 6. 总体 Change Verification 状态

```text
passed
```

所有适用 focused + affected 检查通过；未运行 owner 未授权的 Delivery Full Test；未新增禁止
产物或第二套权威。Q1 execution-model-correction revise-apply 修复 131 全部 4 项 Blocking
Findings（Q1-RA-006 C1 result 两阶段 fail-closed admission 与 invalid review 不入 lineage /
Q1-RA-007 immutable Run-result refs 严格验证且 superseded 不豁免 / Q1-RA-008 non-Run
logical-ref 与 archive resolver fail-closed / Q1-RA-009 current verificationSummaryRef
fail-closed），且 130 修复的 Q1-RA-001/003/005 保持 resolved，满足 Change Verification
边界，可进入下一次 `review-apply`。
