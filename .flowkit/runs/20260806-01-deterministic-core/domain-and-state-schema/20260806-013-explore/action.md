# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `B1`
- Change ID: `domain-and-state-schema`
- Action: `explore`
- Role: `author`
- Owner authorization: explicit（`B1 explore` 命令同时授权激活 + explore）

## Goal

探索 B1 domain-and-state-schema 的实现方案：冻结 Delivery / Change / Run 领域对象、主状态、固定 Action Catalog、Run ID 规则和 terminal immutability。识别关键技术问题并给出推荐答案，为 propose 阶段提供输入。

## Dependencies

- A1 `runtime-foundation`：completed（checkpoint `b4f807f`）
- 冻结 specs：flowkit-core-model、flowkit-runtime-foundation
- 冻结 docs：delivery-lifecycle.md、verification-model.md
- 实现参考：ref/01-deterministic-core-delivery-implementation-reference.md Section 6

## Allowed work

- 创建 `openspec/changes/domain-and-state-schema/` 目录和文件
- 修改 Delivery Manifest（B1: planned → active）
- 创建本 explore Run

## Prohibited work

- 不修改冻结 specs/docs
- 不修改 A1 archived artifacts
- 不修改 A1 terminal Runs
- 不创建代码文件
- 不执行 Propose、Apply、Archive 或 Full Test
- 不提交或推送

## Required output

- `explore.md`
- 本 Run 的 `result.json`
- 下一 Action 为 `review-explore`
