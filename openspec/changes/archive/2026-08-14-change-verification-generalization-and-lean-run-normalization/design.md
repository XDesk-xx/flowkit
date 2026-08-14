## Context

见 `proposal.md`。136 Explore 已完成 Proof A–E：generic selection、Git Base + compact entry delta、three-file crash/recovery、historical E1 independence、F1/G1 next-consumer 均可行。当前 generation 由 Owner Contract Reset `owner:1f4b0ee08f7de45ac707d0dea97d84fe95dd6940254b61106bc3d0be70c805fe` 重新冻结：140/141 中 Context v5/v6、ActionPackage v2/v3、schema-1/schema-2、renderer v1/v2/v3、Catalog generation 的长期内部版本体系全部 superseded；136/137 的 feasibility facts 继续作为新 Proposal 的合法基础。

## Goals / Non-Goals

**Goals:**

- generic Change Verification 不依赖任何 E1 Change literal、E1 capability subset 或固定 physical command；
- historical E1 persisted facts immutable、bounded-readable，且 future current source 不成为历史 currentness authority；
- E2 自身可以在 pre-E2 runner 上完成 generic Verification、review 与 archive；
- recognized E2 checkpoint 后 new Run writer 收敛为 `action.md` / `context.json` / `result.json`；
- F1 成为第一份 post-E2 current writer consumer；
- compatibility 规模保持 bounded，不形成内部组件 version lifecycle 或 migration platform。

**Non-Goals:**

- 不重新设计 E1 execution-time model、exact resume、Contract Reset 或 archive recovery；
- 不删除/迁移 historical E1 bytes；
- 不引入 Context/ActionPackage/renderer/Catalog 独立版本线；
- 不引入 generic Schema Registry、Migration Framework、Evidence ledger、cache/parallel scheduler、mandatory CodeGraph；
- 不实现 F1/G1/03 的业务 scope。

## Decisions

### 1. Current source 是 current Verification Catalog authority；point-in-time identity 使用 content fingerprint

Current Catalog 仍是 source-controlled、closed、deterministic data：

```text
actualChangeSet
→ path ownership
→ reverse dependency closure
→ current Change capability relation
→ stable logical check ids
```

Catalog 不保存 physical command，也没有 `generation`。Selection 需要证明“当时用了哪份 Catalog”时，只保存 canonical Catalog projection 的 content fingerprint；这个 fingerprint 是 point-in-time identity，不是版本号。Historical selection validation 只校验其 persisted fingerprint/internal consistency/terminal binding，不与 future Catalog 比较。

备选方案：`catalogGeneration=1/2/...`。拒绝，因为它把源码内容 identity 重复建成第二套 lifecycle。

### 2. Current Change OpenSpec validation 只使用 formal identity

Logical check `openspec-current-change-strict` 由 formal `changeId` / OpenSpec structured projection 得到 target；OpenSpec adapter 决定 concrete invocation。Catalog 与 persisted selection 不保存 `npx openspec validate <fixed-change>` 作为 lifecycle identity。

### 3. Historical E1 compatibility 使用 small bounded legacy recognition，不建立 reader family

Historical E1 已存在的 `context.json`、`entry-workspace.json`、`verification-selection.json`、`verification-evidence.json`、`result.json` 原样保留。Latest reader：

1. 先识别 post-E2 current structural shape；
2. 若不是 current shape，只识别当前仓库已经存在、明确列举的 historical shapes；
3. 对 historical bytes 验证其 persisted closed fields、content/internal fingerprint、Result/terminal/publication binding；
4. unknown / ambiguous / mixed historical shape fail closed。

已有 historical `schemaVersion` / `rendererVersion` 等字段可以作为 legacy input 被读取，但 E2 不新增值、不把它们继续扩张为长期 version family。不得形成 `readV1 → readV2 → readV3...` 的开放式平台；兼容集合只覆盖当前 Git 历史真实存在的 bounded shapes。

### 4. Historical verification authority 不依赖重新渲染过去 Markdown

`verification.md` 继续是 Change Verification formal authority。Historical E1 integrity 以：

