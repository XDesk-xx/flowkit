# flowkit-openspec-1-7-thin-integration Specification

## Purpose
以 OpenSpec 1.7 external CLI 的 structured JSON surface 作为 Change planning/artifact lifecycle 与 archive operation authority，并为 Flowkit 提供受限、可验证、repo-local 的 typed thin integration，而不复制 OpenSpec state machine 或扩张成第二编排器。
## Requirements
### Requirement: C1 必须通过 external OpenSpec machine CLI 建立 thin adapter，并以 stable 1.7.0 为 minimum baseline

Flowkit MUST 通过 external `openspec` executable 调用 OpenSpec，MUST NOT import/vendor OpenSpec internal modules。C1 adapter MUST只暴露当前 Change lifecycle 所需的固定 machine command surface，并将 command output解析为typed structured result；caller MUST NOT通过该 adapter执行任意 OpenSpec subcommand。

Compatibility MUST使用以下 contract：minimum supported baseline = stable `1.7.0`；MUST NOT设置固定 minor / major upper bound。Version number只作为 compatibility signal，不是唯一 compatibility authority。Stable version低于`1.7.0`、malformed version与未有explicit prerelease support evidence的prerelease MUST fail closed。Stable `>=1.7.0`只获得进入 machine-contract admission 的资格；required command、JSON shape、requested-Change/path semantics、exit/result coherence、validation semantics、archive terminal/mutation semantics任一不满足 MUST fail closed。

#### Scenario: stable OpenSpec 1.7.0 baseline 被接纳

- **WHEN** `openspec --version` 返回 stable `1.7.0`
- **AND**当前 required structured command output满足对应 typed/semantic contract
- **THEN** C1 adapter MUST接纳该 required surface

#### Scenario: stable higher version 不因 upper bound 被机械拒绝

- **WHEN** `openspec --version` 返回 stable `1.8.0`、`2.0.0` 或其它高于 baseline 的 stable version
- **AND** Flowkit 当前实际依赖的 required structured machine surface满足 frozen command/shape/path/coherence/archive contract
- **THEN** adapter MUST NOT仅因 minor/major version number 较高而拒绝
- **AND** MUST按相同 machine-contract admission继续

#### Scenario: stable higher version contract drift 必须 fail closed

- **WHEN** stable version高于 `1.7.0`
- **AND**任一 required command缺失、JSON shape不受支持、requested Change/path identity不一致、exit/result coherence冲突、validation semantics不一致或archive terminal/mutation semantics不受支持
- **THEN** adapter MUST返回 machine-readable compatibility/conformance failure
- **AND** MUST NOT因 version number `>=1.7.0` 而继续

#### Scenario: prerelease 不得由 numeric version 自动支持

- **WHEN** `openspec --version` 返回 `1.7.0-beta.1`、`1.8.0-rc.1` 或其它 prerelease
- **AND**当前 C1没有对该 prerelease 的 explicit conformance support contract
- **THEN** adapter MUST fail closed
- **AND** MUST NOT仅因 numeric components达到或超过 `1.7.0` 而接纳

#### Scenario: below-baseline 或 malformed version 被拒绝

- **WHEN** stable version低于 `1.7.0`
- **OR** version output malformed / 无法稳定解析
- **THEN** adapter MUST返回 machine-readable unsupported-version failure
- **AND** MUST NOT继续执行 lifecycle mutation

#### Scenario: 不允许 generic OpenSpec command passthrough

- **WHEN** lifecycle caller尝试传递任意 subcommand/args
- **THEN** production adapter MUST拒绝该接口形态
- **AND** only fixed C1 methods MAY construct OpenSpec command arguments

### Requirement: OpenSpec invocation 必须对 process failure 与 machine output fail closed

每个 OpenSpec production invocation MUST有 bounded timeout，并 MUST区分 spawn failure、timeout、non-zero exit、invalid JSON、structured error status与valid structured result。Machine command MUST禁用不必要 color/interactive behavior；stderr prose MUST NOT成为唯一 machine authority。

默认 production timeout MUST 为 `30000ms`。Tests MAY注入更短 timeout验证行为。低层 process helper只报告process/transport facts。Read-only command可以把timeout/malformed output作为普通fail-closed diagnosis；mutating `archive`一旦成功spawn但没有可接纳的OpenSpec structured terminal result，C1 MUST升级为`OPENSPEC_ARCHIVE_OUTCOME_UNKNOWN`，不得当作普通retryable failure。

#### Scenario: timeout 不被伪装成普通 exit failure

- **WHEN** OpenSpec command超过 configured timeout
- **THEN** process MUST被终止或进入确定性的 timeout completion path
- **AND** result MUST明确标记timedOut process fact
- **AND** read-only invocation MUST fail closed
- **AND**已经spawn的mutating archive MUST进入`outcome-unknown`而非普通failure

#### Scenario: invalid JSON 被拒绝

- **WHEN** read-only process返回可执行 exit status但 stdout不是对应 command的合法 structured JSON
- **THEN** adapter MUST返回 malformed-output failure
- **AND** MUST NOT从 human prose猜测 operation result

#### Scenario: mutating archive terminal output 丢失属于 outcome unknown

- **WHEN** archive child已经成功spawn
- **AND** timeout、transport loss或missing/malformed stdout导致没有可接纳structured terminal result
- **THEN** adapter MUST返回`OPENSPEC_ARCHIVE_OUTCOME_UNKNOWN`
- **AND** MUST NOT把它映射成普通archive failure
- **AND** MUST NOT自动发起第二次archive

#### Scenario: structured error 与 non-zero exit均被消费

- **WHEN** OpenSpec返回 non-zero exit并同时返回 structured `status[]`/validation issues
- **THEN** adapter MUST保留该 structured diagnosis
- **AND** MUST把 operation terminal status视为failure
- **AND**若该 operation 是已经spawn的mutating archive，MUST在任何普通 failure terminal收口前执行 post-invocation V1 vs stored F 判定
- **AND** structured failure本身 MUST NOT被解释为 no-mutation proof
- **AND** structured diagnosis MUST NOT自己决定 Flowkit next

### Requirement: C1 仅支持 repo-local planning home 并验证 structured root identity

本 Change交付的 OpenSpec integration MUST只支持 repo-local planning mode。Adapter MUST验证 OpenSpec `root/planningHome/actionContext` 与 caller提供的 canonical repository root一致，并 MUST拒绝 unsupported store/home 或 wrong-root output。

