## Context

参见 `proposal.md` 与 approved `explore.md`。当前 B1 将 Policy-selected preparation 与 pending continuation 放在 `prepareActionExecution({ entry: "next" })` 中；caller timeout 后重新调用该入口可能在旧 Run 晚完成后分配下一 Action Run。与此同时 Apply 的 entry identity 缺少可执行的 mutation boundary，而 verification selection 尚无 production-owned module/capability authority。C1 adapter 在一次 operation 内重复启动 OpenSpec version/status/instructions，Windows runner 又无法仅凭 launcher kill 证明整个 process tree 已停止。

当前 E1 由 `owner:52c2f519e846da1aab0ba16b4f2e2355ae362d0fb846f2a21302a2b5bdf17b6d` 扩展授权。E1 实现 retry/projection/cancellation/verification-selection primitives；G1 保留 Change CLI、full Change E2E、checkout/resume recovery validation 与 observations。

## Goals / Non-Goals

**Goals:**

- 固定 entry-time、post-action 与 caller transport 三个不可混用的时间域。
- 提供 exact target Run resume 与 terminal replay，不允许 retry 隐式推进 Policy。
- 显式迁移 context v2/v3/v4 → v5 与 ActionPackage v1 → v2。
- 从 approved Design 派生 closed mutation declaration，并由 Core 观察 actualChangeSet。
- 以 deterministic module/capability authority 生成 immutable verification selection。
- 降低重复 OpenSpec process startup，并正确处理 Windows process-tree timeout。

**Non-Goals:**

- 不增加 E1-specific/Run-id-specific bypass、generic cancellation、generation manager 或新 Standard Action。
- 不重写 historical context/result，不把 E1 v4 Run 声称为 v5 dogfood。
- 不把 heuristic rename 作为 authoritative primitive，不用 hash 证明写入来源。
- 不实现 G1 的 Change CLI、full E2E、checkout/resume validation 或 observation reports。

## flowkitMutationScope

