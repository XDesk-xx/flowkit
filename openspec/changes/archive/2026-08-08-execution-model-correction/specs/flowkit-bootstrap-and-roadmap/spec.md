# flowkit-bootstrap-and-roadmap

## MODIFIED Requirements

### Requirement: Run 文件必须保存最低内容且不保存完整对话

Bootstrap 阶段的 Run MUST 保持为 Action execution envelope，而不是 OpenSpec / Verification / Git 的第二套
事实系统。Run 文件只保存执行、精确交接和恢复所需的最小内容。schemaVersion 2 Run 的物理 ResultRef 必须由
Core 派生；schemaVersion 1 历史 Run 继续按 legacy recognizer 读取。

`action.md` MUST 保存当前 Run 的人类可读执行说明：Delivery / Change / Action、Role、Goal、正式 Inputs、
Allowed work、Prohibited work、Required output 和适用 owner authorization。`action.md` MUST NOT 决定下一
Action。

`context.json` MUST 保存机器可读的最小身份、Action、Role、必要的 Core-derived inputRef / review linkage、
constraints、owner authorization 和 runPath。MUST NOT 复制 OpenSpec、Git、Review 或 Verification 的完整状态。

`result.json` MUST 使用持久化层定义的 closed schema。普通 Run 保存最小 ActionResult 与必要 ResultRefs；
review-* Run 可保存 typed `reviewVerdict + reviewFindings`。完整测试日志、完整 Verification、完整 OpenSpec、
Git 状态、archive evidence、consistency scan 与聊天记录 MUST NOT 复制进 Run。

#### Scenario: Run 不复制其他 authority 的完整事实

- **WHEN** Bootstrap 或 Runner 创建 schemaVersion 2 Run
- **THEN** Run MUST 只保存执行与引用所需最小字段
- **AND** MUST NOT 复制完整 OpenSpec、Verification、Git、archive 或聊天事实
- **AND** 这些事实 MUST 继续由各自 authority 拥有

#### Scenario: context.json 不保存自引用 SHA

- **WHEN** Run 创建 context.json
- **THEN** MUST NOT 保存会因当前 Commit 自身变化而立即失效的自引用 SHA
- **AND** 路径与字段冲突时 MUST 阻塞

#### Scenario: result.json 的 nextActionRecommendation 不替代 Policy

- **WHEN** result.json 包含 nextActionRecommendation
- **THEN** 它 MUST 只能是建议
- **AND** Flowkit MUST 通过 Policy 重新计算下一 Action
- **AND** nextActionRecommendation MUST NOT 替代 Policy

#### Scenario: schemaVersion 2 不接受人工 fingerprint

- **WHEN** Bootstrap 手工触发一个由 Core 创建的 schemaVersion 2 Run
- **THEN** Agent MAY 声明 consumed/reviewed target descriptor
- **AND** Agent MUST NOT 手工填写 ResultRef fingerprint、kind 或任意 target path


### Requirement: Run 创建边界必须包含目标改变

新 Run MUST 仅在以下边界创建：正式 Action 改变、执行角色改变、本次目标改变、前一 Run failed/cancelled 后重试同一
Action。只有正式 Action、执行角色和本次目标三者均未改变时，多轮交流、内容完善、补充检查以及普通 Commit 才
MAY 保持在同一个 pending Run。Reviewer Run MUST NOT 预建。

terminal `result.json` MUST 保持 create-once，Run 的 Action、Role、Verdict、Findings 和业务结果 MUST NOT
在 terminal 后被改写。唯一例外是本 spec 定义的 schemaVersion 1 Bootstrap migration-time metadata-only
correction；该例外不改变 terminal result 语义，也不允许 completed → pending。

#### Scenario: 目标改变触发新 Run

- **WHEN** 同一角色执行同一 Action 但本次目标已改变
- **THEN** MUST 创建新 Run
- **AND** MUST NOT 复用前一 Run

#### Scenario: 三者均未改变时复用同一 Run

- **WHEN** 正式 Action、执行角色和本次目标均未改变
- **AND** 当前 Run 仍为 pending
- **THEN** 多轮交流、内容完善和补充检查 MAY 保持在同一个 Run
- **AND** 普通 Commit 不构成创建新 Run 的理由

#### Scenario: Reviewer Run 不预建

- **WHEN** Author 完成 Action
- **THEN** 只完成 Author Run
- **AND** MUST NOT 预建空 Reviewer Run
- **AND** Reviewer Run MUST 在 Reviewer 真正执行 review 时由 Policy 解析创建

#### Scenario: terminal semantic result 不可覆盖

- **WHEN** schemaVersion 2 Run 已 terminal
- **THEN** MUST NOT 修改 result.json、Action、Role、Verdict、Findings 或业务结果
- **AND** MUST NOT 将 completed/failed/cancelled 恢复为 pending

#### Scenario: schemaVersion 1 metadata correction 是唯一 Bootstrap 例外

- **WHEN** owner 明确授权符合 legacy metadata-only correction requirement 的 schemaVersion 1 修正
- **THEN** MAY 只修正不改变 terminal semantic result 的 metadata
- **AND** MUST NOT 修改 result.json、Action、Role、Verdict、Findings 或业务产物
- **AND** 该例外 MUST NOT 扩展到 schemaVersion 2 Run


## ADDED Requirements

### Requirement: 正式 Change artifact 必须位于 Git-tracked canonical lifecycle path

