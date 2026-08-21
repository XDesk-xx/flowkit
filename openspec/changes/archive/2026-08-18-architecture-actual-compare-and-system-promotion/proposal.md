## Why

D1 已建立 Delivery-scoped Current / Planned Architecture、exact managed Archify render/compare 基础与长期 reference visualization，但 03 仍缺少 Delivery final candidate 的 Actual Architecture、Planned-vs-Actual formal compare binding、显式 Owner architecture acceptance，以及 Accepted Actual 作为下一 Delivery Current source 的 durable promotion contract。

E1 Explore 进一步证明了两个必须在 Proposal 冻结的时序事实：第一，E1 Apply 时 F1/G1/H1 尚未完成且 Delivery Full Test 尚未 passed，因此 E1 只能实现可复用 capability，不能把当前 repository 写成正式 03 Actual；第二，Full Test passed 后若 architecture non-acceptance 触发 required remediation Change，旧 passed Full Test qualification 与旧 Actual/Compare cycle 必须在同一次 Owner write-side publication 中失效，并在 remediation checkpoint 后重新等待 fresh Owner Full Test authorization。

因此 E1 需要建立最小 Delivery-level architecture-finalization behavior，而不是新的 Change Action、Architecture Registry 或自动 remediation engine。

## What Changes

- 扩展 Delivery Architecture asset family：E1 capability 支持 post-Full-Test independently-authored `actual.architecture.json`，并让 `flowkit architecture render actual` 使用 D1 已存在的 exact managed Archify repository-evidence route；E1 Apply 自身不生成当前 03 formal Actual。
- 将 `flowkit architecture compare planned actual` 定义为 post-Full-Test architecture behavior 的 thin Archify compare route：它验证 Actual、执行 exact managed Archify compare、形成 compact `fullTestAuthorizationRef + fullTestResultRef + actualArchitectureRef + compareRef` current architecture cycle binding，但不解释 drift、不自动接受 architecture。
- 在 Delivery Manifest `architecture` section 增加 bounded current-cycle projection：`currentCycle` 只保存当前 Full Test qualification occurrence（delivery-scoped authorize-full-test Owner ref + technical resultRef）对应的 Actual/Compare refs、cycleRef 与 acceptance status；不复制 JSON/HTML/receipt 内容，不形成 history DB。
- 增加显式 Owner decision `accept-architecture`。只有 Policy 当前要求该 gate 时才可记录；write-side 必须 exact-bind current cycle，并原子把其 acceptance 标为 accepted、持久化 `acceptedSystemSource`。`architectureCycleRef` 进入 existing owner-provenance canonical hash domain；无该字段的 legacy/non-architecture Owner refs 保持 byte-for-byte canonical compatibility。Reviewer prose、Archify compare PASS、HTML/receipt、AI 判断都不能合成 acceptance。
- `acceptedSystemSource` 是完成 Delivery 可供 future Delivery 消费的 compact durable source，至少绑定 source Delivery、Actual logical path/content fingerprint/repository revision、compareRef 与 Owner acceptance ref。它不复制 Actual 到 global `system.architecture.json`。
- Policy 在 `architecture.impact=true` 时保持顺序：`Full Test passed → architecture actual/compare behavior → Owner accept-architecture → Owner authorize-delivery-finalize`。Architecture behavior、Full Test、Finalize 都不是 Change Action/Run。
- 增加 bounded post-pass architecture-remediation create-change admission：仅在 raw `fullTestStatus=passed` 且 current architecture cycle 尚未 accepted 时允许 `change.architectureRemediation.cycleRef` exact binding；fresh authorize-full-test occurrence 必须形成不同 cycleRef，即使 technical result/Actual/compare bytes 恰好相同。成功 admission 必须原子 append required planned Change、记录 Owner create-change provenance、remove current Full Test result、`passed → not-ready`、remove current architecture cycle；随后普通 Change lifecycle + checkpoint 只能重新投影 `awaiting-user-decision` 并要求 fresh Owner Full Test authorization。
- post-pass architecture-remediation 不复用 B1 `full-test-failed` Finding/corrective binding，不自动创建 Change，不引入 generic Finding DB/recovery platform。Passed boundary 上的普通 required create-change 若没有合法 architecture-remediation binding必须 fail closed，避免旧 passed qualification 被静默复用。
- 增加 accepted source 的 durable reader/validator，使 fresh process 可按 explicit prior source Delivery 读取并校验 Actual content fingerprint；future Delivery 以该 source + 自己 exact Delivery Start Git baseline author 自己的 `architecture/<future-delivery>/json/current.architecture.json`。E1 不提前实现 G1 resume runner或自动创建 next Delivery Current。
- 扩展 E1 structural/integration regressions与 Change Verification ownership：`tests-architecture` 必须物理执行 E1 integration target，并覆盖 delayed Actual、current-cycle publication、Owner acceptance、remediation stale binding/fresh Full Test、accepted-source fresh read及不同 future deliveryId consumer。

## Capabilities

### Modified Capabilities

- `flowkit-architecture-assets`: 增加 Actual render、post-Full-Test Planned-vs-Actual cycle binding、Owner acceptance projection、accepted Actual source与future Delivery Current source boundary。
- `flowkit-core-model`: 增加最小 architecture cycle/source ref 类型与 `accept-architecture` Owner decision identity；保持 Architecture behavior 非 Change Action/Run。
- `flowkit-delivery-change-creation-and-owner-input`: 增加 `accept-architecture` current-gate admission及 bounded `change.architectureRemediation.cycleRef` create-change recovery boundary。
- `flowkit-formal-fact-reader-and-persistence`: Delivery Manifest 增加 bounded `architecture.currentCycle` / `acceptedSystemSource` read/write/fail-closed projection与 atomic invalidation/acceptance publication。
- `flowkit-policy-engine`: 在 Full Test passed 与 Finalize 之间增加 architecture actual/compare behavior + Owner acceptance gate，并阻止 stale passed qualification。
- `flowkit-change-verification-selection`: E1 integration test与 Architecture/execution/persistence/CLI mutation必须形成 closed ownership、capability relation与 physical selected-check closure。

## Impact

- 预计影响 `src/architecture/**`、Architecture CLI、Owner/domain types（包括现有 `src/domain/owner-provenance.ts` canonical ref authority）、FormalFact reader/snapshot、Delivery Manifest persistence、Policy、A1 write-side与 Verification selection mapping/tests。
- E1 Apply 不新增 `architecture/20260817-01-delivery-execution-loop/json/actual.architecture.json`；正式 03 Actual 只在后续 F1/G1/H1 completed+checkpointed 且 Owner-authorized Delivery Full Test passed 后 dogfood E1 capability形成。
- Current/Planned/reference JSON 语义不变；HTML/Archify receipt 继续 derived/disposable/non-authoritative。
- 不新增 `system.architecture.json`、Architecture DB/Registry、automatic corrective Change、generic Finding DB、Archify approval engine、Finalize implementation、G1 resume runner或 H1 self-hosting runner。
