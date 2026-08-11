# flowkit-runtime-foundation Specification

## Purpose
TBD - created by archiving change runtime-foundation. Update Purpose after archive.
## Requirements
### Requirement: TypeScript 源码约定

所有新增手写生产源码和测试源码 MUST 使用 `.ts` 扩展名。不得新增手写 `.mjs` 生产源码、测试源码或 CLI 启动壳。

#### Scenario: 生产源码使用 .ts

- **WHEN** 创建生产源码文件
- **THEN** 文件扩展名 MUST 为 `.ts`
- **AND** 不得创建 `.mjs` 生产源码

#### Scenario: 测试源码使用 .ts

- **WHEN** 创建测试源码文件
- **THEN** 文件扩展名 MUST 为 `.ts`
- **AND** 不得创建 `.mjs` 测试源码

#### Scenario: 不存在新增 .mjs 文件

- **WHEN** 检查 A1 产出文件
- **THEN** 不存在新增手写 `.mjs` 生产源码、测试源码或 CLI 启动壳
- **AND** `eslint.config.mjs` 是工具配置文件，不受此约束

### Requirement: ESM package contract

`package.json` MUST 设置 `"type": "module"` 和 `"engines": { "node": ">=22.0.0" }`，确保 Node.js 将 `.js` 文件视为 ESM 并声明 Node 22 engine floor。

#### Scenario: package.json 设置 type module

- **WHEN** 读取 `package.json`
- **THEN** `type` 字段值 MUST 为 `"module"`

#### Scenario: package.json 声明 Node 22 engine

- **WHEN** 读取 `package.json`
- **THEN** `engines.node` 字段值 MUST 为 `">=22.0.0"`

### Requirement: NodeNext 导入约定

`.ts` 源码中的相对导入 MUST 使用编译后的 `.js` specifier，符合 NodeNext 模块解析策略。

#### Scenario: 相对导入使用 .js specifier

- **WHEN** 在 `.ts` 源码中使用相对导入
- **THEN** 导入路径 MUST 以 `.js` 结尾
- **AND** 不得使用无扩展名或 `.ts` 扩展名的相对导入

### Requirement: TypeScript 编译器配置

生产 `tsconfig.json` MUST 配置 `target: ES2022`、`module: NodeNext`、`moduleResolution: NodeNext`、`strict: true`、`outDir: dist`、`rootDir: src`、`types: ["node"]`。测试 `tsconfig.test.json` MUST extends 生产 tsconfig 并覆盖 `tests/**/*.ts`。

#### Scenario: 生产 tsconfig 配置正确

- **WHEN** 读取 `tsconfig.json`
- **THEN** `compilerOptions.target` MUST 为 `"ES2022"`
- **AND** `compilerOptions.module` MUST 为 `"NodeNext"`
- **AND** `compilerOptions.moduleResolution` MUST 为 `"NodeNext"`
- **AND** `compilerOptions.strict` MUST 为 `true`
- **AND** `compilerOptions.outDir` MUST 为 `"dist"`
- **AND** `compilerOptions.rootDir` MUST 为 `"src"`
- **AND** `compilerOptions.types` MUST 包含 `"node"`

#### Scenario: 测试 tsconfig 继承生产配置

- **WHEN** 读取 `tsconfig.test.json`
- **THEN** `extends` 字段 MUST 为 `"./tsconfig.json"`
- **AND** `compilerOptions.rootDir` MUST 为 `"."`（覆盖生产 rootDir src，允许包含 tests/，A1-RP-001）
- **AND** `include` MUST 包含 `"tests/**/*.ts"`
- **AND** `compilerOptions.noEmit` MUST 为 `true`

### Requirement: 构建工具链

构建 MUST 使用 `tsc` 直接编译，不引入打包工具。`typecheck` MUST 覆盖生产源码和测试源码。

#### Scenario: build 命令使用 tsc

- **WHEN** 运行 `npm run build`
- **THEN** 执行 `tsc`
- **AND** 编译产物输出到 `dist/`

#### Scenario: typecheck 覆盖生产和测试

- **WHEN** 运行 `npm run typecheck`
- **THEN** 执行 `tsc --noEmit && tsc --noEmit -p tsconfig.test.json`
- **AND** 生产和测试 TypeScript 源码 MUST 通过类型检查

### Requirement: 测试框架

测试 MUST 使用 `node:test`（Node.js 内置）+ `tsx` loader，不引入 vitest/jest。

#### Scenario: test 命令使用 node:test + tsx

- **WHEN** 运行 `npm run test`
- **THEN** 执行 `node --import tsx --test "tests/unit/**/*.test.ts"`
- **AND** test glob MUST 使用引号确保跨平台一致

#### Scenario: 无 vitest/jest 依赖

- **WHEN** 检查 `package.json` dependencies 和 devDependencies
- **THEN** 不存在 `vitest` 或 `jest` 依赖