至少必须满足：

```text
root.path == repoRoot
planningHome.kind == repo
planningHome.root == repoRoot
actionContext.mode == repo-local
actionContext.sourceOfTruth == repo
changeRoot 位于 planningHome.changesDir 下且对应 requested changeId
```

#### Scenario: repo-local root 被接纳

- **WHEN** OpenSpec structured output指向 caller canonical repoRoot
- **AND** planningHome/actionContext均为 repo-local
- **THEN** adapter MAY继续生成 normalized view

#### Scenario: store planning home fail closed

- **WHEN** `planningHome.kind` 不是 `repo`
- **OR** root/planningHome/changeRoot不属于 caller canonical repoRoot
- **THEN** adapter MUST返回 unsupported-planning-home或path-authority failure
- **AND** MUST NOT建立 Store Registry或自动切换 authority root

### Requirement: OpenSpec physical path 必须证明 requested Change + real containment + artifact identity 后再转换成 Flowkit logical ref

OpenSpec structured output中的 absolute physical path MUST先解析为 normalized physical identity，并通过 symlink-safe realpath proof或等价 machine proof验证其处于 canonical repoRoot与适用 planningHome/changeRoot边界内，再转换为 repository-relative POSIX logical ref。Lexical prefix containment alone MUST NOT作为充分证明。Caller MUST NOT直接把任意 absolute OpenSpec path持久化为 ResultRef authority。

Planning artifacts `proposal/specs/design/tasks` MUST来自 OpenSpec `artifactPaths`/`contextFiles`。Apply instructions 的`changeDir` MUST exact-bind当前 requested Change 的 validated structured root；`changeName`单独相等不充分。Flowkit-owned `explore.md` 与 Verification-owned `verification.md` MUST只通过 validated `changeRoot + owned filename`派生。

Singleton planning artifacts（至少proposal/design/tasks）MUST有唯一logical+physical identity；duplicate `resolved/existing`、同一artifact多个不一致path、跨artifact alias/conflict或无法消歧identity MUST fail closed。

#### Scenario: planning artifact 使用 OpenSpec structured path

- **WHEN** adapter读取 proposal/spec/design/tasks path
- **THEN** physical path MUST来自当前 OpenSpec structured `artifactPaths`或`contextFiles`
- **AND** converted logical ref MUST位于同一 validated changeRoot
- **AND** singleton artifact MUST exactly-one identity

#### Scenario: wrong requested Change context 被拒绝

- **WHEN** caller请求 Change `A`
- **AND** OpenSpec apply/status output声明name为`A`但 `changeDir/changeRoot`实际绑定另一个Change `B`
- **THEN** adapter MUST fail closed
- **AND** MUST NOT消费 `B` 的 proposal/design/specs/tasks 作为 `A` context

#### Scenario: symlink escape 或 alias containment 被拒绝

- **WHEN** lexical path看似位于repo/changeRoot内
- **AND** realpath/symlink解析实际指向 admitted root之外或形成无法消歧alias
- **THEN** adapter MUST fail closed
- **AND** MUST NOT把 lexical containment当成physical identity proof

#### Scenario: ambiguous singleton artifact identity 被拒绝

- **WHEN** proposal/design/tasks 任一 structured artifact存在多个 conflicting `resolved/existing` path
- **OR**两个不同singleton artifact解析为同一 physical/logical identity
- **THEN** adapter MUST返回 stable ambiguity/path-authority failure
- **AND** MUST NOT任意选择第一个path

#### Scenario: path escape 被拒绝

- **WHEN** structured absolute path解析后位于 repoRoot/changeRoot之外
- **OR**包含无法消歧的 root/change identity
- **THEN** adapter MUST fail closed
- **AND** MUST NOT把该 path转换为 logical ResultRef

#### Scenario: Explore 与 Verification 不伪装成 OpenSpec graph node

- **WHEN** Flowkit解析 `explore.md` 或 `verification.md`
- **THEN** MUST从 validated changeRoot派生该 formal file
- **AND** MUST NOT调用或伪造 `instructions explore` / `instructions verification`
- **AND** MUST NOT声称 default `spec-driven` graph拥有这两个 artifact id

### Requirement: default spec-driven artifact authority split 必须保持 one fact one authority

Future Changes 与 current C1 MUST继续使用 `schema: spec-driven`。OpenSpec graph authority MUST仅拥有其真实 `proposal/specs/design/tasks` planning artifacts；Flowkit Author MUST拥有 Explore formal fact，Verification authority MUST拥有 post-Apply Verification formal fact。C1 MUST NOT创建 custom schema/template fork来复制 OpenSpec graph。

这些 non-graph formal files MAY位于 OpenSpec changeRoot并随 OpenSpec archive目录 relocation移动，但 relocation MUST NOT被解释为 OpenSpec拥有其业务语义。

OpenSpec 1.7 zero-delta Change MUST通过activation前已冻结的`specDeltaMode` activation-time declaration决定是否写`skip_specs: true`。该决定 MUST NOT延后到Propose。

#### Scenario: current C1 metadata 不迁移

- **WHEN** current C1已经以 `schema: spec-driven` activation并被 Review binding
- **THEN** C1 Proposal/Apply MUST NOT通过 silent metadata rewrite迁移当前 Change schema
- **AND** current C1 MUST保持该 metadata generation直到 archive

#### Scenario: future Change 继续使用 spec-driven

- **WHEN** C1实现完成后 A1激活 future Change
- **THEN** minimal metadata MUST继续声明 `schema: spec-driven`
- **AND** OpenSpec planning graph MUST继续只按真实 schema管理 proposal/specs/design/tasks
- **AND** `specDeltaMode=skip`时 MUST在activation metadata写`skip_specs: true`
- **AND** `specDeltaMode=required`时 MUST不写该flag

#### Scenario: zero-delta declaration 不得延后到 Propose

- **WHEN** future Change需要合法zero-delta lifecycle
- **THEN** `specDeltaMode=skip` MUST在pre-activation/activation request形成
- **AND** Propose/Revise-Propose MUST NOT修改`.openspec.yaml`补救该决定

#### Scenario: verification 保持 post-Apply authority

- **WHEN** tasks complete且 Apply可以开始
- **THEN** OpenSpec graph MUST NOT要求 `verification` artifact node先完成
- **AND** `verification.md` MUST继续由 Flowkit Change Verification在 Apply 后产生/更新

### Requirement: Standard Change Actions 必须在 production execution surface 消费其需要的最小 OpenSpec structured context

