## Context

A1 已冻结产品定位，B1 已冻结核心模型（`flowkit-core-model`），C1 已冻结集成边界（`flowkit-integration-boundaries`）。三者均已完成 Archive 与 Change Checkpoint。

D1 Explore 已通过两轮 `review-explore`（030 changes-requested → 031 revise → 032 approved），将 A1/B1/C1 抽象流程模型转化为可执行的 Bootstrap 操作基线，并识别旧 Bootstrap 表述中将执行者、交接媒介、PR 和 Git Commit 误写为流程规则的偏离。

本设计将 Explore 结论转为正式 Bootstrap 操作契约，回答 Explore 中提出的 Q1–Q10 收敛问题和 P1–P6 Propose 收敛问题。

## Goals / Non-Goals

**Goals:**

- 定义 Bootstrap 最小执行循环
- 定义 Run 的创建、完成、重试和保留规则
- 定义 Run 文件最低内容和不保存完整对话
- 定义 Continuation Context 的 Bootstrap 生成
- 定义 Git 正式边界模型（仅三种）和 Change 激活的非边界地位
- 定义普通 Commit 的按需原则
- 定义 Review 不被强制绑定 Git Commit
- 定义 owner 授权边界
- 定义需避免的固定模式
- 定义 AGENTS.md 和 flowkit-git-workflow Skill 的边界
- 定义 Development Roadmap 和首次自托管条件
- 定义四份正式输出文档的结构
- 为 Runner 实现提供稳定操作规则契约

**Non-Goals:**

- 不修改 A1、B1、C1 已 Checkpoint 的冻结内容
- 不实现 Runner、CLI 或生产代码
- 不定义 JSON Schema 或具体持久化格式
- 不固定信息交换媒介（GitHub、Push、PR、Patch、ZIP 等）
- 不固定具体 AI Provider（ChatGPT、Codex 等）
- 不建立第二套 bootstrap-only 状态系统
- 不引入 Gate Registry、Skill Registry、Provider Registry 或通用插件平台
- 不运行 Full Test
- 不改变 B1 生命周期语义

## Decisions

### Decision 1: Bootstrap 最小执行循环与第二套状态系统禁止

Bootstrap 阶段没有 Runner 和 CLI，由人和 AI 手工保证 Flowkit 规则成立。最小执行循环：

```text
读取正式事实
→ Policy 确定当前唯一 Action
→ 创建当前 Run
→ 执行 Action
→ 完成 Run Result
→ 必要时形成续接切点
→ Policy 重新计算下一 Action
```

关键约束：

1. Bootstrap 手工执行同一套 Flowkit 规则，不建立 bootstrap-only 的状态、manifest 或 pointer；
2. Policy 仍是唯一权威，即使没有 Runner，下一 Action 仍由 Policy 根据正式事实计算；
3. Bootstrap 阶段的 Run 与未来 Runner 产生的 Run 使用同一套路径、结构和语义；
4. Run 不自动 Commit。

### Decision 2: Run 创建与复用边界（回答 Q1）

仅在以下边界创建新 Run：

```text
正式 Action 改变
执行角色改变
本次目标改变
前一 Run failed / cancelled 后重试同一 Action
```

只有正式 Action、执行角色和本次目标三者均未改变时，多轮交流、内容完善、补充检查以及普通 Commit 才保持在同一个 Run。任一改变即创建新 Run。

Reviewer Run 不预建：Author 完成 Action 时只完成 Author Run，Reviewer 真正执行统一入口 `review` 时才由 Policy 解析具体 `review-*` 并创建 Reviewer Run。

Terminal Run 不覆盖：Run 进入 `completed`/`failed`/`cancelled` 后保留原记录，重试时创建新 Run，不把失败 Run 改写成成功 Run。

Run 必须进入正式历史但不立即 Commit：Run 创建和完成都不自动触发 Git Commit，可以与当前 Change 的其他正式内容一起在普通 Commit 或 Change Checkpoint 中进入 Git 历史。

### Decision 3: Run 文件最低内容与不保存完整对话（回答 Q2）

**action.md** 保存人类可读的当前 Run 执行说明：

