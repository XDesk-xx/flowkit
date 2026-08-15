# Explore

## 1. Problem

F1 `archive-and-checkpoint-boundary` 需要把已经分散存在于 Policy、FormalFactReader、OpenSpec archive continuation、Git boundary reader 与 Owner provenance 中的能力收敛成稳定的 Change Archive → completed → Change Checkpoint boundary，并保证 checkpoint 仍是独立 Git boundary、不是 Standard Run。

当前 canonical Base 已经完成并 checkpoint E2，但 checkpoint 后立即暴露了一条真实 repository-state regression：

`tests/unit/verification/change-selection/mutation-declaration.test.ts` 将 E2 active `design.md` 路径与 `process.cwd()` 写死在测试中。E2 archive 后 active path 正常消失，因此 canonical repository 的该测试出现 ENOENT。F1 必须处理这条 archive 后 fixture coupling，而不能把它改成依赖 archived E2 path 的另一种 repository-state coupling。

## 2. Current Facts

Canonical Base：

```text
repository: XDesk-xx/flowkit
branch: delivery/20260810-01-change-execution-loop
HEAD: e182492181166ef00b8546923f1ce6ad168564f7
```

Git HEAD 是 E2 Change Checkpoint：

```text
chore(flowkit): checkpoint change-verification-generalization-and-lean-run-normalization
Flowkit-Boundary: change-checkpoint
Owner-Authorization: owner:9f585a5aac26e84a171ea5abd1c2c88d20fb4ce7318cd606db06dd781dab73dc
```

Formal facts：

```text
E2 change-verification-generalization-and-lean-run-normalization
→ state = completed
→ archive Run 20260814-158-archive = completed
→ matching structured Change Checkpoint = HEAD

F1 archive-and-checkpoint-boundary
→ dependsOn = E2
→ state was planned
```

Owner 已明确授权 F1 Explore。正式 activation：

```text
owner:2fddff69ffc1b74628e1e8ff63b37c7af51a78ee1e235a88b77d2da7c9a5b061
→ activate-change
→ F1 active
```

Activation 后：

```text
stage: explore
next: explore
doctor: ok / 0 findings
```

F1 Explore generation：

```text
20260814-159-explore → completed
20260814-160-review-explore → changes-requested
20260814-161-revise-explore → prepared before this revision
```

E2 checkpoint 后的 prospective writer 已真实作用于 F1：159 preparation 只生成 `action.md` 与 `context.json`，没有 `entry-workspace.json`、`verification-selection.json`、`verification-evidence.json`。

当前已有基础：

- Policy 已能区分 archive terminal、completed-uncheckpointed Change 与 `authorize-checkpoint`；
- FormalFactReader 已有 bounded `checkpointArchiveTerminal` projection；
- Git boundary reader 已能按 Delivery Start 拓扑归属 checkpoint subject，但 160 Review 证明它尚未验证 formal trailers / Owner authorization binding；
- Owner write-side 已支持 fail-closed `authorize-checkpoint`；
- D2 已关闭 OpenSpec archive relocation 后 same-Run terminal continuation；
- E2 已交付 generic Change Verification 与 post-E2 three-file writer；
- Git checkpoint 仍由 Executor/ Git authority 执行，不是 Standard Run。

## 3. Scope Boundary

### In scope

F1 应收口：

```text
archive preconditions
OpenSpec archive success → Change.state=completed
completed-uncheckpointed Change checkpoint readiness
matching terminal archive proof
Owner authorize-checkpoint target/provenance
Delivery-scoped structured checkpoint recognition
checkpoint Git handoff / deterministic preflight
archive → checkpoint → next Change lifecycle regression
post-E2 F1 three-file writer dogfood
archive 后 repository-state-independent mutation-declaration test fixture
```

F1 Proposal 应把 checkpoint handoff 定义成薄的 deterministic Git boundary preparation：输出/验证允许的 commit subject/trailers、target Change identity 与 preflight requirements；它不得拥有 Git commit truth，也不得自动 commit/push。

