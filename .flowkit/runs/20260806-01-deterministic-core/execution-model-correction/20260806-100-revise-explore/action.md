# Action: revise-explore

- Run: `20260806-100-revise-explore`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q1 execution-model-correction`
- Role: author
- Source review: `20260806-099-review-explore`（verdict: changes-requested）

## Blocking Findings to resolve

- **Q1-RE-001**：Section 4.2 推荐 option B（Agent 提供 versionFingerprint，Core 验证）违反 ref/01 section 6.5 的 Core-owned 生成要求。修正为 Core-derived 设计：Agent 只声明消费哪个 result/run，createRun 读取实际 result.json、计算 SHA-256、构造 ResultRef 自身。
- **Q1-RE-002**：Section 4.5 把 concrete npm scripts（test:focused / test:affected / test:full / verify:change）归入 Q1，但 ref/01 section 8.3 将其归入 F1。修正为 Q1 只冻结 timing / ownership / no-unauthorized-Full-Test 原则，concrete scripts 归 F1。

## 约束

- 最小安全修复：只解决 Q1-RE-001 和 Q1-RE-002，不扩大 scope；
- 只修改 `openspec/changes/execution-model-correction/explore.md`；
- 不修改生产代码、测试、冻结文档或 terminal Runs。
