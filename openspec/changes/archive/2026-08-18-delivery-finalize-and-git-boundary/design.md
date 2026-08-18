## Context

F1 在 E1 checkpoint 后激活。A1/B1/E1 已分别提供 Delivery Full Test、failed corrective Change、Actual/Compare/Owner architecture acceptance；当前 Policy在 accepted architecture后能够请求 `authorize-delivery-finalize`，但授权只按 `decision + deliveryId`匹配，随后只能返回 `delivery-behavior-not-implemented:delivery-finalize`。Git reader同时仍以 subject contains识别 Delivery Final。

074/076 Explore通过 production counterexample与 disposable Git/Manifest proof确认：

1. fresh Full Test/fresh architecture qualification不能复用旧 Finalize authorization；
2. post-pass新增 required Change必须主动失效旧 qualification，而不是只把旧 Finalize record视为 stale；
3. unrelated Git/index/worktree drift必须在 `active→completed` 之前 fail closed；
4. Finalize publication之后允许 process crash，Git handoff必须能从 durable completed facts恢复；
5. current loose Delivery Final subject recognition会产生 false positive；
6. historical finals形态不同，strict规则必须有 bounded cutover且不能重写Git历史。

## Goals / Non-Goals

### Goals

- exact、freshness-safe Finalize qualification与Owner authorization applicability。
- post-pass required Change atomic invalidation，强制 fresh Full Test / fresh Architecture qualification。
- no-Run Delivery Finalize behavior与minimal completed publication。
- Finalize publication前 read-only exact candidate preflight。
- completed publication后 crash-safe、deterministic Delivery Final Git handoff。
- strict current/future Delivery Final candidate/admission + bounded historical compatibility。
- Merge Commit topology expectation与F1 physical Verification closure。

### Non-Goals

- F1 Apply直接finalize当前03。
- Finalize Standard Action/Run/NNN/Action Package。
- auto commit/push/PR/merge或Git hosting provider integration。
- rollback engine、generic transaction/evidence/receipt platform。
-复制 Full Test logs、Architecture bytes、Git history到finalization projection。
- G1 resume/Agent Adapter、H1 stable Runner/self-hosting实现。

## Decisions

### 1. F1 capability completion 与 03 Finalize instantiation 分离

F1 Apply只实现 reusable capability。03真正 Finalize 必须等 G1/H1 completed+checkpointed、fresh Delivery Full Test passed、E1 Actual/Compare/Owner architecture acceptance完成后 dogfood。F1 Apply期间 `delivery.state` MUST remain active且不得创建 Delivery Final commit。

### 2. Finalize qualification 使用 existing formal refs，不复制 authority

新增 `src/domain/delivery-finalization.ts`，定义 closed deterministic refs：

```text
delivery-finalization-qualification:<sha256>
delivery-final-candidate:<sha256>
```

qualification canonical payload：

```text
schemaVersion: 1
deliveryId
fullTestAuthorizationRef
fullTestResultRef
qualifiedBaseRevision
architecture:
  accepted:
    cycleRef
    ownerAcceptanceRef
  | not-applicable
```

`qualifiedBaseRevision` 不是 caller/session 输入。FormalFactReader/Git authority 必须从当前 Delivery **已正式 admitted** 的 pre-final Git boundaries 中解析唯一 latest boundary revision：通常为 latest admitted Change Checkpoint；若 Delivery 合法地不存在 Change Checkpoint，则可回退其 admitted Delivery Start。若不存在、存在多个不可判定的 maximal boundary、或 topology 不一致，则 qualification 不可形成。`architecture.impact=true` 时 current cycle必须 accepted、`acceptedSystemSource` exact-match，且 `actualArchitectureRef.repositoryRevision === qualifiedBaseRevision`；false时使用 literal `not-applicable`。fresh Full Test authorization/result、fresh accepted cycle、qualified Git revision或different Delivery任一变化都改变 qualificationRef。caller不能提供或覆盖这些字段。

### 3. `authorize-delivery-finalize` 精确绑定 current qualification

不增加新的 Owner decision。`OwnerDecisionRecord` / `OwnerDecisionFact`增加 optional `finalizationQualificationRef`；仅 fresh F1+ `authorize-delivery-finalize` 使用。`ownerDecisionRefFor()` canonical tuple只在字段存在时纳入该字段，所以 historical/non-F1 records的ref保持byte-compatible。

