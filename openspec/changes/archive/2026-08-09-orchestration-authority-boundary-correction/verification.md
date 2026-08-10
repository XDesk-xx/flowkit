# Change Verification — Q2 orchestration-authority-boundary-correction

## 结论

`20260806-164-revise-apply` 对 146–163 的全部 Q2 lineage 做了一次完整 authority 审计，而不是只修 163 的一句话。

本轮结论：**实现、contract、文档和 OpenSpec delta 已重新收敛到“简单但有效 / One fact, one authority”边界；当前 candidate 没有新增第二套 Owner/OpenSpec/Git/Verification authority。**

163/165 的 `Q2-RA-001` 不通过 repository artifact 自证关闭。在本次 `20260806-166-revise-apply` 的 package 外执行输入中，Owner 已直接、明确确认当前 Archive/Checkpoint lifecycle 模型；该 Owner 输入本身是 decision authority，本 package 只记录 provenance，不创建或替代该 authority。

## 146–163 全面审计

### 147 — AGENTS 语言与 Reviewer mutation boundary

保持关闭：

- 人类可读说明默认简体中文；机器标识保持英文；
- Reviewer 只写 Reviewer-owned Review Run/artifact，不修改 Author artifact、production/tests/Manifest；
- `AGENTS.md` 只是 Agent 行为约束，不拥有 Policy/OpenSpec/Owner decision。

### 151 — ResultRef 与 current handoff

保持关闭：

- immutable `run-result` 与当前正在消费的 handoff 保持 exact；
- completed historical `produced-artifact` / terminal `verification-summary` 是 point-in-time；
- Reader 不恢复 global historical mutable replay；
- `review-apply` 的 `verificationInputRef` 只覆盖本次 Review entry→completion window。

### 155 — Archive / Checkpoint lifecycle

最终 authority split 修正为：

```text
Flowkit archive gate
→ 调用 OpenSpec archive
→ OpenSpec owns: operation success/failure + relocation + spec sync
→ operation success 后 Flowkit 记录自己的 Manifest Change.state=completed
→ Change 关闭
→ Checkpoint 是其后的 Flowkit/Git boundary
```

本轮特别修正了此前容易越权的表述：**OpenSpec 不修改 Flowkit Manifest；Flowkit 只消费 OpenSpec operation result，再写自己的状态事实。**

### 157 — Checkpoint recovery determinism

保持关闭：

- Git boundary reader 用 Git Delivery Start topology 限定当前 Delivery ownership；
- other-Delivery 同名 checkpoint 不泄漏；
- legacy 无 `changeId` checkpoint 与 structured checkpoint 同时兼容；
- 不新增 checkpoint state file，不 replay closed Change Runs。

### 159 / 161 / 163 / 165 — Owner decision authority

前序 Review 一直要求同一件事：Author package 不能自行建立或认证 Owner lifecycle decision。

166 的关闭方式不是再改技术 contract，而是消费 package 外、本次执行上下文中 Owner 的直接输入。Owner 明确确认：

- OpenSpec archive operation 成功后，Flowkit 将该 Change 记为 `completed / closed`；
- Change Checkpoint 是其后的 Git persistence / synchronization / recovery boundary；
- Checkpoint 不参与 Change completion 的判定；
- OpenSpec 负责 archive operation、relocation 和 spec sync；
- Flowkit 负责消费 archive 结果并更新自身 orchestration state；
- Git 负责 Checkpoint 持久化边界。

因此当前边界是：

- Owner 直接输入是 decision authority；
- repository candidate 只记录 technical contract 与该输入的 provenance；
- Reviewer 应结合该独立 Owner 输入确认 gate 已满足；
- package 不新增 `owner-decision.json`、schema、ResultRef、Run field 或第二套 persistence。

历史 159–165 Runs 保持原记录，不通过改写历史来“修证据”。

## 166 Owner decision provenance 与文档一致性

本轮没有新的代码级 Finding，也没有重新设计 lifecycle。Owner 的独立输入与 164 已实现/文档化的模型完全一致。

核对结果：

- `docs/core-model.md` 已明确 OpenSpec archive success 后由 Flowkit 记录 Change `completed`，Checkpoint 不属于 Change 完成条件；
- `docs/delivery-lifecycle.md` 已明确 Archive closes Change，随后进入 Change Checkpoint；
- `docs/bootstrap-reference.md` 已明确 Checkpoint 是独立 Git boundary，不参与 `active → completed` 判定；
- `docs/integration-boundaries.md` 的 OpenSpec / Flowkit / Git authority split 与 Owner decision 一致。

