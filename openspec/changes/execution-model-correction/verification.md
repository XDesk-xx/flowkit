# Verification: Q1 — execution-model-correction

## 1. 验证范围

Q1 是 execution-model-correction 的 apply + 多轮 revise-apply：修改
`flowkit-formal-fact-reader-and-persistence` 的实现（closed Run schema、Core-owned
ResultRef、review 精确绑定、generation-aware mutable artifact lifecycle、completion
preflight、archive-aware resolution、verificationSummaryRef lifecycle、Bootstrap legacy
兼容）并同步更新正式文档（`docs/core-model.md`、`docs/delivery-lifecycle.md`、
`docs/verification-model.md`、`docs/bootstrap-reference.md`、`AGENTS.md`）。

`20260806-134-revise-apply` 修复 `20260806-133-review-apply` 的 3 项 Blocking Findings。
134 不做逐文件零碎 patch，而是把三个问题收敛成三个共享 invariant，并让 Writer /
terminal preflight / FormalFact Reader / sibling-lineage recovery 全部复用同一语义：

- Q1-RA-006：共享 `validateReviewRunBinding`（result-ref-adapter）表达唯一规则 ——
  schemaVersion 2 review-* 的 `reviewedRunId` MUST exist、`inputRef` MUST exist、
  `inputRef.kind == run-result`、expected target 由 Core 从 `reviewedRunId` 重新派生、
  `inputRef.ref == expected reviewed result.json`、target 存在可读、实际 SHA-256 ==
  `versionFingerprint`。删除 inputRef、wrong kind、wrong target、指向另一个可读 result
  且使用正确 hash，全部在 terminal preflight / Reader / sibling lineage fail closed。
  `validateContextFile` 增加结构 requiredness：review-* 必须带 run-result inputRef。
- Q1-RA-007：共享 `validateSourceReviewTuple`（result-ref-adapter）把
  `sourceReviewRun + sourceReviewVerdict + reviewVerdictRef` 作为完整 immutable tuple ——
  任一存在则三者必须齐全；`reviewVerdictRef.kind == run-result`；target 必须 exact 指向
  `sourceReviewRun/result.json`；target 存在可读且 hash 精确；source review 必须是
  admitted completed review；actual admitted verdict == `sourceReviewVerdict`；unadmitted
  source review 是 conflict（绝不 silently skip）；superseded / revision-window 中
  immutable evidence 仍严格。`validateContextFile` 增加 sourceReviewRun ↔
  sourceReviewVerdict 配对 requiredness。
- Q1-RA-010：共享 `validateActionResultApplicability`（serialization）在 shared admission
  中强制 Action-owned ResultRef field scope —— `actionResult.action == context.action`；
  `producedResultRefs` 只允许 artifact-producing Actions（explore/revise-explore/propose/
  revise-propose）；`verificationSummaryRef` 只允许 review-apply 且 completed review-apply
  必须有；`reviewVerdictRef` 禁止 review-*；source-review applicable non-review Actions 按
  RA-007 tuple 规则处理。`admitC1RunResult` 与 terminal preflight 调用同一 validator，
  Reader 不再接受 Core 正常 writer 根本不可能发布的 schemaVersion 2 projection。

前序 5 项 Blocking Findings 仍保持 resolved（不回归）：
- Q1-RA-001：`writeRunResult` 不再 export，`completeRun` 唯一 terminal-completion 入口。
- Q1-RA-003：共享 `validateStageEffectiveSet` 用于 preflight / review-entry / Reader。
- Q1-RA-005：Run-ID descriptor grammar 与 producedArtifactTags closed 运行时校验。
- Q1-RA-008：non-Run logical-ref / archive resolver fail-closed。
- Q1-RA-009：current verificationSummaryRef fail-closed。

适用检查范围：focused + affected（serialization / result-ref-adapter / run-persistence /
formal-fact-reader 共享类型与 Reader 行为）。不新增 `flowkit-domain-and-state-schema` 与
`flowkit-policy-engine` delta（RA-006/007/010 属共享边界收口，不新增 Run 主状态或 Policy
状态，不重写 generation resolver，不新增 registry/platform/provider 抽象）。

