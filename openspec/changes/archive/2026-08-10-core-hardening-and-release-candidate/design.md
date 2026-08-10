## Context

F1 是当前 Deterministic Core Delivery 的最后一个 required Change。Manifest 已冻结三个 F1 outputs：测试层次覆盖、固定 Full Test Plan、core release candidate。184 Explore 已完成真实 baseline：594-test suite 在固定 concurrency 1/2/4 下均通过，耗时约 30.7s/19.0s/18.7s；默认 Node test concurrency 在 detached 环境中曾超过 180s 未完成。当前只有 `npm test / typecheck / lint / build`，没有 focused/affected/full/quality/verify 入口。

同时，当前 repository 已有多处 legacy 大文件/高 complexity，因此参考阈值不能直接作为全仓 hard gate。E1 canonical admission 还暴露了两个低层工程问题：Windows `.cmd/.bat` launcher 必须经过真实 command processor；Checkpoint 前需要 `git diff --check` / `git diff --cached --check` 捕获 whitespace/EOF defect。Owner 已要求把这两条作为 AGENTS 工程规则。

F1 必须在不建立第二个 workflow/test authority 的前提下，把项目工具做成确定、可分层、可度量的 RC qualification input。

## Goals / Non-Goals

### Goals

- 提供可直接执行的 focused / affected / full test contract。
- 固定 Full Test 的 test concurrency，避免依赖机器默认值。
- 提供最小 Quality Guard，硬化当前已存在的 correctness/architecture invariant。
- 提供 `verify:change` 与 `verify:full` 聚合入口，同时保持 Delivery Full Test 的 Owner authorization boundary。
- 确定性计算 maintainability metrics 与验证耗时并给出 warning budget，而不把 legacy debt / 机器波动变成 correctness gate。
- 在 F1 自身完成前形成内部 Core RC candidate，明确稳定 surface 与后续 qualification lifecycle。

### Non-Goals

- 不实现通用 Test/Affected/Gate Registry、dependency graph DB、CodeGraph integration。
- 不把 maintainability metric 变成全仓 hard gate，不为数字拆分 legacy module。
- 不修改 Policy、FullTestStatus 状态机、Owner authorization 或 corrective Change 规则。
- 不 publish npm package、不创建 Git tag、不自动 version bump。
- 不自动执行 Delivery Full Test、Archive、Checkpoint、Commit、Push。
- 不实现 Delivery Finalize 或下一 Delivery 的 Change Runner。

## Decisions

### 1. F1 scope 只细化当前 Manifest，不修改 goal / outputs

F1 required work 仅用于实现：

```text
测试层次覆盖
固定 Full Test Plan
core release candidate
```

Quality Guard / timing measurement 只能作为上述输出的工程支撑：hard guard 只固化现有 invariant；maintainability/performance 只 warning。若实现过程中发现必须新增 Manifest output、改变 Delivery acceptance 或引入新的 architecture product capability，必须停止并进入 `owner-decision-required`，不得由 Author自行扩 scope。

### 2. Verification tooling 使用一个小型 TypeScript runner，不建立 registry

新增 repository tooling：

```text
scripts/verification.ts
scripts/quality.ts
```

允许再有一个纯数据/函数 helper 保存 fixed affected mapping，但不得出现动态注册、runtime plugin discovery 或持久状态。

Package scripts：

```text
npm run test:focused -- <test-file...>
npm run test:affected -- <scope...>
npm run test:full
npm run quality
npm run verify:change -- <scope...>
npm run verify:full
```

`npm test` MUST 成为 `npm run test:full` 的兼容别名。

Runner MUST 通过 `process.execPath` 启动 Node/tsx test surface；需要调用平台 command shim 时 MUST 使用显式 platform adapter。Windows `.cmd/.bat` 不得直接按 POSIX executable `spawn`。

### 3. focused 输入是显式 test file，绝不猜影响范围

`test:focused` 接受一个或多个 repository-relative `tests/**/*.test.ts`。

输入必须：

- 位于 repository `tests/` 下；
- 后缀为 `.test.ts`；
- 文件真实存在；
- 规范化后不能逃逸 repository root。

非法/空输入 exit non-zero。focused runner fixed concurrency=`1`。

