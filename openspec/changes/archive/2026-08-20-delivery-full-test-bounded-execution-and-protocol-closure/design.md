## Context

I1 在 H1 checkpoint `4f3e0f44a3a1254670a99f1428b70fc1e2c6c8f2` 后创建。当前 Delivery 没有合法 terminal Full Test result；I1 是 Owner-created `required=true` blocker Change，不是 failed Full Test corrective Change。116 Explore / 117 Review 已批准以下根因：

```text
ONE logical Delivery Full Test authority
→ ONE npm run verify:full child
→ ONE 120000ms transport budget
→ child末尾才发布 result.json protocol
```

而真实 logical checks 已是：

```text
quality → typecheck → lint → build → openspec-all → full
```

H1 已证明 logical authority可以聚合多个 bounded physical commands；I1 将该原则应用到 Delivery Full Test durable contract，但保持 Verification、Owner、Policy 与 process transport authority分离。

## Owner Contract Reset / Fresh Proposal Generation

Owner 在 122 formal Change Verification failed 后明确执行 Contract Reset：

```text
old 120 revise-propose / 121 review-propose / 122 apply generation
→ abandoned for current lineage

116 explore / 117 review-explore
→ retained as approved discovery handoff

current boundary
→ fresh propose
```

旧 122 completed Apply/result/failed Verification 只作为 immutable historical evidence；fresh Proposal 不把 122 production/test bytes 当成 current candidate authority，也不继承 121 approval。Reset 不改变已经 approved 的 bounded Delivery Full Test authority、H1 `1 smoke + 26 phases`、Full Test no-Run / Owner authority。

## Pre-Proposal Formal Verification Closure Proof

本次 fresh Proposal 在再次请求 Owner authorize apply 之前，对 122 actualChangeSet 暴露的两个 formal failure 做了 bounded counterfactual proof。

### Proof A — `tests-execution` 是真实 affected，不得从 selection 删除

**Question:** I1 是否真实影响 `tests-execution`，还是 selection/module ownership 误选？

**Evidence:**

- I1 必须修改 `src/facts/formal-fact-reader.ts` 与 execution/write-side services；F1 checkpoint boundary service 直接消费 formal facts / Policy / persistence，因此 `tests-execution` 是真实 affected consumer。
- 122 与 exact untouched base `4f3e0f44a3a1254670a99f1428b70fc1e2c6c8f2` 都能复现 `tests/unit/services/f1-checkpoint-boundary-service.test.ts = 5 tests / 2 pass / 3 fail`。
- 根因不是 I1 regression，而是 historical `g1PreCheckpointFixture()` 把 current `HEAD/HEAD^` 当作 G1 checkpoint/base；current HEAD 已是 H1 checkpoint。Git history 中 G1 checkpoint 仍有正式 boundary identity。
- disposable prototype 将 fixture 改为按正式 Git commit subject `chore(flowkit): checkpoint sync-resume-and-single-action-agent-adapter` 定位 exact G1 checkpoint，再取其 parent；同一 test 变为 **5/5 PASS**。

**Result:** PASS。`tests-execution` 必须保留在 formal selection；最小 mutation surface需要包含该 stale historical fixture，而不是删除 selection 或豁免 base failure。

### Proof B — `tests-cli` timeout 来自 capability-coupled physical route，而不是 120s 太短

**Question:** I1 为什么 selected `tests-cli` 仍走一个 monolithic 120s Node process？

**Evidence:**

- `tests-cli` logical selector固定包含 diagnostic、G1 Change、G1 Adapter、H1 等 heavy targets。
- current executor只有在 `selection.capabilityIds` 包含 H1 capability 时才启用已有 bounded CLI fanout；I1 未携带 H1 capability，因此 122 selected 同一 logical check/targets 却退回 monolithic route。
- archived H1 formal Verification 已证明 existing bounded `tests-cli/tests-execution` mapping 可工作；fresh prototype仅把 activation 从“current Change carries H1 capability”提升为“logical check selected”，不新增 dynamic classification。
- non-H1 `tests-cli` 仍完整执行 legacy diagnostic process target；H1-selected 时才保留现有 dedup。

