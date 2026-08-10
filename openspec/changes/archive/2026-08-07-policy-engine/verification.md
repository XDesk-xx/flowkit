# Verification: D1 — policy-engine

本记录属 Change D1 所有，遵循 `docs/verification-model.md` Section 7。Run 的 `result.json` 可引用本记录，但不能替代它。Full Test 属 Delivery，不在 Change Verification 范围。

## 1. 验证范围

D1 实现 policy-engine：三个纯函数 `canRun`、`next`、`diagnose`，从 `FormalFactSnapshot` 计算唯一合法下一 Action / owner-decision / blocked diagnosis。含 reviewed-Run lineage 模型（D1-8）、阶段识别、12 个 Action 前置条件矩阵、统一 review/revise 入口解析、owner 决策边界与 blocked diagnosis 严格区分（D1-9）。

产物：
- 生产源码：`src/policy/{types,lineage,stage-detector,preconditions,can-run,next,diagnose,owner-decision,blocked-diagnosis,unified-entry,index}.ts`
- 单元测试：`tests/unit/policy/{types,lineage,stage-detector,preconditions,can-run,next,diagnose,unified-entry}.test.ts` + `fixtures.ts`
- 提案产物：`proposal.md`、`design.md`、`specs/flowkit-policy-engine/spec.md`、`tasks.md`（110/110 完成）

## 2. 适用检查与结果

| 检查 | 适用性 | 命令/方法 | 状态 | 摘要 |
|---|---|---|---|---|
| OpenSpec strict validation | 适用 | `npx openspec validate policy-engine --strict` | passed | `Change 'policy-engine' is valid` |
| Typecheck | 适用 | `npm run typecheck` | passed | `tsc --noEmit`（production + test projects）无错误 |
| Build | 适用 | `npm run build` | passed | `tsc` 编译到 `dist/` 无错误 |
| Lint | 适用 | `npm run lint` | passed | eslint 无错误 |
| 单元测试 | 适用 | `npm test` | passed | 424/424 通过（113 suites）；Policy 子集 174/174（59 suites）。0 fail |
| 三纯函数契约（D1-2） | 适用 | 单元测试：canRun/next/diagnose 纯函数、无 I/O、只读 snapshot；diagnose 只返回 blocked | passed | types/can-run/next/diagnose 测试通过；纯函数测试（相同输入相同输出）通过 |
| Lineage 模型（D1-8） | 适用 | 单元测试：currentArtifactRun/currentReview/lineageMatch；cr→revise→review 闭环 | passed | lineage.test.ts 全分支通过；match true/false、null artifact/review 覆盖 |
| 阶段识别 + 6.11 重试 | 适用 | 单元测试：detectStage 全分支；failed/cancelled → 同 Action 重试 | passed | stage-detector.test.ts 通过 |
| 12 Action 前置条件矩阵 | 适用 | 单元测试：preconditions.test.ts 全 12 Action | passed | explore/review-S/revise-S/propose/apply/review-apply/revise-apply/archive/full-test/delivery-finalize 覆盖 |
| 冲突 fail-closed（D1-3） | 适用 | 单元测试：conflicts 非空 → next blocked、canRun allowed=false | passed | can-run/next 冲突测试通过 |
| D1-10 match+cr 阻断 review-S | 适用 | 表驱动测试：S ∈ {explore,propose,apply} match+cr → canRun(review-S) allowed:false + 统一 review blocked | passed | unified-entry.test.ts D1-10 表驱动通过；revise-S 恢复 review-S 覆盖 |
| D1-11 tasks-facts-unavailable | 适用 | 表驱动测试：archive 在 Tasks 事实不可用时 allowed:false + unmet tasks-facts-unavailable；next blocked；与 verification-facts-unavailable 区分 | passed | types/preconditions/diagnose/next 测试通过 |
| D1-12 delivery-finalize 仅 passed | 适用 | 表驱动测试：{not-ready,awaiting-user-decision,authorized,failed,undefined} → allowed:false + full-test-not-passed；仅 passed → allowed | passed | next/preconditions 表驱动通过；不接受 not-applicable |
| D1-13 full-test 仅 authorized（frozen Section 4.2） | 适用 | 表驱动测试：authorized(+scope)→allowed；awaiting-user-decision→owner-decision:authorize-full-test（非 action:full-test）；failed→blocked:full-test-failed；passed→rejected | passed | next/preconditions/diagnose 表驱动通过；frozen verification-model.md Section 4.2 一致 |
| owner-decision vs blocked 区分（D1-9） | 适用 | 单元测试：空 ownerAuthorizations → owner-decision（非 blocked）；含 scope → 推进 | passed | next/can-run 测试通过 |
| D1-RA-001 修复（next review-apply 门控） | 适用 | 单元测试：apply artifact no review → next blocked:verification-facts-unavailable（非 action:review-apply）；next 与 canRun(review-apply) 一致 | passed | 089-revise-apply 修复后通过；revise-apply 分支未被误伤 |
| D1-RA-002 修复（status-aware verification gate） | 适用 | 单元测试：VerificationGateResult（unavailable/satisfied/failed/not-run）；canRun/next 共享 evaluateVerificationGate；failed/not-run 各有 distinct reason | passed | 091-revise-apply 修复后通过；verification-gate.test.ts 覆盖 4 kind |
| D1-RA-003 修复（not-applicable → satisfied） | 适用 | 单元测试：passed 与 not-applicable 均 → satisfied 放行；failed/not-run 仍阻断；对齐冻结 verification-model.md 3.3 | passed | 093-revise-apply 修复后通过；D1 Proposal spec/design/tasks 对齐冻结契约 |
| D1-RA-004 修复（Change Verification 记录更新） | 适用 | 本文件引用 091/093、记录 D1-RA-002/D1-RA-003、424/424 替换 406/406；重新执行 ordinary checks | passed | 095-revise-apply 更新本文件；Full Test 仍 not-applicable |
| Change Verification 记录 | 适用 | 本文件存在性 | passed | 本文件补齐并更新至 095-revise-apply |
| Full Test | 不适用 | — | not-applicable | Full Test 属 Delivery；owner 未授权，未运行 |

