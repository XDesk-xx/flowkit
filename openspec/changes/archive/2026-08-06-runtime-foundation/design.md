# Design: A1 — runtime-foundation

## Context

A1 是 Delivery `20260806-01-deterministic-core` 的第一个 Change，也是整个仓库的第一个代码 Change。Product Baseline 冻结了 specs 和 docs，但没有生产代码。A1 需要建立 TypeScript + Node.js ESM 项目骨架，为 B1-F1 提供可编译、可测试的基底。

技术基线已由 Delivery Manifest 和实现参考文档冻结：
- 语言：TypeScript（`.ts`）
- 模块系统：ESM
- 编译产物：`dist/**/*.js`
- CLI bin：`dist/bin/flowkit.js`
- 不新增手写 `.mjs`

## Goals

1. 建立 TypeScript 项目运行时骨架，`dist/bin/flowkit.js` 可启动并输出版本；
2. 建立 `typecheck`、`build`、`test`、`lint` 工具链；
3. 建立 `src/shared/` 工程基础模块（paths、atomic-write、external-command、errors）；
4. 建立 `src/` 按 Change 归属的子目录结构；
5. 所有新增手写生产源码和测试源码均为 `.ts`。

## Non-Goals

1. 不实现领域模型（Delivery/Change/Run 对象、状态 Schema）——属于 B1；
2. 不实现正式事实 Reader 或持久化——属于 C1；
3. 不实现 Policy 引擎——属于 D1；
4. 不实现诊断 CLI 命令（status/next/doctor/resume-context）——属于 E1；
5. 不实现 Change 执行循环或 OpenSpec 集成；
6. 不从旧项目复制 `.mjs` 实现；
7. 不引入 Archify、OpenSpec 或 GitHub 运行时依赖；
8. 不引入插件/注册表/门控抽象。

## Decisions

### D1：TypeScript 编译器选项（对应 Explore Q1）

生产 `tsconfig.json`：
- `target: ES2022`（Node.js 22 原生支持）
- `module: NodeNext`、`moduleResolution: NodeNext`（Node.js ESM 正确解析策略）
- `outDir: dist`、`rootDir: src`（编译产物结构清晰）
- `strict: true`（完整类型安全）
- `declaration: true`、`declarationMap: true`、`sourceMap: true`（后续 Change 跨模块引用）
- `types: ["node"]`（显式引入 @types/node）
- `include: ["src/**/*.ts"]`、`exclude: ["node_modules", "dist", "tests"]`

测试 `tsconfig.test.json`：
- `extends: ./tsconfig.json`（继承生产配置）
- `compilerOptions.rootDir: "."`（覆盖生产 `rootDir: src`，允许包含 `tests/` 下的文件，A1-RP-001）
- `compilerOptions.noEmit: true`（测试不编译）
- `include: ["src/**/*.ts", "tests/**/*.ts"]`（覆盖测试源码）

NodeNext 导入约定：`.ts` 源码中相对导入必须使用编译后 `.js` specifier（如 `import { getVersion } from '../cli/version.js'`）。

### D2：构建工具链与 ESM package contract（对应 Explore Q2）

- 直接使用 `tsc`，不引入打包工具（tsup/esbuild）；
- `package.json` 设置 `"type": "module"` 和 `"engines": { "node": ">=22.0.0" }`；
- Scripts：
  - `build`：`tsc`
  - `typecheck`：`tsc --noEmit && tsc --noEmit -p tsconfig.test.json`

### D3：测试框架（对应 Explore Q3）

- `node:test`（Node.js 22 内置）+ `tsx` loader 运行 `.ts` 测试；
- 不引入 vitest/jest；
- Script：`test`：`node --import tsx --test "tests/unit/**/*.test.ts"`（引号确保 Node 解析 glob）

### D4：Lint/格式化配置（对应 Explore Q4）

- ESLint flat config（`eslint.config.mjs`）+ `@typescript-eslint` + Prettier；
- devDependencies：
  - `typescript`: `^5.5.0`
  - `@types/node`: `^22.0.0`
  - `tsx`: `^4.0.0`
  - `eslint`: `^9.0.0`
  - `@eslint/js`: `^9.0.0`
  - `typescript-eslint`: `^8.0.0`
  - `prettier`: `^3.0.0`
- Script：`lint`：`eslint .`

### D5：ESLint 配置文件格式（对应 Explore Q5）

- 使用 `eslint.config.mjs`；
- 工具配置文件不是"生产源码"、"测试源码"或"CLI 启动壳"，不受 `.ts` 约束；
- 使用 `.ts` 需要额外 loader（jiti），对 A1 骨架不必要。

### D6：包内目录结构（对应 Explore Q6）

```text
src/
  bin/flowkit.ts          # CLI 入口（薄壳）
  cli/version.ts           # 版本输出
  domain/                  # B1 占位
  facts/                   # C1 占位
  persistence/             # C1 占位
  policy/                  # D1 占位
  diagnostics/             # E1 占位
  shared/
    paths.ts               # 跨平台路径归一化
    atomic-write.ts        # 原子文件写入
    external-command.ts    # 外部命令封装
    errors.ts              # 结构化错误
tests/
  unit/                    # 单元测试
  fixtures/                # 测试工具
dist/                      # 编译产物（gitignored）
```

占位目录使用 `.gitkeep` + `README.md` 标注归属 Change。

### D7：CLI 版本号（对应 Explore Q7）

- `0.1.0`（预发布阶段初始版本）；
- 后续 Change 不变更版本号，直到 F1 release candidate。

### D8：旧项目参考范围（对应 Explore Q8）

可参考（只参考模式，不复制代码）：
- Node CLI 职责边界（bin / src 分层）
- 原子文件写入（临时文件 + rename）
- 跨平台路径处理
- 外部命令封装
- 错误格式
- 测试目录组织
- 临时目录清理

不得继承：
- 旧项目 `.mjs` 生产实现
- Action Router / Recipe / Skill 编排器
- Gate / Signoff 系统
- current pointer
- Plugin / Registry 平台
- 旧 Delivery Group 状态机

## shared 工程基础模块设计

### paths.ts
- `normalizeSeparators(path: string): string` — Windows `\` 归一化为 POSIX `/`
- `joinPath(...segments: string[]): string` — 使用 POSIX `/` 拼接
- `relativePath(from: string, to: string): string` — 计算 POSIX 相对路径

### atomic-write.ts
- `atomicWriteFile(filePath: string, data: string): Promise<void>` — 先写同目录临时文件，再 rename 替换目标；失败时清理临时文件

### external-command.ts
- `runCommand(command: string, args: string[], options?: RunCommandOptions): Promise<RunCommandResult>` — 捕获 stdout、stderr 和 exit code；不继承父进程 stdio
- `RunCommandResult`：`{ stdout: string; stderr: string; exitCode: number }`

### errors.ts
- `FlowkitError` 类：`{ code: string; message: string; context?: Record<string, unknown> }`
- `toJSON()` 方法用于序列化

## Non-Blocking Finding A1-RE-004 处理

reviewer 指出 explore.md 中 tsconfig 的 `types` 字段说明与显示内容不一致。经核查，`types: ["node"]` 已在 explore.md 的 tsconfig JSON 中明确存在（line 165）。reviewer 判断有误，无需修复。在 design.md D1 中再次确认 `types: ["node"]` 是生产 tsconfig 的组成部分。
