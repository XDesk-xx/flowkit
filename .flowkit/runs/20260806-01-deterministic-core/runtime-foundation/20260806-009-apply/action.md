# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `A1`
- Change ID: `runtime-foundation`
- Action: `apply`
- Role: `author`
- Owner authorization: explicit (`apply` command from owner)

## Goal

基于 008-review-propose approved verdict 实现 A1 tasks.md 中的全部 34 项任务。创建 TypeScript + Node.js ESM 项目运行时骨架、编译/类型检查/测试工具链、src/shared/ 工程基础模块、最小 CLI 版本入口。

## Source review

- Proposal Review Run: `20260806-008-review-propose`
- Verdict: `approved`
- Blocking Findings: 0
- Review Result SHA-256: `586ac18cd26460d0939e469db93f22a9462c8c4197ae6887673a595255712469`

## Allowed work

- 创建 `package.json`、`tsconfig.json`、`tsconfig.test.json`
- 创建 `src/` 下所有源码文件和占位目录
- 创建 `tests/` 下所有测试文件
- 创建 `eslint.config.mjs`、`.prettierrc.json`
- 安装 devDependencies
- 修改 `openspec/changes/runtime-foundation/tasks.md`（标记任务完成）
- 运行 typecheck、build、test、lint 验证
- 创建本 apply Run

## Prohibited work

- 不修改 Delivery Manifest 或冻结 specs/docs
- 不修改 explore.md、proposal.md、design.md、spec.md（已 approved）
- 不修改 001-008 terminal Runs
- 不执行 Archive 或 Full Test
- 不提交或推送

## Required output

- 全部 34 项 tasks 完成
- typecheck、build、test、lint 全部通过
- 不存在新增 .mjs 文件
- 无外部运行时依赖
- 无插件/注册表抽象
- 本 Run 的 `result.json`
- 下一 Action 为 `review-apply`
