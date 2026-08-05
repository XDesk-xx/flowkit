# C1 Integration Boundaries — Explore

- Delivery：`20260805-01-product-baseline`
- Change key：`C1`
- Change ID：`integration-boundaries`
- Action：`explore`
- Role：`author`
- 状态：`completed — awaiting review-explore`
- 日期：`2026-08-05`
- 前置边界：`B1-core-model` 已完成 Archive 与 Change Checkpoint；本 Explore 不重新打开或修改 B1

---

## 1. Explore 目标

C1 需要在 B1 已冻结的核心模型之上，明确 Flowkit 与外部执行者、OpenSpec、Git、Review、Verification、Archify、CodeGraph 和 Skill 之间的集成边界。

本次 Explore 的重点不是选择某一种协作方案，而是回答：

> Flowkit 为了让一个 Action 被正确执行、产生正式结果，并让后续执行者或新会话准确接上流程，最少需要交换哪些逻辑信息？

C1 必须避免把当前开发环境中的偶然条件固定为产品事实，例如：

- GitHub；
- Git Push、Pull、PR 或远程仓库；
- 本地或远程执行；
- 一个 AI 或多个 AI；
- ChatGPT、Codex 或其他具体 Provider；
- 完整 Worktree、Snapshot、Patch、ZIP 或共享目录；
- PowerShell、Shell 或某一种落盘程序；
- 固定的 Author／Reviewer 部署位置；
- 固定的信息交换拓扑。

这些方式都可能存在，但都不应成为 Flowkit Core 判断流程是否合法的前提。

---

## 2. B1 已冻结、C1 必须继承的事实

C1 不能重新定义以下 B1 事实。

### 2.1 正式层级

```text
Delivery
└─ Change
   └─ Action
```

Run 是某个角色对某个 Action 的一次执行实例，不构成第四个产品实体层。

### 2.2 正式角色

```text
owner
author
reviewer
```

C1 不应因为当前工具组合再增加“远程 Author”“本地 Reviewer”“Materializer”等核心角色。

工具、脚本、Adapter 或执行程序可以帮助某个角色完成工作，但不因此成为新的领域角色。

### 2.3 Policy 权威

Flowkit 不持久化 `currentAction`。

当前唯一合法的下一 Action 必须由 Policy 根据正式事实计算，而不是由：

- 聊天摘要；
- 当前 Agent 的建议；
- GitHub／PR 状态；
- 是否 Push；
- 某个文件包是否已下载；
- 当前使用的工具；
- 人工记忆。

Action Result 中可以存在 `nextActionRecommendation`，但它只能是建议，不能替代 Policy。

### 2.4 事实权威

C1 必须继续遵循 `One fact, one authority`：

| 事实 | 主要权威 |
|---|---|
| Delivery、Change 的流程状态与下一 Action | Flowkit |
| Change 契约 | OpenSpec |
| 受版本管理的文件内容、Diff 和历史 | Git |
| Findings 和 Verdict | Reviewer |
| 测试、lint、typecheck、静态检查的原始结果 | 项目验证工具 |
| 被接受的架构表达 | Archify |
| 依赖与影响范围信息 | CodeGraph |

Run 可以保存执行所需的上下文、摘要和引用，但不能复制并取代上述权威。

### 2.5 Review 与 Revision

```text
review-* → approved
→ 向前推进

review-* → changes-requested
→ 对应 revise-*／fix goal
→ 重新 Review
```

Non-blocking Findings 应向后续 Action 传递，不自动触发回退。

### 2.6 Run 基础结构

B1 已固定正式 Run 路径：

```text
.flowkit/runs/<delivery-id>/<change-id>/<run-id>/
├─ action.md
├─ context.json
└─ result.json
```

以及 Delivery 级 `_delivery` Run。

C1 可以定义这些文件需要表达的集成字段与引用方式，但不能把 Run 变成第二套状态权威。

---

## 3. 当前暴露出的核心问题

### 3.1 “信息交换媒介”被误写成“流程规则”

旧 Bootstrap 表述曾默认：

```text
交接
→ Commit
→ Push
→ GitHub／远端恢复
```

后续讨论又一度改成：

```text
远程 Author
→ 本地 Materializer
→ 本地 Reviewer
```

或者枚举：

