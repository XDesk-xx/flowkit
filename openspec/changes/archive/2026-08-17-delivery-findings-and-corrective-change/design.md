## Context

A1 已冻结并实现：Delivery Full Test 只有 genuine structured Verification protocol 才能发布 `passed|failed + resultRef`；`failed` 当前保持 current terminal result 并由 Policy fail-closed 为 `full-test-failed`。02/A1 已有 ordinary `createChange`、Owner `create-change` provenance、Change activation/lifecycle、Checkpoint recognition 与 fresh Owner Full Test authorization。

020 Explore 已用 disposable fresh-process proof证明两个关键约束：

1. `failed→not-ready` 后 current terminal result 必须退出 current authority，但 exact failed Verification result仍必须 durable/resolvable，Finding不能只剩 opaque hash；
2. B1 reader/writer 是 repository-global semantics，必须从 pre-B1 bounded read 经 B1 checkpoint 激活后，在 later/future Delivery fresh process 中保持同一解释。

## Goals / Non-Goals

**Goals:**
- 保留 Verification result、Delivery Finding、Owner decision 三个 authority 边界；
- 用一个 existing `create change` Owner operation原子消费 current failure并创建 ordinary corrective Change；
- 保证 pre-B1 Manifest bounded read、post-B1 fresh-process recovery、repeat failure cycles与 fresh authorization；
- 在 Proposal 阶段冻结完整 bounded mutation surface 与 formal Verification physical closure。

**Non-Goals:**
- generic Finding/Evidence/history platform；
- 新 `authorize-corrective-change` Owner state machine；
- corrective-specific Action/Run/NNN；
- automatic Change creation/activation/Full Test retry；
- 修改 A1 Full Test physical execution/protocol/process-tree contract；
- F1 Finalize、C1 external tool、architecture lifecycle。

## Decisions

### 1. Current Finding 纯派生，但 identity 必须绑定 Full Test occurrence 而不是只绑定 result content

Current raw `failed` 已经有 durable current Verification result，因此 B1 不在 Full Test executor 中复制第二份 Finding truth。A1 每次进入 executable Full Test 前都必须有一个 delivery-scoped `authorize-full-test` Owner decision record；Owner records在 Manifest 中 append-only，且该 decision只有 current readiness gate才能写入。因此 **latest applicable `authorize-full-test` ref** 是现成、bounded、无需新增 ledger 的 Full Test cycle anchor。

Reader 从 current result + current authorization fact确定性派生：

```text
sourceResultRef = verification:full-test:<result-sha256>
authorizationRef = owner:<current-full-test-authorization-sha256>

occurrence payload (exact field order):
{"schemaVersion":1,"deliveryId":<delivery-id>,"authorizationRef":<owner-ref>,"sourceResultRef":<verification-ref>}

findingId = full-test-failure:<sha256(UTF-8 compact JSON payload)>
severity = blocking
summary = current result.summary
affectedScope = delivery
requiredOwnerDecision = corrective-change-or-cancel-delivery
```

Canonical hash encoding与 A1 resultRef一样要求 deterministic bytes：单行 JSON、上述 field order、无 whitespace、无 trailing newline、SHA-256 lowercase hex。`sourceResultRef` 仍是 Verification content identity；`authorizationRef/findingId` 只表示“哪一次 Owner-authorized Full Test failure occurrence”。

这直接覆盖 023 Reviewer counterfactual：两轮 Full Test 可以产生 byte-identical structured failed result，因此 `sourceResultRef` 相同；但两轮必须由两个不同 `authorize-full-test` Owner fact进入 `authorized`，所以 `authorizationRef` 不同，`findingId` 也不同。第一轮 resolution不会让第二轮看起来已经 resolved。

Owner 尚未作 corrective decision 时不写 `delivery.fullTestFindings[]`。Current Finding仍完全可以从 primary Verification result + existing Owner authorization fact重建。

**Rejected:** `findingId=full-test-failure:<result sha256>`。它把 Verification content identity误当成 occurrence identity，无法表示 repeated identical failure cycles。

**Rejected:** 新 attempt counter / failure sequence / Full Test generation ledger。已有 Owner authorization ref足以区分 cycle，不增加第二套 Full Test authority。

