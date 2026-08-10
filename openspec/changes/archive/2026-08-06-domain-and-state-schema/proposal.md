# Proposal: B1 — domain-and-state-schema

## Why

Delivery `20260806-01-deterministic-core` 的 A1 已交付 TypeScript 项目骨架和 `src/shared/` 工程基础模块。B1-F1（事实 Reader、Policy 引擎、诊断 CLI、硬化）全部需要 Delivery / Change / Run 领域对象、主状态 Schema、固定 Action Catalog、Run ID 规则和 terminal immutability 作为类型基底。

当前 `src/domain/` 只是 A1 创建的占位目录（`.gitkeep` + `README.md`），没有任何领域类型定义。C1 的 fact reader 需要将 Delivery Manifest 校验为 `Delivery` 类型；D1 的 Policy 需要状态转换表验证 Action 合法性；E1 的诊断 CLI 需要类型定义格式化输出。没有 B1，这些 Change 无法可靠读取、校验或转换正式事实状态。

B1 交付这个类型基底：11 个领域对象 TypeScript 类型定义、Delivery/Change/Run 主状态和结构转换表、固定 Action Catalog、Run ID 纯解析/校验/分配契约、terminal immutability 校验、Schema 校验函数。B1 不实现 Policy、fact reader、持久化或 CLI 命令。

## What Changes

B1 创建以下内容（全部为新增文件，不修改 A1 已有文件或冻结 specs）：

1. **领域对象类型定义**：`src/domain/types.ts` — 11 个领域对象的 TypeScript `interface`/`type`（Delivery、Change、Run、ActionDefinition、ActionResult、ResultRef、ReviewVerdict、FindingSummary、VerificationSummary、OwnerAuthorizationRef、ContinuationContext）；
2. **主状态与转换表**：`src/domain/states.ts` — Delivery/Change/Run 主状态联合类型 + 三个结构转换表 + 泛型 `canTransition`；
3. **固定 Action Catalog**：`src/domain/actions.ts` — 10 个 Change Action + 2 个 Delivery Action 的 `const` 数组 + `as const` 联合类型；
4. **Run ID 纯函数**：`src/domain/run-id.ts` — `parseRunId`、`validateRunIdUniqueness`、`allocateNextNnn`、`validateCandidateNnn` 纯函数（操作传入 fixture，不执行文件系统遍历）；
5. **terminal immutability**：`src/domain/terminal.ts` — `isTerminal`、`assertMutable` 校验函数；
6. **Schema 校验**：`src/domain/schema-validator.ts` — type guard 和运行时校验函数（拒绝未知主状态）；
7. **测试**：`tests/unit/domain/` 下 6 个测试文件，全部使用构造 fixture，不依赖真实 Git 仓库或文件系统。

## Capabilities

- 新建 capability：`flowkit-domain-and-state-schema`
- 不修改任何已有 capability（`flowkit-runtime-foundation` 等）

## Impact

- **风险**：低——全部为新增文件，不修改 A1 已有 tracked 文件或冻结 specs；
- **依赖**：B1 依赖 A1 `runtime-foundation`（已完成），复用 `src/shared/errors.ts` 的 `FlowkitError`；
- **后续影响**：C1 依赖 B1 的类型和 Schema 校验读取 Delivery Manifest 并校验为 `Delivery` 类型；D1 依赖 B1 的状态转换表验证 Action 合法性；E1 依赖 B1 的类型定义格式化诊断输出；
- **范围边界**：B1 不实现 Policy 引擎、FormalFactSnapshot、fact reader、原子持久化、诊断 CLI 命令、Archify runtime、Change 执行循环或 Full Test——这些属于 C1/D1/E1/F1 或后续 Delivery。
