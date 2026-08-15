# Explore

## 1. Problem

G1 `change-cli-end-to-end-and-performance` 是 02 Change Execution Loop 的最后一个 required Change。E2 已把 Change Verification 与 post-E2 three-file Run 泛化，F1 已把 Archive / completed / strict Checkpoint boundary 收口；G1 不应再设计第三套 lifecycle，而应把现有正式能力收敛成可从 CLI 单步驱动、可 checkout/resume、可 E2E 验证且有明确性能观测的 Change operator surface。

当前缺口不是“Flowkit 不会执行 Change”，而是：

```text
Policy / write services / OpenSpec / Run execution / Verification / Archive / Checkpoint
→ 已有正式 primitives

CLI
→ 目前只暴露 status / next / doctor / resume-context /
   create / owner record / activate / recover
→ 尚未形成 G1 contract 要求的 explore / review / revise /
   propose / apply / verify / archive operator surface
```

G1 还必须证明这些 CLI 入口不会变成第二编排器：`review` / `revise` 是基于当前 formal facts 与 Policy 解析出来的 intent，一次 invocation 只处理一个合法 boundary；Checkpoint、Delivery Full Test、Delivery Finalize 继续不是 Standard Run。

## 2. Current Facts

Canonical Base：

```text
repository: XDesk-xx/flowkit
branch: delivery/20260810-01-change-execution-loop
HEAD: b9a126b63ad1907cf0baa0b42c858480284cc522
```

前置 Change：

```text
E2 change-verification-generalization-and-lean-run-normalization
→ completed + checkpointed
→ generic Change Verification
→ post-E2 three-file Run writer

F1 archive-and-checkpoint-boundary
→ completed + checkpointed at current HEAD
→ strict checkpoint identity + checkpoint-time Owner authorization
→ bounded legacy checkpoint compatibility
→ thin checkpoint handoff / preflight
```

G1：

```text
changeId: change-cli-end-to-end-and-performance
dependsOn: archive-and-checkpoint-boundary
state: active
stage: explore
```

Owner 已明确授权进入 G1 Explore，正式 activation fact：

```text
owner:ca35607fbca22fbc314c9d0371f833fb6b653ecf9a97e67568ca9c2e6d591e34
```

正式 Explore lineage：

```text
20260815-178-explore          → completed
20260815-179-review-explore   → changes-requested
20260815-180-revise-explore   → current Author revision
```

179 的两个 blocking findings 均为 `blockingAuthority=author`：

```text
G1-RE-001 → missing cross-Delivery Genericity / Next-consumer proof
G1-RE-002 → Performance Proof F evidence boundary incomplete
```

当前 CLI help 实测：

```text
flowkit <status|next|doctor|resume-context|
         create delivery|create change|owner record|
         recover contract-reset-pending|recover archive-terminal|
         activate|--version>
```

当前已存在的执行 primitives 包括：

```text
createDelivery / createChange
recordOwnerDecision / activateChange
prepareActionExecution / prepareNewExecution
resumeRun / admitActionResult
invokeOpenSpecArchive
inspectOpenSpecArchiveRecovery / admitOpenSpecArchiveRecovery
prepareCheckpointBoundaryHandoff
```

G1 不需要重新创建这些 authority 或状态机。

## 3. Scope Boundary

### In scope

```text
Change CLI operator surface
single-boundary CLI orchestration
review / revise intent resolution
prepare / resume / result-admission CLI composition
OpenSpec-backed archive CLI composition
verification inspection / authority-safe verify surface
status / next / doctor / resume-context continuity
checkout / fresh-session exact resume
complete Change E2E matrix
G1 current-Change Verification selection + physical execution closure
Action Package / Run size observation
prepare / resume / focused / affected timing observation
OpenSpec process-count observation
review convergence observation
minimal canonical CLI documentation / help required by the frozen surface
```

### Out of scope

```text
stable provider / Agent Adapter               # 03 G1
while(next) autonomous runner
automatic Author ↔ Reviewer loop
bounded auto-continue
Provider / Agent / Skill Registry
Delivery Full Test implementation
Delivery Finalize implementation
Archify
automatic checkpoint Commit / Push / Merge
second Verification truth / evidence platform
global cache platform
parallel scheduler
mandatory CodeGraph
```

Checkpoint helper 若暴露到 CLI，只能是 Git boundary helper，不是 Formal Action，不创建 Run，不自动 commit/push。