### Requirement: Lint 和格式化

Lint MUST 使用 ESLint flat config + `@typescript-eslint`，格式化 MUST 使用 Prettier。

#### Scenario: ESLint flat config 存在

- **WHEN** 检查项目根目录
- **THEN** 存在 `eslint.config.mjs` 文件
- **AND** 不存在 `.eslintrc.json` 或 `.eslintrc.js`

#### Scenario: lint 命令可执行

- **WHEN** 运行 `npm run lint`
- **THEN** 执行 `eslint .`
- **AND** 无 lint 错误

#### Scenario: Prettier 配置存在

- **WHEN** 检查项目根目录
- **THEN** 存在 `.prettierrc.json` 文件

### Requirement: 目录结构

`src/` MUST 按 Change 归属划分子目录，占位目录 MUST 使用 `.gitkeep` + `README.md`。

#### Scenario: src 子目录存在

- **WHEN** 检查 `src/` 目录
- **THEN** 存在 `bin/`、`cli/`、`domain/`、`facts/`、`persistence/`、`policy/`、`diagnostics/`、`shared/` 子目录

#### Scenario: 占位目录有 .gitkeep 和 README

- **WHEN** 检查 `domain/`、`facts/`、`persistence/`、`policy/`、`diagnostics/` 目录
- **THEN** 每个目录 MUST 包含 `.gitkeep` 文件
- **AND** 每个目录 MUST 包含 `README.md` 标注归属 Change

### Requirement: CLI 入口

CLI 入口 `src/bin/flowkit.ts` MUST 是薄壳，只 import 并调用。`package.json` 的 `bin` MUST 指向 `dist/bin/flowkit.js`。

#### Scenario: CLI 入口是薄壳

- **WHEN** 读取 `src/bin/flowkit.ts`
- **THEN** 文件 MUST 只包含 import 和函数调用
- **AND** 不包含领域逻辑

#### Scenario: bin 指向编译产物

- **WHEN** 读取 `package.json`
- **THEN** `bin` 字段 MUST 指向 `dist/bin/flowkit.js`

#### Scenario: CLI 可启动并输出版本

- **WHEN** 运行 `node dist/bin/flowkit.js --version`
- **THEN** 输出 MUST 为 `0.1.0`

### Requirement: shared 工程基础模块

`src/shared/` MUST提供 `paths.ts`、`atomic-write.ts`、`external-command.ts`、`errors.ts` 等工程基础能力。`external-command.ts` MUST继续作为无业务语义的低层process helper，捕获stdout/stderr/exitCode，并支持bounded timeout、spawn-error diagnosis与跨平台`.cmd/.bat` launcher resolution；它 MUST NOT解析OpenSpec lifecycle或决定Flowkit Action。

#### Scenario: paths 模块提供跨平台路径归一化

- **WHEN**调用`normalizeSeparators`传入Windows路径
- **THEN**返回使用POSIX `/`分隔符的路径

#### Scenario: atomic-write 模块提供原子写入

- **WHEN**调用`atomicWriteFile`写入文件
- **THEN**先写入同目录临时文件
- **AND**再rename替换目标文件
- **AND**失败时不留下半写文件

#### Scenario: external-command 模块捕获命令输出

- **WHEN**调用`runCommand`执行外部命令
- **THEN**返回stdout、stderr与exitCode
- **AND**不继承父进程stdio
- **AND** spawn error/timeout MUST可由caller机器区分

#### Scenario: external-command timeout 有确定性终态

- **WHEN** configured timeout到期而child仍未结束
- **THEN** helper MUST进入确定性timeout completion path
- **AND** MUST NOT永久保持unresolved Promise
- **AND** caller MUST能够识别timed-out failure

#### Scenario: Windows command shim 使用 ComSpec

- **WHEN** platform为`win32`且target executable为`.cmd`或`.bat`
- **THEN** helper MUST通过`ComSpec || cmd.exe`与`/d /s /c`执行
- **AND** non-Windows executable MUST保持直接spawn语义

#### Scenario: errors 模块提供结构化错误

- **WHEN**创建`FlowkitError`
- **THEN**包含`code`、`message`和可选`context`
- **AND** `toJSON()`方法可序列化

### Requirement: 无外部运行时依赖

A1 MUST NOT 引入 Archify、OpenSpec 或 GitHub 的运行时依赖，MUST NOT 引入通用插件/注册表抽象。

#### Scenario: 无 Archify/OpenSpec/GitHub 运行时依赖

- **WHEN** 检查 `package.json` dependencies
- **THEN** 不存在 archify、openspec、@octokit 等运行时依赖
- **AND** dependencies 为空或仅含无外部调用的工具

#### Scenario: 无插件/注册表抽象

- **WHEN** 检查 `src/` 源码
- **THEN** 不存在 Plugin、Registry、Gate 等抽象

