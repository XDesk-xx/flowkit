# Bootstrap Reference

> Bootstrap 阶段如何手工执行 Flowkit 规则的操作参考。
>
> 本文档与 A1（产品定位）、B1（核心模型）、C1（集成边界）已冻结事实一致，不重新定义那些事实。

---

## 1. 概述

Bootstrap 阶段没有 Runner 和 CLI，由人和 AI 手工保证 Flowkit 规则成立。本文档定义 Bootstrap 阶段的操作性规则，回答：

> 在没有 Runner 和 CLI 的 Bootstrap 阶段，人和 AI 如何手工保证 Flowkit 规则成立？

核心原则：

```text
Bootstrap 手工执行同一套 Flowkit 规则
不建立第二套 bootstrap-only 状态系统
Policy 仍是唯一权威
Run 仍进入正式历史但不自动 Commit
Git 只保存真实版本历史和少量正式边界
```

---

## 2. Bootstrap 最小执行循环

```text
读取正式事实
→ Policy 确定当前唯一 Action
→ 创建当前 Run
→ 执行 Action
→ 完成 Run Result
→ 必要时形成续接切点
→ Policy 重新计算下一 Action
```

关键约束：

1. **手工执行同一套规则**：Bootstrap 不建立第二套 bootstrap-only 流程状态；未来自托管后由 Flowkit 确定性强制同一套规则。
2. **Policy 仍是唯一权威**：即使没有 Runner，下一 Action 仍由 Policy 根据正式事实计算，不由聊天摘要、Agent 建议或 Git 状态决定。
3. **Run 仍进入正式历史**：Bootstrap 阶段的 Run 与未来 Runner 产生的 Run 使用同一套路径、结构和语义。
4. **Run 不自动 Commit**：Run 创建和完成都不自动触发 Git Commit。Run 可以与当前 Change 的其他正式内容一起，在普通 Commit 或 Change Checkpoint 中进入 Git 历史。

Bootstrap 不创建以下 bootstrap-only 状态系统：

```text
.bootstrap-state/
bootstrap-manifest.yaml
temporary-flowkit-state/
```

但使用 B1 已冻结的正式 `.flowkit/runs/` 记录 Run。

---

## 3. Run 操作规则

### 3.1 何时创建新 Run

Bootstrap 与后续 Runner 必须共享 B1 的唯一 Standard Run preparation semantics。Caller 只能请求 normal `next` 或 explicit unified `review` intent；concrete Action、Role 与 Delivery-wide NNN 由 Policy/catalog/allocator 确定。

同一 pending Run 仅在 resolved Action/Role 与 Core-derived `semanticInputFingerprint` 仍匹配时继续；聊天、provider session、工具重开或普通 Commit 本身不得创建新 Run。Failed/cancelled retry、new Reviewer execution、real author revise 或 new formal Action 才创建新的 Delivery-wide NNN。Explicit direct re-review 必须由 shared Policy 的统一 `review` admission 解析，不得把 blocked `next()` 自动转换成 review。

### 3.2 Run 文件最低内容

Run 的基础结构（B1 已冻结）：

```text
.flowkit/runs/<delivery-id>/<change-id>/<run-id>/
├─ action.md
├─ context.json
└─ result.json
```

Run ID：`YYYYMMDD-NNN-action`，`NNN` 在整个 Delivery 内唯一且单调递增。Checkpoint 不消耗或重置 NNN；低层 Run persistence 也必须拒绝 malformed/non-monotonic/duplicate NNN、suffix mismatch 与错误 Action→Role。

**action.md** 保存人类可读的当前 Run 执行说明：

```text
Delivery / Change / Action
Role
Goal
Inputs
Allowed work
Prohibited work
Required output
适用的 owner 授权
```

只说明当前 Action 如何执行，不决定下一 Action。

**context.json** 保存机器可读的最小执行上下文：

