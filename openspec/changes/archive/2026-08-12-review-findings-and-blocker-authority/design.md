# Design: D1 — Review Findings and Blocker Authority

## Context

见 `proposal.md`。Q1 已正确冻结 lifecycle routing；D1 只完善 Reviewer authority payload/convergence，并关闭真实 execution 中暴露的 Owner handoff、OpenSpec semantic identity 和 Windows PowerShell shim compatibility 缺口。

当前关键 seam 已存在：A1 已有 Manifest `ownerDecisions` + deterministic `owner:<sha256>`；B1 已有 Review view、Owner authorization refs 与 `semanticInputFingerprint`；C1 已把 raw OpenSpec structured context接入 preparation；shared external-command 已支持 `.cmd/.bat` ComSpec。D1 应复用这些 seam，而不是建立新的 authority/store/framework。

## Goals / Non-Goals

**Goals:**

- 让 Reviewer Result 能完整、稳定、可机器收敛地表达 Finding。
- 让 direct re-review 在同一 reviewed stage 对 prior findings 给出显式 closure，而 Policy仍只消费最小 authority projection。
- 让 `contract-reset` 作为现有 A1 Owner authority store 的 bounded structured fact被 Core 接纳、验证并跨 detached role handoff。
- 让 applicable Owner fact与 OpenSpec external semantic inputs参与 same-pending identity，同时排除 Action 自己合法产生的 output/progress。
- 让 Windows npm PowerShell `.ps1` shim成为一等可执行路径，并在 `.ps1` 不存在时保留 `.cmd` fallback。

**Non-Goals:**

- 不重做 `changes-requested ≠ revise-required` 或 Q1 Policy routing。
- 不建立 global Finding registry、Evidence ledger、Owner Decision DB、Approval Registry、authority event ledger。
- 不把 Run/context/Action Package升级为 Owner/Reviewer authority store。
- 不实现 automatic review/revise、generic generation-management 或 generic shell/launcher platform。
- 不处理未复现的 Windows Run publish `EPERM rename`。

## Decisions

### D1 — ReviewFinding v2 使用完整 blocking contract，convergence 独立存放

D1 新写入的 completed `review-*` Result 增加：

```text
reviewFindingSchemaVersion: 2
reviewFindings: ReviewFindingV2[]
reviewFindingConvergence: FindingConvergence[]
```

`ReviewFindingV2` closed schema：

```text
id                  required non-empty stable ID
severity            blocking | non-blocking
title               required short summary
problem             required
contractRef         required stable contract locator
invariant           required violated invariant/requirement identity
evidence            required non-empty string[]
impact              required
location            optional non-empty string
blockingAuthority   required only for blocking
requiredOutcome     required only for blocking
acceptance           required non-empty string[] only for blocking
```

`requiredChange` 不再由 v2 writer产生；它只属于 unversioned/Q1 transitional reader compatibility。

non-blocking finding MUST NOT 携带 `blockingAuthority / requiredOutcome / acceptance`，因此它永远不能单靠 payload触发 lifecycle revise。

**Alternative considered:** 把 `resolved/still-open` 直接塞进每条 finding。拒绝，因为 current `reviewFindings` 应继续表示当前 Review 实际发现的问题；closure是 previous→current relationship，不应污染 finding authority本体。

### D2 — convergence 使用 previous matching Review 的 bounded pairwise projection

当当前 `review-*` 没有 previous matching Review 时：

```text
reviewFindingConvergence = []
```

存在 previous matching Review 时，current Result MUST 对 previous/current ID union 完整分类：

```text
new
still-open
resolved
superseded
```

physical record：

```text
findingId
state: new | still-open | resolved | superseded
supersededByFindingId?   # 仅 superseded required
```

约束：

- `still-open`：current findings MUST存在同一 ID；`contractRef + invariant` MUST 与 previous 同 ID保持一致。
- `new`：current findings MUST存在该 ID，previous不得有该 ID。
- `resolved`：previous MUST存在该 ID，current MUST不存在。
- `superseded`：previous MUST存在旧 ID，current MUST不存在旧 ID，`supersededByFindingId` MUST 指向 current `new` finding。
- 同一 Review Result 内 Finding ID MUST唯一；convergence 对每个 relevant ID恰好一条。
- 如果问题 identity 改变，不得复用旧 ID；使用 `superseded → new`。

