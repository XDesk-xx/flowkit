# Development Roadmap

> 后续 Runner Delivery 的最小推进顺序和首次自托管切换条件。
>
> 本文档与 A1（产品定位）、B1（核心模型）、C1（集成边界）已冻结事实一致。

---

## 1. 概述

Bootstrap Delivery 完成后，后续 Runner Delivery 按以下三个阶段最小推进：

```text
Deterministic Core
→ Change Execution Loop
→ Delivery Execution Loop
```

不引入过度设计：

```text
Gate Registry
Skill Registry
Provider Registry
通用插件平台
```

未来 Delivery 启动时使用实际日期，不预先冻结日期。

---

## 2. 阶段一：Deterministic Core

目标：

```text
Delivery / Change / Run 状态模型
固定 Change-only Action Catalog
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

本阶段交付 Flowkit 的确定性内核：状态模型、Policy 计算和正式事实读取。不实现完整 Change 或 Delivery 生命周期，不引入插件或扩展机制。

---

## 3. 阶段二：Change Execution Loop

目标：

```text
Delivery / Change 创建
Change-only Run 创建和生命周期
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

本阶段交付完整 Change 生命周期：从创建到 Archive 再到 Checkpoint 识别。Git 工作流只识别和辅助正式边界，不自动创建业务 Commit。

---

## 4. 阶段三：Delivery Execution Loop

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

本阶段交付完整 Delivery 生命周期：从 Ready 到 Finalize。Full Test / Finalize 是 Delivery behavior，不是 Standard Formal Action/Run；Full Test 由 owner 明确授权，不由流程自动触发。Agent Adapter 是薄 I/O 转换层，不成为第二编排器。

---

## 5. 首次自托管条件

至少满足以下全部条件后，才切换到首次自托管 Delivery：

```text
1.  Flowkit 能持久化 Delivery / Change / Run 正式事实
2.  Policy 能唯一确定下一 Action
3.  OpenSpec 集成可用
4.  Review / Revise 闭环可用
5.  Change Verification 可用
6.  Runs 可恢复
7.  Continuation Context 可生成
8.  Change Checkpoint 可识别
9.  Full Test owner 授权边界可用
10. Delivery Final 可识别
11. Agent Adapter 不成为第二编排器
12. 稳定 Runner 已发布
13. 端到端 Bootstrap 验收通过
```

然后：

```text
Bootstrap Delivery 完成
→ 发布并固定 Runner
→ 创建第一个自托管 Delivery
```

---

## 6. 不引入的设计

以下设计不在 Roadmap 中引入：

```text
Gate Registry
Skill Registry
Provider Registry
通用插件平台
通用编排框架
```

原因：Roadmap 只包含最小必要的后续 Delivery。Registry 和插件平台属于过度设计，在 Bootstrap 阶段没有已验证的需求支撑。如果未来出现明确需求，通过正式 Change 提出，不在 Roadmap 中预先承诺。
