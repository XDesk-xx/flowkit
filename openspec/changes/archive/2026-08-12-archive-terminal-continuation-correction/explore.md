# D2 Explore — Archive Terminal Continuation Correction

## 1. Context

- Delivery: `20260810-01-change-execution-loop`
- Change: `D2 archive-terminal-continuation-correction`
- Role: Author
- Execution Context: detached
- Exact GitHub Base: `a89d4a6ee672399611cb810e357bc433c230309d`
- D1 checkpoint: `a89d4a6ee672399611cb810e357bc433c230309d`
- Formal D2 create decision: `owner:324daa33e2f17d01b4b2687df546bca2578864ede4594fe416ad1b4c66df3c81`
- Formal D2 activation decision: `owner:401b8fc46462652a0e06dcff9e746020e6f3b5b61a241207f62959282637ed7d`
- Explore Run: `20260812-086-explore`
- OpenSpec probe version: `1.7.0`

D1 已形成 Change Checkpoint，但 checkpoint 保留了真实 defect 现场：

```text
084-review-apply approved
→ OpenSpec archive structured success
→ D1 Manifest state = completed
→ 085-archive 仍 pending
→ archiveMutationGuard.terminalObservation.kind = success
→ 085 result.json absent
```

D2 是该真实 defect 的极小 corrective Change。它不重新打开 D1，不重新执行 D1 archive，也不修改 D1 历史 Run；它要修的是通用 archive continuation contract，使历史 085 可被正式恢复，同时让未来 Change 的正常 archive 不再产生同类 pending terminal-observation。

## 2. Manifest / activation facts

Base 上原 Policy 在 D1 checkpoint 后给出：

```text
next
→ owner-decision: activate-change
→ eligible: E1
```

Owner 明确授权先执行 D2 corrective。通过 A1 write-side 创建 D2 后：

```text
eligible: E1,D2
```

随后通过正式 activation surface 激活 D2：

```text
D2 state: active
flowkit next: explore
flowkit doctor: ok / 0 findings
```

D2 作为 required Change，dependsOn 仅为已 completed/checkpointed 的 D1。当前不需要重写 E1 的 dependency；D2 active 本身已确定当前执行顺序，D2 完成前不会存在第二个 active Change。

## 3. Bootstrap preparation fact

当前 Base 存在一个自举死锁：D2 已 active 且 Policy 明确 `next=explore`，但 production `prepareActionExecution(entry=next)` 在读取 active Change 之前先执行 Delivery-wide `findPersistedPendingArchive()`，因此抢先命中历史 D1 `085-archive`。

真实调用结果：

```text
D2 active
flowkit next → explore
flowkit doctor → ok

prepareActionExecution(next)
→ findPersistedPendingArchive()
→ D1/085
→ resumePendingArchive()
→ recoverPersistedPendingArchive()
→ deriveSemanticInputs(D1, archive)
→ OpenSpec getChangeStatus(D1)
→ Change not found
→ OPENSPEC_COMMAND_FAILED
```

因此 unmodified Base 无法直接创建 D2 Explore Run；这正是 D2 的 confirmed gap，而不是 D2 contract 输入不足。

为了不提前修改 production code，本 detached Explore 采用一次性 Bootstrap preparation workaround：

```text
1. 在 disposable copy 中保留同一 Base、同一 D2 Manifest / activation bytes；
2. 只在 disposable copy 中 terminalize 历史 085，使 unmodified B1 preparation 能继续；
3. Flowkit allocator 读取完整 Delivery Run corpus，分配 20260812-086-explore；
4. 分别以 disposable 085=completed 与 085=cancelled 两种终态重复 preparation；
5. 两次得到完全相同的 D2 semanticInputFingerprint：
   359386d56539e2706dce58e32386f52982a56f9e4d2b059b03f7ba150334ce03
6. 只携带 D2 086 Run 回当前 detached candidate；
7. disposable 085 terminal result 不进入 candidate，当前真实 085 继续保持 pending terminal-observation。
```

该 workaround 只用于让 Bootstrap Delivery 能研究修复 Runner 自身的 deadlock。它不是产品能力，不得进入 Proposal 作为长期 generic bypass，也不得被扩展为“忽略任意历史 pending Run”。

## 4. Confirmed Gap D2-G01 — known-success archive terminal admission 仍依赖已移除 active Change

D1 085 已经拥有足够强的 OpenSpec archive terminal authority：

```text
archiveMutationGuard.state = armed
surfaceVersion = openspec-archive-mutation-v1
preArchiveGenerationFingerprint = F
terminalObservation.kind = success
terminalObservation.normalized.change = D1
terminalObservation.normalized.archivedAs = 2026-08-12-review-findings-and-blocker-authority
terminalObservation.normalized.path = openspec/changes/archive/...
post V1 != F
```

`inspectOpenSpecArchiveRecovery()` 已能仅凭 durable guard + current mutation surface 把它分类为：

