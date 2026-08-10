# F1 Explore：Core Hardening / Quality / Performance / Release Candidate

## 1. 基本信息与进入边界

- Delivery：`20260806-01-deterministic-core`
- Change Key：`F1`
- 当前 canonical Change ID：`core-hardening-and-release-candidate`
- Action：`explore`
- Execution Context：`detached`
- Base：`efc045b31d55bed65b3ba4ae5793d884fdd127e7`（Owner 本次明确提供）
- 前置 Change：`E1 diagnostic-cli` 已 `completed`
- Delivery-wide 前一正式 Run：`20260806-181-archive`
- 当前修订 Run：`20260806-184-revise-explore`
- Source Review：`20260806-183-review-explore`（`changes-requested`，2 个 `author-actionable` blocker）

当前上传的 checkpoint repository snapshot 不包含 `.git`。因此本地 `git-boundary-reader` 无法从 Git topology 验证 E1 Change Checkpoint，正常 Policy 可能因缺 Git authority 投影而无法自行进入 F1。

Owner 已在本次会话明确：

1. Base 更新为 `efc045b31d55bed65b3ba4ae5793d884fdd127e7`；
2. 即使 detached 环境正常 Policy 可能进不了 F1，也授权 Author 进入 F1 Explore；
3. 以本次上传的最新分支代码和实现参考为调查基线；
4. 不访问 GitHub；
5. 把 E1 canonical admission 暴露的 Windows launcher 与 EOF whitespace 两条工程规则同步到仓库 `AGENTS.md`。

因此本次只做 Bootstrap/manual activation：Manifest `F1 planned → active`，创建 F1 canonical Change path 与 `182-explore` Run，并同步上述两条 `AGENTS.md` Agent 操作约束。

**本次授权不修改 Policy，不建立 checkpoint sidecar，不把聊天或 snapshot 当成新的 Git authority。**

---

## 2. Authority 与 F1 范围输入

### 2.1 Canonical Manifest 与实现参考存在表述宽度差异

当前 Delivery Manifest 的 F1 是：

```text
id: core-hardening-and-release-candidate
goal:
  完成测试层次覆盖、固定 Full Test Plan 并发布内部 core release candidate。
outputs:
  单元测试 / fixture 集成测试 / CLI 契约测试 / 恢复测试
  固定 Full Test Plan
  core release candidate
```

本次 Owner 提供的《Deterministic Core Delivery — 重规划实现参考》对 F1 的设计输入更宽，包含：

```text
Project Quality Guard
代码尺寸 / 函数尺寸 / 复杂度 / 架构依赖 guard
focused / affected / full verification scripts
verification timing / performance budget
Core release candidate
```

该参考明确声明自己是“后续执行参考，不替代正式 Delivery Manifest、OpenSpec Change 或 Flowkit Policy”。因此 Explore 可以调查这些内容，但不能在本阶段静默把 Manifest 参考项全部升级为 frozen contract。

Proposal 可以继续细化**已经由当前 Manifest 授权的 F1 goal / outputs**，但不得自行把参考文档升级为新的 Delivery scope authority。进入 Proposal 时必须先对候选内容做 authority 分类：

- 如果某项只是实现当前“测试层次覆盖 / Full Test Plan / core release candidate”所必需的技术细化，并且不改变 Manifest goal / outputs 的语义边界，Proposal 可以在现有 authority 内冻结具体 contract；
- 如果某项需要实质增加或改变 Manifest goal / outputs、Delivery acceptance 或其他 frozen Delivery scope，必须明确标记为 `owner-decision-required`，并在获得 Owner 独立决定前停止把该项冻结成 F1 正式 scope；
- 如果某项既非当前 scope 的必要细化、也没有 Owner 扩 scope 决定，则只能保留为 future/deferred input，不进入 F1 required work。

因此，**Proposal 无权自行更新 Manifest 来创造新的 scope authority**。如果后续确需 Manifest scope mutation，先停在 Owner boundary；Owner decision 到位后，再决定是否需要一次最小 contract reconciliation。

本次 Explore 不重命名 canonical Change ID，不修改 F1 goal/outputs，只激活 `state`。

### 2.2 F1 继续继承的硬边界

必须保持：

```text
One fact, one authority
Run = lightweight execution envelope
OpenSpec = Change contract authority
Verification = verification result authority
Git = bytes / history / checkpoint authority
Policy = 当前合法 boundary authority
```

F1 不得为了 Quality / Verification 再建立：

