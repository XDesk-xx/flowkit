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

C1 MUST 定义 `validateActionResultWithoutRunRef` 校验 `ActionResultWithoutRunRef` 物理投影。MUST NOT 调用不存在的 B1 `validateActionResult`。C1 MUST 定义自己的 `validateResultRefProjection`（B1 的 `validateResultRef` 未导出）。

#### Scenario: 必填字段校验

- **WHEN** 校验 `ActionResultWithoutRunRef`
- **THEN** `action` MUST 在 B1 `CHANGE_ACTIONS` 或 `DELIVERY_ACTIONS` 中
- **AND** `executionStatus` MUST 通过 B1 `isExecutionStatus` 校验
- **AND** `summary` MUST 为非空 string

#### Scenario: 嵌套 ResultRef 校验

- **WHEN** `ActionResultWithoutRunRef` 包含 `producedResultRefs`、`consumedInputRefs`、`verificationSummaryRef` 或 `reviewVerdictRef`
- **THEN** 每个嵌套 `ResultRef` MUST 通过 C1 `validateResultRefProjection` 校验
- **AND** `ref` 和 `versionFingerprint` MUST 为非空 string

#### Scenario: 禁止 runRef 字段

- **WHEN** `ActionResultWithoutRunRef` 包含 `runRef` 字段
- **THEN** MUST reject
- **AND** 原因为 `runRef` 在物理投影中省略，读取时派生

#### Scenario: malformed 投影拒绝

- **WHEN** `ActionResultWithoutRunRef` 缺少必填字段或包含无效值
- **THEN** MUST reject
- **AND** MUST throw `FlowkitError('SCHEMA_VALIDATION_FAILED')`

### Requirement: ResultRef versionFingerprint 使用 content hash

ResultRef adapter MUST 使用 content hash（SHA-256）作为 `versionFingerprint`。MUST NOT 使用自引用 Commit SHA。

#### Scenario: versionFingerprint 为文件内容 SHA-256

- **WHEN** 构造 ResultRef 的 `versionFingerprint`
- **THEN** MUST 为 result.json 文件内容的 SHA-256
- **AND** MUST NOT 为 Git Commit SHA

#### Scenario: verifyResultRef 检测替换

- **WHEN** 调用 `verifyResultRef(ref, actualFileContent)`
- **THEN** MUST 比对 `ref.versionFingerprint` 与 `actualFileContent` 的 SHA-256
- **AND** 不匹配时 MUST 返回 false

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

C1 MUST 定义 `ContextFile` 物理 schema 作为 `createRun` 创建的 Run 输入上下文和确定性 current-Run 投影。C1 Run 使用 `schemaVersion: 2` 作为 C1 格式标记（与 Bootstrap corpus 的 `schemaVersion: 1` 明确区分）。`createRun` 写入 context.json 前 MUST 通过 C1 `validateContextFile` 和 `validateContextFileIdentity` 校验。`changeKey`/`changeId` 的存在性由 Action-scope 规则决定。`inputRef` 为可选 `ResultRef`，与 B1 `Run.inputRef?: ResultRef` 类型一致。

#### Scenario: ContextFile 必填字段

- **WHEN** 校验 `ContextFile`
- **THEN** `schemaVersion` MUST 等于 `2`（C1 格式标记）
- **AND** MUST 包含 `runId`、`deliveryId`、`action`、`role`、`ownerAuthorization`、`runPath` 字段
- **AND** `action` MUST 在 B1 `CHANGE_ACTIONS` 或 `DELIVERY_ACTIONS` 中
- **AND** `changeKey`/`changeId` 的存在性由 Action-scope 规则决定（见对应 Scenario）

#### Scenario: Action-scope 规则 changeKey/changeId 存在性

- **WHEN** 校验 `ContextFile` 的 `changeKey`/`changeId`
- **AND** `action` 在 B1 `DELIVERY_ACTIONS`（`full-test`、`delivery-finalize`）中
- **THEN** `changeKey`/`changeId` MUST 缺失（Delivery-level Run）
- **AND** `action` 在 B1 `CHANGE_ACTIONS`（其余 10 个）中时 `changeKey`/`changeId` MUST 存在（Change-level Run）
- **AND** 混合（Delivery action 携带 changeId，或 Change action 缺失 changeId）MUST reject（createRun）或收集为 `FactConflict`（Reader）

#### Scenario: inputRef 为可选 ResultRef

- **WHEN** 校验 `ContextFile.inputRef`
- **THEN** `inputRef` MAY 缺失（explore 等无 source review 的 Run）
- **AND** 存在时 MUST 为 `ResultRef` 对象（MUST NOT 为 string）
- **AND** MUST 通过 C1 `validateResultRefProjection` 校验（`ref` + `versionFingerprint` 为非空 string）
- **AND** Bootstrap Run 的 string 形 `inputRef` 不走 C1 校验（由 legacy adapter 处理）

#### Scenario: createRun 写入前校验

- **WHEN** `createRun` 写入 context.json
- **THEN** MUST 通过 `validateContextFile` 校验（`schemaVersion === 2` + 必填 + Action-scope + inputRef）
- **AND** MUST 通过 `validateContextFileIdentity` 校验
- **AND** 校验通过后才写入 staging 目录

#### Scenario: 确定性 current-Run 投影

- **WHEN** `writeRunResult` 构造当前 Run 对象
- **THEN** MUST 从 `context.json` 读取 `ContextFile`
- **AND** Run 的 `runId`、`deliveryId`、`changeId`、`action`、`role` 字段 MUST 来自 `ContextFile`
- **AND** Run 的 `status` MUST 为 `pending`（因为 result.json 不存在）
- **AND** Run 的 `inputRef` MUST 直接映射自 `ContextFile.inputRef`（同为 `ResultRef?`，无需类型转换）
- **AND** 构造的 Run MUST 通过 B1 `validateRun`

#### Scenario: 身份校验 runId 匹配目录名

- **WHEN** `validateContextFileIdentity` 校验 `contextFile.runId`
- **THEN** `runId` MUST 匹配 Run 目录名
- **AND** 不匹配时 MUST reject（createRun）或收集为 `FactConflict`（Reader）

#### Scenario: 身份校验 deliveryId 匹配路径

- **WHEN** `validateContextFileIdentity` 校验 `contextFile.deliveryId`
- **THEN** `deliveryId` MUST 匹配 Delivery 级路径段
- **AND** 不匹配时 MUST reject 或收集为 `FactConflict`

#### Scenario: 身份校验 changeId 匹配路径

- **WHEN** `validateContextFileIdentity` 校验 `contextFile.changeId`
- **AND** Run 为 Change-level（`changeId` 存在）
- **THEN** `changeId` MUST 匹配 Change 级路径段
- **AND** 不匹配时 MUST reject 或收集为 `FactConflict`
- **AND** Delivery-level Run（`changeId` 缺失）MUST 跳过此校验

#### Scenario: 身份校验 runPath 一致

- **WHEN** `validateContextFileIdentity` 校验 `contextFile.runPath`
- **THEN** `runPath` MUST 与实际文件系统路径一致
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

