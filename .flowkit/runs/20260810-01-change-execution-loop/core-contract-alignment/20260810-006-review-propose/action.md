# Action: review-propose

- Run: `20260810-006-review-propose`
- Delivery: `20260810-01-change-execution-loop`
- Change: `Q1 core-contract-alignment`
- Action: `review-propose`
- Role: `reviewer`
- Execution Context: `detached`
- Owner authorization: not required
- GitHub Base: `95bb875b12dc682882ded6b89b829b8b6c407d74`
- Review Chain: `001-explore → 002-review-explore → 003-revise-explore → 004-review-explore → 005-propose → 006-review-propose`
- Reviewed Run: `20260810-005-propose`

## 审查目标

从 `001` 开始保留并回溯完整审查链，重点验证 `005-propose` 是否：

1. 完整承接 `004 approved` 后的 Explore contract；
2. repo-wide 冻结所有受 Q1 影响的 active canonical capability；
3. 让 `changes-requested ≠ revise-required`、blocking authority、direct re-review 与 mixed authority 形成可恢复且唯一的 Policy boundary；
4. 把 Standard Action/Run 收敛为 Change-only，同时维持 Q1→03 deterministic / fail-closed bridge；
5. 不越界实现 D1 Finding convergence、A1 Owner provenance 或 03 Delivery behavior executor。

## Reviewer 结论

`005` 的总体方向正确，OpenSpec strict validation 通过，transport/hash/lineage 也成立；但完整 Proposal blocking scan 发现两个 Author-actionable contract 缺口：

- `Q1-RP-001`：mixed authority 的状态机形成永久 dead-end。Proposal/Policy delta 规定 mixed verdict 必须停在 non-author boundary，同时 explicit direct re-review 又只允许当前 blocking authorities **全部 non-author** 时执行。由于 `blockingAuthorities` 从 immutable Reviewer result 派生，新的 non-author authority fact 到位不会改变旧 mixed verdict，于是该 target 既不能 revise，也不能 re-review，无法进入下一 Reviewer generation 去移除已解决的 non-author blocker并暴露剩余 author blocker。
- `Q1-RP-002`：repo-wide canonical conflict scan 漏掉 active `flowkit-diagnostic-cli` capability。005 新增稳定 blocked reasons，并在 Tasks 中明确要求更新 CLI/diagnostic formatting；exact Base 的 diagnostic CLI spec 又冻结了 doctor 对 `BlockedReason` 的 deterministic severity mapping。缺少 delta spec 会使 Apply 必须修改 CLI behavior 却没有相应 canonical capability contract。

因此本轮 `changes-requested`。两个 blocker 都由 Author 修改 Proposal/Design/Delta Specs/Tasks 即可关闭，不需要 Owner/Verification/External authority。

## Reviewer mutation boundary

允许：

- 读取并回溯 `001 → 005` 完整 cumulative candidate；
- 对 exact Base active specs/docs/code 做只读 contract scan；
- 验证 package hash、ResultRef fingerprint、OpenSpec strict 与文本卫生；
- 只新增本 `006-review-propose` Reviewer Run。

禁止：

- 修改 Author-owned Proposal/Design/Specs/Tasks；
- 修改 production code、tests、Manifest 或 canonical active specs；
- 代替 Author 选择唯一修复实现；
- Apply / Full Test / Archive / Checkpoint / Commit / Push。