```text
同一 Worktree
两个 Worktree
本地 Bare Repository
Remote Forge
Remote Snapshot
```

这些都只是可能的执行环境，不是 Flowkit 生命周期本身。

如果把其中任何一种写入核心协议，Flowkit 就会错误依赖：

- 特定网络能力；
- 特定仓库托管服务；
- 特定文件系统；
- 特定 AI 部署位置；
- 特定人工转交流程。

这会直接降低未来扩展性。

### 3.2 “交接”被理解得过窄

流程续接不一定发生在两个不同的人或 AI 之间。

它也可能发生在：

- 同一个 AI 的新会话；
- 同一角色中断后恢复；
- owner 暂停后重新继续；
- reviewer 读取 author 的正式结果；
- 同一执行环境中的阶段切换；
- 自动 Runner 在重启后恢复。

因此，比 `handoff` 更准确的核心语义是：

> **续接切点（continuation boundary）**

它表示当前阶段已留下足够的正式信息，后续执行者或新会话可以恢复流程。

续接切点不是新的 Action、Run、Phase、Commit 类型或持久化状态。

### 3.3 Action Package 容易被误解为固定文件包

现有表达：

```text
Flowkit Core
→ Action Package
→ Agent
```

方向是合理的，但 `Action Package` 容易被进一步固定为：

- ZIP；
- Patch；
- JSON Manifest；
- GitHub Payload；
- 本地目录；
- 一段特定 Prompt。

C1 需要明确：

> Action Package 首先是当前 Action 的逻辑输入视图，而不是传输格式。

相同的逻辑输入可以通过不同媒介表达，只要语义完整且无歧义。

### 3.4 Action Result 与正式事实之间的关系尚未固定

执行者完成 Action 后，需要返回结构化结果，但必须避免：

```text
Action Result
→ 自己决定下一 Action
```

正确关系应是：

```text
执行者完成 Action
→ 产生 Action Result
→ Flowkit 校验并接纳正式事实
→ Policy 重新计算
→ 得到唯一合法下一 Action
```

C1 需要明确 Action Result 的最小内容，以及哪些字段只能是引用、摘要或建议。

### 3.5 Review 不能只绑定某一种 Git 表达

Review 必须明确自己审查的是哪一份阶段结果。

在当前 Git 工作流中，可以用 Commit 或 Diff 边界识别；但 C1 不应直接把：

```text
reviewedCommitSha
```

设为所有执行环境唯一允许的表达。

更中立的逻辑应是：

```text
reviewedResultRef
```

它必须唯一指向被审查的正式结果。

具体 Adapter 可以把它映射为：

- Git revision；
- Run result；
- artifact version；
- content hash；
- 其他不可歧义的版本引用。

只要被审查结果发生变化，原 Approval 对新结果失效。

### 3.6 “续接摘要”可能形成第二套状态

为了让新会话接上，通常需要一份摘要，例如：

```text
当前 Delivery
当前 Change
最后完成的 Action
有效 Verdict／Findings
下一合法 Action
```

但如果把这份摘要独立维护，就可能产生：

```text
正式事实是一套
续接摘要又是一套
```

因此续接上下文必须是：

> 从正式事实生成的可恢复视图，而不是新的状态权威。

摘要丢失时，应能够重新生成；摘要与正式事实冲突时，以正式事实为准。

---

## 4. C1 应研究和冻结的逻辑边界

### 4.1 Action Definition 与 Action Package

需要区分：

- **Action Definition**：某类 Action 的稳定规则，例如角色、目标、前置条件、允许输出和完成条件；
- **Action Package**：针对当前 Delivery／Change／Run 生成的具体执行输入视图。

Action Package 至少需要让执行者知道：

```text
正在执行哪个 Delivery / Change / Action
当前角色是什么
必须消费哪些正式输入
本次目标是什么
允许和禁止的范围是什么
必须产生什么结果
适用的验证要求是什么
哪些 owner 授权已存在或尚未存在
```

C1 不应在 Explore 阶段直接固定完整 JSON Schema，也不应规定 Package 的物理载体。

### 4.2 Action Result

Action Result 至少需要表达：

```text
对应的 Run 和 Action
执行状态
结果摘要
产生或更新的正式结果引用
消费的 Findings／授权／输入引用
Verification 摘要和结果引用（适用时）
Review Verdict 与 Findings 引用（适用时）
失败或阻塞诊断（适用时）
下一 Action 建议（可选）
```