## 4. Risk Scan

| Risk | yes/no | Why |
|---|---|---|
| Scope expansion / missing prerequisite | yes | CLI 很容易越界成 Runner / Agent Adapter / Git automation；必须证明现有 primitives 足够，G1 只做薄 orchestration |
| Cross-time facts | yes | pending Run、review target、Verification、Archive terminal、checkout/resume 均跨时间边界 |
| Schema / persistence migration | no | E2 已交付 current three-file Run；G1 不需要新的 Run file type / persistence schema |
| Self-hosting / writer changes itself | yes | G1 是 post-E2/F1 真实 next-consumer，CLI 必须消费当前 writer / reader 而不回退 legacy sidecars |
| Authority duplication | yes | Policy / Reviewer / Verification / OpenSpec / Git 各有 authority；CLI 只能调用和投影 |
| Generic reusable subsystem | yes | CLI 面向任意 current Change，不能绑定 G1/F1/E2 identity |
| Activation must persist across Change/Delivery boundaries | yes, continuity only | G1 不引入新 migration，但 CLI 是 repository-level 长期 surface，必须证明 future Delivery / checkout 后仍消费 formal current facts，不退化为当前 Delivery-local 假设 |
| Candidate/formal-fact mutation affects existing consumers | yes | CLI wiring、Verification Catalog、E2E test 会影响 diagnostics/execution/verification consumers |
| Verification selection must reach actual executed targets | yes | 新 G1 E2E 不能只 logical-selected，必须进入 physical Node command |
| External tool performs real mutation | yes | archive CLI 需要调用真实 OpenSpec archive；checkpoint 仍留给 Git Executor |
| Change claims performance improvement | yes, observation only | G1 required output明确要求 size/timing/convergence observation；不等于授权 cache/scheduler 优化 |

## 5. Applicable Proofs

### Proof A — Scope / prerequisite + current CLI gap

**Question:** G1 是否需要新增新的 lifecycle engine，还是现有 formal services 已足以支撑一个薄的 Change CLI？

**Acceptance Boundary:** 在进入 Proposal 前，必须能明确区分“缺失的 CLI surface”与“已经存在的 authoritative primitives”，并证明 required CLI 可以在不进入 03 Agent Adapter / auto-loop 范围的情况下实现。

**Method:** 实际运行 current CLI help；静态检查 `src/cli/main.ts` dispatch 与 service exports；对照 02 G1 required CLI surface。

**Evidence:**

当前 CLI 已有：

```text
status / next / doctor / resume-context
create delivery / create change
owner record
activate
recover contract-reset-pending / archive-terminal
```

当前 CLI 缺少：

```text
explore / review / revise / propose / apply / verify / archive
```

底层已存在 Run preparation/resume/admission、OpenSpec archive、Owner write-side 与 F1 checkpoint handoff primitives。

**Evidence Boundary:** current canonical Base 的真实 CLI dispatch + production service surface。

**Gap:** 缺的是 operator CLI composition 与 E2E contract，不是新的 Policy / Run / OpenSpec / Git authority。

**Result: PASS**

**Implication:** Proposal 应冻结 thin CLI orchestration layer；不得新增第二 lifecycle engine、Agent/provider layer 或 autonomous runner。

---

### Proof B — Single-action CLI composition / authority boundary

**Question:** `explore / review / revise / propose / apply / archive` 是否可以作为一次只处理一个正式 boundary 的 CLI intent，而不让 CLI 自己决定 next？

**Acceptance Boundary:** CLI invocation 必须先消费 current formal facts / Policy，并且最多 prepare/resume/complete一个被 Policy 允许的 Change Action；`review` / `revise` 不得绕过 blocker authority；Checkpoint / Full Test / Finalize 不得进入 Standard Run catalog。

**Method:** 检查 current Formal Action catalog、Policy next/preconditions regressions、B1 execution-service regressions、F1 checkpoint service边界；组合 existing primitives，不写 candidate production code。

**Evidence:**

当前 Formal Action catalog 仍只有 10 个 Change Actions。现有 regressions 已证明：

```text
non-author blocker
→ 不机械 revise

direct re-review
→ 可形成新的 Reviewer generation

failed execution retry
→ 新 Run / 新 NNN

pending same action
→ exact resume same Run

checkpoint
→ F1 handoff / Git boundary
→ 非 Run
```

相关 targeted baseline 与 OpenSpec/F1 integration 共：