```text
schemaVersion
runId
deliveryId
changeId
action
role
inputRef              // Core 从 consumedRunId / reviewedRunId 派生，不手工填写
sourceReviewRun / sourceReviewVerdict
reviewedRunId         // review-* Run 必填
constraints
ownerAuthorization
runPath
```

规则：保存引用与约束；不复制 OpenSpec、Git、Review、Verification 的全部内部状态；不保存完整聊天；不保存会因当前 Commit 自身变化而立即失效的自引用 SHA；路径与字段冲突时必须阻塞。`inputRef` 的 kind、path 和 fingerprint 由 Core 从真实目标派生，Agent 不得手工构造。

**result.json** 保存本次执行的最小正式事实，使用 closed Core-validated schema：

```text
runStatus                 // completed | failed | cancelled
actionResult?             // action / executionStatus / summary + Core 派生的 ResultRef
failureDiagnosis?
cancellationReason?
reviewVerdict?            // review-* completed 专用
reviewFindings?           // review-* completed 专用 typed payload
```

`blockingFindings`、`nonBlockingFindings`、`verification[]`、`consistencyScan`、`commitPolicy` 等自由重型字段不属于 result.json，出现时被拒绝。`nextActionRecommendation`（可选）只能是建议，不能替代 Policy。

### 3.3 Run 不保存完整对话

Run 不保存：

```text
完整聊天记录
每轮自然语言讨论
内部推理草稿
完整文件副本
完整 Git 状态副本
完整测试日志副本
Evidence / Receipt 系统
Session 历史系统
```

重要决定应进入 OpenSpec、正式 docs、Run Result 摘要、Reviewer Findings 或 owner authorization。

### 3.4 Run 不自动 Commit

```text
Run 创建 ≠ 自动 Commit
Run 完成 ≠ 自动 Commit
```

Run 可以与当前 Change 的其他正式内容一起，在普通 Commit 或 Change Checkpoint 中进入 Git 历史。

### 3.5 Reviewer Run 不预建

Author 完成 Action 时只完成 Author Run，并可推荐 `review-*`。

Reviewer 真正执行统一入口 `review` 时：

```text
Policy 解析具体 review-*
→ 创建 Reviewer Run
```

不得预建空 Reviewer Run。

### 3.6 Terminal Run 不覆盖

Run 状态：`pending / completed / failed / cancelled`。

Run 进入 terminal 状态后保留原记录。需要重试时创建新 Run，不把失败 Run 改写成成功 Run。

### 3.7 Canonical artifact 与 point-in-time 引用

OpenSpec 1.7 `status/instructions` 返回的 validated `changeRoot/artifactPaths/contextFiles` 是 current planning path authority。`proposal/design/specs/tasks` MUST 由 structured view 解析；`explore.md` 与 `verification.md` 不是 `spec-driven` graph node，只能在同一 validated `changeRoot` 下由 Flowkit / Verification 派生 owned filename。默认 repo-local layout 当前通常落在 `openspec/changes/<changeId>/`，但该默认路径不得重新成为 Flowkit 的第二套 OpenSpec path rule。

OpenSpec compatibility 从 stable `1.7.0` 起步，但不冻结 `<1.8.0` 一类 upper bound。Prerelease 不因数值达到 baseline 自动获得支持；higher stable release 必须逐 required machine surface 通过 typed conformance，任何 command/JSON/path/coherence/archive semantic drift 都 fail closed。

- 合法 `revise-*` MAY 覆盖当前 structured logical path；历史 terminal Run 的 mutable artifact / verification ResultRef 只表达“该 Run 当时引用的版本”，不要求未来 current path 永久保持相同 bytes；
- 当前 Review 或下一 Action 真正消费某一版本时，Core MAY 在该 handoff 边界做 exact check；handoff 成功后，不把 predecessor ref 延伸成未来 artifact authority；
- `pending` 只表示 Run 尚未 terminal，不产生 revision-window / supersession / generation class；
- 不建立 `.flowkit/artifacts/`、`openspec/.history/` 或其他 per-Run artifact snapshot store；
- archive 的 relocation / spec sync / operation success-failure 由 OpenSpec 自己负责；Flowkit 不在 operation 成功后按 archive path 再证明一次历史 ResultRef。