active Change 的正式 Explore、Proposal、Design、Spec、Tasks 和 Verification 产物 MUST 位于
`openspec/changes/<change-id>/` 下的 canonical Git-tracked path。该目录表示 **current Change state**：
合法 `revise-*` MAY 覆盖其拥有的 canonical artifacts；它 MUST NOT 被解释为每个 terminal Run 的 immutable
artifact history store。Change 正常 archive 后，最终 current-state artifacts MUST relocation 到唯一
`openspec/changes/archive/<date>-<change-id>/` lifecycle path。

Flowkit MUST NOT 为解决 revision history 自动建立 `.flowkit/artifacts/**`、`openspec/.history/**` 或其他第二套
OpenSpec artifact snapshot registry。历史 terminal Run 的 mutable artifact ResultRef 验证边界由 persistence
capability 的 generation-aware lineage 规则决定；terminal Run 本身不可改写。

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
- **AND** MUST NOT 为保持前一 terminal Run 的 artifact fingerprint 而禁止正常 revision
- **AND** MUST NOT 修改前一 terminal Run
- **AND** Reader MUST 使用 generation-aware lineage 区分 current 与 superseded mutable artifact refs

#### Scenario: 无合法 revise lineage 的 canonical overwrite 不是正常 revision

- **WHEN** canonical Change artifact 被修改
- **AND** 不存在适用的 matching `changes-requested → revise-*` lineage/window
- **THEN** 该修改 MUST NOT 获得 historical-ref validation 豁免
- **AND** current generation replacement detection MUST 保持 fail-closed

#### Scenario: Archive 后正式产物仍可恢复

- **WHEN** Change 正常完成 archive
- **THEN** 最终 current-state artifacts MUST relocation 到唯一 `openspec/changes/archive/<date>-<change-id>/`
- **AND** archive 后 resume / Reader MUST 能从该 Git-tracked archive lifecycle path 恢复 final Change artifacts
- **AND** MUST NOT 要求修改既有 terminal Run 来适配 revision 或纯路径 relocation

#### Scenario: 不建立 per-Run artifact history store

- **WHEN** 同一 Change 发生多轮 review / revise
- **THEN** Bootstrap MUST NOT 为每个 terminal Run 复制完整 Proposal/Explore/Verification artifact snapshot
- **AND** historical generation 的验证 MUST 依赖正式 Run lineage + generation-aware validation boundary
- **AND** OpenSpec canonical directory MUST 继续作为 current Change contract authority

#### Scenario: scratch 不可作为恢复依赖

- **WHEN** `.tmp/**` 被删除
- **THEN** Flowkit MUST 仍能从正式 facts 恢复 Change 状态和下一 Action
- **AND** review / archive MUST NOT 依赖 `.tmp/**` 作为唯一输入

### Requirement: Bootstrap Verification 必须遵守分层成本边界

Bootstrap 手工执行 Verification 时 MUST 遵守 focused / affected / Delivery Full Test 的层次边界。
Q1 只冻结 timing 与 authorization，不定义具体 npm script 名称或自动选择算法。

#### Scenario: 小修改不默认执行全量测试

- **WHEN** Author 修复局部 finding 且影响面局限
- **THEN** SHOULD 执行 focused checks
- **AND** MUST NOT 因“更安全”默认运行 Delivery Full Test

#### Scenario: 影响共享契约时扩大到 affected checks

- **WHEN** 修改影响共享契约、公共类型或跨模块行为
- **THEN** MUST 扩大到 affected checks
- **AND** 检查范围 MUST 与实际影响面相关

#### Scenario: Full Test 保持 owner authorization

- **WHEN** Apply、Revision、Review 或 Archive 执行
- **THEN** MUST NOT 自动运行 Delivery Full Test
- **AND** Full Test 仍必须等待 Delivery ready 和 owner 明确授权

#### Scenario: 具体验证脚本后置

- **WHEN** Q1 完成
- **THEN** MUST NOT 因 Q1 引入新的 focused/affected/full npm script contract
- **AND** 具体脚本与 performance budget implementation MUST 由后续 hardening Change 冻结

### Requirement: Bootstrap legacy metadata correction 必须是有界例外

Flowkit MUST 将 schemaVersion 1 Bootstrap Run 的 migration-time metadata-only correction 限定为
owner 明确授权的有界例外。符合该边界时 MAY 执行 metadata-only correction，但该例外 MUST NOT 成为
通用 completed Run editor 或长期 Runner API。

#### Scenario: legacy metadata-only correction 允许条件

- **WHEN** owner 明确授权修正 schemaVersion 1 legacy Run metadata
- **THEN** 修正 MUST 不改变 terminal `result.json`
- **AND** MUST 不改变 Action、Role、Verdict、Findings 或业务产物
- **AND** MUST 无已知下游消费冲突
- **AND** Git MUST 保存 before / after

#### Scenario: schemaVersion 2 terminal Run 不适用 legacy 例外

- **WHEN** Run 为 schemaVersion 2 或已由正常 Runner contract 管理
- **THEN** legacy metadata correction 例外 MUST NOT 适用
- **AND** terminal create-once 规则 MUST 保持

#### Scenario: 不提供通用 completed Run editor

- **WHEN** 实现 Q1
- **THEN** MUST NOT 新增可任意修改 completed Run 的 CLI、API 或状态
- **AND** existing `createRun` / `writeRunResult` MUST NOT 自动迁移或重写 legacy Runs