```text
92 / 92 passed
```

**Evidence Boundary:** production Policy + execution services + F1 boundary tests；覆盖单 boundary preparation/resume/admission feasibility。

**Gap:** CLI wiring 尚未实现；但没有发现需要改变 Policy semantics 的 prerequisite。

**Result: PASS**

**Implication:** `review` / `revise` 必须是 intent：由 current `next` / blocker authority解析到唯一 formal action；禁止 `while(next)`、approved 后自动 propose、changes-requested 后自动 revise。

---

### Proof C — Checkout / resume without chat or provider state

**Question:** pending current Run 能否在 checkout / 新 session 后仅凭正式 repository facts恢复同一个 runId？

**Acceptance Boundary:** 持久化一个 pending post-E2 Run → fresh clone/checkout → `resume-context` 与 `resumeRun` 必须恢复相同 Delivery / Change / action / role / runId；不得依赖聊天摘要、provider session 或 `.tmp`。

**Method:** 将当前 G1 `178-explore` pending state 放入 disposable Git commit，再 fresh clone；运行 `status` / `resume-context`，并调用 `resumeRun(expectedRunId)`。

**Evidence:**

Disposable proof commit：

```text
e63b21f0aa6d7c3594e4b9ad97ac5658b35241f1
```

Fresh clone：

```text
resume-context.pending-run = 20260815-178-explore
pending-action = explore
pending-role = author
pending-resume = resumable
```

`resumeRun` 返回：

```json
{
  "kind": "pending",
  "runId": "20260815-178-explore",
  "action": "explore"
}
```

**Evidence Boundary:** fresh Git clone / new process / no chat-state recovery。

**Gap:** 无 feasibility gap；G1 需要把这条现有能力纳入 CLI E2E regression，而不是新增 session registry。

**Result: PASS**

**Implication:** checkout/resume 可以继续以 Git/OpenSpec/Runs/Formal Facts为唯一输入；禁止 Provider Session Registry。

---

### Proof D — Complete Change E2E primitive feasibility

**Question:** 在 CLI wiring 之前，当前 production primitives 是否已经覆盖 G1 E2E matrix所需的关键 lifecycle transition，使 G1 可以通过 composition + E2E tests 收口，而不是重新实现 Change lifecycle？

**Acceptance Boundary:** 至少证明 create/activate、pending/resume、review/revise authority、Verification、real OpenSpec archive、completed→checkpoint readiness、strict checkpoint recognition 的 primitives均已存在且可独立验证。

**Method:** 组合运行 A1/B1/F1/diagnostic/OpenSpec real-CLI/E1 verification integration regressions；静态检查 archive sequence 与 write services。

**Evidence:**

Targeted baseline：

```text
92 / 92 passed
```

覆盖现有事实包括：

```text
create / activate Owner provenance
pending exact resume
failed retry new NNN
direct re-review
revise flows
OpenSpec real archive
archive terminal continuation
archive success → completed
completed → checkpoint readiness
strict checkpoint recognition
diagnostic status / next / doctor / resume-context
historical/current verification recovery
```

当前 full repository baseline：

```text
779 / 779 passed
```

**Evidence Boundary:** underlying lifecycle primitives through F1 checkpoint boundary；尚未覆盖“用最终 G1 CLI 命令串起完整 happy/failure matrix”，因为该 CLI 尚未实现。

**Gap:** G1 必须新增真正的 CLI E2E matrix，不能把既有 unit/integration primitives冒充最终 CLI E2E acceptance。

**Result: PASS**（针对“Proposal feasibility / prerequisites已具备”）

**Implication:** Proposal 应冻结一套 disposable-repository CLI E2E matrix；production mutation应以 orchestration/wiring 为主，不重写底层 lifecycle semantics。

---

### Proof E — Mutation Surface + Verification Closure

**Question:** 若 G1 新增 CLI orchestration 与 G1 E2E test，generic Change Verification 是否能从 current G1 actualChangeSet 一直闭合到该 E2E test 的真实物理执行？

**Acceptance Boundary:** `actualChangeSet → module ownership → capability relation → logical check → physical resolver → tests/integration/g1-change-cli-end-to-end.test.ts → formal failure/pass` 必须可成立；sentinel failure 必须使 selected verification失败。

