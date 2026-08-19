## Context

见 `proposal.md` 与已批准的 `explore.md`。当前 canonical Base 已有 A1→G1 completed + checkpointed：Delivery Ready/Full Test、Delivery Finding、managed OpenSpec/Archify、Architecture Current/Planned/Actual/Compare、Finalize/Delivery Final、repository-only resume 与 single-action Agent Adapter均已有各自 authority和 targeted regressions。H1 的 current gap 不是单项能力缺失，而是 stable local distribution + future-Delivery-shaped composition 尚未形成一个 physical self-hosting acceptance；同时 checkpoint handoff虽已有正确 read-only authority，却只输出 generic EOF permission，fresh Executor仍需聊天/handoff补充 exact candidate/path/operation plan。

## Goals / Non-Goals

**Goals:**

- 证明 stable local distribution 在 fresh consumer/fresh checkout 中可运行，且 managed external tools不依赖 ambient PATH。
- 通过一个 disposable future-Delivery-shaped E2E 组合证明 A1→G1 的实际生命周期、Owner/Reviewer/Verification/Git/Archify authority与fresh resume。
- 把现有 F1 checkpoint handoff最小扩展为 public read-only exact execution plan，让 Executor不依赖聊天即可执行 authorized mechanics。
- 给 H1 self-hosting E2E建立 closed capability/module ownership与正式 physical Verification route。
- 记录 H1 performance/cost facts，但不把 observation升级为新 authority。

**Non-Goals:**

- write-side checkpoint command、Checkpoint Adapter/Run、automatic stage/commit/push/merge/rebase。
- auto-loop、automatic Author↔Reviewer、Provider/Agent/Skill/Tool Registry、automatic Owner decisions。
- 修改 Full Test/Finalize/Architecture/G1 adapter authority或持久化 schema。
- 在 H1 Apply期间生成真实 03 Actual/Final。
- package pruning、Verification timeout redesign、broad structural refactor或其他04 Engineering Health内容。

## Decisions

### 1. Stable Runner acceptance 使用 local distribution + independent consumer，不引入 registry authority

H1 acceptance 采用 source-controlled candidate 执行 `npm run build` 后形成 local package（首选 `npm pack`，等价本地 distribution fixture亦可），安装到独立临时 consumer。**后续 H1 self-hosting E2E 的 Flowkit execution subject 就是该 independent consumer 中的 installed distribution，而不是 source workspace runtime。**

凡当前产品已经存在 stable CLI/runner surface 的 Flowkit-owned boundary，fixture 必须从 independent consumer 调用 installed `flowkit` 对 fresh target repository执行，包括适用的：

```text
--version
status / next / doctor / resume-context
create delivery / create change / activate
owner record
explore / review / revise / propose / apply / archive
architecture render / compare
delivery full-test
delivery finalize
delivery final-handoff
checkpoint-handoff（H1新增的 read-only facade）
```

source workspace `src/**`、source `dist/**` 与 source `node_modules` 不得作为 disposable target 的隐藏第二 runtime，也不得替代上述 Flowkit-owned boundary。External tools通过测试进程显式传入 exact `FLOWKIT_HOME` managed distributions；不得通过 ambient PATH弥补缺失。npm registry publish/tag不是 acceptance，也不是 Git authority。

source-side test harness 只可以：

```text
构造 disposable fixture / external role input bytes
启动 independent consumer 中的 installed runner
断言结果
在 Owner authorize-checkpoint / final-handoff 之后扮演 Executor 做机械 Git 操作
```

它不得直接调用 source workspace `src/services` / `src/policy` 来替代 prepare/admit、Owner record、Full Test、Finalize、diagnostics、Architecture 或 handoff 等 Flowkit-owned boundary。

**Rejected:** 把 source workspace 中 `node dist/bin/flowkit.js` 能运行，或用 source `src/services` 拼出完整 Delivery，当成 stable self-hosting proof；两者都没有覆盖 installed-distribution acceptance boundary。

### 2. H1 E2E 使用同一个 installed-distribution boundary 驱动 future-Delivery-shaped disposable Git repository

