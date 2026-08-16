# B1 Explore — Lean Run and Action Package

## 1. Context

- Delivery: `20260810-01-change-execution-loop`
- Change: `B1 lean-run-and-action-package`
- Role: Author
- Execution Context: detached
- Exact GitHub Base: `da4eeb6a7e3787a44ea17fcff8b8ef08f9e05de1`
- Run: `20260811-031-explore`

B1 的主目标保持 02 reference 已冻结的范围：完成 Lean Run lifecycle、Action Package、Action Result admission 与 ResultRef validation，使一个已经由 Policy 唯一确定的 Change Action 能通过轻量 execution envelope 被安全执行、恢复和接纳。

Owner 本轮明确授权把一个真实 Windows compatibility 缺口并入 B1：Windows checkout / ZIP working tree 可将 Delivery Manifest 变成 CRLF；A1 Reader 已可读取，但 `DeliveryManifestDocument` write-side 当前直接拒绝 CRLF，导致合法的 B1 activation 无法执行。该问题只作为 B1 的 bounded startup / Run-entry compatibility correction；不得借此重做 A1 creation、Owner provenance 或 activation architecture。

---

## 2. B1 启动事实：Policy 已正常，writer compatibility 是独立缺口

Exact Base `da4eeb6...` 已包含 Q1 与 A1 正式 Change Checkpoint。最新 snapshot 具有完整 `.git`，Flowkit 可正确读取 Git boundaries：

```text
flowkit next
→ owner-decision: activate-change
→ context-change: B1

flowkit doctor
→ overall: ok
→ findings: 0
```

这证明：

```text
Q1 checkpoint recognition       OK
A1 checkpoint recognition       OK
dependsOn = Change.id           OK
Policy dependency resolution    OK
B1 activation selection         OK
```

但原始 Windows snapshot 中：

```text
Git blob Manifest:
CRLF = 0

ZIP working-tree Manifest:
CRLF > 0
```

直接执行：

```text
flowkit activate --change lean-run-and-action-package ...
```

失败为：

```text
Delivery Manifest must use LF line endings
```

原因不是 YAML Reader：`src/facts/yaml-parser.ts` 已支持 CRLF normalization；真正拒绝来自 `src/persistence/delivery-manifest-document.ts::splitLines()` 的：

```text
content.includes("\r")
→ MANIFEST_UNSUPPORTED_SHAPE
```

为继续本次 detached Explore，只把 working-tree Manifest 恢复为 exact Git HEAD 中的 canonical LF bytes；这不是业务语义 mutation。随后使用 A1 正式 write-side：

```text
flowkit activate B1
→ success
→ Owner decision provenance persisted
→ B1 planned → active

flowkit next
→ explore

flowkit doctor
→ ok
```

因此 B1 可以正式开始；CRLF defect 则作为本 Change 的 bounded compatibility gap 保留待 Proposal 冻结。

---

## 3. 已经存在、B1 不应重写的 Core 能力

调查确认 B1 并不是“从零实现 Run”。以下能力已经存在并有较强测试覆盖，B1 应优先组合/收口，而不是重写。

### 3.1 Change-only Run path 已成立

Current Standard Run 使用：

```text
.flowkit/runs/<delivery-id>/<change-id>/<run-id>/
├─ action.md
├─ context.json
└─ result.json  # terminal only
```

历史 Delivery-level Run 只做 bounded compatibility，不再进入 current Policy Run projection。

### 3.2 Run ID 纯函数与 filesystem helper 已存在

已有：

```text
parseRunId
validateRunIdUniqueness
allocateNextNnn
validateCandidateNnn

collectRunIds
allocateNextRunId
validateCandidateRunId
```

规则已经表达：

```text
YYYYMMDD-NNN-action
NNN Delivery-wide unique
NNN monotonic
checkpoint 不消耗/不重置 NNN
historical bounded Delivery Run 仍参与 NNN compatibility enumeration
```

### 3.3 Atomic Run create/terminal persistence 已存在

`createRun()` 已实现：

```text
staging .tmp-<run-id>
→ context/action validation
→ atomic directory rename publish
```

`completeRun()` 已实现：

```text
terminal descriptor
→ Core derives ActionResult / ResultRefs
→ assertMutable
→ temp result
→ exclusive fs.link publish
→ terminal create-once
```

### 3.4 Core-owned ResultRef 已经很强

已有：

```text
run-result
produced-artifact
verification-summary
```

并已实现：

