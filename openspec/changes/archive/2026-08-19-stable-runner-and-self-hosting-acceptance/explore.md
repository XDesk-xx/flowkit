# Explore

## 1. Problem

H1 是 03 Delivery 的最后一个 required Change。它不是继续增加新的 lifecycle，而是要证明 A1→G1 已形成一个可发布、可恢复、可在 fresh checkout 中使用的 stable Runner，并通过 disposable end-to-end fixture 证明下一条真实 Delivery 可以由 Flowkit 管理。

本次 Explore 还必须回答一个 03 dogfood 已反复出现的真实问题：OpenSpec archive 会在部分 canonical spec merge 后留下 redundant EOF blank lines。这个问题应不应该由 H1 吸收，以及应该落在哪个 authority boundary。

## 2. Current Facts

### 2.1 Canonical Base / lifecycle

- detached exact Base: `bbb9eff528f1ccd9624e2d20454ecaa2f0b4405c`
- Base commit: `chore(flowkit): checkpoint sync-resume-and-single-action-agent-adapter`
- A1→G1 均已 completed + checkpointed。
- H1 已由 Owner 独立授权激活：`owner:fd605d9f496475fc686684dab92f78ff595df039faf2920eccd15ccaccfc5169`。
- current formal Run: `20260819-098-explore`，pending/resumable。
- `flowkit doctor`: `ok / 0 findings`。
- current 03 Architecture:
  - `current.architecture.json`: present
  - `planned.architecture.json`: present
  - `actual.architecture.json`: absent

### 2.2 Managed offline tools

当前 detached execution 使用项目中已提供的 offline artifacts materialize：

- OpenSpec distribution SHA256: `3e0bd044bf1fae1732f201fab7b5c1c8ceb4ef89bed9923f89a33cb4f0750afd`
- Archify distribution SHA256: `1b610a4d8ff5821cccd7a3dfe2d0943d11e64bda1d2fb0511944df190472f175`
- package identity: `@fission-ai/openspec@1.7.0`
- package identity: `archify@2.14.0`

因此 H1 不需要联网下载、Tool Registry 或新的 installer authority。

### 2.3 Existing public/stable surfaces

当前 `dist/bin/flowkit.js` 已支持：

`status / next / doctor / resume-context / Change Actions / verify / archive / architecture render|compare / delivery full-test / delivery finalize / delivery final-handoff / create / owner record / recovery / activate`。

已有 internal service：

- `prepareCheckpointBoundaryHandoff()`
- `runSingleActionAgent()`

但 current stable CLI 没有 Change checkpoint-handoff command；checkpoint handoff 当前只存在 internal service + Executor contract。

## 3. Scope Boundary

### In scope

- stable `dist/bin/flowkit.js` release/consumer proof；
- disposable full Bootstrap / future-Delivery-shaped E2E fixture；
- managed OpenSpec + Archify offline execution；
- Current → Planned → Changes → Checkpoints → Delivery Ready → Full Test → Actual → Compare → Finalize → Delivery Final；
- fresh checkout / resume；
- single-action Agent Adapter consumption；
- post-03 SystemArchitectureRef / future Delivery source proof；
- Git boundary correctness；
- archive→checkpoint EOF-only hygiene 的 self-hosting acceptance；
- H1-owned physical Verification target / module ownership；
- performance/cost observation。

### Out of scope

- auto-loop / bounded auto-continue；
- automatic Author↔Reviewer alternation；
- Provider / Agent / Tool / Skill Registry；
- automatic Owner decisions；
- automatic Full Test / Finalize authorization；
- automatic Git push / PR / merge；
- generic formatter；
- moving checkpoint normalization authority into archive；
- generating the real 03 `actual.architecture.json` before H1 completes + checkpoints + Delivery Full Test passes；
- 04 Engineering Health work such as package pruning, test-bucket redesign, broad refactor。

## 4. Risk Scan

