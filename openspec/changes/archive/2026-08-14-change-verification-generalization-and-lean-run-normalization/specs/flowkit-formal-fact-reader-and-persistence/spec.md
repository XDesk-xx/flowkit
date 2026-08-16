## MODIFIED Requirements

### Requirement: context.json 物理 schema + 确定性投影 + 身份校验

持久化层 MUST 为 current Standard Run 定义 closed structural `ContextFile` shape，并对 repository 中已经存在的 historical Context shapes 提供 bounded read-only recognition。E2 MUST NOT 引入 `Context v6` 或新的 Context component version lifecycle。recognized E2 Change Checkpoint 前，E2 自身继续按 pre-E2 current runner 的 existing context/entry protocol执行；checkpoint 后 current writer MUST 将 canonical Git Base + lexical compact entry delta、Core-derived typed mutation declaration、applicable Owner/contract refs 与 semantic identity 内嵌 `context.json`，并且 new Run 不再依赖 `entry-workspace.json`。对 Git history 中不存在 Flowkit 02 pre-E2 migration lineage 的 fresh/downstream repository，current writer MUST 直接使用同一 post-E2 current shape，MUST NOT 要求伪造 E2 checkpoint。Latest reader MUST 通过 mutually-exclusive structural fields 优先识别 post-E2 current shape，再识别仓库真实存在的 bounded historical shapes；unknown、ambiguous 或 mixed shape MUST fail closed。E2 本 Proposal不授权新的 `formatVersion`；若 implementation 无法通过结构可靠区分，则 MUST 返回 Proposal，而不是临时新增组件版本。

#### Scenario: ContextFile 必填字段

- **WHEN** 校验 post-E2 current Standard Run
- **THEN** MUST 包含 `runId`、`deliveryId`、`changeKey`、`changeId`、`action`、`role`、`ownerAuthorization`、`runPath`、canonical base、applicable facts、semantic fingerprint 与 matching current ActionPackage projection
- **AND** `action` MUST 在 10 个 Change-only Standard Action Catalog 中
- **AND** action/role 或 structural field combination mismatch MUST fail closed
- **AND** current shape MUST NOT 依赖新的 Context component version number

#### Scenario: 新 current Run 不允许 Delivery-level shape

- **WHEN** post-E2 create input 缺失 `changeKey` / `changeId`
- **OR** action 为历史 `full-test` / `delivery-finalize`
- **THEN** writer MUST reject
- **AND** MUST NOT publish pending Run

#### Scenario: review Run inputRef 必须绑定 reviewedRunId

- **WHEN** 创建 post-E2 `review-explore`、`review-propose` 或 `review-apply`
- **THEN** `reviewedRunId` MUST 存在
- **AND** Core MUST 从对应实际 `result.json` 构造 immutable `context.inputRef`
- **AND** 目标缺失、不可读或 fingerprint 不匹配 MUST 在 Run publish 前 fail closed

#### Scenario: context 身份必须匹配 Change path

- **WHEN** 校验 post-E2 current Run
- **THEN** `deliveryId`、`changeId`、`runId` 与 `runPath` MUST 和实际目录一致
- **AND** 任一不一致 MUST reject 或收集 `FactConflict`

#### Scenario: v5 Apply entry 必须完整

- **WHEN** Reader/resume 处理 existing historical/pre-E2 schemaVersion 5 `apply` 或 `revise-apply` Run
- **THEN** context MUST 按已存在 contract 包含 persisted full entry workspace identity 与 matching approved Design 派生的 typed declaration
- **AND** MUST 保持 immutable read-only，MUST NOT 被升级、回填或解释为 post-E2 compact current shape

#### Scenario: post-E2 Apply 使用 compact entry identity

- **WHEN** Flowkit self-migration repository 已有 recognized E2 Change Checkpoint，或 fresh/downstream repository 不存在 Flowkit 02 pre-E2 migration lineage，并创建新的 `apply` 或 `revise-apply` Run
- **THEN** `context.json` MUST 内嵌 canonical Git Base + complete lexical compact entry delta + typed mutation declaration identity
- **AND** MUST NOT 创建 `entry-workspace.json`
- **AND** Base、entry delta 或 declaration identity drift MUST fail closed