## 2. 适用检查与结果

| # | 检查 | 命令 / 方法 | 适用性 | 状态 | 摘要 |
|---|---|---|---|---|---|
| 1 | TypeScript typecheck | `npm run typecheck` | 适用（共享类型/Reader） | passed | `tsc --noEmit` + `tsconfig.test.json` 均通过，0 error |
| 2 | ESLint | `npm run lint` | 适用（src + tests） | passed | `eslint .` 通过，0 warning/error |
| 3 | Build | `npm run build` | 适用（tsc emit） | passed | `tsc` 通过，dist 生成正常 |
| 4 | focused + affected unit + integration tests | `npm test` | 适用（Q1 + persistence/serialization/facts Reader 行为 + 跨模块 lifecycle） | passed | 569 tests, 569 pass, 0 fail |
| 5 | 模块级 unit tests（按产品职责归位） | `tests/unit/persistence/{serialization,result-ref-adapter,run-persistence}.test.ts` + `tests/unit/facts/formal-fact-reader.test.ts` | 适用 | passed | serialization: closed schema / ResultRef.kind required (Q1-RA-004) / field-kind binding / reviewedRunId Run-ID grammar (Q1-RA-005) / review-* inputRef 结构 required + kind==run-result (Q1-RA-006) / sourceReviewRun↔sourceReviewVerdict 配对 (Q1-RA-007) / `validateActionResultApplicability`（action mismatch、Action-disallowed producedResultRefs、Action-disallowed verificationSummaryRef、review-apply 缺 summary ref、review-* 带 reviewVerdictRef）+ `admitC1RunResult` 负例（Q1-RA-010）；result-ref-adapter: `validateReviewRunBinding`（missing/wrong-kind/wrong-target/matching-hash-wrong-target 负例）、`validateSourceReviewTuple`（missing counterpart / unadmitted source / verdict mismatch / wrong target）；run-persistence: terminal completion 对 tampered review context fail-closed（删除 inputRef / wrong kind / 指向另一可读 result 且 hash 正确 → reject 且 result.json 不 publish，Q1-RA-006）/ source-review tuple 各 counterpart 缺失 → reject（Q1-RA-007）/ `readRunVerdict` 复用共享 binding validator（sibling lineage 不消费 invalid review）；formal-fact-reader: wrong-kind / different-readable-target / wrong-hash review → 不进入 `reviewVerdicts`（Q1-RA-006）/ unadmitted source review / reviewVerdictRef 指向另一 admitted review（B 可读 + 正确 hash）→ FactConflict（Q1-RA-007） |
| 6 | 跨模块 lifecycle integration fixtures | `tests/integration/execution-model-lifecycle.test.ts` | 适用 | passed | generation-aware Reader（legitimate revise 后 superseded 无假冲突 / 无 lineage 覆盖 fail-closed）；revise-propose effective-set（namespace drift 拒绝 / subset overlay 通过 / undeclared singleton 保持 pending）；verification generation-aware；archive relocation（post-archive active+archive ambiguity fail-closed）；RA-006 invalid review 不能打开合法 lineage（closed-schema 违规 / exact-binding-broken 的 review 不 admitted）；RA-007 superseded generation 的 immutable Run-result refs 仍严格（tampered reviewVerdictRef fingerprint → FactConflict） |
| 7 | OpenSpec change strict validation | `npx openspec validate execution-model-correction --strict` | 适用 | passed | Change 'execution-model-correction' is valid |
| 8 | Canonical specs strict validation | `npx openspec validate --specs --strict` | 适用 | passed | canonical specs passed, 0 failed |
| 9 | whitespace / diff 检查 | `git diff --check` | 适用 | passed | exit 0，无 whitespace 错误（仅 Windows LF/CRLF 良性警告） |
| 10 | 契约与正式文档一致性 | 人工对照 proposal/design/tasks | 适用 | passed | closed schema 字段、ResultRef kind 映射、Core-owned ResultRef authority、review-entry validation、exact lineage generation-aware 规则、archive lifecycle、Bootstrap 例外均与 design.md Q1-1..Q1-13 一致；RA-006/007/010 为共享边界收口，不改变已 approved 契约 |
| 11 | 未新增禁止产物 | 人工确认 | 适用 | passed | 未新增 test:focused/affected/full 脚本、Gate Registry、自动 review/revise loop、completed Run editor、artifact history registry 或 registry/platform/provider 抽象 |