| Risk | yes/no | Why |
|---|---|---|
| Scope expansion / missing prerequisite | yes | H1 spans A–G and Git/external tools; must prove composition without adding new platform features |
| Cross-time facts | yes | real 03 Actual only exists after H1 completion/checkpoint + Full Test pass |
| Schema / persistence migration | no | H1 should consume current facts; no new durable lifecycle store is required |
| Self-hosting / writer changes itself | yes | H1 publishes runner used for post-H1 03 closure and next Delivery |
| Authority duplication | yes | Full Test, Archify, Git, Owner, Reviewer must retain existing authorities |
| Generic reusable subsystem | yes | stable runner must work in a different future Delivery/fresh checkout |
| Activation must persist across Change/Delivery boundaries | yes | H1 runner must survive 03 Final/Merge and next Delivery checkout |
| Candidate/formal-fact mutation affects existing consumers | yes | runner/CLI/Verification mapping may be touched |
| Verification selection must reach actual executed targets | yes | H1 needs one physical E2E target, not only isolated A–G suites |
| External tool performs real mutation | yes | OpenSpec archive, Archify output, Git checkpoint/final boundaries |
| Change claims performance improvement | no | H1 records performance/cost; it does not claim optimization |

## 5. Applicable Proofs

### Proof A — A1→G1 prerequisite closure

**Question:** H1 是否需要重新实现 A–G，还是已有能力已足够作为 self-hosting fixture prerequisites？

**Acceptance Boundary:** exact H1 Base 上 A/B/C/D/E/F/G 的关键 public/real-process seams 均可工作。

**Method:** 在 exact Base + exact managed offline tool home 上运行 representative integration suites。

**Evidence:**

第一组：

- C1 exact managed external tools
- F1 Delivery Finalize / Delivery Final Git boundary
- G1 sync/resume/single-action integration
- result: `12 / 12 PASS`

第二组：

- A1 public Delivery Full Test behavior
- B1 Delivery Finding/corrective Change
- D1 durable Architecture assets
- E1 Actual/Compare/acceptance/promotion
- result: `16 / 16 PASS`

合计 representative prerequisite checks: `28 / 28 PASS`。

Git history同时存在当前 03 A1→G1 formal checkpoints，最新为 `bbb9eff528f1...`。

**Evidence Boundary:** isolated/representative capability + real-process boundaries through G1。

**Gap:** 尚无一个 H1-owned fixture 把这些能力放进同一 Delivery 中完整串联。

**Result:** `PASS` for prerequisites；H1 Proposal MUST focus on composition/acceptance, not reimplementation。

**Implication:** H1 不得借机重构 A–G；只有 full self-hosting fixture 暴露的真实 blocker 才允许最小修复。

---

### Proof B — Stable Runner fresh-package / fresh-checkout feasibility

**Question:** 当前 `dist/bin/flowkit.js` 是否已经具备成为 stable runner 的物理发布基础，而不是只能在 source workspace 中运行？

**Acceptance Boundary:** runner 可被 pack/install 到独立 consumer，并在没有 repository `node_modules` 的 fresh checkout 中读取正式 repository facts。

**Method:** 对 exact Base 执行 `npm pack`，在独立 consumer 中 `npm install --ignore-scripts`，再从 fresh Git clone 调用 installed `node_modules/.bin/flowkit`。

**Evidence:**

- installed version: `0.1.0`
- packed artifact SHA256: `ed2e4aa4fc3c43e67b9d2b1fefb0f254a22a89e26ed918313c00ae6b9a5e0127`
- fresh target checkout: repository `node_modules = absent`
- installed runner `flowkit status`: PASS
- installed runner `flowkit resume-context`: PASS
- installed runner `flowkit next`: returns H1 activation boundary on unmodified Base
- Current/Planned Architecture fingerprints are read from repository; Actual remains absent。

Packaging observation only：

- tarball ≈ `3.1 MB`
- unpacked ≈ `14.9 MB`
- files = `2653`

该大小不是 correctness blocker；H1 不应为了“看起来像正式 package”扩成 package-pruning/installer Delivery。

**Evidence Boundary:** fresh installed package + fresh checkout + no target-repo dependencies。

**Gap:** H1 尚未冻结最终 stable release form/acceptance test；但当前 runner packaging 物理可行。

**Result:** `PASS`。

**Implication:** Proposal MAY 以 package/fresh-consumer integration proof 固定 stable runner acceptance；不要求 npm publish/tag 才成为 Git authority。

