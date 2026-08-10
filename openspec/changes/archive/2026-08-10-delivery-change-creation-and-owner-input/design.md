## Context

见 `proposal.md`。当前 Core 已有 Delivery/Change types、Manifest Reader、pure Policy 与 single-file `atomicWriteFile`，但 write-side 仍由 Bootstrap 人工完成；`FormalFactReader.collectOwnerAuthorizations()` 为空投影，Run `ownerAuthorization` 只是执行上下文字符串。当前所有 source-controlled Delivery Manifest 的 dependency refs 均引用 Change `id`，而 `dependenciesMet()` 与部分 unit fixtures 仍按 `key` 解析。

A1 必须继续满足：无 Archify/OpenSpec/GitHub runtime dependency、无 Registry/DB/inbox、Policy 是唯一 lifecycle decision authority、Delivery Manifest 是 Delivery/Change lifecycle authority、Run 不是 Owner authority、Change activation 不是 Git boundary。

## Goals / Non-Goals

**Goals:**

- 给后续 Change 提供真实可调用的 Delivery/Change creation、Owner provenance 与 activation write-side。
- 用一个 source-controlled、checkout 可恢复的最小 Owner record contract 关闭 apply/archive 等既有 authorization placeholder。
- 统一 dependency canonical identity，确保真实 Manifest 与 Policy/tests 同语义。
- 在不引入通用 transaction engine 的情况下，让 activation partial failure 有界、可诊断、可重试。
- 让 existing Manifest mutation 不破坏 A1 不拥有的 Delivery contract 内容。

**Non-Goals:**

- 不实现 B1 Action Package/Result、C1 完整 OpenSpec adapter、D1 Finding convergence、E1 verification selection、F1 checkpoint executor、G1 complete runner CLI。
- 不实现 Owner authentication/signature、Decision DB、revocation workflow、generic approval inbox、event sourcing。
- 不自动创建 Run、Commit/Push/PR、Full Test、Finalize、Archify asset。
- 不让 detached ZIP 自己查询 GitHub checkpoint；Git boundary observation 仍属于 Git authority。

## Decisions

### 1. Dependency canonical identity 选择 `Change.id`

A1 冻结：`dependsOn` 永久表示同 Delivery 内被依赖 Change 的 `id`。

理由：

- 当前三个 source-controlled Delivery Manifest 的 dependency refs 全部匹配 Change.id，而不匹配 Q1/A1 等短 key；这是真实 persisted corpus，不是测试假设。
- OpenSpec change root、Run path、Git checkpoint subject/trailer 与外部 handoff 都以 semantic change id 为稳定标识。
- `key` 更适合 Delivery 内短标签/展示顺序，不应同时承担 long-lived dependency reference。

Apply 时 `ChangeFact.dependsOn` 字段名可保持，语义改为 id；`dependenciesMet()` 必须比较 `c.id`。Policy `activate-change` context 可以继续输出 key 供人阅读，因为展示 identity 与 dependency authority 可以不同。

**未选择：改 Manifest 全部依赖为 Q1/A1 key。** 这会重写现有 canonical manifests、与长期 change-id 路径割裂，并把 unit fixture 假设提升成 authority。

### 2. Owner authority record 放在 Delivery Manifest 顶层 `ownerDecisions`

选择单一物理来源：

```yaml
ownerDecisions:
  - ref: owner:<sha256>
    decision: authorize-apply
    deliveryId: 20260810-01-change-execution-loop
    changeId: delivery-change-creation-and-owner-input
    sourceRef: <opaque owner input ref>
```

Delivery-scoped decision（Full Test/Finalize）不写 `changeId`。

理由：

- Manifest 已是 Delivery/Change lifecycle 的 source-controlled authority，Owner decisions 也是 Delivery-scoped orchestration fact；放在同一 formal document 避免新增 `.flowkit/approvals` 第二状态树。
- checkout/resume 天然恢复，不依赖聊天、provider session 或 Run。
- create Change / activation 可以把 provenance 与 Manifest mutation 合并进一次 atomic publish，减少跨文件一致性面。

**未选择：每 decision 一个 `.flowkit/owner-decisions/**` 文件。** 虽然技术上可行，但会形成独立 record corpus/索引与额外 discovery/garbage lifecycle，更接近本 Delivery 明确禁止的 Decision Registry。

