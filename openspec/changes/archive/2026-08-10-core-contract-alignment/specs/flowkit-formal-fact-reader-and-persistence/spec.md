## MODIFIED Requirements

### Requirement: FormalFactSnapshot 只读视图

C1 MUST 提供只读 `FormalFactSnapshot`，用于 Policy 消费 active Delivery/Change、dependencies、OpenSpec artifacts、current Change Runs、Reviewer Verdict 与最小 blocking-authority projection、Change Verification、Tasks completion、Delivery `fullTestStatus`、owner authorization、Archive/Checkpoint/Git boundary 和 conflicts。Snapshot MUST NOT 把完整 Reviewer Finding corpus 复制为第二数据库；Policy 所需 blocking authority MUST 从当前 matching Reviewer result 派生。

#### Scenario: Reviewer authority 只投影 Policy 所需最小集合

- **WHEN** Reader 读取 completed `review-*` result
- **THEN** `ReviewVerdictFact` MUST 包含 `reviewRunId`、`verdict`、`reviewedRunId`
- **AND** MUST 包含从 blocking `reviewFindings` 派生的去重 `blockingAuthorities`
- **AND** 完整 Finding 正文仍 MUST 由 Reviewer result.json 拥有

#### Scenario: conflicts 保持 fail-closed

- **WHEN** Reader 发现当前 Policy relevant formal fact 自相矛盾或不可解析
- **THEN** MUST 收集 `FactConflict`
- **AND** Policy MUST NOT 猜测 authority 或下一 Action

### Requirement: context.json 物理 schema + 确定性投影 + 身份校验

持久化层 MUST 定义 `ContextFile` 物理 schema 作为 `createRun` 创建的 current Standard Run 输入上下文和确定性 current-Run 投影。schemaVersion 2 current Run MUST 只允许 Change Action，MUST 使用 Core-derived ResultRef，并 MUST 携带 `changeKey` / `changeId`。review-* Run 的 `inputRef` MUST 由 Core 从 `reviewedRunId` 实际 result.json 派生。

#### Scenario: ContextFile 必填字段

- **WHEN** 校验新建 schemaVersion 2 `ContextFile`
- **THEN** `schemaVersion` MUST 等于 `2`
- **AND** MUST 包含 `runId`、`deliveryId`、`changeKey`、`changeId`、`action`、`role`、`ownerAuthorization`、`runPath`
- **AND** `action` MUST 在 10 个 Change-only Standard Action Catalog 中

#### Scenario: 新 current Run 不允许 Delivery-level shape

- **WHEN** `createRun` 输入缺失 `changeKey` / `changeId`
- **OR** action 为历史 `full-test` / `delivery-finalize`
- **THEN** MUST reject
- **AND** MUST NOT publish pending Run

#### Scenario: review Run inputRef 必须绑定 reviewedRunId

- **WHEN** 创建 `review-explore`、`review-propose` 或 `review-apply`
- **THEN** `reviewedRunId` MUST 存在
- **AND** Core MUST 从对应实际 `result.json` 构造 immutable `context.inputRef`
- **AND** 目标缺失、不可读或 fingerprint 不匹配 MUST 在 Run publish 前 fail closed

#### Scenario: context 身份必须匹配 Change path

- **WHEN** 校验 schemaVersion 2 current Run
- **THEN** `deliveryId`、`changeId`、`runId` 与 `runPath` MUST 和实际目录一致
- **AND** 任一不一致 MUST reject 或收集 `FactConflict`

### Requirement: Bootstrap Run 兼容性 + 三路判别器

Reader MUST 兼容既有 Bootstrap/legacy Run。schemaVersion 2 current Change Run MUST 走严格 current schema，验证失败 MUST fail closed，MUST NOT 泛化降级。schemaVersion 1 或缺失 MUST 走 bounded legacy recognizer；该 recognizer MAY 识别历史 `full-test` / `delivery-finalize` Delivery-level Run，但只用于历史读取/Run-ID 兼容，MUST NOT 将其提升为 current `FormalAction`、current Policy Run 或新 Run 创建能力。其他 schemaVersion MUST fail closed。

#### Scenario: schemaVersion 2 current Change Run 严格校验

- **WHEN** Reader 读取 `schemaVersion=2` 的 current Change Run
- **THEN** MUST 使用 Change-only `ContextFile` schema + identity validation
- **AND** malformed current Run MUST 收集 `FactConflict`
- **AND** MUST NOT 因失败退回 legacy best-effort

