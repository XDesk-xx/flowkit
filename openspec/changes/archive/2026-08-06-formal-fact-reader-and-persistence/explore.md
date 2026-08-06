# C1 Explore：正式事实 Reader 与原子持久化

## 1. 基本信息

- Delivery：`20260806-01-deterministic-core`
- Change key：`C1`
- Change ID：`formal-fact-reader-and-persistence`
- 依赖：`B1 domain-and-state-schema`（completed，checkpoint commit `180f161`）
- 目标：读取并归一化正式事实为 FormalFactSnapshot，实现 Flowkit 自有状态的原子持久化

## 2. 冻结输入

### 2.1 flowkit-domain-and-state-schema（B1 冻结 spec）

路径：`openspec/specs/flowkit-domain-and-state-schema/spec.md`

C1 直接消费的 B1 所有权标注：

| 领域对象 | B1 所有权 | C1 职责 |
|---|---|---|
| Delivery | B1 完整拥有类型 | C1 owns persistence |
| Change | B1 完整拥有类型 | C1 owns persistence |
| Run | B1 完整拥有类型 | C1 owns persistence |
| ActionResult | B1 拥有逻辑最小字段 | C1 定义传输 schema |
| ResultRef | B1 完整拥有（provider-neutral） | C1 定义 adapter 映射 |
| ReviewVerdict | B1 完整拥有类型 | C1 owns persistence |
| VerificationSummary | B1 完整拥有类型 | C1 owns persistence |
| OwnerAuthorizationRef | B1 拥有逻辑引用 | C1/D1 定义授权存储 |
| ContinuationContext | B1 拥有逻辑最小字段 | C1 定义序列化和恢复 |

B1 明确排除并留给 C1 的范围：

- "B1 MUST NOT 实现 FormalFactSnapshot、fact reader 或文件系统持久化实现"
- "B1 MUST 操作传入的 Run-ID 字符串 fixture，MUST NOT 执行文件系统遍历（文件系统遍历和持久化属于 C1）"
- "持久化层（C1）在写入前调用 assertMutable"
- "C1 负责文件系统遍历、原子创建和持久化"

### 2.2 flowkit-runtime-foundation（A1 冻结 spec）

路径：`openspec/specs/flowkit-runtime-foundation/spec.md`

C1 消费的 A1 基础设施：

- `src/shared/atomic-write.ts`：`atomicWriteFile(filePath, data)` — 临时文件同目录 + rename
- `src/shared/paths.ts`：`normalizeSeparators`、`joinPath`、`relativePath` — POSIX 路径归一化
- `src/shared/errors.ts`：`FlowkitError` — 统一错误类型
- `src/shared/external-command.ts`：外部命令封装（Git 只读命令）
- 占位目录已创建：`src/facts/`（README.md + .gitkeep）、`src/persistence/`（README.md + .gitkeep）

### 2.3 docs/core-model.md — 事实权威

路径：`docs/core-model.md` Section 8

`One fact, one authority` 表：

| 事实 | 主要权威 | C1 读取方式 |
|---|---|---|
| Delivery 和 Change 的流程状态 | Flowkit | 读 Delivery Manifest YAML |
| Change 契约 | OpenSpec | 读 `openspec/changes/<id>/` 目录结构 |
| 文件内容、历史和同步事实 | Git | 只读 Git 命令（branch、HEAD、status） |
| Findings 和 Verdict | Reviewer | 读 Run `result.json` 中的 reviewVerdict |
| 测试与静态检查结果 | 项目验证工具 | 读 Run `result.json` 中的 verificationSummary |
| 被接受的架构表达 | Archify | 本 Delivery 不读取（deferred） |
| 代码依赖和影响范围 | CodeGraph | 本 Delivery 不读取（deferred） |

"Run 可以保存当前流程需要的输入、摘要和引用，但不能成为第二事实权威。"

### 2.4 docs/delivery-lifecycle.md — Policy 输入与恢复

路径：`docs/delivery-lifecycle.md` Section 5 和 Section 9

Policy 使用以下正式事实计算唯一下一步（C1 的 FormalFactSnapshot 必须提供这些）：

```text
active Delivery 和 Change
Change dependencies
OpenSpec artifacts
committed Runs
reviewer Verdict
Change Verification
Delivery fullTestStatus
owner 授权事实
Archive、Checkpoint 和 Git 边界
```

恢复步骤（Section 9）约束 Reader 行为：

- 不得依赖聊天历史、`.tmp`、未提交日志、人工记忆、current pointer
- 不得写入状态文件的当前 Commit SHA（自引用禁止）
- 不得依赖预建 pending Review Run

### 2.5 docs/integration-boundaries.md — ResultRef 与 ContinuationContext

路径：`docs/integration-boundaries.md` Section 5 和 Section 6

ResultRef（Section 5）约束：

- 能唯一识别被引用结果
- 能判断结果是否被替换或失效
- 不把当前 Commit SHA 写入会因自身 Commit 而过期的状态文件
- 具体环境可映射为 Git revision、Run result、artifact version、content hash

ContinuationContext（Section 6）约束：

- 从正式事实生成的可恢复视图，不是新的状态权威
- `nextAllowedAction` 必须由 Policy 计算，不得由 ContinuationContext 自行填写
- 摘要丢失时应能重新生成
- 摘要与正式事实冲突时以正式事实为准

### 2.6 docs/verification-model.md — Verification 事实

路径：`docs/verification-model.md` Section 2 和 Section 7

- Flowkit 只拥有推进流程所需的：验证状态、最小摘要、结果引用
- Flowkit 不复制项目验证工具的完整内部状态
- Run 的 `result.json` 可以引用 `verification.md`，但不能替代它

### 2.7 实现参考

路径：`ref/01-deterministic-core-delivery-implementation-reference.md` Section 7

C1 实现参考要点：

- Reader 读取并归一化：Delivery Manifest、OpenSpec Change artifacts 存在性与状态摘要、`.flowkit/runs/**`、Reviewer Verdict/Findings 摘要、Change Verification 摘要、owner authorization refs、Git 边界摘要（只读）
- FormalFactSnapshot 是一次 Policy 计算的输入视图，不是新状态权威
- 持久化只实现 Flowkit 自己拥有的状态：Schema 校验、原子写入、临时文件同目录替换、写前读取当前版本、避免自引用 Commit SHA、路径归一化、失败后不留下半写文件
- 不完整调用 OpenSpec CLI，只读取可稳定识别的本地事实

## 3. C1 范围

### 3.1 In scope

```text
FormalFactSnapshot 只读输入视图类型定义
正式事实 Reader（从 Delivery Manifest、OpenSpec 目录结构、Run 文件、Git 只读命令读取并归一化）
Run 文件系统遍历（为 B1 的 Run ID 纯函数提供现有 Run-ID 列表）
Run 原子持久化（创建 Run 目录、写入 action.md / context.json / result.json）
Run 写入前 assertMutable 校验（调用 B1 terminal.ts）
Run 写入前 Schema 校验（调用 B1 schema-validator.ts）
Run ID 分配的文件系统集成（调用 B1 allocateNextNnn，提供文件系统收集的 Run-ID 列表）
ResultRef adapter 映射（将逻辑 ResultRef 映射为 Run 路径 + content hash）
Git 只读边界摘要（branch、HEAD、working tree status，不写入状态文件）
fail-closed 冲突检测（同一事实多来源冲突时 throw，不猜测）
fixture 集成测试（构造临时目录结构，测试 Reader + Persistence）
```

### 3.2 Out of scope

```text
Policy 引擎（canRun / next / diagnose）— D1
诊断 CLI（status / next / doctor / resume-context）— E1
完整 OpenSpec CLI 集成（apply / archive 命令调用）— 下一 Delivery
Review / Findings 写入闭环 — 下一 Delivery
Change Verification 调度 — 下一 Delivery
actualChangeSet 计算 — Change Execution Loop Delivery
自动 Commit / Push / Merge — 下一 Delivery
Delivery Full Test 执行 — F1
Delivery Finalize — F1
Archify CLI 集成 — 后续 Delivery
CodeGraph 集成 — 后续 Delivery
Agent Adapter — 后续 Delivery
动态 Provider / Skill 注册 — 后续 Delivery
通用 Migration Framework — 不建立
第二套 current-state 文件 — 不创建
```

## 4. 推荐结构