必须明确：

- Result 记录“发生了什么”；
- Policy 决定“接下来做什么”；
- Result 不得自行推进 Change 或 Delivery；
- Result 不得复制外部工具的完整专业状态。

### 4.3 Result Reference

不同集成需要以统一逻辑引用正式结果。

C1 应研究最小 `ResultRef` 语义，至少满足：

- 能唯一识别被引用结果；
- 能判断结果是否被替换或失效；
- 能让接收方读取或定位结果；
- 不要求所有环境都使用相同 Provider；
- 不把当前 Commit SHA 写入会因自身 Commit 而过期的状态文件。

Explore 暂不决定其最终字段结构。

### 4.4 Continuation Context

C1 应定义逻辑上的 `Continuation Context`，用于支持新会话或后续执行者续接。

最小内容候选：

```text
deliveryId
changeId
lastCompletedAction
lastActionResultRef
activeVerdict / Findings
尚未消费的 Non-blocking Findings
有效 owner 授权
当前关键约束
nextAllowedAction
下一 Action 所需输入引用
```

其中：

- `nextAllowedAction` 必须由 Policy 计算；
- Continuation Context 不得独立修改流程；
- 它可以按需生成，不要求长期单独持久化；
- 它不要求接收方位于特定位置或使用特定工具。

### 4.5 续接切点

建议 C1 只冻结以下逻辑定义：

> 当当前阶段已有稳定、可引用的正式结果，并且 Continuation Context 可以从正式事实生成时，形成一个可续接切点。

续接切点不要求：

- Commit；
- Push；
- GitHub；
- PR／MR；
- Patch；
- ZIP；
- 新 Run；
- 新状态字段；
- 特定脚本；
- 两个独立 AI。

是否需要 Commit、文件复制、远端同步或其他操作，由当前项目环境与 D1 的 Bootstrap 操作规则决定，不进入 C1 核心契约。

### 4.6 Agent／Adapter 边界

C1 应保持：

```text
Flowkit Core
→ 生成当前 Action 的逻辑执行输入
→ Adapter 将其呈现给当前执行者
→ 执行者返回逻辑 Action Result
→ Adapter 传回 Flowkit
```

Adapter 只负责边界转换，不得：

- 判断当前 Action；
- 改写 Change 契约；
- 跳过 Review；
- 将 Non-blocking Finding 自动升级为 Blocking；
- 自行授权 Apply、Archive、Full Test 或 Finalize；
- 自行创建新的 Change；
- 成为第二个编排器。

C1 不应建立 Provider Registry、Adapter Registry 或动态路由平台。

### 4.7 Skill 声明

B1 已确定 Skill 只提供 Action 内的方法。

C1 应研究 Action Package 如何声明所需的方法类别，例如：

```text
文档分析
契约审查
代码审查
安全审查
性能审查
```

但不应：

- 在核心契约中绑定具体 Skill 路径；
- 绑定 Codex、ChatGPT 或其他 Agent；
- 让 Skill 决定流程；
- 建立 Skill Registry／Router／DAG。

具体 Skill 标识是否由项目配置、Adapter 或 Agent 环境解释，应在 Propose 阶段进一步收敛。

### 4.8 OpenSpec 边界

OpenSpec 继续拥有 Change 契约。

C1 需要明确：

- Flowkit 如何引用当前 Change 的 Explore、Proposal、Design、Specs、Tasks、Verification 和 Archive 结果；
- Action Package 如何只暴露当前 Action 所需的契约视图；
- OpenSpec Skill 不得决定 Delivery、当前 Action 或 owner 授权；
- Flowkit 不复制 OpenSpec 全部内部状态。

### 4.9 Verification 边界

项目验证工具拥有原始结果；Flowkit 只消费标准状态、摘要和结果引用。

C1 应关注输入输出接口，不固定：

- 本地命令；
- CI；
- GitHub Actions；
- 具体测试框架；
- 执行机器位置。

Full Test 授权边界继续沿用 B1，不得由 Adapter、Agent、Skill 或验证工具自行突破。

### 4.10 Git 边界

Git 仍然拥有受版本管理文件、Diff 和历史。

但 C1 必须把以下概念分开：

