# A1 Apply — delivery-change-creation-and-owner-input

- Role: Author
- Execution Context: detached
- GitHub Base: `448fa042de86d07e893bcc51da528f93eb7ced3a`
- Change: `A1 / delivery-change-creation-and-owner-input`
- Action: `apply`
- Input Review: `20260810-025-review-propose` (`approved`)
- Owner Apply Authorization: explicit authorization in the current Owner message

## Goal

实现 024 Proposal 已冻结并经 025 Reviewer 批准的 A1 contract：

- Delivery / Change bounded creation；
- explicit Owner decision / authorization provenance 的 deterministic record 与 typed applicability；
- Change dependency canonical identity = Change.id；
- Change-level architectureImpact create/persist/read，配合 exact pre-A1 bounded legacy-missing compatibility；
- fresh Policy exact decision/target gate 后才允许 authorization-only Owner record；
- planned → active activation preflight、minimal OpenSpec metadata 与 two-step publish/retry；
- 四个 bounded write CLI，并保持 diagnostics read-only。

## Scope guard

本 Action 不实现 Decision DB/Registry/inbox/event ledger，不实现完整 OpenSpec adapter、B1 Run package、D1 Finding convergence、E1 verification selector、F1 archive/checkpoint executor、G1 complete Change CLI 或 03 Delivery behavior executor。

016–025 Run/Reviewer bytes 必须保持不变。只运行 A1 focused/affected Change Verification；不得运行 Delivery Full Test / `verify:full` / `test:full`，不得 Commit/Checkpoint/Push。