**未选择：Run context/result。** Run 是执行信封，且 create/activation 本身不应为了保存 authority 强制制造 Run。

### 3. Owner record 使用 typed tuple + content-hash ref，不保存 timestamp

Record canonical tuple：

```text
decision
deliveryId
changeId?      # canonical Change.id
sourceRef
```

`ref = owner:` + SHA-256(canonical tuple bytes)。字段顺序/换行编码固定。

不保存 `recordedAt`/random UUID：Policy 不需要时间排序，Git history 已提供版本历史；移除时间/随机值可保证相同 Owner input 的 retry byte-stable/idempotent。

`sourceRef` 由显式执行者提供并被当作 opaque string；A1 只保证“这个正式 record 是通过 Owner write entry 形成且未从其它事实推断”，不验证该 ref 指向的外部系统身份。

相同 tuple 已存在：idempotent success。Unknown decision、target mismatch、empty sourceRef、hash/content inconsistency：fail closed。

### 4. Owner record vocabulary 是 bounded superset，不做 generic payload

A1 domain 定义 `OwnerDecisionRecordKind`：

```text
create-delivery
create-change
activate-change
authorize-apply
authorize-archive
authorize-checkpoint
authorize-full-test
authorize-delivery-finalize
```

其中：

- `create-delivery`：Delivery scoped；随 create Delivery 一次写入。
- `create-change`：Change scoped；随 create Change 一次写入。
- `activate-change`：Change scoped；随 activate 一次写入并消费。
- `authorize-apply/archive/checkpoint`：Change scoped；可由 `owner record` 写入。
- `authorize-full-test/delivery-finalize`：Delivery scoped；可由 `owner record` 写入。

不在 A1 加 arbitrary `kind/value: unknown`；corrective Change/cancel/contract reset 的正式 machine vocabulary留其 owning Change/03 冻结。

Policy 的 `OwnerDecision` result enum 继续只表示“当前需要 Owner 做什么”，不强行与 persistence record kind 完全同一个 type；Reader 只把 Policy 可消费的 authorization records投影到 `OwnerAuthorizationFact`。

### 5. Owner applicability 由 typed target 判定，不再只看 scope string

`OwnerAuthorizationFact` 扩展为：

```text
ref
decision
deliveryId
changeId?
sourceRef
```

Reader 只读取当前 active Delivery Manifest，校验 record.deliveryId 必须与 manifest id 一致；Change-scoped record 的 `changeId` 必须解析到同 Delivery Change.id。

Policy helper 改为语义匹配：

```text
hasOwnerAuthorization(snapshot, decision, deliveryId, changeId?)
```

Apply/Archive 只匹配 current Change.id；Full Test/Finalize 只匹配 current Delivery；A1 apply authorization 因此不能授权 B1。Q1 以前不存在 formal owner facts，所以不需要把历史 scope-only fact 做持久化 migration；tests 中构造旧 `scope` fixture 必须同步到新 shape。

Checkpoint authorization record A1 可以安全记录，但 Q1 current Policy 仍会在 Git boundary 出现前呈现 `authorize-checkpoint`；F1 才拥有 checkpoint execution/recognition consumption。A1 不因 record presence自动 Commit。

### 6. Creation service 与 CLI 使用同一 runtime validation

新增 A1 service surface（命名可按代码风格调整，但语义固定）：

```text
createDelivery(input, ownerSourceRef)
createChange(deliveryId, input, ownerSourceRef)
recordOwnerDecision(deliveryId, decisionInput)
activateChange(deliveryId, changeId, ownerSourceRef)
```

Validation 必须在任何写入前完成。

Delivery create：

- repository delivery-groups 中 active Delivery 数量必须为 0；
- id 唯一，branch/goal/scope/acceptance/fullTestPlan 合法；
- initial state 固定 active，fullTestStatus 固定 `not-ready`；
- planned Changes key/id 唯一；dependsOn 全为同 input set 的 Change.id；无 self/duplicate/cycle；
- architecture 保存 impact 与 `archifyPlan`（impact true 时仍不调用 Archify，当前 02 可写 `deferred`）。

Change create：