```text
content hash fingerprint
current review entry exact binding
approved Review consumer binding
source-review tuple validation
review-apply verification generation binding
historical mutable point-in-time semantics
```

Caller 已不能通过 `producedArtifactTags` 自行缩小 artifact authority；`completeRun()` 会从 current authority bytes 派生完整的适用 refs。

### 3.5 Reader 已按 active Change 收缩 Run corpus

`FormalFactReader.readRuns()` 当前只把**唯一 active Change** 的 Change-level Runs 投影为 current Policy facts；completed/checkpointed Change corpus 留在 Git history，不再全历史 mutable replay。

这已经满足 Lean Run 的关键方向：B1 不需要恢复 global generation registry、Evidence ledger 或全历史 replay。

### 3.6 Pending Run diagnostics 已存在

`status / resume-context / doctor` 能看到 pending Run，并能识别：

```text
multiple pending Runs
orphan/non-resumable pending Run
current stage
last Run
```

因此 B1 需要补的是“正式执行 preparation/continuation surface”，不是再造一套 resume state database。

### 3.7 基线专项测试

本次 Explore 对现有 B1 邻近底座运行 targeted suite：

```text
run-id
run-id-fs
run-persistence
result-ref-adapter
diagnostic views
A1 write service
```

结果：

```text
133 / 133 passed
```

---

## 4. Confirmed Gap B1-G01 — Run-ID 规则存在，但没有被正式 Run creation surface 强制组合

当前 `allocateNextRunId()` / `validateCandidateRunId()` 已实现，但 `createRun()` 并不调用它们。

真实 disposable probe 证明当前低层 `createRun()` 可接受：

```text
runId = not-a-run-id
→ created successfully
```

以及：

```text
Change c1: 20260811-001-explore
Change c2: 20260811-001-explore
→ duplicate Delivery-wide NNN created successfully
```

后果：

- malformed Run directory 可能被 `looksLikeRunId()` Reader/collector 忽略；
- caller 可以绕过 Delivery-wide monotonic NNN contract；
- 已有正确 allocator 与 persistence primitive 没有形成安全 public execution boundary。

### Proposal 必须冻结

B1 必须有一个唯一的 current Run preparation/creation surface，使：

```text
Policy-decided Action
→ Delivery-wide allocate/validate Run ID
→ validate action/role/input
→ create pending Run
```

caller 不得自行选择任意 NNN 绕过 allocator。

Proposal 可决定是：

```text
thin B1 service wrapping existing primitives
```

或等价最小实现；但不得把 Run-ID authority 分散进 CLI/Adapter。

---

## 5. Confirmed Gap B1-G02 — Action→Role 只有接口概念，没有机器化 Definition catalog / entry enforcement

当前：

- `ActionDefinition` 只有 TypeScript interface；
- 没有 current fixed Action Definition catalog；
- `ContextFile`/`Run` 只校验 `role ∈ owner|author|reviewer`；
- 不校验具体 Action 是否由正确 role 执行。

真实 disposable probe：

```text
action = explore
role = reviewer
→ createRun() accepts
```

这与执行角色边界不一致。

B1 必须冻结 minimum machine definition，使至少明确：

```text
Author:
  explore
  revise-explore
  propose
  revise-propose
  apply
  revise-apply
  archive

Reviewer:
  review-explore
  review-propose
  review-apply
```

Owner authority 继续来自 Owner provenance，不因为 Owner 是正式 authority 就创建 Owner Standard Run。

Action Definition 还应提供生成 Action Package 所需的稳定：

```text
role
goal class
allowed mutation/output boundary
completion/result expectation
```

不得引入 Registry / Router / dynamic discovery。

---

## 6. Confirmed Gap B1-G03 — pending same-Run continuation 有诊断事实，但没有统一 execution preparation semantics

当前 031 pending 后真实状态：

```text
flowkit next
→ action: explore

canRun(explore)
→ allowed: false
→ pending-explore-run

resume-context
→ last-run: 20260811-031-explore
→ next-detail: action=explore
```

这不是 Policy 冲突：`next()` 返回相同 Action 可以表达“仍在这个 Action boundary”，而 `canRun()` 阻止第二个 pending Run。

真正缺少的是一个正式执行入口来区分：

```text
A. resume existing pending Run
B. create a new Run instance
```

目前没有 service/API 把这两件事确定性组合起来。

### B1 需要冻结的 same-Run rule

同一个 pending Run 只能在以下语义仍相同时继续：