因此本轮不为“记录 Owner decision”去改写这些 canonical docs；只更新 Proposal/Design/Tasks/Verification 的 provenance 状态。

## 164 额外发现与修复

### 1. OpenSpec / Flowkit 状态 ownership 表述

修正文档/spec 中“OpenSpec success 直接更新 Change state”的歧义：

- OpenSpec 拥有 archive operation facts；
- Flowkit 拥有 Manifest Change state；
- operation success 后由 Flowkit 记录 `completed`。

### 2. 旧 generation 语义残留

`validateStageEffectiveSet` 已改名为 `validateCurrentStageArtifactSet`。行为不扩大：它只用于当前 Action entry/completion 的完整 artifact-set exact check，不表示 predecessor inheritance、historical generation registry 或 revision-window authority。

同时删除 `createRun()` 中重复的 identity validation 调用；没有新增 resolver/state machine。

### 3. OpenSpec MODIFIED scenario preservation

全面 archive rehearsal 发现 Q2 delta 的部分 `MODIFIED Requirement` 没有保留 canonical scenario 名称。已补齐 scenario preservation，避免真实 Archive 时被 OpenSpec 拒绝或意外丢 scenario。

在 disposable copy 中实际执行：

```text
openspec archive orchestration-authority-boundary-correction -y
→ success
→ specs delta: +6 / ~11 / -4

openspec validate --specs --strict
→ 8 / 8 passed
```

该 rehearsal 只发生在 disposable copy；正式 candidate **没有执行真实 Archive**。

## Final affected verification

```text
npm run typecheck
→ passed

npm run lint
→ passed

npm run build
→ passed

npm test
→ 557 / 557 passed
→ 131 suites
→ 0 failed

openspec validate orchestration-authority-boundary-correction --strict
→ passed

openspec validate --specs --strict
→ 8 / 8 passed
```

Authority scans：

- 当前 Author-owned Proposal/Design/Tasks/docs/AGENTS 不以 repository artifact 自证 Owner decision；166 仅记录本次 package 外 Owner 直接输入的 provenance；
- docs/spec 无“OpenSpec 修改 Flowkit Manifest”的 ownership 越权表述；
- production 无 `classifyArtifactGenerations` / `classifyVerificationGenerations` / `resolveArchiveAwareArtifactPath` global replay API；
- current-stage exact check 仍保留，但只服务当前 Action correctness。


## 166 Owner decision provenance closure

165 的唯一 Blocking Finding `Q2-RA-001` 是：technical contract 已正确，但 candidate 仍缺 package 外独立 Owner lifecycle decision。

本次 `20260806-166-revise-apply` 的执行输入中，Owner 已直接明确确认：

- OpenSpec archive operation 成功后，Flowkit 将该 Change 记为 `completed / closed`；
- Change Checkpoint 是其后的 Git persistence / synchronization / recovery boundary；
- Checkpoint 不参与 Change completion 的判定；
- OpenSpec 负责 archive operation、relocation 和 spec sync；
- Flowkit 负责消费 archive 结果并更新自身 orchestration state；
- Git 负责 Checkpoint 持久化边界。

该 Owner 输入本身是 decision authority。repository candidate 只记录 provenance，不新增 Owner decision persistence。

本轮文件范围：

- 修改：`proposal.md`、`design.md`、`tasks.md`、`verification.md`；
- 新增：165 Reviewer Run、166 Author Run；
- `src/**` 与 `tests/**` 相对 164 candidate 均无变化；
- canonical `docs/core-model.md`、`docs/delivery-lifecycle.md`、`docs/bootstrap-reference.md`、`docs/integration-boundaries.md` 已与 Owner decision 一致，因此不做无关改写。

本轮重新执行：

```text
openspec validate orchestration-authority-boundary-correction --strict
→ passed

openspec validate --specs --strict
→ 8 / 8 passed
```

由于 production/tests 未变化，不重复执行 164 已通过的 557/557 affected test suite；164 的 code-level verification 继续作为未变代码的现有证据。

## 未执行

- **未运行 Delivery Full Test**；
- 未对正式 candidate 执行 OpenSpec Archive；
- 未执行 Change Checkpoint；
- 未 Commit / Push。