```text
Git 边界
≠ 续接切点
≠ 信息交换媒介
```

Git Commit 可以帮助保存和识别正式结果；Change Checkpoint 和 Delivery Final 仍是正式 Git 边界。

但 C1 不规定：

- 续接必须 Commit；
- 交接必须 Push；
- 必须存在 Remote；
- 必须存在 GitHub；
- 必须存在 PR／MR。

具体 Git 操作属于 D1 或项目 Git 规范。

### 4.11 Archify 与 CodeGraph 边界

C1 只需要固定薄输入输出：

```text
Archify
→ 接收 Delivery 架构上下文
→ 返回架构结果引用

CodeGraph
→ 接收变化范围或查询上下文
→ 返回依赖、影响范围和相关测试上下文
```

二者都不能决定 Flowkit 下一 Action，也不能产生最终 Review Verdict。

---

## 5. C1 与 D1 的分界

### 5.1 C1 负责

```text
交换什么逻辑信息
每类事实由谁拥有
Action Definition 与 Action Package 的逻辑边界
Action Result 的逻辑边界
ResultRef 的最低要求
Continuation Context 的最低要求
Review 如何引用被审查结果
Agent、Adapter、Skill 和外部工具不得拥有的流程权力
```

### 5.2 D1 负责

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

### 5.3 两者都不固定

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

## 6. 已识别的错误方向

以下内容不应作为 C1 Proposal 的默认方向。

### 6.1 固定 GitHub／Remote Forge

错误原因：把一种可选交换媒介提升成产品依赖。

### 6.2 固定 Remote Author + Local Materializer

错误原因：把当前受限环境下的一种优化方案提升成正式角色和架构。

### 6.3 固定 Workspace Capability 枚举

例如：

```text
full-worktree
file-package
remote-snapshot
```

这些标签可能对某个具体 Adapter 有用，但当前没有证据表明 C1 核心需要冻结为封闭枚举。

### 6.4 把 Materializer 设为 C1 必备组件

确定性落盘程序可以是有价值的具体实现，但它不是 Flowkit 集成模型成立的必要条件，也不是新的领域角色。

### 6.5 把 Git Commit 当成所有续接的必要条件

Git Commit 对代码历史和正式边界很重要，但同一会话或同一工作区内的续接未必每次都需要额外 Commit。

C1 只要求结果可稳定引用和上下文可恢复。

### 6.6 枚举所有交接拓扑

枚举本地、远程、两个 Worktree、Bare Repository 等会把非穷尽的执行方式错误写成封闭模型。

Flowkit 应对交换媒介保持不知情。

---

## 7. 需要在后续 Propose 中收敛的问题

### Q1. 是否继续使用 `Action Package` 这一名称？

建议：保留，但必须定义为“当前 Action 的逻辑执行输入视图”，并明确不是固定文件包。

需要 reviewer 检查该名称是否仍容易误导。

### Q2. `Continuation Context` 是正式 Schema 还是生成视图？

初步建议：

- C1 定义最低语义；
- 允许结构化输出；
- 不将其作为独立流程权威；
- 是否长期持久化由后续实现决定。

### Q3. Review 绑定使用什么抽象？

初步建议使用：

```text
reviewedResultRef
```

而不是在 C1 核心中只允许 Git SHA。

需要 Propose 明确其不可歧义和失效判断要求。

### Q4. ResultRef 的最小契约是什么？

至少要支持：

- 类型或命名空间；
- 稳定标识；
- 定位信息；
- 可选完整性／版本信息。

Explore 不提前固定字段名和完整 Schema。

### Q5. Skill 声明需要精确到什么程度？

需要在“只有方法类别”与“可执行 Adapter 需要具体标识”之间找到边界，同时避免 Skill Registry。

### Q6. C1 是否需要修改 B1 文档？

初步结论：不修改 B1 已 Checkpoint 的核心文档。

C1 新建 `docs/integration-boundaries.md` 和对应 OpenSpec 契约；若发现 B1 真正冲突，必须明确提出新的 corrective Change，而不能在 C1 静默改写。

### Q7. 旧 Bootstrap 中的 GitHub、Push、PR 和具体 AI 映射何时修正？

初步结论：属于 D1 Apply。

C1 只提供环境中立的集成原则，D1 再更新实际 Bootstrap 操作文档。

