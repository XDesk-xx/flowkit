# flowkit-formal-fact-reader-and-persistence Specification

## Purpose
冻结 Flowkit 确定性内核的正式事实读取层与持久化层契约：定义 FormalFactSnapshot 只读事实视图、遵循 One-fact-one-authority 原则的 Reader、staging + atomic publish 的 Run 创建协议、独占 fs.link 的 terminal result 发布协议、assertMutable 对 CURRENT 持久化状态的校验、RunResultFile/ContextFile 物理 schema 与确定性投影、非自引用序列化边界、C1 物理投影校验器、content hash versionFingerprint、Run ID 文件系统集成、Git 边界摘要只读、手写最小子集 YAML manifest 解析、Delivery Manifest 嵌套状态读取、Bootstrap Run 兼容性与三路判别器、review verdict 重建与发布前完整性校验、Change Verification 记录。本 spec 为 Policy Engine 和诊断 CLI 提供不可变的正式事实输入与原子持久化基础。
## Requirements
### Requirement: FormalFactSnapshot 只读视图

C1 MUST 提供只读 `FormalFactSnapshot`，用于 Policy 消费 active Delivery/Change、dependencies、OpenSpec artifacts、current Change Runs、Reviewer Verdict 与最小 blocking-authority projection、Change Verification、Tasks completion、Delivery `fullTestStatus`、owner authorization、Archive/Checkpoint/Git boundary 和 conflicts。Snapshot MUST NOT 把完整 Reviewer Finding corpus 复制为第二数据库；Policy 所需 blocking authority MUST 从当前 matching Reviewer result 派生。

#### Scenario: Reviewer authority 只投影 Policy 所需最小集合

- **WHEN** Reader 读取 completed `review-*` result
- **THEN** `ReviewVerdictFact` MUST 包含 `reviewRunId`、`verdict`、`reviewedRunId`
- **AND** MUST 包含从 blocking `reviewFindings` 派生的去重 `blockingAuthorities`
- **AND** 完整 Finding 正文仍 MUST 由 Reviewer result.json 拥有

#### Scenario: conflicts 保持 fail-closed

- **WHEN** Reader 发现当前 Policy relevant formal fact 自相矛盾或不可解析
- **THEN** MUST 收集 `FactConflict`
- **AND** Policy MUST NOT 猜测 authority 或下一 Action

### Requirement: 正式事实 Reader 遵循 One fact, one authority

Reader MUST 遵循 `One fact, one authority` 原则：每个当前 Policy 所需正式事实从唯一权威来源读取。Reader MUST NOT 做跨权威交叉推断，也 MUST NOT 把 Run 历史记录提升为 OpenSpec、Git、Verification 或 current repository bytes 的持续 authority。只有当前 Policy relevance 范围内的 authority fact 自相矛盾、required fact 缺失、当前 Run schema/identity 无效或当前 immutable lineage binding 错误时，冲突 MUST 收集为 `FactConflict[]`；Reader MUST NOT 自动择优。

#### Scenario: 每个事实从唯一权威读取

- **WHEN** Reader 读取正式事实
- **THEN** 每个事实 MUST 从唯一权威来源读取
- **AND** MUST NOT 从多个权威来源交叉推断同一事实

#### Scenario: 冲突收集不择优

- **WHEN** Reader 检测到当前 Policy relevance 范围内的正式事实冲突
- **THEN** 冲突 MUST 收集到 `FormalFactSnapshot.conflicts`
- **AND** Reader MUST NOT 自动选择其中一个来源
- **AND** Policy 在 `conflicts` 非空时 MUST blocked

#### Scenario: Reader 不调用 OpenSpec CLI

- **WHEN** Reader 读取 OpenSpec 相关事实
- **THEN** MUST 只读取 OpenSpec 目录结构的文件系统事实（存在性、状态摘要）
- **AND** MUST NOT 调用 `openspec` CLI 命令

#### Scenario: 非当前 Policy 历史 Run 不成为 blocking authority

- **WHEN** 已 completed/cancelled/planned Change 的历史 Run 存在旧 schema 差异或 historical mutable ResultRef 无法与 today/current path bytes 对齐
- **AND** 当前 Policy 不消费该 Change 的 Run lineage 来决定当前 Action
- **THEN** Reader MUST NOT 仅因该历史辅助记录问题产生 current blocking `FactConflict`
- **AND** MUST NOT 为此扩张 legacy/generation compatibility authority

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

所有 schemaVersion 2 生产 ResultRef MUST 使用**建立该引用时**真实目标文件内容的 SHA-256 作为 `versionFingerprint`。Caller MUST NOT 成为 fingerprint、kind 或 ref path 的 authority。`run-result` 与当前 Action 正在消费的 handoff binding 必须 exact；completed historical `produced-artifact` 与 terminal `verification-summary` 是 point-in-time external reference，MUST NOT 被 Reader 解释为 future/current path 的永久 immutability authority。`review-apply` 的 `context.verificationInputRef` 是仅在该 current/pending Review entry→completion 生命周期内 exact 的临时 handoff binding。

#### Scenario: versionFingerprint 为文件内容 SHA-256

- **WHEN** Core 构造 ResultRef 的 `versionFingerprint`
- **THEN** MUST 为目标文件当时实际内容的 SHA-256
- **AND** MUST NOT 为 Git Commit SHA

#### Scenario: Run result ResultRef 由 Core 构造

- **WHEN** Core 为 Run `result.json` 创建或消费 ResultRef
- **THEN** MUST 使用 `kind=run-result`
- **AND** versionFingerprint MUST 为该 `result.json` 内容 SHA-256
- **AND** 在当前 handoff/Review lineage 被消费时 MUST 对 create-once `result.json` 做 exact hash 验证

#### Scenario: non-Run artifact ResultRef 由 Core 构造

- **WHEN** Core 为 produced artifact 或 verification summary 创建 ResultRef
- **THEN** kind MUST 由 owning result field 在 Core 内部选择
- **AND** versionFingerprint MUST 为本次 Action 建立引用时目标 artifact 的实际 SHA-256
- **AND** constructor MUST NOT 自动追加 `result.json`
- **AND** 当该 ref 已不再被当前 Action 作为 handoff 消费时，后续合法 lifecycle 修改同一路径 MUST NOT 反向使该历史 ResultRef 本身无效

#### Scenario: caller 不能提供 versionFingerprint

- **WHEN** Action caller 提供 typed target descriptor
- **THEN** MUST NOT 接受 caller-supplied `versionFingerprint`
- **AND** Core MUST 读取真实目标后构造 ResultRef

#### Scenario: verifyResultRef 检测替换

- **WHEN** 某 ResultRef 或其覆盖 generation 正被当前 Action 作为明确 handoff 消费
- **THEN** entry/completion contract MUST 对仍要求不变的 target bytes 做 exact check
- **AND** mismatch MUST fail closed

#### Scenario: historical mutable ResultRef 不做 future current-path replay

- **WHEN** historical `produced-artifact` 或 `verification-summary` ResultRef 的 logical path 在后续合法 Action 中内容变化或发生 OpenSpec archive relocation
- **THEN** Reader MUST NOT 仅因 future/current physical bytes 与 historical fingerprint 不同产生 `FactConflict`
- **AND** current exact validation MUST 仅发生在拥有明确当前 Action correctness 目的的 entry/completion 边界
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

持久化层 MUST 为 current Standard Run 定义 closed structural `ContextFile` shape，并对 repository 中已经存在的 historical Context shapes 提供 bounded read-only recognition。E2 MUST NOT 引入 `Context v6` 或新的 Context component version lifecycle。recognized E2 Change Checkpoint 前，E2 自身继续按 pre-E2 current runner 的 existing context/entry protocol执行；checkpoint 后 current writer MUST 将 canonical Git Base + lexical compact entry delta、Core-derived typed mutation declaration、applicable Owner/contract refs 与 semantic identity 内嵌 `context.json`，并且 new Run 不再依赖 `entry-workspace.json`。对 Git history 中不存在 Flowkit 02 pre-E2 migration lineage 的 fresh/downstream repository，current writer MUST 直接使用同一 post-E2 current shape，MUST NOT 要求伪造 E2 checkpoint。Latest reader MUST 通过 mutually-exclusive structural fields 优先识别 post-E2 current shape，再识别仓库真实存在的 bounded historical shapes；unknown、ambiguous 或 mixed shape MUST fail closed。E2 本 Proposal不授权新的 `formatVersion`；若 implementation 无法通过结构可靠区分，则 MUST 返回 Proposal，而不是临时新增组件版本。

#### Scenario: ContextFile 必填字段

- **WHEN** 校验 post-E2 current Standard Run
- **THEN** MUST 包含 `runId`、`deliveryId`、`changeKey`、`changeId`、`action`、`role`、`ownerAuthorization`、`runPath`、canonical base、applicable facts、semantic fingerprint 与 matching current ActionPackage projection
- **AND** `action` MUST 在 10 个 Change-only Standard Action Catalog 中
- **AND** action/role 或 structural field combination mismatch MUST fail closed
- **AND** current shape MUST NOT 依赖新的 Context component version number

#### Scenario: 新 current Run 不允许 Delivery-level shape