### Out of scope

```text
Delivery Full Test / Delivery Finalize
Archify
G1 Change CLI full surface
automatic Commit / Push / Merge
重新设计 E2 writer
重新设计 D2 archive continuation
通用 Git transaction / rollback platform
Registry / Evidence platform
把 Checkpoint 重新做成 Action 或 Run
```

## 4. Risk Scan

| Risk | yes/no | Why |
|---|---|---|
| Scope expansion / missing prerequisite | yes | archive/checkpoint 机制已有多块实现，F1 风险是重复实现或偷偷进入 G1/Git automation |
| Cross-time facts | yes | Review/Verification/Archive terminal/Owner checkpoint/Git commit 分属不同时间边界 |
| Schema / persistence migration | no | F1 不需要新的持久化 schema；消费 E2 current writer 与 bounded historical reader |
| Self-hosting / writer changes itself | yes | F1 是 E2 checkpoint 后第一个正式 three-file next-consumer |
| Authority duplication | yes | OpenSpec、Owner、Git、Policy 各自已有 authority，F1 只能引用/派生 |
| Generic reusable subsystem | yes | checkpoint recognition/handoff 必须适用于后续任意 Change，不得绑定 E2/F1 identity |
| Activation must persist across Change/Delivery boundaries | no new migration | E2 已完成 repository-global current writer transition；F1 只验证其 first-consumer behavior |
| Candidate/formal-fact mutation affects existing consumers | yes | archive relocation 已真实导致 mutation-declaration test fixture active-path coupling |
| Verification selection must reach actual executed targets | yes | F1-shaped selection 必须继续映射到实际 execution/openspec/verification tests |
| External tool performs real mutation | yes | OpenSpec archive 与 Git checkpoint 都会真实改变 external authority facts |
| Change claims performance improvement | no | F1 不以性能优化为 required outcome |

## 5. Applicable Proofs

### Proof A — Checkpoint recognition / Owner authorization temporal authority closure

**Question:** F1 能否在不创建第二套 Git/Owner truth 的前提下，让 formal checkpoint recognition 同时满足 strict identity、Owner authorization binding 与 **authorization-before-boundary** 的时间约束，拒绝后来补 Owner fact 对历史 checkpoint 的事后追认，同时保留当前历史 checkpoint 的 bounded compatibility？

**Acceptance Boundary:**

```text
Owner authorize-checkpoint fact 已存在
→ exact Delivery/Change target
→ formal Git checkpoint identity
→ checkpoint boundary 形成时可证明 matching Owner fact 已存在
→ recognized Change Checkpoint
→ Policy no longer asks authorize-checkpoint
→ next Change may activate
```

反向必须满足：

```text
subject-only / wrong Delivery / wrong Change / wrong Boundary /
missing or mismatched Owner authorization provenance /
checkpoint-first → authorization-later
→ NOT a formal Change Checkpoint
→ later current Manifest Owner fact MUST NOT retroactively admit it
→ Policy remains authorize-checkpoint
```

**Method:**

1. 保留 161 已完成的 subject-only / malformed / wrong-target strict identity proof；
2. 检查当前 canonical E2 checkpoint commit body、checkpoint commit tree 中的 Manifest bytes，以及 later/current Manifest Owner facts；
3. 在 disposable Git repo 中实现不进入 candidate 的最小 temporal-recognition prototype：
   - Git commit body/trailers仍来自 Git authority；
   - Owner authority仍是正式 Manifest Owner fact，不复制第二份 checkpoint state；
   - strict checkpoint要求 subject target与 `Flowkit-Delivery / Flowkit-Change / Flowkit-Boundary / Owner-Authorization` 相互一致；
   - **matching `authorize-checkpoint` Owner record 必须存在于 checkpoint commit 自身 tree（或语义等价、可证明不晚于该 boundary 的 ancestor fact）**，而不是只在当前 repository Manifest 中存在；
   - Owner ref继续使用 canonical tuple hash验证 decision / Delivery / Change / sourceRef；
   - 以当前 Flowkit 02 migration lineage 中第一个已完整绑定 Owner authorization 的 E2 checkpoint作为 bounded cutover anchor：anchor之前同 Delivery历史 checkpoint可 legacy-read；anchor及以后必须 strict；fresh/downstream repository不存在该 migration lineage时没有 legacy exemption；