```text
Delivery / Change / Action
Role
Goal
Inputs
Allowed work
Prohibited work
Required output
适用的 owner 授权
```

只说明当前 Action 如何执行，不决定下一 Action。

**context.json** 保存机器可读的最小执行上下文：

```text
schemaVersion
runId
deliveryId
changeId
action
role
inputRef
dependsOn
artifacts / input ResultRefs
constraints
owner authorizations
runPath
```

规则：保存引用与约束；不复制 OpenSpec、Git、Review、Verification 的全部内部状态；不保存完整聊天；不保存会因当前 Commit 自身变化而立即失效的自引用 SHA；路径与字段冲突时必须阻塞。

**result.json** 保存本次执行发生的事实：

```text
schemaVersion
runId
status
summary
produced / updated ResultRefs
consumed Findings / authorization refs
Verification summary / ref
Review Verdict / Findings refs
failure / blocked reason
nextActionRecommendation（可选）
```

`nextActionRecommendation` 只能是建议，不能替代 Policy。

Run 不保存完整聊天记录、每轮讨论、内部推理草稿、完整文件副本、完整 Git 状态副本、完整测试日志副本、Evidence/Receipt 系统或 Session 历史系统。重要决定进入 OpenSpec、正式 docs、Run Result 摘要、Reviewer Findings 或 owner authorization。

### Decision 4: Continuation Context 的 Bootstrap 生成（回答 Q3）

Continuation Context 从正式事实生成：

```text
Delivery / Change 状态
+ Runs
+ OpenSpec
+ Reviewer Findings / Verdict
+ Verification 结果
+ owner 授权
→ Continuation Context
```

它是生成视图，不是新的状态权威：

1. 丢失后可重新生成；
2. 与正式事实冲突时以正式事实为准；
3. 不自行推进状态；
4. 不要求长期单独保存；
5. 不要求特定交换媒介。

`nextAllowedAction` 必须由 Policy 计算，不得由 Continuation Context 自行填写。

### Decision 5: owner 授权记录（回答 Q4）

owner 授权在 Run 的 `context.json` 中记录，作为引用而非完整副本。授权记录包含：

```text
授权类型（Apply / Archive / Full Test / Finalize / corrective Change / 破坏性 Git）
授权来源（owner Run、owner 指令或其他正式记录）
授权范围和时效
```

授权失效条件：超出授权范围、Delivery 或 Change 状态已变化导致授权不再适用、或 owner 明确撤销。

Agent、Adapter、Skill、Reviewer、Verification 工具不能自行授予任何 owner 授权。

### Decision 6: Git 正式边界与前置条件（回答 Q5）

一个 Delivery 的 Git 历史只要求三种正式边界：

```text
1 个 Delivery Start Commit
+
每个 Change 1 个 Change Checkpoint Commit
+
1 个 Delivery Final Commit
+
0 到若干按需普通 Commit
```

**Delivery Start Commit**：每个 Delivery 一次，用于标识 Delivery 正式开始、建立历史起点和第一个 Change 的 Diff 起点。模板：`chore(flowkit): start <delivery-id>`。

**Change Checkpoint Commit**：每个完成的 Change 一次。前置条件：Change 契约完成、适用 Verification 满足、Review Approved、Blocking Findings 清零、OpenSpec 已 Archive、Change 状态更新为 completed、Archive Run 已完成。模板：`chore(flowkit): checkpoint <change-id>`。应尽量包含真实收尾变化，不为了边界创建无意义空 Commit。

**Delivery Final Commit**：每个 Delivery 一次。前置条件：所有 required Changes completed、所有 Change 已 Checkpoint、Blocking Findings 清零、Delivery Verification 条件满足、Full Test 状态满足冻结规则、owner 明确批准 Finalize、最终 docs/roadmap/manifest 已收口。模板：`chore(flowkit): finalize <delivery-id>`。

**Change 激活不是正式 Git 边界**：Change 激活（manifest `planned → active` 与创建 `.openspec.yaml`）不要求独立 Commit；其文件变更随当前 Change 的正常工作一起进入 Git 历史。此结论由 owner 在 031-revise-explore 中确认，修正了 Explore 初稿中将 Change Start 拔高为伪边界的错误。

