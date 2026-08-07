# Verification: Q1 — execution-model-correction

## 1. 验证范围

Q1 是 execution-model-correction 的 apply + revise-apply：修改 `flowkit-formal-fact-reader-and-persistence`
的实现（closed Run schema、Core-owned ResultRef、review 精确绑定、generation-aware mutable
artifact lifecycle、completion preflight、archive-aware resolution、verificationSummaryRef
lifecycle、Bootstrap legacy 兼容）并同步更新正式文档（`docs/core-model.md`、
`docs/delivery-lifecycle.md`、`docs/verification-model.md`、`docs/bootstrap-reference.md`、
`AGENTS.md`）。

`20260806-128-revise-apply` 修复 `20260806-127-review-apply` 的 4 项 Blocking Findings：
- Q1-RA-001：`completeRun` descriptor-driven API 取代 caller-authored ResultRef；
  initial explore/propose Core 自动建立完整 expected set；review-apply Core 自动派生
  verificationSummaryRef。
- Q1-RA-002：`generation-resolver.ts` 统一 exact lineage classification；Reader 不再靠
  Run ID 推断 supersession；pending revise 建立 bounded revision-window。
- Q1-RA-003：`validateReviewEntry` 在 createRun(review-explore/review-propose) 发布前
  验证被审查 generation 的 current effective artifact set + specs namespace exact-set。
- Q1-RA-004：schemaVersion 2 ResultRef.kind required + exact field-kind binding。

同时将 `q1-execution-model.test.ts` 按 long-term product 职责拆分：module-level unit tests
归位到 `serialization.test.ts` / `result-ref-adapter.test.ts` / `run-persistence.test.ts`；
cross-module lifecycle fixtures 迁入 `tests/integration/execution-model-lifecycle.test.ts`。

适用检查范围：focused + affected（serialization / result-ref-adapter / run-persistence /
formal-fact-reader 共享类型与 Reader 行为）。不新增 `flowkit-domain-and-state-schema` 与
`flowkit-policy-engine` delta（generation-aware validation 属 Reader 一致性判断，不新增 Run
主状态或 Policy 状态）。

## 2. 适用检查与结果

| # | 检查 | 命令 / 方法 | 适用性 | 状态 | 摘要 |
|---|---|---|---|---|---|
| 1 | TypeScript typecheck | `npm run typecheck` | 适用（共享类型/Reader） | passed | `tsc --noEmit` + `tsconfig.test.json` 均通过，0 error |
| 2 | ESLint | `npm run lint` | 适用（src + tests） | passed | `eslint .` 通过，0 warning/error |
| 3 | Build | `npm run build` | 适用（tsc emit） | passed | `tsc` 通过，dist 生成正常 |
| 4 | focused + affected unit + integration tests | `npm test` | 适用（Q1 + persistence/serialization/facts Reader 行为 + 跨模块 lifecycle） | passed | 494 tests, 494 pass, 0 fail |
| 5 | 模块级 unit tests（按产品职责归位） | `tests/unit/persistence/{serialization,result-ref-adapter,run-persistence}.test.ts` + `tests/unit/facts/formal-fact-reader.test.ts` | 适用 | passed | serialization: closed schema / ResultRef.kind required (Q1-RA-004) / field-kind binding / unknown-field rejection / typed reviewFindings；result-ref-adapter: ResultRef construction / Action·tag mapping / specs namespace enumeration / archive-aware resolution / `validateEffectiveArtifactRefs` / `validateSpecsExactSet`；run-persistence: `createRun` / `completeRun` descriptor-driven authority (Q1-RA-001) / completion preflight / `validateReviewEntry` (Q1-RA-003) / review exact binding / `writeRunResult` publish protocol (fs.link / assertMutable / race)；formal-fact-reader: Reader exact lineage classification (Q1-RA-002) / current·revision-window·superseded / FactConflict behavior |
| 6 | 跨模块 lifecycle integration fixtures | `tests/integration/execution-model-lifecycle.test.ts` | 适用 | passed | generation-aware Reader（legitimate revise 后 superseded 无假冲突 / 无 lineage 覆盖 fail-closed）；revise-propose effective-set（namespace drift 拒绝 / re-enumerate 通过 / subset overlay 通过 / undeclared singleton 保持 pending）；verification generation-aware（合法 revise-apply 后旧 review-apply summary ref 无假冲突）；archive relocation（post-archive 经唯一 archive target 解析无假冲突） |
| 7 | OpenSpec change strict validation | `npx openspec validate execution-model-correction --strict` | 适用 | passed | Change 'execution-model-correction' is valid |
| 8 | Canonical specs strict validation | `npx openspec validate --specs --strict` | 适用 | passed | 8 canonical specs passed, 0 failed |
| 9 | whitespace / diff 检查 | `git diff --check` | 适用 | passed | exit 0，无 whitespace 错误（仅 Windows LF/CRLF 良性警告） |
| 10 | 契约与正式文档一致性 | 人工对照 proposal/design/tasks | 适用 | passed | closed schema 字段、ResultRef kind 映射、Core-owned ResultRef authority、review-entry validation、exact lineage generation-aware 规则、archive lifecycle、Bootstrap 例外均与 design.md Q1-1..Q1-13 一致 |
| 11 | 未新增禁止产物 | 人工确认 | 适用 | passed | 未新增 test:focused/affected/full 脚本、Gate Registry、自动 review/revise loop、completed Run editor 或 artifact history registry |

