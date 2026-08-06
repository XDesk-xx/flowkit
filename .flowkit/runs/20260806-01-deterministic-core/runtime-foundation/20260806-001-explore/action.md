# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `A1`
- Change ID: `runtime-foundation`
- Action: `explore`
- Role: `author`

## Goal

探索 A1 runtime-foundation 的实现范围和技术方案。A1 交付 TypeScript + Node.js ESM 最小生产代码骨架、编译和类型检查工具链，不从旧 Flowkit 复制流程模型，不新增手写 `.mjs` 源码。

## Input

- Delivery Manifest: `openspec/delivery-groups/20260806-01-deterministic-core.yaml`（technicalBaseline 冻结 TypeScript + ESM + dist/ + bin）
- 实现参考: `ref/01-deterministic-core-delivery-implementation-reference.md`（Section 5: A1 范围、推荐结构、技术边界、验收）
- 冻结 specs:
  - `openspec/specs/flowkit-core-model/spec.md`（三层模型、状态、Action Catalog、Run 路径）
  - `openspec/specs/flowkit-integration-boundaries/spec.md`（外部工具边界、Adapter 边界）
- Product Baseline docs: `docs/core-model.md`、`docs/integration-boundaries.md`、`docs/delivery-lifecycle.md`、`docs/verification-model.md`

## Allowed work

- 创建 `openspec/changes/runtime-foundation/.openspec.yaml`
- 创建 `openspec/changes/runtime-foundation/explore.md`
- 创建本 explore Run（`action.md`、`context.json`、`result.json`）

## Prohibited work

- 不修改 Delivery Manifest 或任何 tracked 文件
- 不创建 proposal.md、design.md、spec.md、tasks.md（属于 propose action）
- 不修改冻结 specs 或 docs
- 不创建代码文件（属于 apply action）
- 不执行 Apply、Archive 或 Full Test
- 不提交或推送

## Required output

- `explore.md`（Explore 结论，包含 8 个关键问题的推荐答案）
- 本 Run 的 `result.json`
- 下一 Action 为 `review-explore`