### Requirement: Bootstrap Run 兼容性 + 三路判别器

Reader MUST 使用 closed current-shape-first + bounded legacy discriminator。Post-E2 current shape MUST 由其 required structural fields唯一识别；现有 historical schemaVersion 2/3/4/5 与 schemaVersion 1/missing legacy shape MAY 继续由仓库当前已有 bounded validators/recognizer只读处理。E2 MUST NOT 新增一个新的 schemaVersion 数值来表达 post-E2 current implementation，也 MUST NOT 建立开放式 `readV1/readV2/readV3...` framework。任何 historical path MUST NOT 修改 bytes、补字段、升级 authority 或 fallback 到其它 parser；unknown/ambiguous/mixed shape MUST fail closed。

#### Scenario: schemaVersion 2 current Change Run 严格校验

- **WHEN** Reader 读取 schemaVersion 2 historical Change Run
- **THEN** normal C1 shape MUST 使用既有 v2 strict Change-only/identity validation
- **AND** provisional `ownerFactRefs` MAY 只校验 shape 后从 typed authority projection 忽略
- **AND** pre-Q1 revision exception MUST 只接受既有 run/change/action/sourceReviewRun + immutable SHA-256 allowlist 完全匹配的 corpus
- **AND** malformed v2 MUST 收集 `FactConflict`，MUST NOT 因失败退回 legacy best-effort

#### Scenario: legacy recognizer 可识别历史 Delivery Action

- **WHEN** Reader/NNN enumeration 遇到 schemaVersion 1 或缺失的历史 Run
- **AND** action 为 `full-test` 或 `delivery-finalize`
- **THEN** MAY 识别为 bounded legacy Delivery Run
- **AND** MUST NOT 将该 action 加回 current Action Catalog
- **AND** MUST NOT 允许 new writer 继续该模型

#### Scenario: legacy terminal bytes 不迁移

- **WHEN** bounded historical reader 识别既有 historical Run
- **THEN** MUST NOT 修改、迁移或重写其 `context.json` / `result.json` 或 sidecars
- **AND** current Policy MUST 从当前正式 facts 计算 lifecycle，而不是升级旧 Run authority

#### Scenario: historical v3 保留 Owner fact contract

- **WHEN** Reader 读取 schemaVersion 3 context
- **THEN** MUST 按 D1 bounded `ownerFactRefs` 与既有 identity rules 只读投影
- **AND** MUST NOT 获得后续 archive/entry/current-shape authority

#### Scenario: historical v4 保留 archive projection contract

- **WHEN** Reader 读取 schemaVersion 4 context
- **THEN** MUST 按 D2 rules 校验 Owner facts、archive-only `archiveEntryOpenSpecProjection` 与 existing action-specific fields
- **AND** MUST NOT 将它宣称为 post-E2 current persistence authority

#### Scenario: v5 current context 严格校验

- **WHEN** Reader 读取 existing schemaVersion 5 pre-E2 context
- **THEN** MUST 使用既有 v5 Action-discriminated schema + identity validation
- **AND** malformed v5 MUST 收集 conflict，MUST NOT fallback 到其他 legacy recognizer或被当作 post-E2 current shape

#### Scenario: unknown version 不降级

- **WHEN** historical object 声称未知 schemaVersion，或 bytes 同时/都不满足 post-E2 current shape与 bounded historical shape
- **THEN** Reader MUST fail closed
- **AND** MUST NOT 猜测最接近版本、静默丢弃 unknown fields 或动态注册新 reader

#### Scenario: post-E2 current shape 不新增 component version