```text
Gate Registry
Quality Registry
Provider / Skill Registry
通用 Evidence / Receipt 平台
新的 workflow state authority
CodeGraph replacement
自动 Review / Revise loop
自动 Full Test
自动 Commit / Push
```

---

## 3. 当前 Quality Guard 基线

### 3.1 当前项目只有通用 lint / typecheck / build，没有项目级 Quality Guard

`package.json` 当前只有：

```text
npm run build
npm run typecheck
npm test
npm run lint
```

不存在：

```text
test:focused
test:affected
test:full
quality
verify:change
```

`eslint.config.mjs` 只启用：

```text
@eslint/js recommended
typescript-eslint recommended
```

当前没有项目级：

```text
file/function size
cyclomatic complexity
nesting depth
parameter count
architecture dependency
forbidden source extension
verification cost
```

guard。

### 3.2 已有 correctness / architecture invariant 中有一部分天然适合作为 Hard Guard

当前事实：

- `src/**` 与 `tests/**` 手写 `.mjs` 数量：`0`；
- `src/domain/**`、`src/policy/**` 当前没有直接 `node:fs` / `fs` import；
- `typecheck`、`lint`、`build` 当前均可独立执行；
- OpenSpec strict 当前 `9/9` 通过。

这些已经是现有 Delivery contract / architecture 的明确不变量，Proposal 可以考虑用 ESLint 或小型 deterministic script 固化，而无需 Gate Registry。

但“循环依赖”“非法层级依赖”的精确定义目前没有单独 machine-readable architecture graph。F1 若实现，只应使用仓库内确定性 import 分析或已有 compiler information，不得顺手引入 CodeGraph 集成。

---

## 4. Maintainability baseline：先测现状，再决定阈值

本次使用 TypeScript AST + 简单 effective-LOC 统计对当前 41 个生产 `.ts` 文件做一次 Explore 采样。该统计用于 Proposal 输入，不是永久 metric definition；最终 effective LOC、complexity 与 function boundary 的算法必须在 Proposal/implementation 中确定性冻结。

### 4.1 文件尺寸

当前采样：

| 指标 | 结果 |
|---|---:|
| 生产 `.ts` 文件 | 41 |
| effective LOC > 300 | 6 |
| effective LOC > 500 | 4 |
| 最大文件 | `src/persistence/run-persistence.ts` |
| 最大 effective LOC | 约 1317 |
| 第二大文件 | `src/facts/formal-fact-reader.ts`，约 1104 |
| `serialization.ts` | 约 795 |
| `result-ref-adapter.ts` | 约 629 |

结论：参考中的 `300 warning / 500 hard` 如果直接对全仓库生效，会立刻把 4 个现有核心文件变成 hard failure。这与参考本身的 grandfather 原则冲突。

### 4.2 函数尺寸 / complexity / nesting / 参数

当前 AST 近似采样：

| 指标 | 结果 |
|---|---:|
| 函数/方法节点 | 387 |
| > 60 行 | 19 |
| > 100 行 | 4 |
| complexity > 10 | 31 |
| complexity > 15 | 12 |
| nesting depth > 4 | 3 |
| nesting depth > 6 | 0 |
| parameters > 5 | 4 |
| parameters > 8 | 0 |

高信号样本：

```text
src/persistence/serialization.ts
  validateContextFile
  ≈ 230 lines
  estimated complexity ≈ 53

src/facts/formal-fact-reader.ts
  readC1Run
  ≈ 91 lines
  estimated complexity ≈ 24
  parameters = 7

src/facts/yaml-parser.ts
  splitFlowItems
  estimated nesting depth = 6
```

结论：F1 不应把参考阈值机械设置成“全量 hard gate”。更合理的 Proposal 输入是：

```text
existing baseline
→ grandfather / debt inventory

new or materially modified code
→ warning / hard threshold

legacy over-threshold file
→ no-regression / do-not-worsen
```

同时禁止为了满足行数而无意义拆文件。

---

## 5. Verification cost baseline

### 5.1 环境

本次 detached Linux 环境：

```text
Node.js v22.16.0
npm 10.9.2
TypeScript 5.9.3
OpenSpec 1.7.0 (offline tool)
```

以下是单次 wall-clock Explore 采样，仅用于建立数量级，不应直接当成永久 SLA。

### 5.2 当前命令耗时

| 检查 | 本次采样 | 状态 |
|---|---:|---|
| focused proxy：`external-command.test.ts` | ~0.87s | passed, 3/3 |
| affected proxy：E1 两个 diagnostic integration files | ~12.96s | passed, 8/8 |
| `npm run typecheck` | ~4.46s | passed |
| `npm run lint` | ~3.49s | passed |
| `npm run build` | ~2.27s | passed |
| OpenSpec `validate --all --strict` | ~0.68s | passed, 9/9 |

