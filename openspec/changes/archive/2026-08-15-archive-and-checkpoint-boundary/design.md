## Context

159/161/163 Explore 与 160/162/164 Review 已冻结 F1 的 required outcome：Archive success 已能立即关闭 Change；真正未闭合的是 checkpoint authority chain。当前 `git-boundary-reader.ts` 只按 subject/topology分类 checkpoint，导致 subject-only commit 可被投影为正式 GitBoundaryFact；即使后续增加 `Owner-Authorization` ref equality，如果只读取 later/current Manifest，也会允许 checkpoint 先形成、Owner fact 后补的 retroactive admission。

F1 还承担 E2 checkpoint 后第一个真实 next-consumer 的收口：159/161/163 已证明 current Run 物理模型只有 `action.md` / `context.json` / `result.json`。该 writer 不在 F1 重做。

## Goals / Non-Goals

**Goals:**

- formal Change Checkpoint recognition fail-closed：structured Git identity、exact Delivery/Change target、Owner provenance与 temporal existence共同成立；
- matching `authorize-checkpoint` Owner fact 必须在 checkpoint boundary形成时已经存在，later/current fact不得事后追认历史 commit；
- current Flowkit pre-cutover legacy checkpoint bounded-readable，但 strict anchor以后及 fresh/downstream repository不得恢复无限 subject-only fallback；
- checkpoint handoff/preflight 是纯 deterministic preparation，不拥有 Git commit truth、不自动 commit/push；
- Policy只消费 admitted `GitBoundaryFact`，invalid boundary继续停在 `authorize-checkpoint`；
- F1 lifecycle regressions被 generic Change Verification实际执行；
- archive 后 mutation-declaration unit test使用 isolated fixture，不绑定某个 historical Change path。

**Non-Goals:**

- 不重新设计 OpenSpec archive continuation/recovery；
- 不重新设计 E2 three-file writer/historical sidecar reader；
- 不实现 G1完整 Change CLI/runner；
- 不实现自动 commit/push/merge、Git transaction DB、rollback engine；
- 不实现 Delivery Full Test/Finalize/Archify；
- 不把 Checkpoint变成 Formal Action/Run。

## Decisions

### 1. Git Reader 先读 candidate，FormalFactReader 完成 cross-authority admission

`git-boundary-reader.ts` 继续只从 Git authority读取 topology、commit identity、subject 与 formal checkpoint trailers，形成内部 candidate；它不拥有 Owner Manifest truth。

Current strict candidate 至少必须能表达：

```text
commitSha
subject = chore(flowkit): checkpoint <change-id>
Flowkit-Delivery = <delivery-id>
Flowkit-Change = <change-id>
Flowkit-Boundary = change-checkpoint
Owner-Authorization = owner:<canonical-ref>
```

重复、缺失、冲突或 wrong-target trailers都不是 formal current checkpoint candidate。Delivery ownership仍由最近 Delivery Start ancestor topology限定，避免其他 Delivery 同名 Change泄漏。

`formal-fact-reader.ts` 负责把 Git candidate 与 Owner authority组合后才投影 `GitBoundaryFact`。Policy不消费 raw candidate。

备选方案：让 Git Reader自己解析 current/historical Manifest并拥有 Owner decision validation。拒绝，因为这会让 Git reader成为第二个 Owner fact reader，破坏 One fact / one authority。

### 2. Owner temporal binding 使用 checkpoint-time Manifest fact，不使用 later/current ref equality

Strict checkpoint admission 必须证明 matching Owner record 在该 Git boundary形成时已经存在。实现上冻结为：对 candidate checkpoint SHA 读取该 commit tree中的本 Delivery Manifest bytes，复用 FormalFactReader 已有 Owner decision parsing/canonical-ref validation语义，要求存在 exact：

```text
decision = authorize-checkpoint
deliveryId = candidate Flowkit-Delivery
changeId = candidate Flowkit-Change
ref = candidate Owner-Authorization
```

该 record 的 canonical ref必须由 decision / Delivery / Change / sourceRef tuple重新计算并匹配。因为事实来自 checkpoint commit tree（或其已包含该事实的 ancestor），later commit新增同 ref不能改变历史 boundary在形成时的 admission结果。