`recordOwnerDecision(authorize-delivery-finalize)` 必须：

1. fresh read current snapshot并assert conflict-free；
2. current Policy必须正在请求 finalize authorization；
3. write-side从snapshot派生 exact qualificationRef；
4.构造带该ref的Owner record并原子追加；
5.不执行 Finalize。

Policy只有 matching exact qualification record才认为授权成立。legacy field-absent record只用于 historical readability，不能关闭 current/future fresh gate。

### 4. 所有 post-pass required Change 都失效 current finalization qualification

现有 B1 failed corrective与E1 awaiting-architecture remediation保持其 exact binding。除此之外，当 raw `fullTestStatus=passed` 且Owner新增 `required=true` Change时，write-side必须把“新的required work”与qualification invalidation放在同一次Manifest publication：

```text
append planned Change + create-change Owner record
remove current Full Test result
passed -> not-ready
if architecture applicable/current cycle exists:
  remove architecture.currentCycle
  remove architecture.acceptedSystemSource
```

E1 `architectureRemediation`边界仍要求exact cycleRef；accepted architecture后的普通required Change不需要伪造成 Full-Test-failed corrective，但其 create-change provenance可绑定current `architectureCycleRef` when present。non-required Change不取得该reset语义，也不能让未执行optional work阻塞Delivery completion。

### 5. Finalize preflight先计算 **pre-publication candidateRef**，再写 completed

新增 `src/services/delivery-finalize-service.ts`。CLI采用：

```text
flowkit delivery finalize --delivery <delivery-id>
```

explicit deliveryId使行为在后续bootstrap/dogfood中不依赖“猜当前”。服务重新读取 formal facts并要求：

```text
delivery active
no active Change
all required Changes completed + checkpointed
Full Test passed
architecture accepted | not-applicable
current Policy = delivery-behavior: delivery-finalize
matching exact qualification-bound Owner authorization
```

随后只读 Git preflight：

```text
index empty
HEAD exact-equals current qualification `qualifiedBaseRevision` and remains stable
worktree/untracked set exactly/subset of bounded allowed paths
allowed paths:
  openspec/delivery-groups/<delivery-id>.yaml
  + architecture/<delivery-id>/json/actual.architecture.json when impact=true
no unrelated path
```

`candidateRef` canonical payload绑定 `deliveryId + qualifiedBaseRevision + sorted allowed current file paths + exact SHA256 bytes`，其中 Manifest是 **Finalize publication前 active bytes**。Finalize service MUST NOT把任意 current HEAD 重新定锚为 candidate base；若 clean ordinary commit 使 `HEAD != qualifiedBaseRevision`，即使 index/worktree完全clean也必须在 Manifest mutation 前失败。unrelated drift同样在这里失败且Manifest保持active/byte-identical。

### 6. Finalize publication只改变 state + compact finalization block

preflight成功后，基于同一 active Manifest bytes构造唯一 expected bytes：

```yaml
delivery:
  state: completed
  fullTestStatus: passed
  finalization:
    schemaVersion: 1
    qualificationRef: <delivery-finalization-qualification:...>
    ownerAuthorizationRef: <owner:...>
    candidateRef: <delivery-final-candidate:...>
```

然后一次 atomic write。Finalize不改Full Test/Architecture evidence、不写commit SHA、不stage/commit。exact same completed projection MAY idempotent return；mismatch/stale qualification/candidate MUST fail closed。

### 7. candidateRef 可在 completed/commit 状态确定性重建，避免 circular hash

`candidateRef`绑定的是 **pre-publication active Manifest bytes**，因此不包含自身。为了让 completed handoff/Git admission重新验证它，`DeliveryManifestDocument`提供严格 inverse projection：仅允许对合法F1 finalization形状执行：

```text
remove delivery.finalization
state completed -> active
其他 bytes保持exact
```

重建的active Manifest bytes + current/commit Actual bytes + **re-derived qualification `qualifiedBaseRevision`** 必须产生stored candidateRef。若inverse projection无法唯一完成、Git qualified revision 无法重新派生、或 current/commit parent 与该 revision 不一致则fail closed。

### 8. completed → Delivery Final handoff 是独立 read-only Executor boundary

