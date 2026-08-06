# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `A1`
- Change ID: `runtime-foundation`
- Action: `propose`
- Role: `author`

## Goal

基于 approved Explore 创建 A1 Proposal 四件套（proposal.md、design.md、specs/flowkit-runtime-foundation/spec.md、tasks.md）。Proposal 定义 A1 的 TypeScript 运行时骨架实现方案、spec deltas 和 apply 阶段任务。

## Source review

- Explore Review Run: `20260806-004-review-explore`
- Verdict: `approved`
- Blocking Findings: 0
- Non-Blocking Findings: 1（A1-RE-004，已核查为 reviewer 误读，无需修复）
- Review Result SHA-256: `fcc78e3a4010327396cfb84401042661810120bac802573b05e81791df985a9b`

## Allowed work

- 创建 `openspec/changes/runtime-foundation/proposal.md`
- 创建 `openspec/changes/runtime-foundation/design.md`
- 创建 `openspec/changes/runtime-foundation/specs/flowkit-runtime-foundation/spec.md`
- 创建 `openspec/changes/runtime-foundation/tasks.md`
- 创建本 propose Run

## Prohibited work

- 不修改 Delivery Manifest 或冻结 specs/docs
- 不修改 explore.md（已 approved）
- 不创建代码文件（属于 apply action）
- 不执行 Apply、Archive 或 Full Test
- 不提交或推送

## Required output

- Proposal 四件套
- 本 Run 的 `result.json`
- 下一 Action 为 `review-propose`