**Method:** 静态扫描 current Verification Catalog；在 disposable copy 中仅做 feasibility patch：为 G1 capability补 relation、把新 G1 E2E test纳入 CLI test physical resolver，并放入 deliberate failing sentinel；运行真实 selection + executor。

**Evidence:**

未补 G1 relation 时，hypothetical G1 change selection fail-closed：

```text
VERIFICATION_CAPABILITY_SELECTION_FAILED
moduleId: verification-selection
available: flowkit-change-cli-end-to-end-and-performance
```

说明 mutation surface 必须覆盖 Verification Catalog，而不能等 Apply 时再发现。

Disposable closure patch 后 selection：

```text
seed modules:
- cli-diagnostics
- execution
- verification-selection

selected scopes:
- openspec-current-change-strict
- tests-cli
- tests-execution
- tests-openspec-runtime
- tests-verification
- typecheck
```

物理 Node command明确包含：

```text
tests/integration/g1-change-cli-end-to-end.test.ts
```

该文件中的 deliberate failing sentinel 使 `executeVerificationSelection()` 返回 `failed`。

**Evidence Boundary:** logical selection → real physical Node command → actual sentinel failure。

**Gap:** Proposal 必须把 `module-map.ts` / `evidence.ts` 及对应 tests纳入 mutation scope；否则 G1 Apply formal verification会 fail-closed。

**Result: PASS**

**Implication:** G1 E2E test 必须成为 formal affected verification 的真实执行目标；禁止只跑 full suite后声称 generic selection正确。

---

### Proof F — Performance / Run-size / subprocess / review-convergence observation

**Question:** 当前 Change execution 是否存在已经足以记录的成本信号；这些信号是否证明 G1 需要引入 cache/scheduler/auto-loop 等平台机制？

**Acceptance Boundary:** 记录 required metrics 的可测 baseline，并区分“观测到成本”与“已证明需要新架构”；不得把性能 observation 自动升级成 cache/parallel/auto-review scope。

**Method:** 测量当前 Run corpus、post-E2 Run size、`prepareNewExecution`、compact entry identity、diagnostics、focused/affected/full verification wall time；单独 benchmark exact `resumeRun`；从 current formal F1 `verification.md` 读取 selected logical check count；用 PATH shim记录 OpenSpec process count；从正式 Review Run lineage统计 review convergence 与 reopened finding count。

**Evidence:**

Run corpus：

```text
176 run directories
551 run files
2,453,984 bytes total
```

post-E2 F1 corpus：

```text
19 Runs
3 physical files / Run
182,787 bytes total
9,620 bytes average
1,894 min
24,872 max
```

G1 pending 178：

```text
2 files
3,190 bytes
```

Preparation / entry identity：

```text
prepareNewExecution ≈ 761.6 ms
ActionPackage JSON ≈ 1,207 bytes
context.json = 2,662 bytes
action.md = 528 bytes
compact entry identity direct read ≈ 24.2 ms
```

Diagnostics：

```text
status         ≈ 1.86 s
next           ≈ 1.88 s
doctor         ≈ 1.90 s
resume-context ≈ 1.92 s
```

OpenSpec process observation：

```text
one flowkit status
→ 6 OpenSpec processes
  (--version + status --change --json) × 3

one prepareNewExecution
→ 2 OpenSpec processes
```

Verification：

```text
focused: 5 / 5, internal 0.447 s, wall ≈ 0.67 s
affected: 159 / 159, internal 13.620 s, wall ≈ 13.84 s
full: 779 / 779, internal 22.246 s, wall ≈ 22.46 s
```

Exact resume / `resumeRun`（与 `resume-context` diagnostic latency 分开）：

```text
fixture: persisted pending post-E2 Explore Run
measurement: same production resumeRun path, bounded OpenSpec projection adapter
12 samples: 3.12–5.59 ms
first: 5.59 ms
median: 3.83 ms
```

这只测 exact Run continuation service；此前：

```text
resume-context CLI diagnostic wall ≈ 1.92 s
```

两者不是同一个指标，不再互相替代。

Selected check count（current representative formal Change Verification）：

```text
F1 20260815-175-apply verification.md
selected logical checks = 6
- openspec-current-change-strict
- tests-cli
- tests-execution
- tests-openspec-runtime
- tests-verification
- typecheck
```

G1 自身尚处 Explore，不能伪造 current formal G1 verification count；Proof E 的 disposable G1 closure同样得到 6 个 prospective logical checks，但它只证明 future selection feasibility。

