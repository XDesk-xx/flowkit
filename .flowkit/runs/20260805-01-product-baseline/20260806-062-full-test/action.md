# Action

- Delivery: `20260805-01-product-baseline`
- Action: `full-test`
- Role: `author` (executing owner-authorized Full Test)

## Goal

执行 Delivery 级全量契约与基线一致性验证，覆盖 A1–E1 最终结果。验证所有 acceptance criteria 是否满足。

## owner authorization

- 授权类型：`full-test`
- 授权来源：owner 明确指令 "我现在授权进行 Full Test，请执行全量契约与基线一致性验证"
- 授权范围：20260805-01-product-baseline Delivery 的 Full Test

## Inputs

- Delivery Manifest: `openspec/delivery-groups/20260805-01-product-baseline.yaml`
- 全部 5 个 archived Changes (A1–E1)
- 全部 4 个 capability specs
- 全部 7 个正式 docs + AGENTS.md + SKILL.md
- Git 历史（Delivery Start + 5 Change Checkpoints）

## Allowed work

- 执行 OpenSpec strict validation
- 扫描全部 14 份正式文档（U+FFFD、whitespace、CJK、TBD）
- 验证 Manifest 一致性和 acceptance criteria
- 验证跨文档一致性
- 验证 Archive 完整性
- 验证 Git 正式边界
- 验证无第二套状态系统和无越界生产功能
- 更新 Manifest: fullTestStatus → passed/failed
- 记录 Full Test Run

## Prohibited work

- 不修改任何正式产物（只验证，不修改）
- 不创建 Delivery Final Commit
- 不自动 Git Commit
