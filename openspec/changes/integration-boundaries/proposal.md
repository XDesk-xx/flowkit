## Why

B1 已冻结 Flowkit 的核心模型：Delivery > Change > Action 三层实体、最小状态、固定 Action Catalog、Review/Revision 闭环、Run 模型和 Verification 边界。

C1 Explore 已通过独立 `review-explore`，识别出此前文档将**信息交换媒介**误写为**流程规则**的核心偏离：

- GitHub、Push、PR 被写成流程前提；
- Remote Author + Local Materializer 被提升为正式角色；
- Workspace Capability 枚举和 Worktree/Bare Remote/Remote Forge 拓扑被写成封闭模型；
- Git Commit 被理解为所有续接的必要条件。

如果不在 C1 中冻结环境中立的集成边界契约，后续 Change 和 Runner 实现可能重新引入对特定平台、特定部署位置和特定交换方式的依赖，直接降低扩展性。

C1 将 approved Explore 转化为正式集成边界文档与 OpenSpec capability contract，回答：

> Flowkit 为了让一个 Action 被正确执行、产生正式结果，并让后续执行者或新会话准确接上流程，最少需要交换哪些逻辑信息？

## What Changes

- 新建 `docs/integration-boundaries.md`
  - 定义 Action Definition 与 Action Package 的逻辑边界
  - 定义 Action Result 的逻辑边界
  - 定义 ResultRef 的最低语义
  - 定义 Continuation Context 与续接切点
  - 定义 Review 通过 `reviewedResultRef` 绑定正式结果
  - 定义 OpenSpec、Git、Verification、Archify、CodeGraph、Agent、Adapter、Skill 的权威边界
  - 定义 Adapter 不得成为第二个流程编排器
  - 定义具体媒介和 Provider 不进入核心模型
- 固定 Action Package 为当前 Action 的逻辑执行输入视图，不是固定文件包
- 固定 Action Result 记录"发生了什么"，Policy 决定"接下来做什么"
- 固定 ResultRef 最低要求：唯一识别、可判断失效、不绑定 Provider
- 固定 Continuation Context 为从正式事实生成的恢复视图，不是新的状态权威
- 固定续接切点为边界语义，不是新的实体、状态、Action 或 Commit 类型
- 固定 `reviewedResultRef` 为 Review 绑定正式结果的抽象，不限于 Git SHA
- 固定 Adapter 只负责边界转换，不得判断 Action、跳过 Review 或自行授权
- 固定 Skill 只声明方法类别，不绑定具体标识，不建立 Registry
- 固定 Git 边界 ≠ 续接切点 ≠ 信息交换媒介
- 新增 `flowkit-integration-boundaries` capability spec

## Capabilities

### New Capabilities

- `flowkit-integration-boundaries`：定义 Flowkit 与外部执行者、OpenSpec、Git、Review、Verification、Archify、CodeGraph 和 Skill 之间的环境中立集成边界，包括 Action Package、Action Result、ResultRef、Continuation Context、续接切点、reviewedResultRef、Adapter 边界、Skill 声明和各权威边界。

### Modified Capabilities

无。C1 不修改 B1 已冻结的 `flowkit-core-model` capability。

## Impact

- 后续 Change（D1 Bootstrap、Runner 实现）可以在不选择信息交换媒介的情况下引用稳定的集成契约
- Adapter 实现者获得明确的输入输出边界和禁止行为清单
- Review 绑定不再依赖 Git-only 表达，支持多环境
- 续接恢复有了可验证的最小信息集
- 旧 Bootstrap 文档中的固定 GitHub、Push、PR 和具体 AI 映射由 D1 负责定点修订，C1 只提供环境中立原则
