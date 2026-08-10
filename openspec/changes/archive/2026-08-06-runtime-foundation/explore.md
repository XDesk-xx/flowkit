# A1 Explore：TypeScript 运行时骨架与构建工具链

## 1. 基本信息

- Delivery：`20260806-01-deterministic-core`
- Change Key：`A1`
- Change ID：`runtime-foundation`
- Action：`explore`
- 当前结果：等待 `review-explore`
- 计划输出：
  - TypeScript 项目运行时骨架（`src/` 分层 + `dist/` 编译产物）
  - `tsconfig.json` / build / typecheck / test 工具链
  - `package.json`（`bin` 指向 `dist/bin/flowkit.js`）
  - `src/shared/` 工程基础模块
  - `src/bin/flowkit.ts` + `src/cli/version.ts` 最小 CLI 入口
  - `tests/unit/` + `tests/fixtures/` 测试骨架

## 2. 已冻结输入

### 2.1 Product Baseline 冻结事实

A1 继承 `20260805-01-product-baseline` 已冻结的边界：

1. 正式层级只有 `Delivery > Change > Action`；
2. Run 是 Action 执行实例，不是第四层产品实体；
3. 一个仓库最多一个 active Delivery；
4. 一个 active Delivery 中最多一个 active Change；
5. Policy 根据正式事实计算唯一合法下一 Action；
6. 不持久化 `currentAction`；
7. 正式角色只有 `owner / author / reviewer`；
8. OpenSpec、Git、Reviewer、Verification、Archify、CodeGraph 各自拥有独立事实；
9. Skill、Adapter、Agent 和外部工具不得成为第二个编排器；
10. 不建立 Gate Registry、Skill Registry、Provider Registry 或通用插件平台。

### 2.2 技术基线冻结（不可重新选择）

以下技术边界由 Delivery Manifest `technicalBaseline` 和实现参考文档冻结，A1 Explore/Propose **不重新选择**：

1. 新增手写生产源码和测试源码统一使用 `.ts`；
2. Node.js 模块系统使用 ESM；
3. `typecheck` 与 `build` 是代码 Change 的必需检查；
4. 运行和发布使用 `dist/**/*.js` 编译产物；
5. `package.json` 的 `bin` 指向 `dist/bin/flowkit.js`；
6. 不建立 `.mjs` 启动壳；
7. 不把旧 Flowkit 的 `.mjs` 逐文件翻译为新 Core。

### 2.3 A1 范围冻结

A1 只交付**项目运行时骨架和工程基础**，不实现领域模型、Policy、CLI 诊断命令或完整 Change 执行循环。后续 Change 的职责边界：

| Change | 职责 | A1 提供 |
|---|---|---|
| B1 | 领域对象、状态 Schema、Action Catalog | `src/domain/` 占位目录 |
| C1 | 正式事实 Reader、原子持久化 | `src/shared/atomic-write.ts`、`src/shared/paths.ts` |
| D1 | Policy 引擎 | `src/policy/` 占位目录 |
| E1 | 诊断 CLI | `src/cli/` 入口和 `src/diagnostics/` 占位目录 |

## 3. 本次需要解决的问题

A1 Explore 需要为 Propose 提供以下问题的推荐答案：

1. **TypeScript 编译器选项**：target、module、moduleResolution、outDir、rootDir、strict、declaration 等具体值；
2. **构建工具链**：直接使用 `tsc`，还是引入 tsup/esbuild 等打包工具；
3. **测试框架**：`node:test`（内置）+ tsx loader，还是 vitest 或其他；
4. **Lint/格式化配置**：ESLint flat config + @typescript-eslint + Prettier 的具体版本和配置；
5. **ESLint 配置文件格式**：`eslint.config.mjs` 还是 `eslint.config.ts`（工具配置文件是否受 .ts 约束）；
6. **包内目录结构**：`src/` 子目录划分和 `tests/` 组织方式；
7. **CLI 版本号**：A1 的初始版本号；
8. **旧项目参考范围**：哪些工程基础可以参考，哪些不得继承。

## 4. 推荐结构

### 4.1 目录布局

