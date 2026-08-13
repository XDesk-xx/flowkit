## Context

见 `proposal.md`。当前产品已经拥有 archive pre-spawn mutation guard、durable `terminalObservation`、`OpenSpecArchiveMutationSurfaceV1`、active-or-archived ResultRef 校验和 Core-owned `completeRun`。缺口集中在 post-relocation continuation 仍通过普通 `deriveSemanticInputs()` / `getChangeStatus()`重建 archive semantic context，以及 Delivery-wide pending archive lookup 先于 active Change binding。

历史 D1/085 是必须原样兼容的真实 fixture：它只有 schemaVersion 3 context、stored `semanticInputFingerprint`、approved review `inputRef`、durable success observation 与 guard F，没有单独持久化完整 Action Package。设计因此不能依赖“给未来 Run 新增字段后再迁移 085”。

## Goals / Non-Goals

**Goals:**

- 让 fresh archive success、crash/resume 与历史 085 使用同一个 archive terminal continuation contract。
- 在 active Change relocation 后重建并 exact-check archive entry semantic identity，而不再次查询 active Change status。
- 保持 Owner/Review/Verification/contract/tool-version drift fail closed。
- 让 preparation、diagnostics、Policy 对 historical pending archive 的 current relevance 一致。
- 保持 Checkpoint 只是 Change completed 后的 Git boundary，并要求 Archive Run 已 terminal。

**Non-Goals:**

- 不实现 generic Run recovery、generic transaction manager、archive ledger 或 OpenSpec shadow state。
- 不扫描 archive filesystem 来猜 OpenSpec success；success authority 仍是 durable structured terminal observation + mutation proof。
- 不重写 D1 checkpoint、D1 Manifest 历史或已完成 Run。
- 不改变 OpenSpec archive state machine、Standard Action catalog、Git checkpoint executor 或 E1 scope。

## Decisions

### 1. Future archive entry 持久化 bounded OpenSpec keyed projection；legacy 085 单独由 OpenSpec authority 重建

089 已证明仅凭 producer ResultRefs 的无标签 logical path set 无法无损恢复 archive entry 的 OpenSpec `artifactId → logicalPaths` keyed mapping；而 archive action 的 `externalContextFingerprint` 对整个 structured `OpenSpecPreparedActionContextView` 取 hash，因此这种关联属于 same-Run semantic identity，不是可推断的展示信息。

D2 因此为 **future Run** 增加一次 bounded ContextFile schema version（建议 `schemaVersion: 4`）。新 writer 对所有新 Run 使用当前 schema；只有 `action=archive` 时允许并要求：

```text
archiveEntryOpenSpecProjection:
  projectionVersion: 1
  version: <OpenSpec semantic version>
  changeId: <exact change id>
  changeRootLogical: <OpenSpec structured logical root>
  artifactPaths:
    proposal: [<logical path>...]
    specs:    [<logical path>...]
    design:   [<logical path>...]
    tasks:    [<logical path>...]
```

该 projection MUST直接从 archive preparation 已取得的 structured `OpenSpecPreparedActionContextView` 构造，并使用 `OPENSPEC_SUPPORTED_ARTIFACT_IDS` keyed closed shape；每个 path 只做现有 logical normalization / deterministic sorting。它 MUST NOT保存：

```text
artifact instructions
apply instructions
raw status
OpenSpec completion state
archive success result
physical absolute paths
完整 Action Package
```

因此它只是 archive continuation 所需的 **entry semantic source**，不是 OpenSpec shadow state或第二 authority。

Fresh archive preparation 同时：

```text
structured OpenSpec view
→ archiveEntryOpenSpecProjection
→ fingerprintOpenSpecPreparedActionContext(projection, 'archive')
→ externalContextFingerprint
→ buildSemanticDescriptor(...)
→ semanticInputFingerprint
```

post-relocation continuation 则：

```text
persisted archiveEntryOpenSpecProjection
→ reconstruct exact archive OpenSpec semantic view
→ same fingerprint function
→ current Review/Owner/Verification/contract facts
→ buildSemanticDescriptor(...)
→ exact-match stored semanticInputFingerprint
```

该路径不再调用 active `getChangeStatus(changeId)`，也绝不从 producer refs、文件名或目录结构重新猜 `artifactId` mapping。

#### Legacy D1/085 compatibility

085 是 immutable `schemaVersion: 3`，没有 projection，不能补写 context，也不能把未来 schema规则倒推成历史事实。Legacy adapter 仅服务：

```text
schemaVersion in {2,3}
+ action=archive
+ no archiveEntryOpenSpecProjection
+ durable terminalObservation.kind=success
+ guard.state=armed
+ mutation classification=known-success
```

它不通过 Flowkit path rule猜 mapping，而是在 **disposable isolated OpenSpec view** 中：