previous Review MUST由实际近邻 lineage解析，不得仅按“同 stage latest completed Review”选择：

- direct same-stage re-review：previous Review MUST是同一 `reviewedRunId` / 同一 Contract Reset identity 下最近的 completed Review；
- review 一个 `revise-*` producer：previous Review MUST来自该 producer context 的 exact `sourceReviewRun`，且 source/current reset identity 必须兼容；
- Owner Contract Reset 后产生的新 non-revise producer generation：没有 previous convergence baseline，`reviewFindingConvergence = []`，abandoned/superseded generation findings不得自动带入。

只读取上述 immediate lineage neighbor，不回放整个历史 Run corpus。

**Alternative considered:** 全局 Finding DB / event ledger。拒绝；Reviewer Result +近邻 matching review 已足够。

### D3 — Reviewer Result 保持完整 authority，Policy 只获得最小投影

FormalFactReader继续只为 Policy投影：

```text
reviewRunId
reviewedRunId
verdict
blockingAuthorities
```

完整 `evidence / impact / acceptance / convergence` 不进入 Policy snapshot decision surface。

B1 `ActionPackageReviewView` 扩展 bounded fields：

- current/latest matching verdict + blocking authorities；
- 当前 Action真正需要的 finding fields；
- reviewer Action 时额外携带 immediate previous matching findings + convergence baseline identity。

Policy不解释 evidence，不自动判断 finding closure；closure由 Reviewer新 Result声明并由 Core进行结构一致性验证。

### D4 — Q1 transitional ReviewFinding 保留 read-only compatibility

当前 repository 已存在未带 `reviewFindingSchemaVersion` 的 Q1 transitional Reviewer Results。D1 不迁移重写 completed Runs。

Reader/serialization contract：

```text
missing reviewFindingSchemaVersion
→ transitional v1 read-only shape
→ 继续支持现有 id/severity/title/problem/location/blockingAuthority/requiredChange

reviewFindingSchemaVersion = 2
→ complete v2 closed schema + convergence validation
```

D1 implementation之后新 terminal `review-*` writer MUST输出 version 2；不得继续新写 v1。

### D5 — Contract Reset 复用 Manifest.ownerDecisions，不建立新 authority store

A1 `ownerDecisions` vocabulary增加唯一新 non-authorization kind：

```text
contract-reset
```

只支持 active Change-scoped reset。record shape在 existing fields基础上增加：

```text
ref
decision: contract-reset
deliveryId
changeId
scope                non-empty bounded string
requiredOutcomes     non-empty unique string[]
sourceRef            opaque provenance locator
```

`sourceRef` 不携带 decision semantics；required outcomes必须在 structured fields中。

`ownerDecisionRefFor()` 对 contract-reset 使用 canonical tuple：

```text
decision + deliveryId + changeId + scope + sorted(unique(requiredOutcomes)) + sourceRef
```

相同 normalized tuple idempotent返回同一 ref。

对于同一 `(deliveryId, changeId, scope)`，Manifest append order中的最新 valid `contract-reset` 是 current applicable reset；旧 record保留历史 provenance但不作为 current package semantic fact。该规则只服务 bounded Contract Reset，不推广成 generic authority event/generation framework。

Standalone Contract Reset admission必须：Delivery active、target Change active、formal conflicts=0、Owner显式提供 structured input；它不伪造 Policy authorization gate，也不自动推进 Action/Run。

### D6 — Reader 投影 bounded Owner facts；Run/context只是 projection

FormalFactSnapshot 增加 bounded `ownerContractResets`（或等价 typed view），保留现有 `ownerAuthorizations` 供既有 Policy gate消费。

current Run `context.json` 升级到 `schemaVersion: 3`，增加 machine-owned：

```text
ownerFactRefs: [
  {
    ref,
    decision,
    deliveryId,
    changeId,
    scope,
    requiredOutcomes,
    sourceRef
  }
]
```

只放当前 Action applicable 的 bounded verified projection；不复制聊天、Manifest全文或全部 Owner history。Historical context v1/v2继续 read-only compatibility，不重写。

