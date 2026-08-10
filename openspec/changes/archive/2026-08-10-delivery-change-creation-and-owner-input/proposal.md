## Why

Deterministic Core 已经能读取 Delivery/Change 事实并由 Policy 计算 `activate-change`、Apply、Archive 等 Owner 边界，但产品仍没有安全的 write-side：不能创建 Delivery/Change、不能把 Owner 独立输入持久化为可恢复且可限定 applicability 的正式事实，也不能把合法 activation 机械落到 Manifest/OpenSpec。与此同时，真实 Delivery Manifest 一直用 `Change.id` 保存 `dependsOn`，而 current Policy/unit fixture 却按 `Change.key` 解析，导致 completed dependency 在真实 persisted shape 下仍可能被错误判为 incomplete；A1 必须在开始完整 Change Runner 之前把这条 authority/write bridge 收敛。

## What Changes

- 新增最小 Delivery/Change creation service：创建 Delivery 时直接形成 `state=active` 的最小正式 Delivery Manifest；创建 Change 时只追加 `state=planned` Change。两者都要求 Owner 独立明确输入并在同一次 Manifest publish 中记录最小 provenance，不创建 branch/commit/push/PR、Run、Archify asset 或 Full Test。
- 新增 Delivery Manifest 顶层 `ownerDecisions` 作为 **Owner authority 的最小 source-controlled record**；不建立 Decision DB、Approval Registry、inbox 或 event ledger。Record 只保存确定性 `ref`、typed `decision`、`deliveryId`、可选 canonical `changeId`、opaque `sourceRef`；不复制聊天正文，不保存 provider session，也不使用 Run `ownerAuthorization` 创造 authority。
- Owner decision `ref` 由 canonical record tuple 内容哈希派生，不引入时间戳/随机 ID。完全相同的 record 写入是 idempotent；malformed/unknown/target 不适用的 record fail-closed。A1 只保证 structural provenance / non-inference，不提供密码学身份认证，也不解析 `sourceRef` 的外部真实性。
- **BREAKING**：Delivery Manifest 的 `dependsOn` normative identity 冻结为 **`Change.id`**。repo 内所有现存 Delivery Manifest dependency refs 均使用 id，OpenSpec/Run/Git checkpoint 等长期路径也以 change id 为稳定语义标识；`Change.key` 保留为 Delivery 内短标签/展示选择。Reader、Policy `dependenciesMet`、create validation、activation precondition、diagnostics 与 tests 必须统一按 id 解析。
- 扩展 Owner authorization formal fact：Policy 不再只按无 target 的 `scope` 字符串匹配，而是按 typed decision + `deliveryId` + 可选 `changeId` 过滤，证明 A1 authorization 不会泄漏到 B1 或其它 Delivery。authorization-only `owner record` 在持久化前 MUST 重新读取 current formal facts/Policy，且 current Policy MUST 正在请求同一 decision 与 canonical target；stale/early authorization 一律 fail-closed、Manifest 不变。Q1 以前的 Run `ownerAuthorization: explicit/not-required` 原样保留且永不升级为 formal Owner fact。
- Change create input 与 persisted Change fact 都 MUST 保存 `architectureImpact`；Delivery create 的 initial planned Changes 与后续 `createChange` 使用同一字段语义。Reader/Domain projection MUST 让该值在 checkout/resume 后可恢复，A1 不得接收后丢弃。**Bootstrap compatibility 例外只覆盖 Base `448fa042de86d07e893bcc51da528f93eb7ced3a` 已存在的三份 source-controlled Delivery Manifest 中 exact `(deliveryId, Change.id)` legacy identity set**：这些 pre-A1 Change 若缺字段，Reader MUST 以显式 `unknown / legacy-missing` 语义恢复，MUST NOT 猜 `true/false`、MUST NOT 从 Delivery-level `architecture.impact`、名称、goal、outputs 或其它事实反推。A1 write-side 启用后由 `createDelivery`/`createChange` 新建的任何 Change 均严格要求 boolean `architectureImpact`，缺失/畸形 MUST fail-closed；compatibility 不得按“字段缺失”“日期”“planned/completed 状态”等泛化条件扩张。
- 新增 activation write operation：必须先以 current Formal Facts/Policy 验证目标确为唯一/eligible `activate-change` 候选，再消费本次 Owner 明确输入；activation 只把目标 `planned → active`，并初始化最小 OpenSpec `.openspec.yaml`，不自动创建 Explore Run，也不是 Git boundary。
- activation 采用 fail-closed、可重试的两步 publish：先准备/创建 exact OpenSpec metadata，再以一次 atomic Manifest replace 同时记录 Owner decision 与 `planned → active`。如果第二步失败，只允许留下“planned Change + exact preinitialized `.openspec.yaml`”这一种有界 partial state；retry 必须识别并复用 exact metadata，任何 mismatched metadata 都阻塞，不建立 transaction journal。
- 新增 bounded Delivery Manifest writer：对现有 Manifest 使用 indentation-aware structured spans 定位 `changes` / `ownerDecisions` / owned state fields，只修改 A1-owned bytes，未知顶层 section 原样保留；ambiguous key、duplicate key、unsupported owned-section shape、malformed YAML subset 都 fail-closed。新 Delivery 使用确定性 minimal serializer。继续保持无外部 YAML/OpenSpec/GitHub runtime dependency。
- 冻结 A1 最小 operator write CLI：`flowkit create delivery`、`flowkit create change`、`flowkit owner record`、`flowkit activate`。它们只是 A1 write-side 薄入口，调用同一 service/validation；现有 `status/next/doctor/resume-context` 继续严格 read-only。G1 后续负责完整 Change CLI/runner loop。
- A1 只提供 OpenSpec activation 所需 `.openspec.yaml` minimal initializer；不调用/内嵌 OpenSpec runtime，不提前实现 C1 structured context/path/archive adapter。
- 同步 canonical specs/docs/tests，并增加真实 Manifest-shape dependency regression、Owner cross-Change/cross-Delivery leakage、creation validation、Manifest preservation、activation partial-failure/idempotent retry 与 CLI write/read-only boundary tests。任何 A1 path 都不得自动运行 Delivery Full Test。

