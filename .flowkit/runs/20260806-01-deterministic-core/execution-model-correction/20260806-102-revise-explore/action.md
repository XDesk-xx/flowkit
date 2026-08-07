# Action: revise-explore

- Run: `20260806-102-revise-explore`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q1 execution-model-correction`
- Role: author
- Source review: `20260806-101-review-explore`（verdict: changes-requested）

## Blocking Findings to resolve

- **Q1-RE-001**（沿用 ID）：Core-derived provenance 未贯穿全文。Section 3.2 仍说"派生或验证"，Section 5 表说"验证函数"，Section 7 验收说"验证"，Section 8 交叉引用说"createRun 验证"。修正：全部改为"派生（Core 构造 ResultRef）"，"验证"仅用于 writeRunResult preflight 的重新校验。
- **Q1-RE-003**（新）：Lean Run contract 仍允许 Run 承载完整 Findings/Verification 账本。Section 4.1 把 findings/verification/consistencyScan 放在无界 Agent notes 里。修正：改为 bounded envelope——Run 只存最小执行摘要 + result references，完整事实留在 owning artifact 用引用而非复制；consistencyScan 不作为 Run schema 字段。

## 约束

- 最小安全修复：只解决 Q1-RE-001 和 Q1-RE-003，不扩大 scope；
- 只修改 `openspec/changes/execution-model-correction/explore.md`；
- 不修改生产代码、测试、冻结文档或 terminal Runs；
- 不自审。