---

### Proof C — Temporal proof: real 03 Actual MUST remain delayed

**Question:** H1 是否可以在 Change execution 中生成真实 03 Actual / promotion？

**Acceptance Boundary:** canonical 03 Actual 只能来自 H1 completed + checkpointed 后的 final repository，并且必须在 Owner-authorized Delivery Full Test PASS 后形成。

**Method:** 检查 current architecture projection，并运行 E1 final-shaped disposable lifecycle proof。

**Evidence:**

current exact H1 entry：

- Current = present
- Planned = present
- Actual = absent

E1 integration：

`keeps current 03 Actual delayed, then physically closes Actual→Compare→Owner acceptance→future-Delivery source on a disposable final-shaped Delivery` → PASS。

A1 policy还要求 all required Changes completed + checkpointed 后才形成 Delivery Ready / awaiting-user-decision；H1 当前 active，因此 real 03 Full Test / Actual 尚未到时机。

**Evidence Boundary:** current 03 entry + disposable final-shaped full architecture cycle。

**Gap:** none。

**Result:** `PASS`。

**Implication:** H1 fixture 中可以生成 disposable Actual；H1 candidate MUST NOT生成真实 `architecture/20260817-01-delivery-execution-loop/json/actual.architecture.json`。真实 03 Actual 属 H1 checkpoint 后的 Delivery-level closure。

---

### Proof D — Archive→Checkpoint EOF hygiene authority

**Question:** 反复出现的 archive 后 redundant EOF blank lines 是否应由 H1 处理？如果处理，authority 应落在哪里？

**Acceptance Boundary:** self-hosting 可以在不改变 archive semantics 的情况下完成：archive success → Owner checkpoint authorization → only allowed EOF normalization → Git preflight → checkpoint。

**Method:** 使用真实 G1 `097-archive` cumulative candidate 做 disposable replay；比较 archive raw bytes 与 authorized checkpoint-normalized bytes。

**Evidence:**

G1 archive raw candidate 中 4 个 canonical specs：

- `openspec/specs/flowkit-change-verification-selection/spec.md`
- `openspec/specs/flowkit-diagnostic-cli/spec.md`
- `openspec/specs/flowkit-lean-run-and-action-package/spec.md`
- `openspec/specs/flowkit-sync-resume-and-single-action-agent-adapter/spec.md`

均为：

- `finalLF = 2`
- trailing spaces/tabs = `0`

`git diff --check` 对 3 个 tracked specs 报 `new blank line at EOF`；第四个是 archive 新增 canonical spec，因此 ordinary diff-check 不显示 untracked warning，但 raw bytes 同样 `finalLF=2`。

F1 canonical contract/service 已冻结：

- authority = `same-owner-checkpoint-authorization`
- scope = `candidate-or-archive-touched-text-files`
- allowed only:
  - `collapse-redundant-eof-blank-lines`
  - `ensure-exactly-one-final-newline`
- forbidden semantic/internal/broad formatting。

Disposable checkpoint normalization 后四文件全部：

- `finalLF = 1`
- `git diff --check` PASS
- formal checkpoint 后 Policy 可进入 H1 activation boundary。

**Evidence Boundary:** real G1 archive bytes → bounded normalization → valid checkpoint progression。

**Gap:** authority/semantics 已完整；没有理由把 normalization 提前进 archive。

**Result:** `PASS` for authority placement。

**Implication:** H1 **应纳入 archive→checkpoint hygiene acceptance，但 MUST NOT实现“archive 完成后自动 formatter”**。正确时机仍是 Owner authorize-checkpoint 后的 Executor mechanics。

---

### Proof E — Stable Runner checkpoint handoff surface gap

**Question:** 即使 F1 已有正确 normalization contract，下一条真实 self-hosted Delivery 是否能只依赖 stable runner/repository facts获得该 checkpoint handoff，而不依赖聊天生成本地 AI handoff？

**Acceptance Boundary:** disposable H1 E2E 的 Change checkpoint 段应能够从正式 repository facts + stable runner surface 得到 deterministic checkpoint mechanics；不得依赖 ChatGPT 记住“哪几个 EOF 文件”。

