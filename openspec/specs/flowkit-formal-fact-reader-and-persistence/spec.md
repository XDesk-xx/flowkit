# flowkit-formal-fact-reader-and-persistence Specification

## Purpose
冻结 Flowkit 确定性内核的正式事实读取层与持久化层契约：定义 FormalFactSnapshot 只读事实视图、遵循 One-fact-one-authority 原则的 Reader、staging + atomic publish 的 Run 创建协议、独占 fs.link 的 terminal result 发布协议、assertMutable 对 CURRENT 持久化状态的校验、RunResultFile/ContextFile 物理 schema 与确定性投影、非自引用序列化边界、C1 物理投影校验器、content hash versionFingerprint、Run ID 文件系统集成、Git 边界摘要只读、手写最小子集 YAML manifest 解析、Delivery Manifest 嵌套状态读取、Bootstrap Run 兼容性与三路判别器、review verdict 重建与发布前完整性校验、Change Verification 记录。本 spec 为 Policy Engine 和诊断 CLI 提供不可变的正式事实输入与原子持久化基础。
## Requirements
### Requirement: FormalFactSnapshot 只读视图

C1 MUST 定义 `FormalFactSnapshot` 作为 Policy 输入的只读事实视图。`FormalFactSnapshot` MUST 包含 `conflicts: FactConflict[]` 字段，使 fail-closed 冲突检测显式化。

#### Scenario: FormalFactSnapshot 包含 conflicts 字段

- **WHEN** 构造 `FormalFactSnapshot`
- **THEN** MUST 包含 `conflicts: FactConflict[]` 字段
- **AND** `conflicts` 可能为空数组（无冲突）或包含 `FactConflict` 对象

#### Scenario: FormalFactSnapshot 字段映射 Policy 输入

- **WHEN** 读取 `FormalFactSnapshot` 字段
- **THEN** 字段 MUST 直接映射 `docs/delivery-lifecycle.md` Section 5 的 Policy 输入清单
- **AND** 包含 Delivery 状态、Change 状态、Run 结果、OpenSpec 目录结构事实

### Requirement: 正式事实 Reader 遵循 One fact, one authority

Reader MUST 遵循 `One fact, one authority` 原则：每个正式事实从唯一权威来源读取。Reader MUST NOT 做跨权威交叉推断。冲突 MUST 收集为 `FactConflict[]`，Reader MUST NOT 自动择优。

#### Scenario: 每个事实从唯一权威读取

- **WHEN** Reader 读取正式事实
- **THEN** 每个事实 MUST 从唯一权威来源读取
- **AND** MUST NOT 从多个权威来源交叉推断同一事实

#### Scenario: 冲突收集不择优

- **WHEN** Reader 检测到事实冲突
- **THEN** 冲突 MUST 收集到 `FormalFactSnapshot.conflicts`
- **AND** Reader MUST NOT 自动选择其中一个来源
- **AND** Policy 在 `conflicts` 非空时 MUST blocked

#### Scenario: Reader 不调用 OpenSpec CLI

- **WHEN** Reader 读取 OpenSpec 相关事实
- **THEN** MUST 只读取 OpenSpec 目录结构的文件系统事实（存在性、状态摘要）
- **AND** MUST NOT 调用 `openspec` CLI 命令

### Requirement: Run 创建使用 staging + atomic publish

`createRun` MUST 在 staging 目录 `.tmp-<run-id>/` 中准备全部初始文件，校验后通过目录 rename 原子发布。staging 目录 MUST 对 Reader 不可见——只有 rename 后的 `<run-id>/` 被识别为正式 Run。

#### Scenario: staging 目录对 Reader 不可见

- **WHEN** `createRun` 在 staging 目录中准备文件
- **THEN** staging 目录 `.tmp-<run-id>/` MUST 对 Reader 不可见
- **AND** 只有 rename 后的 `<run-id>/` 被识别为正式 Run

#### Scenario: 创建中断不留下半建 Run

- **WHEN** `createRun` 在 staging 或 rename 阶段中断
- **THEN** MUST 不留下可见的半建 Run
- **AND** staging 目录可能残留但不被 Reader 纳入 Snapshot

#### Scenario: staging 清理由 createRun best-effort 执行

- **WHEN** `createRun` 遇到自身残留的 staging 目录
- **THEN** `createRun` MUST best-effort 清理自身 staging 目录
- **AND** staging 清理 MUST NOT 分配给只读 doctor

### Requirement: Run 完成使用独占 fs.link 发布协议

`writeRunResult` MUST 使用 temp-file + `fs.link` 原子 create-if-not-exists 发布 result.json。MUST NOT 使用 `atomicWriteFile`（temp + rename 是原子替换，不提供 no-replace 保证）。`writeRunResult` MUST 是 terminal result 的唯一发布路径。

#### Scenario: fs.link 原子 create-if-not-exists

- **WHEN** `writeRunResult` 发布 result.json
- **THEN** MUST 写入 temp 文件后通过 `fs.link(temp, result.json)` 原子创建 result.json
- **AND** MUST NOT 使用 `atomicWriteFile` 写入 result.json

#### Scenario: 并发 writer 第一个 result.json 保留不变

- **WHEN** 两个 writer 同时调用 `writeRunResult`
- **THEN** 第一个 writer 的 result.json MUST 保留不变
- **AND** 第二个 writer MUST 收到 `RUN_TERMINAL`

#### Scenario: 不依赖预先 exists 检查

- **WHEN** 两个 writer 都在 step 1 看到 result.json 不存在
- **THEN** `fs.link` MUST 保证只有一个成功
- **AND** 并发安全 MUST NOT 依赖预先 exists 检查

#### Scenario: writeRunResult 接受 RunResultFile 对象

- **WHEN** 调用 `writeRunResult`
- **THEN** MUST 接受 `RunResultFile` 对象作为输入
- **AND** MUST NOT 接受 JSON 字符串
- **AND** 校验、序列化、独占发布 MUST 全部在 `writeRunResult` 内部完成

#### Scenario: adapter 不序列化不发布

- **WHEN** adapter 构造 `RunResultFile`
- **THEN** adapter MUST 只构造对象并传递给 `writeRunResult`
- **AND** adapter MUST NOT 序列化
- **AND** adapter MUST NOT 直接写入或替换 result.json

### Requirement: assertMutable 校验 CURRENT 持久化状态

`writeRunResult` MUST 调用 B1 `assertMutable` 校验 CURRENT 持久化状态（pending 或 terminal），MUST NOT 校验 NEW terminal 结果。CURRENT 状态从 `context.json` + 已存在的 `result.json` 重建：`result.json` 不存在（ENOENT） → pending；`result.json` 存在 → 从 `RunResultFile.runStatus` 重建 terminal 状态。`reconstructCurrentRun` MUST 只 catch ENOENT 作为 "result.json 不存在" 的信号；非 ENOENT 读取错误（EACCES、EISDIR 等）MUST NOT 被当作 absent，MUST throw `SCHEMA_VALIDATION_FAILED`（C1-AP-005）。pending 通过校验后写入 result.json 使 Run 转为 terminal。`writeRunResult` MUST 在调用 `assertMutable` 前校验 `ContextFile` 身份（`validateContextFileIdentity`），防止 context.json 被复制到错误目录后被写入。

#### Scenario: assertMutable 校验当前 pending 状态

- **WHEN** `writeRunResult` 校验可变性
- **AND** `result.json` 不存在
- **THEN** MUST 从 `context.json` 投影 Run（status=pending）
- **AND** MUST 调用 `assertMutable(currentRun)` 校验 CURRENT 状态
- **AND** MUST NOT 构造 terminal Run 后调用 assertMutable

#### Scenario: assertMutable 观察持久化 terminal 状态

- **WHEN** `writeRunResult` 校验可变性
- **AND** `result.json` 已存在且 `runStatus` 为 terminal
- **THEN** MUST 从 `result.json.runStatus` 重建 CURRENT Run 状态为 terminal
- **AND** `assertMutable` MUST throw `RUN_TERMINAL`
- **AND** 该拒绝 MUST 发生在任何 temp-file 发布之前
- **AND** MUST NOT 依赖 `fs.link` EEXIST 作为唯一的 terminal 拒绝路径

