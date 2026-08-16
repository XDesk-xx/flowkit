# Design: C1 — OpenSpec 1.7 Thin Integration

## Context

见 `proposal.md`。OpenSpec 1.7.0 的真实 probe 已证明 `status/instructions/validate/archive` 存在可用 machine JSON surface；同时默认 `spec-driven` graph 只有四个 planning artifacts。当前 Flowkit 已有 B1 logical Action Package/Result admission，因此 C1 只需要成为 external authority bridge，不能重新拥有 lifecycle。061 Proposal 的除 compatibility 外 decisions继续冻结；063 review-apply 的技术 evidence作为本 generation acceptance 输入。Owner 已终止旧 062 Apply generation并将 compatibility authority reset 为 stable 1.7.0 minimum baseline + no fixed upper bound + machine-contract conformance。

## Goals / Non-Goals

### Goals

- 提供一个 production、typed、fail-closed 的 OpenSpec external CLI adapter，以 stable 1.7.0 为 minimum supported baseline。
- 让 OpenSpec 决定 planning root/change root/planning artifact graph/path/archive operation。
- 保留 Flowkit 对 Explore 与 Verification formal facts 的独立 authority。
- 让 ResultRef 继续使用 repository-relative logical identity + content fingerprint。
- 让 current C1 不发生 schema migration，同时让 future Changes 使用同一稳定 contract。

### Non-Goals

- 不 import/vendor `@fission-ai/openspec` internals。
- 不支持 OpenSpec Store Registry / arbitrary planning home。
- 不建立 custom schema/template fork。
- 不让 OpenSpec 决定 Flowkit next、Reviewer Verdict、Owner authority 或 Verification truth。
- 不重写 B1 Run preparation/result admission。
- 不实现 C1 之外的 D1/E1/F1/G1 scope。

## Decisions

### D1 — 选择 default `spec-driven`，明确拆分三类 artifact authority

长期 contract 固定为：

```text
OpenSpec graph authority
→ proposal.md
→ specs/**
→ design.md
→ tasks.md

Flowkit Author formal fact
→ explore.md
→ NOT an OpenSpec graph node

Verification authority
→ verification.md
→ post-Apply
→ NOT an OpenSpec graph node
```

三个类别都位于 **OpenSpec resolved `changeRoot`** 中，所以 OpenSpec archive 对 Change directory 的 relocation 会自然携带 Explore/Verification，但这不把它们升级成 OpenSpec artifact graph nodes。

**不采用 project-local custom schema。**理由：

1. `schema` management CLI 在 1.7.0 明确为 experimental；
2. arbitrary custom schema 要求 Flowkit维护 schema/template副本，扩大升级面；
3. 把 `verification` 作为 artifact node 会在 Apply 前 ready，与 Flowkit post-Apply Verification lifecycle冲突；
4. default `spec-driven` 已完整覆盖 OpenSpec真正拥有的 planning contract。

因此：

```text
current C1 metadata = spec-driven
future Change metadata = spec-driven
```

不做 OpenSpec metadata/schema migration，不因本次 Owner generation reset 静默改写 `.openspec.yaml`。

### D2 — 新增单一 `OpenSpecCliAdapter`，只暴露 C1 所需 typed views

建议 production surface：

```text
src/integrations/openspec/
├─ openspec-cli-adapter.ts
├─ openspec-types.ts
└─ openspec-paths.ts
```

adapter 最小方法：

```text
getVersion()
getContext()
doctor()
getChangeStatus(changeId)
getArtifactInstructions(changeId, artifactId)
getApplyInstructions(changeId)
validateChange(changeId, strict=true)
archiveChange(changeId)
```

不暴露 generic `run(anyArgs)` 给 lifecycle caller。

每个方法固定命令、固定 machine flags、固定 typed parser。Caller 不拼接任意 OpenSpec subcommand。

### D3 — Compatibility authority = stable 1.7.0 minimum baseline + structured machine-contract conformance