新增 `src/services/delivery-final-boundary-service.ts` 与 CLI：

```text
flowkit delivery final-handoff --delivery <delivery-id>
```

服务不依赖active Delivery discovery；completed后可fresh process显式读取。它要求：

- completed finalization projection合法；
- current HEAD仍 exact-equal qualification `qualifiedBaseRevision`；
- index empty；
- dirty set只含bounded final paths；
- inverse-reconstructed candidateRef exact-match；
- current Owner record/qualification still exact。

成功返回：

```text
subject = chore(flowkit): finalize <delivery-id>
trailers =
  Flowkit-Delivery: <delivery-id>
  Flowkit-Boundary: delivery-final
  Owner-Authorization: <exact owner ref>
paths = bounded final paths
preflight = git diff --check + git diff --cached --check after Executor staging
```

post-publication unrelated drift只使handoff fail closed；删除drift后同一 durable facts可恢复同一handoff，不需要reopen/rollback completed Delivery。

### 9. Delivery Final Git admission 采用 candidate + strict point-in-time validation

`git-boundary-reader.ts`新增 Delivery Final candidate，不再对fresh finals直接因subject contains而授予boundary。current/future strict candidate必须：

```text
single parent
subject exactly chore(flowkit): finalize <delivery-id>
exactly one Flowkit-Delivery == deliveryId
exactly one Flowkit-Boundary == delivery-final
exactly one Owner-Authorization == owner:<sha256>
```

FormalFactReader对candidate commit执行point-in-time `git show`/blob读取：Manifest必须 `state=completed`、Full Test passed、finalization closed shape、Owner trailer=projection owner ref、matching `authorize-delivery-finalize` record绑定同一qualification；必须从 point-in-time admitted pre-final Git boundaries 重新派生该 qualification 的 `qualifiedBaseRevision`，并要求 candidate first parent exact-equal该 revision；随后从该 parent + inverse active Manifest + exact Actual blob重算candidateRef，且commit changed paths必须exact bounded final path set。Architecture applicable时 point-in-time accepted Actual 的 `repositoryRevision` 也必须等于同一 revision。

### 10. strict cutover 绑定 recognized F1 Change Checkpoint，不建立版本Registry

历史仓库已有多种Delivery Final格式。F1不重写它们。strict semantics以Git中被正式admit的：

```text
chore(flowkit): checkpoint delivery-finalize-and-git-boundary
Flowkit-Boundary: change-checkpoint
```

作为activation/cutover boundary：

- candidate为该F1 checkpoint的ancestor → bounded legacy Delivery Final read compatibility；
- candidate为F1 checkpoint之后的current/future history → MUST strict admission；
- F1 Apply detached、尚未形成canonical checkpoint时，代码存在但strict product activation尚未发生；Proposal/Apply用synthetic recognized F1 checkpoint fixture证明first next-consumer与future Delivery。

这样不需要hardcode当前Base SHA、Delivery id或global schema registry，并满足“新 implementation从正式checkpoint生效”。

### 11. Merge Commit只冻结 topology expectation

F1不调用GitHub。正式Delivery PR应使用Merge Commit。H1/disposable Git regression验证：Delivery Final commit是merge commit祖先；删除delivery branch后final仍由main merge history可达。Squash/Rebase不能作为Flowkit推荐的Delivery closure方式。

### 12. Verification ownership必须包含新F1 integration physical target

新增：

```text
tests/integration/f1-delivery-finalize-and-git-boundary.test.ts
```

prospective source Catalog必须：

- `execution` module唯一ownership该path；
- `execution.capabilityIds`包含 `flowkit-delivery-finalize-and-git-boundary`；
- `cli-diagnostics.capabilityIds`包含该capability以解释 `src/cli/main.ts`；
- `CLOSED_CAPABILITY_IDS`包含新capability；
- `tests-execution` physical resolver显式执行旧F1 archive/checkpoint integration + 新F1 finalize integration + unit facts/policy/services；
- sentinel使新integration target失败时 `tests-execution`必须失败。

Expected F1 actualChangeSet至少覆盖 domain/CLI/facts/persistence/policy/services/verification + integration/unit tests；Proposal必须用production `buildVerificationSelection()`得到matched relation。

## Proposal Preflight Evidence

