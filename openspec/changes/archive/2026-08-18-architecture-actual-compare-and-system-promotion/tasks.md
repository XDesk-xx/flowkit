## 1. Architecture lifecycle domain / persistence

- [x] 1.1 定义 compact Actual ref、compare ref、current architecture cycle、accepted system source与 `accept-architecture` Owner binding；current cycle MUST exact-bind `fullTestAuthorizationRef + fullTestResultRef` qualification occurrence；canonical refs/fingerprints必须 deterministic、closed schema、无 arbitrary metadata bag。
- [x] 1.2 扩展 Delivery Manifest reader/snapshot/writer以可选读取/持久化 `architecture.currentCycle` 与 `architecture.acceptedSystemSource`；pre-E1 Manifest保持合法，malformed/mismatched refs fail closed。
- [x] 1.3 实现 current cycle publication、Owner acceptance publication、architecture remediation invalidation 的 atomic bounded mutations；不复制 Actual JSON/HTML/receipt内容到 Manifest。

## 2. Actual / Compare thin Archify behavior

- [x] 2.1 扩展 `ArchitectureService.render()` 与 CLI 支持 `actual`，继续使用 exact managed Archify architecture `--repo-root` route。
- [x] 2.2 在 post-Full-Test architecture behavior 下让 `architecture compare planned actual` validate Actual、执行 exact Archify compare并发布 compact current cycle；compare本身不得产生 acceptance。
- [x] 2.3 保持 E1 Apply candidate 中当前 03 `actual.architecture.json` absent；用 disposable final-shaped fixture证明 Actual validate/deliver/compare。

## 3. Owner acceptance / Policy

- [x] 3.1 增加 Delivery-scoped `accept-architecture` Owner decision；record admission必须 exact current Policy gate并由 write-side绑定 current cycleRef；扩展 existing `owner-provenance.ts` canonical tuple/hash使 relevant record绑定 `architectureCycleRef`，同时保持 absent-field legacy refs不变。
- [x] 3.2 Policy 对 `architecture.impact=true` 固定 `Full Test passed → architecture-actual-compare behavior → accept-architecture → authorize-delivery-finalize`；behavior/acceptance均不是 Change Action/Run。
- [x] 3.3 Owner acceptance原子把 current cycle标记accepted并持久化 exact `acceptedSystemSource`；Archify compare PASS/Reviewer/HTML不得替代 Owner fact。

## 4. Post-pass architecture remediation

- [x] 4.1 扩展 `ChangeCreateInput` 增加 bounded `architectureRemediation.cycleRef`，与 B1 `corrective` shape互斥。
- [x] 4.2 passed + awaiting architecture acceptance边界只接受 required Change + exact current cycle binding；missing/stale/mismatched binding在 mutation 前 fail closed。
- [x] 4.3 successful admission必须原子 append planned Change + Owner create-change provenance、remove current passed Full Test result、`passed→not-ready`、remove current architecture cycle。
- [x] 4.4 证明 remediation completed+checkpoint后只能 `awaiting-user-decision`，必须 fresh Owner authorize-full-test + fresh pass 才能形成新 Actual/Compare cycle；用两个不同 authorization refs + 相同 Full Test result/Actual/compare bytes证明 cycleRef不同、旧 remediation binding fail closed；不创建 Full-Test-failed Finding或自动 Change。

## 5. Accepted Actual → future Delivery Current source

- [x] 5.1 实现 accepted source durable reader/validator，校验 sourceDeliveryId、Actual path/content fingerprint/repository revision、compareRef与accept-architecture Owner binding一致。
- [x] 5.2 提供 bounded future-Delivery Current source helper：显式消费 prior accepted source + future Delivery自己的 exact Start Git facts；不自动发现“latest”、不创建 global `system.architecture.json`。
- [x] 5.3 用不同 synthetic deliveryId 做 fresh durable read consumer proof，并由 exact managed Archify validate/deliver future-owned Current。

## 6. Verification closure

- [x] 6.1 `architecture` module新增 E1 integration exact ownership；`tests-architecture` resolver物理执行 D1 + E1 integration和unit architecture tests，保持其他模块unique ownership。
- [x] 6.2 E1 unit/integration覆盖 delayed Actual、cycle refs、Owner acceptance、stale remediation、fresh Full Test、accepted-source resume/future consumer、CLI与fail-closed schema。
- [x] 6.3 Proposal/Apply用 expected/actual E1 change set验证 `buildVerificationSelection()` capability relation matched，并确保所有 changed tests由 selected physical target执行。
- [x] 6.4 完成 focused/affected/typecheck/lint/build/OpenSpec strict、`git diff --check`、staged `git diff --cached --check`与formal Change Verification publication。
