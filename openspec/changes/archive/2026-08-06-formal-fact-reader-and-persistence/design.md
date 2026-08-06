# Design: C1 — formal-fact-reader-and-persistence

## 设计决策

### D1: FormalFactSnapshot 字段直接映射 Policy 输入清单

`FormalFactSnapshot` 字段直接映射 `docs/delivery-lifecycle.md` Section 5 的 Policy 输入清单。包含 `conflicts: FactConflict[]` 使 fail-closed 显式化——Reader 不丢弃冲突，Policy 在冲突存在时必须 blocked。

### D2: One fact, one authority

每个正式事实从唯一权威来源读取。Reader 不做跨权威交叉推断。冲突收集为 `FactConflict[]`，Reader 不自动择优，Policy 在冲突时 blocked。

### D3: Reader 不调用 OpenSpec CLI

Reader 只读取 OpenSpec 目录结构的文件系统事实（存在性、状态摘要），不调用 OpenSpec CLI 命令。OpenSpec CLI 集成属于后续 Change。

### D4: Run 创建使用 staging + atomic publish

`createRun` 在 staging 目录 `.tmp-<run-id>/` 中准备全部初始文件（action.md、context.json），校验后通过目录 rename 原子发布。staging 目录对 Reader 不可见——只有 rename 后的 `<run-id>/` 被识别为正式 Run。

### D5: Run 完成使用独占 fs.link 发布协议

`writeRunResult` 使用 temp-file + `fs.link` 原子 create-if-not-exists 发布 result.json。不使用 `atomicWriteFile`（temp + rename 是原子替换，不提供 no-replace 保证）。第一个 writer 的 result.json 不会被后续 writer 覆盖。后续 writer 收到 EEXIST → throw RUN_TERMINAL。

`writeRunResult` 是 terminal result 的唯一发布路径。校验、序列化、独占发布全部在函数内部完成。adapter 只负责构造对象和读取派生，不序列化、不发布。

### D6: assertMutable 校验 CURRENT pending 状态

assertMutable 校验 CURRENT 持久化状态（pending），不是 NEW terminal 结果。pending 通过校验后写入 result.json 使 Run 转为 terminal。

### D7: 非自引用序列化边界

result.json 物理序列化省略 `actionResult.runRef`。`versionFingerprint` 在读取时从文件内容 SHA-256 派生。文件不包含自身哈希，消除自引用循环。

### D8: executionStatus 单源真相

`RunResultFile` 不在顶层携带 `executionStatus`。当 `actionResult` 存在时，`executionStatus` 从 `actionResult.executionStatus` 派生。当 `actionResult` 不存在（runStatus=failed/cancelled）时，没有 `executionStatus`。消除跨字段不一致。

### D9: C1 拥有物理投影校验器

B1 `schema-validator.ts` 只导出 `validateRun`，没有 `validateActionResult`。B1 `validateResultRef` 是私有未导出。C1 定义自己的 `validateActionResultWithoutRunRef` 和 `validateResultRefProjection`，使用 B1 导出的 `isExecutionStatus` 和 `CHANGE_ACTIONS`/`DELIVERY_ACTIONS` 常量校验枚举值。

### D10: ResultRef versionFingerprint 使用 content hash

ResultRef adapter 使用 content hash（SHA-256）作为 `versionFingerprint`，不使用自引用 Commit SHA。`verifyResultRef` 能检测文件替换（fingerprint 不匹配 → false）。

### D11: Git 边界摘要只读不写

Git 边界摘要只读取，不持久化到状态文件。Reader 从 Git 读取 Delivery Start、Change Checkpoint、Delivery Final 的摘要信息。

### D12: Run ID 文件系统集成

C1 的 `run-id-fs.ts` 收集文件系统 Run-ID 列表，调用 B1 的 `allocateNextNnn` 纯函数分配下一个 Run-ID。C1 不重新实现 Run-ID 分配逻辑。

### D13: staging 清理不分配给只读 doctor