C1 integration MUST按已存在的 B1 Standard ActionDefinition消费最小 OpenSpec context，MUST NOT创建新的 Formal Action或让 OpenSpec决定 Action。Adapter API存在本身不构成满足；每个冻结的 structured fact MUST有 production preparation/execution caller，并让当前 Action执行取得 bounded normalized view。

```text
explore / revise-explore
→ validated status/changeRoot

propose / revise-propose
→ status artifactPaths + planning artifact instructions
→ production OpenSpecActionContext

apply / revise-apply
→ instructions apply contextFiles + progress/state
→ production OpenSpecActionContext

review-*
→ B1 ResultRef-bound reviewed target；OpenSpec不产生 Verdict

archive
→ OpenSpec archive structured operation result
```

`OpenSpecActionContext` 或等价薄 view MUST参与 pending Run semantic input drift protection，但 MUST NOT改变 B1 fixed ActionDefinition、Policy next、Reviewer/Owner authority，也 MUST NOT建立通用 context registry。

#### Scenario: Propose planning instructions 被 production caller 消费

- **WHEN** current Action为 Propose或Revise-Propose
- **THEN** production preparation MUST调用/消费 required planning artifact instructions
- **AND**当前 Author execution view MUST可取得 proposal/specs/design/tasks 的 normalized instructions/paths
- **AND**这些 structured facts MUST参与 same-Run semantic drift proof
- **AND** MUST NOT只存在于 adapter unit test 或 unused method

#### Scenario: Apply contextFiles/progress/state 不由 Flowkit手工枚举或丢弃

- **WHEN** current Action为 Apply或Revise-Apply
- **THEN** planning input files MUST优先消费 OpenSpec `instructions apply --json` 的 concrete `contextFiles`
- **AND** production execution view MUST同时保留/暴露 structured `progress/state`
- **AND**这些 structured facts MUST参与 same-Run semantic drift proof
- **AND** Flowkit MUST NOT维护第二套 proposal/spec/design/tasks dependency graph

#### Scenario: Review authority 不转给 OpenSpec

- **WHEN** Reviewer执行 review-explore/review-propose/review-apply
- **THEN** reviewed target MUST继续由 B1 ResultRef/Review lineage绑定
- **AND** OpenSpec status/validation MUST NOT直接产生 Review Verdict

### Requirement: OpenSpec strict validation 必须同时满足 structured validity 与 process/result/status coherence，且不是 Policy authority

Propose/Revise-Propose terminal admission前与 Apply/Revise-Apply preparation前，C1 MUST执行当前 Change OpenSpec strict validation并解析 structured result。Requested Change validation item MUST唯一且identity匹配。Validation failure MUST阻止对应 integration step继续，但 MUST只形成 structured failure diagnosis/validation fact，MUST NOT计算或覆盖 Flowkit Policy next。

`item.valid=true` MUST NOT单独成为 pass authority。只有process exit、top-level structured status与requested item validity互相一致时 MAY接纳 validation pass。`valid=true + nonzero exit`、`valid=true + error severity status`、requested item/status identity冲突或其它互相矛盾shape MUST fail closed为 validation coherence failure。合法 `valid=false` MAY保留 structured issues/status，即使process exit为non-zero。

#### Scenario: valid=true 与 nonzero exit 冲突必须 fail closed

- **WHEN** requested validation item返回`valid=true`
- **AND** process exitCode非0
- **THEN** adapter MUST返回 validation coherence failure
- **AND** B1 preparation/terminal admission MUST NOT继续

#### Scenario: valid=true 与 structured error status 冲突必须 fail closed

- **WHEN** requested validation item返回`valid=true`
- **AND** top-level `status[]`包含 error severity/code
- **THEN** adapter MUST返回 validation coherence failure
- **AND** MUST NOT把item.valid单独解释为pass

#### Scenario: 合法 invalid Change structured evidence 被保留

- **WHEN** requested validation item明确`valid=false`
- **AND** structured issues/status与failure一致
- **THEN** adapter MUST保留该bounded structured diagnosis
- **AND** corresponding Propose/Apply integration step MUST fail validation
- **AND** MUST NOT把nonzero exit导致的合法structured invalid evidence丢弃

#### Scenario: Propose terminal前 strict validation失败

- **WHEN** Proposal bundle不满足 OpenSpec strict validation
- **THEN** current Propose/Revise-Propose MUST NOT被作为成功 planning contract接纳
- **AND** pending Run/target MUST保留可诊断状态

#### Scenario: Apply前 planning contract无效

- **WHEN** Apply/Revise-Apply preparation读取 current planning contract
- **AND** OpenSpec strict validation失败
- **THEN** integration MUST fail closed
- **AND** MUST NOT用 stale/partial contextFiles继续实现

### Requirement: current C1 self-archive bootstrap 必须在 OpenSpec relocation 与 Flowkit completed admission 之间保持可恢复

Current C1 archive MAY先把C1 delta merge到canonical `openspec/specs/**`，再relocate/remove active C1 `changeRoot`，而此时Flowkit Delivery Manifest中的C1仍可能是`active`。C1 integration activation MUST NOT仅以canonical C1 capability spec文件存在作为global structured Reader切换条件。

在 current C1 尚未被Flowkit admission为`completed`时，B1/C1 action integration MAY直接使用OpenSpec adapter执行/恢复当前Action；FormalFactReader MUST保留 bootstrap-safe path，不得因为canonical spec刚出现就对已relocated的active C1再次调用OpenSpec status。Archive result admission/recovery MUST依赖 durable terminalObservation + mutation guard/current V1 facts，而不是filesystem scan猜operation success。C1 completed后，future Changes MAY进入normal structured Reader path。

#### Scenario: canonical spec 已 merge 但 Manifest仍 active

- **WHEN** current C1 archive已把C1 capability delta merge到canonical specs
- **AND** active C1 changeRoot已被OpenSpec relocate
- **AND** Flowkit Manifest中C1仍为`active`
- **THEN** FormalFactReader/doctor/status MUST NOT仅因canonical spec存在而查询不存在的active C1 OpenSpec status
- **AND** archive admission MUST仍能从durable terminal/recovery facts继续同一次 archive收口
- **AND** MUST NOT自动spawn第二次archive

#### Scenario: C1 completed 后 future structured Reader 正常启用