```text
src/facts/
  types.ts                  — FormalFactSnapshot 类型定义
  reader.ts                 — 正式事实 Reader（读取并归一化所有正式事实）
  openspec-reader.ts        — OpenSpec 目录结构存在性与状态摘要读取
  run-reader.ts             — .flowkit/runs/** 遍历与 Run 解析
  git-reader.ts             — Git 只读边界摘要（branch、HEAD、status）
  manifest-reader.ts        — Delivery Manifest YAML 读取与解析

src/persistence/
  run-persistence.ts        — Run 两阶段持久化（staging+publish 创建 / read+assertMutable+write 完成）
  run-id-fs.ts              — Run ID 文件系统集成（遍历 .flowkit/runs/ 收集 Run-ID）
  result-ref-adapter.ts     — ResultRef adapter 映射（逻辑引用 ↔ Run 路径 + content hash）
  serialization.ts          — RunResultFile 物理 schema + validateActionResultWithoutRunRef + validateResultRefProjection + ActionResult / ReviewVerdict / VerificationSummary 序列化

tests/unit/facts/
  reader.test.ts            — Reader fixture 测试（正常、冲突 fail-closed、缺失）
  openspec-reader.test.ts   — OpenSpec 目录结构读取 fixture 测试
  run-reader.test.ts        — Run 文件遍历与解析 fixture 测试
  git-reader.test.ts        — Git 只读命令 fixture 测试
  manifest-reader.test.ts   — Manifest YAML 解析与校验 fixture 测试

tests/unit/persistence/
  run-persistence.test.ts   — Run 原子写入、assertMutable 拦截、恢复测试
  run-id-fs.test.ts         — Run ID 文件系统遍历 fixture 测试
  result-ref-adapter.test.ts — ResultRef 映射与失效检测测试
  serialization.test.ts     — 序列化 schema 校验测试
```

## 5. 关键问题与推荐答案

### Q1：FormalFactSnapshot 包含哪些字段？

**推荐**：FormalFactSnapshot 是 Policy 计算的唯一只读输入视图，字段直接映射 `docs/delivery-lifecycle.md` Section 5 的 Policy 输入清单。

```typescript
/**
 * 只读快照，包含 Policy 计算唯一合法下一 Action 所需的全部正式事实。
 * 原始文件仍是事实来源；快照可重新生成；不缓存会变成第二状态。
 */
export interface FormalFactSnapshot {
  /** 来源 Delivery Manifest，Flowkit 拥有流程状态权威。 */
  readonly delivery: Delivery;
  /** active Change（零或一个），从 Delivery.changes 中筛选 state=active。 */
  readonly activeChange?: Change;
  /** OpenSpec artifacts 存在性与状态摘要（不调用 OpenSpec CLI）。 */
  readonly openspecSummary: OpenSpecArtifactSummary;
  /** 已提交的 Run 列表（从 .flowkit/runs/ 遍历）。 */
  readonly runs: readonly RunRecord[];
  /** 当前有效的 Reviewer Verdict（从最近 review-* Run 的 result.json）。 */
  readonly activeVerdict?: ReviewVerdict;
  /** Change Verification 摘要（从 verification.md 或 apply/revise-apply Run）。 */
  readonly verificationSummary?: VerificationSummary;
  /** owner 授权事实摘要（从 Run context.json / result.json）。 */
  readonly ownerAuthorizations: readonly OwnerAuthorizationRef[];
  /** Git 边界只读摘要（branch、HEAD、working tree status）。 */
  readonly gitBoundary: GitBoundarySummary;
  /** Reader 检测到的冲突列表（非空时 Policy 必须 fail-closed）。 */
  readonly conflicts: readonly FactConflict[];
}
```

辅助类型：

```typescript
export interface OpenSpecArtifactSummary {
  readonly changeDir: string;           // openspec/changes/<id>/ 或 archive 路径
  readonly hasExplore: boolean;
  readonly hasProposal: boolean;
  readonly hasDesign: boolean;
  readonly hasTasks: boolean;
  readonly hasVerification: boolean;
  readonly hasSpecs: boolean;
  readonly isArchived: boolean;
  readonly frozenSpecExists: boolean;
}

export interface RunRecord {
  readonly run: Run;
  readonly runPath: string;
  readonly resultSummary?: string;
  readonly resultStatus?: string;
}

export interface GitBoundarySummary {
  readonly branch: string;
  readonly headSha: string;
  readonly workingTreeClean: boolean;
  readonly lastCheckpointSha?: string;
}

export interface FactConflict {
  readonly fact: string;
  readonly sources: readonly string[];
  readonly values: readonly string[];
  readonly message: string;
}
```

理由：
- 字段直接映射 Policy 输入清单，不发明 Policy 不需要的事实
- `conflicts` 字段使 fail-closed 显式化：Reader 不丢弃冲突，而是收集并暴露给 Policy
- `gitBoundary` 是只读摘要，不写入状态文件（避免自引用）
- `openspecSummary` 只读目录结构，不调用 OpenSpec CLI

### Q2：Reader 如何处理多权威来源？

**推荐**：每个事实有唯一权威来源（`One fact, one authority`）。Reader 从正确权威读取每个事实，不从第二来源推断。

| 事实 | 权威来源 | Reader 读取 |
|---|---|---|
| Delivery state / fullTestStatus | Delivery Manifest YAML | `manifest-reader.ts` |
| Change state / dependencies | Delivery Manifest YAML | `manifest-reader.ts` |
| Change 契约存在性 | OpenSpec 目录结构 | `openspec-reader.ts` |
| Run 执行记录 | `.flowkit/runs/**` 文件 | `run-reader.ts` |
| Verdict / Findings | review-* Run 的 `result.json` | `run-reader.ts` |
| Verification 摘要 | apply/revise-apply Run 的 `result.json` 或 `verification.md` | `run-reader.ts` |
| owner 授权 | Run `context.json` / `result.json` | `run-reader.ts` |
| Git 边界 | Git 命令（只读） | `git-reader.ts` |

Reader 不做跨权威交叉推断。如果检测到同一事实在不同来源出现不一致值（如 Manifest 说 Change completed 但 `.flowkit/runs/` 没有 archive Run），Reader 收集为 `FactConflict` 而非自动择优。

### Q3：fail-closed 冲突检测如何工作？

**推荐**：Reader 在以下情况产生 `FactConflict` 并使 `snapshot.conflicts` 非空：

1. **Manifest vs Run 不一致**：Manifest 声称 Change `completed`，但 `.flowkit/runs/` 中找不到对应 archive Run
2. **Manifest vs OpenSpec 不一致**：Manifest 声称 Change `active`，但 `openspec/changes/<id>/` 目录不存在
3. **Run vs Run 不一致**：同一 Change 有多个未失效的 `approved` Verdict 指向不同 `reviewedResultRef`
4. **Manifest 唯一性违反**：多个 active Delivery 或多个 active Change
5. **Git 边界违反**：当前分支不是 Delivery Manifest 声称的 branch

Policy（D1）在 `snapshot.conflicts.length > 0` 时必须返回 blocked diagnosis，不自动推进。

Reader 自身在读取失败（文件损坏、YAML 解析失败、Schema 校验失败）时直接 throw `FlowkitError`，不产生部分快照。

### Q4：Reader 从 OpenSpec 读取什么（不调用 CLI）？

**推荐**：Reader 只读取可稳定识别的本地文件系统事实，不调用 `openspec` CLI 命令。

读取内容：

```text
openspec/changes/<change-id>/
  .openspec.yaml          — 存在性（change 已创建）
  explore.md              — 存在性（explore 已完成）
  proposal.md             — 存在性（propose 已完成）
  design.md               — 存在性
  tasks.md                — 存在性 + 任务完成比例（扫描 [x] vs [ ]）
  verification.md         — 存在性（Verification 记录已创建）
  specs/<capability>/     — 存在性（spec deltas 已定义）

openspec/changes/archive/<date>-<change-id>/
  — 存在性（change 已 archived）

openspec/specs/<capability>/spec.md
  — 存在性（frozen spec 已创建）
```

Reader 不做：
- 不调用 `openspec validate`
- 不调用 `openspec archive`
- 不解析 spec.md 的 Requirement/Scenario 内容（那是 Reviewer 的职责）
- 不判断 spec 内容正确性

`OpenSpecArtifactSummary` 只记录存在性和 isArchived 状态，作为 Policy 判断 Change 生命周期阶段的输入。

### Q5：Run 持久化如何工作？

> **C1-EX-001 / C1-EX-002 修订**：原 Q5 的 assertMutable 调用顺序错误（在已设为 terminal 的 Run 上调用必然 throw），且 Run 创建缺少原子发布边界（逐文件写入可暴露半建 Run）。本节重写为两阶段持久化协议：staging + atomic publish 创建 Run，read-existing + assertMutable + atomic write 完成 Run。

