## MODIFIED Requirements

### Requirement: 正式事实 Reader 遵循 One fact, one authority

Reader MUST 遵循 `One fact, one authority` 原则：每个当前 Policy 所需正式事实从唯一权威来源读取。Reader MUST NOT 做跨权威交叉推断，也 MUST NOT 把 Run 历史记录提升为 OpenSpec、Git、Verification 或 current repository bytes 的持续 authority。只有当前 Policy relevance 范围内的 authority fact 自相矛盾、required fact 缺失、当前 Run schema/identity 无效或当前 immutable lineage binding 错误时，冲突 MUST 收集为 `FactConflict[]`；Reader MUST NOT 自动择优。

#### Scenario: 每个事实从唯一权威读取

- **WHEN** Reader 读取正式事实
- **THEN** 每个事实 MUST 从唯一权威来源读取
- **AND** MUST NOT 从多个权威来源交叉推断同一事实

#### Scenario: 冲突收集不择优

- **WHEN** Reader 检测到当前 Policy relevance 范围内的正式事实冲突
- **THEN** 冲突 MUST 收集到 `FormalFactSnapshot.conflicts`
- **AND** Reader MUST NOT 自动选择其中一个来源
- **AND** Policy 在 `conflicts` 非空时 MUST blocked

#### Scenario: Reader 不调用 OpenSpec CLI

- **WHEN** Reader 读取 OpenSpec 相关事实
- **THEN** MUST 只读取 OpenSpec 目录结构的文件系统事实（存在性、状态摘要）
- **AND** MUST NOT 调用 `openspec` CLI 命令

#### Scenario: 非当前 Policy 历史 Run 不成为 blocking authority

- **WHEN** 已 completed/cancelled/planned Change 的历史 Run 存在旧 schema 差异或 historical mutable ResultRef 无法与 today/current path bytes 对齐
- **AND** 当前 Policy 不消费该 Change 的 Run lineage 来决定当前 Action
- **THEN** Reader MUST NOT 仅因该历史辅助记录问题产生 current blocking `FactConflict`
- **AND** MUST NOT 为此扩张 legacy/generation compatibility authority

### Requirement: ResultRef versionFingerprint 使用 content hash

所有 schemaVersion 2 生产 ResultRef MUST 使用**建立该引用时**真实目标文件内容的 SHA-256 作为 `versionFingerprint`。Caller MUST NOT 成为 fingerprint、kind 或 ref path 的 authority。`run-result` 与当前 Action 正在消费的 handoff binding 必须 exact；completed historical `produced-artifact` 与 terminal `verification-summary` 是 point-in-time external reference，MUST NOT 被 Reader 解释为 future/current path 的永久 immutability authority。`review-apply` 的 `context.verificationInputRef` 是仅在该 current/pending Review entry→completion 生命周期内 exact 的临时 handoff binding。

#### Scenario: versionFingerprint 为文件内容 SHA-256

- **WHEN** Core 构造 ResultRef 的 `versionFingerprint`
- **THEN** MUST 为目标文件当时实际内容的 SHA-256
- **AND** MUST NOT 为 Git Commit SHA

#### Scenario: Run result ResultRef 由 Core 构造

- **WHEN** Core 为 Run `result.json` 创建或消费 ResultRef
- **THEN** MUST 使用 `kind=run-result`
- **AND** versionFingerprint MUST 为该 `result.json` 内容 SHA-256
- **AND** 在当前 handoff/Review lineage 被消费时 MUST 对 create-once `result.json` 做 exact hash 验证

#### Scenario: non-Run artifact ResultRef 由 Core 构造

- **WHEN** Core 为 produced artifact 或 verification summary 创建 ResultRef
- **THEN** kind MUST 由 owning result field 在 Core 内部选择
- **AND** versionFingerprint MUST 为本次 Action 建立引用时目标 artifact 的实际 SHA-256
- **AND** constructor MUST NOT 自动追加 `result.json`
- **AND** 当该 ref 已不再被当前 Action 作为 handoff 消费时，后续合法 lifecycle 修改同一路径 MUST NOT 反向使该历史 ResultRef 本身无效

#### Scenario: caller 不能提供 versionFingerprint