staging 清理由 `createRun` best-effort 执行，不分配给只读 doctor。显式恢复变更 deferred。

### D14: YAML manifest 解析使用手写最小子集

C1 不引入外部运行时依赖。Delivery Manifest 是 YAML 格式，C1 手写最小子集解析器，支持 Delivery Manifest 实际使用的 YAML 子集。

支持：
- block mapping（`key: value`）
- block sequence（`- item`）
- flow sequence（`[a, b, c]`）
- plain / single-quoted / double-quoted scalars
- nested structures（mapping 内嵌 mapping / sequence）
- 基础类型：null、bool、int、string
- 注释（`#`）
- 多行字符串（literal `|` 和 folded `>`）

不支持：
- anchor / alias（`&` / `*`）
- multi-document（`---` 分隔）
- tag（`!!`）
- complex flow mapping（`{key: value}`）

错误行为：解析失败 → `FactConflict`，不 throw 中断 Reader。Reader 将解析失败记录为冲突，Policy 在冲突存在时 blocked。

### D15: context.json 物理 schema + 确定性投影 + 身份校验

`createRun` 创建 `context.json` 作为 Run 的输入上下文和确定性 current-Run 投影。C1 定义 `ContextFile` 物理 schema，与 `RunResultFile` 对称。C1 Run 使用 `schemaVersion: 2` 作为 C1 格式标记，与 Bootstrap corpus 的 `schemaVersion: 1` 明确区分（见 D16）。

```typescript
interface ContextFile {
  readonly schemaVersion: 2;           // C1 格式标记，固定为 2
  readonly runId: string;
  readonly deliveryId: string;
  readonly changeKey?: string;         // C1 专属字段；Change-level Run 必填，Delivery-level Run 必须缺失
  readonly changeId?: string;          // 对应 B1 Run.changeId；Change-level Run 必填，Delivery-level Run 必须缺失
  readonly action: ChangeAction | DeliveryAction;
  readonly role: Role;
  readonly ownerAuthorization: string;
  readonly inputRef?: ResultRef;       // 对应 B1 Run.inputRef?: ResultRef；通过 validateResultRefProjection 校验
  readonly sourceReviewRun?: string;
  readonly sourceReviewVerdict?: 'approved' | 'changes-requested';
  readonly constraints: {
    readonly mayCreateProposalArtifacts?: boolean;
    readonly mayWriteProductionCode?: boolean;
    readonly mayWriteTestCode?: boolean;
    readonly mayCheckpoint?: boolean;
    readonly mayFullTest?: boolean;
    readonly commitAllowed?: boolean;
  };
  readonly runPath: string;
}
```

**Action-scope 规则**（C1-PR-008）：`changeKey`/`changeId` 的存在性由 `action` 的 Action Catalog 归属决定，与 B1 `Run.changeId?` 语义一致（B1 `Run` 无 `changeKey`，`changeKey` 是 C1 专属的人类可读 Change key）：

- `action ∈ DELIVERY_ACTIONS`（`full-test`、`delivery-finalize`）→ Delivery-level Run → `changeKey`/`changeId` MUST 缺失
- `action ∈ CHANGE_ACTIONS`（其余 10 个）→ Change-level Run → `changeKey`/`changeId` MUST 存在
- 混合（Delivery action 携带 changeId，或 Change action 缺失 changeId）→ reject（createRun）或 `FactConflict`（Reader）

**inputRef 投影**（C1-PR-007）：`ContextFile.inputRef?: ResultRef` 与 B1 `Run.inputRef?: ResultRef` 类型一致。`inputRef` 可选（explore 等无 source review 的 Run 可缺失）。存在时 MUST 通过 C1 `validateResultRefProjection` 校验（`ref` + `versionFingerprint` 为非空 string）。确定性投影为直接映射：`ContextFile.inputRef` → `Run.inputRef`，无需类型转换。Bootstrap Run 的字符串形 `inputRef` 不走 C1 投影，由 D16 legacy adapter 处理。

