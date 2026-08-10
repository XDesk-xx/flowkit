# Tasks: C1 — formal-fact-reader-and-persistence

## 1. FormalFactSnapshot 与 Reader

- [x]1.1 创建 `src/facts/formal-fact-snapshot.ts`：定义 `FormalFactSnapshot` 接口和 `FactConflict` 接口
- [x]1.2 `FormalFactSnapshot` 字段映射 `docs/delivery-lifecycle.md` Section 5 的 Policy 输入清单
- [x]1.3 `FormalFactSnapshot` 包含 `conflicts: FactConflict[]` 字段
- [x]1.4 创建 `src/facts/formal-fact-reader.ts`：实现 Reader 读取正式事实 → `FormalFactSnapshot`
- [x]1.5 Reader 遵循 `One fact, one authority`：每个事实从唯一权威来源读取
- [x]1.6 Reader 冲突收集为 `FactConflict[]`，不自动择优
- [x]1.7 Reader 不调用 OpenSpec CLI，只读取目录结构文件系统事实
- [x]1.8 Reader 读取 Delivery Manifest（通过 C1 手写 YAML 解析器，见第 9 组）
- [x]1.9 Reader 读取 Change 状态（OpenSpec changes 目录结构）
- [x]1.10 Reader 读取 Run 结果（`.flowkit/runs/` 目录结构 + result.json）
- [x]1.11 Reader 读取 OpenSpec 目录结构事实（存在性、状态摘要）
- [x]1.12 Reader 忽略 staging 目录（`.tmp-<run-id>/`）和 temp 文件（`.result-tmp-*.json`）

## 2. Git 边界 Reader

- [x]2.1 创建 `src/facts/git-boundary-reader.ts`：Git 边界摘要只读 Reader
- [x]2.2 Git 边界摘要包含 Delivery Start、Change Checkpoint、Delivery Final
- [x]2.3 Git 边界摘要不持久化到状态文件

## 3. Run 创建持久化

- [x]3.1 创建 `src/persistence/run-persistence.ts`：`createRun` 函数
- [x]3.2 `createRun` 在 staging 目录 `.tmp-<run-id>/` 中准备 action.md + context.json
- [x]3.3 `createRun` 使用 A1 `atomicWriteFile` 写入 staging 目录内文件
- [x]3.4 `createRun` 校验 staging 内容后通过目录 rename 原子发布
- [x]3.5 `createRun` 对自身 staging 目录 best-effort 清理
- [x]3.6 staging 目录对 Reader 不可见

## 4. Run 完成持久化

- [x]4.1 创建 `writeRunResult` 函数：接受 `RunResultFile` 对象（不接受 JSON 字符串）
- [x]4.2 `writeRunResult` 读取当前 Run 状态（从 context.json 构造 Run，status 应为 pending）
- [x]4.3 `writeRunResult` 调用 B1 `assertMutable(currentRun)` 校验 CURRENT pending 状态
- [x]4.4 `writeRunResult` 校验 `RunResultFile` 物理格式（runStatus + actionResult + actionResult.executionStatus 组合）
- [x]4.5 `writeRunResult` 校验 `actionResult` 通过 C1 `validateActionResultWithoutRunRef`
- [x]4.6 `writeRunResult` 序列化 `RunResultFile` 为 JSON（省略 `actionResult.runRef`）
- [x]4.7 `writeRunResult` 写入 temp 文件 `.result-tmp-<pid>-<timestamp>.json`
- [x]4.8 `writeRunResult` 执行 `fs.link(temp, result.json)` 原子 create-if-not-exists
- [x]4.9 `fs.link` EEXIST → 删除 temp → throw `RUN_TERMINAL`
- [x]4.10 `writeRunResult` 成功后清理 temp 文件（best-effort）
- [x]4.11 `writeRunResult` 不使用 `atomicWriteFile` 写入 result.json

## 5. RunResultFile 物理 schema

