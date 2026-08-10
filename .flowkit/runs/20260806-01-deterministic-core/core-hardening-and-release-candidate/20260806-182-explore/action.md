# Action: explore

- Run: `20260806-182-explore`
- Delivery: `20260806-01-deterministic-core`
- Change: `F1 core-hardening-and-release-candidate`
- Role: author
- Execution Context: detached
- Owner authorization: explicit（Owner 明确授权：即使当前 detached snapshot 因缺 `.git` 可能无法由本地 Policy 正常进入 F1，也允许进入 F1 Explore；同时要求把 E1 暴露的 Windows launcher 与 checkpoint whitespace 两条规则同步到 `AGENTS.md`）
- Base: `efc045b31d55bed65b3ba4ae5793d884fdd127e7`

## 目标

基于 E1 checkpoint 后的最新分支 snapshot 与 Owner 提供的 Deterministic Core 实现参考，调查 F1 的 Quality Guard、verification scripts、maintainability baseline、verification performance budget、Full Test Plan 与内部 Core RC 的最小正式边界。

同时记录当前真实工程基线：现有大文件/高复杂度 legacy debt、默认 test concurrency 的成本异常信号，以及 E1 canonical admission 暴露的 Windows `.cmd/.bat` launcher 和 EOF whitespace 经验。

## Owner 授权边界

本次授权只允许手工激活 F1、完成 Explore、同步两条 `AGENTS.md` 工程约束并做只读/低风险 baseline 测量。

不授权：

- 修改 Policy 来绕过 Checkpoint；
- 建立 checkpoint sidecar / Registry / Gate 平台；
- 创建 Proposal / Design / Tasks / delta specs；
- 修改 production code 或 tests；
- 冻结 Quality threshold 或 performance hard gate；
- 运行 Delivery Full Test Action；
- Archive / Checkpoint / Commit / Push；
- 发布 Core RC。

## 本次额外 Agent 规则同步

- Windows CLI/process integration test 必须处理真实 `.cmd/.bat` launcher 语义；
- Change Checkpoint 前必须执行 `git diff --check`，暂存后必须再执行 `git diff --cached --check`，并禁止 trailing whitespace / EOF 多余空白行。
