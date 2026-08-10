## 1. Reader current Policy projection

- [x] 1.1 让 `FormalFactReader` 在解析 Change-level Run 前先读取 Manifest Change state，只投影唯一 active Change 的 Runs；Delivery-level Runs 保持 Delivery scope。
- [x] 1.2 completed/cancelled/planned Change 的 historical Run schema/mutable ref 问题不得进入当前 Change Policy conflicts；active Change malformed schema/identity/immutable lineage 继续 fail-closed。
- [x] 1.3 删除 Reader 对 historical `produced-artifact` / `verification-summary` current-path fingerprint replay 与 archive physical-path replay。

## 2. 删除 global generation / revision-window authority

- [x] 2.1 删除 `current | superseded | revision-window` 作为 Reader blocking 模型；`pending` 只保留 Run non-terminal 语义。
- [x] 2.2 删除或收窄 `src/facts/generation-resolver.ts`，production 不得再依赖全历史 generation classification、verification generation 或 archive relocation proof。
- [x] 2.3 保留 current stage 所需的最小纯 lineage helper：只用于判断 reviewed/source-review Run 是否是当前 matching stage，不建立历史 registry。

## 3. Artifact-producing Run 改为完整 point-in-time output set

- [x] 3.1 `explore/revise-explore` terminal 时 Core 始终从 current OpenSpec 派生完整 `explore.md` ref。
- [x] 3.2 `propose/revise-propose` terminal 时 Core 始终从 current OpenSpec 派生完整 `proposal.md + design.md + tasks.md + specs/**` refs，并对 specs namespace 做 exact-set。
- [x] 3.3 删除 `revise-propose` predecessor effective-set inheritance、changed-tag subset merge 和 `CompleteRunInput.producedArtifactTags` Caller bookkeeping；Action-owned output set完全由 Core 决定。
- [x] 3.4 历史 mutable refs 保持原 bytes/point-in-time，不因后续合法修改 current path 产生 Reader conflict。

## 4. 保留最小 current-action strictness

- [x] 4.1 schemaVersion 2 Context/Result closed schema、identity、field-kind-path validator、terminal create-once 保持 fail-closed。
- [x] 4.2 所有 review-* 继续用 `reviewedRunId → Core-derived inputRef` exact-bind immutable reviewed result，并在 completion 重验该 immutable binding。
- [x] 4.3 `review-explore/review-propose` 在 entry 与 completion 校验 reviewed producer 是该 stage 当前最新 completed Run，且完整 OpenSpec artifact set 与 current bytes/namespace 精确匹配。
- [x] 4.4 新增局部 `review → next Action` entry validator：`propose/apply/archive` 通过 `consumedRunId` 消费 approved Review，不新增 sourceReview tuple；Core 在 pending publish 前读取 Review verdict/context/reviewed producer，并 exact-check仍需保持不变的 current artifact/verification generation。
- [x] 4.5 `revise-explore/revise-propose/revise-apply` 保留 matching `sourceReviewRun + sourceReviewVerdict=changes-requested` lineage，并在 pending publish 前执行同类 current generation exact handoff；entry 成功后才允许 Action-owned mutation。
- [x] 4.6 completion preflight 只验证当前 Run 本次 terminal contract；不得扫描其他 historical Runs 的 mutable refs。

## 5. Verification 与 Archive authority boundary

- [x] 5.1 `review-apply` create entry 由 Core 从 current `verification.md` 派生且持久化 `context.verificationInputRef`；Caller 不得提供；completion 必须用该 persisted ref 检测 review-period drift/resume。
- [x] 5.2 `review-apply` terminal 继续由 Core 派生 point-in-time `verificationSummaryRef`；后续 Revision/Verification 更新不得反向产生 historical conflict。`apply/revise-apply/archive` 必须不拥有该 summary ref，非 review-apply context 必须拒绝 `verificationInputRef`。
- [x] 5.3 `archive` 消费 latest approved review-apply 时，只在调用 OpenSpec archive **之前** exact-check current `verification.md` 与该 Review terminal `verificationSummaryRef`；不得做 post-archive relocation replay。
- [x] 5.4 Q2 不新增 OpenSpec archive Adapter/path resolver；删除 C1/Reader 为 historical ResultRef 服务的 archive-aware replay。
- [x] 5.5 integration contract 明确未来 OpenSpec archive success/failure 由 OpenSpec operation 定义；Flowkit 只负责前置 gate 与记录执行结果，不做 post-archive 二次 proof。

