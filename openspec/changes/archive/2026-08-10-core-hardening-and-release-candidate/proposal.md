## Why

E1 checkpoint 后，Deterministic Core 已具备稳定的 domain/state、formal facts、Lean Run、Policy 与只读 diagnostic CLI，但当前项目级验证仍只有 `npm test / typecheck / lint / build` 四个粗粒度入口：小修改无法稳定选择 focused / affected 范围，完整 suite 依赖 Node 默认 concurrency，在 F1 Explore 的 detached Linux 基线中曾出现超过 180 秒未完成，而固定 concurrency 下同一 594-test suite 可稳定在约 19–31 秒通过。与此同时，Delivery Manifest 已要求 F1 完成“测试层次覆盖、固定 Full Test Plan、core release candidate”。

F1 因此需要把已经冻结的 Verification 分层真正落实为项目工具 contract，并形成一个在 F1 自身完成/checkpoint 前已经存在的内部 Core RC candidate。Delivery Full Test 继续保持 Delivery-level owner authorization boundary，只负责在 F1 checkpoint 之后 qualification 这个既有 candidate；它不负责产生 F1 required output，也不反向阻塞 F1 completion。

185 `review-explore` 已批准 184 修订后的 Explore，Blocking Findings 为 0，并明确允许进入 `propose`。本 Proposal 不修改 Manifest goal / outputs，不把实现参考中更宽的所有 Quality/Performance 建议自动升级为 Delivery scope；只冻结完成当前三项 F1 output 所需的最小工程 contract。

## What Changes

- 新增稳定的项目级验证入口：`npm run test:focused -- <test-file...>`、`npm run test:affected -- <scope...>`、`npm run test:full`、`npm run quality`、`npm run verify:change -- <scope...>`、`npm run verify:full`。
- `test:focused` 只接受显式 repository-relative `tests/**/*.test.ts` 文件，不做影响范围猜测；`test:affected` 只接受 source-controlled closed scope set `shared/domain/persistence/facts/policy/cli/verification`，并把 alias 映射为确定 test set。`shared` 是 broad affected set，但明确不是 full suite；`verification` 专门覆盖 F1 新增的 verification/quality tooling。F1 不建立 Test Registry、Affected Registry、依赖数据库，也不集成 CodeGraph。
- 固定 Node test runner concurrency：focused=`1`、affected=`2`、full=`4`。`npm test` 改为 `npm run test:full` 的兼容入口，避免继续依赖机器默认 concurrency。
- `test:full` 必须包含全部 unit/integration tests，包括 npm pack/install/real installed CLI launcher process surface；Windows `.cmd/.bat` launcher 测试继续走真实 command processor 语义，不允许用 Linux-only invocation 绕过。
- `quality` 只把当前已经存在的 correctness/architecture invariant 作为 hard failure：禁止新增手写 `src/**` / `tests/**` `.mjs`；`package.json.bin.flowkit` 必须仍指向 `dist/bin/flowkit.js`；CLI source 必须保留 Node shebang；`src/domain/**` 与 `src/policy/**` 不得直接 import Node filesystem modules。作为 184 Explore 已明确要求在 Proposal/implementation 冻结的 Soft Guard，`quality` **必须**确定性计算 file/function size、complexity、nesting、parameter count，并在超过 reference threshold 时输出 warning/elevated-warning；这些 warning 不改变 exit code，也不成为新的 Flowkit state。
- F1 Explore 的 maintainability 阈值冻结为 warning-only reference：file effective LOC `300/500`、function LOC `60/100`、complexity `10/15`、nesting `4/6`、parameters `5/8`。当前 legacy exceedance 被视为已知 debt；F1 必须报告这些 metrics/warnings，但不为了满足数字强制拆分既有 D1/Q1/E1 代码，也不把这些 warning 升级为 hard gate。
- `verify:change` 聚合当前 Change 的 applicable hard checks + affected tests，但必须由调用者显式提供一个或多个 frozen scope（或显式 `none`）；verification/quality tooling 变化使用 `verification` scope。任何合法 affected scope 都不得解析为完整 full suite，`verify:change` 也不得调用 `test:full`。`verify:full` 是项目工具级完整 Core verification command，聚合 quality hard guards、typecheck、lint、build、OpenSpec strict 与 `test:full`。
- 固定验证耗时的 measurement/warning contract：记录 wall-clock duration 与环境信息；focused 目标 2s / warning 5s，affected 目标 30s / warning 60s，full target 30s / warning 60s，typecheck/lint/build 单项 target 10s / warning 20s。超预算只产生 warning/diagnosis，不造成 correctness failure。
- `git diff --check` / `git diff --cached --check` 继续作为 Change Checkpoint 前 Git preflight，由 AGENTS/Git boundary 执行；因为 detached snapshot 可以没有 `.git`，F1 不把该命令硬塞进 repository-only `quality` 或 `verify:change`。
- 固定 Delivery Full Test Plan 的执行入口为 `npm run verify:full`，并明确现有 Manifest plan 中 state transition / atomic recovery / Policy / CLI contract 等行为覆盖由 full unit/integration suite 承担；OpenSpec strict、lint、typecheck、build、forbidden `.mjs` 由相应项目检查承担。执行该命令作为 Delivery Full Test 仍必须等待所有 required Changes completed + checkpointed 且 Owner 明确授权。
- 新增 `docs/core-release-candidate.md` 作为 F1 内部 RC candidate 声明：记录下一 Delivery 可依赖的稳定 Core surface、非目标以及 qualification 边界。它不写自引用 Git SHA，不要求 `0.1.0-rc.*` version bump，也不 publish npm registry。
- F1 required RC output 在 F1 review/archive/checkpoint 前已经形成；F1 Change Checkpoint 的 Git boundary 最终标识该 reviewed candidate。Delivery Full Test passed 只表示该 checkpointed candidate 获得 Delivery-level qualification/acceptance。若 Full Test failed，按既有规则新建 corrective Change，不 reopen F1。
- 保留 Owner 本次要求已经加入 `AGENTS.md` 的 Windows launcher 与 EOF/whitespace 规则；F1 不把它们升级成新的 workflow authority。

## Capabilities

### New Capabilities
- `flowkit-core-hardening-and-release-candidate`: 定义 F1 的 verification-layer scripts、确定性 test scope/concurrency、最小 Quality Guard、timing warning contract、固定 Full Test Plan 与内部 Core RC candidate lifecycle。

### Modified Capabilities
- 无。现有 `flowkit-bootstrap-and-roadmap`、`flowkit-core-model`、`flowkit-policy-engine` 的 Delivery Full Test / Owner authorization / corrective Change 规则保持不变；F1 只提供这些既有流程规则所消费的项目工具和 candidate。

## Impact

- 主要 tooling：`package.json` scripts、`scripts/verification.ts`、`scripts/quality.ts` 及少量静态 scope mapping/helper。
- 主要测试：verification script argument/scope/concurrency contract、quality hard/warning contract、cross-platform process invocation、`verify:change` 不运行 full、`verify:full` 完整集合。
- 文档：`docs/verification-model.md` 增加 F1 脚本与 Full Test Plan 映射；新增 `docs/core-release-candidate.md`。
- OpenSpec：新增 `flowkit-core-hardening-and-release-candidate` capability，不改 D1 Policy 业务语义。
- 不新增运行时依赖；继续使用 Node.js 22、TypeScript、现有 ESLint/Test runner/OpenSpec CLI。
- 不新增 Registry / plugin platform / dependency DB，不接入 CodeGraph/Archify，不自动 Full Test、Archive、Checkpoint、Commit 或 Push。
