# B1 Explore：领域对象与状态 Schema

## 1. 基本信息

- Delivery：`20260806-01-deterministic-core`
- Change key：`B1`
- Change ID：`domain-and-state-schema`
- 依赖：`A1 runtime-foundation`（completed）
- 目标：冻结 Delivery / Change / Run 领域对象、主状态、固定 Action Catalog、Run ID 规则和 terminal immutability

## 2. 冻结输入

### 2.1 flowkit-core-model（Product Baseline 冻结 spec）

路径：`openspec/specs/flowkit-core-model/spec.md`

关键约束：

- 三层核心模型：`Delivery > Change > Action`；Run 不是第四层
- Delivery 主状态：`active | completed | cancelled`
- Change 主状态：`planned | active | completed | cancelled`
- Run 绑定 Delivery、零或一个 Change、一个正式 Action、一个角色
- 不持久化 `currentAction` 或 pointer
- Policy 输出：一个合法 Action、一个 owner 决策边界、一个 blocked diagnosis
- `review` / `revise` 是统一入口，不是正式 Action
- Reviewer Run 在真正执行时创建，不预建
- Change Verification 状态：`not-run | passed | failed | not-applicable`
- `fullTestStatus`：`not-ready | awaiting-user-decision | authorized | passed | failed`
- Full Test failed 不自动创建 corrective Change
- Skill 保持 Action 内方法边界
- Checkout 后确定性恢复，不依赖聊天历史或 pointer

### 2.2 flowkit-runtime-foundation（A1 冻结 spec）

路径：`openspec/specs/flowkit-runtime-foundation/spec.md`

关键约束：

- TypeScript `.ts` 源码，NodeNext 导入用 `.js` specifier
- `type: module`，`engines.node >= 22.0.0`
- `tsconfig.json`：ES2022, NodeNext, strict, types ["node"], rootDir src, outDir dist
- `tsconfig.test.json`：extends + rootDir ".", noEmit, include tests
- 测试：`node:test` + `tsx`
- Lint：ESLint flat config + `@typescript-eslint`
- shared 模块已存在：`paths.ts`、`atomic-write.ts`、`external-command.ts`、`errors.ts`
- 无运行时外部依赖
- `src/domain/` 占位目录已创建（含 `.gitkeep` + `README.md`）

### 2.3 docs/delivery-lifecycle.md

路径：`docs/delivery-lifecycle.md`

关键约束：

- 一个仓库最多一个 active Delivery
- 一个 active Delivery 中最多一个 active Change
- `planned → active` 要求 Delivery active、无其他 active Change、dependencies completed、owner 授权
- Change completed 要求 review-apply approved、Blocking Findings 为 0、Verification passed/not-applicable、Tasks 完成、owner 授权 Archive、OpenSpec Archive + Change Checkpoint
- Review approved 但未 Archive/Checkpoint 时 Change 仍为 active
- cancelled Change 不满足 dependency completion
- 同一角色、同一 Action、同一目标的多轮工作属于同一 Run
- Git Commit 不决定 Action 或 Run 数量

### 2.4 docs/verification-model.md

路径：`docs/verification-model.md`

关键约束：

- Change Verification 必须在 `apply` 和 `revise-apply` 后执行
- 验证状态：`not-run | passed | failed | not-applicable`
- 每项检查必须有 scope、applicability、commands/methods、status、summary
- Run 的 result.json 不能替代 `verification.md`

### 2.5 实现参考

路径：`ref/01-deterministic-core-delivery-implementation-reference.md` Section 6

B1 领域对象清单：

```text
Delivery
Change
Run
ActionDefinition
ActionResult
ResultRef
ReviewVerdict
FindingSummary
VerificationSummary
OwnerAuthorizationRef
ContinuationContext
```

不得把以下位置变成主状态：

```text
reviewing
revising
verifying
ready-for-archive
ready-for-finalize
```

## 3. B1 范围

### 3.1 In scope

```text
Delivery / Change / Run 领域对象 TypeScript 类型定义
Delivery / Change / Run 主状态 Schema 和状态转换表
固定 Action Catalog（Change 级 + Delivery 级类型边界）
Run ID 解析/校验/分配纯函数契约（格式校验、唯一性拒绝、单调性拒绝、缺号允许、NNN 耗尽 fail-closed，B1-RE-007）
terminal immutability 校验函数
outputs 概念类型定义（不实现 actualChangeSet）
Archify 最小字段类型定义（不实现状态机）
ResultRef / ReviewVerdict / FindingSummary / VerificationSummary 类型定义
OwnerAuthorizationRef / ContinuationContext 类型定义
领域对象契约矩阵：11 个对象的最小字段、B1/C1 所有权边界和校验期望（B1-RE-004，见 Section 5.1）
ActionResult / ContinuationContext 仅定义逻辑最小字段，物理传输和序列化由 C1 定义
ActionDefinition 包含 role/goal/preconditions/allowedOutputs/completionConditions
Schema 校验函数（拒绝未知主状态）
状态转换表驱动测试
Run ID 解析/校验/分配 fixture 测试（格式、唯一性、单调性、缺号、耗尽）
terminal immutability 测试
```

