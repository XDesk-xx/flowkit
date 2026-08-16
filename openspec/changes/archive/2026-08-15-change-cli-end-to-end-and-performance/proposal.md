## Why

Change Execution Loop 已具备完整的 Policy、Run、Review、Verification、OpenSpec archive 与 checkpoint primitives，但 operator CLI 仍停留在诊断/创建/恢复等分散入口，无法通过一组稳定、单边界命令完成真实 Change，也缺少 CLI 级 E2E 与成本观测。G1 需要把这些既有 authority 薄组合成长期可复用的 Change CLI，并证明 checkout/resume、跨 Delivery genericity、formal Verification closure 与性能基线都成立。

## What Changes

- 增加 `explore`、`review`、`revise`、`propose`、`apply`、`verify`、`archive` 的 Change operator CLI surface；每次 invocation 最多处理一个 Policy 允许的 boundary，不形成 `while(next)` 或自动 Author/Reviewer loop。
- 将 Action CLI 冻结为 prepare/resume + explicit result admission 的薄 composition：Action identity、Role、Owner/Reviewer authority、exact resume 与 terminal admission 继续由现有 Policy / Run services 决定，CLI 不建立第二 lifecycle engine。
- `review` / `revise` 作为 intent 入口解析到唯一合法 formal action；non-author blocker 必须 fail-closed，不能机械变成 Author revise。
- `verify` 只投影当前 formal Change Verification authority 与已发布 logical selection/status，不独立 rerun 并发布第二份 Verification truth；Apply/revise-apply 的 terminal admission 继续拥有正式 Verification publication/binding。
- `archive` 通过现有 pending archive Run + OpenSpec archive service 执行真实 archive mutation，并保持 durable recovery / terminal admission contract；checkpoint 继续只作为 Git boundary handoff，不成为 Action/Run，也不自动 Commit/Push。
- 新增 disposable-repository CLI E2E matrix，覆盖 happy path、Owner/author/verification/external blocker、direct re-review、no-op revise rejection、stale target、pending exact resume、Verification failure、OpenSpec artifact/archive failure、completed→checkpoint readiness/recognition 与 checkout/resume。
- 扩展 source-controlled Verification Catalog/physical resolver，使 G1 CLI E2E target 能由 current Change `actualChangeSet → logical check → physical target` 真实执行并 fail-closed。
- 记录 Action Package/Run size、prepare/exact-resume/diagnostic/Verification latency、selected check count、OpenSpec process count、Review rounds 与 reopened finding count；本 Change 只做 observation / bounded non-regression，不引入 cache platform、parallel scheduler 或 auto-review loop。

## Capabilities

### New Capabilities

- `flowkit-change-cli-end-to-end-and-performance`: 定义完整 Change operator CLI 的单边界执行、exact resume/result admission、authority-safe verify/archive、CLI E2E、跨 Delivery genericity 与 performance observation contract。

### Modified Capabilities

<!-- None. Existing diagnostic, Run, Review, Verification and archive capabilities remain authoritative; G1 composes them without changing their existing requirement contracts. -->

## Impact

- CLI orchestration：`src/cli/main.ts` 及 G1 专用薄 helper。
- 既有 authorities：`b1-run-execution-service`、OpenSpec archive service、FormalFactReader/Policy、checkpoint handoff 仅被调用，不由 CLI 复制状态机。
- Verification closure：`src/verification/change-selection/module-map.ts`、`src/verification/change-selection/evidence.ts` 与对应 regression tests。
- 测试：新增真实 process/disposable-repository G1 Change CLI E2E，并保留现有 diagnostic/Run/OpenSpec/F1 regressions。
- 不新增 external dependency、Run file type、Delivery behavior、Agent/Provider Registry 或自动 Git mutation。