## 3. Q1 关键 invariant 验证

| Invariant | 验证方式 | 结果 |
|---|---|---|
| shared review exact binding（Q1-RA-006） | `validateReviewRunBinding`（result-ref-adapter）是唯一规则，terminal preflight / Reader `validateReviewExactBindings` / sibling `readRunVerdict` 全部复用；expected target 由 Core 从 reviewedRunId 重新派生，直接相信 inputRef.ref 再只检查该 path 的 hash 不足为证；missing inputRef / wrong kind / wrong target / different-readable-target-with-matching-hash 全部 fail closed（unit 负例 + terminal completion 负例：删除 inputRef、改 kind、改 target+hash → reject 且 result.json 不 publish） | passed |
| review inputRef 结构 required（Q1-RA-006） | `validateContextFile`：schemaVersion 2 review-* 必须带 inputRef 且 kind==run-result（unit 正例 + 负例） | passed |
| sibling lineage 只消费 validated review（Q1-RA-006） | `readRunVerdict` 先完整 admission + 共享 binding proof；binding/schema 失败 → undefined（review 不纳入 lineage）；integration: closed-schema 违规 / binding-broken 的历史 review 不能打开合法 supersession lineage | passed |
| source-review tuple（Q1-RA-007） | `validateSourceReviewTuple` 把 sourceReviewRun/sourceReviewVerdict/reviewVerdictRef 作为完整 tuple：任一存在则三者必须齐全；kind==run-result；target==sourceReviewRun/result.json；source review 必须 admitted；verdict 一致；hash 精确；unadmitted source review 是 conflict 而非 silently skip（unit + terminal + Reader 负例全覆盖）；`validateContextFile` 增加 sourceReviewRun↔sourceReviewVerdict 配对 requiredness | passed |
| immutable refs 在 superseded/window 中仍严格（Q1-RA-007） | immutable 校验独立于 mutable generation class；superseded generation tampered reviewVerdictRef → FactConflict（integration 负例） | passed |
| shared Action-result applicability（Q1-RA-010） | `validateActionResultApplicability`（serialization）由 `admitC1RunResult` 与 terminal preflight 共用：actionResult.action==context.action；producedResultRefs 只允许 artifact-producing Actions；verificationSummaryRef 只允许 review-apply 且 completed review-apply 必须有；reviewVerdictRef 禁止 review-*（unit 负例 + admitC1RunResult 负例：review-propose+reviewVerdictRef、action mismatch） | passed |
| immutable Run result binding | run-persistence.test: review exact binding via createRun；Reader `validateReviewExactBindings` 复用共享 validator | passed |
| C1 result admission（Q1-RA-006） | `admitC1RunResult`（validateRunResultFileCombination + validateActionResultWithoutRunRef + validateActionResultApplicability + validateReviewVerdictIntegrity）在 Reader 与 review-entry 统一使用 | passed |
| non-ENOENT read failure（Q1-RA-006） | result.json 为目录（EISDIR）→ `run-result` FactConflict，不投影 pending（unit 负例） | passed |
| non-Run logical-ref canonical identity（Q1-RA-008） | `normalizeArtifactLogicalRef` 在 strip 前拒绝 POSIX absolute 与 Windows drive；`assertCanonicalArtifactRoot` 强制 `openspec/changes/<changeId>/` 根 + 无 traversal + 非 result.json；`resolveArchiveAwareArtifactPath` 入口断言 | passed |
| archive exact grammar（Q1-RA-008） | `changeIdFromArchiveDirectoryName` 只接受 `YYYY-MM-DD-<changeId>`（含真实日历日期）；suffix-match 与 malformed date 不匹配；active + exact archive 唯一解析，多 exact / malformed 共存 fail-closed | passed |
| verificationSummaryRef fail-closed（Q1-RA-009） | current review-apply：missing / malformed / wrong kind / wrong path / missing target / fingerprint mismatch → 各维度 FactConflict；legitimate superseded verification generation 不回归 | passed |
| mutable artifact generation (Q1-RA-002) | integration lifecycle: P0→R0(CR)→P1 合法 exact lineage，P0 superseded 无假 FactConflict；无 lineage 覆盖 fail-closed | passed |
| pending revision-window (Q1-RA-002) | `classifyArtifactGenerations` 接收 `allReviseRuns`（含 pending），pending revise 建立 bounded revision-window | passed |
| Core-owned ResultRef authority (Q1-RA-001) | `completeRun` descriptor-driven input；`writeRunResult` 不再 export；completion preflight Action-requiredness fail-closed | passed |
| review-entry validation (Q1-RA-003) | `validateReviewEntry` 无条件按 reviewedRun 的 stage 校验完整 effective set | passed |
| Reader current-generation fail-closed (Q1-RA-003) | current-generation propose empty/partial produced set → `artifact-effective-set-incomplete` FactConflict | passed |
| current effective set | `validateStageEffectiveSet` 共享 validator 在 preflight / review-entry / Reader 三处复用；`readRunProducedResultRefs` 对 missing/malformed 直接 throw | passed |
| exact specs namespace | `enumerateSpecsNamespace` + `extractSpecsLogicalIdentities`；initial propose completeness check 精确匹配 Core-expected set | passed |
| Run-ID descriptor grammar (Q1-RA-005) | `validateRunIdDescriptor` 复用 `parseRunId`；reviewedRunId/sourceReviewRun/consumedRunIds 在 filesystem resolution 前验证 | passed |
| producedArtifactTags runtime closed (Q1-RA-005) | `validateCompleteRunInput` 运行时校验每个 tag ∈ `permittedProducedArtifactTags(action)` | passed |
| terminal create-once unchanged | `assertMutable + fs.link` first-writer-wins 不变（经 `completeRun` product-centric 覆盖） | passed |
| closed schema reject heavy fields | serialization.test: 拒绝 blockingFindings/verification/consistencyScan/commitPolicy | passed |
| ResultRef.kind required (Q1-RA-004) | serialization.test: missing/empty/unknown kind reject；field-kind exact binding | passed |
| archive relocation | `resolveArchiveAwareArtifactPath`：active/archive 二选一；Reader current-generation validators 均经 archive-aware 解析 | passed |
| verificationSummaryRef generation (Q1-9) | Reader `validateVerificationGenerationAware` 分类 review-apply generation；current 验证 verificationSummaryRef ↔ 当前 verification.md bytes；superseded 跳过；无 lineage 替换 fail-closed | passed |

