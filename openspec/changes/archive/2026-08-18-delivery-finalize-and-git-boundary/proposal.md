## Why

E1 已完成并 checkpoint，F1 是 03 Delivery 主线中的下一 Change。当前产品已经具备 Delivery Ready / Full Test、post-pass Actual/Compare/architecture acceptance 与 accepted-system-source promotion，但 `authorize-delivery-finalize` 仍只是一个 Delivery-scoped presence gate，真正的 Finalize behavior 与严格 Delivery Final Git boundary 尚未实现。

074/076 Explore 证明了两个必须在 F1 冻结的 correctness gap：第一，旧 `authorize-delivery-finalize` 不能跨 fresh Full Test / fresh architecture qualification 被复用，并且任何 post-pass 新 required Change 都必须失效旧 Full Test/architecture qualification；第二，不能先把 `delivery.state` 写成 `completed` 再发现 Git/index/worktree 已有 unrelated drift，所有可读的 final-candidate preflight 必须在 Delivery 仍 `active` 时完成，随后才允许 completed publication 与独立 Git handoff。

因此 F1 需要交付一个 no-Run、qualification-bound、crash-resume-safe 的 Delivery Finalize capability，以及 strict Delivery Final candidate/admission contract；F1 Apply 自身不能提前 finalize 当前 03，也不能创建 03 Delivery Final commit。

## What Changes

- 新增 `flowkit-delivery-finalize-and-git-boundary` capability，定义 Finalize qualification、read-only final-candidate preflight、atomic completed publication、crash-safe Delivery Final handoff、strict Git boundary admission与 Merge Commit topology expectation。
- 定义 deterministic `delivery-finalization-qualification:<sha256>`：绑定 current Delivery、latest `authorize-full-test` occurrence、current Full Test result、**qualified pre-final Git revision** 与 architecture disposition。`qualifiedBaseRevision` 必须由 FormalFactReader/Git authority 从当前 Delivery 已正式 admitted 的 pre-final boundaries（Delivery Start / Change Checkpoints）中确定性解析，caller不能注入；`architecture.impact=true` 时 accepted Actual 的 `repositoryRevision` 必须与该 revision exact-match，`false` 时绑定 literal not-applicable。fresh Full Test authorization/result、fresh accepted cycle或qualified Git revision变化都必须产生不同 qualification。
- `authorize-delivery-finalize` 保留原 Owner decision 名称，但 fresh F1+ record 必须由 write-side从 current Policy/snapshot派生 `finalizationQualificationRef` 并进入 canonical Owner provenance hash；caller不能注入。缺失该字段的 historical record保持原 canonical ref/read compatibility，但不能关闭 post-F1 fresh Finalize gate。
- 扩展 post-pass `create change`：任何 raw `fullTestStatus=passed` 下新增的 `required=true` Change必须在同一次 atomic Manifest publication 中移除 current Full Test result并将 raw status重置为 `not-ready`；若 Architecture applicable 且 current cycle/source存在，则同时移除 current cycle与 acceptedSystemSource。E1 awaiting-architecture boundary仍要求 exact `architectureRemediation.cycleRef`，B1 failed corrective contract保持独立。
- Policy 在 all-required-completed/checkpointed + Full Test passed + architecture satisfied/not-applicable 时派生 exact Finalize qualification；没有 matching qualification-bound Owner record时返回 `authorize-delivery-finalize`，存在 exact record时返回 `delivery-behavior: delivery-finalize`，绝不返回 Standard Action/Run。
- 增加 `flowkit delivery finalize --delivery <delivery-id>`：explicit deliveryId、no Run。执行前重新读 formal facts/Policy，要求 exact qualification + Owner record；先做 read-only preflight（index empty、**current HEAD 必须 exact-equal qualification 中由正式 Git boundary 派生的 `qualifiedBaseRevision`**、dirty set只允许 Delivery Manifest和 architecture-impact=true 时的 durable Actual JSON），然后以 current active Manifest bytes + allowed file bytes + `qualifiedBaseRevision` 确定 `delivery-final-candidate:<sha256>`，最后仅原子写 `delivery.state=completed` + compact `delivery.finalization` projection。Finalize不 commit/push/PR/merge。
- `delivery.finalization` 最小持久化仍为 `schemaVersion=1`、`qualificationRef`、`ownerAuthorizationRef`、`candidateRef`；`qualifiedBaseRevision` 属于 qualification canonical identity，并由 formal Git facts重新派生验证，不再复制进第二个 projection。不复制 Full Test logs、Architecture JSON/compare receipt、Change history或未来 commit SHA。
- 增加 `flowkit delivery final-handoff --delivery <delivery-id>` read-only handoff：在 completed 后从 durable facts重建 exact subject/trailers，并重算 pre-finalization candidate identity。为避免 hash circularity，`candidateRef`绑定 **Finalize publication 前** 的 active Manifest bytes + allowed Actual bytes + qualification-covered `qualifiedBaseRevision`；completed Manifest通过确定性逆投影（移除 finalization block、`completed→active`）恢复该 preflight输入。任何 post-publication unrelated drift、HEAD 不等于该 qualified revision 或 index变化只阻塞机械 commit，不 reopen Delivery。
- Delivery Final exact commit identity冻结为 subject `chore(flowkit): finalize <delivery-id>`，以及 exactly-one trailers：`Flowkit-Delivery`、`Flowkit-Boundary: delivery-final`、`Owner-Authorization`。Executor只stage bounded handoff paths并执行 `git diff --cached --check`；Flowkit不自动 commit。
- Git reader把 Delivery Final从 loose subject recognition改成 candidate + admission。recognized F1 Change Checkpoint 作为 strict cutover：其祖先历史 finals保留 bounded legacy read；F1 checkpoint之后的 current/future finals必须 exact subject/trailers、single parent、point-in-time completed/finalization/Owner binding，**其 first parent 必须 exact-equal qualification-covered `qualifiedBaseRevision`**，并从该 parent + commit bytes重算同一 candidateRef。fresh malformed/duplicate/wrong trailers不得成为 formal boundary。
- PR/merge只冻结 topology expectation：Delivery branch必须以 Merge Commit进入 main，不能 squash/rebase；F1不集成 Git hosting provider、不自动 merge。H1负责整条 self-hosting E2E验证。
- 扩展 F1 integration/unit regressions与 Change Verification catalog，使 `tests-execution` 物理执行新的 `tests/integration/f1-delivery-finalize-and-git-boundary.test.ts`，并用 sentinel证明 selected logical check确实覆盖该 target。

