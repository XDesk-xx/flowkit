# D1 Bootstrap 与后续路线 — Explore

- Delivery：`20260805-01-product-baseline`
- Change key：`D1`
- Change ID：`bootstrap-and-roadmap`
- Action：`explore`
- Role：`author`
- 状态：`completed — awaiting review-explore`
- 日期：`2026-08-05`
- 前置边界：`A1-product-positioning`、`B1-core-model`、`C1-integration-boundaries` 均已完成 Archive 与 Change Checkpoint；本 Explore 不重新打开或修改 A1、B1、C1

---

## 1. Explore 目标

D1 需要在 A1、B1、C1 已冻结的产品定位、核心模型和集成边界之上，把抽象的流程模型转化为可执行的 Bootstrap 操作基线，并明确后续代码 Delivery 的推进顺序和首次自托管切换条件。

本次 Explore 的重点不是重新设计流程模型，而是回答：

> 在没有 Runner 和 CLI 的 Bootstrap 阶段，人和 AI 如何手工保证 Flowkit 规则成立？这些手工操作规则中哪些需要冻结为正式文档，以便未来 Runner 按同一套规则实现？

D1 必须避免把当前开发环境中的偶然条件固定为产品事实，例如：

- ChatGPT 是主开发者；
- Codex 是固定 Reviewer；
- GitHub 是默认交换通道；
- 交接前必须 Commit + Push；
- 一个 Delivery 必须对应一个 PR；
- Bootstrap 期间不得出现正式 `.flowkit/`；
- Git Commit 是所有跨 AI 同步的必要边界。

这些方式都可能存在于某个具体环境，但都不应成为 Flowkit Core 的流程前提。

---

## 2. 继承的冻结事实

D1 不能重新定义以下 A1、B1、C1 事实。

### 2.1 正式层级（A1 + B1）

```text
Delivery
└─ Change
   └─ Action
```

Run 是某个角色对某个 Action 的一次执行实例，不构成第四个产品实体层。

### 2.2 正式角色（A1 + B1）

```text
owner
author
reviewer
```

不得把以下当前执行方式提升为核心角色：

```text
ChatGPT
Codex
Remote Author
Local Reviewer
Materializer
GitHub Agent
```

### 2.3 Policy 权威（B1）

```text
正式事实
→ Flowkit Policy
→ 唯一合法的下一 Action
```

不得维护一个可以脱离正式事实独立修改的 `currentAction`。

Run、聊天摘要、Agent 建议和 Git Commit 都不能替代 Policy。

### 2.4 事实权威（A1 + B1）

| 事实 | 主要权威 |
|---|---|
| Delivery、Change 的流程状态与下一 Action | Flowkit |
| Change 契约 | OpenSpec |
| 受版本管理的文件内容、Diff 和历史 | Git |
| Findings 和 Verdict | Reviewer |
| 测试、lint、typecheck、静态检查的原始结果 | 项目验证工具 |
| 被接受的架构表达 | Archify |
| 依赖与影响范围信息 | CodeGraph |

### 2.5 Change 主流程（B1）

```text
explore
→ review-explore
→ revise-explore（仅 changes-requested）

propose
→ review-propose
→ revise-propose（仅 changes-requested）

apply
→ Change Verification
→ review-apply
→ revise-apply（仅 changes-requested）

archive
→ Change Checkpoint
```

规则：

- `approved` 向前推进；
- 只有 `changes-requested` 才进入对应 `revise-*`；
- Non-blocking Findings 传递给后续 Author Action；
- 不因 Non-blocking Finding 倒退已经 Approved 的阶段；
- 已 Checkpoint 的 Change 不重新打开，真正冲突通过 corrective Change 处理。

### 2.6 Run 基础结构（B1）

```text
.flowkit/runs/<delivery-id>/<change-id>/<run-id>/
├─ action.md
├─ context.json
└─ result.json
```

以及 Delivery 级 `_delivery` Run。

Run ID：`YYYYMMDD-NNN-action`，`NNN` 在整个 Delivery 内唯一且单调递增。