**确定性 current-Run 投影**：`ContextFile` 是构造当前 Run 对象（result.json 写入前，status=pending）的唯一确定性来源。`writeRunResult` 从 `context.json` 读取并构造 `Run` 对象，该 `Run` 对象的 `runId`、`deliveryId`、`changeId`、`action`、`role` 字段来自 `ContextFile`，`status` 为 `pending`（因为 result.json 不存在），`inputRef` 直接映射自 `ContextFile.inputRef`。构造的 `Run` MUST 通过 B1 `validateRun`。

**身份校验**（C1-PR-004）：`validateContextFileIdentity(contextFile, expectedRunDir)` 校验 ContextFile 与文件系统路径的一致性：

- `contextFile.runId` MUST 匹配 Run 目录名（如目录 `20260806-054-propose/` → runId 必须为 `20260806-054-propose`）
- `contextFile.deliveryId` MUST 匹配 Delivery 级路径段（如路径含 `20260806-01-deterministic-core/` → deliveryId 必须为 `20260806-01-deterministic-core`）
- Change-level Run：`contextFile.changeId` MUST 匹配 Change 级路径段（如路径含 `formal-fact-reader-and-persistence/` → changeId 必须为 `formal-fact-reader-and-persistence`）
- Delivery-level Run：跳过 changeId 路径段校验（changeId 缺失，路径中无 Change 段）
- `contextFile.runPath` MUST 与实际文件系统路径一致

身份校验失败 → `FactConflict`（Reader）或 reject（createRun）。防止 context.json 被复制到不同 Run 目录后误 accepted。

校验流程：
1. `validateContextFile(contextFile)` — `schemaVersion === 2` + 字段类型 + 必填 + Action-scope 规则 + inputRef `validateResultRefProjection`
2. `validateContextFileIdentity(contextFile, expectedRunDir)` — 路径一致性校验
3. 两步都通过 → C1 Run
4. 步骤 1 或 2 失败（且 `schemaVersion === 2`）→ `FactConflict`（fail-closed，见 D16）
5. `schemaVersion !== 2` → 进入 D16 legacy 判别

`ContextFile` 和 `RunResultFile` 都是 C1 拥有的物理 schema。`ContextFile` 不存在非自引用序列化问题——它不包含自身哈希字段。

### D16: Bootstrap Run 兼容性 + 三路判别器 + fail-closed

现有 Runs（001-059）由 bootstrap 手工创建，使用 `schemaVersion: 1`，不符合 C1 的 `createRun` staging+publish 协议。C1 Run 使用 `schemaVersion: 2` 作为明确格式标记（C1-PR-006：复用 `schemaVersion: 1` 会使 malformed C1 Run 被降级为 Bootstrap 而非 fail-closed）。

**三路判别器**（C1-PR-006）：Reader 读取 `context.json` 后按 `schemaVersion` 分流，MUST NOT 使用 `validateContextFile` 失败作为降级路径：

1. `schemaVersion === 2` → **C1 Run 路径**：MUST 执行 `validateContextFile`（C1 schema）+ `validateContextFileIdentity`（身份校验）。任一失败 → `FactConflict`（fail-closed，MUST NOT 降级为 Bootstrap best-effort）。两步通过 → 完整 C1 Run。
2. `schemaVersion === 1` 或缺失 → **legacy 路径**：进入 bounded legacy recognizer（见下）。
3. 其他 `schemaVersion` 值（如 0、3、负数）→ `FactConflict`（未知格式，fail-closed）。

**Bounded legacy recognizer**（C1-PR-005/006）：对 `schemaVersion === 1` 或缺失的记录做有界形状识别，MUST NOT 调用 C1 `validateContextFile`（那是 C1 Run 路径的校验器）。识别规则：