```text
same Delivery
same Change
same formal Action
same role
same goal / mutation boundary
same semantic input generation
same execution instance
```

以下不能自动制造 new Run：

```text
换聊天
换 AI session
普通 Commit
重新打开工具
同一执行实例继续补充内容
```

New Run 只因：

```text
new formal Action
new Reviewer execution generation
real author-actionable revise
failed/cancelled retry instance
```

B1 Proposal 必须决定如何以**最小 identity**判定 “same semantic input”，但不得把整个 Action Package / OpenSpec / Git / Findings 全量复制进 Run。

可能需要一个 compact package/input identity；是否放入 `context.json` 由 Proposal 冻结。Explore 不提前选择具体字段。

---

## 7. Confirmed Gap B1-G04 — Action Package 逻辑 contract 已有文档，但没有 production generator

Canonical integration boundary 已说明 Action Package 是**逻辑执行输入视图**，不是 ZIP/JSON/特定 Provider payload。

但当前 production `src/**` 中没有：

```text
ActionPackage type/production projection
prepareActionPackage
prepareRun / resumeRun package generation
```

当前 `context.json` 只是 Lean persistence context，包含：

```text
identity
action
role
ownerAuthorization string
inputRef/sourceReview linkage
constraints
runPath
```

它不能单独替代完整 Action Package，因为执行者还需要：

```text
current Delivery / Change identity
formal Action + role
current contract refs
current handoff refs
current Reviewer findings / blocker authority（适用）
Owner authorization refs（适用）
本 Action goal
mutation boundary
verification requirement/plan view
required result shape
```

其中专业事实必须**引用 authority**，不能复制全文形成第二事实源。

### Proposal 必须冻结

- Action Package 的 minimum logical schema；
- 哪些字段由 `FormalFactSnapshot + Policy + ActionDefinition + current Run context` 派生；
- 哪些只保留 refs/summary；
- pending resume 时如何重新生成而不依赖聊天/provider session；
- package 不绑定 ZIP、ChatGPT、Codex 或具体 Agent；
- package 不加载整个历史 Run corpus。

---

## 8. Confirmed Gap B1-G05 — Action Result persistence 已强，但缺少清晰的 adapter-facing admission boundary

`completeRun()` 已经是可靠 terminal persistence API：

```text
executionStatus / summary / review verdict/findings descriptors
→ Core derives current authority ResultRefs
→ terminal result.json
```

这部分不应重写。

但现在还没有一个和 Action Package 对称的 B1 execution service contract，明确：

```text
executor returns logical result
→ validate against prepared pending Run / ActionDefinition
→ Core derives refs
→ completeRun()
→ re-read/admit
→ return control to Policy
```

特别需要阻止：

```text
caller 构造 runRef
caller 构造 versionFingerprint
caller 复制 OpenSpec/Verification/Git 专业事实
caller 通过 recommendation 推进 lifecycle
```

### Proposal 应优先复用

```text
completeRun
serialization validators
result-ref-adapter
entry validators
```

新增薄 admission service，而不是第二套 Result persistence。

---

## 9. Confirmed Gap B1-G06 — failed/cancelled retry 已有 Policy route，但没有完整 new execution-instance preparation

`next()` 对 latest failed/cancelled Run 已会返回同一 formal Action，符合：

```text
failed/cancelled retry
→ new Run instance
```

但因为缺少 B1 preparation service，目前没有统一机制保证：

```text
new Delivery-wide NNN
same Action contract
correct role
current semantic input
不复用 terminal Run
```

该问题可与 B1-G01/G03 在同一 preparation service 中收口，不需要新增 retry state machine。

---

## 10. Confirmed Gap B1-G07 — Windows CRLF Manifest writer compatibility

### 已确认事实

- Git canonical Manifest 是 LF；
- Windows checkout/ZIP working tree 可成为 CRLF；
- `parseYaml()` 已 normalization，可读；
- `DeliveryManifestDocument.parse()` 当前拒绝任何 `\r`；
- 因此 `activateChange` / 其它 A1 Manifest mutation 在 Windows working tree 可被阻塞。

### B1 bounded required outcome

B1 只要求保证：

```text
valid canonical Manifest semantics
+ LF input OR CRLF working-tree input
→ writer can parse same document
→ normalize internally
→ successful mutation writes canonical LF bytes
```

并至少回归：

```text
activateChange on CRLF Manifest
owner record on CRLF Manifest
createChange on CRLF Manifest
```

