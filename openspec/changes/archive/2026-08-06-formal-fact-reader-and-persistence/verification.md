# Verification: C1 — formal-fact-reader-and-persistence

本记录属 Change C1 所有，遵循 `docs/verification-model.md` Section 7。Run 的 `result.json` 可引用本记录，但不能替代它。Full Test 属 Delivery，不在 Change Verification 范围。

## 1. 验证范围

C1 实现 formal-fact-reader-and-persistence：正式事实 Reader、原子持久化层、物理 schema 校验器、Bootstrap Run 兼容性、Run ID 文件系统集成。

产物：
- 生产源码：`src/facts/{formal-fact-snapshot,formal-fact-reader,git-boundary-reader,yaml-parser}.ts`、`src/persistence/{run-persistence,run-id-fs,serialization,legacy-recognizer,result-ref-adapter}.ts`
- 单元测试：`tests/unit/facts/*.test.ts`、`tests/unit/persistence/*.test.ts`
- 提案产物：`proposal.md`、`design.md`、`specs/flowkit-formal-fact-reader-and-persistence/spec.md`、`tasks.md`

## 2. 适用检查与结果

| 检查 | 适用性 | 命令/方法 | 状态 | 摘要 |
|---|---|---|---|---|
| OpenSpec strict validation | 适用 | `npx openspec validate formal-fact-reader-and-persistence --strict` | passed | `Change 'formal-fact-reader-and-persistence' is valid` |
| Typecheck | 适用 | `npm run typecheck` | passed | `tsc --noEmit`（production + test projects）无错误 |
| Build | 适用 | `npm run build` | passed | `tsc` 编译到 `dist/` 无错误 |
| Lint | 适用 | `npm run lint` | passed | eslint 无错误 |
| 单元测试 | 适用 | `npm test` | passed | 全部测试通过（首次 apply 226；064 revise +12；066 revise +12 = 250） |
| Change Verification 记录 | 适用 | 本文件存在性 | passed | 本文件补齐（C1-AP-001 修复） |
| writeRunResult assertMutable 持久化状态 | 适用 | 单元测试：pre-existing result.json → assertMutable throw RUN_TERMINAL | passed | C1-AP-002 修复后通过 |
| Delivery Manifest 嵌套读取 | 适用 | 单元测试：使用真实 manifest 形状（`delivery.state`/`delivery.fullTestStatus`） | passed | C1-AP-003 修复后通过 |
| Review verdict 重建 | 适用 | 单元测试：C1 + Bootstrap review Run 连接 | passed | C1-AP-004 修复后通过 |
| reconstructCurrentRun 只 catch ENOENT | 适用 | 单元测试：非 ENOENT 读取错误（EISDIR）→ SCHEMA_VALIDATION_FAILED | passed | C1-AP-005 修复后通过 |
| Review verdict 发布前校验 | 适用 | 单元测试：completed review-* 缺 reviewVerdict → reject；非 review 携带 → reject | passed | C1-AP-006 修复后通过 |
| Full Test | 不适用 | — | not-applicable | Full Test 属 Delivery；owner 未授权，未运行 |

## 3. 结果引用与环境

- 环境：Windows 11，Node.js，TypeScript ESM 项目，`npm test` 使用 `node --import tsx --test`。
- 单元测试结果：见本 Run `result.json.verificationResults.test.result`（TAP summary）。
- 实际 Delivery Manifest：`openspec/delivery-groups/20260806-01-deterministic-core.yaml`（嵌套 `delivery.state`/`delivery.fullTestStatus`）。
- Bootstrap Run 语料：`.flowkit/runs/20260806-01-deterministic-core/formal-fact-reader-and-persistence/036-065`（全部 `schemaVersion: 1`，由 bootstrap 手工创建）。

## 4. Full Test

未运行。Full Test 属 Delivery（`docs/verification-model.md` Section 4），需要 owner 明确授权（`fullTestStatus: not-ready → awaiting-user-decision → authorized`）。本 Change 未获得 owner Full Test 授权。`apply`、`revise-apply`、`review-apply`、`archive` 都不得自动触发 Full Test。

## 5. 历史例外（A1）

A1 archived 时未建立 `verification.md` 模型（`docs/verification-model.md` 由 B1 引入）。A1 的归档记录不在本 Change 范围。本 Change 起所有新 Change MUST 创建 `verification.md`。

## 6. 总体 Change Verification 状态

**passed**

所有适用检查为 `passed` 或 `not-applicable`，无 `not-run` 或 `failed`。本 Change 满足进入 `review-apply` / `archive` 的 Verification 前置条件。

注意（`docs/verification-model.md` Section 8）：`Verification passed ≠ Review approved`。reviewer 仍需独立判断产物是否满足契约、边界和质量要求。
