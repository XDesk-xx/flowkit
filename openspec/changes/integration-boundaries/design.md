## Context

B1 已冻结 Flowkit 核心模型（`flowkit-core-model` capability），包括三层实体、最小状态、固定 Action Catalog、Review/Revision 闭环、Run 模型和 Verification 边界。

C1 Explore 已通过两轮 `review-explore`（019 changes-requested → 020 revise → 021 approved），识别出此前文档将信息交换媒介误写为流程规则的核心偏离，并定义了环境中立的逻辑集成边界方向。

本设计将 Explore 结论转为正式集成边界契约，并回答 Explore 中提出的 Q1–Q8 收敛问题。

## Goals / Non-Goals

**Goals:**

- 定义 Action Definition 与 Action Package 的逻辑边界
- 定义 Action Result 的逻辑边界
- 定义 ResultRef 的最低语义
- 定义 Continuation Context 与续接切点
- 定义 Review 通过 `reviewedResultRef` 绑定正式结果
- 定义 Adapter 只负责边界转换，不得成为第二个编排器
- 定义 Skill 只声明方法类别
- 定义 OpenSpec、Git、Verification、Archify、CodeGraph 的权威边界
- 定义 C1 与 D1 的分界
- 为 D1、Runner 实现和 Adapter 开发提供稳定契约

**Non-Goals:**

- 不修改 B1 已 Checkpoint 的核心模型
- 不实现 Runner、CLI 或生产代码
- 不定义 JSON Schema 或具体持久化格式
- 不固定信息交换媒介（GitHub、Push、PR、Patch、ZIP 等）
- 不引入 Materializer、Provider Registry、Workspace Capability 枚举
- 不枚举协作拓扑（Worktree 数量、本地/远程、Bare Remote 等）
- 不定义具体 Git 命令、Commit 时机和交互文案
- 不建立 Evidence、Receipt、消息队列或通用插件平台
- 不运行 Full Test

## Decisions

### Decision 1: Action Package 是逻辑执行输入视图

`Action Package` 保留该名称（回答 Q1），但定义为：

> 针对当前 Delivery、Change、Run 和 Action 生成的逻辑执行输入视图。

它不是固定的物理文件包。相同的逻辑输入可以通过不同媒介表达，只要语义完整且无歧义。

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

C1 不在 Proposal 阶段固定完整 JSON Schema，也不规定 Package 的物理载体。

### Decision 2: Action Result 记录发生，Policy 决定下一步

Action Result 只表达"发生了什么"：

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

- Result 记录"发生了什么"；
- Policy 决定"接下来做什么"；
- Result 不得自行推进 Change 或 Delivery；
- Result 不得复制外部工具的完整专业状态。

`nextActionRecommendation` 可以存在于 Result 中，但只能是建议，不能替代 Policy。

### Decision 3: ResultRef 最低语义

ResultRef（回答 Q4）至少满足：

- 能唯一识别被引用结果；
- 能判断结果是否被替换或失效；
- 能让接收方读取或定位结果；
- 不要求所有环境都使用相同 Provider；
- 不把当前 Commit SHA 写入会因自身 Commit 而过期的状态文件。

具体环境可以映射到 Git revision、Run result、artifact version、content hash 或其他不可歧义的正式版本引用。

C1 不把 Git Commit SHA 固定为所有结果引用的唯一形式。

### Decision 4: Continuation Context 是生成视图，不是状态权威

Continuation Context（回答 Q2）定义为：

> 从正式事实生成的可恢复视图，不是新的状态权威。

最低内容：

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

规则：

1. 摘要丢失时应能重新生成；
2. 摘要与正式事实冲突时，以正式事实为准；
3. 摘要不得自行修改 Delivery、Change 或 Action 状态；
4. `nextAllowedAction` 必须由 Policy 计算，不得由摘要作者随意填写；
5. 允许结构化输出，但不作为独立流程权威；
6. 是否长期持久化由后续实现决定。

### Decision 5: 续接切点是边界语义

续接切点（continuation boundary）只冻结以下逻辑定义：

> 当当前阶段已有稳定、可引用的正式结果，并且 Continuation Context 可以从正式事实生成时，形成一个可续接切点。

续接切点不是：

- 新的 Action；
- 新的 Run 类型；
- 新的领域角色；
- 新的流程状态；
- 特殊 Commit；
- GitHub 事件；
- Push／Pull；
- PR／MR；
- 文件传输协议。

是否需要 Commit、文件复制、远端同步或其他操作，由当前项目环境与 D1 的 Bootstrap 操作规则决定，不进入 C1 核心契约。

### Decision 6: reviewedResultRef 替代 Git-only 绑定

Review 必须绑定被审查的正式结果（回答 Q3）：

```text
reviewedResultRef
verdict
blockingFindings
nonBlockingFindings
```

`reviewedResultRef` 必须唯一指向被审查的正式结果。具体 Adapter 可以把它映射为 Git revision、Run result、artifact version、content hash 或其他不可歧义的版本引用。

如果被审查结果发生变化：