版本由 `openspec --version` 读取，但 version number 只作为 compatibility signal：

```text
minimum supported stable baseline = 1.7.0
fixed minor/major upper bound = none
```

Admission 分两层：

```text
Version signal
→ malformed / below stable 1.7.0 => unsupported
→ prerelease => C1 default fail closed；不得仅因 numeric precedence 达到 baseline 自动支持
→ stable >= 1.7.0 => eligible for machine-contract admission

Machine-contract conformance
→ required command exists/returns supported machine result
→ required JSON shape/identity/path semantics accepted
→ exit/result/status coherence accepted
→ validation semantics accepted
→ archive terminal + mutation semantics accepted
→ 任一不兼容 => fail closed
```

因此 `1.8.0`、`2.x` 或更高 stable version **不得仅因版本号被拒绝，也不得仅因版本号被接纳**。只要 Flowkit 实际依赖的 structured machine contract继续 conformance，就可工作；一旦任何 required surface drift，当前调用必须 fail closed。C1 不建立 speculative version allowlist，不把 version number升级为唯一 compatibility authority。

当前 C1 没有 prerelease conformance fixture/explicit support contract，所以 prerelease默认 unsupported；后续若确有需求，必须以新的明确 conformance evidence/contract增加，不得从数字比较隐式放行。

不使用 OpenSpec package import，也不把 package-lock 固定成 runtime dependency。

### D4 — production external-command seam 负责 process mechanics

`src/shared/external-command.ts` 继续是低层 process helper，但补齐当前声明而未实现的 contract：

```text
timeout
spawn error
exit code
stdout/stderr
platform command resolution
```

Windows：

```text
openspec.cmd / *.cmd / *.bat
→ ComSpec || cmd.exe
→ /d /s /c
```

OpenSpec invocation 环境固定 bounded machine mode：

```text
cwd = repoRoot
NO_COLOR=1
FORCE_COLOR=0
JSON flags由具体 adapter method 固定
```

timeout 默认值由 C1 constant 冻结为 **30s**；caller MAY 在 tests 注入更短 timeout，但 production lifecycle 不动态猜测 timeout。

低层 process helper 只报告 transport/process facts，不替 mutating operation判断业务终态。对于 read-only OpenSpec command，timeout/malformed output可直接形成普通 fail-closed diagnosis；对于已经成功 spawn 的 `archive`，若没有得到可接纳的 OpenSpec structured terminal result，则 C1 MUST分类为 `OPENSPEC_ARCHIVE_OUTCOME_UNKNOWN`，而不是普通 retryable failure。

Process result 必须区分：

```text
spawnError
timedOut
exitCode
stdout
stderr
```

### D5 — repo-local planning home 是 C1 唯一支持模式

C1 只接纳：

```text
root.path == canonical repoRoot
planningHome.kind == repo
planningHome.root == repoRoot
actionContext.mode == repo-local
actionContext.sourceOfTruth == repo
changeRoot 位于 planningHome.changesDir 内
```

OpenSpec 1.7 其它 store/home capability本 Change fail closed：

```text
OPENSPEC_UNSUPPORTED_PLANNING_HOME
```

后续真实需求可独立 Change 扩展，不建立 Store Registry。

### D6 — physical path admission必须绑定 requested Change、真实 filesystem identity与singleton artifact identity

所有 OpenSpec absolute path：

```text
absolute physical path
→ resolve/normalize
→ existing ancestor / target realpath-or-equivalent physical identity proof
→ repoRoot physical containment
→ planningHome/changeRoot relationship validation
→ requested Change exact identity binding
→ artifact singleton/namespace ambiguity checks
→ repo-relative POSIX logical ref
```

拒绝：

```text
..
lexical-only containment
symlink escape / alias outside admitted root
wrong root
wrong requested Change identity
Apply changeDir != current validated requested Change root
relative/absolute shape ambiguity
duplicate resolved/existing identity
proposal/design/tasks singleton != exactly one
cross-artifact alias/conflict
unsupported artifact id
```