```json
{
  "schemaVersion": 1,
  "actions": {
    "apply": {
      "selectors": [
        { "kind": "exact", "path": "02-change-execution-loop-delivery-implementation-reference-v3.md" },
        { "kind": "exact", "path": "docs/flowkit-self-hosting-bootstrap-and-migration.md" },
        { "kind": "exact", "path": "openspec/changes/change-verification-selection-and-change-set/tasks.md" },
        { "kind": "exact", "path": "package.json" },
        { "kind": "exact", "path": "scripts/affected-scopes.ts" },
        { "kind": "exact", "path": "src/domain/types.ts" },
        { "kind": "exact", "path": "src/facts/formal-fact-reader.ts" },
        { "kind": "exact", "path": "src/integrations/openspec/openspec-cli-adapter.ts" },
        { "kind": "exact", "path": "src/integrations/openspec/openspec-types.ts" },
        { "kind": "exact", "path": "src/persistence/legacy-recognizer.ts" },
        { "kind": "exact", "path": "src/persistence/run-persistence.ts" },
        { "kind": "exact", "path": "src/persistence/serialization.ts" },
        { "kind": "exact", "path": "src/policy/next.ts" },
        { "kind": "exact", "path": "src/services/b1-run-execution-service.ts" },
        { "kind": "exact", "path": "src/shared/external-command.ts" },
        { "kind": "prefix", "path": "src/verification/change-selection" },
        { "kind": "prefix", "path": "tests/fixtures/e1-change-verification-selection" },
        { "kind": "exact", "path": "tests/integration/e1-change-verification-selection.test.ts" },
        { "kind": "exact", "path": "tests/integration/openspec-1-7-real-cli.test.ts" },
        { "kind": "exact", "path": "tests/integration/verification-commands.test.ts" },
        { "kind": "exact", "path": "tests/unit/external-command.test.ts" },
        { "kind": "exact", "path": "tests/unit/facts/formal-fact-reader-e1-verification.test.ts" },
        { "kind": "exact", "path": "tests/unit/facts/formal-fact-reader-ra007-admission.test.ts" },
        { "kind": "exact", "path": "tests/unit/facts/formal-fact-reader.test.ts" },
        { "kind": "exact", "path": "tests/unit/integrations/openspec-cli-adapter.test.ts" },
        { "kind": "exact", "path": "tests/unit/persistence/legacy-recognizer.test.ts" },
        { "kind": "exact", "path": "tests/unit/persistence/run-persistence.test.ts" },
        { "kind": "exact", "path": "tests/unit/persistence/serialization.test.ts" },
        { "kind": "exact", "path": "tests/unit/policy/next.test.ts" },
        { "kind": "exact", "path": "tests/unit/services/b1-openspec-action-context.test.ts" },
        { "kind": "exact", "path": "tests/unit/services/b1-run-execution-service.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/affected-scopes.test.ts" },
        { "kind": "prefix", "path": "tests/unit/verification/change-selection" },
        { "kind": "exact", "path": "tests/unit/verification/package-scripts.test.ts" }
      ]
    },
    "revise-apply": {
      "selectors": [
        { "kind": "exact", "path": "02-change-execution-loop-delivery-implementation-reference-v3.md" },
        { "kind": "exact", "path": "docs/flowkit-self-hosting-bootstrap-and-migration.md" },
        { "kind": "exact", "path": "openspec/changes/change-verification-selection-and-change-set/tasks.md" },
        { "kind": "exact", "path": "package.json" },
        { "kind": "exact", "path": "scripts/affected-scopes.ts" },
        { "kind": "exact", "path": "src/domain/types.ts" },
        { "kind": "exact", "path": "src/facts/formal-fact-reader.ts" },
        { "kind": "exact", "path": "src/integrations/openspec/openspec-cli-adapter.ts" },
        { "kind": "exact", "path": "src/integrations/openspec/openspec-types.ts" },
        { "kind": "exact", "path": "src/persistence/legacy-recognizer.ts" },
        { "kind": "exact", "path": "src/persistence/run-persistence.ts" },
        { "kind": "exact", "path": "src/persistence/serialization.ts" },
        { "kind": "exact", "path": "src/policy/next.ts" },
        { "kind": "exact", "path": "src/services/b1-run-execution-service.ts" },
        { "kind": "exact", "path": "src/shared/external-command.ts" },
        { "kind": "prefix", "path": "src/verification/change-selection" },
        { "kind": "prefix", "path": "tests/fixtures/e1-change-verification-selection" },
        { "kind": "exact", "path": "tests/integration/e1-change-verification-selection.test.ts" },
        { "kind": "exact", "path": "tests/integration/openspec-1-7-real-cli.test.ts" },
        { "kind": "exact", "path": "tests/integration/verification-commands.test.ts" },
        { "kind": "exact", "path": "tests/unit/external-command.test.ts" },
        { "kind": "exact", "path": "tests/unit/facts/formal-fact-reader-e1-verification.test.ts" },
        { "kind": "exact", "path": "tests/unit/facts/formal-fact-reader-ra007-admission.test.ts" },
        { "kind": "exact", "path": "tests/unit/facts/formal-fact-reader.test.ts" },
        { "kind": "exact", "path": "tests/unit/integrations/openspec-cli-adapter.test.ts" },
        { "kind": "exact", "path": "tests/unit/persistence/legacy-recognizer.test.ts" },
        { "kind": "exact", "path": "tests/unit/persistence/run-persistence.test.ts" },
        { "kind": "exact", "path": "tests/unit/persistence/serialization.test.ts" },
        { "kind": "exact", "path": "tests/unit/policy/next.test.ts" },
        { "kind": "exact", "path": "tests/unit/services/b1-openspec-action-context.test.ts" },
        { "kind": "exact", "path": "tests/unit/services/b1-run-execution-service.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/affected-scopes.test.ts" },
        { "kind": "prefix", "path": "tests/unit/verification/change-selection" },
        { "kind": "exact", "path": "tests/unit/verification/package-scripts.test.ts" }
      ]
    }
  }
}
```

## Decisions

### 1. Design-owned closed `flowkitMutationScope`

approved Design MUST 包含恰好一个 `## flowkitMutationScope` section，section 内恰好一个 `json` fenced block，schemaVersion 固定为 `1`，并分别提供非空 `apply` 与 `revise-apply` selectors。

