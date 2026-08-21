## Why

02/03 已经具备确定性 Policy、three-file Run、Change Verification、Architecture 与 external-tool facts，但 fresh process 目前还不能把这些 facts 组合成完整的 repository-only resume/Agent execution boundary；同时 historical Apply 在合法 Verification retry + OpenSpec archive 后存在 terminal replay conflict。G1 需要在 H1 发布 stable Runner 前，把“可恢复”与“一次只执行一个已决定 Action”的薄适配能力冻结为可验证产品契约。

## What Changes

- 修复 historical Apply/revise-apply terminal replay：immutable producing-Run Verification binding 保持 point-in-time truth；current Verification 可以通过同 origin/candidate/selection 的合法 re-verification chain supersede；active→unique archive physical relocation 不改变 logical authority identity，缺失/歧义/chain corruption 继续 fail closed。
- 建立共享的 repository-only typed resume projection：除现有 Delivery/Change/Run/Review/Verification/Policy next 外，只读派生当前 Delivery Architecture refs/status，并在 Agent/H1 consumer需要时派生 exact managed OpenSpec/Archify readiness/identity；现有 `resume-context` 消费同一 projection 的 repository-stable 子集，不写 resume/session state，也不把环境 view 变成 Policy authority。
- 新增 provider-neutral single-action Agent Adapter boundary，复用现有 `prepareNewExecution / resumeRun / admitActionResult`；adapter input 携带 exact ActionPackage 与 bounded OpenSpec structured execution context，外部 executor 每次 invocation 最多被调用一次，结果仍由既有 admission authority 落盘，并立即 return control。
- 保持 current/historical Run compatibility：prospective three-file Run 不新增 sidecar；historical E1 persisted selection/evidence 继续按 point-in-time bytes 读取，不按 future Catalog 重新解释。
- 为 G1 新增 fresh-checkout/future-Delivery、retry+archive replay、single-invocation/no-auto-next 与 resume projection 的 targeted regressions，并把新 G1 integration target 纳入正式 Change Verification physical selection。
- 不实现 stable Runner（H1）、provider/agent registry、provider session persistence、`while(next)`、自动 Author↔Reviewer、Full Test/Finalize/Checkpoint adapter、Actual Architecture generation 或 04 Engineering Health 优化。

## Capabilities

### New Capabilities
- `flowkit-sync-resume-and-single-action-agent-adapter`: repository-only resume projection 与 provider-neutral single-Action Agent Adapter，包括 fresh checkout/future-Delivery genericity、bounded OpenSpec execution context transport 和 exactly-one-invocation/return-control contract。

### Modified Capabilities
- `flowkit-lean-run-and-action-package`: historical terminal replay 在合法 Verification retry 与 OpenSpec active→archive relocation 后仍须 exact、immutable、fail-closed，不得用 current publication 覆盖 producing Run 的 point-in-time binding。
- `flowkit-diagnostic-cli`: `resume-context` 改为消费共享 typed resume projection 的 repository-stable 子集并增加只读 Architecture refs/status，同时保持四个 diagnostic commands read-only。
- `flowkit-change-verification-selection`: G1 的 production/test mutation family 必须进入 closed ownership/capability relation，并由正式 selected logical checks 物理执行新的 G1 integration target。

## Impact

- 主要实现面：`src/services/**` 的 exact resume/terminal replay 与 single-action adapter composition，`src/diagnostics/resume-context.ts` 及必要的 bounded architecture/external-tool readers。
- Verification mapping：`src/verification/change-selection/module-map.ts`、`evidence.ts` 与对应 G1 physical target coverage。
- Tests：G1 fresh clone/future Delivery、historical E1/F1 replay、single provider invocation/no-auto-next、resume-context architecture/tool projection，以及 fail-closed corruption/ambiguity regressions。
- 不新增 external runtime dependency、Registry、Run file type、Verification sidecar generation、Delivery behavior Action 或 Git automation。
