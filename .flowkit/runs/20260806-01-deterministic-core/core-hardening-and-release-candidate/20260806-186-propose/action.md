# Action: propose

- Run: `20260806-186-propose`
- Delivery: `20260806-01-deterministic-core`
- Change: `F1 core-hardening-and-release-candidate`
- Role: author
- Execution Context: detached
- Base identity: `efc045b31d55bed65b3ba4ae5793d884fdd127e7`
- Consumed Review: `20260806-185-review-explore`（approved）

## 目标

把 184 revised Explore 与 185 approved Review 收敛为可实施 F1 Proposal：在不扩大当前 Manifest goal/outputs 的前提下，冻结测试分层、固定 Full Test Plan、最小 Quality Guard/timing 支撑，以及在 F1 completion/checkpoint 前形成内部 Core RC candidate 的无环 lifecycle。

## 约束

- 只生成 Proposal / Design / delta Spec / Tasks 与本 Author Run；
- 不修改 `explore.md`、production code、tests、Manifest goal/outputs、canonical specs 或 docs；
- Quality/Performance 只作为现有 F1 outputs 的工程细化：hard guard 只固化已有 invariant，maintainability/timing 只 warning；
- 不建立 Test/Affected/Gate Registry、dependency DB、CodeGraph/Archify integration；
- Core RC 是内部 candidate declaration，不 publish npm、不 tag、不写 tracked current SHA；
- Delivery Full Test 仍要求所有 required Changes completed + checkpointed 后由 Owner 明确授权；
- 不执行 Apply、Delivery Full Test、Archive、Checkpoint、Commit 或 Push。

## 下一步

Proposal artifacts strict validation 通过后，交由独立 Reviewer 执行 `review-propose`。
