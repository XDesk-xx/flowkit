# Explore — G1 sync / resume / single-action Agent Adapter

## 1. Problem

G1 要把 02/03 已经存在的确定性 Change/Delivery facts 变成一个**可从新进程、新 checkout 直接恢复**的执行入口，并提供一个**一次只执行一个已由 Policy 决定的 Change Action** 的薄 Agent Adapter。

当前 Base 已经具备 Change CLI、three-file Run、generic Change Verification、exact-candidate re-verification、OpenSpec archive、architecture assets 与 managed external tools；G1 不应重新实现这些 authority，也不能把 Agent Adapter 变成第二个 lifecycle engine。

本次 Explore 重点回答：

1. repository/formal facts 是否足以恢复当前 pending Action，而不依赖聊天或 provider session；
2. historical Run，尤其是 Apply/revise-apply 在 Verification retry + OpenSpec archive 后，是否仍能 deterministic replay；
3. 当前 Action preparation/resume seam 是否足以作为 provider-neutral single-action input；
4. OpenSpec structured execution context、Architecture refs/status、managed tool identity 是否能以派生 view 进入 resume/adapter，而不新增 durable truth；
5. 哪些能力必须留给 H1，而不能在 G1 扩 scope。

## 2. Current Facts

### 2.1 Canonical Base / activation

当前 detached Base：

```text
3f4063a3e58fb78b1652e7b29e7c3034a6d968f2
```

该 Git boundary 已正式包含 F1 `delivery-finalize-and-git-boundary` Change Checkpoint。

G1 激活前：

```text
active Change: none
doctor: ok / 0 findings
next:
  owner-decision
  activate-change
  eligible: G1 sync-resume-and-single-action-agent-adapter
```

Owner 已明确授权激活 G1。正式 activation result：

```text
changeId: sync-resume-and-single-action-agent-adapter
ownerDecisionRef:
owner:7a8908f8110029f599aefb88892296cf359d240d7263ecb779707a4d073e16ad
state: active
specDeltaMode: required
```

随后 Policy 唯一 next 为 `explore`，并 prepare：

```text
runId: 20260818-087-explore
role: author
ActionPackage schemaVersion: 2
semanticInputFingerprint:
73d8362ef5b9957ee05230115a629dd76072bbd2cde64666918ea1358df9c1ce
```

087 ActionPackage 不包含 provider/session identity；当前 Run 仍保持 three-file model。

### 2.2 G1 frozen product boundary

G1 只处理：

```text
repository/formal-fact resume
Architecture refs/status read
External tool readiness/identity read when needed
three-file + historical Run compatibility
verification.md + verification-history lineage read
single Change Action Agent Adapter
provider input/result admission boundary
```

G1 不处理：

```text
auto loop
auto Author/Reviewer alternation
Full Test adapter
Finalize adapter
Checkpoint adapter
architecture acceptance automation
stable Runner final release / H1 E2E acceptance
```

### 2.3 Existing reusable authorities / seams

当前代码已经有：

```text
prepareNewExecution
resumeRun
admitActionResult
runChangeOperator
```

它们已经拥有正确的 Policy / ActionPackage / exact pending Run / result admission 边界。

`prepareNewExecution(...)` 还能返回：

```text
openSpecContext?: OpenSpecPreparedActionContextView
```

其中包括当前单 Action 所需的 structured OpenSpec artifact/apply instructions。

但当前 `runChangeOperator()` 的 prepared/resumed CLI transport 只输出 `actionPackage`，没有输出该 `openSpecContext`；因此直接把现有 CLI stdout 当成稳定 Agent Adapter transport 会丢失已经存在的 OpenSpec execution view。

当前 `resume-context` 只投影 Delivery/Change/Run/review/verification/next 等状态，没有 Architecture refs/status 和 managed external-tool identity/readiness。

当前 repository 已存在：

```text
architecture/20260817-01-delivery-execution-loop/json/current.architecture.json
sha256 = da0f8b4f3ce26718f2b656af047b5117d86534fad867759c6cac57a4687302f6

architecture/20260817-01-delivery-execution-loop/json/planned.architecture.json
sha256 = 3cb3ee4a2dd5801c9d6f2de29bb0595026c6797b20d8142e9e99d4ecf79b2cbb
```

