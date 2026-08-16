<!-- flowkit-change-verification-status: passed -->

# Verification: B1 — lean-run-and-action-package

## 1. 验证范围

本次 Change Verification 覆盖 037 Proposal / Design / delta specs / Tasks 已冻结、038 Reviewer `approved` 且 Owner 明确授权 Apply 的 B1 implementation：

- 十个 Standard Change Action 的 fixed `ActionDefinition` catalog；
- bounded `next` / explicit unified `review` 双入口与唯一 high-level Run preparation surface；
- Delivery-wide monotonic Run NNN allocation 与低层 Run-ID / Action→Role defense-in-depth；
- pending Run `semanticInputFingerprint`、same-Run resume、input drift fail-closed；
- provider-neutral logical `ActionPackage` 与 Change-only boundary；
- logical Action Result admission 委托 existing `completeRun()`，ResultRef 保持 Core-derived；
- Q1 non-author blocker 下 blocked `next()` + explicit same-stage direct re-review；
- failed/cancelled retry、新 Reviewer generation、real revise/new Action 的新 NNN semantics；
- Windows pure-CRLF Delivery Manifest bounded compatibility 与 canonical LF write；
- read-only `status/doctor/resume-context` pending resume/drift diagnostics；
- canonical specs、docs 与 AGENTS alignment。

不包含 C1 OpenSpec 1.7 full thin adapter、D1 Finding convergence、E1 actualChangeSet/verification selection、F1 archive/checkpoint executor、G1 complete Change CLI/performance E2E、03 Delivery behavior/stable Agent runtime、自动 Author/Reviewer loop、Registry/Router/Evidence platform。

## 2. 适用检查与结果

| 检查 | 命令/方法 | 状态 | 摘要 |
|---|---|---|---|
| B1 focused tests | `npm run test:focused -- tests/unit/services/b1-run-execution-service.test.ts tests/unit/persistence/run-persistence.test.ts tests/unit/persistence/delivery-manifest-document.test.ts tests/unit/services/a1-write-service.test.ts tests/unit/diagnostics/views.test.ts` | passed | 77 tests / 15 suites，77 pass，0 fail；1.654s，低于 focused 2s target |
| Change affected aggregate | `PATH=<OpenSpec-1.7-offline> npm run verify:change -- domain persistence facts policy cli` | passed | quality + affected + typecheck + lint + build + active Change strict + canonical specs strict 全部通过 |
| Affected tests | `npm run test:affected -- domain persistence facts policy cli`（由 `verify:change` 执行） | passed | 599 tests / 135 suites，599 pass，0 fail；8.450s，低于 30s target |
| Typecheck | `npm run typecheck` | passed | production + test TypeScript 0 error |
| Lint | `npm run lint` | passed | ESLint 0 error |
| Build | `npm run build` | passed | TypeScript build passed |
| Quality Guard | `npm run quality` | passed | hard-failures 0；93 maintainability warnings/elevated-warnings，仅 observation |
| OpenSpec active Change strict | `openspec 1.7 validate lean-run-and-action-package --strict --no-interactive` | passed | 4/4 artifacts complete；Change valid |
| Canonical specs strict | `openspec 1.7 validate --specs --strict --no-interactive` | passed | 12 passed，0 failed，含新增 `flowkit-lean-run-and-action-package` |
| Lean/performance observation | disposable B1 active-Change fixture | passed | baseline package 1030 B；prepare 10.822ms；resume 4.440ms；pending action+context 1163 B。加入 200 个 completed-history Run 目录后 package仍 1030 B；prepare 18.861ms；resume 4.596ms；证明 logical package不装载 completed history corpus，NNN allocator仍按 Delivery history扫描边界 |
| Delivery Full Test | — | not-run | 未运行 `test:full` / `verify:full`；本次仅 Change Verification |

## 3. 关键行为验证

### 3.1 Fixed ActionDefinition

十个 Standard Change Actions逐项与 037 normative mapping exact-match：`role + goalClass + mutationClass + outputClass + terminalContract`均由 compile-time/static catalog提供；Full Test / Delivery Finalize / Checkpoint 均不进入 catalog，也不产生 B1 Standard Run。

### 3.2 Run preparation 与 Delivery-wide NNN

`prepareActionExecution()` 只接受 `entry=next | review`：

```text
next
→ shared Policy next()

review
→ shared resolveReview()/canRun(review-S)
```

caller不能指定 concrete formal Action、role或 NNN。新 Run通过 Delivery-wide allocator生成；低层 `createRun()` 对 malformed/non-monotonic/duplicate NNN、Run-ID suffix mismatch、Action→Role mismatch再次 fail-closed。