### 3.2 Out of scope

```text
Policy 引擎（canRun / next / diagnose）— D1
FormalFactSnapshot 和 fact reader — C1
原子持久化实现 — C1
诊断 CLI（status / next / doctor / resume-context）— E1
actualChangeSet 计算 — Change Execution Loop Delivery
Full Test 执行 — F1
Delivery Finalize 执行 — F1
Archify 状态机或 Adapter — 后续 Delivery
OpenSpec CLI 集成 — C1
Review/Revision 执行逻辑 — D1
owner 授权交互界面 — D1
```

## 4. 推荐结构

```text
src/domain/
  types.ts              — 全部领域对象 TypeScript 类型定义
  states.ts             — 主状态联合类型 + Delivery/Change/Run 三个结构转换表 + canTransition
  actions.ts            — 固定 Action Catalog
  run-id.ts             — Run ID 解析/校验/分配纯函数（不执行文件系统遍历）
  terminal.ts           — terminal immutability 校验
  schema-validator.ts   — Schema 校验函数（拒绝未知主状态）

tests/unit/domain/
  states.test.ts        — Delivery/Change/Run 三个转换表的 exhaustive matrix 测试
  actions.test.ts       — Action Catalog 完整性测试
  run-id.test.ts        — Run ID 解析/校验/分配 fixture 测试（格式、唯一性、单调性、缺号、耗尽）
  terminal.test.ts      — terminal immutability 测试
  schema-validator.test.ts — Schema 校验测试
  types.test.ts         — 类型守卫和类型 narrowing 测试
```

## 5. 关键问题与推荐答案

### Q1：领域对象用 interface、type 还是 class？

**推荐**：使用 TypeScript `interface` 定义数据形状（Delivery、Change、Run 等），使用 `type` 定义联合类型（状态、状态）。不使用 `class`（FlowkitError 已在 A1 存在）。

理由：
- 领域对象是纯数据，没有行为附着
- 行为通过独立函数操作数据，符合函数式优先风格
- `interface` 支持声明合并，便于扩展
- `class` 会引入 `this` 绑定复杂度和不必要的 OOP 耦合
- A1 的 `FlowkitError` 已用 `class`，作为异常是合理的

### Q2：Schema 校验用什么方案？

**推荐**：自定义 TypeScript type guard + 运行时校验函数。不引入 Zod（外部运行时依赖，违反 A1 无运行时依赖原则）。不使用 JSON Schema（premature tooling）。

具体方案：
- `isDeliveryState(value: unknown): value is DeliveryState` — type guard
- `validateRun(run: unknown): Run` — 运行时校验，返回 typed result 或 throw FlowkitError
- `rejectUnknownState(value: string, allowed: string[]): never` — 未知状态直接 throw

### Q3：Run ID 分配和校验如何实现？

**推荐**：B1 提供**纯解析/校验/分配契约**，操作传入的 Run-ID 字符串列表（fixture），不执行文件系统遍历。文件系统遍历和原子创建/持久化属于 C1。B1 暴露 fail-closed 校验结果（B1-RE-007）。

#### 格式

```text
YYYYMMDD-NNN-action
```

- `YYYYMMDD`：8 位日期
- `NNN`：3 位零填充序号（001-999）
- `action`：正式 Action 名称（小写字母 + 连字符）

#### 纯函数契约

