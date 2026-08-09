## MODIFIED Requirements

### Requirement: 正式 Change artifact 必须位于 Git-tracked canonical lifecycle path

active Change 的正式 Explore、Proposal、Design、Spec、Tasks 和 Verification 产物 MUST 位于 `openspec/changes/<change-id>/` 下的 canonical Git-tracked path。该目录表示 **OpenSpec current Change state**：合法 `revise-*` MAY 覆盖其拥有的 canonical artifacts；它 MUST NOT 被解释为每个 terminal Run 的 immutable artifact history store。Change 正常 archive 后，最终 current-state artifacts 的 relocation/spec sync 属于 OpenSpec archive lifecycle。

Flowkit MUST NOT 为 revision history 自动建立 `.flowkit/artifacts/**`、`openspec/.history/**`、generation registry 或其他第二套 OpenSpec artifact snapshot authority。历史 terminal Run 中的 mutable ResultRef 只表达建立引用时的 point-in-time content，不要求 future/current path 永久匹配。

#### Scenario: Explore 正式产物路径

- **WHEN** Explore Action 形成正式结论
- **THEN** MUST 写入 `openspec/changes/<change-id>/explore.md`
- **AND** MUST NOT 只写入 `.tmp/explore/**`

#### Scenario: Change 正式产物集合

- **WHEN** Change 进入对应阶段
- **THEN** 正式产物 MAY 包含 `proposal.md`、`design.md`、`specs/**`、`tasks.md`、`verification.md`
- **AND** 这些正式产物 MUST 可被 Git 跟踪和恢复

#### Scenario: 合法 revise 覆盖 canonical current-state artifact

- **WHEN** matching `changes-requested` 后执行对应合法 `revise-explore` / `revise-propose` / `revise-apply`
- **THEN** Author MAY 修改该 Action 拥有的 canonical current-state artifacts
- **AND** MUST NOT 为保持前一 terminal Run 的 mutable artifact fingerprint 而禁止正常 revision
- **AND** MUST NOT 修改前一 terminal Run
- **AND** `pending` MUST NOT 因此被提升为 artifact revision-window authority

#### Scenario: 无合法 revise lineage 的 canonical overwrite 不是正常 revision

- **WHEN** canonical Change artifact 在没有合法 Action contract 的情况下被修改
- **THEN** 该文件的 current truth 仍归 OpenSpec/filesystem/Git authority
- **AND** Flowkit MUST NOT 通过建立全历史 generation model 把自己升级为 filesystem tamper monitor
- **AND** 当前 Review/Revision 等明确 handoff 边界仍 MUST 执行其适用 exact validation

#### Scenario: Archive 后正式产物仍可恢复

- **WHEN** OpenSpec archive operation 成功
- **THEN** 最终 Change artifacts MUST 由 OpenSpec canonical archive lifecycle + Git repository bytes 提供恢复事实
- **AND** Flowkit MUST NOT 为 archive relocation 重写既有 terminal Run
- **AND** MUST NOT 通过 archive-aware historical ResultRef replay 二次证明 OpenSpec operation

#### Scenario: 不建立 per-Run artifact history store

- **WHEN** 同一 Change 发生多轮 review / revise
- **THEN** Bootstrap MUST NOT 为每个 terminal Run 复制完整 Proposal/Explore/Verification artifact snapshot
- **AND** Run MAY 保存 Core-derived point-in-time ResultRef
- **AND** OpenSpec canonical directory MUST 继续作为 current Change contract authority

#### Scenario: scratch 不可作为恢复依赖

- **WHEN** `.tmp/**` 被删除
- **THEN** Flowkit MUST 仍能从正式 facts 恢复 Change 状态和下一 Action
- **AND** review / archive MUST NOT 依赖 `.tmp/**` 作为唯一输入

### Requirement: Git 正式边界必须仅为三种

一个 Delivery 的 Git 历史 MUST 仅要求三种正式边界：1 个 Delivery Start Commit + 每个 Change 1 个 Change Checkpoint Commit + 1 个 Delivery Final Commit + 0 到若干按需普通 Commit。

Delivery Start Commit MUST 每个 Delivery 一次，用于标识 Delivery 正式开始、建立历史起点和第一个 Change 的 Diff 起点。