4. 构造 `checkpoint-first → authorization-later` 攻击：checkpoint commit 先携带一个未来 Owner ref，但其 commit tree 尚无该 Owner record；随后新 commit 才把 matching record 写入当前 Manifest；分别比较“current Manifest ref equality”与 temporal strict prototype；
5. 保留 161 的 malformed/unbound cases，并用真实 canonical E2/E1 checkpoints验证 current strict shape 与 bounded legacy shape均可表达。

**Current defect / temporal gap evidence:**

161 已证明 current `src/facts/git-boundary-reader.ts` 会从 subject-only checkpoint 直接产生 GitBoundaryFact；162 进一步指出：即便 Proposal 后续只做“commit trailer Owner ref == **current** Manifest Owner ref”，仍会留下如下时间漏洞：

```text
T1 checkpoint commit
   trailers: Owner-Authorization = owner:X
   checkpoint commit tree: NO owner:X fact

T2 later commit
   current Manifest adds owner:X authorize-checkpoint

current-ref-equality-only recognition at T2
→ historical T1 checkpoint becomes retroactively valid
```

Author disposable proof 明确重现：

```text
checkpoint-first → authorization-later
current Manifest equality only:
  recognized = true   # 漏洞

temporal strict prototype:
  recognized = false  # 正确 fail-closed
```

**Temporal feasibility evidence:**

Disposable matrix：

```text
case                                                strict recognized   expected
--------------------------------------------------  ------------------  --------
authorization-before-checkpoint                     true                true
checkpoint-first → authorization-later              false               false
subject-only                                        false               false
wrong-delivery                                      false               false
wrong-change                                        false               false
wrong-boundary                                      false               false
missing-owner-provenance                            false               false
mismatched-owner-provenance                         false               false
```

同一 temporal attack 对“只读 current Manifest”的对照实现返回：

```text
checkpoint-first → authorization-later
current-manifest-equality = true
```

证明 **current ref equality 本身不足以满足 authority temporal order**。

真实 canonical E2 checkpoint：

```text
commit:
e182492181166ef00b8546923f1ce6ad168564f7

Flowkit-Delivery: 20260810-01-change-execution-loop
Flowkit-Change: change-verification-generalization-and-lean-run-normalization
Flowkit-Boundary: change-checkpoint
Owner-Authorization: owner:9f585a5a...
```

该 **checkpoint commit 自身 tree** 的：

```text
openspec/delivery-groups/20260810-01-change-execution-loop.yaml
```

已经包含完全匹配的：

```text
decision: authorize-checkpoint
deliveryId: 20260810-01-change-execution-loop
changeId: change-verification-generalization-and-lean-run-normalization
ref: owner:9f585a5a...
```

所以 canonical E2 checkpoint 可被 non-retroactive strict rule接受，不需要新增 Owner persistence。

Bounded legacy evidence 继续成立：

```text
legacy E1 checkpoint:
e15d0a3c5bf7b46d3a1134eb3a5e208f11f7e564

is ancestor of E2 strict anchor: true
Owner-Authorization trailer: absent
```

因此 Proposal 可以在明确 cutover 前保留 bounded historical read，同时对 strict anchor及以后要求 temporal Owner binding；无需回写旧 Git。

**Evidence Boundary:** disposable proof 已覆盖 Owner authorization point-in-time existence → strict Git identity → non-retroactive admission，并覆盖 `authorization-before-checkpoint = accepted` 与 `checkpoint-before-authorization-later = rejected`；161 的 malformed/unbound fail-closed 与 bounded legacy compatibility保持成立；真实 E2 checkpoint commit tree证明 current canonical history可满足同一 temporal rule。

