# flowkit-bootstrap-and-roadmap Specification

## Purpose

定义在 Runner 和 CLI 尚未实现时，如何手工执行同一套 Flowkit 规则，包括 Run 操作、续接上下文、Git 正式边界、owner 授权、Delivery Finalize 和后续 Runner 开发路线。
## Requirements
### Requirement: Bootstrap 必须手工执行同一套 Flowkit 规则

Bootstrap 阶段没有 Runner 和 CLI，MUST 由人和 AI 手工保证 Flowkit 规则成立。Bootstrap MUST NOT 建立第二套 bootstrap-only 流程状态系统（包括 `.bootstrap-state/`、`bootstrap-manifest.yaml`、`temporary-flowkit-state/` 或类似机制）。

Bootstrap 阶段的 Run MUST 与未来 Runner 产生的 Run 使用同一套路径、结构和语义。Policy MUST 仍是唯一权威，即使没有 Runner，下一 Action MUST 由 Policy 根据正式事实计算。

#### Scenario: Bootstrap 不建立第二套状态系统

- **WHEN** Bootstrap 阶段执行 Flowkit 规则
- **THEN** MUST 手工执行同一套 Flowkit 规则
- **AND** MUST NOT 创建 bootstrap-only 的状态、manifest 或 pointer
- **AND** 所有正式事实 MUST 仍由 Flowkit、OpenSpec、Git、Reviewer 和验证工具拥有

#### Scenario: Policy 仍是唯一权威

- **WHEN** Bootstrap 阶段需要确定下一 Action
- **THEN** MUST 由 Policy 根据正式事实计算
- **AND** MUST NOT 由聊天摘要、Agent 建议或 Git 状态决定

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

### Requirement: Run 创建和完成必须不自动 Commit

Run 创建 MUST NOT 自动触发 Git Commit。Run 完成 MUST NOT 自动触发 Git Commit。

Run MAY 与当前 Change 的其他正式内容一起在普通 Commit 或 Change Checkpoint 中进入 Git 历史。

#### Scenario: Run 完成不自动 Commit

- **WHEN** Run 完成
- **THEN** MUST NOT 自动创建 Git Commit
- **AND** Run MAY 在后续普通 Commit 或 Change Checkpoint 中进入 Git 历史

### Requirement: Continuation Context 必须从正式事实生成

Continuation Context MUST 从正式事实生成，包括 Delivery/Change 状态、Runs、OpenSpec、Reviewer Findings/Verdict、Verification 结果和 owner 授权。

Continuation Context MUST NOT 成为新的状态权威。Continuation Context 丢失后 MUST 能重新生成。与正式事实冲突时 MUST 以正式事实为准。Continuation Context MUST NOT 自行推进 Delivery、Change 或 Action 状态。

`nextAllowedAction` MUST 由 Policy 计算，MUST NOT 由 Continuation Context 自行填写。

#### Scenario: Continuation Context 丢失可重建

- **WHEN** Continuation Context 丢失
- **THEN** 后续执行者 MUST 能从正式事实重新生成
- **AND** 重新生成的 Context MUST 与正式事实一致

#### Scenario: Continuation Context 不自行推进状态

- **WHEN** Continuation Context 被生成
- **THEN** MUST NOT 自行修改 Delivery、Change 或 Action 状态
- **AND** nextAllowedAction MUST 由 Policy 计算

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

### Requirement: Change 激活必须不是正式 Git 边界

Change 激活（manifest `planned → active` 与创建 `.openspec.yaml`）MUST NOT 被视为正式 Git 边界，MUST NOT 要求独立 Commit。Change 激活的文件变更 MUST 随当前 Change 的正常工作一起进入 Git 历史。

D1 MUST NOT 定义 "Change Start Commit" 作为与 Delivery Start、Change Checkpoint、Delivery Final 并列的正式边界类型。

#### Scenario: Change 激活不要求独立 Commit

- **WHEN** Change 从 planned 激活为 active
- **THEN** manifest 更新和 .openspec.yaml 创建 MUST NOT 要求独立 Commit
- **AND** 这些文件变更 MAY 随当前 Change 的正常工作（如 explore commit）一起进入 Git 历史

