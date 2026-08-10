# Action: explore

- Run: `20260806-169-explore`
- Delivery: `20260806-01-deterministic-core`
- Change: `E1 diagnostic-cli`
- Role: author
- Execution Context: detached
- Owner authorization: explicit（Owner 明确授权：即使当前 detached snapshot 因缺 `.git` 不能由本地 Policy 正常进入 E1，也允许进入 E1 Explore）
- GitHub Base: `5fe8a0b096564052e41418e726962b5a35b9d423`

## 目标

基于 Q2 checkpoint 后的真实代码与 canonical contracts，调查 E1 `diagnostic-cli` 的最小实现边界，明确 `status / next / doctor / resume-context` 应复用哪些 Reader/Policy 事实、当前事实模型缺哪些只读诊断输入，以及如何避免 CLI/doctor 重新形成第二套 authority。

## Owner 授权边界

当前 uploaded snapshot 不含 `.git`，本地 Reader 无法恢复 Git Checkpoint facts；但 exact GitHub Base 的父提交已确认是 Q2 Change Checkpoint。Owner 明确授权本次手工激活 E1 并执行 Explore。

该授权只允许本次 Bootstrap/detached 进入 E1，不授权：

- 修改 Policy 来绕过 Checkpoint；
- 建立 checkpoint sidecar / GitHub cache；
- 运行 Delivery Full Test；
- 进入 propose/apply/archive；
- Commit / Push / Checkpoint。

## 允许工作

- Manifest `E1 planned → active`；
- 创建 `openspec/changes/diagnostic-cli/.openspec.yaml`；
- 创建 `openspec/changes/diagnostic-cli/explore.md`；
- 读取 src/tests/docs/specs 与 exact GitHub Base 信息；
- 执行只读/低成本检查以验证 Explore 证据。

## 禁止工作

- 不创建 Proposal / Design / Tasks / delta specs；
- 不修改 production code、tests、canonical specs 或 docs；
- 不修改 Q2 archived artifacts / historical terminal Runs；
- 不实现 CLI；
- 不运行 Delivery Full Test；
- 不执行 Archive / Checkpoint / Commit / Push。