## 6. AGENTS 与 docs 最小同步

- [x] 6.1 修改 `AGENTS.md`：增加人类可读内容默认简体中文、Reviewer 只读 mutation boundary、AGENTS 非流程 authority；删除 generation-aware historical replacement 被提升为仓库原则的表述。
- [x] 6.2 修改 `docs/bootstrap-reference.md` 与 `docs/delivery-lifecycle.md`：mutable ResultRef point-in-time、pending 不承担 revision-window、Archive 内部 lifecycle 归 OpenSpec。
- [x] 6.3 修改 `docs/integration-boundaries.md`：ResultRef 的失效语义分成 current handoff exact-invalidating 与 completed historical mutable point-in-time，删除‘任意 ResultRef future path 变化都使旧 Review/续接失效’的无条件总规则。
- [x] 6.4 `docs/product-positioning.md` 保持不修改；`docs/core-model.md` 只修 Archive/Checkpoint completion 顺序与 OpenSpec/Flowkit 状态 ownership，不改高层 authority 定义。

## 7. Tests / Verification

- [x] 7.1 新增真实 Base corpus 回归：Q1 completed historical 记录不得污染 Q2 active Policy；同类 malformed Run 放入 active Q2 时必须继续 conflict。
- [x] 7.2 测试 artifact producer 每次 terminal 自包含完整输出：revise-propose 即使只改一个文件，ResultRefs 仍覆盖完整 proposal/design/tasks/specs current set，无 predecessor inheritance。
- [x] 7.3 测试 pending revise 不产生 revision-window/generation class，也不要求 terminal-only fields。
- [x] 7.4 测试 review-explore/review-propose entry/completion 的 current producer + full artifact exact binding；测试 reviewed result replacement fail-closed。
- [x] 7.5 新增 stale-after-review 负例：approved review-explore→propose 前 `explore.md` drift；approved/changes-requested review-propose→apply/revise-propose 前 proposal bundle/specs drift；均必须在下一 Run pending publish 前 fail closed。
- [x] 7.6 测试 revise-* wrong stage/wrong verdict/wrong reviewed target source review fail-closed；propose/apply/archive 不被错误要求 sourceReview tuple，但必须通过 consumed Review 的局部 exact handoff。
- [x] 7.7 测试 `review-apply` entry 持久化 Core-owned `verificationInputRef`，跨进程/resume 后 completion 仍校验同一 generation；review-period verification drift 必须保持 pending。
- [x] 7.8 测试 review-apply→revise-apply/archive 前 verification stale target fail closed；archive 检查发生在 OpenSpec operation 前，operation 后不做 path replay。
- [x] 7.9 测试 historical produced-artifact / verification-summary 在后续合法 current bytes 变化后不产生 Reader conflict；immutable run-result/current handoff mismatch 仍 conflict。
- [x] 7.10 执行 affected tests、`npm run typecheck`、`npm run lint`、`npm run build`、Q2 OpenSpec strict 与全部 canonical specs strict；不得自动运行 Delivery Full Test。

## 8. 155 Review：Archive closes Change / Checkpoint follows