同时保持：

```text
unsupported tabs → fail closed
ambiguous/unsupported YAML shape → fail closed
unknown sections preservation
Owner ref/idempotency semantics unchanged
Change identity/dependency semantics unchanged
```

Proposal 可以选择在 `DeliveryManifestDocument` 层 normalization 或等价最小 seam；不得引入 Windows-only Manifest variant、第二 parser 或 rewrite all YAML machinery。

`.gitattributes` 是否需要只是工程 hygiene 选项，不得替代 runtime writer 对合法 Windows checkout 的兼容性证明。

---


## 11. Confirmed Gap B1-G08 — canonical Action Package contract 对 Full Test 与阶段 ownership 存在直接 drift

032 Reviewer 对 exact Base 的 repo-wide scan 发现，031 虽然已经把 Action Package 相关 docs/specs 列入 affected surface，但没有把其中已经存在的正式冲突提升为 confirmed gap。

当前同时存在三组不一致事实：

### 11.1 `docs/integration-boundaries.md` 已冻结 Change-only Action Package

该文档已经明确：

```text
Standard Change Action Package
→ 只服务 Standard Change Actions

Owner authorization view
→ Apply / Archive 等 Change Action 适用

Delivery Full Test / Finalize
→ Delivery behavior boundary
→ 不是 Standard Change Action Package
```

这一方向与 Q1 后的 Change-only Standard Run contract 一致。

### 11.2 `flowkit-integration-boundaries` canonical spec 仍把 Full Test 当作 Action Package 示例

`openspec/specs/flowkit-integration-boundaries/spec.md` 的：

```text
Scenario: Action Package 包含 owner 授权状态
```

仍以：

```text
Apply、Archive、Full Test
```

作为需要 Owner authorization 的 Action Package 示例。

这会把 Delivery Full Test 继续表达成 B1 logical Action Package 可服务的 Action，与当前 frozen contract 直接冲突：

```text
Delivery Full Test
→ Delivery behavior
→ no Standard Change Action
→ no Standard Run
→ no B1 Standard Change Action Package
```

### 11.3 `docs/core-model.md` 仍保留旧 C1 Action Package ownership

当前文档仍有历史阶段描述：

```text
具体 Action Package、Skill 字段、标识、加载和 Adapter 协议属于 C1
```

但当前 02 Delivery 已冻结：

```text
B1
→ Lean Run
→ logical Action Package
→ Action Result admission

C1
→ OpenSpec 1.7 thin integration
```

因此 Proposal 必须重新区分两层 ownership：

```text
B1
→ logical Action Package contract
→ deterministic preparation/generation
→ refs + mutation/result boundary

后置 integration / provider transport / stable adapter
→ physical serialization/transport/provider binding
→ 不拥有 Policy next
→ 不把 Delivery behavior 塞回 Change Action Package
```

这里不是要求 B1 实现 stable Agent Adapter；只是必须把当前 canonical ownership wording 修到与 02 主线一致，避免 Apply 时出现第二套 scope interpretation。

### Proposal 必须冻结

B1 Proposal 必须把以下 invariant 写成 normative contract：

```text
B1 Action Package
→ 只接受十个 Standard Change Actions

Delivery Full Test / Delivery Finalize
→ Delivery behavior
→ MUST NOT 进入 B1 Standard Change Action Package
→ MUST NOT 创建 Standard Run

B1
→ owns logical package preparation/generation

后置 adapter / transport
→ 只执行/映射已经冻结的 logical package
→ 不成为第二编排器
```

并把：

```text
docs/integration-boundaries.md
openspec/specs/flowkit-integration-boundaries/spec.md
docs/core-model.md
```

从“可能 affected surface”提升为 Proposal 明确必须对齐的 canonical contract surface。

---

## 12. Lean Run 性能边界：已有正确方向，B1 只需要证明不回退

当前 Reader 已只读 active Change Run corpus；latest actual Run 物理体量也保持 KB 级：

```text
action.md / context.json / result.json
```

B1 不应新增：

```text
full historical Run corpus into Action Package
all stdout/logs
global artifact registry
Evidence/Receipt ledger
provider session transcript
full OpenSpec copies
Git history copy
```

Proposal/Apply 应增加可观察指标，至少：

```text
Action Package serialized/logical size estimate
pending/resume package generation time
Run average/current size
active Change Run count scanned
```

目标不是提前做复杂 optimizer，而是验证 B1 没有让 Run 随 Delivery history 线性变重。