### 2.7 集成边界（C1）

C1 已冻结以下逻辑边界，D1 继承但不重新定义：

- **Action Package**：当前 Action 的逻辑执行输入视图，不是固定文件包；
- **Action Result**：记录"发生了什么"，Policy 决定"接下来做什么"；
- **ResultRef**：引用正式结果的逻辑抽象，能唯一识别、判断失效、不绑定单一 Provider；
- **Continuation Context**：从正式事实生成的可恢复视图，不是新的状态权威；
- **续接切点**：边界语义，不是新的 Action、Run 类型、状态或 Commit 类型；
- **Review 绑定**：通过 `reviewedResultRef` 绑定被审查结果，不强制 Git SHA；
- **Adapter 边界**：只转换 I/O，不得判断 Action、跳过 Review、自行授权或成为第二编排器；
- **信息交换媒介中立**：不固定 GitHub、Remote、Push、PR、Patch、ZIP、Worktree、PowerShell 或具体 AI Provider。

### 2.8 C1 与 D1 的分界（C1）

```text
C1
→ 定义"续接需要什么逻辑信息"

D1
→ 定义"Bootstrap 中何时需要形成和展示这些信息"
```

两者都不回答"这些信息通过什么方式传递"。

D1 负责：

```text
何时形成续接切点
owner 如何授权
Git 操作具体规则
旧 Bootstrap 文档修正
status / next / resume-context 的具体执行
```

---

## 3. D1 需要回答的核心问题

以下问题在 Explore 阶段识别，需要在 Propose 阶段收敛为正式契约。

### Q1. Run 在 Bootstrap 中的创建、完成和重试规则是否足够清晰？

B1 已固定 Run 的同一 Run / 新 Run 边界。D1 需要确认这些规则在 Bootstrap 手工执行中是否可操作，特别是：

- 多轮讨论何时仍属同一 Run；
- 何时必须创建新 Run；
- Run 失败后如何重试；
- Run 完成后是否立即 Commit。

### Q2. `action.md / context.json / result.json` 的最低保存内容

B1 和 C1 已分别定义了 Run 的基础结构和逻辑字段。D1 需要确认在 Bootstrap 阶段，这三个文件的最低内容是否足够让新会话恢复流程，且不形成第二套状态权威。

### Q3. Continuation Context 如何从正式事实生成

C1 已定义 Continuation Context 是从正式事实生成的可恢复视图。D1 需要确认：

- Bootstrap 阶段由谁生成；
- 生成时读取哪些正式事实；
- 是否需要单独持久化；
- 与正式事实冲突时如何处理。

### Q4. 哪些 owner 授权必须进入 Run Context

B1 已明确 Apply、Archive、Full Test 和 Finalize 需要 owner 授权。D1 需要确认这些授权在 Bootstrap 阶段如何记录：

- 是否在 context.json 中记录；
- 授权的引用方式；
- 授权失效条件。

### Q5. Delivery Start、Change Checkpoint、Delivery Final 的确切前置条件

D1 需要为三种正式 Git 边界定义确切的前置条件、模板和包含内容，确保 Bootstrap 阶段可以无歧义地执行。

### Q6. 普通 Commit 的最低触发原则

D1 需要明确在什么真实需要下创建普通 Commit，以及普通 Commit 不推进流程状态、不等于 Action 完成、不等于 Review Approved。

### Q7. Review 在未 Commit 工作区中如何获得稳定 `reviewedResultRef`

C1 已定义 Review 通过 `reviewedResultRef` 绑定被审查结果。D1 需要确认在 Bootstrap 阶段，未 Commit 的工作区中如何获得稳定的引用：

- 可使用 Run ResultRef、artifact version、content hash 或 Git revision；
- Review 不被强制绑定 Git Commit。

### Q8. 旧 Bootstrap 中的固定模式如何避免

D1 需要识别旧 Bootstrap 表述中所有需要避免的固定模式，确保新创建的 `docs/bootstrap-reference.md`、`AGENTS.md` 和 `flowkit-git-workflow` Skill 不重复这些错误。