### 3.3 pending resume / semantic input drift

pending Run保存 compact `semanticInputFingerprint`。相同 Action/role/semantic input重新 preparation：

```text
→ same runId
→ resumed=true
```

`contractRefs` 增删、`ref/kind/versionFingerprint` 变化或其它纳入 inclusion rule 的 authority input漂移：

```text
→ PENDING_INPUT_DRIFT
→ no second pending Run
```

fingerprint不包含 provider/chat/session identity、human summary、stdout/log、完整 Git/OpenSpec history corpus。

### 3.4 Q1 direct re-review

non-author blocking Review后：

```text
next()
→ remains blocked

explicit review entry
→ shared Policy resolves same-stage review-S
→ new Reviewer generation / new Delivery-wide NNN
```

如果 matching Reviewer pending Run 已存在且 fingerprint一致，则 resume 同一 Run，不制造第二个 Reviewer generation。

### 3.5 Logical Action Package / Result admission

logical `ActionPackage`只携带当前 Standard Change Action所需 identity、fixed definition、versioned contract/handoff refs、minimal review/verification view、Owner refs 与 required terminal contract，不复制 completed history corpus、raw logs、Git history或 provider session。

logical result admission只允许 execution/review/failure descriptor，调用 existing `completeRun()`；caller不能拥有 RunRef/ResultRef/path/kind/fingerprint authority。Action执行中合法修改自身 output bytes不会用 post-execution bytes重新计算 entry fingerprint自我否定；review/source-review/verification exact binding 与 terminal create-once仍由 existing Core completion preflight负责。

### 3.6 Windows Manifest compatibility

`DeliveryManifestDocument`接受纯 LF与纯 CRLF输入并内部 normalize；successful mutation统一输出 canonical LF。mixed LF/CRLF、bare CR与其它 unsupported shape仍 fail-closed。

回归覆盖：

```text
create change on CRLF
owner record on CRLF
activate on CRLF
→ semantic behavior与LF一致
→ successful output contains no CR
```

A1 Owner idempotency、dependency/architectureImpact、unknown-section preservation保持不回退。

### 3.7 Diagnostics

`status/doctor/resume-context`保持 read-only，可观察 matching pending Run 的 resumable / input-drift / fingerprint-missing 等状态；B1没有新增完整 action-runner CLI，G1 ownership不提前实现。

## 4. Lean observation

一次 disposable active-Change Explore preparation 实测：

```text
0 completed-history Run dirs:
  ActionPackage JSON = 1030 B
  prepare = 10.822 ms
  resume = 4.440 ms
  current pending action.md + context.json = 1163 B

200 completed-history Run dirs:
  ActionPackage JSON = 1030 B
  prepare = 18.861 ms
  resume = 4.596 ms
  current pending action.md + context.json = 1163 B
```

结论：

- logical Action Package 大小不随 completed Delivery history增长；
- package不装载 completed Run正文/log corpus；
- resume只重建当前 semantic view；
- Delivery-wide NNN allocator仍需扫描既有 Run-ID以保持唯一/monotonic，这是 Git/Run identity边界成本，不是 package corpus replay。

## 5. Scope Guard

通过 code/spec/diff review确认未引入：

- Registry / Router / dynamic Action discovery；
- Evidence/Receipt platform；
- provider/chat session store；
- OpenSpec state-machine reimplementation；
- automatic Author/Reviewer loop / bounded auto-continue；
- Full Test / Finalize Standard Run；
- C1/D1/E1/F1/G1/03 executor；
- Commit / Push / Checkpoint side effect。

039 只执行 Change Verification；Delivery Full Test保持 `not-run`。

## 6. 总体状态

**passed**

B1 所有适用 Change Verification 已通过，可以进入独立 `review-apply` generation。

## 7. 041 revise-apply — 040 Reviewer blocker closure

040 `review-apply` 返回 `changes-requested`，两个 blocking findings 均为 `blockingAuthority=author`。041 仅修这两个实现问题，不修改已批准 Proposal/Design/delta specs。

### 7.1 B1-RA-001 — ActionPackage semantic content admission

`admitActionResult()` 不再只比较 caller 携带的 `semanticInputFingerprint` 字符串。Admission 现在：

```text
caller ActionPackage semantic fields
→ canonical semantic descriptor
→ recompute SHA-256
→ exact-match persisted pending context.semanticInputFingerprint
```

覆盖：

- fixed `ActionDefinition`；
- `contractRefs`；
- `handoffRefs`；
- Review authority identity；
- Verification authority identity；
- Owner authorization refs。

