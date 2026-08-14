## MODIFIED Requirements

### Requirement: context.json 物理 schema + 确定性投影 + 身份校验

持久化层 MUST 定义 closed `ContextFile` version union。migration 后 new Standard Run writer MUST 只写 schemaVersion 5；v2/v3/v4 MUST 保持 immutable historical read-only contracts。v5 common variant MUST 保存 `runId`、Delivery/Change/Action/Role、`runPath`、canonical base、applicable facts 与 semantic fingerprint；`apply` / `revise-apply` variant MUST 另外保存 entry workspace identity、Core-derived typed declaration 与 approved Design source identity。review/revise/archive action-specific fields 继续使用 closed discriminators。

#### Scenario: v5 ContextFile 必填字段

- **WHEN** 校验 new schemaVersion 5 Standard Run
- **THEN** MUST 包含 common identity、canonical base、applicable facts 与 semantic fingerprint
- **AND** `deliveryId`、`changeId`、`runId` 与 `runPath` MUST 和实际目录一致
- **AND** action/role 或 version/field combination mismatch MUST fail closed

#### Scenario: v5 Apply entry 必须完整

- **WHEN** 创建 schemaVersion 5 `apply` 或 `revise-apply` Run
- **THEN** context MUST 包含 persisted entry workspace identity 与 matching approved Design 派生的 typed declaration
- **AND** 任一 authority 缺失 MUST 在 pending Run publish 前 fail closed

#### Scenario: review Run inputRef 必须绑定 reviewedRunId

- **WHEN** 创建 schemaVersion 5 `review-explore`、`review-propose` 或 `review-apply`
- **THEN** `reviewedRunId` MUST 存在
- **AND** Core MUST 从对应实际 `result.json` 构造 immutable `context.inputRef`
- **AND** 目标缺失、不可读或 fingerprint 不匹配 MUST 在 Run publish 前 fail closed

#### Scenario: new current Run 不允许 Delivery-level shape

- **WHEN** v5 create input 缺失 Change identity，或 action 为历史 `full-test` / `delivery-finalize`
- **THEN** writer MUST reject
- **AND** MUST NOT publish pending Run

### Requirement: Bootstrap Run 兼容性 + 三路判别器

Reader MUST 使用 closed version-first discriminator：schemaVersion 5 走 strict current validator；v2/v3/v4 分别走各自 bounded historical validator；schemaVersion 1 或缺失只走既有 bounded Bootstrap/legacy recognizer；unknown version MUST fail closed。任何 historical path MUST NOT 修改 bytes、补字段、升级 authority 或降级到其它版本 parser。

#### Scenario: historical v2 使用 strict 与 exact compatibility

- **WHEN** Reader 读取 schemaVersion 2 context
- **THEN** normal C1 shape MUST 使用 v2 strict Change-only/identity validation
- **AND** provisional `ownerFactRefs` MAY 只校验 shape 后从 typed authority projection 忽略
- **AND** pre-Q1 revision exception MUST 只接受既有 run/change/action/sourceReviewRun + immutable SHA-256 allowlist 完全匹配的 corpus

#### Scenario: historical v3 保留 Owner fact contract

- **WHEN** Reader 读取 schemaVersion 3 context
- **THEN** MUST 按 D1 bounded `ownerFactRefs` 与既有 identity rules 只读投影
- **AND** MUST NOT 获得 v4 archive projection 或 v5 entry/declaration authority

#### Scenario: historical v4 保留 archive projection contract

- **WHEN** Reader 读取 schemaVersion 4 context
- **THEN** MUST 按 D2 rules 校验 Owner facts、archive-only `archiveEntryOpenSpecProjection` 与 existing action-specific fields
- **AND** MUST NOT 将它宣称为 v5 evidence 或 ActionPackage v2 authority

#### Scenario: v5 current context 严格校验

- **WHEN** Reader 读取 schemaVersion 5 context
- **THEN** MUST 使用 v5 Action-discriminated schema + identity validation
- **AND** malformed v5 MUST 收集 conflict，MUST NOT fallback 到 v2/v3/v4/legacy recognizer

#### Scenario: legacy recognizer 可识别历史 Delivery Action

- **WHEN** Reader/NNN enumeration 遇到 schemaVersion 1 或缺失的历史 Run
- **AND** action 为 `full-test` 或 `delivery-finalize`
- **THEN** MAY 识别为 bounded legacy Delivery Run
- **AND** MUST NOT 将该 action 加回 current Action Catalog 或允许 new writer 继续该模型