Change Checkpoint Commit MUST 每个**已经在 OpenSpec archive operation success 后由 Flowkit 记录为 `completed`** 的 Change 一次，前置条件 MUST 包括：Change 契约完成、适用 Verification 满足、Review Approved、Blocking Findings 清零、OpenSpec 已 Archive、Change 状态为 completed、Archive Run 已完成。Checkpoint MUST 是 Change 关闭后的 Flowkit/Git 下一边界，MUST NOT 参与 `active → completed` 判定，也 MUST NOT 要求重新激活 Change。

Delivery Final Commit MUST 每个 Delivery 一次，前置条件 MUST 包括：所有 required Changes completed、所有 Change 已 Checkpoint、Blocking Findings 清零、Delivery Verification 条件满足、Full Test 状态满足冻结规则、owner 明确批准 Finalize、最终 docs/roadmap/manifest 已收口。

Checkpoint Commit MUST 尽量包含真实收尾变化，MUST NOT 为了边界创建无意义空 Commit。

#### Scenario: Change Checkpoint 前置条件

- **WHEN** 创建 Change Checkpoint Commit
- **THEN** MUST 满足 Change 契约完成、Verification 满足、Review Approved、Blocking Findings 清零、OpenSpec 已 Archive、Change 状态为 completed、Archive Run 已完成
- **AND** MUST NOT 创建无真实变化的无意义空 Commit

#### Scenario: Archive 先关闭 Change，Checkpoint 后续形成

- **WHEN** OpenSpec archive operation success
- **AND** Flowkit 已记录该 operation result
- **THEN** Change MUST 已进入 `completed`
- **AND** 此时即使 Change Checkpoint 尚未形成，也 MUST NOT 保持或恢复为 `active`
- **AND** Flowkit 下一 Git 边界 MUST 为该 completed Change 的 Change Checkpoint

#### Scenario: Delivery Final 前置条件

- **WHEN** 创建 Delivery Final Commit
- **THEN** MUST 满足所有 required Changes completed、所有 Change 已 Checkpoint、Blocking Findings 清零、Delivery Verification 满足、Full Test 状态满足、owner 批准 Finalize、docs/roadmap/manifest 已收口


## ADDED Requirements

### Requirement: AGENTS 必须只约束 Agent 行为并保持语言与 Reviewer 边界

仓库级 `AGENTS.md` MUST 只约束 Agent 在正式 Flowkit/OpenSpec/Git/Reviewer/Verification authority 下如何操作，不得成为 next Action、Change contract 或 Owner decision 的第二套 authority。

面向人的说明性内容默认 MUST 使用简体中文；Action 名、schema key、CLI/code identifier、path、error code、enum 等机器/代码标识 MAY 保持英文。

Reviewer MUST 只读审查 reviewed candidate；除 Reviewer-owned Run/Review artifact 外 MUST NOT 修改 Author artifacts、production code、tests 或 Manifest。Reviewer 发现问题 MUST 通过 Findings/Verdict 返回，在 `changes-requested` 后由 Author 执行对应 Revision；Reviewer MUST NOT 替 Owner 授权 Archive、Checkpoint、Full Test 或 Finalize。

#### Scenario: AGENTS 不成为流程 authority

- **WHEN** AGENTS 描述 Agent 操作规则
- **THEN** MUST NOT 自己决定唯一下一 Action
- **AND** MUST NOT 覆盖 OpenSpec Change contract
- **AND** MUST NOT创造 Owner authorization

#### Scenario: 人类可读内容默认简体中文

- **WHEN** Agent 生成 action.md、Explore/Proposal/Design/Tasks 正文、Review summary/Findings 或 verification summary 等人类可读说明
- **THEN** 默认 MUST 使用简体中文
- **AND** 机器/代码标识 MAY 保持英文

#### Scenario: Reviewer mutation boundary

- **WHEN** Reviewer 执行 review-*
- **THEN** reviewed candidate MUST 只读
- **AND** Reviewer MAY 写自己的 Review Run/artifact
- **AND** MUST NOT 修改 Author artifact、production code、tests 或 Manifest
- **AND** changes-requested MUST 交回 Author 修复
- **AND** Reviewer MUST NOT 自行授予 Archive、Checkpoint、Full Test 或 Finalize