```text
1. 读取 terminalObservation.normalized.path 指向的 archived Change bytes；
2. 复制必要的 OpenSpec repo configuration 与该 archived Change bytes到临时 root；
3. 将该 Change仅在临时 root中呈现于 guard.changeRoot 对应的 entry logical location；
4. 调用当前受支持且必须与 entry version一致的 OpenSpec CLI structured `status --change <id> --json`；
5. 由 OpenSpec 自己返回 artifactPaths keyed mapping；
6. adapter只把临时 physical paths归一化回 guard.changeRoot 下的 repo-logical paths；
7. 使用与 future projection 相同的 archive semantic fingerprint function。
```

临时 view：

- MUST位于 disposable temp root，绝不写回 canonical `openspec/changes/**`；
- MUST NOT作为 archive success proof；success仍只来自 durable structured terminalObservation + mutation guard classification；
- MUST NOT改变 archived Change bytes、canonical specs或085 context；
- MUST在 OpenSpec version mismatch、structured mapping不完整、change identity不一致、temp reconstruction失败时 fail closed；
- MUST只用于缺少 projection 的 pre-D2 archive terminal recovery，不成为 generic OpenSpec replay或迁移框架。

本次 Proposal 已在 detached feasibility check 中验证：将085 archived Change bytes仅复制到 disposable OpenSpec root并调用 OpenSpec 1.7 structured status，可以由 OpenSpec 返回完整 `proposal/specs/design/tasks` keyed `artifactPaths`，无需 Flowkit 默认 path inference。

### 2. known-success terminalization 与 archive invocation 解耦，并复用 existing Core writer

Archive invocation/recovery service 继续负责 operational safety classification：

```text
terminalObservation.success + current V1 != F
→ known-success
```

B1 archive continuation 负责 execution admission：

```text
known-success
+ reconstructed semantic fingerprint == stored fingerprint
+ exact run/change identity
+ current applicable external authority refs仍一致
→ build Core-owned logical archive completion from durable observation
→ existing completeRun / serialization / create-once writer
→ result.json completed
```

该路径 MUST NOT respawn OpenSpec，也不接受 caller 提供 `archivedAs/path/specsUpdated`；terminal result完全来自 durable observation。若 Manifest 已因 structured success 变为 completed，terminal writer 将其视为幂等 post-mutation formal state，而不是要求重新激活 Change。

### 3. Preparation precedence 先绑定 current active Change，再考虑 cross-Change archive continuation

`prepareActionExecution()` 与 `inspectPreparedRun()` 使用一致 precedence：

```text
active Change exists
→ 只处理该 active Change 的 Standard Action / pending Run
→ 其它 completed/checkpointed Change 的 pending archive 不得抢占

no active Change
→ 若存在当前 lifecycle relevant 的 pending archive continuation
   → same-Run resume/recovery
→ 否则消费 shared next(snapshot)
```

Delivery-wide historical scan 只作为“无 active Change时寻找 archive continuation”的 bounded recovery input，不再位于 active Change binding 之前。

### 4. 历史已 checkpoint 的 known-success archive 使用显式 bounded recovery surface

新增：

```text
flowkit recover archive-terminal
```

该 command 不接受任意 Run result，也不允许 caller 指定 success/failure内容。它只在以下条件全部成立时工作：

```text
exactly one eligible pending archive
terminalObservation.kind = success
archive recovery classification = known-success
entry semantic reconstruction exact-match
Core terminal writer仍可 create-once publish
```

若 0 个、多个、failure/outcome-unknown/recovery-required、semantic drift 或已 terminal，均 fail closed。该 surface 的必要性仅用于 D1/085 这类已被错误 checkpoint 后又存在后续 active Change 的历史现场；正常 future flow 应在 Checkpoint 前自动闭合 archive Run，不需要 Owner 手工选择某 Run。

### 5. Checkpoint readiness 增加 archive Run terminal condition，但不改变 Change completed 定义

OpenSpec structured success 仍可使 Manifest Change `completed`；D2 不把 Checkpoint反向变成 completion condition。

Policy 在无 active Change、寻找 completed-uncheckpointed Change 时，必须同时看到该 Change 的 archive execution terminal fact：

```text
completed + archive Run completed + no checkpoint
→ owner-decision: authorize-checkpoint

completed + archive Run pending/non-terminal + no checkpoint
→ blocked/recovery-required
```

FormalFactReader 只需为“completed 且尚未 checkpoint 的 target Change”投影相关 archive Run terminal fact；不得因此恢复加载整个 Delivery history。已 checkpoint 的 D1/085 不应阻塞 D2 Policy，由显式 recovery surface负责历史清理。

### 6. D1/085 recovery 是 acceptance，不是历史 rewrite

D2 Apply 在 production fix完成并通过 focused regression 后调用 `flowkit recover archive-terminal`。成功结果应是：

```text
existing 085 action.md/context.json unchanged
+ new Core-owned 085/result.json completed
+ no OpenSpec respawn
+ D1 remains completed/checkpointed
```

