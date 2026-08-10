# Action: revise-apply

- Run: `20260810-028-revise-apply`
- Delivery: `20260810-01-change-execution-loop`
- Change: `A1 delivery-change-creation-and-owner-input`
- Action: `revise-apply`
- Role: author
- Execution Context: detached
- Owner authorization: not required（027 blocking finding is Author-actionable）
- GitHub Base: `448fa042de86d07e893bcc51da528f93eb7ced3a`
- Input Review Run: `20260810-027-review-apply`

## 目标

只修复 `A1-RA-001`：

- authorization-only Owner record 第一次成功写入后；
- 再提交完全相同 canonical tuple；
- MUST 返回同一 deterministic ref 与 `idempotent=true`；
- MUST NOT 追加第二条 record；
- 只有 record 不存在时才执行 fresh formal facts + current Policy exact decision/target gate；
- stale/early different tuple、target mismatch、same ref different decoded content 继续 fail closed。

## Author mutation boundary

允许：

- 修改 A1 write service / persistence 所需最小实现；
- 增加或修订对应 tests；
- 更新 A1 `verification.md` / tasks 的 Apply verification 记录；
- 完成本 `028-revise-apply` Run。

禁止：

- 修改 027 Reviewer-owned artifacts；
- 重新打开 Proposal / Design / delta specs；
- 扩展到 B1/C1/D1/E1/F1/G1/03；
- 运行 Delivery Full Test；
- Archive / Checkpoint / Commit / Push。