- [x]5.1 创建 `src/persistence/serialization.ts`：`RunResultFile` 接口定义
- [x]5.2 `RunResultFile` 不包含顶层 `executionStatus` 字段（C1-EX-008 单源真相）
- [x]5.3 `RunResultFile` 包含 `runStatus: TerminalRunStatus`（必填）
- [x]5.4 `RunResultFile` 包含 `actionResult?: ActionResultWithoutRunRef`（runStatus=completed 时必填）
- [x]5.5 `RunResultFile` 包含 `failureDiagnosis?: string`（runStatus=failed 时存在）
- [x]5.6 `RunResultFile` 包含 `cancellationReason?: string`（runStatus=cancelled 时存在）
- [x]5.7 定义 `TerminalRunStatus = 'completed' | 'failed' | 'cancelled'`
- [x]5.8 定义 `ActionResultWithoutRunRef = Omit<ActionResult, 'runRef'>`

## 6. 物理投影校验器

- [x]6.1 实现 `validateActionResultWithoutRunRef` 函数
- [x]6.2 校验必填字段：`action` 在 B1 `CHANGE_ACTIONS`/`DELIVERY_ACTIONS` 中
- [x]6.3 校验必填字段：`executionStatus` 通过 B1 `isExecutionStatus`
- [x]6.4 校验必填字段：`summary` 为非空 string
- [x]6.5 校验可选字段：`producedResultRefs`、`consumedInputRefs` 为 ResultRef 数组
- [x]6.6 校验可选字段：`verificationSummaryRef`、`reviewVerdictRef` 为 ResultRef
- [x]6.7 校验可选字段：`failureDiagnosis`、`nextActionRecommendation` 为 string
- [x]6.8 禁止 `runRef` 字段（存在 → reject）
- [x]6.9 实现 `validateResultRefProjection` 函数（C1 自己的 ResultRef 校验）
- [x]6.10 `validateResultRefProjection` 校验 `ref` 和 `versionFingerprint` 为非空 string
- [x]6.11 `validateResultRefProjection` 校验 `kind` 可选 string

## 7. ResultRef adapter

- [x]7.1 创建 `src/persistence/result-ref-adapter.ts`
- [x]7.2 实现 `computeResultFileHash(fileContent)` — 文件内容 SHA-256
- [x]7.3 实现 `buildRunResultRef(runPath, fileContent)` — 构造 ResultRef
- [x]7.4 实现 `reconstructActionResult(actionResultWithoutRunRef, runPath, fileContent)` — 派生 runRef + 重建
- [x]7.5 实现 `verifyResultRef(ref, actualFileContent)` — 替换检测
- [x]7.6 实现 `resolveRunResultRef(ref)` — 从 ResultRef 解析回文件路径
- [x]7.7 adapter 只负责构造对象和读取派生，不序列化、不发布

## 8. Run ID 文件系统集成

- [x]8.1 创建 `src/persistence/run-id-fs.ts`
- [x]8.2 从文件系统收集现有 Run-ID 列表
- [x]8.3 调用 B1 `allocateNextNnn` 分配下一个 Run-ID
- [x]8.4 调用 B1 `validateCandidateNnn` 校验候选 Run-ID
- [x]8.5 调用 B1 `validateRunIdUniqueness` 校验唯一性

## 9. YAML 解析器（C1-PR-001）

- [x]9.1 创建 `src/facts/yaml-parser.ts`：手写最小子集 YAML 解析器
- [x]9.2 支持 block mapping、block sequence、flow sequence、plain/single/double-quoted scalars、nested structures、null/bool/int 基础类型、注释、多行字符串（literal/folded）
- [x]9.3 不支持 anchor/alias、multi-document、tag、complex flow mapping
- [x]9.4 解析失败返回错误信息（不 throw），Reader 收集为 `FactConflict`
- [x]9.5 不引入外部运行时依赖

## 10. ContextFile schema + 确定性投影 + 身份校验（C1-PR-002, C1-PR-004, C1-PR-007, C1-PR-008）