`actual.architecture.json` 当前正确地不存在；它必须等 H1 checkpoint 后 Delivery Ready → Owner Full Test PASS，再从真正 final repository 形成，不能由 G1 提前生成。

当前 managed external tools 可直接 deterministic resolve：

```text
OpenSpec 1.7.0
Archify 2.14.0
```

无需新增 Tool Registry。

## 3. Scope Boundary

### In scope

```text
1. repository-only structured resume projection
2. exact pending Run resume / fresh-process resume
3. current three-file Run + bounded historical Run read compatibility
4. historical terminal replay across exact-candidate Verification retry
5. historical terminal replay across OpenSpec archive relocation
6. Architecture refs/status 的 read-only derived projection
7. managed external-tool readiness/identity 的 read-only derived projection
8. single-action provider-neutral Agent Adapter input/output boundary
9. existing OpenSpecPreparedActionContextView 的 bounded transport/execution use
10. existing admitActionResult / Policy / Run machinery reuse
11. targeted regressions + Verification physical closure
```

### Out of scope

```text
1. stable dist/bin/flowkit.js final release（H1）
2. H1 Bootstrap end-to-end self-hosting fixture
3. 03 canonical Actual Architecture generation / Compare / acceptance
4. Delivery Full Test / Finalize / Checkpoint adapters
5. auto loop / while(next) / bounded auto-continue
6. automatic Author ↔ Reviewer alternation
7. provider / agent / skill registry
8. provider session / chat history persistence
9. second Policy / second lifecycle state machine
10. new Run sidecars / Evidence DB / replay ledger
11. automatic Git commit / push / merge
12. shared Verification timeout/granularity work（04 Engineering Health）
13. opportunistic large-file refactor unrelated to G1 required outcome
```

## 4. Risk Scan

| Risk | yes/no | Why |
|---|---|---|
| Scope expansion / missing prerequisite | yes | G1 容易被扩成 stable Runner、provider registry、auto-loop；必须只复用现有 lifecycle seams。 |
| Cross-time facts | yes | resume 跨 pending → terminal → Verification retry → archive → fresh checkout。 |
| Schema / persistence migration | yes | historical Runs/Verification lineage 必须继续读，但不应新增 durable state。 |
| Self-hosting / writer changes itself | yes | G1 修改将来 H1/下一 Delivery 使用的 resume/adapter 入口。 |
| Authority duplication | yes | Policy、OpenSpec、Verification、Git、Architecture、Reviewer facts 都已有 authority。 |
| Generic reusable subsystem | yes | Agent Adapter / resume 不能只对 G1 或本 Delivery 成立。 |
| Activation must persist across Change/Delivery boundaries | yes | H1 和下一 Delivery 是首批真实 next-consumers。 |
| Candidate/formal-fact mutation affects existing consumers | yes | run replay、resume-context、CLI、Verification readers 都是 direct consumers。 |
| Verification selection must reach actual executed targets | yes | G1 必须增加 real resume/adapter regression 并进入正式 physical resolver。 |
| External tool performs real mutation | no | G1 只读取 managed tool identity/readiness；不新增 external mutation lifecycle。 |
| Change claims performance improvement | no | G1 不以降低 latency/subprocess 为 required outcome；只记录不形成 corpus explosion。 |

## 5. Applicable Proofs

### Proof A — Prerequisite / activation boundary

**Question:** 当前是否已经合法进入 G1，且 G1 prerequisites 已完成？

**Acceptance Boundary:** F1 checkpoint 已成为 Git formal fact；Policy 唯一允许 Owner 激活 G1；激活后唯一 next 为 `explore`。

**Method:** 在 exact Base 上读取 Git HEAD、Flowkit status/next/doctor；按 Owner 明确授权执行 `activate`；再次读取 status/next/doctor；prepare 087。

**Evidence:**

```text
HEAD = 3f4063a3e58fb78b1652e7b29e7c3034a6d968f2
pre-activation doctor = ok / 0 findings
pre-activation next = owner-decision activate-change G1
activation ownerDecisionRef = owner:7a8908f8...
post-activation next = explore
087 = one pending Author explore Run
```

**Evidence Boundary:** 当前 G1 activation + Explore entry。

**Gap:** none。

**Result:** PASS

**Implication:** G1 可以正式 Explore；不需要重新打开 F1 或创建 corrective Change。

---

### Proof B — Fresh-process / fresh-checkout exact pending resume

