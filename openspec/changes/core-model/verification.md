# B1 Change Verification

## 1. 基本信息

- Delivery：`20260805-01-product-baseline`
- Change：`core-model`
- Action：`apply`
- Apply Run：`20260805-011-apply`
- 输入 Head：`94b17299ebe1d05ed4fd3482e836cd72556061a3`
- 总体状态：`passed`
- Full Test：`not-run`

## 2. 验证计划

本验证计划在 Apply 开始时建立，覆盖：

1. OpenSpec strict validation；
2. Markdown/文档结构检查；
3. whitespace/diff 检查；
4. 三份正式文档与 approved Proposal、Design、Capability Spec 的一致性；
5. 与 A1 产品定位的一致性；
6. B1 范围边界；
7. Full Test 未运行。

## 3. 验证结果

| 检查 | 适用性 | 状态 | 结果 |
|---|---|---|---|
| `npx openspec validate core-model --strict` | applicable | passed | `010-review-propose` 已在 Proposal Head `6a664b0a...` 执行并通过；本次 Apply 未修改 `proposal.md` 或 capability spec，Design/Tasks 的 Markdown 变更已单独进行结构检查 |
| Markdown/文档结构 | applicable | passed | 所有 Markdown 文件 UTF-8 可读；代码围栏成对；无 tab；无行尾空白 |
| whitespace/diff 检查 | applicable | passed | 工作区差异未发现行尾空白或 whitespace diagnostics |
| B1 契约一致性 | applicable | passed | Delivery/Change 状态、Action Catalog、Review/Revision、Run 路径、Verification 和 Full Test 状态在三份正式文档中保持一致 |
| A1 产品定位一致性 | applicable | passed | 保持“Delivery 为编排核心、Change 为实施单元、Action 为执行步骤”的唯一产品定义；未建立第二事实权威 |
| Scope 检查 | applicable | passed | 未新增 Runner、CLI、生产代码、Schema、Adapter、Skill Registry、Plugin、Evidence 或 Receipt |
| JSON 有效性 | applicable | passed | `011-apply/context.json` 和 `result.json` 可解析 |
| Full Test | not-applicable | not-applicable | B1 Apply 未获得 Full Test 授权，未运行 Full Test |

## 4. Review-Propose Findings

### NB-001：验证计划建立时间

已处理：

- Apply 开始时优先建立本文件；
- 明确列出全部适用检查；
- 记录检查状态、方法和结果；
- `review-apply` 可以审查完整验证计划和结果。

### NB-002：Apply 前置门

已处理：

- `design.md` 实施计划明确要求 `review-propose` approved；
- 明确要求 owner 授权 Apply；
- 两个条件满足后才允许执行实施步骤。

## 5. 输出检查

已创建：

- `docs/core-model.md`
- `docs/delivery-lifecycle.md`
- `docs/verification-model.md`

已更新：

- `openspec/changes/core-model/design.md`
- `openspec/changes/core-model/tasks.md`

已记录：

- `openspec/changes/core-model/verification.md`
- `.flowkit/runs/20260805-01-product-baseline/core-model/20260805-011-apply/`

## 6. Full Test 边界

本次没有 owner 对 Delivery Full Test 的授权。

因此：

```text
fullTest: not-run
```

Apply、Change Verification 和后续 `review-apply` 均不得自动触发 Full Test。

## 7. 结论

B1 Apply 的文档输出、任务和适用 Change Verification 已完成。

当前建议下一 Action：

```text
review-apply
```

Reviewer Run 应在 reviewer 真正执行统一入口 `review` 时创建；author 不预建空的 `review-apply` Run。