`path` 使用 normalized repository-relative POSIX identity。`exact` 只匹配该 path；`prefix` 按完整 path segment 匹配 descendants。空值、`.`、repository root、`.flowkit/`、glob、重复、重叠、symlink escape 或无法唯一归属的 selector 均 invalid。两个 Action entry 必须非空；Design source path 与 `flowkitMutationScope` source 不得被 selector 覆盖。

Policy 先选 Action；Core 再读取 matching approved `review-propose` producer ResultRefs，定位 Design、验证唯一 block、选择同名 entry，并将 source ref/fingerprint 与 canonical sorted selectors 写入 context v5/ActionPackage v2。选择不接受 caller fallback。

### 2. context v5 与 ActionPackage v2

迁移使用 closed version matrix，不以 optional fields 静默改变历史 schema：

| context version | writer / reader contract | Owner / action-specific fields | ActionPackage boundary |
|---|---|---|---|
| v2 | historical read-only；保留 strict C1 physical validation，以及仅对 fingerprint-bound pre-Q1 revision corpus 生效的 exact compatibility；bytes 不变 | provisional `ownerFactRefs` 只校验 shape 后忽略，不产生 Owner authority | 只能按 v1 historical semantics bounded reconstruction；不得合成 ActionPackage v2 declaration |
| v3 | historical read-only；保留 D1 discriminator 与 identity validation；bytes 不变 | bounded `ownerFactRefs` 按 v3 contract 投影 | 只能按 v1 historical semantics bounded reconstruction |
| v4 | historical read-only；保留 D2 discriminator、archive-only `archiveEntryOpenSpecProjection` 与 identity validation；bytes 不变 | v3 Owner facts + v4 archive projection | 只能按 v1 historical semantics bounded reconstruction；当前 105–116 Runs 仍是 v4 bootstrap evidence |
| v5 | migration 后唯一 new Standard Run writer；closed Action-discriminated schema | common variant 保存 `canonicalBase`、applicable facts 与 semantic descriptor；`apply` / `revise-apply` 另外保存 `entryWorkspaceIdentity` 与 `mutationDeclaration` | 必须与 ActionPackage v2 配对 |

unknown version、version/field combination mismatch 或 malformed historical bytes 一律 fail closed，不得降级到相邻版本。v2 exact compatibility allowlist 继续绑定既有 immutable context fingerprint，不扩展为通用 legacy parser。

v5 `create → persist → read → formal consume` 必改链固定为：

| boundary | production path | focused test path |
|---|---|---|
| Policy-selected semantic preparation / exact resume | `src/services/b1-run-execution-service.ts` | `tests/unit/services/b1-run-execution-service.test.ts`、`tests/unit/services/b1-openspec-action-context.test.ts` |
| ContextFile type、closed validator 与 version/field combinations | `src/persistence/serialization.ts`、`src/domain/types.ts` | `tests/unit/persistence/serialization.test.ts` |
| build、staging、atomic persist、terminal binding | `src/persistence/run-persistence.ts` | `tests/unit/persistence/run-persistence.test.ts` |
| version-first discriminate、v2 exact seam、v3/v4/v5/unknown routing | `src/persistence/legacy-recognizer.ts` | `tests/unit/persistence/legacy-recognizer.test.ts` |
| active Change Run read、current selection lineage 与 FormalFactSnapshot consume | `src/facts/formal-fact-reader.ts` | `tests/unit/facts/formal-fact-reader.test.ts`、`tests/unit/facts/formal-fact-reader-ra007-admission.test.ts`、`tests/unit/facts/formal-fact-reader-e1-verification.test.ts` |
| end-to-end bootstrap migration | 上述 production paths + `src/verification/change-selection/**` | `tests/integration/e1-change-verification-selection.test.ts`、`tests/fixtures/e1-change-verification-selection/**` |

这些 production/test paths 全部出现在 `flowkitMutationScope` 的 `apply` 与 `revise-apply` selectors 中。既有 source 文件以 `exact` selector 表达；只为 E1 新建的 selection module/fixtures 使用 bounded `prefix`。Apply 不得运行时扩大 declaration。

