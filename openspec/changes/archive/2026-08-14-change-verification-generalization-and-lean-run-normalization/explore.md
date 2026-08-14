# E2 Explore — Generic Change Verification 与 Three-file Lean Run 可行性

## 1. Formal entry 与范围

- Delivery：`20260810-01-change-execution-loop`
- Change：`E2 change-verification-generalization-and-lean-run-normalization`
- Base checkpoint：`e15d0a3c5bf7b46d3a1134eb3a5e208f11f7e564`
- Create fact：`owner:09183b6976a7c38173cef7e2a74e8619cb3a4733a001c98fca744a181e1b9768`
- Activation fact：`owner:6fb9646669f1fd2a17a5d3f1824398bea59139cfee11d556025e45f2c0a0863b`
- Explore Run：`20260814-136-explore`

E1 已 completed + checkpointed。E2 不重新打开 E1 已收敛的 execution-time、exact-resume、Contract Reset 或 archive recovery 语义，只处理两类 E1 后确认的 Bootstrap 物理特化：

1. Change Verification writer/reader 仍绑定 E1 identity、E1 capability set 与 physical command；
2. v5 Apply 为 exact resume / verification publication 增加了 `entry-workspace.json`、`verification-selection.json`、`verification-evidence.json` sidecars，而长期 Run 目标仍是 `action.md` / `context.json` / `result.json` 三文件。

本 Explore 按当前实现参考在 Proposal 前完成 Proof A–E。Proof 允许证明原设想不可行；本次结果均给出可执行的可行替代边界，但不在 Explore 冻结最终 schema 名称或 class 拆分。

## 2. 当前实现的真实特化

### 2.1 Verification Catalog / executor 硬编码 E1

当前源码存在以下 literal / authority coupling：

- `src/verification/change-selection/module-map.ts`
  - closed scope 直接保存 `npx openspec validate change-verification-selection-and-change-set --strict`；
  - `change-contract` ownership 直接包含 `openspec/changes/change-verification-selection-and-change-set`；
  - capability closed set 只覆盖 E1 当时使用的 capability 子集。
- `src/verification/change-selection/evidence.ts`
  - 只有 scope 等于上述 E1 physical command 时，才走 `OpenSpecCliAdapter.validateChange(input.changeId, true)`。
- `src/verification/change-selection/publication.ts`
  - renderer v2 仍固定输出 `Bootstrap verification: this E1 publication...`。

直接用当前 selector 做 next-consumer probe 得到：

```text
G1-shaped path: src/cli/main.ts
→ VERIFICATION_MODULE_SELECTION_FAILED (zero-match)

F1-shaped path: src/integrations/openspec/openspec-archive-service.ts
+ capability flowkit-archive-and-checkpoint-boundary
→ VERIFICATION_CAPABILITY_SELECTION_FAILED
  seed openspec-runtime 只接受 E1-era capabilities

E2 current Change path:
openspec/changes/change-verification-generalization-and-lean-run-normalization/.openspec.yaml
→ VERIFICATION_MODULE_SELECTION_FAILED (zero-match)
```

因此“E1 能验证 E1”不能直接作为 F1/G1 的长期 Verification contract。

### 2.2 historical reader 依赖 future current Catalog

`validateVerificationSelection()` 当前要求：

```text
persisted moduleMapFingerprint
== fingerprint(current VERIFICATION_MODULE_MAP)
```

这对 current pending/new selection 是合理 currentness check，但对 terminal historical E1 selection 是错误 authority：E2 只要合法演进 current Catalog，历史 133 等 terminal replay 就会被 future/current map 反向判 stale。

历史 terminal reader 应只验证 persisted record 自身 schema、internal fingerprint、result binding、renderer/versioned evidence contract；不能要求它继续等于未来 current Catalog。

### 2.3 test isolation 已真实失效

E1 checkpoint 后直接执行：

```text
node --test --import tsx \
  tests/unit/verification/change-selection/mutation-declaration.test.ts \
  tests/unit/verification/change-selection/entry-snapshot.test.ts
```

结果：`3 passed / 1 failed`。失败测试把：

```text
change-verification-selection-and-change-set
process.cwd()
openspec/changes/<E1>/design.md
```

当作当前仓库状态，因此 E1 archive 后出现 `ENOENT`。这证明 E2 的 synthetic-change-a / synthetic-change-b / historical-e1 fixture 隔离是实际需求，不是清理偏好。

## 3. Proof A — Generic Verification

### 3.1 问题

需要证明 selection 的 lifecycle identity 可以从：