```text
src/
  bin/
    flowkit.ts          # CLI 入口（薄壳，只 import 并调用）
  cli/
    version.ts           # 版本输出（A1 唯一 CLI 功能）
  domain/                # B1 占位
  facts/                 # C1 占位
  persistence/           # C1 占位
  policy/                # D1 占位
  diagnostics/           # E1 占位
  shared/
    paths.ts             # 跨平台路径归一化
    atomic-write.ts      # 原子文件写入
    external-command.ts  # 外部命令封装
    errors.ts            # 结构化错误
tests/
  unit/
    version.test.ts
    paths.test.ts
    atomic-write.test.ts
    external-command.test.ts
    errors.test.ts
  fixtures/
    helpers.ts           # 临时目录创建/清理等测试工具
dist/                    # 编译产物（gitignored）
  bin/
    flowkit.js           # 编译后的 CLI 入口
```

占位目录使用 `.gitkeep` + `README.md` 标注归属 Change。

### 4.2 设计原则

- CLI 入口薄：`src/bin/flowkit.ts` 只 import 并调用，不包含领域逻辑；
- 领域规则不依赖终端 I/O；
- 文件系统和进程调用在 `src/shared/` 边界模块；
- Policy 使用纯输入、纯输出优先（B1/D1 遵守，A1 只提供基础）；
- 测试能够构造完整事实快照而不依赖真实 Git 仓库。

## 5. 可参考旧项目的内容

只参考工程基础，不参考流程实现：

```text
Node CLI 的职责边界（bin / src 分层）
原子文件写入（临时文件 + rename 模式）
跨平台路径处理（Windows \ 与 Unix / 归一化）
外部命令封装（捕获 stdout/stderr/exit code，不继承 stdio）
错误格式（code + message + context 结构化错误）
测试目录组织（unit / fixtures 分层）
临时目录清理（测试隔离）
```

## 6. 不得继承的内容

```text
旧项目的手写 .mjs 生产实现
旧 Action Router
Recipe / Skill 编排器
Gate / Signoff 系统
current pointer / current.json
Plugin / Registry 平台
旧 Delivery Group 状态机
旧项目的 TypeScript 类型定义（如果有）
```

A1 从零建立 TypeScript 骨架，不逐文件翻译旧 `.mjs`。

## 7. 关键问题推荐答案

### Q1：TypeScript 编译器选项