`getApplyInstructions(changeId)` 不能只相信返回的 `changeName`；其 `changeDir` 必须 exact-bind 到同一次 structured status/context 已验证的 requested Change root。任何 symlink-safe proof无法成立时 fail closed，而不是回退到字符串前缀判断。

planning artifacts：

```text
proposal/specs/design/tasks
→ 必须来自 OpenSpec artifactPaths / contextFiles
→ singleton artifact必须 unique physical/logical identity
```

Flowkit-owned files：

```text
explore.md
verification.md
→ join(validated changeRoot, owned filename)
→ 再做同样 physical containment/identity proof
```

因此 Core 不再拥有全局 `openspec/changes/<changeId>` physical layout rule，只保留自己的 logical tag/kind semantics。

### D7 — Action-specific structured facts必须进入 production execution view，但不改变 B1 ActionDefinition

```text
explore / revise-explore
→ status
→ validated changeRoot
→ Flowkit-owned explore.md

propose / revise-propose
→ status.artifactPaths
→ artifact instructions for proposal/specs/design/tasks
→ normalized OpenSpecActionContext exposed by production preparation
→ terminal 前 strict validate

apply / revise-apply
→ instructions apply
→ exact contextFiles + progress/state
→ normalized OpenSpecActionContext exposed by production preparation
→ strict validate planning contract before execution

review-*
→ reviewed target 继续来自 B1 ResultRef / Review lineage
→ OpenSpec不决定 verdict

archive
→ B1/Policy/Owner/Verification preconditions 已合法
→ OpenSpec archive structured operation
→ operation result交回 Action execution
```

062 的 dead-API 形态不再允许：`getArtifactInstructions()` / `getApplyInstructions()` 不能只在 adapter/tests 被调用后把关键 instructions/progress/state 丢弃。C1 MUST有 production caller（优先为 B1 preparation seam）构造 bounded normalized `OpenSpecActionContext`，让当前 Author execution surface真实取得这些 facts。

该 view：

- 是 external authority 的 point-in-time execution projection，不拥有 lifecycle；
- MUST进入当前 Run 的 semantic input drift protection（直接进入 semantic descriptor或等价 fingerprint proof），避免同一 pending Run在 instructions/progress/state 漂移后静默 resume；
- MUST NOT改变 B1 fixed `ActionDefinition`、Policy next、Reviewer/Owner authority；
- MUST NOT要求建立 generic plugin/context registry；
- 在 02 C1 可作为 `PreparedActionExecution` 的薄 structured field存在，03 stable Agent Adapter再决定 transport encoding。

C1 不新增 Formal Action，也不修改 B1 static catalog。

### D8 — validation 是 external contract check，且 process/result/status 必须 coherence admission

Adapter 解析：

```text
exitCode
requested item identity
items[].valid
issues[]
status[]
summary
```

规则：

- Propose/Revise-Propose terminal 前：strict validation MUST pass。
- Apply/Revise-Apply preparation：当前 planning contract strict validation MUST pass。
- invalid JSON / parser shape error：fail closed。
- requested Change validation item必须唯一且identity匹配。
- `valid=true` 只有在 process exit与top-level status都与成功一致时才可接纳。
- `valid=true + nonzero exit`、`valid=true + error severity status`、requested item/status互相矛盾等组合属于 `OPENSPEC_VALIDATION_COHERENCE_FAILED` 或等价稳定 machine failure，MUST fail closed。
- `valid=false` 的合法 structured validation failure可保留其 issues/status并作为 validation failure消费；不能因 exit非零就丢掉结构化 invalid evidence。
- non-zero + no admissible coherent structured explanation：external command failure。
- validation result只形成 failure diagnosis/structured view，不改变 Policy next。

B1 preparation/terminal admission只允许在上述 coherence admission后的 `valid=true` 上继续，不能单看 item.valid boolean。

### D9 — Archive terminal result按真实 OpenSpec 1.7.0 shape解析

调用：

```text
openspec archive <changeId> --json --yes
```