- **WHEN** Action caller 提供 typed target descriptor
- **THEN** MUST NOT 接受 caller-supplied `versionFingerprint`
- **AND** Core MUST 读取真实目标后构造 ResultRef

#### Scenario: verifyResultRef 检测替换

- **WHEN** 某 ResultRef 或其覆盖 generation 正被当前 Action 作为明确 handoff 消费
- **THEN** entry/completion contract MUST 对仍要求不变的 target bytes 做 exact check
- **AND** mismatch MUST fail closed

#### Scenario: historical mutable ResultRef 不做 future current-path replay

- **WHEN** historical `produced-artifact` 或 `verification-summary` ResultRef 的 logical path 在后续合法 Action 中内容变化或发生 OpenSpec archive relocation
- **THEN** Reader MUST NOT 仅因 future/current physical bytes 与 historical fingerprint 不同产生 `FactConflict`
- **AND** current exact validation MUST 仅发生在拥有明确当前 Action correctness 目的的 entry/completion 边界
- **AND** MUST NOT 使用 Git Commit SHA 替代内容 hash

### Requirement: 每个 current propose effective set 必须精确覆盖当前 specs namespace

每个 terminal `propose` 与 `revise-propose` Run MUST 由 Core 从**该 Action terminal 时的当前 OpenSpec state**重新派生完整 Proposal bundle，不得通过 predecessor ResultRef inheritance 或 caller changed-tag subset 构造 effective set。完整集合 MUST 包含 `proposal.md`、`design.md`、`tasks.md` 与当时完整 `specs/**` namespace。

#### Scenario: revise-propose 未声明 specs 且 namespace 未变化可继承

- **WHEN** initial `propose` terminal completion
- **THEN** Core MUST 派生 proposal、design、tasks 与完整 current `specs/**` refs
- **AND** singleton 缺失或 specs 枚举失败 MUST 阻止 terminal publication

#### Scenario: revise-propose 未声明 specs 但新增 spec 必须拒绝 terminal

- **WHEN** matching changes-requested review 后执行 `revise-propose`
- **THEN** Core MUST 在 terminal completion 重新读取当前 proposal、design、tasks 与完整 `specs/**`
- **AND** MUST 为完整 current bundle 派生新的 point-in-time refs
- **AND** MUST NOT 从 predecessor Run 继承未声明 artifact refs
- **AND** Caller MUST NOT 通过 changed-tag subset 缩小本次 produced set

#### Scenario: revise-propose 声明 specs 后 Core 绑定完整 successor namespace

- **WHEN** `propose` 或 `revise-propose` 准备 terminal publish
- **THEN** produced specs logical-ref set MUST 与当前 `specs/**` namespace 精确相等
- **AND** namespace 新增/删除 MUST 直接反映在本次完整 produced set
- **AND** MUST NOT 需要 revision-window 或 predecessor effective-set merge 才能表达该变化

#### Scenario: successor terminal 后 review entry 仍拒绝未绑定 namespace drift

- **WHEN** 创建或完成 `review-propose`
- **THEN** 被审查 producer Run 的完整 produced set MUST 与当前 proposal、design、tasks、`specs/**` bytes/namespace 精确匹配
- **AND** mismatch MUST fail closed

### Requirement: review Run 必须精确绑定被审查 result 内容

review-* Run MUST 通过 Core-derived `context.inputRef` 精确绑定 `reviewedRunId` 的实际 terminal `result.json`。该 immutable binding 在 review entry 与 completion 都 MUST 保持一致。`review-explore` / `review-propose` 还 MUST 在 entry 与 completion 对被审查 producer Run 的完整 OpenSpec artifact 输出做 current exact binding；`review-apply` 不因此获得 Proposal/OpenSpec historical replay authority，但 MUST 通过 Core-owned `context.verificationInputRef` 精确绑定 entry 时的 current `verification.md`，并在 completion 重验同一 generation。

#### Scenario: createRun 建立 reviewed result exact binding

- **WHEN** 创建 review-* Run
- **THEN** Core MUST 从 `reviewedRunId` 定位实际 result.json
- **AND** MUST 构造 `kind=run-result` 的 `context.inputRef`
- **AND** target 缺失或不可读 MUST 阻止 Run 正式 publish