**推荐**：C1 的 `run-persistence.ts` 将 Run 生命周期分为两个持久化阶段，每个阶段都有明确的原子性保证。

#### 阶段 1：创建 Run（pending 状态，all-or-nothing 发布）

```typescript
/**
 * 创建新 Run：staging 全部初始文件 → 校验 → 原子发布目录。
 * Run ID 通过 B1 的 allocateNextNnn 分配（C1 提供文件系统收集的 Run-ID 列表）。
 * 发布前 Run 目录不可见；发布后 Run 处于 pending 状态（无 result.json）。
 */
export async function createRun(
  deliveryId: string,
  changeId: string | undefined,
  action: ChangeAction | DeliveryAction,
  role: Role,
  runRootDir: string,
): Promise<{ runId: string; runPath: string }>;
```

创建流程（all-or-nothing）：

1. 遍历 `.flowkit/runs/<delivery-id>/` 收集所有现有 Run-ID（`run-id-fs.ts`）
2. 调用 B1 的 `allocateNextNnn(existingRunIds)` 获取下一个 NNN
3. 构造 Run ID：`YYYYMMDD-NNN-action`
4. 调用 B1 的 `validateRunIdUniqueness` 做最终校验
5. **staging 阶段**：在同目录下创建临时 staging 目录 `.tmp-<run-id>/`
   - 在 staging 目录中写入 `action.md` 和 `context.json`（使用 A1 `atomicWriteFile` 逐文件原子写入）
   - 校验两个文件内容（Schema 校验 + 完整性检查）
6. **publish 阶段**：将 staging 目录原子 rename 为最终 Run 目录
   - `.tmp-<run-id>/` → `<run-id>/`
   - rename 是 POSIX 原子操作；Windows 上 `fs.rename` 同样保证目标目录的原子出现
7. **失败清理**：任何步骤失败时，删除 staging 目录（best-effort），不留下半建 Run

发布后状态：
- Run 目录存在，包含 `action.md` 和 `context.json`
- `result.json` 不存在 → Run 处于 `pending` 状态
- staging 目录 `.tmp-<run-id>/` 不应存在（已被 rename 或已清理）

#### 阶段 2：完成 Run（pending → terminal 转换）

> **C1-EX-003 修订**：原 Q5 阶段 2 将 `ActionResult.executionStatus`（completed/failed/blocked/in-progress）与 `RunStatus`（pending/completed/failed/cancelled）混淆。B1 的 `ActionResult` 只有 `executionStatus` 字段，没有 `runStatus` 字段。两个值集不同（`blocked` 不是 `RunStatus`；`cancelled` 不是 `ExecutionStatus`），因此 result.json 物理格式必须显式携带 `runStatus`，不能从 `executionStatus` 推断。

C1 定义 result.json 的**物理传输 schema**（`RunResultFile`），B1 拥有逻辑 `ActionResult` 类型：

```typescript
/**
 * C1 拥有的 result.json 物理传输 schema。
 * 这是 Run 完成后的磁盘表示。B1 拥有逻辑 ActionResult 类型，
 * C1 定义物理序列化 schema（B1 spec: "C1 defines the physical transport
 * schema and serialization" for ActionResult）。
 *
 * runStatus 和 executionStatus 是独立的（B1 types.ts: "Independent of RunStatus"）：
 * - RunStatus 是 Run 生命周期状态（pending/completed/failed/cancelled）
 * - ExecutionStatus 是 Action 执行结果（in-progress/completed/failed/blocked）
 *
 * executionStatus 单源真相（C1-EX-008）：
 * RunResultFile 不在顶层携带 executionStatus——当 actionResult 存在时，
 * executionStatus 从 actionResult.executionStatus 派生。当 actionResult 不存在
 * （runStatus=failed/cancelled）时，没有 executionStatus。消除跨字段不一致。
 *
 * 非自引用序列化边界（C1-EX-005）：
 * ActionResult.runRef 是 B1 逻辑类型的必填字段，但物理序列化时省略
 * actionResult.runRef——runRef 在读取时从文件路径 + 内容 SHA-256 派生。
 * 文件不包含自身哈希，消除自引用循环。
 */
export interface RunResultFile {
  /** Schema 版本，前向兼容。 */
  readonly schemaVersion: number;
  /** Run 的 terminal 生命周期状态。写入时必填。 */
  readonly runStatus: TerminalRunStatus;  // 'completed' | 'failed' | 'cancelled'
  /**
   * 逻辑 ActionResult（不含 runRef）。runStatus='completed' 时必填。
   * 序列化时省略 actionResult.runRef；读取时由 result-ref-adapter 派生。
   * executionStatus 从 actionResult.executionStatus 派生（C1-EX-008 单源真相）。
   */
  readonly actionResult?: ActionResultWithoutRunRef;
  /** Run 失败诊断。runStatus='failed' 时存在。 */
  readonly failureDiagnosis?: string;
  /** 取消原因。runStatus='cancelled' 时存在。 */
  readonly cancellationReason?: string;
}

/** RunStatus 中 terminal 子集。pending 不是 terminal，不出现在 result.json 中。 */
export type TerminalRunStatus = 'completed' | 'failed' | 'cancelled';

/**
 * 序列化用的 ActionResult 投影——省略 runRef 字段。
 * 读取时由 result-ref-adapter 从文件路径 + 内容 SHA-256 重建 runRef。
 */
export type ActionResultWithoutRunRef = Omit<ActionResult, 'runRef'>;
```

**允许的组合（写入时校验，读取时校验）：**

> **C1-EX-008 修订**：原表使用顶层 `executionStatus` 字段，与 `actionResult.executionStatus` 重复且无一致性规则。现在 `executionStatus` 从 `actionResult.executionStatus` 派生（单源真相），顶层字段已移除。

| runStatus | actionResult | actionResult.executionStatus | 含义 |
|---|---|---|---|
| `completed` | 存在 | `completed` | Action 执行成功，Run 正常完成 |
| `completed` | 存在 | `failed` | Action 执行失败，Run 完成并记录失败 |
| `completed` | 存在 | `blocked` | Action 被阻塞（需 owner 决策），Run 完成并记录阻塞 |
| `failed` | 不存在 | — | Run 因基础设施错误失败，无有效 ActionResult |
| `cancelled` | 不存在 | — | Run 被 owner 取消，无有效 ActionResult |

**禁止的组合（写入时 reject，读取时 throw）：**

| runStatus | actionResult | actionResult.executionStatus | 原因 |
|---|---|---|---|
| `pending` | (any) | (any) | result.json 意味着 terminal；pending 不是 terminal |
| `completed` | 不存在 | — | `completed` Run 必须有 actionResult |
| `completed` | 存在 | `in-progress` | `in-progress` 不是 terminal；不能写入 result.json |
| `completed` | 存在 | (absent) | actionResult 必须有 executionStatus（B1 必填字段） |
| `failed` | 存在 | (any) | `failed` Run 不产生 ActionResult |
| `cancelled` | 存在 | (any) | `cancelled` Run 不产生 ActionResult |
| (any) | (any) | (any) | 顶层 `executionStatus` 字段存在 → reject（C1-EX-008 移除顶层字段） |

关键区分：
- **`actionResult.executionStatus: failed` + `runStatus: completed`**：Action 执行失败（如 apply 失败、测试未通过），但 Run 本身正常完成并记录了失败结果。Policy 可根据 `actionResult.executionStatus: failed` 决定下一步（如 revise-apply）。
- **`runStatus: failed`**：Run 自身失败（如基础设施错误、无法读取文件、无法写入结果），没有有效的 ActionResult。Policy 视为 Run 执行异常。
- **`runStatus: cancelled`**：Run 被 owner 显式取消，没有有效的 ActionResult。Policy 视为 Run 不存在或需重新创建。

```typescript
/**
 * 完成 Run：独占发布 terminal result.json。
 *
 * 使用 temp-file + fs.link 原子 create-if-not-exists 发布协议（C1-EX-006）：
 * - temp 文件写入完整内容后，通过 fs.link(temp, result.json) 原子创建 result.json
 * - fs.link 在目标已存在时抛 EEXIST —— 原子 no-replace 保证
 * - 第一个 writer 的 result.json 不会被后续 writer 覆盖
 * - 后续 writer 收到 EEXIST → throw RUN_TERMINAL
 * - 中断不留下部分 result.json（temp 文件被遗弃，result.json 不存在）
 *
 * assertMutable 校验 CURRENT 持久化状态（pending），不是 NEW terminal 结果（C1-EX-001）。
 * 写入完成后 Run 进入 terminal，后续 assertMutable 调用将 throw。
 *
 * 校验、序列化、独占发布全部在本函数内部完成（C1-EX-010）：
 * - 调用方传入 RunResultFile 对象（不接受 JSON 字符串）
 * - 本函数校验 runStatus + actionResult 组合合法性
 * - 本函数校验 actionResult 通过 validateActionResultWithoutRunRef（C1-EX-007）
 * - 本函数序列化 RunResultFile 为 JSON（省略 runRef，C1-EX-005）
 * - 本函数执行 temp-file + fs.link 独占发布（C1-EX-006）
 * - adapter 不校验、不序列化、不发布
 */
export async function writeRunResult(
  runPath: string,
  resultFile: RunResultFile,
): Promise<void>;
```