当前尚无正式 `test:focused` / `test:affected`，所以前两项只是 Explore proxy，不构成脚本 contract。

### 5.3 当前完整 project suite 存在明显的并发/进程成本信号

当前 `npm test` 使用 Node test runner 默认 concurrency：

```text
node --import tsx --test "tests/unit/**/*.test.ts" "tests/integration/**/*.test.ts"
```

在本次 detached 环境中：

- 默认 `npm test` 超过 180 秒仍未完成，本次采样被停止；
- 同一 594-test suite 使用 `--test-concurrency=1`：约 30.74s，594/594 passed；
- `--test-concurrency=2`：约 18.99s，594/594 passed；
- `--test-concurrency=4`：约 18.74s，594/594 passed；
- 单独 `diagnostic-cli-process.test.ts`：约 12.09s，说明 npm pack/install/real-process surface 是显著慢项。

**Explore 不据此冻结根因。** 当前证据只说明：

1. verification cost 不能只看测试数量；
2. process/package integration test 与 Node test concurrency 的组合需要 F1 Proposal 明确策略；
3. `test:focused` / `test:affected` 应避免无理由带入最慢的发布面测试；
4. `test:full` 需要确定性的 concurrency / slow-test 分类，而不是依赖机器默认值。

F1 不应因为“更安全”把每个 focused 修改都升级为 594-test project suite。

---

## 6. E1 canonical admission 暴露的两条工程经验

E1 Checkpoint 前在真实 Windows canonical 环境暴露了两类低层工程问题：

### 6.1 Windows `.cmd/.bat` launcher

真实 npm-installed CLI process test 在 Windows 中不能把 `.cmd/.bat` 默认当作 POSIX 普通 executable。测试必须覆盖真实平台 launcher / command processor 语义。

这是 test/process harness 工程约束，不是 Flowkit Policy 概念。

### 6.2 Checkpoint whitespace / EOF preflight

E1 在 checkpoint 暂存后由 `git diff --cached --check` 发现 canonical spec EOF 多余空白行。该 defect 不改变 OpenSpec 语义，但会阻塞 Git admission。

这说明低成本文本卫生检查应在 checkpoint 前稳定执行，而不应等最终 commit 才偶然暴露。

Owner 本次明确要求把这两条写入 `AGENTS.md`。本 candidate 已同步为仓库级 Agent 操作规则；它们不拥有 Policy/OpenSpec authority。

Proposal 还应评估是否把对应低成本检查纳入 `quality` / `verify:change`，但不得因为写入 AGENTS 就自动升级为新的 Core workflow state。

---

## 7. Verification scripts 的最小设计问题

参考建议：

```text
npm run test:focused -- <scope>
npm run test:affected -- <scope>
npm run test:full
npm run quality
npm run verify:change
```

当前仓库没有这些 scripts。F1 Proposal 应冻结的是**可执行且不产生第二流程 authority**的最小 contract。

### 7.1 focused

需要回答：

- `<scope>` 是 test file、模块名还是 deterministic scope alias；
- 能否直接复用 Node test runner，而不是创建测试 registry；
- 是否默认包含低成本 typecheck/lint slice；
- Windows/Unix 参数传递是否一致。

### 7.2 affected

F1 明确不集成 CodeGraph，因此不能承诺通用 dependency impact engine。

候选方向：

```text
显式受影响 test file / module scope
+ 少量仓库内 deterministic mapping
```

而不是：

```text
动态依赖数据库
Affected Registry
CodeGraph substitute
```

Proposal 必须证明 affected scope 能可靠使用，否则宁可先提供明确参数化脚本，也不要伪装“自动影响分析”。

### 7.3 full

需要冻结：

- 固定 test runner concurrency；
- slow process/package tests 是否仍属于同一 full command；
- 如何保证 Windows launcher surface 不被 Linux-only invocation 绕过；
- Full Test command 与 Delivery Full Test Action 的区别。

`npm run test:full` 可以是项目工具命令，但**执行 Delivery Full Test 仍必须等待 Delivery ready + Owner authorization**。

### 7.4 quality / verify:change

`quality` 应聚合普通 deterministic tools，不成为 Gate Registry。

`verify:change` 应表达 Change Verification 的适用检查入口，但不能自动决定 Delivery Full Test，也不能把所有修改都无条件跑 full suite。

---

