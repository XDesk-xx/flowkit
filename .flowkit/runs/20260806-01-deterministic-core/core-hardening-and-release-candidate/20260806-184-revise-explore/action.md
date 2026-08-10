# Action: revise-explore

- Run: `20260806-184-revise-explore`
- Delivery: `20260806-01-deterministic-core`
- Change: `F1 core-hardening-and-release-candidate`
- Role: author
- Execution Context: detached
- Base identity: `efc045b31d55bed65b3ba4ae5793d884fdd127e7`
- Source Review: `20260806-183-review-explore`

## 目标

按 183 Reviewer 的两个 author-actionable Blocking Findings 最小修订 F1 Explore：

1. 修正 scope reconciliation 的 authority boundary：Proposal 只能细化当前 Manifest 已授权 scope；实质修改 Manifest goal / outputs 或 Delivery scope 必须停在 `owner-decision-required`。
2. 修正 Core RC lifecycle：F1 在自身完成/checkpoint 前形成 Core RC candidate；Delivery Full Test 在 F1 checkpoint 后只对既有 candidate 做 Delivery-level qualification / acceptance，不负责产生 F1 required output。

## 边界

- 只修改 `openspec/changes/core-hardening-and-release-candidate/explore.md` 中与 F1-RE-001 / F1-RE-002 直接相关的 authority / lifecycle contract；
- 保留 182 baseline 调查、Manifest activation 与 AGENTS 工程规则；
- 不创建 Proposal / Design / Tasks / delta specs；
- 不修改 production code、tests 或 Manifest goal / outputs；
- 不运行 Delivery Full Test，不 Archive / Checkpoint / Commit / Push。
