<!-- flowkit-change-verification-status: passed -->

# Verification: Q1 — core-contract-alignment

## 1. 验证范围

本次验证覆盖 009 Proposal / Design / Specs / Tasks 已冻结并经 010 Reviewer `approved` 的 Q1 Apply：

- Standard Formal Action / Run 收敛为 10 个 Change Action；
- `blockingAuthority = author | owner | verification | external` writer / Reader projection；
- author-only `changes-requested` 才允许 `revise-*`；
- pure / mixed non-author blocker 禁止 Author revise、`next()` 保持 blocked，同时 explicit same-stage re-review 在 Policy 层确定性合法；
- immutable pre-Q1 blocking Finding 的 bounded reader-only `author` compatibility；
- Delivery Full Test / Finalize 从 Standard Action/Run 移除，以及 Q1→03 `delivery-behavior-not-implemented` fail-closed bridge；
- `flowkit next` / `doctor` 对新 blocked reasons 的确定性呈现；
- AGENTS、current docs、七个 affected canonical capability specs 与测试的一致性。

不包含 A1 Owner provenance lifecycle、D1 Finding convergence、generic authority-resolution tracking、Verification resolution lifecycle、03 Delivery behavior executor、Archify、自动 Author/Reviewer loop 或 Git checkpoint mechanics。

## 2. 适用检查与结果

| 检查 | 命令/方法 | 状态 | 摘要 |
|---|---|---|---|
| Q1 focused tests | `npm run test:focused -- tests/unit/domain/actions.test.ts tests/unit/domain/schema-validator.test.ts tests/unit/persistence/serialization.test.ts tests/unit/persistence/run-persistence.test.ts tests/unit/facts/formal-fact-reader.test.ts tests/unit/policy/can-run.test.ts tests/unit/policy/next.test.ts tests/unit/diagnostics/views.test.ts` | passed | 250 tests / 39 suites，250 pass，0 fail；2.066s，低于 5s warning budget |
| Change affected verification aggregate | `PATH=<OpenSpec-1.7-offline> npm run verify:change -- domain` | passed | quality + affected + typecheck + lint + build + active Change OpenSpec strict + canonical specs strict 全部通过 |
| Quality Guard | `npm run quality`（由 `verify:change` 聚合） | passed | hard-failures 0；69 maintainability warnings/elevated-warnings，仅 observation，不改变 correctness exit code |
| Affected tests | `npm run test:affected -- domain`（由 `verify:change` 聚合） | passed | 557 tests / 125 suites，557 pass，0 fail；约 4.0s |
| Typecheck | `npm run typecheck` | passed | production + test TypeScript 0 error |
| Lint | `npm run lint` | passed | ESLint 0 error |
| Build | `npm run build` | passed | TypeScript build 通过 |
| OpenSpec active Change strict | `openspec 1.7.0 validate core-contract-alignment --strict --no-interactive` | passed | Change valid |
| Canonical specs strict | `openspec 1.7.0 validate --specs --strict --no-interactive` | passed | 10 passed，0 failed |
| Canonical conflict scan | repo-wide targeted scan of AGENTS/docs/specs/src | passed | current contract 不再把 `changes-requested` 无条件等价为 Author revise；Delivery Action/Run 仅保留明确 bounded legacy compatibility 表述 |
| Whitespace | `git diff --check` | passed | 无 whitespace error |
| Archived Change guard | `git status --short openspec/changes/archive` | passed | 无 archived Change mutation |
| Q1 scope guard | code/docs/spec scan + diff review | passed | 未引入 Q1 明确排除的 Delivery executor / authority event ledger / Finding DB / automatic loop / Archify runtime |
| Delivery Full Test | — | not-applicable | 未运行；本次只执行 Change Verification，且 Owner 未授权 Delivery Full Test |

## 3. 关键行为验证

- Change-only Action Catalog：`FormalAction` 仅包含 10 个 Change lifecycle Actions；`full-test` / `delivery-finalize` current Run 被拒绝。
- Current schemaVersion 2 Run：必须有 Change identity；历史 Delivery-level Run 仅由 bounded legacy reader / NNN enumeration 兼容，Reader 不将其投影为 current Policy Run。
- Finding authority：新 blocking Finding 必须声明合法 `blockingAuthority`；author blocker 必须有 `requiredChange`；non-author blocker 不得伪造 `requiredChange`；non-blocking Finding 不得携带 blocker authority。
- Review fact：blocking authorities 由 Reviewer result 确定性派生、固定顺序去重；malformed authority fail-closed。
- Legacy compatibility：immutable pre-Q1 typed blocking Finding 缺 authority 但具有旧 `requiredChange` 时，只在 Reader admission 中 bounded 投影为 `author`；writer 仍严格拒绝旧 shape，不改写历史 bytes。
- Policy：author-only matching Review → `revise-S`；pure/mixed non-author matching Review → `next()` 为 `non-author-review-blocker`，`canRun(revise-S)=false`，explicit same-stage `review-S` 合法且 unchanged target 可创建新的 Reviewer execution。
- Persistence entry：即使绕过 `next()`，non-author matching Review 也不能创建 Revision Run；相同 unchanged producer 可创建新的 Review Run generation。
- Q1→03 bridge：`authorized` Full Test 或 passed+finalize-authorized 不再产生 retired Action，而是 `delivery-behavior-not-implemented` blocked；awaiting Owner decision / failed 等既有边界保持。
- Diagnostics：`non-author-review-blocker` 与 `delivery-behavior-not-implemented` 在 doctor 中固定为 warning，CLI 不复制 Policy decision tree。