```text
actualChangeSet
→ source-controlled catalog
→ ownership / reverse consumer closure
→ current delta capability relation
→ logical check ids
```

得到，而不依赖 E1 Change literal 或 E1 physical command。

### 3.2 executable prototype

使用一个只含 source-controlled data 的 generic catalog prototype，physical command 不进入 selection identity；两个不同 synthetic input 得到：

```text
Synthetic Change A
path: src/services/b1-run-execution-service.ts
capability: flowkit-change-verification-generalization-and-lean-run-normalization
seed: execution
closure: cli-diagnostics, execution, openspec-runtime, verification
logical checks:
  openspec-current-change-strict
  tests-cli
  tests-execution
  tests-openspec-runtime
  tests-verification
  typecheck

Synthetic Change B
path: src/verification/change-selection/selection.ts
capability: flowkit-change-verification-generalization-and-lean-run-normalization
seed: verification
logical checks:
  openspec-current-change-strict
  tests-verification
  typecheck
```

两个 selection 的稳定 fingerprint 不同且 deterministic，输出中不存在 `change-verification-selection-and-change-set` literal。

### 3.3 结论

**PASS — Generic selection 可行。**

Proposal 可以冻结：

```text
Catalog
→ owns deterministic logical selection rules

Verification executor / OpenSpec adapter
→ owns logical check id → concrete command/method resolution
```

不得让 physical command 重新成为 lifecycle identity，也不得引入动态 Registry / mandatory CodeGraph。

## 4. Proof B — Three-file Run entry identity

### 4.1 当前成本

历史 `20260814-133-apply`：

```text
action.md                    575 B
context.json              23,840 B
entry-workspace.json      70,824 B  (374 files)
result.json                  752 B
verification-evidence.json 5,549 B
verification-selection.json 12,629 B
-----------------------------------
Run total                 114,169 B
```

当前 `captureEntryWorkspaceSnapshot()` 通过 `git ls-files -co` 枚举几乎整个 repository，再读取每个文件内容 hash。它为 entry→post 比较提供足够信息，但不是最小必要信息。

### 4.2 compact entry delta prototype

在 E2 当前 entry 上比较：

```text
full snapshot
  files: 375
  serialized payload: ~61,515 B
  observed wall time: 35–104 ms

canonical Git Base + compact dirty delta
  entries: 2
  serialized payload: ~551 B
  observed wall time: 11–25 ms
```

当前 2 个 entry delta 是：

```text
openspec/changes/change-verification-generalization-and-lean-run-normalization/.openspec.yaml
openspec/delivery-groups/20260810-01-change-execution-loop.yaml
```

prototype 使用：

```text
canonicalBase
+ git diff --name-status --no-renames <base>
+ untracked candidate paths
+ changed/untracked file content fingerprint
```

只保存“entry 相对 canonical Base 已经不同的 path 状态”。clean base file 不需要逐文件进入 Run。

### 4.3 为什么 compact delta 足够

对于任意 path：

```text
entry clean(base) → post changed
→ post delta 新出现，能识别 Action mutation

entry changed → post changed again
→ entry/post delta fingerprint 不同，能识别 modify

entry changed → post restored to base
→ entry delta 有、post delta 无，能识别 mutation

entry deleted / untracked → post state 改变
→ delete/create 状态同样可比较
```

因此 exact resume 所需的是：

```text
canonicalBase
+ exact entry delta
+ persisted mutation declaration
+ current post delta
```

而不是“把 canonical Base 中所有 clean file 再复制一份 hash list”。

### 4.4 结论

**PASS — prospective Apply writer 可以把 sufficient entry workspace identity 内嵌 `context.json`，不需要 `entry-workspace.json`。**

Proposal 应冻结一个 versioned compact representation；具体字段名/schemaVersion 留到 Proposal，不要求沿用 prototype 名称。

## 5. Proof C — Crash / recovery matrix

使用 disposable Git fixture（base files + entry dirty delta + declared mutation selectors）实际模拟 compact entry state：

| crash point | observed state | deterministic continuation |
| --- | --- | --- |
| Action mutation 前 | entry delta == current delta | exact resume；无 Action mutation |
| Action mutation 后、Verification 前 | entry→current 只有 declared paths `a.txt`, `new.txt` | 可从 persisted entry delta + current delta 重建 post-action observation；undeclared=0 |
| Verification 执行中 | candidate 与上一行相同，无 terminal result | selection 可重算；checks 可以重新执行；不得创建新 Run |
| `verification.md` publication 后、`result.json` 前 | `verification.md` 作为 Core-owned reserved path 排除后，Action mutation surface 仍只含 declared paths | exact resume 可重新计算 selection/checks，并对同一 Run 重新发布/覆盖 pending publication；旧 publication 未被 terminal result 接纳，不需要 sidecar 作为 commit marker |
| `result.json` terminal 后 replay | terminal result 已存在 | exact target 返回 existing terminal；不跑 Policy、不分配新 Run |