- `deriveMutationDeclaration(apply)`：production parser/validator PASS，26 selectors。
- `deriveMutationDeclaration(revise-apply)`：production parser/validator PASS，26 selectors。
- expected F1 actualChangeSet + F1 delta capability refs 经 production `buildVerificationSelection()`：`capabilityRelation=matched`；selected 11 checks：`openspec-current-change-archive-sync`、`openspec-current-change-strict`、`tests-architecture`、`tests-cli`、`tests-execution`、`tests-external-tools`、`tests-openspec-runtime`、`tests-persistence`、`tests-serialization`、`tests-verification`、`typecheck`。
- prospective `tests-execution` physical resolver 明确包含 `tests/integration/f1-delivery-finalize-and-git-boundary.test.ts`；对该 target 注入 failing sentinel 后 exact resolved Node test command 非零退出，证明逻辑 selection 能到达真实 F1 integration target。
- `F1-RP-001` disposable/prospective Git proof（architectureImpact=true/false 两支）：qualification 从 strict pre-final checkpoint `H1=a98b2c48b6737fab04ecadd7f89e3ea5f46eef46` 派生 `qualifiedBaseRevision`；在 H1 上保持 index empty 且只存在 bounded Delivery Manifest / applicable Actual dirty bytes时 preflight PASS。随后 architectureImpact=true 创建 ordinary clean `H2=1556e19c62ea2d1077506e25357d65ff83b2c85a`，architectureImpact=false 创建 ordinary clean `H2=f51d40060f4afbcd3992adecf6f09dd453168ebc`；两支此时 worktree/index完全clean，但均因 `HEAD != qualifiedBaseRevision` 在 Manifest mutation 前 fail closed，Manifest bytes保持unchanged。证明 clean post-qualification commit 不能被旧 Full Test/Architecture qualification吸收到新的candidateRef。
- disposable Git ancestry proof：legacy Delivery Final → recognized F1 checkpoint → future Delivery Final 的 ancestor 关系均成立，证明 checkpoint-based strict cutover 可跨 future history 持续，不依赖当前 Delivery id/Base SHA。
- exact managed OpenSpec 1.7.0：current strict PASS、`--all --strict` PASS；archive-sync disposable preflight PASS（added 19 / modified 2 / removed 0 / renamed 0）。
- Proposal preflight 不执行当前 03 Finalize，不产生 Delivery Final commit，不创建 Finalize Run。

## Risks / Trade-offs

- [qualification重复E1 cycle fields] → 只hash existing refs + formal `qualifiedBaseRevision`；不复制Actual/compare bytes，目的是Owner applicability identity。
- [candidateRef circular] → hash pre-publication active bytes + qualification-covered Git revision；completed/commit通过strict inverse projection + point-in-time formal-boundary re-derivation重建。
- [clean post-qualification commit被旧资格吸收] → qualification exact-bind admitted pre-final Git revision；Finalize/handoff/commit parent都必须等于该 revision，current HEAD不再可自行重新定锚。
- [completed后Git失败形成半关闭] → 所有可读drift检查前移；publication后只剩Executor机械边界，drift可移除并resume，不rollback。
- [legacy loose recognition污染future] → recognized F1 checkpoint ancestry cutover；future strict，historical read-only。
- [F1吞并Git平台] → 只生成handoff/本地Git admission，不自动commit/push/PR/merge。
- [post-pass required Change复用stale Full Test] → create-change publication原子reset Full Test/architecture current qualification。

## Migration Plan

1. 增加 finalization domain refs/projection与Owner optional qualification provenance，并把 `qualifiedBaseRevision` 纳入 qualification canonical identity。
2. 扩展Manifest reader/writer/inverse projection与FormalFactSnapshot/Git boundary projection，使 current qualification能从已 admitted pre-final boundary确定性派生 exact revision。
3.扩展post-pass create-change reset及authorize-finalize exact binding。
4.扩展Policy exact qualification gate + delivery-finalize behavior。
5.实现read-only preflight + atomic Finalize service；不finalize 03。
6.实现completed Delivery Final handoff与strict Git candidate/admission + F1 checkpoint cutover。
7.增加CLI thin routes、unit/integration与Verification ownership/physical resolver/sentinel。
8.运行formal Change Verification；F1 Archive/Checkpoint后由G1/H1继续，03最终dogfood后置。