完成流程（独占发布协议，C1-EX-006）：

1. **读取当前 Run 状态**：从 `runPath` 读取 `context.json`，构造当前 Run 对象
   - 当前 Run 的 `status` 必须为 `pending`（`result.json` 不存在）
   - 如果 `result.json` 已存在，Run 已 terminal → throw `FlowkitError('RUN_TERMINAL')`
   - 注意：此检查是早期优化，不依赖它做并发安全（并发安全由 step 6 的 `fs.link` 保证）
2. **assertMutable 校验**：调用 B1 的 `assertMutable(currentRun)`
   - `currentRun.status` 为 `pending`（非 terminal）→ 校验通过
   - `currentRun.status` 为 terminal → throw（防止覆盖已完成的 Run）
3. **校验 NEW result.json 物理格式**：
   - `resultFile.runStatus` 必须为 terminal（`completed` / `failed` / `cancelled`）
   - `resultFile` 不得包含顶层 `executionStatus` 字段（C1-EX-008 单源真相：从 `actionResult.executionStatus` 派生）
   - `resultFile.runStatus` + `actionResult` 存在性 + `actionResult.executionStatus` 组合必须在上表"允许的组合"中
   - 如果 `runStatus: completed`，`actionResult` 必须存在且 `actionResult.executionStatus` 必须为 terminal（`completed` / `failed` / `blocked`）
   - 如果 `runStatus: failed` 或 `cancelled`，`actionResult` 必须不存在
   - `actionResult`（如果存在）通过 C1 拥有的 `validateActionResultWithoutRunRef` 校验（C1-EX-007：不调用不存在的 B1 ActionResult 校验器）
   - `actionResult` 序列化时**省略 `runRef`**（C1-EX-005 非自引用边界）
4. **序列化**：将 `RunResultFile` 序列化为 JSON 字符串（`actionResult` 不含 `runRef`）
5. **写入 temp 文件**：在 Run 目录中写入 `.result-tmp-<pid>-<timestamp>.json`
   - 使用常规文件写入（可复用 `atomicWriteFile` 写入 temp 文件本身，确保 temp 内容完整）
   - temp 文件名包含 pid + timestamp 避免多 writer 冲突
6. **原子发布（独占 create-if-not-exists）**：
   - `fs.link(tempFile, result.json)` —— 原子创建 result.json，目标已存在时抛 `EEXIST`
   - **EEXIST** → 另一个 writer 已先完成发布 → 删除 temp 文件 → throw `FlowkitError('RUN_TERMINAL')`
   - **成功** → result.json 已创建，包含完整内容 → 独占发布成功
   - 不使用 `atomicWriteFile`（temp + rename）—— rename 是原子*替换*，不提供 no-replace 保证（C1-EX-006）
7. **清理 temp 文件**：删除 `.result-tmp-<pid>-<timestamp>.json`（best-effort）
8. 写入完成后，Run 进入 terminal 状态

关键顺序（C1-EX-001 + C1-EX-006）：

```text
读取当前 Run (pending)
→ assertMutable(currentRun)         ← 校验 CURRENT 状态，pending 通过
→ 校验 NEW resultFile 物理格式      ← 校验 runStatus + executionStatus 组合
→ 序列化 JSON (不含 runRef)         ← C1-EX-005 非自引用
→ 写入 temp 文件                    ← 完整内容写入 temp
→ fs.link(temp, result.json)        ← 原子 create-if-not-exists (C1-EX-006)
  ├─ EEXIST → throw RUN_TERMINAL    ← 另一 writer 已完成
  └─ 成功 → result.json 已发布      ← 独占完成
→ 清理 temp                         ← best-effort
→ Run 现在为 terminal               ← 后续 assertMutable 将 throw
```

不这样做（错误：atomicWriteFile 不提供 no-replace 保证）：

```text
Writer A: read (pending) → assertMutable ✓ → atomicWriteFile(result.json) ← 写入成功
Writer B: read (pending) → assertMutable ✓ → atomicWriteFile(result.json) ← 覆盖 A 的结果！
```

fs.link 提供的保证：

```text
Writer A: read → assertMutable ✓ → write temp-A → link(temp-A, result.json) ✓
Writer B: read → assertMutable ✓ → write temp-B → link(temp-B, result.json) ✗ EEXIST
→ B 收到 RUN_TERMINAL，A 的 result.json 不变
```

不这样做（错误顺序，C1-EX-001）：

```text
构造 Run (terminal)               ← 错误：提前设为 terminal
→ assertMutable(run)              ← 必然 throw（terminal 不可变）
→ 永远无法写入 result.json
```

#### Reader 读取 terminal Run（C1-EX-003）

`run-reader.ts` 读取 `result.json` 时必须校验物理格式并重建 Run：

1. 读取文件原始内容（字符串）
2. 计算文件内容 SHA-256 → `versionFingerprint`（C1-EX-005 非自引用：文件不含自身哈希，读取时派生）
3. 解析 JSON 为 `RunResultFile`
4. 校验 `runStatus` 是 terminal 值（`completed` / `failed` / `cancelled`）
5. 校验 `runResultFile` 不包含顶层 `executionStatus` 字段（C1-EX-008 单源真相）
6. 校验 `runStatus` + `actionResult` 存在性 + `actionResult.executionStatus` 组合在"允许的组合"表中
7. 如果 `resultFile.actionResult` 存在：
   - 通过 C1 拥有的 `validateActionResultWithoutRunRef` 校验物理投影数据结构合法（C1-EX-007）
   - 调用 `result-ref-adapter` 派生 `runRef`：`{ ref: <relative-path>, versionFingerprint: <computed-hash>, kind: "run-result" }`
   - 重建完整 `ActionResult`：`{ ...actionResultWithoutRunRef, runRef }`
   - 校验重建后的逻辑不变量（`runRef.ref` 非空、`runRef.versionFingerprint` 非空）
8. 构造 `Run` 对象：`run.status = resultFile.runStatus`
9. 如果任何校验失败 → throw `FlowkitError('SCHEMA_VALIDATION_FAILED')`，不猜测修复

#### C1 拥有的物理投影校验器（C1-EX-007）

> **C1-EX-007 修订**：原 Q5 声称 `actionResult` 通过 B1 Schema 校验，但 B1 `schema-validator.ts` 只导出 `validateRun`，没有 `validateActionResult`。且物理类型 `ActionResultWithoutRunRef` 故意省略必填的 `runRef`（C1-EX-005），B1 的 `ActionResult` 校验器（如果存在）无法接受该投影。因此 C1 定义自己的物理投影校验器。

C1 在 `serialization.ts` 中定义 `validateActionResultWithoutRunRef`：

```typescript
/**
 * C1 拥有的 ActionResultWithoutRunRef 物理投影校验器。
 *
 * B1 schema-validator.ts 只导出 validateRun，不导出 validateActionResult。
 * B1 ActionResult 要求必填 runRef，C1 物理投影故意省略 runRef（C1-EX-005）。
 * 因此 C1 定义自己的物理投影校验器，不调用不存在的 B1 ActionResult 校验器。
 *
 * 使用 B1 导出的类型守卫和常量：
 * - isExecutionStatus（B1 导出）校验 executionStatus 枚举值
 * - CHANGE_ACTIONS + DELIVERY_ACTIONS（B1 导出）校验 action 枚举值
 *
 * C1 自己定义 ResultRef 校验（B1 的 validateResultRef 是私有的，未导出）。
 */
export function validateActionResultWithoutRunRef(
  value: unknown,
): ActionResultWithoutRunRef;
```

**必填字段校验：**

| 字段 | 类型 | 校验规则 |
|---|---|---|
| `action` | `ChangeAction \| DeliveryAction` | 必须在 B1 `CHANGE_ACTIONS` 或 `DELIVERY_ACTIONS` 中 |
| `executionStatus` | `ExecutionStatus` | B1 `isExecutionStatus(value)` 返回 true |
| `summary` | `string` | `typeof value === 'string'` 且非空 |