**Method:** scan current public CLI 与 checkpoint service consumers。

**Evidence:**

- `prepareCheckpointBoundaryHandoff()` 已存在并有 unit coverage；它是 read-only，不 commit/push，不创建 Run。
- current stable CLI usage 中没有 `checkpoint-handoff` / equivalent Change checkpoint public command。
- production consumer scan：该 service 只有 tests 使用，没有 public CLI consumer。
- 当前 G1 canonical checkpoint 实际需要外部 local-AI handoff 才把 4 个 EOF candidates列出并执行 normalization。

**Evidence Boundary:** internal service correctness + current public runner surface。

**Gap:** stable runner 尚不能公开呈现已有 checkpoint handoff contract；self-hosting fixture如果直接 import internal service，只能证明源码组合，不足以证明 stable runner/operator surface。

**Result:** `FAIL` for current stable-runner acceptance；`PASS` for bounded feasibility。

**Implication:** H1 Proposal SHOULD冻结一个最薄的 public checkpoint handoff/preflight runner surface，**只暴露现有 F1 authority**。它不得成为 G1-style Checkpoint Agent Adapter，不得自动 Owner authorize/commit/push，也不得扩成 generic Git platform。是否由该 surface执行 EOF mutation还是仅输出 exact bounded normalization plan，应在 Proposal 按最小 authority surface冻结；但 archive action本身不得获得该 mutation authority。

---

### Proof F — Genericity / future Delivery consumer

**Question:** H1 acceptance 能否证明“下一条真实 Delivery”，而不是仅证明当前 03 self-specific fixture？

**Acceptance Boundary:** different `deliveryId/changeId` + fresh checkout + current runner semantics，覆盖 Delivery Full Test、resume/Agent Adapter、Architecture promotion 的 future-shaped consumer。

**Method / Evidence:** existing generic proofs：

- A1: different multi-Change Delivery + fresh CLI processes → PASS。
- G1: different future Delivery fresh clone, exact pending Action resume, provider exactly once, no auto-next → PASS。
- E1: disposable final-shaped Delivery Actual→Compare→Owner acceptance→future-Delivery source → PASS。
- Stable package proof: fresh checkout without repository node_modules → PASS。

**Evidence Boundary:** multiple future-shaped consumers across A1/G1/E1 + installed runner。

**Gap:** 尚缺一个 H1-owned *single integrated fixture* 把这些 future-shaped boundaries连接起来。

**Result:** `PASS` for generic subsystem feasibility；H1 integrated fixture remains required。

**Implication:** H1 fixture MUST使用不同于 03 的 Delivery/Change identities，不能只 copy 当前 H1 Change 做 happy-path。

---

### Proof G — External mutation / full self-hosting composition gap

**Question:** managed tools、Git Final、Full Test、Architecture lifecycle 单独成立，是否足以声明 self-hosting accepted？

**Acceptance Boundary:** one disposable repository physically executes the entire required sequence, including real external mutations and fresh checkout/resume。

**Evidence:** isolated real boundaries all PASS：

- managed OpenSpec + Archify doctor/validate/deliver/compare → PASS
- Delivery Full Test public behavior → PASS
- OpenSpec archive / Change checkpoint semantics → existing PASS regressions
- Actual/Compare/promotion → PASS
- Delivery Finalize + Delivery Final Git boundary → PASS
- G1 fresh checkout resume + one Action → PASS

但 repository 当前：

- `tests/integration/*H1*` / `*self-host*` = none
- 不存在一个 H1-owned end-to-end fixture。

**Evidence Boundary:** pieces proven independently。

**Gap:** cross-boundary composition 未被一个 physical fixture证明；因此目前不能声称 01+02+03 self-hosting accepted。

**Result:** `FAIL` current acceptance；`PASS` feasibility。

**Implication:** H1 的主要 implementation artifact SHOULD是一条 disposable end-to-end self-hosting integration fixture + 必要的 minimal stable-runner surface closure，而不是大规模 production rewrite。

---

### Proof H — Verification closure for H1

**Question:** H1 的 self-hosting acceptance 是否已经有 formal Change Verification physical target？

