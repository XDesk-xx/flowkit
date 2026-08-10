# Action: revise-apply

- Run: `20260806-192-revise-apply`
- Delivery: `20260806-01-deterministic-core`
- Change: `F1 core-hardening-and-release-candidate`
- Role: author
- Execution Context: detached
- Base identity: `efc045b31d55bed65b3ba4ae5793d884fdd127e7`
- Source Review: `20260806-191-review-apply`

## 目标

关闭 191 的两个 author-actionable Blocking Findings：补齐 Quality Guard 对合法 TypeScript direct-import forms 的 filesystem boundary 检查，并让 public `verify:full` 的 final full step 在成功/失败路径都记录 terminal status 与 duration。

## 边界

- 只修改与 F1-RA-001 / F1-RA-002 直接相关的实现、测试与 verification；
- 不修改已批准 Proposal contract，不扩大 F1 scope；
- 不运行或授权 Delivery Full Test；
- 完成后停止在 `review-apply`，等待独立 Reviewer。