**Gap:** 当前 production Reader 尚未实现 temporal admission。Proposal必须冻结“Owner authorization 在 checkpoint boundary 时已存在”的可验证机制；可以采用 checkpoint commit tree/ancestor fact或语义等价的不可事后追认机制，但不得退回到 current Manifest ref equality。

**Result: PASS（feasibility），current implementation remains GAP**

**Implication:** F1 required outcome必须同时包含：

```text
checkpoint handoff generation/preflight
+
checkpoint recognition/admission
+
Owner authorization temporal existence proof
```

三者共同闭合：Owner authority先存在，Executor形成Git boundary，Reader只承认形成时已被授权的formal checkpoint；Checkpoint仍不是 Run，Owner/Git仍各自保持 primary authority。

---

### Proof B — F1 是 post-E2 three-file writer 的第一个真实 dogfood

**Question:** E2 checkpoint 后，F1 是否真实使用 prospective current writer，而非回退到 historical sidecars？

**Acceptance Boundary:** F1 第一份 Standard Run preparation 使用 current three-file physical model，不需要 E1/E2 legacy sidecars。

**Method:** 在 exact E2 checkpoint Base 上正式 activate F1，然后 Policy-first prepare Explore 159；检查 Run directory。

**Evidence:**

159 terminal physical files：

```text
action.md
context.json
result.json
```

不存在：

```text
entry-workspace.json
verification-selection.json
verification-evidence.json
```

160 Review 与 161 revise-explore继续使用同一 post-E2 Run model，没有要求恢复 sidecars。

**Evidence Boundary:** 真实 canonical E2 checkpoint 后的 F1 Standard Runs。

**Gap:** Apply/revise-apply 的 compact entry/mutation declaration仍要在 F1 lifecycle继续 dogfood，但 E2已有对应 regressions；F1不重做 writer。

**Result: PASS**

**Implication:** Proposal 不需要 writer migration scope，只保留 three-file Run acceptance。

---

### Proof C — Archive 后 mutation-declaration test fixture 的 repository-state coupling

**Question:** checkpoint 后观察到的 `mutation-declaration.test.ts` 失败，是 production `deriveMutationDeclaration` 缺陷，还是 test fixture 错误依赖 archived Change 的 active path？

**Acceptance Boundary:** mutation declaration unit test 在 Change active/archived/未来新 Delivery 等 repository lifecycle 状态下都不依赖 `process.cwd()` 当前恰好存在某个历史 Change active path。

**Method:**

1. 当前 E2 checkpoint Base/F1 active 状态运行该 test；
2. 构造独立 temporary repoRoot + 独立 `openspec/changes/fixture-change/design.md`；
3. 使用同一个 production `deriveMutationDeclaration(fixtureRoot, ...)`。

**Evidence:**

当前 repository test：

```text
FAIL
ENOENT:
openspec/changes/change-verification-generalization-and-lean-run-normalization/design.md
```

独立 fixture：

```text
deriveMutationDeclaration(...)
→ PASS
→ selector src/domain/types.ts 正常派生
```

**Evidence Boundary:** post-archive canonical state + repository-independent temporary fixture。

**Gap:** 正式测试尚未修改。

**Result: PASS**

**Implication:** `tests/unit/verification/change-selection/mutation-declaration.test.ts` 是 F1 已知 required test mutation surface；修法必须是 isolated Design fixture/repoRoot，不得仅改成 archived E2 path，也不得让 production code special-case E2。

---

### Proof D — F1 generic Verification / physical selection feasibility

**Question:** F1-shaped actualChangeSet 是否能进入 E2 generic Verification，而不依赖 E1/E2 identity？

**Acceptance Boundary:** F1 production/spec/test paths可 deterministic 映射到 source-controlled modules/capabilities/logical checks，并由 physical resolver执行对应测试。

