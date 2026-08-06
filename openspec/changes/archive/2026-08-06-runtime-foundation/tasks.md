# Tasks: A1 — runtime-foundation

## 1. 项目初始化

- [x]1.1 创建 `package.json`：`name: flowkit`、`version: 0.1.0`、`type: module`、`engines.node: >=22.0.0`、`bin: dist/bin/flowkit.js`、scripts（build/typecheck/test/lint）
- [x]1.2 创建 `tsconfig.json`：target ES2022、module NodeNext、moduleResolution NodeNext、strict true、outDir dist、rootDir src、types ["node"]、declaration/declarationMap/sourceMap true
- [x]1.3 创建 `tsconfig.test.json`：extends ./tsconfig.json、rootDir "."、noEmit true、include ["src/**/*.ts", "tests/**/*.ts"]（rootDir 覆盖生产 src，A1-RP-001）
- [x]1.4 创建 `.gitignore`：`dist/`、`node_modules/`

## 2. 源码目录结构

- [x]2.1 创建 `src/bin/` 目录
- [x]2.2 创建 `src/cli/` 目录
- [x]2.3 创建 `src/shared/` 目录
- [x]2.4 创建 `src/domain/` 目录 + `.gitkeep` + `README.md`（标注归属 B1）
- [x]2.5 创建 `src/facts/` 目录 + `.gitkeep` + `README.md`（标注归属 C1）
- [x]2.6 创建 `src/persistence/` 目录 + `.gitkeep` + `README.md`（标注归属 C1）
- [x]2.7 创建 `src/policy/` 目录 + `.gitkeep` + `README.md`（标注归属 D1）
- [x]2.8 创建 `src/diagnostics/` 目录 + `.gitkeep` + `README.md`（标注归属 E1）

## 3. CLI 入口

- [x]3.1 创建 `src/cli/version.ts`：导出 `getVersion()` 函数，返回 `0.1.0`
- [x]3.2 创建 `src/bin/flowkit.ts`：薄壳入口，import 并调用 version 输出逻辑；处理 `--version` 参数

## 4. shared 工程基础模块

- [x]4.1 创建 `src/shared/paths.ts`：`normalizeSeparators`、`joinPath`、`relativePath`
- [x]4.2 创建 `src/shared/atomic-write.ts`：`atomicWriteFile`（临时文件 + rename）
- [x]4.3 创建 `src/shared/external-command.ts`：`runCommand`、`RunCommandResult`、`RunCommandOptions`
- [x]4.4 创建 `src/shared/errors.ts`：`FlowkitError` 类（code、message、context、toJSON）

## 5. 测试骨架

- [x]5.1 创建 `tests/fixtures/helpers.ts`：临时目录创建/清理工具
- [x]5.2 创建 `tests/unit/version.test.ts`：测试 `getVersion()` 返回 `0.1.0`
- [x]5.3 创建 `tests/unit/paths.test.ts`：测试 `normalizeSeparators`、`joinPath`、`relativePath`
- [x]5.4 创建 `tests/unit/atomic-write.test.ts`：测试原子写入和失败清理
- [x]5.5 创建 `tests/unit/external-command.test.ts`：测试 `runCommand` 捕获 stdout/stderr/exitCode
- [x]5.6 创建 `tests/unit/errors.test.ts`：测试 `FlowkitError` 创建和 `toJSON`

## 6. Lint/格式化配置

- [x]6.1 创建 `eslint.config.mjs`：flat config，使用 `@typescript-eslint` recommended
- [x]6.2 创建 `.prettierrc.json`：基本格式化配置
- [x]6.3 安装 devDependencies：`typescript@^5.5.0`、`@types/node@^22.0.0`、`tsx@^4.0.0`、`eslint@^9.0.0`、`@eslint/js@^9.0.0`、`typescript-eslint@^8.0.0`、`prettier@^3.0.0`

## 7. 验证

- [x]7.1 运行 `npm run typecheck`（覆盖生产和测试 TypeScript）
- [x]7.2 运行 `npm run build`（编译到 `dist/`）
- [x]7.3 运行 `node dist/bin/flowkit.js --version`（输出 `0.1.0`）
- [x]7.4 运行 `npm test`（所有单元测试通过）
- [x]7.5 运行 `npm run lint`（无 lint 错误）
- [x]7.6 检查不存在新增手写 `.mjs` 生产源码、测试源码或 CLI 启动壳
- [x]7.7 检查无 Archify/OpenSpec/GitHub 运行时依赖
- [x]7.8 检查无插件/注册表抽象