#### Scenario: legacy recognizer 可识别历史 Delivery Action

- **WHEN** Reader/NNN enumeration 遇到 `schemaVersion=1` 或缺失的历史 Run
- **AND** action 为 `full-test` 或 `delivery-finalize`
- **THEN** MAY 识别为 bounded legacy Delivery Run
- **AND** MUST NOT 将该 action 加回 current Action Catalog
- **AND** MUST NOT 允许 `createRun` / `writeRunResult` 新建或继续该模型

#### Scenario: legacy terminal bytes 不迁移

- **WHEN** bounded legacy reader 识别历史 Delivery-level Run
- **THEN** MUST NOT 修改、迁移或重写其 `context.json` / `result.json`
- **AND** current Policy MUST 从 Delivery Manifest/Verification/Owner/Git facts 读取 Delivery lifecycle，而不是 replay 该 Run

### Requirement: Review verdict 重建 + reviewed-Run 连接

Reader MUST 从 review-* Run 重建 `ReviewVerdictFact`（`reviewRunId` + `verdict` + `reviewedRunId` + `blockingAuthorities`）。对 current schemaVersion 2 completed Review，`blockingAuthorities` MUST 从 Reviewer-owned `reviewFindings` 中 severity=`blocking` 的 `blockingAuthority` 派生、按固定 authority catalog 去重排序。`approved` MUST 投影空集合；`changes-requested` MUST 至少投影一个 authority。review-* Run 缺失 verdict、reviewed-Run linkage 或无法形成合法 blocking authority 时 MUST fail closed。

为保持 Q1 前 immutable terminal Review 可读，Reader MAY 对**已持久化且缺少 `blockingAuthority` 的旧 typed blocking finding**做有界 read compatibility：若旧 finding 含合法 `requiredChange`，MAY 仅在 Reader projection 中将其解释为 `author`；新 terminal publish MUST NOT 再省略 `blockingAuthority`。

#### Scenario: current review 重建 blocking authorities

- **WHEN** Reader 读取 completed schemaVersion 2 review-* Run
- **AND** `reviewVerdict=changes-requested`
- **AND** blocking findings 均有合法 `blockingAuthority`
- **THEN** MUST 重建 matching `ReviewVerdictFact`
- **AND** `blockingAuthorities` MUST 是当前 blocking findings authority 的 deterministic 去重集合

#### Scenario: approved Review authority 集合为空

- **WHEN** `reviewVerdict=approved`
- **THEN** `blockingAuthorities` MUST 为空
- **AND** blocking finding 不得存在

#### Scenario: 旧 immutable finding 缺 authority 有界映射为 author

- **WHEN** 已存在 terminal Review 的 blocking finding 缺失 `blockingAuthority`
- **AND** 其旧 schema 具有合法非空 `requiredChange`
- **THEN** Reader MAY 在 Policy projection 中映射为 `author`
- **AND** MUST NOT 回写或迁移原 result.json
- **AND** 新 terminal Review MUST NOT 使用该兼容形状

#### Scenario: 无法确定 authority 必须 fail-closed

- **WHEN** `changes-requested` Review 的 blocking finding 既无合法 `blockingAuthority` 又不满足旧 author-compatible 形状
- **THEN** MUST 收集 `FactConflict`
- **AND** MUST NOT 默认为 owner/verification/external 或任意推进

### Requirement: RunResultFile 使用 Lean closed allowlist 与 typed reviewFindings

schemaVersion 2 `RunResultFile` MUST 只持久化执行、交接与恢复所需的 closed allowlist。completed review-* Run MAY 携带 Reviewer-owned `reviewVerdict` 与 typed `reviewFindings`；非 review Run MUST NOT 携带二者。新 terminal Review 的 blocking finding MUST 使用 `blockingAuthority: author | owner | verification | external`。`requiredChange` 仅用于 Author-actionable blocking finding；non-author blocker MUST NOT 伪造 Author requiredChange。

#### Scenario: reviewFindings 最小结构