### Requirement: 普通 Commit 必须仅按真实需要创建

普通 Commit MUST 仅在以下真实需要时创建：保存较大或较长工作进度、降低未提交修改丢失风险、跨环境或跨执行者需要稳定版本、Reviewer 需要稳定版本且无法共享工作区、即将中断后需要明确恢复点、用户明确要求保存。

普通 Commit MUST 包含真实变化，MUST NOT 推进 Flowkit 状态，MUST NOT 等于 Action 完成，MUST NOT 等于 Review Approved，MUST NOT 等于 Change Checkpoint。Commit 数量 MUST NOT 影响 Flowkit Policy。

D1 MUST NOT 创建以下 Commit 类型：Action Commit、Run Commit、Session Commit、Conversation Commit、Evidence Commit、Receipt Commit、Handoff 专用空 Commit。

#### Scenario: 普通 Commit 不推进状态

- **WHEN** 创建普通 Commit
- **THEN** MUST 包含真实变化
- **AND** MUST NOT 推进 Flowkit 状态
- **AND** MUST NOT 等于 Action 完成、Review Approved 或 Change Checkpoint

### Requirement: Review 必须不被强制绑定 Git Commit

Review MUST 绑定稳定的 `reviewedResultRef`，但该引用 MUST NOT 被强制为 Git Commit。`reviewedResultRef` MAY 使用 Run ResultRef、artifact version、content hash、Git revision 或其他不可歧义版本引用。

如果被审查结果发生变化，原 Approval MUST 对新结果失效，MUST 重新 Review。

#### Scenario: Review 不要求先 Commit

- **WHEN** Reviewer 需要审查未 Commit 工作区的结果
- **THEN** MAY 使用 Run ResultRef、content hash 或其他不可歧义版本引用
- **AND** MUST NOT 被强制要求先创建 Git Commit

#### Scenario: 被审查结果变化导致 Approval 失效

- **WHEN** Review 已对某结果给出 approved
- **AND** 该结果后来发生变化
- **THEN** 原 Approval MUST 对新结果失效
- **AND** MUST 重新 Review 新结果

### Requirement: owner 授权边界必须由 owner 明确控制

以下决定 MUST 由 owner 明确控制：Delivery 范围变化、冻结决定变更、Apply 授权、Archive 授权、Full Test 授权、corrective Change 创建、Delivery Finalize、破坏性 Git 操作。

Agent、Adapter、Skill、Reviewer、Verification 工具 MUST NOT 自行授予任何 owner 授权。

Full Test MUST 在所有 required Changes Checkpoint 后、Delivery ready 后、owner 明确授权后才运行。Full Test MUST NOT 由 Apply、Revision、Review、Archive 或 Adapter 自动触发。Full Test 失败后 MUST 停在 owner 决策边界，MUST NOT 重新打开已 Checkpoint 的 Change。

#### Scenario: Full Test 不自动触发

- **WHEN** Apply、Revision、Review 或 Archive 完成
- **THEN** MUST NOT 自动触发 Full Test
- **AND** Full Test MUST 等待 owner 明确授权

#### Scenario: 工具不自行授权

- **WHEN** Agent、Adapter、Skill 或 Verification 工具执行
- **THEN** MUST NOT 自行授予 Apply、Archive、Full Test、Finalize 或 corrective Change 授权

### Requirement: D1 必须创建四份正式输出文档

D1 Apply MUST 创建以下四份正式输出文档：

1. `docs/bootstrap-reference.md`：Bootstrap 操作参考，至少覆盖 Bootstrap 最小执行循环、Run 操作规则、续接切点操作性定义、Git 模型、Change 激活非边界、owner 授权边界、媒介中立和旧表述修正对照。
2. `docs/development-roadmap.md`：后续 Runner Delivery 路线，至少包含 Deterministic Core、Change Execution Loop、Delivery Execution Loop 三阶段目标和首次自托管条件。
3. `AGENTS.md`：仓库级开发指令，至少包含 Decision 10 定义的最小规则清单。
4. `.codex/skills/flowkit-git-workflow/SKILL.md`：Git 工作流 Skill，至少覆盖 Decision 10 定义的必须覆盖范围。