- 唯一 active Delivery；
- key/id 唯一；state 固定 planned；
- dependency id 必须已经存在于当前 Delivery；不允许依赖自身/duplicate；
- `architectureImpact` 是 Change-level persisted field，必须与 key/id/goal/dependsOn/outputs/required/state 一起写入 Manifest；Delivery create 的 initial planned Changes 使用同一 shape；
- Reader 必须把 persisted `architectureImpact` 投影到 `Change` / `ChangeSummary` / `ChangeFact`（或等价正式 read model），checkout/resume 后值不丢失；
- 不允许修改既有 Change dependency graph。

**未选择：让 CLI 自己验证一套。** CLI 只解析参数/JSON，避免第二 validation authority。

### 7. Existing Manifest writer 使用 bounded structured spans，不做 full YAML reserializer

项目当前故意没有 runtime YAML dependency，并且现有 Manifest 包含 A1 不拥有的大量 fields。A1 不引入第三方 YAML serializer，也不尝试“解析后重排整个文件”。

实现一个受限 `DeliveryManifestDocument`：

1. 以 LF-normalized lines 扫描顶层 key 与 `changes:` / `ownerDecisions:` section spans；
2. 对 `changes` list 解析每 item 的唯一 `key`/`id`/`state` anchors 与 item span；
3. activation 只替换目标 item 唯一 `state:` value；create Change 只在 `changes` section 尾部插入 canonical block；
4. owner record 只在 `ownerDecisions` section 追加 canonical item，section 不存在时按固定位置创建；
5. 所有其它 byte slices 原样拼回；
6. duplicate top-level owned key、duplicate item identity、非 block-style owned section、tab indentation、无法唯一定位 state 等情况全部拒绝。

新 Delivery 没有 preservation burden，可由 deterministic minimal serializer完整生成。

**未选择：blind regex/string replace。** 它无法证明唯一 target，容易误改 prose/重复字段。

**未选择：引入 YAML runtime dependency。** 当前范围不值得用新依赖换取全 YAML 通用性，且会扩大 C1/Runtime Foundation surface。

### 8. Activation 使用“OpenSpec metadata first → Manifest atomic publish”

Preflight：

1. load shared snapshot；要求 conflicts=[]、Delivery active、no active Change；
2. selected Change 必须 planned；`dependenciesMet` 按 Change.id；
3. `next(snapshot)` 必须为 `owner-decision: activate-change` 且 eligible keys 中包含 selected Change.key；
4. validate ownerSourceRef，并在内存生成 `activate-change` record；
5. build expected minimal `.openspec.yaml` bytes。

Publish：

```text
ensure exact OpenSpec metadata
→ atomic Manifest replace(record + planned→active)
```

OpenSpec metadata expected contract：

```yaml
schema: spec-driven
created: <YYYY-MM-DD>
```

日期由 activation service 的 injectable clock 产生，测试固定 clock；metadata 已存在且 exact expected/accepted minimal shape 时作为 idempotent preinit 复用。A1 不运行 OpenSpec CLI/runtime。

若 metadata 成功、Manifest publish 失败：Change 仍 planned，留下 exact preinit。这是唯一允许 partial state；retry 复用。反向顺序（先 active Manifest）被拒绝，因为会留下“active 但 OpenSpec root 缺失”的更危险 authority contradiction。

如果 Manifest publish 成功，就不做自动 Explore Run。`next()` 随后自然返回 `explore`。

### 9. A1 write CLI 采用 bounded verbs + JSON input file

CLI 冻结：

```text
flowkit create delivery --input <json> --source-ref <ref>
flowkit create change --input <json> --source-ref <ref>
flowkit owner record --decision <decision> [--change <change-id>] --source-ref <ref>
flowkit activate --change <change-id> --source-ref <ref>
```

`create change`、`owner record`、`activate` 使用当前 repository discovery 的唯一 active Delivery，不允许用任意远程 Delivery locator 绕过当前 repository facts。JSON file 负责复杂 create payload，避免大量 shell-specific flags；stdout 使用稳定 machine-friendly summary，错误使用现有 `FlowkitError`/exit semantics。

`owner record` 仅允许 authorization-only decisions：apply/archive/checkpoint/full-test/finalize；create/activate provenance 必须由对应 mutation command一起写入，避免先留下无目标 lifecycle effect 的 selection record。