**可选字段校验（含嵌套 ResultRef）：**

| 字段 | 类型 | 校验规则 |
|---|---|---|
| `producedResultRefs` | `readonly ResultRef[]` | 数组，每个元素通过 C1 `validateResultRefProjection` |
| `consumedInputRefs` | `readonly ResultRef[]` | 数组，每个元素通过 C1 `validateResultRefProjection` |
| `verificationSummaryRef` | `ResultRef` | 通过 C1 `validateResultRefProjection` |
| `reviewVerdictRef` | `ResultRef` | 通过 C1 `validateResultRefProjection` |
| `failureDiagnosis` | `string` | `typeof value === 'string'` |
| `nextActionRecommendation` | `string` | `typeof value === 'string'` |

**禁止字段：**

| 字段 | 原因 |
|---|---|
| `runRef` | C1-EX-005 物理投影省略 runRef，读取时派生；存在 runRef 字段 → reject |

**C1 拥有的 `validateResultRefProjection`：**

```typescript
/**
 * C1 拥有的 ResultRef 物理投影校验器。
 * B1 的 validateResultRef 是私有的（未导出），C1 定义自己的等效校验。
 */
export function validateResultRefProjection(
  value: unknown,
  fieldName: string,
): ResultRef;
```

校验规则：
- `value` 必须是对象（非 null、非数组）
- `ref` 必须是 string（非空）
- `versionFingerprint` 必须是 string（非空）
- `kind` 可选，如果存在必须是 string

**重建后逻辑不变量校验：**

`validateActionResultWithoutRunRef` 校验物理投影后，`reconstructActionResult` 派生 `runRef` 并重建完整 `ActionResult`。重建后校验：
- `runRef.ref` 非空（由文件路径派生）
- `runRef.versionFingerprint` 非空（由文件内容 SHA-256 派生）
- `runRef.kind` = `"run-result"`

**Malformed 投影 fixture（C1-EX-007 required）：**

- `actionResult` 缺少 `action` → reject
- `actionResult` 缺少 `executionStatus` → reject
- `actionResult` 缺少 `summary` → reject
- `actionResult.action` 不在 `CHANGE_ACTIONS` 或 `DELIVERY_ACTIONS` 中 → reject
- `actionResult.executionStatus` 不是有效 `ExecutionStatus` → reject
- `actionResult.summary` 为空字符串 → reject
- `actionResult.producedResultRefs` 中某个 ResultRef 缺少 `ref` → reject
- `actionResult.consumedInputRefs` 中某个 ResultRef 缺少 `versionFingerprint` → reject
- `actionResult.verificationSummaryRef` 不是对象 → reject
- `actionResult` 包含 `runRef` 字段 → reject（C1-EX-005 物理投影禁止 runRef）
- `actionResult` 不是对象（如 string、null、array）→ reject

Fixture 测试覆盖（C1-EX-003 + C1-EX-005 + C1-EX-008 required）：

- 每个"允许的组合"各一个 fixture（5 个合法 terminal 状态）
- 每个"禁止的组合"各一个 fixture（至少 5 个非法组合）
- `result.json` 缺少 `runStatus` 字段 → reject
- `result.json` 的 `runStatus` 为 `pending` → reject
- `result.json` 的 `runStatus` 为 `completed` 但缺少 `executionStatus` → reject
- **executionStatus 单源真相（C1-EX-008）**：
  - `result.json` 包含顶层 `executionStatus` 字段 → reject（已移除顶层字段，从 `actionResult.executionStatus` 派生）
  - `result.json` 的 `runStatus: completed` 但缺少 `actionResult` → reject
  - `result.json` 的 `runStatus: completed` + `actionResult.executionStatus: in-progress` → reject（in-progress 不是 terminal）
  - `result.json` 的 `runStatus: failed` 但包含 `actionResult` → reject
  - `result.json` 的 `runStatus: cancelled` 但包含 `actionResult` → reject
- **非自引用序列化（C1-EX-005）**：
  - `result.json` 的 `actionResult` 不含 `runRef` 字段 → 合法（物理格式正确）
  - `result.json` 的 `actionResult` 含 `runRef` 字段 → reject（物理格式错误，runRef 应省略）
  - 写入后读取：`versionFingerprint` = 文件内容 SHA-256，`runRef` 从文件路径 + hash 派生
  - 替换检测：修改 `result.json` 内容后，`versionFingerprint` 变化，引用旧 fingerprint 的 `ResultRef` 不匹配
  - 错误 fingerprint 拒绝：引用方声称的 `versionFingerprint` 与文件实际 SHA-256 不符 → `verifyResultRef` 返回 false
- **独占完成发布（C1-EX-006）**：
  - 并发 writer fixture：两个 writer 同时调用 `writeRunResult`，第一个 writer 的 result.json 保留不变，第二个 writer 收到 `RUN_TERMINAL`
  - 不依赖预先 exists 检查：即使两个 writer 都在 step 1 看到 `result.json` 不存在，`fs.link` 保证只有一个成功
  - 中断 fixture：writer 在 `fs.link` 前崩溃 → temp 文件存在但 result.json 不存在 → Run 仍为 pending
  - EEXIST 路径：result.json 已存在时 `writeRunResult` 抛 `RUN_TERMINAL`
  - **一致性契约（C1-EX-009）**：扫描全部文档化的 result.json 写入路径，确认只有 `writeRunResult`（temp-file + `fs.link`）能发布 terminal result；adapter 和其他 helper 不调用 `atomicWriteFile(result.json, ...)`；contract test 证明没有任何 helper 路径能覆盖已存在的 result.json

#### 恢复规则

Reader / `run-reader.ts` 在遍历 `.flowkit/runs/` 时遵循以下规则：

| 目录状态 | 判定 | 行为 |
|---|---|---|
| `<run-id>/` 存在，有 `action.md` + `context.json`，无 `result.json` | Run 为 `pending` | 正常纳入 Snapshot |
| `<run-id>/` 存在，有 `action.md` + `context.json` + `result.json` | Run 为 terminal | 读取 `result.json` 获取具体状态 |
| `<run-id>/` 存在，缺少 `action.md` 或 `context.json` | 目录损坏 | throw `FlowkitError`，不猜测修复 |
| `<run-id>/` 存在，`result.json` 存在但 JSON 解析失败 | result 损坏 | throw `FlowkitError`，不猜测修复 |
| `.tmp-<run-id>/` 存在 | 创建中断的 staging 目录 | Reader 忽略（不纳入 Snapshot）；createRun 对自身 staging 目录 best-effort 清理；显式恢复变更 deferred（不分配给只读 doctor） |
| `.result-tmp-*.json` 存在 | 完成中断的 temp 文件 | Reader 忽略（不纳入 Snapshot）；writeRunResult 对自身 temp 文件 best-effort 清理；显式恢复变更 deferred（C1-EX-006） |

staging 目录（`.tmp-<run-id>/`）对 Reader 不可见——只有成功 rename 后的 `<run-id>/` 才被识别为正式 Run。这确保了 all-or-nothing 创建语义（C1-EX-002 修复）。

### Q6：如何避免自引用 Commit SHA？

**推荐**：

1. **ResultRef 的 versionFingerprint 使用 content hash（SHA-256），不使用 Commit SHA**
   - `result-ref-adapter.ts` 计算 `result.json` 文件内容的 SHA-256 作为 `versionFingerprint`
   - 当 `result.json` 被替换时，content hash 变化，依赖该 ResultRef 的 Review 自动失效

2. **context.json 的 inputRef 使用来源 Run 的 result.json content hash**
   - 例如 review Run 的 `inputRef` 指向被审查 Run 的 `result.json` 的 SHA-256
   - 不使用当前 Commit SHA（因为写入 context.json 的 Commit 本身会改变 HEAD）

3. **GitBoundarySummary 只读不写**
   - `git-reader.ts` 读取 `branch`、`HEAD SHA`、`working tree status`
   - 这些值只出现在 `FormalFactSnapshot` 中（内存中的只读视图），不写入状态文件
   - 不在 `context.json` 或 `result.json` 中持久化当前 Commit SHA 作为自引用

4. **Checkpoint SHA 检测**
   - `git-reader.ts` 可以通过 `git log --oneline` 查找 `checkpoint(<change-id>)` 格式的 commit
   - 这是只读检测，不写入状态文件

### Q7：ResultRef adapter 映射如何工作？