#### Scenario: 持久化 result.json 损坏不可覆盖

- **WHEN** `result.json` 存在但 `runStatus` 缺失或值无效
- **THEN** `writeRunResult` MUST throw `SCHEMA_VALIDATION_FAILED`
- **AND** MUST NOT 静默覆盖损坏的 result.json

#### Scenario: 非 ENOENT 读取错误不可当作 absent（C1-AP-005）

- **WHEN** `reconstructCurrentRun` 读取 `result.json`
- **AND** 读取失败且 errno 不为 ENOENT（如 EACCES、EISDIR）
- **THEN** MUST throw `SCHEMA_VALIDATION_FAILED`
- **AND** MUST NOT 将非 ENOENT 错误当作 "result.json 不存在" 返回 pending
- **AND** MUST NOT 允许覆盖可能存在但不可读的 result.json

#### Scenario: writeRunResult 校验 ContextFile 身份

- **WHEN** `writeRunResult` 读取 `context.json`
- **THEN** MUST 调用 `validateContextFileIdentity(contextFile, runDir)` 校验路径一致性
- **AND** 身份不匹配时 MUST reject
- **AND** 校验 MUST 在 `assertMutable` 之前执行

#### Scenario: terminal Run 不可覆盖

- **WHEN** Run 已为 terminal 状态
- **THEN** `assertMutable` MUST throw
- **AND** result.json MUST NOT 被覆盖

### Requirement: RunResultFile 物理 schema 使用 executionStatus 单源真相

`RunResultFile` MUST NOT 在顶层携带 `executionStatus` 字段。当 `actionResult` 存在时，`executionStatus` MUST 从 `actionResult.executionStatus` 派生。当 `actionResult` 不存在（runStatus=failed/cancelled）时，没有 `executionStatus`。

#### Scenario: 顶层无 executionStatus 字段

- **WHEN** 写入 `RunResultFile`
- **THEN** MUST NOT 包含顶层 `executionStatus` 字段
- **AND** `executionStatus` MUST 从 `actionResult.executionStatus` 派生

#### Scenario: 允许的组合

- **WHEN** 校验 `RunResultFile` 组合
- **THEN** 以下组合 MUST 被接受：completed+actionResult(executionStatus=completed/failed/blocked)、failed+无actionResult、cancelled+无actionResult

#### Scenario: 禁止的组合

- **WHEN** 校验 `RunResultFile` 组合
- **THEN** 以下组合 MUST 被拒绝：pending+any、completed+无actionResult、completed+actionResult(executionStatus=in-progress)、failed+有actionResult、cancelled+有actionResult、顶层executionStatus字段存在

### Requirement: 非自引用序列化边界

result.json 物理序列化 MUST 省略 `actionResult.runRef`。`versionFingerprint` MUST 在读取时从文件内容 SHA-256 派生。文件 MUST NOT 包含自身哈希。

#### Scenario: 序列化省略 runRef

- **WHEN** 序列化 `RunResultFile` 为 JSON
- **THEN** `actionResult` MUST NOT 包含 `runRef` 字段
- **AND** 文件内容 MUST NOT 包含自身哈希

#### Scenario: 读取时派生 versionFingerprint

- **WHEN** 读取 result.json
- **THEN** MUST 读取文件原始内容
- **AND** MUST 计算文件内容 SHA-256 作为 `versionFingerprint`
- **AND** MUST 派生 `runRef = { ref, versionFingerprint, kind: "run-result" }`
- **AND** MUST 重建完整 `ActionResult = { ...actionResultWithoutRunRef, runRef }`

#### Scenario: 替换检测

- **WHEN** 引用方声称的 `versionFingerprint` 与文件实际 SHA-256 不符
- **THEN** `verifyResultRef` MUST 返回 false
- **AND** 引用方 MUST 收到替换检测信号或 `FactConflict`

### Requirement: C1 拥有物理投影校验器

持久化层 MUST 定义并拥有 schemaVersion 2 physical projection validators。`RunResultFile` 与
`ActionResultWithoutRunRef` MUST 使用 closed validation：已知字段按 schema 校验，未知字段 MUST reject。
`ResultRef` MUST 使用受限 kind enum 与 field-specific kind/path validation，不能只检查非空字符串。

#### Scenario: 必填字段校验

- **WHEN** 校验 `ActionResultWithoutRunRef`
- **THEN** `action` MUST 在固定 Action Catalog 中
- **AND** `executionStatus` MUST 为合法 ExecutionStatus
- **AND** `summary` MUST 为非空 string

#### Scenario: 嵌套 ResultRef 校验

- **WHEN** `ActionResultWithoutRunRef` 包含 `producedResultRefs`、`consumedInputRefs`、`verificationSummaryRef` 或 `reviewVerdictRef`
- **THEN** 每个嵌套 `ResultRef` MUST 通过 C1 `validateResultRefProjection` 校验
- **AND** `ref` 和 `versionFingerprint` MUST 为非空 string

#### Scenario: ResultRef kind 必须在受限枚举中

- **WHEN** 校验 schemaVersion 2 ResultRef projection
- **THEN** `kind` MUST 为 `run-result`、`produced-artifact` 或 `verification-summary`
- **AND** 未知 kind、空 kind 或缺失必须按 field contract reject

#### Scenario: field-specific ResultRef binding

- **WHEN** 校验 `consumedInputRefs` 或 `reviewVerdictRef`
- **THEN** kind MUST 为 `run-result`
- **AND** ref MUST 指向 Core resolver 允许的 Run `result.json`
- **AND** `producedResultRefs` kind MUST 为 `produced-artifact`
- **AND** `verificationSummaryRef` kind MUST 为 `verification-summary`
- **AND** field/kind mismatch MUST reject

#### Scenario: artifact logical ref root validation

- **WHEN** 校验 `produced-artifact` 或 `verification-summary`
- **THEN** persisted ref MUST 为 normalized repository-relative **stable logical ref**
- **AND** logical ref MUST 使用 `openspec/changes/<context.changeId>/...` active canonical namespace
- **AND** MUST reject `..` traversal 与绝对路径
- **AND** `produced-artifact` MUST 匹配当前 Action + tag resolver 允许的 Change artifact logical ref
- **AND** `verification-summary` logical ref MUST 等于 `openspec/changes/<context.changeId>/verification.md`
- **AND** non-Run artifact ref MUST NOT 指向 `result.json`
- **AND** archive 后 physical target MAY 位于唯一 `openspec/changes/archive/<date>-<context.changeId>/...`，但 persisted logical ref MUST NOT 改写

#### Scenario: closed schema 拒绝未知字段

- **WHEN** `RunResultFile` 或 `ActionResultWithoutRunRef` 包含 schema 未声明字段
- **THEN** MUST throw `SCHEMA_VALIDATION_FAILED`
- **AND** MUST NOT 透传或持久化未知字段

#### Scenario: 禁止 runRef 字段

- **WHEN** `ActionResultWithoutRunRef` 包含 `runRef`
- **THEN** MUST reject
- **AND** runRef MUST 只在读取 result.json 时从实际文件内容派生

#### Scenario: malformed 投影拒绝

- **WHEN** 物理投影缺少必填字段、包含无效枚举或违反 field/path binding
- **THEN** MUST reject
- **AND** MUST throw `FlowkitError('SCHEMA_VALIDATION_FAILED')`

### Requirement: ResultRef versionFingerprint 使用 content hash

所有 schemaVersion 2 生产 ResultRef MUST 使用被引用目标实际文件内容的 SHA-256 作为
`versionFingerprint`。Caller MUST NOT 成为 fingerprint、kind 或 ref path 的 authority。
Run result 和 non-Run artifact MUST 使用不同的 Core constructor，但共享 replacement detection 语义。

#### Scenario: versionFingerprint 为文件内容 SHA-256

- **WHEN** 构造 ResultRef 的 `versionFingerprint`
- **THEN** MUST 为 result.json 文件内容的 SHA-256
- **AND** MUST NOT 为 Git Commit SHA

#### Scenario: Run result ResultRef 由 Core 构造

- **WHEN** Core 为 Run `result.json` 创建 ResultRef
- **THEN** MUST 使用 `buildRunResultRef(runPath, fileContent)`
- **AND** kind MUST 为 `run-result`
- **AND** versionFingerprint MUST 为该 `result.json` 内容 SHA-256