## flowkitMutationScope

```json
{
  "schemaVersion": 1,
  "actions": {
    "apply": {
      "selectors": [
        { "kind": "exact", "path": "openspec/changes/delivery-finalize-and-git-boundary/tasks.md" },
        { "kind": "exact", "path": "openspec/changes/delivery-finalize-and-git-boundary/verification.md" },
        { "kind": "exact", "path": "src/cli/main.ts" },
        { "kind": "exact", "path": "src/domain/a1-types.ts" },
        { "kind": "exact", "path": "src/domain/delivery-finalization.ts" },
        { "kind": "exact", "path": "src/domain/owner-provenance.ts" },
        { "kind": "exact", "path": "src/facts/formal-fact-reader.ts" },
        { "kind": "exact", "path": "src/facts/formal-fact-snapshot.ts" },
        { "kind": "exact", "path": "src/facts/git-boundary-reader.ts" },
        { "kind": "exact", "path": "src/persistence/delivery-manifest-document.ts" },
        { "kind": "exact", "path": "src/policy/next.ts" },
        { "kind": "exact", "path": "src/policy/owner-decision.ts" },
        { "kind": "exact", "path": "src/policy/types.ts" },
        { "kind": "exact", "path": "src/services/a1-write-service.ts" },
        { "kind": "exact", "path": "src/services/delivery-final-boundary-service.ts" },
        { "kind": "exact", "path": "src/services/delivery-finalize-service.ts" },
        { "kind": "exact", "path": "src/verification/change-selection/evidence.ts" },
        { "kind": "exact", "path": "src/verification/change-selection/module-map.ts" },
        { "kind": "exact", "path": "tests/integration/f1-delivery-finalize-and-git-boundary.test.ts" },
        { "kind": "prefix", "path": "tests/unit/domain" },
        { "kind": "prefix", "path": "tests/unit/facts" },
        { "kind": "exact", "path": "tests/unit/persistence/delivery-manifest-document.test.ts" },
        { "kind": "prefix", "path": "tests/unit/policy" },
        { "kind": "prefix", "path": "tests/unit/services" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/evidence.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/module-map.test.ts" }
      ]
    },
    "revise-apply": {
      "selectors": [
        { "kind": "exact", "path": "openspec/changes/delivery-finalize-and-git-boundary/tasks.md" },
        { "kind": "exact", "path": "openspec/changes/delivery-finalize-and-git-boundary/verification.md" },
        { "kind": "exact", "path": "src/cli/main.ts" },
        { "kind": "exact", "path": "src/domain/a1-types.ts" },
        { "kind": "exact", "path": "src/domain/delivery-finalization.ts" },
        { "kind": "exact", "path": "src/domain/owner-provenance.ts" },
        { "kind": "exact", "path": "src/facts/formal-fact-reader.ts" },
        { "kind": "exact", "path": "src/facts/formal-fact-snapshot.ts" },
        { "kind": "exact", "path": "src/facts/git-boundary-reader.ts" },
        { "kind": "exact", "path": "src/persistence/delivery-manifest-document.ts" },
        { "kind": "exact", "path": "src/policy/next.ts" },
        { "kind": "exact", "path": "src/policy/owner-decision.ts" },
        { "kind": "exact", "path": "src/policy/types.ts" },
        { "kind": "exact", "path": "src/services/a1-write-service.ts" },
        { "kind": "exact", "path": "src/services/delivery-final-boundary-service.ts" },
        { "kind": "exact", "path": "src/services/delivery-finalize-service.ts" },
        { "kind": "exact", "path": "src/verification/change-selection/evidence.ts" },
        { "kind": "exact", "path": "src/verification/change-selection/module-map.ts" },
        { "kind": "exact", "path": "tests/integration/f1-delivery-finalize-and-git-boundary.test.ts" },
        { "kind": "prefix", "path": "tests/unit/domain" },
        { "kind": "prefix", "path": "tests/unit/facts" },
        { "kind": "exact", "path": "tests/unit/persistence/delivery-manifest-document.test.ts" },
        { "kind": "prefix", "path": "tests/unit/policy" },
        { "kind": "prefix", "path": "tests/unit/services" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/evidence.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/module-map.test.ts" }
      ]
    }
  }
}
```
