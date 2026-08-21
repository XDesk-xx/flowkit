## Context

见 `proposal.md` 与已批准 `explore.md`。当前 Base 已有 Policy-owned `prepareNewExecution`、exact `resumeRun`、`admitActionResult`、three-file Run、exact-candidate Verification retry/history、OpenSpec active/archive reader、Architecture assets 与 closed managed-tool runtime。G1 的关键 current gap 是：completed F1 084 的 terminal Verification binding 在合法 re-verification supersession + OpenSpec archive relocation 后无法 replay；同时 current human resume view、OpenSpec structured context 与未来 Agent/H1 consumer尚未形成一个共享 typed projection/adapter boundary。

## Goals / Non-Goals

**Goals:**

- 在不改写 historical Run/result 的前提下，使 post-E2 Apply/revise-apply terminal replay支持 exact current Verification或合法 same-origin re-verification successor，并支持 active→unique archive physical relocation。
- 建立一个 non-persistent typed resume projection，统一 repository/fact解释；human `resume-context` 消费 repository-stable子集，Agent/H1 consumer可按需读取 managed tool readiness。
- 建立 provider-neutral single-action adapter：一个 invocation只准备/恢复一个 Policy-decided Action，最多调用 provider一次，通过 existing admission完成当前 Run后 return control。
- 保持 historical E1 sidecar point-in-time semantics、prospective three-file Run与既有 Policy/Owner/Reviewer authority不变。
- 让 G1 targeted regressions通过正式 Change Verification physical resolver实际执行。

**Non-Goals:**

- H1 stable `dist/bin/flowkit.js` release或完整 self-hosting fixture。
- provider/agent/skill Registry、provider session/transcript persistence、`while(next)`、auto Author↔Reviewer。
- Full Test / Finalize / Checkpoint adapter、Git commit/push/merge automation。
- 03 Actual Architecture generation/Compare/acceptance。
- 新 Run sidecar、Verification ledger/archive DB、历史 rewrite、current Catalog解释 historical E1 bytes。
- 04 tests-cli timeout/granularity或大文件结构重构。

## Decisions

### 1. Historical Verification replay 分离 logical authority identity 与 physical storage location

Producing Apply/revise-apply terminal binding继续保持：

```text
logicalRef = openspec/changes/<changeId>/verification.md
versionFingerprint/status/selectionFingerprint = producing Run completion point-in-time truth
```

新增/抽取一个 bounded active-or-unique-archive path resolver，返回 current Verification 的 **physical path + bytes**。Resolver顺序固定：

```text
active openspec/changes/<changeId>/verification.md
→ if absent, unique openspec/changes/archive/*-<changeId>/verification.md
→ zero = unavailable
→ >1 = ambiguous conflict
```

`validateCurrentVerificationTerminalBinding` 不再要求 current bytes永远等于 producing fingerprint。它先验证 binding logicalRef identity，然后：

```text
current sha/status/selection exact-match origin binding
→ exact replay PASS

otherwise
→ validate current publication as bounded re-verification successor chain
   anchored at origin binding
   same origin Run + candidate + selection
→ PASS only if complete chain validates
```

`validateCurrentReverificationChain` 必须显式分离：

```text
logicalAuthorityRef/Dir
→ 仍使用 pre-archive openspec/changes/<changeId>/verification-history/** refs

physicalCurrentPath/Dir
→ 允许 active 或 archived root，用于实际读取 verification.md/history bytes
```

这样 archive relocation不会要求历史 lineage ref改写为 `openspec/changes/archive/...`。缺 predecessor、fingerprint mismatch、cycle、wrong origin/candidate/selection、multiple archive roots均 fail closed。

**Alternative rejected:** terminal replay直接比较 current `verification.md` fingerprint。它无法表示合法 exact-candidate retry supersession。

**Alternative rejected:** archive后重写 terminal binding/history refs。它破坏 immutable point-in-time authority。

**Alternative rejected:**建立 archive/Verification ledger。现有 repository archive + verification-history 已足够。

### 2. Historical E1 legacy sidecars 保持独立 bounded reader path