- **WHEN** post-E2 create input 缺失 `changeKey` / `changeId`
- **OR** action 为历史 `full-test` / `delivery-finalize`
- **THEN** writer MUST reject
- **AND** MUST NOT publish pending Run

#### Scenario: review Run inputRef 必须绑定 reviewedRunId

- **WHEN** 创建 post-E2 `review-explore`、`review-propose` 或 `review-apply`
- **THEN** `reviewedRunId` MUST 存在
- **AND** Core MUST 从对应实际 `result.json` 构造 immutable `context.inputRef`
- **AND** 目标缺失、不可读或 fingerprint 不匹配 MUST 在 Run publish 前 fail closed

#### Scenario: context 身份必须匹配 Change path

- **WHEN** 校验 post-E2 current Run
- **THEN** `deliveryId`、`changeId`、`runId` 与 `runPath` MUST 和实际目录一致
- **AND** 任一不一致 MUST reject 或收集 `FactConflict`

#### Scenario: v5 Apply entry 必须完整

- **WHEN** Reader/resume 处理 existing historical/pre-E2 schemaVersion 5 `apply` 或 `revise-apply` Run
- **THEN** context MUST 按已存在 contract 包含 persisted full entry workspace identity 与 matching approved Design 派生的 typed declaration
- **AND** MUST 保持 immutable read-only，MUST NOT 被升级、回填或解释为 post-E2 compact current shape

#### Scenario: post-E2 Apply 使用 compact entry identity

- **WHEN** Flowkit self-migration repository 已有 recognized E2 Change Checkpoint，或 fresh/downstream repository 不存在 Flowkit 02 pre-E2 migration lineage，并创建新的 `apply` 或 `revise-apply` Run
- **THEN** `context.json` MUST 内嵌 canonical Git Base + complete lexical compact entry delta + typed mutation declaration identity
- **AND** MUST NOT 创建 `entry-workspace.json`
- **AND** Base、entry delta 或 declaration identity drift MUST fail closed

### Requirement: Bootstrap Run 兼容性 + 三路判别器

Reader MUST 使用 closed current-shape-first + bounded legacy discriminator。Post-E2 current shape MUST 由其 required structural fields唯一识别；现有 historical schemaVersion 2/3/4/5 与 schemaVersion 1/missing legacy shape MAY 继续由仓库当前已有 bounded validators/recognizer只读处理。E2 MUST NOT 新增一个新的 schemaVersion 数值来表达 post-E2 current implementation，也 MUST NOT 建立开放式 `readV1/readV2/readV3...` framework。任何 historical path MUST NOT 修改 bytes、补字段、升级 authority 或 fallback 到其它 parser；unknown/ambiguous/mixed shape MUST fail closed。

#### Scenario: schemaVersion 2 current Change Run 严格校验

- **WHEN** Reader 读取 schemaVersion 2 historical Change Run
- **THEN** normal C1 shape MUST 使用既有 v2 strict Change-only/identity validation
- **AND** provisional `ownerFactRefs` MAY 只校验 shape 后从 typed authority projection 忽略
- **AND** pre-Q1 revision exception MUST 只接受既有 run/change/action/sourceReviewRun + immutable SHA-256 allowlist 完全匹配的 corpus
- **AND** malformed v2 MUST 收集 `FactConflict`，MUST NOT 因失败退回 legacy best-effort

#### Scenario: legacy recognizer 可识别历史 Delivery Action

- **WHEN** Reader/NNN enumeration 遇到 schemaVersion 1 或缺失的历史 Run
- **AND** action 为 `full-test` 或 `delivery-finalize`
- **THEN** MAY 识别为 bounded legacy Delivery Run
- **AND** MUST NOT 将该 action 加回 current Action Catalog
- **AND** MUST NOT 允许 new writer 继续该模型

#### Scenario: legacy terminal bytes 不迁移

- **WHEN** bounded historical reader 识别既有 historical Run
- **THEN** MUST NOT 修改、迁移或重写其 `context.json` / `result.json` 或 sidecars
- **AND** current Policy MUST 从当前正式 facts 计算 lifecycle，而不是升级旧 Run authority

#### Scenario: historical v3 保留 Owner fact contract

- **WHEN** Reader 读取 schemaVersion 3 context
- **THEN** MUST 按 D1 bounded `ownerFactRefs` 与既有 identity rules 只读投影
- **AND** MUST NOT 获得后续 archive/entry/current-shape authority

#### Scenario: historical v4 保留 archive projection contract

- **WHEN** Reader 读取 schemaVersion 4 context
- **THEN** MUST 按 D2 rules 校验 Owner facts、archive-only `archiveEntryOpenSpecProjection` 与 existing action-specific fields
- **AND** MUST NOT 将它宣称为 post-E2 current persistence authority

#### Scenario: v5 current context 严格校验

- **WHEN** Reader 读取 existing schemaVersion 5 pre-E2 context
- **THEN** MUST 使用既有 v5 Action-discriminated schema + identity validation
- **AND** malformed v5 MUST 收集 conflict，MUST NOT fallback 到其他 legacy recognizer或被当作 post-E2 current shape

#### Scenario: unknown version 不降级

- **WHEN** historical object 声称未知 schemaVersion，或 bytes 同时/都不满足 post-E2 current shape与 bounded historical shape
- **THEN** Reader MUST fail closed
- **AND** MUST NOT 猜测最接近版本、静默丢弃 unknown fields 或动态注册新 reader

#### Scenario: post-E2 current shape 不新增 component version

- **WHEN** self-migration repository 已过 recognized E2 Change Checkpoint，或 fresh/downstream repository 由 current implementation 创建 new Standard Run
- **THEN** MUST 通过 current required structural fields识别该 shape
- **AND** E2 MUST NOT 为其新增 `Context v6`、`ActionPackage v3` 或新的 Context schemaVersion 数值

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

Reader MUST 从 review-* Run 重建 `ReviewVerdictFact`（`reviewRunId` + `verdict` + `reviewedRunId` + `blockingAuthorities`）。对 current schemaVersion 2 completed Review，`blockingAuthorities` MUST 从 Reviewer-owned `reviewFindings` 中 severity=`blocking` 的 `blockingAuthority` 派生、按固定 authority catalog 去重排序。`approved` MUST 投影空集合；`changes-requested` MUST 至少投影一个 authority。review-* Run 缺失 verdict、reviewed-Run linkage 或无法形成合法 blocking authority 时 MUST fail closed。

为保持 Q1 前 immutable terminal Review 可读，Reader MAY 对**已持久化且缺少 `blockingAuthority` 的旧 typed blocking finding**做有界 read compatibility：若旧 finding 含合法 `requiredChange`，MAY 仅在 Reader projection 中将其解释为 `author`；新 terminal publish MUST NOT 再省略 `blockingAuthority`。

#### Scenario: current review 重建 blocking authorities

- **WHEN** Reader 读取 completed schemaVersion 2 review-* Run
- **AND** `reviewVerdict=changes-requested`
- **AND** blocking findings 均有合法 `blockingAuthority`
- **THEN** MUST 重建 matching `ReviewVerdictFact`
- **AND** `blockingAuthorities` MUST 是当前 blocking findings authority 的 deterministic 去重集合

#### Scenario: approved Review authority 集合为空

- **WHEN** `reviewVerdict=approved`
- **THEN** `blockingAuthorities` MUST 为空
- **AND** blocking finding 不得存在

#### Scenario: 旧 immutable finding 缺 authority 有界映射为 author

- **WHEN** 已存在 terminal Review 的 blocking finding 缺失 `blockingAuthority`
- **AND** 其旧 schema 具有合法非空 `requiredChange`
- **THEN** Reader MAY 在 Policy projection 中映射为 `author`
- **AND** MUST NOT 回写或迁移原 result.json
- **AND** 新 terminal Review MUST NOT 使用该兼容形状

#### Scenario: 无法确定 authority 必须 fail-closed

- **WHEN** `changes-requested` Review 的 blocking finding 既无合法 `blockingAuthority` 又不满足旧 author-compatible 形状
- **THEN** MUST 收集 `FactConflict`
- **AND** MUST NOT 默认为 owner/verification/external 或任意推进

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

schemaVersion 2 `RunResultFile` MUST 只持久化执行、交接与恢复所需的 closed allowlist。completed review-* Run MAY 携带 Reviewer-owned `reviewVerdict` 与 typed `reviewFindings`；非 review Run MUST NOT 携带二者。新 terminal Review 的 blocking finding MUST 使用 `blockingAuthority: author | owner | verification | external`。`requiredChange` 仅用于 Author-actionable blocking finding；non-author blocker MUST NOT 伪造 Author requiredChange。

#### Scenario: reviewFindings 最小结构

- **WHEN** 新 completed review-* Run 写入 `reviewFindings`
- **THEN** 每项 MUST 包含非空 `id`、`title`、`problem`
- **AND** `severity` MUST 为 `blocking` 或 `non-blocking`
- **AND** `location` MAY 为非空 string
- **AND** blocking finding MUST 包含 `blockingAuthority ∈ {author, owner, verification, external}`
- **AND** non-blocking finding MUST NOT 参与 blocking authority projection

#### Scenario: author blocker 必须提供 requiredChange

- **WHEN** finding 为 `severity=blocking` 且 `blockingAuthority=author`
- **THEN** `requiredChange` MUST 为非空 string

#### Scenario: non-author blocker 不伪造 requiredChange

