# Action: review-propose

- Run: `20260810-008-review-propose`
- Delivery: `20260810-01-change-execution-loop`
- Change: `Q1 core-contract-alignment`
- Action: `review-propose`
- Role: `reviewer`
- Execution Context: `detached`
- Owner authorization: not required
- GitHub Base: `95bb875b12dc682882ded6b89b829b8b6c407d74`
- Review Chain: `001-explore → 002-review-explore → 003-revise-explore → 004-review-explore → 005-propose → 006-review-propose → 007-revise-propose → 008-review-propose`
- Reviewed Run: `20260810-007-revise-propose`

## 审查目标

从 `001` 开始保持完整审查链，重新复核 `006` 的两个 blocking findings，并对 `007-revise-propose`
执行新的 Proposal 级完整 blocking scan。

## Reviewer 结论

- `Q1-RP-002` resolved：`flowkit-diagnostic-cli` 已纳入 affected capability set；新增 delta 与 exact Base 中
  `next 必须完整、确定地呈现 PolicyResult`、`doctor 只汇总 authority-owned conflicts 与最小恢复检查`
  两个 active requirement 精确对应；新 blocked reason 的 next presentation / doctor warning severity 已冻结，
  CLI 继续只消费 PolicyResult。
- `Q1-RP-001` still-open（范围已显著收窄）：007 已正确允许 pure/mixed non-author Review 通过新的 Reviewer
  generation 恢复，也保持 mixed 时禁止 Author revise、`next()` fail-closed、不自动 review。但 machine admission
  contract 仍未被冻结成 deterministic rule。Design 明确承认 Q1 没有统一 authority-event/provenance contract，
  Policy 不会推断“相关 non-author fact 已到位”；与此相对，Policy delta 把该不可统一机器判定的事实写进
  `canRun(review-S)` scenario 前提，并使用 `MAY allowed`。因此同一个 formal snapshot/action 下，实现仍可选择
  allow 或 deny，甚至按部分 authority 猜测，无法保证 mixed dead-end 被产品 contract 真正消除。
- 其余 007 mutation 符合 revise-propose 边界；Reviewer-owned 002/004/006 artifacts byte-identical，007 lineage /
  produced ResultRef fingerprints 正确。
- exact Base 已通过 Git metadata 复核为 `95bb875b12dc682882ded6b89b829b8b6c407d74`；OpenSpec 1.7 `validate core-contract-alignment --strict`
  实际通过；candidate text/package hygiene 无 blocking issue。

因此本轮 `changes-requested`，唯一 blocker 仍属于 Author Proposal contract，可通过再次
`revise-propose` 关闭，不需要 Owner / Verification / External authority。

## Reviewer mutation boundary

允许：

- 回溯 `001 → 007` cumulative review chain；
- 对 exact Base active specs/docs/code 做只读 contract scan；
- 验证 package SHA、lineage fingerprint、OpenSpec strict 与文本卫生；
- 只新增本 `008-review-propose` Reviewer Run。

禁止：

- 修改 Author-owned Proposal/Design/Specs/Tasks；
- 修改 production code、tests、Manifest 或 canonical active specs；
- 替 Author 实现 direct re-review API；
- Apply / Full Test / Archive / Checkpoint / Commit / Push。