- **WHEN** current C1 archive terminal result已被合法admit且Manifest C1变为`completed`
- **THEN** future active Change MAY使用C1 structured Reader/path resolver
- **AND** activation seam MUST来自Flowkit formal lifecycle state或等价 deterministic fact，不得退回“capability spec file exists”单条件

### Requirement: OpenSpec archive operation result 必须是 archive success/failure authority

在 Flowkit/B1 已满足 archive Action的 Policy、Owner、Review、Verification前置后，C1 MUST调用 OpenSpec structured archive operation并消费其 terminal result。

Known successful archive MUST至少满足：

```text
exitCode == 0
archive.change == requested changeId
archive.archivedAs = non-empty
archive.path = admissible structured path
archive.specsUpdated = boolean
no error severity status
```

`archive.totals` MAY absent。若present，C1 MUST验证其为supported structured numeric totals；若absent，尤其在`skip_specs:true`或其它OpenSpec 1.7.0合法zero-delta success中，MUST NOT因此拒绝success。

OpenSpec known success后 Flowkit MUST NOT通过扫描archive目录、重新执行spec sync或historical ResultRef replay二次证明operation。B1 persisted pending archive lookup只服务same-Run execution identity，不得升级成 archive success authority。

Mutating archive MUST使用 durable pre-spawn recovery gate。任何可能调用OpenSpec `archive`的pending archive Run，在 child spawn 前 MUST先计算 `OpenSpecArchiveMutationSurfaceV1` fingerprint，并将 machine-owned `archiveMutationGuard.state=armed` + `surfaceVersion` + validated surface refs + `preArchiveGenerationFingerprint` 原子持久化到同一 Run `context.json`；arm 后 MUST再次计算 V1 并证明 fingerprint未因 guard 自身写入而改变，只有 exact-match 才 MAY spawn。

`OpenSpecArchiveMutationSurfaceV1` MUST只覆盖 OpenSpec archive 本次 mutation/collision 所依赖的三类事实：(A) validated active `changeRoot` 全目录与regular-file exact bytes；(B) repo-local canonical `openspec/specs/**` 全目录与regular-file exact bytes；(C) validated `planningHome.changesDir/archive` root identity 与 immediate child name/type collision namespace。它 MUST NOT递归历史 archive正文，也 MUST NOT包含 `.flowkit/**`（含guard自身）、`.git/**`、`node_modules/**`、`dist/**` 或其它无关repo环境。被纳入surface的symlink/unsupported entry MUST fail closed。该fingerprint是OpenSpec mutation recovery proof，不是B1 semantic input identity。

Archive child已经spawn后，若 adapter取得可接纳structured terminal success/failure，C1 MUST在分类前把最小 normalized typed `terminalObservation` 原子写入同一 guard。Observation MUST至少包含 `kind=success|failure`、canonical normalized observation fingerprint，以及完成/诊断所需的bounded typed fields；success只保存`change/archivedAs/path/specsUpdated/optional totals`，failure只保存`exitCode`与structured status severity/code set。MUST NOT保存 raw stdout/stderr或human logs。Observation位于`.flowkit/**`，MUST NOT进入V1。若 observation publish后process crash，新session MUST使用该durable observation + current V1继续分类，不得把它当成missing-result outcome unknown。

Child spawn 前已证明的 spawn failure MAY作为 known-no-mutation process failure处理。Child 一旦已经spawn，C1 MUST在任何 Change completed、普通 Run terminal success/failure、recovery decision 或第二次 mutation 前使用**durable terminal observation（若有）+ current V1 vs stored F**进行二维判定：success observation只有post V1 != F时才可作为supported known success继续Change completed；success + same属于`OPENSPEC_ARCHIVE_TERMINAL_STATE_MISMATCH`并terminal fail closed。Failure observation只有post V1 == F时才是known-no-persistent-mutation failure并可普通terminal failure收口；failure + drift必须保持同一pending Run与durable guard并进入known-but-mutated / recovery-required。Exact recovery回到F后，该durable failure observation MUST重新分类为failure + same并直接terminal failed，MUST NOT再次spawn。只有完全没有可接纳/durable terminal observation的情况，无论post V1是否等于F都属于`OPENSPEC_ARCHIVE_OUTCOME_UNKNOWN`；exact recovery后才 MAY atomic转为`recovery-admitted`并允许same-Run retry。`archive_change_not_found`不得证明原操作成功。

#### Scenario: archive structured success with totals 被接纳

- **WHEN** OpenSpec 1.7.0 archive child已经spawn
- **AND** structured archive result与requested changeId一致、required fields合法且包含totals
- **AND** post-invocation V1 与 stored pre-archive F 不同
- **THEN** C1 MUST接纳success
- **AND** totals MUST通过supported structured numeric shape验证
- **AND** post-V1 drift只作为mutation safety invariant，不要求Flowkit扫描archive path重证OpenSpec success
- **AND** caller MAY据此继续Change completed mutation

#### Scenario: zero-delta archive success without totals 被接纳

- **WHEN** 合法`skip_specs:true` zero-delta Change由OpenSpec 1.7.0 archive成功
- **AND** result含`change/archivedAs/path/specsUpdated=false`但省略totals
- **AND** post-invocation V1 与 stored F 不同（至少active Change relocation/archive namespace发生变化）
- **THEN** C1 MUST接纳success
- **AND** MUST NOT因totals缺失误判malformed

#### Scenario: structured success 但 mutation surface 未变化必须 fail closed

- **WHEN** archive child已经spawn并返回可接纳structured terminal success
- **AND** post-invocation V1 仍 exact-match stored F
- **THEN** C1 MUST返回`OPENSPEC_ARCHIVE_TERMINAL_STATE_MISMATCH`或等价稳定machine failure
- **AND**同一Run MAY按terminal failed收口，因为current mutation surface仍是pre-archive generation
- **AND** Change MUST NOT转为completed
- **AND** MUST NOT把structured success单独提升为supported archive completion
- **AND** MUST NOT自动发起第二次archive

#### Scenario: structured failure 且 mutation surface 未变化才是 known-no-mutation

- **WHEN** archive child已经spawn并返回可接纳structured terminal failure/error status
- **AND** post-invocation V1 exact-match stored F
- **THEN** C1 MAY按known-no-persistent-mutation failure普通terminal收口
- **AND** MUST NOT扫描filesystem自行推断其它success/failure
- **AND** guard MAY作为terminal historical context保留，但该Run不再是pending recovery gate

#### Scenario: structured failure 且 mutation surface 已变化必须 recovery-required