**已知成功**至少要求：

```text
exitCode == 0
archive.change == requested changeId
archive.archivedAs non-empty
archive.path admissible
archive.specsUpdated boolean
no error severity status
```

`archive.totals` **不是普遍必需字段**。OpenSpec 1.7.0 在有 spec delta 的 archive success 中可以返回 totals，而 `skip_specs: true` / zero-delta 的合法 archive success 可以省略 totals。规则固定为：

```text
totals absent
→ allowed

totals present
→ MUST validate supported structured numeric shape
```

只有本次 invocation 的可接纳 structured terminal result 才能把 archive认定为成功。成功后 C1 **不**：

```text
scan archive path to prove success
re-run spec sync
rebuild OpenSpec state
```

### D10 — Mutating archive 必须使用 durable pre-spawn recovery gate

Archive 与 status/validate 不同：它是有副作用操作。C1 采用 **pre-spawn arm**：任何真正可能启动 OpenSpec archive mutation 的调用，在 `spawn()` 之前先持久化最小 machine fact；如果进程随后崩溃，新 session 仍能确定“曾经可能启动过 mutation”，而不是退回普通 pending。

持久位置固定为当前 pending archive Run 的既有 `context.json`，新增唯一 machine-owned mutable 子字段：

```text
archiveMutationGuard:
  state: armed | recovery-admitted
  surfaceVersion: openspec-archive-mutation-v1
  changeRoot: <validated repo-relative active Change root>
  canonicalSpecsRoot: openspec/specs
  archiveNamespaceRoot: <validated repo-relative changes/archive root>
  preArchiveGenerationFingerprint: <sha256>
```

这不是第二套 archive authority：

- Run entry identity、Owner/Review/Verification refs、`semanticInputFingerprint` 继续 immutable；
- guard 不进入 B1 semantic fingerprint，也不修改 Action Package semantic identity；
- 只有 C1 archive invocation/recovery persistence helper 可以 atomic compare-and-set该子字段；
- OpenSpec structured terminal result仍是 archive success/failure authority。

#### OpenSpecArchiveMutationSurfaceV1

056 的“整个 `planningHome`”方案被拒绝：repo-local `planningHome.root == repoRoot`，会把 guard 自身、`.git`、dependencies 等无关环境带入 fingerprint，并造成 pre-spawn arm 自引用。058 将 recovery proof 收缩为一个**显式、版本化、OpenSpec archive-owned mutation/collision surface**：

```text
Section A — active Change source
validated changeRoot
→ recursively enumerate every directory + regular file
→ include root identity
→ normalize repo-relative POSIX path
→ stable sort
→ hash entry type + path
→ regular file additionally hash exact bytes
→ symlink / unsupported entry fail closed

Section B — canonical specs
validated repo-local OpenSpec canonical specs root = openspec/specs
→ recursively enumerate every directory + regular file
→ same path/type/bytes algorithm
→ absent root represented explicitly
→ symlink / unsupported entry fail closed

Section C — archive collision namespace
validated archive namespace root = planningHome.changesDir/archive
→ hash namespace root existence/type
→ hash immediate child name + entry type only
→ stable sort
→ do NOT recurse into historical archived Change contents
→ symlink / unsupported immediate child fail closed
```

最终：

```text
SHA-256(
  "flowkit-openspec-archive-mutation-v1"
  + Section A canonical stream
  + Section B canonical stream
  + Section C canonical stream
)
```

为什么这三段足够：

- Section A 覆盖 OpenSpec archive 会 relocate/remove 的 active Change source，包括 `.openspec.yaml`、planning artifacts、Flowkit colocated `explore.md/verification.md` 以及任何实际存在的目录/regular file；不排除 Change root 内 `.tmp`，因为若它实际存在，relocation 也会改变其 filesystem generation；
- Section B 覆盖 OpenSpec delta sync 可能修改的 canonical spec bytes与目录 identity；
- Section C 覆盖 archive destination/collision 判定所依赖的 namespace identity。目标 archive 出现、消失或同名 collision 都会改变该 section；历史 archive 内部正文变化不会污染本次 collision proof；
- `.flowkit/**`（含 guard）、`.git/**`、`node_modules/**`、`dist/**`、其它 repo files/dependencies/environment state 都不属于上述三段，因此绝不进入 fingerprint。

