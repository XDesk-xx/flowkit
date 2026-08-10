# F1 Change Verification

<!-- flowkit-change-verification-status: passed -->

## 1. 验证范围

本记录覆盖 F1 `core-hardening-and-release-candidate` 的 verification layering、Quality Guard、跨平台 process surface、Full Test Plan 与内部 Core RC candidate。该记录属于 **F1 Change Verification**；不创建或推断 Delivery Full Test authority。

执行环境：

```text
platform: linux
arch: x64
Node: v22.16.0
Execution Context: detached
GitHub Base: efc045b31d55bed65b3ba4ae5793d884fdd127e7
```

## 2. 192 revise-apply 对 191 Findings 的关闭

### F1-RA-001 — filesystem hard invariant

- `scripts/quality.ts` 的 import extractor 已覆盖 TypeScript `ImportEqualsDeclaration` + `ExternalModuleReference`，因此 `import filesystem = require('node:fs')` 不再绕过 hard guard。
- 表驱动 regression 覆盖 `node:fs`、`node:fs/promises`、`fs`、`fs/promises` 四个禁止 module 的 import-equals 形式。
- adversarial probe 在仓库实际 TypeScript 配置下验证：`import filesystem = require('node:fs')` 可以 `tsc --noEmit`，随后 `quality` 必须 non-zero，并报告对应 `filesystem-boundary` hard failure。
- 既有 ESM import/export、dynamic `import(...)` 与 identifier `require(...)` 检测保持不变。

### F1-RA-002 — public `verify:full` final step

- `package.json` 的 public `verify:full` 统一为 `node --import tsx scripts/verification.ts verify:full`，不再通过 shell `&&` 单独拼接 final full step。
- 所有 full-plan steps 统一经过同一个 fail-fast runner，因此 final `full` 在成功和失败路径都会输出 terminal `status` 与 wall-clock `duration`。
- regression 使用可控 executor 让 final `full` 返回 non-zero，确认：
  - `verify:full` 返回同一 non-zero code；
  - 输出包含 `step: full status=failed duration=...`；
  - 顺序仍为 `quality → typecheck → lint → build → openspec-all → full`。
- full step 直接复用 `runNodeTests(resolveAllTests(...), 4, 'full')`，与 public `test:full` 使用相同的 full test set / fixed concurrency / batching 逻辑，不引入 Owner 或 `fullTestStatus` authority。

## 3. 194 revise-apply 对 193 Finding 的关闭

### F1-RA-003 — public `verify:full` 聚合执行可靠性

193 的复现说明：192 虽然修正了 terminal status/duration 语义，但仍把 final `full` 留在已经执行过 quality/typecheck/lint/build/OpenSpec 的长期 verification runner 进程内；独立 `test:full` / `verify:step full` 可完成，而完整聚合入口多次无法获得 terminal result。这是 orchestration process/resource lifecycle 隔离问题，而不是 full test set correctness 问题。

194 的最小修复：

- 保留 `verification.ts verify:full` 作为唯一 public orchestration runner 和 terminal-status authority；
- 保留 frozen order：`quality → typecheck → lint → build → openspec-all → full`；
- final `full` 不再在长期 parent runner 内直接调用 `runNodeTests(...)`；
- final `full` 通过已有 `runPlatformCommand` 启动隔离的 public `npm run test:full` 子进程；
- Windows 继续通过既有 `.cmd/.bat → ComSpec/cmd.exe` adapter，不重新引入 `shell: true`；
- parent runner 捕获 child exit code 与 wall-clock，并统一输出：
  - `step: full status=passed duration=...`
  - 或 `step: full status=failed duration=...`
- full test set、fixed concurrency=4、三批 batching 与 `test:full` contract 均未改变。

回归同时固定：

- full-plan 最后一步必须解析为一个隔离的 public `npm run test:full` process；
- 可控 child non-zero 会原样传播为 `verify:full` non-zero，并留下 `failed + duration`；
- 不新增永久 full-suite case，保持 611-test full-set equivalence。

## 4. Focused / affected Change Verification

- 191 Findings focused regression：passed，13/13。
- final `npm run verify:change -- verification`：exit code 0，passed。
  - `quality`：hard failures 0；legacy maintainability debt 仅 warning/elevated-warning。
  - `test:affected -- verification`：20/20 passed，约 3.7s。
  - `typecheck`：passed，约 4.35s。
  - `lint`：passed，约 3.29s。
  - `build`：passed，约 2.12s。
  - current Change OpenSpec strict：passed。
  - canonical specs strict：9/9 passed。
  - 未以该命令运行 Delivery Full Test。

## 5. Full project verification evidence

194 修复后，public `npm run verify:full` 连续完整执行均返回 exit code 0；最终确认的两次独立执行分别约 36.6s / 36.9s，总入口都产生 terminal result：

```text
quality                     passed
typecheck                   passed
lint                        passed
build                       passed
OpenSpec --all --strict     passed (10/10)
full                        passed
```

每次 final full step 都保持同一 full-set contract：

```text
fixed concurrency           4
full-batch 1                3/3 passed
full-batch 2                2/2 passed
full-batch 3                606/606 passed
total                       611/611 passed
full-tests timing           ~23.5s / ~23.6s
step: full                  status=passed duration=~24.0s / ~24.1s
```

这次完整 `verify:full` 仅作为 **F1 Change-level hardening evidence**。即使完整 Core suite 已运行，也不自动成为 Delivery Full Test。

## 6. Contract / boundary checks

- Windows `.cmd/.bat` adapter：unit regression passed；Windows launcher 使用 `ComSpec/cmd.exe`，不把 `.cmd/.bat` 当 POSIX executable。
- npm-installed CLI regression 保持覆盖真实 `npm pack → local npm install → node_modules/.bin/flowkit` surface。
- `AGENTS.md` 仍保留 Windows launcher 与 Change Checkpoint `git diff --check` / `git diff --cached --check` 规则。
- detached `quality/verify` 没有执行或伪造 Git checkpoint authority。
- 未新增 Registry、dependency DB、CodeGraph、Archify、automatic Full Test、automatic Archive/Checkpoint/Commit/Push。
- 未修改 D1 Policy、Owner authorization 或 `fullTestStatus` 语义。
- `docs/core-release-candidate.md` 仍表示 F1 内部 RC candidate；没有 npm publish、Git tag 或 tracked checkpoint SHA。

## 7. Delivery Full Test

```text
Delivery Full Test: NOT RUN
Owner-authorized full-test Action: NOT ENTERED
fullTestStatus mutation: NONE
```

F1 中执行 `verify:full` / 完整 Core suite 只属于 Change Verification evidence。Delivery Full Test 仍必须等待 F1 completed + archived + checkpointed、Delivery ready 且 Owner 再次明确授权；它只 qualification 已 checkpoint 的 RC candidate。

## 8. 总体结果

F1 Change Verification：**passed**。
