# Flowkit 集成边界

## 1. 目的与边界

本文冻结 Flowkit 与外部执行者、OpenSpec、Git、Review、Verification、Archify、CodeGraph 和 Skill 之间的环境中立集成边界。

核心原则：

> Flowkit 定义可执行、可验证、可续接的逻辑边界，但不规定执行者之间通过什么媒介交换信息。

本文只定义逻辑信息边界、权威归属和权力限制，不定义具体 JSON Schema、CLI、Adapter 实现、Skill 标识、Git 命令、交换媒介或持久化格式。

本文不修改 B1 已冻结的核心模型（`docs/core-model.md`、`docs/delivery-lifecycle.md`、`docs/verification-model.md`）。若发现与 B1 的真正冲突，必须提出新的 corrective Change。

## 2. B1 已冻结且继承的事实

C1 继承 B1 已冻结的以下事实，不重新定义：

- 三层实体：`Delivery > Change > Action`；Run 是执行实例，不是第四个产品层；
- 正式角色：`owner / author / reviewer`；不因工具组合增加"远程 Author""本地 Materializer"等核心角色；
- Policy 权威：当前唯一合法的下一 Action 由 Policy 根据正式事实计算，不持久化 `currentAction`；
- 事实权威：`One fact, one authority`；
- Review 与 Revision：`review-* → approved → 向前推进`；`changes-requested` 只表示 target 不可批准，author-only blockers 才进入 `revise-*`；含任一 non-author blocker 时 Author revise 禁止、`next()` blocked，但 explicit same-stage re-review 合法且不由 Policy 自动触发；
- Run 基础结构：`.flowkit/runs/<delivery-id>/<change-id>/<run-id>/`。

## 3. Action Definition 与 Action Package

### 3.1 Action Definition

Action Definition 是某类 Action 的稳定规则，包括角色、目标、前置条件、允许输出和完成条件。Action Definition 由 B1 固定的 Action Catalog 定义，C1 不修改。

### 3.2 Action Package

Action Package 是 B1 针对当前 Delivery、Change、Run 和 Standard Change Action 生成的**provider-neutral 逻辑执行输入视图**。B1 拥有 logical preparation；本 integration layer 只做 structured/physical mapping，不决定下一 Action。

Action Package 不是固定的物理文件包、ZIP、Patch、JSON Manifest 或特定平台 Payload。相同的逻辑输入可以通过不同媒介表达，只要语义完整且无歧义。

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

当当前 Change Action 需要 owner 授权（如 Apply、Archive）时，Action Package 必须标明哪些授权已存在、哪些尚未存在。Delivery Full Test / Finalize 的 Owner authorization 属 Delivery behavior boundary，不是 Standard Change Action Package。执行者不得自行授予缺失的授权。

## 4. Action Result

Action Result 记录"发生了什么"，不决定"接下来做什么"。

Action Result 至少表达：

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

正确关系：

```text
执行者完成 Action
→ 产生 Action Result
→ Flowkit 校验并接纳正式事实
→ Policy 重新计算
→ 得到唯一合法下一 Action
```

Action Result 中的 `nextActionRecommendation` 只能是建议，不能替代 Policy。Action Result 不得自行推进 Change 或 Delivery 状态，不得复制外部工具的完整专业状态。

## 5. ResultRef

ResultRef 是引用正式结果的逻辑抽象。

ResultRef 至少满足：

- 能唯一识别“引用发生当时”的正式结果或版本；
- 当它作为**当前 Action handoff** 被消费时，能 exact-check 目标是否仍是被批准/被审查的版本；
- 能让接收方读取或定位当前需要消费的结果；
- 不要求所有环境都使用相同 Provider；
- 不把当前 Commit SHA 写入会因自身 Commit 而过期的状态文件。

具体环境可以把 ResultRef 映射为 Git revision、Run result、artifact version、content hash 或其他不可歧义的正式版本引用。

C1 不把 Git Commit SHA 固定为所有结果引用的唯一形式。

ResultRef 的失效语义按 authority 和消费时点区分：

- immutable `run-result` 以及**当前尚未完成的 handoff**保持 exact binding；在被消费前发生替换或 drift，当前 Review / 下一 Action 必须 fail-closed；
- completed Run 中的 mutable `produced-artifact` / `verification-summary` 是 point-in-time 记录。后续合法 Revision、Verification 或 OpenSpec archive 改变 current path/bytes，不反向使历史 Run 或旧 Review 自动失效；
- Flowkit 不建立全历史 mutable artifact generation registry，也不通过 archive physical path 重放旧 ResultRef。

