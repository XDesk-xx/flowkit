# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `B1`
- Change ID: `domain-and-state-schema`
- Action: `propose`
- Role: `author`

## Goal

依据 `20260806-028-review-explore` 的 `approved` Verdict 创建 B1 proposal 四件套。B1 冻结 Delivery/Change/Run 领域对象、主状态、固定 Action Catalog、Run ID 规则和 terminal immutability，为 C1/D1/E1 提供类型基底。新建 capability `flowkit-domain-and-state-schema`。

## Source review

- Review Run: `20260806-028-review-explore`
- Verdict: `approved`
- Blocking Findings: 0
- Non-Blocking Findings: 0
- Resolved Findings: 8（B1-RE-001~008）
- Reviewed Explore SHA-256: `1373670bc7d14315f26f2dda1433655c70f2d15d78d063d2e89e613ce08b844c`

## Allowed work

- 创建 `openspec/changes/domain-and-state-schema/` 下的 proposal 四件套（proposal.md、design.md、specs/flowkit-domain-and-state-schema/spec.md、tasks.md）
- 创建本 propose Run

## Prohibited work

- 不修改冻结 specs/docs
- 不修改 Delivery Manifest
- 不修改 A1 archived artifacts 或 terminal Runs
- 不修改 013-028 terminal Runs
- 不创建代码文件（apply 阶段创建）
- 不执行 Apply、Archive 或 Full Test
- 不提交或推送

## Required output

- proposal.md（Why/What Changes/Capabilities/Impact）
- design.md（Context/Goals/Non-Goals/D1-D10 决策 + 契约矩阵 + 状态冻结来源）
- specs/flowkit-domain-and-state-schema/spec.md（ADDED Requirements + Scenarios）
- tasks.md（8 section、44 项 apply 阶段任务）
- 本 Run 的 `result.json`
- 下一 Action 为 `review-propose`
