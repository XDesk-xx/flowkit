# Explore

## 1. Problem

I1 处理 03 Delivery 在 Delivery Full Test 收口前暴露出的执行合同缺陷。

当前正式 Full Test execution contract 是：

```text
ONE Delivery Full Test authority
→ verification.fullTest.execution.kind = command
→ npm run verify:full
→ timeoutMs = 120000
```

而 `scripts/verification.ts` 内部已经存在六个 logical checks：

```text
quality
→ typecheck
→ lint
→ build
→ openspec-all
→ full
```

其中 `typecheck` 本身继续启动两个 `tsc` child，`full` 又进入 `npm run test:full` 并执行完整测试集合。当前 `delivery-full-test-service.ts` 把整个 logical Full Test 绑定到一个 child process lifetime 和一份 120 秒总 budget；child 只有在整个 `verify:full` 返回前才通过 `FLOWKIT_FULL_TEST_RESULT_PATH` 发布 terminal protocol。

因此根因不是简单的 timeout 数值偏小，而是：

```text
logical Full Test authority
错误绑定
single physical process lifetime
+
terminal protocol file IPC
```

H1 已证明同类问题可以通过“one logical evidence → multiple bounded physical commands”解决，但 I1 必须修 Delivery Full Test 自己的 execution contract、Verification aggregation 和 lifecycle write-side；不得重开 H1，也不得把 H1 的 capability-specific planner变成通用平台。

## 2. Current Facts

### 2.1 Canonical Base / lifecycle

- detached exact Base: `4f3e0f44a3a1254670a99f1428b70fc1e2c6c8f2`
- Base 是 H1 Change Checkpoint 后的 clean Delivery branch snapshot。
- Base 上 A1→H1 required Changes 均 completed + checkpointed；raw `delivery.fullTestStatus=not-ready`，effective status 为 `awaiting-user-decision`。
- 当前 canonical/current generation 没有合法 Delivery Full Test terminal result，也没有 Full Test Failure Finding。
- Owner 已正式创建 required blocker Change：
  - Change: `I1 delivery-full-test-bounded-execution-and-protocol-closure`
  - create ref: `owner:bcb98e822381bb1090c94ce953719be9d95fef47a4a3f9532f1d55c4147ffe32`
- Owner 已正式 activate I1：
  - activate ref: `owner:77234cb1f41d258f4a9a719c9371519f0a7605c447b414299f96b399001d9aec`
  - `specDeltaMode=required`
- current formal Run: `20260819-116-explore`，pending/resumable。
- current Policy: `action explore`。
- `flowkit doctor`: `ok / 0 findings`。
- I1 active 后 Delivery effective Full Test status 为 `not-ready`。
- real 03 `architecture/20260817-01-delivery-execution-loop/json/actual.architecture.json` 仍必须保持 absent，直到 I1 completed + checkpointed、fresh Owner Full Test authorization、正式 Full Test PASS。

### 2.2 Current Full Test execution / protocol

Current `FullTestExecutionContract` 只有：

```text
kind: command
command
args[]
launcherMode
scope=delivery
timeoutMs
resultProtocol=flowkit-full-test-result-v1
resultAuthority=verification
expectedTerminalStatuses=[passed, failed]
```

03 instance 当前冻结：

```text
command = npm
args = [run, verify:full]
launcherMode = npm-shim
timeoutMs = 120000
```

`runDeliveryFullTest()` 当前：

```text
Policy full-test gate
→ resolve one physical command
→ spawn once with execution.timeoutMs
→ child writes FLOWKIT_FULL_TEST_RESULT_PATH
→ parent parses protocol
→ publish result | executionBlock
```

transport 已有 typed outcome authority：

```text
exited
spawn-failed
timed-out-cancelled
outcome-unknown
```

但 `scripts/verification.ts::executeProjectStep()` 只返回 `{exitCode,durationMs}`，`runVerificationPlanDetailed()` 因而把 logical interpretation压成 exit-code-only。