## Capabilities

### Added Capabilities

- `flowkit-delivery-finalize-and-git-boundary`: no-Run Finalize behavior、qualification/candidate identity、crash-safe Git handoff、strict Delivery Final admission与Merge topology contract。

### Modified Capabilities

- `flowkit-core-model`: 增加 bounded finalization qualification/candidate/projection refs与 Owner `finalizationQualificationRef` provenance字段。
- `flowkit-delivery-change-creation-and-owner-input`: Finalize Owner record exact qualification binding；post-pass required Change原子失效 stale Full Test/architecture qualification。
- `flowkit-formal-fact-reader-and-persistence`: finalization projection读写、Owner binding读取、Delivery Final strict candidate/point-in-time admission与bounded legacy cutover。
- `flowkit-policy-engine`: F1 exact qualification gate与 `delivery-behavior: delivery-finalize`；stale/missing Owner Finalize record不得被复用。
- `flowkit-change-verification-selection`: 新 F1 integration target ownership、`tests-execution` physical resolver与expected F1 selection closure。

## Impact

- 预计影响 `src/domain/**`、Owner provenance、FormalFact snapshot/reader、Git boundary reader、Delivery Manifest writer、Policy、A1 write-side、两个 thin F1 services、CLI main，以及 Verification module-map/evidence resolver与相关 unit/integration tests。
- F1 Apply只实现 capability；当前 03 `delivery.state`仍 active、G1/H1仍待完成、正式 03 Actual尚未实例化，因此 F1 Apply MUST NOT执行当前 03 Finalize或创建 Delivery Final commit。
- Full Test/Architecture/Git/Owner facts继续由各自既有 authority拥有；Finalization只持久化 compact binding，不建立 Finalization Run、Evidence DB、Git transaction ledger或rollback engine。
- 不新增 auto Commit/Push/PR/Merge、provider integration、Finalize Action/Run、generic transaction platform、G1 resume adapter或H1 stable runner能力。