### 2. `failureHistory[]` 是 Full-Test-specific content-addressed retained-result set，不是 occurrence ledger

Corrective admission 必须清除 current `verification.fullTest.result` 才能让 raw status回到 non-terminal `not-ready`。在清除前必须确保 exact failed terminal object存在于：

```yaml
verification:
  fullTest:
    failureHistory:
      - schemaVersion: 1
        status: failed
        summary: "..."
        totalDurationMs: 123
        checks: [...]
        resultRef: verification:full-test:<sha256>
```

该数组按 `resultRef` content identity去重：每个 `resultRef` 最多一份 exact result；若同一 payload在后续 cycle再次失败，Writer exact validate现有 retained entity并 reuse，不 append duplicate。每项继续使用 A1 canonical hash规则独立验证，且只允许 `failed`。不存 raw logs/process output/passed results/attempt history。

因此：

```text
Verification content R
← Finding occurrence F1 (authorization A1)
← Finding occurrence F2 (authorization A2)
```

是合法的；`failureHistory[]` 不是 failure occurrence ledger。

**Rejected:** 只保存 `sourceResultRef` hash。Fresh process无法解析 hash背后的 Verification authority，019 Reviewer已明确否定。

### 3. historical `delivery.fullTestFindings[]` 保存 bounded occurrence-resolved provenance

Corrective admission 同时 append：

```yaml
delivery:
  fullTestFindings:
    - schemaVersion: 1
      findingId: full-test-failure:<occurrence-sha256>
      authorizationRef: owner:<sha256>
      sourceResultRef: verification:full-test:<sha256>
      severity: blocking
      summary: "..."
      affectedScope: delivery
      requiredOwnerDecision: corrective-change-or-cancel-delivery
      resolution:
        kind: corrective-change-created
        changeId: <new-change-id>
        ownerDecisionRef: owner:<sha256>
```

这个数组不是“current blockers list”。它只保留每次 Full Test failure→corrective Change 的 point-in-time occurrence projection；current blocker仍由 raw `failed + current result + latest current authorization`决定。

Reader必须：
- `authorizationRef` resolve 到 current Delivery 的合法 delivery-scoped `authorize-full-test` Owner record；
- `sourceResultRef` resolve 到 `failureHistory[]` exact retained result；
- 按 frozen tuple独立重算 `findingId`；
- `findingId` 与 `authorizationRef` occurrence identity均不得重复；
- `summary` MUST exact equal retained result `summary`；
- resolution refs解析到 current Delivery Change + matching ordinary `create-change` Owner record。

Writer不接受 caller-authored `summary`；它只能从 verified source result派生。这样 Finding的 durable human projection无法与 Verification authority漂移。多个不同 occurrence可以合法共享同一 `sourceResultRef`。

**Rejected:** generic `.flowkit/findings` / Evidence store。没有当前需求，也会复制 Verification/Owner authority。

### 4. 复用 `flowkit create change`，以 optional `corrective` object 区分 bounded correction admission

Input spelling冻结为：

```json
{
  "key": "Q1",
  "id": "correct-full-test-failure",
  "goal": "...",
  "required": true,
  "dependsOn": ["..."],
  "outputs": ["..."],
  "architectureImpact": false,
  "corrective": {
    "findingId": "full-test-failure:<occurrence-sha256>",
    "authorizationRef": "owner:<sha256>",
    "sourceResultRef": "verification:full-test:<sha256>"
  }
}
```

规则：
- `full-test-failed` boundary：`corrective` 必填，closed object只含 `findingId/authorizationRef/sourceResultRef`，三者 exact match current derived Finding occurrence，且 `required=true`；
- 非 failed boundary：`corrective` 禁止；普通 create contract不变；
- no extra Owner authorization record：operation继续产生 existing `decision=create-change` record；
- no auto activate：成功后只形成 ordinary `planned` Change。

这样“Owner 创建 corrective Change”本身就是决定事实，不再增加 `authorize-corrective-change → create-change` 双阶段。

### 5. Corrective admission 是一个 Manifest atomic transaction

在任何 bytes publish 前完成：snapshot conflict-free、current Policy=`full-test-failed`、current result hash valid、derived finding exact、new Change graph/input valid、B1 optional sections closed-schema valid。