Action Package增加对应 `ownerFactRefs` view。现有 authorization refs可继续作为 gate-specific typed view，但 semantic descriptor不得遗漏 Contract Reset identity。

### D7 — Contract Reset 对当前 Change 的所有 Standard Actions 都是 semantic input

对 active Change，current applicable `contract-reset` facts适用于全部十个 Standard Change Actions，因为它们改变当前 Change contract generation/required outcome。

因此 B1 semantic descriptor MUST包含 sorted applicable Contract Reset refs + normalized bounded semantic identity。新增/替换 current reset时：

```text
pending same Run
→ freshly derived fingerprint changes
→ PENDING_INPUT_DRIFT
```

Authorization-only Owner refs仍保持既有 action-specific applicability（例如 apply/archive），不因 D1 泛化成所有 Action。

### D8 — completed producer/review 的 currentness 必须绑定 Contract Reset identity

D1 不建立 generation object 或 generation registry。对 D1 之后准备的 Standard Run，Core 已经在 `context.json.ownerFactRefs` 保存 bounded applicable Contract Reset projection，因此可从这些 refs 派生：

```text
contractResetIdentity
= sorted(current applicable contract-reset refs by scope)
```

该 identity 是 currentness predicate，不是新的 authority/store。

规则：

- completed Run 的 `runStatus=completed` 永远保持历史有效；Owner Reset 不得反向把历史 Run 改成 invalid/failed。
- producer Run（`explore/propose/apply/revise-*`）只有其 prepared context 的 `contractResetIdentity` 与 current FormalFactSnapshot identity 相同，才可作为 current stage producer generation。
- review Run 只有其自身 identity 与 reviewed producer identity、current snapshot identity 三者一致，才可把 verdict 当作 current approval/blocker authority。
- current Reset 在 approved review 之后改变时，旧 producer/review 仍保留历史，但 lifecycle MUST忽略旧 approval并回到该 stage 的 normal producer Action，再要求新的 matching Review；不得直接推进下一 stage，也不得把旧 Review机械变成 `revise-*` source。
- `revise-*` 只继续消费其 exact `sourceReviewRun` 的 author-owned blocker；Reset 造成的 generation replacement不借用 revise 语义。
- currentness 由既有 Run context + current Manifest Owner facts确定，不写入 `.flowkit/generations`，不新增 generation manager。

历史 context v1/v2没有 `ownerFactRefs`。D1 MUST保持其 read-only historical validity，不回填或改写 completed Runs。若当前 Change不存在 structured `contract-reset`，既有 legacy currentness按原规则工作；一旦 D1 implementation之后存在 current structured Reset，只有带可验证 matching reset identity 的新 generation能够据此取得新的 current approval。

#### Reset 后 stage boundary 示例

```text
propose P1
→ review-propose R1 approved
→ Owner records new current Contract Reset CR2
→ P1/R1 remain completed history
→ R1 approval is not current
→ next = propose (new generation P2)
→ review-propose P2
```

不得：

```text
CR2
→ inherit R1 approved
→ apply
```

也不得：

```text
CR2
→ treat R1 as author finding source
→ revise-propose
```

**Alternative considered:** 持久化 generation id / supersession ledger。拒绝；current reset refs + existing producer/review lineage fields足以确定 currentness。

### D9 — OpenSpec raw execution context 与 semantic identity projection 分离

保留：

```text
openSpecContext
→ raw structured execution input for Author/executor
```

新增 action-sensitive semantic projection，仅用于 `externalContextFingerprint`。

`propose/revise-propose` projection包含：

```text
OpenSpec version + change identity
artifact instruction identity
schema name
resolved output logical identity
dependencies/unlocks
instruction/template semantic content
```

排除：

```text
status artifact existence/current output set
existingOutputLogicalPaths
其它由本 Action合法创建 planning outputs导致的存在性变化
```

`apply/revise-apply` projection包含：

```text
OpenSpec version + change identity
apply contextFiles exact logical identity
其它 non-action-owned apply prerequisite identity
```

排除：

```text
progress.total/complete/remaining
state
由 tasks progress合法变化产生的 derived status
```

proposal/spec/design/tasks真实 bytes仍通过 existing `contractRefs.versionFingerprint` 绑定；Owner/Review facts通过各自 refs绑定。因此排除 self-owned structured status不会弱化 contract drift保护。

