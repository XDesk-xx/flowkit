# Action: propose

- Run: `20260812-064-propose`
- Delivery: `20260810-01-change-execution-loop`
- Change: `C1 openspec-1-7-thin-integration`
- Role: `author`
- semanticInputFingerprint: `d30923f09b8d5d715252252d138a0e38f2da8c65ff23a33e57d92880ef3e66a8`

## Prepared boundary

- goalClass: `freeze-change-contract`
- mutationClass: `proposal-bundle-only`
- outputClass: `current-proposal-bundle-set`

## Owner Contract Reset generation

本 Run 是 Owner 明确终止旧 062 Apply generation 后重新形成的 `propose` generation，不是 `revise-apply`。

- 不重新 Explore；normal formal handoff继续绑定 051 approved review-explore。
- 061 已批准且未被 reset 的 Proposal decisions继续保留。
- 063 的 C1-RA-001/003/004/005 与 C1-RA-002 技术 evidence被吸收为新 acceptance 输入。
- C1-RA-002 的旧 `<1.8.0` / `1.8.0 → reject` required outcome 被 Owner 新 compatibility authority覆盖。
- 本 Run 只允许 Proposal / Design / Specs / Tasks contract；不得写 production/test code、不得 Apply、不得 Full Test、不得 checkpoint。
