## Why

Deterministic Core 已有 `FormalFactSnapshot` 与 Policy，但当前 CLI 只有版本输出，维护者无法从 repository 中确定当前 Delivery/Change、下一 Action、阻塞原因或最小恢复上下文。E1 需要把这些既有只读事实暴露成稳定诊断入口，并补齐 CLI 真正需要但当前 Snapshot 尚未投影的 current Change Verification / formal artifact facts，而不能通过重放历史 Run 或建立第二套状态权威来实现。

172 `review-propose` 进一步确认，E1 的诊断输出必须在 Proposal 阶段冻结三个 public contract：`next` 不得丢失 `PolicyResult` 的 owner-decision context / blocked conflicts；`doctor` 的 severity 必须唯一决定 `overall` 与 exit code；active Delivery 但无 active Change 的正常 Delivery-level 状态必须有稳定投影。三个问题都属于 `author-actionable`，因此本轮通过 `revise-propose` 修正，而不是引入新的 Owner/Verification authority。

178 `review-apply` 已批准当前 Apply candidate，但真实 Policy 仍返回 `blocked: tasks-facts-unavailable`。随后 Owner 明确重置 E1 contract：撤销“Tasks completion projection 后置”的原决定，要求 E1 只补 Archive 所需的最小 current-Change Tasks completion fact，并禁止 Task Registry、Task 状态数据库、Task execution engine 或第二套 OpenSpec authority。本次 reconciliation 只接通这条既有 Archive gate，不扩大 E1 到 Change Runner。

## What Changes

- 新增只读 `flowkit status`、`flowkit next`、`flowkit doctor`、`flowkit resume-context`，共享同一个 deterministic repository/delivery discovery 与 snapshot loader。
- 从 repository 内向上解析唯一 Flowkit root，并从 `openspec/delivery-groups/*.yaml` fail-closed 解析唯一 active Delivery；E1 不引入 workspace/project registry，也不把 detached ZIP 缺 `.git` 的开发 workaround 变成产品 checkpoint authority。
- 扩展 current OpenSpec artifact projection，使 Reader 能表达 `explore.md` 与 `verification.md` 的存在性；`resume-context` 的 `last formal artifact` 只从当前 Change canonical paths + current stage 派生，不做 historical ResultRef replay。
- 为 active Change 的 `verification.md` 增加最小、机器可读的 Change Verification status marker，并把该状态投影进 `FormalFactSnapshot`。Reader 只读取 status，不复制完整验证日志；缺失/无效 marker fail-closed 为 Verification fact unavailable/conflict。
- 将 D1 已预留的 `readChangeVerificationStatus(snapshot)` 接到新 Snapshot 字段，使既有 `review-apply` / `archive` Verification gate 对 `passed | not-applicable | failed | not-run` 按已冻结规则工作；不改变 gate 的业务语义。
- 从当前 active Change canonical `tasks.md` 的 required Markdown task checkbox 确定性投影最小 `changeTasksComplete` fact：`tasks.md` 缺失 → unavailable；存在时全部 required checkbox 为 `[x]/[X]` → complete；任一 `[ ]` → incomplete。Policy 仅消费该 boolean，继续使用既有 Archive Tasks gate；不建立 Task Registry/数据库/执行引擎。
- 冻结 `flowkit next` 对三个 `PolicyResult` union branch 的完整、可测试文本投影：`action` 只呈现 Action；`owner-decision` 必须保留 `changeKey / eligibleChangeKeys / deliveryFullTestStatus / detail` 的稳定上下文字段；`blocked` 必须保留 `reason / unmetPreconditions / conflicts / suggestedOwnerActions`，CLI 不重算 Policy。
- 冻结 `doctor` 的唯一 severity 规则：Reader conflicts、ambiguous pending Runs、missing formal artifact 为 `error`；orphan pending Run 为 `warning`；Policy blocked diagnosis 按冻结映射进入 finding，`formal-fact-conflict` 不重复生成 Policy finding。`overall` 与 exit code 只由这些固定 severity 推导。
- 冻结 active Delivery 但无 active Change 的正常 Delivery-level 投影：`change/change-state=none`、`stage=delivery-level`、`review=none`、`verification=not-applicable`、`last-artifact=none`；四个命令均不得把该状态当 discovery/loading failure。
- `doctor` 复用 Reader conflicts 与 Policy diagnosis，只增加少量不会成为第二套 validator 的只读恢复检查；不写状态、不 repair、不删除 pending Run。
- CLI 输出与 exit code 采用确定、可测试的文本 contract；不新增 command registry、diagnostic registry、CLI state persistence、Gate/Provider/Skill Registry。
- 170 Reviewer 的 Non-blocking Finding 作为时点约束处理：Explore §11 的无 `.git` blocked 输出仅代表 **169 activation 前的 detached execution input**；169 current candidate 已验证为 `conflicts=[] / next=review-explore`，Proposal 不把前一时点证据当成当前 E1 状态。
- 人类可读 Proposal/Design/Tasks/Run 说明默认使用简体中文；OpenSpec 结构关键字、Action 名、schema key、CLI、代码标识符、路径、error code 与固定 enum 保持英文，不把语言呈现规则提升为新的流程 authority。

## Capabilities

### New Capabilities
- `flowkit-diagnostic-cli`: 定义四个只读诊断命令、repository/active-Delivery discovery、共享 snapshot loading、三个 `PolicyResult` branch 的 deterministic projection、doctor severity/exit-code contract、Delivery-level no-active-Change projection，以及 doctor / resume-context 的最小职责边界。

### Modified Capabilities
- `flowkit-formal-fact-reader-and-persistence`: 扩展 current OpenSpec artifact kinds，从 active Change `verification.md` 投影最小 Change Verification status，并从 current canonical `tasks.md` 投影最小 required Tasks completion fact；保持 Verification/Tasks 各自 canonical OpenSpec 文件为事实权威。
- `flowkit-policy-engine`: 把既有 status-aware Verification gate 接到 Snapshot 的 Change Verification status，并把既有 Archive Tasks gate 接到 `changeTasksComplete`；新增 `tasks-incomplete` 仅区分“事实可用但 required task 未完成”与 `tasks-facts-unavailable`，不新增 lifecycle state。

## Impact

- 主要代码：`src/bin/flowkit.ts`、`src/cli/**`、`src/diagnostics/**`、`src/facts/formal-fact-snapshot.ts`、`src/facts/formal-fact-reader.ts`、`src/policy/verification-gate.ts`、`src/policy/preconditions.ts`、`src/policy/next.ts`。
- 主要测试：CLI dispatch/discovery/output contract、`PolicyResult` branch fixture、doctor severity/exit code、no-active-Change Delivery-level projection、diagnostics projection、formal fact Reader Verification/artifact projection、Policy Verification gate integration。
- 契约：新增 `flowkit-diagnostic-cli` capability；最小修改 `flowkit-formal-fact-reader-and-persistence` 与 `flowkit-policy-engine`。
- 文档：仅在实现需要时同步 `docs/verification-model.md` 的 machine-readable status marker 与 CLI 公开边界；不重写 Q1/Q2 历史、不改变 Git checkpoint authority。
- 不新增外部运行时依赖；继续使用 Node.js/TypeScript ESM 与现有手写 YAML/文件系统 Reader。