- **WHEN** self-migration repository 已过 recognized E2 Change Checkpoint，或 fresh/downstream repository 由 current implementation 创建 new Standard Run
- **THEN** MUST 通过 current required structural fields识别该 shape
- **AND** E2 MUST NOT 为其新增 `Context v6`、`ActionPackage v3` 或新的 Context schemaVersion 数值

### Requirement: post-action record 必须独立持久化

`verification.md` MUST 继续由 Change 拥有且作为 formal Verification authority。E2 checkpoint 前，Core MAY 按 pre-E2 current runner 已存在的 per-Run record/sidecar protocol 保存 E2 自己的 generic post-action selection/evidence，但 MUST NOT 引入新的 sidecar format generation；point-in-time authority MUST 由 persisted bytes/content fingerprints、producing Run identity、terminal/result binding 与 `verification.md` publication fingerprint 固定。recognized E2 checkpoint 后，或 fresh/downstream repository 不存在 Flowkit pre-E2 migration lineage时，Core MUST 将 post-action selection/publication authority 直接绑定在 terminal `result.json`，不得修改 entry `context.json` 或创建新的 per-Run post-action sidecar。Historical records MUST immutable、bounded-readable，future current Catalog/renderer/Markdown MUST NOT 反向重验 historical terminal。

#### Scenario: terminal 后尝试修改 context

- **WHEN** post-action facts 已产生
- **THEN** post-E2 writer MUST 将 minimal binding 放入 terminal `result.json`
- **AND** MUST NOT terminal-time 注入或回填 `context.json`
- **AND** pre-E2 historical/current migration sidecar不得因此被改写

#### Scenario: record absent 而 Markdown present

- **WHEN** crash 后 Run pending、terminal binding absent 且 `verification.md` present
- **THEN** exact recovery MUST 从 persisted entry/package + current candidate 重算 deterministic selection/checks/Markdown
- **AND** bytes 完全一致才可继续 terminal publication，否则 MUST fail closed

#### Scenario: terminal result 不得早于 commit marker

- **WHEN** Apply/revise-apply terminal result 首次发布
- **THEN** 当时 canonical `verification.md` MUST 已完整存在且 point-in-time fingerprint 与即将写入/绑定的 persisted authority 一致
- **AND** missing/mismatch MUST 阻止 terminal CAS

#### Scenario: Reader 只验证 current applicable selection lineage

- **WHEN** Formal Reader 投影 current Change Verification
- **THEN** MUST 按现有 Policy/Review producer lineage选择唯一 current completed `apply` / `revise-apply` producer
- **AND** MUST 只将该 current producer 的 publication fingerprint 与 current canonical `verification.md` bytes exact-check
- **AND** producer/result/binding mismatch、多个 current candidates 或 current bytes mismatch MUST fail closed

#### Scenario: pending post-action publication 不替换 current authority

- **WHEN** pending Apply/revise-apply 已发布 Markdown 或 migration sidecar 但尚无 terminal result
- **THEN** Reader MUST 将 verification projection 标记为 unavailable/in-flight
- **AND** MAY 为 exact recovery 校验/重算 pending publication
- **AND** MUST NOT 将 pending publication 投影为 satisfied authority，或将 previous terminal binding 对照新 Markdown bytes

#### Scenario: historical terminal binding 是 point-in-time fact

- **WHEN** 后续合法 revise-apply 发布新的 point-in-time binding 与同一路径 `verification.md`
- **THEN** earlier Apply/revise-apply result、historical record/sidecars 与 ResultRefs MUST 保持有效
- **AND** Reader MUST NOT 将 future current-path bytes、future Catalog 或 future renderer 与 historical fingerprint 比较产生 FactConflict

#### Scenario: old terminal exact replay 不读取 future Markdown

- **WHEN** `resumeRun(expectedRunId)` 或 equivalent replay 指向 non-current historical terminal
- **THEN** Core MUST 直接返回 persisted terminal，并只校验该 historical record/result 自身 closed binding
- **AND** MUST NOT 读取 current canonical `verification.md`、current selection lineage、future Catalog 或 future renderer作为 historical authority
