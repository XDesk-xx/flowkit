# Action: explore

- Run: `20260806-098-explore`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q1 execution-model-correction`
- Role: author
- Owner authorization: explicit（owner 指令激活 Q1 并执行 explore）

## 目标

调查 D1 开发过程暴露的执行模型问题，为 Q1 Propose 提供推荐答案：

1. Run 当前为何过重——哪些字段是 Core 正式契约，哪些是 Agent 自由文本；
2. ResultRef / fingerprint 哪些已可机器派生、哪些仍由 Agent 手写；
3. Run completion 是否需要 preflight，preflight 应校验什么；
4. 正式 artifact 路径与 `.tmp` 边界是否已正确，需冻结什么；
5. Verification 分层（focused / affected / full）当前缺失什么；
6. Bootstrap legacy Run 需要何种有界兼容。

## 约束

- 不修改生产代码、测试、冻结文档或已有 terminal Runs；
- 只产出 `openspec/changes/execution-model-correction/explore.md`；
- 不重新打开 A1–D1；
- 不重写 D1 Policy 业务规则。
