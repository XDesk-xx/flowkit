# Action: archive

- Run: `20260806-196-archive`
- Delivery: `20260806-01-deterministic-core`
- Change: `F1 core-hardening-and-release-candidate`
- Role: author
- Execution Context: detached
- Base identity: `efc045b31d55bed65b3ba4ae5793d884fdd127e7`
- Source Review: `20260806-195-review-apply`（approved）
- Owner authorization: explicit（Owner 当前明确授权执行 F1 Archive）

## 目标

在 195 `review-apply` 已批准、Change Verification 已通过、Tasks completion 已满足且 Owner 明确授权 Archive 的前提下，执行 F1 `core-hardening-and-release-candidate` 的正式归档。

OpenSpec 负责 Change archive、artifact relocation 与 canonical spec sync；归档生成的文本 artifact 先执行最小 whitespace normalization 与 strict validation，全部通过后 Flowkit 才将自身 Delivery Manifest 中 F1 orchestration state 从 `active` 更新为 `completed` 并发布 terminal result。

## 约束

- 只执行 F1 Archive、生成文本的最小 whitespace normalization 与必要的 Flowkit orchestration state 收口；
- 不修改已批准的 production code、tests 或 Verification 语义；
- 不在 Archive 后重新解释或修改 Reviewer verdict；
- 不创建 Change Checkpoint，不 Commit / Push；
- 不运行 Delivery Full Test；
- 不执行 Delivery Finalize。
