# D1 Explore — Review Findings and Blocker Authority

## 1. Context

- Delivery: `20260810-01-change-execution-loop`
- Change: `D1 review-findings-and-blocker-authority`
- Role: Author
- Execution Context: detached
- Exact GitHub Base: `ea9b34b23fb4c2c732980184cb821d546cd30da0`
- Formal Explore Run: `20260812-071-explore`
- Formal Review Run: `20260812-072-review-explore` (`changes-requested`)
- Formal Revise Run: `20260812-073-revise-explore`
- Owner restart activation ref: `owner:7a0a0914da59e02bff5fe554477143b45dc1de760c6b4a363ebcbd49956d00c1`
- OpenSpec probe version: `1.7.0`

当前是重启后的正式 detached lineage：

```text
071-explore
→ 072-review-explore changes-requested
→ 073-revise-explore
```

此前 cmd-only Windows launcher 的 detached generation 已由 Owner 明确 abandoned，未 canonical materialize，不属于当前 lineage。

Owner 在当前 lineage 中独立明确冻结的 required outcome 保持：

```text
1. Windows launcher: `.ps1` first-class support；PowerShell path 优先于 `.cmd` fallback；上一 cmd-only generation abandoned。
2. detached role handoff: applicable Owner decisions / Contract Reset 必须最终由 Core-admitted structured formal fact/ref 可验证传递，并参与 semantic input identity。
3. `Manifest.ownerDecisions` 继续是唯一 Owner authority store；Run/context/Action Package 只携带 bounded verified projection，不保存聊天全文、不建立第二 Decision DB。
```

但 072 已确认：baseline 当前**不能**表达/接纳上述 non-authorization Contract Reset；071 candidate 为自举而提前加入 `contract-reset/ownerFactRefs` production schema 的做法越过 Explore mutation boundary。073 因此撤销该 provisional production implementation，不再声称当前 Core 已经 machine-admit / machine-propagate Contract Reset。

当前 Explore 只把上述 Owner required outcome 作为 D1 已冻结的外部 authority input 与 confirmed product gap 记录；“未来 Reviewer 不需要 Owner 重复输入”是 D1 要实现和验证的 acceptance，不是当前 baseline 已具备的能力。

用户提供的 executable snapshot HEAD 为 C1 checkpoint `8b1cd1ad5e51a24911690de6d8c7e8e52bdefa73`。已核对 GitHub exact Base `ea9b34b23fb4c2c732980184cb821d546cd30da0` 仅比该 checkpoint ahead 2 commits，唯一变化文件为 `AGENTS.md`；D1 当前 product/OpenSpec/Manifest baseline bytes 未受影响。本 detached transport 必须绑定 `ea9b34b...`，且不得携带或覆盖 `AGENTS.md`。

D1 原始主范围保持：typed Findings、stable Finding identity、`blockingAuthority`、Finding convergence、non-author direct re-review 与 no-op revise rejection。Owner 同时要求本 D1 收口三个已经在真实执行中暴露的 corrective：Windows `.ps1` compatibility、B1 self-mutation semantic identity、structured Owner fact handoff。它们不得扩展成 generic launcher/fingerprint/authority ledger/generation framework。

## 2. Formal lineage and revise startup facts

071 完成后，072 Reviewer 给出：

```text
verdict: changes-requested
blocking findings: 1
D1-RE-001
blockingAuthority: author
```

072 的唯一 blocker 是：071 Explore candidate 在 `mayWriteProductionCode=false` 的边界下提前替换了 12 个 `src/**` production files，并把尚待 Proposal 冻结的 `contract-reset/ownerFactRefs/schema/fingerprint` 作为既成自举实现。

073 处理该 author blocker 时先恢复 C1 checkpoint baseline production code，并移除 baseline Reader 无法识别的 provisional `contract-reset` Manifest record；保留既有、baseline 合法的 D1 activation record。随后 formal projection 为：

```text
flowkit status
→ change: D1 review-findings-and-blocker-authority
→ stage: explore
→ last-run: 20260812-072-review-explore
→ review: changes-requested
→ conflicts: 0

flowkit next
→ action: revise-explore

flowkit doctor
→ overall: ok
→ findings: 0
```