## 4. Full Test

未运行。Q1 apply / revise-apply / review-apply / archive 均不自动运行 Delivery Full Test。
Full Test 需要 Delivery ready + owner explicit authorization，当前未授权，`fullTestStatus`
保持未运行。

## 5. 结果引用与环境说明

- 环境：Windows 11，Node.js >=22，TypeScript 5.5，tsx 4.x；
- Run：`20260806-134-revise-apply`（author），source review `20260806-133-review-apply` changes-requested；
- 源 review 结果：`.flowkit/runs/20260806-01-deterministic-core/execution-model-correction/20260806-133-review-apply/result.json`
  （content-sha256:eea737b70ef9642be7d123f5ea58689ff33b8cac98a0e5cc630b503242adfbf1）；
- 被 revise 的上一个 apply Run：`20260806-126-apply`；
- 无 Git commit 自动产生（AGENTS.md rule #6：Run / Action 不自动 Commit）。

## 6. 总体 Change Verification 状态

```text
passed
```

所有适用 focused + affected 检查通过；未运行 owner 未授权的 Delivery Full Test；未新增禁止
产物或第二套权威。Q1 execution-model-correction revise-apply 修复 133 全部 3 项 Blocking
Findings（Q1-RA-006 共享 review exact-binding validator / Q1-RA-007 共享 source-review
tuple validator / Q1-RA-010 共享 Action-result applicability validator），且 130/132 修复的
Q1-RA-001/003/005/008/009 保持 resolved，满足 Change Verification 边界，可进入下一次
`review-apply`。