Current Manifest中的 Owner fact可以继续作为当前 Owner authority projection，但**不能单独证明历史 checkpoint已被授权**。

若 checkpoint commit tree中的 Manifest缺失、不可解析、Owner record不匹配或 Git show失败，strict checkpoint fail closed，不得降级成 subject-only。

### 3. Bounded legacy cutover 只服务真实 Flowkit migration history

当前仓库在 E2 checkpoint之前已有历史 checkpoint没有完整 formal/Owner trailers；不得回写 Git。

F1 冻结 bounded compatibility：

```text
migration delivery = 20260810-01-change-execution-loop
strict anchor change = change-verification-generalization-and-lean-run-normalization
```

只有当当前 Git lineage中存在可 strict-admit 的 E2 checkpoint candidate 集合时，才允许计算 bounded legacy cutover。original strict anchor 冻结为：**在该 strict-admitted E2 candidate 集合中，唯一一个是所有其它 strict E2 candidates ancestor 的 checkpoint**。这里的 `strict-admitted` 必须复用 Decision 1/2 的完整 cross-authority admission：Git formal identity + checkpoint-time matching `authorize-checkpoint` Owner fact；仅 subject/trailer shape 不构成 anchor authority。

F1 冻结一个共享的窄 projection/helper（实现位置保持在 FormalFactReader authority boundary 内，不新增第二 authority store），返回该 repository 当前 lineage 的 `originalStrictE2Checkpoint` 或 fail-closed/none。它被两个 consumer共同使用：

```text
FormalFactReader bounded legacy admission
        +
B1 post-E2 writer activation
        ↓
同一个 original strict-admitted E2 checkpoint
```

`git-boundary-reader.ts` 仍然只负责 Git candidate parsing，不负责 Owner temporal admission；`readGitBoundarySummaries()` 或任何仅 Git-only `formalIdentityValid` projection **不得**作为 migration writer activation authority。

B1 `isPostE2ThreeFileWriterActive()` 冻结为：

```text
没有 Flowkit 02 pre-E2 migration lineage
→ fresh/downstream current source
→ three-file writer = active

存在 migration lineage
→ resolve shared originalStrictE2Checkpoint
   ├─ none / ambiguous / not strict-admitted
   │  → writer activation fail closed
   └─ unique anchor
      → only if anchor is ancestor of current HEAD
         three-file writer = active
```

因此一个 E2 commit即使 subject/trailers完全正确、`Owner-Authorization` 也长得像 canonical ref，只要 checkpoint commit tree里没有 matching `authorize-checkpoint` Owner fact，它就不能激活 writer。

- 如果存在唯一 original strict anchor，则同一 Delivery 中位于该 anchor ancestor side 的既有 historical checkpoint MAY按已有 topology/legacy count规则读取；
- original anchor 自身及其 descendants MUST strict；
- 后续重复 E2 checkpoint 只是普通 strict fact，不得把 cutover 向后移动，也不得替换 writer activation anchor；
- subject-only E2 checkpoint 或 full-trailer-but-temporally-unauthorized E2 candidate 均不是 strict anchor，不得用于 writer activation 或 legacy anchor；
- 如果 strict E2 candidates 分叉、无唯一 original ancestor或其它歧义，legacy exemption与 migration-lineage writer activation均 fail closed；
- 不在该 bounded migration lineage中的 repository 不获得 legacy exemption。

Fresh/downstream repository没有 Flowkit 02 pre-E2 migration lineage时，所有 current checkpoint直接使用 strict admission，同时 current source继续默认使用 three-file writer，不要求伪造内部 E2 anchor。

该 literal只标识一次性 historical cutover，不进入长期 Policy/Change identity判断。

### 4. Thin checkpoint handoff/preflight 使用新窄 service，不扩张 A1 Owner writer

新增 `src/services/f1-checkpoint-boundary-service.ts`（名称可在 Apply保持同一 selector，不形成平台），职责仅是从已满足 checkpoint Owner gate的 formal facts生成 deterministic handoff：

```text
subject:
  chore(flowkit): checkpoint <change-id>

trailers:
  Flowkit-Delivery: <delivery-id>
  Flowkit-Change: <change-id>
  Flowkit-Boundary: change-checkpoint
  Owner-Authorization: <matching owner ref>

preflight:
  git diff --check
  git diff --cached --check
```