新增一个 H1-owned integration target，使用不同于03的固定 synthetic identity（不得依赖 current H1/Base SHA），在 disposable Git repository中完成：

```text
independent consumer installed Flowkit
↓
Delivery Start
→ Current System Architecture
→ Planned Architecture
→ Change A normal lifecycle
→ Owner authorize-checkpoint
→ read-only checkpoint-handoff
→ Executor fixture执行 bounded EOF-only mechanics + Git checkpoint
→ Change B normal lifecycle
→ checkpoint
→ Delivery Ready
→ explicit Owner authorize-full-test
→ Delivery Full Test (no Run)
→ independently author Actual from final fixture repository
→ managed Archify validate + installed Flowkit architecture render/compare boundary
→ architecture acceptance / SystemArchitectureRef promotion facts
→ explicit Owner authorize-finalize
→ Finalize (no Run)
→ delivery final-handoff
→ Executor fixture形成 Delivery Final Git boundary
→ fresh clone
→ same installed Flowkit distribution resume
```

凡已有 public stable CLI/runner surface 的 Flowkit-owned lifecycle步骤，必须由 independent consumer 中 installed distribution 执行，不能绕回 source workspace `src/**` / source `dist/**` / source `node_modules`。

G1 `runSingleActionAgent()` 当前没有 CLI surface，因此 H1 **不新增 Agent CLI / Registry / auto-loop**。至少一个 Change Action 必须从 independent consumer 已安装 package 的 built `dist/services/g1-single-action-agent-adapter.js`（或等价 installed-package built artifact boundary）消费 `runSingleActionAgent()`，证明 exactly-one provider invocation + return-control；导入路径必须解析到 independent consumer 的 installed package root，不得指向 source workspace。

Fixture中的 Reviewer result/Owner facts必须通过 installed Flowkit 已有 writer/admission boundary或明确 external test-role input进入，而不能由 harness直接修改 Flowkit内部 state 来伪造 authority。OpenSpec archive、Archify validate/compare和Git commit必须在 disposable repository中真实发生。

Fresh clone / resume 必须继续使用**同一 installed distribution**，且关闭 source workspace/session/chat 后仍成立。

**Rejected:** 为了“全自动演示”在 runner内部 `while(next)`；这会把 H1变成第二 orchestrator。

**Rejected:** 因 G1 adapter 暂无 CLI 就允许其余 lifecycle 回退到 source services；该例外只允许消费 independent consumer 已安装 package 的 built adapter artifact。

### 3. Public checkpoint handoff 只增加 exact read-only plan，不增加 write-side capability

Stable CLI增加：

```text
flowkit checkpoint-handoff --delivery <delivery-id>
```

该命令只调用现有 `prepareCheckpointBoundaryHandoff()` 的扩展 projection并输出 JSON。它不接受 `--execute/--commit/--push` 等 write-side option。

Handoff shape最小扩展为：

```text
deliveryId
changeId
ownerAuthorizationRef
baseRevision
subject
trailers[]
candidatePaths[]                 # sorted current dirty/untracked candidate paths
normalization.operations[]       # exact path + closed EOF-only operations
preflight[]                      # git diff --check / git diff --cached --check
```

其中 `normalization.operations[]` 的 operation集合只能是：

```text
collapse-redundant-eof-blank-lines
ensure-exactly-one-final-newline
```

无 operation 的 candidate path不必出现在 normalization list。

#### Candidate boundary derivation

Service从 repository/formal facts read-only推导 allowed candidate closure：

1. 当前唯一 completed/uncheckpointed Change与exact `authorize-checkpoint` Owner fact；
2. 当前 Delivery Manifest path；
3. 该 Change `.flowkit/runs/<delivery>/<change>/**` current Run corpus；
4. unique archived OpenSpec Change tree；
5. archived delta specs映射到 `openspec/specs/<capability>/spec.md` canonical merge targets；
6. final successful Apply/revise-apply context中的 approved Design-derived MutationDeclaration selectors，用它们匹配当前 dirty production/test paths；
7. current Git worktree/index facts与current HEAD `baseRevision`。

