# Proposal: A1 — runtime-foundation

## Why

Delivery `20260806-01-deterministic-core` 需要建立 Flowkit 的 TypeScript 确定性内核。当前仓库没有生产代码——Product Baseline 只冻结了 specs 和 docs。B1-F1（领域模型、事实 Reader、Policy 引擎、诊断 CLI、硬化）全部需要一个可编译、可测试的 TypeScript 项目骨架作为基底。

A1 交付这个基底：TypeScript + Node.js ESM 项目运行时骨架、编译/类型检查/测试工具链、`src/shared/` 工程基础模块、最小 CLI 版本入口。A1 不实现领域逻辑。

## What Changes

A1 创建以下内容（全部为新增文件，不修改已有 tracked 文件）：

1. **TypeScript 项目配置**：`package.json`（`type: module`、`engines.node >= 22.0.0`、`bin` 指向 `dist/bin/flowkit.js`）、`tsconfig.json`、`tsconfig.test.json`；
2. **源码目录骨架**：`src/` 下按 Change 归属划分子目录（`bin/`、`cli/`、`domain/`、`facts/`、`persistence/`、`policy/`、`diagnostics/`、`shared/`），占位目录使用 `.gitkeep` + `README.md`；
3. **CLI 入口**：`src/bin/flowkit.ts`（薄壳，只 import 并调用）、`src/cli/version.ts`（版本输出）；
4. **工程基础模块**：`src/shared/paths.ts`、`src/shared/atomic-write.ts`、`src/shared/external-command.ts`、`src/shared/errors.ts`；
5. **测试骨架**：`tests/unit/` 和 `tests/fixtures/`，含每个 shared 模块的单元测试和版本输出测试；
6. **Lint/格式化配置**：`eslint.config.mjs`、`.prettierrc.json`；
7. **其他配置**：`.gitignore`（`dist/`、`node_modules/`）。

## Capabilities

- 新建 capability：`flowkit-runtime-foundation`
- 不修改任何已有 capability

## Impact

- **风险**：低——全部为新增文件，不修改已有 tracked 文件或冻结 specs；
- **依赖**：A1 无前置 Change 依赖（`dependsOn: []`）；
- **后续影响**：B1-F1 全部依赖 A1 提供的项目骨架和 `src/shared/` 工程基础模块；
- **非阻塞 Finding A1-RE-004**：reviewer 指出 explore.md 中 tsconfig 的 `types` 字段说明与显示内容不一致。经核查，`types: ["node"]` 已在 tsconfig JSON 第 165 行明确存在，reviewer 判断有误，无需修复。

## Non-Blocking Finding 处理

| ID | 描述 | 处理 |
|---|---|---|
| A1-RE-004 | tsconfig 中 types 字段说明与显示内容不一致 | 已核查：`types: ["node"]` 在 explore.md line 165 存在，reviewer 判断有误，不修改 |