#### Scenario: non-Run artifact ResultRef 由 Core 构造

- **WHEN** Core 为 produced artifact 或 verification summary 创建 ResultRef
- **THEN** MUST 使用 non-Run artifact constructor
- **AND** kind MUST 由 owning result field 在 Core 内部选择
- **AND** versionFingerprint MUST 为目标 artifact 文件内容 SHA-256
- **AND** constructor MUST NOT 自动追加 `result.json`

#### Scenario: caller 不能提供 versionFingerprint

- **WHEN** Action caller 提供 typed target descriptor
- **THEN** MUST NOT 接受 caller-supplied `versionFingerprint`
- **AND** Core MUST 读取真实目标后构造 ResultRef

#### Scenario: verifyResultRef 检测替换

- **WHEN** preflight 或 Reader 验证 immutable Run-result ref，或验证当前 effective mutable artifact ref
- **THEN** MUST 比对 `versionFingerprint` 与当前应解析目标的实际内容 SHA-256
- **AND** 不匹配 MUST 返回 replacement signal、`RESULT_REF_MISMATCH` 或 `FactConflict`（按调用层）
- **AND** 已由合法 revision lineage 证明 superseded 的 historical mutable artifact ref MUST 按 generation-aware validation requirement 处理，MUST NOT 再绑定当前 canonical bytes
- **AND** MUST NOT 使用 Git Commit SHA 替代内容 hash

### Requirement: Run ID 文件系统集成

C1 MUST 在 `run-id-fs.ts` 中收集文件系统 Run-ID 列表，调用 B1 `allocateNextNnn` 分配下一个 Run-ID。C1 MUST NOT 重新实现 Run-ID 分配逻辑。

#### Scenario: C1 收集 Run-ID 列表

- **WHEN** 分配新 Run-ID
- **THEN** C1 MUST 从文件系统收集现有 Run-ID 列表
- **AND** MUST 调用 B1 `allocateNextNnn` 分配下一个 Run-ID

#### Scenario: Run ID 为 Delivery-scoped 单调递增

- **WHEN** 分配 Run-ID
- **THEN** Run-ID MUST 为 Delivery-scoped
- **AND** MUST 单调递增

### Requirement: Git 边界摘要只读不写

Git 边界摘要 MUST 只读取，MUST NOT 持久化到状态文件。Reader MUST 从 Git 读取 Delivery Start、Change Checkpoint、Delivery Final 的摘要信息。

#### Scenario: Git 边界摘要不持久化

- **WHEN** Reader 读取 Git 边界摘要
- **THEN** MUST 只读取
- **AND** MUST NOT 持久化到状态文件

#### Scenario: Git 边界摘要包含正式边界

- **WHEN** 读取 Git 边界摘要
- **THEN** MUST 包含 Delivery Start、Change Checkpoint、Delivery Final 的摘要信息

### Requirement: YAML manifest 解析使用手写最小子集

C1 MUST 手写最小子集 YAML 解析器解析 Delivery Manifest。MUST NOT 引入外部 YAML 运行时依赖。解析器 MUST 支持实际使用的 YAML 子集，解析失败 MUST 收集为 `FactConflict` 而非 throw 中断 Reader。

#### Scenario: 支持的 YAML 子集

- **WHEN** 解析 Delivery Manifest YAML
- **THEN** MUST 支持 block mapping、block sequence、flow sequence、plain/single/double-quoted scalars、nested structures、null/bool/int 基础类型、注释、多行字符串（literal/folded）
- **AND** MUST NOT 引入外部运行时依赖

#### Scenario: 不支持的 YAML 特性

- **WHEN** YAML 包含 anchor/alias、multi-document、tag 或 complex flow mapping
- **THEN** 解析器 MUST NOT 支持这些特性
- **AND** 遇到这些特性时 MUST 记录为 `FactConflict`

#### Scenario: 解析失败收集为冲突

- **WHEN** YAML 解析失败
- **THEN** MUST 收集为 `FactConflict`
- **AND** MUST NOT throw 中断 Reader
- **AND** Policy 在冲突存在时 MUST blocked

### Requirement: context.json 物理 schema + 确定性投影 + 身份校验

持久化层 MUST 定义 `ContextFile` 物理 schema 作为 `createRun` 创建的 Run 输入上下文和确定性 current-Run
投影。schemaVersion 2 Run MUST 使用 Core-derived ResultRef；caller MUST NOT 直接提供带
`versionFingerprint` 的 `inputRef`。`changeKey` / `changeId` 的存在性由 Action-scope 规则决定。
非 review Run 的 `inputRef` MAY 缺失；review-* Run 的 `inputRef` MUST 存在并由 Core 从
`reviewedRunId` 的实际 `result.json` 派生。

#### Scenario: ContextFile 必填字段

- **WHEN** 校验 `ContextFile`
- **THEN** `schemaVersion` MUST 等于 `2`
- **AND** MUST 包含 `runId`、`deliveryId`、`action`、`role`、`ownerAuthorization`、`runPath`
- **AND** `action` MUST 在固定 Action Catalog 中
- **AND** `changeKey` / `changeId` 的存在性 MUST 符合 Action-scope 规则

#### Scenario: Action-scope 规则 changeKey/changeId 存在性

- **WHEN** Action 为 Delivery-level
- **THEN** `changeKey` / `changeId` MUST 缺失
- **AND** Action 为 Change-level 时 `changeKey` / `changeId` MUST 存在
- **AND** 混合形状 MUST reject（createRun）或收集为 `FactConflict`（Reader）

#### Scenario: inputRef 为可选 ResultRef

- **WHEN** 校验 `ContextFile.inputRef`
- **THEN** `inputRef` MAY 缺失（explore 等无 source review 的 Run）
- **AND** 存在时 MUST 为 `ResultRef` 对象（MUST NOT 为 string）
- **AND** MUST 通过 C1 `validateResultRefProjection` 校验（`ref` + `versionFingerprint` 为非空 string）
- **AND** Bootstrap Run 的 string 形 `inputRef` 不走 C1 校验（由 legacy adapter 处理）

#### Scenario: 普通 Run inputRef 可缺失且只能由 Core 派生

- **WHEN** 创建非 review-* Run
- **THEN** caller MAY 提供 consumed Run ID 等 typed descriptor
- **AND** caller MUST NOT 提供 `ResultRef.ref`、`ResultRef.kind` 或 `versionFingerprint`
- **AND** 有 descriptor 时 Core MUST 读取实际目标并构造 `context.inputRef`
- **AND** 无 consumed target 的 Action MAY 不写 `inputRef`

#### Scenario: review Run inputRef 必须绑定 reviewedRunId

- **WHEN** 创建 `review-explore`、`review-propose` 或 `review-apply` Run
- **THEN** `reviewedRunId` MUST 存在
- **AND** Core MUST 从 `reviewedRunId` 对应的实际 `result.json` 构造 `context.inputRef`
- **AND** `context.inputRef.ref` MUST 精确指向该 `result.json`
- **AND** `context.inputRef.versionFingerprint` MUST 等于该文件实际 SHA-256
- **AND** 目标缺失或不可读时 `createRun` MUST 在正式 Run publish 前失败

#### Scenario: createRun 拒绝 caller-supplied ResultRef authority

- **WHEN** caller 尝试为 schemaVersion 2 Run 直接提供 `versionFingerprint`、任意 ref path 或 kind
- **THEN** `createRun` MUST reject
- **AND** MUST NOT 把 caller-supplied ResultRef 写入 context.json

#### Scenario: createRun 写入前校验

- **WHEN** `createRun` 写入 context.json
- **THEN** MUST 先完成 target resolution / ResultRef derivation
- **AND** MUST 通过 `validateContextFile` 与 `validateContextFileIdentity`
- **AND** 校验通过后才写入 staging

#### Scenario: 确定性 current-Run 投影

- **WHEN** `writeRunResult` 构造当前 Run
- **THEN** `runId`、`deliveryId`、`changeId`、`action`、`role` MUST 来自 `ContextFile`
- **AND** 在 result.json 不存在时 status MUST 为 `pending`
- **AND** `Run.inputRef` MUST 映射已由 Core 派生并持久化的 `ContextFile.inputRef`
- **AND** 构造的 Run MUST 通过领域校验