**Result:** PASS。修复点是 physical execution contract activation，不是 timeout inflation；generic timing/observability 继续留给 04。

### Proof C — H1 physical mapping 在 I1 candidate-shaped runtime 中完整可执行

**Question:** 将 `tests-cli` bounded mapping用于 I1 时，H1 default semantics 是否会被漏掉或单 target超时？

**Evidence:**

- I1 122 candidate-shaped repo 上，H1 installed-runner diagnostics smoke独立执行 **PASS，约 7.4s**。
- 同一 H1 state root 下 `FLOWKIT_H1_FORMAL_PHASE=1..26` 已逐 phase执行，**26/26 PASS**；observed longest phase约 13s，均低于 existing `120000ms` per-target timeout。
- phase 12 首次分段 proof 因 harness 未传 `FLOWKIT_HOME` fail closed；补回正式 managed `FLOWKIT_HOME` 后，同一 phase / 同一 state root PASS。该事实证明 managed-tool env 是真实 physical prerequisite，而不是允许省略的 fixture convenience。

**Result:** PASS。Evidence Boundary覆盖 H1 `1 smoke + 26 phases` required physical boundary，不需要提高 timeout。

### Proof D — sentinel 必须证明 target reachability

**Question:** bounded fail-fast 后，existing Verification sentinel tests 是否真的证明目标 target 被执行？

**Evidence:**

- 4 个旧 synthetic regressions依赖 monolithic command representation；bounded fail-fast 后会在缺失的前序 exact target处提前终止，因此旧断言只证明“selection/command包含路径”，没有证明 sentinel target实际到达。
- disposable prototype为 mandatory predecessor targets建立 passing fixture，并让 G1 env/sentinel 与 A1/B1/F1 execution sentinels在目标位置真实执行；Reset相关 4 cases **4/4 PASS**。

**Result:** PASS。fresh Apply mutation surface必须包含 `tests/unit/verification/change-selection/evidence.test.ts`，把 physical evidence contract从字符串出现提升到 target reachability。

### Closure conclusion

Fresh Proposal冻结以下链：

```text
I1 cumulative actualChangeSet
→ existing deterministic logical selection（仍包含 tests-cli + tests-execution）
→ logical-check-owned static bounded physical mapping
→ repaired historical G1 fixture + target-reachability sentinels
→ formal Change Verification under unchanged per-target 120s contract
```

不通过删除 affected logical checks、不通过提高 timeout、不通过 generic scheduler/timing platform获得 PASS。

## Goals / Non-Goals

### Goals

- 一个 Owner authorization、一个 Delivery Full Test behavior、一个 Verification-owned terminal result；
- 每个真实 spawned child独立 hard timeout/process-tree ownership；
- current 03 Full Test在 detached/canonical-shaped environment中不依赖单一长 wrapper；
- command兼容、bounded plan durable/readable/resumable；
- PASS/FAILED/execution-error语义闭合；
- Full Test executable candidate改变后旧 authorization不会被复用；
- outcome-unknown process-tree ambiguity不能被 create/activate绕过；
- managed OpenSpec/Archify identity继续跨 nested target传播。

### Non-Goals

- timeout inflation、动态 timeout、parallel scheduler、runtime heavy classifier；
- generic Verification/timing/telemetry platform；
- H1 case planner泛化或 H1 reopen；
- quality warnings cleanup、broad test refactor/package pruning；
-新的 Full Test protocol schema、attempt ledger、recovery engine；
-真实03 Actual/Compare/Finalize。

## Decisions

### 1. FullTestExecutionContract 使用 execution-shape discriminated union

共同 base保持：

```ts
interface FullTestExecutionBase {
  id: string;
  scope: 'delivery';
  resultProtocol: 'flowkit-full-test-result-v1';
  resultAuthority: 'verification';
  expectedTerminalStatuses: readonly ['passed', 'failed'];
}
```

