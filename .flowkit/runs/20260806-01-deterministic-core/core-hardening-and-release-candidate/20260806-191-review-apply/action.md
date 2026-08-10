# Action: review-apply

- Run: `20260806-191-review-apply`
- Delivery: `20260806-01-deterministic-core`
- Change: `F1 core-hardening-and-release-candidate`
- Role: reviewer
- Execution Context: detached
- Base identity: `efc045b31d55bed65b3ba4ae5793d884fdd127e7`
- F1 Review Chain Root: `20260806-182-explore`
- Reviewed Run: `20260806-190-apply`
- Previous approved Review: `20260806-189-review-propose`

## 目标

沿 182 建立的 F1 审查链独立审查 190 Apply，确认 188/189 approved contract 已被忠实实现，真实复核 verification layering、Quality Guard、跨平台 launcher、内部 Core RC candidate 与 Change Verification，并判断当前 candidate 是否可以进入 Archive authorization boundary。

## 审查边界

- 只读审查 190 cumulative candidate；除本 Reviewer-owned 191 Run 外不修改 Author artifact、production code、tests、Manifest、OpenSpec 或 AGENTS；
- 检查 182–189 inherited lineage、190 transport/hash、189 inputRef、Owner Apply authorization provenance 与当前 materialized Reader/Policy；
- 真实复跑适用 Change Verification、full suite 与 OpenSpec；Delivery Full Test 不运行；
- Finding 只冻结问题、invariant、证据、影响、required outcome 与 acceptance，不替 Author指定唯一实现；
- 本轮 Blocking Findings 均为 author-actionable，因此 verdict=changes-requested 时下一 lifecycle boundary 为 `revise-apply`；
- 不授权 Archive、Checkpoint、Delivery Full Test 或 Delivery Finalize；
- 面向人的 Review 内容默认使用简体中文。
