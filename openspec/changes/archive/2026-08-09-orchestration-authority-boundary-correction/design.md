## Context

Q2 Explore 已确认：Base 的高层 authority map 是正确的，偏差集中在 C1/Q1 后续实现细化。当前 Reader 会扫描整个 Delivery Run tree，并通过 `generation-resolver.ts` 把 mutable artifact/verification refs 分类为 `current / superseded / revision-window`，再解析 active/archive physical path 做持续 fingerprint 校验；`revise-propose` 还通过 changed-tag subset + predecessor refs 构造 effective set。

这套模型的复杂度来自一个不必要前提：历史 Run 必须继续证明今天的 OpenSpec current bytes。新的 Owner 原则否定这一前提。

Policy 的真实需求更小：对 active Change，D1 主要消费当前 Change 的 Runs、ReviewVerdicts、Verification gate、owner authorization 和 Manifest/Git/OpenSpec 当前事实；依赖完成由 Manifest/Git authority 提供，不需要 replay 已完成 Change 的每个历史 Run。

## Goals / Non-Goals

**Goals:**

- Flowkit 只保留安全推进当前 Action 所需的最小 orchestration facts。
- Run `pending` 只作为 non-terminal execution status。
- immutable `run-result` 保持 exact binding；mutable external refs 只表达 point-in-time。
- Review/Revision 保留精确的当前交接，不建立持续 historical artifact authority。
- 每个 artifact-producing terminal Run 自包含完整当前输出 refs，删除 predecessor effective-set inheritance。
- Archive 只保留 Flowkit gate + OpenSpec operation result boundary。
- AGENTS/docs 只做最小同步，不形成第二套流程 authority。

**Non-Goals:**

- 不修改 D1 `conflicts -> blocked` 规则。
- 不批量迁移或重写历史 Runs。
- 不建立 history/provenance/generation registry。
- 不让 `pending` 参与 artifact lifecycle classification。
- 不实现完整 OpenSpec apply/archive Adapter。
- 不监控或防御所有 out-of-band filesystem edits；Git/OpenSpec 继续拥有文件/current contract 事实。
- 不实现 E1 CLI，不运行 Delivery Full Test，不做 Checkpoint。

## Decisions

### 1. Reader 只读取当前 Policy 真正消费的 Change Run corpus

Reader 先从 Delivery Manifest 判断 Change 状态，再读取 Run 内容：

```text
Change-level Runs
→ 仅唯一 state=active Change

Delivery-level Runs
→ 继续按 Delivery Policy 需求读取
```

`completed / cancelled / planned` Change 的 Run 目录不进入当前 Change lineage/review projection。它们的完成/依赖事实分别由 Manifest 与 Git boundary authority 提供。

这不是“忽略错误”，而是停止把**当前 Policy 不消费的辅助历史记录**提升为全局 blocking authority。active Change 中 schemaVersion 2 malformed Run、identity conflict、required immutable lineage mismatch 仍必须 fail-closed。

### 2. ResultRef 分成“当前 handoff exact binding”和“历史 point-in-time reference”

ResultRef 的‘失效’不能再按一个全局规则解释，而必须看它是否仍被当前 Action 消费：

- `run-result`：指向 terminal create-once `result.json`。只要它作为当前 `inputRef` / reviewed result / consumed review 被消费，就必须 exact hash 验证；目标替换会使**当前 handoff**失效。
- `produced-artifact`：producer terminal 时记录 OpenSpec bytes。作为 review/next-action 的**当前被审 generation**时，可以由 Core 临时用于 exact handoff check；当该 handoff 已结束后，它只是历史 point-in-time reference，future 合法 current-path 修改不会反向使历史 ref 失效。
- `verification-summary`：completed `review-apply` 的 terminal point-in-time summary reference；future verification 更新不反向失效。
- `verificationInputRef`：只存在于 pending/current `review-apply` context，由 Core 在 entry 从当前 `verification.md` 派生，用于 entry→completion 期间 exact binding；Review terminal 后不参与 future replay。