#### Scenario: completion 检测 reviewed result replacement

- **WHEN** review-* Run 完成前 reviewed result.json 已被替换
- **THEN** preflight MUST 检测 fingerprint mismatch
- **AND** MUST 返回 `RESULT_REF_MISMATCH`
- **AND** reviewer result.json MUST 不发布
- **AND** Run MUST 保持 pending

#### Scenario: Reader 对 review binding fail-closed

- **WHEN** Reader 读取 current Policy projection 中 schemaVersion 2 review-* Run
- **AND** inputRef 缺失、目标与 reviewedRunId 不一致、目标不可读或 fingerprint 不匹配
- **THEN** MUST 收集 `FactConflict`
- **AND** MUST NOT 构造有效 `ReviewVerdictFact`

#### Scenario: review Run 不允许自引用 reviewVerdictRef

- **WHEN** Action 为 review-*
- **THEN** `actionResult.reviewVerdictRef` MUST absent
- **AND** reviewer verdict/findings MUST 直接使用 typed top-level payload
- **AND** MUST NOT 构造引用当前 result.json 自身 SHA-256 的 ResultRef

#### Scenario: review-explore 与 review-propose 精确绑定当前 artifact 输出

- **WHEN** 创建或完成 `review-explore` / `review-propose`
- **THEN** `reviewedRunId` MUST 指向该 stage 当前最新 completed producer Run
- **AND** 该 producer 的完整 produced refs MUST 与 current OpenSpec artifact bytes 精确匹配
- **AND** `review-propose` MUST 同时验证 current `specs/**` namespace exact-set
- **AND** mismatch MUST 阻止 entry 或 terminal publication

#### Scenario: review-apply 以 verificationInputRef 绑定 entry-time verification

- **WHEN** 创建 `review-apply`
- **THEN** MUST exact-bind reviewed Apply/Revise-Apply terminal result
- **AND** Core MUST 从 current `verification.md` 派生 `context.verificationInputRef`
- **AND** Caller MUST NOT 提供该 ref 的 path/kind/fingerprint
- **AND** `verificationInputRef` MUST 只允许存在于 `review-apply` context
- **AND** MUST NOT 因此新增 Proposal bundle generation registry、archive path resolver 或 historical OpenSpec mutable ref replay

#### Scenario: review-apply completion 检测 verification drift

- **WHEN** pending `review-apply` 在 completion 前 current `verification.md` 与 persisted `verificationInputRef` 不匹配
- **THEN** completion MUST fail closed
- **AND** reviewer terminal result/verdict MUST 不发布
- **AND** Run MUST 保持 pending

### Requirement: Run completion preflight 在 terminal publish 前验证所有引用

`writeRunResult` MUST 在 terminal serialization/temp-file/fs.link 之前验证**当前 Run 本次发布所需**的 Core-created references 与 Action-owned complete output set。preflight MUST NOT 扫描并重新验证其他 historical Runs 的 mutable artifact/verification refs。失败 MUST 保持当前 Run 为 pending，且 MUST NOT 削弱既有 `assertMutable + fs.link` terminal create-once 协议。

#### Scenario: preflight 成功后才进入 terminal publish

- **WHEN** 当前 Run 所需 immutable targets 存在、可读且 fingerprint 匹配
- **AND** artifact-producing Run 的本次完整 Action-owned output set 已从 current OpenSpec state 派生并验证
- **THEN** `writeRunResult` MAY 进入 serialize → temp → fs.link
- **AND** 既有 create-if-not-exists 并发协议 MUST 保持

#### Scenario: target 缺失保持 pending

- **WHEN** 当前 Run 本次 terminal contract 必需的目标缺失或不可读
- **THEN** MUST 返回 `RESULT_REF_TARGET_MISSING`
- **AND** MUST NOT 写 terminal result.json
- **AND** 同一 Run MUST 保持 pending

#### Scenario: fingerprint mismatch 保持 pending

- **WHEN** 当前 Run 本次需要 exact binding 的 immutable/current-review ResultRef 与真实目标 SHA-256 不一致
- **THEN** MUST 返回 `RESULT_REF_MISMATCH`
- **AND** MUST NOT 写 terminal result.json
- **AND** 同一 Run MUST 保持 pending