## 6. Continuation Context

Continuation Context 是从正式事实生成的**可恢复视图**，不是新的状态权威。

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

其中 `nextAllowedAction` 必须由 Policy 计算，不得由 Continuation Context 自行填写。

规则：

1. 摘要丢失时应能重新生成；
2. 摘要与正式事实冲突时，以正式事实为准；
3. 摘要不得自行修改 Delivery、Change 或 Action 状态；
4. 允许结构化输出，但不作为独立流程权威；
5. 是否长期持久化由后续实现决定。

## 7. 续接切点

续接切点（continuation boundary）只定义为：

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

续接切点不要求 Commit、Push、Remote 或 PR 作为必要条件。续接切点不创建新的 Action、Run 类型或流程状态。

## 8. Review 绑定

Review 必须通过 `reviewedResultRef` 绑定被审查的正式结果：

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

## 9. Adapter 边界

Adapter 只负责边界转换：

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

## 10. Skill 声明

Skill 只提供 Action 内的方法（继承 B1）。Action Package 通过方法类别声明所需 Skill，例如：

```text
文档分析
契约审查
代码审查
安全审查
性能审查
```

C1 不：

- 在核心契约中绑定具体 Skill 路径；
- 绑定 Codex、ChatGPT 或其他 Agent；
- 让 Skill 决定流程；
- 建立 Skill Registry、Router 或 DAG。

具体 Skill 标识由项目配置、Adapter 或 Agent 环境解释，不进入 C1 核心契约。

## 11. 外部工具权威边界

### 11.1 OpenSpec

OpenSpec 拥有 Change 契约与 `spec-driven` planning graph。Flowkit 1.7 thin integration只消费固定 machine surface：version/context/doctor/status/artifact instructions/apply contextFiles/strict validate/archive。Planning artifact path只来自 validated `changeRoot/artifactPaths/contextFiles`；Explore 与 Verification 只在 validated `changeRoot` 下派生 owned filename。Action Package 只暴露当前 Action 所需的契约视图。

兼容性以 **stable `1.7.0` minimum baseline + required structured machine-contract conformance** 为准，不设置固定 minor/major upper bound。Below-baseline、malformed 与 prerelease version fail closed；高于 baseline 的 stable version 只有在 required command、JSON shape、requested-Change/path identity、exit/result coherence 与 archive semantics 全部继续满足 C1 typed contract 时才可消费。Version number 只是 compatibility signal，不是唯一 compatibility authority。

OpenSpec 不得决定 Delivery、当前 Action、Reviewer Verdict 或 owner 授权。Flowkit 不复制 OpenSpec 全部内部状态，也不维护第二套 proposal/spec/design/tasks dependency graph。Strict validation是 contract check，不是 Policy authority。

Mutating archive 仍由 OpenSpec 定义 delta sync、relocation 与 structured terminal result；但 Flowkit 在 child spawn 前 MUST durable arm `openspec-archive-mutation-v1` guard，并在可接纳 terminal result 后先 durable publish normalized terminal observation，再用 post-V1 与 pre-archive F 做 safety classification。只有 `success + drift` 可接纳成功；`success + same` fail closed；`failure + same`普通失败；`failure + drift` recovery-required；无 durable terminal observation 时无论 same/drift 都是 outcome-unknown。该 recovery proof 只覆盖 active changeRoot、canonical `openspec/specs/**` 与 archive immediate-child collision namespace，不扫描历史 archive 正文，也不包含 `.flowkit/.git/node_modules/dist`。Operation success 后仍不得扫描 archive path 做第二套 OpenSpec success proof。

### 11.2 Git

Git 拥有受版本管理文件、Diff 和历史。Change Checkpoint 和 Delivery Final 仍是正式 Git 边界。

但必须区分：

```text
Git 边界
≠ 续接切点
≠ 信息交换媒介
```

Git Commit 可以帮助保存和识别正式结果，但 C1 不规定续接必须 Commit、交接必须 Push、必须存在 Remote 或必须存在 PR／MR。具体 Git 操作属于 D1 或项目 Git 规范。

### 11.3 Verification

项目验证工具拥有原始检查结果。Flowkit 只消费标准状态、摘要和结果引用。

C1 不固定本地命令、CI、GitHub Actions、具体测试框架或执行机器位置。Full Test 授权边界继续沿用 B1，不得由 Adapter、Agent、Skill 或验证工具自行突破。

### 11.4 Archify

