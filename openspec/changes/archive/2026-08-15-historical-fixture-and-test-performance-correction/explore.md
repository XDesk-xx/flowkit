# Explore

## 1. Problem

G1 已在 canonical Base `d3d220f4051e55c55223e233eb862bc3b9a8b4cb` 完成 archive + Change Checkpoint。H1 是其后的 required corrective Change，目标是在 02 Delivery 正式 Full Test 前关闭四类已经真实暴露的测试/验证缺口：

1. `tests/integration/g1-change-cli-end-to-end.test.ts` 把已 archive 的 G1 active OpenSpec 目录当作 fixture source；checkpoint 后该路径合法消失，5 个场景在进入被测行为前直接 `ENOENT`。
2. `tests/integration/openspec-1-7-real-cli.test.ts` 的 historical E1 fixture 既依赖已消失的 active E1 path，又把 historical E1 delta 与 post-E2 current canonical spec 做 completeness 比较，违反 point-in-time historical authority。
3. real OpenSpec integration target 已被 Verification Catalog 映射到 `openspec-runtime`，但 current `tests-openspec-runtime` physical resolver 没有执行它；changed target 即使必失败，formal Node check 仍可 PASS，并且没有 adapter executable propagation 时该 suite 会 skip。
4. H1 被正式加入 02 Manifest 后，`tests/unit/services/a1-write-service.test.ts` 仍把 `20260810-01-change-execution-loop` 的 Change 数量写死为 `10`；当前正式 Manifest 已是 `11`，因此 post-H1 `test:full` 会以 `11 !== 10` 失败。

H1 同时明确要求在不降低 acceptance coverage、不扩大 timeout、不引入 cache/parallel framework 的前提下减少重复 fixture construction 与 CLI/OpenSpec subprocess，使 02 Delivery Full Test 可以稳定 terminal。199/201 Reviewer 的 `H1-RE-001` 要求在 Proposal 前完成同环境、同 correctness coverage 的 G1/full-suite before/after proof。

本 Change 不重新打开 completed G1/E1，也不把这轮 Explore benchmark 当作 Delivery Full Test。

## 2. Current Facts

- exact Git Base：`d3d220f4051e55c55223e233eb862bc3b9a8b4cb`。
- G1 `change-cli-end-to-end-and-performance`：`completed`，已有 Change Checkpoint。
- G1 archived OpenSpec root：`openspec/changes/archive/2026-08-15-change-cli-end-to-end-and-performance/`。
- E1 archived OpenSpec root：`openspec/changes/archive/2026-08-14-change-verification-selection-and-change-set/`。
- Owner 已授权创建并 Explore H1；H1：`state=active`、`required=true`、`architectureImpact=false`。
- H1 dependency：G1，已 completed + checkpointed。
- H1 加入后，02 Manifest 当前共有 11 个 Changes；前 8 个保留 pre-A1 legacy missing `architectureImpact`，D2/E2/H1 显式 `architectureImpact=false`。
- 201 Reviewer：`changes-requested`；唯一 blocking finding 为 `H1-RE-001`，`blockingAuthority=author`，要求继续 revise-explore 直到 performance prerequisite 与 mutation surface 闭合。
- 当前合法 Action：`revise-explore`；本轮 Run：`20260815-202-revise-explore`。
- Delivery Full Test 仍为 `not-ready`；本 Explore 内执行的 `test:full` 只是 disposable feasibility measurement，不取得 Delivery Full Test lifecycle 语义。

## 3. Scope Boundary

### In scope

- 修复 G1 post-archive real-process E2E fixture 对 active G1 path 的耦合。
- 修复 historical E1 real OpenSpec test 的 active-path coupling 与 historical-vs-current temporal authority 错误。
- 修复 H1 Manifest growth 暴露的 `a1-write-service.test.ts` 固定 Change-count fixture。
- 让 changed `openspec-1-7-real-cli.test.ts` 真正进入 formal `tests-openspec-runtime` physical execution。
- 让该 physical Node execution 获得与当前 Verification operation 的 `OpenSpecCliAdapter.executable` 同源的 real OpenSpec executable identity，而不是默认 skip。
- 在保持 G1 7-scenario correctness matrix 的前提下，用 reusable point-in-time boundary template 减少重复 lifecycle setup / CLI subprocess。
- 在同一环境记录 G1 subprocess count、G1 full-file wall time、public `test:full` terminal wall time before/after。