Service必须验证 exact completed-uncheckpointed target与 matching `authorize-checkpoint` owner record；存在歧义、target mismatch或未授权时 fail closed。

Service **不得**：

```text
run git commit
run git push
write checkpoint state
create Run
choose next Change
```

A1 `recordOwnerDecision`继续只拥有 Owner fact写入，不承担 Git handoff mechanics。

### 5. Policy production logic保持不变；严格性来自 admitted GitBoundaryFact

当前 `next()` / `getCompletedUncheckpointedChanges()` 已能：

```text
completed + no checkpoint
→ authorize-checkpoint

completed + recognized checkpoint
→ successor / Delivery-level path
```

F1 不修改 Policy decision tree。关键是 `FormalFactSnapshot.gitBoundaries` 只包含 strict-admitted current checkpoint或bounded legacy checkpoint。

Tests必须证明 subject-only、wrong Delivery/Change/Boundary、missing/mismatched Owner、checkpoint-first→authorization-later都不会让 Policy跳过 `authorize-checkpoint`。

### 6. F1 integration test进入 generic Verification 的 physical execution union

新增：

```text
tests/integration/f1-archive-and-checkpoint-boundary.test.ts
```

它构造 disposable Git repository / Manifest / archive terminal facts，覆盖：

```text
valid authorization-before-checkpoint
subject-only
wrong Delivery
wrong Change
wrong Boundary
missing Owner provenance
mismatched Owner provenance
checkpoint-first → authorization-later
bounded legacy ancestor
fresh/downstream strict
```

因为 `tests/integration/f1-archive-and-checkpoint-boundary.test.ts` 当前不属于任何 Catalog ownership selector，Apply同时更新：

```text
src/verification/change-selection/module-map.ts
src/verification/change-selection/evidence.ts
```

将该 path归入 execution verification，并确保 `tests-execution` 的 physical Node union实际包含该 integration target；对应 module-map/evidence regressions必须证明 selection与physical command都覆盖它。

### 7. mutation-declaration regression使用isolated Design fixture

`tests/unit/verification/change-selection/mutation-declaration.test.ts` 不再使用：

```text
process.cwd()
+ openspec/changes/<historical-current-change>/design.md
```

测试自己创建 temporary repoRoot + minimal Design containing one合法 `## flowkitMutationScope` block，然后对 production `deriveMutationDeclaration`断言 selector。不得改成 archived E2 path，也不得在 production code special-case E2/F1 identity。

### 8. B1 post-E2 writer activation 必须消费 shared strict-admitted anchor

`src/services/b1-run-execution-service.ts` 的 post-E2 writer activation 是 migration cutover 的 production consumer，因此它必须使用 Decision 3 的 shared `originalStrictE2Checkpoint` projection，而不能继续消费 `readGitBoundarySummaries()` 或其它只验证 Git subject/trailer shape 的结果。这样 writer activation 与 FormalFactReader bounded legacy admission共享同一 authority boundary，同时保持 Git Reader不读取 Owner truth。

`tests/unit/services/b1-run-execution-service.test.ts` 必须覆盖：

- real/strict E2 anchor（含 checkpoint-time matching Owner fact）激活 three-file writer；
- subject-only E2 checkpoint不激活；
- full-trailer + syntactically valid `Owner-Authorization`、但 checkpoint-time Manifest没有 matching Owner fact的 E2 candidate不激活；
- later duplicate strict E2 checkpoint不移动 original anchor；
- fresh/downstream repository没有 Flowkit internal migration lineage时仍默认使用 three-file writer。

该变更只收口 B1 writer cutover consumer，不修改 B1 Run schema、ActionPackage、entry identity或 execution lifecycle architecture。`src/services/b1-run-execution-service.ts` 与对应 test均纳入 F1 `apply` / `revise-apply` mutation scope。

## Failure / Recovery Semantics