**Method:** 使用 E2 current selection/module-map regressions，并在 mutation-surface closure中逐项标记未来 changed tests 的 physical owner。

**Evidence:**

```text
tests/unit/verification/change-selection/selection.test.ts → 5/5 passed
tests/unit/verification/change-selection/module-map.test.ts → 4/4 passed
```

Current module map 已含：

```text
capability: flowkit-archive-and-checkpoint-boundary
execution paths → tests-execution
OpenSpec runtime paths → tests-openspec-runtime
change/spec paths → openspec-current-change-strict
```

**Evidence Boundary:** F1-shaped logical selection + closed deterministic module map。

**Gap:** Proposal冻结实际 selectors后，Apply formal Verification必须枚举 actual executed targets；新增 F1 integration/test path若现有 Catalog未覆盖，必须在同一已闭合 conditional surface内补 mapping，而不能把 logical selection PASS当作 physical closure PASS。

**Result: PASS（selection feasibility）**

**Implication:** F1 不建立第二 Verification framework；formal Apply evidence负责最后 physical closure。

---

### Proof E — External mutation authority separation

**Question:** F1 是否需要拥有 OpenSpec archive mutation或 Git commit truth？

**Acceptance Boundary:** OpenSpec继续拥有 archive relocation/result；Git继续拥有 checkpoint commit/history；Owner拥有 checkpoint authorization；Flowkit只生成 deterministic handoff/preflight、admit/recognize formal boundary并让 Policy消费。

**Method:** 读取 E2 158 archive、canonical E2 checkpoint、Owner record与 Proof A recognition prototype。

**Evidence:**

```text
158 archive: completed
OpenSpec active E2 absent / archived E2 present
E2 checkpoint: canonical Git commit
Owner authorize-checkpoint: canonical Manifest fact
```

Proof A进一步证明 Flowkit可以只消费 Git trailers + Owner fact完成 admission，不需要持久化第二份 checkpoint state。

**Evidence Boundary:** 真实 external OpenSpec mutation + canonical Git boundary + disposable recognition/admission proof。

**Gap:** production recognition/handoff尚待 F1 Apply实现。

**Result: PASS**

**Implication:** F1不得新增 OpenSpec archive engine、Git transaction database、Checkpoint Run或自动 commit/push。

---

### Proof F — Mutation Surface + Verification Closure

**Question:** 在 Proposal冻结 `flowkitMutationScope` 前，F1 checkpoint authority chain 的 current source/test consumers 是否已完整检查并分类？

**Acceptance Boundary:** 所有已知 required prerequisite 位于 Feasible Proposal Boundary；Proposal只在已扫描的 closed surface 内冻结最小 selectors，不再承担“继续发现漏项”。

**Method:** 对 exact Base + 160 cumulative candidate 执行 static direct-reference scan：

```text
authorize-checkpoint
change-checkpoint
GitBoundaryFact
checkpointArchiveTerminal
getCompletedUncheckpointedChanges
readGitBoundarySummaries
Owner-Authorization
```

扫描 `src/` + `tests/` 得到 19 个 direct consumer files，并额外检查 canonical OpenSpec contract refs。

**Static scan — source consumers（9）:**

```text
src/domain/a1-types.ts
src/facts/formal-fact-reader.ts
src/facts/formal-fact-snapshot.ts
src/facts/git-boundary-reader.ts
src/policy/next.ts
src/policy/preconditions.ts
src/policy/types.ts
src/services/a1-write-service.ts
src/services/b1-run-execution-service.ts
```

**Static scan — test consumers（10）:**

```text
tests/integration/e2-change-verification-generalization.test.ts
tests/integration/openspec-1-7-real-cli.test.ts
tests/unit/domain/actions.test.ts
tests/unit/facts/formal-fact-snapshot.test.ts
tests/unit/facts/git-boundary-reader.test.ts
tests/unit/policy/fixtures.ts
tests/unit/policy/next.test.ts
tests/unit/policy/preconditions.test.ts
tests/unit/policy/types.test.ts
tests/unit/services/a1-write-service.test.ts
```