```text
persisted selection/evidence bytes
+ persisted fingerprints
+ terminal/result binding
+ point-in-time verification.md fingerprint
```

为准。Future reader 不需要加载 historical renderer 再生成过去 Markdown；future renderer 文案变化也不应让历史 terminal stale。

若 historical record 自身已有 renderer discriminator，reader 只把它作为 bounded legacy field 做 schema/internal consistency 校验，不把它升级为 future renderer lifecycle。

### 5. E2 自身继续使用 pre-E2 runner；migration bridge 由 lifecycle + persisted identity 闭合

E2 Apply/revise-apply 在 E2 checkpoint 之前仍由 current pre-E2 runner 进入，因此 entry/resume 使用它已存在的 persistence protocol。E2 implementation 可以把 selector/executor 泛化后，用**同一既有 sidecar 物理协议**暂时保存 E2 自己的 selection/evidence；但：

- 不新增 sidecar file type；
- 不新增 sidecar schema generation；
- 不新增 renderer generation；
- selection 由 current source Catalog 产生，point-in-time Catalog identity 使用 content fingerprint；
- publication authority 使用 persisted selection/evidence fingerprint + `verification.md` fingerprint + existing terminal binding；
- historical E1 与 E2 current record 不需要靠“代际编号”区分 currentness，current producer 仍由已有 Run/Review lineage 决定。

因此 E2 自己可以合法完成 generic Verification，又不会提前 dogfood post-E2 writer。

### 6. E2 self-migration checkpoint 与 fresh/downstream current writer

recognized E2 Change Checkpoint 只作为 Flowkit 仓库自身一次性 pre-E2 → post-E2 self-migration guard：该 migration lineage 内 checkpoint 前不得 self-activate，checkpoint 后保持 three-file writer。对 Git history 中根本不存在这条 Flowkit 02 pre-E2 migration lineage 的 fresh/downstream repository，current source/implementation 本身就是 current writer authority，MUST 默认使用 structural three-file shape，且不得要求 consumer repository 伪造 Flowkit 内部 E2 checkpoint。两类 repository 都使用当前最新 persistence shape：

```text
<run>/action.md
<run>/context.json
<run>/result.json   # terminal 时
```

Apply/revise-apply 的 `context.json` 内嵌：

```text
canonical Git Base
+ lexical compact entry delta
+ mutation declaration identity
+ applicable Owner/contract refs
```

`result.json` terminal binding 内嵌：

```text
actualChangeSet / selection binding
selected logical check ids
Catalog content fingerprint
selection fingerprint
verificationStatus
verification.md publication fingerprint
```

raw stdout/full logs 不进入 Run。新 writer 不再生成 `entry-workspace.json`、`verification-selection.json`、`verification-evidence.json`。

E2 不引入 `Context v6` 或 `ActionPackage v3`。Latest reader 通过 mutually-exclusive structural fields 识别 post-E2 current shape与 bounded historical shape；例如 prospective Apply 必须有 embedded compact entry identity 且不得有 legacy full-entry sidecar reference。若 Apply 阶段证明这些结构无法 closed、unambiguous 地判别，则属于 Proposal assumption failure，应返回 Proposal，而不是临时发明一个新组件版本号。

### 7. E2 不新增 formatVersion；serialization discriminator 只保留未来最小逃生口

本 Proposal **不授权**新的 `formatVersion`。E2 必须先通过 structural discrimination 完成 new writer / legacy reader。

Owner 冻结的长期规则是：只有未来 persisted breaking format 真的无法通过最新 reader 可靠结构识别时，才允许由对应正式 Change 引入一个最小 `formatVersion`；它只区分 serialization shape，不表达 Context/ActionPackage/renderer/Catalog 产品版本。

### 8. Crash/recovery 保持 136 Proof C，不增加 authority file

五个 crash point 继续使用：

```text
persisted entry identity
+ current candidate state
+ deterministic selection/checks
+ deterministic verification.md publication
+ terminal CAS-last
```

恢复规则：