### 3.8 Legacy metadata-only 有界例外

schemaVersion 1 历史 Run 继续由 legacy recognizer best-effort 读取，`createRun` / `writeRunResult` 不自动迁移或重写 legacy Run。

Bootstrap 仅允许 owner 明确授权的 migration-time metadata correction，且必须满足：

```text
schemaVersion 1 legacy
metadata-only
不改 result.json
不改 Action / Role / Verdict / Findings / 业务产物
不存在已知下游消费冲突
Git 保存 before / after
```

该例外不实现通用 CLI/API，不成为长期产品接口，也不修改任何 terminal Run 的业务事实。

---

## 4. 续接切点与 Continuation Context

### 4.1 何时形成续接切点

当当前 Action 已有稳定、可引用的正式结果，并且 Continuation Context 可以从正式事实生成时，形成一个可续接切点。

通常包括：

```text
当前 Action 完成
即将更换会话
即将更换执行者
工作即将中断
即将进入 Review
用户要求暂停后恢复
```

### 4.2 最低续接信息

```text
当前 Delivery
当前 Change
最后完成的 Action
最后 Action ResultRef
有效 Verdict / Findings
未消费的 Non-blocking Findings
有效 owner 授权
当前冻结约束
Policy 计算出的 nextAllowedAction
下一 Action 所需输入引用
```

### 4.3 Continuation Context 的 Bootstrap 生成

```text
Delivery / Change 状态
+ Runs
+ OpenSpec
+ Reviewer Findings / Verdict
+ Verification 结果
+ owner 授权
→ Continuation Context
```

Continuation Context 是生成视图，不是新的状态权威：

- 丢失后可重新生成；
- 与正式事实冲突时以正式事实为准；
- 不自行推进状态；
- 不要求长期单独保存；
- 不要求特定交换媒介。

`nextAllowedAction` 必须由 Policy 计算，不得由 Continuation Context 自行填写。

### 4.4 是否 Commit 不由续接切点决定

是否 Commit 取决于 Git 保存或实际交互需要，不由续接切点自动触发。

续接切点不要求：

```text
Commit
Push
GitHub
PR / MR
Patch
ZIP
新 Run
新状态字段
特定脚本
两个独立 AI
```

---

## 5. Git 模型

### 5.1 正式边界

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

示例：

```text
Delivery Start
A1 Checkpoint
B1 Checkpoint
C1 Checkpoint
D1 Checkpoint
Delivery Final
```

### 5.2 Change 激活不是正式 Git 边界

Change 激活（manifest `planned → active` 与创建 `.openspec.yaml`）不属于正式 Git 边界，不要求独立 Commit；其文件变更随当前 Change 的正常工作一起进入 Git 历史。

### 5.3 Delivery Start Commit

每个 Delivery 一次，用于：

- 标识 Delivery 正式开始；
- 建立 Delivery 历史起点；
- 建立第一个 Change 的 Diff 起点。

模板：

```text
chore(flowkit): start <delivery-id>
```

### 5.4 Change Checkpoint Commit

每个完成的 Change 一次。OpenSpec 只负责 archive operation 的 success/failure、relocation 与 spec sync；operation success 后由 Flowkit 记录自己的 Change 状态为 `completed`。Checkpoint 是随后独立的 Flowkit/Git 正式边界，不参与 Change 的 `active → completed` 判定。

前置条件：

```text
Change 契约完成
适用 Verification 满足
Review Approved
Blocking Findings 清零
OpenSpec 已 Archive
Change 状态更新为 completed
Archive Run 已完成
```

模板：

```text
chore(flowkit): checkpoint <change-id>
```