Service读取 current Git candidate paths后逐项证明属于上述 closure；任何无法证明的 dirty path fail closed。Index在 handoff阶段必须为空，避免 read-only plan掩盖已暂存未知 bytes。

对 candidate/archive-touched text file，service只读检查 EOF/trailing hygiene：

- redundant terminal blank lines → 输出exact EOF-only operation；
- already exactly-one final newline → 无 normalization operation；
- trailing space/tab、内部/semantic drift无法仅由 EOF规则解释 → fail closed；
- binary/unsupported text classification不得被 broad formatter处理；若需要 normalization而无法安全证明，fail closed。

Handoff调用前后 worktree/index/history/Owner facts/Run corpus必须 byte-for-byte不因该命令改变。

**Rejected:** archive success后自动 formatter；archive authority不覆盖checkpoint hygiene。

**Rejected:** handoff内部执行 EOF mutation或stage；它会把 read-side control-plane施工单变成 write-side Checkpoint Adapter。

### 4. Delivery final-handoff 与 checkpoint-handoff 共享架构原则，但不抽象成 generic Git-boundary platform

二者共同模式是：

```text
Flowkit read formal facts
→ validate boundary
→ derive deterministic read-only handoff
→ STOP

Executor
→ actual Git mechanics
```

H1不创建 generic `GitBoundaryHandoff` registry/framework。只保持两个已有业务边界各自的typed output和tests；如有共享低层Git read helper，只能在当前 correctness需要时最小抽取。

### 5. H1 Verification 增加一个 capability 与一个 physical E2E target，复用现有 logical checks

新增 capability id：

```text
flowkit-stable-runner-and-self-hosting-acceptance
```

把 H1 target ownership放入现有 modules：

- `cli-diagnostics`: public checkpoint-handoff CLI + H1 integration target；
- `execution`: checkpoint handoff service与service regressions；
- `verification-selection`: module/evidence mapping更新与H1 physical resolver。

不新增 logical check。`tests-cli` physical resolver加入：

```text
tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts
```

如果 expected path dependency closure同时触达execution/verification modules，formal selection自然包含 `tests-execution`、`tests-verification`、`typecheck`及真实需要的其他现有 checks。

Proposal阶段必须用 expected production/test paths执行 production `buildVerificationSelection()`，确认 capabilityRelation=`matched`；Apply阶段必须用 disposable sentinel让 H1 integration target fail，并证明 formally selected `tests-cli` non-zero，随后恢复真实 target并完成正式 Change Verification。

### 6. H1 performance/cost observation只存在于 test/report output

H1 E2E收集：

```text
local package compressed/unpacked/files
Action count / Review rounds
prepare/resume latency
Run corpus files/bytes
OpenSpec process count
Archify process count
Change Verification wall time
Delivery Full Test wall time
architecture render/compare wall time
longest observed phase
```

这些值只写 test stdout/temporary report，或作为 Reviewer可读的verification summary文本；不新增 repository telemetry JSON、Manifest字段、Run sidecar或Policy gate。

### 7. H1 activation与真实03 closure保持严格时序

当前 detached H1 implementation不 self-upgrade。只有：

```text
H1 review-apply approved
→ Owner archive
→ archive completed
→ Owner authorize-checkpoint
→ canonical Executor exact materialize + checkpoint
```

之后 prospective stable runner/checkpoint-handoff semantics才成为 canonical。然后真实03才可：

```text
Delivery Ready
→ Owner Full Test
→ PASS
→ real 03 Actual
→ Planned vs Actual
→ architecture acceptance
→ Owner Finalize
→ Delivery Final
```

H1 Apply/E2E不得写真实03 Actual。

### 8. Owner Reset：H1 detached Verification 使用 bounded physical fan-out，不改变 logical authority

108 `revise-apply` 已把完整 H1 self-hosting branch 接入正式 `tests-cli`，但 detached formal Verification 连续暴露两个确定性 execution bottleneck：

```text
tests-cli
→ diagnostic npm-installed smoke + G1 process-heavy E2E + H1 full self-hosting
→ one long-lived Node worker / one 120s physical timeout

tests-execution
→ F1 integrations + facts/policy/services + heavy b1-run-execution-service
→ one long-lived Node worker / one 120s physical timeout
```