```typescript
export interface ParsedRunId {
  readonly date: string;      // YYYYMMDD（8 位数字）
  readonly nnn: number;       // 1-999
  readonly action: string;    // Action 名称
}

/**
 * 解析并校验 Run ID 字符串的完整格式。
 * 不匹配 YYYYMMDD-NNN-action 时 throw FlowkitError('RUN_ID_INVALID_FORMAT')。
 * NNN 超出 001-999 范围时 throw FlowkitError('RUN_ID_NNN_OUT_OF_RANGE')。
 */
export function parseRunId(value: string): ParsedRunId;

/**
 * 校验已分配的 Run ID 集合的 Delivery-wide NNN 唯一性。
 * 扫描 Change 级和 _delivery 级 Run 的 NNN，发现重复时
 * throw FlowkitError('RUN_ID_DUPLICATE_NNN')。
 * 调用方（C1）负责从文件系统收集 Run-ID 列表传入。
 */
export function validateRunIdUniqueness(existingRunIds: readonly string[]): void;

/**
 * 分配下一个 NNN。先校验现有集合的唯一性，再返回 max(NNN)+1。
 * 无已有 Run 时返回 1。
 * nextNnn > 999 时 throw FlowkitError('RUN_ID_NNN_EXHAUSTED')，
 * 不输出无效 ID。
 */
export function allocateNextNnn(existingRunIds: readonly string[]): number;

/**
 * 校验候选 NNN。先验证 candidateNnn 是 1-999 范围内的有限整数，
 * 再验证严格大于所有已分配 NNN（单调递增）。
 * candidateNnn 不是有限整数或不在 1-999 范围内时
 *   throw FlowkitError('RUN_ID_NNN_OUT_OF_RANGE')
 *   （0、负数、小数、NaN、Infinity 均被拒绝，与 parseRunId 的 001-999 语法对齐，B1-RE-008）。
 * candidateNnn <= max(NNN) 时 throw FlowkitError('RUN_ID_NNN_NOT_MONOTONIC')。
 * 允许缺号（candidateNnn > max(NNN)+1 合法，跳过的编号不回填）。
 */
export function validateCandidateNnn(
  candidateNnn: number,
  existingRunIds: readonly string[],
): void;
```

#### 规则

- `NNN` 在 Delivery 内唯一（Change 级和 _delivery 级 Run 间共享）
- `NNN` 严格递增（已分配编号不复用，候选必须 > max(NNN)）
- 候选 NNN 必须是 1-999 范围内的有限整数（0、负数、小数、非有限值被拒绝，与 parseRunId 的 001-999 语法对齐，B1-RE-008）
- 允许缺号（跳过的编号不回填，candidateNnn > max+1 合法）
- `NNN` 不按日期、Change、Action 或角色重置
- `NNN` 上限 999，超出时 fail-closed（throw，不输出无效 ID）
- B1 不执行文件系统遍历，操作传入的 Run-ID 字符串列表
- C1 负责文件系统遍历、原子创建和持久化

#### 测试（fixture）

- 格式校验：合法和非法 Run ID 字符串（缺位、多余段、非数字 NNN、action 含大写等）
- 唯一性校验：构造含重复 NNN 的列表，验证 throw
- 单调性校验：构造 candidateNnn <= max(NNN) 的场景，验证 throw
- 候选输入校验：构造 candidateNnn = 0、负数、小数、非有限值（NaN/Infinity），验证 throw（B1-RE-008）
- 缺号保留：构造 max=5 但 3 被跳过的列表，验证 candidateNnn=6 合法、candidateNnn=3 被拒绝
- 耗尽校验：构造 max=999 的列表，验证 allocateNextNnn throw
- 空列表：allocateNextNnn 返回 1

### Q4：terminal immutability 如何校验？

**推荐**：提供两个函数：

- `isTerminal(status: RunStatus): boolean` — 检查 `status ∈ {completed, failed, cancelled}`
- `assertMutable(run: Run): void` — 如果 `run.status` 为 terminal，throw `FlowkitError('RUN_TERMINAL', ...)`

持久化层（C1）在写入前调用 `assertMutable`。B1 只提供校验函数，不实现持久化拦截。

### Q5：Action Catalog 如何表示？

**推荐**：使用 `const` 数组 + `as const` + `typeof` 提取联合类型。不使用 `enum`。

```typescript
export const CHANGE_ACTIONS = [
  'explore',
  'review-explore',
  'revise-explore',
  'propose',
  'review-propose',
  'revise-propose',
  'apply',
  'review-apply',
  'revise-apply',
  'archive',
] as const;

export type ChangeAction = (typeof CHANGE_ACTIONS)[number];

export const DELIVERY_ACTIONS = [
  'full-test',
  'delivery-finalize',
] as const;

export type DeliveryAction = (typeof DELIVERY_ACTIONS)[number];
```

理由：
- `as const` 提供字面量类型推断，编译时类型安全
- `const` 数组在运行时可遍历、可检查
- `enum` 会生成额外运行时代码，且与 tree-shaking 不友好
- `review` 和 `revise` 不在 Catalog 中（它们是统一入口，不是正式 Action）
- `change-checkpoint` 不在 Catalog 中（见 6.5 的源冲突解决）

**源冲突解决（B1-RE-001）**：冻结 `flowkit-core-model` spec 的 Action Catalog Requirement 列出 4 个主 Action（`explore | propose | apply | archive`）+ 6 个辅助 Action（`review-explore` / `revise-explore` / `review-propose` / `revise-propose` / `review-apply` / `revise-apply`），共 10 个，**不含 `change-checkpoint`**。实现参考 Section 6.3 列出 11 个含 `change-checkpoint`。两者冲突时，**冻结 spec 是权威**，实现参考是参考。`change-checkpoint` 是 Git 正式边界（AGENTS.md 规则 #7），不是正式 Action——没有 `review-checkpoint` 或 `revise-checkpoint`。B1 的 Action Catalog 与冻结 spec 完全一致（10 个 Change Action）。