> **C1-EX-005 修订**：原 Q7 定义 `versionFingerprint` 为 `result.json` 内容的 SHA-256，但 `result.json` 包含 `actionResult.runRef.versionFingerprint`，导致哈希值是被哈希内容的一部分（自引用循环）。修订为**非自引用序列化边界**：物理文件省略 `actionResult.runRef`，`versionFingerprint` 在读取时从文件内容 SHA-256 派生。

**推荐**：`result-ref-adapter.ts` 将 B1 的 provider-neutral `ResultRef` 映射为本地文件系统引用，使用**省略-派生**模式消除自引用。

```typescript
/**
 * 计算 result.json 文件内容的 SHA-256 作为 versionFingerprint。
 * 文件不含 actionResult.runRef，因此哈希对象不包含自身哈希值——非自引用。
 */
export function computeResultFileHash(fileContent: string): string;

/**
 * 为 Run result.json 构造 ResultRef。
 * 在文件写入后调用，或由 Reader 在读取时调用。
 * ref = 相对路径（POSIX），versionFingerprint = SHA-256 of file content，
 * kind = "run-result"。
 */
export function buildRunResultRef(
  runPath: string,
  fileContent: string,
): ResultRef;

/**
 * 从 ActionResultWithoutRunRef + 文件路径 + 文件内容重建完整 ActionResult。
 * 派生 runRef = { ref, versionFingerprint, kind: "run-result" }。
 * 返回包含 runRef 的完整 ActionResult。
 */
export function reconstructActionResult(
  actionResultWithoutRunRef: ActionResultWithoutRunRef,
  runPath: string,
  fileContent: string,
): ActionResult;

/**
 * 验证引用方的 ResultRef.versionFingerprint 与被引用文件的实际 SHA-256 一致。
 * 用于检测文件替换或篡改。
 * 返回 true 如果 fingerprint 匹配，false 如果不匹配。
 */
export function verifyResultRef(
  ref: ResultRef,
  actualFileContent: string,
): boolean;

/**
 * 从 ResultRef 解析回文件路径（如果 kind = "run-result"）。
 */
export function resolveRunResultRef(ref: ResultRef): string | undefined;
```

**写入行为（构造对象，不序列化——C1-EX-009 + C1-EX-010）：**

> **C1-EX-009 + C1-EX-010 修订**：
> - C1-EX-009：原 Q7 说 `atomicWriteFile(result.json, jsonString)`，与 Q5 独占 `fs.link` 发布协议冲突。已移除。
> - C1-EX-010：上一版修订说"序列化为 JSON 字符串交给 writeRunResult"，但 Q5 签名是 `writeRunResult(runPath, resultFile: RunResultFile)`——接受对象不接受字符串，且 Q5 在函数内部校验+序列化。序列化归属矛盾。
>
> 修复：Q7 只负责**构造 `RunResultFile` 对象**并传递给 `writeRunResult`。**不序列化**。校验、序列化、独占发布全部在 `writeRunResult`（Q5）内部完成。

```text
1. 构造 RunResultFile 对象（actionResult 不含 runRef）
2. 将 RunResultFile 对象传递给 writeRunResult(runPath, resultFile)
   — adapter 不序列化
   — adapter 不直接写入 result.json
   — adapter 不调用 atomicWriteFile(result.json, ...)
   — 校验、序列化、独占发布（temp-file + fs.link）全部在 writeRunResult 内部完成
3. writeRunResult 发布后，文件内容不含自身哈希——versionFingerprint 在读取时派生
```

**adapter 边界（C1-EX-009 + C1-EX-010）：**

- `result-ref-adapter` 只负责**构造对象**和**读取派生**，不负责序列化和发布
- adapter 永远不直接写入或替换 `result.json`
- adapter 不序列化 `RunResultFile`——序列化在 `writeRunResult` 内部完成
- terminal result 校验、序列化、发布是 `writeRunResult`（Q5）的独占职责
- `atomicWriteFile` 可用于 staging 目录内的文件（如 `action.md`、`context.json`），不用于 `result.json`

**读取行为（派生 runRef）：**

```text
1. 读取 result.json 文件原始内容
2. computeResultFileHash(fileContent) → versionFingerprint
3. 解析 JSON 为 RunResultFile
4. 如果 actionResult 存在：
   reconstructActionResult(actionResult, runPath, fileContent)
   → 派生 runRef = { ref: <path>, versionFingerprint: <hash>, kind: "run-result" }
   → 返回完整 ActionResult = { ...actionResultWithoutRunRef, runRef }
5. 返回包含完整 ActionResult 的 RunRecord
```

**替换检测：**

当 Run B 引用 Run A 的 `result.json` 时，Run B 的 `context.json` 存储 `inputRef: ResultRef` 指向 Run A 的 `result.json`，其中 `versionFingerprint` 是 Run A 写入时的文件内容 SHA-256。

如果 Run A 的 `result.json` 后续被修改：
- Reader 重新计算文件内容 SHA-256 → 得到新的 `versionFingerprint'`
- `verifyResultRef(inputRef, actualFileContent)` 返回 `false`（旧 fingerprint ≠ 新 hash）
- Reader 产生 `FactConflict` 或标记引用失效

**映射规则：**
- `ref`：使用 POSIX 路径（`normalizeSeparators`），如 `.flowkit/runs/20260806-01-deterministic-core/domain-and-state-schema/20260806-034-review-apply/result.json`
- `versionFingerprint`：SHA-256 hex digest of file content（文件不含 `runRef`，非自引用）
- `kind`：`"run-result"`（用于 Run result）、`"verification"`（用于 verification.md）、`"frozen-spec"`（用于冻结 spec）

**为什么不能在文件中存储 versionFingerprint：**

如果 `result.json` 包含 `actionResult.runRef.versionFingerprint`，而 `versionFingerprint` = SHA-256(`result.json` 内容)，则：
- `versionFingerprint` 的值依赖于包含 `versionFingerprint` 的内容 → 循环依赖
- 写入时无法构造：需要先计算哈希，但哈希需要完整内容，而完整内容需要哈希值

省略-派生模式打破循环：
- 文件内容不含 `versionFingerprint` → 哈希可从完整内容计算
- `versionFingerprint` 在读取时派生 → 不需要在写入时构造自引用

Fixture 测试（C1-EX-005 required）：
- 写入后读取：`runRef.versionFingerprint` = 文件内容 SHA-256（一致）
- 替换检测：修改文件后 `verifyResultRef` 返回 false
- 错误 fingerprint 拒绝：引用方声称的 fingerprint ≠ 文件实际 SHA-256 → `verifyResultRef` 返回 false
- `actionResult` 含 `runRef` 字段的 result.json → reject（物理格式错误）

### Q8：Delivery Manifest 如何读取和校验？

**推荐**：`manifest-reader.ts` 负责读取和校验 Delivery Manifest。

```typescript
/**
 * 读取并校验 Delivery Manifest。
 * 扫描 openspec/delivery-groups/*.yaml，期望恰好一个 active Delivery。
 */
export async function readDeliveryManifest(
  manifestDir: string,
): Promise<Delivery>;
```

流程：

1. 扫描 `openspec/delivery-groups/*.yaml`
2. 解析每个 YAML 文件
3. 调用 B1 的 Schema 校验确保 `state`、`fullTestStatus`、`changes[].state` 等字段合法
4. 校验唯一性：恰好一个 `state: active` 的 Delivery（零个或多个时产生 conflict）
5. 校验唯一性：active Delivery 中最多一个 `state: active` 的 Change
6. 构造 `Delivery` 对象返回

YAML 解析不引入外部运行时依赖——使用 Node.js 内置能力或最小内联解析器。如果 YAML 解析需要库，在 Explore 中标记为待确认，在 Propose 中决定（优先手写最小 YAML 子集解析器，避免引入 `js-yaml` 等外部依赖，与 A1 无运行时依赖原则一致）。

### Q9：Run ID 文件系统集成如何工作？

**推荐**：`run-id-fs.ts` 为 B1 的纯函数提供文件系统收集的 Run-ID 列表。

```typescript
/**
 * 遍历 .flowkit/runs/<delivery-id>/ 收集所有 Run-ID。
 * 扫描 Change 级目录和 _delivery 级目录。
 * 返回 Run-ID 字符串列表，供 B1 的 allocateNextNnn / validateRunIdUniqueness 使用。
 */
export async function collectExistingRunIds(
  deliveryRunRoot: string,
): Promise<readonly string[]>;
```

流程：

1. 遍历 `.flowkit/runs/<delivery-id>/` 下的所有子目录（Change 级 + `_delivery` 级）
2. 在每个子目录中遍历 Run 目录（名称格式 `YYYYMMDD-NNN-action`）
3. 收集 Run 目录名称作为 Run-ID 字符串
4. 返回列表

