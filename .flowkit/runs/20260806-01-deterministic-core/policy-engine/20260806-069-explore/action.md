# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `D1`
- Change ID: `policy-engine`
- Action: `explore`
- Role: `author`
- Owner authorization: explicit（用户确认激活 D1 并执行 explore）

## Goal

探索 D1 policy-engine 的范围、契约和推荐结构：实现 `canRun` / `next` / `diagnose`，根据 FormalFactSnapshot 计算唯一合法下一 Action 或 owner 决策边界或 blocked diagnosis。消费 C1 已冻结的 FormalFactSnapshot、正式事实 Reader 和原子持久化层。

## Source facts

- C1 `formal-fact-reader-and-persistence` 已 completed + archived + checkpointed（commit `632805c`）
- C1 冻结 spec：`openspec/specs/flowkit-formal-fact-reader-and-persistence/spec.md`（18 Requirements, 73 Scenarios）
- C1 FormalFactSnapshot：`src/facts/formal-fact-snapshot.ts`（只读事实视图，含 conflicts: FactConflict[]）
- C1 正式事实 Reader：`src/facts/formal-fact-reader.ts`
- C1 持久化层：`src/persistence/`（createRun, writeRunResult, serialization, etc.）
- B1 冻结 spec：`openspec/specs/flowkit-domain-and-state-schema/spec.md`（13 Requirements, 41 Scenarios）
- B1 领域类型：`src/domain/types.ts`（Delivery/Change/Run 领域对象，状态联合类型）
- B1 Action Catalog：`src/domain/actions.ts`（10 Change Actions + 2 Delivery Actions）
- B1 状态转换：`src/domain/states.ts`（Delivery/Change 状态转换表）
- B1 terminal：`src/domain/terminal.ts`（assertMutable）
- `docs/delivery-lifecycle.md` Section 5：Policy 输入清单 + 输出类型
- `docs/delivery-lifecycle.md` Section 10：D1 所属交互（owner 授权边界、review/revise 统一入口、Checkpoint Git 操作）
- `docs/core-model.md`：核心模型与状态机
- Delivery Manifest：`openspec/delivery-groups/20260806-01-deterministic-core.yaml`

## Allowed work

- 读取正式 docs、冻结 specs、ref 文档
- 编写 explore artifact 到 `.tmp/explore/policy-engine/`（scratch-only，per C1 spec mutation policy）
- 创建本 explore Run

## Prohibited work

- 不修改 Delivery Manifest（explore MUST NOT modify manifest per C1 spec）
- 不修改冻结 specs
- 不修改 036-068 terminal Runs
- 不编写生产源码或测试源码
- 不执行 Change Checkpoint 或 Full Test
- 不提交或推送
- 不写入 `openspec/changes/**`（explore MUST NOT write to openspec/changes/** per C1 spec）

## Required output

- `.tmp/explore/policy-engine/conclusion.md`（explore 结论）
- `.tmp/explore/policy-engine/evidence.json`（含 SHA-256 hash + required fields）
- 本 Run 的 `result.json`
- 下一 Action 为 `review-explore`
