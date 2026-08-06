# Tasks: B1 — domain-and-state-schema

## 1. 领域对象类型定义

- [x]1.1 创建 `src/domain/types.ts`：定义 `DeliveryState`、`ChangeState`、`RunStatus`、`ExecutionStatus`、`FullTestStatus`、`VerificationStatus`、`Role` 联合类型（与冻结 spec 一致，RunStatus 不含 in-progress）
- [x]1.2 在 `types.ts` 定义 `ArchitectureInfo`（impact + archifyPlan，不含 archifyStatus）和 `ChangeSummary` interface
- [x]1.3 在 `types.ts` 定义 `Delivery` interface（id、state、createdAt、branch、fullTestStatus、architecture、changes）
- [x]1.4 在 `types.ts` 定义 `Change` interface（key、id、goal、required、dependsOn、state、outputs?）
- [x]1.5 在 `types.ts` 定义 `Run` interface（runId、deliveryId、changeId?、action、role、status、inputRef?）
- [x]1.6 在 `types.ts` 定义 `ActionDefinition` interface（action、role、goal、preconditions、allowedOutputs、completionConditions，与 integration-boundaries.md Section 3.1 一致）
- [x]1.7 在 `types.ts` 定义 `ActionResult` interface（runRef、action、executionStatus、summary、producedResultRefs?、consumedInputRefs?、verificationSummaryRef?、reviewVerdictRef?、failureDiagnosis?、nextActionRecommendation?）——逻辑最小字段，物理传输由 C1 定义
- [x]1.8 在 `types.ts` 定义 `ResultRef` interface（ref、versionFingerprint、kind?，provider-neutral，不含 mandatory runPath）
- [x]1.9 在 `types.ts` 定义 `ReviewVerdictValue`、`FindingSummary`、`ReviewVerdict` interface（verdict、blockingFindings、nonBlockingFindings、reviewedResultRef）
- [x]1.10 在 `types.ts` 定义 `VerificationCheck`、`VerificationSummary` interface（与 verification-model.md Section 7 一致：name、scope、applicability、commands、status、summary + overallStatus）
- [x]1.11 在 `types.ts` 定义 `OwnerAuthorizationRef` interface（ref、scope、authorizedAt?，provider-neutral）
- [x]1.12 在 `types.ts` 定义 `ContinuationContext` interface（deliveryId、changeId?、lastCompletedAction?、lastActionResultRef?、activeVerdict?、pendingNonBlockingFindings、validOwnerAuthorizations、currentConstraints、nextAllowedAction、nextActionInputRefs）——逻辑最小字段，nextAllowedAction 由 Policy 计算

## 2. 主状态与结构转换表

- [x]2.1 创建 `src/domain/states.ts`：导出 `DELIVERY_STATE_TRANSITIONS`（active → [completed, cancelled]，terminal 无出边）
- [x]2.2 在 `states.ts` 导出 `CHANGE_STATE_TRANSITIONS`（planned → [active, cancelled]，active → [completed, cancelled]，terminal 无出边）
- [x]2.3 在 `states.ts` 导出 `RUN_STATE_TRANSITIONS`（pending → [completed, failed, cancelled]，terminal 无出边）
- [x]2.4 在 `states.ts` 导出泛型 `canTransition<S extends string>(table: Record<S, readonly S[]>, from: S, to: S): boolean`

## 3. 固定 Action Catalog

- [x]3.1 创建 `src/domain/actions.ts`：导出 `CHANGE_ACTIONS`（10 项，`as const`）和 `ChangeAction` 联合类型
- [x]3.2 在 `actions.ts` 导出 `DELIVERY_ACTIONS`（2 项，`as const`）和 `DeliveryAction` 联合类型
- [x]3.3 确认 Catalog 不含 `review`、`revise`、`change-checkpoint`（注释说明源冲突解决，B1-RE-001）

## 4. Run ID 纯函数

