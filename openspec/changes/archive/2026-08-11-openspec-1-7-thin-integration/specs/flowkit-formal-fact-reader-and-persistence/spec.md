## MODIFIED Requirements

### Requirement: Core 拥有 ResultRef field-kind-path resolver

Core MUST使用唯一 resolver将 typed target descriptor映射为受控 logical path与kind。Caller MUST NOT提供任意 artifact path、ResultRef kind或versionFingerprint。对于 OpenSpec `spec-driven` planning artifacts，resolver MUST消费 C1 validated structured `changeRoot/artifactPaths/contextFiles`而不是重新拥有全局 `openspec/changes/<changeId>` physical layout rule；对于 Flowkit-owned Explore与Verification-owned Verification，resolver MAY在同一 validated `changeRoot`下派生固定owned filename。createRun、terminal preflight与Reader MUST复用同一 logical resolver语义。

#### Scenario: produced artifact 使用固定 Action+tag mapping

- **WHEN** Action为`explore`或`revise-explore`且tag=`explore`
- **THEN** Core MUST从C1 validated changeRoot派生`explore.md`
- **AND** MUST NOT要求OpenSpec artifact graph存在`explore` id
- **AND** Action为`propose`或`revise-propose`时只允许`proposal`、`design`、`specs`、`tasks`
- **AND**这些planning artifact path与`specs`完整namespace MUST来自当前C1 normalized OpenSpec structured view
- **AND** caller MUST NOT提供任意physical path缩小、替换或重写expected set
- **AND**其他Action MUST不允许 produced artifact tag

#### Scenario: 不允许的 tag 或 path authority 被拒绝

- **WHEN** caller提供不属于当前Action permitted set的tag
- **OR** caller尝试提供任意path、kind或versionFingerprint
- **THEN** MUST reject
- **AND** Run MUST不因此产生terminal result

#### Scenario: resolver 在 create preflight Reader 语义一致

- **WHEN**同一个descriptor在createRun、terminal preflight或Reader中解析
- **THEN** MUST得到同一canonical logical kind/path
- **AND**任一层发现C1 path/root identity非法 MUST fail closed

#### Scenario: Proposal bundle 使用 OpenSpec structured paths

- **WHEN** Action为`propose`或`revise-propose`
- **THEN** singleton proposal/design/tasks与完整specs namespace MUST来自当前C1 normalized OpenSpec planning view
- **AND** `specs`枚举 MUST与OpenSpec current structured state/context一致

### Requirement: Reader 投影 current Explore 与 Verification artifact

FormalFactSnapshot 的 OpenSpec-adjacent formal artifact projection MUST支持`change-explore`与`change-verification`两种artifact kind，并只表达 current validated changeRoot下对应 owned file的存在性与repository-relative logical path。Reader MUST NOT把这两个文件伪装成 default `spec-driven` artifact graph node，也 MUST NOT为此建立artifact history registry或从historical ResultRef重建current path。

#### Scenario: Explore artifact 存在

- **WHEN** active Change的C1 validated changeRoot存在`explore.md`
- **THEN** `openSpecArtifacts` MUST包含kind=`change-explore`、对应repository-relative path且exists=true的fact
- **AND** OpenSpec graph status MAY仍只包含proposal/specs/design/tasks

#### Scenario: Verification artifact 存在

- **WHEN** active Change的C1 validated changeRoot存在`verification.md`
- **THEN** `openSpecArtifacts` MUST包含kind=`change-verification`、对应repository-relative path且exists=true的fact
- **AND**该fact的业务truth MUST继续来自Verification authority

#### Scenario: artifact 不存在只表达 current absence

- **WHEN** current validated changeRoot不存在目标Explore或Verification artifact
- **THEN**对应fact MUST表达exists=false
- **AND** Reader MUST NOT扫描historical Run producedResultRefs寻找替代current artifact

#### Scenario: current C1 self-archive relocation窗口不得误切 structured Reader

- **WHEN** current C1 archive已经把C1 delta merge到canonical specs并relocate active changeRoot
- **AND** Flowkit Manifest中的C1仍为`active`，archive terminal result尚待admission
- **THEN** Reader MUST NOT仅因canonical C1 capability spec存在就调用OpenSpec status查询已relocated的active C1
- **AND** current C1 archive recovery/admission MUST继续从durable archive guard/terminalObservation与Flowkit formal lifecycle facts收口
- **AND** C1 completed后 future Change MAY进入normal structured Reader path

## ADDED Requirements

### Requirement: pending archive 必须持久化 crash-safe mutation recovery guard