### Out of scope

- 重新打开或修改 completed G1/E1 lifecycle state、历史 Run 或 archived Change。
- 修改 Formal Action / Policy / Owner authority / archive semantics。
- Delivery Full Test / Delivery Finalize 实现。
- 03 Delivery behavior、Archify、Agent Adapter。
- 删除 acceptance case、skip 被要求执行的 real OpenSpec target、提高 timeout。
- cache platform、parallel scheduler / generic concurrency framework。
- generic Fixture Registry / Evidence Registry。
- production CLI/runtime、OpenSpec adapter、archive service refactor。
- 当前没有 proof 支持的 `scripts/verification.ts` 修改。

## 4. Risk Scan

| Risk | yes/no | Why |
|---|---|---|
| Scope expansion / missing prerequisite | yes | G1/E1 fixture 之外，H1 Manifest growth 又暴露 current-corpus count fixture；formal physical resolver 也漏跑 real OpenSpec target。 |
| Cross-time facts | yes | historical E1 delta 被错误拿去与 future/current canonical spec 比较。 |
| Schema / persistence migration | no | 不改变 Run/Manifest/schema 物理模型。 |
| Self-hosting / writer changes itself | no | 不改 Run writer / lifecycle writer。 |
| Authority duplication | yes | fixture 不能通过 active/archive 扫描重新发明 OpenSpec lifecycle truth。 |
| Generic reusable subsystem | yes | Verification physical resolver 是共享能力，必须对 future changed real-OpenSpec targets 有效。 |
| Activation persistence | no | 不引入 runtime activation mechanism。 |
| Candidate/formal-fact mutation affects existing consumers | yes | H1 本身修改 Manifest 后，current-corpus test 已产生合法新输入；修改 Verification resolver 会影响后续 Change Verification。 |
| Verification selection must reach actual executed targets | yes | `tests-openspec-runtime` logical PASS 当前可漏掉 changed integration file。 |
| External tool performs real mutation | yes | real OpenSpec archive fixture 会真实执行 validate/archive mutation，必须 disposable。 |
| Change claims performance improvement | yes | 必须同环境 before/after，且 correctness coverage 不变。 |

## 5. Applicable Proofs

### Proof A — G1 post-archive fixture lifecycle

**Question:** G1 失败是否由 active-path fixture coupling 引起，并且能否在不重新打开 G1 的情况下修复？

**Acceptance Boundary:** G1 archive + checkpoint 后，7 个 real-process E2E scenarios 都能执行；fixture source 不要求 active G1 Change 重新出现。

**Method:** exact Base 复现；检查 active/archive path；disposable candidate 仅把 G1 source 改为 immutable archived point-in-time artifacts，再执行完整 G1 file。

**Evidence:**

- active `openspec/changes/change-cli-end-to-end-and-performance/` 不存在；archive root 存在完整 G1 artifacts。
- exact post-checkpoint baseline：7 tests 中 5 个因 `copyExplore/copyProposalSet -> fs.cp -> lstat ENOENT` 失败。
- correctness-only disposable candidate 使用 archived G1 source 后：**7/7 PASS**。
- 同一完整 file 的 clean run：**79 real CLI subprocess / 79.786s**。

**Evidence Boundary:** 已覆盖完整 7-scenario post-archive G1 E2E，不再只是 representative cases。

**Gap:** Apply 后仍需正式 regression 重跑，但 feasibility 已闭合。

**Result:** PASS。

**Implication:** Proposal 可冻结 archive-safe point-in-time G1 fixture；禁止重新创建 active G1 或动态 active-or-archive discovery。

---

### Proof B — Historical E1 temporal authority

**Question:** E1 real OpenSpec test 是否只需换 archive path，还是比较模型本身已经跨越 historical authority boundary？

**Acceptance Boundary:** historical conformance fixture 只验证自己的 point-in-time canonical baseline + MODIFIED delta / real OpenSpec archive semantics，不要求 historical delta 包含后来 E2/G1 才新增的 current scenarios。

**Method:** real OpenSpec 1.7 执行 current test；disposable 恢复 archived E1 到旧 active path再执行；再构造 self-contained synthetic point-in-time canonical + MODIFIED delta，strict validate + real archive + merged scenario assertions。

**Evidence:**