### 2.3 Human plan is not machine authority

`verification.fullTest.plan` 是 coverage intent prose。Current canonical spec已经明确：Reader/Policy MUST NOT 编译这些字符串成为 executable step list。

I1 必须扩展的是 typed `verification.fullTest.execution`，不是把 human plan 升格为 machine authority。

## 3. Scope Boundary

### In scope

- `FullTestExecutionContract` 使用 `kind: command | bounded-command-plan` 判别联合；不建立新的内部 `FullTestExecutionV1/V2` 体系；
- `command` 保持合法 per-Delivery execution kind，不被定义为 historical-only；
- 当前 03 execution migration 到 `bounded-command-plan`；
- Verification-owned logical check plan + logical→physical target mapping；
- shared typed bounded physical command executor，只拥有 process transport；
- 每个真正 spawned child 独立 hard timeout / process-tree ownership；
- `typecheck` 等 multi-child logical checks 真正展开，不保留 120s long wrapper；
- `full` 使用 current-checkout deterministic test discovery + static heavy overrides，保持完整 coverage；
- bounded-kind semantic aggregation：PASS full logical plan / FAILED exact prefix / execution-error no terminal result；
- `checks[]` 从“physical execution order”修正为 frozen logical check order；
- physical/logical/total duration semantics；
- bounded target diagnostics；
- `authorized + Owner create required Change → not-ready` authorization invalidation；
- `outcome-unknown` executionBlock 不得被 ordinary create/activate 绕过；
- legacy `kind=command` + `FLOWKIT_FULL_TEST_RESULT_PATH` IPC compatibility；
- Windows cancellation/process-tree regressions；
- nested `FLOWKIT_HOME`、managed OpenSpec / Archify exact identity propagation regressions。

### Out of scope

- 伪造 Full Test failed / Delivery Finding；
- Delivery-level Contract Reset；
- reopen H1；
- `flowkit-full-test-result-v1` schema upgrade（除非 Proposal 前出现反证）；
- quality 251 warnings cleanup；
- dynamic timeout / automatic timeout tuning；
- parallel scheduler / generic scheduler；
- runtime heavy classifier / timing-based partition；
- generic Verification timing/telemetry platform；
- generic recovery engine；
- broad test refactor / package pruning；
- real 03 Actual / Compare / Finalize；
- 04 Engineering Health work。

## 4. Risk Scan

| Risk | yes/no | Why |
|---|---|---|
| Scope expansion / missing prerequisite | yes | Full Test touches lifecycle, persistence, Verification and process transport; must avoid expanding into 04 |
| Cross-time facts | yes | Full Test authorization/result and post-pass Actual have strict temporal order |
| Schema / persistence migration | yes | per-Delivery execution contract gains a second discriminated kind while existing command manifests remain readable |
| Self-hosting / writer changes itself | yes | I1 changes the Full Test behavior used to qualify this same 03 Delivery after I1 checkpoint |
| Authority duplication | yes | Verification must continue owning test interpretation/result; Delivery service only owns lifecycle/persistence |
| Generic reusable subsystem | yes | bounded physical executor is shared transport; command and bounded kinds must work for future Deliveries |
| Activation must persist across Change/Delivery boundaries | no | I1 does not introduce a repository-global activation switch; current code/checkpoint becomes current implementation |
| Candidate/formal-fact mutation affects existing consumers | yes | reader/writer/policy/service/tests/specs consume Full Test execution/result facts |
| Verification selection must reach actual executed targets | yes | bounded full suite must cover every discovered test without omission/overlap |
| External tool performs real mutation | yes | Full Test child processes include managed OpenSpec and process-tree cancellation semantics |
| Change claims performance improvement | no | goal is correctness/termination ownership; no latency target or scheduler optimization is claimed |

## 5. Applicable Proofs

