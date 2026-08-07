# AGENTS.md

> 仓库级 Agent 操作约束。正式事实以当前 OpenSpec、Flowkit 状态、Git、
> Reviewer 结果和项目验证工具为准，不依赖聊天记忆推断。

## 基本规则

1. 执行 Action 前先读取当前正式事实，并由 Flowkit Policy 确认合法 Action。
2. 不重新打开已 Checkpoint Change；新问题通过当前合法流程或新的 corrective Change 处理。
3. `approved` 才向前推进；只有 `changes-requested` 才执行对应 `revise-*`。
4. Author 不自审；Review 必须由独立 Reviewer 完成。
5. Full Test、Archive、Checkpoint、Finalize 等 owner 边界不得自行授权。
6. Run / Action 不自动 Commit；普通 Commit 不推进 Flowkit 状态。
7. 正式 Change artifacts 必须写入其 canonical Git-tracked 路径；`.tmp/**` 只用于可删除 scratch。
8. 不建立第二套流程权威；不使用聊天、Memory、临时文件替代正式事实。

## Review / Revise

- `review` = **完整审查**：一次检查当前阶段全部适用契约和验收条件，尽量一次列全 Blocking Findings。
- `revise` = **最小安全修复**：只修当前 Blocking Findings，不扩大 scope，不顺手重构。
- 分析范围可以完整，实际修改范围必须最小。
- 小修改执行 focused checks；只有影响共享契约、公共类型或跨模块行为时才扩大到 affected checks。
- Review / Revise 不自动运行 Delivery Full Test。

### 契约修改 preflight

修改 `explore.md / proposal / design / spec` 前：

1. 完整读取 Finding、required resolution 和其引用的正式契约。
2. 枚举该问题涉及的全部同类对象和引用位置，避免只修 Reviewer 点名的一处。
3. 验证设计可实现：
   - 读取涉及的实际函数、类型和持久化约束；
   - 追踪 create → persist → read → consume 的完整数据流；
   - 排除自引用、循环依赖、不可执行约束和与现有实现冲突的假设。
4. 修改后只对受影响概念做一致性检查。

## 原则

能由 Core、类型、Policy、Git 或验证工具确定的事实，
不要要求 Agent 手工维护或重复证明。