## 8. Quality Guard 的 Hard / Soft 分层候选

### 8.1 Hard Guard 候选

现有 contract 支持度较高：

```text
typecheck
build
OpenSpec strict
禁止新增手写 src/tests .mjs
禁止 domain / policy 直接文件系统写入
checkpoint whitespace preflight
```

需要 Proposal 进一步证明：

```text
非法层级依赖
循环依赖
```

的具体 import rule 与检测算法。

### 8.2 Soft Guard 候选

```text
file effective LOC
function LOC
cyclomatic complexity
nesting depth
parameter count
module responsibility width
verification timing budget
```

这些更适合作为 maintainability warning / no-regression signal；当前 baseline 已证明不应在未定义 grandfather 规则前直接全仓 hard fail。

### 8.3 不要为了 metric 重构 D1/Q1/E1 语义

F1 可以在 Reviewer/Proposal 明确认为必要时，对超大函数或文件做**纯结构重构**，但必须满足：

```text
behavior unchanged
focused/affected regression preserved
不借 quality threshold 重写已批准 lifecycle / authority 语义
```

Explore 不预先决定必须拆哪些文件。

---

## 9. Test growth policy 输入

当前 suite 已有 594 tests，但测试数量本身不是质量目标。

F1 Proposal 应把新增永久测试限制在：

```text
requirement necessary scenario
真实 regression
高风险边界
状态矩阵必要覆盖
并发 / 原子性不变量
跨模块契约
真实平台 process/package surface
```

优先：

```text
table-driven
shared fixtures
invariant/property-like checks
module matrix
```

避免 Reviewer 每指出一个措辞差异就永久堆叠重复 case。

---

## 10. Core RC 的真实未决问题

当前 package version 仍是 `0.1.0`，但“内部 core release candidate”尚没有正式发布 contract。

Proposal 必须明确 RC 在本 Delivery 的最小含义，例如需要回答：

- RC candidate 是 Git/文档上的内部稳定接口声明，还是 npm prerelease version；
- 是否允许/需要 `0.1.0-rc.*`；
- 哪些 API 被视为下一 Delivery 的稳定输入；
- **RC candidate 在 F1 内形成/冻结需要哪些 F1-level 条件**（例如 F1 implementation、Change Verification、Review 等）；
- **Delivery Full Test passed 只负责对已经存在并已 checkpoint 的 RC candidate 做 Delivery-level qualification / acceptance，不负责产生 F1 required RC output**；
- 是否需要真正 publish registry（当前 Delivery scope 没有 package publishing integration）。

必须保持无环 ordering：

```text
F1 implementation
→ 形成 Core RC candidate
→ F1 Change Verification / review-apply
→ archive
→ F1 Change Checkpoint
→ Delivery ready
→ Owner authorize Delivery Full Test
→ Delivery Full Test
→ RC candidate 获得 Delivery-level qualification / acceptance
→ Delivery finalization
```

因此，F1 的 `core release candidate` required output 必须在 F1 completed / checkpointed **之前已经存在**；Full Test 通过后不重新打开 F1，也不重新“生成”该 required output。若 Delivery Full Test 失败，按既有规则建立新的 corrective Change，而不是 reopen F1。

Explore 不自行发布 npm package，也不新增 release automation。

参考中建议暴露的稳定接口集合可作为 Proposal 输入：

```text
domain types
fixed Action Catalog
FormalFactSnapshot
atomic persistence
Lean Run create/complete
validated ResultRef
Policy canRun/next/diagnose
diagnostic read APIs
quality/verification scripts
```

---

## 11. F1 Proposal 必答问题

### F1-E1：正式 Scope reconciliation

Canonical Manifest 的 F1 wording 较窄，而实现参考包含 Quality Guard / performance。Proposal 必须区分：

- 当前 Manifest 已授权 scope 的必要技术细化；
- 需要改变 Manifest goal / outputs 或 Delivery scope 的候选扩展；
- future/deferred input。

只有第一类可以直接在 Proposal 冻结；第二类必须先标记 `owner-decision-required` 并停止在 Owner boundary，不能由 Proposal / Author 自行修改 Manifest 创造 authority。

### F1-E2：Quality Guard contract

冻结：

- hard vs soft；
- metric algorithm；
- threshold；
- grandfather / no-regression；
- architecture import boundaries；
- 输出/exit code。

### F1-E3：Verification scripts contract

冻结：

```text
test:focused
test:affected
test:full
quality
verify:change
```

的输入、实际命令、边界和失败语义；不建立 Registry / impact DB。

