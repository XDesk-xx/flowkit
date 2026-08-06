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