**Question:** 当前 pending Action 能否只依赖 repository/formal facts 恢复，而不依赖聊天/provider session？

**Acceptance Boundary:** fresh process 与 fresh checkout 都能找到同一 pending 087；重复入口不创建新 NNN/Run。

**Method:**

1. 对当前 candidate 执行 `resume-context`；
2. 在独立进程再次执行 `flowkit explore`；
3. 将同一 candidate 固化到 disposable proof repo，再 fresh clone；
4. 在 clone 中执行 `resume-context` 与 `flowkit explore`；
5. 检查 Run directory 数量和 runId。

**Evidence:** 两种环境均得到：

```text
pending-run = 20260818-087-explore
pending-action = explore
pending-role = author
pending-resume = resumable
```

再次进入 `explore`：

```text
mode = resumed
runId = 20260818-087-explore
```

没有生成 088，也没有读取聊天/provider session。

**Evidence Boundary:** exact pending Run 的 fresh-process + fresh-checkout resume。

**Gap:** terminal historical replay 另见 Proof C。

**Result:** PASS

**Implication:** repository facts 已足以承载当前 pending identity；G1 不需要 chat/session persistence。

---

### Proof C — Verification retry/history + OpenSpec archive terminal replay

**Question:** 历史 Apply/revise-apply terminal Run 在其 Verification 被 exact-candidate retry supersede、随后 OpenSpec archive relocation 后，是否还能 deterministic replay？

**Acceptance Boundary:** historical immutable terminal result 可被 fresh resume 读取；current Verification authority 可 supersede old terminal binding；archive relocation 不改变历史 logical authority identity；corrupt/ambiguous lineage 必须 fail closed。

**Method:** 对已完成并 checkpoint 的 F1 历史执行 exact terminal replay，并与普通 archived review Run 作 control；再在 disposable copy 中恢复旧 active path，区分“archive relocation”与“reverification supersession”两个维度。

**Evidence:**

F1 084 immutable terminal binding：

```text
logicalRef = openspec/changes/delivery-finalize-and-git-boundary/verification.md
versionFingerprint = d40f87937df88d65ffb5e22bc9a9afc72c61ef9e630092c636894f4df1af56d9
selectionFingerprint = bb176d063b404942467dff735c7ce3b916347872cb3668ece8c5d4000a40af90
status = failed
```

当前 authority 已随 OpenSpec archive 位于：

```text
openspec/changes/archive/2026-08-18-delivery-finalize-and-git-boundary/verification.md
```

其当前状态：

```text
status = passed
reverificationOfRunId = 20260818-084-revise-apply
originApplyVerificationFingerprint = d40f8793...
previousVerificationFingerprint = e3e2e951...
```

历史目录保留：

```text
verification-history/d40f8793....md
verification-history/e3e2e951....md
```

且文件 SHA256 与 fingerprint 精确一致。

当前 exact Base 上：

```text
resumeRun(expectedRunId = 20260818-084-revise-apply)
→ TERMINAL_REPLAY_CONFLICT
→ current verification binding target is unavailable
→ ENOENT on old active logical path
```

control：

```text
resumeRun(20260818-085-review-apply)
→ already-terminal
→ PASS
```

在 disposable copy 把 archived F1 bytes 映回旧 active directory 后，084 仍失败：

```text
TERMINAL_REPLAY_CONFLICT
→ current verification binding fingerprint does not match persisted verification.md
```

所以这是两个独立缺口：

```text
A. physical archive relocation
B. current verification superseded immutable terminal binding
```

现有 `validateCurrentReverificationChain(...)` 对相同 origin Run / candidate / selection 的 retry lineage 做 bounded validation；在 disposable proof 中对 084 origin binding + 当前 PASS publication 验证成功。

现有 `readActiveOrArchivedChangeFile(...)` 已证明项目内存在 bounded active-or-unique-archive relocation reader，不需要新 archive database。

**Evidence Boundary:** exact historical 084 + current retry lineage + OpenSpec archived physical layout。

**Gap:** 当前 `validateCurrentVerificationTerminalBinding()` 尚未组合这两个已有能力，所以 current implementation FAIL。

**Result:** FAIL（current product） / PASS（bounded feasibility）

**Implication:** G1 必须修 terminal replay semantics，但不能改写 084 immutable result，也不能把 archive physical path变成新的历史 logical authority。Proposal 应冻结：