`requiredResultContract` 另与 fixed `ActionDefinition.terminalContract` exact-match。篡改 package authority identity 且保留旧 fingerprint 会在 `result.json` 发布前 fail closed；terminal ResultRefs 仍只由 existing `completeRun()` 派生。

新增 regression：

```text
tamper contractRef + keep old fingerprint
→ PENDING_INPUT_DRIFT
→ no result.json

tamper Owner authority identity + keep old fingerprint
→ PENDING_INPUT_DRIFT
→ no result.json
```

### 7.2 B1-RA-002 — immutable entry generation vs Action-owned progress

Apply-family contract identity 不再从当前 mutable `tasks.md` / `verification.md` working-tree bytes重算：

- contract generation 从 stage producer Run 的 Core-derived `producedResultRefs` 恢复 point-in-time exact versions；
- `apply` 的 verification 是 Action-owned output，不进入 immutable entry fingerprint；
- `revise-apply` 的 verification input 锁定 source Review 当时的 `verificationSummaryRef`；
- `tasks.md` current progress 允许在 same pending Apply/revise-apply 中合法变化；
- approved proposal/design/delta specs 仍对当前 bytes 做 immutable-generation drift check，真实外部 contract drift继续 `PENDING_INPUT_DRIFT`。

新增 regression：

```text
prepare Apply
→ mutate tasks + create/update verification
→ same runId / resumed=true

prepare revise-apply
→ mutate tasks + update verification
→ same runId / resumed=true

pending Apply
→ externally drift approved proposal.md
→ PENDING_INPUT_DRIFT
→ no second pending Run
```

### 7.3 041 Verification

- B1 service regression：12/12 passed；
- Change affected aggregate：604/604 passed；
- typecheck：passed；
- lint：passed；
- build：passed；
- quality：passed，hard-failures=0；
- OpenSpec active Change strict：passed；
- canonical specs strict：12/12 passed；
- Delivery Full Test：not-run。

041 closure 后总体 Change Verification 继续为 **passed**。

## 8. 043 revise-apply — 042 Reviewer blocker closure

042 `review-apply` 返回 `changes-requested`，新增两个 blocking findings 均为 `blockingAuthority=author`。043 只修 B1 Run preparation / continuation seam，不修改已批准 Proposal/Design/delta specs，不实现 F1 archive executor。

### 8.1 B1-RA-003 — immutable current target equality by Action mutation boundary

`collectContractRefs()` 不再把 producer point-in-time refs 无差别当成 current target truth。现在按 fixed `ActionDefinition.mutationClass` 区分：

```text
current Action 不允许修改的 target / contract
→ producer point-in-time ref
→ fresh current-byte equality validation
→ drift = PENDING_INPUT_DRIFT

current Action 合法拥有的 progress/output
→ immutable entry generation remains producer-bound
→ self-owned current mutation allowed
```

具体保持：

- `review-explore` 对 current `explore.md` 做 fresh equality；
- `review-propose` 对 current Proposal/Design/Tasks/delta specs 做 fresh equality；
- `apply` / `revise-apply` 继续允许 Action-owned `tasks.md` / verification progress；
- approved Proposal/Design/delta specs 继续保持 immutable drift guard；
- `review-apply` 使用 current post-Apply `tasks.md` + verification generation作为 Reviewer input，不回退到旧 Proposal-time tasks generation。

新增 regression：

```text
prepare review-explore
→ externally mutate explore.md
→ prepare again
→ PENDING_INPUT_DRIFT
→ no second pending Run

prepare review-propose
→ externally mutate proposal.md
→ prepare again
→ PENDING_INPUT_DRIFT
→ no second pending Run
```

040 已关闭的 tamper、Apply continuation、revise-apply continuation regressions继续通过。

### 8.2 B1-RA-004 — persisted pending archive recovery after Action-owned completion progress

`prepareActionExecution()` 对**创建新 Action**仍以 fresh Formal Facts + shared Policy为唯一 authority；但对已经存在的 exact pending `archive`，新增 bounded recovery seam：

```text
.flowkit/runs/<delivery-id>/**
→ locate unique persisted pending archive context
→ do NOT ask next() to create archive again
→ recover that Change's persisted Run/Review lineage
→ rebuild immutable semantic authority generation
→ validate Owner / Review / Verification / contract equality
→ same fingerprint
→ resume same runId
```

关键边界：

