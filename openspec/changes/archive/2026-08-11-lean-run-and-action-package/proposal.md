## Why

Q1 与 A1 已经把 Change-only Standard Action、Owner authority、Change activation 与 canonical Git boundary 收敛，但当前 Run execution 仍停留在一组彼此正确却可被绕过的低层 primitive：`allocateNextRunId()`、`createRun()`、`completeRun()`、ResultRef resolver、pending diagnostics 分别存在，却没有一个唯一的高层 preparation/admission surface 强制 Run-ID、Action→Role、same-pending continuation 与 Action Package contract。真实 probe 已证明 caller 可以直接用 `createRun()` 创建 malformed Run ID、Delivery-wide duplicate NNN 与错误 Action/Role。与此同时，canonical integration spec 仍把 Delivery Full Test 当作 Action Package 示例，Windows CRLF working tree 也会被 A1 Manifest writer拒绝。B1 必须把这些 gap 收敛成一个 deterministic、Lean、Change-only execution envelope，而不是重写 Deterministic Core。

## What Changes

- 新增固定、compile-time 的十个 Standard Change Action definition catalog，并在 Proposal 中逐 Action 冻结 `role / goalClass / mutationClass / outputClass / terminalContract`，Apply 不得临时发明边界。固定 mapping 为：
  - `explore` → Author / `investigate-change` / 只修改 Explore planning artifact / 输出完整 current `explore.md` ref set / completed terminal = executionStatus+summary+Core-derived produced refs；
  - `review-explore` → Reviewer / `judge-explore` / 不修改 reviewed target / 输出 Reviewer verdict+findings / completed terminal必须含 verdict，Core exact-bind reviewed Run；
  - `revise-explore` → Author / `close-explore-author-findings` / 只修 Explore planning artifact / 输出完整 current `explore.md` ref set / completed terminal除 produced refs外必须 Core-bind source review；
  - `propose` → Author / `freeze-change-contract` / 只创建/修改 Proposal bundle / 输出完整 current proposal+design+tasks+delta specs ref set / completed terminal = summary+Core-derived complete bundle refs；
  - `review-propose` → Reviewer / `judge-proposal` / 不修改 Proposal target / 输出 Reviewer verdict+findings / completed terminal必须含 verdict并 exact-bind reviewed Run；
  - `revise-propose` → Author / `close-proposal-author-findings` / 只修 Proposal bundle / 输出完整 current proposal+design+tasks+delta specs ref set / completed terminal必须 Core-bind source review；
  - `apply` → Author / `implement-approved-contract` / 只在 approved Proposal/Owner/Verification contract允许范围内修改 implementation/tests/canonical contract/tasks/verification / 输出 implementation candidate与专业 authority files，不允许 caller声明 ResultRef 子集 / completed terminal由 Core保留 approved-review entry binding；
  - `review-apply` → Reviewer / `judge-implementation-and-verification` / 不修改 implementation target / 输出 Reviewer verdict+findings / completed terminal必须含 verdict并由 Core派生 `verificationSummaryRef`；
  - `revise-apply` → Author / `close-apply-author-findings` / 只修 Author-actionable implementation/verification范围 / 输出 revised implementation candidate，不允许 caller声明 ResultRef / completed terminal必须 Core-bind source review；
  - `archive` → Author / `close-change` / 只执行 approved+verified+Owner-authorized OpenSpec archive 与 Change completed transition / 输出 archive operation summary/state transition / completed terminal不得把 Git Checkpoint变成 Action output。
  Catalog 不建立 Registry、Router 或 dynamic discovery；Owner 不创建 Standard Run。
- 新增薄的 B1 Run execution preparation surface，并冻结 **bounded dual-entry**：
  1. normal progression：caller 只能请求 `next`，service 读取 fresh FormalFactSnapshot并消费 shared `next()`；只有结果为 Standard Change Action 才可 prepare；
  2. explicit review：caller 只能请求统一 intent `review`，service 读取同一 fresh snapshot并调用 shared `resolveReview()`/`canRun(review-S)` 等价 Policy admission，由 Policy解析具体 `review-S`。这专门保留 Q1 的 explicit same-stage direct re-review：即使 `next()` 因 owner/verification/external blocker 故意 blocked，合法 explicit review仍可创建新 Reviewer generation。caller 不得直接指定任意 formal Action，service 不复制 blocker/Stage decision tree，且绝不自动触发 re-review。
  两种入口解析出合法 Action 后，统一进入同一 pending-resume/new-NNN path：恢复语义仍匹配的唯一 pending Run，或由 Core 分配新的 Delivery-wide NNN并创建 pending Run。