### Proof A — Lifecycle write-side closure

**Question:** 当前 ordinary `createChange()` 是否已经足够支持 I1 admission，并且是否正确处理旧 Full Test authorization / outcome-unknown safety block？

**Acceptance Boundary:**

```text
awaiting-user-decision
→ Owner create required Change
→ normal planned/activate path

raw authorized + no executionBlock
→ Owner create required Change
→ atomically authorized → not-ready
→ old Owner authorization preserved only as history

raw authorized + outcome-unknown block
→ ordinary create/activate fail closed
→ block preserved
```

**Method:** 在 exact Base `4f3e0f44...` 的 disposable copies 上调用 current production `recordOwnerDecision()`、`runDeliveryFullTest()` 与 `createChange()`；不修改 product code。

**Evidence:**

Current I1 real write-side已证明：

```text
Base effective awaiting-user-decision
→ Owner create I1
→ I1 planned
→ effective full-test not-ready
→ Owner activate I1
→ Policy explore
```

Disposable `authorized-create`：

```json
{"authorizedRaw":"authorized","afterCreateRaw":"authorized","afterCreateEffective":"authorized","afterCreateNext":{"kind":"owner-decision","decision":"activate-change"}}
```

即 current ordinary branch成功创建 required Change，但没有使旧 raw `authorized` 失效。

Disposable `unknown-create`：

```text
runDeliveryFullTest(fake outcome-unknown)
→ executionStatus=execution-error
→ raw=authorized
→ executionBlock.reason=outcome-unknown
→ Policy=blocked(full-test-execution-outcome-unknown)

then createChange(required=true)
→ createError = none
→ block仍存在
→ Policy 变成 owner-decision activate-change
```

这证明 current create/activate path可以绕开原先的 outcome-unknown blocked boundary。

**Evidence Boundary:** exact current writer + Policy + persistence behavior on disposable Base。

**Gap:** current implementation不满足后两项 lifecycle invariant。

**Result:** `FAIL` for current implementation；`PASS` for bounded corrective feasibility。

**Implication:** Proposal MUST把 `authorized → not-ready` 原子失效和 `outcome-unknown create/activate fail-closed` 纳入 P0；MUST NOT新增 Delivery Contract Reset。Current I1 本身是在 canonical `awaiting-user-decision` 上合法创建，因此不需要 retroactive reset。

---

### Proof B — Execution contract / authority separation

**Question:** 能否在不建立内部版本体系、不把 human plan 变成 machine authority的情况下，为 Full Test增加 bounded physical execution？

**Acceptance Boundary:** existing `kind=command` reader/writer/service remains supported；new bounded kind可表达 one logical Full Test → ordered logical checks → bounded physical targets；shared transport不取得 Verification/Policy authority。

**Method:** consumer scan + current targeted regression + H1 bounded executor comparison。

**Evidence:**

Current direct consumers：

- `src/domain/full-test.ts`
- `src/domain/a1-types.ts`
- `src/services/a1-write-service.ts::normalizeFullTestExecution()`
- `src/facts/formal-fact-reader.ts::readFullTestExecution()`
- `src/persistence/delivery-manifest-document.ts::renderFullTestExecution()`
- `src/services/delivery-full-test-service.ts::runDeliveryFullTest()`
- `scripts/verification.ts`

Current reader/writer均对 `kind=command` 做 closed validation；因此 new kind需要显式 parser/renderer branch，但不要求改变 existing command shape。

Current `src/shared/external-command.ts::runCommand()` 已提供稳定 typed transport outcome：

```text
spawn-failed
exited
timed-out-cancelled
outcome-unknown
```

focused baseline regression：

```text
full-test reader/persistence/write-side/service
external-command
verification-plan
→ 56 / 56 PASS
```

其中 Windows whole-tree cancellation、POSIX process group、outcome-unknown block、legacy child protocol均已有 current regression。

