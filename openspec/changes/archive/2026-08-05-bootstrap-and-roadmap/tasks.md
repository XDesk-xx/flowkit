## 1. Bootstrap 参考文档

- [x]1.1 创建 `docs/bootstrap-reference.md`
- [x]1.2 定义 Bootstrap 最小执行循环（读取正式事实 → Policy → Run → 执行 → Result → 续接 → Policy 重算）
- [x]1.3 定义 Run 创建边界（正式 Action 改变、执行角色改变、本次目标改变、failed/cancelled 重试）
- [x]1.4 定义 Run 复用规则（Action、角色、目标三者均未改变才复用同一 Run）
- [x]1.5 定义 Run 文件最低内容（action.md / context.json / result.json）
- [x]1.6 定义 Run 不保存完整对话
- [x]1.7 定义 Run 创建和完成不自动 Commit
- [x]1.8 定义 Reviewer Run 不预建
- [x]1.9 定义 Terminal Run 不覆盖
- [x]1.10 定义续接切点操作性定义（何时形成、最低续接信息）
- [x]1.11 定义 Continuation Context 的 Bootstrap 生成（从正式事实生成，不是状态权威）
- [x]1.12 定义 Git 模型（Delivery Start、Change Checkpoint、Delivery Final 三种正式边界）
- [x]1.13 明确 Change 激活不是正式 Git 边界，不要求独立 Commit
- [x]1.14 定义普通 Commit 的按需原则
- [x]1.15 定义 Review 不被强制绑定 Git Commit
- [x]1.16 定义 owner 授权边界（Apply、Archive、Full Test、Finalize、corrective Change、破坏性 Git）
- [x]1.17 定义 Full Test 不自动触发
- [x]1.18 定义信息交换媒介中立原则
- [x]1.19 包含旧 Bootstrap 表述的修正对照（固定执行者、固定交接媒介、固定 PR、.flowkit/ 旧限制、Git Commit 定位）

## 2. 开发路线文档

- [x]2.1 创建 `docs/development-roadmap.md`
- [x]2.2 定义 Deterministic Core 阶段目标
- [x]2.3 定义 Change Execution Loop 阶段目标
- [x]2.4 定义 Delivery Execution Loop 阶段目标
- [x]2.5 定义首次自托管切换条件（13 项验收条件）
- [x]2.6 声明不引入 Gate Registry、Skill Registry、Provider Registry 或通用插件平台
- [x]2.7 声明未来 Delivery 使用实际日期，不预先冻结

## 3. AGENTS.md

- [x]3.1 创建 `AGENTS.md`
- [x]3.2 声明先读取正式 docs、当前 OpenSpec Change 和当前 Runs
- [x]3.3 声明由 Policy 确定唯一合法下一 Action
- [x]3.4 声明不得重新打开已 Checkpoint Change
- [x]3.5 声明不得跳过正式 Review
- [x]3.6 声明不得自行授权 Full Test
- [x]3.7 声明 Action / Run 不自动 Commit
- [x]3.8 声明 Git 只在 Start / Checkpoint / Final 形成正式边界
- [x]3.9 声明普通 Commit 仅按真实保存和交互需要创建
- [x]3.10 声明执行者或会话变化不构成流程状态变化
- [x]3.11 声明信息交换媒介不固定
- [x]3.12 声明不得引入第二套流程权威
- [x]3.13 声明不固定 ChatGPT、Codex、GitHub、Remote、PR 或 Worktree 拓扑

## 4. flowkit-git-workflow Skill

- [x]4.1 创建 `.codex/skills/flowkit-git-workflow/SKILL.md`
- [x]4.2 覆盖 Delivery Branch 命名
- [x]4.3 覆盖 Delivery Start 模板
- [x]4.4 覆盖 Change Checkpoint 模板
- [x]4.5 覆盖 Delivery Final 模板
- [x]4.6 覆盖普通 Commit 的按需原则
- [x]4.7 覆盖 Action / Run 不自动 Commit
- [x]4.8 覆盖不创建空 Handoff Commit
- [x]4.9 覆盖不把 SHA 写入自引用状态文件
- [x]4.10 覆盖不执行未经授权的破坏性 Git 操作
- [x]4.11 覆盖不自动运行 Full Test
- [x]4.12 声明不拥有 Action 决策权、Change 完成判断权、Delivery Final 判断权、owner 授权权、自动 Commit/Push/Merge 权、流程状态修改权
- [x]4.13 声明可提供边界检查、Commit Message 模板生成、Git 状态读取、Diff 范围计算、边界 Commit 查找、执行前提示

## 5. delivery-lifecycle.md Section 10 覆盖

- [x]5.1 确认 `docs/bootstrap-reference.md` 完整覆盖 `docs/delivery-lifecycle.md` Section 10 的待定内容
- [x]5.2 确认 D1 不修改 `docs/delivery-lifecycle.md` 或其他 B1 冻结文档

## 6. OpenSpec 契约

- [x]6.1 确认 `flowkit-bootstrap-and-roadmap` capability spec 已通过 `openspec validate --strict`
- [x]6.2 确认 spec 覆盖 Bootstrap 最小执行循环与第二套状态系统禁止
- [x]6.3 确认 spec 覆盖 Run 创建边界含目标改变
- [x]6.4 确认 spec 覆盖 Run 文件最低内容与不保存完整对话
- [x]6.5 确认 spec 覆盖 Run 不自动 Commit
- [x]6.6 确认 spec 覆盖 Continuation Context 从正式事实生成
- [x]6.7 确认 spec 覆盖 Git 正式边界仅为三种
- [x]6.8 确认 spec 覆盖 Change 激活不是正式 Git 边界
- [x]6.9 确认 spec 覆盖普通 Commit 仅按真实需要创建
- [x]6.10 确认 spec 覆盖 Review 不被强制绑定 Git Commit
- [x]6.11 确认 spec 覆盖 owner 授权边界
- [x]6.12 确认 spec 覆盖四份正式输出文档
- [x]6.13 确认 spec 覆盖信息交换媒介中立
- [x]6.14 确认 spec 覆盖 flowkit-git-workflow Skill 边界
- [x]6.15 确认 spec 覆盖 Development Roadmap 最小必要
- [x]6.16 确认 spec 覆盖不修改 A1/B1/C1 已冻结文档

## 7. Verification

- [x]7.1 创建 `verification.md`
- [x]7.2 声明适用检查项（git diff --check、openspec validate --strict、U+FFFD 扫描）
- [x]7.3 声明 D1 不运行 Full Test
- [x]7.4 声明四份正式文档与 A1/B1/C1 冻结事实一致