`canonicalSpecsRoot = openspec/specs` 是 **OpenSpec 1.7 repo-local archive conformance seam only**，只用于 mutation recovery proof，不升级为 Flowkit planning artifact path authority；planning artifact 的正常解析仍必须消费 structured `changeRoot/artifactPaths/contextFiles`。

状态机：

```text
fresh pending archive
(no guard)
→ compute OpenSpecArchiveMutationSurfaceV1 fingerprint F
→ atomic persist guard(state=armed, surfaceVersion=v1, refs, F)
→ recompute current V1 fingerprint
→ MUST still equal F
→ only then MAY spawn archive
```

因此 guard 写入自身必须是 machine-test invariant：

```text
fingerprint before arm == fingerprint after arm
```

若不相等，C1 MUST fail closed before spawn。

一旦 `armed` durable，**child 是否已经 spawn** 是第一道分界。已证明发生在 child 启动前的 spawn failure 仍是 `known-no-mutation`；一旦 child 已 spawn，terminal classification MUST同时消费两个维度，而不能只看 structured result：

```text
R = admissible structured terminal result:
    success | failure | absent-or-invalid

P = post-invocation OpenSpecArchiveMutationSurfaceV1
F = stored preArchiveGenerationFingerprint
```

若 child 返回可接纳 structured terminal success/failure，C1 MUST在任何后续分类前先把最小 normalized typed terminal observation atomic persist 到同一 guard：

```text
terminalObservation:
  kind: success | failure
  resultFingerprint: SHA-256(canonical normalized typed observation)
  normalized:
    success → change / archivedAs / path / specsUpdated / optional totals
    failure → exitCode + structured status severity/code set
```

不持久化 raw stdout/stderr、human log或OpenSpec内部状态。该 observation 属 external terminal authority 的最小 point-in-time recovery projection，位于 `.flowkit/**`，因此 MUST NOT进入 V1。Observation durable publish 后如果 process crash，新 session MUST从 persisted observation + current V1继续同一分类，不能降级成“没有result”。

在任何 Change completed、普通 Run terminal failure/success、recovery-admit 或第二次 mutation 之前，C1 MUST重算 `P`，并按完整矩阵处理：

```text
                         P == F                              P != F

structured success       terminal-state-mismatch             known success
(durable observation)       → terminal failed                  → OpenSpec success authority可接纳
                         → Change NOT completed              → MAY继续Change completed
                         → no auto retry                    → crash可从durable observation继续，不重spawn

structured failure       known-no-persistent-mutation        known-but-mutated
(durable observation)       → ordinary terminal failure         → recovery-required
                         → same candidate remains safe       → same pending Run
                                                             → guard + failure observation durable
                                                             → exact restore F 后 terminal failure
                                                             → MUST NOT respawn

absent / malformed       outcome-unknown                     outcome-unknown
terminal result           → recovery-required                → recovery-required
                         → no auto retry                     → no auto retry
```

这里 `P == F` / `P != F` **不是第二套 OpenSpec success proof**。它只回答“OpenSpec invocation 是否留下了 persistent mutation”。Structured success仍由 OpenSpec terminal result定义；但在 C1 支持的 OpenSpec 1.7 archive semantics 中，success 必然至少改变 active Change relocation / archive namespace，因此 `structured success + P == F` 是 tool-contract inconsistency，不能让 Change completed。

同理，structured failure只证明 operation terminal status=failure，**不证明 no mutation**。059 Reviewer 已用 OpenSpec 1.7.0 实测：

```text
pre-create archive target
→ OpenSpec archive先写 canonical specs
→ 后检查 target collision
→ returns structured archive_target_exists / exit 1
→ active Change仍存在
→ 4个既有canonical capability spec发生byte mutation
→ 1个canonical spec新增
```