### Q9. AGENTS 和 Git Skill 如何避免固定具体 Provider

D1 需要确保 `AGENTS.md` 和 `.codex/skills/flowkit-git-workflow/SKILL.md` 只包含环境中立的规则，不固定 ChatGPT、Codex、GitHub、Remote、PR 或固定 Worktree 拓扑。

### Q10. 后续 Runner Delivery 的最小顺序和首次自托管验收条件

D1 需要定义后续 Runner Delivery 的最小推进顺序（Deterministic Core → Change Execution Loop → Delivery Execution Loop），以及首次自托管切换的验收条件。

---

## 4. Bootstrap 最小执行循环

Bootstrap 阶段没有 Runner 和 CLI，由人和 AI 手工保证 Flowkit 规则成立。

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

1. **手工执行同一套规则**：Bootstrap 不建立第二套 bootstrap-only 流程状态；未来自托管后由 Flowkit 确定性强制同一套规则。

2. **Policy 仍是唯一权威**：即使没有 Runner，下一 Action 仍由 Policy 根据正式事实计算，不由聊天摘要、Agent 建议或 Git 状态决定。

3. **Run 仍进入正式历史**：Bootstrap 阶段的 Run 与未来 Runner 产生的 Run 使用同一套路径、结构和语义。

4. **Run 不自动 Commit**：Run 创建和完成都不自动触发 Git Commit。Run 可以与当前 Change 的其他正式内容一起，在普通 Commit 或 Change Checkpoint 中进入 Git 历史。

---

## 5. Run 的操作性规则

### 5.1 何时创建新 Run

仅在以下边界创建新 Run：

```text
正式 Action 改变
执行角色改变
本次目标改变
前一 Run failed / cancelled 后重试同一 Action
```

只有正式 Action、执行角色和本次目标三者均未改变时，多轮交流、内容完善、补充检查以及普通 Commit 才保持在同一个 Run。任一改变即创建新 Run。

### 5.2 Reviewer Run 不预建

Author 完成 Action 时只完成 Author Run，并可推荐 `review-*`。

Reviewer 真正执行统一入口 `review` 时：

```text
Policy 解析具体 review-*
→ 创建 Reviewer Run
```

不得预建空 Reviewer Run。

### 5.3 Terminal Run 不覆盖

Run 状态：`pending / completed / failed / cancelled`。

Run 进入 terminal 状态后保留原记录。需要重试时创建新 Run，不把失败 Run 改写成成功 Run。

### 5.4 Run 必须进入正式历史，但不立即 Commit

正式 Run 是恢复流程所需的执行记录，应最终进入仓库正式历史。

但：

```text
Run 创建 ≠ 自动 Commit
Run 完成 ≠ 自动 Commit
```

Run 可以与当前 Change 的其他正式内容一起，在普通 Commit 或 Change Checkpoint 中进入 Git 历史。

### 5.5 Run 不保存完整对话

Run 不保存：

```text
完整聊天记录
每轮自然语言讨论
内部推理草稿
完整文件副本
完整 Git 状态副本
完整测试日志副本
Evidence / Receipt 系统
Session 历史系统
```

重要决定应进入 OpenSpec、正式 docs、Run Result 摘要、Reviewer Findings 或 owner authorization。

---

## 6. 续接切点的操作性定义

### 6.1 何时形成续接切点

C1 已定义续接切点的逻辑语义。D1 在操作性层面确认：

> 当当前 Action 已有稳定、可引用的正式结果，并且 Continuation Context 可以从正式事实生成时，形成一个可续接切点。

通常包括：

```text
当前 Action 完成
即将更换会话
即将更换执行者
工作即将中断
即将进入 Review
用户要求暂停后恢复
```

### 6.2 最低续接信息

```text
当前 Delivery
当前 Change
最后完成的 Action
最后 Action ResultRef
有效 Verdict / Findings
未消费的 Non-blocking Findings
有效 owner 授权
当前冻结约束
Policy 计算出的 nextAllowedAction
下一 Action 所需输入引用
```