- [x]10.1 在 `src/persistence/serialization.ts` 中定义 `ContextFile` 接口，`schemaVersion` 固定为 `2`（C1 格式标记）
- [x]10.2 `ContextFile` 必填字段：`schemaVersion: 2`、`runId`、`deliveryId`、`action`、`role`、`ownerAuthorization`、`runPath`
- [x]10.3 `ContextFile` 可选字段：`changeKey?`、`changeId?`、`inputRef?: ResultRef`、`sourceReviewRun?`、`sourceReviewVerdict?`、`constraints?`
- [x]10.4 实现 `validateContextFile` 函数：校验 `schemaVersion === 2` + 必填字段 + `action` 在 B1 Action Catalog 中 + `role`/`constraints` 字段类型
- [x]10.5 实现 Action-scope 规则：`action ∈ DELIVERY_ACTIONS` → `changeKey`/`changeId` MUST 缺失；`action ∈ CHANGE_ACTIONS` → `changeKey`/`changeId` MUST 存在；混合 → reject
- [x]10.6 `inputRef` 校验：存在时 MUST 为 `ResultRef` 对象（MUST NOT 为 string），通过 C1 `validateResultRefProjection` 校验
- [x]10.7 `createRun` 写入 context.json 前通过 `validateContextFile` 校验（含 Action-scope + inputRef）
- [x]10.8 Reader 读取 context.json `schemaVersion === 2` 但 `validateContextFile` 失败 → `FactConflict`（fail-closed，见第 11 组）
- [x]10.9 实现 `validateContextFileIdentity(contextFile, expectedRunDir)` 函数：路径一致性校验
- [x]10.10 身份校验 `contextFile.runId` MUST 匹配 Run 目录名
- [x]10.11 身份校验 `contextFile.deliveryId` MUST 匹配 Delivery 级路径段
- [x]10.12 身份校验 Change-level Run `contextFile.changeId` MUST 匹配 Change 级路径段
- [x]10.13 身份校验 Delivery-level Run（`changeId` 缺失）跳过 changeId 路径段校验
- [x]10.14 身份校验 `contextFile.runPath` MUST 与实际文件系统路径一致
- [x]10.15 `createRun` 写入 context.json 前通过 `validateContextFileIdentity` 校验（失败 → reject）
- [x]10.16 Reader 读取 C1 Run `validateContextFileIdentity` 失败 → 收集为 `FactConflict`
- [x]10.17 确定性 current-Run 投影：`writeRunResult` 从 `context.json` 构造当前 Run 对象（不依赖外部传入 Run）
- [x]10.18 构造的 Run 的 `runId`、`deliveryId`、`changeId`、`action`、`role` 字段 MUST 来自 `ContextFile`
- [x]10.19 构造的 Run 的 `status` MUST 为 `pending`（因为 result.json 不存在）
- [x]10.20 构造的 Run 的 `inputRef` MUST 直接映射自 `ContextFile.inputRef`（同为 `ResultRef?`，无需类型转换）
- [x]10.21 构造的 Run MUST 通过 B1 `validateRun`

## 11. Bootstrap Run 兼容性 + 三路判别器（C1-PR-003, C1-PR-005, C1-PR-006）

- [x]11.1 创建 `src/persistence/legacy-recognizer.ts`：bounded legacy recognizer 函数 `recognizeLegacyRun`
- [x]11.2 三路判别器：`schemaVersion === 2` → C1 Run 路径；`schemaVersion === 1` 或缺失 → legacy 路径；其他值 → `FactConflict`
- [x]11.3 C1 Run 路径：执行 `validateContextFile` + `validateContextFileIdentity`，任一失败 → `FactConflict`（fail-closed，MUST NOT 降级为 Bootstrap）
- [x]11.4 legacy 路径：执行 `recognizeLegacyRun`（MUST NOT 调用 C1 `validateContextFile`）
- [x]11.5 `recognizeLegacyRun` 校验 B1 Run 最小必填字段：`runId`、`deliveryId`、`action`（在 B1 Action Catalog 中）、`role`（`owner`/`author`/`reviewer`）
- [x]11.6 `recognizeLegacyRun` 不满足最小形状 → `FactConflict`（fail-closed）
- [x]11.7 `recognizeLegacyRun` 满足最小形状 → Bootstrap Run，缺失字段用默认值（可选字段为 `undefined`）
- [x]11.8 Bootstrap Run string 形 `inputRef` → legacy adapter 读取为 `Run.inputRef = undefined`（不构造 `ResultRef`）
- [x]11.9 Bootstrap Run `runStatus` 归一化：`result.json` 不存在 → `pending`；存在 → 从 `result.json.status` 读取并归一化为 `completed`/`failed`/`cancelled`，MUST NOT 降级为无差别的 `terminal`
- [x]11.10 Bootstrap Run `result.json.status` 缺失或值不在枚举内 → fail closed 收集为 `FactConflict`
- [x]11.11 `createRun`/`writeRunResult` 不修改、不迁移、不重写 Bootstrap Run
- [x]11.12 新 Run（由 C1 `createRun` 创建）使用 `schemaVersion: 2` + 完整 C1 schema 校验 + `validateContextFileIdentity` 身份校验
- [x]11.13 Bootstrap Run 的 `result.json` 可能包含 `actionResult.runRef.versionFingerprint`（自引用值），Reader 读取时不校验该值一致性

