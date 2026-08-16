# Action: review-propose

- Run: `20260810-023-review-propose`
- Delivery: `20260810-01-change-execution-loop`
- Change: `A1 delivery-change-creation-and-owner-input`
- Action: `review-propose`
- Role: reviewer
- Execution Context: detached
- Owner authorization: not required
- GitHub Base: `448fa042de86d07e893bcc51da528f93eb7ced3a`
- Review Chain: `016-explore → 017-review-explore → 018-revise-explore → 019-review-explore → 020-propose → 021-review-propose → 022-revise-propose → 023-review-propose`
- Reviewed Run: `20260810-022-revise-propose`

## Review scope

按 Owner 要求从 `016` 开始回溯完整 A1 审查链，复核 `022-revise-propose` 是否逐项关闭
`021-review-propose` 的 `A1-RP-001` / `A1-RP-002`，并重新执行 Proposal 级完整 blocking scan。

## Reviewer verdict

`changes-requested`

Blocking Findings: 1，`blockingAuthority=author`。

### A1-RP-001 — resolved

022 已把 authorization-only Owner record 的 stale/early admission 从 Design/Task 提升为 normative
deterministic contract：

- persistence 前 MUST fresh-read FormalFactSnapshot + current Policy；
- current result MUST 是相同 owner-decision；
- decision 与 canonical Delivery/Change target MUST 完全一致；
- mismatch/stale/early/current conflict MUST fail closed；
- Manifest MUST 在失败时保持 byte-identical；
- CLI/service 共享同一 admission helper，不复制第二套 Policy tree。

new capability、Policy delta、Reader/Persistence delta、Design 与 Tasks 已同步。

### A1-RP-002 — still-open（已从“未持久化”收窄为 bootstrap compatibility gap）

022 已正确补齐 Change-level `architectureImpact` 的 future persisted/read contract：

- create input 必须携带；
- createDelivery initial planned Changes 与 createChange 使用同一语义；
- Manifest 必须保存；
- Domain/ChangeFact/Reader/checkout-resume 必须恢复；
- 不能接收后丢弃。

但新 contract 与当前 exact Base 的真实 bootstrap Manifest 发生直接兼容冲突：

`openspec/delivery-groups/20260810-01-change-execution-loop.yaml` 当前 Q1/A1/B1/C1/D1/E1/F1/G1
Change items 全部没有 Change-level `architectureImpact`。022 同时又规定：

- “每个 Delivery Manifest Change item MUST 保存 architectureImpact”；
- “Missing/malformed required architectureImpact ... MUST fail closed”。

因此若 Apply 直接实现当前 spec，新 Reader 在当前正在执行 A1 的 Delivery 上就可能立即把现有
pre-A1 bootstrap Change corpus 判为 malformed / FactConflict。022 没有冻结：

- 当前 pre-A1 bootstrap Manifest 是否属于 bounded legacy seam；
- 若需要 backfill，值从哪个 authority/fact 获取；
- 是否允许仅对 A1 之后由新 write-side 创建的 Change 强制 required；
- checkout/resume 对旧 Change 的 read model 如何确定性表达缺失值。

Author/Apply 不能根据 Change 名称、goal、outputs 或 Delivery-level `architecture.impact=true`
自行猜测每个 Change 的 `architectureImpact=true/false`，也不能静默改写已经存在的 Q1/A1/... facts。

Required outcome：在 Proposal/Design/spec/tasks 中冻结一个 deterministic、fail-closed 且不伪造
Owner/architecture fact 的 bootstrap compatibility/migration contract。允许的方向可以是：
对可证明 pre-A1 bootstrap manifests 采用有界 legacy read shape、而 A1-created/new Changes 从此严格
required；或者使用已有正式 authority 明确 backfill。Reviewer 不指定唯一实现。但必须保证：

1. `Base + A1 Apply` 不会因为现有 Change 缺字段而 self-brick；
2. 新 createDelivery/createChange 从 A1 起仍必须 persist/recover architectureImpact；
3. 不允许默认猜 `true/false`；
4. 不重写已完成 Q1 的历史 authority；
5. compatibility 必须 bounded，不得让 future malformed current Change 静默通过。

## Full chain / other checks

从 016 回扫：

- 017 `A1-RE-001` dependency identity finding 已由 018 关闭；
- 019 Explore approval 继续有效；
- 020 冻结 `dependsOn=Change.id` 的方向仍成立；
- 021 `A1-RP-001` 已关闭；
- 021 `A1-RP-002` 主体已关闭，但上述 bootstrap seam 仍需收口；
- 016–021 historical Run artifacts 与上一 Reviewer package byte-identical；
- 022 只修改 Author-owned Proposal/Design/delta specs/Tasks，并新增 022 Run；
- 022 `inputRef` 精确绑定 021 result；
- 022 produced ResultRef fingerprints 全部 valid；
- `SHA256SUMS` 全部通过；
- payload text hygiene 通过；
- `Base + 022 cumulative candidate` 上 OpenSpec 1.7
  `validate delivery-change-creation-and-owner-input --strict` 实际通过；
- 未发现新的 dependency identity、Owner applicability、activation atomicity、Manifest preservation、
  CLI/API、OpenSpec seam、B1/C1/D1/F1/03 scope blocking conflict。

## Next boundary

剩余 blocker 是 Author 可通过 Proposal contract 修订关闭的问题，因此：

`revise-propose`