- baseline active E1 source 已不存在，先 `ENOENT`。
- 仅恢复 archived E1 到 active path 后仍 FAIL：historical delta 缺少后来才新增的 `post-E2 Apply 使用 compact entry identity`。
- 因此 `active → archive path` 不是完整修复。
- self-contained point-in-time fixture：strict validation PASS；real archive success；baseline 两个 scenario 在 archive sync 后保持存在。

**Evidence Boundary:** 覆盖真实 OpenSpec 1.7 MODIFIED archive semantics，并与 future current canonical authority 解耦。

**Gap:** Proposal 只需冻结 synthetic fixture 的最小语义与职责，不需要历史 migration。

**Result:** PASS。

**Implication:** real OpenSpec conformance test 应使用 self-contained point-in-time fixture；historical E1 persisted compatibility 继续归 E2 historical compatibility tests。

---

### Proof C — Verification Closure for changed real OpenSpec target

**Question:** H1 修改 `tests/integration/openspec-1-7-real-cli.test.ts` 后，formal Change Verification 是否真的执行该 target？

**Acceptance Boundary:** `actualChangeSet → openspec-runtime → tests-openspec-runtime → physical Node target` 必须包含 changed real integration file；该 target sentinel fail 时 formal Node evidence必须 FAIL，并且 real OpenSpec executable identity来自当前 Verification/OpenSpec adapter authority。

**Method:** 读取 closed module/evidence mappings；在 disposable sentinel repo 中把 real integration file 强制失败，执行 current `tests-openspec-runtime`；检查 `ExecuteVerificationSelectionInput.openSpecAdapter` surface。

**Evidence:**

- module ownership 已正确把 real integration file 映射到 `openspec-runtime`。
- current physical selector只执行：
  - `tests/unit/external-command.test.ts`
  - `tests/unit/integrations/openspec-cli-adapter.test.ts`
- real integration sentinel 必失败时，current `tests-openspec-runtime` 仍 PASS：当前 closure FAIL。
- current real suite 若没有 `FLOWKIT_OPENSPEC_BIN` 会 skip。
- `ExecuteVerificationSelectionInput` 已携带 `openSpecAdapter`，其 public `executable` 可作为同一个 verification operation 的 executable identity；不需要新建第二 tool authority。

**Evidence Boundary:** 已证明 current closure defect，并证明 correction 可以留在 existing Verification resolver surface 内。

**Gap:** Apply 后需用 failing-sentinel regression + real OpenSpec 1.7 conformance suite证明 correction。

**Result:** FAIL（current）；feasible correction = PASS。

**Implication:** H1 必须修改 `evidence.ts` + resolver regression；不需要改 module-map / OpenSpec adapter。

---

### Proof D — H1 Manifest growth / current-corpus fixture

**Question:** H1 被正式加入 Manifest 后，为什么 correctness-only `test:full` 仍有一个失败？需要 product change 还是 test fixture correction？

**Acceptance Boundary:** 新 required corrective Change 合法进入 02 Manifest 后，legacy/current corpus reader regression仍应验证 architectureImpact compatibility，而不能因为固定旧 Change 数量自毁。

**Method:** 在 H1 active candidate 上执行 public `test:full`；定位唯一 failure；只在 disposable test candidate 中把 02 当前 corpus count 从 10 对齐为 11，再重跑 full suite。

**Evidence:**

- H1 Manifest 当前合法包含 11 个 Changes；D2/E2/H1 都显式 `architectureImpact=false`，前 8 个 legacy missing contract 不变。
- 未修该 fixture 时 full suite terminal：**791/792 PASS，1 FAIL**。
- 唯一 failure：`tests/unit/services/a1-write-service.test.ts`，`20260810-01-change-execution-loop: 11 !== 10`。
- 同一测试其核心 architectureImpact assertions 没有失败；只是不再成立的旧 corpus count 常量失败。
- disposable 将该 current 02 corpus expectation 对齐 H1 后，correctness-only full suite达到 **792/792 PASS**。

**Evidence Boundary:** 已证明这是 H1 Manifest mutation 的直接 test consumer，不需要修改 `a1-write-service` production semantics。

**Gap:** Proposal 应把该 test path 纳入 exact mutation surface，并保持 legacy 8-count / D2/E2/H1 explicit architectureImpact assertions，不弱化成任意 `>=`。

**Result:** PASS。

**Implication:** H1 必须同步 current 02 corpus fixture；不能通过撤销 H1 Manifest 或放宽 FormalFactReader 修复。

---

### Proof E — Performance / Delivery Full-Test stability