H1 current production已有 private Node-test-specific `executeBoundedNodeCommands()`，正式 113 Verification中：

```text
tests-cli       → bounded physical fan-out → PASS
tests-execution → bounded physical fan-out → PASS
```

但该 helper包含 H1/G1/B1 case规划与 Change Verification evidence aggregation，不能直接成为 Delivery Full Test planner。

**Evidence Boundary:** current durable command contract + current shared typed transport + proven bounded execution mechanism。

**Gap:** shared transport-level ordered bounded executor尚未抽取；bounded Full Test executable plan/aggregator尚不存在。

**Result:** `PASS`。

**Implication:** Proposal SHOULD采用：

```text
FullTestExecutionContract
├─ kind: command
└─ kind: bounded-command-plan
```

共同 base继续保持 `id/scope/resultProtocol/resultAuthority/expectedTerminalStatuses`。`command` MAY继续被 future Delivery writer选择；I1 不把它降格为 historical-only。New bounded path不使用 child `result.json` IPC；Verification-owned in-process aggregator直接消费 typed target outcomes并构造既有 `flowkit-full-test-result-v1` payload。Delivery service只 gate/invoke/persist。

---

### Proof C — Logical→physical closure / no long wrapper

**Question:** 当前 03 六个 logical checks 是否能形成 coverage-complete bounded physical target plan，而不新增 scheduler、dynamic heavy classifier或另一个 120s wrapper？

**Acceptance Boundary:**

- frozen logical order保持 `quality → typecheck → lint → build → openspec-all → full`；
- 每个真正 spawned child独立 timeout/process-tree ownership；
- `typecheck` 等 multi-child logical check展开；
- `full` 的 current-checkout test discovery与 physical coverage union闭合；
- source-controlled heavy overrides不遗漏/重叠；
- ordinary new test自动进入 deterministic fallback partition。

**Method:** static source/AST proof + current `resolveAllTests()` + H1 formal physical evidence + representative real-process timings。

**Evidence:**

Current logical→physical事实：

```text
quality      → one Node quality child

typecheck    → tsc --noEmit
             → tsc --noEmit -p tsconfig.test.json

lint         → one ESLint child
build        → one tsc child
openspec-all → one managed OpenSpec child
full         → npm run test:full wrapper
             → Node test workers
```

因此 `verify:step typecheck/full` 不能作为 bounded target；否则只是把 long wrapper下移一层。

Current checkout：

```text
resolveAllTests() = 88 files
```

Disposable deterministic planner以：

```text
ordinary discovered files → automatic bounded file target
known structural heavy files → explicit source-controlled override
```

形成 file-level exact union。当前 proof识别 5 个已有结构化 heavy override候选：

```text
tests/integration/diagnostic-cli-process.test.ts
tests/integration/g1-change-cli-end-to-end.test.ts
tests/integration/g1-sync-resume-and-single-action-agent-adapter.test.ts
tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts
tests/unit/services/b1-run-execution-service.test.ts
```

AST closure proof：

- diagnostic 3/3 case titles closed；
- G1 Change 7/7 case titles closed；
- G1 Adapter 3/3 case titles closed；
- B1 7 whole-suite patterns + `B1 preparation and admission` 22/22 case titles closed；
- H1 default full test实际是 `for phase=1..26 runSelfHostingPhase()`；formal phase branch调用同一 `runSelfHostingPhase(formalPhase, stateRoot)`，因此 26-phase override保留同一 self-hosting operation semantics；
- hypothetical new ordinary `tests/unit/proof-new-ordinary.test.ts` 自动进入 ordinary fallback。

Prototype mapping summary：

```text
discovered files = 88
ordinary files   = 83
file coverage union exact = true
heavy selector title closure = true
new ordinary auto-inclusion = true
```

Representative detached physical timings：