另有本次真实 regression：

```text
tests/unit/verification/change-selection/mutation-declaration.test.ts
```

它不含 checkpoint literal，但由 archive relocation/lifecycle state触发，因此作为 affected regression纳入 required surface。

Canonical contract direct refs（4）：

```text
openspec/specs/flowkit-delivery-change-creation-and-owner-input/spec.md
openspec/specs/flowkit-domain-and-state-schema/spec.md
openspec/specs/flowkit-formal-fact-reader-and-persistence/spec.md
openspec/specs/flowkit-policy-engine/spec.md
```

**Required mutation / regression surface:**

```text
src/facts/git-boundary-reader.ts
  → strict formal checkpoint recognition/admission + bounded legacy read

src/facts/formal-fact-reader.ts
  → Owner authorization已由 Manifest reader先读取；formal Git recognition必须消费该authority，不能让git reader自己重读/拥有Manifest truth

tests/unit/facts/git-boundary-reader.test.ts
  → valid formal + subject-only + wrong Delivery/Change/Boundary + missing/mismatched Owner provenance + legacy cutover

tests/unit/policy/next.test.ts
tests/unit/policy/preconditions.test.ts
  → malformed/unbound boundary不得使Policy跳过 authorize-checkpoint；valid admitted boundary才允许successor progression

new F1 disposable lifecycle integration test
  → archive terminal completed → Change completed → Owner authorize-checkpoint → formal checkpoint recognition → next Change

tests/unit/verification/change-selection/mutation-declaration.test.ts
  → isolated Design fixture/repoRoot，关闭archive后repository-state coupling

F1 proposal/design/specs/tasks + applicable canonical capability deltas
  → 明确 handoff generation 与 recognition/admission 是同一authority chain的两个不同职责
```

**Examined but no known production mutation required（unless Proposal chooses a representation that changes them）:**

```text
src/domain/a1-types.ts
src/policy/types.ts
  → authorize-checkpoint vocabulary已经存在

src/facts/formal-fact-snapshot.ts
  → prototype表明可在投影GitBoundaryFact前完成strict admission；无需为Owner ref建立第二 durable truth

src/policy/next.ts
src/policy/preconditions.ts
  → 当前逻辑在只接收admitted GitBoundaryFact时可复用；production mutation不是已知 prerequisite，但tests必须覆盖

src/services/b1-run-execution-service.ts
  → Checkpoint不是Run，F1不得通过修改B1来创建checkpoint action/run

src/services/a1-write-service.ts
  → current Owner authorize-checkpoint write-side已fail-closed存在；只有Proposal选择在该service承载thin handoff/preflight时才需要修改
```

**Implementation-choice conditional surface:**

```text
new narrow checkpoint handoff/preflight service
OR minimal extension of existing write/read service

src/services/a1-write-service.ts + tests/unit/services/a1-write-service.test.ts
  → only if chosen as handoff host

src/facts/formal-fact-snapshot.ts + tests/unit/facts/formal-fact-snapshot.test.ts
  → only if Proposal proves additional ephemeral projection metadata is necessary

src/verification/change-selection/**
  → only if the selected new F1 files/tests are not already physically owned by current Catalog

tests/integration/openspec-1-7-real-cli.test.ts
  → reusable archive continuation baseline; modify only if F1 end-to-end acceptance is best expressed there instead of a new isolated F1 integration test
```

**Explicitly outside mutation surface:**

```text
G1 CLI implementation
automatic git commit/push
Delivery Full Test / Finalize
Archify
E2 writer redesign
D2 archive continuation redesign
```

**Verification closure mapping:**

```text
Git reader / FormalFactReader / Policy regression
→ tests-execution logical owner
→ physical unit/integration test files must appear in formal evidence

OpenSpec F1 specs
→ openspec-current-change-strict

mutation-declaration fixture
→ current verification-selection test ownership; if new F1 path is unmapped, Catalog update is conditional but already inside closed surface
```