因此只有 `structured failure + P == F` 才可普通 failure 收口；`structured failure + P != F` MUST保持 pending + durable recovery gate。若当前 process 在 recovery 前退出，新 session 仅凭 persisted `armed` guard + current V1 drift 也必须恢复为 recovery-required；structured failure prose/内存不是必要恢复事实。

对于 `known-but-mutated structured failure`，exact recovery 回到 F 后 MUST保留同一 durable failure observation并重新执行矩阵分类；此时变成 `failure + P == F`，因此同一 Run MUST普通 terminal failure收口，**不得再次 spawn OpenSpec archive**。这避免 `archive_target_exists` 等根因仍属于 F 时“恢复后原样再失败一次”。

无可接纳 terminal result时没有 `terminalObservation`。即使当前 `P == F`，也仍不能把“看起来没变”提升为 operation failure/success authority；仍进入 outcome-unknown recovery boundary。只有这个“无 durable terminal observation”的分支在 exact recovery 后 MAY进入 `recovery-admitted` 并由同一 pending Run重新 arm/spawn。

任何新 process/session 读到 `armed` 都 MUST：

```text
prepare/inspect → recovery-required, not ordinary resumable
invoke → MUST NOT spawn
same pending archive Run remains unique execution identity
```

安全 recovery：

```text
exact Git Base
+ exact cumulative pre-archive candidate
→ mechanical restore of repository candidate
→ recompute OpenSpecArchiveMutationSurfaceV1
```

Exact recovery 后先读取 durable terminal observation：

```text
current V1 == F
+ terminalObservation.kind == failure
→ reclassify as failure + same
→ terminal failed
→ MUST NOT respawn

current V1 == F
+ no terminalObservation
→ outcome-unknown recovery completed
→ MAY CAS armed → recovery-admitted
→ same pending Run MAY retry
```

只有第二种无 terminal observation 的分支允许下一次 invocation：

```text
recompute V1 == F
→ CAS recovery-admitted → armed
→ recompute V1 == F again
→ only then MAY spawn
```

必须有机器测试证明：

```text
arm写入 .flowkit guard
→ V1 fingerprint unchanged

armed + new process/session
→ retry blocked

active Change relocation / byte drift
→ V1 mismatch

canonical spec byte/directory drift
→ V1 mismatch

archive namespace target/collision identity drift
→ V1 mismatch

.git / node_modules / dist / unrelated repo file drift
→ V1 unchanged

no terminalObservation + exact restore A+B+C
→ recovery-admitted allowed

durable failure observation + exact restore A+B+C
→ terminal failed
→ no respawn

structured failure + post V1 == F
→ ordinary known-no-persistent-mutation failure

real OpenSpec 1.7 archive_target_exists after spec writes
→ structured failure observation durable
→ post V1 != F
→ recovery-required / no terminal / no retry
→ exact restore F
→ same failure observation + P == F
→ terminal failed without respawn

structured success + post V1 != F
→ accepted success

structured success + post V1 == F
→ terminal-state-mismatch / Change not completed
```

这些 proof 只回答“第二次 mutation 是否可安全允许”，不回答第一次 OpenSpec operation 是否成功。以下永远不能替代 recovery proof：filesystem success scan、`archive_change_not_found`、B1 semantic fingerprint、聊天/session memory。

### D11 — zero-delta Change 的 `skip_specs` 必须在 activation 前形成

OpenSpec 1.7.0 对没有任何 delta spec 的合法 Change要求 `.openspec.yaml` 显式：

```yaml
skip_specs: true
```

而 B1 `propose/revise-propose` 是 `proposal-bundle-only`，metadata又属于 semantic input，因此 **Propose绝不负责补写 `skip_specs`**。

C1 checkpoint 后新创建的 A1 activation contract新增显式 declaration：

```text
specDeltaMode: required | skip
```

语义：

