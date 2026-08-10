# E1 Diagnostic CLI Change Verification

<!-- flowkit-change-verification-status: passed -->

## 验证结论

E1 `diagnostic-cli` 的本次 Apply candidate 已完成适用的 Change Verification，结果为 `passed`。

本记录属于当前 Change 的 Verification authority。它不代表 Delivery Full Test，也不改变 Delivery `fullTestStatus`。

## 验证范围

本次验证覆盖 E1 Proposal / Design / Tasks 冻结的实现范围：

- `FormalFactSnapshot` 的最小 `explore.md` / `verification.md`、Change Verification status 与 active Change Tasks completion 投影；
- 既有 Policy Verification gate 对 `snapshot.changeVerificationStatus` 的接线；
- 既有 Archive Tasks gate 对 `snapshot.changeTasksComplete` 的接线，以及 unavailable / incomplete / complete 三态行为；
- repository root / active Delivery 的共享只读发现与 context loader；
- `flowkit status`、`flowkit next`、`flowkit doctor`、`flowkit resume-context` 四个只读诊断视图；
- no-active-Change Delivery-level projection；
- `next` 三个 `PolicyResult` branch 的完整确定性格式化；
- `doctor` 固定 severity / overall / exit-code 规则；
- CLI deterministic output、nested working directory、read-only behavior 与 process-level exit codes。

## Focused / affected checks

- E1 Reader / Verification gate / Tasks completion / discovery / diagnostics / CLI focused tests：passed。
- `npm test`：passed，`594/594` tests；本次作为 shared `FormalFactSnapshot` / Policy gate 与真实 CLI package bin surface 的 affected regression check 执行，**不是 Delivery Full Test**。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm run build`：passed。
- `openspec validate diagnostic-cli --strict`：passed。
- `openspec validate --all --strict`：passed，`9/9`。
- 真实 package bin focused regression：passed；测试实际执行 `npm run build → npm pack → local npm install → node_modules/.bin/flowkit --version` 与 `status`，确认正式 `bin.flowkit=dist/bin/flowkit.js` surface 可由 shell 直接启动。

## 176 Review Finding 修复

- `E1-RA-001`（author-actionable）：已由当前 candidate 修复关闭。
- 根因：`src/bin/flowkit.ts` 没有 Node shebang，process tests 又通过 `node + tsx` 直接运行 TypeScript 源文件，因此没有覆盖 npm 安装后的真实 executable surface。
- 修复：在 CLI entrypoint 增加 `#!/usr/bin/env node`；TypeScript build 保留该 shebang。
- 回归：新增真实 `npm pack → local install → node_modules/.bin/flowkit` 测试，同时覆盖 `--version` 与 `status`。修复前相同路径可稳定复现 shell/ImageMagick 误解释；修复后直接执行成功。
- Author 同类路径检查：复核本 Change 新增的 CLI dispatcher、context loader、四个 diagnostic projections、Verification marker Reader 与 Policy gate，没有发现需要在本 Finding 下继续扩展的同源 process-surface 绕过；未修改与 176 Finding 无关的旧 Core。

## 边界检查

- 手写 production / test `.mjs` 新增：0。
- 未新增 CLI / diagnostic registry 或通用 command framework。
- 未新增第二 Verification state file；status 仅通过当前 `verification.md` 的精确 marker 投影。
- 未重新引入 historical Run replay / historical fingerprint current-path lock。
- 未实现 automatic repair / mutation。
- 未实现 detached Git checkpoint / GitHub fallback。
- 未建立 Task Registry、Task 状态数据库、Task execution engine 或第二套 OpenSpec authority；Tasks completion 只从 current active Change canonical `tasks.md` 投影一个 boolean。

## Detached environment 与证据时点

本次 Apply / revise-apply 在 detached executable environment 中基于 Owner 上传的分支 repository snapshot 与 169–176 cumulative candidate 执行；本轮未访问 GitHub。

170 Non-blocking Finding 中提及的“snapshot 无 `.git` 导致本地无法投影 Change Checkpoint”属于 **pre-169 activation detached input** 的证据时点。当前 169+ cumulative candidate 已 materialize E1 的正式 current facts；不得把该旧时点输出重新解释成当前 candidate 的 formal conflict。


## 178 Approved 后的 Owner contract decision reconciliation

- 178 `review-apply` verdict：`approved`，Blocking Findings=0；但 Reviewer materialize 后真实 Policy 为 `blocked: tasks-facts-unavailable`。
- Owner 随后独立决定撤销 E1 原“Tasks completion projection 后置”的 contract，并授权本轮只补 Archive 所需的最小 Tasks completion projection。
- 本轮实现 `changeTasksComplete?: boolean`：`tasks.md` absent → undefined；存在且任一 required `[ ]` → false；全部 required checkboxes completed（或无 required checkbox）→ true。
- Policy 保留既有 Archive gate，并新增 `tasks-incomplete` 仅区分“事实可用但 required tasks 未完成”；未新增 lifecycle state。
- 当前 E1 `tasks.md` 全部 required tasks 已完成，因此最终 Reader 应投影 `changeTasksComplete=true`。
- 本次 Owner decision 不是 Archive authorization；Author 完成后仍停在 Reviewer boundary。


## 179 Owner-reset Apply 的最终事实验证

- 生成 179 前，在 178 approved target 上读取 current facts：`changeTasksComplete=true`、`changeVerificationStatus=passed`、`conflicts=[]`，Policy 正确进入 `owner-decision: authorize-archive`，证明旧 `tasks-facts-unavailable` blocker 已由最小 projection 关闭。
- 179 是 Owner contract reset 后的新 Apply generation；178 review 仍只绑定 177，因此 179 完成后旧 approval 不覆盖新 bytes。
- 179 完成后必须重新得到 `review-apply`；本记录不得被解释成 Archive authorization。

## Delivery Full Test

- Delivery Full Test：`not-run`。
- Owner 本轮授权的是 E1 `apply`，不是 Delivery Full Test。
- Delivery `fullTestStatus` 保持 `not-ready`。

## 最终结果

当前 E1 Change Verification：`passed`。
