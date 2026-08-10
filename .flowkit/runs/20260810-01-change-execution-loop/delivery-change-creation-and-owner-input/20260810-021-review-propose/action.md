# Action: review-propose

- Run: `20260810-021-review-propose`
- Delivery: `20260810-01-change-execution-loop`
- Change: `A1 delivery-change-creation-and-owner-input`
- Action: `review-propose`
- Role: reviewer
- Execution Context: detached
- Owner authorization: not required
- GitHub Base: `448fa042de86d07e893bcc51da528f93eb7ced3a`
- Review Chain: `016-explore → 017-review-explore → 018-revise-explore → 019-review-explore → 020-propose → 021-review-propose`
- Reviewed Run: `20260810-020-propose`

## Review scope

基于 `019 approved Explore` 审查 `020-propose`，确认 A1 Proposal 是否完整冻结：

- Delivery / Change creation；
- Owner decision / authorization provenance；
- cross-Change / cross-Delivery applicability；
- Change activation；
- Manifest bounded writer / atomicity；
- minimal OpenSpec initializer；
- bounded write CLI / read-only diagnostics；
- `dependsOn` canonical identity；
- A1 与 B1/C1/D1/E1/F1/G1/03 scope boundary。

同时对 `Base + 020 cumulative candidate` 运行 OpenSpec 1.7 strict，并复核 transport /
lineage / ResultRef / canonical Delivery dependency corpus。

## Reviewer verdict

`changes-requested`

Blocking Findings: 2，均为 `blockingAuthority=author`。

### A1-RP-001 — authorization-only Owner record 的当前 gate admission 未进入正式 spec

020 Design/Tasks 已意识到 stale/early authorization 风险：

- Design 9 写 `owner record` 在写入前 `SHOULD` 要求 current `next(snapshot)` 正好请求
  同一 Owner decision/target；
- Tasks 3.3 则明确要求实现该检查，拒绝 stale/early authorization。

但 A1 新 capability 与 Policy/Persistence delta specs 只冻结 typed decision、delivery/change target
applicability 和 cross-scope isolation，没有要求 authorization-only record **只能在 current Policy
正在请求同一 owner-decision/target 时写入**。

因此按当前正式 spec，一个实现仍可在 propose 尚未 approved、review-apply 尚未 approved 等时机提前
persist `authorize-apply` / `authorize-archive`；等将来 gate 到达时，旧 record 会因 delivery/change
target 匹配而直接关闭 gate。该实现并未违反现有 delta requirements，却破坏了 Owner authorization
作为当前 lifecycle authority boundary 的时序语义。

Required outcome：把 authorization-only owner record admission 收敛为 normative deterministic
contract，并同步 Proposal/Design/spec/tasks。至少必须明确：write operation 在持久化
`authorize-apply/archive/checkpoint/full-test/delivery-finalize` 前重新读取 current formal facts /
Policy，current Policy 必须正在请求同一 decision 与同一 canonical target；否则 fail closed 且
Manifest 不变。Create/activate provenance 继续由对应 mutation command 原子形成，不走该 standalone gate。

### A1-RP-002 — Change architectureImpact 只进入 create input，未冻结为 persisted Change fact

019 Explore P5 与 02 A1 reference 要求 Change creation 至少冻结：

`key/id/goal/dependsOn/outputs/architectureImpact/required/state=planned`。

020 虽然：

- 新 capability 要求 Change create input 包含 `architectureImpact`；
- domain delta 也要求 Change create input 表达 `architectureImpact`；
- Proposal Impact 提到 “Change architectureImpact 等 A1 需要的最小领域类型”；

但 Proposal/Design/spec/tasks 没有冻结 `architectureImpact` 必须随新 Change 写入 Delivery Manifest，
也没有要求 `Change` / `ChangeSummary` / `ChangeFact`（或等价 persisted/read projection）保存它。
当前 canonical types 也确实没有 Change-level `architectureImpact`。

因此实现可以合法地接收 `architectureImpact` 参数、校验后直接丢弃，只写
`key/id/goal/dependsOn/outputs/required/state`，仍可满足当前 delta text；这没有完成 A1 frozen
Change creation contract，也会让后续 architecture-aware Delivery consumer 无法恢复该事实。

Required outcome：在 Proposal/Design/new capability/domain/persistence/tasks 中明确
Change-level `architectureImpact` 的 canonical persisted location、write/read/type contract；
createDelivery initial planned Changes 与后续 createChange 必须使用同一语义。若最终决定该字段
不应成为 Change fact，则必须由 Proposal 明确重置 Explore/02 reference 的 required outcome，而不能
仅在 input 中接受后丢弃。

## Passed checks

- `baseHead` = `448fa042de86d07e893bcc51da528f93eb7ced3a`；
- 016–019 prior Run artifacts 与上一 Reviewer package byte-identical；
- 020 `inputRef` 精确绑定 019 result；
- 020 全部 produced ResultRef fingerprints：valid；
- `SHA256SUMS`：全部通过；
- payload text hygiene：通过；
- OpenSpec 1.7 `validate delivery-change-creation-and-owner-input --strict`：passed；
- OpenSpec planning artifacts：4/4 complete；
- canonical Delivery dependency corpus：20260805 / 20260806 / 20260810 的 `dependsOn`
  均可解析到同 Delivery Change.id，支持 020 冻结 `dependsOn=Change.id` 且当前 manifests 无需 migration；
- 未发现 dependency identity、activation two-step publish、Owner cross-scope applicability、
  bounded writer、CLI/read-only diagnostics、OpenSpec seam 或 downstream scope 的其它 blocking conflict。

## Next boundary

两个 blocker 均为 Author Proposal contract 可修复问题，因此：

`revise-propose`