- Action mutation 前：exact resume；
- Action mutation 后 / Verification 前：由 entry→current observation 重建 actualChangeSet；
- Verification 执行中：未 terminal-bound checks 允许 deterministic rerun；
- `verification.md` 已发布 / result absent：重新派生 selection/checks，matching publication 可覆盖同一 deterministic bytes，mismatch fail closed；
- result terminal：equivalent replay 返回 existing terminal，conflict fail closed。

Historical E1 sidecars只服务 bounded legacy replay；post-E2 writer不因为 crash recovery重新增加 sidecar。

### 9. affected execution 在执行前聚合 compatible test files

Logical scopes 先 union，再解析 test files 并 lexical dedupe；同一 Node test runner 的 compatible files 尽量一次执行。不同 executor / 不兼容 check 保持分离。不引入 cache、parallel scheduler 或全局 concurrency framework。

### 10. 正式 dependency graph 保持 E1 → E2 → F1 → G1

Manifest 中 E2 依赖 E1、F1 依赖 E2、G1 依赖 F1。Policy regression 必须证明：

- E2 未 completed/checkpointed 时 F1 不成为 intended next consumer；
- E2 completed + recognized checkpoint 后 F1 才以 post-E2 current writer 开始；fresh/downstream repository 则从 current implementation 的首个 Standard Run 即使用 three-file writer。

### Decision: canonical Requirement identity 必须描述 current semantics

E2 对仍以 `verification-selection record` sidecar 或 `ActionPackage v2` component version 命名的 canonical Requirement 做 OpenSpec `RENAMED`，新名称直接描述非版本化 current behavior。历史版本名只作为 bounded legacy scenario 中的 point-in-time facts；不得通过 Requirement 名称继续冻结 superseded version/sidecar architecture。

## Risks / Trade-offs

- **[Risk] structural discrimination 不够 closed** → 用真实 historical fixtures + post-E2 fixture做 mutually-exclusive shape tests；出现 ambiguous shape 就 fail closed，并返回 Proposal，不在 Apply 临时扩张版本体系。
- **[Risk] E2 current generic sidecar 与 historical E1 sidecar 被误当 currentness generation** → currentness 只由 Run/Review lineage 决定；sidecar validator只验证 persisted internal fingerprint/binding，不比较 future Catalog。
- **[Risk] future Catalog/renderer 改变使历史 stale** → 历史验证只使用 persisted bytes/fingerprint/result/publication binding，不重算 past Catalog，不重渲染 past Markdown。
- **[Risk] E2 checkpoint 前 production code已包含 new writer 导致 self-activation** → writer mode 必须区分“存在 Flowkit 02 pre-E2 migration lineage”的 self-migration repo 与“不存在该 lineage”的 fresh/downstream repo：前者检查 recognized E2 checkpoint，后者默认 current three-file；E2 review/revise/archive 仍保持 pre-E2 persistence path。
- **[Risk] generic Catalog 变成第二 Policy** → Catalog 只选择 checks，不选择 Action、Owner authority 或 lifecycle boundary。
- **[Risk] affected aggregation改变 test semantics** → 只聚合 compatible runner；验证 file union 与原 selected scope union一致。

## Migration Plan

1. 保持 136/137 Explore facts 与 E2 active state，不迁移 historical E1 Runs。
2. 在 E2 Apply 中先实现 generic Catalog/current-Change projection和 historical persisted-content validation，再实现 E2 自身 current-run generic verification。
3. 使用 E2 自己的 pre-E2 runner完成 Apply/Verification/Review/revise/archive；该阶段不新增版本号、不启用 post-E2 writer。
4. 实现 prospective structural three-file writer与 bounded legacy reader，但 activation 对 Flowkit self-migration repo 锁定 recognized E2 checkpoint；fresh/downstream repo 无该 migration lineage 时直接使用 current three-file writer。
5. E2 archive completed 后由正常 Git boundary形成 Change Checkpoint；checkpoint 前不 dogfood new writer。
6. F1 作为第一份正式 post-E2 consumer，验证 three-file Run、generic selection与historical compatibility。

## flowkitMutationScope