- **WHEN** 新 completed review-* Run 写入 `reviewFindings`
- **THEN** 每项 MUST 包含非空 `id`、`title`、`problem`
- **AND** `severity` MUST 为 `blocking` 或 `non-blocking`
- **AND** `location` MAY 为非空 string
- **AND** blocking finding MUST 包含 `blockingAuthority ∈ {author, owner, verification, external}`
- **AND** non-blocking finding MUST NOT 参与 blocking authority projection

#### Scenario: author blocker 必须提供 requiredChange

- **WHEN** finding 为 `severity=blocking` 且 `blockingAuthority=author`
- **THEN** `requiredChange` MUST 为非空 string

#### Scenario: non-author blocker 不伪造 requiredChange

- **WHEN** finding 为 `severity=blocking` 且 `blockingAuthority ∈ {owner, verification, external}`
- **THEN** `requiredChange` MUST absent
- **AND** Author MUST NOT 通过修改 candidate 来伪造该 authority fact

#### Scenario: review verdict 与 findings 一致

- **WHEN** `reviewVerdict=changes-requested`
- **THEN** MUST 至少存在一个 blocking finding
- **AND** 新 terminal blocking finding MUST 具有合法 `blockingAuthority`
- **AND** `reviewVerdict=approved` 时 MUST 不存在 blocking finding

#### Scenario: 非 review Run 不复制 Reviewer payload

- **WHEN** Run Action 不是 review-*
- **THEN** `reviewVerdict` 与 `reviewFindings` MUST absent
- **AND** 如需消费 reviewer 结果 MUST 通过 review Run result reference / Reader projection

### Requirement: Reader 必须按当前 Policy relevance 选择 Run scope

Reader MUST 在解析 Run 内容前根据 Delivery Manifest 选择 current Policy relevance。最多一个 `state=active` Change 的 Change-level Run 目录进入 current Run/Review projection。历史 Delivery-level Run MUST NOT 进入 current Policy Run projection；Delivery Full Test / Finalize 事实继续来自 Delivery Manifest、Owner authorization、Verification 与 Git authority。历史 Delivery-level Run MAY 仅由 bounded legacy reader/Run-ID enumeration 使用。

#### Scenario: active Change 只投影自身 Runs

- **WHEN** Manifest 中 Q1 completed、Q2 active、E1 planned
- **THEN** Reader MUST 将 Q2 Run 目录作为 Change-level Policy input
- **AND** MUST NOT replay Q1/E1 Change-level Run corpus 作为 Q2 lineage/conflict input

#### Scenario: historical Delivery Run 不决定 Delivery behavior

- **WHEN** current active Delivery 的 Run tree 含历史 `full-test` / `delivery-finalize` Run
- **THEN** MUST NOT 把该 Run 加入 current `snapshot.runs`
- **AND** MUST NOT 因该 Run 推导 Full Test / Finalize next behavior

#### Scenario: 无 active Change 时 completion/checkpoint 来自 Manifest/Git

- **WHEN** 当前不存在 active Change
- **THEN** Change completion/dependency/checkpoint facts MUST 来自 Manifest/Git authority
- **AND** MUST NOT replay completed Change 或 historical Delivery Run corpus 重新证明这些事实

### Requirement: Revision Run 必须精确绑定 matching changes-requested source review

`revise-explore`、`revise-propose`、`revise-apply` MUST 通过 `sourceReviewRun` + `sourceReviewVerdict=changes-requested` 绑定 matching stage 的 completed Reviewer result，并且该 Review 的 current blocking authority projection MUST 为 author-only。该 lineage 只用于保证 Author 修订的是正确 reviewed target；non-author blocker MUST NOT 创建 Revision Run。

#### Scenario: matching author-only source review 才允许 Revision

- **WHEN** 创建或读取 `revise-<stage>` Run
- **THEN** `sourceReviewRun` MUST 指向 matching completed `review-<stage>`
- **AND** source review verdict MUST 为 `changes-requested`
- **AND** source review 的 `reviewedRunId` MUST 对应当前 stage producer Run
- **AND** source review 的 blocking authorities MUST 非空且全部为 `author`
- **AND** 任一 mismatch 或 non-author authority MUST fail closed

#### Scenario: non-author blocker 不建立 source revision tuple

- **WHEN** matching Review 的任一 blocking authority 为 `owner`、`verification` 或 `external`
- **THEN** MUST NOT 创建 `revise-*` Run
- **AND** MUST NOT 用 `sourceReviewRun/sourceReviewVerdict` 伪装 authority resolution