**Acceptance Boundary:** H1 expected actualChangeSet 必须命中 closed module ownership，并有 logical check真实执行 H1 E2E target。

**Method:** scan `tests/**`、`VERIFICATION_MODULE_MAP` 与 physical resolver。

**Evidence:**

- current H1/self-hosting integration target count = `0`
- module map当前有 A–G capabilities，但没有 H1 `stable-runner/self-hosting-acceptance` capability owner。
- 因此仅运行 existing A–G tests 或 full repository suite不能证明 H1 physical selection closure。

**Evidence Boundary:** current Verification catalog/physical resolver。

**Gap:** H1 Proposal必须冻结 H1 capability ownership + physical target selector；Apply后用 sentinel/selected verification证明真实执行。

**Result:** `FAIL` current closure；bounded fix feasible。

**Implication:** Proposal MUST包含 H1 verification mapping/test surface 的 machine-executable mutation scope，不能等 Apply 临时扩大。

---

### Proof J — H1-RE-001 public read-only checkpoint handoff exact-plan closure

**Question:** self-hosting 是否确实缺少一个 public read-only checkpoint handoff；如果保留该 surface，能否仅依据 repository/formal facts + exact Owner `authorize-checkpoint` 得到足够 Executor 施工的 exact plan，而不执行任何 mutation？

**Acceptance Boundary:** fresh process / no chat 下，Executor 可从 Flowkit read-only output 确定 exact Delivery/Change/Owner binding、commit subject/trailers、current candidate allowed paths、exact EOF-only normalization operations 与 required preflight；unrelated dirty 或非 EOF-only hygiene 必须 fail closed。实际 bytes mutation/stage/commit/push仍只属于授权后的 Executor mechanics。

**Method:** 重建真实 G1 canonical-like pre-checkpoint workspace：`3f4063a...` + immutable `097-archive` candidate + canonical checkpoint-time Manifest 中 exact `owner:0c1e44f8... authorize-checkpoint`，HEAD 保持前一正式 checkpoint。以 production formal facts/095 machine mutation declaration、current Change Run/archived OpenSpec paths、archived spec delta→canonical spec mapping及 Git worktree diff做一个**read-only disposable derivation prototype**；不修改 H1 production code。然后加入 unrelated dirty 与 trailing-space negative cases。

**Evidence:**

- reconstructed dirty candidate paths: `64`；按 formal/current-Change path closure推导的 allowed candidate set覆盖全部 64，`unrelated=[]`。
- exact normalization plan只命中 4 个 archive-touched canonical specs，且都为 `finalLF=2`：
  - `openspec/specs/flowkit-change-verification-selection/spec.md`
  - `openspec/specs/flowkit-diagnostic-cli/spec.md`
  - `openspec/specs/flowkit-lean-run-and-action-package/spec.md`
  - `openspec/specs/flowkit-sync-resume-and-single-action-agent-adapter/spec.md`
- 每个 operation均唯一收敛为 `collapse-redundant-eof-blank-lines + ensure-exactly-one-final-newline`；baseline未发现 trailing-space/tab hygiene。
- negative unrelated dirty：额外修改 `README.md` 后，prototype将其识别为 `candidate allowed set` 之外并 fail closed。
- negative forbidden hygiene：在已允许 canonical spec 人工制造 trailing spaces 后，prototype识别 `trailing-space/tab`，不把它转换为 EOF normalization plan。
- existing `prepareCheckpointBoundaryHandoff()` 已能 read-only绑定 exact Delivery/Change/Owner ref、subject/trailers、bounded normalization authority与 `git diff --check` / `git diff --cached --check`；缺口仅是 exact candidate/path/operation projection 与 public stable-runner facade。

**Evidence Boundary:** real G1 archive/checkpoint-shaped repository state + exact Owner checkpoint fact + machine mutation declaration + archived OpenSpec delta mapping + Git worktree candidate，覆盖 Reviewer 要求的 exact path/operation plan 与 fail-closed negatives。

**Gap:** production service当前尚未输出该 exact plan，也尚无 public CLI facade；这是 Proposal 可冻结的最小**read-only extension**。

