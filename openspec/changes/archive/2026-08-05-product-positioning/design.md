## Context

Flowkit 当前处于 Bootstrap 阶段。A1 Explore 已经过独立审查、修订和 owner 确认，冻结了以下输入：

> Flowkit 是以 Delivery 为编排核心、以 Change 为实施单元、以 Action 为执行步骤的确定性交付编排器。

A1 需要把该结论形成正式文档和 OpenSpec capability contract，但不能提前设计 B1 的状态模型、C1 的集成协议或 D1 的 Bootstrap 协作细节。

## Goals / Non-Goals

**Goals:**
- 建立唯一的正式产品定义
- 明确 Delivery、Change、Action 的高层关系
- 明确 Flowkit 的最小职责和确定性的含义
- 建立 `One fact, one authority` 原则
- 明确外部系统的高层权威归属
- 明确正式角色中立和产品非目标
- 为后续 Change 提供不可静默偏离的产品基线

**Non-Goals:**
- 不定义完整状态字段、状态转换或 Runner JSON
- 不定义 CLI 命令和外部工具具体调用协议
- 不定义 Findings 或测试结果的数据格式
- 不定义 Bootstrap 的完整互动规则
- 不实现任何生产代码
- 不创建通用 Registry、Plugin、Evidence 或 Receipt 平台

## Decisions

### Decision 1: 使用唯一产品定义

正式定义固定为：

> Flowkit 是以 Delivery 为编排核心、以 Change 为实施单元、以 Action 为执行步骤的确定性交付编排器。

不得重新建立并列产品方向。Change 管理工具范围过窄，通用工作流平台范围过宽，均不采用。

### Decision 2: 正式说明文档与契约分离

- `docs/product-positioning.md`：面向人类的正式产品说明
- `flowkit-product-positioning` spec：可验证产品契约
- `README.md`：项目入口与简短摘要

三者不得形成冲突的第二产品定义。

### Decision 3: A1 只冻结高层模型

A1 可以说明 `Delivery → Change → Action`，但不得定义状态枚举、Schema、转换表、前置条件实现或恢复算法。这些内容属于 B1。

### Decision 4: 确定性只约束流程判断

对于相同的已知流程事实和输入，Flowkit 应产生相同的允许、阻塞或下一步判断。确定性不等于自动替代产品、架构或 reviewer 的专业判断。

### Decision 5: One fact, one authority

高层权威归属固定为：

| 事实 | 主要权威 |
|---|---|
| Delivery 和 Change 的流程状态 | Flowkit |
| Change 的需求和实施契约 | OpenSpec |
| 文件内容、版本历史和同步事实 | Git |
| 被接受的正式架构表达 | Archify |
| 代码依赖和影响范围上下文 | CodeGraph |
| Findings 和 Verdict | Reviewer |
| 测试和静态检查结果 | 项目验证工具 |

其他系统可以引用、消费、投影或验证，但不得成为第二个独立权威。具体路径、Schema 和协议属于 C1。

### Decision 6: 正式角色保持中立

正式产品文档和 spec 只使用 `owner`、`author`、`reviewer`。具体人工、宿主或工具如何映射角色属于运行环境和 D1，不改变产品契约。

### Decision 7: 明确产品非目标

Flowkit 不是通用任务工作流、通用执行者编排、Skill/Plugin 平台、OpenSpec 替代品、Git 平台、测试平台、Review 工具、Archify/CodeGraph 内部实现、Evidence/Receipt 系统或自动 Full Test 系统。

### Decision 8: Explore 保留为正式上游产物

`explore.md` 记录问题边界、审查 Findings、修订和 owner 决策。Proposal、Design 和 Spec 消费其结论，但不复制完整探索过程。

正式 Run 记录可以通过 Git 承载某次 Action 的任务、上下文和结果摘要；Run 不是新的事实权威，具体 Run Schema 和状态规则留给 B1/D1。

## Risks / Trade-offs

| 风险 | 等级 | 缓解措施 |
|---|---|---|
| 定位过于抽象 | 中 | 同时建立 capability requirements 和明确非目标 |
| 与 B1 状态模型重叠 | 中 | A1 只描述职责归属 |
| 与 C1 集成协议重叠 | 中 | A1 只列高层权威 |
| 角色名称被具体工具替代 | 中 | spec 强制中立角色 |
| Run 被误解为 Evidence 系统 | 中 | Run 只记录一次执行的输入与结果摘要，重要事实回写原权威 |

## 实施计划

1. 创建 `docs/product-positioning.md`
2. 写入产品定义、职责、确定性、事实权威、角色中立与非目标
3. 检查 README 一致性
4. 验证 capability delta
5. 执行文档一致性和范围审查
6. 填写 `verification.md`

## 回滚

删除 A1 新建的正式文档并恢复 A1 引入的其他文档修改；不涉及数据迁移或运行时回滚。

## 待解决问题

没有 Blocking Open Questions。状态模型、外部协议和 Bootstrap 互动分别留给 B1、C1、D1。