Archify 接收 Delivery 架构上下文，返回架构结果引用。Archify 不得决定 Flowkit 下一 Action，也不得产生最终 Review Verdict。

### 11.5 CodeGraph

CodeGraph 接收变化范围或查询上下文，返回依赖、影响范围和相关测试上下文。CodeGraph 不得决定 Flowkit 下一 Action，也不得产生最终 Review Verdict。

## 12. 信息交换媒介中立

Flowkit 不把以下任何方式固定为流程前提：

- GitHub、GitLab 或其他平台；
- Remote 存在；
- Push 或 Pull；
- PR 或 MR；
- 本地或远程执行；
- 一个或多个 AI；
- ChatGPT、Codex 或其他 Provider；
- Patch、ZIP 或共享目录；
- PowerShell、Shell 或特定操作系统；
- Worktree 数量；
- Materializer 存在；
- 封闭的 Workspace Capability 枚举；
- 封闭的协作拓扑枚举。

Flowkit 只检查：

```text
正式结果可读取
+
上下文可恢复
+
Policy 可计算下一 Action
```

## 13. C1 与 D1 的分界

```text
C1
→ 定义"续接需要什么信息"

D1
→ 定义"Bootstrap 中何时需要形成和展示这些信息"
```

两者都不回答"这些信息通过什么方式传递"。

### 13.1 C1 负责

- 交换什么逻辑信息；
- 每类事实由谁拥有；
- Action Package/Result/ResultRef/Continuation Context 的逻辑边界；
- Review 如何引用结果；
- Agent/Adapter/Skill 不得拥有的流程权力。

### 13.2 D1 负责

- 何时形成续接切点；
- owner 如何授权；
- Git 操作具体规则；
- 旧 Bootstrap 文档修正；
- `status`/`next`/`resume-context` 的具体执行。

## 14. 废止的方向

以下方向不作为 Flowkit Core 的默认方向：

1. **固定 GitHub／Remote Forge** — 把可选交换媒介提升成产品依赖；
2. **固定 Remote Author + Local Materializer** — 把受限环境方案提升成正式角色；
3. **固定 Workspace Capability 枚举** — 封闭枚举非穷尽的执行方式；
4. **把 Materializer 设为必备组件** — 确定性落盘程序不是集成模型的必要条件；
5. **把 Git Commit 当成所有续接的必要条件** — 同一会话内续接未必需要额外 Commit；
6. **枚举所有交接拓扑** — 非穷尽的执行方式不应写成封闭模型。

这些方案可以在具体环境中临时采用，但不能进入 Flowkit Core 或冻结产品文档。

## 15. 预计文档影响

### 15.1 C1 已创建

```text
docs/integration-boundaries.md
```

### 15.2 D1 后续预计更新

```text
docs/bootstrap-reference.md
docs/development-roadmap.md
AGENTS.md
```

必要时在 `docs/delivery-lifecycle.md` 补充：

> 执行者或会话变化不构成流程状态变化；流程只由正式 Action Result 和 Policy 推进。

但不得改变 B1 生命周期语义。

### 15.3 应废止的旧草案

```text
docs/local-author-materializer-workflow.md
docs/adapters/github-snapshot-workspace.md
```

这些草案中有价值的背景只能作为"为什么不能固定媒介"的问题证据，不得直接转入正式文档。

## 16. A1 Owner / Manifest / OpenSpec Write Boundary

A1 冻结以下 authority：

```text
Owner independent input
→ authority source

Delivery Manifest ownerDecisions
→ source-controlled Owner provenance

Delivery Manifest Change fields
→ lifecycle / dependency / architectureImpact facts

Policy
→ whether a lifecycle boundary is legal

A1 write service
→ mechanical mutation only

OpenSpec
→ Change artifact lifecycle
```

A1 只初始化 target Change minimal `.openspec.yaml`，不调用或复制 OpenSpec 1.7 artifact lifecycle。C1 checkpoint 后的新 activation request MUST显式提供 `specDeltaMode=required|skip`：`required`只写 `schema: spec-driven` + `created`，`skip`另写 `skip_specs: true`；不得从 goal/outputs/Proposal/spec 数量推断。当前 Delivery C1 checkpoint 前已存在的 exact D1–G1 identity仅允许 bounded missing-mode→`required` compatibility。Run `ownerAuthorization`、Reviewer prose、Git commit message或聊天摘要都不能替代 Manifest Owner record。

pre-A1 exact legacy Change 缺失 `architectureImpact` 时，不得从 Delivery architecture、OpenSpec、goal、outputs、Run 或 Git 推断 boolean。