- **WHEN** finding 为 `severity=blocking` 且 `blockingAuthority ∈ {owner, verification, external}`
- **THEN** `requiredChange` MUST absent
- **AND** Author MUST NOT 通过修改 candidate 来伪造该 authority fact

#### Scenario: review verdict 与 findings 一致

- **WHEN** `reviewVerdict=changes-requested`
- **THEN** MUST 至少存在一个 blocking finding
- **AND** 新 terminal blocking finding MUST 具有合法 `blockingAuthority`
- **AND** `reviewVerdict=approved` 时 MUST 不存在 blocking finding

#### Scenario: 非 review Run 不复制 Reviewer payload

- **WHEN** Run Action 不是 review-*
- **THEN** `reviewVerdict` 与 `reviewFindings` MUST absent
- **AND** 如需消费 reviewer 结果 MUST 通过 review Run result reference / Reader projection

### Requirement: Core 拥有 ResultRef field-kind-path resolver

Core MUST使用唯一 resolver将 typed target descriptor映射为受控 logical path与kind。Caller MUST NOT提供任意 artifact path、ResultRef kind或versionFingerprint。对于 OpenSpec `spec-driven` planning artifacts，resolver MUST消费 C1 validated structured `changeRoot/artifactPaths/contextFiles`而不是重新拥有全局 `openspec/changes/<changeId>` physical layout rule；对于 Flowkit-owned Explore与Verification-owned Verification，resolver MAY在同一 validated `changeRoot`下派生固定owned filename。createRun、terminal preflight与Reader MUST复用同一 logical resolver语义。

#### Scenario: produced artifact 使用固定 Action+tag mapping

- **WHEN** Action为`explore`或`revise-explore`且tag=`explore`
- **THEN** Core MUST从C1 validated changeRoot派生`explore.md`
- **AND** MUST NOT要求OpenSpec artifact graph存在`explore` id
- **AND** Action为`propose`或`revise-propose`时只允许`proposal`、`design`、`specs`、`tasks`
- **AND**这些planning artifact path与`specs`完整namespace MUST来自当前C1 normalized OpenSpec structured view
- **AND** caller MUST NOT提供任意physical path缩小、替换或重写expected set
- **AND**其他Action MUST不允许 produced artifact tag

#### Scenario: 不允许的 tag 或 path authority 被拒绝

- **WHEN** caller提供不属于当前Action permitted set的tag
- **OR** caller尝试提供任意path、kind或versionFingerprint
- **THEN** MUST reject
- **AND** Run MUST不因此产生terminal result

#### Scenario: resolver 在 create preflight Reader 语义一致

- **WHEN**同一个descriptor在createRun、terminal preflight或Reader中解析
- **THEN** MUST得到同一canonical logical kind/path
- **AND**任一层发现C1 path/root identity非法 MUST fail closed

#### Scenario: Proposal bundle 使用 OpenSpec structured paths

- **WHEN** Action为`propose`或`revise-propose`
- **THEN** singleton proposal/design/tasks与完整specs namespace MUST来自当前C1 normalized OpenSpec planning view
- **AND** `specs`枚举 MUST与OpenSpec current structured state/context一致

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

每个 terminal `propose` 与 `revise-propose` Run MUST 由 Core 从**该 Action terminal 时的当前 OpenSpec state**重新派生完整 Proposal bundle，不得通过 predecessor ResultRef inheritance 或 caller changed-tag subset 构造 effective set。完整集合 MUST 包含 `proposal.md`、`design.md`、`tasks.md` 与当时完整 `specs/**` namespace。

#### Scenario: revise-propose 未声明 specs 且 namespace 未变化可继承

- **WHEN** initial `propose` terminal completion
- **THEN** Core MUST 派生 proposal、design、tasks 与完整 current `specs/**` refs
- **AND** singleton 缺失或 specs 枚举失败 MUST 阻止 terminal publication

#### Scenario: revise-propose 未声明 specs 但新增 spec 必须拒绝 terminal

- **WHEN** matching changes-requested review 后执行 `revise-propose`
- **THEN** Core MUST 在 terminal completion 重新读取当前 proposal、design、tasks 与完整 `specs/**`
- **AND** MUST 为完整 current bundle 派生新的 point-in-time refs
- **AND** MUST NOT 从 predecessor Run 继承未声明 artifact refs
- **AND** Caller MUST NOT 通过 changed-tag subset 缩小本次 produced set

#### Scenario: revise-propose 声明 specs 后 Core 绑定完整 successor namespace

- **WHEN** `propose` 或 `revise-propose` 准备 terminal publish
- **THEN** produced specs logical-ref set MUST 与当前 `specs/**` namespace 精确相等
- **AND** namespace 新增/删除 MUST 直接反映在本次完整 produced set
- **AND** MUST NOT 需要 revision-window 或 predecessor effective-set merge 才能表达该变化

#### Scenario: successor terminal 后 review entry 仍拒绝未绑定 namespace drift

- **WHEN** 创建或完成 `review-propose`
- **THEN** 被审查 producer Run 的完整 produced set MUST 与当前 proposal、design、tasks、`specs/**` bytes/namespace 精确匹配
- **AND** mismatch MUST fail closed

### Requirement: review Run 必须精确绑定被审查 result 内容

review-* Run MUST 通过 Core-derived `context.inputRef` 精确绑定 `reviewedRunId` 的实际 terminal `result.json`。该 immutable binding 在 review entry 与 completion 都 MUST 保持一致。`review-explore` / `review-propose` 还 MUST 在 entry 与 completion 对被审查 producer Run 的完整 OpenSpec artifact 输出做 current exact binding；`review-apply` 不因此获得 Proposal/OpenSpec historical replay authority，但 MUST 通过 Core-owned `context.verificationInputRef` 精确绑定 entry 时的 current `verification.md`，并在 completion 重验同一 generation。

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

- **WHEN** Reader 读取 current Policy projection 中 schemaVersion 2 review-* Run
- **AND** inputRef 缺失、目标与 reviewedRunId 不一致、目标不可读或 fingerprint 不匹配
- **THEN** MUST 收集 `FactConflict`
- **AND** MUST NOT 构造有效 `ReviewVerdictFact`

#### Scenario: review Run 不允许自引用 reviewVerdictRef

- **WHEN** Action 为 review-*
- **THEN** `actionResult.reviewVerdictRef` MUST absent
- **AND** reviewer verdict/findings MUST 直接使用 typed top-level payload
- **AND** MUST NOT 构造引用当前 result.json 自身 SHA-256 的 ResultRef

#### Scenario: review-explore 与 review-propose 精确绑定当前 artifact 输出

- **WHEN** 创建或完成 `review-explore` / `review-propose`
- **THEN** `reviewedRunId` MUST 指向该 stage 当前最新 completed producer Run
- **AND** 该 producer 的完整 produced refs MUST 与 current OpenSpec artifact bytes 精确匹配
- **AND** `review-propose` MUST 同时验证 current `specs/**` namespace exact-set
- **AND** mismatch MUST 阻止 entry 或 terminal publication

#### Scenario: review-apply 以 verificationInputRef 绑定 entry-time verification

- **WHEN** 创建 `review-apply`
- **THEN** MUST exact-bind reviewed Apply/Revise-Apply terminal result
- **AND** Core MUST 从 current `verification.md` 派生 `context.verificationInputRef`
- **AND** Caller MUST NOT 提供该 ref 的 path/kind/fingerprint
- **AND** `verificationInputRef` MUST 只允许存在于 `review-apply` context
- **AND** MUST NOT 因此新增 Proposal bundle generation registry、archive path resolver 或 historical OpenSpec mutable ref replay

#### Scenario: review-apply completion 检测 verification drift

- **WHEN** pending `review-apply` 在 completion 前 current `verification.md` 与 persisted `verificationInputRef` 不匹配
- **THEN** completion MUST fail closed
- **AND** reviewer terminal result/verdict MUST 不发布
- **AND** Run MUST 保持 pending

### Requirement: Run completion preflight 在 terminal publish 前验证所有引用

`writeRunResult` MUST 在 terminal serialization/temp-file/fs.link 之前验证**当前 Run 本次发布所需**的 Core-created references 与 Action-owned complete output set。preflight MUST NOT 扫描并重新验证其他 historical Runs 的 mutable artifact/verification refs。失败 MUST 保持当前 Run 为 pending，且 MUST NOT 削弱既有 `assertMutable + fs.link` terminal create-once 协议。

#### Scenario: preflight 成功后才进入 terminal publish

- **WHEN** 当前 Run 所需 immutable targets 存在、可读且 fingerprint 匹配
- **AND** artifact-producing Run 的本次完整 Action-owned output set 已从 current OpenSpec state 派生并验证
- **THEN** `writeRunResult` MAY 进入 serialize → temp → fs.link
- **AND** 既有 create-if-not-exists 并发协议 MUST 保持

#### Scenario: target 缺失保持 pending

- **WHEN** 当前 Run 本次 terminal contract 必需的目标缺失或不可读
- **THEN** MUST 返回 `RESULT_REF_TARGET_MISSING`
- **AND** MUST NOT 写 terminal result.json
- **AND** 同一 Run MUST 保持 pending

#### Scenario: fingerprint mismatch 保持 pending

