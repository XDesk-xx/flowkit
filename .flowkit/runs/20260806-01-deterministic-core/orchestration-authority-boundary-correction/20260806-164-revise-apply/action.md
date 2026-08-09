# Action: revise-apply

- Run: `20260806-164-revise-apply`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q2 orchestration-authority-boundary-correction`
- Role: Author
- Source review: `20260806-163-review-apply`

## Goal

关闭 163 的 Q2-RA-001，并回顾 146–163 的全部 Explore/Proposal/Review/Apply/Revision 证据做一次 authority 全面审计。修复必须以“简单但有效、One fact one authority、Author 不替 Owner/Reviewer/OpenSpec/Git/Verification 建立事实”为最高约束。

## Owner decision boundary

本 Run 和 repository artifacts 不建立、认证或替代 Owner decision。涉及 Archive/Checkpoint lifecycle 的 contract 是否具有 Owner authority，Reviewer 必须从本 package 之外的独立 Owner 输入确认；本 package 只实现经该外部输入允许的 candidate contract。

## Constraints

- 不新增 owner-decision persistence、schema、ResultRef 或第二套 authority。
- 不改写 146–163 历史 Runs，Reviewer-owned artifacts 保持 byte-for-byte。
- 可以修 production/tests/spec/docs，但仅限 146–163 全面审计确认的 Q2 authority/恢复问题。
- 不执行 Archive、Checkpoint、Delivery Full Test、Commit 或 Push。