- malformed/unbound current checkpoint → 不投影 GitBoundaryFact；Policy保持 `authorize-checkpoint`；
- historical commit later获得 matching current Owner ref → 仍按 checkpoint-time Manifest判定，不 retroactively admit；
- Git/commit-tree Manifest无法读取或 Owner record无法canonical validate → strict fail closed；
- pre-anchor legacy history只在已验证 migration anchor存在时bounded read，不因未来 Change增加而扩大；
- handoff service失败只返回 machine failure，不写 Git，不改变Owner fact，不创建Run。

## Migration Plan

1. F1 Apply先实现 Git candidate structured trailer parsing与 FormalFactReader strict/temporal admission，并抽出/复用 shared original strict E2 anchor projection；bounded pre-anchor legacy read与 B1 writer activation共同消费该 anchor。
2. 增加 thin checkpoint handoff/preflight service与 unit regressions，不接入自动 Git mutation。
3. 增加 F1 disposable lifecycle integration，覆盖 strict/temporal/legacy matrix与Policy progression。
4. 将新 integration path加入 generic Verification ownership与 physical execution union。
5. 修复 mutation-declaration isolated fixture。
6. 使用 F1 formal Change Verification证明 actual changed paths → logical checks → physical targets闭合；Reviewer默认消费该 evidence。
7. F1 Archive完成后仍由 Owner独立 authorize checkpoint，Executor机械形成 Git boundary；Checkpoint不消耗 Run NNN。

## flowkitMutationScope

```json
{
  "schemaVersion": 1,
  "actions": {
    "apply": {
      "selectors": [
        { "kind": "exact", "path": "openspec/changes/archive-and-checkpoint-boundary/tasks.md" },
        { "kind": "exact", "path": "src/facts/formal-fact-reader.ts" },
        { "kind": "exact", "path": "src/facts/git-boundary-reader.ts" },
        { "kind": "exact", "path": "src/services/b1-run-execution-service.ts" },
        { "kind": "exact", "path": "src/services/f1-checkpoint-boundary-service.ts" },
        { "kind": "exact", "path": "src/verification/change-selection/evidence.ts" },
        { "kind": "exact", "path": "src/verification/change-selection/module-map.ts" },
        { "kind": "exact", "path": "tests/integration/f1-archive-and-checkpoint-boundary.test.ts" },
        { "kind": "exact", "path": "tests/unit/facts/formal-fact-reader.test.ts" },
        { "kind": "exact", "path": "tests/unit/facts/git-boundary-reader.test.ts" },
        { "kind": "exact", "path": "tests/unit/policy/next.test.ts" },
        { "kind": "exact", "path": "tests/unit/policy/preconditions.test.ts" },
        { "kind": "exact", "path": "tests/unit/services/b1-run-execution-service.test.ts" },
        { "kind": "exact", "path": "tests/unit/services/f1-checkpoint-boundary-service.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/evidence.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/module-map.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/mutation-declaration.test.ts" }
      ]
    },
    "revise-apply": {
      "selectors": [
        { "kind": "exact", "path": "openspec/changes/archive-and-checkpoint-boundary/tasks.md" },
        { "kind": "exact", "path": "src/facts/formal-fact-reader.ts" },
        { "kind": "exact", "path": "src/facts/git-boundary-reader.ts" },
        { "kind": "exact", "path": "src/services/b1-run-execution-service.ts" },
        { "kind": "exact", "path": "src/services/f1-checkpoint-boundary-service.ts" },
        { "kind": "exact", "path": "src/verification/change-selection/evidence.ts" },
        { "kind": "exact", "path": "src/verification/change-selection/module-map.ts" },
        { "kind": "exact", "path": "tests/integration/f1-archive-and-checkpoint-boundary.test.ts" },
        { "kind": "exact", "path": "tests/unit/facts/formal-fact-reader.test.ts" },
        { "kind": "exact", "path": "tests/unit/facts/git-boundary-reader.test.ts" },
        { "kind": "exact", "path": "tests/unit/policy/next.test.ts" },
        { "kind": "exact", "path": "tests/unit/policy/preconditions.test.ts" },
        { "kind": "exact", "path": "tests/unit/services/b1-run-execution-service.test.ts" },
        { "kind": "exact", "path": "tests/unit/services/f1-checkpoint-boundary-service.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/evidence.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/module-map.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/mutation-declaration.test.ts" }
      ]
    }
  }
}
```