### Q6：状态转换表如何表示？

**推荐**：使用 `Record<State, readonly State[]>` 映射表 + 泛型 `canTransition(table, from, to)` 函数。B1 为 Delivery、Change、Run 三个实体分别定义结构转换表（B1-RE-006）。

```typescript
// Delivery 结构转换表（与 docs/delivery-lifecycle.md Section 2 一致）
const DELIVERY_STATE_TRANSITIONS: Record<DeliveryState, readonly DeliveryState[]> = {
  active: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

// Change 结构转换表（与 docs/delivery-lifecycle.md Section 3 一致）
const CHANGE_STATE_TRANSITIONS: Record<ChangeState, readonly ChangeState[]> = {
  planned: ['active', 'cancelled'],
  active: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

// Run 结构转换表（与 docs/core-model.md Section 3.3 一致）
// Run 从 pending 转入 terminal（completed | failed | cancelled），terminal 无出边
const RUN_STATE_TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  pending: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
};

export function canTransition<S extends string>(
  table: Record<S, readonly S[]>,
  from: S,
  to: S,
): boolean {
  return table[from].includes(to);
}
```

B1 只拥有**结构转换边**（哪些状态可以转到哪些状态）。语义前置条件（owner 授权、Verification passed、dependencies completed 等）属于 D1 Policy，不进入 B1 的转换表。terminal 状态（Delivery completed/cancelled、Change completed/cancelled、Run completed/failed/cancelled）无出边。

测试对三个实体分别遍历所有 `State × State` 组合，验证 `canTransition` 返回值（exhaustive valid/invalid matrix tests，B1-RE-006）。

### Q7：outputs 概念如何表示？

**推荐**：`outputs?: string[]` 字段在 Change 类型上。文档注释明确：

- `outputs` = Change 承诺创建或更新的稳定产品产物范围
- `outputs ≠ 完整允许修改文件白名单`
- `outputs ≠ Git actualChangeSet`
- `outputs ≠ Flowkit control artifacts 清单`
- `outputs ≠ 每项 Verification 的文件清单`

B1 只定义类型和文档，不实现运行时校验。

### Q8：Archify 最小字段如何表示？

**推荐**：在 Delivery 类型上定义 `architecture` 字段：

```typescript
export interface ArchitectureInfo {
  impact: boolean;
  archifyPlan: 'required' | 'not-required' | 'deferred';
}

export interface Delivery {
  // ...
  architecture: ArchitectureInfo;
}
```

不创建 `archifyStatus` 字段。不定义 Archify CLI command、JSON schema 或资产目录。

### Q9：ResultRef 和 ReviewVerdict 如何表示？

**推荐**：

ResultRef 是 provider-neutral 逻辑引用，不固定到 Run 路径或任何单一传输格式（B1-RE-002）。按 `docs/integration-boundaries.md` Section 5，ResultRef 至少满足：唯一识别被引用结果、能判断结果是否被替换或失效、能让接收方读取或定位结果。具体环境可映射为 Git revision、Run result、artifact version、content hash 或其他不可歧义的版本引用。B1 只定义逻辑能力边界，具体序列化 schema 和 adapter 映射由 C1 定义。

```typescript
/**
 * ResultRef 是引用正式结果的逻辑抽象。
 * 不固定到 Run 路径或任何单一传输格式。
 * 具体序列化 schema 和 adapter 映射由 C1 定义。
 */
export interface ResultRef {
  /**
   * 唯一识别被引用结果的稳定标识。
   * 可映射为 Run result、Git revision、artifact version、
   * content hash 或其他不可歧义的正式版本引用。
   */
  readonly ref: string;
  /**
   * 用于判断结果是否被替换或失效的版本指纹。
   * 例如 content SHA-256、Git commit SHA 等。
   * 当被引用结果变化时，此值 MUST 变化，
   * 依赖此 ResultRef 的 Review 或续接 MUST 标记为需要重新处理。
   */
  readonly versionFingerprint: string;
  /**
   * 可选的结果类型标记，帮助接收方理解 ref 的语义。
   * 不限制具体值，由 C1 的 adapter 定义。
   */
  readonly kind?: string;
}

export type ReviewVerdictValue = 'approved' | 'changes-requested';

export interface FindingSummary {
  id: string;
  title: string;
  severity: 'blocking' | 'non-blocking';
  resolution?: string;
}

export interface ReviewVerdict {
  verdict: ReviewVerdictValue;
  blockingFindings: FindingSummary[];
  nonBlockingFindings: FindingSummary[];
  reviewedResultRef: ResultRef;
}
```