**Result:** `PASS` feasibility / necessity for a minimal public read-only checkpoint handoff extension；current product acceptance仍待 H1 Apply/E2E实现。

**Implication:** H1 MAY新增 public read-only checkpoint handoff facade，并最小扩展 existing F1 handoff projection以输出 exact candidate/normalization plan；它 MUST STOP after output。不得修改文件、`git add`、commit、push、merge/rebase，不得创建 Checkpoint Run/Adapter。`archive` 继续只负责 OpenSpec archive + Change completed；真正 EOF mutation/stage/commit 始终发生在 exact `authorize-checkpoint` 后的 Executor mechanics。Delivery `final-handoff` 是同一架构模式：Flowkit输出 deterministic read-only Git-boundary施工单，Executor执行 Git mechanics。

### Proof I — Performance / cost baseline (observation only)

**Question:** H1 是否已有足够 baseline 观察 stable runner/运行成本，而无需现在引入 performance platform？

**Acceptance Boundary:** 记录可复现的入口延迟/package footprint，后续 fixture再记录 Action/review/process/verification/full-test/architecture timing；不把波动变 correctness gate。

**Evidence:** installed stable runner on fresh checkout，5-run observation：

- `status`: 180.6 / 190.0 / 177.9 / 176.1 / 169.2 ms，mean ≈ `178.8 ms`
- `resume-context`: 178.3 / 160.8 / 177.2 / 176.7 / 179.2 ms，mean ≈ `174.4 ms`
- package: ≈ 3.1 MB compressed / 14.9 MB unpacked / 2653 files

03 已有 tests-cli coarse timeout历史；H1只能继续收集事实，不应通过提高 timeout、并行 scheduler、cache平台解决。

**Evidence Boundary:** runner entry/package baseline。

**Gap:** full fixture wall time / OpenSpec processes / Archify processes / Change Verification / Full Test / architecture render-compare timing应在 H1 Apply acceptance中记录。

**Result:** `PASS` as baseline observation。

## 6. Rejected Approaches

### 6.1 Archive success 后立即自动格式化 canonical specs

Rejected。

理由：archive Owner authorization 只授权 archive lifecycle mutation；F1 已明确将 EOF-only normalization authority绑定到 **same Owner checkpoint authorization**。把 formatter放进 archive 会扩大 authority 并破坏 archive/checkpoint separation。

### 6.2 为 EOF 问题运行 Prettier / broad formatter

Rejected。

只允许 redundant EOF blank-line collapse + exactly one final newline。Trailing whitespace cleanup、Markdown reflow、internal whitespace rewrite、semantic change都不属于该 authority。

### 6.3 H1 重新实现 A–G

Rejected。

28/28 representative integration checks 已证明 prerequisites 存在。H1只做 composition/self-hosting acceptance和真实 blocker的最小 closure。

### 6.4 H1 自动 Author↔Reviewer / while(next)

Rejected。

G1 已冻结 single-action invariant；H1 stable runner不得变成第二 orchestration engine。

### 6.5 H1 期间生成真实 03 Actual

Rejected。

时序错误。真实 03 Actual 必须等 H1 completed + checkpointed → Delivery Ready → Owner Full Test → PASS。

### 6.6 为 package footprint 在 H1 做大规模发布裁剪

Rejected for current scope。

current package可 fresh install并运行；footprint属于 observation。除非 H1 fixture证明 correctness/operability blocker，否则留给 04 Engineering Health。

## 7. Feasible Proposal Boundary

H1 可以进入 Proposal，但 Proposal必须保持很窄：

1. **Stable Runner acceptance**
   - 冻结 `dist/bin/flowkit.js` 的稳定使用/pack/fresh-consumer contract；
   - 不要求 npm publish/tag 才构成 Git authority。

2. **One disposable future-Delivery-shaped E2E fixture**
   - Current → Planned；
   - 至少两个 normal Change lifecycle/checkpoint boundary 或足以证明 multiple-Change sequencing的最小 fixture；
   - Owner Full Test authorization + Full Test no-Run；
   - Actual independently from final repo；
   - Planned vs Actual compare；
   - Owner architecture/finalize authorization；
   - Finalize no-Run；
   - Delivery Final Git boundary；
   - fresh checkout/resume；
   - future SystemArchitectureRef source。