因此需要同步 canonical `flowkit-integration-boundaries` 与 `docs/integration-boundaries.md`：‘当前仍在消费的 ref mismatch’与‘已结束历史 mutable ref 的 future drift’是两种不同语义。Reader 不再在未来 snapshot 中把历史 mutable ref 与 current path 比较；OpenSpec/Git/Verification 当前事实继续直接从各自 authority 读取。

### 3. Artifact-producing Run 每次都记录完整当前输出，不继承 predecessor refs

Core 可以仅从 Action + current OpenSpec namespace 确定输出集合，因此 Caller 不需要声明“这次改了哪些 tag”。

```text
explore | revise-explore
→ 完整输出 = explore.md

propose | revise-propose
→ 完整输出 = proposal.md + design.md + tasks.md + 当前完整 specs/**
```

`revise-propose` terminal 不再构造：

```text
predecessor effective set
+ changed-tag replacement
+ inherited refs
```

而是重新读取当前 OpenSpec current state 并派生完整 refs。这样每个 terminal producer Run 都是自包含的 point-in-time execution result，历史 Run 不需要 generation classification。

`CompleteRunInput.producedArtifactTags` 作为 Caller 维护的 changed-subset descriptor 不再是必要事实，应删除；Action-owned output set由 Core 决定。

### 4. `pending` 不承担 artifact revision-window 语义

Run 生命周期保持：

```text
pending
→ completed | failed | cancelled
```

其中 `pending` 仅表示 `result.json` 尚未 terminal publish。

当 `revise-*` pending 时，Author 可以按 Action 契约修改 canonical OpenSpec artifacts，但 Reader 不通过“revision-window”豁免 predecessor hash；更简单的规则是：Reader根本不对 historical mutable refs持续比较 current bytes。Revision terminal 时 Core 重新派生完整当前输出 refs。

Action、Change 不新增 `pending` 状态。

### 5. Review strictness 只保护“本次 Reviewer 到底审了什么”

所有 review-*：

- `reviewedRunId` 必须存在；
- `context.inputRef` 必须由 Core 从 reviewed terminal `result.json` 派生；
- entry 与 completion 都要验证该 immutable result 没有被替换。

`review-explore / review-propose` 还需要对 OpenSpec artifact 做 current exact binding，因为 Reviewer 正在审查这些 artifact-producing Run 的输出：

- reviewed Run 必须是该 stage 当前最新 completed producer Run；
- 其 produced refs 必须形成该 Action 的完整输出集合；
- entry 与 completion 时这些 refs 必须与 current OpenSpec bytes 精确匹配；
- `review-propose` specs set 必须与 current `specs/**` namespace exact-match。

`review-apply` 不做 Proposal bundle replay，但必须冻结 Reviewer 实际看到的 Verification generation：

- createRun entry 由 Core 从 current `verification.md` 派生 `context.verificationInputRef`；Caller 不得提供 hash/ref/kind；
- `verificationInputRef` 只允许 `review-apply` context 持有；其他 Action 携带必须 closed-schema fail；
- completion 再以 persisted `verificationInputRef` exact-check current `verification.md`；不一致则不发布 verdict/result，Run 保持 pending；
- terminal 时按现有 ownership 再派生 `verificationSummaryRef`，作为该 completed Review 的 point-in-time summary。

这给 entry→completion/resume 一个最小可恢复 binding，但不建立跨后续 Revision/Archive 的 verification generation registry。

### 6. Review → 下一 Action 只保留最小 current exact handoff

删除 historical replay **不等于**删除 review 后的当前交接。凡下一 Action 消费某 Review 所覆盖的 mutable current generation，必须在该 Action 的 pending Run 正式 publish **之前**完成一次 exact handoff check；合法 mutation 只能发生在 entry check 之后。

不新增全局 source-review state machine。对于非-revise consumer，使用已有 `consumedRunId` 作为本次执行描述符：Core 读取该 Review 的 immutable result/verdict/context，再追到 `reviewedRunId` / producer refs；不要求额外持久化 `sourceReviewRun/sourceReviewVerdict` tuple。

最小矩阵：

```text
approved review-explore → propose
changes-requested review-explore → revise-explore
approved review-propose → apply
changes-requested review-propose → revise-propose
changes-requested review-apply → revise-apply
approved review-apply → archive（只在调用 OpenSpec archive 前）
```