```text
logical authority identity
≠
current physical storage location
```

并复用 bounded reverification-chain validation。

---

### Proof D — Single-action Adapter composition / OpenSpec context transport

**Question:** 是否可以在不建立第二 Policy/loop 的情况下，组合现有 execution service 形成 provider-neutral single-action Agent Adapter？

**Acceptance Boundary:** 一个 adapter invocation 只消费一个已决定 Action、执行一次 provider、最多 admit 当前一个 result，然后 return control；不能决定 next/role/Owner/Reviewer authority。

**Method:** static consumer scan + current 087 real prepare/resume observation。

**Evidence:** 当前已有：

```text
prepareNewExecution
resumeRun
admitActionResult
runChangeOperator
```

`prepareNewExecution` 的返回值已经包含：

```text
ActionPackage
+
openSpecContext?: OpenSpecPreparedActionContextView
```

而 `runChangeOperator` 已保持：

```text
prepare one action
or exact-resume one action
or admit one current result
→ return
```

087 实际重复进入 `explore` 只 resume 087，没有自动 prepare Review/Proposal。

ActionPackage 本身没有 provider/session identity。

但当前 CLI prepared/resumed JSON 只暴露 `actionPackage`，**丢弃 `openSpecContext`**。因此：

```text
“直接把现有 CLI stdout 交给 provider”
```

不足以成为稳定 Agent Adapter，因为 OpenSpec 已有 structured artifact/apply instructions 不能由 provider 重新猜。

**Evidence Boundary:** one current action preparation/resume + existing OpenSpec structured execution view seam。

**Gap:** G1 需要冻结 stable provider execution view / transport，但不需要重做 Policy 或 OpenSpec adapter。

**Result:** PASS（composition feasible，transport gap identified）

**Implication:** 推荐 G1 Adapter 组合：

```text
Policy/current facts
→ prepare or exact-resume existing ActionPackage
→ attach bounded derived OpenSpec execution view
→ invoke exactly one provider/command executor
→ normalize one LogicalActionResult
→ existing admitActionResult
→ return control
```

禁止：

```text
adapter calls next to choose another action
after admission auto-prepare next action
while(next)
auto role switching
provider/session durable registry
```

---

### Proof E — Architecture / external-tool resume projection without duplicate authority

**Question:** G1 能否把 Architecture refs/status 与 managed tool readiness/identity 带入 resume，而不新增 durable truth？

**Acceptance Boundary:** view 来自 repository assets + existing managed-tool resolver；缺失/不适用可明确表达；G1 不生成 Actual、不接受 architecture。

**Method:** inspect exact repository architecture assets 与 managed tool resolver result；对 current `resume-context` 做字段差距扫描。

**Evidence:** exact Base 当前有：

```text
Current Architecture JSON → present + fingerprinted
Planned Architecture JSON → present + fingerprinted
Actual Architecture JSON → absent（当前生命周期正确）
```

managed tool resolver 可确定性返回：

```text
OpenSpec 1.7.0
Archify 2.14.0
```

现有 `resume-context` 没有 architecture/tool projection。

这些 facts 已分别由 repository Architecture assets 与 managed External Tool Runtime 拥有；G1 只需 read/derive，不应持久化第二份 refs/readiness truth。

**Evidence Boundary:** 当前 03 repository + managed local environment。

**Gap:** typed shared resume view 尚未包含这些 derived dimensions。

**Result:** PASS

**Implication:** G1 可以扩充一个 non-persistent structured resume projection；H1 再消费它做 stable Runner/self-hosting。G1 不生成 `actual.architecture.json`。

---

### Proof F — Future-Delivery genericity / activation persistence / single-action consumer

**Question:** G1 prospective resume/Adapter semantics 是否能在正式 activation 后跨 G1 checkpoint、H1、fresh checkout 与不同 next Delivery consumer 持续成立，而不是只对 03/G1 本身成立？

**Acceptance Boundary:**

```text
G1 detached candidate
→ 不自激活
→ canonical materialization + G1 Change Checkpoint
→ H1 same-Delivery consumer
→ 03 Delivery Final / merge
→ fresh checkout
→ different future deliveryId/changeId consumer
```