#### Scenario: unknown version 不降级

- **WHEN** context schemaVersion 不属于 1/2/3/4/5 且也不是 missing legacy shape
- **THEN** Reader MUST fail closed
- **AND** MUST NOT 猜测最接近版本或静默丢弃 unknown fields

#### Scenario: historical terminal bytes 不迁移

- **WHEN** bounded historical reader 识别 v1/v2/v3/v4 Run
- **THEN** MUST NOT 修改、迁移或重写其 `context.json` / `result.json`
- **AND** current Policy MUST 从当前正式 facts 计算 lifecycle，而不是升级旧 Run authority

## ADDED Requirements

### Requirement: post-action record 必须独立持久化

Core MUST 将 actualChangeSet 与 verification-selection facts 写入独立 immutable per-Run record，不得修改 entry context。record identity MUST 绑定 producing Run、canonical base、entry identity、post-action observation、renderer version 与 generated `verification.md` point-in-time fingerprint。对 Apply/revise-apply，writer MUST 先发布 deterministic Markdown，再 atomic create immutable record commit marker，最后 terminal CAS。terminal result MUST exact-bind producing Run 的 immutable record；canonical Markdown current-byte exact validation 只适用于 current pending/completion/recovery 或唯一 current applicable producer lineage，MUST NOT 反向重验 historical terminal。

#### Scenario: terminal 后尝试修改 context

- **WHEN** post-action facts 已产生
- **THEN** writer MUST 发布独立 record
- **AND** MUST NOT terminal-time 注入或回填 `context.json`

#### Scenario: record absent 而 Markdown present

- **WHEN** crash 后 Run pending、record absent 且 `verification.md` present
- **THEN** exact recovery MUST 从 persisted entry/package 重算 deterministic Markdown
- **AND** bytes 完全一致才可创建 immutable record，否则 MUST fail closed

#### Scenario: terminal result 不得早于 commit marker

- **WHEN** Apply/revise-apply terminal result 首次发布
- **THEN** producing Run 的 immutable record 与当时 canonical Markdown MUST 已完整存在且 binding 有效
- **AND** result MUST exact-bind 该 record，缺失或 mismatch MUST 阻止 terminal CAS

#### Scenario: Reader 只验证 current applicable selection lineage

- **WHEN** Formal Reader 投影 current Change Verification
- **THEN** MUST 按现有 Policy/Review producer lineage 选择唯一 current completed `apply` / `revise-apply` producer 的 immutable record
- **AND** MUST 只将该 current record fingerprint 与 current canonical `verification.md` bytes exact-check
- **AND** record 缺失、多个 current candidates、producer/result/record mismatch 或 current bytes mismatch MUST fail closed

#### Scenario: pending post-action publication 不替换 current authority

- **WHEN** pending Apply/revise-apply 已发布 Markdown 或 record，但尚无 terminal result
- **THEN** Reader MUST 将 verification projection 标记为 unavailable/in-flight
- **AND** MAY 为 exact recovery 校验 pending record/Markdown
- **AND** MUST NOT 将 pending record 投影为 satisfied authority，或将 previous terminal record 对照新 Markdown bytes

#### Scenario: historical terminal binding 是 point-in-time fact

- **WHEN** 后续合法 revise-apply 发布新的 record 与同一路径 `verification.md`
- **THEN** earlier Apply/revise-apply result、record 与 ResultRefs MUST 保持有效
- **AND** Reader MUST NOT 将 future current-path bytes 与 historical fingerprint 比较或产生 historical FactConflict

#### Scenario: old terminal exact replay 不读取 future Markdown

- **WHEN** `resumeRun(expectedRunId)` 或 equivalent replay 指向 non-current historical terminal
- **THEN** Core MUST 直接返回 persisted terminal，并校验其 persisted result ↔ per-Run record identity
- **AND** MUST NOT 读取 current canonical `verification.md` 或 current selection lineage

### Requirement: Contract Reset recovery 必须保持 narrow admission

`recoverContractResetPendingRun` MUST 基于 target pending Run 的 persisted entry lineage，只在唯一 drift 来自 applicable Owner Contract Reset 时取消为 `superseded-by-owner-contract-reset`。它 MUST NOT 成为 generic cancellation、history rewrite 或 generation manager。

#### Scenario: reset 之外还存在 semantic drift

- **WHEN** target pending Run 同时存在 undeclared/unowned path 或其他 non-reset semantic drift
- **THEN** recovery MUST fail closed
- **AND** MUST 保持 context 与历史 Run 不变
