# Q1 Apply — core-contract-alignment

- Role: Author
- Execution Context: detached
- GitHub Base: `95bb875b12dc682882ded6b89b829b8b6c407d74`
- Change: `Q1 / core-contract-alignment`
- Action: `apply`
- Input Review: `20260810-010-review-propose` (`approved`)
- Owner Apply Authorization: explicit authorization in the current Owner message

## Goal

实现 009 Proposal 已冻结并经 010 Reviewer 批准的 Q1 最小 canonical contract alignment：

- Standard Formal Action / Run 收敛为 10 个 Change Action；
- typed blocking Finding 引入 `blockingAuthority` 并投影到 Policy facts；
- author-only blocker 才允许 `revise-*`；
- 任一 non-author blocker 禁止 Author revise、`next()` 保持 blocked，同时 explicit same-stage re-review 合法且不要求 Policy 机器证明 authority fact 已到位；
- Delivery Full Test / Finalize 从 Standard Action/Run 移除，并在 Q1→03 期间以 fail-closed `delivery-behavior-not-implemented` bridge 表达；
- 同步受影响 canonical docs/specs/AGENTS/tests。

## Scope guard

本 Action 不实现 A1 Owner provenance lifecycle、D1 Finding convergence、generic authority-resolution tracking、Verification resolution lifecycle、03 Delivery behavior executor、Archify、自动 Author/Reviewer loop 或 Git checkpoint mechanics。

历史 001–010 Run/Review bytes 必须保持不变。009/010 属 pre-Q1 transport generation，其 Proposal ResultRef shape 不通过新的 complete point-in-time writer contract；本 Apply 只 exact-bind immutable 010 `result.json`，不通过改写历史来满足新 validator。

只运行 Q1 focused/affected Change Verification；不得运行 Delivery Full Test / `verify:full` / `test:full`，不得 Commit/Checkpoint/Push。