Review convergence across 9 pre-G1 Changes：

```text
78 total Review Runs
42 changes-requested
27 stage instances
stage instances with <=2 Review Runs: 13 / 27 = 48.1%
```

Reopened finding count（与 review rounds 分开）：

```text
measurement corpus: 79 formal Review Runs through 20260815-179-review-explore
criterion: findingId previously projected resolved|superseded, then appears again in a later reviewFindings set
reopened findings = 0
```

存在重复出现但未曾正式关闭的 finding IDs；这些属于 `still-open` / continued finding，不计为 reopened。

**Evidence Boundary:** current Bootstrap Delivery formal Run lineage + current formal F1 Verification publication + production exact-resume service measurement。required performance metrics 已分别有可测 baseline；G1 尚未实现后的 CLI non-regression值仍留给 Apply E2E。

**Gap:** 6 次 OpenSpec subprocess是明确优化信号，但没有证据证明需要 global cache / scheduler；48.1% review convergence与 reopened=0 也不能推出 auto Author/Reviewer loop。当前 proof只授权 measurement / reporting / bounded non-regression，不授权平台化性能架构。

**Result: PASS**（仅针对 Explore 所需 performance observation baseline；不等于最终 G1 performance acceptance 已完成）

**Implication:** G1 应保存/报告这些指标并设置 non-regression observation；不引入 cache platform、parallel scheduler、auto-review loop。若 Proposal选择 request-local safe reuse，必须保持 authority/correctness等价并有独立回归；否则后置。

---

### Proof G — `verify` CLI authority semantics

**Question:** G1 required CLI 中的 `verify` 应如何存在，才不会重新建立第二份 Verification truth或重新打开 E2 已冻结的 Apply terminal timing？

**Acceptance Boundary:** `verification.md` 继续是 Change Verification formal authority；Apply/revise-apply terminal admission继续拥有 current formal verification publication/binding。CLI `verify` 不得在任意 lifecycle state独立制造一份可覆盖当前 formal result 的第二 truth。

**Method:** 检查 E2/F1 current execution path、`verification.md` authority、B1 terminal admission与 diagnostics；区分 inspection/check intent 与 standalone mutating rerun。

**Evidence:**

当前正式模型已经稳定为：

```text
Apply / revise-apply
→ post-action actualChangeSet
→ deterministic selection
→ Verification executor
→ verification.md publication
→ result.json terminal binding
```

Reviewer默认消费 exact-bound formal evidence；历史 evidence不被 current Catalog反向改写。

因此：

```text
flowkit verify
→ 若作为 inspection / current formal verification status / deterministic plan check
   可以复用现有 authority

flowkit verify
→ 若允许在任意时刻独立 rerun并把结果写成新的 current formal truth
   会重开 E2 execution-time / authority semantics
```

**Evidence Boundary:** current E2/F1 formal Verification authority与 lifecycle binding。

**Gap:** CLI 具体命令形态需要 Proposal冻结，但 authority boundary已经唯一。

**Result: PASS**（仅对 authority-safe semantics）；**standalone truth-producing rerun = REJECTED APPROACH**。

**Implication:** Proposal 应把 `verify` 冻结成薄的 current verification projection / plan-check / existing-authority invocation之一；不能创建第二套 Verification publication lifecycle。

### Proof H — Genericity / future-Delivery next-consumer

**Question:** G1 拟议 thin Change CLI 的 intent resolution / Policy / preparation / exact resume composition，是否真的能跨不同 Change identity 和新的 future Delivery 使用，而不是只在当前 `20260810-01-change-execution-loop` / G1/F1 fixture 中成立？

**Acceptance Boundary:** 至少覆盖两个不同 Change identity，并增加一个新的 future-Delivery-shaped disposable consumer；在新的 Delivery facts 与 checkout boundary 后，仍能从 formal current facts 解析 active Change / unique Policy boundary，prepare one Standard Change Action，并 exact-resume 同一 pending Run。Evidence 还必须证明拟议 composition 不依赖当前 02 Delivery、G1/F1 identity、聊天摘要或 provider session。

**Method:** 使用 current production `readFormalFactSnapshot → next → prepareNewExecution → resumeRun` 组合，在 disposable repositories 中构造三个互不相同的 identity：

```text
A: delivery=20990301-01-cli-proof-a
   change=alpha-change

B: delivery=20990301-01-cli-proof-b
   change=beta-change

Future Delivery consumer:
   delivery=20990401-01-self-hosted-delivery
   change=future-consumer-change
```

