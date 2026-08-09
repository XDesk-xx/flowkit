# Action: revise-explore

- Run: `20260806-148-revise-explore`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q2 orchestration-authority-boundary-correction`
- Role: author
- Execution Context: detached
- GitHub Base: `6fe05c4cd28ebbdb6abf3640057a30bc01b1332d`
- Source Review: `20260806-147-review-explore`（changes-requested）

## 目标

仅修正 147 Reviewer 的两个 Blocking Findings：把人类可读内容默认简体中文规则、Reviewer mutation boundary 纳入 Q2 Explore 对 AGENTS 的正式 keep/clarify/remove 调查输入，同时明确 AGENTS 仅约束 Agent 行为，不拥有 Policy/OpenSpec/Owner authority。

## 允许工作

- 只修改当前 Q2 的 `explore.md`；
- 保留 146 Explore 已冻结的 thin orchestration authority 调查方向；
- 读取 exact Base、147 Reviewer 结果与冻结参考用于核对。

## 禁止工作

- 不修改 `AGENTS.md`、docs、canonical specs、production code 或 tests；
- 不进入 Proposal；
- 不修改 Reviewer-owned 147 artifacts；
- 不运行 Delivery Full Test；
- 不执行 Archive、Checkpoint、Commit 或 Push。