3. **Archive→Checkpoint read-only handoff acceptance**
   - MUST保留 `archive completed → exact Owner authorize-checkpoint → Executor mechanics`；archive不得执行 EOF mutation；
   - stable runner SHOULD公开 deterministic **read-only** checkpoint handoff；至少输出 exact Delivery/Change/Owner、subject/trailers、exact candidate/allowed paths、exact EOF-only normalization operations与 `git diff --check` / `git diff --cached --check`；
   - exact path/operation plan MUST由 repository/Git/formal facts推导并对 unrelated dirty、trailing-space/internal/semantic/broad-format hygiene fail closed；
   - public handoff MUST STOP after output：不得修改文件、stage、commit、push、merge/rebase，不得成为 Checkpoint Adapter/Run；
   - actual EOF-only mutation/stage/commit仍只由 exact Owner checkpoint authorization后的 Executor mechanics完成。

4. **H1 Verification closure**
   - 新增 H1-owned E2E physical target；
   - closed module capability/ownership + resolver；
   - Proposal阶段冻结 `flowkitMutationScope`；
   - Apply阶段用 sentinel/selected verification证明 physical closure。

5. **Performance/cost observation**
   - 记录 Action count、Review rounds、prepare/resume、Run corpus、OpenSpec/Archify process counts、Change Verification、Full Test、architecture render/compare wall time；
   - observation only；不新增 telemetry platform、scheduler、cache、auto-timeout。

6. **Activation boundary**
   - H1 detached implementation不 self-upgrade；
   - approved H1 archive + canonical Change Checkpoint 后，新 stable runner semantics才成为 canonical；
   - 随后的真实 03 Delivery Ready / Full Test / Actual / Compare / Finalize可以 dogfood H1 checkpoint后的 runner；
   - 03 Merge 后下一 Delivery fresh checkout必须仍能使用同一 accepted runner/SystemArchitectureRef source。

## 8. Open Decisions

需要 Proposal/Reviewer冻结，但不需要新的 Owner scope expansion：

1. public checkpoint surface 只允许 **read-only handoff/preflight output**；“是否直接执行 EOF mutation”不再是 Open Decision。Proposal只需冻结最小命令形状与 exact-plan schema；实际 EOF mutation/stage/commit始终由 authorize-checkpoint后的 Executor mechanics执行。
2. stable runner的 release test 采用 `npm pack + fresh consumer` 还是 equivalent local distribution fixture；产品 authority仍由 Git exact bytes，而不是 npm registry。
3. H1 E2E fixture的最小 Change 数量/identity，只要足以证明 multiple-Change sequencing、single-action adapter与 checkpoint/full-test/finalize boundaries，不为了“完整演示”制造测试膨胀。
4. H1 performance observation的具体采集字段/存放位置应保持 test/report-local，不能形成新 durable telemetry authority。

## 9. Explore Conclusion

H1 可以合法继续 Proposal。

关键结论：

- A1→G1 prerequisites 已可用；
- stable runner fresh-package/fresh-checkout 物理可行；
- real 03 Actual 必须继续保持 absent，直到 H1 checkpoint 后的 Delivery Full Test PASS；
- archive 后 EOF 问题 **应该进入 H1 self-hosting acceptance**，但处理时机必须保留为 **Owner authorize-checkpoint 后的 EOF-only mechanics**，不能移进 archive；
- 当前真实 gap 不是“没有 normalization authority”，而是 stable runner 尚无 public **read-only exact-plan checkpoint handoff**；Proof J 已证明 exact candidate/path/EOF-operation plan可由 repository/Git/formal facts确定，且 unrelated/non-EOF hygiene可 fail closed；
- 当前还没有 H1-owned full self-hosting physical fixture / Verification target，因此不能提前宣称 self-hosting accepted；
- H1 的正确实现重心是一个 future-Delivery-shaped E2E fixture + 最小 stable-runner/checkpoint surface closure，而不是新增 lifecycle/Registry/auto-loop。

Author STOP after terminal Explore；下一 Formal boundary应由 Policy决定 `review-explore`。