### Decision 7: 普通 Commit 原则（回答 Q6）

仅在真实需要时创建普通 Commit：

```text
保存较大或较长的工作进度
降低未提交修改丢失风险
跨环境或跨执行者需要稳定版本
Reviewer 需要稳定版本且无法共享工作区
即将中断，之后需要明确恢复点
用户明确要求保存
```

普通 Commit：必须包含真实变化；Message 可读；不推进 Flowkit 状态；不等于 Action 完成；不等于 Review Approved；不等于 Change Checkpoint；不要求 Push；不要求 PR。

Commit 数量不影响 Flowkit Policy。

### Decision 8: Review 绑定不要求 Commit（回答 Q7）

Review 必须绑定稳定的 `reviewedResultRef`，但该引用不必是 Git Commit。可使用：

```text
Run ResultRef
artifact version
content hash
Git revision
其他不可歧义版本引用
```

因此 Review 需要稳定结果 ≠ Review 前必须 Commit。如果被审查结果发生变化，原 Approval 对新结果失效，必须重新 Review。

### Decision 9: 需避免的固定模式（回答 Q8）

D1 创建新文档时必须避免以下来自旧 Bootstrap 表述的固定模式：

1. **固定执行者**：不得写入"ChatGPT 是主开发者"或"本地 Codex 是固定 Reviewer"；应写成正式角色为 owner/author/reviewer，当前由谁承担只属于项目执行映射。
2. **固定交接媒介**：不得写入"交接前必须 Commit + Push"或"GitHub 是默认交换通道"；应写成正式结果必须可读取，Continuation Context 必须可生成，具体交换媒介由当前环境决定。
3. **固定 PR**：不得写入"一个 Delivery 必须一个 PR"；应保留"一个 Delivery 使用一个 Delivery Branch"，是否有 PR/MR 由具体项目集成方式决定。
4. **`.flowkit/` 旧限制**：不得写入"Bootstrap 期间根仓库不出现权威 .flowkit/"；应写成 Bootstrap 不创建第二套 bootstrap-only 状态系统，但使用 B1 已冻结的正式 `.flowkit/runs/` 记录 Run。继续禁止 `.bootstrap-state/`、`bootstrap-manifest.yaml`、`temporary-flowkit-state/`。
5. **Git Commit 定位**：不得写入"Git Commit 是所有跨 AI/机器同步的必要边界"；应写成 Git Commit 是版本保存和正式 Git 历史边界，续接切点不等于 Git Commit，Action 和 Run 不自动 Commit。

### Decision 10: AGENTS.md 与 flowkit-git-workflow Skill 边界（回答 Q9）

**AGENTS.md** 至少包含：

```text
先读取正式 docs、当前 OpenSpec Change 和当前 Runs
由 Policy 确定唯一合法下一 Action
不得重新打开已 Checkpoint Change
不得跳过正式 Review
不得自行授权 Full Test
Action / Run 不自动 Commit
Git 只在 Start / Checkpoint / Final 形成正式边界
普通 Commit 仅按真实保存和交互需要创建
执行者或会话变化不构成流程状态变化
信息交换媒介不固定
不得引入第二套流程权威
```

不得固定 ChatGPT、Codex、GitHub、Remote、PR 或固定 Worktree 拓扑。

**flowkit-git-workflow Skill** 只执行已经由 Flowkit 和 owner 确定的 Git 行为。必须覆盖：Delivery Branch 命名、Delivery Start 模板、Change Checkpoint 模板、Delivery Final 模板、普通 Commit 的按需原则、Action/Run 不自动 Commit、不创建空 Handoff Commit、不把 SHA 写入自引用状态文件、不执行未经授权的破坏性 Git 操作、不自动运行 Full Test。

不得拥有：当前 Action 决策权、Change 完成判断权、Delivery Final 判断权、owner 授权权、自动 Commit/Push/Merge 权、流程状态修改权。

可以提供：边界检查、Commit Message 模板生成、Git 状态读取、Diff 范围计算、边界 Commit 查找、执行前提示。真正写入 Git 必须由用户或明确授权的外部操作触发。