合法 shape：

```ts
type FullTestExecutionContract =
  | CommandFullTestExecution
  | BoundedCommandPlanFullTestExecution;
```

`kind=command` 保持现有：

```text
command
args[]
launcherMode=direct|npm-shim
timeoutMs
```

它不是 historical-only；真正短的单命令 Full Test future Delivery仍 MAY选择该 shape。

`kind=bounded-command-plan` 持久化：

```text
logicalChecks[]:
  id
  resolverId
  perTargetTimeoutMs
```

Current 03 frozen logical order/resolver mapping：

```text
quality      → flowkit-quality
 typecheck    → flowkit-typecheck
lint         → flowkit-lint
build        → flowkit-build
openspec-all → flowkit-openspec-all
full         → flowkit-full-tests
```

所有 `perTargetTimeoutMs=120000`。Resolver IDs 是 source-controlled closed execution mapping，不是 runtime Registry；unknown resolver MUST fail closed。Manifest不持久化当前机器绝对 command path、`FLOWKIT_HOME/PATH/tmp` 或 current test file snapshot。

**Rejected:** `FullTestExecutionV1/V2`。`kind` 足够表达 shape；existing `schemaVersion:1`/`flowkit-full-test-result-v1` 是真实 persistence/wire protocol版本并继续保留。

### 2. Verification owns logical interpretation；Delivery service只拥有 lifecycle/persistence

New bounded execution path：

```text
Delivery Full Test service
→ validate Policy/Owner gate + persisted kind
→ Verification-owned full-test executable-plan/aggregator
→ resolver produces exact physical targets from current checkout
→ shared bounded transport executes targets
→ Verification aggregator interprets exited 0/nonzero
→ FullTestProtocolPayload
→ service atomically persists result | executionBlock
```

Authority split：

```text
shared external-command
→ process transport only

Verification full-test module
→ logical check ids/order
→ physical resolver mapping
→ exited 0/nonzero => passed/failed
→ fail-fast + protocol payload

Delivery Full Test service
→ lifecycle gate
→ invoke
→ persist result/executionBlock
```

bounded path MUST NOT使用 `FLOWKIT_FULL_TEST_RESULT_PATH`。Legacy `kind=command`继续 spawn one persisted command、consume child result IPC并执行 child/protocol coherence validation。

### 3. shared bounded executor只扩 existing external-command transport

`src/shared/external-command.ts` 增加 ordered bounded helper，输入已经解析好的 physical targets；每个 target最终调用 existing `runCommand()`，因此继承：

```text
spawn-failed
exited
timed-out-cancelled
outcome-unknown
Windows whole-process-tree cancellation
ComSpec/PowerShell/direct launcher semantics
bounded stdout/stderr
```

helper只负责 ordered execution、first transport/nonzero stop所需的 raw outcome collection；它 MUST NOT把 nonzero解释成 Verification failed，也 MUST NOT决定 Full Test Policy。

Target execution result至少携带：

```text
logicalCheckId
physicalTargetId
outcome
durationMs
bounded stdout/stderr/diagnostic context
```

P1 diagnostics属于 current execution response/blocked summary；不建立 durable telemetry/evidence store。

### 4. Current 03 logical→physical resolver closure

Physical resolver在每次 bounded Full Test开始时基于 current checkout重新解析。

`quality`：

```text
flowkit-quality
→ node --import tsx scripts/quality.ts
```

`typecheck` 必须展开：

```text
flowkit-typecheck/source
→ node node_modules/typescript/bin/tsc --noEmit

flowkit-typecheck/tests
→ node node_modules/typescript/bin/tsc --noEmit -p tsconfig.test.json
```

不得再 spawn `verify:step typecheck` wrapper。

`lint`：one ESLint child。

`build`：one TypeScript build child。

