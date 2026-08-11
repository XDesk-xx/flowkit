## Context

031→034 Explore/Review 已证明：现有 Core 的 Run persistence/ResultRef/Reader 并不需要重写，真正缺口是“正确 primitive 没被组合成唯一安全 execution surface”。`createRun()` 当前可被直接调用并绕过 Delivery-wide Run-ID 与 Action→Role；pending diagnostics能看见 Run，却没有 deterministic prepare/resume contract；`completeRun()` 已拥有强 terminal/ResultRef authority，却缺 adapter-facing logical admission。另有一个 bounded Windows CRLF Manifest writer defect，以及 Action Package/Full Test/C1 ownership的 canonical drift。

B1 必须保持 One Policy / One Fact One Authority / Lean Run。Run仍只是 Change Action execution envelope，不成为 OpenSpec、Git、Verification、Reviewer或Owner authority。

## Goals / Non-Goals

**Goals**

- 把现有 allocator、createRun、Policy、Reader、completeRun组合成一个唯一安全的 Change Action execution preparation/admission contract。
- 机器化固定 Action→Role/goal/mutation/result definition，但不建立 Registry。
- 允许 deterministic pending resume，拒绝 semantic input drift下的第二个 pending Run。
- 生成 provider-neutral logical Action Package；terminal result继续由 Core派生 ResultRefs。
- 修复 Windows CRLF working-tree Manifest mutation compatibility，并 canonical write LF。
- 明确 B1 logical Action Package与后置 OpenSpec/Agent transport ownership。

**Non-Goals**

- 不实现 C1 OpenSpec 1.7 structured adapter、D1 Finding convergence、E1 actualChangeSet/verificationScope、F1 checkpoint helper、G1 full Change CLI/E2E、03 Full Test/Finalize/stable Agent Adapter。
- 不建立 Runner loop、Registry/Router、Provider/Agent/Skill Registry、Evidence/Receipt、artifact store、transaction log、session store或自动 Author/Reviewer循环。
- 不把 ZIP transport、ChatGPT/Codex prompt或 provider schema当成 Action Package authority。
- 不运行 Delivery Full Test，不自动 Commit/Push/Checkpoint。

## Decisions

### 1. 固定 compile-time ActionDefinition catalog，不使用 Registry

B1 定义十个且仅十个 Standard Change Action definitions。每个 definition固定以下 normative fields：

```text
action
role
goalClass
mutationClass
outputClass
terminalContract
```

完整 mapping：

| Action | Role | goalClass | mutationClass | outputClass | terminalContract |
|---|---|---|---|---|---|
| `explore` | author | `investigate-change` | `explore-planning-only` | `current-explore-artifact-set` | completed 必须有 executionStatus+summary；Core 派生完整 current `explore.md` produced ref |
| `review-explore` | reviewer | `judge-explore` | `reviewer-result-only` | `review-verdict-findings` | completed 必须有 verdict；Core exact-bind reviewed Run；不得修改 target |
| `revise-explore` | author | `close-explore-author-findings` | `explore-planning-revision-only` | `current-explore-artifact-set` | completed 必须有 executionStatus+summary；Core 派生 current explore ref并绑定 source review |
| `propose` | author | `freeze-change-contract` | `proposal-bundle-only` | `current-proposal-bundle-set` | completed 必须有 executionStatus+summary；Core 派生 proposal/design/tasks/all delta specs完整 ref set |
| `review-propose` | reviewer | `judge-proposal` | `reviewer-result-only` | `review-verdict-findings` | completed 必须有 verdict；Core exact-bind reviewed Run；不得修改 Proposal target |
| `revise-propose` | author | `close-proposal-author-findings` | `proposal-bundle-revision-only` | `current-proposal-bundle-set` | completed 必须有 executionStatus+summary；Core 派生完整 Proposal bundle refs并绑定 source review |
| `apply` | author | `implement-approved-contract` | `approved-implementation-and-verification` | `implementation-candidate-and-authority-files` | completed 必须有 executionStatus+summary并保留 approved-review entry binding；caller不得声明 ResultRef subset |
| `review-apply` | reviewer | `judge-implementation-and-verification` | `reviewer-result-only` | `review-verdict-findings-plus-verification-ref` | completed 必须有 verdict；Core exact-bind reviewed Run并派生 `verificationSummaryRef` |
| `revise-apply` | author | `close-apply-author-findings` | `implementation-and-verification-revision` | `revised-implementation-candidate` | completed 必须有 executionStatus+summary并绑定 source review；caller不得声明 ResultRef |
| `archive` | author | `close-change` | `openspec-archive-and-change-completion` | `archive-operation-and-completed-state` | completed 必须有 executionStatus+summary；只记录 archive/Change completion结果；Git Checkpoint不成为 Action output |

