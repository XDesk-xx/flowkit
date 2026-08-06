# Tasks: baseline-finalization-corrections

## 1. 修正三个 capability spec 的 Purpose

- [x]1.1 替换 `openspec/specs/flowkit-core-model/spec.md` L3-4 的 TBD Purpose 为正式文本
- [x]1.2 替换 `openspec/specs/flowkit-integration-boundaries/spec.md` L3-4 的 TBD Purpose 为正式文本
- [x]1.3 替换 `openspec/specs/flowkit-bootstrap-and-roadmap/spec.md` L3-4 的 TBD Purpose 为正式文本
- [x]1.4 确认 `openspec/specs/flowkit-product-positioning/spec.md` 的 Purpose 已有正式文本（不需修改）

## 2. 修正两处错误 CJK 字符

- [x]2.1 修正 `docs/delivery-lifecycle.md` L74：`兞他` → `其他`
- [x]2.2 修正 `docs/verification-model.md` L127：`第二奔` → `第二套`

## 3. Manifest 验证

- [x]3.1 确认 `openspec/delivery-groups/20260805-01-product-baseline.yaml` 中 E1 state 为 `active`
- [x]3.2 确认 `fullTestStatus: not-ready` 已在 delivery section 中
- [x]3.3 确认 E1 outputs 包含 Delivery Manifest 文件本身

## 4. 记录 Bootstrap 历史例外

- [x]4.1 在 verification.md 中记录 A1 历史例外（正式 Run 模型冻结前、不补造 Run、从 B1 起正式模型）

## 5. 创建最小 delta spec

- [x]5.1 创建 `openspec/changes/baseline-finalization-corrections/specs/flowkit-bootstrap-and-roadmap/spec.md`
- [x]5.2 定义 Delivery Final Audit corrective Change 路径 Requirement（含 3 个 Scenario：发现问题停owner边界、owner授权后创建、Checkpoint后进Full Test）
- [x]5.3 `npx openspec validate baseline-finalization-corrections --strict`（E1 change 通过）

## 6. 创建 verification.md

- [x]6.1 创建 `openspec/changes/baseline-finalization-corrections/verification.md`
- [x]6.2 记录适用检查项和不运行 Full Test 的理由
- [x]6.3 记录 A1–D1 一致性确认
- [x]6.4 记录不修改冻结文档的确认

## 7. 执行验证检查

- [x]7.1 `npx openspec validate --specs --strict`（所有 specs 通过）
- [x]7.2 `npx openspec validate baseline-finalization-corrections --strict`（E1 change 通过）
- [x]7.3 Purpose 占位扫描（确认无 TBD）
- [x]7.4 错误 CJK 字符检查（确认无 `兞他`、`第二奔`，检查精确字符串）
- [x]7.5 U+FFFD 扫描（所有修改文件）
- [x]7.6 whitespace 扫描（所有修改文件）
- [x]7.7 `git diff --check`（exit 0）
- [x]7.8 Full Test：not-run（Delivery 级，需要 owner 授权）