---

## 13. Canonical affected surface（Proposal 必须 repo-wide 再确认）

初步 confirmed surface：

### Domain

```text
src/domain/actions.ts
src/domain/types.ts
src/domain/run-id.ts
src/domain/schema-validator.ts
```

需要关注：

```text
fixed ActionDefinition catalog
Action→Role binding
ActionPackage logical type（若放 domain）
```

### Policy / facts

```text
src/policy/next.ts
src/policy/can-run.ts
src/policy/unified-entry.ts
src/policy/preconditions.ts
src/facts/formal-fact-reader.ts
src/facts/formal-fact-snapshot.ts
```

重点是消费已有 next/canRun，而不是重写 decision tree。

### Persistence

```text
src/persistence/run-id-fs.ts
src/persistence/run-persistence.ts
src/persistence/serialization.ts
src/persistence/result-ref-adapter.ts
src/persistence/delivery-manifest-document.ts   # bounded CRLF correction
```

### Service layer

当前只有：

```text
src/services/a1-write-service.ts
```

B1 很可能需要新增一个薄 execution preparation/admission service；具体文件名在 Proposal 冻结。

### Diagnostics

```text
src/diagnostics/resume-context.ts
src/diagnostics/doctor.ts
src/diagnostics/shared.ts
```

B1 只需让 pending Run/Action Package continuation 可恢复；完整 Change CLI 留 G1。

### Canonical docs/specs

至少需要 repo-wide 检查：

```text
docs/core-model.md
docs/delivery-lifecycle.md
docs/integration-boundaries.md
docs/bootstrap-reference.md
docs/development-roadmap.md
AGENTS.md

openspec/specs/flowkit-core-model/spec.md
openspec/specs/flowkit-domain-and-state-schema/spec.md
openspec/specs/flowkit-formal-fact-reader-and-persistence/spec.md
openspec/specs/flowkit-integration-boundaries/spec.md
openspec/specs/flowkit-policy-engine/spec.md
openspec/specs/flowkit-diagnostic-cli/spec.md
openspec/specs/flowkit-delivery-change-creation-and-owner-input/spec.md  # CRLF compatibility delta only if required
```

其中以下三个 surface 已由 032 Review 证明存在**直接 canonical drift**，Proposal MUST 明确对齐，而不是只列为可能 affected：

```text
docs/integration-boundaries.md
openspec/specs/flowkit-integration-boundaries/spec.md
docs/core-model.md
```

对齐结果必须保证：

```text
B1 logical Action Package = Standard Change Actions only
Delivery Full Test / Finalize = Delivery behavior, no Standard Change Action Package
B1 owns logical package preparation
后置 adapter/transport 不拥有 lifecycle decision
```

Proposal 仍必须通过 repo-wide conflict scan 冻结最终 affected capability set，而不是机械照抄本列表。

---

## 14. Proposal Freeze Questions

### P1 — B1 唯一 execution preparation surface 是什么？

必须冻结：

```text
Policy result
→ resume existing pending Run OR allocate new Run
→ create pending Run
→ prepare logical Action Package
```

不得让 CLI/Adapter 各自复制这套规则。

### P2 — Run ID authority 如何强制接入 create path？

必须保证：

```text
caller 不指定任意 NNN
Delivery-wide allocation
runId action suffix 与 formal Action 一致
malformed / duplicate / non-monotonic → fail closed
```

### P3 — ActionDefinition minimum machine catalog

必须冻结每个 Standard Action 的：

```text
role
goal class
allowed mutation/output class
completion/result expectation
```

不建立 Registry。

### P4 — same pending Run identity

必须冻结最小判定：

```text
same Action / role / goal / semantic input / execution instance
```

以及需要持久化的最小 identity。不得把整个 package copy 进 context。

### P5 — Action Package minimum logical schema

至少覆盖 02 reference 要求的：

```text
delivery/change identity
formal Action
role
current contract refs
current handoff ref
current Findings / blocking authority
Owner authorization refs
mutation boundary
verification plan/requirement
required result contract
```

同时明确什么必须是 ref 而不是正文复制。

### P6 — Action Result admission service

冻结 executor/provider 可返回的 logical result fields 与 Core-owned fields 的边界。

必须保持：

```text
ResultRef / fingerprint / runRef Core-derived
recommendation non-authoritative
completeRun remains sole terminal persistence path
```

### P7 — retry / reviewer generation

