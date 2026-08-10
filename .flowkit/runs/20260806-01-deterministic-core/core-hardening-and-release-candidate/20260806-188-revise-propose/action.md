# Action: revise-propose

- Run: `20260806-188-revise-propose`
- Delivery: `20260806-01-deterministic-core`
- Change: `F1 core-hardening-and-release-candidate`
- Role: author
- Execution Context: detached
- Base identity: `efc045b31d55bed65b3ba4ae5793d884fdd127e7`
- Source Review: `20260806-187-review-propose`（`changes-requested`）

## 目标

按 187 Reviewer 的 3 个 author-actionable Blocking Findings 修订 F1 Proposal artifacts，并保持与 184 Explore 一致：

1. 让 `shared` affected scope 保持 broad affected 但不再等于 full suite；
2. 新增 closed `verification` affected scope，为 F1 自己的 verification/quality tooling 提供确定 coverage path；
3. 统一 maintainability metrics 为 required warning-only Soft Guard，并冻结 deterministic metric definition。

## 边界

- 只修改 Proposal / Design / delta Spec / Tasks 与本 Author Run；
- 不修改 184 approved Explore、Manifest goal/outputs、production code、tests、canonical specs 或 docs；
- 不执行 Apply、Delivery Full Test、Archive、Checkpoint、Commit 或 Push。