entry 检查只验证该 Review 真正覆盖、且在下一 Action 开始前仍必须保持不变的 current authority bytes：

- explore review handoff → current `explore.md` 必须仍与 reviewed explore generation 一致；
- proposal review handoff → current `proposal.md + design.md + tasks.md + specs/**` 必须仍与 reviewed proposal generation 一致；
- review-apply handoff → 使用该 completed review 的 terminal `verificationSummaryRef` 与 current `verification.md` exact-check；archive 的检查必须发生在 OpenSpec relocation 前。

如果 review 后、下一 Action entry 前发生 drift，Core 必须 fail closed；不得因为 artifact 后来是“合法可修改的”就复用旧 verdict。entry 成功后，当前 Action 按自己的 ownership 发生的合法 mutation 不再被 predecessor historical ref 阻止。

### 7. Revision strictness 继续绑定 matching changes-requested Review

`revise-explore / revise-propose / revise-apply` 继续保存并验证：

```text
sourceReviewRun
sourceReviewVerdict = changes-requested
```

source review 必须是 matching stage 的 completed review，且 `reviewedRunId` 指向被修订的当前 stage producer。除了 immutable Review result/verdict lineage，还必须在 pending publish 前执行第 6 节定义的 current artifact/verification handoff check。

该 tuple **不推广**到 `propose / apply / archive`。这三个 Action 使用 `consumedRunId` 表达一次性的 Review handoff，并由 Core 在 entry 读取真实 Review 事实；不创造新的长期 source-review state machine。

### 8. Completion preflight 只验证当前 Run 要发布的事实

terminal publish 前继续保留：

- current Run Context/Result closed schema；
- 当前 Run 自己要发布的 complete produced refs；
- current `inputRef / consumedInputRefs / reviewVerdictRef` 等 immutable run-result targets；
- review-explore/review-propose 在 review completion 的当前 artifact exact binding；
- terminal create-once (`assertMutable + fs.link`)。

不再做：

- 扫描全部历史 Run mutable refs；
- predecessor effective-set inheritance；
- superseded/revision-window classification；
- archive relocation 后 historical mutable ref 的二次验证。

### 9. Archive：Flowkit 只消费 OpenSpec 操作结果

当前 Delivery Manifest 已明确 `OpenSpec apply / archive 集成` 不在 Deterministic Core 实现范围，因此 Q2 不新增 archive Adapter。

边界只冻结为后续实现约束：

```text
Flowkit Policy / Owner
→ 判断 archive 是否允许

OpenSpec archive
→ OpenSpec 自己负责 contract relocation / spec sync / operation success|failure

Flowkit
→ 记录 archive execution success|failure
```

在调用 OpenSpec archive 前，Flowkit MAY/MUST 按第 6 节验证本次 `archive` 正在消费的 latest approved `review-apply` 及其 `verificationSummaryRef` 仍对应 current `verification.md`；该检查是 current handoff，不是 archive lifecycle proof。OpenSpec 返回成功后，Flowkit 不再扫描 archive 目录、重算 historical ResultRef 或重新证明 OpenSpec 已经拥有的事实。

155 Review 暴露了 Archive/Checkpoint 状态顺序矛盾。修正后的 authority split 是：

```text
OpenSpec archive operation success
→ OpenSpec 只证明 archive operation 成功
→ Flowkit 记录自己的 Manifest Change.state = completed（Change 关闭）
→ Reader 不再投影该 Change-level Runs
→ Policy 从 Manifest completed + Git checkpoint boundary 判断 checkpoint-pending
→ authorize-checkpoint
→ Checkpoint 完成后再进入下一 Change / Full Test readiness
```

Owner decision 属于执行流程的独立输入，不由本 Design、Run 或其他仓库 artifact 建立/持久化。本次 166 revise-apply 的执行上下文已经收到 Owner 对本节 Archive/Checkpoint lifecycle 的明确确认；本 Design 仅记录该 provenance，不把仓库 artifact 变成 Owner decision authority。

