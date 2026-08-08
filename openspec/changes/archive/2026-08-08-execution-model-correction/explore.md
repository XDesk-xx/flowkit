# Q1 Explore：执行模型修正

## 1. 基本信息

- Delivery：`20260806-01-deterministic-core`
- Change Key：`Q1`
- Change ID：`execution-model-correction`
- Action：`explore`
- 当前结果：等待 `review-explore`
- 参考文档：`ref/01-deterministic-core-delivery-implementation-reference.md`（owner 提供的重规划参考，非正式产物，gitignored）
- 基线 Commit：`aceaf18`（D1 Change Checkpoint）

## 2. 已冻结输入

### 2.1 A1–D1 已完成且不可重新打开

```text
A1-runtime-foundation                         completed + checkpointed (b4f807f)
B1-domain-and-state-schema                    completed + checkpointed (180f161)
C1-formal-fact-reader-and-persistence         completed + checkpointed (632805c)
D1-policy-engine                              completed + checkpointed (aceaf18)
```

Q1 是在 D1 Checkpoint 之后的 corrective Change，MUST NOT 重新打开 A1–D1 的历史状态或修改其 terminal Runs。Q1 通过 delta specs / docs / code 修正横切执行模型问题。

### 2.2 技术基线继续冻结

```text
TypeScript + Node.js ESM
手写生产源码和测试源码使用 .ts
运行与发布使用 dist/**/*.js
不新增手写 .mjs
```

### 2.3 冻结 specs（Q1 只读引用，仅在存在直接冲突时通过 delta 修正）

| 冻结 spec | 权威内容 | Q1 关系 |
|---|---|---|
| `openspec/specs/flowkit-domain-and-state-schema/spec.md`（B1）| Run 领域类型、RunStatus、terminal immutability | 只读；若 Run schema 需扩展则通过 delta |
| `openspec/specs/flowkit-formal-fact-reader-and-persistence/spec.md`（C1）| Run persistence、ResultRef、serialization | 主要修正目标；通过 delta 修正 |
| `openspec/specs/flowkit-policy-engine/spec.md`（D1）| canRun / next / diagnose | 只读；Q1 MUST NOT 重写 Policy 业务规则 |

### 2.4 Q1 范围冻结

Q1 只修正执行模型横切问题，不实现：

```text
完整 Change 执行循环
自动 review / revise 循环
两个 AI 自动交互
Delivery Finalize
Archify / CodeGraph 集成
Gate / Provider / Skill Registry
```

## 3. 问题分析（当前执行模型代码调查）

以下基于 A1–D1 实际代码的调查，每条附文件与行号引用。

### 3.1 Run result.json 实际承载远超 Core 正式 schema

