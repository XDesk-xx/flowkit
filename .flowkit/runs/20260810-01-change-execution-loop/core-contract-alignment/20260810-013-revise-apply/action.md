# Action: revise-apply

- Run: `20260810-013-revise-apply`
- Delivery: `20260810-01-change-execution-loop`
- Change: `Q1 / core-contract-alignment`
- Action: `revise-apply`
- Role: `author`
- Execution Context: `detached`
- GitHub Base: `95bb875b12dc682882ded6b89b829b8b6c407d74`
- Review Chain: `001 → 002 → 003 → 004 → 005 → 006 → 007 → 008 → 009 → 010 → 011 → 012 → 013`
- Source Review: `20260810-012-review-apply` / `changes-requested`

## Revision scope

仅关闭 012 的两个 Author blockers：

1. `Q1-RA-001`：为 003/007/009 immutable pre-Q1 revise context 增加 exact identity + raw SHA-256 bounded Reader compatibility，不修改历史 bytes，并保持 current/new revise context strict。
2. `Q1-RA-002`：将 old finding `requiredChange → author` compatibility 收窄为 002/006/008 exact persisted identity + raw SHA-256；current malformed Review 必须 fail closed。

不重新打开 approved Proposal，不回退 diagnostic-cli 修订，不实现 A1/D1/03 scope，不运行 Delivery Full Test。