边界解释：

- `*-only` 是 Action mutation ceiling，不是路径硬编码；OpenSpec/C1后续可提供 structured paths，但不能扩大对应 Action 的语义权限。
- `apply/revise-apply` 的具体 allowed path仍由 approved Proposal/Review/Verification contract决定，catalog只冻结它们属于 implementation/verification mutation class，而不是允许任意 repo mutation。
- Reviewer definitions 永远 `reviewer-result-only`，Reviewer不得修改 Author target。
- `archive` 可以完成 OpenSpec archive + Change state transition，但 Checkpoint仍是 Git boundary、不是 terminal Action output。
- failed/cancelled terminal继续遵守现有 minimal failure/cancellation contract，不要求 completed-only fields。

Definition由静态对象/readonly map表达；不得运行时注册、动态发现或让 adapter覆盖。Owner authority继续通过 Manifest provenance/Policy gate进入，不创建 Owner Standard Run。

### 2. `RunExecutionService` 是唯一高层 preparation/admission surface，并只允许两个 Policy-owned entry intent

Apply 可选择等价文件/函数名，但 service的 public preparation intent必须限定为：

```text
prepare({ entry: "next" })
prepare({ entry: "review" })
```

不得接受 caller直接指定任意 `action=review-propose/apply/...`。

**Normal entry — `next`**

```text
fresh FormalFactSnapshot
→ shared next(snapshot)
→ result.kind == action 且 action属于十个 Standard Change Actions
→ resolve ActionDefinition
→ pending resume OR allocate/create new pending
```

若 `next()` 返回 owner-decision / blocked / done / delivery behavior，则本入口 MUST返回对应非-Run边界，MUST NOT创建 Run。

**Explicit review entry — `review`**

```text
fresh FormalFactSnapshot
→ shared resolveReview(snapshot)
   （内部继续复用 canRun(review-S) / stage detection）
→ only when Policy returns concrete review-S
→ resolve Reviewer ActionDefinition
→ matching pending review resume OR allocate/create new Reviewer generation
```

这是 Q1 direct re-review 的唯一 bounded exception：matching `changes-requested` 含 non-author blocker时，`next()` MUST继续 blocked，但 explicit `review`可由 shared Policy合法解析 same-stage `review-S`。Service：

- MUST NOT把 blocked `next()`改写成自动 review；
- MUST NOT要求 caller传具体 `review-S`；
- MUST NOT复制 blockingAuthority/Stage legality逻辑；
- MUST NOT允许 explicit `propose/apply/revise/archive` 等其它 caller-selected Action；
- no matching pending review时创建新的 Reviewer generation/NNN；matching pending review且semantic identity相同时仍resume同一 runId。

两类入口一旦由 Policy解析出 Action，都进入同一 preparation pipeline：

```text
resolve fixed ActionDefinition
→ derive semantic descriptor/fingerprint
→ resume exact matching pending
   OR
→ allocateNextRunId
→ createRun
→ build logical Action Package
```

CLI/adapter只能调用该 surface，不得复制 NNN、role、pending、input binding、terminal persistence或 direct re-review legality规则。

`createRun()`仍可作为 persistence primitive/测试 seam存在，但不是 public execution authority；同时必须做 defense-in-depth candidate validation，使内部误用也不能创建 malformed/non-monotonic/duplicate NNN或 Action→Role mismatch。

### 3. pending Run 本身就是 execution instance；semantic fingerprint覆盖所有 package semantic authority identity

B1 不引入 `sessionId`、provider conversation id 或随机 execution token。

`context.json`增加 compact `semanticInputFingerprint`（名称可等价），由 Core 对 canonical execution identity descriptor做 SHA-256。Descriptor MUST使用 stable ordering/canonical serialization，并至少包含：

