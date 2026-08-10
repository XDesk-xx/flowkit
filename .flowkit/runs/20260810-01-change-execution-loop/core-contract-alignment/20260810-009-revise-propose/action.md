# Action: revise-propose

- Run: `20260810-009-revise-propose`
- Delivery: `20260810-01-change-execution-loop`
- Change: `Q1 core-contract-alignment`
- Action: `revise-propose`
- Role: author
- Execution Context: detached
- Owner authorization: not required（本次按 Owner 冻结的 Q1 Policy contract 修订 008 唯一 Author-actionable blocker）
- GitHub Base: `95bb875b12dc682882ded6b89b829b8b6c407d74`
- Input Review Run: `20260810-008-review-propose`

## Owner frozen decision

Q1 strictly separates:

1. 当前 Action 是否合法；
2. 现在是否值得执行这个合法 Action。

Q1 Policy 只负责第 1 项。

对于 matching `changes-requested` Review：

- blocking authorities 全部为 `author` → `revise-S` 合法；
- 只要包含任一 `owner | verification | external` → `revise-S` 非法，`next()` 保持 non-author blocked boundary；
- 同时 explicit same-stage `review-S` MUST 在 Policy 层确定性合法；
- unchanged target MUST 可进入新的 Reviewer generation；
- Policy MUST NOT 以“non-author authority fact 是否已经到位”作为 `canRun(review-S)` machine prerequisite；
- 是否值得现在 re-review，由显式执行者在调用 Review 前负责确认；
- 每次 explicit re-review 创建新的 Reviewer execution / Review generation；
- Reviewer 使用执行时最新可用 authority facts 重新判断 Findings / Verdict；
- Policy 不自动调度或触发 re-review。

## 目标

只关闭 008 Reviewer 的唯一 blocking finding `Q1-RP-001`，并保持 007 已关闭的 `Q1-RP-002` 不回退。

具体修订：

- 将 Proposal / Design / Policy delta 中 `fact-arrival → MAY allowed` 的非确定 admission 改为 deterministic `MUST allowed`；
- 同步 Core Model delta 与 Tasks，消除残留的 “fact 到位后才可 re-review” / `MAY` 表达；
- 保持 `next()` fail-closed、Author revise 禁止、unchanged target 可 re-review、新 Reviewer generation、latest available authority facts；
- 不新增 generic authority-resolution event/ref、Owner provenance lifecycle、Verification resolution lifecycle、D1 Finding convergence 或 03 Delivery behavior executor；
- `flowkit-diagnostic-cli` delta 保持 007/008 已验证内容不变。

## Author mutation boundary

允许：

- 修改 Q1 `proposal.md`、`design.md`、`tasks.md`；
- 修改与 `Q1-RP-001` 直接相关的 `flowkit-policy-engine` / `flowkit-core-model` delta specs；
- 完成本 `009-revise-propose` Run；
- 运行 OpenSpec strict validation 与 Proposal artifact/text/package hygiene；
- 原样累计携带 001-008 terminal artifacts。

禁止：

- 修改 Reviewer-owned 002/004/006/008 Review artifacts；
- 回退或修改 007 已完成的 `flowkit-diagnostic-cli` delta；
- 修改 production code、tests、canonical docs/specs/AGENTS；
- Apply / Change Verification / Full Test / Archive / Checkpoint / Commit / Push；
- 实现 generic authority-resolution tracking 或任何自动 Reviewer loop。
