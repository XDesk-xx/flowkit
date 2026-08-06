# Design: B1 — domain-and-state-schema

## Context

B1 是 Delivery `20260806-01-deterministic-core` 的第二个 Change。A1 已交付 TypeScript + Node.js ESM 项目骨架、编译/类型检查/测试工具链和 `src/shared/` 工程基础模块（paths、atomic-write、external-command、errors）。`src/domain/` 是 A1 创建的占位目录。

B1 需要冻结 Delivery / Change / Run 领域对象、主状态、固定 Action Catalog、Run ID 规则和 terminal immutability，作为 C1（fact reader/persistence）、D1（Policy）、E1（诊断 CLI）的类型基底。

冻结输入约束 B1 的设计：
- `flowkit-core-model` spec：三层核心模型、主状态集合、Run 绑定规则、Policy 输出形态
- `flowkit-runtime-foundation` spec：TypeScript `.ts` 源码、NodeNext 导入、`FlowkitError` 已存在
- `docs/delivery-lifecycle.md`：Delivery/Change 状态转换边、激活/完成前置条件
- `docs/verification-model.md`：Change Verification 检查项结构
- `docs/integration-boundaries.md`：ActionDefinition 字段、ResultRef provider-neutral、ContinuationContext 逻辑视图

## Goals

1. 为 11 个领域对象定义 TypeScript `interface`/`type`，含字段级契约和 B1/C1 所有权边界；
2. 定义 Delivery/Change/Run 主状态联合类型，与冻结 spec 完全一致；
3. 为三个实体定义结构状态转换表 + 泛型 `canTransition`，exhaustive matrix 测试覆盖；
4. 固定 Action Catalog（10 Change + 2 Delivery），不含 `review`/`revise`/`change-checkpoint`；
5. 提供 Run ID 纯解析/校验/分配契约（格式校验、唯一性拒绝、候选有限整数 1-999、单调性拒绝、缺号允许、NNN 耗尽 fail-closed），B1 操作 fixture 不执行文件系统遍历；
6. 提供 terminal immutability 校验函数；
7. 提供 Schema 校验函数，拒绝未知主状态；
8. 全部测试使用构造 fixture，不依赖真实 Git 仓库或文件系统。

## Non-Goals

1. 不实现 Policy 引擎（canRun / next / diagnose）——属于 D1；
2. 不实现 FormalFactSnapshot 或 fact reader——属于 C1；
3. 不实现原子持久化或文件系统遍历——属于 C1；
4. 不实现诊断 CLI 命令（status/next/doctor/resume-context）——属于 E1；
5. 不实现 ActionResult 的物理传输 schema 或序列化——属于 C1；
6. 不实现 ContinuationContext 的生成或恢复逻辑——属于 C1；
7. 不实现 ResultRef/OwnerAuthorizationRef 的 adapter 映射——属于 C1；
8. 不实现 Change 执行循环、OpenSpec 集成或 Full Test；
9. 不引入外部运行时依赖（Zod、JSON Schema 等）。

## Decisions

### D1：领域对象用 interface + type（对应 Explore Q1）

使用 TypeScript `interface` 定义数据形状（Delivery、Change、Run 等），使用 `type` 定义联合类型（状态、Action）。不使用 `class`（A1 的 `FlowkitError` 已用 `class` 作为异常，合理）。

理由：领域对象是纯数据，没有行为附着；行为通过独立函数操作数据，符合函数式优先风格；`class` 会引入 `this` 绑定复杂度和不必要的 OOP 耦合。

### D2：Schema 校验用自定义 type guard（对应 Explore Q2）

自定义 TypeScript type guard + 运行时校验函数。不引入 Zod（外部运行时依赖，违反 A1 无运行时依赖原则）。不使用 JSON Schema（premature tooling）。

- `isDeliveryState(value: unknown): value is DeliveryState` — type guard
- `validateRun(run: unknown): Run` — 运行时校验，返回 typed result 或 throw FlowkitError
- `rejectUnknownState(value: string, allowed: string[]): never` — 未知状态直接 throw

### D3：Run ID 纯解析/校验/分配契约（对应 Explore Q3）