```text
schema / descriptor version
deliveryId
changeId
resolved action
ActionDefinition identity/version
  - role
  - goalClass
  - mutationClass
  - outputClass
  - terminalContract

contractRefs[]
  - each exact { ref, kind, versionFingerprint }
  - canonical sort by ref/kind/versionFingerprint

handoffRefs[]
latest relevant Review authority identity
latest relevant Verification authority identity/status
applicable Owner authorization refs
其它会改变 logical package allowed work / required result / execution prerequisite 的 authority identity
```

**Inclusion rule**

任何 logical Action Package字段，只要它的变化会改变：

```text
允许执行什么 mutation
必须产出什么 result
当前 contract generation
当前执行 prerequisite / blocker context
```

且不能完全由descriptor中已经纳入的versioned authority ref确定，就 MUST把该字段或其主要authority identity纳入descriptor。

因此 `contractRefs` 是强制 identity input：任一 contract ref新增/删除、`ref/kind/versionFingerprint`变化，都 MUST改变 fingerprint，pending Run不得继续以旧 input resume。

**Safe exclusion**

以下 MUST排除：

```text
provider/chat/session identity
human-readable summary/copy
可完全由已纳入versioned ref确定的重复最小view
package serialization/field order
performance timing/size observation
完整 OpenSpec/Verification/Git正文
stdout/log
Git history
completed Run corpus
```

Fingerprint不是整个 Action Package hash，也不复制专业 authority正文。

prepare规则：

```text
exactly one current pending Run
+ same resolved action/role
+ stored fingerprint == freshly derived fingerprint
→ resume same runId

pending exists
+ fingerprint/action/role mismatch
→ fail closed: pending-input-drift
→ 不创建第二个 pending Run

no pending Run
+ selected Policy entry allows Action
→ allocate new Delivery-wide NNN
→ create pending Run
```

这样“same execution instance”由当前 pending runId本身表达，而 semantic input证明它仍绑定同一 contract generation。

### 4. New Run instance只由 lifecycle/execution generation变化触发

新 Run必须重新分配 NNN，当且仅当当前没有可resume pending Run且：

```text
new formal Action
failed/cancelled terminal retry
explicit new Reviewer execution
real author-actionable revise Action
```

普通换聊天/换工具/重新打开 repo/普通 Commit不会创建新 Run。Checkpoint不消耗/重置 NNN。

### 5. logical Action Package 是当前 Action 的最小可执行 view

建议 provider-neutral shape：

```text
schemaVersion
run: deliveryId/changeId/runId/action/role/semanticInputFingerprint
definition: goalClass/mutationBoundary/terminalContract
contractRefs[]
handoffRefs[]
reviewView?  # latest relevant reviewer truth minimal view + review result ref
ownerAuthorizationRefs[]
verificationView?  # requirement/plan ref/status needed for current Action
requiredResultContract
```

其中 `reviewView`只复制当前 Action执行必需的 finding id/severity/blockingAuthority/requiredOutcome/acceptance等最小字段，并保留 Reviewer result ref；它不是第二 Reviewer authority。OpenSpec、Verification、Git等以 path/ref/fingerprint或已有 formal projection引用，不复制全文历史。

Action Package不得包含：

```text
completed Change Run corpus
all historical logs
provider transcript
Git history copy
OpenSpec full repository copy
global artifact registry/evidence ledger
```

C1后续可提供更好的 structured OpenSpec paths/context，但不能取代B1 logical package ownership。

### 6. Full Test/Finalize 永远不进入 B1 Action Package

B1 package generator只接受十个 Standard Change Actions。

```text
Apply / Archive
→ MAY include applicable Owner authorization refs

Delivery Full Test / Finalize
→ Delivery behavior
→ no Standard Run
→ no B1 Action Package
```

必须修正 canonical integration spec中 Full Test作为 Action Package示例的旧 wording，以及 `docs/core-model.md` 把 logical package ownership留给旧 C1 的 wording。

后置 03 thin Agent Adapter只负责：

```text
logical ActionPackage
→ provider/command physical input
→ one Action execution
→ logical result
```

它不决定 next。

### 7. logical Action Result admission复用 `completeRun()`，不创建第二 terminal schema

B1 service接受 provider/executor logical descriptor，只允许当前 ActionDefinition声明的 caller-owned fields：

```text
executionStatus
summary
reviewVerdict/reviewFindings（仅 review actions）
failureDiagnosis（适用）
```

Core验证 pending Run、Action/role/fingerprint、review/source-review/verification entry binding后调用现有 `completeRun()`。以下仍 Core-owned：