#### Scenario: 身份校验 runId 匹配目录名

- **WHEN** 校验 `contextFile.runId`
- **THEN** `runId` MUST 匹配 Run 目录名
- **AND** 不匹配时 MUST reject 或收集为 `FactConflict`

#### Scenario: 身份校验 deliveryId 匹配路径

- **WHEN** 校验 `contextFile.deliveryId`
- **THEN** `deliveryId` MUST 匹配 Delivery 路径段
- **AND** 不匹配时 MUST reject 或收集为 `FactConflict`

#### Scenario: 身份校验 changeId 匹配路径

- **WHEN** Run 为 Change-level
- **THEN** `contextFile.changeId` MUST 匹配 Change 路径段
- **AND** 不匹配时 MUST reject 或收集为 `FactConflict`
- **AND** Delivery-level Run MUST 跳过此校验

#### Scenario: 身份校验 runPath 一致

- **WHEN** 校验 `contextFile.runPath`
- **THEN** `runPath` MUST 与实际 Run 目录一致
- **AND** 不一致时 MUST reject 或收集为 `FactConflict`

### Requirement: Bootstrap Run 兼容性 + 三路判别器

Reader MUST 兼容 Bootstrap Run。判别器为三路：`schemaVersion === 2` → C1 Run 路径（`validateContextFile` + `validateContextFileIdentity`，任一失败 → `FactConflict` fail-closed，MUST NOT 降级为 Bootstrap）；`schemaVersion === 1` 或缺失 → legacy 路径（bounded legacy recognizer）；其他 `schemaVersion` 值 → `FactConflict`。MUST NOT 使用 `validateContextFile` 失败作为降级路径。`createRun` 和 `writeRunResult` MUST NOT 修改、迁移或重写 Bootstrap Run。

#### Scenario: C1 Run 判别器 schemaVersion 等于 2

- **WHEN** Reader 读取 `context.json` 的 `schemaVersion`
- **AND** `schemaVersion === 2`
- **THEN** MUST 进入 C1 Run 路径
- **AND** MUST 执行 `validateContextFile`（C1 schema）+ `validateContextFileIdentity`
- **AND** 两步通过 → 完整 C1 Run

#### Scenario: malformed C1 Run fail-closed

- **WHEN** `schemaVersion === 2` 但 `validateContextFile` 或 `validateContextFileIdentity` 失败
- **THEN** MUST 收集为 `FactConflict`（fail-closed）
- **AND** MUST NOT 降级为 Bootstrap Run best-effort 读取
- **AND** MUST NOT throw 中断 Reader

#### Scenario: legacy 判别器 schemaVersion 等于 1 或缺失

- **WHEN** Reader 读取 `context.json` 的 `schemaVersion`
- **AND** `schemaVersion === 1` 或 `schemaVersion` 缺失
- **THEN** MUST 进入 legacy 路径
- **AND** MUST 执行 bounded legacy recognizer（MUST NOT 调用 C1 `validateContextFile`）

#### Scenario: legacy recognizer 形状校验

- **WHEN** legacy recognizer 校验 `context.json`
- **THEN** MUST 检查 B1 Run 最小必填字段：`runId`、`deliveryId`、`action`、`role`
- **AND** `action` MUST 在 B1 `CHANGE_ACTIONS` 或 `DELIVERY_ACTIONS` 中
- **AND** `role` MUST 为 `owner`/`author`/`reviewer`
- **AND** `changeId` 可选（与 B1 `Run.changeId?` 一致），其他字段缺失用默认值
- **AND** 满足最小形状 → Bootstrap Run（best-effort 读取）
- **AND** 不满足最小形状 → `FactConflict`（fail-closed）

#### Scenario: 未知 schemaVersion fail-closed

- **WHEN** `schemaVersion` 为 2 以外的已知数值（如 0、3、负数）
- **THEN** MUST 收集为 `FactConflict`（未知格式，fail-closed）
- **AND** MUST NOT 识别为 C1 Run 或 Bootstrap Run

#### Scenario: Bootstrap Run string 形 inputRef 不走 C1 投影

- **WHEN** legacy recognizer 读取 Bootstrap Run 的 `inputRef`
- **AND** `inputRef` 为 string 形（Bootstrap 习惯）
- **THEN** legacy adapter MUST best-effort 读取为 `Run.inputRef = undefined`
- **AND** MUST NOT 构造 `ResultRef`（string 无 `versionFingerprint`）
- **AND** C1 `validateResultRefProjection` MUST NOT 对 legacy 记录调用

#### Scenario: Bootstrap Run runStatus 归一化为 B1 TerminalRunStatus

- **WHEN** Reader 读取 Bootstrap Run 的 `result.json`
- **AND** `result.json` 不存在
- **THEN** `runStatus` MUST 为 `pending`
- **AND** `result.json` 存在时 MUST 从 `result.json.status` 读取并归一化为 B1 `TerminalRunStatus`（`completed`/`failed`/`cancelled`）
- **AND** MUST NOT 降级为无差别的 `terminal`
- **AND** `result.json.status` 缺失或值不在枚举内时 MUST fail closed 收集为 `FactConflict`

#### Scenario: Bootstrap Run 不被修改

- **WHEN** `createRun` 或 `writeRunResult` 遇到 Bootstrap Run
- **THEN** MUST NOT 修改、迁移或重写 Bootstrap Run
- **AND** 新 Run（由 C1 `createRun` 创建）MUST 使用 `schemaVersion: 2` + 完整 C1 schema 校验 + `validateContextFileIdentity` 身份校验

### Requirement: Delivery Manifest 嵌套 delivery 状态读取 + fail-closed

Reader MUST 从 Delivery Manifest 的嵌套 `delivery:` mapping 读取 `state` 和 `fullTestStatus`（实际 Manifest 形状见 `openspec/delivery-groups/*.yaml`）。MUST NOT 从顶层 `state`/`fullTestStatus` 读取。Manifest 存在但 `delivery:` mapping 缺失、或 `delivery.state`/`delivery.fullTestStatus` 缺失/无效时 MUST 收集为 `FactConflict`（fail-closed），MUST NOT 静默返回 `undefined`。Manifest 完全不存在时返回 `undefined`（bootstrap-only Delivery，由 Policy 决定是否阻塞）。

#### Scenario: 读取嵌套 delivery.state 和 delivery.fullTestStatus

- **WHEN** Reader 读取 Delivery Manifest
- **AND** Manifest 存在且包含 `delivery:` mapping
- **THEN** MUST 从 `delivery.state` 读取 DeliveryState
- **AND** MUST 从 `delivery.fullTestStatus` 读取 FullTestStatus
- **AND** 两者 MUST 通过 B1 `DeliveryState`/`FullTestStatus` 枚举校验
- **AND** MUST NOT 从顶层 `state`/`fullTestStatus` 读取

#### Scenario: Manifest 缺失 delivery mapping fail-closed

- **WHEN** Manifest 存在但缺少 `delivery:` mapping
- **THEN** MUST 收集 `FactConflict`（dimension=`delivery-manifest-shape`）
- **AND** `deliveryState` 和 `deliveryFullTestStatus` MUST 为 `undefined`
- **AND** MUST NOT 静默返回 undefined 而不收集冲突

#### Scenario: delivery.state 缺失或无效 fail-closed

- **WHEN** `delivery.state` 缺失或值不在 `active|completed|cancelled` 枚举内
- **THEN** MUST 收集 `FactConflict`（dimension=`delivery-state`）
- **AND** `deliveryState` MUST 为 `undefined`
- **AND** MUST NOT 静默返回 undefined

#### Scenario: delivery.fullTestStatus 缺失或无效 fail-closed

- **WHEN** `delivery.fullTestStatus` 缺失或值不在 `not-ready|awaiting-user-decision|authorized|passed|failed` 枚举内
- **THEN** MUST 收集 `FactConflict`（dimension=`delivery-full-test-status`）
- **AND** `deliveryFullTestStatus` MUST 为 `undefined`

#### Scenario: Manifest 完全不存在返回 undefined