- [x] 8.1 新增 `flowkit-core-model` delta：OpenSpec Archive success 即令 Change `completed`；Checkpoint 不再作为 Change 保持 active 的完成条件。
- [x] 8.2 新增 `flowkit-policy-engine` delta：无 active Change 时，completed-but-uncheckpointed Change 优先进入 `authorize-checkpoint`；active Change 已存在 completed archive Run 视为状态不一致。
- [x] 8.3 Git boundary reader 从 canonical `chore(flowkit): checkpoint <change-id>` subject 读取 `changeId`，Policy 用 Manifest completed + Git boundary 恢复 checkpoint-pending，不 replay closed Change Runs。
- [x] 8.4 同步 `docs/core-model.md`、`docs/delivery-lifecycle.md`、`docs/bootstrap-reference.md` 的唯一顺序：Archive closes Change → Checkpoint → next Change/Delivery flow。
- [x] 8.5 增加 crash/resume 回归：Archive 后 Change completed、Checkpoint 前无 active Change时必须唯一返回 `authorize-checkpoint`；Checkpoint 后才允许激活下一 Change；completed historical Runs 仍不进入 current projection。

## 9. 157 Review：Checkpoint recovery determinism

- [x] 9.1 Git boundary reader 使用 Delivery Start Git 拓扑限定 checkpoint ownership，当前 Delivery 不得消费其他 Delivery 的同名 checkpoint。
- [x] 9.2 completed Change recovery 同时处理 legacy 无 `changeId` checkpoint 与 structured `changeId` checkpoint；新增 structured boundary 不得让旧 checkpointed Change 重新 pending。
- [x] 9.3 增加 cross-Delivery identity、legacy+structured 混合与真实恢复顺序回归。
- [x] 9.4 不新增 checkpoint 状态文件，不恢复 closed Change Run replay。

## 10. 159–163 Review：Owner authority 边界纠正

- [x] 10.1 repository candidate 不建立、不认证、不持久化 Owner lifecycle decision；不新增 `owner-decision.json`、schema、ResultRef、Run field 或第二套 decision persistence。
- [x] 10.2 Proposal/Design/Verification 只描述 technical contract 与 authority ownership，不再用“Owner 已决定/已冻结”或等价 provenance 话术自证 decision。
- [x] 10.3 历史 terminal Runs 159/160/161/162/163 保持原记录，不通过重写历史“修证据”；后续 Revision 只纠正当前 Author-owned contract。
- [x] 10.4 需要 Owner authority 的 gate 必须从 repository package 之外的独立 Owner 输入获得；Reviewer 独立判断该输入是否存在。

## 11. 164 全面 authority 审计

- [x] 11.1 回顾 146–163 全部 Reviewer findings，逐项确认 147 的语言/Reviewer boundary、151 的 ResultRef/current handoff、155 的 Archive/Checkpoint lifecycle、157 的 Checkpoint recovery、159–163 的 Owner authority 问题均有单一且不越权的最终解释。
- [x] 11.2 修正 OpenSpec/Flowkit ownership：OpenSpec 只拥有 archive operation success/failure、relocation/spec sync；Flowkit 在 operation success 后记录自己的 Manifest Change state，文档/spec 不再暗示 OpenSpec 修改 Flowkit Manifest。
- [x] 11.3 清理 `createRun()` 重复 identity validation 等实现噪音；不新增 resolver/registry/state machine。
- [x] 11.4 再次执行 affected tests、typecheck、lint、build、Q2 strict、8 canonical specs strict 与 Reader admission；不运行 Delivery Full Test、Archive、Checkpoint、Commit 或 Push。
- [x] 11.5 对 disposable copy 执行 OpenSpec archive rehearsal，补齐所有 MODIFIED Requirement 的 canonical scenario preservation；演练必须 archive success 且归档后 8 canonical specs strict 通过，正式 candidate 不执行真实 Archive。

## 12. 165 Review：Owner decision provenance closure

- [x] 12.1 消费 package 外、本次 166 执行上下文中由 Owner 直接提供的 lifecycle decision；不由 Author package 自行建立该事实。
- [x] 12.2 Proposal/Design/Verification 仅记录 Owner input provenance，并继续明确 Owner 输入本身才是 decision authority。
- [x] 12.3 核对 `docs/core-model.md`、`docs/delivery-lifecycle.md`、`docs/bootstrap-reference.md` 已与该 Owner lifecycle decision 一致；无不一致则不做无关文档改写。
- [x] 12.4 不修改 production code/tests，不新增 owner-decision persistence/schema/ResultRef/Run field，不执行 Archive/Checkpoint/Delivery Full Test。