### D10 — Windows 默认 OpenSpec shim resolution 为 ps1-first，失败不静默降级

当 `OpenSpecCliAdapter` 未显式提供 executable 且 platform=`win32`：

1. 在 PATH 中查找 exact `openspec.ps1`；若存在，选择该 shim。
2. 仅当 `.ps1` shim不存在时，查找 `openspec.cmd` 并作为 fallback。
3. 两者都不存在时 fail closed为 OpenSpec spawn/launcher failure。

如果 `.ps1` 已被选择但 PowerShell launcher不存在、spawn失败、timeout或script execution失败，MUST fail closed；不得静默改走 `.cmd`，否则会掩盖 preferred path 的真实故障。

explicit executable始终绕过 default shim discovery：`.ps1` 走 PowerShell mechanics；`.cmd/.bat` 走 ComSpec；其它值保持 direct-spawn语义。

### D11 — shared external-command 的 `.ps1` mechanics 是 bounded process helper

Windows `.ps1` target通过 PowerShell launcher执行：

```text
preferred launcher: pwsh.exe
fallback launcher: powershell.exe
flags: -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <script> <args...>
```

launcher resolution只用于 `.ps1` process execution，不读取/依赖用户 profile。argv 逐项传递，不拼接 command string，不使用 `shell:true`、`Invoke-Expression` 或字符串 eval。

现有 `.cmd/.bat`：继续 `ComSpec || cmd.exe /d /s /c`；non-Windows：继续 direct spawn。

PowerShell/child 的 spawnError、timeout、exitCode、stdout/stderr继续通过 existing process result contract返回，由 OpenSpec adapter映射为现有 fail-closed error taxonomy；D1不建立第二 process result model。

## Risks / Trade-offs

- **[Finding v2 增加字段导致历史 result 不兼容]** → 用明确的 unversioned transitional v1 read-only seam；D1新 writer只写 v2，不迁移 completed history。
- **[Contract Reset “latest same scope”可能被误当 generic generation manager]** → 只支持 active Change-scoped `contract-reset`，只选择同 target/scope latest fact，不提供任意 event/query framework。
- **[Reset 后旧 approval/finding 被跨 generation 继承]** → completed history保持不变，但 currentness显式比较 prepared/current reset identity；convergence只沿 same-target direct re-review 或 `sourceReviewRun` 近邻链，不按 stage latest 扫描。
- **[Owner fact projection复制 authority]** → Manifest仍是唯一 authority；context/package只保存 bounded verified projection + stable ref，并可从 Manifest重新验证。
- **[排除 OpenSpec self-owned fields可能漏掉真实 drift]** → contractRefs、instruction semantic content、resolved output identity、apply contextFiles、Owner/Review refs继续参与 fingerprint；仅排除 Action-owned existence/progress。
- **[PowerShell fallback掩盖错误]** → `.cmd` 只在 `.ps1` shim不存在时 fallback；`.ps1` 已选择后的 failure一律 fail closed。
- **[PowerShell execution policy差异]** → 使用 non-profile bounded `-ExecutionPolicy Bypass -File` 只作用于该 child process；不修改系统/用户 policy。

## Migration Plan

1. 先扩展 serialization/read compatibility，使现有 unversioned ReviewFinding 和 context v1/v2继续可读。
2. 实现 Finding v2/convergence terminal validation，再切换新 Review writer到 v2。
3. 扩展 A1 Contract Reset record + Reader projection，再接 B1 context/package/fingerprint，并实现 reset-aware completed producer/review currentness与近邻 convergence resolver；不回填 historical v1/v2 context。
4. 将 OpenSpec raw context fingerprint替换为 action-sensitive semantic projection。
5. 增加 `.ps1` launcher与 OpenSpec ps1-first shim resolution。
6. 运行 focused/affected verification、typecheck/lint/build/OpenSpec strict；不运行 Delivery Full Test，除非 Owner另行授权。

Rollback：D1尚未 checkpoint前可撤销本 Change candidate；不得通过重写历史 completed Run来回滚。若新 schema admission失败，保持 old repository bytes和 pending Run fail-closed。