对 authorization-only `owner record`，A1 MUST 在任何 Manifest mutation 前重新读取 current formal snapshot 并执行 current Policy。只有当 Policy 当前结果正好是 `owner-decision`，且 requested decision 与本次 record decision 完全一致、canonical target 也完全一致时，写入才合法；否则 MUST fail closed 且 Manifest 保持 byte-identical。这里的“同一 target”对 Change-scoped decision 按 Change.id 解析，对 Delivery-level decision 按 Delivery id 解析。

这条约束只判断**当前写入是否合法**，不建立 authority-resolution event/ref，也不要求 Policy 证明未来事实。它防止提前写入 authorize-apply/archive/checkpoint/full-test/finalize 后在未来 gate 到达时被静默消费。CLI/service 必须共享同一 admission helper，不能由 CLI 自己复制 `next()` decision tree。

Diagnostics 四命令继续走原 CLI branch且只读；G1 可在不改变 A1 service contract的前提下统一完整 CLI UX。

### 10. A1 OpenSpec seam 只拥有 minimal metadata initializer

不 import `@fission-ai/openspec`，不 shell out `openspec new change`，避免 A1 提前成为 C1 adapter。A1 只知道当前项目已经冻结的 minimal metadata bytes与路径 `openspec/changes/<change-id>/.openspec.yaml`。

完整 planningHome / structured artifact paths / instructions / validate / archive 继续由 C1 接管。C1 未来可以把 initializer替换为 thin adapter，只要保持 A1 externally frozen activation behavior。

### 11. Bootstrap history 不迁移，A1 从新 record 开始 strict

Q1 001–015 和 A1 016–020 Bootstrap Runs 的 `ownerAuthorization: explicit/not-required` 都是历史执行 context，不修改、不转换。A1 Apply 后新产品 operations才开始写 `ownerDecisions`。

当前 A1 自身已经通过 Owner Bootstrap 授权激活，因此 020 Proposal 不需要retroactively给本 Change插入新 Owner record；这样避免用新 contract伪造过去没有产生的 authority artifact。

### 12. `architectureImpact` 对 pre-A1 corpus 使用 exact identity bounded compatibility

022 已冻结 future Change 的 `architectureImpact` 必须成为 persisted/read formal fact，但 Base `448fa042de86d07e893bcc51da528f93eb7ced3a` 的三份 source-controlled Delivery Manifest 均早于 A1 write-side，Change items 没有该字段。A1 不允许为了让 Reader 通过而猜测值，也不允许静默回写已完成 Delivery/Q1 authority。

因此冻结一个**静态、source-controlled、exact identity legacy seam**。兼容集合只包含该 Base 已存在的以下 `(deliveryId, Change.id)`：

```text
20260805-01-product-baseline:
  product-positioning
  core-model
  integration-boundaries
  bootstrap-and-roadmap
  baseline-finalization-corrections

20260806-01-deterministic-core:
  runtime-foundation
  domain-and-state-schema
  formal-fact-reader-and-persistence
  policy-engine
  execution-model-correction
  orchestration-authority-boundary-correction
  diagnostic-cli
  core-hardening-and-release-candidate

20260810-01-change-execution-loop:
  core-contract-alignment
  delivery-change-creation-and-owner-input
  lean-run-and-action-package
  openspec-1-7-thin-integration
  review-findings-and-blocker-authority
  change-verification-selection-and-change-set
  archive-and-checkpoint-boundary
  change-cli-end-to-end-and-performance
```

Reader 规则：

1. Change item 明确保存 `architectureImpact: true|false` 时，始终按该 boolean 读取；
2. 缺字段时，仅当 `(deliveryId, Change.id)` 精确命中上述 legacy set，才允许继续读取；
3. legacy missing MUST 在 Domain/FormalFact projection 中表达为显式 `unknown / pre-a1-legacy-missing`（具体 TypeScript representation 可在 Apply 选择 discriminated value、nullable field + source marker 或等价形式），**不得降级为 boolean**；
4. MUST NOT 从 Delivery-level `architecture.impact`、Change key/id 名称、goal、scope、outputs、OpenSpec、Run 或其它内容推断 `true/false`；
5. legacy existing Manifest mutation（例如 activation 的 state 更新）MUST 保留“缺失”本身，不做 opportunistic backfill；
6. 任意不在 exact legacy set 的 Change 缺失/畸形 `architectureImpact` MUST fail-closed；
7. `createDelivery` initial Changes 与 `createChange` 从 A1 write-side 正式启用起都 MUST 接收并写入 boolean `architectureImpact`，因此 future Change 不可能通过 legacy seam 合法缺失。