```text
known-success
```

但 B1 resume / terminal admission 仍进入：

```text
recoverPersistedPendingArchive()
→ deriveSemanticInputs()
→ collectContractRefs()
→ OpenSpecCliAdapter.getChangeStatus(changeId)
```

且 `buildOpenSpecPreparedActionContext()` 对 `archive` 同样无条件执行 `getChangeStatus(changeId)`。

成功 archive 的合法 post-state 恰恰是 active `changeRoot` 已被 OpenSpec relocate/remove，因此这里把成功 mutation 的预期结果重新当成“输入缺失”，导致同一 085 无法通过 normal admission 形成 `result.json`。

### Existing seam

当前实现并非缺少 archive success proof，而是 continuation 读取方式错误。已有可复用 seam：

- `archiveMutationGuard` 持久化 preArchive surface identity、validated changeRoot/archive namespace refs 与 durable terminalObservation；
- `inspectOpenSpecArchiveRecovery()` 已能返回 `known-success`；
- `versionedActiveOrArchivedChangeFileRef()` / `assertVersionedChangeRefCurrentOrArchived()` 已支持 archive relocation 后的 point-in-time ref 验证；
- `readPersistedChangeLineage()` 已能从 `.flowkit/runs/<delivery>/<change>` 恢复 D1 Run / Review lineage；
- archive admission 已有独立 special branch，不需要建立第二套 archive authority。

D2 应修补这些 seam 的组合，而不是重新实现 OpenSpec archive state machine。

## 5. Confirmed Gap D2-G02 — historical persisted archive 会劫持后续 active Change preparation

当前 `prepareActionExecution()` 的顺序是：

```text
read snapshot
→ findPersistedPendingArchive(delivery-wide)
→ 若存在则优先 resume archive
→ 之后才 getActiveChange(snapshot)
```

而 diagnostics `inspectPreparedRun()` 的顺序是：

```text
getActiveChange(snapshot)
→ active Change 存在时只检查该 Change 的 pending Run
→ 不投影历史 D1/085
```

所以当前 D2 出现 machine-visible 矛盾：

```text
status / next / doctor
→ D2 active
→ next=explore
→ pending-run=none
→ doctor=ok

B1 preparation
→ 却先尝试 D1/085 archive continuation
→ D2 086 无法创建
```

D2 必须统一 preparation 与 diagnostics 的 current execution binding。

Required direction 不是“忽略所有历史 pending archive”，而是：

```text
current active Change exists
→ Standard Action preparation 绑定 current active Change
→ 不得被另一个 completed/checkpointed historical Change 的 stale pending archive 抢占
```

同时，在没有 active Change、当前 lifecycle 确实仍处于 archive continuation/recovery boundary 时，同一 pending archive 的 recovery semantics 必须继续 fail closed、生效且不可被绕过。

## 6. Confirmed Gap D2-G03 — checkpoint readiness 与 canonical Archive Run terminal invariant 不一致

当前 canonical product spec 已冻结 Change Checkpoint 前置条件包含：

```text
OpenSpec 已 Archive
Change state = completed
Archive Run 已完成
```

但 D1 真实执行中：

```text
D1 state = completed
085 archive Run = pending terminal-observation
```

当前 `next()` 仍返回 `authorize-checkpoint`，最终 Git checkpoint `a89d4a6...` 已保存该矛盾现场。

D2 不修改这个历史 checkpoint，也不伪造 085 当时已经 completed；但必须修正 future contract，使：

```text
archive structured success
≠ archive Run terminal admission completed
```

在 archive Run 尚未 terminalize 时，不得对未来 Change 暴露正常 `authorize-checkpoint` readiness。

该修复只约束 archive→checkpoint 邻接边界，不扩展为新的 Git workflow framework。

## 7. Required outcome

D2 必须实现以下最小闭环。

### 7.1 Future archive success terminalizes the same Run after relocation

```text
fresh pending archive
→ freeze preArchive execution identity
→ durable arm F
→ OpenSpec structured success
→ durable terminalObservation
→ post V1 != F
→ same archive Run terminal admission
→ result.json completed
→ Change completed
```

Terminal admission MUST NOT require the already-relocated active OpenSpec Change to remain queryable.

### 7.2 External semantic drift remains fail closed

D2 不能简单跳过 archive semantic validation。Owner authorization、review approval、verification binding、Run identity、archive guard/terminal observation identity 及其它真正外部 semantic inputs发生不允许的改变时仍必须 fail closed。

Proposal 必须冻结 post-mutation archive recovery 到底如何重建/验证 entry identity：是从 existing persisted refs/guard/lineage deterministic reconstruction，还是增加一个极窄 persisted archive-entry projection。无论哪种方式，都不得建立 generic semantic ledger 或第二 OpenSpec state store。

### 7.3 Existing 085 must be formally recoverable

D2 Apply 后必须使用正式 Flowkit surface 关闭历史 D1/085：