### 6.3 Continuation Context 的 Bootstrap 生成

```text
Delivery / Change 状态
+ Runs
+ OpenSpec
+ Reviewer Findings / Verdict
+ Verification 结果
+ owner 授权
→ Continuation Context
```

Continuation Context 是生成视图，不是新的状态权威：

- 丢失后可重新生成；
- 与正式事实冲突时以正式事实为准；
- 不自行推进状态；
- 不要求长期单独保存；
- 不要求特定交换媒介。

### 6.4 是否 Commit 不由续接切点决定

是否 Commit 取决于 Git 保存或实际交互需要，不由续接切点自动触发。

续接切点不要求：

```text
Commit
Push
GitHub
PR / MR
Patch
ZIP
新 Run
新状态字段
特定脚本
两个独立 AI
```

---

## 7. Git 模型

### 7.1 总体结构

一个 Delivery 的 Git 历史只要求：

```text
1 个 Delivery Start Commit
+
每个 Change 1 个 Change Checkpoint Commit
+
1 个 Delivery Final Commit
+
0 到若干按需普通 Commit
```

示例：

```text
Delivery Start
A1 Checkpoint
B1 Checkpoint
C1 Checkpoint
D1 Checkpoint
Delivery Final
```

Change 激活（manifest `planned → active` 与创建 `.openspec.yaml`）不属于正式 Git 边界，不要求独立 Commit；其文件变更随当前 Change 的正常工作一起进入 Git 历史。

### 7.2 Action 和 Run 不自动 Commit

禁止：

```text
每个 Action 自动 Commit
每个 Run 创建自动 Commit
每个 Run 完成自动 Commit
每次 Review 自动 Commit
每次 AI 会话自动 Commit
```

正确关系：

```text
Action / Run
→ 更新工作区正式内容
→ 不自动 Git Commit
```

Commit 数量不影响 Flowkit Policy。

### 7.3 Delivery Start Commit

每个 Delivery 一次，用于：

- 标识 Delivery 正式开始；
- 建立 Delivery 历史起点；
- 建立第一个 Change 的 Diff 起点。

模板：

```text
chore(flowkit): start <delivery-id>
```

### 7.4 Change Checkpoint Commit

每个完成的 Change 一次。

前置条件：

```text
Change 契约完成
适用 Verification 满足
Review Approved
Blocking Findings 清零
OpenSpec 已 Archive
Change 状态更新为 completed
Archive Run 已完成
```

模板：

```text
chore(flowkit): checkpoint <change-id>
```

Checkpoint Commit 应尽量包含真实收尾变化，例如 OpenSpec Archive、Manifest 状态更新和 Archive Run，不为了边界创建无意义空 Commit。

### 7.5 Delivery Final Commit

每个 Delivery 一次。

前置条件：

```text
所有 required Changes completed
所有 Change 已 Checkpoint
Blocking Findings 清零
Delivery Verification 条件满足
Full Test 状态满足冻结规则
owner 明确批准 Finalize
最终 docs / roadmap / manifest 已收口
```

模板：

```text
chore(flowkit): finalize <delivery-id>
```

Delivery Final 不要求必须存在 PR 或某个远程平台。

### 7.6 普通 Commit

仅在真实需要时创建：

```text
保存较大或较长的工作进度
降低未提交修改丢失风险
跨环境或跨执行者需要稳定版本
Reviewer 需要稳定版本且无法共享工作区
即将中断，之后需要明确恢复点
用户明确要求保存
```

普通 Commit：

- 必须包含真实变化；
- Message 可读；
- 不推进 Flowkit 状态；
- 不等于 Action 完成；
- 不等于 Review Approved；
- 不等于 Change Checkpoint；
- 不要求 Push；
- 不要求 PR。

### 7.7 不创建的 Commit 类型

```text
Action Commit
Run Commit
Session Commit
Conversation Commit
Evidence Commit
Receipt Commit
Handoff 专用空 Commit
```

