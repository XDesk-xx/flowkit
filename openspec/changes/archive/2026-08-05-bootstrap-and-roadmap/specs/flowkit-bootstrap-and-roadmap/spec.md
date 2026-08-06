# flowkit-bootstrap-and-roadmap Specification

## ADDED Requirements

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

新 Run MUST 仅在以下边界创建：正式 Action 改变、执行角色改变、本次目标改变、前一 Run failed/cancelled 后重试同一 Action。

只有正式 Action、执行角色和本次目标三者均未改变时，多轮交流、内容完善、补充检查以及普通 Commit 才 MAY 保持在同一个 Run。任一改变即 MUST 创建新 Run。

Reviewer Run MUST NOT 预建。Author 完成 Action 时只完成 Author Run，Reviewer 真正执行统一入口 `review` 时才由 Policy 解析具体 `review-*` 并创建 Reviewer Run。

Terminal Run MUST NOT 被覆盖。Run 进入 `completed`/`failed`/`cancelled` 后 MUST 保留原记录，重试时 MUST 创建新 Run。

#### Scenario: 目标改变触发新 Run

- **WHEN** 同一角色执行同一 Action 但本次目标已改变
- **THEN** MUST 创建新 Run
- **AND** MUST NOT 复用前一 Run

#### Scenario: 三者均未改变时复用同一 Run

- **WHEN** 正式 Action、执行角色和本次目标均未改变
- **THEN** 多轮交流、内容完善和补充检查 MAY 保持在同一个 Run
- **AND** 普通 Commit 不构成创建新 Run 的理由

#### Scenario: Reviewer Run 不预建

- **WHEN** Author 完成 Action
- **THEN** 只完成 Author Run
- **AND** MUST NOT 预建空 Reviewer Run
- **AND** Reviewer Run MUST 在 Reviewer 真正执行 review 时由 Policy 解析创建

### Requirement: Run 文件必须保存最低内容且不保存完整对话

Run 的 `action.md` MUST 保存人类可读的当前 Run 执行说明（Delivery/Change/Action、Role、Goal、Inputs、Allowed work、Prohibited work、Required output、适用的 owner 授权），MUST NOT 决定下一 Action。

Run 的 `context.json` MUST 保存机器可读的最小执行上下文（schemaVersion、runId、deliveryId、changeId、action、role、inputRef、dependsOn、artifacts/input ResultRefs、constraints、owner authorizations、runPath）。`context.json` MUST NOT 复制 OpenSpec、Git、Review、Verification 的全部内部状态，MUST NOT 保存会因当前 Commit 自身变化而立即失效的自引用 SHA。

Run 的 `result.json` MUST 保存本次执行发生的事实（schemaVersion、runId、status、summary、produced/updated ResultRefs、consumed Findings/authorization refs、Verification summary/ref、Review Verdict/Findings refs、failure/blocked reason、nextActionRecommendation 可选）。`nextActionRecommendation` MUST 只能是建议，MUST NOT 替代 Policy。

Run MUST NOT 保存完整聊天记录、每轮讨论、内部推理草稿、完整文件副本、完整 Git 状态副本、完整测试日志副本、Evidence/Receipt 系统或 Session 历史系统。

#### Scenario: context.json 不保存自引用 SHA

- **WHEN** Run 创建 context.json
- **THEN** MUST NOT 保存会因当前 Commit 自身变化而立即失效的自引用 SHA
- **AND** 路径与字段冲突时 MUST 阻塞

#### Scenario: result.json 的 nextActionRecommendation 不替代 Policy

- **WHEN** result.json 包含 nextActionRecommendation
- **THEN** 它 MUST 只能是建议
- **AND** Flowkit MUST 通过 Policy 重新计算下一 Action
- **AND** nextActionRecommendation MUST NOT 替代 Policy

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

Change Checkpoint Commit MUST 每个完成的 Change 一次，前置条件 MUST 包括：Change 契约完成、适用 Verification 满足、Review Approved、Blocking Findings 清零、OpenSpec 已 Archive、Change 状态更新为 completed、Archive Run 已完成。

Delivery Final Commit MUST 每个 Delivery 一次，前置条件 MUST 包括：所有 required Changes completed、所有 Change 已 Checkpoint、Blocking Findings 清零、Delivery Verification 条件满足、Full Test 状态满足冻结规则、owner 明确批准 Finalize、最终 docs/roadmap/manifest 已收口。

Checkpoint Commit MUST 尽量包含真实收尾变化，MUST NOT 为了边界创建无意义空 Commit。

#### Scenario: Change Checkpoint 前置条件

- **WHEN** 创建 Change Checkpoint Commit
- **THEN** MUST 满足 Change 契约完成、Verification 满足、Review Approved、Blocking Findings 清零、OpenSpec 已 Archive、Change 状态为 completed、Archive Run 已完成
- **AND** MUST NOT 创建无真实变化的无意义空 Commit

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