### Decision 11: Development Roadmap 与首次自托管（回答 Q10）

后续 Runner Delivery 的最小推进顺序：

1. **Deterministic Core**：Delivery/Change/Run 状态模型、固定 Action Catalog、Policy/canRun/next、正式事实读取、状态持久化、status/next/doctor/resume-context、核心测试。不建立 Gate/Skill/Provider Registry 或通用插件平台。
2. **Change Execution Loop**：Delivery/Change 创建、Run 创建和生命周期、Action Package 生成、Action Result 接纳、OpenSpec 薄集成、Review/Findings 最小闭环、Change Verification、Change Archive、Change Checkpoint 识别和辅助、完整 Change CLI。Git 行为：不自动业务 Commit，只识别和辅助正式边界。
3. **Delivery Execution Loop**：Delivery Ready、Full Test owner 授权、Delivery Findings、corrective Change、Delivery Finalize、Delivery Final 边界、Archify Start/Finalize、sync/resume、thin Agent Adapter、稳定 Runner 发布。

首次自托管条件至少满足：Flowkit 能持久化正式事实、Policy 能唯一确定下一 Action、OpenSpec 集成可用、Review/Revise 闭环可用、Change Verification 可用、Runs 可恢复、Continuation Context 可生成、Change Checkpoint 可识别、Full Test owner 授权边界可用、Delivery Final 可识别、Agent Adapter 不成为第二编排器、稳定 Runner 已发布、端到端 Bootstrap 验收通过。

未来 Delivery 启动时使用实际日期，不预先冻结日期。

### Decision 12: 正式输出文档结构（回答 P1–P4）

**`docs/bootstrap-reference.md`**（P1）至少覆盖：

```text
Bootstrap 最小执行循环
Run 的创建、完成和保留规则
续接切点的操作性定义
Git 模型（Delivery Start、Change Checkpoint、Delivery Final、普通 Commit）
Change 激活不是正式 Git 边界
owner 授权边界
信息交换媒介中立原则
旧 Bootstrap 表述的修正对照
```

**`AGENTS.md`**（P2）采用 Decision 10 定义的最小规则清单，不补充项目级规则；与 `bootstrap-reference.md` 分工为：AGENTS.md 是仓库级开发指令（简短约束），bootstrap-reference.md 是详细操作参考。

**`.codex/skills/flowkit-git-workflow/SKILL.md`**（P3）采用 Decision 10 定义的覆盖范围和禁止权力，指令格式为边界检查 + 模板生成 + 执行前提示，不包含流程决策逻辑。

**`docs/development-roadmap.md`**（P4）采用 Decision 11 定义的三阶段 + 首次自托管条件，不进行更细粒度的 Change 划分；首次自托管条件作为验收清单，不预先冻结 Delivery 日期。

### Decision 13: `docs/delivery-lifecycle.md` Section 10 处理（回答 P5）

`docs/delivery-lifecycle.md` Section 10 已明确将以下内容推迟到 D1：

```text
Action 完成后如何向 owner 展示
owner 如何授权 Apply、Archive、Full Test 和 Finalize
何时创建普通 Commit
何时 Push
如何切换 author 与 reviewer
reviewer 如何执行统一 review
author 如何执行统一 revise
Checkpoint 的具体 Git 操作
```

D1 在 `docs/bootstrap-reference.md` 中完整覆盖这些内容。D1 不修改 `docs/delivery-lifecycle.md` 或其他 B1 已冻结文档。若后续确需修改 B1 文档，必须由 owner 授权独立 corrective Change，不在 D1 范围内处理。

### Decision 14: capability 名称与不修改冻结文档（回答 P6）

D1 的 OpenSpec capability 名称为 `flowkit-bootstrap-and-roadmap`。

D1 不修改 A1、B1、C1 已 Checkpoint 的冻结文档和 capability spec。D1 只创建新文档和新的 `flowkit-bootstrap-and-roadmap` capability spec。若发现与 A1/B1/C1 的真正冲突，必须提出新的 corrective Change，不得静默改写。

应废止的旧草案（如有）由 Apply 阶段识别和处理，不在 Proposal 阶段固定具体文件名。
