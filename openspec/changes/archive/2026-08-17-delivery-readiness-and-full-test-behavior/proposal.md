# Proposal — delivery-readiness-and-full-test-behavior

## Why

02 已经能够完整关闭单个 Change，并留下 Delivery `fullTestStatus`、Owner authorization、Checkpoint 与技术 `verify:full` 的桥接事实，但所有 required Changes 完成并 checkpoint 后仍会停在 `ambiguous-state` / `delivery-behavior-not-implemented`。A1 需要把这条桥接补成真正的 Delivery Ready → Owner authorization → Full Test terminal result machine behavior，同时保持 Full Test 不是 Change Action/Run。

## What Changes

- 将“all required Changes completed + checkpointed + formal facts consistent + valid per-Delivery Full Test execution contract available”确定性投影为 Delivery Ready；当持久化状态仍为 `not-ready` 时，当前 effective Full Test lifecycle projection 进入 `awaiting-user-decision`，read-side 本身不写 Manifest。
- 保留现有 delivery-scoped `authorize-full-test` Owner authority；授权记录只有在 current Policy 正在请求该 exact decision 时才能写入，并与 `fullTestStatus=authorized` 在同一次 atomic Manifest publication 中完成，不自动执行 Full Test。
- 为 Policy 增加一个非 Standard Action 的 Delivery behavior result：`kind=delivery-behavior, behavior=full-test`。Standard `FormalAction` / `canRun` / Standard Run / Delivery-wide NNN 均不新增 `full-test`。
- 增加显式 operator surface `flowkit delivery full-test`：只有 current Policy 正好返回上述 Full Test behavior 时才执行一次 Full Test，并在 terminal publication 后返回控制；`status/next/doctor/resume-context` 继续严格 read-only。
- `verification.fullTest.plan` 继续只表示 Delivery coverage intent；新增 typed **per-Delivery execution contract**，由 `createDelivery` 调用方提供并持久化。A1 对已经启动的当前 03 Delivery 做 bounded migration，实例绑定为 `id=project-full-verification`、`kind=command`、`command=npm`、`args=[run, verify:full]`、`launcherMode=npm-shim`、`scope=delivery`、`timeoutMs=120000`、`resultProtocol=flowkit-full-test-result-v1`、`resultAuthority=verification`、`expectedTerminalStatuses=[passed, failed]`。这些值只是当前 03 instance，不是未来 Delivery 的 repository-global 常量。`launcherMode` 是该同一 execution contract 的 bounded platform-launch semantics：`direct` 表示按 persisted command 执行；`npm-shim` 仅允许 logical `command=npm`，non-win 解析为 `npm`，win32 确定性解析为 `npm.cmd`，再复用既有 `.cmd/.bat → ComSpec` 机制。它不是第二套 Windows/Linux Full Test truth。
- Formal Full Test execution **实际 spawn 当前 Delivery 持久化的 logical command/args，并按同一 contract 的 launcherMode 做确定性 platform normalization**；Flowkit 通过固定协议环境变量 `FLOWKIT_FULL_TEST_RESULT_PATH` 要求同一物理进程写出 `flowkit-full-test-result-v1` structured result。A1 不在 `flowkit delivery full-test` 内另行调用 `verifyFullPlan()`/internal runner 作为第二执行 authority，也不解析未冻结的人类 stdout 文本。
- 当前工程 `npm run verify:full` 仍保留为兼容的人类/工程 CLI；当 `FLOWKIT_FULL_TEST_RESULT_PATH` 存在时，同一 `scripts/verification.ts verify:full` physical route 额外原子写 structured result file。无该环境变量时保持现有人类输出/exit behavior。两者共享同一物理执行路径，不形成第二套 Full Test truth。
- Full Test terminal Manifest projection 冻结为一个闭合 schema：`schemaVersion`、overall `status`、`summary`、`totalDurationMs`、按实际执行顺序排列的 `checks[{id,status,durationMs}]` 与 content-addressed `resultRef`。Raw stdout/stderr、generated `dist/**` 和 attempt history 不进入 Manifest。
- `resultRef` 精确定义为 `verification:full-test:<sha256>`：hash input 是**排除 `resultRef` 字段**后，由 Writer/Reader 共同构造的固定字段顺序 JSON object `{schemaVersion,status,summary,totalDurationMs,checks}`；每个 check object 固定字段顺序 `{id,status,durationMs}`；`checks` 保持 structured report execution order；所有 duration 为非负整数毫秒；对该 object 使用无空白、无 trailing newline 的 UTF-8 `JSON.stringify` bytes 做 SHA-256 lowercase hex。Reader MUST 用同一规则重算并 fail closed on mismatch。
- `authorized` 仍是唯一正常 pre-terminal resumable Full Test lifecycle state。只有已证明旧 process tree terminal 的情况才允许从它做 bounded at-least-once re-entry：spawn-failed（未创建 process）、normal exited 后 protocol failure、non-Windows timeout 已确认 launcher terminal、或 Windows owned process-tree canceller 已确认 `timed-out-cancelled`。Windows timeout 若 whole-process-tree termination 无法证明，Flowkit MUST 原子写入唯一 current `verification.fullTest.executionBlock`（`schemaVersion=1, reason=outcome-unknown, summary`），raw status 仍为 `authorized`，但 Policy/Operator MUST fail closed 并禁止新 Full Test attempt；该 latch 不是 `running` state、attempt ledger 或 history；A1 不自动清除它，且不在本 Change 引入新的 recovery workflow。ignored/generated `dist/**`、旧 result file 或旧 stdout 不得成为 lifecycle authority。
- 只有同一 child 已产生合法 `flowkit-full-test-result-v1` 且 protocol `status=failed` 与 child terminal exit 一致时，才允许原子发布 durable `failed + resultRef + structured timing/check projection`。spawn failure、`timed-out-cancelled`、`outcome-unknown`、missing/malformed/stale/mismatched protocol 都属于 execution/transport failure，MUST NOT 合成 Verification `failed` 或 `resultRef`；其中 safe-terminal failures 保持 `authorized` 可重入，`outcome-unknown` 进入 executionBlock。B1 后续只消费 genuine Verification-owned failed terminal projection。
- 对 current 03 与 future-Delivery-shaped fixture 都增加物理 regression；Formal Change Verification 必须实际执行 `flowkit delivery full-test` route 的 affected tests，并通过反事实 route-break sentinel 证明 public operator 确实 spawn persisted binding 且消费 structured protocol。Change Verification 技术执行不得冒充 Owner-authorized Delivery Full Test lifecycle result。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `flowkit-core-model`：把 03 前 Full Test bridge 更新为完整 Delivery Ready / authorized execution / terminal result / bounded re-entry contract，同时保持 no-Action / no-Run。
- `flowkit-policy-engine`：扩展 `PolicyResult` 的互斥 union，增加 `delivery-behavior: full-test`，并让 no-active-change 分支从 readiness → Owner gate → executable behavior 确定推进。
- `flowkit-formal-fact-reader-and-persistence`：读取/验证 Full Test coverage intent + per-Delivery execution contract + closed terminal result/resultRef，并允许 bounded atomic update `fullTestStatus` / result metadata。
- `flowkit-delivery-change-creation-and-owner-input`：让 Delivery creation 持久化 caller/Delivery-contract supplied Full Test execution contract；扩展 authorization-only write-side，使 exact `authorize-full-test` record 与 `authorized` 状态原子发布，同时继续禁止自动执行 Delivery behavior。
- `flowkit-diagnostic-cli`：稳定呈现新增 `delivery-behavior` PolicyResult；四个 diagnostics 继续 read-only。
- `flowkit-change-cli-end-to-end-and-performance`：保持 Change operator 单 Action/单 Run 边界，同时允许独立的 `flowkit delivery full-test` Delivery operator；物理 E2E 必须证明该 route 不创建 Standard Run，并证明 breaking persisted execution route 会让 selected tests fail。

## Impact

- 主要影响 `src/domain/**`、`src/facts/**`、`src/policy/**`、`src/persistence/**`、`src/services/**`、`src/cli/**`、`src/diagnostics/**`、`scripts/verification.ts`、Change Verification module mapping 与对应 unit/integration tests。
- 当前 03 Delivery Manifest 会获得一个 bounded migrated execution contract；现有 `verification.fullTest.plan` coverage strings 原样保留，不作为 executable authority。
- Future `createDelivery` input 增加 typed Full Test execution contract（含 bounded `launcherMode=direct|npm-shim`），Writer 只持久化 caller supplied values，不硬编码 `npm run verify:full` / `120000`。
- 不新增 npm/runtime dependency，不引入 Tool/Skill/Behavior/Verification Registry，不引入 dynamic command discovery、第二 plan compiler、`_delivery/**` Run、Full Test Run、attempt ledger、Evidence platform、自动 Owner authorization、自动 corrective Change、Delivery Finalize 或 Archify 行为。唯一新增 exceptional safety latch 是 current `executionBlock`，只在 process-tree outcome unknown 时存在，不记录 attempt history。
- A1 继续使用 02 已解析的 OpenSpec executable identity；C1 才负责 managed/offline external-tool migration。