## 4. 历史兼容说明

001–010 属本 Q1 Bootstrap detached execution history，必须保持 immutable。009 的旧 Proposal terminal result 只列当轮实际变化的 Proposal 子集，而 Q1 新 writer contract 对未来 propose/revise-propose 要求完整 point-in-time artifact set。010 Reviewer 已对该历史 candidate 独立批准。

因此 011 不改写 009/010 来“补”新 contract；011 直接 exact-bind immutable 010 `result.json`（SHA-256 `336e2cbcb0f016a4fb444f5827c217cf808a389ce0314a62e4012ed2dd8b7c22`）。新 contract 只约束新的 writer / Reader behavior，并对历史使用明确 bounded compatibility。


## 5. 013 revise-apply — 012 Blocking Findings closure

012 `review-apply` 返回两个 `blockingAuthority=author` 的 blocker；013 仅修复这两个 Reader/self-consistency seam，没有重新打开 Proposal，也没有修改 001–012 immutable Run/Review bytes。

### Q1-RA-001 — exact pre-Q1 revise context compatibility

- `003-revise-explore`、`007-revise-propose`、`009-revise-propose` 继续保持原始 schemaVersion 2 bytes，不补写 `sourceReviewRun/sourceReviewVerdict`。
- FormalFactReader 新增 reader-only exact compatibility：只有同时匹配固定 Delivery/Change/Run identity **以及原始 context.json SHA-256** 时，才在内存中投影 matching `sourceReviewRun + changes-requested`。
- 普通 `discriminateRun()`、`validateContextFile()`、`createRun()` 与 current writer 继续严格要求新 revise context 的 source-review tuple；任意 byte mutation、identity mismatch 或其他 schemaVersion 2 malformed revise context 均 fail closed。
- exact pre-Q1 compatibility Run 不进入 current C1 source-review terminal tuple replay，因此不会反向要求这些旧 terminal result 补写后来才出现的 `reviewVerdictRef`。

### Q1-RA-002 — exact pre-Q1 Review finding compatibility

- 旧 finding 的 `requiredChange → author` projection 不再按 shape 泛化。
- 仅 `002-review-explore`、`006-review-propose`、`008-review-propose` 在固定 persisted Run identity **且 result.json 原始 SHA-256 精确匹配**时可进入 reader-only projection。
- `admitC1RunResultForReader()` 未提供 provenance 时等同 strict admission；current operational persistence paths 已改回 `admitC1RunResult()`，因此新 Run 创建/entry 不能借 reader compatibility 绕过 schema。
- 新/current schemaVersion 2 Review 即使复制旧 `blocking + requiredChange` shape，只要 provenance/hash 不等于上述 immutable history，仍产生 `SCHEMA_VALIDATION_FAILED` / Reader `FactConflict`。

### 013 verification results

| 检查 | 状态 | 摘要 |
|---|---|---|
| targeted Reader/persistence focused | passed | 197 tests / 19 suites，197 pass，0 fail；包含 exact 003 context、exact 006 Review result、byte mutation/current malformed rejection、001→010 exact history corpus regression |
| real 001→012 cumulative snapshot | passed | `readFormalFactSnapshot()` → `conflicts=[]`；`next(snapshot)` → `action: revise-apply`，不再出现 `formal-fact-conflict` |
| Change affected verification aggregate | passed | 560 tests / 125 suites，560 pass，0 fail |
| Typecheck | passed | production + test TypeScript 0 error |
| Lint | passed | ESLint 0 error |
| Build | passed | TypeScript build passed |
| OpenSpec active Change strict | passed | `core-contract-alignment` valid |
| Canonical specs strict | passed | 10 passed，0 failed |

## 6. Full Test

**未运行。** 本 Change 没有执行 `test:full`、`verify:full`，也没有创建 Delivery Full Test Run。Delivery Full Test 仍属于 Owner-authorized Delivery behavior，不是本 Q1 Apply 的 Change Verification。

## 7. 总体状态

**passed**

所有适用 Q1 Change Verification 均为 `passed`；Delivery Full Test 为 `not-applicable`。013 revise-apply 已关闭 012 的两个 Author blockers，可以进入新的独立 `review-apply` generation。