## Capabilities

### New Capabilities

- `flowkit-delivery-change-creation-and-owner-input`: 定义 Delivery/Change creation、Owner provenance ingestion、minimal write CLI、activation mutation、Manifest writer 与 minimal OpenSpec initialization 的完整 A1 行为契约。

### Modified Capabilities

- `flowkit-core-model`: 冻结 `dependsOn = Change.id`，并明确 create Delivery/create Change/activation 的 lifecycle 与 Owner authority 边界。
- `flowkit-domain-and-state-schema`: 增加 creation input、typed Owner decision record/ref，并把 Change-level `architectureImpact` 冻结为 persisted/read formal fact；仅 exact pre-A1 legacy identities 可显式读为 unknown，A1-created Change 从 write boundary 起 strict required；`Change.id` 成为 dependency/Owner applicability 的 canonical identity。
- `flowkit-formal-fact-reader-and-persistence`: 扩展 Manifest Reader/Writer、`ownerDecisions` formal projection、Change `architectureImpact` projection及 exact pre-A1 legacy identity allowlist、typed applicability、authorization-only current-Policy admission、atomic structured mutation 与 activation bounded retry；Run 不成为 Owner authority，legacy compatibility 不推断 boolean。
- `flowkit-policy-engine`: dependency resolution 改为 `Change.id`，Owner authorization gate 改为 delivery/change-aware typed matching，并把 authorization-only record admission 所需的 current owner-decision/target matching 冻结为规范前置；Policy 仍只决定合法边界，不执行 write operation。
- `flowkit-diagnostic-cli`: 保持四个 diagnostic commands read-only，并确保真实 Manifest id dependency 与 typed Owner facts 经共享 snapshot/Policy 后得到正确稳定呈现；write CLI 不进入 diagnostic decision tree。
- `flowkit-bootstrap-and-roadmap`: 从 Bootstrap 人工 activation 过渡到 A1 product write-side，同时冻结 exact pre-A1 `architectureImpact` missing corpus 的 bounded read compatibility；继续保持 activation 非 Git boundary、Run 不创造 Owner authority、历史 Bootstrap owner strings 不迁移。
- `flowkit-integration-boundaries`: 固定 Owner authority、Run reference、Delivery Manifest 与 minimal OpenSpec initializer 的 one-fact/one-authority 边界，并明确 legacy missing `architectureImpact` 不得从 Delivery architecture 或其它 authority 猜值；禁止 A1 变成 OpenSpec/Git/Agent 第二编排器。

## Impact

- Domain/validation：`src/domain/types.ts`、`src/domain/schema-validator.ts` 及 A1 create/owner DTO validator；不新增主 lifecycle state。
- Facts/persistence：`src/facts/formal-fact-snapshot.ts`、`src/facts/formal-fact-reader.ts`、`src/facts/yaml-parser.ts`、`src/persistence/**`、`src/shared/atomic-write.ts`，并新增最小 Manifest document mutation / Owner record / creation service 模块。
- Policy：`src/policy/next.ts` 与 Owner authorization helper/preconditions，只同步 canonical id dependency 与 typed applicability，不重写 decision tree。
- CLI：`src/cli/main.ts` 增加四个 bounded write command；`src/bin/flowkit.ts` 继续薄壳，diagnostic commands 保持 read-only。
- OpenSpec seam：仅创建 `openspec/changes/<change-id>/.openspec.yaml` minimal metadata；C1 仍拥有完整 OpenSpec 1.7 integration。
- Canonical contract：上述一个新 capability + 七个 modified capabilities，以及对应 current docs/AGENTS 的最小一致性更新；不修改 archived Change artifacts。
- Verification：creation/validation、real Manifest dependency identity、Change architectureImpact persistence/resume、**3 个 pre-A1 Manifest / 21 个 exact legacy Change identities 的 missing-value bounded compatibility 与 future malformed strict rejection**、Owner provenance/applicability、stale/early authorization rejection、Manifest preservation/atomicity、activation retry、minimal OpenSpec init、write CLI 与 checkout/resume；不运行 Delivery Full Test，不 Commit/Push/Checkpoint。