一次 atomic replace 同时：

```text
append new ordinary required planned Change
append ordinary create-change Owner record
ensure exact current failed result → failureHistory[]（absent 则 append；same resultRef already retained 则 exact validate + reuse）
append current occurrence resolved finding provenance → fullTestFindings[]（derived summary exact equals source result.summary）
remove current verification.fullTest.result
failed → not-ready
```

任何 mismatch/duplicate/parse/publish failure都不得产生 partial durable state。

### 6. Fresh authorization 不另做 invalidation ledger

A1 readiness已经由 current candidate facts计算。Correction admission 后有 new required planned Change，因此 `not-ready` 不会提前 ready；corrective completed + checkpoint 后，pure readiness变成 `awaiting-user-decision`。Existing old `authorize-full-test` records保留为历史 Owner facts，但 A1 write-side仍要求一次新的 current gate record才能把 raw status重新写成 `authorized`。

不增加 authorization generation/consumption ledger。

### 7. Migration/activation 是 optional-field compatibility + B1 checkpoint boundary

- B1 Apply 前/Detached：current canonical implementation仍是 Base `55622af...`；
- pre-B1 Manifest没有 `failureHistory/fullTestFindings` → Reader解释 empty；不 rewrite；
- B1 candidate在 detached环境验证；
- 只有 B1 archive + Owner-authorized Change Checkpoint后，新 repository-global reader/writer semantics成为 canonical；
- C1–H1 与 future Delivery fresh process只从 repository facts重建，不依赖聊天/session；
- no migration framework/version registry。

### 8. Verification Closure 必须覆盖真实 write/read route

Apply 必须至少证明：

```text
A1 genuine failed result
→ FormalFactReader derives current finding
→ Policy full-test-failed carries exact binding
→ public flowkit create change --input corrective...
→ A1/B1 shared write-side validates exact current result/finding
→ one atomic Manifest publish
→ fresh process reads failureHistory/finding provenance
→ ordinary activation/lifecycle/checkpoint
→ awaiting-user-decision
→ fresh Owner authorize-full-test required
```

Formal Change Verification 必须实际执行对应 integration/unit targets。至少需要 counterfactual：
- stale/wrong `authorizationRef` 或 `sourceResultRef` 时 formal selected test必须失败；
- createChange-only without B1 admission不得被当作 consumed；
- 如果 atomic writer只 reset status却不retain exact result，fresh-reader regression必须失败；
- two Full Test cycles with byte-identical failed payload仍产生两个 distinct Finding occurrence并可分别 resolve；
- persisted historical Finding `summary` 与 retained result.summary漂移时 fresh Reader fail closed；
- future Delivery id/change graph下同一路径仍成立。

## Risks / Trade-offs

- **[Repeated identical failures]** → `failureHistory[]`按 content `resultRef`去重；occurrence uniqueness来自 existing `authorize-full-test` Owner ref，不增加 attempt ledger。
- **[Finding fields copy summary]** → summary仅 human projection；Writer从 source result派生，Reader要求 exact equality；sourceResultRef/hash/result仍是 authority。
- **[Existing create change surface becomes context-sensitive]** → 仅在 `full-test-failed` 时要求 exact corrective object；其它 boundary明确拒绝 corrective marker，普通 create semantics不变。
- **[Optional-field parser drift]** → pre-B1 absence=empty；post-B1 closed schema + dangling ref fail-closed；future-Delivery fresh-process regression必须覆盖。

## Migration Plan

1. Apply 只新增 optional B1 read/write contract与 corrective create route，不对当前 03 Manifest做数据 backfill。
2. 在 disposable pre-B1 fixture验证 old Manifest read；在 post-B1 fixture验证 correction admission + fresh read。
3. B1 archive 后由 Owner 单独授权 Change Checkpoint；Checkpoint之前 detached candidate不成为 canonical activation authority。
4. Checkpoint后 C1及 future Delivery使用同一 reader/writer；发现 malformed new fields时 fail closed，不自动 repair/rewrite。

## flowkitMutationScope