- **WHEN** archive child已经spawn并返回可接纳structured terminal failure/error status
- **AND** post-invocation V1 与 stored F 不同
- **THEN** C1 MUST分类为known-but-mutated / recovery-required
- **AND** structured failure的normalized terminalObservation MUST已经durable存在于guard
- **AND**同一B1 archive Run MUST保持pending
- **AND** durable `armed` guard MUST继续跨process/session阻止第二次mutation
- **AND** MUST NOT普通terminal failure收口或自动retry
- **AND** exact pre-archive mutation surface恢复并machine-proven后 MUST使用同一failure observation重新分类为failure + same并terminal failed
- **AND** MUST NOT为该已知失败再次spawn OpenSpec archive

#### Scenario: archive_target_exists after spec writes 必须进入 recovery boundary

- **WHEN** OpenSpec 1.7.0 在archive target collision前已经写入canonical specs
- **AND**随后返回structured `archive_target_exists` failure
- **AND** active Change仍存在但post-invocation V1因canonical specs/archive namespace drift而不同于F
- **THEN** C1 MUST走known-but-mutated / recovery-required分支
- **AND** MUST NOT因structured failure存在而绕过durable recovery gate

#### Scenario: 无可接纳 terminal result 无论 surface 是否变化都属于 outcome unknown

- **WHEN** archive child已经spawn
- **AND** timeout、transport loss、process crash或missing/malformed terminal result导致没有可接纳structured terminal result
- **THEN** durable guard MUST不存在可接纳terminalObservation
- **AND**无论post-invocation V1是否等于stored F，C1 MUST返回/恢复为`OPENSPEC_ARCHIVE_OUTCOME_UNKNOWN`
- **AND** Change MUST NOT转为completed
- **AND**同一Run与durable guard MUST保持recovery-required
- **AND** MUST NOT自动retry

#### Scenario: fresh archive 在第一次 spawn 前先 durable arm

- **WHEN**一个合法 fresh pending archive Run没有`archiveMutationGuard`
- **AND** C1准备第一次调用OpenSpec archive
- **THEN** C1 MUST先计算当前 `OpenSpecArchiveMutationSurfaceV1` fingerprint F
- **AND** MUST原子持久化`state=armed`、`surfaceVersion=v1`、validated surface refs与F
- **AND** arm后重算V1 MUST仍为F，证明`.flowkit` guard写入不自引用
- **AND**只有arm成功且post-arm proof仍exact-match后 MAY spawn child
- **AND** arm/persist/proof任一步失败 MUST NOT spawn

#### Scenario: pre-spawn durable arm 后 result 丢失进入 outcome unknown

- **WHEN** C1已经在spawn前原子持久化`archiveMutationGuard.state=armed`
- **AND** archive可能已经spawn/mutate，但process crash、timeout、transport loss或missing/malformed terminal result使success/failure不可证明
- **THEN** C1 MUST返回/恢复为`OPENSPEC_ARCHIVE_OUTCOME_UNKNOWN`
- **AND** Change MUST NOT转为completed
- **AND**同一B1 archive Run MUST保持pending且guard保持`armed`
- **AND**跨session prepare/inspect/invoke MUST NOT把它视为普通resumable archive
- **AND** MUST NOT自动retry或扫描filesystem猜测success

#### Scenario: guard/control-plane 与无关 repo drift 不污染 recovery proof

- **WHEN** pre-archive V1 fingerprint 已计算
- **AND** 仅发生 `.flowkit` guard持久化、`.git` metadata、`node_modules/dist` 或其它不属于A/B/C surface的repo环境变化
- **THEN** V1 fingerprint MUST保持不变

#### Scenario: OpenSpec archive mutation surface drift 必须阻止 recovery-admit

- **WHEN** pending archive guard为`armed`
- **AND** active Change source、canonical specs 或 archive namespace immediate child identity任一发生变化
- **THEN** current V1 MUST与stored fingerprint不同
- **AND** recovery-admit MUST fail closed

#### Scenario: retry not-found 不得证明第一次成功

- **WHEN**一次archive已经进入`outcome-unknown`
- **AND**未恢复pre-archive generation时再次执行得到`archive_change_not_found`
- **THEN**该结果 MUST NOT被视为第一次archive success proof
- **AND** execution MUST继续停在external recovery boundary

#### Scenario: exact OpenSpec mutation generation recovery 后同一 pending Run 才可重试

- **WHEN** pending archive guard为`armed`
- **AND** Executor/recovery flow从exact Git Base + exact cumulative candidate机械恢复pre-archive candidate
- **AND** C1按 stored surfaceVersion重算 `OpenSpecArchiveMutationSurfaceV1` 并 exact-match stored `preArchiveGenerationFingerprint`
- **THEN**若guard存在durable failure terminalObservation，C1 MUST按failure + same直接terminal failed且 MUST NOT respawn
- **AND**只有guard不存在terminalObservation（真正outcome-unknown）时 C1 MAY原子将guard标为`recovery-admitted`
- **AND** B1 semantic identity仍 MUST匹配同一pending archive Run
- **AND**仅recovery-admitted分支的下一次invoke MUST在spawn前再次确认generation并将guard原子转回`armed`
- **AND** MUST NOT创建新archive Run或消耗新NNN

### Requirement: OpenSpec structured execution view 与 semantic identity projection 必须分离

OpenSpec thin integration MUST继续为 Standard Change Action提供完整 raw structured execution view，但 B1 pending semantic identity MUST使用 action-sensitive bounded projection。Flowkit MUST NOT通过删除 raw OpenSpec context来修复 self-mutation drift，也 MUST NOT把 Action-owned output/progress重新解释为 external authority input。

#### Scenario: raw context 仍提供给 Propose
- **WHEN** Propose Action被准备
- **THEN** Author/executor MUST仍可获得 OpenSpec artifact paths/instructions的完整 structured view
- **AND** semantic fingerprint MAY只消费其中 bounded external semantic projection

### Requirement: Propose semantic projection 必须排除 self-owned artifact existence

对 `propose/revise-propose`，OpenSpec semantic projection MUST排除由该 Action合法创建 planning artifacts导致的 current artifact existence、current output set与 `existingOutputLogicalPaths`变化；MUST保留 version/change identity、instruction/template semantic content、schema、resolved output identity、dependencies/unlocks等 execution contract。

#### Scenario: output path 从 absent 变 existing 不漂移
- **WHEN** pending Propose创建其 approved planning artifact output
- **AND** OpenSpec随后报告 corresponding existing output path
- **THEN** semantic identity MUST不因该 self-owned existence变化而漂移