Checkpoint recovery 必须限定在当前 Delivery 的 Git boundary scope：Reader 以 Delivery Start 的 Git 拓扑归属过滤 checkpoint；其他 Delivery 的同名 `<change-id>` 不得被当前 Delivery 消费。历史 legacy checkpoint 没有结构化 `changeId` 时，只保留有界兼容，并与后续 structured checkpoint 同时生效。

Checkpoint Commit 应尽量包含真实收尾变化，例如 OpenSpec Archive、Manifest 状态更新和 Archive Run，不为了边界创建无意义空 Commit。

### 5.5 Delivery Final Commit

每个 Delivery 一次。

前置条件：

```text
所有 required Changes completed
所有 Change 已 Checkpoint
Blocking Findings 清零
Delivery Verification 条件满足
Full Test 状态满足冻结规则
owner 明确批准 Finalize
最终 docs / roadmap / manifest 已收口
```

模板：

```text
chore(flowkit): finalize <delivery-id>
```

Delivery Final 不要求必须存在 PR 或某个远程平台。

### 5.6 普通 Commit

仅在真实需要时创建：

```text
保存较大或较长的工作进度
降低未提交修改丢失风险
跨环境或跨执行者需要稳定版本
Reviewer 需要稳定版本且无法共享工作区
即将中断，之后需要明确恢复点
用户明确要求保存
```

普通 Commit：

- 必须包含真实变化；
- Message 可读；
- 不推进 Flowkit 状态；
- 不等于 Action 完成；
- 不等于 Review Approved；
- 不等于 Change Checkpoint；
- 不要求 Push；
- 不要求 PR。

Commit 数量不影响 Flowkit Policy。

### 5.7 不创建的 Commit 类型

```text
Action Commit
Run Commit
Session Commit
Conversation Commit
Evidence Commit
Receipt Commit
Handoff 专用空 Commit
```

### 5.8 Review 不要求先 Commit

Review 必须绑定稳定的 `reviewedResultRef`，但该引用不必是 Git Commit。

可使用：

```text
Run ResultRef
artifact version
content hash
Git revision
其他不可歧义版本引用
```

因此：

```text
Review 需要稳定结果
≠ Review 前必须 Commit
```

如果被审查结果发生变化，原 Approval 对新结果失效，必须重新 Review。

### 5.9 Push、Remote、PR 与 Merge

这些都不是 Flowkit Core 的流程前提。

只有当前项目实际采用相应 Git 方式时，项目规则才定义：

```text
是否 Push
何时 Push
是否创建 PR / MR
如何合并
如何清理 Branch
```

---

## 6. owner 授权边界

以下决定由 owner 明确控制：

```text
Delivery 范围变化
冻结决定变更
Apply 授权（适用时）
Archive 授权（适用时）
Full Test 授权
corrective Change 创建
Delivery Finalize
破坏性 Git 操作
```

Agent、Adapter、Skill、Reviewer、Verification 工具不能自行授予。

owner 授权在 Run 的 `context.json` 中记录，作为引用而非完整副本。

### 6.1 Full Test

```text
所有 required Changes Checkpoint
→ Delivery ready
→ fullTestStatus = awaiting-user-decision
→ owner 明确授权
→ 才运行 Full Test
```

不得由 Apply、Revision、Review、Archive 或 Adapter 自动触发。

Full Test 失败后：

```text
记录 Delivery Finding
→ 停在 owner 决策边界
→ owner 授权 corrective Change
→ 按完整 Change 生命周期处理
→ 再次等待 Full Test 授权
```

不重新打开已 Checkpoint 的 Change。

---

## 7. 信息交换媒介中立

Flowkit 不固定以下任何方式为流程前提：

```text
GitHub、GitLab 或其他 Forge
Remote 存在
Push 或 Pull
PR 或 MR
本地或远程执行
一个或多个 AI
ChatGPT、Codex 或其他 Provider
Patch、ZIP 或共享目录
PowerShell、Shell 或特定操作系统
Worktree 数量
固定协作拓扑
```