这个 seam 是 Bootstrap 兼容常量，不是 migration framework、schema version registry 或按日期推断机制。后续如果要给 legacy Change 补值，必须由独立 authority-backed Change 明确决定；A1 不负责 backfill。

#### 为什么不按 Manifest 整体 hash 绑定

Delivery Manifest 会在本 Delivery 后续 activation/completion 中合法变化，用 whole-file hash 会让 B1–G1 在 state mutation 后丢失 compatibility 并再次 self-brick。`deliveryId + Change.id` exact set 在 Base 已由 Git 固定，且不会让 future 新 Change 自动进入 seam。

#### 为什么不把缺失当 `false`

`architectureImpact=false` 是一个架构事实。A1 没有 authority 从“字段缺失”推导 false，也不能从 Delivery-level `architecture.impact=true` 推导每个 Change 为 true。显式 unknown 是唯一不伪造事实的 read contract。

## Risks / Trade-offs

- **[Manifest 变成 owner record carrier 后会增长]** → record 保持极小、无 transcript/log/time-series payload；只记录 lifecycle authority事实。
- **[Bounded YAML mutation 不支持全部 YAML 语法]** → 对 owned section 明确 fail-closed；未知非 owned section按 raw bytes保留。当前 canonical Manifest 本身已是 block-style subset。
- **[OpenSpec metadata first 会留下 planned + metadata partial]** → 这是刻意选择的安全 partial；retry exact-match复用，mismatch阻塞；不建立 rollback journal。
- **[sourceRef 不能证明调用者真实身份]** → A1 明确只保证 structural provenance/non-inference；认证属于宿主/未来安全层。
- **[Change.id dependency 是 BREAKING semantic correction]** → canonical manifests 已全部使用 id；主要迁移是修 Policy/tests，不需要重写 current manifests。
- **[write CLI 可能与 G1 最终 UX 重叠]** → CLI 薄封装稳定 service；G1 只能编排/扩展入口，不复制业务逻辑。
- **[提前记录 authorization 可能污染 lifecycle]** → authorization-only `owner record` 在写前 MUST 重新读取 current facts/Policy，并要求当前 owner-decision + canonical target 与 record 完全一致；否则 fail-closed 且 Manifest 不变。create/activate 由 mutation command 原子记录。
- **[architectureImpact 接收后丢失会破坏 resume/03 handoff]** → A1-created Change 的 Manifest shape、Domain read model 与 FormalFact projection 都 MUST 持久化/恢复该字段；Delivery create initial Changes 与 createChange 使用同一语义。pre-A1 exact legacy identities 缺字段只读为 explicit unknown，不猜值、不回填。

## Migration Plan

1. 新增 A1 domain/validation 与 Owner record types，不改历史 Run。
2. 扩展 Change `architectureImpact` persisted/read projection，并先加入 Base `448fa...` 三份 Manifest / 21 个 exact Change.id 的 bounded legacy-missing allowlist；legacy missing 只投影 explicit unknown，A1-created Change missing strict fail-closed。随后扩展 Manifest ownerDecisions projection 与 typed Owner authorization helper；同步 Policy dependency id resolution、authorization-only current-gate admission和 fixtures。
3. 实现 bounded Manifest document writer、create Delivery/create Change/record Owner operations。
4. 实现 minimal OpenSpec initializer与 activation two-step publish/idempotent retry。
5. 接入四个 bounded write CLI command；保持 diagnostic commands read-only。
6. 用三份真实 pre-A1 Delivery Manifest 验证 legacy missing `architectureImpact` 不 self-brick且不推断 boolean；对 current 20260810 Manifest 做 dependency/Manifest preservation regression，并覆盖 future/new Change missing 字段 strict rejection、cross-Change/cross-Delivery authorization。
7. 同步 canonical docs/specs，运行 A1 focused/affected/typecheck/lint/build/OpenSpec strict；不得运行 Delivery Full Test。

若 Apply 中发现无法在不扩大 schema/authority 的前提下满足 spec，应返回 Review/Owner 边界，不通过新增 Registry、外部 YAML runtime 或自动 Git行为绕过。