所有文档 MUST 与 A1、B1、C1 已冻结事实一致。

#### Scenario: 正式输出文档与冻结事实一致

- **WHEN** D1 Apply 创建四份正式文档
- **THEN** 每份文档 MUST 与 A1、B1、C1 已冻结事实一致
- **AND** MUST NOT 固定 GitHub、Push、PR、本地/远程或具体 AI

### Requirement: D1 正式文档必须对信息交换媒介保持中立

D1 创建的所有正式文档 MUST NOT 把以下任何方式固定为流程前提：GitHub、GitLab 或其他 Forge；Remote 存在；Push 或 Pull；PR 或 MR；本地或远程执行；一个或多个 AI；ChatGPT、Codex 或其他 Provider；Patch、ZIP 或共享目录；PowerShell、Shell 或特定操作系统；Worktree 数量；固定协作拓扑。

D1 正式文档 MUST 只检查：正式结果可读取、上下文可恢复、Policy 可计算下一 Action。

#### Scenario: 文档不固定特定平台

- **WHEN** D1 创建正式文档
- **THEN** MUST NOT 要求 GitHub、Push 或 PR 作为流程前提
- **AND** MUST NOT 固定 ChatGPT、Codex 或具体 Provider 作为正式角色

### Requirement: flowkit-git-workflow Skill 必须只执行已确定的 Git 行为

`flowkit-git-workflow` Skill MUST 只执行已经由 Flowkit 和 owner 确定的 Git 行为。Skill MUST 覆盖：Delivery Branch 命名、Delivery Start 模板、Change Checkpoint 模板、Delivery Final 模板、普通 Commit 按需原则、Action/Run 不自动 Commit、不创建空 Handoff Commit、不把 SHA 写入自引用状态文件、不执行未经授权的破坏性 Git 操作、不自动运行 Full Test。

Skill MUST NOT 拥有：当前 Action 决策权、Change 完成判断权、Delivery Final 判断权、owner 授权权、自动 Commit/Push/Merge 权、流程状态修改权。

Skill MAY 提供：边界检查、Commit Message 模板生成、Git 状态读取、Diff 范围计算、边界 Commit 查找、执行前提示。真正写入 Git MUST 由用户或明确授权的外部操作触发。

#### Scenario: Skill 不拥有流程决策权

- **WHEN** flowkit-git-workflow Skill 执行
- **THEN** MUST NOT 决定当前 Action
- **AND** MUST NOT 判断 Change 完成或 Delivery Final
- **AND** MUST NOT 自动 Commit、Push 或 Merge

#### Scenario: Skill 提供边界检查和模板

- **WHEN** Skill 被调用
- **THEN** MAY 提供边界检查、Commit Message 模板生成和 Git 状态读取
- **AND** 真正写入 Git MUST 由用户或明确授权的外部操作触发

### Requirement: Development Roadmap 必须只包含最小必要后续 Delivery

Development Roadmap MUST 定义三个后续 Runner Delivery 阶段：Deterministic Core、Change Execution Loop、Delivery Execution Loop。

Deterministic Core MUST 目标：Delivery/Change/Run 状态模型、固定 Action Catalog、Policy/canRun/next、正式事实读取、状态持久化、status/next/doctor/resume-context、核心测试。MUST NOT 建立 Gate Registry、Skill Registry、Provider Registry 或通用插件平台。

Change Execution Loop MUST 目标：Delivery/Change 创建、Run 生命周期、Action Package 生成、Action Result 接纳、OpenSpec 薄集成、Review/Findings 最小闭环、Change Verification、Change Archive、Change Checkpoint 识别、完整 Change CLI。Git 行为 MUST NOT 自动业务 Commit。

Delivery Execution Loop MUST 目标：Delivery Ready、Full Test owner 授权、Delivery Findings、corrective Change、Delivery Finalize、Delivery Final 边界、Archify Start/Finalize、sync/resume、thin Agent Adapter、稳定 Runner 发布。

首次自托管 MUST 至少满足：Flowkit 能持久化正式事实、Policy 能唯一确定下一 Action、OpenSpec 集成可用、Review/Revise 闭环可用、Change Verification 可用、Runs 可恢复、Continuation Context 可生成、Change Checkpoint 可识别、Full Test owner 授权边界可用、Delivery Final 可识别、Agent Adapter 不成为第二编排器、稳定 Runner 已发布、端到端 Bootstrap 验收通过。