**Question:** test-local reusable boundary template 是否足以在不删除 acceptance case、不 skip G1 real OpenSpec archive/recovery、不提高 timeout、不改变 full-runner concurrency 的前提下，减少重复 process cost，并让 correctness-corrected 02 full test corpus稳定 terminal？

**Acceptance Boundary:** 同一 detached Linux / Node 22 / OpenSpec 1.7.0 工具环境、同一 correctness correction、同一 68-file public `test:full` corpus下，必须得到：

- G1 real CLI subprocess count before/after；
- G1 7-scenario full-file wall time before/after；
- public `test:full` terminal wall time before/after；
- 两侧 correctness全部 terminal PASS；
- after 不删除 G1 7 scenarios、完整 happy lifecycle、real OpenSpec archive/recovery、Verification failure counterexample；
- 不提高 timeout、不改变 `scripts/verification.ts` concurrency/batching、不引入 cache/scheduler。

**Measurement hygiene:** 200 中的 `>120s / >180s` observation 被重新审计。一个 prototype 使用 `node_modules` symlink，导致 entry-identity tests 把 symlink 视为非-regular untracked entry；另有历史测量期间存在 orphan Node processes。202 使用正常目录型 `node_modules/`，串行执行 before/after，先确认无残留被测进程。teardown 计时也证明每个 G1 scenario cleanup 仅约 11–65ms，不是 bottleneck。因此 200 的 censored timeout 不能继续作为有效 baseline。

**Correctness-only before candidate：**

- G1 source 改为 immutable archived G1 point-in-time source；
- E1 real-OpenSpec scenario 改为 self-contained point-in-time fixture；
- H1 Manifest growth 的 current 02 corpus expectation 对齐为 11；
- 不做 reusable G1 boundary-template performance optimization；
- 不改 production code、runner、timeout 或 concurrency。

**Optimized after candidate：**

- 与 before 完全相同的 correctness corrections；
- 完整 happy lifecycle仍从 base 开始走 public real CLI；
- authority/stale/archive-recovery 等 targeted scenarios复用由真实 public CLI 生成的 Explore-completed / approved-proposal point-in-time snapshots；
- snapshot exact-copy 后继续执行各 scenario 自己的真实 boundary；
- 不用 in-process `runCli()` 替代被测 real-process boundary；不改 `scripts/verification.ts`。

**G1 full-file result：**

| Metric | correctness-only before | snapshot after | Delta |
|---|---:|---:|---:|
| scenarios | 7/7 PASS | 7/7 PASS | unchanged |
| real CLI child processes | 79 | 63 | **-16 / -20.3%** |
| full-file wall | 79.786s | 72.76s | **-7.026s / -8.8%** |

After 仍实际覆盖：

- full happy lifecycle；
- owner / verification / external / author blockers + direct re-review；
- stale review target + missing activation；
- future-Delivery fresh-clone exact resume；
- changed-surface real OpenSpec archive outcome-unknown recovery；
- Verification projection / missing OpenSpec；
- Change Verification failure。

**Public `test:full` result：**

两侧均使用现有 `npm run test:full`，68 files，现有 full runner concurrency=4、现有两个 process-heavy batches；未修改 `scripts/verification.ts`。

| Metric | correctness-only before | snapshot after | Delta |
|---|---:|---:|---:|
| full test assertions | 792/792 PASS | 792/792 PASS | unchanged |
| external wall (`/usr/bin/time`) | 134.82s | 131.91s | **-2.91s / -2.2%** |
| runner `full-tests` wall | 134.160s | 131.157s | **-3.003s / -2.2%** |

两侧都实际 terminal；没有靠 180s censored result推导。现有 full-test 60s warning budget仍会被超过，但 H1 formal goal没有授权扩大 timeout或引入 scheduler，required outcome 是**减少重复成本 + 在同一 correctness coverage 下稳定 terminal**，不是把整个历史 02 corpus强行压到 warning target。

**Evidence Boundary:** 覆盖了 201 acceptance 要求的同环境 G1 subprocess count、G1 full-file before/after、full-suite terminal before/after；after 保持完整 correctness matrix。证明 test-local snapshot reuse 是一个 bounded、有效但不过度承诺的性能 correction；不需要 `scripts/verification.ts` / product runtime / cache / scheduler prerequisite。

**Gap:** Apply 后必须在正式 candidate 重跑同样 correctness/full-suite checks并记录 observation；性能数字允许环境波动，但不得出现 process count反弹、coverage减少或 full suite不能 terminal。

