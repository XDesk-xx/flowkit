# Action: apply

- Run: `20260806-190-apply`
- Delivery: `20260806-01-deterministic-core`
- Change: `F1 core-hardening-and-release-candidate`
- Role: author
- Execution Context: detached
- Base identity: `efc045b31d55bed65b3ba4ae5793d884fdd127e7`
- Source Review: `20260806-189-review-propose`（`approved`，Blocking Findings = 0）
- Owner authorization: explicit（Owner 本轮明确授权进入 F1 Apply）

## 目标

按照 188 已批准 Proposal / Design / Spec / Tasks 实现 F1：落地 focused/affected/full verification tooling、最小 Quality Guard、warning-only maintainability/timing、固定 Full Test Plan 与内部 Core RC candidate，并完成 F1 Change Verification。

## 边界

- 只实现 188 contract 已冻结内容，不扩大 Manifest goal/outputs；
- 不建立 Test/Affected/Gate Registry、dependency DB、CodeGraph/Archify integration；
- Delivery Full Test 仍属于 F1 completed + checkpointed 后的 Owner-authorized Delivery Action；本 Apply 即使运行 `verify:full` 也只作为 F1 Change evidence；
- 不修改 D1 Policy / FullTestStatus / Owner authorization 语义；
- 不 Archive、Checkpoint、Commit 或 Push；
- 不访问 GitHub。