- **WHEN** Delivery Manifest 文件不存在
- **THEN** `deliveryState` 和 `deliveryFullTestStatus` MUST 为 `undefined`
- **AND** MUST NOT 收集 `FactConflict`（bootstrap-only Delivery 由 Policy 决定）

### Requirement: Review verdict 重建 + reviewed-Run 连接

Reader MUST 从 review-* Run 重建 `ReviewVerdictFact`（`reviewRunId` + `verdict` + `reviewedRunId`）。C1 Run 使用 canonical payload：`ContextFile.reviewedRunId`（被审查的 Run ID）+ `RunResultFile.reviewVerdict`（verdict 值）。Bootstrap Run 从 `result.json.verdict`（顶层）+ `context.json` 的多种字段名（`reviewedRun` path、`input.reviewedRunId`、`sourceRevisionRun`、`sourceApplyRun` 等）重建。review-* Run 缺失 verdict 或 reviewed-Run 连接时 MUST 收集为 `FactConflict`（fail-closed），MUST NOT 返回空 `reviewedRunId`。

#### Scenario: C1 review-* Run canonical verdict 重建

- **WHEN** Reader 读取 C1 review-* Run（`schemaVersion: 2`）
- **AND** `context.json` 包含 `reviewedRunId`
- **AND** `result.json` 包含 `reviewVerdict`（`approved` 或 `changes-requested`）
- **THEN** MUST 重建 `ReviewVerdictFact`（`reviewRunId` + `verdict` + `reviewedRunId`）
- **AND** MUST NOT 从 `sourceReviewRun` 读取 reviewedRunId（那是 revise-* 的前序 review）

#### Scenario: C1 review-* Run 缺失 reviewedRunId 校验拒绝

- **WHEN** `validateContextFile` 校验 C1 review-* Run
- **AND** `reviewedRunId` 缺失
- **THEN** MUST reject（`createRun`）或 `FactConflict`（Reader，dimension=`context-schema`）

#### Scenario: C1 非 review Run 携带 reviewedRunId 拒绝

- **WHEN** `validateContextFile` 校验 C1 非 review Run
- **AND** `reviewedRunId` 存在
- **THEN** MUST reject 或 `FactConflict`

#### Scenario: C1 review-* Run 缺失 reviewVerdict fail-closed

- **WHEN** Reader 读取 C1 review-* Run
- **AND** `result.json` 存在但 `reviewVerdict` 缺失或值无效
- **THEN** MUST 收集 `FactConflict`（dimension=`review-verdict-linkage`）
- **AND** MUST NOT 返回空 verdict

#### Scenario: Bootstrap review-* Run 从 result.verdict + context 连接重建

- **WHEN** Reader 读取 Bootstrap review-* Run（`schemaVersion: 1`）
- **AND** `result.json` 包含顶层 `verdict`
- **AND** `context.json` 包含 reviewed-Run 连接（`reviewedRun` path、`input.reviewedRunId`、`sourceRevisionRun`、`sourceApplyRun` 之一）
- **THEN** MUST 从 `result.json.verdict` 读取 verdict 值
- **AND** MUST 从 `context.json` 提取 reviewedRunId（path 形式取 basename）
- **AND** MUST 重建 `ReviewVerdictFact`

#### Scenario: Bootstrap review-* Run 缺失连接 fail-closed

- **WHEN** Reader 读取 Bootstrap review-* Run
- **AND** `result.json.verdict` 缺失或 `context.json` 无任何已知连接字段
- **THEN** MUST 收集 `FactConflict`（dimension=`review-verdict-linkage`）
- **AND** MUST NOT 返回空 `reviewedRunId` 的 `ReviewVerdictFact`

### Requirement: Review verdict 完整性在 terminal 发布前校验（C1-AP-006）

`writeRunResult` MUST 在发布 result.json 前调用 `validateReviewVerdictIntegrity(action, result)` 校验 review verdict 完整性。MUST NOT 依赖 Reader 在事后检测缺失的 review verdict——result.json 一旦 terminal 发布即不可变，缺失 verdict 的 review-* Run 是不可恢复的 Policy 输入缺失。规则：`completed` + `review-*` → `reviewVerdict` MUST 存在且为有效 `ReviewVerdictValue`；`failed`/`cancelled` + `review-*` → `reviewVerdict` MUST 缺失；任何状态 + 非 `review-*` → `reviewVerdict` MUST 缺失。

#### Scenario: completed review-* Run 必须携带 reviewVerdict

- **WHEN** `writeRunResult` 发布 `completed` 的 `review-*` Run 结果
- **THEN** `result.reviewVerdict` MUST 存在
- **AND** MUST 为 `approved` 或 `changes-requested`
- **AND** 缺失时 MUST throw `SCHEMA_VALIDATION_FAILED`
- **AND** 该校验 MUST 发生在 result.json 发布之前

#### Scenario: 非 review Run 不可携带 reviewVerdict

- **WHEN** `writeRunResult` 发布非 `review-*` Run 结果
- **THEN** `result.reviewVerdict` MUST 缺失
- **AND** 携带时 MUST throw `SCHEMA_VALIDATION_FAILED`

#### Scenario: failed/cancelled review-* Run 不可携带 reviewVerdict

- **WHEN** `writeRunResult` 发布 `failed` 或 `cancelled` 的 `review-*` Run 结果
- **THEN** `result.reviewVerdict` MUST 缺失
- **AND** 携带时 MUST throw `SCHEMA_VALIDATION_FAILED`

#### Scenario: 校验在 terminal 发布前执行

- **WHEN** `writeRunResult` 执行发布流程
- **THEN** `validateReviewVerdictIntegrity` MUST 在 `validateRunResultFileCombination` 之后执行
- **AND** MUST 在 temp-file 写入和 `fs.link` 之前执行
- **AND** 校验失败时 result.json MUST NOT 被创建

### Requirement: Change Verification 记录属 Change 所有

C1 MUST 创建 `openspec/changes/formal-fact-reader-and-persistence/verification.md` 作为 Change Verification 正式记录（遵循 `docs/verification-model.md` Section 7）。Run 的 `result.json` 可引用该记录，但不能替代它。记录 MUST 包含验证范围、每项检查的适用性、执行命令/方法、状态、摘要、结果引用/环境说明、Full Test 是否运行、总体 Change Verification 状态。Full Test 属 Delivery，不在 Change Verification 范围。

#### Scenario: verification.md 存在且包含必需字段

- **WHEN** C1 进入 `review-apply` / `archive` 前
- **THEN** `verification.md` MUST 存在
- **AND** MUST 包含验证范围、适用检查、执行命令/方法、状态、摘要、结果引用/环境、Full Test 状态、总体 Change Verification 状态

#### Scenario: Full Test 不在 Change Verification 范围

- **WHEN** C1 verification.md 记录 Full Test
- **THEN** MUST 标记为 `not-applicable`（owner 未授权）
- **AND** MUST NOT 由 apply、revise-apply、review-apply 或 archive 自动触发

#### Scenario: Run result.json 引用但不替代 verification.md

- **WHEN** apply/revise-apply Run 的 `result.json` 记录验证结果
- **THEN** MAY 引用 `verification.md`
- **AND** MUST NOT 替代 `verification.md` 作为 Change Verification 正式记录

### Requirement: RunResultFile 使用 Lean closed allowlist 与 typed reviewFindings

schemaVersion 2 `RunResultFile` MUST 只持久化执行、交接与恢复所需的 closed allowlist。完整 Verification、
Git、OpenSpec、archive evidence 或 consistency scan MUST NOT 被复制到 Run。completed review-* Run MAY
携带 Reviewer-owned `reviewVerdict` 与 typed `reviewFindings`；非 review Run MUST NOT 携带二者。

#### Scenario: 未知重型 bookkeeping 字段被拒绝

- **WHEN** schemaVersion 2 result 输入包含 `blockingFindings`、`nonBlockingFindings`、`resolvedFindings`、`verification`、`archiveResults`、`manifestUpdate`、`policyRoute`、`commitPolicy`、`consistencyScan` 或其他未知字段
- **THEN** validator MUST reject
- **AND** MUST NOT 将其写入 result.json

#### Scenario: reviewFindings 最小结构

