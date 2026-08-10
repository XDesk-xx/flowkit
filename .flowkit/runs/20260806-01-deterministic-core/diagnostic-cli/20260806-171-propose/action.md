# Action: propose

- Run: `20260806-171-propose`
- Delivery: `20260806-01-deterministic-core`
- Change: `E1 diagnostic-cli`
- Role: author
- Execution Context: detached
- GitHub Base: `5fe8a0b096564052e41418e726962b5a35b9d423`
- Consumed Review: `20260806-170-review-explore`（approved）

## 目标

把 169 Explore 与 170 approved Review 收敛为可实施 E1 Proposal：在不扩大 Run/Policy/Git authority 的前提下，实现四个只读诊断命令，并补齐 current Explore/Verification artifact 与 Change Verification status 的最小 Reader projection。

## 约束

- 只生成 Proposal / Design / delta Specs / Tasks 与本 Author Run；
- 不修改 `explore.md`、production code、tests、Manifest、canonical specs 或 docs；
- 170 的 E1-RE-001 为 non-blocking，不创建 revise-explore；引用无 .git blocked 证据时必须标注其属于 pre-169 activation detached input；
- 不解决 Tasks completion projection，不实现 Change Execution Loop；
- 不建立 CLI/diagnostic registry、第二套 Verification state、historical Run replay 或 detached Git checkpoint fallback；
- 不运行 Delivery Full Test，不执行 Apply、Archive、Checkpoint、Commit 或 Push。

## 下一步

OpenSpec Proposal artifacts strict validation 通过后，交给独立 Reviewer 执行 `review-propose`。