### Q8. `.flowkit/runs/` 与旧 Bootstrap 禁止 `.flowkit/` 的冲突由谁处理？

B1 已正式使用 committed Run 结构。

该文档冲突属于 D1 的 Bootstrap 对齐工作，不应在 C1 中重开 B1，也不应由 C1 重新设计 Run 路径。

---

## 8. 建议的 C1 Proposal 范围

### 8.1 In scope

- 定义 `docs/integration-boundaries.md`；
- 定义 Action Definition／Action Package 的逻辑边界；
- 定义 Action Result 的逻辑边界；
- 定义 ResultRef 的最低语义；
- 定义 Continuation Context 与续接切点；
- 定义 Review 绑定正式结果的规则；
- 定义 OpenSpec、Git、Verification、Archify、CodeGraph、Agent、Adapter 和 Skill 的权威边界；
- 定义 Adapter 不得成为第二个流程编排器；
- 定义具体媒介和 Provider 不进入核心模型；
- 形成对应 OpenSpec capability spec、design 和 tasks。

### 8.2 Out of scope

- 修改 B1 已 Checkpoint 的状态机；
- 实现 Runner、CLI 或生产代码；
- 开发具体 GitHub／GitLab Adapter；
- 开发 Patch、ZIP 或 Materializer 协议；
- 开发 Provider／Agent／Skill Registry；
- 枚举或调度协作拓扑；
- 固定本地／远程角色；
- 修改 Commit、Push、PR、Checkpoint 的具体操作规则；
- 更新 Bootstrap Reference、AGENTS.md 或 Roadmap；
- 运行 Full Test；
- 引入 Evidence、Receipt、消息队列、事务日志或通用插件平台。

---

## 9. 预计文档影响

### C1 Apply 预计创建

```text
docs/integration-boundaries.md
openspec/changes/integration-boundaries/proposal.md
openspec/changes/integration-boundaries/design.md
openspec/changes/integration-boundaries/specs/<capability>/spec.md
openspec/changes/integration-boundaries/tasks.md
openspec/changes/integration-boundaries/verification.md
```

具体 capability 名称和文件结构在 Propose 阶段确认。

### D1 后续预计更新

```text
docs/bootstrap-reference.md
docs/development-roadmap.md
AGENTS.md
```

必要时定点更新 `docs/delivery-lifecycle.md` 中指向 D1 的操作性表述，但不得改变 B1 生命周期语义。

### 应废止、不得作为正式输入的旧草案

```text
docs/local-author-materializer-workflow.md
docs/adapters/github-snapshot-workspace.md
旧版 future-changes-after-b1.md 中的固定拓扑、Materializer 和 Remote Author 决策
```

其中有价值的背景只能作为“为什么不能固定媒介”的问题证据，不得直接转入 Proposal。

---

## 10. 风险与防护

### R1. 过度抽象，形成通用 Workflow Engine

防护：所有契约必须服务现有固定 Action Catalog，不建立任意任务编排、队列或 DAG。

### R2. Continuation Context 形成第二套状态

防护：必须可从正式事实重建；冲突时以正式权威为准；不能自行推进状态。

### R3. ResultRef 过于宽松，无法判断 Review 是否失效

防护：Proposal 必须要求引用不可歧义，并能够判断被审查结果是否变化。

### R4. Adapter 重新拥有流程决策

防护：Adapter 只能转换输入输出；Action 合法性、owner 授权和下一 Action 由 Flowkit 保持权威。

### R5. 为兼容未来环境引入 Registry 和复杂能力协商

防护：C1 只定义最低逻辑契约；具体 Adapter 按真实 Delivery 需要增加。

### R6. Git 权威被错误削弱

防护：去除 GitHub／Push 前提不等于去除 Git。受版本管理文件、Diff、Checkpoint 和 Delivery Final 仍由 Git 承担。

### R7. C1 越界修改 Bootstrap 操作

防护：C1 只冻结集成语义；具体授权、Commit、续接操作和文档清理进入 D1。

---

## 11. 建议 Reviewer 重点检查

