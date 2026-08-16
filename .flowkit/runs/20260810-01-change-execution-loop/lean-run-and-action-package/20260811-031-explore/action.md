# Action: explore

- Run: `20260811-031-explore`
- Delivery: `20260810-01-change-execution-loop`
- Change: `B1 lean-run-and-action-package`
- Role: author
- Execution Context: detached
- Owner authorization: explicit（Owner 当前明确授权 B1 activation / 开始 Explore，并授权将 Windows CRLF Manifest writer compatibility 作为 B1 的 bounded compatibility 子问题纳入调查）
- GitHub Base: `da4eeb6a7e3787a44ea17fcff8b8ef08f9e05de1`

## 目标

调查 B1 为完成 Lean Run lifecycle、Action Package、Action Result admission 与 ResultRef validation 还需要补齐的真实 canonical gap，并验证现有 Core 已有能力哪些可直接继承、哪些必须在 B1 实现。

额外纳入一个 Owner 明确扩充的 bounded compatibility gap：Windows checkout / ZIP 工作树可能把 Delivery Manifest 转为 CRLF，A1 Manifest writer 当前拒绝该输入，导致合法 B1 activation 失败。B1 只调查并冻结最小兼容 required outcome，不重做 A1 creation/Owner provenance/activation architecture。

## Allowed work

- 读取 exact Base 的 canonical docs/specs/src/tests 与 formal facts；
- 调查 Run create/complete、Run ID、same-Run continuation、Action Package、Action Result、ResultRef、resume/entry validation 的真实实现边界；
- 调查 CRLF writer compatibility 的最小影响面；
- 创建 B1 `explore.md`；
- 创建并完成本 031 Explore Run；
- 运行只读/非语义调查验证。

## Prohibited work

- 不创建 Proposal / Design / Tasks / delta specs；
- 不修改 production code/tests/canonical specs/docs；
- 不实现 C1 OpenSpec 1.7 thin integration；
- 不实现 D1 typed Finding convergence；
- 不实现 E1 actualChangeSet / verificationScope；
- 不实现 F1 checkpoint boundary；
- 不实现 G1 complete Change CLI；
- 不实现 03 scope；
- 不运行 Delivery Full Test；
- 不 Archive / Checkpoint / Commit / Push。