Checkpoint 仍不是 Change Action，也不要求 Change 保持 active。为了 crash/resume 保持确定性，Git boundary reader 使用 Git 自身的 Delivery Start 拓扑给 boundary 限定 Delivery ownership：一个 checkpoint 只属于其最近且唯一的 Delivery Start ancestor；其他 Delivery 的同名 checkpoint 不进入当前 Delivery facts。canonical subject `chore(flowkit): checkpoint <change-id>` 继续提供 structured `changeId`。对 Base 已存在、没有 `changeId` 的 legacy checkpoint，Policy 保留原有有界 count 兼容，并与 structured boundary **同时**生效；出现新 structured boundary 不得让 legacy 已 checkpoint Change 重新变成 pending。整个过程只读 Git authority，不新增 checkpoint 状态文件或 Run replay。

### 10. AGENTS/docs 只做 keep / clarify / remove 的最小同步

**KEEP 高层定位：**

- `docs/product-positioning.md` 保持不改。
- `docs/core-model.md` 的 thin orchestration / One fact one authority / RunStatus 四态保持；只修 Archive/Checkpoint completion 顺序与 OpenSpec/Flowkit 状态 ownership 表述。

**CLARIFY：**

- `AGENTS.md`
  - 人类可读说明默认简体中文；机器/代码标识保持英文；
  - Reviewer 只读 reviewed candidate，只写 Reviewer-owned Review Run/artifact；
  - AGENTS 只约束 Agent 行为，不拥有 next Action、Change contract、Owner decision；
  - 删除“generation-aware historical replacement validation 是仓库原则”的表述。
- `docs/bootstrap-reference.md`
- `docs/delivery-lifecycle.md`
- `docs/integration-boundaries.md`
  - ResultRef 区分 current handoff exact-invalidating 与 historical mutable point-in-time；
  - historical mutable refs 是 point-in-time；
  - pending 不创建 revision-window authority；
  - Archive 内部 lifecycle 归 OpenSpec。

**REMOVE / NARROW：**

- C1 canonical spec 中 generation/revision-window/archive historical replay requirements；
- production `generation-resolver` 的全局 generation classification；
- Reader 对 completed Change historical mutable bytes 的持续 proof。

## Risks / Trade-offs

- **不会再自动发现所有 out-of-band historical/current artifact drift。** 这是有意的 authority 收敛：Flowkit 不是 filesystem tamper monitor。Review 的当前 artifact exact binding仍保护“Reviewer审了什么”；Git/OpenSpec继续拥有文件/current contract事实。
- **Reader 不再扫描 completed Change 的内部 Run 错误。** 当前 Policy 不需要这些记录；未来 E1 `doctor` 若要提供显式历史诊断，可以单独扫描，但诊断能力不得重新成为 `next` 的全局 authority。
- **每次 revise-propose 都记录完整 bundle，ResultRef 数量可能略多。** 换来的好处是删除 predecessor inheritance 与 generation model；仍只是 ref，不复制文件内容，符合 Lean Run。
- **移除 producedArtifactTags 会改变 persistence API。** 这是刻意删除 Agent/Caller 维护的冗余 changed-subset fact；tests 与 detached helper 必须同步。

## Migration Plan

无历史数据迁移。现有 terminal Runs 保持原 bytes。

Apply 顺序：

1. 先把 Reader scope 收窄到 current Policy relevance，并停止 historical mutable target replay；
2. 把 artifact-producing completion 改成每次完整自包含 output refs，删除 changed-subset inheritance；
3. 用局部 current-stage helper 取代 `generation-resolver` 的全局 classification，保留 review/revise/next-action 最小 exact handoff；
4. 为 review-apply 增加 Core-owned `verificationInputRef`，并收窄 verificationSummaryRef 与 archive pre-entry handoff；
5. 同步 canonical specs、AGENTS、bootstrap/lifecycle/integration-boundaries docs；
6. 迁移测试为 current strictness + stale-after-review + historical non-authority 回归。

若 Apply 发现某个被删除机制确实是当前 Action 正确性不可替代的前提，必须回到 Proposal/Reviewer 说明具体错误场景；不得直接以“更安全”为理由恢复全局 generation/provenance 模型。
