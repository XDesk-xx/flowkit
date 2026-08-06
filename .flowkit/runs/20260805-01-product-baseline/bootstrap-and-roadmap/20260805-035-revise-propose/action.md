# Action

- Delivery: `20260805-01-product-baseline`
- Change key: `D1`
- Change ID: `bootstrap-and-roadmap`
- Action: `revise-propose`
- Role: `author`

## Goal

处理 `20260805-034-review-propose` 的 2 个 Blocking Findings，保留 D1 Proposal 的全部冻结结论和契约结构。

## Inputs

- Source Review Run: `20260805-034-review-propose`
- Verdict: `changes-requested`
- Blocking Findings: `D1-RP-001`, `D1-RP-002`

## Required changes

- **D1-RP-001**：采用单一规则——D1 仅在新建 `docs/bootstrap-reference.md` 中覆盖 Section 10 待定内容，移除对 `docs/delivery-lifecycle.md` 的直接修改许可
  - design.md Decision 13：移除"必要时添加引用"和"由 Apply 决定"的许可
  - spec.md：移除 MAY 修改 delivery-lifecycle.md 行，改为 MUST NOT
  - tasks.md Section 5：改为覆盖确认，不修改 B1 文档
- **D1-RP-002**：对四件套执行内容感知 whitespace 检查，记录文件范围、方法和结果

## Prohibited work

- 不修改 D1 的冻结结论、媒介中立、Git 边界模型
- 不重新打开或修改 A1、B1、C1
- 不创建正式输出文档（属于 Apply 阶段）
- 不运行 Full Test
- 不创建 review-propose Run
- 不自动 Git Commit
- 不覆盖 033 Run 的 terminal record

## Required output

- 四件套通过 openspec validate --strict、whitespace 检查、U+FFFD 扫描
- 本 Run 的 `result.json` 记录修正结果和验证证据
- 下一 Action 为 `review-propose`
