---
name: flowkit-git-workflow
description: Flowkit Git 工作流 Skill。只执行已经由 Flowkit 和 owner 确定的 Git 行为，提供边界检查、Commit Message 模板生成和 Git 状态读取，不拥有流程决策权。
---

# flowkit-git-workflow Skill

> 本 Skill 只执行已经由 Flowkit 和 owner 确定的 Git 行为。
>
> 本 Skill 不拥有 Action 决策权、Change 完成判断权、Delivery Final 判断权、owner 授权权、自动 Commit/Push/Merge 权或流程状态修改权。

---

## 覆盖范围

### Delivery Branch 命名

```text
delivery/<delivery-id>
```

`<delivery-id>` 格式：`YYYYMMDD-NN-short-name`

### Delivery Start 模板

每个 Delivery 一次。

前置条件：
- Delivery 已创建
- manifest 中 Delivery 状态为 active
- 第一个 Change 已识别

模板：
```text
chore(flowkit): start <delivery-id>
```

### Change Checkpoint 模板

每个完成的 Change 一次。

前置条件：
- Change 契约完成
- 适用 Verification 满足
- Review Approved
- Blocking Findings 清零
- OpenSpec 已 Archive
- Change 状态更新为 completed
- Archive Run 已完成

模板：
```text
chore(flowkit): checkpoint <change-id>
```

Checkpoint Commit 应尽量包含真实收尾变化，不为了边界创建无意义空 Commit。

### Delivery Final 模板

每个 Delivery 一次。

前置条件：
- 所有 required Changes completed
- 所有 Change 已 Checkpoint
- Blocking Findings 清零
- Delivery Verification 条件满足
- Full Test 状态满足冻结规则
- owner 明确批准 Finalize
- 最终 docs / roadmap / manifest 已收口

模板：
```text
chore(flowkit): finalize <delivery-id>
```

### 普通 Commit 的按需原则

仅在以下真实需要时创建普通 Commit：

```text
保存较大或较长的工作进度
降低未提交修改丢失风险
跨环境或跨执行者需要稳定版本
Reviewer 需要稳定版本且无法共享工作区
即将中断，之后需要明确恢复点
用户明确要求保存
```

普通 Commit：
- 必须包含真实变化
- Message 可读
- 不推进 Flowkit 状态
- 不等于 Action 完成
- 不等于 Review Approved
- 不等于 Change Checkpoint
- 不要求 Push
- 不要求 PR

### Action / Run 不自动 Commit

```text
每个 Action 自动 Commit        → 禁止
每个 Run 创建自动 Commit       → 禁止
每个 Run 完成自动 Commit       → 禁止
每次 Review 自动 Commit        → 禁止
每次 AI 会话自动 Commit        → 禁止
```

### 不创建空 Handoff Commit

不创建以下类型的 Commit：

```text
Action Commit
Run Commit
Session Commit
Conversation Commit
Evidence Commit
Receipt Commit
Handoff 专用空 Commit
```

### 不把 SHA 写入自引用状态文件

不得把当前 Commit 的 SHA 写入会因该 Commit 自身变化而立即失效的状态文件（如 context.json 的 inputRef 指向自身 Commit）。

### 不执行未经授权的破坏性 Git 操作

以下操作必须由 owner 明确授权：

```text
git push --force
git reset --hard
git checkout -- .
git clean -f
git branch -D
git rebase -i
```

### 不自动运行 Full Test

Full Test 由 owner 明确授权后才运行。本 Skill 不得自动触发 Full Test。

---

## 不拥有的权力

```text
当前 Action 决策权
Change 完成判断权
Delivery Final 判断权
owner 授权权
自动 Commit / Push / Merge 权
流程状态修改权
```

---

## 可提供的能力

```text
边界检查
Commit Message 模板生成
Git 状态读取
Diff 范围计算
边界 Commit 查找
执行前提示
```

真正写入 Git 必须由用户或明确授权的外部操作触发。

---

## Git 正式边界总览

一个 Delivery 的 Git 历史只要求三种正式边界：

```text
1 个 Delivery Start Commit
+
每个 Change 1 个 Change Checkpoint Commit
+
1 个 Delivery Final Commit
+
0 到若干按需普通 Commit
```

Change 激活（manifest `planned → active` 与创建 `.openspec.yaml`）不属于正式 Git 边界，不要求独立 Commit。

Commit 数量不影响 Flowkit Policy。