冻结何时 new Run，确保：

```text
failed/cancelled retry = new Run
explicit re-review generation = new Run
real revise = new Run
same pending continuation != new Run
```

不增加 lifecycle state。

### P8 — CRLF writer compatibility

冻结最小 normalization seam、canonical LF output 与 regression matrix；不重新设计 A1。

### P9 — performance / lean acceptance

冻结可测量 budget/observation，证明 package generation 与 active Run reading 不会因为 completed Delivery history 线性膨胀。


### P10 — Change-only Action Package 与阶段 ownership 对齐

必须冻结并同步 canonical contract：

```text
B1 logical Action Package
→ only ten Standard Change Actions

Apply / Archive
→ 可携带适用的 Owner authorization refs

Delivery Full Test / Finalize
→ Delivery behavior
→ no Standard Run
→ no B1 Standard Change Action Package

B1
→ logical package preparation/generation

后置 integration / provider transport / stable adapter
→ physical mapping/execution only
→ no Policy ownership
```

Proposal 必须明确修正 `flowkit-integration-boundaries` 中 Full Test 作为 Action Package 示例的旧语义，并清理 `docs/core-model.md` 中旧 C1 对 logical Action Package 的 ownership 表达。

---

## 15. Explicit non-goals

B1 不实现：

```text
OpenSpec 1.7 structured adapter / archive handoff       → C1
full Finding convergence / typed lifecycle              → D1
actualChangeSet / verificationScope generation          → E1
archive/checkpoint helper                               → F1
complete Change CLI / action commands / E2E             → G1
Delivery Full Test / Finalize executor                  → 03
stable Agent runtime                                    → 03
Provider Registry / Agent Registry / Skill Registry
bounded auto-continue / automatic Author-Reviewer loop
automatic Commit / Push / Merge
```

B1 也不把 bootstrap ZIP 运输包等同于 Action Package，也不因为修正 canonical drift 而把 Delivery Full Test / Finalize 重新纳入 Standard Change Action、Run 或 B1 Action Package。

---

## 16. Explore Acceptance

本 Explore 认为可以进入 Review，当 Reviewer 能确认：

1. 已区分“现有可靠 primitive”与“B1 仍缺的 execution composition”；
2. 已真实证明 low-level `createRun` 可绕过 Run-ID / role contract，而不是凭推测扩大 scope；
3. 已识别 pending `next=Action` / `canRun=false` 的 same-Run continuation composition gap；
4. 已确认 Action Package 没有 production generator，且 `context.json` 不被误当成完整 package；
5. 已明确 Action Result 应复用 `completeRun` / Core-derived ResultRef，不重做 persistence；
6. 已把 failed/cancelled retry 纳入 new execution instance contract，而非新增 state machine；
7. 已把 Windows CRLF writer defect bounded 纳入 B1，并保留 A1 authority/creation semantics；
8. 已保留 C1/D1/E1/F1/G1/03 scope guard；
9. Proposal 有足够 freeze questions 可以形成 deterministic、lean、可测试的实现 contract；
10. 已显式识别 Action Package canonical drift，并冻结 `Standard Change Actions only`、Full Test/Finalize Delivery-behavior exclusion，以及 B1 logical package vs 后置 adapter/transport ownership 边界。

---

## 17. Explore Conclusion

B1 的最佳实现方向不是“大改 Run Core”，而是：

```text
已有 deterministic Policy
+ 已有 Run-ID helpers
+ 已有 atomic createRun/completeRun
+ 已有 Core-owned ResultRef
+ 已有 active-Change-only Reader

→ 增加一个薄 B1 execution preparation/admission layer
→ machine ActionDefinition + role binding
→ deterministic allocate/resume/new-instance
→ logical Action Package
→ logical Action Result admission
→ Core terminal persistence
→ return control to Policy
```

并同步消除当前 canonical Action Package drift：

```text
B1 logical Action Package
→ Standard Change Actions only

Delivery Full Test / Finalize
→ Delivery behavior
→ no Standard Run / no B1 Action Package

B1 owns logical preparation
后置 adapter/transport owns physical mapping only
```

同时完成一个 bounded Windows compatibility correction：

```text
CRLF Manifest working-tree input
→ accepted/normalized by writer
→ canonical LF write
```

这样 B1 可以把现有 Deterministic Core 的零散正确 primitive 收敛成真正可执行、可恢复、仍然 Lean 的 Change Action envelope，而不提前实现后续集成/CLI/自动化。