```text
diagnostic read-only commands     ≈ 3s
diagnostic npm-installed bin      ≈ 12s
diagnostic unknown-command        < 1s
openspec-1-7-real-cli individual  ≈ 12.7s via Flowkit runCommand(timeout=120s)
verification-commands individual  ≈ 0.75s via Flowkit runCommand(timeout=120s)
```

H1 formal 113 Verification进一步证明 G1/B1/H1 bounded partitions在同类 detached environment 中每个 physical command均能通过 existing 120s hard timeout；若任一 command timeout/transport fail，H1 executor会使 logical evidence fail closed。

一次 shell-level exhaustive ordinary-file probe被外层 harness总预算截断；随后用 Flowkit process-group-aware `runCommand`证明被怀疑的 `openspec-1-7-real-cli` 本身只约 12.7s，因此该截断不是单文件 >120s 的证据。I1 不把 shell harness结果当作 Verification authority。

**Evidence Boundary:** deterministic selection/coverage closure + representative/per-existing-heavy bounded feasibility。

**Gap:** Proposal/Apply 仍需把最终 source-controlled heavy override set和 bounded execution实现冻结，并在 I1 formal Change Verification中执行真实 target union；Explore不声称已经运行未来 bounded Full Test。

**Result:** `PASS` for feasibility and selection closure。

**Implication:** Proposal MUST禁止：

```text
verify:step full → npm run test:full → one 120s wrapper
```

并 MUST允许 current-checkout deterministic discovery，而不是把机器绝对路径或 Delivery Start 时的完整 test file snapshot持久化进 Manifest。不得引入 dynamic timing classifier/scheduler。

---

### Proof D — Protocol semantic closure without protocol upgrade

**Question:** existing `flowkit-full-test-result-v1` 是否足以表达 bounded logical result，还是必须升级 wire schema？

**Acceptance Boundary:** PASS只接受完整 logical plan；FAILED只接受 exact executed prefix；execution-error无 terminal payload；`checks[]` 表达 logical order而非 physical target order。

**Method:** current parser behavior proof + disposable plan-relative semantic validator。

**Evidence:** current `parseFullTestProtocol()` 只做 closed structural validation：unique non-empty check IDs、passed|failed status和 timing；它不绑定 executable logical plan。

Disposable proof确认 current schema当前会接受：

```text
status=passed + [quality,typecheck] incomplete prefix
status=passed + arbitrary unique id "banana"
```

在不改变 `schemaVersion=1` / canonical resultRef hash domain 的情况下增加 bounded-kind plan-relative validator后：

```text
full PASS                    → accepted
FAILED exact prefix          → accepted
incomplete PASS              → rejected
arbitrary check IDs          → rejected
```

因此 wire payload字段已经足够；缺失的是 bounded execution contract相对 logical plan 的 semantic validation，而不是新的 result schema字段。

**Evidence Boundary:** current parser + exact existing payload shape + prototype semantic rules。

**Gap:** canonical spec当前把 `checks[]` 写成“physical execution order”，需要在 I1 delta中修正为 frozen logical check order。

**Result:** `PASS`。

**Implication:** Proposal SHOULD保留：

```text
flowkit-full-test-result-v1
schemaVersion: 1
```

并冻结：

```text
PASS
→ checks == complete logical plan, exact order, all passed

FAILED
→ checks == non-empty exact logical prefix
→ all prior passed
→ last failed

execution-error
→ spawn-failed | timed-out-cancelled | outcome-unknown | protocol/aggregation error
→ no terminal Full Test result
```

`kind=command` 没有 bounded logical plan binding，继续按 existing legacy protocol + child exit/status coherence校验。

---

### Proof E — Duration / diagnostics / environment authority

**Question:** bounded execution是否能增加 target-level diagnosis而不变成 telemetry authority，并保持 managed tool/environment portability？

**Acceptance Boundary:** physical/logical/total duration语义稳定；Manifest不持久化 machine absolute paths；managed OpenSpec/Archify identity在每个 target启动前由 current resolver构造；diagnostics bounded。