- **WHEN** 当前 Run 本次需要 exact binding 的 immutable/current-review ResultRef 与真实目标 SHA-256 不一致
- **THEN** MUST 返回 `RESULT_REF_MISMATCH`
- **AND** MUST NOT 写 terminal result.json
- **AND** 同一 Run MUST 保持 pending

#### Scenario: historical mutable ref 不属于当前 completion preflight

- **WHEN** 当前 Run terminal completion
- **THEN** preflight MUST NOT 为完成当前 Run扫描其他 historical Runs 的 produced-artifact / verification-summary refs
- **AND** MUST NOT 要求 predecessor effective-set inheritance 或 generation classification

#### Scenario: terminal Run 仍不可重开

- **WHEN** result.json 已存在且 Run 为 terminal
- **THEN** 既有 `assertMutable` / `fs.link` 规则 MUST 拒绝再次完成
- **AND** terminal Run MUST NOT 恢复为 pending

### Requirement: Reader 必须按当前 Policy relevance 选择 Run scope

Reader MUST 在解析 Run 内容前根据 Delivery Manifest 选择 current Policy relevance。最多一个 `state=active` Change 的 Change-level Run 目录进入 current Run/Review projection。历史 Delivery-level Run MUST NOT 进入 current Policy Run projection；Delivery Full Test / Finalize 事实继续来自 Delivery Manifest、Owner authorization、Verification 与 Git authority。历史 Delivery-level Run MAY 仅由 bounded legacy reader/Run-ID enumeration 使用。

#### Scenario: active Change 只投影自身 Runs

- **WHEN** Manifest 中 Q1 completed、Q2 active、E1 planned
- **THEN** Reader MUST 将 Q2 Run 目录作为 Change-level Policy input
- **AND** MUST NOT replay Q1/E1 Change-level Run corpus 作为 Q2 lineage/conflict input

#### Scenario: historical Delivery Run 不决定 Delivery behavior

- **WHEN** current active Delivery 的 Run tree 含历史 `full-test` / `delivery-finalize` Run
- **THEN** MUST NOT 把该 Run 加入 current `snapshot.runs`
- **AND** MUST NOT 因该 Run 推导 Full Test / Finalize next behavior

#### Scenario: 无 active Change 时 completion/checkpoint 来自 Manifest/Git

- **WHEN** 当前不存在 active Change
- **THEN** Change completion/dependency/checkpoint facts MUST 来自 Manifest/Git authority
- **AND** MUST NOT replay completed Change 或 historical Delivery Run corpus 重新证明这些事实

### Requirement: Run pending 只表示 non-terminal execution status

`pending` MUST 只表示 Run 已创建但 terminal `result.json` 尚未发布。Action 与 Change MUST NOT 获得 `pending` 主状态；Reader/persistence MUST NOT 从 pending 推导 artifact revision-window、generation ownership 或 external authority lifecycle。

#### Scenario: pending Run 只需要 non-terminal context

- **WHEN** Run 有合法 `action.md/context.json` 且 result.json 不存在
- **THEN** Run MUST 投影为 `pending`
- **AND** MUST NOT 要求 terminal-only actionResult / reviewVerdict / ResultRef

#### Scenario: pending revise 不创建 artifact revision-window authority

- **WHEN** matching review 后创建 pending `revise-explore` / `revise-propose` / `revise-apply`
- **THEN** pending 只表示该 Revision 尚未 terminal
- **AND** Reader MUST NOT 因此建立 `revision-window` generation class
- **AND** historical mutable refs 本来就 MUST NOT 被持续绑定 current path

### Requirement: Review 到下一 Action 必须保留最小 current exact handoff

删除 historical mutable replay 时，Flowkit MUST 仍保证下一 Action 消费的是刚刚被 Review 覆盖的 current generation。该校验 MUST 在下一 Action 的 pending Run 正式 publish 前由 Core 完成；Action-owned 合法 mutation MAY 只在该 entry check 成功后发生。该机制 MUST 是局部 handoff，不得恢复 global generation registry。

对于 `propose`、`apply`、`archive`，Q2 MUST NOT 强制新增 `sourceReviewRun/sourceReviewVerdict` tuple；它们 MUST 使用本次 Action 的 `consumedRunId` 指向实际消费的 completed Review，Core MUST 读取真实 Review verdict/context/reviewedRunId 并完成 handoff 校验。

#### Scenario: approved review-explore 到 propose 的 current handoff

- **WHEN** `propose` 消费 completed approved `review-explore`
- **THEN** pending publish 前 Core MUST 追到该 Review 的 `reviewedRunId`
- **AND** current `explore.md` MUST 与被审 explore generation 精确匹配
- **AND** drift MUST 阻止 propose Run publish
- **AND** entry 成功后 propose MAY 创建/修改其 Action-owned Proposal artifacts

#### Scenario: changes-requested review-explore 到 revise-explore 的 current handoff

- **WHEN** `revise-explore` 消费 matching changes-requested `review-explore`
- **THEN** pending publish 前 current `explore.md` MUST 仍与被审 generation 精确匹配
- **AND** entry 成功后 revise-explore MAY 修改 `explore.md`

#### Scenario: review-propose 到 apply 或 revise-propose 的 current handoff

- **WHEN** `apply` 消费 approved `review-propose` 或 `revise-propose` 消费 matching changes-requested `review-propose`
- **THEN** pending publish 前 current `proposal.md + design.md + tasks.md + specs/**` MUST 与被审 proposal generation 精确匹配
- **AND** specs namespace MUST exact-set
- **AND** drift MUST fail closed
- **AND** entry 成功后当前 Action MAY 仅按自身 ownership 执行合法 mutation

#### Scenario: review-apply 到 revise-apply 或 archive 的 current handoff

- **WHEN** `revise-apply` 消费 changes-requested `review-apply` 或 `archive` 消费 approved `review-apply`
- **THEN** pending publish 前 Core MUST exact-bind该 Review immutable result
- **AND** current `verification.md` MUST 与该 completed Review 的 terminal `verificationSummaryRef` 精确匹配
- **AND** archive 的该检查 MUST 发生在调用 OpenSpec archive 之前
- **AND** OpenSpec archive 成功后 MUST NOT 再做 relocation/path replay

#### Scenario: review 后下一 Action 前发生 drift 必须阻止旧 verdict 被复用

- **WHEN** Review terminal 后、下一 Action pending publish 前，被 Review 覆盖且仍要求保持不变的 current artifact/verification bytes 发生变化
- **THEN** Core MUST fail closed
- **AND** MUST NOT 用旧 approved/changes-requested verdict 推进新的 generation
- **AND** MUST NOT 通过 global historical replay 实现该检查

### Requirement: Revision Run 必须精确绑定 matching changes-requested source review

`revise-explore`、`revise-propose`、`revise-apply` MUST 通过 `sourceReviewRun` + `sourceReviewVerdict=changes-requested` 绑定 matching stage 的 completed Reviewer result，并且该 Review 的 current blocking authority projection MUST 为 author-only。该 lineage 只用于保证 Author 修订的是正确 reviewed target；non-author blocker MUST NOT 创建 Revision Run。

#### Scenario: matching author-only source review 才允许 Revision

- **WHEN** 创建或读取 `revise-<stage>` Run
- **THEN** `sourceReviewRun` MUST 指向 matching completed `review-<stage>`
- **AND** source review verdict MUST 为 `changes-requested`
- **AND** source review 的 `reviewedRunId` MUST 对应当前 stage producer Run
- **AND** source review 的 blocking authorities MUST 非空且全部为 `author`
- **AND** 任一 mismatch 或 non-author authority MUST fail closed

#### Scenario: non-author blocker 不建立 source revision tuple

- **WHEN** matching Review 的任一 blocking authority 为 `owner`、`verification` 或 `external`
- **THEN** MUST NOT 创建 `revise-*` Run
- **AND** MUST NOT 用 `sourceReviewRun/sourceReviewVerdict` 伪装 authority resolution

### Requirement: review-apply 必须区分 entry verification binding 与 terminal point-in-time summary

`review-apply` create entry MUST 由 Core 从 current `verification.md` 派生 `context.verificationInputRef`，用于冻结本次 Review 实际审查的 Verification generation；completion MUST exact-check persisted input ref。只有 completed `review-apply` MAY 新建 `verificationSummaryRef`，其 fingerprint MUST 由 Core 从 terminal 时当前 `verification.md` bytes 派生。`verificationInputRef` 与 `verificationSummaryRef` 都不得形成跨后续 Revision/Archive 的 global generation authority。

#### Scenario: review-apply entry 记录可 resume 的 verification binding

- **WHEN** 创建 `review-apply`
- **AND** current `verification.md` 存在且可读
- **THEN** Core MUST 在 context 写入 `verificationInputRef`
- **AND** versionFingerprint MUST 来自 entry 时当前 bytes
- **AND** Caller MUST NOT 提供该 ref

#### Scenario: review-apply terminal 记录当前 verification summary

- **WHEN** `review-apply` completed
- **AND** current `verification.md` 仍与 `verificationInputRef` 精确匹配
- **THEN** Core MUST 构造 `kind=verification-summary` 的 point-in-time ResultRef
- **AND** versionFingerprint MUST 来自 terminal 时当前 bytes

#### Scenario: review-apply 缺 verification record 保持 pending