- **WHEN** completed review-* Run 写入 `reviewFindings`
- **THEN** 每项 MUST 包含非空 `id`、`title`、`problem`
- **AND** `severity` MUST 为 `blocking` 或 `non-blocking`
- **AND** `location` MAY 为非空 string
- **AND** blocking finding 的 `requiredChange` MUST 为非空 string

#### Scenario: review verdict 与 findings 一致

- **WHEN** `reviewVerdict = changes-requested`
- **THEN** MUST 至少存在一个 blocking `reviewFindings`
- **AND** `reviewVerdict = approved` 时 MUST 不存在 blocking finding

#### Scenario: 非 review Run 不复制 Reviewer payload

- **WHEN** Run Action 不是 review-*
- **THEN** `reviewVerdict` 与 `reviewFindings` MUST absent
- **AND** 如需消费 reviewer 结果 MUST 通过 `reviewVerdictRef` 引用 review Run result.json

### Requirement: Core 拥有 ResultRef field-kind-path resolver

Core MUST 使用唯一 resolver 将 typed target descriptor 映射为受控 path 和 kind。Caller MUST NOT 提供
任意 artifact path 或 ResultRef kind。createRun、writeRunResult preflight 和 Reader MUST 复用同一 resolver
语义。

#### Scenario: produced artifact 使用固定 Action+tag mapping

- **WHEN** Action 为 `explore` 或 `revise-explore` 且 tag=`explore`
- **THEN** Core MUST 解析为 `openspec/changes/<changeId>/explore.md`
- **AND** Action 为 `propose` 或 `revise-propose` 时只允许 `proposal`、`design`、`specs`、`tasks`
- **AND** `specs` MUST 由 Core 枚举该 Change `specs/**` 下的实际文件
- **AND** 其他 Action MUST 不允许 produced artifact tag

#### Scenario: 不允许的 tag 或 path authority 被拒绝

- **WHEN** caller 提供不属于当前 Action permitted set 的 tag
- **OR** caller 尝试提供任意 path、kind 或 versionFingerprint
- **THEN** MUST reject
- **AND** Run MUST 不因此产生 terminal result

#### Scenario: resolver 在 create preflight Reader 语义一致

- **WHEN** 同一个 descriptor 在 createRun、writeRunResult preflight 或 Reader 中解析
- **THEN** MUST 得到同一 canonical kind/path
- **AND** 任一层发现非法 descriptor/path MUST fail closed

### Requirement: initial artifact generation 必须由 Core 建立完整 expected produced set

Core MUST 为没有 predecessor generation 的 initial `explore` 与 initial `propose` 建立完整、Action-owned
expected produced set。Caller MUST NOT 通过省略 `producedResultRefs`、传空 tag 集合或只声明部分 tag 缩小
initial coverage。Initial completion preflight、Reader 与 review entry MUST 使用同一 completeness contract。

#### Scenario: initial explore 必须完整绑定 explore.md

- **WHEN** initial `explore` Run 尝试 terminal completion
- **THEN** Core MUST 自动派生且仅派生 canonical `explore.md` produced ref
- **AND** `explore.md` 缺失、不可读或 fingerprint 无法建立时 MUST 保持 Run pending
- **AND** caller MUST NOT 通过省略 `explore` tag 形成空 initial effective set

#### Scenario: initial propose 必须完整绑定 Proposal bundle

- **WHEN** initial `propose` Run 尝试 terminal completion
- **THEN** Core MUST 自动派生 `proposal.md`、`design.md`、`tasks.md`
- **AND** Core MUST 枚举当时实际存在的完整 `specs/**` namespace，并为每个实际 spec 文件派生 produced ref
- **AND** initial produced ref set MUST 与该 authoritative expected set 完全一致
- **AND** 缺失任一 singleton ref、缺失任一实际 spec ref或出现不属于 expected set 的 produced-artifact ref MUST reject
- **AND** caller MUST NOT 通过空/部分 tag declaration 缩小 expected set

#### Scenario: initial review entry 拒绝未绑定的新增 spec

- **WHEN** initial `propose` 已 terminal
- **AND** 在 `review-propose` 创建前 canonical `specs/**` 出现一个不在该 generation produced refs 中的新文件
- **THEN** Core/Reader MUST 判定 current effective set incomplete
- **AND** MUST NOT 创建有效 review binding
- **AND** MUST fail closed，而不是只验证已有 refs

#### Scenario: initial complete propose 可以进入 review

- **WHEN** initial `propose` 的 produced refs 完整覆盖 proposal、design、tasks 与完整实际 `specs/**`
- **AND** 所有 refs 当前均可唯一解析且 fingerprint 匹配
- **THEN** current effective set completeness validation MUST pass
- **AND** `review-propose` MAY 继续建立 reviewed Run exact binding

### Requirement: 每个 current propose effective set 必须精确覆盖当前 specs namespace

Core MUST 对每个 current `propose` effective generation（initial `propose` 或任意合法 `revise-propose`
successor）强制执行完整 `specs/**` namespace invariant。Terminal preflight 与 `review-propose` entry
MUST 将 effective specs logical-ref set 与当前 canonical `specs/**` namespace 做精确集合比对；该规则
MUST NOT 只覆盖 initial propose。

#### Scenario: revise-propose 未声明 specs 且 namespace 未变化可继承

- **WHEN** P0 的 effective specs set 为 `{A}`
- **AND** matching `review-propose` 对 P0 给出 `changes-requested`
- **AND** P1=`revise-propose` 只声明 `proposal`
- **AND** 当前 canonical specs namespace 仍精确为 `{A}`
- **THEN** P1 MAY 继承 P0 的 A ref
- **AND** P1 terminal preflight MUST 验证 inherited A fingerprint
- **AND** effective specs set 与 canonical namespace exact-set comparison MUST pass

#### Scenario: revise-propose 未声明 specs 但新增 spec 必须拒绝 terminal

- **WHEN** P0 的 effective specs set 为 `{A}`
- **AND** matching `review-propose` 对 P0 给出 `changes-requested`
- **AND** P1=`revise-propose` 只声明 `proposal`
- **BUT** P1 revision window 内 canonical `specs/**` 新增 `B`
- **THEN** P1 的 inherited effective specs set `{A}` 与 current namespace `{A,B}` MUST 判定不完整
- **AND** Core MUST 要求本次 revision 声明 `specs` namespace replacement
- **AND** P1 result.json MUST 不发布
- **AND** P1 MUST 保持 pending

#### Scenario: revise-propose 声明 specs 后 Core 绑定完整 successor namespace

- **WHEN** 上述 P1 同时声明 `specs`
- **THEN** Core MUST 重新枚举完整 current `specs/**` namespace `{A,B}`
- **AND** MUST 以 `{A,B}` 的 Core-derived refs 整体替换 predecessor specs set
- **AND** 每个 spec fingerprint 均匹配时 P1 MAY terminal

#### Scenario: successor terminal 后 review entry 仍拒绝未绑定 namespace drift

- **WHEN** current `revise-propose` generation P1 已 terminal
- **AND** 在创建 `review-propose` 前 canonical `specs/**` namespace 相比 P1 effective specs set 新增或删除文件
- **THEN** review entry exact-set comparison MUST fail
- **AND** MUST NOT 创建有效 reviewed Run binding
- **AND** MUST fail closed，而不是只验证 P1 已有 effective refs

### Requirement: review Run 必须精确绑定被审查 result 内容

review-* Run MUST 通过 Core-derived `context.inputRef` 精确绑定 `reviewedRunId` 的实际 result.json。
reviewVerdict 与 reviewFindings 只有在该 binding 成功后才可 terminal publish。

#### Scenario: createRun 建立 reviewed result exact binding

- **WHEN** 创建 review-* Run
- **THEN** Core MUST 从 `reviewedRunId` 定位实际 result.json
- **AND** MUST 构造 `kind=run-result` 的 `context.inputRef`
- **AND** target 缺失或不可读 MUST 阻止 Run 正式 publish

#### Scenario: completion 检测 reviewed result replacement

- **WHEN** review-* Run 完成前 reviewed result.json 已被替换
- **THEN** preflight MUST 检测 fingerprint mismatch
- **AND** MUST 返回 `RESULT_REF_MISMATCH`
- **AND** reviewer result.json MUST 不发布
- **AND** Run MUST 保持 pending

