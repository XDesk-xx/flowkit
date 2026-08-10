# Action: revise-explore

- Run: `20260806-104-revise-explore`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q1 execution-model-correction`
- Role: author
- Source review: `20260806-103-review-explore`（verdict: changes-requested）

## Blocking Findings to resolve

- **Q1-RE-003**（沿用 ID）：bounded-envelope 设计不可执行——unvalidated 层无法拒绝禁止字段；formal authority 与 envelope 字段重复；Findings 留在 review Run 与 ref/01 禁止 Run 复制 Findings 矛盾；缺少 reviewer-owned artifact 定义。修正：改为单一 closed Core-validated allowlist（未知字段被 Core 拒绝），定义 reviewVerdictRef target（review Run result.json，reviewer-owned，terminal create-once）和 verificationSummaryRef target（verification.md），移除 blockedOn，closed schema 测试拒绝完整 findings/verification/archive/consistencyScan。

## 已 resolved（不修改）

- Q1-RE-001：resolved（103 确认）
- Q1-RE-002：resolved（103 确认）

## 约束

- 最小安全修复：只解决 Q1-RE-003，不扩大 scope；
- 只修改 `openspec/changes/execution-model-correction/explore.md`；
- 不修改生产代码、测试、冻结文档或 terminal Runs；
- 不自审。