关键 fail-closed 条件保持：

- current delta 出现 declaration 外 path → STOP；
- canonical Base 改变 → STOP；
- Owner / contract / OpenSpec structured entry facts drift → STOP；
- expectedRunId / Action / Role / semantic identity 不匹配 → STOP；
- terminal result binding 冲突 → STOP。

对于 verification 执行中 crash，新三文件模型不需要把 raw check evidence 变成第四个 Run authority file。未 terminal 的 verification 可以安全重跑；`verification.md` 继续是 Change Verification formal authority，`result.json` 只在最终 terminal 时保存最小 binding。

### Proof C 结论

**PASS — 五个 crash/recovery 点都能在 three-file Run 下 deterministic recover 或 fail closed。**

代价是：如果 crash 发生在 checks 已运行但 result 未 terminal 之前，checks 可能重跑；E2 不为了避免这一次性重复执行而引入 Evidence ledger / transaction platform。

## 6. Proof D — Historical E1 compatibility

### 6.1 current defect

历史 133 selection 持久化：

```text
rendererVersion: 2
moduleMapFingerprint:
9d74a948fa1e13ec290c766b3c383f58f6cd058ac29ad7031af2851ba81b2797
```

当前 reader 把这个 historical fingerprint 与 **current map** 比较。prototype 令 future Catalog fingerprint 变为：

```text
fdba1f90edd732212122a30d854093be876990b7d3369e4207391798d186a0b0
```

现有 validator 语义会把历史 selection 判 stale。

### 6.2 historical-reader prototype

对历史 133 persisted selection，只验证它自己的 payload：

```text
moduleMapLogicalRef
persisted moduleMapFingerprint
seed/module/capability/ref arrays
capabilityRelation
verificationScopes
→ persisted selectionFingerprint
```

再由 terminal `result.json` 已有 immutable selection record binding 绑定 exact record bytes；rendererVersion 选择 historical renderer/evidence contract。

该 reader 在 future/current Catalog fingerprint 改变后仍能验证 133 的 persisted self-consistency，且没有读取 future Catalog 作为过去事实的 authority。

### 6.3 sidecar compatibility

E1 历史 sidecars：

```text
entry-workspace.json
verification-selection.json
verification-evidence.json
```

保持 immutable + legacy-readable：

- 不迁移；
- 不回写；
- 不要求新 writer 继续生成；
- terminal replay 根据 persisted context/result schema 与 rendererVersion 走 legacy reader；
- new Catalog 只约束 new selection writer。

### Proof D 结论

**PASS — historical E1 可以与 future current Catalog/renderer 解耦，且无需 history migration。**

## 7. Proof E — F1 / G1 next-consumer feasibility

### 7.1 F1-shaped Change

prototype input：

```text
paths:
  src/integrations/openspec/openspec-archive-service.ts
  src/services/b1-run-execution-service.ts
capability:
  flowkit-archive-and-checkpoint-boundary
```

得到 deterministic seeds/closure 与 logical checks：

```text
seeds: execution, openspec-runtime
checks:
  openspec-current-change-strict
  tests-cli
  tests-execution
  tests-openspec-runtime
  tests-verification
  typecheck
```

current implementation 对相同 F1 capability 失败，因为 `openspec-runtime` capability relation 仍冻结在 E1-era capability set。

### 7.2 G1-shaped Change

prototype input：

```text
paths:
  src/cli/main.ts
  src/diagnostics/resume-context.ts
capability:
  flowkit-change-cli-end-to-end-and-performance
```

得到：

```text
seed: cli-diagnostics
checks:
  openspec-current-change-strict
  tests-cli
  typecheck
```

current implementation 对 `src/cli/main.ts` 是 ownership zero-match。

### 7.3 current Change OpenSpec projection

`openspec-current-change-strict` 是稳定 logical check id。执行时必须用正式 `changeId` / OpenSpec operation projection：

```text
OpenSpecCliAdapter.validateChange(currentChangeId, strict=true)
```

而不是在 Catalog 中保存：

```text
npx openspec validate <E1-id> --strict
```

### Proof E 结论