未来 Delivery 启动时 MUST 使用实际日期，MUST NOT 预先冻结日期。

#### Scenario: Roadmap 不引入过度设计

- **WHEN** Development Roadmap 定义后续 Delivery
- **THEN** MUST NOT 引入 Gate Registry、Skill Registry、Provider Registry 或通用插件平台
- **AND** MUST NOT 预先冻结未来 Delivery 日期

### Requirement: D1 必须不修改 A1、B1、C1 已冻结文档

D1 MUST NOT 修改 A1、B1、C1 已 Checkpoint 的核心文档和 capability spec。D1 MUST 只创建新文档和新的 `flowkit-bootstrap-and-roadmap` capability spec。

若发现与 A1/B1/C1 的真正冲突，MUST 提出新的 corrective Change，MUST NOT 在 D1 中静默改写。

`docs/delivery-lifecycle.md` Section 10 的待定内容由 `docs/bootstrap-reference.md` 覆盖。D1 MUST NOT 直接修改 `docs/delivery-lifecycle.md` 或其他 B1 已冻结文档。若确需修改 B1 文档，MUST 由 owner 授权独立 corrective Change。

#### Scenario: 发现冻结文档冲突

- **WHEN** D1 发现与 A1、B1 或 C1 已冻结文档存在真正冲突
- **THEN** MUST 提出新的 corrective Change
- **AND** MUST NOT 在 D1 中静默修改冻结文档

### Requirement: Delivery Final Audit corrective Change 路径

当 Delivery Final Audit 发现已 Checkpoint 产物的问题时，Flowkit MUST 停在 owner 决策边界，不得自动创建 corrective Change，不得重新打开已 Checkpoint 的 Change，也不得直接塞入 Delivery Final Commit。只有 owner 明确授权后，Flowkit 才创建 corrective Change。

#### Scenario: 发现已 Checkpoint 产物问题

- **WHEN** Delivery Final Audit 发现已 Checkpoint 产物的问题
- **THEN** Policy MUST 停在 owner 决策边界
- **AND** MUST NOT 自动创建 corrective Change
- **AND** MUST NOT 重新打开已 Checkpoint 的 Change
- **AND** MUST NOT 直接塞入 Delivery Final Commit

#### Scenario: owner 授权后创建 corrective Change

- **WHEN** owner 明确授权创建 corrective Change
- **THEN** Flowkit MUST 创建 corrective Change
- **AND** corrective Change MUST 按普通 Change 生命周期完成 Checkpoint

#### Scenario: corrective Change 完成后进入 Full Test

- **WHEN** corrective Change 完成 Checkpoint
- **THEN** Delivery fullTestStatus MUST 转换为 `awaiting-user-decision`
- **AND** Full Test 仍需 owner 明确授权

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

### Requirement: AGENTS 必须只约束 Agent 行为并保持语言与 Reviewer 边界

仓库级 `AGENTS.md` MUST 只约束 Agent 在正式 Flowkit/OpenSpec/Git/Reviewer/Verification authority 下如何操作，不得成为 next Action、Change contract 或 Owner decision 的第二套 authority。

面向人的说明性内容默认 MUST 使用简体中文；Action 名、schema key、CLI/code identifier、path、error code、enum 等机器/代码标识 MAY 保持英文。

Reviewer MUST 只读审查 reviewed candidate；除 Reviewer-owned Run/Review artifact 外 MUST NOT 修改 Author artifacts、production code、tests 或 Manifest。Reviewer 发现问题 MUST 通过 typed Findings/Verdict 返回。`changes-requested` 只表示 target 不可批准；只有 blocking findings 全部属于 `blockingAuthority=author` 时才交回 Author 执行对应 Revision。owner / verification / external blocker MUST 停在各自 authority boundary，MUST NOT 通过 Author no-op revise 关闭。Reviewer MUST NOT 替 Owner 授权 Archive、Checkpoint、Full Test 或 Finalize。

#### Scenario: AGENTS 不成为流程 authority