future consumer 必须只依赖 repository/formal facts 恢复同一个 pending Action，并重建同一个 bounded provider execution view；一次 provider invocation 只能处理该一个 Policy-decided Action，admit 后 return control，不得 auto-prepare next。

**Formal activation boundary:** G1 新 resume/Adapter semantics **不得在当前 detached 087/089 generation 中途 self-upgrade**。它们只有在 G1 approved/archive 后被 canonical Executor exact materialize，并形成正式 **G1 Change Checkpoint** 后，才成为 03 branch 上后续 consumer 的 repository implementation。当前 Delivery Manifest 又明确：

```text
H1 dependsOn:
  - sync-resume-and-single-action-agent-adapter
```

因此 H1 不可能在 G1 checkpoint 之前合法成为 next active Change；03 Final/merge 之后，next Delivery 的 fresh checkout 消费的是已经包含 G1 checkpoint implementation 的 repository bytes，而不是当前 detached candidate/session。

**Method:** 建立一个 disposable **future-Delivery-shaped repository**，使用当前正式 execution seams 做最小 provider-view prototype；fixture 的 IDs 与 03/G1 完全不同：

```text
deliveryId = 20991231-01-future-self-host
changeId   = future-resume-adapter-proof
```

步骤：

1. 在 disposable repo 中写入该 future Delivery/Change formal facts，并启用 source-controlled OpenSpec thin-integration fact；
2. `prepareNewExecution` prepare 一个 `explore`，确认 current `ActionPackageV2 + OpenSpecPreparedActionContextView` 都绑定 future IDs；
3. 把 pending Run 提交成 durable Git checkout；
4. fresh `git clone`，新进程中再次调用 `prepareNewExecution`，必须返回 `exact-resume-required` 且指向原 runId；
5. `resumeRun` 只读取 persisted Run identity，恢复同一个 pending `ActionPackageV2`；
6. 通过现有 `buildOpenSpecPreparedActionContext` 从 fresh checkout/formal facts 重建 bounded OpenSpec execution context；
7. 形成 disposable provider view `{ actionPackage, openSpecContext }`，模拟 **exactly one** provider invocation；
8. provider 只产出当前 `explore.md`，随后调用 existing `admitActionResult`；
9. admission 后只读取 Policy，确认 next=`review-explore`，并检查 Run corpus **没有生成第二个 Run**。

**Evidence:** 初始 prepare：

```text
phase = prepare
runId = 20991231-001-explore
action = explore
deliveryId = 20991231-01-future-self-host
changeId = future-resume-adapter-proof
openSpecChangeId = future-resume-adapter-proof
semanticInputFingerprint = 1ab2af5fb57949e41dae97cbc6c6b58771b4c45c8d185d7809334b7fe5494c69
```

pending fact 被 commit 后 fresh clone，新进程 consumer：

```text
phase = fresh-checkout-consume
runId = 20991231-001-explore
deliveryId = 20991231-01-future-self-host
changeId = future-resume-adapter-proof
resumedAction = explore
openSpecChangeId = future-resume-adapter-proof
providerInvocations = 1
runCountAfterAdmission = 1
pendingAfterAdmission = 0
nextKind = action
nextAction = review-explore
```

关键反事实：fixture 中没有 `20260817-01-delivery-execution-loop`、G1、087/089 或当前 Base SHA 作为 execution identity；切换 deliveryId/changeId 与 checkout/process 后仍恢复同一个 persisted Run，并从 repository OpenSpec facts 重建对应 future Change execution context。

**Evidence Boundary:** different deliveryId/changeId + durable Git commit + fresh clone/process + one provider invocation + result admission + post-admission Policy boundary。结合正式 dependency/activation boundary，覆盖：

```text
G1 checkpoint
→ H1 same-Delivery consumer
→ 03 Final/merge
→ next Delivery-shaped fresh checkout consumer
```

**Gap:** G1 Apply 仍需把该 disposable proof 固化成 repository regression，并让正式 Verification physical resolver实际执行；但“跨 Delivery feasibility / activation persistence”不再留到 Proposal 才证明。

**Result:** PASS

**Implication:** G1 可以冻结 repository-global、ID-generic 的 single-action resume/provider view；不需要 Delivery-specific migration table、Provider/Agent Registry、auto-loop 或 H1 stable Runner implementation。

---

### Proof G — Historical E1 sidecar compatibility / no current-Catalog reinterpretation