理由：
- `ref` 是稳定标识，不假设路径格式；C1 的 adapter 可将其映射为 Run 路径、Git SHA 或 artifact ID
- `versionFingerprint` 提供变更检测能力，满足"能判断结果是否被替换或失效"
- `kind` 是可选的类型标记，不强制，由 C1 填充
- 不包含 `runPath` 作为 mandatory 字段，避免耦合到文件系统布局
- Review 绑定通过 `reviewedResultRef: ResultRef` 引用被审查结果，符合 integration-boundaries.md Section 8

### Q10：测试策略？

**推荐**：全部使用构造的 fixture，不依赖真实 Git 仓库或文件系统。

- 状态转换测试：对 Delivery、Change、Run 三个实体分别遍历所有 `State × State` 组合，验证 `canTransition` 返回值（exhaustive valid/invalid matrix，B1-RE-006）
- Run ID 测试：构造 Run-ID 字符串 fixture，验证格式校验、唯一性拒绝、候选输入校验（0/负数/小数/非有限值）、单调性拒绝、缺号允许、NNN 耗尽 fail-closed（B1-RE-007、B1-RE-008）
- terminal 测试：构造各种 `RunStatus` 的 Run，验证 `isTerminal` 和 `assertMutable`
- Schema 校验测试：构造合法和非法对象，验证接受/拒绝；特别验证 `in-progress` 被拒绝为未知 Run 状态（B1-RE-005）
- Action Catalog 测试：验证 Catalog 完整性、不可变性、`review`/`revise` 不在 Catalog 中

### 5.1 领域对象契约矩阵（B1-RE-004）

B1 承诺为 11 个领域对象定义 TypeScript 类型。以下矩阵明确每个对象的 B1 所有权边界、最小字段和校验期望，使 Proposal 和表驱动测试有明确依据，不会在 Apply 阶段临时发明字段或 B1/C1 所有权边界。

#### 5.1.1 所有权矩阵

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

B1 为所有 11 个对象定义 TypeScript `interface`。标记为"B1 拥有逻辑最小字段"或"provider-neutral"的对象（ActionResult、ResultRef、OwnerAuthorizationRef、ContinuationContext）：B1 定义字段形状和语义约束，不固定物理传输格式、序列化 schema 或 adapter 映射——这些由 C1 定义。B1 不实现 C1 的 adapter、persistence 或 transport。

#### 5.1.2 状态和辅助类型

```typescript
// 主状态（与冻结 core-model spec 一致）
export type DeliveryState = 'active' | 'completed' | 'cancelled';
export type ChangeState = 'planned' | 'active' | 'completed' | 'cancelled';
export type FullTestStatus = 'not-ready' | 'awaiting-user-decision' | 'authorized' | 'passed' | 'failed';
export type VerificationStatus = 'not-run' | 'passed' | 'failed' | 'not-applicable';

// Run 状态（与冻结 docs/core-model.md Section 3.3 一致：pending | completed | failed | cancelled）
// terminal = completed | failed | cancelled（与 Q4 一致）；不含 in-progress（B1-RE-005）
// in-progress 仅存在于 ActionResult.ExecutionStatus，不进入 Run 状态
export type RunStatus = 'pending' | 'completed' | 'failed' | 'cancelled';

// ActionResult 执行状态（独立于 RunStatus，可含 in-progress）
export type ExecutionStatus = 'in-progress' | 'completed' | 'failed' | 'blocked';

// 角色
export type Role = 'owner' | 'author' | 'reviewer';
```

#### 5.1.3 Delivery（B1 完整拥有）

```typescript
export interface ChangeSummary {
  readonly key: string;
  readonly id: string;
  readonly required: boolean;
  readonly dependsOn: readonly string[];
  readonly state: ChangeState;
  readonly outputs?: readonly string[];
}

export interface Delivery {
  readonly id: string;
  readonly state: DeliveryState;
  readonly createdAt: string;
  readonly branch: string;
  readonly fullTestStatus: FullTestStatus;
  readonly architecture: ArchitectureInfo;
  readonly changes: readonly ChangeSummary[];
}
```

校验期望：`state ∈ DeliveryState`；`fullTestStatus ∈ FullTestStatus`；`architecture` 不含 `archifyStatus`（Q8）；`changes` 中最多一个 `active`（core-model spec）。

#### 5.1.4 Change（B1 完整拥有）

```typescript
export interface Change {
  readonly key: string;
  readonly id: string;
  readonly goal: string;
  readonly required: boolean;
  readonly dependsOn: readonly string[];
  state: ChangeState;
  readonly outputs?: readonly string[];
}
```