### 4. affected 使用 closed source-controlled scope map，任何普通 scope 都不等于 full

`test:affected` 只接受以下固定 scope：

```text
shared
domain
persistence
facts
policy
cli
verification
```

多个 scope 取 test set union、去重、按 repository-relative path 排序后执行。未知 scope fail-closed。mapping 是源码内 closed constant，不是 Registry，也不从 Git diff 或 CodeGraph 动态推断。

F1 在 Proposal 阶段直接冻结 mapping pattern；Apply 不再决定 scope 语义：

```text
shared
→ tests/unit/**/*.test.ts
→ tests/integration/execution-model-lifecycle.test.ts
→ tests/integration/diagnostic-cli.test.ts
→ 明确不包含 tests/integration/diagnostic-cli-process.test.ts

domain
→ tests/unit/domain/**/*.test.ts
→ tests/unit/persistence/**/*.test.ts
→ tests/unit/facts/**/*.test.ts
→ tests/unit/policy/**/*.test.ts
→ tests/unit/diagnostics/**/*.test.ts
→ tests/unit/cli/**/*.test.ts
→ tests/integration/execution-model-lifecycle.test.ts
→ tests/integration/diagnostic-cli.test.ts

persistence
→ tests/unit/atomic-write.test.ts
→ tests/unit/persistence/**/*.test.ts
→ tests/unit/facts/**/*.test.ts
→ tests/integration/execution-model-lifecycle.test.ts

facts
→ tests/unit/facts/**/*.test.ts
→ tests/unit/policy/**/*.test.ts
→ tests/unit/diagnostics/**/*.test.ts
→ tests/unit/cli/**/*.test.ts
→ tests/integration/execution-model-lifecycle.test.ts
→ tests/integration/diagnostic-cli.test.ts

policy
→ tests/unit/policy/**/*.test.ts
→ tests/unit/diagnostics/**/*.test.ts
→ tests/integration/execution-model-lifecycle.test.ts
→ tests/integration/diagnostic-cli.test.ts

cli
→ tests/unit/cli/**/*.test.ts
→ tests/unit/diagnostics/**/*.test.ts
→ tests/integration/diagnostic-cli.test.ts
→ tests/integration/diagnostic-cli-process.test.ts

verification
→ tests/unit/verification/**/*.test.ts
→ tests/unit/external-command.test.ts
→ tests/integration/verification-commands.test.ts
```

其中 `shared` 是“横向依赖变化时的 broad affected set”，可以覆盖全部 unit tests 与代表性 integration，但它**不是** `test:full`：不会带入真实 package/install process surface。只有 `cli` 因其职责直接包含 installed CLI process contract，才显式带入 `diagnostic-cli-process.test.ts`；这仍只是 closed affected selection，不等于全部 unit/integration suite。

`verification` 是 F1 自己新增的 `scripts/verification.ts`、`scripts/quality.ts` 及直接 helper 的确定 coverage path。以后这些 tooling 发生 Change 时，不允许临时借用其他 alias 或选择 `none` 来跳过测试。

affected runner fixed concurrency=`2`。实现必须用 regression tests 冻结：未知 scope fail-closed、多 scope union/dedupe/sort、`shared` 不解析为 full suite、`verification` 覆盖 verification/quality tooling tests。

### 5. full suite fixed concurrency=4，并保留真实 package/process surface

`test:full` 等价于当前全部 `tests/unit/**/*.test.ts` + `tests/integration/**/*.test.ts`，但固定 Node `--test-concurrency=4`。

它必须包含 `diagnostic-cli-process.test.ts` 中的 npm pack/install + installed bin surface；不得因为它较慢就从 full suite 移除。

`npm test` 只转发到 `test:full`，避免保留第二个默认-concurrency full path。

### 6. Quality Guard 只有 hard failure 与 warning 两层

`npm run quality` hard checks：

1. `src/**`、`tests/**` 不得存在新增/手写 `.mjs` source/test；当前应为 0。
2. `package.json.bin.flowkit` MUST 精确为 `dist/bin/flowkit.js`。
3. `src/bin/flowkit.ts` 第一行 MUST 为 `#!/usr/bin/env node`。
4. `src/domain/**`、`src/policy/**` MUST NOT import `node:fs`、`node:fs/promises`、`fs`、`fs/promises`。