## 3. 结果引用与环境

- 环境：Windows 11 Pro，Node.js v22.x，TypeScript ESM 项目，`npm test` 使用 `node --import tsx --test "tests/unit/**/*.test.ts"`。
- Apply Run：`.flowkit/runs/20260806-01-deterministic-core/policy-engine/20260806-087-apply/result.json`（status: completed；406/406 测试通过；inputRef = 085 result SHA-256 `f3502cf7…`；sourceReview = 086 approved `bc4cafd5…`）。
- Revise-apply Run（D1-RA-001）：`.flowkit/runs/20260806-01-deterministic-core/policy-engine/20260806-089-revise-apply/result.json`（status: completed；修复 D1-RA-001；406/406 测试通过；inputRef = 088 result SHA-256 `c49495ce…`）。
- Revise-apply Run（D1-RA-002）：`.flowkit/runs/20260806-01-deterministic-core/policy-engine/20260806-091-revise-apply/result.json`（status: completed；修复 D1-RA-002 status-aware verification gate；423/423 测试通过；inputRef = 090 result SHA-256 `032bb814…`）。
- Revise-apply Run（D1-RA-003）：`.flowkit/runs/20260806-01-deterministic-core/policy-engine/20260806-093-revise-apply/result.json`（status: completed；修复 D1-RA-003 not-applicable → satisfied；424/424 测试通过；inputRef = 092 result SHA-256 `4d5a75a0…`）。
- Revise-apply Run（D1-RA-004，本 Run）：`.flowkit/runs/20260806-01-deterministic-core/policy-engine/20260806-095-revise-apply/result.json`（status: completed；修复 D1-RA-004 更新本 verification.md；424/424 测试通过；inputRef = 094 result SHA-256）。
- Review-apply Run：`.flowkit/runs/20260806-01-deterministic-core/policy-engine/20260806-088-review-apply/result.json`（verdict: changes-requested；finding D1-RA-001）。
- Review-apply Run：`.flowkit/runs/20260806-01-deterministic-core/policy-engine/20260806-090-review-apply/result.json`（verdict: changes-requested；finding D1-RA-002）。
- Review-apply Run：`.flowkit/runs/20260806-01-deterministic-core/policy-engine/20260806-092-review-apply/result.json`（verdict: changes-requested；finding D1-RA-003）。
- Review-apply Run：`.flowkit/runs/20260806-01-deterministic-core/policy-engine/20260806-094-review-apply/result.json`（verdict: changes-requested；finding D1-RA-004）。
- 提案 Review Run：`.flowkit/runs/20260806-01-deterministic-core/policy-engine/20260806-086-review-propose/result.json`（verdict: approved）。
- 冻结权威：`docs/verification-model.md` Section 4.2（Full Test 生命周期：not-ready→awaiting-user-decision→authorized→passed|failed；"未 authorized 时不得执行 Full Test"）、Section 6（Full Test failed 恢复）、Section 7（本记录契约）、Section 8（Verification passed ≠ Review approved）。
- 冻结 specs：`openspec/specs/flowkit-domain-and-state-schema/spec.md`（B1）、`openspec/specs/flowkit-formal-fact-reader-and-persistence/spec.md`（C1）—— D1 只读引用，未修改。

