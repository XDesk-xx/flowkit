<!-- flowkit-change-verification-status: passed -->

# Verification: D1 — review-findings-and-blocker-authority

## 1. 验证范围

本次验证覆盖经 080 Reviewer `approved`、Owner 明确授权 Apply 的 D1 implementation：

- Reviewer Finding v2 closed schema、stable Finding identity 与 `new / still-open / resolved / superseded` convergence；
- A1 existing `ownerDecisions` 中的 structured Change-scoped `contract-reset`，以及 deterministic Owner fact ref / latest-per-scope projection；
- `context.json` schemaVersion 3、bounded `ownerFactRefs`、Action Package handoff 与 Owner fact semantic identity；
- Reset-aware completed producer/review currentness、approval invalidation 与 Finding baseline selection，同时保持历史 completed Run immutable；
- OpenSpec `propose/revise-propose`、`apply/revise-apply` action-sensitive semantic projection，保留 raw structured context 给 executor；
- Windows `.ps1` first-class OpenSpec launcher、PowerShell-first resolution 与 `.cmd/.bat` fallback；
- Q1 `blockingAuthority` routing、One fact/one authority、历史 v1/v2 Run/context 与 unversioned transitional Finding 的 read-only compatibility。

Windows canonical `EPERM rename` 观察仍明确不属于 D1 implementation；本次未新增 speculative persistence retry。`AGENTS.md` 未修改，因此不会覆盖 Base `ea9b34b23fb4c2c732980184cb821d546cd30da0` 的 repository-maintenance changes。

## 2. 适用检查与结果

| 检查 | 命令/方法 | 状态 | 摘要 |
|---|---|---|---|
| D1 focused regression | `node --import tsx --test <D1 A1/B1/persistence/OpenSpec/launcher focused files>` | passed | 252 tests / 32 suites，252 pass，0 fail；约 4.637s |
| Deterministic affected tests | `npm run test:affected -- shared cli verification` | passed | 690 tests / 155 suites，690 pass，0 fail；约 14.734s，低于 30s target |
| Typecheck | `npm run typecheck` | passed | production + test TypeScript 0 error |
| Lint | `npm run lint` | passed | ESLint 0 error |
| Build | `npm run build` | passed | TypeScript build passed |
| Quality Guard | `npm run quality` | passed | `quality: passed`，hard-failures 0；129 maintainability warnings/elevated-warnings 为 observation |
| OpenSpec active Change strict | `openspec validate review-findings-and-blocker-authority --strict --no-interactive` | passed | Change valid |
| Canonical specs strict | `openspec validate --specs --strict --no-interactive` | passed | 13 passed，0 failed |
| Text hygiene | `git diff --check` + final generated-text EOF check | passed | 无 trailing whitespace；正式生成文本保持单个 EOF newline |
| Delivery Full Test | — | not-run | 未获 Delivery Full Test 授权；本次只执行 Change Verification |

## 3. 关键行为验证

### 3.1 Reviewer Finding v2 / convergence

- 新 Reviewer terminal writer 使用 versioned complete Finding contract；blocking 与 non-blocking fields 按 closed schema 校验。
- 同一 Review 内 Finding ID 必须唯一；同 ID 跨 matching Review 继续使用时，`contractRef + invariant` identity 必须稳定。
- first matching Review 无 previous baseline；后续 matching Review 可表达 `new / still-open / resolved / superseded`。
- direct same-target re-review 绑定最近匹配 Review；review of `revise-*` producer 只消费 exact `sourceReviewRun`，且 Contract Reset identity 必须匹配。
- Owner Reset 后的新 normal producer generation 不继承 abandoned generation 的 Findings；历史 Reviewer Result 保持 immutable history。

### 3.2 Structured Owner Contract Reset

- Owner authority 仍只来自 Manifest existing `ownerDecisions`；没有新增 Decision DB、Approval Registry、authority event ledger 或 chat persistence。
- `contract-reset` 需要显式 `Delivery / Change / scope / requiredOutcomes / sourceRef`；`requiredOutcomes` trim、去重、排序后参与 deterministic `owner:<sha256>` identity。
- FormalFactReader 验证 structured tuple/ref，并按同 `(deliveryId, changeId, scope)` 选择最新 valid Reset；authorization-only Policy projection保持独立。
- Action Package / Run context 仅携带 Core-verified bounded projection，不成为 Owner authority。

### 3.3 Handoff / semantic identity / reset-aware lineage

