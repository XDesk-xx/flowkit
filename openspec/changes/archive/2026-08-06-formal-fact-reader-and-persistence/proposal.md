# Proposal: C1 — formal-fact-reader-and-persistence

## Why

Delivery `20260806-01-deterministic-core` 的 D1 Policy 引擎需要只读的正式事实快照来计算唯一合法下一 Action。当前仓库只有 A1（项目骨架）和 B1（领域类型和纯函数），没有读取正式事实和持久化 Run 的能力。

C1 交付这个能力：`FormalFactSnapshot` 只读视图、正式事实 Reader、Run 两阶段原子持久化、ResultRef adapter。C1 不实现 Policy、诊断 CLI 或完整 Change 执行循环。

## What Changes

C1 创建以下内容（全部为新增 `.ts` 文件，不修改已有冻结 specs）：

1. **FormalFactSnapshot**：`src/facts/formal-fact-snapshot.ts` — Policy 输入的只读事实视图，包含 `conflicts: FactConflict[]` 使 fail-closed 显式化
2. **正式事实 Reader**：`src/facts/formal-fact-reader.ts` — 从文件系统读取 Delivery Manifest、Change 状态、Run 结果、OpenSpec 目录结构，归一化为 `FormalFactSnapshot`；遵循 `One fact, one authority`；冲突收集为 `FactConflict[]` 不自动择优
3. **Git 边界 Reader**：`src/facts/git-boundary-reader.ts` — 只读读取 Git 边界摘要（Delivery Start、Change Checkpoint、Delivery Final），不持久化到状态文件
4. **Run 持久化**：`src/persistence/run-persistence.ts` — `createRun`（staging + atomic publish）和 `writeRunResult`（read-current + assertMutable + 独占 fs.link 发布）
5. **Run ID 文件系统集成**：`src/persistence/run-id-fs.ts` — 收集文件系统 Run-ID 列表，调用 B1 `allocateNextNnn` 分配
6. **序列化**：`src/persistence/serialization.ts` — `RunResultFile` + `ContextFile` 物理 schema（`schemaVersion: 2` C1 标记）、`validateActionResultWithoutRunRef`、`validateContextFile`、`validateContextFileIdentity`（路径一致性身份校验）、`validateResultRefProjection`；`ContextFile` 作为确定性 current-Run 投影来源；Action-scope 规则决定 `changeKey`/`changeId` 存在性；`inputRef` 为可选 `ResultRef`
7. **ResultRef adapter**：`src/persistence/result-ref-adapter.ts` — 非自引用序列化（省略 runRef，读取时从文件内容 SHA-256 派生 versionFingerprint）、替换检测、重建
8. **YAML 解析器**：`src/facts/yaml-parser.ts` — 手写最小子集 YAML 解析器，不引入外部运行时依赖，解析失败收集为 `FactConflict`
9. **Bootstrap Run 兼容性 + 三路判别器**：`src/persistence/legacy-recognizer.ts` — 三路判别器（`schemaVersion === 2` → C1 Run 路径 fail-closed；`schemaVersion === 1`/缺失 → legacy 路径 bounded recognizer；其他 → `FactConflict`）；legacy recognizer 校验 B1 Run 最小必填字段；`runStatus` 归一化为 `completed`/`failed`/`cancelled`；不修改/迁移/重写
10. **测试**：`tests/unit/facts/` 和 `tests/unit/persistence/` 下每个模块的单元测试 + fixture 测试

## Capabilities

- 新建 capability：`flowkit-formal-fact-reader-and-persistence`
- 不修改任何已有 capability

## Impact

- **风险**：中——涉及文件系统原子操作和并发 writer 安全，但全部为新增文件，不修改已有 tracked 源码
- **依赖**：C1 依赖 A1（项目骨架、`atomicWriteFile`、`external-command`）和 B1（领域类型、`assertMutable`、`allocateNextNnn`、`isExecutionStatus`、`CHANGE_ACTIONS`/`DELIVERY_ACTIONS`）
- **后续影响**：D1 Policy 引擎依赖 C1 的 `FormalFactSnapshot`；E1 诊断 CLI 依赖 C1 的 Reader；F1 硬化依赖 C1 的持久化测试覆盖