G1 不把 historical E1 `verification-selection.json` / `verification-evidence.json` 迁移成新格式，也不把它们与 current post-E2 retry chain合并成通用 generation/version framework。已有 reader继续按 persisted sidecar/context/result bytes验证；current module map/Catalog只能服务 current/future selection，不参与 historical selection重新解释。

**Rationale:** 089 Proof G 已证明 current Catalog fingerprint改变时 historical E1 terminal replay仍保持 point-in-time identity；G1只需防止回归。

### 3. 新建共享 async typed resume projection，human renderer只消费 repository-stable子集

新增 bounded projection builder（建议独立于 renderer，例如 `src/diagnostics/resume-projection.ts`），输入：

```text
repoRoot
FormalFactSnapshot
PendingRunInspection
optional local env/tool-readiness request
```

输出至少包含：

```text
Delivery / Change / stage
pending run/action/role/resumability
review / verification
Policy next
Architecture:
  current/planned/actual = present(path, sha256) | absent | not-applicable
optional managed tools:
  openspec / archify = ready(exact id/version/source) | unavailable/mismatch
```

Architecture refs只读取 `architecture/<delivery-id>/json/*.architecture.json` durable source并hash current bytes，不生成HTML/Actual。Managed tool view只调用 closed existing resolver/descriptor；不fallback ambient PATH。

现有 `resume-context` 改为消费该 projection 的 repository-stable字段（至少 Architecture status/ref），保持 line-oriented/read-only；为了不让本地 `FLOWKIT_HOME` 差异破坏 human diagnostic 的 repository-stable输出，managed tool readiness默认不要求进入 human text renderer，而由 Agent/H1 structured consumer按需读取。

**Alternative rejected:** human CLI、Agent Adapter、H1分别扫描 repository。会形成三套逐步漂移的事实解释。

### 4. Single-action Adapter 使用 caller-supplied executor callback，不建立 provider registry

新增最薄 service（建议 `src/services/g1-single-action-agent-adapter.ts`），public contract概念为：

```text
runSingleActionAgent({ repoRoot, deliveryId, entry, execute })
```

其中 `entry` 仍只允许现有 high-level `next | review` intent；它不能指定 concrete Action/Role。Adapter逻辑：

```text
prepareNewExecution(entry)
├─ prepared → use package + returned OpenSpec context
└─ exact-resume-required
   → resumeRun(expectedRunId)
   → rebuild bounded OpenSpec context from fresh repository facts

build typed resume projection
↓
provider view = {
  actionPackage,
  openSpecContext,
  resumeProjection
}
↓
execute(view) exactly once
↓
admitActionResult(existing authority)
↓
exact terminal replay
↓
read post-admission Policy projection
↓
return control
```

Adapter MUST NOT调用 provider第二次，MUST NOT自动 prepare next Run。若 `execute` 抛错/未返回可admit logical result，pending Run保持 pending；Adapter只返回/抛出 bounded execution failure，不伪造 terminal failed/cancelled。

Provider transcript/session不持久化；provider view只包含当前 Action需要的 bounded typed facts。OpenSpec context复用现有 `OpenSpecPreparedActionContextView`/builder，不新增 Run sidecar。

**Alternative rejected:**直接把 current `runChangeOperator()` stdout当 provider contract，因为它当前只返回 ActionPackage并丢失 structured OpenSpec execution context。

**Alternative rejected:**adapter内部 `while(next)`。这会成为第二 Policy/orchestrator。

### 5. Activation 仍以 G1 canonical Change Checkpoint 为 prospective semantics boundary

当前 detached 091及后续 G1 candidate继续由 entry implementation执行，不在 Change中途 self-upgrade。只有：

```text
approved G1
→ archive
→ canonical exact materialization
→ G1 Change Checkpoint
```

之后 H1/new checkout才消费 prospective resume/adapter实现。无需 migration table；没有 persisted schema change。

### 6. Verification 使用现有 logical checks，但给 G1 targeted integration target明确 physical route

不新增 Verification platform或动态 check。Expected mutation surface集中在：