```text
required
→ Change声明会产生/修改 canonical spec delta
→ activation:
   schema: spec-driven
   created: YYYY-MM-DD

skip
→ Change声明合法 zero-delta
→ activation:
   schema: spec-driven
   created: YYYY-MM-DD
   skip_specs: true
```

该 field 在 activation mutation 前显式提供；activation后 `.openspec.yaml` 成为当前 OpenSpec metadata authority。A1 MUST NOT在 Propose阶段补写或改写。

兼容边界：

```text
current C1
→ 已 active，已有真实 delta specs
→ metadata保持 byte-identical，不补 field、不迁移

20260810-01-change-execution-loop 中
C1 checkpoint 前已经存在的 exact planned:
D1 review-findings-and-blocker-authority
E1 change-verification-selection-and-change-set
F1 archive-and-checkpoint-boundary
G1 change-cli-end-to-end-and-performance
→ MAY省略 `specDeltaMode`
→ bounded legacy interpretation = required

C1 checkpoint 后new activation
→ `specDeltaMode` MUST explicit
→ missing = pre-activation/activation rejection
```

这里没有全局 legacy default，也不从 `outputs`、goal文本或未来 Proposal猜测是否 zero-delta。

### D12 — MODIFIED delta必须通过 archive merge preflight，而不只 strict validate

OpenSpec 1.7 `validate --strict` 可以接受一个语法正确但会在 archive merge 时丢失 canonical scenario 的 MODIFIED requirement。Proposal-level contract因此增加：

```text
每个 MODIFIED requirement
→ start from complete current canonical requirement block
→ preserve every existing scenario unless current Change显式删除/改名并说明
→ overlay本Change新增/修改语义
```

在 review-propose 前 MUST在 disposable copy：

1. 将 current Change `tasks.md`临时标记 complete；
2. 使用 OpenSpec 1.7.0 执行 real `archive --json --yes`；
3. 要求 operation成功；
4. 确认此 probe只发生在 disposable copy，不成为 current candidate archive authority。

本 preflight是 Proposal delta completeness regression，不替代正式 archive Action。

054 已实际在 disposable copy 使用 OpenSpec 1.7.0 验证本 contract：

```text
current C1 revised delta:
validate --strict → valid
archive --json --yes → success
specsUpdated: true
totals: added=9 modified=5 removed=1 renamed=0

zero-delta fixture:
schema: spec-driven
skip_specs: true
validate --strict → valid
archive --json --yes → success
specsUpdated: false
totals: absent
```

这些 probe 只证明 Proposal delta merge/output-shape contract，未改变 current C1 candidate 的 OpenSpec lifecycle state。

### D13 — canonical cleanup 使用 capability/authority名称，不再使用历史 stage label

`flowkit-integration-boundaries` 中历史：

```text
C1 MUST NOT modify B1...
```

改为：

```text
OpenSpec integration capability
→ 不得静默重定义已 checkpoint 的其它 capability authority
→ 如行为 contract需要改变，必须由当前 Change显式 delta spec冻结
```

这允许当前 C1 合法修改 integration capability 本身，同时继续保护 Q1/A1/B1 已冻结语义。


### D14 — C1 self-archive bootstrap activation seam不得由 canonical capability spec existence 单独触发

063 的真实 archive probe证明 OpenSpec 1.7 archive 顺序可出现：

```text
merge C1 delta into openspec/specs/**
→ canonical capability spec now exists
→ relocate/remove active C1 changeRoot
→ Flowkit 尚未 admission archive result / Manifest仍 state=active
```

因此 `canonical capability spec exists => structured Reader active` 是错误 activation seam。C1 冻结以下 bootstrap rule：

```text
current C1 before Flowkit completed admission
→ B1/C1 action integration可以直接使用 OpenSpecCliAdapter
→ global FormalFactReader不得因为 canonical C1 spec刚出现就切到“查询 active C1 status”

archive child returns / recovery resumes
→ consume durable archive terminalObservation + archive recovery state
→ admission closes C1 / Manifest active→completed

C1 completed thereafter
→ future Change FormalFactReader may use structured C1 reader path
```