`openspec-all`：通过 current managed OpenSpec resolver得到 `process.execPath + exact openspec.js + validate --all --strict --no-interactive`；target env从 current `FLOWKIT_HOME` propagation重新构造。

`full`：

```text
resolveAllTests(current checkout)
→ ordinary file-per-worker fallback
→ 5 static heavy overrides
```

Frozen heavy override files：

```text
tests/integration/diagnostic-cli-process.test.ts
tests/integration/g1-change-cli-end-to-end.test.ts
tests/integration/g1-sync-resume-and-single-action-agent-adapter.test.ts
tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts
tests/unit/services/b1-run-execution-service.test.ts
```

Partitions：

- diagnostic：3 existing test titles，每 case独立 worker；
- G1 Change：7 existing test titles，每 case独立 worker；
- G1 Adapter：3 existing test titles，每 case独立 worker；
- H1：默认文件包含两个独立 cases：`physically installs the candidate runner and exercises fresh-process diagnostics without source-workspace runtime` 作为 1 个独立 bounded smoke target；`uses one independently installed Flowkit distribution to manage a future Delivery end to end and resume it from a fresh checkout` 作为 E2E case，并由 `FLOWKIT_H1_FORMAL_PHASE=1..26` 的 26 个 targets等价分解其内部 `runSelfHostingPhase()` loop；FORMAL_PHASE branch的 `return` 不得使默认 smoke case消失；
- B1：existing top-level suites + `B1 preparation and admission` existing bounded case groups，与 H1已证明 partition保持一致；
- ordinary：其余 discovered test file每文件一个 `node --import tsx --test --test-concurrency=1 <file>` target。

Resolver必须在执行前证明：

```text
discovered files == partition file union
missing = 0
unintended duplicate = 0
heavy file matched exactly one override
each heavy override has an explicit default-case/selector semantic map
heavy selectors are non-overlap and title/branch-closed
overridden default cases/assertion semantics are all consumed by bounded targets
H1 default cases == {installed-runner smoke, future-Delivery E2E}; smoke -> 1 target, E2E -> phases 1..26
new ordinary file automatically enters fallback
```

任何 closure failure是 execution-error，MUST NOT开始部分 Full Test。不得使用历史 timing自动分类 heavy target。

### 5. Full Test protocol保持 v1，但 bounded kind增加 plan-relative semantic validation

Structural parser继续验证 existing `flowkit-full-test-result-v1` fields/hash domain；bounded path另外验证 executable logical plan。

PASS：

```text
payload.status = passed
checks == complete frozen logical plan
exact order
all checks passed
```

FAILED：

```text
payload.status = failed
checks == non-empty exact frozen logical prefix
all prior checks passed
last check failed
```

一个 logical check拥有多个 physical targets时，只要 target `exited` nonzero，该 logical check terminal为 failed并触发 fail-fast；physical target detail不进入 `checks[]`。

execution-error：

```text
spawn-failed
timed-out-cancelled
outcome-unknown
resolver/coverage closure error
protocol/aggregation inconsistency
```

均不产生 terminal Full Test result/ref。

`checks[]` 的 normative order改为 **frozen logical check order**，不是 physical order。

Duration：

```text
physicalTarget.durationMs = one child wall duration
logicalCheck.durationMs = first target start → logical terminal/fail-fast wall duration
totalDurationMs = whole Full Test orchestration wall duration
```

不要求 `totalDurationMs == sum(check.durationMs)`。

Legacy `kind=command` 没有 bounded logical plan binding，继续使用 existing structural protocol + child exit/status coherence；不对历史 command结果倒推新的 six-check plan。

### 6. lifecycle/write-side closure：required work使旧 authorized qualification失效

`createChange()` 在 mutation前读取 current Full Test facts。

若：

```text
raw fullTestStatus=authorized
executionBlock absent
new Change.required=true
```

则同一次 atomic Manifest publication必须：

```text
append planned Change
append create-change Owner provenance
authorized → not-ready
```