校验期望：`state ∈ ChangeState`；`dependsOn` 引用已完成 Change（Policy 校验，B1 只定义类型）；`outputs` 语义边界见 Q7（不是文件白名单、不是 actualChangeSet）。`state` 可变以支持状态转换（Q6 `canTransition`）。

#### 5.1.5 Run（B1 完整拥有）

```typescript
export interface Run {
  readonly runId: string;
  readonly deliveryId: string;
  readonly changeId?: string;
  readonly action: ChangeAction | DeliveryAction;
  readonly role: Role;
  status: RunStatus;
  readonly inputRef?: ResultRef;
}
```

校验期望：`action ∈ Action Catalog`（Q5）；`role ∈ Role`；`status ∈ RunStatus`；`changeId` 为 `undefined` 时表示 Delivery 级 Run（路径 `.flowkit/runs/<delivery-id>/_delivery/`）；terminal 状态不可变（Q4 `assertMutable`）；Run ID 格式 `YYYYMMDD-NNN-action`（Q3）。

#### 5.1.6 ActionDefinition（B1 完整拥有）

```typescript
export interface ActionDefinition {
  readonly action: ChangeAction | DeliveryAction;
  readonly role: Role;
  readonly goal: string;
  readonly preconditions: readonly string[];
  readonly allowedOutputs: readonly string[];
  readonly completionConditions: readonly string[];
}
```

与 `docs/integration-boundaries.md` Section 3.1 一致：ActionDefinition 是某类 Action 的稳定规则，包括角色、目标、前置条件、允许输出和完成条件。B1 固定 12 个 ActionDefinition（10 Change + 2 Delivery，Q5）。B1 不实现 Action Package（C1 的逻辑执行输入视图，integration-boundaries.md Section 3.2）。

#### 5.1.7 ActionResult（B1 拥有逻辑最小字段）

```typescript
export interface ActionResult {
  readonly runRef: ResultRef;
  readonly action: ChangeAction | DeliveryAction;
  readonly executionStatus: ExecutionStatus;
  readonly summary: string;
  readonly producedResultRefs?: readonly ResultRef[];
  readonly consumedInputRefs?: readonly ResultRef[];
  readonly verificationSummaryRef?: ResultRef;
  readonly reviewVerdictRef?: ResultRef;
  readonly failureDiagnosis?: string;
  readonly nextActionRecommendation?: string;
}
```

与 `docs/integration-boundaries.md` Section 4 一致：ActionResult 记录"发生了什么"，不决定"接下来做什么"。`nextActionRecommendation` 仅为建议，不替代 Policy。B1 定义逻辑字段形状；物理传输格式和序列化 schema 由 C1 定义。B1 不实现 ActionResult 的持久化或传输。

#### 5.1.8 ResultRef / ReviewVerdict / FindingSummary（B1 完整拥有，已在 Q9 定义）

见 Q9。ResultRef 是 provider-neutral 逻辑引用（`ref` + `versionFingerprint` + `kind?`），不固定 `runPath`。ReviewVerdict 包含 `verdict`、`blockingFindings`、`nonBlockingFindings`、`reviewedResultRef`。FindingSummary 包含 `id`、`title`、`severity`、`resolution?`。

#### 5.1.9 VerificationSummary（B1 完整拥有）

```typescript
export interface VerificationCheck {
  readonly name: string;
  readonly scope: string;
  readonly applicability: 'applicable' | 'not-applicable';
  readonly commands: readonly string[];
  readonly status: VerificationStatus;
  readonly summary: string;
}

export interface VerificationSummary {
  readonly checks: readonly VerificationCheck[];
  readonly overallStatus: VerificationStatus;
}
```

与 `docs/verification-model.md` Section 7 一致：每项检查有 scope、applicability、commands/methods、status、summary。`overallStatus` 为 `not-run | passed | failed | not-applicable`（core-model spec）。Run 的 `result.json` 不能替代 `verification.md`（verification-model.md Section 7）。

#### 5.1.10 OwnerAuthorizationRef（B1 拥有逻辑引用）

```typescript
export interface OwnerAuthorizationRef {
  readonly ref: string;
  readonly scope: string;
  readonly authorizedAt?: string;
}
```

Provider-neutral 逻辑引用，与 ResultRef 同理。`ref` 是稳定标识（可映射为授权记录 ID、签名声明或其他不可歧义的引用）。`scope` 标明授权范围（如 `'activate-change' | 'apply' | 'archive' | 'full-test' | 'delivery-finalize' | 'cancel'`，但不限于此枚举——具体值由 D1 定义）。`authorizedAt` 可选。B1 不定义授权存储、验证逻辑或交互界面（D1）。

