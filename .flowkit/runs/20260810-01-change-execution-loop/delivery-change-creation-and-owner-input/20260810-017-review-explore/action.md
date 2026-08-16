# Action: review-explore

- Run: `20260810-017-review-explore`
- Delivery: `20260810-01-change-execution-loop`
- Change: `A1 delivery-change-creation-and-owner-input`
- Action: `review-explore`
- Role: reviewer
- Execution Context: detached
- Owner authorization: not required
- GitHub Base: `448fa042de86d07e893bcc51da528f93eb7ced3a`
- Reviewed Run: `20260810-016-explore`

## Review scope

审查 `016-explore` 是否完整识别 A1 Proposal 必须冻结的真实 write-side / activation gaps，并结合
Q1 Change Checkpoint 后的实际 dogfood 结果复核 A1 的入口前提。

本 Review 接受 Owner 已明确选择：

```text
不新增 Q2
→ dependency identity drift 并入 A1 解决
```

Reviewer 只冻结 required outcome，不替 Author 修改 Explore 或选择唯一 implementation。

## Reviewer verdict

`changes-requested`

Blocking Findings: 1。

### A1-RE-001 — A1 Explore 漏掉真实 dependency identity drift

016 对 detached ZIP 缺 `.git` 的 transport gap 诊断正确，但把当前 A1 不能由 Flowkit 正常推进的原因
主要归结为“本地看不到 Q1 Checkpoint”，因此没有记录已经在真实 checkpoint 语义下复现的第二层问题：

```text
canonical Delivery Manifest:
A1.dependsOn = ["core-contract-alignment"]   // Change.id

current Policy dependenciesMet():
snapshot.changes.some(c => c.key === depKey && c.state === "completed")
                                               ^ compares Change.key
```

当前正式 Manifest 以及历史 Delivery Manifests 的 dependency values 持续使用 Change `id`，
而 Policy unit fixtures 多处使用 `Q1/Q2/...` key 作为 dependsOn，导致 fixture 与真实 formal-fact shape 漂移。

结果是：

```text
Q1 completed
+ Q1 Git Change Checkpoint exists
→ current Policy still reports dependency-incomplete for A1
```

这直接落在 A1 自身负责的：

```text
dependencies completed
+ Owner authorize activation
→ planned → active
```

activation contract / creation validation 范围内。既然 Owner 已决定不新增 corrective Q2，该 drift
必须在 A1 Explore 中成为明确 confirmed gap，并由后续 Proposal 冻结 canonical dependency identity，
Reader / Policy / creation validation / tests 的一致 contract。

016 当前 `P5 create Change contract` 只泛化提到 unknown/self/duplicate/cycle dependency，
不足以覆盖这个已经真实发生的 identity mismatch。

## Required outcome for revise-explore

Author 在 `revise-explore` 中必须：

1. 保留 ZIP 无 `.git` 是 detached transport observation gap 的现有结论，但不得再把它当成 A1 当前唯一入口问题；
2. 新增明确的 confirmed gap，记录：
   - Manifest `dependsOn` 的真实 persisted shape；
   - Policy 当前按 `Change.key` 比较；
   - 真实 Q1 checkpoint 后 A1 被错误判定 `dependency-incomplete`；
   - 测试 fixture 与真实 Manifest identity 语义存在漂移；
3. 把该问题明确归入 A1 的 dependency / activation / create-Change validation contract，而不是重开 Q1 或新增 Q2；
4. 在 Proposal Freeze Questions 中要求 repo-wide 冻结唯一 dependency identity，并同步：
   - Manifest contract；
   - FormalFactReader projection；
   - Policy dependency resolution；
   - create/change dependency validation；
   - diagnostic behavior；
   - 使用真实 Manifest shape 的 regression tests；
5. 不在 Explore 阶段直接决定实现代码或提前修改 production/tests；
6. 不回退 016 已经正确识别的 Owner provenance、activation mutation、Manifest writer、multi-file failure、
   CLI/API boundary、A1 scope guards 等其它 Explore 结论。

Reviewer 不在本轮强制指定 `id` 或 `key` 的实现表达；但 Proposal 必须基于 repo-wide canonical evidence
冻结唯一语义。当前真实 Manifest corpus 强烈表明 dependency values 是 Change `id`，Author 应在
revise/propose 中验证后正式冻结。

## Other review results

除上述 omission / wrong-entry diagnosis 外：

- `baseHead` 正确为 `448fa042de86d07e893bcc51da528f93eb7ced3a`；
- package 只新增 016 Explore artifacts 并将 A1 `planned → active`；
- SHA256SUMS 全部通过；
- 016 produced `explore.md` ResultRef fingerprint 与实际 bytes 一致；
- Owner provenance / create Delivery / create Change / activation writer / applicability / atomicity /
  CLI/API / OpenSpec seam / downstream scope guard 的 Explore 覆盖充分；
- 未发现第二个独立 Explore blocker。

## Next boundary

唯一 blocker 为 Author 可通过修改 Explore 关闭：

`revise-explore`