- 必须存在 B1 Run 最小必填字段：`runId`、`deliveryId`、`action`、`role`（`action` 在 B1 `CHANGE_ACTIONS` 或 `DELIVERY_ACTIONS` 中，`role` 为 `owner`/`author`/`reviewer`）
- `changeId` 可选（与 B1 `Run.changeId?` 一致）；`changeKey`、`ownerAuthorization`、`inputRef`、`runPath`、`constraints` 等字段可能存在也可能缺失，缺失用默认值（可选字段为 `undefined`）
- `inputRef` 若存在且为 string 形（Bootstrap 习惯），legacy adapter best-effort 读取为 `Run.inputRef = undefined`（不构造 `ResultRef`，因为 Bootstrap string 无 `versionFingerprint`）；C1 投影只对 `schemaVersion === 2` 生效
- 满足最小形状 → Bootstrap Run（best-effort 读取）；不满足 → `FactConflict`（fail-closed）

**Bootstrap Run 读取边界**：

- 读取：读取 `action.md` + `context.json` + `result.json`（如果存在）
- 校验：Bootstrap Run 不强制 `ContextFile`/`RunResultFile` schema 校验（走 legacy recognizer，不走 C1 `validateContextFile`）
- runStatus 归一化：`result.json` 不存在 → `pending`；`result.json` 存在 → 从 `result.json.status` 读取并归一化为 B1 `TerminalRunStatus`（`completed`/`failed`/`cancelled`），MUST NOT 降级为无差别的 `terminal`。现有 Bootstrap `result.json` 已携带 `status: completed|failed|cancelled` 字段；字段缺失或值不在枚举内 → fail closed 收集为 `FactConflict`
- versionFingerprint：Bootstrap Run 的 `result.json` 可能包含 `actionResult.runRef.versionFingerprint`（自引用值），Reader 读取时不校验该值的一致性

**真实语料对照**（060-revise 验证证据）：

- `054-propose/context.json`：`schemaVersion: 1` + 字段齐全（含 changeKey/inputRef as string/runPath）→ legacy 路径 → Bootstrap Run ✓
- `055-review-propose/context.json`：`schemaVersion: 1` + 缺 changeKey/ownerAuthorization/inputRef/runPath + constraints 形状不同 → legacy 路径 → Bootstrap Run ✓
- `056-revise-propose/context.json`：`schemaVersion: 1` + 含 `findings` 未知字段 → legacy 路径（不调 C1 validateContextFile，不拒未知字段）→ Bootstrap Run ✓

`createRun` / `writeRunResult` 对 Bootstrap Run：
- 不修改、不迁移、不重写
- 新 Run（由 C1 `createRun` 创建）使用 `schemaVersion: 2` + 完整 C1 schema 校验 + `validateContextFileIdentity` 身份校验
- 在 C1 `createRun` 实现前，所有 Run 仍由 bootstrap 手工创建并使用 `schemaVersion: 1`（包括本 060-revise-propose Run）

### D17: writeRunResult 重建 CURRENT 持久化状态供 assertMutable 观察（C1-AP-002）

`writeRunResult` 在调用 `assertMutable` 前必须观察真实的 CURRENT 持久化状态，不是新投影的 pending Run。重建规则：

- `result.json` 不存在 → CURRENT 状态为 pending（从 `context.json` 投影）
- `result.json` 存在 → CURRENT 状态为 terminal（从 `RunResultFile.runStatus` 重建）

`assertMutable` 在 terminal 状态下 throw `RUN_TERMINAL`，拒绝发生在任何 temp-file 发布之前。race-safe `fs.link` 保留为并发不变量：两个 writer 都看到 result.json 不存在时，`fs.link` 保证只有一个成功。`assertMutable` 是单 writer 快路径拒绝，`fs.link` EEXIST 是多 writer 竞态拒绝。

`writeRunResult` 在 `assertMutable` 前还必须调用 `validateContextFileIdentity`，防止 `context.json` 被复制到错误目录后被写入。

`result.json` 存在但 `runStatus` 缺失或无效时 throw `SCHEMA_VALIDATION_FAILED`——持久化状态不一致，MUST NOT 静默覆盖。