#### 5.1.11 ContinuationContext（B1 拥有逻辑最小字段）

```typescript
export interface ContinuationContext {
  readonly deliveryId: string;
  readonly changeId?: string;
  readonly lastCompletedAction?: ChangeAction | DeliveryAction;
  readonly lastActionResultRef?: ResultRef;
  readonly activeVerdict?: ReviewVerdict;
  readonly pendingNonBlockingFindings: readonly FindingSummary[];
  readonly validOwnerAuthorizations: readonly OwnerAuthorizationRef[];
  readonly currentConstraints: readonly string[];
  readonly nextAllowedAction: ChangeAction | DeliveryAction;
  readonly nextActionInputRefs: readonly ResultRef[];
}
```

与 `docs/integration-boundaries.md` Section 6 一致：ContinuationContext 是从正式事实生成的可恢复视图，不是新的状态权威。`nextAllowedAction` 必须由 Policy 计算，不得由 ContinuationContext 自行填写（integration-boundaries.md Section 6 规则）。B1 定义逻辑最小字段；物理序列化、恢复实现和长期持久化由 C1 定义。B1 不实现 ContinuationContext 的生成或恢复逻辑。

## 6. 跨 Change Finding

### 6.1 D1 将消费 B1 的状态转换表

D1 的 Policy 引擎需要 B1 的状态转换表来验证 Action 合法性。B1 的 `canTransition` 函数是 D1 的基础。

### 6.2 C1 将消费 B1的类型和 Schema 校验

C1 的 fact reader 需要读取 Delivery Manifest 并校验为 `Delivery` 类型。C1 的持久化层需要调用 B1 的 `assertMutable` 在写入 Run 前检查。

### 6.3 E1 将消费 B1 的类型定义

E1 的诊断 CLI 需要展示 Delivery/Change/Run 状态，使用 B1 的类型定义格式化输出。

### 6.4 `review` / `revise` 不在 Action Catalog 中

`review` 和 `revise` 是统一入口，不是正式 Action。B1 的 Action Catalog 不包含它们。D1 的 Policy 负责将 `review` 解析为 `review-explore | review-propose | review-apply`，将 `revise` 解析为 `revise-explore | revise-propose | revise-apply`。

### 6.5 `change-checkpoint` 不是正式 Action（B1-RE-001 源冲突解决）

`change-checkpoint` **不在** Change Action Catalog 中。冻结 `flowkit-core-model` spec 的 Action Catalog Requirement 列出 10 个正式 Action（4 主 + 6 辅助），不含 `change-checkpoint`。实现参考 Section 6.3 包含它，但冻结 spec 是权威。`change-checkpoint` 是 Git 正式边界（AGENTS.md 规则 #7：Git 只在 Start / Checkpoint / Final 形成正式边界），不是正式 Action——没有 `review-checkpoint` 或 `revise-checkpoint`，不进入 Policy 的 Action 状态转换。

## 7. 验收标准

1. 全部领域对象有 TypeScript 类型定义，编译通过
2. Delivery/Change/Run 主状态联合类型与冻结 spec 一致
3. Delivery/Change/Run 三个结构转换表均覆盖所有合法转换，拒绝所有非法转换；exhaustive `State × State` matrix 测试覆盖三个实体（B1-RE-006）
4. Action Catalog 包含 10 个 Change Action + 2 个 Delivery Action，不含 `review`/`revise`/`change-checkpoint`（B1-RE-001）
5. Run ID 纯函数契约正确实现：格式校验（`YYYYMMDD-NNN-action`）、Delivery-wide NNN 唯一性拒绝、候选 NNN 有限整数 1-999 校验、单调递增/不复用拒绝、缺号允许、NNN > 999 fail-closed；B1 操作传入 fixture，不执行文件系统遍历（B1-RE-007、B1-RE-008）
6. `isTerminal` 和 `assertMutable` 正确识别 terminal 状态
7. Schema 校验拒绝未知主状态
8. `outputs` 类型定义存在且文档注释明确语义边界
9. `architecture` 字段存在且不包含 `archifyStatus`
10. `ResultRef`（provider-neutral，无 mandatory `runPath`，B1-RE-002）、`ReviewVerdict`、`FindingSummary` 类型定义存在
11. 所有测试使用构造 fixture，不依赖真实 Git 仓库
12. 不存在 Policy 引擎、fact reader、持久化实现、CLI 命令或 Archify runtime code
13. 不引入外部运行时依赖
14. typecheck + build + test + lint 全部通过
15. 领域对象契约矩阵覆盖全部 11 个对象，每个对象有 B1 所有权标注、最小字段定义和校验期望；ActionResult/ContinuationContext 标记为逻辑最小字段，物理传输由 C1 定义（B1-RE-004）
16. RunStatus 与冻结 `docs/core-model.md` Section 3.3 完全一致（`pending | completed | failed | cancelled`），Schema 校验拒绝 `in-progress` 等未冻结状态作为 Run 状态（B1-RE-005）