**Question:** G1 prospective structured resume projection 能否实际读取 historical E1 sidecar generation，并保证 persisted historical selection/evidence 的意义不受 future/current Verification Catalog 变化影响？

**Acceptance Boundary:** H1/fresh checkout 读取 historical corpus 时：

```text
historical context.json
+ result.json
+ verification-selection.json
+ verification-evidence.json
→ point-in-time persisted authority
```

必须可 terminal replay；current Catalog/module map 不得成为历史 selection/evidence 的重新解释 authority。

**Method:** 使用 repository 现存真实 fixture：

```text
tests/fixtures/e2-change-verification-generalization/historical-e1/127/
```

将四个 persisted files 原样放入其真实 logical Run path：

```text
.flowkit/runs/20260810-01-change-execution-loop/
  change-verification-selection-and-change-set/
  20260814-127-revise-apply/
```

然后：

1. 在 fresh repository/process 中读取并 validate `verification-selection.json`、`verification-evidence.json`；
2. 通过 `resumeRun(expectedRunId=20260814-127-revise-apply)` 实际消费 legacy v5 context/result + sidecars；
3. baseline 记录 persisted historical `moduleMapFingerprint` 与 current Catalog fingerprint 不同，但 replay 仍 `already-terminal`；
4. fresh clone 后，**只修改 current `VERIFICATION_MODULE_MAP` interpretation input**（将一个 current ownership selector替换为 counterfactual selector），不修改任何 historical sidecar/context/result bytes；
5. 重新 fresh-process terminal replay，并确认 current Catalog fingerprint 再次变化，但 historical selection fingerprint、sidecar fingerprint、evidence binding、terminal result均保持不变并通过。

**Evidence — baseline:**

```text
runId = 20260814-127-revise-apply
replayKind = already-terminal
replayStatus = completed
persistedSelectionFingerprint = 7355b94e58df0f17e3288c9b5aa81d98d7a485bd41f27fbdc93019341222582b
persistedModuleMapFingerprint = 9d74a948fa1e13ec290c766b3c383f58f6cd058ac29ad7031af2851ba81b2797
currentCatalogFingerprint = b6afe64c1585eacad288f1bd5d451ab5c13d554ea06d11c9b0c23b8f7805580f
selectionSidecarFingerprint = b3d7b9777818174bd672a2684794de6eb683a7fd816261ebab9e1e66b566ac15
evidenceSelectionFingerprint = 7355b94e58df0f17e3288c9b5aa81d98d7a485bd41f27fbdc93019341222582b
```

**Evidence — current-Catalog counterfactual fresh clone:**

```text
currentCatalogFingerprint = 4833e40e06b25b4e4e7c575155c78ed9b57fa0fcbeb406f9568785e257dadf45
persistedModuleMapFingerprint = 9d74a948fa1e13ec290c766b3c383f58f6cd058ac29ad7031af2851ba81b2797
persistedSelectionFingerprint = 7355b94e58df0f17e3288c9b5aa81d98d7a485bd41f27fbdc93019341222582b
selectionSidecarFingerprint = b3d7b9777818174bd672a2684794de6eb683a7fd816261ebab9e1e66b566ac15
evidenceSelectionFingerprint = 7355b94e58df0f17e3288c9b5aa81d98d7a485bd41f27fbdc93019341222582b
replayKind = already-terminal
replayStatus = completed
```

current Catalog fingerprint 从 `b6afe64c...` 改为 `4833e40e...`，但 historical persisted selection/evidence 与 terminal replay 完全不变。这验证当前 bounded historical readers 使用 persisted point-in-time authority，而不是调用 current Catalog 重算历史 selection。

**Evidence Boundary:** historical E1 legacy v5 sidecar generation + fresh repository/process + current-Catalog counterfactual，覆盖 H1 fresh-checkout 读取 historical Run corpus 所需 compatibility boundary。

**Gap:** Proof C 发现的 **current post-E2 F1 084 re-verification + OpenSpec archive replay** 仍是 G1 必须修的独立 current-product gap；Proof G 不把 historical E1 迁移成新 sidecar，也不需要 archive DB / Verification ledger。

**Result:** PASS

**Implication:** Proposal 可以明确复用两条不同但兼容的 bounded path：

```text
historical E1 sidecars
→ persisted selection/evidence validators
→ never reinterpret against current Catalog

current post-E2 three-file Apply
→ current verification.md + verification-history lineage
→ archive/reverification-aware replay repair（Proof C）
```