**PASS — F1/G1 可以成为 E2 后第一批 next-consumer，不需要 E1 identity 特例。**

## 8. structural performance proof

E2 只处理结构简化自然带来的成本下降。

### 8.1 entry identity

Proof B 已证明 compact entry delta 可把 375-file 全量 entry snapshot 收敛到当前 2-entry delta，同时减少 Run bytes 与 hash/read work。

### 8.2 affected execution aggregation

当前 `executeVerificationSelection()`：

```text
for verificationScope
→ executeScope(scope)
→ physical process per scope
```

虽然 selection 对完全相同 scope 去重，但 execution / openspec-runtime / verification 等 module 的不同 `node --test ...` command 仍分别启动 Node test process。

E2 可把 selection identity 改为 logical checks / affected scope ids：

```text
logical affected scopes
→ resolveAffectedTests(...)
→ union + dedupe test files
→ compatible Node test runner 一次执行
```

现有 `scripts/affected-scopes.ts` 已证明多个 scope 可以 union / dedupe / lexical sort，因此不需要引入 scheduler/cache framework。

### 8.3 Reviewer reuse

Review 默认消费 exact-bound `verification.md` / result binding；只有 evidence stale/conflict 或具体 blocker 需要时 targeted rerun。Reviewer 不再默认重复整套 Change Verification。

### 8.4 明确后置

E2 不做：

```text
mtime/content cache
incremental Git hash cache
generic test-result cache
parallel scheduler
CodeGraph-based dynamic affected analysis
concurrency framework
```

## 9. Proposal 必须冻结的 authority boundaries

Proposal 至少要冻结以下结果，不得退回 E1 特化：

1. current Verification Catalog 是 source-controlled、closed、deterministic 的 **new-selection authority**；
2. selection 保存 logical check identity，physical command/method 由 executor/adapter 解析；
3. current Change OpenSpec validation 从 formal `changeId` / structured projection 得到；
4. prospective Apply entry identity 由 canonical Base + compact entry delta（或 proof 等价表示）进入 `context.json`；
5. new Run writer 只写 `action.md` / `context.json` / `result.json`；
6. `verification.md` 继续是 Change Verification formal authority；未 terminal crash 可重算/重跑，不新增 evidence sidecar；
7. terminal `result.json` 保存 verification status + selection/publication minimal binding，而不是 raw logs/evidence store；
8. historical E1 sidecars 只读兼容，historical reader 不比较 future current Catalog；
9. renderer versioned；new renderer 不出现 E1/Bootstrap current prose；
10. tests 使用 synthetic-change-a / synthetic-change-b / historical-e1 fixtures，不依赖 current repository 恰好存在 E1 active Change；
11. F1/G1-shaped paths + capabilities 必须有 deterministic selection；
12. affected tests 先聚合/去重再按 compatible runner 执行。

具体 schema version、type/class 名称、Catalog 文件拆分与 logical check id 枚举由 Proposal 在这些 proof 约束下冻结。

## 10. 可能的实现面（非冻结设计）

当前证据表明 Proposal 需要重点覆盖：

```text
src/verification/change-selection/module-map.ts
src/verification/change-selection/selection.ts
src/verification/change-selection/evidence.ts
src/verification/change-selection/publication.ts
src/verification/change-selection/entry-snapshot.ts
src/verification/change-selection/actual-change-set.ts
src/services/b1-run-execution-service.ts
src/persistence/run-persistence.ts
src/persistence/serialization.ts
scripts/affected-scopes.ts / scripts/verification.ts
相关 synthetic / historical fixtures 与 unit/integration tests
```

这不是授权全面拆 `b1-run-execution-service` 或重写 FormalFactReader。只在 three-file writer、generic verification、historical compatibility 所需 seam 做最小抽离。

## 11. Explore 结论

五类 feasibility proof 结果：

```text
Proof A Generic Verification           PASS
Proof B Three-file entry identity      PASS
Proof C Crash/recovery matrix          PASS
Proof D Historical E1 compatibility    PASS
Proof E F1/G1 next-consumer            PASS
```

同时，current implementation 已真实证明存在 E2 要关闭的问题：E1 literal / capability / physical command hardcode、historical selection 依赖 current Catalog、E1-active test isolation、F1/G1 zero/mismatch selection，以及 full entry snapshot / multi-process verification 的结构成本。

因此 E2 可以进入 Proposal。Proposal 不需要重新发明 E1 的 exact resume；应把 E1 已证明正确的语义投影到 generic current-Change + three-file physical model，并保持所有 historical E1 facts immutable。