B1 提供纯函数契约，操作传入的 Run-ID 字符串列表（fixture），不执行文件系统遍历。文件系统遍历和原子创建/持久化属于 C1。B1 暴露 fail-closed 校验结果。

4 个纯函数：
- `parseRunId(value: string): ParsedRunId` — 校验完整 `YYYYMMDD-NNN-action` 格式，不符 throw `RUN_ID_INVALID_FORMAT`，NNN 越界 throw `RUN_ID_NNN_OUT_OF_RANGE`
- `validateRunIdUniqueness(existingRunIds: readonly string[]): void` — 拒绝 Delivery-wide 重复 NNN（Change 级和 _delivery 级共享），重复 throw `RUN_ID_DUPLICATE_NNN`
- `allocateNextNnn(existingRunIds: readonly string[]): number` — 先校验唯一性再返回 max(NNN)+1，空列表返回 1，nextNnn > 999 throw `RUN_ID_NNN_EXHAUSTED`（不输出无效 ID）
- `validateCandidateNnn(candidateNnn: number, existingRunIds: readonly string[]): void` — 先校验候选是 1-999 有限整数（0/负数/小数/NaN/Infinity 拒绝，throw `RUN_ID_NNN_OUT_OF_RANGE`，与 parseRunId 对齐），再校验单调性（candidateNnn <= max throw `RUN_ID_NNN_NOT_MONOTONIC`），允许缺号

### D4：terminal immutability 校验（对应 Explore Q4）

两个函数：
- `isTerminal(status: RunStatus): boolean` — 检查 `status ∈ {completed, failed, cancelled}`
- `assertMutable(run: Run): void` — 如果 `run.status` 为 terminal，throw `FlowkitError('RUN_TERMINAL')`

持久化层（C1）在写入前调用 `assertMutable`。B1 只提供校验函数，不实现持久化拦截。

### D5：Action Catalog 用 const 数组 + as const（对应 Explore Q5）

使用 `const` 数组 + `as const` + `typeof` 提取联合类型。不使用 `enum`。

- `CHANGE_ACTIONS`：10 项（explore、review-explore、revise-explore、propose、review-propose、revise-propose、apply、review-apply、revise-apply、archive）
- `DELIVERY_ACTIONS`：2 项（full-test、delivery-finalize）
- `review`/`revise` 不在 Catalog 中（统一入口，非正式 Action）
- `change-checkpoint` 不在 Catalog 中（Git 正式边界，非正式 Action；冻结 core-model spec 列 10 个正式 Action 不含它，源冲突以冻结 spec 为权威，B1-RE-001）

### D6：状态转换表用 Record + 泛型 canTransition（对应 Explore Q6）

为 Delivery、Change、Run 三个实体分别定义结构转换表（`Record<State, readonly State[]>`）+ 泛型 `canTransition<S>(table, from, to)`。

- `DELIVERY_STATE_TRANSITIONS`：active → [completed, cancelled]，terminal 无出边
- `CHANGE_STATE_TRANSITIONS`：planned → [active, cancelled]，active → [completed, cancelled]，terminal 无出边
- `RUN_STATE_TRANSITIONS`：pending → [completed, failed, cancelled]，terminal 无出边

B1 只拥有结构转换边（哪些状态可以转到哪些状态）。语义前置条件（owner 授权、Verification passed、dependencies completed）属于 D1 Policy，不进入 B1 的转换表。三个实体分别 exhaustive `State × State` matrix 测试（B1-RE-006）。

### D7：outputs 概念类型（对应 Explore Q7）

`outputs?: string[]` 字段在 Change 类型上。文档注释明确：`outputs` = Change 承诺创建或更新的稳定产品产物范围，不等于完整允许修改文件白名单、Git actualChangeSet、Flowkit control artifacts 清单或每项 Verification 的文件清单。B1 只定义类型和文档，不实现运行时校验。

### D8：Archify 最小字段（对应 Explore Q8）

在 Delivery 类型上定义 `architecture: ArchitectureInfo` 字段：
- `impact: boolean`
- `archifyPlan: 'required' | 'not-required' | 'deferred'`