对 future consumer：先 prepare pending Explore Run，再 Git commit，fresh clone 到新目录，重新读取 formal facts / Policy，并调用 exact `resumeRun(expectedRunId)`。同时静态扫描拟议 CLI composition 的核心 production surface：

```text
src/cli/context-loader.ts
src/cli/main.ts
src/services/b1-run-execution-service.ts
src/policy/next.ts
```

检查是否出现 G1/F1 literal dependency。OpenSpec projection 使用 bounded test adapter，只替代外部 CLI transport；Policy / active Change resolution / Run preparation / exact resume 均使用 production implementation。

**Evidence:**

A：

```text
Policy → action: explore
prepare → 20990301-001-explore
deliveryId = 20990301-01-cli-proof-a
changeId = alpha-change
```

B：

```text
Policy → action: explore
prepare → 20990301-001-explore
deliveryId = 20990301-01-cli-proof-b
changeId = beta-change
```

Future Delivery before checkout：

```text
Policy → action: explore
prepare → 20990401-001-explore
deliveryId = 20990401-01-self-hosted-delivery
changeId = future-consumer-change
```

Fresh clone 后：

```text
active Change = future-consumer-change
Policy → action: explore
resumeRun → kind=pending
resumed runId = 20990401-001-explore
resumed deliveryId/changeId/action/role/semanticInputFingerprint
= persisted pending identity
```

Literal scan：

```text
change-cli-end-to-end-and-performance → 0 matches
archive-and-checkpoint-boundary      → 0 matches
```

在上述 CLI composition core surface 中不存在 G1/F1 identity hardcode。Repository 其他位置存在 bounded historical migration / verification catalog literals（例如 E2/F1 migration reader、current source-controlled Verification Catalog），但它们不负责选择 future active Delivery / Change，也不决定 CLI lifecycle next；future fixture 已证明这些 bounded compatibility facts不会阻止新的 Delivery identity进入 current Policy/preparation/resume path。

**Evidence Boundary:** different Change A + different Change B + new future Delivery facts + persisted pending Run + Git checkout/fresh clone + exact resume。

**Gap:** 最终 G1 CLI wiring 尚未实现，所以 proof 证明的是 Proposal 所需的 generic composition feasibility，不冒充最终 CLI process E2E；最终 disposable CLI E2E仍由 G1 Apply acceptance覆盖。

**Result: PASS**

**Implication:** Proposal 可以冻结 repository-level thin CLI composition，但必须保持 `deliveryId/changeId` 来自 formal current facts / explicit delivery locator，而不是任何 02/G1 literal；不得新增 session registry。

---

## 6. Rejected Approaches

### A. `while(next)` autonomous CLI runner

拒绝。它会把 deterministic Policy 与 execution role adapter合并成第二编排器，并提前进入 03 stable Agent Adapter / bounded auto-continue 范围。

### B. `review` / `revise` 直接接受任意 Formal Action 参数

拒绝。`review` / `revise` 是 intent，必须由 current stage、latest Review 与 `blockingAuthority` 推导唯一合法 action；否则会重新破坏 `changes-requested ≠ revise-required`。

### C. G1 引入 provider / Agent registry

拒绝。03 才拥有 thin single-Action Agent Adapter；G1 只收口 operator CLI。

### D. `verify` 建立独立 truth-producing lifecycle

拒绝。`verification.md` 与 Apply/revise-apply terminal binding 已由 E2冻结；G1 不重做 Verification authority。

### E. Checkpoint / Delivery Full Test / Delivery Finalize 进入 Run catalog

拒绝。Checkpoint 是 Git boundary；Full Test / Finalize 是 Delivery behavior，均不是 Standard Run。

### F. 因 `status` 观测到 6 个 OpenSpec processes就建立 global cache / scheduler

拒绝。当前只有 subprocess duplication observation，没有足够证据授权 cache platform / concurrency framework。

### G. 新增 G1 E2E test但不接入 physical Verification resolver

拒绝。Disposable sentinel 已证明只有 logical selection不足以构成 Verification closure。

### H. 用聊天摘要 / provider session恢复 pending Run

拒绝。fresh clone proof 已证明 Git/OpenSpec/Runs/Formal Facts 足够恢复 exact pending run。

## 7. Feasible Proposal Boundary

