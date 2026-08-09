# Action: apply

- Run: `20260806-175-apply`
- Delivery: `20260806-01-deterministic-core`
- Change: `E1 diagnostic-cli`
- Role: author
- Execution Context: detached
- GitHub Base identity: `5fe8a0b096564052e41418e726962b5a35b9d423`
- Source Review: `20260806-174-review-propose`（`approved`，Blocking Findings = 0）
- Owner authorization: explicit（Owner 本轮明确授权进入 E1 Apply）

## 目标

按照已批准的 173 Proposal / Design / Tasks 实现 E1 只读 diagnostic CLI，并完成适用的 Change Verification。

## 本次实现边界

- 实现 `status`、`next`、`doctor`、`resume-context` 四个只读命令；
- Reader 只增加 E1 必需的最小 OpenSpec / Verification projection；
- 只接通既有 Policy Verification gate，不重写 Policy decision tree；
- 使用一个共享 deterministic context loader，不建立 registry；
- 不实现 Tasks completion projection、自动修复、Archive、Checkpoint 或 Git fallback；
- 不修改 Delivery `fullTestStatus`；
- `npm test` 仅作为 affected Change Verification，不作为 Delivery Full Test；
- 本轮只使用 Owner 上传的 repository snapshot 与 cumulative candidate，不访问 GitHub；
- 不 Commit、不 Push。