任一 hard failure → exit non-zero。

maintainability metrics 是 F1 required 的 **warning-only Soft Guard output**：必须计算，但绝不改变 correctness exit code。参考阈值：

| metric | warning | elevated warning |
|---|---:|---:|
| file effective LOC | 300 | 500 |
| function LOC | 60 | 100 |
| cyclomatic complexity | 10 | 15 |
| nesting depth | 4 | 6 |
| parameters | 5 | 8 |

metric source set 固定为手写生产源码 `src/**/*.ts`。算法使用 TypeScript compiler/scanner，并冻结为：

- file effective LOC：文件中至少包含一个 non-trivia TypeScript token 的唯一 source line 数；空行、纯 comment、shebang 不计；
- function LOC：FunctionDeclaration / FunctionExpression / ArrowFunction / MethodDeclaration / GetAccessor / SetAccessor / Constructor 节点范围内的 effective LOC；
- cyclomatic complexity：每个 callable 以 1 起始，对 `if`、循环、`catch`、非 `default` `case`、conditional expression，以及 `&&` / `||` / `??` 各加 1；
- nesting depth：上述结构化 control-flow（不含逻辑二元表达式）的最大嵌套层数；
- parameters：callable 声明参数数量。

实现 tests 必须用固定 fixtures 冻结 metric 结果。超过 threshold 时 MUST 输出 warning/elevated-warning；当前 legacy exceedance 只记录 debt，不导致 quality/verify failure，也不要求为了数字重构已批准业务语义。因为 F1 不拥有 Git-diff authority，本 Change 不实现“只对 modified code 的 hard no-regression gate”。

循环依赖、通用非法层级图与“模块职责过宽”不在本次 hard guard 中实现，保留 future input。

### 7. whitespace preflight 保持 Git boundary，不伪装 repository-only quality

`git diff --check` 与 staged 后的 `git diff --cached --check` 依赖 Git diff authority。detached snapshot 可能无 `.git`，因此：

- AGENTS 继续要求 Change Checkpoint 前执行两项 preflight；
- `quality` / `verify:change` 不把 Git absence 当产品 failure；
- F1 不创建 tracked-file registry、Git sidecar 或全仓 EOF scanner 来替代 Git diff。

### 8. verify:change 只跑 affected，不升级为 Full Test

`verify:change -- <scope...>` 执行：

```text
npm run quality（hard checks + required warning-only metrics）
selected affected tests
npm run typecheck
npm run lint
npm run build
openspec validate <active-change-id> --strict
canonical specs strict validation
```

scope 必须显式提供；verification/quality tooling 使用 `verification`。docs-only/确实无适用 test-bearing code 的 Change 可通过显式 `none` 模式跳过 affected tests，但仍运行 applicable static/OpenSpec checks，并在 verification.md 记录 tests not-applicable 的理由；`none` 不得与其他 scope 混用。

**verify:change MUST NOT 调用 `test:full` 或 `verify:full`。** Full suite 只有 F1 自身验收、明确诊断或 Owner-authorized Delivery Full Test 才执行。

OpenSpec CLI 是外部项目工具；runner 不 vendoring OpenSpec，不 import 其内部模块。

### 9. verify:full 是项目命令，不是 Flowkit authorization

`verify:full` 固定聚合：

```text
npm run quality
npm run typecheck
npm run lint
npm run build
openspec validate --all --strict
npm run test:full
```

执行顺序固定并 fail-fast；每步记录 status/duration。该命令成功只说明项目完整 Core verification 通过。

Flowkit Delivery Full Test 仍要求：

```text
all required Changes completed + checkpointed
→ awaiting-user-decision
→ Owner authorize
→ full-test Action
→ 项目工具执行 npm run verify:full
```

因此任何 Agent/Reviewer 单独运行 `npm run verify:full` 都不会自动创建 Full Test authority fact。

### 10. timing budget 只产生 warning/diagnosis

runner 记录 Node version、platform、arch 与 wall-clock duration。F1 参考 budget：

| check | target | warning |
|---|---:|---:|
| focused tests | 2s | 5s |
| affected tests | 30s | 60s |
| full tests | 30s | 60s |
| typecheck | 10s | 20s |
| lint | 10s | 20s |
| build | 10s | 20s |