- [x]4.1 创建 `src/domain/run-id.ts`：导出 `ParsedRunId` interface（date、nnn、action）
- [x]4.2 在 `run-id.ts` 导出 `parseRunId(value: string): ParsedRunId`（校验 YYYYMMDD-NNN-action 格式，不符 throw RUN_ID_INVALID_FORMAT，NNN 越界 throw RUN_ID_NNN_OUT_OF_RANGE）
- [x]4.3 在 `run-id.ts` 导出 `validateRunIdUniqueness(existingRunIds: readonly string[]): void`（拒绝 Delivery-wide 重复 NNN，重复 throw RUN_ID_DUPLICATE_NNN）
- [x]4.4 在 `run-id.ts` 导出 `allocateNextNnn(existingRunIds: readonly string[]): number`（先校验唯一性再返回 max+1，空列表返回 1，> 999 throw RUN_ID_NNN_EXHAUSTED）
- [x]4.5 在 `run-id.ts` 导出 `validateCandidateNnn(candidateNnn: number, existingRunIds: readonly string[]): void`（先校验候选为 1-999 有限整数，否则 throw RUN_ID_NNN_OUT_OF_RANGE；再校验单调性，candidateNnn <= max throw RUN_ID_NNN_NOT_MONOTONIC；允许缺号）
- [x]4.6 确认 `run-id.ts` 不调用任何文件系统 API（fs.readdir、fs.readFile 等）

## 5. terminal immutability 校验

- [x]5.1 创建 `src/domain/terminal.ts`：导出 `isTerminal(status: RunStatus): boolean`（completed/failed/cancelled 返回 true）
- [x]5.2 在 `terminal.ts` 导出 `assertMutable(run: Run): void`（terminal 状态 throw FlowkitError('RUN_TERMINAL')）

## 6. Schema 校验

- [x]6.1 创建 `src/domain/schema-validator.ts`：导出 type guard 函数 `isDeliveryState`、`isChangeState`、`isRunStatus`、`isExecutionStatus`
- [x]6.2 在 `schema-validator.ts` 导出 `rejectUnknownState(value: string, allowed: string[]): never`（未知状态 throw FlowkitError）
- [x]6.3 在 `schema-validator.ts` 导出 `validateRun(run: unknown): Run`（运行时校验，拒绝未知主状态，特别拒绝 in-progress 为 Run 状态）

## 7. 测试

- [x]7.1 创建 `tests/unit/domain/states.test.ts`：Delivery/Change/Run 三个转换表的 exhaustive `State × State` matrix 测试（B1-RE-006）
- [x]7.2 创建 `tests/unit/domain/actions.test.ts`：Action Catalog 完整性、不可变性、review/revise/change-checkpoint 不在 Catalog 中
- [x]7.3 创建 `tests/unit/domain/run-id.test.ts`：格式校验（合法/非法）、唯一性拒绝、候选输入校验（0/负数/小数/NaN/Infinity）、单调性拒绝、缺号允许、NNN 耗尽 fail-closed、空列表返回 1（B1-RE-007、B1-RE-008）
- [x]7.4 创建 `tests/unit/domain/terminal.test.ts`：isTerminal 识别 terminal 状态、assertMutable 拒绝 terminal Run
- [x]7.5 创建 `tests/unit/domain/schema-validator.test.ts`：合法/非法对象接受/拒绝、in-progress 被拒绝为未知 Run 状态（B1-RE-005）
- [x]7.6 创建 `tests/unit/domain/types.test.ts`：类型守卫和类型 narrowing 测试，确认 11 个领域对象类型可编译

## 8. 验证

- [x]8.1 运行 `npm run typecheck`（覆盖生产和测试 TypeScript）
- [x]8.2 运行 `npm run build`（编译到 `dist/`）
- [x]8.3 运行 `npm test`（所有 domain 单元测试通过）
- [x]8.4 运行 `npm run lint`（无 lint 错误）
- [x]8.5 检查不存在 Policy 引擎（canRun/next/diagnose）
- [x]8.6 检查不存在 FormalFactSnapshot、fact reader 或文件系统持久化实现
- [x]8.7 检查 B1 未新增外部运行时依赖（package.json dependencies 无 Zod/JSON Schema 库）
- [x]8.8 检查 Run ID 函数不调用文件系统 API