- **WHEN** AGENTS 描述 Agent 操作规则
- **THEN** MUST NOT 自己决定唯一下一 Action
- **AND** MUST NOT 覆盖 OpenSpec Change contract
- **AND** MUST NOT 创造 Owner authorization

#### Scenario: 人类可读内容默认简体中文

- **WHEN** Agent 生成 action.md、Explore/Proposal/Design/Tasks 正文、Review summary/Findings 或 verification summary 等人类可读说明
- **THEN** 默认 MUST 使用简体中文
- **AND** 机器/代码标识 MAY 保持英文

#### Scenario: Reviewer mutation 与 blocker authority boundary

- **WHEN** Reviewer 执行 review-*
- **THEN** reviewed candidate MUST 只读
- **AND** Reviewer MAY 写自己的 Review Run/artifact
- **AND** MUST NOT 修改 Author artifact、production code、tests 或 Manifest
- **AND** blocking finding MUST 声明 `blockingAuthority`
- **AND** author-only blocker MAY 进入 Author Revision
- **AND** non-author blocker MUST NOT 机械交回 Author 修复
- **AND** Reviewer MUST NOT 自行授予 Archive、Checkpoint、Full Test 或 Finalize

### Requirement: A1 product write-side 必须取代后续 Bootstrap 手工 creation/activation

A1 可用后，正常后续 Change 的 Delivery/Change creation、Owner provenance 与 activation MUST 使用 A1 product write-side；Bootstrap 手工 mutation 只保留本 Delivery 自举历史与 emergency/recovery 语境。Activation 继续不是 Git boundary，且成功 activation 的 Manifest/OpenSpec metadata 变化 MUST 随当前 Change 正常工作进入后续 Checkpoint。

#### Scenario: 正常 activation 不创建 Change Start Commit
- **WHEN** A1 product activation 成功
- **THEN** MUST NOT 创建独立 Change Start Commit
- **AND** activation bytes MAY 随该 Change 后续工作进入 Change Checkpoint

### Requirement: 历史 Bootstrap Owner strings 必须保持不可升级

A1 MUST NOT 回写或迁移 Q1 001–015 等既有 Run 中的 `ownerAuthorization: explicit/not-required`，也 MUST NOT 从这些字符串生成新的 `ownerDecisions`。新 Owner provenance contract 从 A1 product write-side 启用后适用于新记录。

#### Scenario: checkout 历史 Q1 Runs
- **WHEN** repository 包含 pre-A1 Bootstrap Run ownerAuthorization strings
- **THEN** Reader MUST 保持这些 Run bytes 原样
- **AND** MUST NOT 将其升级成 Owner authority record

### Requirement: pre-A1 architectureImpact compatibility 必须是 frozen bootstrap seam

A1 MUST 把 Base `448fa042de86d07e893bcc51da528f93eb7ced3a` 中已存在 Delivery/Change identities 的 missing `architectureImpact` 视为 bounded Bootstrap compatibility，而不是新 schema 的一般可选字段。Compatibility 只允许 Reader 保留 unknown；不得修改历史 Manifest、不得从其它事实 backfill，也不得让 A1 后新建 Change 省略该字段。

#### Scenario: bootstrap seam 不扩张到 future Change
- **WHEN** A1 product write-side 已启用
- **AND** future createDelivery/createChange 创建新的 Change
- **THEN** `architectureImpact` MUST required and persisted
- **AND** pre-A1 compatibility MUST NOT 适用于该 Change

### Requirement: Bootstrap 与后续 Runner 必须共享 B1 Standard Run preparation semantics

Bootstrap手工执行与后续 Runner/adapter在创建 current Standard Run时 MUST遵守同一 B1 ActionDefinition、Delivery-wide Run-ID、pending continuation、logical Action Package与logical result admission contract。Bootstrap MAY由人/AI触发单个 Action，但 MUST NOT通过手工选择任意 NNN、错误 Role、provider session identity或自动 while-next loop绕过B1 execution boundary。

#### Scenario: Bootstrap续接 pending Run
- **WHEN**Bootstrap会话变化但current pending Run与semantic input仍相同
- **THEN**必须继续同一 Run
- **AND** MUST NOT仅因新会话创建新 NNN