旧 `authorize-full-test` Owner record保留历史；不得删除/改写。此状态没有 terminal result，因此无需转移 failed/pass result authority。

新 required Change completed + checkpointed 后 pure readiness投影恢复：

```text
raw not-ready
→ effective awaiting-user-decision
→ fresh authorize-full-test
```

历史 authorization MUST NOT自动授权新 candidate。

若 current `executionBlock.reason=outcome-unknown`：

```text
createChange(any ordinary Change) → fail closed
activate(any planned Change) → fail closed
block unchanged
```

原因是旧 owned process tree是否仍存活未知。I1 不增加解除该 block的新 recovery机制。

Current I1 creation本身发生在 canonical effective `awaiting-user-decision`，因此不需要 retroactive reset/failure Finding。

### 7. managed environment每 target重建，不进入 durable contract

bounded target resolver必须从 current process/repository facts构造 env：

- project standard env清理 transient npm vars；
- current managed OpenSpec通过 `FLOWKIT_HOME` exact identity传播；
- full Node-test workers继承 current `FLOWKIT_HOME`，使其中 Archify/OpenSpec consumers重新解析 exact managed tool home；
- legacy compatibility仅按既有 resolver precedence存在。

Manifest只保存 stable resolver/timeout intent，不保存 `D:\...`、`/tmp/...`、PATH或resolved executable absolute paths。

### 8. Current 03 migration与 retry semantics

I1 Apply将 current 03 Manifest的 execution从：

```text
kind=command
npm run verify:full
timeoutMs=120000
```

迁移为上述 six-logical-check bounded plan。Human `verification.fullTest.plan` prose不改变。

I1 checkpoint后 Delivery readiness要求 fresh Owner authorization。之后：

- physical target `exited` nonzero → Verification failed terminal prefix → Full Test `failed`；
- `spawn-failed` / proven `timed-out-cancelled` → no terminal result，raw保持 `authorized`，fresh explicit re-entry MAY重试；
- `outcome-unknown` → raw保持 `authorized` + persist executionBlock，禁止重入/create/activate，直到既有可信恢复边界关闭；
- bounded orchestrator本身无额外 120s总 budget。

### 9. Formal Change Verification physical execution属于 logical check contract

I1 不改变 logical selection identity；它修复 selected logical check到physical execution的既有 executor binding。

对于 `tests-cli`：

```text
logical check selected
→ always use static bounded CLI fanout
→ cheap compatible batch
→ diagnostic real-process target
→ G1 Change named cases
→ G1 Adapter named cases
→ H1 installed-runner smoke
→ H1 phases 1..26
```

只有 H1 capability同样 selected时，MAY 使用既有 diagnostic legacy-installed-smoke dedup；non-H1 selection不得因为 bounded化而减少原 diagnostic coverage。

对于 `tests-execution`：

```text
logical check selected
→ always use existing static per-file fanout
→ existing B1 heavy suite/case fanout
```

该 mapping不读取 historical timing、不动态分类、不并行调度，也不把每 target timeout从120s提高。physical mapping/command representation继续不是 logical selection identity。

Historical fixture必须绑定其声称测试的正式 Git boundary；later HEAD不得被当成 historical G1 checkpoint。Verification sentinel fixture必须让所有先于目标的 mandatory bounded targets显式 PASS，才能声称目标 sentinel证明 physical closure。

## Verification / Acceptance

Apply必须至少证明：