这是一条新的合法 terminal fact，不修改原 checkpoint commit，也不声称 085 在 `a89d4a6...` 时已经 completed。

### 7. Contract Reset currentness 是 proposal-stage reset，不是全历史 generation registry

本次 097 暴露的核心矛盾是：`currentContractResetRefs()` 已存在，但不同消费者对它的使用边界不同。Policy 先过滤 current Runs，却仍用 all historical Runs做 stage detection；B1 `computeResetAwareLineage()` 在 detected stage与requested stage不一致时又退回全部历史 lineage；immutable contract producer选择也可重新绑定旧 proposal generation。结果是 routing声称新 Apply合法，而 formal preparation又因旧 proposal fingerprint与当前 contract bytes不一致而 fail closed。

D2 不新增 generation object。统一规则限定为：

```text
Contract Reset
→ invalidates proposal contract generation and all downstream Proposal/Apply/Archive currentness, including revise-propose / revise-apply producers
→ preserves the already-approved Explore discovery as the handoff into a fresh Proposal
→ current proposal/downstream Runs are exactly those carrying the current complete Contract Reset identity, across propose/revise-propose/review-propose/apply/revise-apply/review-apply/archive
```

因此 reset-aware lifecycle projection MUST满足：

```text
Explore lineage
→ 继续使用最近合法 approved Explore artifact/review

Proposal stage lineage
→ `propose/revise-propose/review-propose` 只消费与 current Contract Reset refs exact-match 的 Runs / Reviews

Apply stage lineage
→ `apply/revise-apply/review-apply` 只消费与 current Contract Reset refs exact-match 的 Runs / Reviews

Archive lineage
→ `archive` 只消费与 current Contract Reset refs exact-match 的 Runs

current reset exists + no current propose producer
→ stage = propose
→ next = propose

current propose completed
→ review-propose

current review-propose approved
→ authorize/apply for that same current generation
```

`stage`、`currentArtifactRun`、`lineage`、current review、`next`、`canRun`、unified entry、`deriveRunDescriptors` 与 immutable producer selection MUST共享这一 bounded projection；stage artifact actions中的 `revise-propose` / `revise-apply` MUST与base producer使用相同 reset filter，不得任何一处退回“all historical Runs”来恢复旧 artifact或approval。

090-revise-propose、094-revise-apply与097-apply都保持 immutable historical completed Run；新的 reset identity使它们自然不匹配 current proposal/downstream generation。无需新增 `supersededBy` 字段、generation table或Run rewrite。

**Alternative rejected:** 把 Contract Reset视为“整个 Change 从 explore 重开”。这会丢弃仍然有效的 discovery/review-explore，且不符合 Owner明确要求的 fresh `propose` generation。

**Alternative rejected:** 在 preparation遇到 fingerprint drift时临时允许旧 approval。那会绕过 Review authority，正是 097 所暴露的不一致。

## Risks / Trade-offs

- [Risk] future persisted keyed projection 与 fresh OpenSpec view ordering不同 → Mitigation: 两者共用 `OPENSPEC_SUPPORTED_ARTIFACT_IDS` closed key order、path normalization/sort 与同一个 archive fingerprint函数；不得从 ResultRefs重建 mapping。
- [Risk] OpenSpec tool version在 crash 后变化导致历史 Run无法恢复 → Mitigation: tool version属于 archive entry semantic input；版本变化必须 fail closed，而不是隐藏 drift。
- [Risk] Policy 为 checkpoint读取整个历史 Run corpus → Mitigation: Reader 只投影唯一 completed-uncheckpointed target 的 archive terminal fact；已 checkpoint历史 pending不进入 normal next。
- [Risk] recovery CLI 被扩成万能 Run completion → Mitigation: command无 caller-supplied result，且只接受 durable success observation + known-success mutation classification + exact semantic match。
- [Risk] fresh archive success先写 Manifest completed再写 result 导致短窗口 no-active-change → Mitigation: no-active-change preparation 专门识别 same pending archive continuation，并在 terminal 前阻止 checkpoint readiness。

## Migration Plan

1. 统一 reset-aware lifecycle projection：保留 approved Explore lineage；Proposal stage 的 `propose/revise-propose/review-propose`、Apply stage 的 `apply/revise-apply/review-apply` 与 Archive 的 `archive` 都只认 current reset identity，并让 stage detection / currentArtifactRun / Policy / preconditions / B1 descriptors / producer binding共用它。
2. 增加 regression：096→Reset→fresh propose；旧 090/091/094/095/097 不得决定 current stage/current artifact/current review 或被新 Action Package消费；`status/next/doctor/prepare` 必须一致。
3. 保留并验证 archive-sync canonical scenario identity以及既有 archive continuation/085 recovery tests。
4. 新 generation按 `propose → review-propose → apply → review-apply → archive` 完整 dogfood；archive success必须 normal same-Run terminalize并进入 checkpoint boundary。