## 8. 探索结论

1. B1 范围是**类型定义 + Schema 校验 + Run ID 分配 + terminal 检查**，不包含 Policy、fact reader 或持久化
2. 领域对象使用 TypeScript `interface` + `type`，不使用 `class`（FlowkitError 除外）
3. Schema 校验使用自定义 type guard，不引入 Zod 或 JSON Schema
4. Run ID 纯函数契约：解析/校验完整 `YYYYMMDD-NNN-action` 格式、拒绝 Delivery-wide 重复 NNN、候选 NNN 有限整数 1-999 校验（拒绝 0/负数/小数/非有限值）、拒绝非单调/复用 NNN、允许缺号、NNN > 999 fail-closed；B1 操作传入 fixture，文件系统遍历和持久化属于 C1（B1-RE-007、B1-RE-008）
5. Action Catalog 使用 `const` 数组 + `as const`，不使用 `enum`；包含 10 个 Change Action + 2 个 Delivery Action
6. Delivery/Change/Run 三个结构转换表均使用 `Record<State, readonly State[]>` + 泛型 `canTransition`；B1 只拥有结构转换边，语义前置条件属于 D1 Policy；三个实体分别 exhaustive `State × State` matrix 测试（B1-RE-006）
7. `outputs` 和 `architecture` 只定义类型和文档，不实现运行时校验
8. 全部测试使用构造 fixture，不依赖文件系统或 Git
9. `change-checkpoint` 不是正式 Action——冻结 core-model spec 是权威，实现参考 Section 6.3 与冻结 spec 冲突时以冻结 spec 为准（B1-RE-001）
10. `ResultRef` 是 provider-neutral 逻辑引用，不固定 `runPath`，具体序列化 schema 和 adapter 映射由 C1 定义（B1-RE-002）
11. 领域对象契约矩阵覆盖全部 11 个对象，每个对象有 B1 所有权标注和最小字段定义；ActionResult/ContinuationContext/OwnerAuthorizationRef 标记为逻辑最小字段或 provider-neutral 引用，物理传输和序列化由 C1 定义；ActionDefinition 包含 integration-boundaries.md Section 3.1 要求的 role/goal/preconditions/allowedOutputs/completionConditions（B1-RE-004）
12. RunStatus 与冻结 `docs/core-model.md` Section 3.3 完全一致（`pending | completed | failed | cancelled`），不含 `in-progress`；`in-progress` 仅存在于 ActionResult.ExecutionStatus，不进入 Run 状态或 Run 状态转换（B1-RE-005）

## 9. Review 重点

1. B1 范围是否清晰——只做类型定义和校验函数，不做 Policy/fact reader/持久化
2. 11 个领域对象是否全部覆盖且有字段级契约矩阵（Section 5.1，B1-RE-004），包括 Delivery、Change、Run、ActionDefinition、ActionResult、ResultRef、ReviewVerdict、FindingSummary、VerificationSummary、OwnerAuthorizationRef、ContinuationContext
3. 主状态是否与冻结 spec 完全一致——包括 RunStatus 与 `docs/core-model.md` Section 3.3 一致（`pending | completed | failed | cancelled`，不含 `in-progress`，B1-RE-005）
4. Action Catalog 是否完整（10 Change + 2 Delivery，不含 review/revise/change-checkpoint）
5. Run ID 纯函数契约是否完整——解析/校验完整 `YYYYMMDD-NNN-action` 格式、拒绝 Delivery-wide 重复 NNN（Change 级和 _delivery 级共享）、候选 NNN 有限整数 1-999 校验（拒绝 0/负数/小数/非有限值）、拒绝非单调/复用 NNN、允许缺号、NNN > 999 fail-closed；B1 操作传入 fixture 不执行文件系统遍历，C1 负责遍历和持久化（B1-RE-007、B1-RE-008）
6. terminal immutability 校验是否正确
7. outputs 语义边界是否明确（不是文件白名单、不是 actualChangeSet）
8. Archify 最小字段是否正确（不创建 archifyStatus 第二状态机）
9. 测试策略是否可行（全部构造 fixture，不依赖 Git）
10. 不引入外部运行时依赖
11. B1/C1 所有权边界是否明确——ActionResult/ContinuationContext/OwnerAuthorizationRef/ResultRef 为逻辑最小字段或 provider-neutral 引用，物理传输和序列化由 C1 定义；ActionDefinition 包含 integration-boundaries.md Section 3.1 要求的全部字段（B1-RE-004）