1. 是否真正移除了 GitHub、本地／远程、Worktree、Patch、PowerShell等固定假设；
2. 是否仍完整继承 B1 的 Delivery／Change／Action／Run、Policy 和角色模型；
3. `续接切点` 是否只是边界语义，而不是新的实体、状态或 Action；
4. Action Package 是否被清楚定义为逻辑视图，而不是物理文件包；
5. Continuation Context 是否可能成为第二套状态权威；
6. Review 的 `reviewedResultRef` 是否足以替代 Git-only 的绑定假设；
7. C1 与 D1 的边界是否清楚；
8. 是否无意引入 Materializer、Provider Registry、Workspace Capability 枚举或协作拓扑；
9. 是否保留 Git 对文件、Diff 和正式边界的权威；
10. Proposal 是否可以在不选择信息交换媒介的情况下继续形成可验收契约。

---

## 12. Explore 结论

C1 不应回答“两个执行者具体如何交换文件”，而应回答：

```text
当前 Action 需要什么逻辑输入
→ 执行者产生什么逻辑结果
→ 结果如何被稳定引用
→ 后续会话如何从正式事实恢复上下文
→ 外部工具的权力边界在哪里
```

建议后续 Proposal 采用以下收口原则：

> **Flowkit 定义可执行、可验证、可续接的逻辑边界，但不规定执行者之间通过什么媒介交换信息。**

对应的最小主线是：

```text
Policy 确定当前 Action
→ 生成逻辑 Action Package
→ 当前执行者执行
→ 返回逻辑 Action Result
→ 正式事实被接纳
→ 可生成 Continuation Context
→ Policy 重新计算下一 Action
```

GitHub、远程／本地、Push、PR、Patch、ZIP、脚本和 Worktree 都只可能是某个具体环境的实现选择，不进入 C1 核心契约。

本 Explore 完成后，正常下一 Action 为：

```text
review-explore
```

只有 reviewer 返回 `changes-requested` 时，才进入：

```text
revise-explore
```

---

## 13. 本次 Explore 同步识别的文档纠偏

本次 C1 Explore 不直接修改已冻结文档，但已识别出后续需要正式收口的文档偏差。

### 13.1 应新增的环境中立参考

建议后续形成：

```text
docs/continuation-boundary-reference.md
```

它只定义：

- 什么是续接切点；
- 续接所需的最小正式信息；
- 如何从正式事实重新生成续接上下文；
- 如何判断后续会话已经正确接上。

它不得规定：

- GitHub；
- Push／Pull；
- PR／MR；
- 本地或远程；
- 一个或多个 AI；
- Patch、ZIP、PowerShell；
- Worktree 或共享仓库拓扑。

### 13.2 `docs/bootstrap-reference.md` 需要由 D1 定点修订

需要删除或改写的固定假设包括：

- ChatGPT 必须是主开发者；
- 本地 Codex 必须是 Reviewer；
- AI／机器交接前必须 Push；
- 接手方必须从远端恢复；
- 一个 Delivery 必须对应一个 PR；
- GitHub Merge Commit 是唯一集成方式；
- Bootstrap 期间根仓库不得出现正式 `.flowkit/`。

修订后只保留：

- 领域角色为 `owner / author / reviewer`；
- 交接切点必须能够恢复流程，但交换媒介不固定；
- Git 继续拥有文件与历史；
- PR、Remote、Push 只属于项目采用时的 Git 操作方式；
- B1 已固定的 `.flowkit/runs/` 属于正式 Run 事实，不得被旧 Bootstrap 表述否定。

### 13.3 应废止的错误草案

以下草案不应作为正式产品参考继续使用：

```text
docs/local-author-materializer-workflow.md
docs/adapters/github-snapshot-workspace.md
```

以及任何固定下列内容的后续草案：

- Remote Author + Local Materializer 默认模式；
- Author 必须远程、Reviewer 必须本地；
- 固定 Workspace Capability 枚举；
- 同一 Worktree、两个 Worktree、本地 Bare Remote、Remote Forge 等封闭拓扑；
- GitHub 是默认或唯一的信息交换媒介。

这些方案可以在具体环境中临时采用，但不能进入 Flowkit Core 或冻结产品文档。

### 13.4 本包附带的纠偏候选文件

本次 Explore 包同时附带：

```text
docs/c1-d1-boundary-correction.md
docs/continuation-boundary-reference.md
docs/bootstrap-reference-corrections.md
```

它们是 C1／D1 后续 Proposal 和文档修订的输入候选，不代表已经 Review Approved 或 Frozen。