### Requirement: Apply semantic projection 必须排除 self-owned progress/state

对 `apply/revise-apply`，OpenSpec semantic projection MUST排除由合法 task writes产生的 progress counters与 derived state；MUST保留 exact apply `contextFiles` identity与其它 external prerequisites。Planning artifact bytes/contract generation仍 MUST由 Flowkit versioned contractRefs或等价 authoritative refs绑定。

#### Scenario: task completion 更新不漂移
- **WHEN** pending Apply将一个 task从 incomplete更新为 complete
- **AND** OpenSpec progress/state因此变化
- **THEN** same pending semantic identity MUST保持稳定

#### Scenario: contextFiles 改变必须漂移
- **WHEN** pending Apply之后 OpenSpec structured apply contextFiles identity发生变化
- **THEN** fresh semantic fingerprint MUST变化
- **AND** old pending Run MUST fail closed

### Requirement: Windows OpenSpec default shim resolution 必须 ps1-first

当未显式提供 OpenSpec executable且 platform=`win32`时，adapter MUST优先解析 PATH 中 exact `openspec.ps1`。只有 `.ps1` shim不存在时才 MAY fallback到 `openspec.cmd`；两者都不存在 MUST fail closed。

若 `.ps1` shim存在并被选中，但 PowerShell launcher缺失、spawn失败、timeout或script exit failure，adapter MUST fail closed且 MUST NOT静默改走 `.cmd`。Explicit executable MUST保持 caller authority，并按其 `.ps1` / `.cmd|.bat` / other executable type使用对应 process mechanics。Non-Windows default MUST保持 direct `openspec` execution。

#### Scenario: ps1 shim 优先
- **WHEN** Windows PATH同时存在 `openspec.ps1` 与 `openspec.cmd`
- **THEN** default OpenSpec adapter MUST选择 `.ps1`
- **AND** MUST NOT优先执行 `.cmd`

#### Scenario: ps1 不存在时 cmd fallback
- **WHEN** Windows PATH不存在 `openspec.ps1`但存在 `openspec.cmd`
- **THEN** adapter MAY选择 `.cmd`
- **AND** shared launcher MUST使用既有 ComSpec mechanics

#### Scenario: selected ps1 失败不静默降级
- **WHEN** `.ps1` shim存在但 bounded PowerShell execution失败
- **THEN** adapter MUST返回 fail-closed OpenSpec process failure
- **AND** MUST NOT自动 retry `.cmd`

### Requirement: known-success archive continuation 不得依赖已 relocation 的 active Change status

OpenSpec archive child返回并 durable 持久化可接纳 success terminalObservation 后，只要 `inspectOpenSpecArchiveRecovery` 或等价 classification证明 current `OpenSpecArchiveMutationSurfaceV1` 与stored F不同且observation与requested Change一致，C1/B1 MUST把该状态作为 `known-success` operational proof继续同一 archive Run terminal admission。

Post-relocation continuation MUST NOT再次要求 canonical active `OpenSpecCliAdapter.getChangeStatus(changeId)` 成功，也 MUST NOT通过恢复canonical active Change目录、重跑archive、扫描archive tree或historical replay重新证明OpenSpec success。Future archive MUST从ContextFile持久化的 bounded keyed OpenSpec entry projection重建 external context；pre-D2 legacy Run only MAY在disposable temp root中把 archived bytes交给同版本OpenSpec structured status重建 keyed mapping。两条路径都 MUST先完成archive-specific entry semantic check，然后仅从 durable success observation构造Core-owned archive completion并调用existing terminal writer。

#### Scenario: structured success relocation 后同一 Run completed
- **WHEN** fresh pending archive已durable arm F并spawn OpenSpec
- **AND** durable terminalObservation为合法success
- **AND** post V1与F不同且active Change root已relocate
- **AND** future archive entry persisted keyed projection重建出的semantic identity exact-match stored fingerprint
- **THEN**同一 archive Run MUST通过existing Core terminal writer写入completed result
- **AND** MUST NOT再次调用active Change status作为terminal前置
- **AND** MUST NOT spawn第二次OpenSpec archive

#### Scenario: process crash 后 known-success continuation复用 durable observation
- **WHEN**success terminalObservation已durable保存但process在result.json发布前终止
- **AND**新session重算post V1仍为known-success
- **THEN**恢复 MUST使用同一observation + same Run entry semantic identity继续terminal admission
- **AND** missing process memory MUST NOT把它降级为outcome-unknown

#### Scenario: legacy 085 mapping只能由 disposable OpenSpec structured status重建
- **WHEN** pre-D2 pending archive缺少future keyed projection但已有known-success durable observation
- **THEN** Flowkit MAY在disposable temp OpenSpec root中临时呈现observation指向的archived Change bytes并调用同版本OpenSpec structured status
- **AND** keyed artifactPaths authority MUST来自OpenSpec输出
- **AND** temp view MUST NOT写回canonical tree或作为archive success proof
- **AND** MUST NOT通过默认proposal/design/tasks/specs路径规则补全mapping

### Requirement: archive-terminal explicit recovery surface 必须保持极窄

Flowkit MAY提供 `recover archive-terminal` machine surface，专门处理历史 durable known-success pending archive。该surface MUST不接受caller-supplied success payload，不得调用OpenSpec mutating archive，不得成为generic Run completion/cancellation API；它 MUST复用同一archive continuation semantic check与Core terminal writer，并在eligible candidate为0个或多个、observation非success、mutation classification非known-success或semantic drift时fail closed。

#### Scenario: existing D1/085 被正式恢复
- **WHEN**当前repository存在唯一历史D1/085 pending archive
- **AND**其 durable observation=success、post V1!=F、entry semantic identity exact-match
- **THEN** `recover archive-terminal` MUST只通过Core-owned terminal writer新增085 completed result
- **AND** MUST NOT rerun D1 archive、恢复active D1 tree或重写既有action/context

#### Scenario: ambiguous 或非known-success recovery被拒绝
- **WHEN**不存在唯一eligible known-success pending archive
- **OR** candidate为failure/outcome-unknown/recovery-required/semantic-drift
- **THEN** recovery surface MUST fail closed
- **AND** MUST NOT发布任何terminal result或触发mutation

### Requirement: formal operation 必须共享 bounded OpenSpec projection