- scanner只定位既有 `pending archive`，不创建 Action；
- completed Change没有 pending archive时仍不能创建新 archive Run；
- OpenSpec active path relocation到 `openspec/changes/archive/<date>-<change-id>/` 时，entry refs保持原 active logical ref identity，但验证 archived bytes必须与 entry fingerprint相同；
- Change `active → completed` 后，即使 current-active-Change projection不再包含该 Change Runs，也可从 persisted Run corpus恢复唯一 pending archive；
- archive verification identity锁定 consumed approved Review 的 `verificationSummaryRef`，并验证 active/archived verification bytes未漂移；
- unrelated Review/Owner/proposal/verification drift仍 fail closed；
- Checkpoint仍不是 archive output，也没有任何 Commit/Push side effect。

新增 regression：

```text
prepare archive
→ relocate active OpenSpec Change to archive path
→ prepare again
→ same runId / resumed=true

prepare archive
→ Change state active → completed
→ prepare again
→ same runId / resumed=true

completed Change + no pending archive
→ RUN_PREPARATION_NOT_ALLOWED
→ no new archive Run
```

### 8.3 043 Verification

- B1/A1/Run/diagnostic focused：87/87 passed，4.118s（低于5s warning budget）；
- Change affected aggregate：609/609 passed，10.238s；
- typecheck：passed；
- lint：passed；
- build：passed；
- quality：passed，hard-failures=0；
- OpenSpec active Change strict：passed；
- canonical specs strict：12/12 passed；
- Delivery Full Test：not-run。

043 closure 后总体 Change Verification 继续为 **passed**。

## 9. 045 revise-apply — 044 Reviewer blocker closure

044 `review-apply` 返回 `changes-requested`，新增两个 blocking findings 均为 `blockingAuthority=author`。045 只收口 persisted pending archive 的 terminal admission 与 diagnostics recovery seam，不修改已批准 Proposal/Design/delta specs，不实现 F1 archive/checkpoint executor。

### 9.1 B1-RA-005 — completed pending archive terminal admission

`prepare/resume`、`inspect` 与 `admitActionResult` 现在复用同一个 persisted pending archive recovery identity：

```text
.flowkit/runs/<delivery-id>/**
→ locate unique persisted pending archive
→ recover persisted Change Run/Review lineage
→ rebuild immutable semantic authority generation
→ exact fingerprint / Owner / Review / Verification / contract validation
```

对 exact matching persisted pending `archive`：

- OpenSpec active Change 已 relocation 到 archive path后仍可继续同一 runId；
- Change `active → completed` 后仍可继续同一 runId；
- terminal admission不再要求 current active Change，但必须再次证明 package identity、persisted pending context、semantic fingerprint 与 recovery lineage exact-match；
- 只有这个 persisted pending archive seam可绕过 active-Change binding；所有 non-archive terminal admission继续要求 package绑定 current active Change；
- completed且没有 persisted pending archive时不能获得新 archive admission authority；
- Checkpoint仍不是 Action output，未引入 Commit/Push side effect。

新增 regression：

```text
prepare archive
→ OpenSpec relocation
→ Change completed
→ resume same runId
→ admit completed result
→ unique terminal result.json published

remove persisted pending archive identity
→ completed Change
→ old/fabricated package admission rejected

non-archive pending Run
→ Change completed
→ terminal admission rejected with active-Change binding
```

### 9.2 B1-RA-006 — completed seam diagnostics recovery

`inspectPreparedRun()` 在存在 active Change时继续使用正常 snapshot/Policy projection；只有 no-active-Change 的 completed seam才 bounded查找 persisted pending archive，避免改变既有 ambiguous/orphan diagnostics语义。

对 completed + exact matching pending archive：

```text
inspectPreparedRun
→ same runId
→ action=archive
→ role=author
→ status=resumable | input-drift | fingerprint-missing | not-resumable
```

`status`、`doctor`、`resume-context` 在该 identity存在时只读显示：

```text
pending-run
pending-action
pending-role
pending-resume
```

不创建 Action Package、不创建 Run、不修改 fingerprint、不自动执行 archive。completed且没有 pending archive时继续返回/显示普通 Delivery-level `none`。

新增 regression同时通过 CLI surface验证 `status/doctor/resume-context` 指向同一 persisted runId，并确认无 pending identity时不伪造 pending projection。

### 9.3 045 Verification

- focused：114/114 passed，23 suites，4.277s（低于5s warning budget）；
- Change affected aggregate：614/614 passed，135 suites，16.680s；
- typecheck：passed；
- lint：passed；
- build：passed；
- quality：passed，hard-failures=0，104 maintainability warnings/elevated-warnings仅 observation；
- OpenSpec active Change strict：passed；
- canonical specs strict：12/12 passed；
- Delivery Full Test：not-run。

045 closure 后总体 Change Verification 继续为 **passed**。