- **WHEN** `review-apply` create/completion 所需 current `verification.md` 不存在或不可读
- **THEN** MUST 返回当前 Action contract 的 target-missing error
- **AND** review-apply MUST 不发布 terminal result

#### Scenario: review 期间 Verification drift 保持 pending

- **WHEN** `review-apply` 已 pending
- **AND** current `verification.md` 与 persisted `verificationInputRef` 不匹配
- **THEN** completion MUST 返回 mismatch error
- **AND** MUST NOT 发布 verdict/result
- **AND** 同一 Run MUST 保持 pending，可在恢复正确 generation 后继续 completion

#### Scenario: 后续 Verification 更新不反向使历史 ref 冲突

- **WHEN** completed Review 之后合法 `revise-apply` 更新 `verification.md`
- **THEN** 旧 `verificationInputRef` / `verificationSummaryRef` MUST 保持 point-in-time 历史记录
- **AND** Reader MUST NOT 将新 bytes 与旧 fingerprint 比较并产生 historical `FactConflict`

#### Scenario: 其他 Action 不拥有 verification binding/summary

- **WHEN** Action 不是 `review-apply`
- **THEN** `context.verificationInputRef` MUST absent
- **AND** `apply`、`revise-apply`、`archive` 的 `verificationSummaryRef` MUST absent
- **AND** archive MUST NOT 为 historical ref 引入 archive-aware resolver

### Requirement: Reader 投影 current Explore 与 Verification artifact

FormalFactSnapshot 的 OpenSpec-adjacent formal artifact projection MUST支持`change-explore`与`change-verification`两种artifact kind，并只表达 current validated changeRoot下对应 owned file的存在性与repository-relative logical path。Reader MUST NOT把这两个文件伪装成 default `spec-driven` artifact graph node，也 MUST NOT为此建立artifact history registry或从historical ResultRef重建current path。

#### Scenario: Explore artifact 存在

- **WHEN** active Change的C1 validated changeRoot存在`explore.md`
- **THEN** `openSpecArtifacts` MUST包含kind=`change-explore`、对应repository-relative path且exists=true的fact
- **AND** OpenSpec graph status MAY仍只包含proposal/specs/design/tasks

#### Scenario: Verification artifact 存在

- **WHEN** active Change的C1 validated changeRoot存在`verification.md`
- **THEN** `openSpecArtifacts` MUST包含kind=`change-verification`、对应repository-relative path且exists=true的fact
- **AND**该fact的业务truth MUST继续来自Verification authority

#### Scenario: artifact 不存在只表达 current absence

- **WHEN** current validated changeRoot不存在目标Explore或Verification artifact
- **THEN**对应fact MUST表达exists=false
- **AND** Reader MUST NOT扫描historical Run producedResultRefs寻找替代current artifact

#### Scenario: current C1 self-archive relocation窗口不得误切 structured Reader

- **WHEN** current C1 archive已经把C1 delta merge到canonical specs并relocate active changeRoot
- **AND** Flowkit Manifest中的C1仍为`active`，archive terminal result尚待admission
- **THEN** Reader MUST NOT仅因canonical C1 capability spec存在就调用OpenSpec status查询已relocated的active C1
- **AND** current C1 archive recovery/admission MUST继续从durable archive guard/terminalObservation与Flowkit formal lifecycle facts收口
- **AND** C1 completed后 future Change MAY进入normal structured Reader path

### Requirement: Change Verification status 从 verification.md 的最小 marker 投影

Active Change 的 `verification.md` MUST 使用单一机器可读 marker `<!-- flowkit-change-verification-status: <status> -->` 表达总体 Change Verification 状态，其中 `<status>` MUST 为 `not-run | passed | failed | not-applicable`。Reader MUST 从该 canonical Verification record 投影 `FormalFactSnapshot.changeVerificationStatus`，且只投影状态，不复制检查列表、日志或完整摘要。Verification record 仍是该事实 authority；Run 引用不得替代它。

#### Scenario: passed marker 投影为 passed
- **WHEN** active Change `verification.md` 包含唯一 marker `<!-- flowkit-change-verification-status: passed -->`
- **THEN** `snapshot.changeVerificationStatus` MUST 为 `passed`

#### Scenario: not-applicable marker 投影为 not-applicable
- **WHEN** active Change `verification.md` 包含唯一合法 `not-applicable` marker
- **THEN** `snapshot.changeVerificationStatus` MUST 为 `not-applicable`

#### Scenario: verification.md 尚不存在
- **WHEN** active Change current canonical path 尚无 `verification.md`
- **THEN** `snapshot.changeVerificationStatus` MUST 为 undefined
- **AND** MUST NOT 产生仅由“尚未执行 Verification”导致的 FactConflict

#### Scenario: verification.md 存在但 marker 缺失
- **WHEN** active Change `verification.md` 已存在但没有 status marker
- **THEN** Reader MUST 收集 `change-verification-status` FactConflict
- **AND** MUST NOT 从正文、Run、聊天或文件名猜测状态

#### Scenario: marker 重复或状态非法
- **WHEN** active Change `verification.md` 包含多个 status marker或 marker 值不属于 VerificationStatus
- **THEN** Reader MUST 收集 `change-verification-status` FactConflict
- **AND** MUST NOT 自动选择任一值

#### Scenario: Run verificationSummaryRef 不替代 marker authority
- **WHEN** historical Run result 引用了 `verification.md`
- **AND** current `verification.md` status marker 与历史摘要不同
- **THEN** current Change Verification status MUST 以 current canonical `verification.md` marker 为准
- **AND** historical ResultRef 仍只保持 point-in-time 语义

### Requirement: Active Change Tasks completion 从 canonical tasks.md 最小投影

Reader MUST 只从当前 active Change canonical `tasks.md` 投影 `FormalFactSnapshot.changeTasksComplete?: boolean`。该字段 MUST 只表达 required Markdown task checkbox 是否全部完成，不得携带 task registry、task owner、task execution history 或第二套 Task 状态。`tasks.md` 不存在时 completion fact MUST 为 undefined；存在时，任一 required `[ ]` task MUST 投影为 false，全部 required task 为 `[x]/[X]` MUST 投影为 true；没有 required checkbox 时 MUST 按空集合全部完成投影为 true。

#### Scenario: 所有 required tasks 已完成
- **WHEN** active Change `tasks.md` 中所有 required task checkbox 均为 `[x]` 或 `[X]`
- **THEN** `snapshot.changeTasksComplete` MUST 为 true

#### Scenario: 仍有 required task 未完成
- **WHEN** active Change `tasks.md` 至少包含一个 `[ ]` required task
- **THEN** `snapshot.changeTasksComplete` MUST 为 false

#### Scenario: tasks.md 不存在
- **WHEN** active Change canonical path 不存在 `tasks.md`
- **THEN** `snapshot.changeTasksComplete` MUST 为 undefined
- **AND** Reader MUST NOT 从 Run、聊天、Verification record 或 artifact existence 推断 completion

#### Scenario: 不建立第二套 Tasks authority
- **WHEN** Reader 投影 Tasks completion
- **THEN** MUST NOT 创建 Task Registry、Task 状态数据库或 Task execution engine
- **AND** `tasks.md` MUST 保持 current required Tasks 的唯一 OpenSpec authority

### Requirement: Reader 必须从 Delivery Manifest ownerDecisions 投影 typed Owner facts

FormalFactReader MUST 把 active Delivery Manifest 的有效 `ownerDecisions` 作为 Owner authority source，并投影 Policy 所需的最小 typed authorization fact。Projection MUST 保留 `ref`、decision、deliveryId 与可选 canonical changeId，并对 malformed、unknown decision、Delivery mismatch、unknown Change target 收集 FactConflict。Run `ownerAuthorization` 字符串 MUST NOT 进入该 projection。

#### Scenario: cross-Change authorization 不泄漏
- **WHEN** Manifest 中存在 `authorize-apply` record 且 `changeId=A1-id`
- **AND** current Change 为 `B1-id`
- **THEN** Reader/Policy MUST NOT 把该 record 当作 B1 apply authorization

#### Scenario: historical Run owner string 不投影
- **WHEN** Q1 历史 Run 只有 `ownerAuthorization: explicit`
- **THEN** ownerAuthorizations projection MUST 不因此新增 fact

### Requirement: Manifest persistence 必须支持 bounded structured mutation

A1 persistence MUST 支持：创建 minimal Delivery Manifest、向 existing active Manifest 追加 planned Change、追加 Owner decision record、以及把唯一 target Change state 从 planned 改为 active。Existing Manifest mutation MUST 基于唯一 structured spans/indentation contract，只改 owned bytes并 preserve 其它 section；ambiguous/duplicate/unsupported owned shape MUST fail closed。最终文件 MUST atomic publish。

#### Scenario: existing Manifest round-trip 保留未知 section
- **WHEN** existing Manifest 含 A1 parser 不消费的合法 top-level section
- **AND** 只记录 Owner decision 或激活 Change
- **THEN** unknown section MUST 保持不变

### Requirement: Owner decision ref 必须 deterministic 且 idempotent

Persistence MUST 从 normalized decision tuple 派生 content-hash `ref`。相同 tuple 的重复写入 MUST 不产生第二条 record；同一 ref 若对应不同 decoded content MUST 作为 conflict/failure 处理。A1 MUST NOT 用时间戳或随机数作为 authority identity prerequisite。