## 12. 单元测试与 fixture

- [x]12.1 创建 `tests/unit/facts/formal-fact-snapshot.test.ts`
- [x]12.2 创建 `tests/unit/facts/formal-fact-reader.test.ts`：fixture 目录结构测试
- [x]12.3 创建 `tests/unit/facts/git-boundary-reader.test.ts`
- [x]12.4 创建 `tests/unit/facts/yaml-parser.test.ts`：YAML 子集解析 + 不支持特性 + 解析失败
- [x]12.5 创建 `tests/unit/persistence/run-persistence.test.ts`：staging + publish + writeRunResult
- [x]12.6 持久化测试覆盖：staging 写入中断
- [x]12.7 持久化测试覆盖：staging 校验失败
- [x]12.8 持久化测试覆盖：publish rename 失败
- [x]12.9 持久化测试覆盖：result.json 写入中断
- [x]12.10 持久化测试覆盖：fs.link EEXIST 并发 writer
- [x]12.11 持久化测试覆盖：不依赖预先 exists 检查
- [x]12.12 持久化测试覆盖：staging 目录对 Reader 不可见
- [x]12.13 创建 `tests/unit/persistence/serialization.test.ts`：RunResultFile + ContextFile 组合校验
- [x]12.14 组合校验测试：5 个合法 terminal 状态
- [x]12.15 组合校验测试：7 个非法组合（含顶层 executionStatus 字段存在 reject）
- [x]12.16 ContextFile 校验测试：`schemaVersion !== 2` reject
- [x]12.17 ContextFile 校验测试：必填字段缺失 reject
- [x]12.18 ContextFile 校验测试：action 不在 B1 Action Catalog reject
- [x]12.19 创建 `tests/unit/persistence/result-ref-adapter.test.ts`
- [x]12.20 ResultRef 测试：写入后读取一致
- [x]12.21 ResultRef 测试：替换检测（fingerprint 不匹配 → false）
- [x]12.22 ResultRef 测试：错误 fingerprint 拒绝
- [x]12.23 ResultRef 测试：含 runRef 的 result.json 拒绝
- [x]12.24 创建 `tests/unit/persistence/run-id-fs.test.ts`
- [x]12.25 Malformed 投影 fixture：缺少 action/executionStatus/summary → reject
- [x]12.26 Malformed 投影 fixture：无效 action/executionStatus → reject
- [x]12.27 Malformed 投影 fixture：嵌套 ResultRef 缺少字段 → reject
- [x]12.28 Malformed 投影 fixture：包含 runRef 字段 → reject
- [x]12.29 Malformed 投影 fixture：actionResult 不是对象 → reject
- [x]12.30 一致性契约 fixture：扫描全部文档化 result.json 写入路径，确认只有 writeRunResult 能发布
- [x]12.31 ContextFile 字段类型校验测试：`role`/`constraints` 类型不匹配 → reject
- [x]12.32 Action-scope fixture：Delivery action（`full-test`）携带 `changeId` → reject / `FactConflict`
- [x]12.33 Action-scope fixture：Change action（`propose`）缺失 `changeId` → reject / `FactConflict`
- [x]12.34 Action-scope fixture：Delivery-level Run `changeKey`/`changeId` 缺失 → accept
- [x]12.35 inputRef fixture：`inputRef` 为 `ResultRef` 对象 → accept + `validateResultRefProjection` 通过
- [x]12.36 inputRef fixture：`inputRef` 为 string → reject（C1 Run 路径）
- [x]12.37 inputRef fixture：`inputRef` 缺失 → accept（可选字段）
- [x]12.38 inputRef fixture：`inputRef` 为 `ResultRef` 但缺 `versionFingerprint` → reject
- [x]12.39 身份校验 fixture：`runId` 不匹配 Run 目录名 → createRun reject / Reader 收集 `FactConflict`
- [x]12.40 身份校验 fixture：`deliveryId` 不匹配 Delivery 级路径段 → reject / `FactConflict`
- [x]12.41 身份校验 fixture：Change-level Run `changeId` 不匹配 Change 级路径段 → reject / `FactConflict`
- [x]12.42 身份校验 fixture：Delivery-level Run 跳过 changeId 路径段校验
- [x]12.43 身份校验 fixture：`runPath` 与实际文件系统路径不一致 → reject / `FactConflict`
- [x]12.44 确定性投影 fixture：`writeRunResult` 从 `context.json` 构造 Run，字段全部来自 `ContextFile`，`status=pending`
- [x]12.45 确定性投影 fixture：`inputRef` 直接映射 `ContextFile.inputRef` → `Run.inputRef`（同为 `ResultRef?`）
- [x]12.46 确定性投影 fixture：构造的 Run 通过 B1 `validateRun`
- [x]12.47 三路判别器 fixture：`schemaVersion === 2` → C1 Run 路径（`validateContextFile` + `validateContextFileIdentity`）
- [x]12.48 三路判别器 fixture：`schemaVersion === 2` 但 `validateContextFile` 失败 → `FactConflict`（fail-closed，不降级 Bootstrap）
- [x]12.49 三路判别器 fixture：`schemaVersion === 1` → legacy 路径（`recognizeLegacyRun`，不调 `validateContextFile`）
- [x]12.50 三路判别器 fixture：`schemaVersion` 缺失 → legacy 路径
- [x]12.51 三路判别器 fixture：`schemaVersion === 0`/`3`/负数 → `FactConflict`（未知格式）
- [x]12.52 legacy recognizer fixture：满足最小形状（runId/deliveryId/action/role）→ Bootstrap Run（基于 054-propose 真实 context shape，字段齐全但 schemaVersion=1）
- [x]12.53 legacy recognizer fixture：满足最小形状但缺 changeKey/ownerAuthorization/inputRef/runPath → Bootstrap Run（基于 055-review-propose 真实 context shape）
- [x]12.54 legacy recognizer fixture：含未知字段（`findings`）→ Bootstrap Run（不拒未知字段，基于 056-revise-propose 真实 context shape）
- [x]12.55 legacy recognizer fixture：不满足最小形状（缺 runId/action）→ `FactConflict`
- [x]12.56 legacy inputRef fixture：string 形 `inputRef` → `Run.inputRef = undefined`（不构造 `ResultRef`）
- [x]12.57 Bootstrap 终态归一化 fixture：`result.json` 存在 → 从 `result.json.status` 读取并归一化为 `completed`/`failed`/`cancelled`
- [x]12.58 Bootstrap 终态归一化 fixture：`result.json` 不存在 → `pending`
- [x]12.59 Bootstrap 终态归一化 fixture：`result.json.status` 缺失或值不在枚举内 → fail closed `FactConflict`
- [x]12.60 Bootstrap 不修改 fixture：`createRun`/`writeRunResult` 遇到 Bootstrap Run MUST NOT 修改/迁移/重写
- [x]12.61 Bootstrap legacy fixture：`result.json` 含 `actionResult.runRef.versionFingerprint` 自引用值，Reader 读取时不校验一致性
- [x]12.62 新 Run fixture：C1 `createRun` 创建的 Run 使用 `schemaVersion: 2` + 完整校验

## 13. 验证

- [x]13.1 `npm run typecheck` 通过（生产 + 测试）
- [x]13.2 `npm run build` 通过
- [x]13.3 `npm test` 通过
- [x]13.4 `npm run lint` 通过
- [x]13.5 `openspec validate formal-fact-reader-and-persistence --strict` 通过
- [x]13.6 不存在新增手写 `.mjs` 源码
- [x]13.7 不引入外部运行时依赖
- [x]13.8 不实现 Policy、诊断 CLI 或完整 Change 执行循环