单次 formal read/preparation operation MUST 使用一个 bounded immutable OpenSpec projection，复用已验证的 version、requested Change status 与 action-specific instructions/validation。相同 operation 内 artifacts、tasks、verification、contract refs 与 action context MUST NOT 为同一 authority 重复启动等价 version/status 调用。

#### Scenario: Proposal preparation 读取多个 artifacts

- **WHEN** 同一 preparation 需要 proposal、specs、design 与 tasks instructions
- **THEN** adapter MUST 复用同一个 validated Change status projection
- **AND** invocation-count contract MUST 能被 focused test 验证

### Requirement: post-action admission 必须刷新 OpenSpec authority

operation-scoped projection MUST 只在一个 formal operation 内复用。post-action admission 或后续独立 diagnostic MUST 新建 projection 并重新读取当前 OpenSpec authority，MUST NOT 跨 mutation boundary 使用 entry cache。

#### Scenario: artifacts 在 entry 后变化

- **WHEN** Action 合法修改 OpenSpec artifacts 后进入 terminal admission
- **THEN** Core MUST 使用新的 post-action OpenSpec projection
- **AND** MUST NOT 以 entry-time status/instructions 代替 current authority

### Requirement: affected capabilities 必须来自 structured delta paths

verification selection MUST 从当前 Change structured `artifactPaths.specs` 对应的 delta specs 提取 capability ids/refs，MUST NOT 通过自由文本、目录猜测或 caller 参数确定 affected capabilities。

#### Scenario: structured capability 与 module relation 不匹配

- **WHEN** structured delta capability missing、unknown、stale 或无法与 relevant modules 唯一关联
- **THEN** verification selection MUST fail closed

### Requirement: OpenSpec executable resolution 必须只有一个实际 invocation authority

Flowkit MUST 将 OpenSpec executable 的实际 invocation identity 作为 C1 thin integration 的单一 execution authority。显式 executable 存在时 MUST 使用该 exact identity；未显式指定时，non-Windows MAY 使用 PATH-resolved `openspec`，Windows MUST 在完整 PATH 上先解析 `openspec.ps1`、仅在不存在时 fallback `openspec.cmd`。Adapter invocation、Change Verification、project verification 与 real OpenSpec integration tests MUST 复用同一个 resolved identity，MUST NOT把 constructor nominal shim name、repo-local `node_modules/.bin` 假设或另一套 test-side discovery 持久化/解释为第二 authority。

Executable resolution 只拥有 identity discovery；`.ps1` / `.cmd` / direct executable 的实际 process-launch semantics MUST继续由既有 shared external-command boundary拥有。项目 MUST NOT仅为满足测试 discovery 假设而要求 OpenSpec 成为 repo-local dependency。

#### Scenario: Windows cmd-only PATH 使用实际 resolved identity

- **WHEN** Windows execution environment 的 PATH 中不存在 `openspec.ps1` 但存在 supported `openspec.cmd`
- **THEN** OpenSpec adapter MUST resolve并调用该 `.cmd` executable
- **AND** downstream Verification / real integration test context MUST消费同一个 resolved identity，而不是 nominal `openspec.ps1`

#### Scenario: repo-local OpenSpec 不存在但 PATH executable 可用

- **WHEN** supported OpenSpec 可由正式 resolver从 PATH取得，而 repository `node_modules/.bin/openspec(.cmd)` 不存在
- **THEN** production 与 required integration regression MUST仍可执行
- **AND** MUST NOT要求新增 OpenSpec project dependency来满足测试

#### Scenario: OpenSpec executable 不可解析时 fail closed

- **WHEN**没有 explicit executable 且正式 environment 中不存在可接纳的 OpenSpec executable
- **THEN** required OpenSpec operation / verification MUST fail closed
- **AND** MUST NOT通过 silent skip、默认成功或 test-local fallback伪造 coverage

### Requirement: Proposal terminal admission 必须执行真实 disposable archive-sync preflight

当 formal current Change 存在 OpenSpec delta 且 Propose / revise-propose 准备 terminal admission 时，Flowkit MUST 在 strict validation 通过后，使用当前 exact proposal bundle + canonical `openspec/specs` 在 disposable repository 中调用真实 OpenSpec archive semantics。该 preflight MUST 复用当前 `OpenSpecCliAdapter` 已解析的 executable identity 与既有 structured archive result parser，只消费 OpenSpec 的 success/failure authority；Flowkit MUST NOT 自己实现 Requirement / Scenario merge engine。preflight 产生的 mutation MUST 只发生在 disposable repository，canonical candidate 不得被提前 archive。

同一 reusable preflight MUST 可被 Change Verification 以 stable logical check `openspec-current-change-archive-sync` 调用，使最终 Apply/revise-apply verification 在 Owner archive authorization 前再次证明 exact current candidate 的 archive-sync compatibility。Explore MAY 使用同一 preflight helper 作为 External Mutation Proof，但该 helper 不成为新的 Formal Action 或 Policy authority。

#### Scenario: strict PASS 但 archive merge 不完整时 Proposal fail closed

- **WHEN** `openspec validate <current-change> --strict` PASS，但 real disposable archive 返回 `archive_spec_update_failed` 或其他 structured archive failure
- **THEN** Propose / revise-propose terminal admission MUST fail closed
- **AND** Reviewer MUST NOT 收到一个被 Flowkit terminalized 为 completed 的 archive-incompatible Proposal generation

#### Scenario: disposable preflight 使用 exact current candidate 且不污染 canonical repository

- **WHEN** archive-sync preflight 执行
- **THEN** disposable repository MUST 来自当前 exact `openspec/` candidate bytes，并包含当前 canonical specs 与 current Change delta
- **AND** MUST 使用当前 adapter/resolver 的 resolved OpenSpec executable identity
- **AND** success/failure 后 MUST 清理 disposable mutation surface
- **AND** canonical current Change、canonical specs 与 Run history MUST NOT 因 preflight 被 relocation 或改写

#### Scenario: Change Verification 在 archive authorization 前重证 archive-sync

- **WHEN** current matched Change Verification 执行 `openspec-current-change-archive-sync`
- **THEN** MUST 调用与 Proposal admission 相同的 reusable real OpenSpec archive-sync preflight
- **AND** structured archive failure、timeout、outcome-unknown 或 executable failure MUST 使 formal Change Verification fail closed
- **AND** PASS MUST 表示真实 disposable archive structured success，而不是 synthetic merge simulation