#### Scenario: retry 相同 decision
- **WHEN** 同一 delivery/change/decision/sourceRef record 已存在
- **THEN** write MUST 返回同一 ref
- **AND** Manifest record 数量 MUST 不增加

### Requirement: Reader 与 Manifest writer 必须保留 Change architectureImpact，并将 legacy compatibility 限定到 exact identity set

A1 Manifest parser/writer MUST 把 Change `architectureImpact` 作为 supported owned Change field：create Delivery initial Changes 与 createChange MUST 写入 boolean 值，Reader MUST 投影到正式 Change fact/read model；existing Manifest mutation MUST 保留既有值。

为避免 Base `448fa042de86d07e893bcc51da528f93eb7ced3a` 的 pre-A1 manifests 在 A1 Apply 后 self-brick，Reader MAY 对 Proposal 冻结的 exact `(deliveryId, Change.id)` legacy identity set 接纳缺失字段，但 MUST 将其投影为 explicit `unknown / pre-a1-legacy-missing`，不得合成 boolean。Compatibility MUST 由 source-controlled static identity set 判定，不得使用“字段缺失”“日期”“Change state”或 fuzzy manifest shape 自动纳入。任何 set 外的 missing/malformed required `architectureImpact` MUST fail closed。

#### Scenario: activation 不改变 architectureImpact
- **WHEN** planned Change 已持久化 `architectureImpact=false`
- **AND** activation 只执行 owner record + `planned → active`
- **THEN** Manifest 中 architectureImpact MUST 保持 false
- **AND** reload 后 ChangeFact MUST 仍为 false

#### Scenario: legacy Change activation 保留 missing
- **WHEN** exact pre-A1 legacy identity 的 planned Change 没有 `architectureImpact`
- **AND** activation 只更新 Owner provenance 与 state
- **THEN** Manifest writer MUST 保留该字段缺失
- **AND** Reader MUST 继续返回 explicit unknown/legacy-missing
- **AND** MUST NOT opportunistic backfill `true` 或 `false`

#### Scenario: copied legacy shape 不获得 compatibility
- **WHEN** future/new Change 不在 exact legacy identity set
- **AND** 其 item 复制 pre-A1 shape 且缺少 `architectureImpact`
- **THEN** Reader MUST 产生 conflict/failure
- **AND** MUST NOT 因 shape 相似而接纳

### Requirement: Authorization-only record 写入必须先通过 current Policy gate admission

Persistence/service 在写入 authorization-only Owner record 前 MUST 使用 fresh FormalFactSnapshot 调用 shared Policy，并验证 current result 正在请求相同 decision 与 canonical target。Mismatch、stale、early 或 current facts conflict MUST fail closed，且不得先写 record 再验证。该 admission MUST 与 deterministic Owner record idempotency 分离：已存在同一 record 也不能把不再合法的 current gate重新解释为新的 authority write。

#### Scenario: stale authorization 不写 Manifest
- **WHEN** current Policy owner-decision 与请求写入的 decision/target 不匹配
- **THEN** persistence operation MUST fail before atomic publish
- **AND** Manifest MUST 保持不变

### Requirement: Current Run create path 必须 defense-in-depth 强制 Run-ID 与 Action→Role

Current Standard Run persistence MUST在publish前验证完整 Run-ID grammar、Delivery-wide NNN monotonic/uniqueness、Run-ID action suffix与 formal Action一致，以及 Action→Role匹配。即使内部 caller直接调用低层 create primitive，也 MUST NOT能够创建 malformed/non-monotonic/duplicate NNN或错误 role的 current Run。Historical legacy Runs仍只 bounded read，不迁移重写。

#### Scenario: 低层 malformed Run-ID 被拒绝
- **WHEN** internal caller直接请求创建 `runId=not-a-run-id`
- **THEN** persistence MUST fail before pending publish

#### Scenario: Delivery-wide duplicate NNN 被拒绝
- **WHEN**另一个 Change目录已经存在同一 Delivery NNN
- **THEN** current Run create MUST拒绝candidate

### Requirement: ContextFile 必须持久化 compact semantic input fingerprint

Current schemaVersion 2 pending Run context MUST保存由B1 preparation Core-derived的semantic input fingerprint，且Reader/serialization MUST验证其shape。Fingerprint descriptor必须至少绑定完整ActionDefinition identity/version与全部versioned `contractRefs` identity，并遵守B1 inclusion/exclusion rule。Fingerprint仅作为same-pending execution identity，不成为OpenSpec/Review/Verification/Owner authority或全package hash store。

#### Scenario: pending reload保留semantic identity
- **WHEN** repository checkout/resume读取一个B1 prepared pending Run
- **THEN** Reader MUST恢复同一semantic input fingerprint
- **AND** preparation MUST能据此判定resume或input drift

### Requirement: Terminal admission 必须继续通过 completeRun/Core-owned ResultRef

B1 logical result admission MUST复用 current `completeRun`/result-ref resolver/serialization validators。Caller MUST NOT获得直接指定 runRef、ResultRef kind/path/fingerprint或缩小required produced artifact set的能力。

#### Scenario: B1 admission不创建第二套 result writer
- **WHEN** logical Action Result被接纳
- **THEN** terminal `result.json` MUST仍由existing Core terminal publish path产生
- **AND** first terminal writer MUST继续 wins/create-once

### Requirement: pending resume 必须对 contract generation drift fail closed

Persistence/Reader恢复pending Run后，B1 preparation重新派生semantic descriptor时 MUST使用current contractRefs identity/version。若与stored fingerprint不同，MUST保留原pending bytes并返回input-drift diagnosis；MUST NOT重写stored fingerprint或发布第二pending Run。

#### Scenario: contractRef drift 不被 checkout/resume 吞掉
- **WHEN** checkout后pending Run的stored fingerprint对应旧contractRef版本
- **AND** current contractRef versionFingerprint已变化
- **THEN** resume MUST fail closed
- **AND** pending context/result MUST保持未改写

### Requirement: pending archive 必须持久化 crash-safe mutation recovery guard

Current `ContextFile` MAY仅对 `action=archive` 增加 machine-owned `archiveMutationGuard` operational field。该 field MUST与 immutable Run entry identity分离：`runId/deliveryId/changeId/action/role/Owner/Review/Verification refs/semanticInputFingerprint` 等既有字段 MUST NOT因 archive attempt/recovery 被改写；guard MUST NOT进入 B1 semantic fingerprint。Persistence MUST提供 atomic compare-and-set，且只有 C1 archive invocation/recovery seam MAY修改 guard。

Guard shape MUST至少表达：

```text
state: armed | recovery-admitted
surfaceVersion: openspec-archive-mutation-v1
changeRoot: validated repo-relative active Change root
canonicalSpecsRoot: openspec/specs
archiveNamespaceRoot: validated repo-relative changes/archive root
preArchiveGenerationFingerprint: SHA-256
terminalObservation?: normalized typed success | failure observation + canonical fingerprint
```

`armed` MUST在 child spawn 前 durable publish。Child spawn后若得到可接纳structured terminal success/failure，C1 MUST在任何terminal/recovery classification前 atomic persist bounded `terminalObservation`；该 observation 与guard一样属于machine-owned operational field，不进入B1 semantic fingerprint或V1。只要 `armed` 存在且当前 Run仍pending，Reader/preparation/diagnostics MUST从 durable observation（若有）+ current V1投影分类，而不是依赖当前 process memory。

#### Scenario: pre-spawn arm 在 process crash 后仍阻止第二次 archive

- **WHEN** pending archive 在 spawn 前已 atomic persist `archiveMutationGuard.state=armed`
- **AND** process/session随后终止，无法证明 child是否已经执行mutation
- **THEN** checkout/resume MUST恢复同一 guard 与同一 pending Run
- **AND** prepare/inspect MUST NOT把该 Run投影为普通 resumable
- **AND** archive invocation MUST NOT spawn第二次OpenSpec archive

#### Scenario: structured failure after mutation 必须 durable 保存 terminal observation

- **WHEN** archive child已经spawn并返回可接纳structured terminal failure
- **THEN** C1 MUST在post-V1 classification/terminal收口前atomic persist normalized failure terminalObservation
- **AND**若current V1与stored F不同，result.json MUST仍不存在且同一pending archive guard MUST保持durable
- **AND**新process/session MUST从 persisted failure observation + current V1 drift投影 recovery-required
- **AND** exact recovery到F后 MUST从同一failure observation terminal failed且 MUST NOT respawn

#### Scenario: guard mutation 不改写 Run semantic identity

- **WHEN** C1将 fresh archive guard原子写为`armed`、持久化terminalObservation，或将真正outcome-unknown exact recovery后的`armed`写为`recovery-admitted`
- **THEN** ContextFile 的 entry identity fields与stored `semanticInputFingerprint` MUST保持不变
- **AND** guard MUST NOT成为Action Package semantic authority
- **AND** input-drift path MUST NOT借机改写guard或entry fields

#### Scenario: exact OpenSpec generation proof 才能 recovery-admit