```text
src/services/b1-run-execution-service.ts
src/verification/change-selection/publication.ts
new bounded resume/adapter modules under src/diagnostics|src/services
src/diagnostics/resume-context.ts
src/verification/change-selection/module-map.ts
src/verification/change-selection/evidence.ts
corresponding targeted tests
```

新增 `tests/integration/g1-sync-resume-and-single-action-agent-adapter.test.ts`（最终命名可保持同语义）并把它纳入唯一 module owner与 selected existing logical Node check physical selector。该 integration target承担跨边界 proof：future Delivery fresh clone、F1 084 retry+archive replay、historical E1 no-current-Catalog reinterpretation、single provider invocation/no auto-next。Diagnostics/verification unit regressions继续由现有 `tests-cli/tests-verification/typecheck` dependency closure覆盖。

Apply前必须用 expected production/test paths做 production `buildVerificationSelection()` prospective proof；Apply后正式 Verification必须实际执行新的 G1 integration target。不得用 `npm test` PASS替代 selection physical closure。

## Risks / Trade-offs

- **[Risk] archive-aware resolver误选多个同名 archived Change** → unique-match only；0/多于1均 fail closed，增加ambiguity regression。
- **[Risk] retry chain validator把 archived physical dir误写进 logical predecessor refs** → validator显式接收 logical authority base与physical dir两套输入，并以 origin binding logicalRef冻结 expected refs。
- **[Risk] shared resume projection变成第二 durable state** → projection纯函数/async derived view，不写文件，不新增 manifest/run字段。
- **[Risk] local managed-tool readiness使human diagnostics受环境波动** → human renderer默认只消费 repository-stable subset；tool readiness仅structured consumer按需读取。
- **[Risk] adapter隐藏 auto-loop** → executor callback最多一次；admission后只返回 post Policy projection；test断言Run count不增加。
- **[Risk] provider failure被误记为 Action failure** → provider transport exception保持 pending Run，只有合法 LogicalActionResult才能进入existing admission。
- **[Risk] b1-run-execution-service hotspot继续扩大** →只做完成G1 replay helper所需bounded修改；结构拆分留04，除非为正确性必须抽取最小helper。

## Migration Plan

1. 在当前 G1 candidate中实现 replay/path resolver与tests；不改 historical bytes。
2. 实现 typed resume projection与human renderer bounded consumption。
3. 实现 single-action adapter service与future-Delivery/provider regressions。
4. 更新Verification ownership/physical resolver并完成prospective selection proof。
5. G1 Change Verification + Reviewer approval + archive。
6. canonical Executor exact materialize并形成 G1 Change Checkpoint；此时 prospective semantics正式供H1消费。

无 persisted schema migration、无 historical rewrite。G1 checkpoint前可直接丢弃 detached candidate回到 exact Base；checkpoint后若发现产品问题，按正常后续/corrective Change修复，不 destructive rewrite Git/Run/OpenSpec history。

## flowkitMutationScope