B1 preparation surface 由 Policy 解析 `entry=next`，由 allocator 正式创建：

```text
20260812-073-revise-explore
role: author
source review: 20260812-072-review-explore
blockingAuthorities: [author]
```

caller 没有手工指定 concrete Action、Role 或 NNN。

073 的 mutation boundary 只允许修改 Explore artifact；本 revise 不修改 production code/tests、不修改 072 Reviewer-owned Result，也不创建 Proposal/Design/Specs/Tasks。

### 2.1 D1-RE-001 closure

本 revise 对 D1-RE-001 的关闭方式：

```text
- 所有 071 provisional `src/**` bootstrap mutation 从 cumulative candidate 移除；
- unsupported `contract-reset` Manifest record 从 cumulative candidate 移除；
- 不再把 `ownerFactRefs` provisional projection 描述成当前正式 Core capability；
- 保留 `.ps1-first` 与 structured Owner handoff required outcome；
- baseline 无法 Core-admit Contract Reset 被保留为 D1-C04 confirmed gap；
- 最终 physical schema / applicability / fingerprint semantics 留到 Proposal 冻结。
```

071 已完成 Run 的历史 `context.json` 仍可能包含当时 provisional `ownerFactRefs` 字段；073 不篡改已完成 Run。恢复 baseline 后这些字段不构成 Owner authority，也不得被解释为产品已支持该 schema。它们只属于 072 已审出的历史 candidate 事实。

## 3. D1 corrective — Windows OpenSpec PowerShell shim compatibility

### 3.1 Confirmed canonical problem

当前 C1 adapter baseline 是：

```ts
this.executable = options.executable ?? 'openspec';
```

shared `runCommand()` 当前只对 Windows `.cmd/.bat` 做显式 `ComSpec` launcher 处理；`.ps1` 没有对应 execution mechanics。

Owner handoff 已记录 canonical Windows 真实失败：

```text
OPENSPEC_SPAWN_FAILED
spawn openspec ENOENT
```

同时 npm-installed OpenSpec 在 Windows 提供 PowerShell / cmd shim；Owner 的 canonical 工作环境以 PowerShell 为默认 shell，并明确要求 D1 不得通过“强制选择 `.cmd`”规避 PowerShell shim。

因此 D1 要解决的不是单纯的 bare-command rename，而是：

```text
Node/Flowkit external-command mechanics
+ Windows npm PowerShell shim (.ps1)
→ 必须形成可执行、可测试、fail-closed 的兼容路径
```

### 3.2 Owner-frozen required outcome

Owner 在当前 generation 冻结：

```text
Windows OpenSpec launcher
→ .ps1 is a first-class supported shim
→ PowerShell-compatible path has priority over .cmd fallback
→ .cmd/.bat compatibility remains supported
→ explicit executable remains authoritative
```

因此上一 generation 的：

```text
Windows default → openspec.cmd
.ps1 support → out of scope
```

已经被 supersede，不得进入 Proposal。

D1 Proposal 必须研究并冻结最小 machine contract，至少覆盖：

```text
1. `.ps1` 如何由 bounded PowerShell launcher 执行；
2. 默认 OpenSpec Windows shim resolution 如何优先 PowerShell path；
3. `.cmd/.bat` 作为兼容 fallback 如何继续复用现有 ComSpec mechanics；
4. explicit executable=.ps1 / .cmd / custom executable 如何保持确定性；
5. launcher failure / missing PowerShell / missing shim 如何结构化 fail closed；
6. argv 传递不得依赖 `shell:true`、profile side effects 或字符串 eval；
7. Linux/macOS behavior 不发生语义漂移。
```

### 3.3 Why this is D1 scope, not a new generic launcher project

该 corrective 只服务 C1 已引入的 OpenSpec thin integration 在真实 Windows canonical 环境可工作。D1 不建立：

```text
generic shell abstraction
PowerShell profile manager
script execution framework
launcher registry
arbitrary shell discovery platform
```

但 `.ps1` compatibility 本身是 required，不再属于 out-of-scope。

### 3.4 Current generation startup

因为本次执行环境是 detached Linux，新的 071 Explore preparation 使用离线 OpenSpec 1.7.0 executable input 完成，不需要在 Explore 前预先修改 production launcher。这样避免在 Proposal/Design 冻结前再次把某个 Windows implementation 当成最终 contract。

当前 generation 因此只在 Explore 中冻结 required outcome；真正 `.ps1` implementation 留给 D1 Apply，并由 Windows-focused regression + affected verification 审查。

---

## 4. Run publish EPERM observation — not reproduced, not D1 scope

handoff 记录的 canonical Windows 观察是：新的 Explore Run 曾两次在 `createRun` directory publish 阶段出现：

```text
EPERM rename
.tmp-...-explore
→ final Run directory
```

本 detached 环境在相同正式 preparation path 上实际创建 `20260812-071-explore` 成功：

```text
action.md published
context.json published
pending Run readable
pending-resume: resumable
```

因此当前证据只能说明：

```text
canonical Windows EPERM is not reproduced in detached Linux execution
```

不能说明其根因已经确定，也不能把它提升为 D1 product contract。

D1 明确不处理：

```text
generic atomic directory publish redesign
Windows filesystem retry framework
rename backoff policy
manual/fake Run creation
```

如果未来在 exact canonical Action path 上获得可重复、可归因的正式证据，应进入新的合法 corrective scope，而不是在 D1 中猜测修复。

---

## 5. Q1 已经冻结的基础：D1 不重做 blocker authority Policy

Q1 已完成的 canonical baseline 包括：

```text
blockingAuthority = author | owner | verification | external
changes-requested ≠ revise-required
author-only blockers → revise-S
任一 non-author blocker → next() blocked authority boundary
explicit same-stage review-S → legal direct re-review
mixed author+non-author → non-author boundary 优先
no-op Author revise 不作为 non-author blocker 的关闭方式
```

当前代码已实现这些最小 machine contracts：

- `ReviewFinding` blocking entry 需要 `blockingAuthority`；
- `ReviewVerdictFact` 投影 deduplicated `blockingAuthorities`；
- `next()` 的 `decideChangesRequested()` 只在 author-only 时返回 `revise-*`；
- `reviewSPreconditions()` 对 non-author/mixed matching review 保留 explicit re-review；
- `reviseSPreconditions()` 对任何 non-author authority fail closed；
- B1 `entry=review` 通过 unified `resolveReview()` 创建新的 Reviewer execution generation。

所以 D1 不应重新设计“CR 到底是否 revise”的 Policy 基础，而应在此基础上完成 Reviewer Finding contract 与 convergence。

---

## 6. Confirmed Gap D1-G01 — 当前 Finding payload 仍是 Q1 transitional minimum

当前 persisted `ReviewFinding` 只有：

```text
id
severity
title
problem
location?
blockingAuthority?
requiredChange?
```

而 02 D1 scope 要求的完整 finding 语义至少需要表达：

```text
finding identity
problem
invariant / contractRef
evidence
impact
requiredOutcome
acceptance
blockingAuthority
lifecycle/convergence status
```

当前 transitional shape 的具体不足：

1. `requiredChange` 只适合 author blocker，不能统一表达 non-author blocker 的 `requiredOutcome`；
2. 没有 `contractRef` / `invariant`，Reviewer finding 无法稳定指向被违反的 contract；
3. 没有 structured `evidence` / `impact` / `acceptance`，跨 review round 只能依赖 title/problem prose；
4. non-author finding 被禁止携带 `requiredChange` 是正确的，但当前也没有替代字段表达“什么 authority outcome 才算关闭”；
5. `id` 只校验 non-empty，没有同一 Review 内 duplicate ID 检查，也没有跨 generation identity/convergence contract。

D1 需要把 Q1 transitional payload 升级为完整但仍 Lean 的 Reviewer-owned Finding contract；不能把 Finding 正文复制进 Policy snapshot。

---

## 7. Confirmed Gap D1-G02 — 当前没有 Finding convergence

repo-wide scan 没有 production convergence engine。当前每次 completed review 只保存本轮 `reviewFindings`，Reader/Policy 只投影 matching current Review 的 verdict + authority set。

不存在正式 machine semantics 来区分：

```text
resolved
still-open
superseded
new
```

也不存在：

```text
prior finding identity matching
same ID changed meaning 的拒绝规则
resolved finding closure record
superseded finding replacement relationship
```

这正是 Q1 明确后置给 D1 的范围。

### D1 必须保持的 Lean boundary

Finding authority 仍属于 Reviewer Run result。D1 不应建立：

```text
.flowkit/findings global database
generic Finding registry
evidence ledger
generic authority-resolution event store
automatic Reviewer loop
```

合理的 seam 应围绕：

```text
previous applicable Reviewer result
+
current Reviewer result
→ deterministic convergence projection / validation
```

具体 physical fields 与是否把 convergence classification 持久化在 current Review result 中，留给 Proposal 冻结。

---

## 8. Confirmed Gap D1-G03 — B1 Action Package finding view 已有未完成的 D1 seam

`ActionPackageFindingView` 当前已经预留：

```text
id
severity
blockingAuthority?
title?
requiredOutcome?
acceptance?
```

但 `readReviewFindingView()` 当前实际映射：

```text
requiredChange → requiredOutcome
acceptance → never populated
```

并且不会携带：

```text
problem
contractRef / invariant
evidence
impact
convergence status
```

这说明 B1 已经为“下一 Action 只消费最小 finding view”留下 seam，但 D1 contract 尚未完成。

D1 Proposal 需要明确：

- Author revise package 至少需要哪些 finding fields 才能准确关闭 blocker；
- direct re-review package 需要哪些 prior finding/context；
- Policy 继续只消费 `blockingAuthorities`，不得因 D1 扩展而加载完整 Finding prose；
- Reviewer 执行时必须能看到 relevant previous findings，支持 convergence，而不是整个历史 Run corpus。

---

## 9. Confirmed Gap D1-G04 — stable Finding identity 目前没有 enforceable semantics

当前 `ReviewFinding.id` 只要求非空 string。

未发现 production validation 负责：

```text
同一 result 内 finding ID 唯一
跨 review round 同一 ID 必须保持同一问题 identity
新问题必须分配新 ID
旧 finding 关闭时如何表达 resolved
旧 finding 被更准确 finding 替代时如何表达 superseded
```

因此“稳定 Finding ID”目前只是 reviewer convention，不是 machine contract。

Proposal 必须冻结一个足够小的 identity rule，使 Reviewer 可以在多轮 review 中稳定复用 ID，同时避免建立全局数据库或对所有历史 review 做无界 replay。

---

## 10. Corrective Gap D1-C01 — raw OpenSpec context 被直接 hash 成 pending semantic identity

B1 当前：

```ts
const openSpecContext = await buildOpenSpecPreparedActionContext(...)
const externalContextFingerprint = fingerprintOpenSpecPreparedActionContext(openSpecContext)
```

而：

```ts
fingerprintOpenSpecPreparedActionContext(view)
= sha256(stableStringify(view))
```

也就是说 raw execution context 与 semantic identity projection 是同一份对象。

这对 artifact-producing Action 不成立。

---

## 11. Corrective Gap D1-C02 — propose/revise-propose 会被自身 OpenSpec output 反向制造 drift

`buildOpenSpecPreparedActionContext()` 对 `propose/revise-propose` 包含：

```text
status.artifactPaths
artifactInstructions.resolvedOutputLogicalPath
artifactInstructions.existingOutputLogicalPaths
artifactInstructions.dependencies
artifactInstructions.unlocks
artifactInstructions.instruction
artifactInstructions.template
```

执行 propose 后，Action 合法创建：

```text
proposal.md
design.md
specs/**
tasks.md
```

OpenSpec 的 `existingOutputLogicalPaths` 与某些 artifact path existence/set 会因此变化。当前 full-object fingerprint 会把 Action 自己合法产生的 output existence 当成“外部 semantic input drift”。

结果：

```text
same pending propose Run
→ author writes legal proposal bundle
→ session resumes / prepare again
→ OpenSpec context changed because own outputs now exist
→ PENDING_INPUT_DRIFT
```

这违反 B1 的 same execution instance semantics。

### 必须保留 fail-closed 的真正外部输入

不能简单停止 hash OpenSpec context。至少以下仍属于 semantic input：

```text
OpenSpec version / change identity
artifact instructions
instruction/template/dependencies/unlocks
resolved output identity
Owner facts
review facts
contract refs
other non-action-owned execution prerequisites
```

因此修复目标是**投影**，不是删除 OpenSpec context。

---

## 12. Corrective Gap D1-C03 — apply/revise-apply progress/state 是 Action-owned output

`buildOpenSpecPreparedActionContext()` 对 `apply/revise-apply` 包含：

```text
status.artifactPaths
applyInstructions.contextFiles
applyInstructions.progress.total/complete/remaining
applyInstructions.state
```

`apply/revise-apply` 合法更新 `tasks.md` task progress，OpenSpec `progress/state` 因此变化。

当前 full-object fingerprint 会导致：

```text
pending apply
→ legal task progress update
→ same Run resume
→ progress/state changed
→ PENDING_INPUT_DRIFT
```

但 `applyInstructions.contextFiles` 本身是真正 external semantic input：如果 Apply 所需 proposal/specs/design/tasks context identity 变化，旧 pending Run 应 fail closed。

因此 D1 required outcome 必须精确区分：

```text
Action-owned task progress/status
→ exclude from semantic identity

apply contextFiles identity
→ include in semantic identity
```

---

## 13. Existing B1 code already proves this is a projection bug, not a reason to weaken contract refs

当前 B1 已有 `isActionOwnedMutableContractRef()` / `assertImmutableContractRefsForAction()` seam：

```text
revise-explore → explore.md mutable
revise-propose → proposal/design/tasks/specs mutable
apply/revise-apply → tasks.md mutable
```

并且 terminal admission 已明确：

> 不从 post-execution working tree 重新计算 entry fingerprint，因为当前 Action 可能合法修改自己的 output。

说明 current design 本身已经承认：

```text
entry semantic identity
≠
post-execution current output bytes
```

当前问题只是 `externalContextFingerprint` 又通过 raw OpenSpec structured context 把 self-owned output/progress 引回 semantic identity。

D1 corrective 应沿用现有原则，建立 bounded OpenSpec semantic identity projection，而不是移除 raw context、移除 contractRefs 或放宽真正外部 drift。

---

## 14. Semantic identity required behavior to freeze in Proposal

### 14.1 propose / revise-propose

same pending Run MUST NOT 因以下合法自写变化 drift：

```text
artifact existence
existing output paths
Action 自己产生的 proposal/design/specs/tasks output set/progress status
```

但 MUST 因以下外部变化 fail closed：

```text
OpenSpec/change identity
artifact instructions semantic content
resolved output identity
contract generation
review/Owner authority facts
其它真正 external prerequisites
```

### 14.2 apply / revise-apply

same pending Run MUST NOT 因以下合法自写变化 drift：

```text
task completion progress
OpenSpec progress/state derived from those task writes
```

但 MUST 因以下外部变化 fail closed：

```text
apply contextFiles identity
approved proposal generation / contract refs
review facts
Owner authorization
other external execution context
```

### 14.3 executor input remains raw

必须继续返回完整 `openSpecContext` 给 executor/Author execution：

```text
raw OpenSpec context stays available
semantic fingerprint uses bounded projection
```

不得为了修 resume drift 而删除 structured OpenSpec execution context。

### 14.4 no invented legacy work

当前 detached generation 没有旧 074 pending Run，也没有需要恢复的 legacy D1 generation。

Proposal 不应凭空引入：

```text
074 special-case
legacy pending generation migration
fingerprint version registry
cross-generation recovery platform
```

只有如果当前真实 repository 中存在必须继续读取的旧 pending shape，才允许最小 bounded compatibility。

---

## 15. Corrective Gap D1-C04 — applicable Owner fact handoff 在 baseline 缺失

此前 detached review 真实暴露：baseline A1/B1 只能把有限 authorization facts 投影到 execution package，Contract Reset 等 non-authorization Owner semantics 无法从 Core-admitted context 被后续 detached role 独立验证。这是 confirmed product gap，不是聊天沟通问题。

### 15.1 create → persist：A1 authority store 已存在，decision semantics 不够

A1 已经把 Owner decision/provenance 持久化在 Delivery Manifest `ownerDecisions`，并使用 deterministic `owner:<sha256>` ref；这个 store 必须继续是唯一 Owner authority store。

当前 baseline：

```text
OWNER_DECISION_RECORD_KINDS
→ create-delivery / create-change / activate-change / authorize-*
→ 不含 contract-reset

OwnerDecisionRecord
→ ref / decision / deliveryId / changeId? / sourceRef

ownerDecisionRefFor() canonical tuple
→ decision + deliveryId + changeId? + sourceRef
```

因此现有 create/write-side 不能表示：

```text
decision kind = contract-reset
scope
structured decision value / required outcome
```

把这些语义编码进 `sourceRef` 字符串只能提供 provenance locator，不能成为 decision semantics。

### 15.2 read：FormalFactReader 只投影 authorization subset

当前 Reader 会验证 `ownerDecisions` 的已知 kind 与 stable ref，但 `FormalFactSnapshot` 只暴露 `ownerAuthorizations`。

所以即使 Manifest 是 Owner authority store，baseline Reader 也没有 bounded non-authorization Owner fact projection 可供后续 Action 消费。未知 `contract-reset` record 反而会产生 `owner-decision-record` formal conflict；073 已移除这一 provisional record，以恢复 `conflicts=0`。

### 15.3 consume：B1 seam 已存在，但 applicability 只覆盖 authorization

B1 `SemanticInputs` / Action Package 已有：

```text
ownerAuthorizationRefs
semanticInputFingerprint
```

这证明 Owner fact identity 参与 pending semantic identity 的总体 seam 已存在；但 baseline collector 只为适用的 apply/archive authorization 收集 refs，`explore/review/revise` 没有 Contract Reset 之类的 applicable Owner fact view。

`context.json` baseline 也只有：

```text
ownerAuthorization
semanticInputFingerprint
```

没有可跨 detached role handoff 验证的 bounded structured Owner fact/ref projection。

### 15.4 071 provisional bootstrap 的审查结论

071 曾尝试通过提前修改 A1/Reader/B1 production schema 来证明 `contract-reset → ownerFactRefs → fingerprint` 可行；072 明确判定这种做法越过 Explore planning-only boundary。

因此 073 的正式结论不是“bootstrap seam 已实现”，而是：

```text
existing seams are reusable candidates
≠
physical contract already approved or implemented
```

特别是 `ownerFactRefs` 字段名、structured value shape、applicability algorithm、context/package schemaVersion、canonical tuple 扩展方式都不是当前既成事实。

### 15.5 D1 最终 required behavior

Proposal 必须保证：

```text
Owner independent explicit input
→ existing A1 ownerDecisions remains sole authority store
→ Core admits/validates a structured applicable Owner fact/ref
→ FormalFactReader projects only bounded applicable facts
→ Action Package / execution context carries necessary verified projection
→ semanticInputFingerprint includes applicable Owner fact identity
→ applicable Owner fact changes ⇒ pending execution fail closed
→ detached next role verifies the admitted fact without chat replay
```

structured fact 至少需要能区分：

```text
decision kind / scope
applicable Delivery / Change
decision value / required outcome
source provenance/ref
stable identity/fingerprint（沿用或扩展现有 ownerDecisionRefFor seam，具体由 Proposal 冻结）
```

Run/context/Action Package 始终只是 verified projection，不获得 Owner authority。D1 不建立 generic authority event ledger、Approval Registry、Decision Database、chat transcript persistence 或 generation-management framework。

## 16. D1 Reviewer contract must become complete without becoming a second authority plane

一次 `review-*` 仍应：

```text
read complete reviewed target
read all applicable contract/acceptance
read relevant prior findings
perform complete blocking scan
emit all blocking findings possible
emit non-blocking findings
```

D1 的核心不是让 Reviewer 决定 next，而是让 Reviewer 输出足够完整、稳定、可收敛的 authority facts。

固定 authority split 仍应是：

```text
Reviewer result
→ full Finding facts + verdict

FormalFactReader projection
→ current verdict + minimal blockingAuthorities needed by Policy

Policy
→ unique legal lifecycle boundary

B1 Action Package
→ bounded current/relevant finding view for one Action
```

这能保持 One fact, one authority。

---

## 17. Proposal 前必须冻结的问题

### D1-P1 — complete Finding physical shape

需要冻结：

```text
required fields
optional fields
blocking/non-blocking differences
requiredOutcome vs requiredChange migration
acceptance shape
contractRef/invariant/evidence/impact representation
closed schema behavior
```

目标应满足 02 reference 的语义，但保持 Lean，不塞 raw logs/evidence corpus。

### D1-P2 — stable Finding ID + convergence representation

需要冻结：

```text
same ID identity invariant
within-review uniqueness
previous review matching scope
resolved / still-open / superseded / new 的 machine representation
supersede 是否需要 target finding ID
如何避免无界历史 replay
```

### D1-P3 — Reviewer result vs Policy projection

需要冻结哪些 fields 只存在 Reviewer result，哪些最小投影进入：

```text
ReviewVerdictFact
ActionPackageReviewView
ActionPackageFindingView
```

Policy 不应获得 evidence/impact/prose 全量副本。

### D1-P4 — direct re-review convergence

需要冻结同一 target direct re-review 时：

```text
previous matching Review 是 convergence baseline
new Reviewer generation 重新完整审查
旧 finding 可 resolved/still-open/superseded
新问题可 new
latest Review 成为新的 matching authority
```

但不得新增自动 authority-resolution detector 或 automatic review loop。

### D1-P5 — OpenSpec semantic identity projection

需要冻结 action-sensitive projection：

```text
propose/revise-propose
→ exclude self-owned output existence/existing paths
→ retain instruction/output identity/external prerequisites

apply/revise-apply
→ exclude self-owned progress/state
→ retain contextFiles and external prerequisites
```

raw `OpenSpecPreparedActionContextView` 继续完整交给 executor。

### D1-P6 — structured Owner fact/ref propagation

需要冻结但不能提前在 Explore 决定的 physical contract：

```text
A1 ownerDecisions 如何在不建立第二 store 的前提下表达 Contract Reset / non-authorization Owner fact
structured decision kind/scope/value/requiredOutcome 的最小字段
stable ref/fingerprint canonical tuple 是否扩展现有 ownerDecisionRefFor()
FormalFactSnapshot 的 bounded Owner fact projection
Action-specific applicability selection
ActionPackage/context.json 只带 ref 还是 bounded structured projection
context schemaVersion 是否需要升级或可兼容扩展
semanticInputFingerprint 如何包含 applicable Owner fact identity
旧 authorization-only records 的最小兼容边界
```

原则：优先复用 A1 authority store + B1 owner ref/fingerprint seam；不新建第二 Owner store，不把 `sourceRef` 当 decision value，不让 Run 重新拥有 authority。

### D1-P7 — Windows PowerShell shim compatibility

Proposal 必须冻结正式 D1 launcher contract：

```text
Windows `.ps1` shim → first-class supported
PowerShell path → preferred over `.cmd` fallback
`.cmd/.bat` → existing ComSpec compatibility preserved
explicit executable → authoritative and type-sensitive
non-Windows → unchanged
no shell:true / Invoke-Expression / profile-dependent behavior
no generic launcher framework
```

Proposal 还必须明确 PowerShell launcher binary/resolution、argv forwarding、exit/spawn/timeout semantics 和 focused Windows regression matrix；不得再把 `.cmd` hard-code 当成最终修复。

### D1-P8 — publish EPERM scope guard

Proposal 必须明确：

```text
not reproduced in detached
not in D1 contract
no speculative run-persistence redesign
```

---

## 18. Expected affected surfaces for Proposal investigation

当前证据指向的最小 affected areas：

```text
src/domain/a1-types.ts
src/domain/owner-provenance.ts
src/services/a1-write-service.ts
src/persistence/delivery-manifest-document.ts
→ reuse existing ownerDecisions authority store while making non-authorization Owner fact semantics structured/verifiable

src/persistence/serialization.ts
→ complete typed ReviewFinding + validation/convergence result shape
→ context.json bounded applicable Owner fact/ref projection if Proposal selects this physical seam

src/facts/formal-fact-reader.ts
src/facts/formal-fact-snapshot.ts
→ latest Review/convergence authority reconstruction + minimal Policy projection
→ validate/project applicable structured Owner facts beyond authorization-only subset

src/domain/types.ts
src/services/b1-run-execution-service.ts
→ Action Package finding view + prior finding/convergence input
→ OpenSpec semantic identity projection
→ generalize existing ownerAuthorizationRefs seam to bounded applicable Owner fact/ref handoff and include it in semantic identity

src/policy/**
→ preserve Q1 authority routing; only D1 convergence integration if strictly needed

src/shared/external-command.ts
→ add bounded `.ps1` PowerShell execution mechanics while preserving `.cmd/.bat` ComSpec behavior

src/integrations/openspec/openspec-cli-adapter.ts
→ Windows OpenSpec shim selection/resolution must prefer PowerShell-compatible path and preserve explicit executable authority

tests/unit/persistence/**
tests/unit/facts/**
tests/unit/policy/**
tests/unit/services/**
tests/unit/integrations/**
tests/integration/**
→ focused regression matrix
```

这只是 Explore inventory，不是最终 Design。Proposal 应尽量避免不必要的 Policy churn，因为 Q1 lifecycle routing 已经正确。

---

## 19. Explicit out of scope

D1 不实现：

```text
global Finding database / registry
Evidence / Receipt platform
generic authority-resolution event ledger
Approval Registry / Decision Database
chat transcript persistence
generic generation-management framework
automatic Reviewer loop
automatic Author revise
generic shell/launcher framework beyond the required bounded `.ps1` compatibility
generic fingerprint framework
generation-management platform
Windows filesystem rename retry framework
manual/fake Run creation
E1 verification selection
F1 archive/checkpoint redesign
G1 stable Change CLI/E2E scope
Delivery Full Test / Finalize
Archify
CodeGraph mandatory integration
```

---

## 20. Explore conclusion

073 `revise-explore` 已把 072 的唯一 author blocker 关闭，当前 D1 Explore 结论为：

1. Q1 已解决 lifecycle authority routing；D1 不重做 `changes-requested ≠ revise-required`。
2. Finding schema 仍缺完整 contract fields、stable identity 与 convergence；完整 Finding 属 Reviewer result，Policy 只消费最小 projection。
3. OpenSpec raw execution context 不能直接等同 semantic identity；propose/apply self-owned outputs/progress 必须从 fingerprint projection 排除，而真正 external inputs 继续 fail closed。
4. Owner 已冻结 Windows required outcome：`.ps1` first-class，PowerShell path 优先于 `.cmd` fallback；cmd-only generation abandoned。当前 baseline 尚未实现该 launcher contract。
5. structured Owner handoff gap 已确认：A1 有正确 `ownerDecisions` authority store 和 stable ref seam，但 baseline decision kind/value、Reader projection、general Action handoff 与 semantic applicability 不足以表达/传递 Contract Reset。
6. 071 为自举提前加入 production `contract-reset/ownerFactRefs/schema/fingerprint` 的 provisional mutation已从 cumulative candidate 撤销；073 不把该尝试当成当前正式能力。
7. D1 Proposal 必须冻结最终 Owner fact physical contract、applicability selection、schema compatibility、semantic identity 与 fail-closed semantics，并保持 One fact, one authority。
8. Reviewer 下一会话最终不应依赖 Owner 重复已经 Core-admitted 的 decision，是 D1 implementation 的 acceptance；在当前 baseline 修复完成前不得虚构该能力。
9. Windows Run publish EPERM 在 detached 真正创建路径未复现，保持 scope 外；不做 speculative persistence retry framework。
10. 当前正式 lineage 为 `071-explore → 072-review-explore changes-requested → 073-revise-explore`；073 完成后停止在对应 Explore review boundary，不创建 Proposal artifacts。