- current Run writer 使用 context schemaVersion 3；历史 v1/v2 继续 read-only compatibility。D1 自举期间已经落成的 transitional v2 `ownerFactRefs` bytes只做结构校验并从 typed projection剥离，不能参与 current Owner authority/reset identity；新 writer只在 v3 输出该 projection。
- applicable Contract Reset fact identity进入全部 current Standard Change Action semantic descriptor。
- pending execution期间 Owner fact变化会在 continuation / terminal admission fail closed 为 `PENDING_INPUT_DRIFT`。
- approved Proposal 后发生新 Reset：旧 producer/review仍是 immutable history，但不再是 current approval；Policy回到 normal `propose → review-propose`，不得直接 apply，也不得把旧 Review误作 revise source。
- 082 `D1-RA-001` corrective：如果 Reset 发生时恰有一个 pending Standard Run，该 Run仍先以 `PENDING_INPUT_DRIFT` fail closed；`inspectPreparedRun` 只有在重新计算证明 drift **仅由 Contract Reset ownerFactRefs 改变**时才报告 `recovery-required`。
- explicit `flowkit recover contract-reset-pending` / Core recovery service 只在上述 exact 条件下把旧 pending Run正式写成 `cancelled`，固定 reason=`superseded-by-owner-contract-reset`；历史 Run目录/result保留，随后 Policy/preparation可创建新的 reset generation。
- recovery 不是 generic cancellation：若除 Owner Reset 外还有 OpenSpec/contract/verification 等 semantic drift，surface返回 `RESET_PENDING_RECOVERY_NOT_ALLOWED`，不得借 recovery绕过 fail-closed identity。
- earlier-stage prerequisite approval在只重置 current stage时仍保持合法历史 prerequisite；没有新增 generation registry/object。

### 3.4 OpenSpec self-mutation identity

- raw `OpenSpecPreparedActionContextView` 继续完整提供给 Author/executor。
- `propose/revise-propose` fingerprint排除 Action-owned artifact existence/current output path等自写结果，但保留 artifact instruction、resolved output、dependency、template与其它 external semantic identity。
- `apply/revise-apply` fingerprint排除合法 task progress/state self-mutation，但保留 exact `contextFiles` 与真正 external prerequisite identity。
- focused regression覆盖 same-pending self-mutation resume以及真正 external contract/context drift fail closed。

### 3.5 Windows PowerShell launcher

- Windows default OpenSpec shim discovery优先任一 PATH 上的 `openspec.ps1`；只有 `.ps1` shim不存在时才选择 `openspec.cmd`。
- `.ps1` 使用 bounded PowerShell launcher：`pwsh.exe`优先、`powershell.exe` fallback，固定 `-NoLogo -NoProfile -NonInteractive -File` argv；未使用 `shell:true` / `Invoke-Expression` / profile。
- 一旦选中的 PowerShell process已经启动，其 nonzero/timeout/执行失败不会静默 fallback 到 `.cmd`；只有 launcher executable本身 ENOENT 才尝试下一 PowerShell candidate。
- explicit executable保持 caller authority；`.cmd/.bat` ComSpec与 non-Windows direct-spawn行为保持。
- detached Linux 环境无法声称真实 Windows shell execution；本次 Windows acceptance由 platform/process resolver focused regression覆盖，canonical Windows handoff中已确认的问题事实不被替代。

### 3.6 Contract Reset stale-pending recovery

- recovery 只消费 Manifest current Contract Reset projection与 pending Run frozen context；Manifest仍是 Owner authority，Run/result不成为第二 authority。
- recovery 使用 persisted Run descriptors重新计算当前 semantic inputs，再把 Owner facts替换回入场 frozen projection；只有结果精确还原 stored `semanticInputFingerprint` 才证明是 reset-only drift。
- 旧 Action Package仍不能 resume/terminalize为旧 generation成果；正式 recovery写入 `cancelled` terminal result后释放唯一 pending slot。
- regression 同时覆盖 CLI exact surface、新 generation继续、历史 cancelled Run可审计，以及 mixed semantic drift拒绝 recovery。

## 4. Contract / Scope Alignment

- D1 的 6 份 active OpenSpec delta specs已与实现同步，并通过 active Change strict；OpenSpec archive仍拥有后续 canonical spec sync/relocation，不在 Apply阶段预先复制第二套 canonical state。
- Q1 `changes-requested ≠ revise-required` 与 `blockingAuthority` Policy decision tree未被重写；D1只补 complete Finding/convergence 与 reset-aware currentness。
- `AGENTS.md` 无真实 contract drift需要同步，本次保持 byte-unmodified。
- Windows Run publish `EPERM rename` 未进入实现。
- 未引入 generic launcher framework、generic generation-management framework、Decision DB/Approval Registry、chat transcript persistence或 generic authority ledger。

## 5. Tasks

`tasks.md` 全部 D1 implementation / verification tasks 已完成，无剩余 `[ ]` 项。

## 6. 总体状态

**passed**

D1 适用 Change Verification 全部通过；Delivery Full Test 为 `not-run`（未授权）。当前 Apply candidate 可进入独立 `review-apply`。
