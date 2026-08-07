# Verification: Q1 — execution-model-correction

## 1. 验证范围

Q1 是 execution-model-correction 的 apply：修改 `flowkit-formal-fact-reader-and-persistence`
的实现（closed Run schema、Core-owned ResultRef、review 精确绑定、generation-aware mutable
artifact lifecycle、completion preflight、archive-aware resolution、verificationSummaryRef
lifecycle、Bootstrap legacy 兼容）并同步更新正式文档（`docs/core-model.md`、
`docs/delivery-lifecycle.md`、`docs/verification-model.md`、`docs/bootstrap-reference.md`、
`AGENTS.md`）。

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
| 4 | focused + affected unit tests | `npm test` | 适用（Q1 + persistence/serialization Reader 行为） | passed | 471 tests, 471 pass, 0 fail |
| 5 | Q1 invariant fixtures | `node --import tsx --test tests/unit/persistence/q1-execution-model.test.ts` | 适用 | passed | 47 tests 覆盖 closed schema、typed reviewFindings、ResultRef kind enum、specs namespace 枚举、archive-aware 解析、completion preflight、review exact binding、generation-aware Reader（5.9 superseded 无假冲突 / 5.10 无 lineage fail-closed）、revise-propose specs namespace exact-set（5.13 drift 拒绝 / re-enumerate 通过 / subset overlay 通过）、subset omission（5.11 未声明 singleton 内容变化保持 pending）、initial coverage（5.12 empty explore / partial propose / 未绑定 spec 拒绝 / 完整 propose 通过）、verification generation-aware（7.5 合法 revise-apply 后旧 review-apply summary ref 无假冲突 / 7.7 无 lineage verification.md 替换 fail-closed）、archive relocation（8.3 post-archive Reader 经唯一 archive target 解析无假冲突 / 8.4 active+archive 歧义 fail-closed） |
| 6 | OpenSpec change strict validation | `npx openspec validate execution-model-correction --strict` | 适用 | passed | Change 'execution-model-correction' is valid |
| 7 | Canonical specs strict validation | `npx openspec validate --specs --strict` | 适用 | passed | 8 canonical specs passed, 0 failed |
| 8 | whitespace / diff 检查 | `git diff --check` | 适用 | passed | exit 0，无 whitespace 错误（仅 Windows LF/CRLF 良性警告） |
| 9 | 契约与正式文档一致性 | 人工对照 proposal/design/tasks | 适用 | passed | closed schema 字段、ResultRef kind 映射、review 绑定、generation-aware 规则、archive lifecycle、Bootstrap 例外均与 design.md Q1-1..Q1-13 一致 |
| 10 | 未新增禁止产物 | 人工确认 | 适用 | passed | 未新增 test:focused/affected/full 脚本、Gate Registry、自动 review/revise loop、completed Run editor 或 artifact history registry |

## 3. Q1 关键 invariant 验证

| Invariant | 验证方式 | 结果 |
|---|---|---|
| immutable Run result binding | q1 test: review exact binding via createRun；Reader `validateReviewExactBindings` 校验 inputRef.ref ↔ reviewedRunId result.json path + SHA-256 | passed |
| mutable artifact generation | q1 test 5.9: P0→R0(CR)→P1 合法 lineage，P0 superseded 无假 FactConflict；5.10: 无 lineage 覆盖 fail-closed | passed |
| current effective set | `validateCurrentGenerationRefs` 只验证 current generation producedResultRefs | passed |
| exact specs namespace | `enumerateSpecsNamespace` + `extractSpecsLogicalIdentities`；initial propose completeness check 精确匹配 Core-expected set；revise-propose terminal preflight exact-compare effective specs identities 与当前 canonical namespace | passed |
| terminal create-once unchanged | run-persistence.test: `assertMutable + fs.link` first-writer-wins 不变 | passed |
| closed schema reject heavy fields | q1 test 2.6: 拒绝 blockingFindings/verification/consistencyScan/commitPolicy | passed |
| archive relocation | `resolveArchiveAwareArtifactPath`：active/archive 二选一；Reader current-generation validators（producedResultRefs + verificationSummaryRef）均经 archive-aware 解析。q1 test 8.3 post-archive 经唯一 archive target 解析无假冲突 / 8.4 active+archive 歧义 fail-closed | passed |
| verificationSummaryRef generation (Q1-9) | Reader `validateVerificationGenerationAware` 分类 review-apply generation；current 验证 verificationSummaryRef ↔ 当前 verification.md bytes；superseded（合法 changes-requested → revise-apply lineage）跳过；无 lineage 替换 fail-closed。q1 test 7.5 / 7.7 | passed |

## 4. Full Test

未运行。Q1 apply / revise-apply / review-apply / archive 均不自动运行 Delivery Full Test。
Full Test 需要 Delivery ready + owner explicit authorization，当前未授权，`fullTestStatus`
保持未运行。

## 5. 结果引用与环境说明

- 环境：Windows 11，Node.js >=22，TypeScript 5.5，tsx 4.x；
- Run：`20260806-126-apply`（author），source review `20260806-125-review-propose` approved；
- 源 review 结果：`.flowkit/runs/20260806-01-deterministic-core/execution-model-correction/20260806-125-review-propose/result.json`；
- 无 Git commit 自动产生（AGENTS.md rule #6：Run / Action 不自动 Commit）。

## 6. 总体 Change Verification 状态

```text
passed
```

所有适用 focused + affected 检查通过；未运行 owner 未授权的 Delivery Full Test；未新增禁止
产物或第二套权威。Q1 execution-model-correction apply 满足 Change Verification 边界，可进入
`review-apply`。