- **WHEN** pending archive guard为`armed`
- **AND** recovery flow按 stored `surfaceVersion`重新计算 `OpenSpecArchiveMutationSurfaceV1`
- **THEN** current fingerprint MUST先 exact-match stored `preArchiveGenerationFingerprint`
- **AND**若存在durable failure terminalObservation，MUST从该observation重新分类为failure + same并terminal failed，MUST NOT transition为`recovery-admitted`
- **AND**只有不存在terminalObservation的真正outcome-unknown MAY atomic transition为`recovery-admitted`
- **AND** V1 MUST覆盖 active `changeRoot` 全目录/regular-file exact bytes、canonical `openspec/specs/**` 全树，以及 `changes/archive` immediate child name/type collision namespace
- **AND** `.flowkit/.git/node_modules/dist` 与其它无关 repo 环境 MUST NOT进入该 proof
- **AND** symlink或unsupported entry在任何被纳入surface的位置 MUST fail closed
- **AND** B1 semantic fingerprint匹配本身 MUST NOT替代该 byte-generation proof

#### Scenario: guard 自身持久化不得改变 recovery proof

- **WHEN** C1 对 fresh pending archive 计算 `OpenSpecArchiveMutationSurfaceV1` 得到 F
- **AND** 仅把 `archiveMutationGuard(state=armed, F)` 原子写入 `.flowkit/runs/**/context.json`
- **THEN** 再次计算 V1 MUST仍得到 F
- **AND** 若 guard 写入导致 fingerprint变化，C1 MUST fail closed before spawn

#### Scenario: retry spawn 前必须重新 arm

- **WHEN**同一 pending archive 已处于`recovery-admitted`
- **AND** guard不存在terminalObservation
- **AND** C1准备重新调用OpenSpec archive
- **THEN** invocation MUST再次确认 current mutation-surface fingerprint仍匹配
- **AND** MUST在 spawn 前 atomic transition回`armed`
- **AND** crash发生在该arm之后 MUST再次要求exact recovery

### Requirement: Reader 必须验证并投影 bounded current Contract Reset facts

FormalFactReader MUST从 Delivery Manifest `ownerDecisions`验证 `contract-reset` structured records、deterministic ref、Delivery/Change target、scope与 requiredOutcomes。Malformed/unknown/cross-Change records MUST产生 FactConflict。对于每个 `(deliveryId, changeId, scope)`，Reader MUST只投影 latest valid Contract Reset作为 current bounded Owner fact，同时保留既有 `ownerAuthorizations` projection供 Policy authorization gates使用。

Run `ownerAuthorization`、context owner projection或聊天文字 MUST NOT创建新的 Owner fact。

#### Scenario: latest same-scope Reset 被投影
- **WHEN**同一 active Change/scope存在两条 valid Contract Reset records
- **THEN** Reader MUST把 Manifest 中 latest valid record投影为 current Contract Reset
- **AND** earlier record MUST NOT作为 current Action semantic fact重复投影

#### Scenario: context projection 不反向升级 authority
- **WHEN**历史或 current `context.json` 含 `ownerFactRefs`
- **BUT** Manifest不存在对应 valid Owner record
- **THEN** Reader MUST NOT由 context创造 Owner authority

### Requirement: current context.json 必须携带 bounded applicable Owner fact projection

D1之后新创建的 current Standard Run context MUST使用 `schemaVersion: 3`，并 MAY携带 machine-owned `ownerFactRefs`，每项仅保存 current Action applicable Contract Reset 的 bounded verified projection：`ref / decision / deliveryId / changeId / scope / requiredOutcomes / sourceRef`。

`ownerFactRefs` MUST是 execution input projection而不是 Owner authority store；其内容 MUST能从 current Manifest formal facts重新验证。Historical context schemaVersion 1/2 MUST继续 read-only compatibility，D1 MUST NOT迁移重写 completed Run context。

#### Scenario: detached Reviewer reload Owner fact
- **WHEN** Reviewer在新的 detached session读取一个 D1之后准备的 Run context
- **AND** Manifest含 matching current Contract Reset
- **THEN** context MUST提供 bounded ownerFactRefs以支持 handoff
- **AND** Reader MUST仍以 Manifest record作为 authority validation source

### Requirement: Review Result persistence 必须支持 versioned Finding v2 与 convergence

RunResultFile MUST允许 D1 `reviewFindingSchemaVersion: 2`、complete `reviewFindings` 与 `reviewFindingConvergence` closed fields，并在 terminal publish前验证 Finding v2、ID uniqueness、verdict integrity与 convergence关系。D1之后新 completed `review-*` writer MUST写 version 2。

缺少 `reviewFindingSchemaVersion` 的 existing Q1 transitional Review Result MUST继续使用现有 v1 shape read-only admission；D1 MUST NOT用新 writer继续创建 unversioned v1 findings。

#### Scenario: existing transitional Reviewer Result 仍可读取
- **WHEN** repository包含 D1 Apply之前已完成且无 finding schema version 的 review Run
- **THEN** Reader MUST继续读取其 verdict/blockingAuthority transitional facts
- **AND** MUST NOT要求修改该 completed result.json

#### Scenario: new Review 必须写 v2
- **WHEN** D1 implementation生效后新的 `review-*` terminal result被提交
- **THEN** Core writer MUST输出 `reviewFindingSchemaVersion: 2`
- **AND** MUST拒绝新写 transitional `requiredChange`-only finding

### Requirement: Reader 必须重建 reset-aware current Review 与近邻 convergence authority

Reader MUST以 reviewed producer binding、Run prepared Contract Reset identity与 current Manifest Reset identity共同判断 Review 是否仍是 current lifecycle Review。只有 identity匹配的 current Review verdict/blockingAuthorities可以进入 Policy projection；mismatch 的 completed Review继续保留历史事实但不得继续充当 current approval。

Finding full payload与 convergence relationship MUST保持 Reviewer Result-owned；FormalFactSnapshot MAY提供 B1/Reviewer handoff所需的 bounded exact refs/identity，但 MUST NOT复制 evidence corpus为 Policy state。previous convergence baseline MUST由 actual producer/review lineage解析，不得仅按同 stage latest completed Review扫描。

#### Scenario: resolved finding 不继续阻塞 Policy
- **WHEN** previous Review有 blocking finding
- **AND** latest matching Review v2将其 convergence标记 resolved且 current findings已无该 blocker
- **THEN** Policy projection MUST使用 latest Review current blockingAuthorities
- **AND** MUST NOT因 previous blocker历史存在继续阻塞

#### Scenario: approved Review 遇到新 Reset 后不再 current
- **WHEN** completed `review-propose` approved producer P1
- **AND** P1/R1 prepared Contract Reset identity为 CR1
- **AND** current Manifest同 scope Reset已变为 CR2
- **THEN** Reader MUST仍读取 P1/R1为completed history
- **BUT** MUST NOT把 R1 approval投影为 current propose-stage approval

#### Scenario: legacy context 不被回填
- **WHEN** historical completed Run context schemaVersion为1/2且没有 `ownerFactRefs`
- **THEN** D1 migration MUST NOT重写或合成其 historical Owner binding
- **AND**在没有 current structured Contract Reset时继续使用既有 legacy lifecycle规则

### Requirement: future archive Run 必须持久化无损、bounded 的 OpenSpec entry semantic projection

当前 ContextFile schema MUST为 future Run 提供 archive-only bounded projection，用于保存 archive entry 时由 OpenSpec structured status权威返回的 `version/changeId/changeRootLogical/artifactId→logicalPaths` keyed identity。该 projection MUST只在 `action=archive` 时存在，MUST使用 closed artifact-id shape并参与 archive `externalContextFingerprint` / `semanticInputFingerprint` reconstruction；MUST NOT保存raw status、instructions、archive outcome或完整Action Package，也 MUST NOT成为generic semantic ledger。

Post-relocation Reader/B1 MUST优先从该 persisted projection重建 archive OpenSpec semantic view，并 exact-check stored `semanticInputFingerprint`；MUST NOT调用已relocate active `getChangeStatus(changeId)`，也 MUST NOT从ResultRefs、文件名或目录规则猜artifactId mapping。Historical v2/v3 context保持read-only compatible且不得批量迁移。

#### Scenario: future 非默认 artifact paths relocation 后仍 exact-check
- **WHEN** future archive entry 的 OpenSpec structured status返回非默认或重排后的 proposal/specs/design/tasks logical paths
- **AND** ContextFile 已按artifactId keyed持久化该 bounded projection
- **AND** archive success 后active Change root已relocate
- **THEN** Reader/B1 MUST从persisted keyed projection重建与entry相同的archive external context
- **AND** reconstructed semantic descriptor MUST exact-match stored `semanticInputFingerprint`
- **AND** MUST NOT通过默认path inference或active status查询补全mapping

#### Scenario: future archive external semantic drift 继续 fail closed
- **WHEN** pending archive relocation 后适用 Owner authorization、Review/Verification binding、contract bytes、Run identity或OpenSpec semantic version发生不允许的变化
- **THEN** reconstructed semantic fingerprint MUST不能匹配 stored fingerprint
- **AND** terminal admission/recovery MUST fail closed
- **AND** MUST NOT改写stored projection/fingerprint或伪造completed result

### Requirement: pre-D2 archive context MAY通过 bounded OpenSpec-authority legacy adapter重建 keyed mapping