- Run creation 使用 defense-in-depth：高层 service 必须调用 Delivery-wide allocator；低层 `createRun()`/等价 persistence boundary 也必须拒绝 malformed action suffix、duplicate/non-monotonic NNN 与 Action→Role mismatch，避免内部 caller 绕过 B1 contract。
- same pending Run 不引入 provider/chat session identity。pending Run 本身就是 execution instance；`context.json` 只新增/持久化一个 compact Core-derived `semanticInputFingerprint`（名称可等价）。Canonical descriptor MUST纳入所有会改变 logical Action Package 执行语义的 authority identity，至少包括：delivery/change identity、resolved Action、完整 ActionDefinition identity/version、**全部 `contractRefs` 的 `{ref, kind, versionFingerprint}`**、handoff refs、适用 Review/Verification refs或无版本ref时的规范化 authority scalar、适用 Owner authorization refs。集合按稳定 key排序后 canonical serialize/hash。若 package新增字段会改变允许 mutation、required result或执行前提，该字段的authority identity也 MUST进入 descriptor；纯展示/可由已纳入ref完全派生的view、human summary、timing/performance、provider/chat session MUST排除。不得 hash整个 package/OpenSpec正文/Git history/provider transcript。再次 prepare时 fingerprint相同才resume；任何 contractRef版本变化都会形成 input drift并 fail-closed，不静默创建第二个 Run。
- failed/cancelled terminal retry、explicit new Reviewer execution、real author-actionable revise 与 new formal Action 都属于 new execution instance，必须重新分配 Delivery-wide NNN；Checkpoint 不消耗/重置 NNN。
- 新增 provider-neutral logical `ActionPackage` projection。它只服务十个 Standard Change Actions，包含当前 Delivery/Change identity、Run/action/role、contract/handoff refs、适用 Review findings + blockingAuthority view、适用 Owner authorization refs、ActionDefinition mutation boundary、verification requirement/plan view 与 required logical result contract。专业 authority 只提供 refs/必要最小 view，不复制整个 OpenSpec/Git/Verification/历史 Run corpus；package 不绑定 ZIP/ChatGPT/Codex/provider transport。
- Delivery Full Test / Delivery Finalize 继续是 Delivery behavior：MUST NOT 创建 B1 Action Package 或 Standard Run。Apply/Archive 等 Change Action MAY 携带适用 Owner authorization refs。B1 拥有 logical package preparation/generation；后置 C1/03 adapter/transport 只做结构化 context/physical mapping/execution，不拥有 Policy next。
- 新增薄 Action Result admission surface：executor/provider 只提交 logical execution result descriptor（executionStatus、summary、ActionDefinition 允许的 review/failure fields）；service 必须验证目标 Run 仍 pending、Action/role/fingerprint 与 prepared contract一致，然后调用现有 `completeRun()`。Run ref、ResultRef kind/path/fingerprint、review/verification binding 继续由 Core 派生；`nextActionRecommendation` 继续非 authority。
- 保留现有 active-Change-only Reader 与 Lean persistence，不引入全历史 replay、Evidence/Receipt ledger、artifact registry、provider transcript 或 Run database。Action Package preparation只读取 current formal facts和必要近邻 lineage。
- Bounded Windows compatibility：`DeliveryManifestDocument`/等价 writer MUST 接受语义相同的 LF 或 CRLF working-tree input、内部 normalize，并在成功 mutation 后写 canonical LF。必须回归 `owner record`、`create change`、`activate` 的 CRLF path，同时保持 unsupported YAML/tabs/ambiguous shape fail-closed、Owner idempotency/dependency semantics不变；`.gitattributes` 只能作为 hygiene，不能替代 runtime proof。
- 同步 canonical integration/core ownership drift：修正 `flowkit-integration-boundaries` 中 Full Test 作为 Action Package 示例的旧语义，修正 `docs/core-model.md` 中 logical Action Package仍归旧 C1 的 wording；B1 是 logical package owner，C1 仍只负责 OpenSpec 1.7 thin integration，03 负责 stable single-Action adapter。
- 增加 focused verification：unsafe low-level Run creation拒绝、Delivery-wide NNN、Action→Role、pending resume/fingerprint drift、failed/cancelled retry、新 Reviewer generation、Action Package minimality/Change-only boundary、logical result admission/Core-derived refs、CRLF Manifest writer 与 active-Change corpus/performance observation。不得运行/宣称 Delivery Full Test。