```json
{
  "schemaVersion": 1,
  "actions": {
    "apply": {
      "selectors": [
        {"kind":"exact","path":"openspec/changes/delivery-findings-and-corrective-change/tasks.md"},
        {"kind":"exact","path":"openspec/changes/delivery-findings-and-corrective-change/verification.md"},
        {"kind":"exact","path":"src/cli/main.ts"},
        {"kind":"prefix","path":"src/diagnostics"},
        {"kind":"exact","path":"src/domain/a1-types.ts"},
        {"kind":"exact","path":"src/domain/full-test.ts"},
        {"kind":"exact","path":"src/domain/types.ts"},
        {"kind":"exact","path":"src/facts/formal-fact-reader.ts"},
        {"kind":"exact","path":"src/facts/formal-fact-snapshot.ts"},
        {"kind":"exact","path":"src/persistence/delivery-manifest-document.ts"},
        {"kind":"prefix","path":"src/policy"},
        {"kind":"exact","path":"src/services/a1-write-service.ts"},
        {"kind":"prefix","path":"src/verification/change-selection"},
        {"kind":"prefix","path":"tests/fixtures/b1-delivery-findings-and-corrective-change"},
        {"kind":"exact","path":"tests/integration/a1-delivery-readiness-and-full-test-behavior.test.ts"},
        {"kind":"exact","path":"tests/integration/b1-delivery-findings-and-corrective-change.test.ts"},
        {"kind":"exact","path":"tests/integration/diagnostic-cli-process.test.ts"},
        {"kind":"exact","path":"tests/integration/diagnostic-cli.test.ts"},
        {"kind":"prefix","path":"tests/unit/cli"},
        {"kind":"prefix","path":"tests/unit/diagnostics"},
        {"kind":"prefix","path":"tests/unit/domain"},
        {"kind":"prefix","path":"tests/unit/facts"},
        {"kind":"prefix","path":"tests/unit/persistence"},
        {"kind":"prefix","path":"tests/unit/policy"},
        {"kind":"prefix","path":"tests/unit/services"},
        {"kind":"prefix","path":"tests/unit/verification"}
      ]
    },
    "revise-apply": {
      "selectors": [
        {"kind":"exact","path":"openspec/changes/delivery-findings-and-corrective-change/tasks.md"},
        {"kind":"exact","path":"openspec/changes/delivery-findings-and-corrective-change/verification.md"},
        {"kind":"exact","path":"src/cli/main.ts"},
        {"kind":"prefix","path":"src/diagnostics"},
        {"kind":"exact","path":"src/domain/a1-types.ts"},
        {"kind":"exact","path":"src/domain/full-test.ts"},
        {"kind":"exact","path":"src/domain/types.ts"},
        {"kind":"exact","path":"src/facts/formal-fact-reader.ts"},
        {"kind":"exact","path":"src/facts/formal-fact-snapshot.ts"},
        {"kind":"exact","path":"src/persistence/delivery-manifest-document.ts"},
        {"kind":"prefix","path":"src/policy"},
        {"kind":"exact","path":"src/services/a1-write-service.ts"},
        {"kind":"prefix","path":"src/verification/change-selection"},
        {"kind":"prefix","path":"tests/fixtures/b1-delivery-findings-and-corrective-change"},
        {"kind":"exact","path":"tests/integration/a1-delivery-readiness-and-full-test-behavior.test.ts"},
        {"kind":"exact","path":"tests/integration/b1-delivery-findings-and-corrective-change.test.ts"},
        {"kind":"exact","path":"tests/integration/diagnostic-cli-process.test.ts"},
        {"kind":"exact","path":"tests/integration/diagnostic-cli.test.ts"},
        {"kind":"prefix","path":"tests/unit/cli"},
        {"kind":"prefix","path":"tests/unit/diagnostics"},
        {"kind":"prefix","path":"tests/unit/domain"},
        {"kind":"prefix","path":"tests/unit/facts"},
        {"kind":"prefix","path":"tests/unit/persistence"},
        {"kind":"prefix","path":"tests/unit/policy"},
        {"kind":"prefix","path":"tests/unit/services"},
        {"kind":"prefix","path":"tests/unit/verification"}
      ]
    }
  }
}
```

## Open Questions

无。会改变 specs、authority shape、write-side route 或 mutation surface 的决定已在 Proposal 冻结；Apply 只实现并验证该 contract。