```text
085 terminalObservation.kind = success
+ post V1 != F
+ exact 085 identity
+ applicable external authority仍一致
→ publish 085 completed result through normal Core-owned terminal writer
```

禁止：

```text
重新执行 D1 archive
手写 085 result.json
删除/重写 085
恢复 active D1 tree 伪造 pre-archive state
把 D1 重新变成 active
```

### 7.4 Historical stale archive must not hijack later active Change

D2 修复后，D2/E1 等后续 active Change 的 preparation 必须绑定当前 active Change，而不是被已 completed/checkpointed历史 Change 的 known-success terminal-observation抢占。

### 7.5 Future Checkpoint must require terminal archive Run

正常 future Change 只有在 archive Run 已合法 terminal 后才可进入 Checkpoint Owner boundary。D1 `a89d4a6...` 保留为修复前的历史 defect example，不做 rewrite。

## 8. Proposal 前必须冻结的问题

Proposal 必须明确回答：

1. archive post-mutation continuation 的 authoritative input set 是什么；哪些 entry-time semantic inputs必须持久化，哪些可以从 existing Manifest/Run lineage/archived refs重新确定性重建；
2. `externalContextFingerprint` / OpenSpec prepared view 在 active Change 已 relocation 后如何验证，而不再次调用 active `status`；
3. `collectContractRefs()` 的 archive-specific current-or-archived path是否足够，还是需要从 persisted producer refs构造 archive recovery view；
4. known-success `terminalObservation + post V1 != F` 如何接入 `admitActionResult()`，保证同一 Run terminalize且不二次 spawn；
5. Delivery-wide pending archive lookup 与 active Change binding 的 precedence contract；
6. diagnostics、prepare、resume-context 对 historical pending archive 的投影必须如何一致；
7. checkpoint readiness 如何显式要求 archive Run terminal，而不让 Checkpoint参与 Change `active→completed` 判定；
8. existing 085 的一次性 recovery 是否复用正常 archive terminal admission，还是需要一个极窄显式 recovery CLI；若需要 CLI，它只能服务 durable known-success terminal observation，不能成为 generic Run completion/cancellation API；
9. backward compatibility：历史 completed archive Run、D1 085、旧 context schema 均不得被批量重写。

## 9. Expected affected surfaces

最可能受影响的 production surfaces：

```text
src/services/b1-run-execution-service.ts
  - findPersistedPendingArchive / preparation precedence
  - recoverPersistedPendingArchive
  - deriveSemanticInputs archive recovery path
  - archive admitActionResult branch
  - inspectPreparedRun consistency

src/integrations/openspec/openspec-archive-service.ts
  - known-success continuation / terminalization seam（若需要）

src/persistence/run-persistence.ts / serialization.ts
  - 仅当 Proposal证明需要极窄 persisted archive-entry projection 时

src/policy/next.ts
  - completed Change checkpoint readiness 与 archive Run terminal condition
```

Expected contract/docs deltas：

```text
flowkit-lean-run-and-action-package
flowkit-openspec-1-7-thin-integration
flowkit-formal-fact-reader-and-persistence
flowkit-bootstrap-and-roadmap / checkpoint boundary（只修矛盾点）
```

Expected tests：

```text
B1 archive preparation/resume/admission unit tests
OpenSpec archive durable matrix tests
Policy checkpoint-readiness tests
real OpenSpec 1.7 archive relocation integration
D1/085 exact recovery regression
D2-active-with-historical-085 preparation regression
future archive success → Run completed → checkpoint boundary E2E
```

## 10. Out of scope

D2 不建立：

```text
generic Run recovery framework
generic transaction manager
generation registry
archive success ledger
OpenSpec shadow state
filesystem scan success proof
automatic retry / respawn
generic cancellation API
Git checkpoint executor redesign
D1 historical rewrite
E1 implementation
```

也不处理与本问题无直接关系的 Windows launcher、Finding、Owner Contract Reset、verification selection 等已经由 D1 或后续 Change拥有的范围。

## 11. Acceptance / conclusion

D2 Explore 结论：问题是通用 archive terminal-continuation contract 缺口，不是 D1 单次数据异常。

至少以下 acceptance 必须在 Proposal/Apply 被正式覆盖：

```text
A. real OpenSpec structured success + relocation 后，同一 archive Run可 completed；
B. terminal admission 不重新要求 active OpenSpec Change存在；
C. durable terminalObservation + mutation surface继续是唯一 archive operational safety proof，不扫描 archive path猜 success；
D. existing D1/085 可通过正式 Core surface闭合，无 rerun/手写 result；
E. historical 085 不再劫持 D2/E1 等后续 active Change preparation；
F. future checkpoint readiness要求 archive Run terminal；
G. external semantic drift仍 fail closed；
H. 不引入 generic recovery/generation/ledger framework。
```

本 Explore 不修改 production code/tests，不提前写 Proposal/Design/Specs/Tasks。
