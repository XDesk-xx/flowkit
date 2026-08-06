# Action

- Delivery: `20260805-01-product-baseline`
- Change key: `E1`
- Change ID: `baseline-finalization-corrections`
- Action: `revise-apply`
- Role: `author`

## Goal

处理 058-review-apply 的 blocking finding E1-RA-001：verification.md 的 U+FFFD 和 whitespace 扫描声称覆盖"所有修改文件"，但实际只列 7 份，遗漏了 E1 Change Markdown（delta spec、verification.md、Proposal bundle）。

## Source Finding

- Source Review Run: `20260806-058-review-apply`（verdict: changes-requested）
- Finding ID: `E1-RA-001`
- Required Resolution: 对明确、完整的 E1 正式文件范围重新执行 U+FFFD 与 whitespace 扫描，并在 verification.md 记录该范围、命令/方法和实际计数。范围至少覆盖所有 E1 Change Markdown（含 delta spec 与 verification.md）及所有实际修改的正式 outputs/Manifest；保留精确 CJK 检查只针对两份目标 docs，且不得运行 Full Test。

## Inputs

- Source Review Run: `20260806-058-review-apply`
- 057-apply 产出的 verification.md
- 058-review-apply 独立扫描结果（13 份文件，trailing 0、space-before-tab 0、U+FFFD 0）

## Allowed work

- 对 13 份 E1 正式文件重新执行 U+FFFD 和 whitespace 扫描
- 更新 verification.md 的 1.4（CJK 范围限定为 2 份目标 docs）、1.5（U+FFFD 范围扩展至 13 份）、1.6（whitespace 范围扩展至 13 份）
- 更新 verification.md 头部验证执行 Run 记录
- 记录 revise-apply Run
- 不修改 057-apply terminal Run

## Prohibited work

- 不修改 057-apply Run（terminal Run 不可变）
- 不修改任何既有 Requirement/Scenario
- 不重新打开 A1–D1
- 不运行 Full Test
- 不自动 Git Commit
- 不创建 review-apply Run

## Required output

- verification.md 的 U+FFFD 和 whitespace 扫描范围扩展至 13 份 E1 正式文件
- CJK 检查范围限定为 2 份目标 docs，并说明 E1 Change Markdown 保留字面量的预期行为
- 本 Run 的 result.json 记录修订状态和下一 Action 建议
- 下一 Action 为 `review-apply`