**Result:** PASS。

**Implication:** 200 的 performance UNKNOWN 已关闭。Proposal 可以冻结 test-local reusable point-in-time boundary templates；不得把更激进的 in-process setup、runner rebatching、timeout expansion 或 platform mechanism带入 Apply。

---

### Proof F — Mutation Surface + Verification Closure

**Question:** 在 Proof A–E 后，H1 required outcome 是否已经能由一个窄、完整的 mutation surface 实现？

**Acceptance Boundary:** 所有 required implementation/test consumer paths 都在 Proposal selectors 内；changed targets都有 formal physical verification coverage；不存在“Apply 后才决定是否需要扩 scope”的未知 prerequisite。

**Method:** direct consumer scan + module ownership + Proof A–E counterfactual闭包。

**Required implementation surface proven necessary:**

1. `tests/integration/g1-change-cli-end-to-end.test.ts`
   - archive-safe G1 point-in-time source；
   - reusable real-CLI-generated Explore/Proposal boundary templates；
   - 7-scenario matrix不减少；
   - process count observation可保留为 test-only diagnostic或由 Apply measurement外部记录，Proposal决定最小形式。
2. `tests/integration/openspec-1-7-real-cli.test.ts`
   - self-contained point-in-time MODIFIED archive fixture；
   - 不依赖 active E1/current canonical completeness。
3. `tests/unit/services/a1-write-service.test.ts`
   - current 02 corpus从 pre-H1 10 对齐 H1 后 11；
   - 保留 legacy 8-count和D2/E2/H1 explicit architectureImpact的精确语义，不改 production reader。
4. `src/verification/change-selection/evidence.ts`
   - `tests-openspec-runtime` physical target包含 real OpenSpec integration file；
   - Node union把 current `openSpecAdapter.executable` 传播为该 suite 使用的 real executable identity。
5. `tests/unit/verification/change-selection/evidence.test.ts`
   - real OpenSpec target failing-sentinel closure regression；
   - executable propagation regression。
6. H1 OpenSpec Proposal/Design/Tasks/spec deltas：至少覆盖
   - `flowkit-change-cli-end-to-end-and-performance`（post-archive fixture + unchanged coverage/performance invariant）；
   - `flowkit-change-verification-selection`（logical→physical target closure / executable propagation）。

**Explicitly not required:**

- `scripts/verification.ts`：clean public full-suite before/after 已 terminal，snapshot after 有可测改善；不需要 rebatching/concurrency change。
- `src/verification/change-selection/module-map.ts`：ownership 已正确识别 G1、real OpenSpec和 `tests/unit/services/**`。
- production CLI / Policy / FormalFactReader / A1 write service / OpenSpec adapter / archive service。
- 新 fixture registry / cache / scheduler / timeout policy。

**Physical closure:**

- G1 integration target → `cli-diagnostics` → `tests-cli` → G1 physical file：已有 PASS。
- A1 service regression → `execution` → `tests-execution` → `tests/unit/services/*.test.ts`：已有 physical selector覆盖。
- real OpenSpec integration target → `openspec-runtime` → `tests-openspec-runtime`：current FAIL，H1 correction必须加入该 file并传播 executable。
- `evidence.ts/evidence.test.ts` → `verification-selection` → `tests-verification`：已有 physical selector覆盖。

**Evidence Boundary:** required test/production mutation surface与每个 direct verification consumer均已定位；performance不再留下未知 runner prerequisite。

**Gap:** Proposal 必须一次冻结 lexical-sorted exact selectors，并把 failing-sentinel / executable propagation / full-suite regression写入 acceptance；Apply 不得再扩路径。

**Result:** PASS。

**Implication:** H1 已达到 Proposal readiness；当前不需要 Owner Contract Reset。

## 6. Rejected Approaches

