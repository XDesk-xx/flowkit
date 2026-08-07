# AGENTS.md

> 仓库级开发指令。所有 AI Agent 在本仓库工作前必须读取并遵守。
>
> 本文档与 `docs/bootstrap-reference.md` 分工：本文档是简短约束，`docs/bootstrap-reference.md` 是详细操作参考。

---

## 最小规则

1. **先读取正式 docs、当前 OpenSpec Change 和当前 Runs**，不依赖聊天摘要或记忆推断当前流程状态。

2. **由 Policy 确定唯一合法下一 Action**，不由 Agent 建议、Git 状态或聊天摘要决定。正式事实 → Flowkit Policy → 唯一合法下一 Action。

3. **不得重新打开已 Checkpoint Change**。已 Checkpoint 的 Change 不重新打开，真正冲突通过 corrective Change 处理。

4. **不得跳过正式 Review**。`approved` 向前推进；只有 `changes-requested` 才进入对应 `revise-*`。

5. **不得自行授权 Full Test**。Full Test 由 owner 明确授权，不得由 Apply、Revision、Review、Archive 或 Adapter 自动触发。

6. **Action / Run 不自动 Commit**。Run 创建和完成都不自动触发 Git Commit。Run 可以与当前 Change 的其他正式内容一起在普通 Commit 或 Change Checkpoint 中进入 Git 历史。

7. **Git 只在 Start / Checkpoint / Final 形成正式边界**。一个 Delivery 的 Git 历史只要求：1 个 Delivery Start + 每个 Change 1 个 Change Checkpoint + 1 个 Delivery Final + 0 到若干按需普通 Commit。Change 激活不是正式 Git 边界。

8. **普通 Commit 仅按真实保存和交互需要创建**。不推进 Flowkit 状态，不等于 Action 完成，不等于 Review Approved，不等于 Change Checkpoint。

9. **执行者或会话变化不构成流程状态变化**。更换 AI、更换会话或更换工作环境不改变 Delivery、Change 或 Action 的流程状态。

10. **信息交换媒介不固定**。不要求 GitHub、Push、PR、Remote 或特定 AI Provider 作为流程前提。正式结果可读取、上下文可恢复、Policy 可计算下一 Action 即可。

11. **不得引入第二套流程权威**。Bootstrap 手工执行同一套 Flowkit 规则，不建立 bootstrap-only 的状态、manifest 或 pointer。所有正式事实仍由 Flowkit、OpenSpec、Git、Reviewer 和验证工具拥有。

---

## 不固定

```text
ChatGPT
Codex
GitHub
Remote
PR
固定 Worktree 拓扑
```

正式角色为 owner / author / reviewer。当前由谁承担只属于项目执行映射。

---

## 参考

- `docs/bootstrap-reference.md`：Bootstrap 阶段详细操作参考
- `docs/development-roadmap.md`：后续 Runner Delivery 路线
- `docs/product-positioning.md`：A1 产品定位
- `docs/core-model.md`：B1 核心模型
- `docs/delivery-lifecycle.md`：B1 交付生命周期
- `docs/verification-model.md`：B1 验证模型
- `docs/integration-boundaries.md`：C1 集成边界
- `.codex/skills/flowkit-git-workflow/SKILL.md`：Git 工作流 Skill

## Review / Revise 默认规则

- `review` = **完整审查**：一次检查当前阶段全部适用契约与验收条件，尽量一次列全 Blocking Findings；不得发现第一个问题就停止；Non-blocking Findings 不触发 Revision。
- `revise` = **最小安全修复**：只解决当前 Blocking Findings，不扩大 scope、不顺手重构；默认执行 focused checks，只在修改影响共享契约、公共类型或跨模块行为时扩大到 affected checks。
- `revise，影响面检查` = 修复当前 Findings，并对直接受影响范围执行 consistency scan + affected checks；不等于 Delivery Full Test。
- `revise` 契约产物（explore.md / proposal / design / spec）时，Author MUST 在编辑前完成 preflight 并在 result.json 中记录：
  1. **完整阅读**：读 finding 的 requiredResolution 全文 + finding 引用的 ref 章节全文（不只读匹配 finding 的句子）。
  2. **枚举实例**：finding 涉及某类对象（如 ResultRef、字段、Action）时，枚举该类在全文的全部实例，逐一确认修复覆盖。
  3. **可实现性验证**：模拟实现——hash 计算流程、字段 writer/reader、序列化/反序列化；标记并排除循环依赖、自引用、不可执行的约束。**代码层验证（MUST）**：(a) 读设计中命名的每个函数的实际签名和行为，确认函数能执行所分配的操作；(b) 追踪完整数据流（创建→持久化→读取→消费），不只解决眼前问题；(c) 查 C1 当前对被修改字段的实际约束（optional/required、验证逻辑），不只靠记忆推断。
  4. **全局一致性**：consistency scan 覆盖 finding 概念在全文的所有出现位置，不只 reviewer 指出的行号。
- Reviewer 不得重复已 resolved 的 Finding；语义相同的问题应沿用原 Finding ID。
- Author 不得因为纯 Run metadata、统计或可机器派生的 hash 错误制造新的业务修改。
- 除非明确要求或达到 Delivery Full Test 阶段，Review / Revise 不运行全量测试。