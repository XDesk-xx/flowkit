# B1 Change Verification

## 1. 基本信息

- Delivery：`20260805-01-product-baseline`
- Change：`core-model`
- Action：`revise-apply`
- Apply Run：`20260805-011-apply`
- Source Review Run：`20260805-012-review-apply`
- Revise Run：`20260805-013-revise-apply`
- 输入 Head：`f7008be68e9042ec3ab29534e377354c66a7f14c`
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
| `npx --package @fission-ai/openspec@1.7.0 openspec validate core-model --strict` | applicable | passed | `010-review-propose` 已在 Proposal Head `6a664b0a...` 执行并通过；本次 Apply 未修改 `proposal.md` 或 capability spec，Design/Tasks 的 Markdown 变更已单独进行结构检查 |
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

## 7. Review-Apply Findings 修订

### B-001：Full Test 失败 owner 决策边界

已处理：

- Full Test failed 时保持 `failed`；
- Policy 返回 owner 决策边界，不自动创建 Change；
- 只有 owner 授权后才创建 corrective Change；
- 创建后返回 `not-ready`，并执行完整普通 Change 生命周期；
- 不重新打开已 completed/archived Change；
- 不引入 failure waiver 或强制 Finalize。

### B-002：统一 review/revise 调度

已处理：

- 正式 Action 恢复为 `revise-apply`；
- `review-<stage> ↔ revise-<stage>` 保持对称；
- 新增非正式统一入口 `revise`；
- Policy 从唯一有效的 `changes-requested` Verdict 解析具体 Revision Action；
- `fix-review-findings` 下沉为 `revise-apply` goal；
- revise-apply 只处理当前 Findings，不扩张范围，重新验证后回到 review-apply；
- 不自动运行 Full Test。

### N-001：替换字符

已确认 `docs/core-model.md` 使用“不预建 `paused`”，且修订后全部 Markdown 文件不含 Unicode replacement character `U+FFFD`。

## 8. Revise-Apply 验证结果

| 检查 | 适用性 | 状态 | 结果 |
|---|---|---|---|
| OpenSpec strict validation | applicable | passed | 使用项目库离线包 `openspec-1.7.0-offline.zip` 解压后的官方 `@fission-ai/openspec` CLI v1.7.0 执行 `openspec validate core-model --strict --no-interactive`，输出 `Change 'core-model' is valid` |
| Markdown 结构与代码围栏 | applicable | passed | 修订文件 UTF-8 可读，代码围栏成对 |
| whitespace/diff | applicable | passed | `git diff --check` 通过 |
| JSON 有效性 | applicable | passed | 012 与 013 Run JSON 可解析 |
| Action Catalog 一致性 | applicable | passed | proposal/design/spec/三份正式文档统一使用 revise-apply；fix-review-findings 仅为 goal |
| Full Test owner 边界一致性 | applicable | passed | failed 后停在 owner 决策边界，未自动创建 Change |
| 替换字符检查 | applicable | passed | 修订范围内未发现 U+FFFD |
| Full Test | not-applicable | not-applicable | 未授权，未运行 |
| OpenSpec v1.7.0 源码等价 delta 检查 | supplemental | passed | 在正式 CLI 可用前执行的补充检查为 0 errors、0 warnings、0 info；正式 CLI 已通过，因此该结果仅保留为补充证据 |

## 9. 结论

B1 revise-apply 已处理 `012-review-apply` 的全部 Blocking 和 Non-blocking Findings。正式 OpenSpec CLI v1.7.0 strict validation、Markdown、JSON、diff、Action Catalog、owner 权威和范围检查均已通过。

Change Verification 状态：

```text
passed
```

Full Test 未获授权，保持 `not-run`。本 Run 可以标记为 completed，下一 Action 为 `review-apply`。Reviewer Run 仍应在 reviewer 真正执行统一入口 `review` 时创建；author 不预建空 Run。