不得把二者合并成历史 rewrite 或通用 migration/version framework。


## 5.1 088 Review Finding Closure

### G1-RE-001 — closed by Proof F

```text
blockingAuthority = author
required outcome = future-Delivery-shaped feasibility + activation persistence proof
```

关闭证据：different `deliveryId/changeId` disposable repo、durable pending commit、fresh clone/process、same run exact resume、OpenSpec context rebuild、exactly one provider invocation、admit 后 no second Run / next=`review-explore`；并明确 prospective semantics 只在 G1 canonical Checkpoint 后 activation，H1 dependency 保证 same-Delivery consumer不会早于该边界。

### G1-RE-002 — closed by Proof G

```text
blockingAuthority = author
required outcome = historical E1 sidecar read + no-current-Catalog reinterpretation proof
```

关闭证据：historical E1 `127` legacy context/result/selection/evidence 四文件在 fresh process 中实际 terminal replay；fresh clone 后改变 current Verification Catalog fingerprint，historical persisted selection/evidence fingerprints 与 replay result仍不变。

两项 revise 均只修改 Explore evidence/结论；没有 production/test mutation，没有创建 Registry/ledger/migration DB，也没有实现 H1 stable Runner。

## 6. Rejected Approaches

### 6.1 把现有 CLI stdout 直接当稳定 provider contract

拒绝。当前 CLI 不携带 `OpenSpecPreparedActionContextView`，会丢失 structured OpenSpec execution instructions。

### 6.2 为 Agent 保存 provider session / chat memory

拒绝。Fresh checkout proof 已证明 pending identity 可只依赖 repository facts；session/chat 不是 authority。

### 6.3 Adapter 自己调用 `next` 并自动继续

拒绝。这会让 Adapter 成为第二 Policy / orchestration loop，违反 single-action invariant。

### 6.4 Verification retry 后改写历史 Apply result

拒绝。084 terminal binding 是 immutable point-in-time fact；合法 current Verification supersession 应通过 lineage reader解释，而不是历史 rewrite。

### 6.5 OpenSpec archive 后重写 Verification lineage logical refs

拒绝。Archive 是 physical relocation；历史 logical authority identity 不应随存储路径改写。

### 6.6 新建 archive relocation DB / verification ledger

拒绝。现有 active-or-unique-archive reader + Verification history 已提供足够事实；新增 durable truth 会重复 authority。

### 6.7 G1 生成 03 Actual Architecture

拒绝。G1 只读 Architecture refs/status。真正 03 Actual 必须在 H1 完成并 checkpoint、Delivery Full Test PASS 后从 final repository 形成。

### 6.8 借 G1 顺手拆分 `b1-run-execution-service.ts`

拒绝。文件结构 hotspot 是 04 Engineering Health 输入；除非 G1 required outcome 无法 bounded 修改，否则不得扩大当前 Change。

## 7. Feasible Proposal Boundary

本次 revise-explore 已关闭 088 的两个 author-owned proof gap；Evidence Boundary 已覆盖 future Delivery-shaped consumer 与 historical E1 sidecar/Catalog-independence，因此 G1 可进入 Proposal。Proposal 必须至少冻结以下四个 bounded outcome。

### A. Structured repository resume projection

建立一个**非持久化、typed、derived** resume view，统一消费现有 formal facts，至少表达：

```text
Delivery / active Change / stage
exact pending Run identity + role/action/resumability
review / Verification status
Policy next boundary
Architecture current/planned/actual status + versioned ref/fingerprint when present
managed OpenSpec / Archify readiness + exact supported identity when relevant
```

原则：

```text
projection reads authority
≠ projection becomes authority
```

现有人类 `resume-context` 与 Agent Adapter/H1 stable Runner 应尽量消费同一 underlying typed projection，而不是各自重新解释 repository。

### B. Historical Verification terminal replay closure

修正 `validateCurrentVerificationTerminalBinding` 所代表的语义，使历史 Apply/revise-apply terminal replay同时支持：

```text
1. current verification exact-match terminal binding
or
2. current verification is a valid bounded same-origin exact-candidate re-verification chain
```

并支持 current Verification bytes 处于：

```text
active OpenSpec Change root
or
unique matching archived Change root
```

