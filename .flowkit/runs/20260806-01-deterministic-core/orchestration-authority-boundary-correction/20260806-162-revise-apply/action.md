# Action: revise-apply

- Run: `20260806-162-revise-apply`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q2 orchestration-authority-boundary-correction`
- Role: Author
- Source review: `20260806-161-review-apply`

## Goal

关闭 161 的唯一 Blocking Finding Q2-RA-001：撤回 Author 对 Owner lifecycle decision 已发生/已冻结的断言。Author candidate 不建立、认证或替代 Owner decision；若流程需要该 decision，必须由 Reviewer/Policy 从独立的 Owner 输入确认。

## Constraints

- 不新增 owner-decision 文件、schema、ResultRef 或第二套 authority。
- 不修改 production code/tests；161 明确该问题不是代码问题。
- 只修 Author-owned proposal/design/tasks/verification 与本 Run 说明中的越权表述。
- 不修改 Reviewer-owned artifacts。
- 不执行 Archive、Checkpoint、Full Test、Commit 或 Push。