**Evidence Boundary:** static direct references、affected archive regression、current type/vocabulary contracts与 generic Verification mapping均已检查；不存在已知 required source/test prerequisite落在上述 Feasible Proposal Boundary之外。

**Gap:** 最终 implementation file set仍由 Proposal在 required + conditional closed surface中选择最小集合；这不是继续寻找 consumer，而是实现选择。

**Result: PASS**

**Implication:** 160 的 F1-RE-002 已关闭。Proposal不得再写“继续扫描以发现 mutation surface”；只能在本 Explore 已闭合的 surface内冻结最小 selectors。

## 6. Rejected Approaches

### 6.1 只生成 canonical checkpoint subject/trailers，但 Reader继续 subject-only recognition

拒绝。Writer/handoff正确不能抵消 Reader fail-open；普通 commit仍可绕过 Owner checkpoint boundary。

### 6.2 把 Owner authorization复制成 Flowkit第二份 checkpoint state

拒绝。Owner authority仍是 Manifest Owner fact，Git authority仍是 commit bytes；Reader只做 cross-authority admission。

### 6.3 为修 historical compatibility 回写旧 Git commit

拒绝。legacy checkpoint必须 bounded read，历史Git immutable。

### 6.4 直接把 mutation-declaration test 改成 archived E2 path

拒绝。它只是从依赖 active E2变成依赖 archived E2，仍绑定 repository history。

### 6.5 production code special-case E2/F1 change identity

拒绝。checkpoint长期语义必须generic；只允许对当前 Flowkit migration history做明确 bounded compatibility，不把Change literal变成长期Policy。

### 6.6 F1 新建 Checkpoint Action / Checkpoint Run或自动 commit/push

拒绝。Checkpoint是Owner-authorized Git boundary，不是Standard Change Action；Git mutation仍由Executor在授权后机械执行。

### 6.7 重做 D2 archive continuation或E2 writer

拒绝。两者均已有completed checkpointed authority，F1只消费。

## 7. Feasible Proposal Boundary

F1 可以进入 Proposal；Proposal必须在以下**已闭合**边界中冻结最小实现：

1. **Archive preconditions / completed transition复用**
   - latest review-apply approved；
   - Blocking=0；
   - Change Verification satisfied；
   - tasks complete；
   - Owner authorize archive；
   - D2 same-Run OpenSpec archive terminal continuation继续复用；
   - OpenSpec archive success后Change immediately completed，checkpoint不参与active→completed。

2. **Checkpoint handoff 与 checkpoint recognition/admission 明确分离但共同闭合 authority chain**
   - handoff/preflight生成或验证 canonical subject/trailers、exact target、`git diff --check` / staged `git diff --cached --check` requirements；
   - recognition不得从subject alone产生formal checkpoint；
   - strict current checkpoint必须绑定Git formal identity与同 Delivery/Change 的合法 `authorize-checkpoint` provenance；
   - matching Owner authorization必须可证明在checkpoint boundary形成时已存在，不能仅匹配later/current Manifest；
   - checkpoint-first → authorization-later不得被retroactively admitted；
   - malformed/unbound commit不得让Policy跳过Owner decision；
   - 不持久化第二份checkpoint state。

3. **Bounded historical compatibility**
   - 不回写历史Git；
   - 当前Flowkit migration history中的旧checkpoint保持可读；
   - Proof A 已证明“以已formal-bound的migration anchor限定legacy ancestors、post-anchor/fresh strict”可行；Proposal可冻结该方案或等价结构，但必须明确cutover scope，不能恢复无限 subject-only legacy default。