推荐生产 `tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

推荐测试 `tsconfig.test.json`（extends 生产 tsconfig，覆盖测试源码）：

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    "rootDir": ".",
    "outDir": null
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

NodeNext 导入约定（A1-RE-001）：

- `module: NodeNext` 要求 `package.json` 设置 `type: module`，否则 `.ts` 文件编译为 CommonJS；
- NodeNext 下，`.ts` 源码中的相对导入 **必须使用编译后的 `.js` specifier**，例如 `import { getVersion } from '../cli/version.js'`；
- 这不是可选项——NodeNext 编译器在 ESM 模式下会拒绝缺少 `.js` 扩展名的相对导入。

理由：
- `ES2022` 匹配 Node.js 22 的原生支持；
- `NodeNext` + `NodeNext` 是 Node.js ESM 的正确模块解析策略；
- `strict: true` 从一开始启用完整类型安全；
- `types: ["node"]` 显式引入 `@types/node`，为 fs/path/child_process/node:test 等 Node API 提供类型声明（A1-RE-002）；
- `declaration` + `declarationMap` 为后续 Change 的跨模块引用提供类型声明；
- `rootDir: src` + `outDir: dist` 确保编译产物结构清晰；
- `tests/` 排除在生产编译之外，由 `tsconfig.test.json` 单独覆盖类型检查（A1-RE-003）。

### Q2：构建工具链与 ESM package contract

推荐直接使用 `tsc`，不引入打包工具。

ESM package contract（A1-RE-001）：

`package.json` 必须设置：
- `"type": "module"` — 确保 Node.js 将 `.js` 文件视为 ESM，NodeNext 依赖此设置决定编译输出格式；
- `"engines": { "node": ">=22.0.0" }` — 声明 Node 22 engine floor，与 `target: ES2022` 和 `node:test` 内置支持一致。

理由：
- A1 是骨架阶段，无性能瓶颈；
- `tsc` 同时提供类型检查和编译，无需额外工具；
- 不引入 tsup/esbuild 等额外依赖；
- 后续 Change 若需要打包优化，可通过独立 Change 引入。

`package.json` scripts：
- `build`：`tsc`
- `typecheck`：`tsc --noEmit && tsc --noEmit -p tsconfig.test.json`（覆盖生产和测试 TypeScript，A1-RE-003）

### Q3：测试框架

推荐 `node:test`（Node.js 内置）+ `tsx` loader 运行 `.ts` 测试。

理由：
- `node:test` 是 Node.js 22 内置测试框架，零运行时依赖；
- `tsx` 是轻量 TypeScript loader，仅作为 devDependency；
- 不引入 vitest/jest 等重框架；
- 满足"所有领域模块可在无网络环境测试"的约束；
- 后续 Change 若需要更丰富的测试能力，可通过独立 Change 引入。

`package.json` scripts：
- `test`：`node --import tsx --test "tests/unit/**/*.test.ts"`（引号确保 Node 而非 host shell 解析 glob，跨平台一致，A1-RE-003）

### Q4：Lint/格式化配置

推荐 ESLint flat config + `@typescript-eslint` + Prettier。

完整 devDependencies（A1 全部工具链）：

- `typescript`: `^5.5.0` — TypeScript 编译器
- `@types/node`: `^22.0.0` — Node.js 类型声明，pin 到 Node 22 major line（A1-RE-002）
- `tsx`: `^4.0.0` — TypeScript loader，运行 `.ts` 测试
- `eslint`: `^9.0.0` — Lint 引擎
- `@eslint/js`: `^9.0.0` — ESLint 推荐规则
- `typescript-eslint`: `^8.0.0` — TypeScript ESLint 插件
- `prettier`: `^3.0.0` — 代码格式化

ESLint flat config 使用 `@typescript-eslint` recommended 配置，lint 命令通过 `npm run lint`（`package.json` scripts）调用本地 `eslint .`。

### Q5：ESLint 配置文件格式

推荐 `eslint.config.mjs`。

理由：
- ESLint flat config 原生支持 `.mjs` 格式；
- `eslint.config.mjs` 是工具配置文件，不是"生产源码"、"测试源码"或"CLI 启动壳"；
- 技术基线约束的是 `生产源码`、`测试源码` 和 `CLI 启动壳`，工具配置文件不在约束范围内；
- 使用 `.ts` 需要额外 loader（jiti），增加复杂度，对 A1 骨架不必要。

### Q6：包内目录结构

见 Section 4.1。`src/` 按 Change 归属划分子目录，`tests/` 按 `unit/` + `fixtures/` 组织。占位目录使用 `.gitkeep` + `README.md`。

### Q7：CLI 版本号

推荐 `0.1.0`。

理由：
- A1 是首个代码 Delivery 的首个 Change；
- `0.1.0` 表示预发布阶段的初始版本；
- 后续 Change 不变更版本号，直到 F1 release candidate。

### Q8：旧项目参考范围

见 Section 5（可参考）和 Section 6（不得继承）。

## 8. shared 工程基础模块

### 8.1 paths.ts

跨平台路径处理，将 Windows `\` 归一化为 POSIX `/`，提供 `normalizeSeparators`、`joinPath`、`relativePath` 函数。不硬编码平台分隔符。

### 8.2 atomic-write.ts

原子文件写入：先写同目录临时文件，再 rename 替换目标。失败时清理临时文件，不留半写文件。

### 8.3 external-command.ts

外部命令封装：捕获 stdout、stderr 和 exit code，不继承父进程 stdio。返回结构化结果对象。

### 8.4 errors.ts

结构化错误：`FlowkitError` 类，包含 `code`（机器可读）、`message`（人类可读）和 `context`（可选结构化上下文）。提供 `toJSON()` 方法用于序列化。

## 9. 验收标准

A1 验收（来自实现参考 Section 5.4 + review-explore Blocking Findings）：

1. TypeScript CLI 源码可以编译，`dist/bin/flowkit.js` 可启动并输出版本；
2. `typecheck` 和 `build` 通过；
3. `typecheck` 覆盖生产源码和测试源码（`tsconfig.json` + `tsconfig.test.json`，A1-RE-003）；
4. `package.json` 设置 `type: module` 和 `engines.node >= 22.0.0`（A1-RE-001）；
5. `.ts` 源码中相对导入使用编译后 `.js` specifier（NodeNext 约定，A1-RE-001）；
6. `@types/node` 声明为 devDependency 并 pin 到 Node 22 major line（A1-RE-002）；
7. 所有新增手写生产源码和测试源码均为 `.ts`，不存在新增手写 `.mjs`；
8. 所有领域模块可在无网络环境测试；
9. 没有 Archify、OpenSpec 或 GitHub 的运行时依赖；
10. 没有通用插件/注册表抽象。

## 10. 跨 Change Finding（非 A1 范围）

以下问题在 Explore 中识别但不由 A1 解决，归属后续 Change：

- **B1**：领域对象的具体 TypeScript interface/type 定义、状态 Schema 校验实现；
- **C1**：`FormalFactSnapshot` 的具体结构、正式事实 Reader 的实现；
- **C1**：`src/shared/atomic-write.ts` 的 Schema 校验集成（A1 只提供原子写入原语）；
- **D1**：Policy 的纯函数接口签名和表驱动测试；
- **E1**：诊断 CLI 的具体命令实现（A1 只提供 CLI 入口和版本输出）。

## 11. 探索结论

A1 Explore 建议冻结：

1. TypeScript + ESM + Node.js 22 作为技术基线（已冻结）；
2. `tsc` 作为编译和类型检查工具（不引入打包工具）；
3. `node:test` + `tsx` 作为测试框架（不引入 vitest/jest）；
4. ESLint flat config + `@typescript-eslint` + Prettier 作为 Lint/格式化工具；
5. `eslint.config.mjs` 作为 ESLint 配置文件格式（工具配置，非生产源码）；
6. `src/` 按 Change 归属划分子目录，占位目录用 `.gitkeep` + `README.md`；
7. `0.1.0` 作为初始版本号；
8. `src/shared/` 提供 4 个工程基础模块（paths、atomic-write、external-command、errors）；
9. CLI 入口 `src/bin/flowkit.ts` 只做 import 和调用，不含领域逻辑；
10. A1 只交付骨架和工程基础，不实现领域模型、Policy 或诊断 CLI；
11. 不从旧项目复制 `.mjs` 实现，只参考工程基础模式；
12. ESM package contract：`package.json type=module` + `engines.node >= 22.0.0` + NodeNext `.js` import specifiers（A1-RE-001）；
13. `@types/node` 作为 devDependency pin 到 Node 22 major line（A1-RE-002）；
14. `tsconfig.test.json` extends 生产 tsconfig，typecheck 覆盖生产和测试 TypeScript（A1-RE-003）；
15. test glob 使用引号确保跨平台一致（A1-RE-003）。

## 12. Review 重点

`review-explore` 应审查整个 A1 Explore：

1. TypeScript 编译器选项是否与 Node.js 22 + ESM 匹配；
2. `tsc` 直接编译是否足够，是否需要打包工具；
3. `node:test` + `tsx` 是否满足"无网络环境测试"约束；
4. ESLint flat config 方案是否可执行，版本范围是否合理；
5. `eslint.config.mjs` 是否违反"不新增 .mjs"约束；
6. 目录结构是否覆盖所有后续 Change 的需求；
7. `src/shared/` 4 个模块是否足够，是否缺失或多余；
8. CLI 入口设计是否足够薄；
9. 旧项目参考边界是否清晰；
10. A1 范围是否越界到 B1/C1/D1/E1；
11. 验收标准是否可机械验证；
12. ESM package contract 是否完整（`type=module`、`engines`、`.js` specifiers，A1-RE-001）；
13. `@types/node` 是否声明并 pin 到 Node 22 major line（A1-RE-002）；
14. typecheck 是否覆盖测试 TypeScript（`tsconfig.test.json`，A1-RE-003）；
15. test glob 是否使用引号确保跨平台一致（A1-RE-003）。
