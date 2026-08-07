# Proposal: D1 — policy-engine

## Why

Delivery `20260806-01-deterministic-core` 的核心目标是建立确定性内核：从正式事实计算唯一合法下一 Action。
A1（项目骨架）、B1（领域类型与状态 Schema）和 C1（正式事实读取与持久化）已交付，提供了类型约束、
固定 Action Catalog、结构状态转换表、`FormalFactSnapshot` 只读视图和原子持久化。但还缺少将这些事实
转换为唯一决策的 Policy 引擎。

D1 交付这个引擎：`canRun(snapshot, action)`、`next(snapshot)`、`diagnose(snapshot)` 三个纯函数，
从 `FormalFactSnapshot` 计算唯一合法下一 Action、owner 决策边界或 blocked diagnosis。D1 不实现 CLI
展示（E1）、不实现完整 Change 执行循环、不实现自动 Commit/Push/Merge。

## What Changes

D1 创建以下内容（全部为新增 `.ts` 文件，不修改已有冻结 specs）：

1. **Policy 专属类型**：`src/policy/types.ts` — `CanRunResult`、`PolicyResult`（`action | owner-decision | blocked` 互斥联合）、`OwnerDecision`、`OwnerDecisionContext`、`BlockedDiagnosis`
2. **Lineage 模型**：`src/policy/lineage.ts` — 通过 `ReviewVerdictFact.reviewedRunId` 追踪 Review/Revision 循环，定义 Current Artifact Run、Current Review、Lineage match（D1-8，修复 D1-EX-001）
3. **阶段识别**：`src/policy/stage-detector.ts` — 从 Run 历史识别当前活跃阶段（explore/propose/apply/archive）
4. **Action 前置条件矩阵**：`src/policy/preconditions.ts` — 全部 12 个 Action 的语义前置条件（含 verification-gated 和 authorization-gated 规则）
5. **canRun 实现**：`src/policy/can-run.ts` — 校验特定 Action 在当前事实下是否可执行，返回 `CanRunResult`
6. **next 实现**：`src/policy/next.ts` — 决策树实现，计算唯一合法下一 Action / owner-decision / blocked
7. **diagnose 实现**：`src/policy/diagnose.ts` — `next` 的诊断变体，生成 `BlockedDiagnosis`
8. **owner 决策边界**：`src/policy/owner-decision.ts` — owner-decision 类型与判断
9. **blocked diagnosis**：`src/policy/blocked-diagnosis.ts` — blocked diagnosis 类型与生成
10. **测试**：`tests/unit/policy/` 下每个模块的单元测试 + 表驱动状态转换测试 + 生命周期全覆盖测试

## Capabilities

- 新建 capability：`flowkit-policy-engine`
- 不修改任何已有 capability（`flowkit-domain-and-state-schema`、`flowkit-formal-fact-reader-and-persistence` 保持冻结）

## Impact

- **风险**：低——全部为新增文件，不修改已有 tracked 源码；Policy 是纯函数，无 I/O 副作用
- **依赖**：D1 依赖 B1（`types.ts`、`actions.ts`、`states.ts`、`terminal.ts` 的类型与纯函数）和 C1（`FormalFactSnapshot` 及子类型、`readFormalFactSnapshot`）
- **上游契约缺口**：C1 `FormalFactSnapshot` 当前不携带 Change Verification status。D1 对 verification-gated actions（`review-apply`、`archive`）返回 `blocked: verification-facts-unavailable`，不推断。`ownerAuthorizations` 字段在 C1 契约中存在但 Reader 返回空数组（占位），D1 视空数组为 owner-decision（正确 fail-closed）
- **后续影响**：E1 诊断 CLI 依赖 D1 的 `next`、`diagnose`、`canRun`；F1 硬化依赖 D1 的表驱动测试覆盖；未来 Adapter 依赖 D1 的 `next` 驱动自动化流程