B1 的 `allocateNextNnn(existingRunIds)` 使用此列表分配下一个 NNN。B1 的 `validateRunIdUniqueness(existingRunIds)` 使用此列表校验唯一性。B1 的纯函数不执行文件系统遍历，C1 提供文件系统集成。

### Q10：测试策略？

**推荐**：全部使用构造的 fixture 目录结构，不依赖真实 Git 仓库。

- **Reader 测试**：在 `os.tmpdir()` 下构造临时目录结构（模拟 `.flowkit/runs/`、`openspec/changes/`、`openspec/specs/`），写入 fixture 文件，测试 Reader 正确读取和归一化
- **冲突测试**：构造不一致的 fixture（如 Manifest 说 completed 但无 archive Run），验证 `snapshot.conflicts` 非空
- **持久化测试**：构造临时 Run 目录，测试 `createRun`（staging + publish）和 `writeRunResult`（read + assertMutable + write）的原子性；模拟每个中断边界（staging 写入中断、staging 校验失败、publish rename 失败、result.json 写入中断），验证恢复行为和 staging 目录清理
- **Run ID FS 测试**：构造临时 `.flowkit/runs/` 目录树，验证 `collectExistingRunIds` 正确收集所有 Run-ID
- **ResultRef adapter 测试**：构造 fixture result.json，验证 content hash 计算和 ref 映射
- **Git reader 测试**：mock `external-command.ts` 的外部命令调用，验证 `GitBoundarySummary` 构造

测试不依赖：
- 真实 Git 仓库初始化
- 真实 `openspec` CLI
- 真实 Delivery Manifest（使用构造的 fixture YAML）

### Q11：YAML 解析方案？

**推荐**：探索阶段标记为待确认，倾向手写最小 YAML 子集解析器。

Delivery Manifest 使用的 YAML 特性非常有限：
- 键值对（`key: value`）
- 缩进嵌套（changes 数组、outputs 数组）
- 多行字符串（`goal: >`）
- 列表项（`- item`）
- 引号字符串

手写解析器的优势：
- 不引入外部运行时依赖（与 A1 原则一致）
- 只需支持 Manifest 实际使用的 YAML 子集
- 避免 `js-yaml` 等库的版本和安全问题

如果在 Propose 阶段发现 YAML 子集过于复杂，可以重新评估引入 `js-yaml` 作为 devDependency（仅测试用）或 runtime dependency。

## 6. 跨 Change Finding

### 6.1 D1 将消费 C1 的 FormalFactSnapshot

D1 的 Policy 引擎（`canRun` / `next` / `diagnose`）以 `FormalFactSnapshot` 为唯一输入。C1 必须确保 Snapshot 包含 Policy 所需的全部正式事实（`docs/delivery-lifecycle.md` Section 5 清单），且 `conflicts` 字段使 D1 能 fail-closed。

### 6.2 E1 将消费 C1 的 Reader 和 Persistence

E1 的诊断 CLI 需要：
- `status`：调用 C1 Reader 获取 Snapshot，展示 Delivery/Change 状态
- `next`：调用 D1 Policy，展示计算结果（以 C1 Snapshot 为输入）
- `doctor`：调用 C1 Reader，检查 Schema、唯一性、Run 路径、冲突
- `resume-context`：调用 C1 Reader 生成 ContinuationContext 视图

### 6.3 B1 的纯函数需要 C1 的文件系统集成

B1 的 `allocateNextNnn`、`validateRunIdUniqueness`、`validateCandidateNnn` 是纯函数，操作传入的 Run-ID 字符串列表。C1 的 `run-id-fs.ts` 负责从文件系统收集 Run-ID 列表并传入 B1 函数。这是 B1/C1 的明确接口边界。

### 6.4 C1 不调用 OpenSpec CLI

本 Delivery 的 C1 只读取 OpenSpec 目录结构的文件系统事实（存在性、状态摘要），不调用 `openspec validate`、`openspec archive` 等命令。完整 OpenSpec CLI 集成在下一 Delivery。

### 6.5 C1 不实现 ContinuationContext 生成逻辑

C1 定义 ContinuationContext 的序列化 schema 和恢复机制，但 ContinuationContext 的实际生成逻辑（从 FormalFactSnapshot 构造 ContinuationContext）属于 D1/E1。C1 只确保序列化和恢复的物理能力，不决定何时生成。

## 7. 验收标准

1. `FormalFactSnapshot` 类型定义存在，包含 Policy 输入清单的全部字段
2. Reader 能从 Delivery Manifest、OpenSpec 目录结构、Run 文件、Git 只读命令读取并归一化为 `FormalFactSnapshot`
3. Reader 在同一事实多来源冲突时收集 `FactConflict`，不自动择优
4. Reader 在文件损坏或 Schema 校验失败时 throw `FlowkitError`，不产生部分快照
5. Run 创建使用 staging + atomic publish 协议：全部初始文件在临时 staging 目录中准备并校验后，通过目录 rename 原子发布（C1-EX-002）
6. Run 创建中断不留下可见的半建 Run：staging 目录 `.tmp-<run-id>/` 对 Reader 不可见，只有 rename 后的 `<run-id>/` 被识别为正式 Run（C1-EX-002）
7. Run 完成时 assertMutable 校验 CURRENT 持久化状态（pending），不是 NEW terminal 结果；pending 通过校验后写入 result.json 使 Run 转为 terminal（C1-EX-001）
8. terminal Run 的 result.json 不可覆盖：后续 writeRunResult 调用读取到 terminal 状态时 assertMutable throw
9. **独占完成发布协议（C1-EX-006 + C1-EX-009 + C1-EX-010）**：writeRunResult 使用 temp-file + `fs.link` 原子 create-if-not-exists 发布 result.json；不使用 `atomicWriteFile`（temp + rename 是原子替换，不提供 no-replace 保证）；并发 writer fixture 证明第一个 result.json 保留不变，失败 writer 收到 `RUN_TERMINAL`；不依赖预先 exists 检查做并发安全；Q7 adapter 不序列化、不发布或替换 terminal result——校验、序列化、独占发布全部在 `writeRunResult` 内部完成；`writeRunResult` 接受 `RunResultFile` 对象（不接受 JSON 字符串）；一致性契约 fixture 证明没有文档化 helper 路径能覆盖已存在的 result.json
10. result.json 物理格式 `RunResultFile` 显式携带 `runStatus`（terminal）；`executionStatus` 不在顶层——当 `actionResult` 存在时从 `actionResult.executionStatus` 派生（C1-EX-008 单源真相）；两个值集独立，不从 `executionStatus` 推断 `runStatus`（C1-EX-003）
11. `RunResultFile` 允许的组合和禁止的组合在写入和读取时均校验；5 个合法 terminal 状态和至少 7 个非法组合各有 fixture（C1-EX-003 + C1-EX-008）
12. Reader 读取 `result.json` 时校验 `runStatus` + `actionResult` 存在性 + `actionResult.executionStatus` 组合合法性，校验失败 throw `FlowkitError`，不猜测修复（C1-EX-003 + C1-EX-008）
13. **C1 拥有 `validateActionResultWithoutRunRef` 物理投影校验器（C1-EX-007）**：枚举必填字段（action、executionStatus、summary）和可选字段（含嵌套 ResultRef），使用 B1 导出的 `isExecutionStatus` 和 `CHANGE_ACTIONS`/`DELIVERY_ACTIONS` 常量校验枚举值；不调用不存在的 B1 `validateActionResult`；C1 定义自己的 `validateResultRefProjection`（B1 的 `validateResultRef` 未导出）；malformed fixture 覆盖 11 种缺失/无效字段；重建后校验逻辑不变量
14. Run ID 分配通过 B1 的 `allocateNextNnn` + C1 的文件系统 Run-ID 收集
15. ResultRef adapter 使用 content hash（SHA-256）作为 `versionFingerprint`，不使用自引用 Commit SHA
16. result.json 物理序列化省略 `actionResult.runRef`；`versionFingerprint` 在读取时从文件内容 SHA-256 派生；文件不包含自身哈希，消除自引用循环（C1-EX-005）
17. `verifyResultRef` 能检测文件替换（fingerprint 不匹配 → false）和拒绝错误 fingerprint；fixture 覆盖写入后读取一致、替换检测、错误 fingerprint 拒绝、含 runRef 的 result.json 拒绝（C1-EX-005）
18. Git 边界摘要只读不写，不持久化到状态文件
19. Reader 不调用 OpenSpec CLI，只读取目录结构
20. Reader 不实现 Policy、诊断 CLI 或完整 Change 执行循环
21. staging 清理不分配给只读 doctor：Reader 忽略 staging 目录，createRun 对自身 staging 目录 best-effort 清理，显式恢复变更 deferred（C1-EX-004）
22. 不引入外部运行时依赖（YAML 解析待确认，倾向手写最小子集）
23. 全部测试使用构造的 fixture 目录结构，不依赖真实 Git 仓库
24. 持久化测试覆盖每个中断边界：staging 写入中断、staging 校验失败、publish rename 失败、result.json 写入中断、fs.link EEXIST 并发 writer
25. `conflicts` 非空时 Policy 可 fail-closed（D1 消费，C1 只提供冲突事实）
26. typecheck + build + test + lint 全部通过
27. 不创建第二套 `current-state` 文件

