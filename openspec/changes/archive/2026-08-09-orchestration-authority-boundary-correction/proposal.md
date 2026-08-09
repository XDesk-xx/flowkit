## Why

Flowkit 的高层定位已经正确冻结为 `One fact, one authority`：Flowkit 是确定性交付编排器，不是 OpenSpec、Git、Reviewer、Verification 或审计系统的替代品。但 Q1 后的 C1 实现为了持续解释 mutable artifact ResultRef，逐步引入了 `current / superseded / revision-window`、historical mutable ref replay、archive-aware physical path resolution 和 predecessor effective-set inheritance。这些机制把 Run 的 point-in-time 记录提升成了 OpenSpec artifact lifecycle 的第二套 authority，并让 `pending` 间接承担 artifact revision-window 语义。

本 Change 要把实现重新收敛到最小编排职责：Flowkit 只维护安全推进当前 Action 所需的当前流程事实和精确交接；OpenSpec、Git、Reviewer、Verification 各自继续拥有自己的事实。默认删除越权机制，而不是增加新的 resolver/validator。

## What Changes

- `FormalFactReader` 的 Change-level Run 投影收窄到当前唯一 `active` Change；Delivery-level Run 仍按 Delivery Policy 需求读取。`completed / cancelled / planned` Change 的历史 Run corpus 不再因为旧 schema 或 mutable ref 无法按今天规则 replay 而污染当前 Policy snapshot。
- ResultRef 明确分层：`run-result` 以及当前 Action 正在消费的 handoff binding 继续 exact-invalidating；已结束历史 Run 的 `produced-artifact` / terminal `verification-summary` 只是 point-in-time reference，future 合法 current-path 变化不会反向使历史 ref 失效。同步 `flowkit-integration-boundaries` 与 `docs/integration-boundaries.md`，消除旧的‘任意 ResultRef 目标变化即全局失效’总语义。
- 删除全局 `current / superseded / revision-window` generation authority。`Run.status=pending` 只表示该 Run 尚未 terminal，不打开 artifact revision window，也不成为 Action/Change 状态。
- Artifact-producing Action 改为**每次 terminal 都由 Core 派生完整当前输出集合**：`explore/revise-explore → explore.md`，`propose/revise-propose → proposal.md + design.md + tasks.md + 当时完整 specs/**`。不再要求 Caller 声明 changed-tag subset，也不再从 predecessor Run 继承未声明的 ResultRef。
- 保留真正属于 Flowkit 的 current-action strictness：schemaVersion 2 closed schema/identity、terminal create-once、reviewed Run immutable result exact binding，以及最小 `review → next Action` exact handoff。`propose/apply/archive` 不新增 source-review tuple 状态机，但在 pending publish 前必须通过 `consumedRunId` 指向其实际消费的 approved Review，由 Core 追到 reviewed producer/verification generation，并对仍应保持不变的 current authority bytes 做 exact check；`revise-*` 同理在修改前先精确绑定 matching `changes-requested` Review。
- `review-apply` 在 entry 由 Core 写入仅属于该 pending Review 的 `context.verificationInputRef`，冻结 Reviewer 开始审查时的 `verification.md` generation；completion 必须再次 exact-check 同一 ref，防止 review 期间漂移。terminal `verificationSummaryRef` 仍只记录完成时的 point-in-time summary；`apply/revise-apply/archive` 不拥有该 ref。
- Archive 边界恢复为 thin integration：在调用 OpenSpec archive **之前**，Flowkit 只做当前 Action 所必需的 approved review-apply / verification handoff 检查；随后 OpenSpec 自己负责 relocation/spec sync 与 operation success/failure。OpenSpec 成功后 Flowkit 只记录结果，不做 post-archive artifact replay。当前 Deterministic Core Delivery 仍不实现完整 OpenSpec archive Adapter，也不新增 archive-aware ResultRef resolver。
- Archive/Checkpoint lifecycle 收敛为：OpenSpec 只拥有 archive operation 的 success/failure、relocation 与 spec sync；Flowkit 在 operation success 后记录自己的 Change 状态为 `completed/closed`。Change Checkpoint 是其后的 Flowkit/Git boundary，不属于 Change lifecycle 完成条件。Reader 继续只投影 active Change Runs；Policy 在无 active Change 时通过 Manifest `completed` + 当前 Delivery 的 Git `change-checkpoint` boundary 判断 checkpoint-pending，不重新投影 closed Change 历史 Runs。Owner decision 不由本 Proposal/Run/仓库文件建立或持久化；需要该 authority 时必须由执行流程从独立 Owner 输入获得。对本次 166 revise-apply，Owner 已在 package 之外的执行输入中明确确认上述 Archive/Checkpoint lifecycle 模型；这里仅记录该 provenance，Owner 输入本身仍是 authority。
- 最小同步 `AGENTS.md`、`docs/bootstrap-reference.md`、`docs/delivery-lifecycle.md`、`docs/integration-boundaries.md`：默认简体中文的人类可读内容、Reviewer 只读 mutation boundary、AGENTS 仅为 Agent 行为约束；ResultRef 区分 current exact handoff 与 historical point-in-time；删除 generation-aware historical replay 被提升为仓库原则的表述。`docs/product-positioning.md` 保持不变；`docs/core-model.md` 只修 Archive/Checkpoint lifecycle 顺序，不改变高层 authority 定义。
- 不修改历史 terminal Runs，不建立 migration/provenance registry，不修改 D1 的业务流程顺序，不实现 E1，不运行 Delivery Full Test。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `flowkit-formal-fact-reader-and-persistence`：收窄 Reader current Policy projection；把 historical mutable ResultRef 收敛为 point-in-time；取消全局 generation/revision-window/archive replay；把 artifact-producing Run 收敛为完整自包含输出集合；保留 current review/revise/next-action 的最小 exact handoff，并为 review-apply 增加 Core-owned entry-time verification binding。
- `flowkit-integration-boundaries`：统一 ResultRef 分层失效语义：current handoff exact-invalidating，historical mutable refs point-in-time；同时明确 OpenSpec archive 的内部成功、relocation 与 spec sync 属于 OpenSpec authority，Flowkit 只消费操作结果，不进行 post-archive 二次证明。
- `flowkit-bootstrap-and-roadmap`：同步 canonical artifact lifecycle 的 thin authority 表述，并冻结 AGENTS 的中文呈现、Reviewer mutation boundary 与“AGENTS 不拥有流程决策权”；明确 Archive 已关闭 Change，Checkpoint 是后续 Git boundary。
- `flowkit-core-model`：修正 Change completion 条件：OpenSpec Archive success 即 `completed`，Checkpoint 不再作为 Change 保持 active 的条件。
- `flowkit-policy-engine`：在无 active Change 时优先识别 completed-but-uncheckpointed Change 并返回 `authorize-checkpoint`；Checkpoint 完成后才进入下一 Change 激活或 Delivery-level 流程。

## Impact

- 主要代码：`src/facts/formal-fact-reader.ts`、`src/facts/generation-resolver.ts`（删除或移除 production 调用）、`src/persistence/run-persistence.ts`，以及必要的 serialization/validator helper；155/157 修订额外涉及 `src/facts/git-boundary-reader.ts`、`src/policy/next.ts`、`src/policy/preconditions.ts`：Checkpoint recovery 由 Git authority 的 Delivery Start 拓扑限定当前 Delivery，并同时兼容 legacy 无 `changeId` boundary 与 structured `changeId` boundary；不新增第二套 checkpoint 状态。
- 测试：Reader current-policy projection、historical non-blocking、current closed schema、review artifact exact binding、revision source-review lineage、完整 propose/revise-propose output set、pending minimal semantics、verificationSummaryRef point-in-time、archive thin boundary。
- 文档：`AGENTS.md`、`docs/bootstrap-reference.md`、`docs/delivery-lifecycle.md`、`docs/integration-boundaries.md`，以及仅修 lifecycle 顺序的 `docs/core-model.md`；`docs/product-positioning.md` 保持不变。
- 无新增依赖、Registry、artifact snapshot store、migration engine、Evidence/Receipt/provenance system。