```text
runRef
producedResultRefs
consumedInputRefs
reviewVerdictRef
verificationSummaryRef
all ref paths/kinds/fingerprints
```

`nextActionRecommendation`即使保留在 human/adapter result中也不成为 Policy authority。

### 8. Run-ID强制采用双层防线

高层 service调用：

```text
allocateNextRunId(deliveryRunsDir, executionDate, action)
```

caller不传 NNN。创建前 persistence再调用 `validateCandidateRunId()` 并验证 run-id action suffix等于 formal Action。这样 malformed、duplicate/non-monotonic NNN无法通过直接内部 `createRun()`绕过。

日期只用于 Run-ID grammar/可读性；NNN uniqueness/monotonicity仍 Delivery-wide authority。具体 clock injectable以便 deterministic tests。

### 9. CRLF兼容在 Manifest document layer做 bounded normalization

`DeliveryManifestDocument`读取 raw bytes时允许：

```text
LF
CRLF
```

若是合法 CRLF，则 normalize为内部 LF lines再执行原 bounded structured mutation。混合/unsupported `\r`形状、tabs、ambiguous duplicate owned keys继续 fail-closed。成功 write统一 LF + no trailing whitespace + exactly one EOF newline。

必须证明：

```text
owner record on CRLF
createChange on CRLF
activateChange on CRLF
→ semantic result同 LF
→ output LF
```

不建立 Windows variant、不换 YAML parser、不用 `.gitattributes`替代 runtime test。

### 10. Lean/performance只做可观察 budget，不提前优化

B1记录：

```text
prepared Action Package serialized/logical size
prepare/resume wall time
current active Change Run count scanned
current Run file size / active Run average size
```

验收重点是 package不加载 completed Change/Delivery历史 corpus，当前 active Change规模增长才是允许的局部成本。Proposal不冻结脆弱的绝对毫秒 hard limit；测试可使用 fixture-based bounded size/count与性能 observation，异常作为 warning/diagnosis而非未经证据的全局阈值。

## Risks / Trade-offs

- **semanticInputFingerprint 可能遗漏真正影响执行的 ref** → descriptor集中构造并强制覆盖 `contractRefs` exact identity/version、handoff/review/verification/owner refs；新增 package字段必须按 inclusion rule 判断，改变 allowed work/required result/prerequisite 的 authority identity不能排除。
- **fingerprint若包含太多动态事实会导致不可resume** → 只hash authority identities/refs，不hash human summary、provider session或完整文档。
- **低层 createRun defense-in-depth影响历史测试** → 只约束 current Standard Run create path；bounded historical read不重写，fixtures改为合法 Run ID/role。
- **Action Package minimal view仍复制少量 Finding字段** → 复制的是执行视图，Reviewer result ref仍是 authority；不建立 Finding DB。
- **CRLF normalize可能掩盖非法 carriage return** → 只接受纯 LF或纯 CRLF line ending；其它 `\r`形状继续 fail-closed。
- **logical package与C1/03 adapter职责可能重叠** → canonical wording明确 B1 owns logical view，C1 owns OpenSpec structured integration，03 owns physical single-Action adapter。

## Migration Plan

1. 定义 fixed ActionDefinition/catalog 与 logical ActionPackage/Result input类型；不改生命周期 Action枚举。
2. 增加 B1 execution service，先组合 fresh snapshot + Policy + pending resume/new Run allocation，再生成 logical package。
3. 在 `createRun()`/serialization补 Run-ID/action suffix/Action→Role/fingerprint defense-in-depth；现有历史 Run不迁移。
4. 实现 logical result admission，复用 `completeRun()`/Core-derived ResultRef，补 pending/fingerprint/role/source-review validation。
5. 在 Manifest document层加入 bounded CRLF normalization，并回归 A1 owner/create/activate semantics。
6. 同步 integration/core/bootstrap/diagnostic canonical docs/specs，明确 Full Test/Finalize无 B1 package、B1 logical ownership、后置 adapter physical-only。
7. 跑 focused/affected/typecheck/lint/build/OpenSpec strict/whitespace与 lean observations；不得运行 Delivery Full Test。

若 Apply发现需要全局 session registry、OpenSpec路径规则重实现、Finding DB或 Delivery behavior package才能满足 contract，应停止并回到 Review/Owner边界，而不是扩大B1。
