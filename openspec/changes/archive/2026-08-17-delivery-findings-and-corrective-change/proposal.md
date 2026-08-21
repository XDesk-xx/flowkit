## Why

A1 已能把 Owner-authorized Delivery Full Test 真实发布为 Verification-owned `passed|failed + resultRef`，但 `failed` 当前只能停在 `full-test-failed` blocked boundary：Owner 即使使用现有 `create change` 创建普通 Change，也不会消费 failed result、不会形成可恢复的 Delivery Finding provenance，也不会把 Full Test lifecycle 重置到 correction 后的 `not-ready`。

B1 需要把这个缺口闭合为最小、确定、可恢复的 Delivery failure/corrective loop，同时保持 completed Change immutable、Verification/Owner authority 分离、corrective Change 复用普通 02 lifecycle，并要求 correction 后重新由 Owner 授权 Full Test。

## What Changes

- 从 current genuine Verification `failed` terminal result **与该轮 latest delivery-scoped `authorize-full-test` Owner decision ref** 确定性派生一个 current Full-Test Delivery Finding。`sourceResultRef` 继续表示 Verification 内容身份；`authorizationRef` 表示本轮 Full Test lifecycle occurrence；`findingId` 对 `{deliveryId, authorizationRef, sourceResultRef}` 做冻结的 canonical hash，因此两轮 byte-identical failed payload 仍得到两个不同 Finding occurrence。Finding 只投影 bounded fields，不复制 raw logs，也不成为 Verification truth。
- 为 Delivery Manifest 增加 bounded、可选的 `verification.fullTest.failureHistory[]` 与 `delivery.fullTestFindings[]`。`failureHistory[]` 是 **content-addressed deduplicated failed-result retention**：同一 `resultRef` exact result只保留一份，多个 failure occurrence可以共同引用；`fullTestFindings[]` 保存每个 occurrence 独立的 resolved provenance。pre-B1 Manifest 缺少这些字段仍可 bounded read。
- historical Finding 若持久化 `summary`，Writer MUST 从 verified source result派生，Reader MUST 要求 `summary === retainedResult.summary`；caller不能提供或覆盖该 projection。`authorizationRef` 必须解析到 matching Delivery-scoped `authorize-full-test` Owner record，`findingId` 必须从 frozen occurrence tuple独立重算；duplicate occurrence identity / mismatched source binding fail closed。
- 复用现有 Owner `flowkit create change` write-side。`fullTestStatus=failed` 时，create input 必须额外携带 exact `{findingId, authorizationRef, sourceResultRef}` corrective binding；Flowkit 验证它匹配 current derived finding 后，在**一次 atomic Manifest publication** 中：
  - append ordinary `required=true, state=planned` corrective Change；
  - append existing `create-change` Owner decision record；
  - ensure current exact failed result exists once in Full-Test-specific `failureHistory[]`（不存在则 append；相同 `resultRef` 已存在则 exact validate + reuse）；
  - append current occurrence 的 resolved `fullTestFindings[]` provenance，引用该 Full Test `authorizationRef`、Owner create decision 与 corrective Change；
  - 移除 current `verification.fullTest.result`；
  - `delivery.fullTestStatus: failed → not-ready`。
- corrective Change 不自动 activate，不使用 corrective-specific Action/Run；后续完全复用 ordinary Change lifecycle。完成并 checkpoint 后，A1 readiness projection 重新得到 `awaiting-user-decision`，旧 Full Test authorization 不自动复用，Owner 必须重新 `authorize-full-test`。
- `status/next/doctor/resume-context` 在 current failed boundary 只读呈现 current `findingId/authorizationRef/sourceResultRef`；correction consumed 后不把历史 Finding 当 current blocker。
- Change Verification 必须物理覆盖 failed→finding occurrence→corrective admission→fresh process→ordinary lifecycle→checkpoint→fresh authorization，并通过 **two identical failed payload cycles**、summary drift、stale ref、createChange-only、historical manifest、future Delivery counterfactual证明 fail-closed、occurrence uniqueness 与 activation persistence。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `flowkit-core-model`: 冻结 Delivery Full Test failure occurrence/Finding、Owner corrective decision、historical Change immutability、ordinary corrective lifecycle 与 fresh Full Test authorization 的长期核心模型。
- `flowkit-policy-engine`: 让 `full-test-failed` blocked result 携带 exact current Finding occurrence context，并在合法 corrective admission 后确定性退出 failed boundary、回到普通 Change/Delivery readiness 路径。
- `flowkit-formal-fact-reader-and-persistence`: 增加 Full-Test-specific deduplicated failed-result retention、occurrence-resolved Finding provenance、pre-B1 bounded read、current derived finding 与 atomic corrective reset 的 closed-schema/fail-closed persistence contract。
- `flowkit-delivery-change-creation-and-owner-input`: 扩展现有 Owner `create change` 输入以接受 bounded corrective occurrence binding，并原子完成 ordinary Change creation + failure consumption/reset；不增加第二 Owner authorization state machine。
- `flowkit-diagnostic-cli`: 在 current Full Test failed boundary 稳定、只读呈现 current Finding occurrence identity/source result，支持 fresh-process Owner handoff；历史 Finding 不成为 current diagnostics authority。

## Impact

- 主要影响 Delivery Manifest typed schema/read-write、FormalFactSnapshot、Policy blocked context、existing `create change` write-side、diagnostic formatting、Change Verification module mapping 与相关 unit/integration tests。
- 不修改 A1 Full Test physical executor/protocol，不新增 Standard Action、Run、NNN、attempt ledger、generic Finding DB、Evidence platform、Finding Registry、corrective scheduler、automatic Change creation、automatic activation、automatic Full Test retry 或 Finalize 行为。
- 不新增 runtime dependency；pre-B1 Manifest 无需 rewrite/migration，B1 repository-global semantics 只在 B1 Change Checkpoint 后成为 canonical，后续 C1–H1 与 future Delivery 通过 fresh repository facts消费。