独立诊断证明不是单个业务 case 超时：G1/B1 individual cases分别可在 120s 内完成，而整文件/整 logical bucket因 cumulative Git/tmp/OpenSpec/npm/process I/O 超过 120s。Owner 因此对 `H1/detached-verification-physical-execution-optimization` 做 bounded Contract Reset；H1 只修这个 self-hosting blocker，不把 04 的 generic timing/telemetry/scheduler设计提前搬入03。

H1 current generation冻结：

```text
logical tests-cli
→ bounded physical command A
→ bounded physical command B
→ ...
→ H1 26 formal phases
→ aggregate stdout/stderr + first failure
→ ONE tests-cli evidence

logical tests-execution
→ bounded physical files/suites/case groups
→ aggregate
→ ONE tests-execution evidence
```

每个 `runCommand` **继续使用既有 `120_000ms` hard timeout**。这里不存在 `120s → 300s` timeout inflation；改变的是一个 logical check不再错误地把所有不同性质的 physical targets塞进同一个 timeout budget。任一 physical command spawn-fail / timeout / non-zero 都立即使原 logical check fail closed。

#### H1 `tests-cli` physical closure

H1 selection至少依次覆盖：

```text
A1 public Delivery behavior target
B1 corrective-change target
diagnostic in-process + unit diagnostics/CLI
diagnostic real-process read-only/unknown-command cases
G1 Change CLI E2E 每个既有 case
G1 single-action/resume Adapter 每个既有 case
H1 self-hosting 26 formal phases
```

旧 `diagnostic-cli-process` 的 `npm-installed flowkit bin surface` 只在 **H1 selection** 中不重复执行。理由是 H1 formal phase 1 + subsequent full self-hosting chain已经以同一 candidate `npm pack`、independent consumer installed package、installed `dist/bin/flowkit.js`提供严格更强证据；重复执行旧 smoke在 detached 中会再次支付全量 build/pack/offline install成本，却不增加独立 acceptance。非 H1 `tests-cli` 继续使用原 resolver/旧 smoke，保持历史 coverage。

#### H1 `tests-execution` physical closure

不允许语义去重。所有现有 `tests-execution` files/cases必须执行；普通 files使用短生命周期 worker，`b1-run-execution-service.test.ts` 按已存在 suite / bounded case groups执行。分段只改变 process lifetime/timeout ownership，不改变 test source、assertion或 selected logical scope。

#### Evidence / negative proof

`VerificationCheckEvidence.commandOrMethod` 必须列出实际 bounded physical commands（H1 phase还包括 `FLOWKIT_H1_FORMAL_PHASE=<n>`），stdout/stderr fingerprints覆盖全部已执行 groups。H1 sentinel必须仍能直接让 formal full-E2E branch导致 `tests-cli` fail。新增 execution-routing regression还必须证明 B1 heavy group failure会传播为 `tests-execution` fail。

Disposable optimization proof 已在 detached exact 108 candidate上得到：

```text
optimized tests-execution
→ overallStatus=passed
→ wall ≈ 246s total
→ every physical command <= existing 120s hard timeout

optimized tests-cli
→ overallStatus=passed
→ wall ≈ 868s total
→ A1/B1 + diagnostics + 7 G1 Change cases + 3 G1 Adapter cases + H1 26 phases全部执行
→ every physical command <= existing 120s hard timeout
```

总 logical wall time可以大于 120s；120s authority属于每个真实 external command的 bounded process ownership，而不是要求一个包含几十个 real-process targets的 logical union必须共用一个 process lifetime。04 仍负责未来的 per-target timing、通用 heavy classification、诊断和进一步性能优化。

**Rejected:** 提高全局/检查 timeout；会隐藏而非解决 detached process accumulation。

**Rejected:** 新增 `tests-h1` logical check；会制造第二套 Verification taxonomy，不需要。

**Rejected:** 跳过 G1/B1 heavy coverage；H1 self-hosting不能用“Full E2E PASS”替代历史 compatibility/recovery regressions。