对于 `schemaVersion` 为历史 v2/v3、`action=archive` 且缺少 future keyed projection 的 immutable pending Run，Flowkit MAY在满足 durable known-success guard前提后使用 legacy reconstruction。该 reconstruction MUST在 disposable temp root 中将 structured terminalObservation指向的 archived Change bytes临时呈现到 guard记录的entry logical location，并调用受支持且版本一致的 OpenSpec CLI structured status；artifactId→logicalPaths MUST来自该OpenSpec structured输出，而非Flowkit默认path rule。

该临时 view MUST只用于 semantic reconstruction：MUST NOT写回 canonical OpenSpec tree、不得修改历史ContextFile、不得作为archive success proof、不得成为generic OpenSpec replay/migration subsystem。OpenSpec version/mapping/change identity/temp reconstruction任一不一致 MUST fail closed。

#### Scenario: D1/085 通过 OpenSpec authority重建 keyed mapping
- **WHEN** D1/085 为immutable schemaVersion 3 pending archive且无future projection
- **AND** durable observation=success、mutation guard classification=known-success
- **AND** observation archived path 与 guard/change identity一致
- **THEN** legacy adapter MUST在disposable temp OpenSpec view中调用同版本structured status取得proposal/specs/design/tasks keyed paths
- **AND** MUST用该structured mapping参与085 entry semantic compatibility check
- **AND** MUST NOT补写085 context或恢复canonical active D1 tree

#### Scenario: legacy reconstruction不能安全完成时拒绝恢复
- **WHEN** OpenSpec version不一致、structured status失败、artifact mapping不完整、change identity不匹配或temp view无法构造
- **THEN** legacy recovery MUST fail closed
- **AND** MUST NOT改写085、重跑archive或猜测默认artifact paths

### Requirement: completed-uncheckpointed Change 的 archive terminal fact 必须被 bounded 投影

FormalFactReader MUST为 current Delivery 中唯一 completed 且尚未形成 Change Checkpoint 的 target Change投影其 archive Run terminal status，供 Policy判断 checkpoint readiness。该 bounded projection MUST NOT要求加载全部历史 Finding/Run corpus；已经 checkpoint 的历史 Change pending archive MAY保留为审计/recovery fact，但 MUST NOT因此覆盖后续 active Change normal execution relevance。

#### Scenario: completed 但 archive Run pending 被 Policy看见
- **WHEN** Manifest Change=`completed`且Git尚无该 Change checkpoint
- **AND**该 Change matching archive Run仍pending
- **THEN** FormalFactSnapshot MUST提供足以让Policy拒绝`authorize-checkpoint`的archive terminal fact
- **AND** MUST NOT把pending Run伪装为completed

#### Scenario: 已 checkpoint 历史 pending 不劫持 current active Change
- **WHEN**历史 Change已有matching Change Checkpoint但遗留pending archive terminal-observation
- **AND**另一个 Change当前active
- **THEN**该历史pending MAY被diagnostic/explicit recovery读取
- **BUT** MUST NOT成为current active Change normal Action preparation或Policy的替代 target

### Requirement: Contract Reset 后 current generation projection 必须保留 Explore 并使旧 Proposal/downstream lineage 非 current

Owner Contract Reset 改变 Change contract generation 时，FormalFact projection MUST继续保留最近合法的 Explore artifact/review作为 fresh Proposal input；但此前 `propose/revise-propose/review-propose/apply/revise-apply/review-apply/archive` Runs若未携带当前完整 Contract Reset identity，MUST只能作为 immutable historical facts，MUST NOT被投影为 current proposal/downstream stage、current artifact、current review approval或当前 producer binding。

该规则 MUST通过现有 Owner fact refs / Run facts确定，不得新增 Generation Registry、Run rewrite或第二套 supersession store。

#### Scenario: 097 保留历史但不再是 current Apply
- **WHEN** 097-apply 已 completed
- **AND** Owner随后记录新的 Contract Reset identity并明确097 generation abandoned
- **THEN** Reader MUST继续读取097作为历史 completed Run
- **BUT** current proposal/downstream projection MUST NOT把097作为current Apply artifact
- **AND**旧091/095等未绑定当前reset identity的Review MUST NOT成为current approval

#### Scenario: 旧 revise producer 不得跨 Reset 重新成为 Current Artifact
- **WHEN** 历史 generation 中存在090-revise-propose与094-revise-apply
- **AND** 二者均不匹配当前完整 Contract Reset identity
- **THEN** Reader MUST继续保留二者作为 immutable historical completed Runs
- **BUT** proposal stage Current Artifact MUST NOT选择090-revise-propose
- **AND** apply stage Current Artifact MUST NOT选择094-revise-apply
- **AND**与二者关联的旧review lineage MUST NOT跨Reset成为current authority

#### Scenario: approved Explore 可继续成为 fresh Proposal handoff
- **WHEN** Contract Reset发生在已存在合法 approved Explore之后
- **AND** reset required outcome要求建立新的contract generation
- **THEN**最近合法 approved Explore artifact/review MUST仍可作为fresh `propose`的输入
- **AND** MUST NOT要求无关的`explore → review-explore`重跑

### Requirement: post-action record 必须独立持久化

`verification.md` MUST 继续由 Change 拥有且作为 formal Verification authority。E2 checkpoint 前，Core MAY 按 pre-E2 current runner 已存在的 per-Run record/sidecar protocol 保存 E2 自己的 generic post-action selection/evidence，但 MUST NOT 引入新的 sidecar format generation；point-in-time authority MUST 由 persisted bytes/content fingerprints、producing Run identity、terminal/result binding 与 `verification.md` publication fingerprint 固定。recognized E2 checkpoint 后，或 fresh/downstream repository 不存在 Flowkit pre-E2 migration lineage时，Core MUST 将 post-action selection/publication authority 直接绑定在 terminal `result.json`，不得修改 entry `context.json` 或创建新的 per-Run post-action sidecar。Historical records MUST immutable、bounded-readable，future current Catalog/renderer/Markdown MUST NOT 反向重验 historical terminal。

#### Scenario: terminal 后尝试修改 context

- **WHEN** post-action facts 已产生
- **THEN** post-E2 writer MUST 将 minimal binding 放入 terminal `result.json`
- **AND** MUST NOT terminal-time 注入或回填 `context.json`
- **AND** pre-E2 historical/current migration sidecar不得因此被改写

#### Scenario: record absent 而 Markdown present

- **WHEN** crash 后 Run pending、terminal binding absent 且 `verification.md` present
- **THEN** exact recovery MUST 从 persisted entry/package + current candidate 重算 deterministic selection/checks/Markdown
- **AND** bytes 完全一致才可继续 terminal publication，否则 MUST fail closed

#### Scenario: terminal result 不得早于 commit marker

- **WHEN** Apply/revise-apply terminal result 首次发布
- **THEN** 当时 canonical `verification.md` MUST 已完整存在且 point-in-time fingerprint 与即将写入/绑定的 persisted authority 一致
- **AND** missing/mismatch MUST 阻止 terminal CAS

#### Scenario: Reader 只验证 current applicable selection lineage

- **WHEN** Formal Reader 投影 current Change Verification
- **THEN** MUST 按现有 Policy/Review producer lineage选择唯一 current completed `apply` / `revise-apply` producer
- **AND** MUST 只将该 current producer 的 publication fingerprint 与 current canonical `verification.md` bytes exact-check
- **AND** producer/result/binding mismatch、多个 current candidates 或 current bytes mismatch MUST fail closed

#### Scenario: pending post-action publication 不替换 current authority

- **WHEN** pending Apply/revise-apply 已发布 Markdown 或 migration sidecar 但尚无 terminal result
- **THEN** Reader MUST 将 verification projection 标记为 unavailable/in-flight
- **AND** MAY 为 exact recovery 校验/重算 pending publication
- **AND** MUST NOT 将 pending publication 投影为 satisfied authority，或将 previous terminal binding 对照新 Markdown bytes

#### Scenario: historical terminal binding 是 point-in-time fact

- **WHEN** 后续合法 revise-apply 发布新的 point-in-time binding 与同一路径 `verification.md`
- **THEN** earlier Apply/revise-apply result、historical record/sidecars 与 ResultRefs MUST 保持有效
- **AND** Reader MUST NOT 将 future current-path bytes、future Catalog 或 future renderer 与 historical fingerprint 比较产生 FactConflict

#### Scenario: old terminal exact replay 不读取 future Markdown

- **WHEN** `resumeRun(expectedRunId)` 或 equivalent replay 指向 non-current historical terminal
- **THEN** Core MUST 直接返回 persisted terminal，并只校验该 historical record/result 自身 closed binding
- **AND** MUST NOT 读取 current canonical `verification.md`、current selection lineage、future Catalog 或 future renderer作为 historical authority

### Requirement: Contract Reset recovery 必须保持 narrow admission

`recoverContractResetPendingRun` MUST 基于 target pending Run 的 persisted entry lineage，只在唯一 drift 来自 applicable Owner Contract Reset 时取消为 `superseded-by-owner-contract-reset`。它 MUST NOT 成为 generic cancellation、history rewrite 或 generation manager。

#### Scenario: reset 之外还存在 semantic drift

- **WHEN** target pending Run 同时存在 undeclared/unowned path 或其他 non-reset semantic drift
- **THEN** recovery MUST fail closed
- **AND** MUST 保持 context 与历史 Run 不变