1. reader/writer round-trip command与bounded两种 shape；unknown resolver/duplicate logical id/invalid timeout fail closed；
2. current 03 Manifest exact migration为 six-check bounded plan且 human plan不被编译；
3. `authorized + required create` 原子变 `not-ready`，old Owner record保留；outcome-unknown create/activate byte-identical fail closed；
4. shared transport对 exited/spawn-failed/timed-out-cancelled/outcome-unknown保持 typed distinction，Windows process-tree regressions不回归；
5. typecheck确实产生两个独立 physical targets，full resolver没有 `npm run test:full`/`verify:step full` wrapper；
6. full current-checkout coverage closure：missing=0、unintended duplicate=0、heavy overlap=0；5个 heavy overrides逐一证明 default case/selector semantic mapping闭合；H1 默认2 cases明确映射为 1 smoke target + E2E 26 phases，且 smoke 独立 assertions不丢失；synthetic new ordinary test自动进入 fallback；
7. PASS full logical set、FAILED exact prefix、incomplete PASS/arbitrary ids rejected；execution-error无 terminal result；
8. bounded service physical integration在 persisted plan下执行且不创建 Run/NNN；legacy command IPC仍通过；
9. nested Full Test workers继续解析 same managed OpenSpec/Archify identity；
10. `tests-execution` 保持 selected；G1 checkpoint fixture绑定正式 historical Git boundary且 focused regression 5/5 PASS；
11. selected `tests-cli/tests-execution` 的 bounded mapping不依赖 current Change H1 capability；non-H1 diagnostic coverage不减少；
12. I1 candidate-shaped H1 installed-runner smoke + phases 1..26 physical proof通过且不提高120s per-target timeout；
13. Verification sentinels在 passing mandatory predecessors之后真实到达目标 target；
14. targeted regressions、typecheck/lint/build、OpenSpec current/all strict、formal I1 Change Verification通过；真实03 Actual保持 absent。

## Risks / Trade-offs

- file-per-worker会增加 process count与总 wall time；I1接受该成本以获得 deterministic process ownership，不在本 Change优化并行/批次大小。
- static heavy selectors依赖 test titles/branch markers；title或branch drift必须通过 closure regression fail closed，而不是静默少跑。File-level union只能证明路径覆盖，不能替代 overridden heavy file 的 default case/assertion semantic closure。
- bounded resolver与 `scripts/verification.ts` 可能形成 duplicate logical plan；Apply必须让 current script technical `verify:full/verify:step`复用同一 logical IDs/target definitions或至少由单一 Verification module导出，不建立第二 executable authority。
- outcome-unknown create/activate guard可能阻塞人工“先修代码再恢复”；这是有意 fail closed，因为 process-tree state未知。Recovery扩展另行 Change。

## Migration Plan

1. 扩 domain/Manifest reader-writer支持 discriminated execution contract并为 current 03写入 bounded plan。
2. 在 Verification-owned module建立 six logical checks、closed resolver IDs、physical target resolution/coverage closure与 semantic aggregation；`scripts/verification.ts`消费同一 logical plan定义，避免双定义。
3. 扩 shared external-command ordered bounded transport helper，保持 typed outcome与 platform cancellation语义。
4. 更新 Delivery Full Test service：command走 legacy IPC；bounded走 in-process Verification aggregator，无 child result.json IPC。
5. 修 A1 create/activate write-side invalidation/guard；增加 persistence/Policy regressions。
6. 将 selected `tests-cli/tests-execution` 的 existing bounded physical mapping从 H1-capability conditional activation改为 logical-check-owned static execution contract；修复 G1 historical checkpoint fixture与 target-reachability sentinel regressions。
7. 完成 physical closure/managed tools/CLI integration regressions与 formal Change Verification。
8. review-apply approved后 archive/checkpoint I1；checkpoint后 Delivery重新投影 awaiting-user-decision，等待 Owner fresh Full Test authorization。真实 Full Test PASS之前不生成 Actual。

## flowkitMutationScope