## 4. Full Test

未运行。Full Test 属 Delivery（`docs/verification-model.md` Section 4），需要 owner 明确授权（`fullTestStatus: not-ready → awaiting-user-decision → authorized`）。本 Change 未获得 owner Full Test 授权。`apply`、`revise-apply`、`review-apply`、`archive` 都不得自动触发 Full Test（AGENTS.md rule #5）。

## 5. 历史例外（A1）

A1 archived 时未建立 `verification.md` 模型（`docs/verification-model.md` 由 B1 引入）。A1 的归档记录不在本 Change 范围。自 C1 起所有新 Change MUST 创建 `verification.md`；D1 遵循此要求。

## 6. 补充说明

本 `verification.md` 在 087-apply 与 089-revise-apply Run 完成后补充创建（同 A1/C1 先例：apply/revise Run 的 `result.json` 已记录全部验证结果，但未创建本正式 `verification.md` 文件）。091-revise-apply（D1-RA-002）与 093-revise-apply（D1-RA-003）后续修订未同步更新本文件，导致 094-review-apply 发现 D1-RA-004（Change Verification 记录过时）。095-revise-apply 按 D1-RA-004 requiredChange 更新本文件：引用 091/093、记录 D1-RA-002/D1-RA-003 检查、用当前 424/424 验证证据替换过时 406/406。本次更新重新执行了适用 ordinary checks（typecheck/build/lint/test 424/424/openspec strict），结果记录于 Section 2。

D1-RA-001（088-review-apply P1 finding）由 089-revise-apply 修复：`next()` 的 `decideApplyStage` 无 lineage match 分支现检查 Verification 事实，不可用 → `blocked: verification-facts-unavailable`，与 `canRun(review-apply)` 一致。门控仅加在该分支，未提升到 revise-apply 分支之前（`canRun(revise-apply)` 不要求 Verification 事实）。

D1-RA-002（090-review-apply P1 finding）由 091-revise-apply 修复：新增 `src/policy/verification-gate.ts`，引入 status-aware `VerificationGateResult`（unavailable/satisfied/failed/not-run），`canRun` 与 `next` 共享 `evaluateVerificationGate`；只有 satisfied 放行，unavailable/failed/not-run 各有 distinct blocked reason。修复前 gate 只检查事实可用性（`isVerificationFactAvailable`），未检查结果，前向兼容边界违反 fail-closed。

D1-RA-003（092-review-apply P1 finding）由 093-revise-apply 修复：`mapVerificationStatusToGate` 把 `not-applicable` 从 fail-closed 到 `not-run` 改为映射到 `satisfied`（放行），对齐冻结 `verification-model.md` Section 3.3（review-apply 前 `passed | not-applicable` 放行，`not-run | failed` 阻断）与 `delivery-lifecycle.md` Section 3.4/3.5（archive 接受 `passed | not-applicable`）。gate kind `passed` 重命名为 `satisfied`（语义：passed 或 not-applicable）。D1 Proposal spec/design/tasks 的 Change-Verification 门控同步对齐冻结契约（"passed" → "passed 或 not-applicable"），FullTestStatus `passed`（D1-12）不变。

D1-RA-004（094-review-apply P1 finding）由 095-revise-apply 修复：本文件更新——引用 091/093，记录 D1-RA-002/D1-RA-003 检查，424/424 替换 406/406，重新执行 ordinary checks。本 Run 仅修改本 `verification.md`，不修改生产代码、测试、proposal bundle、冻结文档或 terminal Runs。Full Test 仍为 not-applicable。

## 7. 总体 Change Verification 状态

**passed**

所有适用检查为 `passed`，无 `not-run` 或 `failed`（Full Test 为 `not-applicable`）。本 Change 满足进入 `review-apply` / `archive` 的 Verification 前置条件。

注意（`docs/verification-model.md` Section 8）：`Verification passed ≠ Review approved`。reviewer 仍需独立判断产物是否满足契约、边界和质量要求。下一 Action 为 `review-apply`（审查 095-revise-apply 是否真正解决 D1-RA-004 且未引入新问题）。