#### Scenario: Reader 对 review binding fail-closed

- **WHEN** Reader 读取 schemaVersion 2 review-* Run
- **AND** inputRef 缺失、目标与 reviewedRunId 不一致、目标不可读或 fingerprint 不匹配
- **THEN** MUST 收集 `FactConflict`
- **AND** MUST NOT 构造有效 `ReviewVerdictFact`

#### Scenario: review Run 不允许自引用 reviewVerdictRef

- **WHEN** Action 为 review-*
- **THEN** `actionResult.reviewVerdictRef` MUST absent
- **AND** reviewer verdict/findings MUST 直接使用 typed top-level payload
- **AND** MUST NOT 构造引用当前 result.json 自身 SHA-256 的 ResultRef

### Requirement: Run completion preflight 在 terminal publish 前验证所有引用

`writeRunResult` MUST 在 terminal serialization/temp-file/fs.link 之前验证所有适用 Core-created ResultRef。
preflight MUST 使用与 Core resolver 相同的 target 解析规则。失败 MUST 保持当前 Run 为 pending，且 MUST NOT
削弱既有 `assertMutable + fs.link` terminal create-once 协议。

#### Scenario: preflight 成功后才进入 terminal publish

- **WHEN** 所有适用引用目标存在、可读且 fingerprint 匹配
- **AND** initial artifact Run 的 expected produced set 已完整覆盖
- **AND** revise artifact Run 的 successor/inherited effective set 已完整验证
- **THEN** `writeRunResult` MAY 进入 serialize → temp → fs.link
- **AND** 既有 create-if-not-exists 并发协议 MUST 保持

#### Scenario: target 缺失保持 pending

- **WHEN** 任一必须引用的目标缺失或不可读
- **THEN** MUST 返回 `RESULT_REF_TARGET_MISSING`
- **AND** MUST NOT 写 terminal result.json
- **AND** 同一 Run MUST 保持 pending

#### Scenario: fingerprint mismatch 保持 pending

- **WHEN** 任一已由 Core 构造的 ResultRef 与当前真实目标 SHA-256 不一致
- **THEN** MUST 返回 `RESULT_REF_MISMATCH`
- **AND** MUST NOT 写 terminal result.json
- **AND** 同一 Run MUST 保持 pending

#### Scenario: terminal Run 仍不可重开

- **WHEN** result.json 已存在且 Run 为 terminal
- **THEN** 既有 `assertMutable` / `fs.link` 规则 MUST 拒绝再次完成
- **AND** Q1 MUST NOT 将 terminal Run 恢复为 pending

### Requirement: mutable Change artifact ResultRef 必须使用 generation-aware validation

Reader MUST 对 `produced-artifact` 与 `verification-summary` 指向的 mutable canonical OpenSpec Change artifacts
执行 generation-aware validation。Reader MUST 根据合法 review/revise lineage 区分 current、revision-window
与 superseded generation，MUST NOT 将所有历史 mutable artifact refs 永久重新绑定到当前 canonical bytes。
该边界 MUST NOT 弱化 immutable Run-result binding、review exact binding 或 current effective artifact
replacement detection。

#### Scenario: initial generation effective set 必须先通过 completeness validation

- **WHEN** Reader 构建没有 predecessor 的 initial `explore` 或 `propose` generation
- **THEN** MUST 先按 Action-owned expected-set contract 验证完整性
- **AND** initial `explore` MUST 覆盖 canonical explore ref
- **AND** initial `propose` MUST 覆盖 proposal、design、tasks 与完整实际 specs namespace
- **AND** empty 或 partial initial effective set MUST 产生 `FactConflict` 或阻止 terminal/review entry

#### Scenario: 无合法 successor 时 current generation 严格验证

- **WHEN** completed `explore|revise-explore|propose|revise-propose` artifact generation 不存在合法 revision successor
- **THEN** 该 generation MUST 为当前 stage generation
- **AND** Reader MUST 严格解析并验证其 current effective artifact refs
- **AND** 任一 canonical artifact fingerprint mismatch MUST 产生 `FactConflict`

#### Scenario: 合法 revision successor 必须由完整 lineage 证明

- **WHEN** Reader 判定 generation G0 被 revise-S supersede
- **THEN** MUST 存在 matching completed `review-S` Run R
- **AND** `R.reviewedRunId == G0.runId`
- **AND** `R.verdict == changes-requested`
- **AND** successor G1 MUST 为 `revise-S`
- **AND** `G1.sourceReviewRun == R.runId`
- **AND** `G1.sourceReviewVerdict == changes-requested`
- **AND** MUST NOT 仅凭较新 Run ID、mtime 或 Action 名称推断 supersession

#### Scenario: pending revise 建立有界 revision window

- **WHEN** matching changes-requested review 后已存在合法 pending `revise-S` Run
- **THEN** Reader MUST 允许该 Action 修改其 stage-owned canonical artifacts
- **AND** MUST NOT 仅因 predecessor mutable produced refs 与正在修改的 canonical bytes 不同产生 `FactConflict`
- **AND** predecessor 的 immutable terminal result、review binding 与 source-review lineage MUST 继续严格验证
- **AND** revision window MUST NOT 允许其他 Action 或无 lineage 修改获得同样豁免

#### Scenario: completed successor 使 predecessor mutable refs superseded

- **WHEN** 合法 `revise-S` successor terminal 完成
- **THEN** predecessor generation 的被 successor 覆盖 mutable artifact refs MUST 标记为 superseded validation scope
- **AND** Reader MUST NOT 再将这些 historical refs 与当前 canonical bytes 比较
- **AND** predecessor terminal Run MUST NOT 被重写或删除
- **AND** immutable Run-result refs 与 review exact bindings MUST 继续严格验证

#### Scenario: subset revision 构建 effective artifact set

- **WHEN** `revise-propose` 只声明 Proposal bundle 的部分 produced artifact tags
- **THEN** successor effective artifact set MUST 以 predecessor effective set 为基底
- **AND** successor 声明的 `proposal`、`design`、`tasks` tag MUST 替换对应单一 logical ref
- **AND** successor 声明 `specs` tag 时 MUST 以当前实际 `specs/**` 全集合替换 predecessor 的整个 specs namespace
- **AND** 未声明 tag MUST 继承 predecessor refs
- **AND** successor terminal preflight MUST 验证 successor refs 与全部 inherited refs
- **AND** 对 `revise-propose`，Core MUST 无条件比较 successor effective specs logical-ref set 与当前 canonical `specs/**` namespace
- **AND** specs namespace 新增/删除但 successor 未声明 `specs` 时 MUST 判定 exact-set mismatch 并保持 pending
- **AND** 若未声明的 singleton artifact 实际已被修改，inherited fingerprint mismatch MUST 使 successor 保持 pending

#### Scenario: review 前验证 current effective artifact set

- **WHEN** 创建 `review-explore` 或 `review-propose`
- **THEN** Core/Reader MUST 先确认被审查 generation 的 current effective artifact set 全部可唯一解析且 fingerprint 匹配
- **AND** 当 Action 为 `review-propose` 时 MUST 额外确认 effective specs logical-ref set 与当前 canonical `specs/**` namespace 精确相等
- **AND** 验证通过后 review Run 才可通过 Core-derived inputRef 绑定该 generation 的 immutable result.json
- **AND** current effective artifact invalid 或 specs namespace incomplete 时 MUST 不允许形成有效 review binding

#### Scenario: 无合法 revision lineage 的 overwrite 仍 fail-closed

- **WHEN** current canonical artifact bytes 改变
- **AND** 不存在 matching `changes-requested → pending/completed revise-S` lineage
- **THEN** Reader MUST 将 current generation fingerprint mismatch 记录为 `FactConflict`
- **AND** MUST NOT 以“可能正在 revise”为由猜测性忽略

### Requirement: current effective Change artifact ResultRef 必须跨 archive relocation 保持可验证

generation-aware classification MUST 先确定 current effective artifact set；archive-aware resolver MUST 再将这些
persisted logical refs 解析到唯一物理目标。纯 archive relocation MUST NOT 修改 terminal Run 或 ResultRef。