### D18: Delivery Manifest 嵌套 delivery 状态 + fail-closed（C1-AP-003）

实际 Delivery Manifest（`openspec/delivery-groups/*.yaml`）将 `state` 和 `fullTestStatus` 存储在嵌套 `delivery:` mapping 下，不是顶层。Reader 必须从 `manifest.delivery.state` 和 `manifest.delivery.fullTestStatus` 读取。

Manifest 存在但 `delivery:` mapping 缺失、或 `delivery.state`/`delivery.fullTestStatus` 缺失/无效时收集 `FactConflict`（fail-closed），不静默返回 `undefined`。Manifest 完全不存在时返回 `undefined`（bootstrap-only Delivery，由 Policy 决定）。

`delivery.state` 枚举：`active|completed|cancelled`（B1 `DeliveryState`）。`delivery.fullTestStatus` 枚举：`not-ready|awaiting-user-decision|authorized|passed|failed`（B1 `FullTestStatus`）。

### D19: Review verdict canonical payload + Bootstrap 连接重建（C1-AP-004）

C1 定义 canonical review verdict payload：

- `ContextFile.reviewedRunId?: string` — review-* Run 的被审查 Run ID（required for review-*，absent for non-review）
- `RunResultFile.reviewVerdict?: ReviewVerdictValue` — review-* Run 的 verdict 值（optional at schema level，Reader 对 completed review-* Run 缺失时收集 FactConflict）

`reviewedRunId` 与 `sourceReviewRun` 语义不同：`reviewedRunId` 是 review-* Run 审查的目标 Run；`sourceReviewRun` 是 revise-* Run 修订的前序 review Run。两者不能互换。

Review-scope 规则（类似 Action-scope 规则）：
- `action` 以 `review-` 开头 → `reviewedRunId` MUST 存在
- `action` 不以 `review-` 开头 → `reviewedRunId` MUST 缺失
- 混合 → reject（createRun）或 `FactConflict`（Reader）

Bootstrap review-* Run 的连接字段因 vintage 而异，Reader 必须尝试多种字段名：
- `reviewedRun`（path string）→ 取 basename 作为 Run ID
- `input.reviewedRunId`（Run ID string）
- `sourceRevisionRun` / `sourceApplyRun` / `sourceExploreRun` / `sourceProposeRun`（Run ID string）

verdict 从 `result.json.verdict`（顶层）读取。缺失 verdict 或连接字段时收集 `FactConflict`（dimension=`review-verdict-linkage`），不返回空 `reviewedRunId`。

### D20: Change Verification 记录属 Change 所有（C1-AP-001）

C1 创建 `openspec/changes/formal-fact-reader-and-persistence/verification.md` 作为 Change Verification 正式记录，遵循 `docs/verification-model.md` Section 7。Run 的 `result.json` 可引用但不替代它。

记录包含：验证范围、每项检查适用性、执行命令/方法、状态、摘要、结果引用/环境说明、Full Test 是否运行、总体 Change Verification 状态。Full Test 属 Delivery，不在 Change Verification 范围，标记为 `not-applicable`（owner 未授权）。

A1 archived 时未建立 `verification.md` 模型（`docs/verification-model.md` 由 B1 引入）。A1 的归档记录不在本 Change 范围。本 Change 起所有新 Change MUST 创建 `verification.md`。

### D21: reconstructCurrentRun 只 catch ENOENT（C1-AP-005）

`reconstructCurrentRun` 读取已有 `result.json` 时 MUST 只将 ENOENT 视为 "result.json 不存在" 的信号并返回 pending Run。非 ENOENT 读取错误（EACCES、EISDIR 等）MUST NOT 被当作 absent——这些错误意味着 result.json 可能存在但不可读，静默返回 pending 会允许 `writeRunResult` 覆盖一个可能 terminal 的 result.json。