**Evidence:** current shared runner已返回 stdout/stderr、typed outcome、process-tree diagnostics；C1 canonical external-tool contract已要求 managed identity跨 Delivery Full Test technical children传播。Current Full Test environment helper会重新解析 managed OpenSpec propagation，而不是把 canonical machine path写入 Delivery Manifest。

推荐语义可直接建立在 existing fields上：

```text
physical target duration
→ one spawned child wall duration

logical check duration
→ first target start → logical terminal/fail-fast wall duration

totalDurationMs
→ whole Full Test orchestration wall duration
```

`totalDurationMs` 不要求等于 `sum(check.durationMs)`；orchestration/env resolution overhead允许存在。

Manifest/executable contract只持久化 stable command/args/launcher/timeout/selector policy，不持久化当前机器的 `FLOWKIT_HOME=D:\...`、`/tmp/...`、`PATH=...`。

**Result:** `PASS`。

**Implication:** target diagnostics MAY包含 `logicalCheckId / physicalTargetId / transport outcome / duration / bounded stdout/stderr summary or fingerprint`；MUST NOT建立 durable telemetry DB、timing gate或 scheduler。

## 6. Mutation Surface + Verification Closure

### 6.1 Required implementation surface discovered by consumer scan

Proposal至少必须覆盖这些 direct areas；最终 exact mutation declaration由 Proposal冻结：

```text
src/domain/full-test.ts
src/services/a1-write-service.ts
src/facts/formal-fact-reader.ts
src/persistence/delivery-manifest-document.ts
src/services/delivery-full-test-service.ts
src/shared/** bounded transport helper (new or minimal extraction)
src/verification/** Full Test logical-plan/aggregation boundary
scripts/verification.ts
```

H1 private `src/verification/change-selection/evidence.ts::executeBoundedNodeCommands()` MAY只做最小迁移以复用 shared transport executor；H1 capability selection、case lists、safe dedup rules MUST保持 H1-owned，不进入 shared planner。

Potential test surface：

```text
tests/unit/services/a1-write-service.test.ts
tests/unit/services/delivery-full-test-service.test.ts
tests/unit/facts/full-test-reader.test.ts
tests/unit/persistence/delivery-manifest-document.test.ts
tests/unit/external-command.test.ts
tests/unit/verification/verification-plan.test.ts
tests/unit/verification/change-selection/evidence.test.ts
relevant Delivery Full Test integration / CLI physical tests
```

### 6.2 Required canonical spec deltas discovered

至少涉及：

```text
flowkit-delivery-change-creation-and-owner-input
flowkit-formal-fact-reader-and-persistence
flowkit-core-model
flowkit-policy-engine
flowkit-change-cli-end-to-end-and-performance
flowkit-openspec-1-7-thin-integration
flowkit-runtime-foundation   # only if shared bounded transport contract needs normative clarification
```

Key current normative text requiring delta includes：

- `verification.fullTest.execution` currently requires only `kind=command`；
- terminal `checks[]` currently says physical execution order；
- public Full Test operator currently requires one `command + args + launcherMode` + `FLOWKIT_FULL_TEST_RESULT_PATH`；
- managed OpenSpec identity already requires Full Test child propagation and must remain true for every bounded target。

### 6.3 Verification closure required at Apply

I1 Apply Verification必须能回答：

```text
bounded-command-plan logical checks
→ physical target resolution
→ each spawned command typed outcome
→ logical aggregation
→ terminal result / execution-error persistence
```

Full-suite acceptance必须证明：

```text
resolveAllTests(current checkout)
=
coverage union of all full physical partitions
```

并至少证明：

```text
missing = 0
unintended duplicate = 0
heavy selector overlap = 0
new ordinary test auto-included
```

不得仅证明“planner返回了一些 targets”。

## 7. Rejected Approaches