#### Scenario: historical mutable ref 不属于当前 completion preflight

- **WHEN** 当前 Run terminal completion
- **THEN** preflight MUST NOT 为完成当前 Run扫描其他 historical Runs 的 produced-artifact / verification-summary refs
- **AND** MUST NOT 要求 predecessor effective-set inheritance 或 generation classification

#### Scenario: terminal Run 仍不可重开

- **WHEN** result.json 已存在且 Run 为 terminal
- **THEN** 既有 `assertMutable` / `fs.link` 规则 MUST 拒绝再次完成
- **AND** terminal Run MUST NOT 恢复为 pending

## ADDED Requirements

### Requirement: Reader 必须按当前 Policy relevance 选择 Run scope

Reader MUST 在解析 Change-level Run 内容前先根据 Delivery Manifest 选择当前 Policy relevance。最多一个 `state=active` Change 的 Run 目录进入 Change-level projection；Delivery-level Run 目录按 Delivery 级 Policy 需求读取。

#### Scenario: active Change 只投影自身 Runs

- **WHEN** Manifest 中 Q1 completed、Q2 active、E1 planned
- **THEN** Reader MUST 将 Q2 Run 目录作为 Change-level Policy input
- **AND** MUST NOT replay Q1/E1 Change-level Run corpus 作为 Q2 lineage/conflict input

#### Scenario: active Change malformed current Run 仍阻塞

- **WHEN** active Change 中存在 schemaVersion 2 Run
- **AND** 其 context/result 违反适用 closed schema、identity 或 required immutable lineage
- **THEN** Reader MUST 收集 `FactConflict`
- **AND** Policy MUST 继续 fail-closed

#### Scenario: 无 active Change 时历史 Runs 不替代 manifest/Git

- **WHEN** 当前不存在 active Change
- **THEN** Change completion/dependency/checkpoint facts MUST 继续来自 Manifest/Git authority
- **AND** MUST NOT replay completed Change 全部 Runs 来重新证明这些事实

#### Scenario: Archive 后 Checkpoint pending 不重新投影 closed Change Runs

- **WHEN** OpenSpec archive operation success 后 Flowkit 已记录 Change state=`completed`
- **AND** 该 Change 尚无对应 `change-checkpoint` Git boundary
- **THEN** Reader MUST 保持该 closed Change 的 Change-level Run corpus 不进入 current Policy projection
- **AND** Checkpoint-pending MUST 由 Manifest completed state + Git boundary authority 表达
- **AND** MUST NOT 为获得 Checkpoint 上下文重新提升 historical Run authority

### Requirement: Run pending 只表示 non-terminal execution status

`pending` MUST 只表示 Run 已创建但 terminal `result.json` 尚未发布。Action 与 Change MUST NOT 获得 `pending` 主状态；Reader/persistence MUST NOT 从 pending 推导 artifact revision-window、generation ownership 或 external authority lifecycle。

#### Scenario: pending Run 只需要 non-terminal context

- **WHEN** Run 有合法 `action.md/context.json` 且 result.json 不存在
- **THEN** Run MUST 投影为 `pending`
- **AND** MUST NOT 要求 terminal-only actionResult / reviewVerdict / ResultRef

#### Scenario: pending revise 不创建 artifact revision-window authority

- **WHEN** matching review 后创建 pending `revise-explore` / `revise-propose` / `revise-apply`
- **THEN** pending 只表示该 Revision 尚未 terminal
- **AND** Reader MUST NOT 因此建立 `revision-window` generation class
- **AND** historical mutable refs 本来就 MUST NOT 被持续绑定 current path

### Requirement: Review 到下一 Action 必须保留最小 current exact handoff

删除 historical mutable replay 时，Flowkit MUST 仍保证下一 Action 消费的是刚刚被 Review 覆盖的 current generation。该校验 MUST 在下一 Action 的 pending Run 正式 publish 前由 Core 完成；Action-owned 合法 mutation MAY 只在该 entry check 成功后发生。该机制 MUST 是局部 handoff，不得恢复 global generation registry。

对于 `propose`、`apply`、`archive`，Q2 MUST NOT 强制新增 `sourceReviewRun/sourceReviewVerdict` tuple；它们 MUST 使用本次 Action 的 `consumedRunId` 指向实际消费的 completed Review，Core MUST 读取真实 Review verdict/context/reviewedRunId 并完成 handoff 校验。