实现：`reconstructCurrentRun` 直接调用 `fs.readFile`（不经过 `readFileContent` helper，后者将所有错误包装为 `RUN_CONTEXT_MISSING`），catch 块检查 `errno === 'ENOENT'` → 返回 pending；其他 errno → throw `SCHEMA_VALIDATION_FAILED`。

### D22: validateReviewVerdictIntegrity 在 terminal 发布前校验（C1-AP-006）

`writeRunResult` MUST 在发布 result.json 前调用 `validateReviewVerdictIntegrity(action, result)` 校验 review verdict 完整性。`validateRunResultFileCombination` 不知道 action，只能校验 reviewVerdict 值的合法性（当存在时）。action 特定规则（completed review-* MUST 携带 reviewVerdict）在 Reader 事后检测太晚——result.json terminal 后不可变，缺失 verdict 的 review-* Run 是不可恢复的 Policy 输入缺失。

规则：
- `completed` + `review-*` → `reviewVerdict` MUST 存在（值已在 `validateRunResultFileCombination` 校验为有效 `ReviewVerdictValue`）
- `failed`/`cancelled` + `review-*` → `reviewVerdict` MUST 缺失（未完成的 review 无 verdict）
- 任何状态 + 非 `review-*` → `reviewVerdict` MUST 缺失

实现：`validateReviewVerdictIntegrity` 定义在 `serialization.ts`，由 `writeRunResult` 在 step 4b（`validateRunResultFileCombination` 之后、temp-file 写入之前）调用。

## 架构

```
src/
  facts/
    formal-fact-snapshot.ts   — FormalFactSnapshot 类型 + FactConflict
    formal-fact-reader.ts     — Reader：读取正式事实 → FormalFactSnapshot
    git-boundary-reader.ts    — Git 边界摘要只读 Reader
    yaml-parser.ts            — 手写最小子集 YAML 解析器（D14）
  persistence/
    run-persistence.ts        — createRun (staging+publish) + writeRunResult (fs.link)
    run-id-fs.ts              — 文件系统 Run-ID 收集 → B1 allocateNextNnn
    serialization.ts          — RunResultFile + ContextFile schema + validateActionResultWithoutRunRef + validateContextFile + validateContextFileIdentity + validateResultRefProjection + validateReviewVerdictIntegrity
    legacy-recognizer.ts      — bounded legacy recognizer（D16 schemaVersion=1/缺失 → Bootstrap Run 判别）
    result-ref-adapter.ts     — 非自引用序列化 + 读取派生 + 替换检测
```

## B1/C1 所有权边界

| 归属 | B1 拥有 | C1 拥有 |
|---|---|---|
| 类型 | ActionResult, Run, ResultRef, RunStatus, ExecutionStatus | RunResultFile, ContextFile, ActionResultWithoutRunRef, FormalFactSnapshot, FactConflict |
| 纯函数 | allocateNextNnn, assertMutable, isTerminal, isExecutionStatus | validateActionResultWithoutRunRef, validateContextFile, validateContextFileIdentity, validateResultRefProjection, validateReviewVerdictIntegrity, recognizeLegacyRun |
| 文件系统 | — | createRun, writeRunResult, run-id-fs, result-ref-adapter, yaml-parser, legacy-recognizer |
| 校验 | validateRun, isDeliveryState, isChangeState | validateActionResultWithoutRunRef, validateContextFile, validateContextFileIdentity, RunResultFile 组合校验, legacy recognizer 形状校验 |

## 不做

- 不实现 Policy、canRun、next、diagnose
- 不实现诊断 CLI（status / next / doctor / resume-context）
- 不实现完整 Change 创建和执行循环
- 不实现 OpenSpec apply / archive 集成
- 不实现 Review / Findings 写入闭环
- 不实现 Change Verification 调度
- 不实现 actualChangeSet 计算
- 不实现自动 Commit / Push / Merge
- 不引入外部运行时依赖（YAML 解析使用手写最小子集，见 D14）
