## 1. Finalization identity / Owner applicability

- [x] 1.1 新增 closed Finalize qualification/candidate/projection domain refs；qualification exact-bind Full Test occurrence + **formal qualifiedBaseRevision** + accepted architecture/not-applicable disposition，fresh occurrence或qualified Git revision变化必须改变ref。
- [x] 1.2 扩展 Owner provenance optional `finalizationQualificationRef`；fresh `authorize-delivery-finalize`由write-side派生并canonical bind，caller不可注入，legacy absent-field Owner refs保持不变。
- [x] 1.3 Policy只接受exact current qualification-bound Finalize authorization；missing/stale/legacy-unbound current record必须重新请求Owner授权。

## 2. Post-pass required Change freshness

- [x] 2.1 扩展create-change：raw passed下新增required Change原子remove Full Test result + `passed→not-ready`。
- [x] 2.2 architecture applicable时同步remove currentCycle + acceptedSystemSource；E1 awaiting-architecture remediation仍要求exact cycle binding，B1 failed corrective保持独立。
- [x] 2.3 回归覆盖 accepted architecture、awaiting architecture、architecture-not-applicable三条post-pass路径，并证明checkpoint后必须fresh Full Test/Actual/Compare/acceptance。

## 3. No-Run Delivery Finalize behavior

- [x] 3.1 实现 `flowkit delivery finalize --delivery <id>` thin CLI + service；不创建Run/NNN/Action Package，不自动Git mutation。
- [x] 3.2 从当前 Delivery 已 admitted pre-final Git boundaries确定性派生 `qualifiedBaseRevision`；Finalize前read-only preflight要求index empty、HEAD exact-equal该 revision并稳定、dirty set仅Manifest + applicable Actual；ordinary clean post-qualification commit与unrelated drift都必须在state仍active时fail closed。
- [x] 3.3 使用 `qualifiedBaseRevision` 而非任意 current HEAD 计算pre-publication `delivery-final-candidate` ref并原子发布 `state=completed + finalization{qualificationRef,ownerAuthorizationRef,candidateRef}`；不写future commit SHA。
- [x] 3.4 实现strict inverse projection，使completed Manifest可唯一恢复pre-finalization active bytes并重验candidateRef。

## 4. Delivery Final Git handoff / admission

- [x] 4.1 实现 `flowkit delivery final-handoff --delivery <id>` read-only service，fresh process可从completed facts重建subject/trailers/paths并阻止post-publication drift。
- [x] 4.2 Git reader输出Delivery Final candidate；fresh strict identity要求single parent、exact subject与exact-single Delivery/Boundary/Owner trailers。
- [x] 4.3 FormalFactReader用point-in-time Manifest/Owner/qualification + re-derived `qualifiedBaseRevision` + inverse candidate bytes重算candidateRef，并要求Delivery Final first parent exact-equal该 revision；wrong/duplicate/stale trailer/candidate fail closed。
- [x] 4.4 以recognized F1 Change Checkpoint ancestry作为strict cutover；历史ancestor finals保持bounded read-only compatibility，future descendants必须strict。
- [x] 4.5 disposable Git proof覆盖 architectureImpact=true/false 的 clean post-qualification ordinary commit rejection、crash/resume、unrelated drift removal、Delivery Final commit、`git merge --no-ff`后branch deletion仍保持final ancestry；不实现provider auto merge。

## 5. Persistence / snapshot / diagnostics compatibility

- [x] 5.1 DeliveryManifestDocument读写finalization closed block与Owner qualification字段，pre-F1 manifests继续合法，malformed/duplicate block fail closed。
- [x] 5.2 FormalFactSnapshot投影current finalization qualification/finalization facts所需最小字段；不复制Full Test/Architecture/Git evidence corpus。
- [x] 5.3 status/next/doctor/resume-context在active与completed boundary保持deterministic；completed后handoff使用explicit deliveryId，不依赖chat/current-active discovery。

## 6. Verification closure

- [x] 6.1 新 F1 integration path获得execution exact-one ownership；`tests-execution` resolver物理执行旧F1 checkpoint + 新F1 finalize integration与unit facts/policy/services。
- [x] 6.2 `cli-diagnostics`/`execution` capability relation纳入 `flowkit-delivery-finalize-and-git-boundary`，CLOSED capability catalog接受新capability。
- [x] 6.3 sentinel让新F1 integration target失败时selected `tests-execution`必须失败；expected/actual F1 change set用production `buildVerificationSelection()`得到matched relation。
- [x] 6.4 完成focused/affected/typecheck/lint/build/OpenSpec strict/archive-sync、`git diff --check`、staged `git diff --cached --check`与formal Change Verification publication；F1 Apply不得finalize当前03。