```json
{
  "schemaVersion": 1,
  "actions": {
    "apply": {
      "selectors": [
        { "kind": "exact", "path": "openspec/changes/sync-resume-and-single-action-agent-adapter/tasks.md" },
        { "kind": "exact", "path": "openspec/changes/sync-resume-and-single-action-agent-adapter/verification.md" },
        { "kind": "exact", "path": "src/diagnostics/resume-context.ts" },
        { "kind": "exact", "path": "src/diagnostics/resume-projection.ts" },
        { "kind": "exact", "path": "src/services/b1-run-execution-service.ts" },
        { "kind": "exact", "path": "src/services/g1-single-action-agent-adapter.ts" },
        { "kind": "exact", "path": "src/verification/change-selection/evidence.ts" },
        { "kind": "exact", "path": "src/verification/change-selection/module-map.ts" },
        { "kind": "exact", "path": "src/verification/change-selection/publication.ts" },
        { "kind": "exact", "path": "tests/integration/g1-sync-resume-and-single-action-agent-adapter.test.ts" },
        { "kind": "exact", "path": "tests/unit/diagnostics/resume-projection.test.ts" },
        { "kind": "exact", "path": "tests/unit/diagnostics/views.test.ts" },
        { "kind": "exact", "path": "tests/unit/services/b1-run-execution-service.test.ts" },
        { "kind": "exact", "path": "tests/unit/services/g1-single-action-agent-adapter.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/evidence.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/module-map.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/publication.test.ts" }
      ]
    },
    "revise-apply": {
      "selectors": [
        { "kind": "exact", "path": "openspec/changes/sync-resume-and-single-action-agent-adapter/tasks.md" },
        { "kind": "exact", "path": "openspec/changes/sync-resume-and-single-action-agent-adapter/verification.md" },
        { "kind": "exact", "path": "src/diagnostics/resume-context.ts" },
        { "kind": "exact", "path": "src/diagnostics/resume-projection.ts" },
        { "kind": "exact", "path": "src/services/b1-run-execution-service.ts" },
        { "kind": "exact", "path": "src/services/g1-single-action-agent-adapter.ts" },
        { "kind": "exact", "path": "src/verification/change-selection/evidence.ts" },
        { "kind": "exact", "path": "src/verification/change-selection/module-map.ts" },
        { "kind": "exact", "path": "src/verification/change-selection/publication.ts" },
        { "kind": "exact", "path": "tests/integration/g1-sync-resume-and-single-action-agent-adapter.test.ts" },
        { "kind": "exact", "path": "tests/unit/diagnostics/resume-projection.test.ts" },
        { "kind": "exact", "path": "tests/unit/diagnostics/views.test.ts" },
        { "kind": "exact", "path": "tests/unit/services/b1-run-execution-service.test.ts" },
        { "kind": "exact", "path": "tests/unit/services/g1-single-action-agent-adapter.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/evidence.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/module-map.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/change-selection/publication.test.ts" }
      ]
    }
  }
}
```

该 closed selector set 只授权 091 已冻结的 G1 implementation/test surface：historical replay/path resolution、typed resume projection、single-action adapter、diagnostic consumer、Verification ownership/physical resolver，以及对应 targeted regressions。它不授权 H1 stable Runner、Registry/auto-loop、Delivery Full Test/Finalize/Checkpoint adapter、Actual Architecture 或 04 Engineering Health。apply 与 revise-apply 使用相同边界，避免 revise-apply 临时扩大 authority。

## Proposal-time Verification Selection Proof

在不修改091 candidate production/test bytes的 disposable copy中，仅模拟本 Design冻结的 expected `module-map/evidence` 变更，并使用 production `buildVerificationSelection()` 对 expected G1 actualChangeSet + 本 Change四个 delta capability refs执行 prospective proof。结果：

```text
seedModuleIds:
  cli-diagnostics
  execution
  verification-selection

moduleIds:
  cli-diagnostics
  execution
  openspec-runtime
  verification-selection

capabilityRelation:
  matched

verificationScopes:
  openspec-current-change-archive-sync
  openspec-current-change-strict
  tests-cli
  tests-execution
  tests-openspec-runtime
  tests-verification
  typecheck

prospective selectionFingerprint:
  4e488b856cf54f7ad3bcd5bc0482ade83cf3aade5aa376d702828d2da5737a91
```

该 fingerprint仅是 Proposal-time disposable expected-selection evidence，不是未来 Apply formal Verification authority；Apply仍必须基于真实 actualChangeSet重新由 production Catalog派生正式 selection。093 revise-propose 重新以 frozen selectors 对应的 expected production/test actualChangeSet 执行 production `buildVerificationSelection()`，仍得到 `seedModuleIds = cli-diagnostics / execution / verification-selection`、`capabilityRelation = matched` 与相同七个 logical checks，不需要扩大 G1 scope或新增 logical check。

Physical resolver closure 也在 disposable prospective Catalog 中机械证明：`tests-cli` 的同一 `logicalNodeSelectors()` mapping 包含 `tests/integration/g1-sync-resume-and-single-action-agent-adapter.test.ts`；将该 target替换为故意失败的 sentinel 后，单独按 Node test physical contract执行得到 exitCode=1 且观察到 sentinel test name。该 proof只证明 Proposal冻结的 resolver wiring可执行，不是正式 Change Verification；Apply后仍必须由 formal selected verification实际执行真实 G1 integration target。