### 7.8 Review 不要求先 Commit

Review 必须绑定稳定的 `reviewedResultRef`，但该引用不必是 Git Commit。

可使用：

```text
Run ResultRef
artifact version
content hash
Git revision
其他不可歧义版本引用
```

因此：

```text
Review 需要稳定结果
≠ Review 前必须 Commit
```

### 7.9 Push、Remote、PR 与 Merge

这些都不是 Flowkit Core 的流程前提。

只有当前项目实际采用相应 Git 方式时，项目规则才定义：

```text
是否 Push
何时 Push
是否创建 PR / MR
如何合并
如何清理 Branch
```

D1 不把 GitHub 或其他 Forge 固定成唯一信息交换方式。

---

## 8. owner 授权边界

以下决定继续由 owner 明确控制：

```text
Delivery 范围变化
冻结决定变更
Apply 授权（适用时）
Archive 授权（适用时）
Full Test 授权
corrective Change 创建
Delivery Finalize
破坏性 Git 操作
```

Agent、Adapter、Skill、Reviewer、Verification 工具不能自行授予。

### 8.1 Full Test

```text
所有 required Changes Checkpoint
→ Delivery ready
→ fullTestStatus = awaiting-user-decision
→ owner 明确授权
→ 才运行 Full Test
```

不得由 Apply、Revision、Review、Archive 或 Adapter 自动触发。

Full Test 失败后：

```text
记录 Delivery Finding
→ 停在 owner 决策边界
→ owner 授权 corrective Change
→ 按完整 Change 生命周期处理
→ 再次等待 Full Test 授权
```

不重新打开已 Checkpoint 的 Change。

---

## 9. D1 正式输出

D1 预计创建：

```text
docs/bootstrap-reference.md
docs/development-roadmap.md
AGENTS.md
.codex/skills/flowkit-git-workflow/SKILL.md
```

这些文件必须与 A1、B1、C1 已冻结事实一致。

### 9.1 `docs/bootstrap-reference.md`

Bootstrap 阶段的操作参考文档，至少覆盖：

- Bootstrap 最小执行循环；
- Run 的创建、完成和保留规则；
- 续接切点的操作性定义；
- Git 模型（Start、Checkpoint、Final、普通 Commit）；
- owner 授权边界；
- 信息交换媒介中立原则。

必须避免的固定模式：

```text
ChatGPT 是主开发者
本地 Codex 是固定 Reviewer
交接前必须 Commit + Push
接手者必须从远端恢复
GitHub 是默认交换通道
一个 Delivery 必须一个 PR
Bootstrap 期间不得出现正式 .flowkit/
Git Commit 是所有跨 AI 同步的必要边界
```

应保留的正确原则：

```text
正式角色为 owner / author / reviewer
当前由谁承担只属于项目执行映射
需要续接时，正式结果必须可读取，Continuation Context 必须可生成
具体交换媒介由当前环境决定
Git Commit 是版本保存和正式 Git 历史边界
续接切点不等于 Git Commit
Action 和 Run 不自动 Commit
B1 已固定的 .flowkit/runs/ 属于正式 Run 事实
```

### 9.2 `AGENTS.md`

仓库级开发指令，至少包含：

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

不得固定：

```text
ChatGPT
Codex
GitHub
Remote
PR
固定 Worktree 拓扑
```

### 9.3 `.codex/skills/flowkit-git-workflow/SKILL.md`

该 Skill 只执行已经由 Flowkit 和 owner 确定的 Git 行为。

必须覆盖：

```text
Delivery Branch 命名
Delivery Start 模板
Change Checkpoint 模板
Delivery Final 模板
普通 Commit 的按需原则
Action / Run 不自动 Commit
不创建空 Handoff Commit
不把 SHA 写入自引用状态文件
不执行未经授权的破坏性 Git 操作
不自动运行 Full Test
```

不得拥有：

```text
当前 Action 决策权
Change 完成判断权
Delivery Final 判断权
owner 授权权
自动 Commit / Push / Merge 权
流程状态修改权
```

可以提供：