### F1-E4：Test concurrency 与 slow process tests

解释当前 default `npm test` 在 detached 环境的超时信号，冻结可复现的 full-suite concurrency / slow-test strategy；不得把一次机器测量直接当永久 hard SLA。

### F1-E5：Performance budget

至少冻结：

```text
target
warning
measurement method
machine/environment annotation
超预算 diagnosis
```

先 warning/record，避免机器抖动直接变 correctness failure。

### F1-E6：Windows / whitespace hygiene 的自动化位置

AGENTS 已冻结 Agent 行为。Proposal 决定哪些低成本检查还应进入 `quality` / `verify:change`，但不新增 Policy state。

### F1-E7：Core RC candidate definition 与 lifecycle closure

冻结 RC candidate 的 artifact/version/API/F1-level formation 条件，明确是否 publish，并证明生命周期无环：F1 必须在自身完成/checkpoint 前形成 required RC candidate；Delivery Full Test 只在之后对该 candidate 做 Delivery-level qualification / acceptance。不能把“内部 RC”解释成自动发布系统，也不能让 RC formation 依赖只有 F1 checkpoint 后才合法发生的 Delivery Action。

### F1-E8：Full Test Plan

冻结 Delivery Full Test 的具体项目命令和检查集合，但执行仍必须等待所有 required Changes completed + checkpointed 后的 Owner 明确授权。Full Test Plan 必须把测试对象描述为**已经由 F1 形成并 checkpoint 的 Core RC candidate**；`passed` 表示 Delivery-level qualification / acceptance，而不是创建 F1 required output。

---

## 12. F1 明确 Out of Scope

本 Explore 不建议 F1 实现：

```text
完整 Change Runner
自动 Review / Revise
自动 Full Test authorization
自动 Commit / Push / Merge
Delivery Finalize
Archify integration
CodeGraph integration
Provider / Skill / Gate Registry
通用 Evidence / Receipt
Task execution engine
动态 plugin platform
```

Quality / performance 只能作为普通 deterministic project tooling，不得成为新的 orchestration platform。

---

## 13. 本次 Explore 的建议方向

当前证据支持 F1 Proposal 沿以下最小主线收敛：

```text
1. 先把现有 correctness / architecture invariant 变成少量 Hard Guard
2. Maintainability 先 baseline + grandfather + no-regression，不全仓一刀切
3. 建立可实际运行的 focused / affected / full / quality / verify:change scripts
4. 控制 test concurrency 与 process/package slow surface，记录真实 verification cost
5. 把 Windows launcher + whitespace preflight 固化为工程卫生，而非新流程 authority
6. 冻结 Full Test Plan
7. 在 F1 自身完成前形成并冻结内部 Core RC candidate
8. F1 review / archive / checkpoint 后，才进入 Delivery ready → Owner-authorized Delivery Full Test
9. Delivery Full Test passed 只对既有 RC candidate 做 qualification / acceptance
```

其中 RC candidate 的具体 artifact/version/publish 表达必须由 Proposal 在现有 authority 内明确，Explore 不提前决定；但生命周期顺序已经冻结为**先形成 candidate，再完成/checkpoint F1，再执行 Delivery Full Test**。如果任何 Proposal 方案要求改变这个既有 Full Test 前置生命周期，必须进入 Owner decision boundary，而不能由 Author自行改动。

---

## 14. 本次 Action 边界

原 `182-explore` 的 baseline 调查事实保持有效；`184-revise-explore` 只响应 `183-review-explore` 的两个 `author-actionable` blocker：

- 修正 F1 scope reconciliation 的 Owner authority boundary，禁止 Proposal / Author自行扩大 Manifest；
- 修正 Core RC candidate 与 Delivery Full Test 的 lifecycle ordering，消除 F1 ↔ Full Test 循环依赖。

`184-revise-explore` 允许：

- 修改本 `explore.md` 中与上述两个 Finding 直接相关的 authority / lifecycle contract；
- 创建并完成 `184-revise-explore` Run；
- 保留 `182` 已完成的 Manifest activation 与 `AGENTS.md` 两条工程约束，不重复扩 scope。

本次不允许：

- 创建 Proposal / Design / Tasks / delta specs；
- 再次修改 Manifest goal / outputs 或 Delivery scope；
- 修改 production code 或 tests；
- 冻结 Quality threshold；
- 新增 verification scripts；
- 把 performance budget 变 hard gate；
- 运行 Delivery Full Test Action；
- Archive / Checkpoint / Commit / Push；
- 进入 F1 Apply 或发布 Core RC。
