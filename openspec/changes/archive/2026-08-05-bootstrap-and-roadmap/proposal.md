## Why

A1 已冻结产品定位，B1 已冻结核心模型（Delivery > Change > Action、固定 Action Catalog、Review/Revision 闭环、Run 模型、Verification 边界），C1 已冻结集成边界（Action Package、Action Result、ResultRef、Continuation Context、续接切点、reviewedResultRef、Adapter 边界、媒介中立）。

D1 Explore 已通过两轮 `review-explore`（030 changes-requested → 031 revise → 032 approved），识别出旧 Bootstrap 表述将**当前执行环境的偶然条件**误写为**流程规则**的核心偏离：

- ChatGPT 是主开发者、Codex 是固定 Reviewer 被写成正式角色；
- 交接前必须 Commit + Push、GitHub 是默认交换通道被写成流程前提；
- 一个 Delivery 必须一个 PR 被写成集成规则；
- Bootstrap 期间不得出现正式 `.flowkit/` 与 B1 已冻结的 `.flowkit/runs/` 冲突；
- Git Commit 被理解为所有跨 AI 同步的必要边界；
- Change Start 被拔高为正式 Git 边界，与 reference §8.1 的三正式边界模型冲突。

如果不在 D1 中冻结可执行的 Bootstrap 操作基线，后续 Runner 实现和手工执行可能重新引入对特定平台、特定 AI 和特定 Git 习惯的依赖，直接破坏 A1/B1/C1 已建立的环境中立性。

D1 将 approved Explore 转化为正式 Bootstrap 操作文档、仓库开发指令、Git 工作流 Skill 和开发路线，回答：

> 在没有 Runner 和 CLI 的 Bootstrap 阶段，人和 AI 如何手工保证 Flowkit 规则成立？这些手工操作规则中哪些需要冻结为正式文档，以便未来 Runner 按同一套规则实现？

## What Changes

- 新建 `docs/bootstrap-reference.md`
  - 定义 Bootstrap 最小执行循环
  - 定义 Run 的创建、完成、重试和保留规则（含目标改变边界）
  - 定义续接切点的操作性定义和 Continuation Context 的 Bootstrap 生成
  - 定义 Git 模型（仅 Delivery Start、Change Checkpoint、Delivery Final 三种正式边界 + 按需普通 Commit）
  - 明确 Change 激活不是正式 Git 边界，不要求独立 Commit
  - 定义 owner 授权边界
  - 定义信息交换媒介中立原则
  - 修正旧 Bootstrap 表述中的固定模式
- 新建 `docs/development-roadmap.md`
  - 定义 Deterministic Core → Change Execution Loop → Delivery Execution Loop 三阶段路线
  - 定义首次自托管切换条件
  - 声明不引入 Gate Registry、Skill Registry、Provider Registry 或通用插件平台
- 新建 `AGENTS.md`
  - 定义仓库级开发指令
  - 声明先读正式 docs、由 Policy 确定下一 Action、不得跳过 Review 等最小规则
  - 声明不固定 ChatGPT、Codex、GitHub、Remote、PR 或 Worktree 拓扑
- 新建 `.codex/skills/flowkit-git-workflow/SKILL.md`
  - 定义 Delivery Start、Change Checkpoint、Delivery Final 模板
  - 定义普通 Commit 的按需原则
  - 声明 Action/Run 不自动 Commit
  - 声明不拥有 Action 决策权、Change 完成判断权或 Delivery Final 判断权
- 固定 Bootstrap 手工执行同一套 Flowkit 规则，不建立第二套 bootstrap-only 状态系统
- 固定 Run 创建边界：正式 Action 改变、执行角色改变、本次目标改变、failed/cancelled 重试
- 固定 Run 文件最低内容（action.md / context.json / result.json）和不保存完整对话
- 固定 Run 创建和完成不自动 Commit
- 固定 Continuation Context 从正式事实生成，不是新的状态权威
- 固定 Git 正式边界仅为 Delivery Start、Change Checkpoint、Delivery Final
- 固定 Change 激活不是正式 Git 边界
- 固定普通 Commit 仅按真实需要创建，不推进流程状态
- 固定 Review 不被强制绑定 Git Commit
- 固定 owner 授权边界（Apply、Archive、Full Test、Finalize、corrective Change、破坏性 Git）
- 固定 Development Roadmap 不引入过度设计
- 新增 `flowkit-bootstrap-and-roadmap` capability spec

## Capabilities

### New Capabilities

- `flowkit-bootstrap-and-roadmap`：定义 Bootstrap 阶段的操作性规则、Git 正式边界模型、Run 操作规则、续接切点操作性定义、owner 授权边界、正式输出文档结构和后续开发路线，确保 Bootstrap 手工执行同一套 Flowkit 规则且不建立第二套状态系统。

### Modified Capabilities

无。D1 不修改 A1 的 `flowkit-product-positioning`、B1 的 `flowkit-core-model` 或 C1 的 `flowkit-integration-boundaries`。

## Impact

- 后续 Runner 实现可以引用稳定的 Bootstrap 操作规则，按同一套规则实现确定性强制
- 手工执行者和新会话获得明确的续接恢复指引
- Git 工作流 Skill 获得明确的边界检查和模板生成能力，不拥有流程决策权
- 旧 Bootstrap 文档中的固定 GitHub、Push、PR 和具体 AI 映射被正式修正
- Development Roadmap 为后续代码 Delivery 提供最小推进顺序和首次自托管验收条件
- `docs/delivery-lifecycle.md` Section 10 的待定内容由 `docs/bootstrap-reference.md` 覆盖，不改变 B1 生命周期语义
