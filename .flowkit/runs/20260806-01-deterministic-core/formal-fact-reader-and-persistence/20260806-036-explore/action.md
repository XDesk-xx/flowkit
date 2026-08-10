# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `C1`
- Change ID: `formal-fact-reader-and-persistence`
- Action: `explore`
- Role: `author`
- Owner authorization: explicit（用户确认激活 C1 并执行 explore）

## Goal

探索 C1 formal-fact-reader-and-persistence 的范围、契约和推荐结构：读取并归一化正式事实为 FormalFactSnapshot，实现 Flowkit 自有状态的原子持久化。消费 B1 已冻结的领域类型、Schema 校验、Run ID 契约和 terminal immutability。

## Source facts

- B1 `domain-and-state-schema` 已 completed + archived + checkpointed（commit `180f161`）
- B1 冻结 spec：`openspec/specs/flowkit-domain-and-state-schema/spec.md`（13 Requirements）
- B1 领域类型：`src/domain/types.ts`（11 领域对象，C1 owns persistence 标注）
- B1 Schema 校验：`src/domain/schema-validator.ts`
- B1 Run ID 契约：`src/domain/run-id.ts`（纯函数，C1 负责文件系统遍历）
- B1 terminal：`src/domain/terminal.ts`（assertMutable，C1 在写入 Run 前调用）
- A1 shared 基础：`src/shared/atomic-write.ts`、`src/shared/paths.ts`、`src/shared/errors.ts`、`src/shared/external-command.ts`
- A1 占位目录：`src/facts/`（README.md + .gitkeep）、`src/persistence/`（README.md + .gitkeep）

## Allowed work

- 读取正式 docs、冻结 specs、ref 文档
- 编写 `explore.md` 到 `openspec/changes/formal-fact-reader-and-persistence/`
- 创建本 explore Run
- 更新 Delivery Manifest（C1: planned → active）

## Prohibited work

- 不修改冻结 specs
- 不修改 B1 archived change artifacts
- 不修改 001-035 terminal Runs
- 不编写生产源码或测试源码
- 不执行 Change Checkpoint 或 Full Test
- 不提交或推送
- 不完整调用 OpenSpec CLI（只读取可稳定识别的本地事实）

## Required output

- `openspec/changes/formal-fact-reader-and-persistence/explore.md`
- 本 Run 的 `result.json`
- 下一 Action 为 `review-explore`