C1 `RunResultFile`（[serialization.ts:75-85](file:///D:/Projects/flowkit/src/persistence/serialization.ts#L75-L85)）的正式物理 schema 是精简的：

```text
runStatus: completed | failed | cancelled
actionResult?: ActionResultWithoutRunRef  // action, executionStatus, summary, *ResultRefs
failureDiagnosis?: string
cancellationReason?: string
reviewVerdict?: approved | changes-requested
```

但 D1 开发过程中 Agent 实际写入的 `result.json` 携带了远超此 schema 的自由文本字段，且 Core 验证器只检查已知字段、对额外字段透传（lenient validation，[serialization.ts:356-414](file:///D:/Projects/flowkit/src/persistence/serialization.ts#L356-L414)）：

| 实际 result.json 字段 | 是否在 RunResultFile schema | 谁拥有 | 问题 |
|---|---|---|---|
| `runStatus` | 是 | Core 验证 | 正确 |
| `actionResult.executionStatus` | 是 | Core 验证 | 正确 |
| `reviewVerdict` | 是 | Core 验证 | 正确 |
| `verdict`（096-review-apply）| 否 | Agent 自由文本 | 与 `reviewVerdict` 语义重叠 |
| `blockingFindings[]` / `nonBlockingFindings[]` / `resolvedFindings[]` | 否 | Reviewer 事实 | Agent 手写，Core 不验证 |
| `verification[]` | 否 | 项目验证工具 | Agent 手写，Core 不验证 |
| `policyRoute` / `commitPolicy` / `nextAction` | 否 | Agent 推理 | Agent 手写，Core 不验证 |
| `archiveResults` / `manifestUpdate` / `verificationResults` | 否 | Agent 自由文本 | Agent 手写，Core 不验证 |
| `consistencyScan`（revise-explore Runs）| 否 | Agent 手写 | 大规模手工维护 |

**结论**：Run 的正式 schema 已精简，但实际产物中 Agent 自由文本占主导。Agent 大量时间花在手工维护 `findings` / `verification` / `consistencyScan` / `policyRoute` 等 Core 不验证的字段，而非推进 Change。

### 3.2 ResultRef fingerprint 由 Agent 手工维护

Core 已有机器派生 fingerprint 的全部能力（[result-ref-adapter.ts:34-85](file:///D:/Projects/flowkit/src/persistence/result-ref-adapter.ts#L34-L85)）：

```typescript
computeResultFileHash(fileContent)   // SHA-256 of result.json content
buildRunResultRef(runPath, fileContent)  // constructs ResultRef with fingerprint
verifyResultRef(ref, actualFileContent)  // replacement detection
```

但当前 `createRun`（[run-persistence.ts:84-146](file:///D:/Projects/flowkit/src/persistence/run-persistence.ts#L84-L146)）中 `inputRef` 来自 `CreateRunInput.inputRef`——由调用方（Agent）完整提供，包含手写的 `versionFingerprint`。Core 只验证 `inputRef` 是合法 `ResultRef` 对象（有 `ref` + `versionFingerprint` 字符串），**不验证 fingerprint 是否匹配被引用 Run 的实际 result.json 内容**。

实际证据：097-archive 的 `context.json` 中 `inputRef` 由 Agent 手工计算 096-review-apply `result.json` 的 SHA-256 写入。如果 Agent 计算错误或被引用文件被替换，Core 不会在 `createRun` 时发现。

**结论**：所有 ResultRef 类别（`inputRef` / `consumedInputRefs` / `producedResultRefs` / `verificationSummaryRef` / `reviewVerdictRef`）的 `versionFingerprint` 应由 Core 从被引用目标的实际内容派生（构造 ResultRef），而非依赖 Agent 手写；`writeRunResult` preflight 重新验证所有 Core-created references（ref/01 section 6.5：生产路径禁止 Agent 手写 versionFingerprint，UNIVERSAL）。

### 3.3 无 Run completion preflight

`writeRunResult`（[run-persistence.ts:207-275](file:///D:/Projects/flowkit/src/persistence/run-persistence.ts#L207-L275)）在发布 terminal result.json 前执行：

```text
1. 读取 context.json → 验证 schema + identity
2. 重建当前 persisted Run status
3. assertMutable（拒绝 terminal Run）
4. 验证 RunResultFile combination + actionResult projection
5. 验证 review verdict integrity
6. 序列化 → 写 temp → fs.link 原子发布
```

缺少的 preflight：

- 不验证 `inputRef.versionFingerprint` 是否匹配被引用 Run 的实际 result.json；
- 不从被消费的实际文件派生 `consumedInputRefs` / `producedResultRefs` 的 fingerprint；
- 不验证 `actionResult` 声明的 `consumedInputRefs` 是否真实存在。

**结论**：Completion preflight 应在发布前校验所有 ResultRef fingerprint 一致性（`inputRef` / `consumedInputRefs` / `producedResultRefs` / `verificationSummaryRef` / `reviewVerdictRef`）。失败时 result.json 不发布，Run 保持 pending。

### 3.4 terminal create-once 已正确且应保持

[terminal.ts](file:///D:/Projects/flowkit/src/domain/terminal.ts) + `writeRunResult` 的 `fs.link` create-if-not-exists（[run-persistence.ts:249-269](file:///D:/Projects/flowkit/src/persistence/run-persistence.ts#L249-L269)）形成 race-safe 的 terminal immutability：

- `assertMutable` 拒绝已 terminal 的 Run（单 writer fast path）；
- `fs.link` 的 EEXIST 拒绝并发 writer（race invariant）；
- `reconstructCurrentRun` 从实际 persisted result.json 读取 status，不信任 freshly projected pending Run（[run-persistence.ts:289-338](file:///D:/Projects/flowkit/src/persistence/run-persistence.ts#L289-L338)）。

**结论**：terminal create-once 机制正确、稳固，Q1 MUST NOT 放松。Q1 只在其上添加 preflight，不改变 terminal 语义。

### 3.5 FormalFactSnapshot 已精简

[formal-fact-snapshot.ts](file:///D:/Projects/flowkit/src/facts/formal-fact-snapshot.ts) 的 `RunFact`（L69-81）只暴露：

```text
runId, deliveryId, changeId?, action, role, status, inputRef?, resultRef?
```

Policy（D1）只消费这些精简字段 + `reviewVerdicts` + `conflicts`。Run 中的 `findings` / `verification` / `policyRoute` 等重字段**不进入 FormalFactSnapshot**，不影响 Policy 决策。

**结论**：FormalFactSnapshot 的 authority boundary 已正确。问题不在 Policy 侧，而在 Run 产物侧——Agent 手工维护的重字段不被 Core 验证也不被 Policy 消费，却消耗大量开发时间。

### 3.6 正式 artifact 路径已正确

所有 8 个已归档 Change（2026-08-05-bootstrap-and-roadmap … 2026-08-07-policy-engine）均在 `openspec/changes/<change-id>/explore.md` 携带 Git-tracked explore.md，经 `git ls-files` 确认。`.tmp/` 列于 `.gitignore` 且 `docs/delivery-lifecycle.md` 标记为不可恢复。

**结论**：正式 artifact 路径约定已正确。Q1 只需在 canonical docs 中显式冻结此约定，消除 Skill 文本与 Flowkit Action 之间的历史混淆。

### 3.7 Verification 分层缺失

当前 `package.json` 只有 `npm test`（全量 424 tests）。没有：

```text
npm run test:focused   # 局部修复
npm run test:affected  # apply / revise-apply
npm run test:full      # Delivery Full Test
npm run verify:change  # Change Verification 适用检查
```

D1 实际开发中，每次 `revise-apply` 都执行全量 424 tests，违背 `docs/verification-model.md` Section 3.4 的 focused/affected 分层意图。

**结论**：Q1 只冻结 verification 分层原则。Concrete scripts 和完整自动测试调度器属 F1（ref/01 section 8.3）。

## 4. Q1 推荐方案

### 4.1 Lean Run contract：closed Core-validated allowlist

Run result.json 是 closed schema：只有以下 Core-validated 字段允许，未知字段被 Core 拒绝（不透传、不持久化）。Run 是执行信封，不复制完整 Findings / Verification / archive 事实（ref/01 section 2.1、6.3）。不区分 formal authority 与 unvalidated envelope 两层——只有一个 closed allowlist。

**RunResultFile / ActionResult allowlist（Core 验证，Policy 消费）**：

```text
runStatus                              // completed | failed | cancelled
actionResult.action                    // formal Action
actionResult.executionStatus           // completed | failed | blocked
actionResult.summary                   // 非空，Core 验证格式
actionResult.producedResultRefs        // Core 派生（caller 提供目标描述符，Core 计算 SHA-256 并构造）
actionResult.consumedInputRefs         // Core 派生（同上）
actionResult.verificationSummaryRef    // Core 派生 → verification.md（Change-owned）
actionResult.reviewVerdictRef          // Core 派生 → review Run result.json（仅非 review Run；review-* Run 不携带，避免自引用）
actionResult.failureDiagnosis          // typed string，失败诊断
actionResult.nextActionRecommendation  // typed string，交接提示
reviewVerdict                          // approved | changes-requested（review-* Run 专用）
reviewFindings                         // typed formal payload（review-* Run 专用；reviewer 正式 findings，Core 验证 typed schema）
```

**所有 ResultRef 类别 Core 派生（ref/01 section 6.5：UNIVERSAL）**：

Callers provide typed target descriptors, NEVER versionFingerprint. Core resolves, computes SHA-256, constructs ResultRef via the appropriate constructor, verifies before terminal publication.

**两个 ResultRef 构造器**：

```text
buildRunResultRef(runPath, fileContent)          ← 现有，保留
  → ref: <runPath>/result.json（normalized）
  → kind: run-result
  → 用于: context.inputRef、consumedInputRefs、reviewVerdictRef（target IS Run result.json）

buildArtifactResultRef(repoRelPath, fileContent, kind)  ← NEW
  → ref: repoRelPath（normalized，不追加 result.json）
  → kind: Core 内部 validated enum（produced-artifact | verification-summary），由 result field 决定，caller 不选择
  → 用于: producedResultRefs（kind=produced-artifact）、verificationSummaryRef（kind=verification-summary）
  → traversal rejection: 不允许 .. 或绝对路径出 repo
  → result.json target rejection: ref 不允许以 /result.json 结尾
```

**Core-owned field→kind→path mapping（caller 不选择 kind，不提供 path）**：

```text
field: context.inputRef / consumedInputRefs / reviewVerdictRef
  → kind: run-result
  → path: .flowkit/runs/<delivery>/<change>/<run-id>/result.json
  → resolver: Core 从 runId 派生

field: verificationSummaryRef
  → kind: verification-summary（Core-assigned）
  → path: openspec/changes/<context.changeId>/verification.md（Run-stable，用 Run 自己的 immutable context.changeId，不随 active Change 变化）
  → resolver: Core 从 context.changeId 派生（context.changeId 在 createRun 时持久化，immutable）
  → inclusion: Action-owned rule（见下）

field: producedResultRefs
  → kind: produced-artifact（Core-assigned）
  → path: Core-owned Action+tag→path mapping（见下），caller 只提供 tag
  → resolver: Core 从 Action + tag 派生

Core-owned produced-artifact tag→path mapping（per Action）：
  explore / revise-explore:
    'explore' → openspec/changes/<change-id>/explore.md
  propose / revise-propose:
    'proposal' → openspec/changes/<change-id>/proposal.md
    'design'   → openspec/changes/<change-id>/design.md
    'specs'    → openspec/changes/<change-id>/specs/**（Core enumerates files）
    'tasks'    → openspec/changes/<change-id>/tasks.md
  apply / revise-apply / review-* / archive:
    （无 producedResultRefs — code 由 Git 跟踪；reviewFindings 是 typed payload；archive manifest 独立）

Reject: tag 不在该 Action permitted set、traversal、绝对路径、result.json target、kind/field mismatch
```

**verificationSummaryRef inclusion lifecycle（Action-owned，无 caller descriptor）**：

```text
verification-eligible Actions: review-apply only
  → lifecycle: apply/revise-apply → Change Verification → review-apply（verification-model.md:63-73）
  → Change Verification 在 apply/revise-apply 后执行，review-apply 前 verification.md 已存在
  → Core attempts to resolve openspec/changes/<context.changeId>/verification.md
  → exists + readable → Core reads → SHA-256 → buildArtifactResultRef(kind=verification-summary) → include
  → absent/unreadable → RESULT_REF_TARGET_MISSING, Run 保持 pending（review-apply 不能在缺 verification record 时完成）

non-eligible Actions: explore, propose, apply, revise-apply, revise-explore, revise-propose, review-explore, review-propose, archive
  → verificationSummaryRef absent（Core 不 attempt）
  → apply/revise-apply: Change Verification 在其后执行，preflight 时 verification.md 不存在（deadlock 避免）
  → archive: relocates Change artifacts to archive path，openspec/changes/<change-id>/verification.md 路径不稳定

Reader (historical read, Run-stable):
  → 用 Run 自己的 context.changeId 解析 path（不依赖当前 active Change）
  → 历史 Q1 Run 在 E1 active 后仍指向 Q1 的 verification.md
  → preflight 重新读取 → 重算 SHA-256 → 比较（replacement detection）
```

同一 resolver + validation 用于 createRun / writeRunResult preflight / Reader（C1 delta spec 收紧 `validateResultRefProjection`：kind 必须在 enum 内；field-specific validator 强制 field→kind binding；ref 按 kind 验证 path root）。verificationSummaryRef 用 Run 的 context.changeId（不用 active Change），历史 Run 读回时仍指向原 Change 的 verification.md。

**Per-category derivation**：

```text
context.inputRef（非 review-* Run，optional）
  → target: consumed Run result.json
  → descriptor: consumedRunId
  → Core at createRun: resolve → 读取 → SHA-256 → buildRunResultRef → 写入 context.json

context.inputRef（review-* Run，REQUIRED — Q1-RE-003 exact content binding）
  → target: reviewedRunId 的 result.json
  → descriptor: reviewedRunId（C1 已 required）
  → Core at createRun: resolve reviewedRunId → 读取 result.json → SHA-256 → buildRunResultRef → 写入 context.json
  → inputRef.ref MUST equal reviewedRunId's result.json path
  → reviewed result.json 缺失/不可读 → createRun 失败

actionResult.consumedInputRefs
  → target: consumed Runs result.json
  → descriptor: consumedRunId[]
  → Core at writeRunResult: 读取每个 → SHA-256 → buildRunResultRef

actionResult.producedResultRefs
  → target: Run 产出 artifact 文件（≠ result.json，后者由 runRef 在读取时派生）
  → descriptor: producedArtifactTag[]（Core-owned enum per Action，caller 只提供 tag，不提供 path、不选择 kind）
  → Core at writeRunResult: tag → path（Core-owned Action+tag mapping）→ 读取 → SHA-256 → buildArtifactResultRef(kind=produced-artifact)
  → Core assigns kind=produced-artifact internally（由 field 决定，caller 不选择）
  → tag 不在该 Action permitted set → 拒绝
  → Run 无单独产出时 absent

actionResult.verificationSummaryRef
  → target: openspec/changes/<context.changeId>/verification.md（Run-stable，用 Run 自己的 immutable context.changeId）
  → descriptor: 无（Core 从 context.changeId 派生 path，caller 不提供 path、不选择 kind）
  → inclusion: Action-owned rule（verification-eligible: review-apply only；apply/revise-apply/archive non-eligible: absent）
  → Core at writeRunResult preflight: resolve context.changeId → path → 读取 → SHA-256 → buildArtifactResultRef(kind=verification-summary)
  → Core assigns kind=verification-summary internally（由 field 决定，caller 不选择）
  → eligible Action + verification.md absent/unreadable → RESULT_REF_TARGET_MISSING, Run 保持 pending
  → non-eligible Action → verificationSummaryRef absent

actionResult.reviewVerdictRef（仅非 review Run）
  → target: review Run result.json
  → descriptor: reviewRunId
  → Core at writeRunResult: resolve → 读取 → SHA-256 → buildRunResultRef
  → review-* Run 不携带（避免自引用 hash）
  → review Run result.json lifecycle: terminal create-once（不可变）；retention: Git-tracked
```

**Reviewer formal artifact（review-* Run 专用）**：

review-* Run 的 result.json 直接携带 typed formal payload（非 ResultRef，无 hash 计算，无自引用）：

```text
reviewVerdict   // approved | changes-requested（formal verdict value）
reviewFindings  // typed formal payload（reviewer 正式 findings；Core 验证 typed schema；C1 delta spec 定义字段结构）
```

reviewer 是 authority（ref/01 section 2.1：Reviewer Findings / Verdict 由 Reviewer 正式结果拥有）。review-* Run 的 result.json 是 reviewer 正式产物，非 Run 复制。非 review Run 不携带 `reviewFindings`，通过 `reviewVerdictRef` 引用 review Run 的 result.json。

**review-* Run exact content binding（Q1-RE-003）**：

review-* Run 的 `context.inputRef` 是 REQUIRED（不再 optional），MUST resolve 到 `context.reviewedRunId` 的 result.json：

```text
createRun:
  → Core resolve reviewedRunId → result.json path
  → Core 读取 → SHA-256 → buildRunResultRef → 写入 context.inputRef
  → inputRef.ref MUST equal reviewedRunId's result.json path
  → reviewed result.json 缺失/不可读 → createRun 失败

writeRunResult preflight:
  → 重新读取 reviewedRunId 的 result.json → 重算 SHA-256
  → 与 context.inputRef.versionFingerprint 比较
  → mismatch → RESULT_REF_MISMATCH, Run 保持 pending
  → preflight 通过 → reviewFindings payload 才被允许发布

Reader (fail-closed):
  → inputRef absent → FactConflict
  → inputRef.ref ≠ reviewedRunId's result.json path → FactConflict
  → reviewedRunId's result.json missing/unreadable → FactConflict
  → inputRef.versionFingerprint ≠ actual SHA-256 → FactConflict
```

reviewFindings payload 只在 reviewedResultRef binding 建立后才被添加到 result.json。

**Closed schema 行为与测试（C1 delta）**：

```text
未知字段 → Core 拒绝（不透传，不持久化）
完整 findings（非 reviewFindings typed schema）/ verification[] / archiveResults / manifestUpdate / consistencyScan
  → 不在 allowlist → Core 拒绝
caller-supplied versionFingerprint → Core 拒绝（所有 ResultRef 类别）
```

测试：
- allowlist 字段 round-trip 通过
- 未知字段（含完整 findings / verification[] / archive / consistencyScan）被 Core 拒绝
- caller-supplied versionFingerprint 被拒绝（所有 ResultRef 类别）
- 每个 ResultRef 类别：派生成功、目标缺失、替换/mismatch、pending preservation
- review-* Run 不携带 reviewVerdictRef（自引用检测）
- review-* Run 携带 reviewVerdict + reviewFindings（typed schema 验证）
- 非 review Run 通过 reviewVerdictRef 引用 review Run result.json

原则：

- Run 是执行信封，不是审计账本（ref/01 section 6.3）；
- RunResultFile 是 closed schema，未知字段被 Core 拒绝；
- 所有 ResultRef 的 versionFingerprint 由 Core 派生，caller 只提供目标描述符（ref/01 section 6.5）；
- review-* Run 不携带 reviewVerdictRef（避免自引用 hash）；reviewer formal findings 作为 typed payload 直接携带；
- 完整 Findings / Verification / archive 事实留在 owning artifact，Run 只持有 ResultRef 引用；
- `consistencyScan` 不作为 Run schema 字段；如需，由 Action/Reviewer 输出最小结果引用；
- 不建立第二套 evidence 子系统。

### 4.2 Core-derived ResultRef（全部类别）

生产路径禁止 Agent 手写 `versionFingerprint`（ref/01 section 6.5：UNIVERSAL，覆盖所有 ResultRef 类别）。所有 ResultRef 改为 Core-owned 派生：

```text
Caller 声明目标描述符（consumedRunId / producedArtifactTag / reviewRunId）— verificationSummaryRef 无 descriptor（Core 从 context.changeId 派生 + Action-owned inclusion rule）
→ Core 读取被引用目标的实际文件
→ Core 计算 SHA-256（computeResultFileHash）
→ Core 构造 ResultRef：
   - run-result target → buildRunResultRef(runPath, content)
   - non-Run artifact → buildArtifactResultRef(repoRelPath, content, kind)  ← NEW（kind 由 Core 按 field 决定：producedResultRefs→produced-artifact、verificationSummaryRef→verification-summary，caller 不选择）
→ context.inputRef 在 createRun 时写入 context.json
→ actionResult.*ResultRef 在 writeRunResult 时写入 result.json
→ 被引用目标缺失或不可读 → createRun / writeRunResult 失败
```

`buildArtifactResultRef`（NEW）接受 normalized repo-relative path + content + validated kind（Core 内部 enum，由 result field 决定：producedResultRefs→produced-artifact、verificationSummaryRef→verification-summary，caller 不选择），不追加 result.json，执行 traversal rejection（不允许 `..` 或绝对路径出 repo）+ result.json target rejection。`buildRunResultRef` 保留为 result.json 特化（kind=run-result）。同一 resolver + validation 用于 createRun / preflight / Reader（C1 delta 收紧 `validateResultRefProjection`：kind enum + field→kind binding + path root per kind）。

`CreateRunInput` 不再接受 caller-supplied `versionFingerprint`（任何 ResultRef 类别）。Caller 只提供 typed target descriptor；Core 在 `createRun`（inputRef）和 `writeRunResult`（actionResult.*ResultRef）内部构造并持久化所有 ResultRef。

**review-* Run inputRef binding（Q1-RE-003）**：review-* Run 的 inputRef 是 REQUIRED，MUST resolve 到 `context.reviewedRunId` 的 result.json。Core 在 createRun 时从 reviewedRunId 派生 inputRef（buildRunResultRef），在 writeRunResult preflight 时重新验证。reviewedRunId 的 result.json 缺失/替换 → createRun/preflight 失败。Reader fail-closed 当 binding absent/mismatched/unreadable/replaced。

### 4.3 Run completion preflight

`writeRunResult` 在现有步骤 4（validate combination）之后、步骤 6（写 temp）之前增加：

```text
4c. preflight：重新计算所有 ResultRef 引用目标的实际文件 SHA-256，
    与 Core 在 createRun / writeRunResult 时写入的 versionFingerprint 比较
    - context.inputRef → consumed Run result.json
      (review-* Run: MUST equal reviewedRunId's result.json — Q1-RE-003 binding)
    - actionResult.consumedInputRefs → each consumed Run result.json (buildRunResultRef)
    - actionResult.producedResultRefs → each artifact file (buildArtifactResultRef)
    - actionResult.verificationSummaryRef → openspec/changes/<context.changeId>/verification.md (buildArtifactResultRef, Run-stable; review-apply only; non-eligible → skip; review-apply+missing → RESULT_REF_TARGET_MISSING pending)
    - actionResult.reviewVerdictRef → review Run result.json（非 review Run, buildRunResultRef）
```

如果任何被引用目标在 Core 构造 ResultRef 之后被替换（fingerprint 不匹配）→ 抛 `RESULT_REF_MISMATCH`，result.json 不发布，Run 保持 pending。

preflight 使用与 createRun 相同的 Core-owned resolver（field→kind→path mapping）：重新解析 descriptor → path → 读取 → SHA-256 → 比较。Reader 同一 resolver + validation（kind enum + field→kind binding + path root per kind），fail-closed 当 kind/field mismatch、path outside mapping、traversal、绝对路径、result.json target。

review-* Run 的 `reviewFindings` payload 只在 preflight 通过（reviewedResultRef binding 验证成功）后才被允许写入 result.json。

Agent 修正输入后可再次尝试完成同一 Run（pending → completed）。

### 4.4 Formal artifact path 冻结

在 `docs/delivery-lifecycle.md` 显式冻结：

```text
openspec/changes/<change-id>/explore.md      ← 正式，Git-tracked
openspec/changes/<change-id>/proposal.md     ← 正式，Git-tracked
openspec/changes/<change-id>/design.md       ← 正式，Git-tracked
openspec/changes/<change-id>/specs/**        ← 正式，Git-tracked
openspec/changes/<change-id>/tasks.md        ← 正式，Git-tracked
openspec/changes/<change-id>/verification.md ← 正式，Git-tracked

.tmp/**                                      ← 临时计算，gitignored，不可恢复
```

禁止：把正式 explore / verification 事实只留在 `.tmp` 或聊天上下文。

### 4.5 Verification 分层原则

Q1 只冻结 verification 分层的 timing / ownership / no-unauthorized-Full-Test 原则。Concrete scripts（`test:focused` / `test:affected` / `test:full` / `verify:change`）的命令名、实现和 script-level 验收归 F1（ref/01 section 8.3）。

冻结 timing 规则：

```text
explore / propose          → 无代码变更，OpenSpec validation 即可
apply / revise-apply       → affected checks（focused + 依赖模块）+ typecheck + lint + build + openspec strict
review-apply / archive     → 不自动跑测试（消费已有 Verification）
Delivery Full Test         → 全量 Core suite（仅 owner authorized）
```

明确禁止：

```text
因为"更安全"就默认每轮跑全项目全部测试
Reviewer 要求无关 Full Test
revise-apply 自动触发 Delivery Full Test
```

### 4.6 Bootstrap legacy Run 有界兼容

不建立通用 completed Run editor。只允许当前 Bootstrap `schemaVersion:1` legacy Run 的有界兼容：

```text
仅 metadata 修正（不改 result.json / action / role / verdict / findings / 业务产物）
无下游消费冲突
owner 明确授权
Git 保存 before / after
```

该能力只为 Bootstrap 收尾，不成为长期产品接口。

## 5. Q1 需要检查/更新的正式内容

| 文件 | Q1 操作 | 说明 |
|---|---|---|
| `openspec/delivery-groups/20260806-01-deterministic-core.yaml` | 已更新 | Q1 已加入 manifest，E1 dependsOn 已调整 |
| `docs/core-model.md` | 检查 + 更新 | Run authority boundary、closed Core-validated allowlist |
| `docs/delivery-lifecycle.md` | 检查 + 更新 | Lean Run contract、artifact path、.tmp 边界、verification 分层 |
| `docs/verification-model.md` | 检查 + 更新 | focused/affected/full 分层、cost boundary |
| `docs/bootstrap-reference.md` | 检查 + 更新 | legacy Run 有界兼容、artifact path |
| `openspec/specs/flowkit-formal-fact-reader-and-persistence/spec.md`（C1）| delta 修正 | Run contract closed allowlist、所有 ResultRef 类别 Core 派生 + preflight 验证、completion preflight、reviewFindings typed formal schema、reviewVerdictRef 不自引用 |
| `openspec/specs/flowkit-domain-and-state-schema/spec.md`（B1）| 检查 | 仅存在直接冲突时通过 delta 修正 |
| `openspec/specs/flowkit-policy-engine/spec.md`（D1）| 检查 | 仅存在直接冲突时；MUST NOT 重写 Policy 业务规则 |
| `src/persistence/run-persistence.ts` | 修改 | createRun inputRef 派生（Core 构造 ResultRef）、review-* inputRef REQUIRED + bound to reviewedRunId、writeRunResult 所有 ResultRef 派生（Core-owned field→kind→path mapping：producedResultRefs 用 Action+tag、verificationSummaryRef 用 context.changeId + Action-owned inclusion rule）+ preflight 验证（同一 resolver，Run-stable） |
| `src/persistence/result-ref-adapter.ts` | 修改 | buildRunResultRef（保留，run-result 特化）+ buildArtifactResultRef（NEW，non-Run artifact，kind 为 Core 内部 enum 由 field 决定 caller 不选择）+ verifyResultRef（通用验证）+ Core-owned Action+tag→path resolver |
| `src/persistence/serialization.ts` | 修改 | closed allowlist：未知字段拒绝（从 lenient 改为 strict）；`validateResultRefProjection` 收紧：kind 必须在 enum（run-result / produced-artifact / verification-summary）内；field-specific validator 强制 field→kind binding；ref 按 kind 验证 path root（reject kind/field mismatch、tag/path outside mapping、traversal、绝对路径、result.json target） |
| `src/persistence/legacy-recognizer.ts` | 检查 | 有界兼容 |
| `src/domain/terminal.ts` | 保持 | terminal create-once 不变 |
| `AGENTS.md` | 检查 + 更新 | 如仍要求 Agent 手工维护过重 Run 信息则修正 |
| `tests/` | 新增 | 所有 ResultRef 类别派生 + preflight 验证（每类：成功/缺失/替换 mismatch/pending preservation）、buildArtifactResultRef（non-Run artifact：traversal rejection/result.json target rejection/kind 为 Core 内部 enum）、Core-owned field→kind→path mapping：verificationSummaryRef 用 context.changeId（Run-stable：valid/missing/replacement/historical read after another Change active）、Action-owned inclusion rule（review-apply eligible: valid summary / missing→pending; non-eligible: absent; lifecycle: first apply before verification→absent, revised apply before re-verification→absent, archive relocation→absent）、producedResultRefs Action+tag→path（valid tag/tag-not-in-permitted-set/replacement）、field→kind binding（reject kind/field mismatch）、path root per kind（reject traversal/绝对路径/result.json target）、review-* inputRef binding（valid/missing/mismatched ID/replacement/pending preservation）、closed schema 拒绝未知字段、caller-supplied versionFingerprint 拒绝、reviewFindings typed formal schema + gating（preflight 通过后才写入）、reviewVerdictRef 不自引用检测、legacy 兼容测试 |

## 6. Q1 不做的事

```text
不重新打开 A1–D1 的历史状态或 terminal Runs
不重写 D1 Policy 业务规则（canRun / next / diagnose 语义不变）
不实现完整 Change 执行循环
不实现自动 review / revise 循环
不建立通用 completed Run editor
不新增 Run 主状态（draft / finalizing / sealed / consumed）
不实现完整自动测试调度器（属 F1）
不引入 Gate / Provider / Skill Registry
```

## 7. 验收标准

```text
✓ Run 主要职责收敛为 Action 执行 / 交接 / resume
✓ RunResultFile closed allowlist 边界在 docs 和 code 中明确（未知字段被 Core 拒绝）
✓ 正式 Change facts 不复制到 Run formal authority 层
✓ 完整 Findings / Verification / archive 事实不在 closed allowlist 中，被 Core 拒绝；Run 只持有 ResultRef 引用
✓ explore.md 为正式 Git-tracked artifact（已在所有归档 Change 中确认）
✓ .tmp 不作为正式恢复依赖（在 docs 中显式冻结）
✓ 所有 ResultRef 类别 fingerprint 由 Core 派生（inputRef / consumedInputRefs / producedResultRefs / verificationSummaryRef / reviewVerdictRef），writeRunResult preflight 重新验证
✓ run-result target 用 buildRunResultRef；non-Run artifact（producedResultRefs / verificationSummaryRef）用 buildArtifactResultRef（Core-owned kind enum + Action+tag→path mapping + traversal rejection + result.json target rejection）；caller 不选择 kind、不提供 path
✓ Core-owned field→kind→path mapping：verificationSummaryRef 用 Run 的 context.changeId（Run-stable，不随 active Change 变化；Core assigns kind=verification-summary）+ Action-owned inclusion rule（eligible: review-apply only；non-eligible: absent；review-apply+missing: RESULT_REF_TARGET_MISSING pending；apply/revise-apply complete before Change Verification→absent；archive relocation→absent）；producedResultRefs 由 Action+tag 映射到 permitted roots（Core assigns kind=produced-artifact）；reject kind/field mismatch、tag-not-in-permitted-set、traversal、绝对路径、result.json target；同一 resolver 用于 createRun/preflight/Reader；历史 Run 读回仍指向原 Change 的 verification.md
✓ caller-supplied versionFingerprint 被拒绝（所有 ResultRef 类别）
✓ review-* Run 不携带 reviewVerdictRef（避免自引用 hash）；reviewer formal findings 作为 reviewFindings typed payload 直接携带
✓ review-* Run inputRef REQUIRED + bound to reviewedRunId 的 result.json（exact content binding）；Reader fail-closed 当 binding absent/mismatched/unreadable/replaced
✓ reviewFindings payload 只在 preflight 通过（reviewedResultRef binding 验证）后才写入
✓ completion preflight 失败时 Run 保持 pending
✓ terminal result 仍 create-once（不变）
✓ Review version binding 不放松（不变）
✓ 不存在通用 completed Run editor
✓ 不新增 Run 主状态
✓ Verification 分层原则进入 canonical docs
✓ focused / affected / full 边界已清晰冻结
✓ 后续 E1 不需要依赖大量人工 Run bookkeeping
```

## 8. 交叉引用契约

以下跨章节共享概念 MUST 在 Propose / Apply 中保持一致：

| 共享概念 | 出现位置 | 一致性要求 |
|---|---|---|
| Lean Run | Section 4.1、Section 5、Section 7、C1 delta spec | closed Core-validated allowlist；未知字段被 Core 拒绝；review-* Run 不携带 reviewVerdictRef（不自引用）；reviewFindings typed payload（preflight 通过后才写入）；不复制完整 Findings/Verification |
| ALL ResultRef fingerprint | Section 3.2、Section 4.1、Section 4.2、Section 4.3、Section 5、Section 7、C1 delta spec | 所有 ResultRef 类别 Core 派生：run-result 用 buildRunResultRef，non-Run artifact 用 buildArtifactResultRef（Core-owned kind enum + Action+tag→path mapping）；caller 不选择 kind、不提供 path；caller-supplied versionFingerprint 拒绝；preflight 验证；Reader 同一 resolver + validation |
| Core-owned kind/path mapping | Section 4.1、Section 4.2、Section 4.3、Section 5、Section 7、C1 delta spec | field→kind→path 由 Core 拥有：verificationSummaryRef 用 context.changeId（Run-stable，不随 active Change 变化）+ Action-owned inclusion rule（eligible: review-apply only; non-eligible: absent; review-apply+missing: pending; apply/revise-apply/archive non-eligible per lifecycle）；producedResultRefs 由 Action+tag 映射 permitted roots（Core assigns kind）；caller 只提供 tag；reject kind/field mismatch、tag-not-in-permitted-set、traversal、绝对路径、result.json target；同一 resolver 用于 createRun/preflight/Reader；历史 Run 读回仍指向原 Change 的 verification.md |
| review-* inputRef binding | Section 4.1、Section 4.2、Section 4.3、Section 5、Section 7、C1 delta spec | review-* Run inputRef REQUIRED + bound to reviewedRunId 的 result.json（exact content binding）；createRun 派生 + preflight 验证 + Reader fail-closed；reviewFindings 只在 binding 验证后写入 |
| terminal create-once | Section 3.4、Section 4.3、Section 6 | Q1 MUST NOT 改变 terminal 语义 |
| closed allowlist | Section 4.1、Section 5、Section 7、docs/delivery-lifecycle.md | RunResultFile 是 closed schema；未知字段（含完整 findings/verification/archive/consistencyScan）被 Core 拒绝；caller-supplied versionFingerprint 拒绝；Run 只持有 ResultRef 引用 |
| artifact path | Section 4.4、Section 5、docs/bootstrap-reference.md | explore.md 在 openspec/changes/<id>/，.tmp 不可恢复 |
| verification 分层 | Section 4.5、Section 7、docs/verification-model.md | focused/affected/full timing 规则一致 |
| 不重写 D1 | Section 2.3、Section 6、Section 7 | Policy canRun/next/diagnose 语义不变 |

## 9. 推荐主线

```text
Q1-explore（本 Run 098）
→ review-explore
→ [可能 revise-explore 循环]
→ propose
→ review-propose
→ [可能 revise-propose 循环]
→ apply
→ review-apply
→ [可能 revise-apply 循环]
→ archive
→ change-checkpoint
```

Q1 完成后激活 E1（diagnostic-cli），E1 建立在 Q1 修正后的 Lean Run 和 authority model 上。
