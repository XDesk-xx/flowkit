## Why

A1→G1 已分别实现 Delivery control、managed external tools、Architecture lifecycle、Finalize、repository-only resume 与 single-action Agent Adapter，但 03 还缺少最后一个组合证明：一个从 fresh package/fresh checkout 启动的 stable Runner 能否在不依赖聊天、ambient PATH 或第二套 orchestration state 的前提下，把这些能力串成下一条真实 Delivery 可复用的完整闭环。G1 dogfood 还证明 Change archive→checkpoint 的 EOF-only mechanics 虽已有正确 Owner/Executor authority，却缺少 stable runner 可公开消费的 deterministic read-only exact-plan handoff。

## What Changes

- 冻结 stable `dist/bin/flowkit.js` 的 local distribution/fresh-consumer acceptance：`npm pack`（或等价 source-controlled local distribution）安装到独立 consumer 后，fresh repository 无需 source workspace `node_modules` 即可执行正式 diagnostics/Delivery/Change surfaces；Git exact bytes仍是 authority，不引入 npm registry authority。
- 新增一个 future-Delivery-shaped disposable self-hosting E2E target，组合消费既有 A1→G1 能力并真实覆盖 Current→Planned→multiple Changes→Owner-authorized Checkpoints→Delivery Ready→Owner Full Test→Actual→Compare→Owner Finalize→Delivery Final→fresh checkout/resume；fixture 的 Actual/Final 只属于 disposable proof，不生成真实 03 Actual。
- 在既有 `prepareCheckpointBoundaryHandoff()` 上增加最小 **read-only exact-plan projection**，并通过 stable CLI 暴露 `checkpoint-handoff --delivery <id>`：输出 exact Delivery/Change/Owner binding、checkpoint subject/trailers、base revision、current candidate paths、exact EOF-only normalization operations 与 required preflight，然后 STOP。
- checkpoint handoff 继续严格禁止任何 file mutation、`git add`、commit、push、merge/rebase、Owner decision、Checkpoint Run 或 Checkpoint Adapter；真实 EOF-only normalization/stage/commit 仍仅由 exact `authorize-checkpoint` 后的 Executor mechanics完成。
- 为 H1 新增 closed Verification capability ownership与一个 H1-owned physical E2E target；正式 selected logical check必须真实执行该 target，并用 sentinel证明 physical closure。
- Owner Contract Reset 后，将 H1 detached Verification 的 `tests-cli` / `tests-execution` **仅在 H1 capability 被 selected 时**收敛为 bounded physical groups：每个真实 Node command继续使用既有 `120_000ms` hard timeout，logical check聚合全部 physical outcomes；完整 target/case集合不得减少。H1 `tests-cli` 可去重旧 `diagnostic-cli-process` 的 npm-installed smoke，因为 H1 formal package/self-hosting branch提供更强 installed-distribution proof；非 H1 selection保持原执行行为。
- 记录 stable package footprint、Action/review count、prepare/resume、Run corpus、OpenSpec/Archify process、Change Verification、Full Test与architecture render/compare wall time，仅作 observation，不引入 telemetry platform、scheduler、cache 或 auto-timeout。
- 不实现 auto-loop、Provider/Agent/Skill/Tool Registry、automatic Git/PR/merge、automatic Owner authorization、write-side checkpoint command、真实 03 Actual、package-pruning或其他 04 Engineering Health工作。

## Capabilities

### New Capabilities
- `flowkit-stable-runner-and-self-hosting-acceptance`: 定义 stable Runner fresh-consumer contract、future-Delivery-shaped disposable E2E、自举后 fresh checkout/resume 与 H1 performance/cost observation acceptance。

### Modified Capabilities
- `flowkit-archive-and-checkpoint-boundary`: 将已有 checkpoint handoff从 generic EOF authority说明扩展为 public、read-only、repository-derived exact candidate/path/normalization execution plan；Git mutation仍归 Executor。
- `flowkit-change-verification-selection`: H1 mutation family必须有 closed capability/module ownership，且正式 resolver必须物理执行 H1 self-hosting E2E target。

## Impact

- Stable/public CLI：`src/cli/main.ts` 仅增加 read-only `checkpoint-handoff --delivery <id>` facade；不增加 checkpoint write-side command。
- Checkpoint handoff：`src/services/f1-checkpoint-boundary-service.ts` 最小扩展 exact candidate/base/path/normalization plan与 fail-closed drift validation。
- Verification：`src/verification/change-selection/module-map.ts`、`evidence.ts` 增加 H1 capability ownership/physical target route。
- Detached Verification execution：`evidence.ts` 在 H1 capability selected 时把 process-heavy `tests-cli` / `tests-execution` 拆为多个 bounded physical commands并合并为原 logical evidence；不新增 logical check、scheduler、timeout policy或第二 authority。
- Tests：新增 H1 full self-hosting integration fixture/target，并扩展 checkpoint handoff、module-map/evidence regressions。
- 不改变 Full Test/Finalize/Architecture/G1 adapter的 authority或持久化 schema；不新增 Run type、Registry、Git automation或 external runtime dependency。