```text
边界检查
Commit Message 模板生成
Git 状态读取
Diff 范围计算
边界 Commit 查找
执行前提示
```

真正写入 Git 必须由用户或明确授权的外部操作触发。

### 9.4 `docs/development-roadmap.md`

后续 Runner Delivery 的推进路线，至少包含：

- Deterministic Core 的最小目标；
- Change Execution Loop 的最小目标；
- Delivery Execution Loop 的最小目标；
- 首次自托管切换条件。

不引入过度设计：

```text
Gate Registry
Skill Registry
Provider Registry
通用插件平台
```

---

## 10. Development Roadmap

未来 Delivery 启动时使用实际日期，不预先冻结日期。

### 10.1 Deterministic Core

目标：

```text
Delivery / Change / Run 状态模型
固定 Action Catalog
Policy / canRun / next
正式事实读取
状态持久化
status
next
doctor
resume-context
核心测试
```

不建立：

```text
Gate Registry
Skill Registry
Provider Registry
通用插件平台
```

### 10.2 Change Execution Loop

目标：

```text
Delivery / Change 创建
Run 创建和生命周期
Action Package 生成
Action Result 接纳
OpenSpec 薄集成
Review / Findings 最小闭环
Change Verification
Change Archive
Change Checkpoint 识别和辅助
完整 Change CLI
```

Git 行为：

```text
不自动业务 Commit
只识别和辅助正式边界
```

### 10.3 Delivery Execution Loop

目标：

```text
Delivery Ready
Full Test owner 授权
Delivery Findings
corrective Change
Delivery Finalize
Delivery Final 边界
Archify Start / Finalize
sync / resume
thin Agent Adapter
稳定 Runner 发布
```

### 10.4 首次自托管条件

至少满足：

```text
Flowkit 能持久化 Delivery / Change / Run 正式事实
Policy 能唯一确定下一 Action
OpenSpec 集成可用
Review / Revise 闭环可用
Change Verification 可用
Runs 可恢复
Continuation Context 可生成
Change Checkpoint 可识别
Full Test owner 授权边界可用
Delivery Final 可识别
Agent Adapter 不成为第二编排器
稳定 Runner 已发布
端到端 Bootstrap 验收通过
```

然后：

```text
Bootstrap Delivery 完成
→ 发布并固定 Runner
→ 创建第一个自托管 Delivery
```

---

## 11. 需要避免的固定模式

以下模式来自旧 Bootstrap 表述，D1 创建新文档时必须避免。

### 11.1 固定执行者

不得写入：

```text
ChatGPT 是主开发者
本地 Codex 是固定 Reviewer
```

应写成：

```text
正式角色为 owner / author / reviewer
当前由谁承担只属于项目执行映射
```

### 11.2 固定交接媒介

不得写入：

```text
交接前必须 Commit + Push
接手者必须从远端恢复
GitHub 是默认交换通道
```

应写成：

```text
需要续接时，正式结果必须可读取，Continuation Context 必须可生成
具体交换媒介由当前环境决定
```

### 11.3 固定 PR

不得写入：

```text
一个 Delivery 必须一个 PR
```

应保留：

```text
一个 Delivery 使用一个 Delivery Branch
```

是否有 PR／MR 由具体项目的集成方式决定。

### 11.4 `.flowkit/` 旧限制

不得写入：

```text
Bootstrap 期间根仓库不出现权威 .flowkit/
```

应写成：

```text
Bootstrap 不创建第二套 bootstrap-only 状态系统
但使用 B1 已冻结的正式 .flowkit/runs/ 记录 Run
```

继续禁止：

```text
.bootstrap-state/
bootstrap-manifest.yaml
temporary-flowkit-state/
```

### 11.5 Git Commit 定位

不得写入：

```text
Git Commit 是所有跨 AI / 机器同步的必要边界
```

应写成：

```text
Git Commit 是版本保存和正式 Git 历史边界
续接切点不等于 Git Commit
Action 和 Run 不自动 Commit
```

---

## 12. D1 与 C1 的分界确认