#### Scenario: approved review-explore 到 propose 的 current handoff

- **WHEN** `propose` 消费 completed approved `review-explore`
- **THEN** pending publish 前 Core MUST 追到该 Review 的 `reviewedRunId`
- **AND** current `explore.md` MUST 与被审 explore generation 精确匹配
- **AND** drift MUST 阻止 propose Run publish
- **AND** entry 成功后 propose MAY 创建/修改其 Action-owned Proposal artifacts

#### Scenario: changes-requested review-explore 到 revise-explore 的 current handoff

- **WHEN** `revise-explore` 消费 matching changes-requested `review-explore`
- **THEN** pending publish 前 current `explore.md` MUST 仍与被审 generation 精确匹配
- **AND** entry 成功后 revise-explore MAY 修改 `explore.md`

#### Scenario: review-propose 到 apply 或 revise-propose 的 current handoff

- **WHEN** `apply` 消费 approved `review-propose` 或 `revise-propose` 消费 matching changes-requested `review-propose`
- **THEN** pending publish 前 current `proposal.md + design.md + tasks.md + specs/**` MUST 与被审 proposal generation 精确匹配
- **AND** specs namespace MUST exact-set
- **AND** drift MUST fail closed
- **AND** entry 成功后当前 Action MAY 仅按自身 ownership 执行合法 mutation

#### Scenario: review-apply 到 revise-apply 或 archive 的 current handoff

- **WHEN** `revise-apply` 消费 changes-requested `review-apply` 或 `archive` 消费 approved `review-apply`
- **THEN** pending publish 前 Core MUST exact-bind该 Review immutable result
- **AND** current `verification.md` MUST 与该 completed Review 的 terminal `verificationSummaryRef` 精确匹配
- **AND** archive 的该检查 MUST 发生在调用 OpenSpec archive 之前
- **AND** OpenSpec archive 成功后 MUST NOT 再做 relocation/path replay

#### Scenario: review 后下一 Action 前发生 drift 必须阻止旧 verdict 被复用

- **WHEN** Review terminal 后、下一 Action pending publish 前，被 Review 覆盖且仍要求保持不变的 current artifact/verification bytes 发生变化
- **THEN** Core MUST fail closed
- **AND** MUST NOT 用旧 approved/changes-requested verdict 推进新的 generation
- **AND** MUST NOT 通过 global historical replay 实现该检查

### Requirement: Revision Run 必须精确绑定 matching changes-requested source review

`revise-explore`、`revise-propose`、`revise-apply` MUST 通过 `sourceReviewRun` + `sourceReviewVerdict=changes-requested` 绑定 matching stage 的 completed Reviewer result。该 lineage 只用于保证 Finding 被修到正确 reviewed Run，不得推广为所有非-review Action 的第二套 source-review state machine。

#### Scenario: matching source review 才允许 Revision

- **WHEN** 创建或读取 `revise-<stage>` Run
- **THEN** `sourceReviewRun` MUST 指向 matching `review-<stage>` completed Run
- **AND** source review verdict MUST 为 `changes-requested`
- **AND** source review 的 `reviewedRunId` MUST 对应 Policy 当前 stage producer Run
- **AND** mismatch MUST fail closed

#### Scenario: propose/apply/archive 不强制 sourceReview tuple

- **WHEN** Action 为 `propose`、`apply` 或 `archive`
- **THEN** Q2 MUST NOT 因 Revision lineage 规则强制新增 `sourceReviewRun/sourceReviewVerdict`
- **AND** 其合法性继续由 Policy、Owner authorization 与各自 Action contract 决定
- **AND** 若该 Action 消费 Review，MUST 通过 `consumedRunId` + Core entry validation 完成上述局部 exact handoff

### Requirement: review-apply 必须区分 entry verification binding 与 terminal point-in-time summary

`review-apply` create entry MUST 由 Core 从 current `verification.md` 派生 `context.verificationInputRef`，用于冻结本次 Review 实际审查的 Verification generation；completion MUST exact-check persisted input ref。只有 completed `review-apply` MAY 新建 `verificationSummaryRef`，其 fingerprint MUST 由 Core 从 terminal 时当前 `verification.md` bytes 派生。`verificationInputRef` 与 `verificationSummaryRef` 都不得形成跨后续 Revision/Archive 的 global generation authority。