ActionPackage v2 是 Action-discriminated closed union：`apply` / `revise-apply` variant 携带 selected Action、Design source ResultRef/fingerprint 与 canonical selectors；其他 Action variant 不伪造 declaration。context v2/v3/v4 pending continuation 只有在其 historical semantic identity 与完整 ActionPackage v1 view 可被 exact 重建时才可 bounded resume；不得 upgrade 为 v5/v2。需要 v5 entry identity 的 legacy pending Apply/revise-apply 必须 fail closed，或仅在既有 narrow Contract Reset recovery admission 满足时取消，不能补写 context。

### 3. new preparation、exact resume 与 terminal admission

service boundary 拆分为：

```text
prepareNewExecution(deliveryId, intent: next | review)
  fresh snapshot
  → intent=next: shared next(snapshot)
  → intent=review: shared resolveReview(snapshot) / canRun(review-S)
  → one Policy-resolved Action
  → no-pending assertion
  → semantic entry
  → Core-only allocate/create

resumeRun(deliveryId, expectedRunId)
  direct context/result lookup
  → exact persisted identity validation
  → same-version package reconstruction
  → no Policy selection and no allocator

admitRunResult(expectedRunId, package, logicalDescriptor)
  exact context/package/logical descriptor validation
  → action-specific Core preflight and Core-derived refs
  → for Apply/revise-apply: fresh post-action observation and selection
  → deterministic verification.md staging/publication
  → immutable verification-selection record atomic create commit marker
  → terminal result CAS-last
```

`next` 与 explicit unified `review` 是仅有的 new execution intents。`review` 必须继续通过 shared `resolveReview/canRun` 解析 same-stage `review-S`，因此 non-author blocker 到位后的 direct re-review 不要求 Author revision，也不调用 `next` 猜测。两个 new preparation intents 遇到任何 pending Run 均返回 `exact-resume-required` 和 persisted target identity，不能隐式 resume、改选或分配另一个 NNN；pending continuation 只进入 `resumeRun(expectedRunId)`。

`resumeRun` 若 target terminal，读取 canonical result：canonical logical descriptor digest 相同则返回 `already-terminal-same-result`；不同则返回 deterministic conflict。Run id 与 Delivery-wide NNN 只由 Core allocator 分配，caller 不得传入、预测或递增编号。并发 new preparation 在同一 legal boundary 至多发布一个 pending Run，其余请求返回该 persisted identity 或 deterministic conflict。

timeout 发生在 caller/transport domain，状态是 `outcome-unknown`。恢复者必须持有或从 persisted preparation state 获取 `expectedRunId`；没有 exact id 时停止并检查 authoritative state，不能调用任一 new preparation intent 猜测。

Apply/revise-apply admission 的 visible states 与唯一 recovery 如下：

| persisted state | exact recovery / replay |
|---|---|
| record absent、`verification.md` absent、Run pending | 从 persisted entry identity 重新执行 fresh post-action observation/selection |
| record absent、`verification.md` present、Run pending | 重算 deterministic bytes；完全一致才创建 immutable record，否则 fail closed |
| record present、Run pending | exact 校验 record、Markdown、package 与 logical descriptor；一致才执行 terminal CAS，不重复 post-action publication |
| terminal result present | result 必须 exact-bind producing Run 的 immutable record point-in-time identity；equivalent replay 直接返回既有 terminal，不读取未来 canonical `verification.md`；不同 descriptor 或 immutable binding mismatch fail closed |

任何可见 completed terminal 都必须已经绑定完整 post-action commit marker。terminal result 存在但 per-Run immutable record 缺失或不匹配时只产生 conflict，不得 terminal-time 补写 authority。canonical `verification.md` 的 future bytes 不参与 historical terminal replay。

### 4. operation-scoped OpenSpec projection

每次 formal operation 构建一个 `OpenSpecOperationProjection`：

- cached supported version；
- requested Change structured status；
- 按需一次性读取的 artifact/apply instructions 或 validation；
- invocation diagnostics。

formal snapshot、contract refs、tasks、verification 与 prepared action context 通过参数共享同一 projection。`getArtifactInstructions` 接受已验证 status，而不是内部再次读取。operation 结束即释放 projection；terminal admission 新建 post-action projection，避免跨 mutation cache。

测试以 invocation counts 和 exact requested identities 为主，不以跨机器毫秒阈值定义 correctness。