```json
{
  "schemaVersion": 1,
  "actions": {
    "apply": {
      "selectors": [
        { "kind": "exact", "path": "openspec/changes/change-verification-generalization-and-lean-run-normalization/tasks.md" },
        { "kind": "exact", "path": "scripts/affected-scopes.ts" },
        { "kind": "exact", "path": "scripts/verification.ts" },
        { "kind": "exact", "path": "src/domain/types.ts" },
        { "kind": "exact", "path": "src/facts/formal-fact-reader.ts" },
        { "kind": "exact", "path": "src/persistence/legacy-recognizer.ts" },
        { "kind": "exact", "path": "src/persistence/run-persistence.ts" },
        { "kind": "exact", "path": "src/persistence/serialization.ts" },
        { "kind": "exact", "path": "src/services/b1-run-execution-service.ts" },
        { "kind": "prefix", "path": "src/verification/change-selection" },
        { "kind": "prefix", "path": "tests/fixtures/e2-change-verification-generalization" },
        { "kind": "exact", "path": "tests/integration/e1-change-verification-selection.test.ts" },
        { "kind": "exact", "path": "tests/integration/e2-change-verification-generalization.test.ts" },
        { "kind": "exact", "path": "tests/integration/verification-commands.test.ts" },
        { "kind": "exact", "path": "tests/unit/facts/formal-fact-reader-e1-verification.test.ts" },
        { "kind": "exact", "path": "tests/unit/facts/formal-fact-reader.test.ts" },
        { "kind": "exact", "path": "tests/unit/persistence/legacy-recognizer.test.ts" },
        { "kind": "exact", "path": "tests/unit/persistence/run-persistence.test.ts" },
        { "kind": "exact", "path": "tests/unit/persistence/serialization.test.ts" },
        { "kind": "exact", "path": "tests/unit/services/a1-write-service.test.ts" },
        { "kind": "exact", "path": "tests/unit/services/b1-run-execution-service.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/affected-scopes.test.ts" },
        { "kind": "prefix", "path": "tests/unit/verification/change-selection" }
      ]
    },
    "revise-apply": {
      "selectors": [
        { "kind": "exact", "path": "openspec/changes/change-verification-generalization-and-lean-run-normalization/tasks.md" },
        { "kind": "exact", "path": "scripts/affected-scopes.ts" },
        { "kind": "exact", "path": "scripts/verification.ts" },
        { "kind": "exact", "path": "src/domain/types.ts" },
        { "kind": "exact", "path": "src/facts/formal-fact-reader.ts" },
        { "kind": "exact", "path": "src/persistence/legacy-recognizer.ts" },
        { "kind": "exact", "path": "src/persistence/run-persistence.ts" },
        { "kind": "exact", "path": "src/persistence/serialization.ts" },
        { "kind": "exact", "path": "src/services/b1-run-execution-service.ts" },
        { "kind": "prefix", "path": "src/verification/change-selection" },
        { "kind": "prefix", "path": "tests/fixtures/e2-change-verification-generalization" },
        { "kind": "exact", "path": "tests/integration/e1-change-verification-selection.test.ts" },
        { "kind": "exact", "path": "tests/integration/e2-change-verification-generalization.test.ts" },
        { "kind": "exact", "path": "tests/integration/verification-commands.test.ts" },
        { "kind": "exact", "path": "tests/unit/facts/formal-fact-reader-e1-verification.test.ts" },
        { "kind": "exact", "path": "tests/unit/facts/formal-fact-reader.test.ts" },
        { "kind": "exact", "path": "tests/unit/persistence/legacy-recognizer.test.ts" },
        { "kind": "exact", "path": "tests/unit/persistence/run-persistence.test.ts" },
        { "kind": "exact", "path": "tests/unit/persistence/serialization.test.ts" },
        { "kind": "exact", "path": "tests/unit/services/a1-write-service.test.ts" },
        { "kind": "exact", "path": "tests/unit/services/b1-run-execution-service.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/affected-scopes.test.ts" },
        { "kind": "prefix", "path": "tests/unit/verification/change-selection" }
      ]
    }
  }
}
```