1. **重新打开 G1/E1**：它们已 completed + checkpointed；H1 是新的 corrective Change。
2. **active G1/E1 path fallback / active-or-archive scan**：继续依赖 repository lifecycle，并形成第二套 OpenSpec history interpretation。
3. **只把 E1 active path 改成 archive path**：Proof B 已证明 temporal comparison仍错误。
4. **继续让 changed real OpenSpec test默认 skip**：违反 Verification Closure。
5. **只改 module-map**：ownership已正确，缺口在 physical resolver/executable propagation。
6. **把 H1 从 Manifest 撤掉或放宽 FormalFactReader 来回避 `11 !== 10`**：Proof D 已证明是 stale current-corpus test fixture。
7. **把 `a1-write-service.test.ts` 改成 `>=10` 等弱断言**：会丢失 current 02 corpus completeness语义；应对齐合法 H1 corpus，同时保留 architectureImpact精确断言。
8. **删除 G1 slow E2E case、降低 real-process coverage、提高 timeout**：不是性能优化。
9. **用 in-process `runCli()` 替代 targeted real-process assertions**：202 已不需要该更激进方案；会弱化真实 process boundary。
10. **修改 `scripts/verification.ts` 做 rebatching/concurrency 调整**：clean before/after已证明无需该 prerequisite。
11. **引入 cache / parallel scheduler / generic test platform / Fixture Registry**：没有必要且超 scope。

## 7. Feasible Proposal Boundary

202 已把 201 `H1-RE-001` 要求的 performance prerequisite与 mutation surface都前移关闭。Proposal 可以冻结且只能冻结：

1. **G1 fixture lifecycle correction**
   - 使用 immutable post-archive G1 point-in-time artifacts；
   - 保留 7 个 scenarios；
   - 完整 happy lifecycle继续从 base 使用 public real CLI；
   - targeted scenarios可以复用由真实 CLI 生成的 Explore/Proposal boundary snapshot，再继续真实被测 boundary。

2. **Historical / real OpenSpec fixture correction**
   - 使用 self-contained point-in-time synthetic canonical + MODIFIED delta；
   - 不把 historical E1 delta与 current canonical completeness比较。

3. **H1 Manifest consumer correction**
   - 更新 `a1-write-service.test.ts` 的 current 02 corpus expectation到 H1 后 11；
   - 保留 legacy 8 missing + D2/E2/H1 explicit false semantics。

4. **Formal Verification Closure**
   - `tests-openspec-runtime` 必须实际执行 `openspec-1-7-real-cli.test.ts`；
   - executable identity来自 current `OpenSpecCliAdapter.executable`；
   - failing sentinel必须使 formal check FAIL。

5. **Performance acceptance**
   - G1 real CLI process count不得高于 correctness-only baseline 79；prototype已证明63可行；
   - 7/7 matrix不减少；
   - public `test:full` 必须 terminal PASS，不能靠 skip/timeout；
   - Apply记录 before/after observation，但不能把新的 scope/prerequisite推迟到 Apply。

6. **Exact implementation selectors（Proposal需 lexical sort）**
   - `src/verification/change-selection/evidence.ts`
   - `tests/integration/g1-change-cli-end-to-end.test.ts`
   - `tests/integration/openspec-1-7-real-cli.test.ts`
   - `tests/unit/services/a1-write-service.test.ts`
   - `tests/unit/verification/change-selection/evidence.test.ts`
   - H1 OpenSpec artifacts。

明确不进入 Proposal：

- `scripts/verification.ts`
- `module-map.ts`
- production CLI/runtime
- Policy / Formal Action
- OpenSpec adapter/archive service
- cache/scheduler/timeout framework
- 03 Delivery behavior

因此：

```text
correctness feasibility = proven
Verification closure feasibility = proven
performance feasibility = proven
mutation surface closure = proven
overall Proposal readiness = YES
```

## 8. Open Decisions

### Proposal 内可以冻结

- reusable boundary template 的最小 helper shape、生命周期与 cleanup；它必须是 test-local、由 real CLI 生成、随后 exact-copy，不成为 production authority。
- self-contained real OpenSpec MODIFIED fixture 的最小 scenario文本。
- `tests-openspec-runtime` exact physical selector与 executable env propagation形式。
- five-path implementation mutation selectors + H1 OpenSpec deltas的 lexical order。

### 不需要 Owner Contract Reset

202 没有发现必须进入 product runtime、Policy、runner framework、timeout policy 或 03 scope 的 prerequisite。当前 Owner H1 goal已足够覆盖上述 test/Verification correction。

### Apply 必须重新验证，但不得重新做设计决策

Apply 需要重跑：

- G1 7/7；
- real OpenSpec 1.7 conformance；
- sentinel physical closure；
- current 02 corpus reader regression；
- formal selected Change Verification；
- public `test:full` terminal result与performance observation。

这些是已冻结方案的 acceptance，不是“Apply 后再决定是否 scope 足够”。
