## MODIFIED Requirements

### Requirement: terminal replay 必须 exact 且幂等

terminal admission MUST 绑定 exact persisted Run、matching current/historical ActionPackage shape 与 canonical logical descriptor。E2 checkpoint 前，E2 自身 Apply/revise-apply MUST 保持 pre-E2 runner 的 entry/resume protocol，并按 `fresh post-action observation → deterministic generic selection/check execution → deterministic verification.md publication → existing migration-sidecar binding → terminal result CAS-last` 完成；该 migration path MUST NOT 新增 sidecar/schema/renderer/Catalog generation。recognized E2 checkpoint 后，或 fresh/downstream repository 不存在 Flowkit pre-E2 migration lineage时，prospective Apply/revise-apply MUST 按同一 logical flow把 compact point-in-time binding写入 `result.json` → CAS-last，并且不得生成 per-Run verification sidecar。相同 Run 上 canonical logical descriptor 相同的重复提交 MUST 按 persisted state exact recovery 或返回既有 terminal；descriptor、Role、Action、binding、structural shape 或 identity 不同 MUST fail closed。

#### Scenario: concurrent callers 提交相同 terminal descriptor

- **WHEN** 多个 caller 对同一 pending Run 提交 canonical-equivalent terminal descriptor
- **THEN** 至多一个 writer MUST 发布 terminal result
- **AND** 其余 caller MUST 读取并返回同一 persisted terminal state

#### Scenario: record present 而 Run 仍 pending

- **WHEN** pre-E2 runner 已存在 immutable selection/evidence binding 与 matching Markdown，但 producing Run 仍 pending
- **AND** exact replay package/descriptor canonical-equivalent
- **THEN** admission MUST 校验既有 persisted binding 后按既有 terminal CAS-last 语义继续
- **AND** unknown/ambiguous/mixed persisted shape MUST fail closed
- **AND** MUST NOT 把 sidecar contract要求给 post-E2 writer

#### Scenario: completed terminal 缺失 post-action binding

- **WHEN** Apply/revise-apply Run 已存在 completed terminal result，但该 persisted shape 所需的 verification binding 缺失或不匹配
- **THEN** Reader/admission MUST fail closed 为 conflict
- **AND** MUST NOT 通过 terminal-time backfill、future Catalog 重算或 Markdown重渲染修复历史 terminal authority

#### Scenario: post-E2 Markdown present 而 Run 仍 pending

- **WHEN** deterministic `verification.md` 已发布但 post-E2 producing Run 仍 pending
- **AND** exact replay package/descriptor canonical-equivalent
- **THEN** admission MUST 从 persisted compact entry identity + current candidate 重算 selection/checks/publication
- **AND** matching 时 MAY 覆盖同一 deterministic Markdown 并继续 terminal CAS
- **AND** MUST NOT 创建 verification-selection/evidence sidecar 或 replacement Run

### Requirement: ActionPackage 必须携带 typed declaration identity

Existing pre-E2 ActionPackage v2 MUST 保持其 typed declaration/entry semantics 并作为 bounded historical/current-migration input被读取；E2 MUST NOT 因 migration 新增 `ActionPackage v3` 或建立独立 ActionPackage version lifecycle。recognized E2 Change Checkpoint 后，或 fresh/downstream repository 不存在 Flowkit pre-E2 migration lineage时，current ActionPackage projection MUST 直接跟随 current implementation，并以 closed structural shape 保存 selected Action、approved Design source identity、canonical ordered mutation selectors 与 compact entry workspace identity；latest reader MUST 通过 structural current-shape recognition 与 bounded historical recognition 区分它们。Historical ActionPackage v1/v2 bytes MUST immutable，MUST NOT 被补字段或升级 authority。若 post-E2 current shape无法与 historical shape closed、unambiguous 区分，E2 MUST fail Proposal assumption而不是临时增加 component version。

#### Scenario: historical ActionPackage v1 被读取

- **WHEN** Reader 遇到 immutable ActionPackage v1
- **THEN** Reader MUST 按既有 v1 contract 读取
- **AND** MUST NOT 假定其包含 typed mutation declaration、compact entry identity 或 exact retry fields

#### Scenario: context 与 ActionPackage version 不可交叉合成

- **WHEN** Reader/resume 处理 existing historical context/ActionPackage组合或 post-E2 current structural context/ActionPackage
- **THEN** MUST 使用该 persisted shape 自身的 closed matching contract
- **AND** MUST NOT 从 historical missing fields合成 current authority，也不得把 post-E2 current structural shape降级成 historical package

#### Scenario: E2 checkpoint 前继续 current ActionPackage contract

- **WHEN** E2 尚未形成 recognized Change Checkpoint
- **THEN** E2 lifecycle 的 preparation/review/revise/archive MUST 继续使用 pre-E2 current ActionPackage/persistence path
- **AND** production code 已包含 prospective writer MUST NOT 单独触发 self-activation

#### Scenario: E2 checkpoint 后 current package 使用 compact entry identity

- **WHEN** recognized E2 Change Checkpoint 已存在并开始 F1/后续 Change，或 fresh/downstream repository 使用 current implementation 创建 Standard Run
- **THEN** current Apply/revise-apply ActionPackage projection MUST exact-bind context 中 canonical Base + compact entry delta identity
- **AND** MUST NOT 生成新的 ActionPackage component version number

### Requirement: pending self-drift 必须基于 persisted entry identity

pending continuation MUST 从 persisted entry identity 恢复。Pre-E2 existing Run MUST 使用其 historical full-entry identity contract；recognized E2 checkpoint 后，或 fresh/downstream repository 不存在 Flowkit pre-E2 migration lineage时，current Run MUST 使用 canonical Git Base + compact entry delta 重建 exact entry path state。declaration 覆盖的 Action-owned mutation MUST NOT 单独构成 self-drift；undeclared/unowned path、declaration source drift、applicable Owner/contract change、canonical Base drift、ambiguous persisted shape 或其他 semantic input drift MUST fail closed。

#### Scenario: undeclared path 在 pending 期间变化

- **WHEN** post-entry workspace 出现 declaration 未覆盖的 path change
- **THEN** resume MUST 被拒绝为 semantic drift
- **AND** MUST NOT 通过扩大 declaration 或重写 context 恢复

#### Scenario: compact entry path restored to canonical Base

- **WHEN** 某个 path 在 post-E2 compact entry delta 中是 changed/deleted/untracked，而 current post-action state 恢复为 canonical Base state
- **THEN** Core MUST 将 entry→post 差异识别为 Action mutation
- **AND** MUST NOT 因 current delta 不再包含该 path 而丢失 entry identity

#### Scenario: canonical Base 改变

- **WHEN** exact resume 观察到 repository canonical Base 与 persisted entry identity 不同
- **THEN** resume MUST fail closed
- **AND** MUST NOT 将新的 HEAD 当作同一 Run continuation

## RENAMED Requirements

- FROM: `### Requirement: ActionPackage v2 必须携带 typed declaration identity`
- TO: `### Requirement: ActionPackage 必须携带 typed declaration identity`