实现可以通过 explicit integration state resolver或等价 deterministic seam完成，但 MUST基于 Flowkit formal lifecycle fact，而不是仅看 filesystem capability spec存在。该 bootstrap seam只解决 current C1 self-hosting window，不建立第二 OpenSpec archive authority，也不允许 filesystem scan猜 success。

#### 063 Finding Closure Map

```text
C1-RA-001 → D14
C1-RA-002 → D3（Owner reset后重写 acceptance）
C1-RA-003 → D5 + D6
C1-RA-004 → D8
C1-RA-005 → D7
```

## Risks / Trade-offs

- **[future OpenSpec version drift]** → stable 1.7.0 minimum baseline + per-required-surface machine-contract admission；无 fixed upper bound，但任何 shape/path/coherence/archive semantic drift都 fail closed。
- **[default spec-driven 不认识 Explore/Verification]** → 明确 authority split；绝不调用 `instructions explore/verification`。
- **[extra formal files位于 OpenSpec changeRoot]** → OpenSpec archive负责目录 relocation；Flowkit不把 relocation解释成 graph ownership。
- **[external-command timeout 改动影响共享调用]** → 保持现有 `{stdout,stderr,exitCode}`兼容字段，仅新增 bounded process diagnostics；read-only timeout是普通 failure；mutating archive在 child spawn 后必须执行 terminal-result × post-V1 matrix，不能从 structured failure直接推断 no mutation。
- **[root/store feature未来出现]** → 当前只支持 repo-local，unsupported mode明确错误，不建立 registry。
- **[current C1 self-dogfood]** → 当前 metadata保持 spec-driven；global Reader activation不能只看 canonical C1 spec existence，必须允许 archive relocation→Manifest completed 的 bootstrap窗口安全收口。
- **[zero-delta metadata dead-end]** → 新 Change在 pre-activation/activation显式 `specDeltaMode`；current Delivery既有 D1–G1 只有 exact bounded `required` compatibility。
- **[archive result transport loss]** → 不自动 retry、不扫描猜成功；保持 same pending Run，机械恢复 exact pre-archive candidate 后才允许重试。

## Migration Plan

1. 064 Proposal generation只重冻 compatibility + 063 technical acceptance；current C1 metadata保持 byte-identical，061其它 frozen decisions继续有效。
2. 在 Proposal review前用 disposable repo real archive preflight证明所有 MODIFIED delta可安全 merge。
3. 新 Apply generation实现 OpenSpec adapter + process mechanics + typed parsers，并关闭063的self-archive activation、path identity、validation coherence、Action-specific consumption blockers，同时实现既已批准的mutating archive recovery gate。
4. 将 planning-path consumers迁移到 normalized C1 view；保留 Explore/Verification owned-file resolver。
5. 扩展 A1 pre-activation/activation request contract以显式提供 `specDeltaMode`，activation据此写 minimal metadata；不新增Manifest副本字段；为当前 Delivery exact D1–G1保留 bounded `required` compatibility。
6. 用 disposable repo / stable OpenSpec 1.7.0 offline CLI作为minimum baseline fixture，并用 mocked/fixture higher-version compatible/incompatible structured surfaces覆盖无upper-bound conformance；同时覆盖prerelease拒绝、status/instructions/apply/validate/archive、delta/totals、skip_specs/no-totals、timeout/transport-loss、Windows path。
7. 通过 Change Verification 后进入 normal review-apply/archive。
8. C1正式 archive时由 OpenSpec operation拥有 relocation/sync；known success要求 admissible structured success 且 post V1 与 F发生预期 drift；structured failure若 post V1 drift同样进入 recovery-required。V1只作为持久 mutation safety proof，不扫描 archive path建立第二套业务 success authority。

## Open Questions

无。会改变 spec、实现方向或 tasks 的关键决策均已在本 Proposal 冻结。