### 12.1 C1 已冻结（D1 不重新定义）

```text
交换什么逻辑信息
每类事实由谁拥有
Action Definition 与 Action Package 的逻辑边界
Action Result 的逻辑边界
ResultRef 的最低要求
Continuation Context 的最低要求
Review 如何引用被审查结果
Agent、Adapter、Skill 和外部工具不得拥有的流程权力
信息交换媒介中立
```

### 12.2 D1 负责

```text
Bootstrap 中何时展示 Action 结果
owner 如何授权 Apply、Archive、Full Test、Finalize 或取消
何时需要形成可续接切点
新会话如何获得或生成 Continuation Context
何时创建普通 Commit
Checkpoint 和 Delivery Final 的具体 Git 操作
当前项目如何手工执行 reviewer 流程
如何修正旧 Bootstrap 文档中的固定 GitHub、Push、PR 和具体 AI 映射
```

### 12.3 两者都不固定

```text
远程或本地
一个或多个 AI
ChatGPT、Codex 或其他 Provider
GitHub、GitLab 或其他平台
Push、Pull 或 PR 作为流程前提
Patch、ZIP、共享目录或脚本
PowerShell、Shell 或具体操作系统
Worktree 数量和协作拓扑
```

---

## 13. 已识别的错误方向

以下内容不应作为 D1 Proposal 的默认方向。

### 13.1 为 Bootstrap 建立第二套状态系统

错误原因：Bootstrap 应手工执行同一套 Flowkit 规则，不建立 bootstrap-only 的状态、manifest 或 pointer。

### 13.2 把当前 AI 组合固定为产品角色

错误原因：ChatGPT、Codex 或其他 Provider 只是当前执行环境映射，不是正式领域角色。

### 13.3 把 Git Commit 当成所有续接的必要条件

错误原因：Git Commit 对代码历史和正式边界很重要，但同一会话或同一工作区内的续接未必每次都需要额外 Commit。

### 13.4 把 GitHub／PR 固定为集成方式

错误原因：Forge 和 PR 只是可选的 Git 集成方式，不是 Flowkit Core 的流程前提。

### 13.5 在 Bootstrap 阶段实现 Runner 或 CLI

错误原因：D1 只冻结操作规则和路线，不实现生产代码。

### 13.6 引入过度设计的 Roadmap

错误原因：Roadmap 应只包含最小必要的后续 Delivery，不预先引入 Registry、插件平台或通用编排。

---

## 14. 风险与防护

### R1. Bootstrap 形成第二套流程权威

防护：Bootstrap 只手工执行 Flowkit 规则；不创建 bootstrap-only 状态系统；所有正式事实仍由 Flowkit、OpenSpec、Git、Reviewer 和验证工具拥有。

### R2. 续接切点被误解为必须 Commit

防护：D1 明确续接切点不等于 Git Commit；是否 Commit 取决于 Git 保存或实际交互需要。

### R3. owner 授权边界被 Bootstrap 习惯绕过

防护：D1 冻结 owner 授权清单；Apply、Archive、Full Test 和 Finalize 不得由 Agent、Skill 或 Adapter 自行授予。

### R4. 新文档无意中固定了 Provider 或 Forge

防护：D1 验收条件明确检查 `bootstrap-reference.md`、`AGENTS.md` 和 `flowkit-git-workflow` 不固定 GitHub、Push、PR、本地／远程或具体 AI。

### R5. D1 越界修改 A1、B1、C1 冻结内容

防护：D1 只创建新文档；若发现与 A1、B1、C1 的真正冲突，必须提出 corrective Change，不得静默改写。

### R6. Roadmap 引入未经验证的复杂抽象

防护：Roadmap 只包含最小必要的后续 Delivery；不引入 Gate Registry、Skill Registry、Provider Registry 或通用插件平台。

### R7. Git Skill 获得流程决策权

防护：`flowkit-git-workflow` Skill 只执行已确定的 Git 行为；不拥有 Action 决策、Change 完成判断或 Delivery Final 判断。