### 5. Windows process-tree cancellation

runner 为 owned command 建立 platform-specific cancellation authority。Windows 实现优先使用可确认 descendants 归属与终止的 Job Object/helper boundary；若当前 runtime 无法建立该 authority，则 timeout handler 记录 launcher/descendant diagnostics 并返回 `outcome-unknown`，不得把 `child.kill('SIGKILL')` 的 boolean 当作 complete termination。

transport result closed union：

```text
spawn-failed
exited
timed-out-cancelled
outcome-unknown
```

OpenSpec adapter 将前三者按现有 domain contract 解释；`outcome-unknown` 始终向上 fail closed，write-side caller 先检查 persisted/external authoritative state。

### 6. entry snapshot 与 actualChangeSet

在创建 Apply/revise-apply Run 前，Core 以 canonical base 和 working tree 建立 immutable entry snapshot record。Run infrastructure、entry record、post-action Core record 与 canonical `verification.md` publication 使用 reserved Core-owned paths，不属于 Author candidate selector。

Core 在 Author Action 返回后、Core post-action publication 之前计算两个不同集合：

- `observedActionMutations = entry → post-action`，用于检查本次 observed writes 全部被 persisted declaration 覆盖；
- `actualChangeSet = canonical base → post-action`，用于描述最终 candidate，因此包含 entry 时已经存在且在 Action 中未变化的合法 Change bytes。

没有 exclusive worktree / lease 时，`observedActionMutations` 仍只证明时间窗口内的 bytes 变化，不证明 actor 来源。reserved Core-owned paths 不进入上述两个 candidate 集合。

post-action writer 对 `actualChangeSet` 中每个 path 发布：

```text
path
kind: create | modify | delete
pathKindBefore
pathKindAfter
contentFingerprintAfter (when present file)
```

ordering 使用 normalized path lexical order。directory identity 从 leaf changes 派生，不把目录 mtime 当作 mutation。rename-like 状态保留 create/delete。

### 7. closed module map 与 selection algorithm

`src/verification/change-selection/module-map.ts` 导出编译期 closed data：

```text
moduleId
ownershipSelectors
dependsOn
verificationScopes
capabilityIds
optional noApplicablePredicateId
```

validator 拒绝空/重复/重叠 ownership、unknown dependency、cycle、unknown scope/capability 和 nondeterministic ordering。每条 actual path 必须唯一匹配 seed module；然后构建 reverse edges，递归加入所有 consumer modules。modules、capabilities 与 scopes 均按 stable ids lexical sort/dedupe。

当前 Change capability ids/refs 只从 operation-scoped OpenSpec status 的 `artifactPaths.specs` concrete delta files 解析。每个 delta capability 必须关联 relevant module，每个 seed module 必须关联当前 delta capability。`noApplicable` 仅允许由 closed predicate 显式证明，不用于吞掉缺失 mapping。

### 8. immutable verification-selection record

record schema v1 保存：

- producing Run/context/package ids 与 fingerprints；
- canonical base、entry snapshot 与 post-action snapshot identity；
- actualChangeSet；
- module-map ref/fingerprint；
- seed modules、reverse consumer closure；
- delta capability refs/ids 与 relation result；
- ordered scopes 或 explicit `not-applicable` proof；
- deterministic renderer contract version；
- generated `verification.md` logical ref 与 point-in-time content fingerprint。

record 使用 producing Run 下 Core-owned deterministic logical path `verification-selection.json`；terminal completion preflight 从 exact Run identity 派生并校验该 path，不接受 caller-built record ref。record 中的完整 stable selection payload + renderer version 是 immutable per-Run content authority，可重新渲染并验证当时 Markdown fingerprint；历史校验不得重读未来 mutable canonical path。

同一 Core writer 先在 memory 中形成 selection payload 与 stable digest，再 deterministic render `verification.md`；完整 record 保存该 digest、verification path 与 content fingerprint。writer 将两份 bytes 写入 staging，先以 atomic rename 发布 `verification.md`，再以 immutable record 的 atomic create 作为 post-action commit marker，绝不回写 record，最后才以 terminal result CAS 收口 Run。Decision 3 的 state table 是 crash/replay 的唯一 authority；禁止 Author result 提交这些字段。