Flowkit 只检查：

```text
正式结果可读取
上下文可恢复
Policy 可计算下一 Action
```

---

## 8. 旧 Bootstrap 表述修正对照

### 8.1 固定执行者

| 旧表述（错误） | 正确表述 |
|---|---|
| ChatGPT 是主开发者 | 正式角色为 owner / author / reviewer |
| 本地 Codex 是固定 Reviewer | 当前由谁承担只属于项目执行映射 |

### 8.2 固定交接媒介

| 旧表述（错误） | 正确表述 |
|---|---|
| 交接前必须 Commit + Push | 需要续接时，正式结果必须可读取，Continuation Context 必须可生成 |
| 接手者必须从远端恢复 | 具体交换媒介由当前环境决定 |
| GitHub 是默认交换通道 | 不固定特定平台 |

### 8.3 固定 PR

| 旧表述（错误） | 正确表述 |
|---|---|
| 一个 Delivery 必须一个 PR | 一个 Delivery 使用一个 Delivery Branch；是否有 PR／MR 由具体项目集成方式决定 |

### 8.4 `.flowkit/` 旧限制

| 旧表述（错误） | 正确表述 |
|---|---|
| Bootstrap 期间根仓库不出现权威 `.flowkit/` | Bootstrap 不创建第二套 bootstrap-only 状态系统，但使用 B1 已冻结的正式 `.flowkit/runs/` 记录 Run |

继续禁止：

```text
.bootstrap-state/
bootstrap-manifest.yaml
temporary-flowkit-state/
```

### 8.5 Git Commit 定位

| 旧表述（错误） | 正确表述 |
|---|---|
| Git Commit 是所有跨 AI / 机器同步的必要边界 | Git Commit 是版本保存和正式 Git 历史边界；续接切点不等于 Git Commit；Action 和 Run 不自动 Commit |

---

## 9. delivery-lifecycle.md Section 10 覆盖

`docs/delivery-lifecycle.md` Section 10 已明确将以下内容推迟到 D1：

```text
Action 完成后如何向 owner 展示
owner 如何授权 Apply、Archive、Full Test 和 Finalize
何时创建普通 Commit
何时 Push
如何切换 author 与 reviewer
reviewer 如何执行统一 review
author 如何执行统一 revise
Checkpoint 的具体 Git 操作
```

以上内容全部由本文档覆盖：

- Action 完成后如何向 owner 展示 → §2 最小执行循环、§4 续接切点
- owner 如何授权 → §6 owner 授权边界
- 何时创建普通 Commit → §5.6 普通 Commit
- 何时 Push → §5.9 Push、Remote、PR 与 Merge
- 如何切换 author 与 reviewer → §3.5 Reviewer Run 不预建
- reviewer 如何执行统一 review → §3.5、§5.8 Review 不要求先 Commit
- author 如何执行统一 revise → §3.1 Run 创建边界
- Checkpoint 的具体 Git 操作 → §5.4 Change Checkpoint Commit

D1 不修改 `docs/delivery-lifecycle.md`。若后续确需修改 B1 文档，必须由 owner 授权独立 corrective Change。

## 10. A1 之后的 Bootstrap 收缩

A1 product write-side 可用后，正常后续 Change 不再通过手工 Manifest mutation完成 creation / Owner provenance / activation：

```text
flowkit create delivery
flowkit create change
flowkit owner record
flowkit activate
```

当前 02 Delivery 在 A1 之前已经形成的 Bootstrap history 保持原样，不回写历史 Owner strings，也不补写历史 `architectureImpact`。Reader 对 Base `448fa042de86d07e893bcc51da528f93eb7ced3a` 冻结的 exact legacy identities只做 read-only unknown compatibility。

这不改变 Git Bootstrap 边界：activation 仍不是 Change Start Commit；Change Checkpoint 仍在 Archive/complete 后由 Owner 授权的 Git workflow执行。