```json
{
  "schemaVersion": 1,
  "actions": {
    "apply": {
      "selectors": [
        { "kind": "exact", "path": "openspec/changes/delivery-full-test-bounded-execution-and-protocol-closure/tasks.md" },
        { "kind": "exact", "path": "openspec/changes/delivery-full-test-bounded-execution-and-protocol-closure/verification.md" },
        { "kind": "exact", "path": "openspec/delivery-groups/20260817-01-delivery-execution-loop.yaml" },
        { "kind": "exact", "path": "scripts/verification.ts" },
        { "kind": "exact", "path": "src/domain/a1-types.ts" },
        { "kind": "exact", "path": "src/domain/full-test.ts" },
        { "kind": "exact", "path": "src/facts/formal-fact-reader.ts" },
        { "kind": "exact", "path": "src/persistence/delivery-manifest-document.ts" },
        { "kind": "exact", "path": "src/services/a1-write-service.ts" },
        { "kind": "exact", "path": "src/services/delivery-full-test-service.ts" },
        { "kind": "exact", "path": "src/shared/external-command.ts" },
        { "kind": "exact", "path": "src/verification/change-selection/evidence.ts" },
        { "kind": "exact", "path": "src/verification/change-selection/module-map.ts" },
        { "kind": "prefix", "path": "src/verification/full-test" },
        { "kind": "exact", "path": "tests/integration/a1-delivery-readiness-and-full-test-behavior.test.ts" },
        { "kind": "exact", "path": "tests/unit/external-command.test.ts" },
        { "kind": "exact", "path": "tests/unit/facts/full-test-reader.test.ts" },
        { "kind": "exact", "path": "tests/unit/persistence/delivery-manifest-document.test.ts" },
        { "kind": "exact", "path": "tests/unit/services/a1-write-service.test.ts" },
        { "kind": "exact", "path": "tests/unit/services/delivery-full-test-service.test.ts" },
        { "kind": "exact", "path": "tests/unit/services/f1-checkpoint-boundary-service.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/evidence.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/module-map.test.ts" },
        { "kind": "prefix", "path": "tests/unit/verification/full-test" },
        { "kind": "exact", "path": "tests/unit/verification/verification-plan.test.ts" }
      ]
    },
    "revise-apply": {
      "selectors": [
        { "kind": "exact", "path": "openspec/changes/delivery-full-test-bounded-execution-and-protocol-closure/tasks.md" },
        { "kind": "exact", "path": "openspec/changes/delivery-full-test-bounded-execution-and-protocol-closure/verification.md" },
        { "kind": "exact", "path": "openspec/delivery-groups/20260817-01-delivery-execution-loop.yaml" },
        { "kind": "exact", "path": "scripts/verification.ts" },
        { "kind": "exact", "path": "src/domain/a1-types.ts" },
        { "kind": "exact", "path": "src/domain/full-test.ts" },
        { "kind": "exact", "path": "src/facts/formal-fact-reader.ts" },
        { "kind": "exact", "path": "src/persistence/delivery-manifest-document.ts" },
        { "kind": "exact", "path": "src/services/a1-write-service.ts" },
        { "kind": "exact", "path": "src/services/delivery-full-test-service.ts" },
        { "kind": "exact", "path": "src/shared/external-command.ts" },
        { "kind": "exact", "path": "src/verification/change-selection/evidence.ts" },
        { "kind": "exact", "path": "src/verification/change-selection/module-map.ts" },
        { "kind": "prefix", "path": "src/verification/full-test" },
        { "kind": "exact", "path": "tests/integration/a1-delivery-readiness-and-full-test-behavior.test.ts" },
        { "kind": "exact", "path": "tests/unit/external-command.test.ts" },
        { "kind": "exact", "path": "tests/unit/facts/full-test-reader.test.ts" },
        { "kind": "exact", "path": "tests/unit/persistence/delivery-manifest-document.test.ts" },
        { "kind": "exact", "path": "tests/unit/services/a1-write-service.test.ts" },
        { "kind": "exact", "path": "tests/unit/services/delivery-full-test-service.test.ts" },
        { "kind": "exact", "path": "tests/unit/services/f1-checkpoint-boundary-service.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/evidence.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/module-map.test.ts" },
        { "kind": "prefix", "path": "tests/unit/verification/full-test" },
        { "kind": "exact", "path": "tests/unit/verification/verification-plan.test.ts" }
      ]
    }
  }
}
```