## 8. 探索结论

1. C1 范围是 **FormalFactSnapshot 只读视图 + 正式事实 Reader + Run 两阶段原子持久化 + ResultRef adapter**，不包含 Policy、诊断 CLI 或完整 OpenSpec CLI 集成
2. `FormalFactSnapshot` 字段直接映射 `docs/delivery-lifecycle.md` Section 5 的 Policy 输入清单，包含 `conflicts` 字段使 fail-closed 显式化
3. Reader 遵循 `One fact, one authority`：每个事实从唯一权威来源读取，不做跨权威交叉推断
4. Reader 不调用 OpenSpec CLI，只读取 OpenSpec 目录结构的文件系统事实（存在性、状态摘要）
5. Run 持久化分为两阶段：创建（staging + atomic publish）和完成（read-current + assertMutable + 独占发布）；assertMutable 校验 CURRENT pending 状态而非 NEW terminal 结果（C1-EX-001）；完成发布使用 temp-file + `fs.link` 原子 create-if-not-exists，不使用 `atomicWriteFile`（rename 是替换不是 no-replace），并发 writer 中第一个 result.json 保留不变，失败 writer 收到 `RUN_TERMINAL`（C1-EX-006）；Q7 adapter 只负责**构造对象**和读取派生，不序列化、不发布或替换 terminal result——校验、序列化、独占发布全部在 `writeRunResult`（Q5）内部完成，`writeRunResult` 是 terminal result 的唯一发布路径（C1-EX-009 + C1-EX-010）
6. Run 创建使用 staging 目录 + atomic rename 确保 all-or-nothing 发布；staging 目录对 Reader 不可见；staging 清理由 createRun best-effort 执行，不分配给只读 doctor（C1-EX-002, C1-EX-004）
7. result.json 物理格式 `RunResultFile` 显式携带 `runStatus`（terminal）；`executionStatus` 不在顶层，当 `actionResult` 存在时从 `actionResult.executionStatus` 派生（C1-EX-008 单源真相）；两个值集独立（RunStatus ≠ ExecutionStatus），不从 `executionStatus` 推断 `runStatus`；允许/禁止组合在写入和读取时均校验（C1-EX-003）
8. C1 拥有 `validateActionResultWithoutRunRef` 物理投影校验器——枚举必填/可选字段、嵌套 ResultRef 校验、禁止 runRef 字段；不调用不存在的 B1 `validateActionResult`；C1 定义自己的 `validateResultRefProjection`（B1 的 `validateResultRef` 未导出）；malformed fixture 覆盖 11 种缺失/无效字段（C1-EX-007）
9. Run ID 分配通过 B1 纯函数 + C1 文件系统 Run-ID 收集的明确接口
10. ResultRef adapter 使用 content hash（SHA-256）作为 `versionFingerprint`，避免自引用 Commit SHA
11. result.json 物理序列化省略 `actionResult.runRef`，`versionFingerprint` 在读取时从文件内容 SHA-256 派生——文件不包含自身哈希，消除自引用循环（C1-EX-005）
12. Git 边界摘要只读不写，不持久化到状态文件
13. 冲突检测收集为 `FactConflict[]`，Reader 不丢弃冲突，Policy 在冲突存在时必须 blocked
14. 全部测试使用构造的 fixture 目录结构，不依赖真实 Git 仓库；持久化测试覆盖每个中断边界、每个允许/禁止的 runStatus+executionStatus 组合、非自引用序列化的替换检测和错误 fingerprint 拒绝、malformed 投影字段
15. YAML 解析倾向手写最小子集解析器，避免引入外部运行时依赖；Propose 阶段最终确认

## 9. Review 重点

1. C1 范围是否清晰——只做 Reader + Persistence + ResultRef adapter，不做 Policy / CLI / OpenSpec CLI 集成
2. `FormalFactSnapshot` 字段是否完整覆盖 Policy 输入清单（`docs/delivery-lifecycle.md` Section 5）
3. fail-closed 冲突检测是否正确——Reader 收集 `FactConflict` 而非自动择优，Policy 在冲突时 blocked
4. Reader 是否正确遵循 `One fact, one authority`——每个事实从唯一权威读取
5. Run 持久化 assertMutable 顺序是否正确——校验 CURRENT pending 状态而非 NEW terminal 结果（C1-EX-001）
6. Run 创建 staging + atomic publish 是否确保 all-or-nothing——staging 目录对 Reader 不可见（C1-EX-002）
7. **独占完成发布协议是否正确（C1-EX-006 + C1-EX-009 + C1-EX-010）**——writeRunResult 使用 temp-file + `fs.link` 原子 create-if-not-exists；不使用 `atomicWriteFile`（rename 是替换不是 no-replace）；并发 writer fixture 证明第一个 result.json 保留不变，失败 writer 收到 `RUN_TERMINAL`；不依赖预先 exists 检查做并发安全；Q7 adapter 不序列化、不发布或替换 terminal result，只有 `writeRunResult` 是发布路径；`writeRunResult` 接受 `RunResultFile` 对象（不接受 JSON 字符串），校验+序列化+发布在函数内部完成；一致性契约 fixture 证明没有 helper 路径能覆盖已存在的 result.json
8. result.json 物理 schema `RunResultFile` 是否正确区分 `runStatus`（terminal RunStatus）和 `executionStatus`（ExecutionStatus）——两个值集独立，不从 `executionStatus` 推断 `runStatus`（C1-EX-003）；`executionStatus` 不在顶层，从 `actionResult.executionStatus` 派生（C1-EX-008 单源真相）
9. `RunResultFile` 允许/禁止组合表是否穷尽——5 个合法 + 7 个非法（含顶层 `executionStatus` 字段存在 reject），写入和读取均校验（C1-EX-003 + C1-EX-008）
10. **C1 物理投影校验器是否可执行（C1-EX-007）**——`validateActionResultWithoutRunRef` 枚举必填字段（action、executionStatus、summary）和可选字段（含嵌套 ResultRef），使用 B1 导出的 `isExecutionStatus` 和 `CHANGE_ACTIONS`/`DELIVERY_ACTIONS`；不调用不存在的 B1 `validateActionResult`；C1 定义自己的 `validateResultRefProjection`（B1 的未导出）；malformed fixture 覆盖 11 种缺失/无效字段；重建后校验逻辑不变量
11. staging 清理是否正确分配——createRun best-effort，不分配给只读 doctor，显式恢复变更 deferred（C1-EX-004）
12. ResultRef adapter 是否避免自引用 Commit SHA——使用 content hash 而非 Commit SHA
13. result.json 物理序列化是否正确消除自引用——省略 `actionResult.runRef`，读取时从文件内容 SHA-256 派生 `versionFingerprint`，文件不含自身哈希（C1-EX-005）
14. `verifyResultRef` 替换检测和错误 fingerprint 拒绝是否正确——fixture 覆盖写入后读取一致、替换检测、错误 fingerprint 拒绝、含 runRef 的 result.json 拒绝（C1-EX-005）
15. Git 边界摘要是否只读不写——不持久化到状态文件
16. Reader 是否不调用 OpenSpec CLI——只读取目录结构
17. Run ID 文件系统集成是否正确对接 B1 纯函数——C1 收集 Run-ID 列表，B1 分配和校验
18. 测试策略是否可行——全部构造 fixture，不依赖真实 Git；持久化测试覆盖每个中断边界、每个允许/禁止的 runStatus+executionStatus 组合、非自引用序列化的替换检测和错误 fingerprint 拒绝、malformed 投影字段、以及并发 writer 的独占发布
19. YAML 解析方案是否合理——倾向手写最小子集，Propose 阶段最终确认
20. B1/C1 所有权边界是否一致——B1 拥有类型和纯函数，C1 拥有持久化、文件系统集成和物理传输 schema