Current `ContextFile` MAY仅对 `action=archive` 增加 machine-owned `archiveMutationGuard` operational field。该 field MUST与 immutable Run entry identity分离：`runId/deliveryId/changeId/action/role/Owner/Review/Verification refs/semanticInputFingerprint` 等既有字段 MUST NOT因 archive attempt/recovery 被改写；guard MUST NOT进入 B1 semantic fingerprint。Persistence MUST提供 atomic compare-and-set，且只有 C1 archive invocation/recovery seam MAY修改 guard。

Guard shape MUST至少表达：

```text
state: armed | recovery-admitted
surfaceVersion: openspec-archive-mutation-v1
changeRoot: validated repo-relative active Change root
canonicalSpecsRoot: openspec/specs
archiveNamespaceRoot: validated repo-relative changes/archive root
preArchiveGenerationFingerprint: SHA-256
terminalObservation?: normalized typed success | failure observation + canonical fingerprint
```

`armed` MUST在 child spawn 前 durable publish。Child spawn后若得到可接纳structured terminal success/failure，C1 MUST在任何terminal/recovery classification前 atomic persist bounded `terminalObservation`；该 observation 与guard一样属于machine-owned operational field，不进入B1 semantic fingerprint或V1。只要 `armed` 存在且当前 Run仍pending，Reader/preparation/diagnostics MUST从 durable observation（若有）+ current V1投影分类，而不是依赖当前 process memory。

#### Scenario: pre-spawn arm 在 process crash 后仍阻止第二次 archive

- **WHEN** pending archive 在 spawn 前已 atomic persist `archiveMutationGuard.state=armed`
- **AND** process/session随后终止，无法证明 child是否已经执行mutation
- **THEN** checkout/resume MUST恢复同一 guard 与同一 pending Run
- **AND** prepare/inspect MUST NOT把该 Run投影为普通 resumable
- **AND** archive invocation MUST NOT spawn第二次OpenSpec archive

#### Scenario: structured failure after mutation 必须 durable 保存 terminal observation

- **WHEN** archive child已经spawn并返回可接纳structured terminal failure
- **THEN** C1 MUST在post-V1 classification/terminal收口前atomic persist normalized failure terminalObservation
- **AND**若current V1与stored F不同，result.json MUST仍不存在且同一pending archive guard MUST保持durable
- **AND**新process/session MUST从 persisted failure observation + current V1 drift投影 recovery-required
- **AND** exact recovery到F后 MUST从同一failure observation terminal failed且 MUST NOT respawn

#### Scenario: guard mutation 不改写 Run semantic identity

- **WHEN** C1将 fresh archive guard原子写为`armed`、持久化terminalObservation，或将真正outcome-unknown exact recovery后的`armed`写为`recovery-admitted`
- **THEN** ContextFile 的 entry identity fields与stored `semanticInputFingerprint` MUST保持不变
- **AND** guard MUST NOT成为Action Package semantic authority
- **AND** input-drift path MUST NOT借机改写guard或entry fields

#### Scenario: exact OpenSpec generation proof 才能 recovery-admit

- **WHEN** pending archive guard为`armed`
- **AND** recovery flow按 stored `surfaceVersion`重新计算 `OpenSpecArchiveMutationSurfaceV1`
- **THEN** current fingerprint MUST先 exact-match stored `preArchiveGenerationFingerprint`
- **AND**若存在durable failure terminalObservation，MUST从该observation重新分类为failure + same并terminal failed，MUST NOT transition为`recovery-admitted`
- **AND**只有不存在terminalObservation的真正outcome-unknown MAY atomic transition为`recovery-admitted`
- **AND** V1 MUST覆盖 active `changeRoot` 全目录/regular-file exact bytes、canonical `openspec/specs/**` 全树，以及 `changes/archive` immediate child name/type collision namespace
- **AND** `.flowkit/.git/node_modules/dist` 与其它无关 repo 环境 MUST NOT进入该 proof
- **AND** symlink或unsupported entry在任何被纳入surface的位置 MUST fail closed
- **AND** B1 semantic fingerprint匹配本身 MUST NOT替代该 byte-generation proof


#### Scenario: guard 自身持久化不得改变 recovery proof

- **WHEN** C1 对 fresh pending archive 计算 `OpenSpecArchiveMutationSurfaceV1` 得到 F
- **AND** 仅把 `archiveMutationGuard(state=armed, F)` 原子写入 `.flowkit/runs/**/context.json`
- **THEN** 再次计算 V1 MUST仍得到 F
- **AND** 若 guard 写入导致 fingerprint变化，C1 MUST fail closed before spawn

#### Scenario: retry spawn 前必须重新 arm

- **WHEN**同一 pending archive 已处于`recovery-admitted`
- **AND** guard不存在terminalObservation
- **AND** C1准备重新调用OpenSpec archive
- **THEN** invocation MUST再次确认 current mutation-surface fingerprint仍匹配
- **AND** MUST在 spawn 前 atomic transition回`armed`
- **AND** crash发生在该arm之后 MUST再次要求exact recovery