---

## 15. 需要在后续 Propose 中收敛的问题

### P1. `docs/bootstrap-reference.md` 的确切章节结构

Explore 已定义必须覆盖的内容和必须避免的模式。Propose 需要确定确切的章节结构和详细程度。

### P2. `AGENTS.md` 的确切规则清单

Explore 已定义最小规则集。Propose 需要确认是否需要补充项目级规则，以及如何与 `bootstrap-reference.md` 分工。

### P3. `flowkit-git-workflow` Skill 的确切覆盖范围

Explore 已定义必须覆盖和不得拥有的边界。Propose 需要确定 Skill 的确切指令格式和触发条件。

### P4. `docs/development-roadmap.md` 的 Delivery 划分粒度

Explore 已定义三个后续 Delivery 的最小目标。Propose 需要确认是否需要更细粒度的 Change 划分，以及首次自托管条件的验收方式。

### P5. 是否需要更新 `docs/delivery-lifecycle.md` 的 Section 10

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

Propose 需要确认 D1 是否在 `docs/bootstrap-reference.md` 中完整覆盖这些内容，还是需要同时更新 `docs/delivery-lifecycle.md`。但不得改变 B1 生命周期语义。

### P6. D1 的 OpenSpec capability 名称

C1 的 capability 为 `flowkit-integration-boundaries`。D1 需要确定对应的 capability 名称，例如 `flowkit-bootstrap-and-roadmap`。

---

## 16. 建议 Reviewer 重点检查

1. D1 是否真正继承 A1、B1、C1 的冻结事实，不重新打开或修改；
2. Bootstrap 最小执行循环是否与 B1 的 Policy 权威一致；
3. Run 的操作性规则是否与 B1 的 Run 边界一致；
4. 续接切点的操作性定义是否与 C1 的逻辑定义一致；
5. Git 模型是否清晰区分了 Start、Checkpoint、Final 和普通 Commit；
6. owner 授权边界是否完整且不被 Bootstrap 习惯绕过；
7. 新文档是否避免了固定 GitHub、Push、PR、本地／远程或具体 AI；
8. `flowkit-git-workflow` Skill 是否只执行已确定的 Git 行为，不拥有流程决策权；
9. Development Roadmap 是否只包含最小必要的后续 Delivery，不引入过度设计；
10. 首次自托管条件是否可验收；
11. D1 与 C1 的分界是否清楚；
12. 是否无意引入第二套 bootstrap-only 状态系统。

---

## 17. Explore 结论

D1 不回答"具体使用什么工具或平台"，而应回答：

```text
Bootstrap 阶段如何手工执行 Flowkit 规则
Run 如何创建、完成和保留
何时形成续接切点
owner 在哪些节点必须授权
Git 在哪些正式边界提交
什么时候才需要普通 Commit
哪些旧 Bootstrap 表述必须避免
后续 Runner 按什么顺序实现
何时切换到首次自托管 Delivery
```

建议后续 Proposal 采用以下收口原则：

> **Bootstrap 手工执行同一套 Flowkit 规则，不建立第二套状态系统；Git 只保存真实版本历史和少量正式边界，不承担每个 Action 的自动提交职责。**

对应的最小主线是：

```text
Delivery 是交付主线
Change 是实施单元
Action 是执行步骤
Run 是 Action 的执行实例

Run 保存最小执行上下文和结果
Continuation Context 从正式事实生成
信息交换媒介不固定

Action 不自动 Commit
Run 不自动 Commit

每个 Delivery：
1 个 Delivery Start
N 个 Change Checkpoint
1 个 Delivery Final
0 到若干按需普通 Commit
```

最终原则：

> **Flowkit 通过 Runs、正式事实和 Policy 保证流程可执行、可审查、可恢复；Git 只保存真实版本历史和少量正式边界，不承担每个 Action 的自动提交职责。**

本 Explore 完成后，正常下一 Action 为：

```text
review-explore
```

只有 reviewer 返回 `changes-requested` 时，才进入：

```text
revise-explore
```