### Increase Full Test timeout

拒绝：只是把错误的 logical-total budget从 120s 改大；H1 107 已经冻结同类问题不能靠 timeout inflation解决。

### `verify:step full` as one bounded child

拒绝：`verify:step full → npm run test:full` 仍是 long-lived wrapper，共享一个 timeout；问题只下移一层。

### Compile `verification.fullTest.plan` prose

拒绝：human plan是 coverage intent，不是 executable authority；会制造第二套不稳定 machine plan。

### FullTestExecutionV1/V2 internal generations

拒绝：`kind` discriminated union足够；existing `schemaVersion:1` / `flowkit-full-test-result-v1` 是真正 wire/persistence version，应保留。

### Mark `kind=command` historical-only

拒绝：future Delivery的真正短单命令 Full Test仍可能合法；`kind` 表达 execution shape，不表达代际。

### Delivery Contract Reset / fake Full Test failure

拒绝：current Base本来就允许 ordinary Owner `create change`；Full Test没有 terminal failed fact，不能伪造 Finding，也没有 active Change可合法 target contract-reset。

### Copy H1 planner into shared executor

拒绝：H1/G1/B1 case selectors和 safe dedup属于 Change Verification/H1-specific planning。Shared layer只允许 process transport mechanics。

### Persist machine paths or exact all-test snapshot

拒绝：`FLOWKIT_HOME/PATH/tmp` 属当前 environment；完整 test file snapshot会在 Delivery中途新增测试后过期。Current-checkout deterministic discovery + static heavy overrides更符合 authority边界。

### Dynamic heavy classifier / scheduler

拒绝：属于 04 Engineering Health/optimization，不是本 blocker closure所需。

## 8. Feasible Proposal Boundary

Explore证明可以进入 Proposal，推荐冻结六个 P0：

1. `FullTestExecutionContract` 判别联合：`command | bounded-command-plan`；existing command持续支持，03 instance迁移 bounded kind。
2. Verification-owned executable logical plan + deterministic logical→physical target mapping；human plan保持 coverage intent。
3. shared typed bounded physical executor；每个 spawned child独立 timeout/process-tree ownership；不拥有 Verification/Policy/lifecycle。
4. coverage-complete `full` partition：current-checkout discovery、ordinary deterministic fallback、static heavy overrides、无遗漏/重叠；multi-child logical steps如 typecheck也必须展开。
5. bounded-kind semantic aggregation：PASS完整 logical plan、FAILED exact prefix、execution-error不产生 terminal result；`checks[]` 改为 logical order并冻结 duration语义。
6. lifecycle/write-side closure：ordinary blocker Change admission；`authorized → not-ready` fresh-authorization invalidation；`outcome-unknown` create/activate fail closed；legacy command IPC、Windows cancellation、managed OpenSpec/Archify propagation回归。

P1仅允许：

```text
logicalCheckId
physicalTargetId
transport outcome
duration
bounded diagnostics
```

Proposal不得扩到 04。

## 9. Open Decisions for Proposal

Proposal还需要精确冻结但已不存在 feasibility blocker的事项：

1. `bounded-command-plan` 的 closed persisted shape：如何同时表达 ordinary command targets与 current-checkout deterministic Node-test partition，而不持久化 machine paths/test snapshot；
2. shared bounded executor的最小 module location/API；是否由 H1 private helper迁移为该 shared transport consumer；
3. 当前 03 Manifest从 `kind=command` 到 bounded kind的 exact mutation与 backward-compatible reader/writer tests；
4. 最终 static heavy override set和 target IDs；这些是 source-controlled execution mapping，不是 runtime timing classifier；
5. bounded target diagnostics保留多少 stdout/stderr summary/fingerprint，确保有用但不形成 Evidence/telemetry platform。

这些都可在当前已证明的 authority/scope内由 Proposal冻结，不需要新的 Owner architecture decision。