Formal Reader 使用唯一 current-lineage selection：

1. 先按现有 Policy/Review producer lineage 确定 current artifact producer：初次 Apply 使用 current completed `apply`；`review-apply changes-requested` 后仍指向被审查 producer；完成 `revise-apply` 后切换到该 revision producer。
2. 只从该 current producer Run 派生唯一 `verification-selection.json` path，并以 record 中的 point-in-time fingerprint exact-check current canonical `verification.md`。record 缺失、多个 current candidates、producer/result/record identity mismatch 或 current bytes mismatch 均 fail closed。
3. 若 current pending Apply/revise-apply 已进入 post-action publication，Reader 将 verification projection 标记为 unavailable/in-flight；可为 exact recovery 校验该 pending Run 的 Markdown/record，但不得将前一 terminal record 对照新 bytes，也不得把 pending record 提升为 satisfied current authority。
4. 非 current producer 的 completed records/results 是 immutable historical point-in-time facts。后续合法 revise-apply 更新同一 canonical path 时，不重新对照历史 fingerprint，不产生 historical FactConflict。
5. 对旧 terminal `expectedRunId` 的 equivalent exact replay 直接返回 persisted terminal；只校验其 persisted result ↔ per-Run record identity，不读取 current lineage 或 canonical Markdown future bytes。

### 9. E1/G1 ownership

E1 交付 service/persistence/adapter/runner/selection primitives 与 focused integration fixtures。G1 后续只增加 Change CLI surface、full Change E2E、checkout/resume recovery validation、ActionPackage/Run size、focused/affected timing 和 review convergence observations。G1 不重做 E1 algorithms；E1 不提前实现 G1 CLI/reporting。

### 10. Bootstrap verification

E1 使用 isolated context v5 / ActionPackage v2 fixtures、fake/real OpenSpec invocation-count harness、Windows cancellation seam 与 integration Run 验证新模型。E1 canonical `verification.md` 标记 bootstrap verification，并明确当前 105–116 context v4 不是 v5 dogfood。后续 Change 才通过正常 canonical Apply 入口产生第一份 dogfood v5 evidence。

## Risks / Trade-offs

- [E1 scope 较大，涉及 persistence、policy、adapter、runner 与 verification] → 按 schema/retry、projection/cancellation、selection/writer 三个可独立验证的增量实现，并在每步运行 focused tests。
- [terminal replay 与跨路径 post-action publication 可能出现 partial state] → 使用 deterministic staging、immutable record commit marker、terminal CAS-last 与 exact recovery，并为 crash-between-steps 增加 tests。
- [module map 维护成本与 capability drift] → closed compile-time validator、structured delta ids 与 fail-closed mismatch，禁止 silent fallback。
- [Windows Job Object/helper 可移植性] → platform seam；无法确认 termination 时维持 `outcome-unknown`，correctness 不依赖 helper 成功。
- [operation projection cache 读取过期 authority] → 严格限制为一次 operation，并在 terminal/post-action boundary 强制新 projection。
- [没有 exclusive worktree 时无法证明 actor] → 明确 observation-only capability，并保持 canonical bootstrap single-writer operating rule。

## Migration Plan

1. 增加 context v2/v3/v4/v5 与 ActionPackage v1/v2 closed readers/writers，用每个 historical discriminator/fixture 证明 bytes 与既有 authority semantics 不变。
2. 将现有 bounded dual-entry preparation 改为 `prepareNewExecution(intent: next | review)`，把全部 pending continuation 移入 `resumeRun(expectedRunId)`，再实现 commit-marker-first / terminal CAS-last replay。
3. 引入 operation-scoped OpenSpec projection 和 invocation-count tests，再接入 Windows process-tree cancellation/outcome union。
4. 增加 entry snapshot、actualChangeSet、module map、selection record 与 canonical Markdown writer。
5. 运行 bootstrap integration，生成标记为 bootstrap 的 E1 `verification.md`；不回写历史 Run。
6. 若迁移失败，停止 new v5/v2 writer 并回滚未 checkpoint implementation bytes；historical v2/v3/v4 + ActionPackage v1 evidence 仍按各自 reader contract 可读，不需要 data rollback。