Explore 已证明 Proposal 可以冻结以下最小设计：

### 7.1 Thin Change CLI

正式 operator surface至少覆盖：

```text
create
activate
explore
review
revise
propose
apply
verify
archive
status
next
doctor
resume-context
```

其中：

```text
create / activate / owner facts
→ 继续使用 A1 write-side

explore / propose / apply / review-* / revise-*
→ 使用 current Policy + post-E2 prepare/resume/admit primitives
→ 一次 invocation 最多一个 formal Action

review / revise
→ intent resolver
→ 不新增 Formal Action enum

archive
→ 组合 current Archive preparation/resume + OpenSpec archive authority + completed projection
→ 不重做 D2 archive semantics

verify
→ authority-safe projection / plan-check / existing formal verification invocation
→ 不创建第二 formal truth

checkpoint helper（若暴露）
→ F1 Git handoff only
→ no Run / no commit / no push
```

### 7.2 CLI E2E Matrix

Proposal 必须冻结 disposable-repository E2E，至少覆盖：

```text
happy path
owner activation missing
author blocker
owner blocker
verification blocker
external blocker
direct re-review
no-op revise rejection
review target stale
pending Run resume
Change Verification failed
OpenSpec artifact missing
archive failure
archive success → completed
completed → checkpoint readiness
checkpoint recognition
checkout / resume
```

E2E 不得只调用 internal service绕过 CLI surface。

### 7.3 Mutation Surface Closure

Proposal 应在已扫描的 consumer closure内选择最小 selectors，至少考虑：

```text
src/cli/main.ts

new narrow G1 CLI orchestration service / intent resolver
(or equivalent existing-service composition)

src/verification/change-selection/module-map.ts
src/verification/change-selection/evidence.ts

corresponding module-map / evidence tests
CLI dispatch / process tests
new tests/integration/g1-change-cli-end-to-end.test.ts
service tests if a new orchestration service is introduced
G1 OpenSpec proposal/design/spec/tasks/verification artifacts
minimal canonical CLI docs/help only if required by contract
```

当前 proof 没有证明需要修改：

```text
src/domain/actions.ts
Policy lifecycle semantics
E2 writer schema
F1 checkpoint semantics
Delivery Full Test / Finalize code
```

如 Proposal 选择修改这些区域，必须给出新的 direct prerequisite evidence，不能靠“CLI 收口”泛化扩大 scope。

### 7.4 Verification Closure

G1 capability必须补进 current Verification Catalog relation，使新 G1 E2E test真实进入 selected physical Node command。

Acceptance必须包含反事实 sentinel：

```text
expected G1 affected target forced fail
→ formal selected verification must fail
```

### 7.5 Resume

保持：

```text
formal persisted Run
+ Git/OpenSpec/Formal Facts
→ checkout / new process
→ same runId resumable
```

不新增 session registry。

### 7.6 Performance

Proposal只冻结观测与报告：

```text
ActionPackage / Run bytes
prepare latency
exact resumeRun latency
resume-context diagnostic latency
entry identity cost
focused / affected wall time
selected check count
OpenSpec process count
review rounds / convergence
reopened finding count
```

当前已知：

```text
full suite ≈ 22.46 s
status ≈ 1.86 s
resume-context ≈ 1.92 s
exact resumeRun median ≈ 3.83 ms (12-sample disposable pending fixture)
one status → 6 OpenSpec processes
representative F1 selected logical checks = 6
pre-G1 <=2 Review convergence = 48.1%
formal reopened findings through 179 = 0
```

这些是 baseline，不自动授权 cache/scheduler/auto-loop。

## 8. Open Decisions

Proposal 仍需在上述证明边界内冻结少量 implementation choice：

1. CLI orchestration 是放在新的窄 `g1-change-cli-service`，还是在不膨胀 `main.ts` 的前提下复用现有 service composition；
2. `verify` 的最终 CLI UX：优先选择 current formal verification projection / deterministic plan-check；任何 truth-producing rerun都必须被排除；
3. performance metrics 是仅由 E2E/verification summary输出，还是增加一个不拥有 lifecycle truth 的只读 summary helper；
4. 是否对同一次 CLI request内重复 OpenSpec projection做**最小 request-local reuse**。当前没有足够证据授权 global cache；如不影响正确性，也可以完全后置。

这些都是 Proposal 内可冻结的实现选择，不需要新的 Owner authority，也不改变 G1 scope。