### Requirement: OpenSpec canonical invocation 必须迁移到 managed `FLOWKIT_HOME` identity 且保留 bounded compatibility

When a valid managed OpenSpec `1.7.0` tool home is present, OpenSpec canonical invocation MUST resolve through the C1 managed external-tool runtime and execute `process.execPath + exact openspec.js entrypoint`. Ambient PATH/shim discovery MUST NOT outrank a valid managed tool identity.

Compatibility MUST remain bounded:

```text
1. explicit/injected executable/invocation for controlled tests or existing adapter seams
2. valid managed FLOWKIT_HOME OpenSpec 1.7.0 (canonical managed route)
3. legacy FLOWKIT_OPENSPEC_BIN when managed identity is unavailable
4. historical ambient POSIX/Windows shim resolution only as compatibility fallback
```

Windows historical `.ps1`-first then `.cmd` fallback behavior MUST remain regression-covered for the legacy route; C1 MUST NOT delete those compatibility semantics merely because canonical managed execution no longer requires them.

A `runner` callback is an execution transport/observation seam only and MUST NOT itself create explicit/injected executable authority. Tests or controlled callers that intentionally inject executable identity MUST use the explicit `executable` or `invocation` seam. Therefore an observational runner with no explicit executable/invocation MUST continue to consume the same resolver precedence as production, including canonical managed `FLOWKIT_HOME` identity.

#### Scenario: observational runner preserves managed authority
- **WHEN** a valid managed OpenSpec 1.7.0 identity exists
- **AND** a caller supplies a runner callback only to observe/forward process execution
- **AND** no explicit executable/invocation is supplied
- **THEN** resolution MUST remain `managed`
- **AND** the runner MUST receive `process.execPath + exact openspec.js entrypoint + operation args`

#### Scenario: fake runner executable authority is explicit
- **WHEN** a controlled test intends to replace OpenSpec executable identity while using a fake runner
- **THEN** the test MUST supply explicit `executable` or `invocation` authority
- **AND** runner presence alone MUST NOT change the resolver source or precedence

#### Scenario: managed OpenSpec outranks ambient shim discovery
- **WHEN** a valid managed OpenSpec 1.7.0 identity exists
- **AND** ambient PATH contains another OpenSpec command/shim
- **THEN** canonical resolution MUST use the managed exact Node entrypoint
- **AND** MUST NOT execute ambient PATH as the canonical identity

#### Scenario: legacy FLOWKIT_OPENSPEC_BIN remains a bounded fallback
- **WHEN** no valid managed OpenSpec tool home is available
- **AND** a non-empty `FLOWKIT_OPENSPEC_BIN` compatibility value is supplied
- **THEN** existing compatibility invocation MUST remain available
- **AND** MUST be identified as compatibility rather than managed identity

#### Scenario: Windows shim behavior remains historically compatible
- **WHEN** managed identity and `FLOWKIT_OPENSPEC_BIN` are unavailable on Windows
- **THEN** the legacy resolver MUST continue complete `.ps1` search before `.cmd` fallback
- **AND** existing Windows launcher safety semantics MUST remain unchanged

### Requirement: same OpenSpec managed identity 必须传播到 nested Verification / archive / retry / Full Test technical children

C1 MUST represent managed OpenSpec resolution as a command + args-prefix invocation rather than forcing `process.execPath + entrypoint` into a single executable string. Nested Flowkit processes/checks MUST reconstruct or receive the same managed identity through `FLOWKIT_HOME`; compatibility execution MAY continue carrying exact `FLOWKIT_OPENSPEC_BIN` where required.

`Change Verification`, disposable archive-sync, public `verify --retry`, real-process integration tests and Delivery Full Test technical verification children MUST NOT silently fall back to a different ambient OpenSpec identity when the parent used managed OpenSpec. For `kind=bounded-command-plan`, this obligation applies to every physical target whose execution/test descendants may resolve OpenSpec; a single parent/wrapper propagation proof is insufficient.

#### Scenario: managed identity survives Verification child execution
- **WHEN** parent Flowkit resolves OpenSpec from a valid `FLOWKIT_HOME`
- **AND** formal Change Verification launches tests/operations requiring OpenSpec
- **THEN** every applicable Full Test physical child MUST resolve the same managed tool home/version/entrypoint
- **AND** must not replace it with ambient PATH

#### Scenario: managed identity survives Delivery Full Test technical environment
- **WHEN** Delivery Full Test technical execution is executed after Owner authorization
- **AND** parent Flowkit uses managed OpenSpec
- **THEN** the child environment MUST preserve `FLOWKIT_HOME` so `verify:full` resolves the same exact managed identity
- **AND** this propagation MUST NOT create a new Delivery Full Test authority or Run

#### Scenario: public verify retry has a canonical managed route
- **WHEN** `FLOWKIT_HOME` contains a valid managed OpenSpec 1.7.0 identity
- **AND** `FLOWKIT_OPENSPEC_BIN` is absent
- **AND** ambient PATH cannot provide OpenSpec
- **THEN** public `verify --retry` regression coverage MUST execute successfully through the managed identity
- **AND** a separate legacy `FLOWKIT_OPENSPEC_BIN` retry case MAY remain only as compatibility coverage

#### Scenario: managed Full Test technical children do not require legacy executable env
- **WHEN** public `test:full` runs with a valid managed OpenSpec tool home
- **AND** no legacy `FLOWKIT_OPENSPEC_BIN` is supplied
- **THEN** its OpenSpec-dependent child regressions MUST receive `FLOWKIT_HOME` and execute the managed identity
- **AND** the test suite MUST NOT fail merely because a historical regression unconditionally requires the legacy variable

#### Scenario: Reset generation re-closes physical OpenSpec regressions
- **WHEN** the managed-vs-injected execution identity correction is applied
- **THEN** formal Change Verification MUST physically execute and pass the affected OpenSpec real-process/runtime checks
- **AND** archive, public `verify --retry`, G1 and Full Test environment regressions MUST remain green under their intended managed/compatibility identities
- **AND** a failed superseded Verification publication MUST NOT be rewritten as if it had passed

#### Scenario: bounded Full Test target environment does not persist machine path authority
- **WHEN** bounded Full Test resolves physical targets on two machines/checkouts with different absolute `FLOWKIT_HOME` paths
- **THEN** each execution MUST reconstruct the managed identity from the current environment/resolver
- **AND** the Delivery Manifest MUST NOT need the machine-specific absolute tool path or PATH bytes to preserve execution identity