#### Scenario: archive 前解析 current effective active artifact

- **WHEN** current effective logical ref 对应 active Change artifact
- **AND** active target 存在
- **AND** 不存在同一 changeId archived candidate
- **THEN** resolver MUST 选择 active target
- **AND** MUST 以实际内容验证 current effective fingerprint

#### Scenario: archive 后解析唯一 final archived artifact

- **WHEN** active target 已因正常 archive relocation 不存在
- **AND** `openspec/changes/archive/` 下恰好一个目录在移除 `YYYY-MM-DD-` 前缀后与 `context.changeId` 完全相等
- **AND** archived final artifact 存在且可读
- **THEN** resolver MUST 选择该 archived physical target
- **AND** persisted current logical ref MUST 保持 active canonical identity 不变
- **AND** MUST 以 archived final bytes 验证 current effective fingerprint

#### Scenario: archive relocation 保持 final effective bytes

- **WHEN** archive relocation 移动 Change canonical artifacts
- **THEN** MUST 保持 final current effective artifact bytes 不变
- **AND** MUST NOT 为新物理路径重写任何 terminal Run 或 ResultRef
- **AND** final effective content 改变 MUST fail-closed

#### Scenario: artifact resolver 歧义 fail-closed

- **WHEN** active target 与 archived target 同时存在
- **OR** 存在多个 archive directory 精确匹配同一 `changeId`
- **THEN** resolver MUST NOT 静默选择任一目标
- **AND** write/preflight MUST reject
- **AND** Reader MUST 记录 `FactConflict`

#### Scenario: superseded generation 不因 archive 恢复为 current validation

- **WHEN** historical produced artifact ref 已由合法 revision lineage 标记为 superseded
- **AND** Change 后续 archive
- **THEN** Reader MUST 继续按 superseded validation scope 处理
- **AND** MUST NOT 将 archived final bytes 与 historical superseded fingerprint 比较
- **AND** terminal history 与 review lineage MUST 保持可读且不可改写

### Requirement: verificationSummaryRef 使用 generation-aware logical ref 与 Action-owned inclusion

`verificationSummaryRef` MUST 使用当前 Run 的 `context.changeId` 派生逻辑 ref
`openspec/changes/<context.changeId>/verification.md`。只有 `review-apply` 可以新建该 ref。
由于 `verification.md` 会在合法 `revise-apply → Change Verification` 后更新，Reader MUST 对其应用与
produced artifact 同源的 generation-aware validation boundary。

#### Scenario: review-apply 包含当前 verification summary

- **WHEN** Action 为 `review-apply`
- **AND** shared artifact resolver 能唯一解析当前 `verification.md` 且文件可读
- **THEN** Core MUST 构造 kind=`verification-summary` 的 ResultRef
- **AND** persisted ref MUST 为 `openspec/changes/<context.changeId>/verification.md`
- **AND** versionFingerprint MUST 来自当前 verification bytes

#### Scenario: review-apply 缺 verification record 保持 pending

- **WHEN** Action 为 `review-apply`
- **AND** shared artifact resolver 无法解析唯一且可读的 verification target
- **THEN** MUST 返回 `RESULT_REF_TARGET_MISSING` 或对应 invalid-target error
- **AND** review-apply Run MUST 保持 pending

#### Scenario: changes-requested review-apply 后允许 verification generation supersede

- **WHEN** review-apply V0 的 verdict 为 `changes-requested`
- **AND** 存在合法 `revise-apply` successor sourced from V0
- **THEN** V0 的 verificationSummaryRef MAY 进入 superseded/revision-window validation scope
- **AND** 后续 Change Verification 合法更新 `verification.md` MUST NOT 使 V0 产生 historical false `FactConflict`
- **AND** V0 的 terminal result、reviewedRun exact binding 与 verdict MUST 继续严格验证

#### Scenario: 新 review-apply 建立新的 current verification generation

- **WHEN** `revise-apply` 后 Change Verification 已更新 `verification.md`
- **AND** 创建下一 `review-apply` V1
- **THEN** Core MUST 从当前 verification bytes 构造 V1 的 verificationSummaryRef
- **AND** V1 MUST 成为 current verification generation
- **AND** V1 fingerprint mismatch MUST fail-closed

#### Scenario: apply 和 revise-apply 不产生 verificationSummaryRef

- **WHEN** Action 为 `apply` 或 `revise-apply`
- **THEN** `verificationSummaryRef` MUST absent
- **AND** MUST NOT 在 Change Verification 执行前要求 verification.md 存在

#### Scenario: archive 不新建 verificationSummaryRef

- **WHEN** Action 为 `archive`
- **THEN** archive Run 的 `verificationSummaryRef` MUST absent
- **AND** final current verification generation MUST 由 archive-aware resolver 在 relocation 后继续验证
- **AND** historical superseded verification refs MUST 不与 archived final bytes 重新比较
- **AND** archive MUST NOT 修改既有 terminal Run

### Requirement: Reader 必须覆盖 revision 到 archive 的完整 generation lifecycle

Reader MUST 以两阶段方式处理 schemaVersion 2 mutable artifact refs：先读取并校验 immutable Run facts /
review-revise lineage，再建立 generation classification 与 effective sets，最后验证 current effective refs。
MUST NOT 在 lineage 尚未建立前逐 Run 将 historical mutable ref mismatch 直接升级为 `FactConflict`。

#### Scenario: propose revision subset 在 archive 前后都可恢复

- **WHEN** schemaVersion 2 `propose` P0 terminal
- **AND** `review-propose` R0 exact-bind P0 且 verdict=`changes-requested`
- **AND** `revise-propose` P1 sourced from R0，只修改并声明 `proposal` 与 `design`
- **THEN** P1 completion MUST 验证新 proposal/design refs
- **AND** MUST 验证继承自 P0 的 specs/tasks refs 仍匹配
- **AND** P0 terminal Run MUST 保持不变
- **AND** archive 前 Reader MUST 同时读取 P0 与 P1 而不因 P0 overwritten proposal/design refs 产生 `FactConflict`
- **AND** P1 effective set MUST 对当前 canonical bytes 全部验证通过

#### Scenario: revision 后 archive 只验证 final effective set

- **WHEN** 上述 P1 后续被 approved 并正常 archive
- **THEN** post-archive Reader MUST 将 P1 final effective set 解析到唯一 archived Change directory
- **AND** final fingerprints MUST 匹配 archived bytes
- **AND** P0 superseded refs MUST 保持 historical scope，不得要求 terminal rewrite 或历史 snapshot

#### Scenario: 未声明 subset 修改阻止 revise terminal

- **WHEN** P1 声明只修改 `proposal`
- **BUT** canonical `design.md` 也被修改
- **THEN** inherited P0 design ref validation MUST mismatch
- **AND** P1 result.json MUST 不发布
- **AND** P1 MUST 保持 pending

#### Scenario: successor 新增未声明 spec 阻止 revise terminal

- **WHEN** P0 effective specs namespace 为 `{A}`
- **AND** matching changes-requested review 后 P1=`revise-propose` 只声明 `proposal`
- **BUT** P1 revision window 内 canonical specs namespace 变为 `{A,B}`
- **THEN** P1 terminal preflight MUST 比较 effective specs `{A}` 与 canonical namespace `{A,B}`
- **AND** MUST 因 exact-set mismatch 拒绝 terminal publication
- **AND** P1 MUST 保持 pending
- **AND** 后续 `review-propose` MUST NOT 能为该 incomplete generation 建立有效 binding

#### Scenario: successor 声明 specs 后完整 namespace 可以通过

- **WHEN** 上述 P1 同时声明 `specs`
- **THEN** Core MUST 枚举 `{A,B}` 并建立完整 successor specs refs
- **AND** successor/inherited singleton refs 与完整 specs refs 均通过验证时 P1 MAY terminal
- **AND** `review-propose` entry 重新 exact-compare `{A,B}` 后 MAY 绑定 P1 result.json

#### Scenario: 无 revision lineage 的历史 overwrite 产生冲突

- **WHEN** P0 terminal 后 proposal.md 被修改
- **AND** 不存在 matching changes-requested review 与 revise-propose window
- **THEN** Reader MUST 对 P0 current effective ref 产生 `FactConflict`