#### Scenario: review-apply entry 记录可 resume 的 verification binding

- **WHEN** 创建 `review-apply`
- **AND** current `verification.md` 存在且可读
- **THEN** Core MUST 在 context 写入 `verificationInputRef`
- **AND** versionFingerprint MUST 来自 entry 时当前 bytes
- **AND** Caller MUST NOT 提供该 ref

#### Scenario: review-apply terminal 记录当前 verification summary

- **WHEN** `review-apply` completed
- **AND** current `verification.md` 仍与 `verificationInputRef` 精确匹配
- **THEN** Core MUST 构造 `kind=verification-summary` 的 point-in-time ResultRef
- **AND** versionFingerprint MUST 来自 terminal 时当前 bytes

#### Scenario: review-apply 缺 verification record 保持 pending

- **WHEN** `review-apply` create/completion 所需 current `verification.md` 不存在或不可读
- **THEN** MUST 返回当前 Action contract 的 target-missing error
- **AND** review-apply MUST 不发布 terminal result

#### Scenario: review 期间 Verification drift 保持 pending

- **WHEN** `review-apply` 已 pending
- **AND** current `verification.md` 与 persisted `verificationInputRef` 不匹配
- **THEN** completion MUST 返回 mismatch error
- **AND** MUST NOT 发布 verdict/result
- **AND** 同一 Run MUST 保持 pending，可在恢复正确 generation 后继续 completion

#### Scenario: 后续 Verification 更新不反向使历史 ref 冲突

- **WHEN** completed Review 之后合法 `revise-apply` 更新 `verification.md`
- **THEN** 旧 `verificationInputRef` / `verificationSummaryRef` MUST 保持 point-in-time 历史记录
- **AND** Reader MUST NOT 将新 bytes 与旧 fingerprint 比较并产生 historical `FactConflict`

#### Scenario: 其他 Action 不拥有 verification binding/summary

- **WHEN** Action 不是 `review-apply`
- **THEN** `context.verificationInputRef` MUST absent
- **AND** `apply`、`revise-apply`、`archive` 的 `verificationSummaryRef` MUST absent
- **AND** archive MUST NOT 为 historical ref 引入 archive-aware resolver

## REMOVED Requirements

### Requirement: mutable Change artifact ResultRef 必须使用 generation-aware validation

**Reason**: 该 requirement 让 Reader 通过 `current / superseded / revision-window` 持续解释 historical mutable OpenSpec refs，把 Run 提升为 artifact lifecycle authority；与新的 thin orchestration boundary 冲突。

**Migration**: 每个 artifact-producing terminal Run 改为 Core 派生完整当前 point-in-time output set；Review 在当前 entry/completion exact-bind 被审查集合；历史 mutable refs 不再 future/current path replay。

### Requirement: current effective Change artifact ResultRef 必须跨 archive relocation 保持可验证

**Reason**: OpenSpec archive relocation/spec sync 属于 OpenSpec authority。让 Reader 解析 archive physical path 并持续验证历史 Run fingerprint 会形成第二套 archive lifecycle proof。

**Migration**: persisted historical ref 保持原记录，不重写；Flowkit 不做 post-archive historical mutable ref validation。未来 archive Adapter 只消费 OpenSpec operation success/failure。

### Requirement: verificationSummaryRef 使用 generation-aware logical ref 与 Action-owned inclusion

**Reason**: Action ownership 需要保留，但 generation-aware historical verification replay 不需要。

**Migration**: 由新增的 `verificationSummaryRef 是 review-apply 的 point-in-time summary reference` requirement 取代。

### Requirement: Reader 必须覆盖 revision 到 archive 的完整 generation lifecycle

**Reason**: 该 requirement 的两阶段 generation classification/effective-set/archive replay 是被删除复杂度的总入口，不属于当前 Policy 最小输入。

**Migration**: Reader 只读取 current Policy-relevant Runs；artifact producer 每次 terminal 自包含完整 current output refs；Review/Revision 使用局部 exact lineage。