## 3. Q1 关键 invariant 验证

| Invariant | 验证方式 | 结果 |
|---|---|---|
| immutable Run result binding | run-persistence.test: review exact binding via createRun；Reader `validateReviewExactBindings` 校验 inputRef.ref ↔ reviewedRunId result.json path + SHA-256 | passed |
| mutable artifact generation (Q1-RA-002) | integration lifecycle: P0→R0(CR)→P1 合法 exact lineage（`isLegitimateArtifactSuccessor` 校验 reviewedRunId/sourceReviewRun/sourceReviewVerdict），P0 superseded 无假 FactConflict；无 lineage 覆盖 fail-closed | passed |
| pending revision-window (Q1-RA-002) | `classifyArtifactGenerations` 接收 `allReviseRuns`（含 pending），pending revise 建立 bounded revision-window，canonical bytes 变化不产生 false mutable conflict | passed |
| Core-owned ResultRef authority (Q1-RA-001) | run-persistence.test: `completeRun` descriptor-driven input（caller 不传 ResultRef）；initial explore/propose Core 无条件建立完整 expected set；review-apply Core 自动派生 verificationSummaryRef | passed |
| review-entry validation (Q1-RA-003) | run-persistence.test: `validateReviewEntry` 在 review-explore/review-propose 发布前校验 current effective generation + artifact hash + specs namespace exact-set；drift 在 publish 前 reject | passed |
| current effective set | `validateCurrentGenerationRefs` 只验证 current generation producedResultRefs；`validateEffectiveArtifactRefs` 在 preflight / review-entry / Reader 共享复用 | passed |
| exact specs namespace | `enumerateSpecsNamespace` + `extractSpecsLogicalIdentities`；initial propose completeness check 精确匹配 Core-expected set；revise-propose terminal preflight exact-compare effective specs identities 与当前 canonical namespace | passed |
| terminal create-once unchanged | run-persistence.test: `assertMutable + fs.link` first-writer-wins 不变 | passed |
| closed schema reject heavy fields | serialization.test: 拒绝 blockingFindings/verification/consistencyScan/commitPolicy | passed |
| ResultRef.kind required (Q1-RA-004) | serialization.test: missing/empty/unknown kind reject；field-kind exact binding（produced→produced-artifact / consumed→run-result / verificationSummary→verification-summary / reviewVerdict→run-result） | passed |
| archive relocation | `resolveArchiveAwareArtifactPath`：active/archive 二选一；Reader current-generation validators（producedResultRefs + verificationSummaryRef）均经 archive-aware 解析。integration lifecycle: post-archive 经唯一 archive target 解析无假冲突 | passed |
| verificationSummaryRef generation (Q1-9) | Reader `validateVerificationGenerationAware` 分类 review-apply generation；current 验证 verificationSummaryRef ↔ 当前 verification.md bytes；superseded（合法 changes-requested → revise-apply exact lineage）跳过；无 lineage 替换 fail-closed。integration lifecycle 覆盖 | passed |

## 4. Full Test

未运行。Q1 apply / revise-apply / review-apply / archive 均不自动运行 Delivery Full Test。
Full Test 需要 Delivery ready + owner explicit authorization，当前未授权，`fullTestStatus`
保持未运行。

## 5. 结果引用与环境说明

- 环境：Windows 11，Node.js >=22，TypeScript 5.5，tsx 4.x；
- Run：`20260806-128-revise-apply`（author），source review `20260806-127-review-apply` changes-requested；
- 源 review 结果：`.flowkit/runs/20260806-01-deterministic-core/execution-model-correction/20260806-127-review-apply/result.json`；
- 被 revise 的 Apply Run：`20260806-126-apply`；
- 无 Git commit 自动产生（AGENTS.md rule #6：Run / Action 不自动 Commit）。

## 6. 总体 Change Verification 状态

```text
passed
```

所有适用 focused + affected 检查通过；未运行 owner 未授权的 Delivery Full Test；未新增禁止
产物或第二套权威。Q1 execution-model-correction revise-apply 修复 127 全部 4 项 Blocking
Findings（Q1-RA-001 Core-owned ResultRef authority / Q1-RA-002 exact lineage generation /
Q1-RA-003 review-entry validation / Q1-RA-004 closed kind schema）并将测试按产品职责拆分，
满足 Change Verification 边界，可进入下一次 `review-apply`。