必须保持：

```text
historical terminal binding immutable
historical logical verification refs immutable
current verification.md = current Verification authority
verification-history = immutable predecessor bytes
same origin Run / candidate / selection required
archive ambiguity / missing / corrupt / cycle → fail closed
```

不要引入 archive DB、migration ledger 或历史 result rewrite。

Historical E1 sidecar compatibility 继续走 persisted point-in-time reader；不得把 current Catalog/module map 作为 historical selection/evidence 的解释 authority（Proof G）。

### C. Single-action Agent Adapter

Adapter 必须组合既有 core：

```text
prepareNewExecution / exact resume
→ provider execution view
→ exactly one provider invocation
→ one LogicalActionResult
→ existing admitActionResult
→ return control
```

provider execution view 至少必须保留：

```text
ActionPackage
+
bounded OpenSpecPreparedActionContextView / equivalent derived execution context
```

Adapter 不得决定：

```text
Delivery / Change / action / role / next
Owner decision
Reviewer verdict
Full Test / Finalize / Checkpoint
architecture acceptance
```

不得 auto-prepare 后续 Action。

### D. Verification / regression closure

Proposal 必须冻结 targeted regressions，至少覆盖：

```text
fresh process pending resume
fresh checkout pending resume
no duplicate NNN on exact resume
historical F1 084 re-verification + archive terminal replay
corrupt/missing/ambiguous archive/lineage fail closed
current three-file Run + bounded historical compatibility
resume architecture statuses/refs read-only projection
managed OpenSpec/Archify identity/readiness projection
provider receives OpenSpec structured execution context
one adapter invocation = one Action only
result uses existing admission
Owner/Reviewer authority cannot be synthesized
future/different Delivery-shaped fixture（复用 Proof F 的 different deliveryId/changeId + fresh checkout boundary）
```

并证明这些测试由 G1 Change Verification selection 的 physical target resolver 实际执行。

## 8. Open Decisions for Proposal

以下细节可以由 Proposal 在上述边界内冻结，不需要新的 Owner scope decision：

1. typed resume projection 的具体 module/type/CLI JSON shape；
2. archive-aware Verification resolver 是扩展现有 helper，还是新增一个 bounded reader；
3. `validateCurrentReverificationChain` 如何分离**logical authority base**与**physical archived storage path**，以保留 pre-archive lineage refs；
4. Agent Adapter 的最小 public service/CLI 命令名和 provider invocation seam；
5. exact resume 时 derived OpenSpec execution view 的返回方式，前提是不新增 Run sidecar/durable duplicate truth；
6. G1 targeted tests 的 physical ownership mapping。

以下不是 Proposal 可自行新增的 scope：

```text
auto loop
provider registry
stable H1 runner release
Full Test / Finalize / Checkpoint adapter
Actual Architecture generation
Git automation
04 Engineering Health timeout/refactor work
```

## 9. Explore Conclusion

G1 **feasible**，且 088 提出的两个 Explore blocker 已由实际 proof 关闭，当前 Evidence Boundary 足以进入 Proposal。

关键结论有三条：

1. 当前 Base 已能 fresh-resume pending Run，但 current post-E2 historical Apply/revise-apply terminal replay 在 **Verification retry supersession + OpenSpec archive relocation** 后会失败；这是 G1 frozen acceptance“Verification retry/history survives resume”的真实实现缺口，必须在 G1 关闭。
2. different future Delivery-shaped disposable fixture 已证明 `ActionPackage + OpenSpec structured context + exactly-one provider invocation + existing admission + return control` 可跨 durable checkout/fresh process 成立；prospective G1 semantics 只在 G1 canonical checkpoint 后激活，当前 detached Change 不 self-upgrade。
3. historical E1 `127` sidecar generation 已在 fresh process 中成功 terminal replay；即使 current Verification Catalog 被反事实修改，persisted historical selection/evidence 的 identity/meaning仍保持不变，因此 no-current-Catalog reinterpretation compatibility boundary 已证明可行。

建议 Proposal 主线保持：

```text
repository-only resume projection
+
archive/reverification-aware historical replay
+
provider-neutral single-action Agent Adapter
```

而不是：

```text
new lifecycle
new Registry
auto Agent loop
H1 stable Runner
```

到此 STOP，等待 Reviewer re-review `revise-explore`；不进入 Proposal。