## Capabilities

### New Capabilities

- `flowkit-lean-run-and-action-package`: 定义固定 ActionDefinition、唯一 Run preparation/resume/new-instance contract、logical Action Package、logical Action Result admission 与 Lean/performance边界。

### Modified Capabilities

- `flowkit-core-model`: 把 Standard Run 的 Action→Role、Delivery-wide Run-ID、same-pending/new-instance 与 Change-only Action Package ownership提升为规范；Full Test/Finalize继续排除。
- `flowkit-domain-and-state-schema`: 增加 fixed ActionDefinition 与 provider-neutral ActionPackage / logical ActionResult / compact semantic input identity 的受限 schema，不新增 lifecycle state。
- `flowkit-formal-fact-reader-and-persistence`: 强制 Run-ID/role defense-in-depth、持久化 compact input fingerprint、保持 active-Change-only corpus，并让 terminal admission继续复用 `completeRun()`/Core-owned ResultRef。
- `flowkit-policy-engine`: B1 preparation 必须消费 shared `next/canRun`，pending continuation与new-instance不得复制或替代 Policy decision tree。
- `flowkit-diagnostic-cli`: status/doctor/resume-context 能稳定显示/恢复 prepared pending Run，但仍 read-only；完整 action runner CLI 留 G1。
- `flowkit-integration-boundaries`: 冻结 logical Action Package = ten Standard Change Actions only；Full Test/Finalize无 package/Run；B1 logical preparation 与后置 adapter/transport ownership分离。
- `flowkit-delivery-change-creation-and-owner-input`: bounded修正 Manifest writer 的 CRLF input normalization/canonical LF output，不改变 A1 creation/Owner provenance/activation authority。
- `flowkit-bootstrap-and-roadmap`: Bootstrap/后续 Runner创建 Standard Run时必须遵守同一 B1 preparation/package/result semantics；不得回退到手工任意 NNN 或 provider-owned orchestration。

## Impact

- Domain：`src/domain/actions.ts`、`src/domain/types.ts`、`src/domain/run-id.ts`、`src/domain/schema-validator.ts`；新增 fixed definitions / logical package/result types，保持十个 Change Action catalog不变。
- Persistence：`src/persistence/run-id-fs.ts`、`run-persistence.ts`、`serialization.ts`、`result-ref-adapter.ts`、`delivery-manifest-document.ts`；复用现有 atomic create/terminal publish，只增加必要 validation/fingerprint/CRLF seam。
- Service：新增一个薄 B1 execution preparation/admission service（具体文件名可在 Apply按现有 layout选择），作为 adapter/未来 CLI唯一高层入口；不创建 generic Runner engine。
- Policy/facts：复用 `next/canRun` 与 FormalFactSnapshot，不重写 decision tree；只暴露 package generation所需 current refs/view。
- Diagnostics：只补 pending/package resume view；G1仍拥有完整 Change CLI与 E2E command surface。
- Canonical contract：一个新 capability + 八个 modified capabilities，并对 `docs/core-model.md`、`docs/integration-boundaries.md`、`docs/delivery-lifecycle.md`、`docs/bootstrap-reference.md`、`docs/development-roadmap.md`、AGENTS做最小一致性更新；不改 archived Q1/A1 artifacts。
- Verification：focused/affected/typecheck/lint/build/OpenSpec strict/whitespace + Run/package size/prepare timing observation；任何 B1 path不得执行 Delivery Full Test、Commit、Push或Checkpoint。