不创建 `archifyStatus` 字段。不定义 Archify CLI command、JSON schema 或资产目录。

### D9：ResultRef provider-neutral + ReviewVerdict/FindingSummary（对应 Explore Q9）

ResultRef 是 provider-neutral 逻辑引用（`ref` + `versionFingerprint` + `kind?`），不固定到 Run 路径或任何单一传输格式（B1-RE-002）。按 `docs/integration-boundaries.md` Section 5，ResultRef 至少满足：唯一识别被引用结果、能判断结果是否被替换或失效、能让接收方读取或定位结果。具体序列化 schema 和 adapter 映射由 C1 定义。

ReviewVerdict 包含 `verdict`、`blockingFindings`、`nonBlockingFindings`、`reviewedResultRef`。FindingSummary 包含 `id`、`title`、`severity`、`resolution?`。

### D10：测试策略——全部构造 fixture（对应 Explore Q10）

全部使用构造的 fixture，不依赖真实 Git 仓库或文件系统：
- 状态转换测试：三个实体分别遍历所有 `State × State` 组合（exhaustive valid/invalid matrix）
- Run ID 测试：构造 Run-ID 字符串 fixture，验证格式校验、唯一性拒绝、候选输入校验（0/负数/小数/非有限值）、单调性拒绝、缺号允许、NNN 耗尽 fail-closed
- terminal 测试：构造各种 `RunStatus` 的 Run，验证 `isTerminal` 和 `assertMutable`
- Schema 校验测试：构造合法和非法对象，验证接受/拒绝；特别验证 `in-progress` 被拒绝为未知 Run 状态（B1-RE-005）
- Action Catalog 测试：验证 Catalog 完整性、不可变性、`review`/`revise` 不在 Catalog 中

## 领域对象契约矩阵（B1-RE-004）

11 个领域对象的 B1 所有权边界：

| # | 领域对象 | B1 所有权 | 物理序列化/传输 |
|---|---------|----------|----------------|
| 1 | Delivery | B1 完整拥有 | C1 定义持久化 |
| 2 | Change | B1 完整拥有 | C1 定义持久化 |
| 3 | Run | B1 完整拥有 | C1 定义持久化 |
| 4 | ActionDefinition | B1 完整拥有 | 不可变，无传输需求 |
| 5 | ActionResult | B1 拥有逻辑最小字段 | C1 定义传输 schema |
| 6 | ResultRef | B1 完整拥有（provider-neutral） | C1 定义 adapter 映射 |
| 7 | ReviewVerdict | B1 完整拥有 | C1 定义持久化 |
| 8 | FindingSummary | B1 完整拥有 | 随 ReviewVerdict |
| 9 | VerificationSummary | B1 完整拥有 | C1 定义持久化 |
| 10 | OwnerAuthorizationRef | B1 拥有逻辑引用 | C1/D1 定义授权存储 |
| 11 | ContinuationContext | B1 拥有逻辑最小字段 | C1 定义序列化和恢复 |

标记为"B1 拥有逻辑最小字段"或"provider-neutral"的对象（ActionResult、ResultRef、OwnerAuthorizationRef、ContinuationContext）：B1 定义字段形状和语义约束，不固定物理传输格式、序列化 schema 或 adapter 映射——这些由 C1 定义。

## 状态集合冻结来源

| 状态类型 | 冻结值 | 冻结来源 |
|---------|--------|---------|
| DeliveryState | `active \| completed \| cancelled` | core-model spec + delivery-lifecycle.md Section 2 |
| ChangeState | `planned \| active \| completed \| cancelled` | core-model spec + delivery-lifecycle.md Section 3 |
| RunStatus | `pending \| completed \| failed \| cancelled` | core-model.md Section 3.3（不含 `in-progress`，B1-RE-005） |
| ExecutionStatus | `in-progress \| completed \| failed \| blocked` | ActionResult 执行状态，独立于 RunStatus |
| FullTestStatus | `not-ready \| awaiting-user-decision \| authorized \| passed \| failed` | core-model spec |
| VerificationStatus | `not-run \| passed \| failed \| not-applicable` | core-model spec + verification-model.md |