```text
原 Approval
→ 对新结果失效
→ 必须重新 Review
```

Review 是否有效，不依赖是否使用 GitHub、Remote 或 PR。C1 不把 Git Commit SHA 固定为所有 Review 绑定的唯一形式。

### Decision 7: Adapter 只负责边界转换

Adapter 的职责：

```text
Flowkit Core
→ 生成当前 Action 的逻辑执行输入
→ Adapter 将其呈现给当前执行者
→ 执行者返回逻辑 Action Result
→ Adapter 传回 Flowkit
```

Adapter 不得：

- 判断当前 Action；
- 改写 Change 契约；
- 跳过 Review；
- 将 Non-blocking Finding 自动升级为 Blocking；
- 自行授权 Apply、Archive、Full Test 或 Finalize；
- 自行创建新的 Change；
- 成为第二个编排器。

C1 不建立 Provider Registry、Adapter Registry 或动态路由平台。

### Decision 8: Skill 只声明方法类别

Skill 只提供 Action 内的方法（继承 B1）。Action Package 声明所需的方法类别（回答 Q5），例如：

```text
文档分析
契约审查
代码审查
安全审查
性能审查
```

但 C1 不：

- 在核心契约中绑定具体 Skill 路径；
- 绑定 Codex、ChatGPT 或其他 Agent；
- 让 Skill 决定流程；
- 建立 Skill Registry／Router／DAG。

具体 Skill 标识由项目配置、Adapter 或 Agent 环境解释，不进入 C1 核心契约。

### Decision 9: 外部工具权威边界

C1 固定各外部工具的薄输入输出边界：

| 工具 | 拥有 | 不拥有 |
|---|---|---|
| OpenSpec | Change 契约 | Delivery、当前 Action、owner 授权 |
| Git | 受版本管理文件、Diff、历史 | 续接切点、信息交换媒介 |
| Verification 工具 | 原始检查结果 | Full Test 授权、下一 Action |
| Reviewer | Findings、Verdict | 流程推进、owner 授权 |
| Archify | Delivery 架构表达 | 下一 Action、Review Verdict |
| CodeGraph | 依赖与影响范围 | 下一 Action、Review Verdict |

Archify 和 CodeGraph 都不能决定 Flowkit 下一 Action，也不能产生最终 Review Verdict。

### Decision 10: C1 与 D1 的分界

```text
C1
→ 定义"续接需要什么信息"

D1
→ 定义"Bootstrap 中何时需要形成和展示这些信息"
```

两者都不回答"这些信息通过什么方式传递"。

C1 负责：交换什么逻辑信息、每类事实由谁拥有、Action Package/Result/ResultRef/Continuation Context 的逻辑边界、Review 如何引用结果、Agent/Adapter/Skill 不得拥有的流程权力。

D1 负责：何时形成续接切点、owner 如何授权、Git 操作具体规则、旧 Bootstrap 文档修正、`status`/`next`/`resume-context` 的具体执行。

### Decision 11: 废止的错误方向

以下方向不作为 C1 Proposal 的默认方向（ Explore §6 已识别）：

1. 固定 GitHub／Remote Forge — 把可选交换媒介提升成产品依赖；
2. 固定 Remote Author + Local Materializer — 把受限环境方案提升成正式角色；
3. 固定 Workspace Capability 枚举 — 封闭枚举非穷尽的执行方式；
4. 把 Materializer 设为 C1 必备组件 — 确定性落盘程序不是集成模型的必要条件；
5. 把 Git Commit 当成所有续接的必要条件 — 同一会话内续接未必需要额外 Commit；
6. 枚举所有交接拓扑 — 非穷尽的执行方式不应写成封闭模型。

### Decision 12: 不修改 B1 已冻结文档

C1 不修改 B1 已 Checkpoint 的核心文档（回答 Q6）。

C1 新建 `docs/integration-boundaries.md` 和对应 OpenSpec 契约。若发现 B1 真正冲突，必须明确提出新的 corrective Change，而不能在 C1 静默改写。

旧 Bootstrap 中的 GitHub、Push、PR 和具体 AI 映射由 D1 负责修正（回答 Q7）。`.flowkit/runs/` 与旧 Bootstrap 禁止 `.flowkit/` 的冲突也由 D1 处理（回答 Q8）。

### Decision 13: 预计文档影响

C1 Apply 预计创建：

```text
docs/integration-boundaries.md
openspec/changes/integration-boundaries/verification.md
```

D1 后续预计更新：

```text
docs/bootstrap-reference.md
docs/development-roadmap.md
AGENTS.md
```

必要时在 `docs/delivery-lifecycle.md` 补充：

> 执行者或会话变化不构成流程状态变化；流程只由正式 Action Result 和 Policy 推进。

但不得改变 B1 生命周期语义。

应废止的旧草案：

```text
docs/local-author-materializer-workflow.md
docs/adapters/github-snapshot-workspace.md
```

这些草案中有价值的背景只能作为"为什么不能固定媒介"的问题证据，不得直接转入 Proposal。