4. **Checkpoint lifecycle regression**
   - disposable fixture覆盖合法链：archive terminal completed → Change completed → Owner authorization → formal checkpoint → next Change；
   - 反例覆盖subject-only、wrong Delivery、wrong Change、wrong Boundary、missing/mismatched Owner provenance、wrong target；
   - temporal反例必须覆盖checkpoint-first → authorization-later，并证明later fact不能事后追认历史commit；
   - 证明 invalid boundary时Policy仍返回 `authorize-checkpoint`。

5. **Post-E2 Run acceptance**
   - F1 new Runs保持 `action.md / context.json / result.json`；
   - 不创建新的sidecar，不重做E2 migration。

6. **修复 post-archive mutation-declaration fixture coupling**
   - 使用isolated Design fixture/repoRoot；
   - 不依赖E2 active/archived path。

7. **Verification closure**
   - actual changed paths必须被E2 generic Catalog映射；
   - formal selected checks必须真实执行changed/affected regression target；
   - Apply evidence枚举physical targets，不能用独立`npm test`替代formal selection evidence。

8. **Mutation surface closed before Proposal**
   - Required与conditional surfaces以Proof F为上界；
   - Proposal只负责在该closed surface中选最小selectors；
   - 若Proposal发现必须修改Proof F未覆盖的新source/test prerequisite，说明Explore结论失效，应返回Explore而不是静默扩scope。

## 8. Reviewer Finding Convergence

### F1-RE-001 — superseded by F1-RE-003

- 161 已关闭 subject-only / malformed / wrong-target strict identity gap；
- 162 进一步指出 current Manifest ref equality 仍缺 authorization-before-boundary 时间绑定，因此原 finding 由更精确的 F1-RE-003 supersede。

### F1-RE-002 — resolved in 161

- 已完成19个src/tests direct consumer文件 + 4个canonical contract direct refs的static scan；
- archive后mutation-declaration affected regression额外纳入；
- required / no-known-mutation / implementation-choice conditional三类surface已分类；
- Feasible Proposal Boundary不存在已知required consumer/test漏项；
- Proposal不再承担“继续扫描找surface”，只在closed surface内选择selectors。

### F1-RE-003 — resolved in 163

- Explore acceptance 已显式加入 Owner authorization temporal existence，不再只要求 current ref equality；
- disposable proof覆盖 `authorization-before-checkpoint = accepted`；
- disposable proof覆盖 `checkpoint-first → authorization-later = rejected`，并同时证明 current-Manifest-only equality 会错误返回 accepted；
- subject-only / wrong Delivery / wrong Change / wrong Boundary / missing/mismatched provenance仍 fail-closed；
- canonical E2 checkpoint commit tree已包含 matching authorize-checkpoint Owner fact，可满足 non-retroactive strict shape；
- pre-anchor E1 checkpoint仍作为 bounded legacy history读取，不回写历史Git。

## 9. Open Decisions

无需新的 Owner architecture decision。

Proposal 仅需在已闭合边界内冻结实现选择：

1. strict checkpoint recognition如何在 `git-boundary-reader` 与 `formal-fact-reader`之间消费Owner authorization并证明其在checkpoint boundary时已存在，必须保持One fact / one authority且禁止retroactive admission；
2. bounded legacy cutover采用Proof A已验证的migration-anchor方案还是语义等价、更小的结构；
3. thin checkpoint handoff/preflight放在新增窄service还是现有service最小扩展；
4. F1 canonical spec采用新增capability还是少量MODIFIED Requirements组合已有capabilities。

这些选择不得改变已冻结 acceptance：

```text
subject-only / malformed / unbound checkpoint fail-closed
Owner authorization必须被机械绑定且在checkpoint boundary时已存在
checkpoint-first → authorization-later不得被retroactively admitted
legacy compatibility bounded且不改写历史Git
Checkpoint no Run / no auto commit/push
mutation surface不再在Proposal阶段继续发现
```

Explore环境此前完整 `npm test` 的两个Linux→Windows PowerShell simulation `EACCES`观察仍与F1 archive/checkpoint因果无关；F1不静默吸收。若formal Change Verification在适用环境复现，则由Verification authority fail-closed处理。