## Risks / Trade-offs

- **[Risk] candidate closure把无关dirty path误当合法** → allowed set必须从 exact formal Run/OpenSpec/Manifest/mutation declaration facts推导；current Git path逐项匹配，unrelated fail closed。
- **[Risk] EOF plan变成generic formatter** → closed two-operation enum；trailing/internal/semantic/binary ambiguity fail closed。
- **[Risk] checkpoint-handoff CLI看起来像write action** → command只输出JSON、无write option，tests断言worktree/index/history/facts unchanged。
- **[Risk] H1 E2E过大导致tests-cli timeout** →只做一个最小future-Delivery fixture并复用现有A–G能力；记录wall time/process counts，不通过提高timeout隐藏问题。若正式Verification timeout，按Verification authority处理而不是在H1自动调timeout。
- **[Risk] stable package测试依赖网络** → local distribution/install必须offline-capable，不访问registry；managed tools来自exact `FLOWKIT_HOME`。
- **[Risk] fixture Actual被误当真实03 authority** →固定使用different synthetic deliveryId/temp repo；真实03 architecture path在H1 Apply中保持absent。

## Migration Plan

1. 扩展 checkpoint handoff typed projection与CLI read-only facade；增加 exact-plan/fail-closed regressions。
2. 建立 H1 capability ownership与physical resolver；先完成prospective Verification selection proof。
3. 实现一个 source-controlled/minimal future-Delivery disposable fixture和H1 integration target，组合stable local package、managed tools、A–G lifecycle、checkpoint/final Git mechanics、fresh checkout/resume。
4. 运行 H1 sentinel physical-closure proof、targeted regressions、OpenSpec strict、typecheck/lint/build与formal Change Verification。
5. Reviewer批准后按现有 archive/checkpoint boundary canonicalize H1；checkpoint前不激活prospective runner semantics。
6. H1 checkpoint后再进行真实03 Delivery Ready/Full Test/Actual/Compare/Finalize/Delivery Final。

无 persisted schema migration、无历史rewrite。H1 detached candidate可丢弃回exact Base；canonical checkpoint后发现问题按普通corrective/future Change处理。

## flowkitMutationScope

```json
{
  "schemaVersion": 1,
  "actions": {
    "apply": {
      "selectors": [
        { "kind": "exact", "path": "openspec/changes/stable-runner-and-self-hosting-acceptance/tasks.md" },
        { "kind": "exact", "path": "openspec/changes/stable-runner-and-self-hosting-acceptance/verification.md" },
        { "kind": "exact", "path": "src/cli/main.ts" },
        { "kind": "exact", "path": "src/services/f1-checkpoint-boundary-service.ts" },
        { "kind": "exact", "path": "src/verification/change-selection/evidence.ts" },
        { "kind": "exact", "path": "src/verification/change-selection/module-map.ts" },
        { "kind": "prefix", "path": "tests/fixtures/h1-stable-runner-and-self-hosting-acceptance" },
        { "kind": "exact", "path": "tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts" },
        { "kind": "exact", "path": "tests/unit/services/f1-checkpoint-boundary-service.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/evidence.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/module-map.test.ts" }
      ]
    },
    "revise-apply": {
      "selectors": [
        { "kind": "exact", "path": "openspec/changes/stable-runner-and-self-hosting-acceptance/tasks.md" },
        { "kind": "exact", "path": "openspec/changes/stable-runner-and-self-hosting-acceptance/verification.md" },
        { "kind": "exact", "path": "src/cli/main.ts" },
        { "kind": "exact", "path": "src/services/f1-checkpoint-boundary-service.ts" },
        { "kind": "exact", "path": "src/verification/change-selection/evidence.ts" },
        { "kind": "exact", "path": "src/verification/change-selection/module-map.ts" },
        { "kind": "prefix", "path": "tests/fixtures/h1-stable-runner-and-self-hosting-acceptance" },
        { "kind": "exact", "path": "tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts" },
        { "kind": "exact", "path": "tests/unit/services/f1-checkpoint-boundary-service.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/evidence.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/module-map.test.ts" }
      ]
    }
  }
}
```