超过 warning threshold 只输出 deterministic warning，不改变 command exit code。OpenSpec timing 记录但 F1 不冻结 hard budget。不同机器的 timing 不作为 Review correctness proof。

### 11. Full Test Plan 复用现有 Manifest coverage，不创造第二份流程状态

当前 Manifest fullTest plan 已列：unit、fixture integration、CLI contract、state transition matrix、atomic write/recovery、Lean Run、ResultRef、formal artifact path、verification layer、OpenSpec strict、lint、typecheck、build、forbidden `.mjs`。

F1 将这些项目映射为：

- unit/integration/state/recovery/Policy/CLI/Lean Run/ResultRef → `test:full`；
- forbidden `.mjs`、bin/shebang、domain/policy fs boundary → `quality`；
- OpenSpec → `openspec validate --all --strict`；
- lint/typecheck/build → existing scripts；
- verification layer contract → verification-script unit/integration tests + `verify:change` must-not-call-full regression。

`docs/verification-model.md` 记录该 executable mapping，Manifest goal/outputs 与 Policy 不变。

### 12. Core RC 是内部 candidate declaration，不是 npm prerelease publish

F1 Apply 创建 `docs/core-release-candidate.md`，至少冻结：

```text
candidate purpose
stable internal surface
non-goals
verification tooling contract
qualification boundary
Full Test failure handling
```

稳定 surface：

- domain types / fixed Action Catalog；
- `FormalFactSnapshot`；
- atomic persistence 与 Lean Run create/complete；
- Core-derived ResultRef；
- Policy `canRun / next / diagnose`；
- diagnostic read APIs/CLI；
- F1 quality/verification scripts。

该文件 MUST NOT 保存 checkpoint SHA、branch current SHA 或另一份 `fullTestStatus`。`package.json.version` 保持 `0.1.0`，F1 不 publish registry、不创建 tag。

F1 review-apply approved + Archive 后，Change Checkpoint Git boundary 识别 exact RC candidate bytes。Delivery Full Test passed 只 qualification 该 candidate；不重新生成 F1 output。

### 13. Full Test failed 使用 corrective Change，不 reopen F1

如果 checkpointed Core RC candidate 的 Delivery Full Test failed：

- `fullTestStatus` 按既有规则保持 failed；
- Owner 决定是否创建 corrective Change；
- corrective Change 修改 repository 后形成新的 checkpointed candidate state；
- 再次等待 Owner authorize Full Test；
- MUST NOT reopen archived/completed F1。

## Risks / Trade-offs

- 静态 affected mapping 比 dependency graph 粗，但确定、可审查、无新 authority；后续 CodeGraph Delivery 可替换“人工选择 scope”的体验，不能静默改变 F1 contract。
- fixed concurrency=4 来自当前 baseline，在极低资源机器可能更慢；timing 只 warning，因此不会把机器差异变成 correctness failure。
- maintainability metric 只 warning，不能立即偿还 1100+ LOC legacy debt；这是有意避免 F1 scope 被大规模重构吞噬。
- `verify:change` 依赖调用者显式选择 scope，可能选窄；Review/Verification 必须检查 scope 是否与 diff/contract 匹配。F1 不用 registry/graph 猜测来掩盖这个责任。
- RC 不发布 registry，适合当前内部 Delivery，但不是外部 release contract；真正 package release 留给未来 Delivery。

## Migration Plan

1. 在 Apply 中新增 verification/quality scripts 和 tests，保留现有命令兼容。
2. `npm test` 切到 fixed `test:full`，确认全 suite 在 Linux/Windows process surface 均可执行。
3. 更新 `docs/verification-model.md` 的 F1 executable mapping。
4. 创建 `docs/core-release-candidate.md`，冻结内部 stable surface。
5. 执行 F1 Change Verification：focused/affected + static/OpenSpec checks；F1 自身验收允许执行 `verify:full`，但必须明确记录“这是 F1 Change evidence，不是 Delivery Full Test authority fact”。
6. review-apply approved 后由 Owner 决定 Archive；Archive + Change Checkpoint 后才进入 Delivery Full Test lifecycle。
7. 不做 npm publish/tag/version migration。
