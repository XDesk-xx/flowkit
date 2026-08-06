# Proposal: baseline-finalization-corrections

## Why

Delivery Final Audit 在 A1–D1 全部 Checkpoint 后发现 7 个基线收口问题：

1. 三个 capability spec 的 Purpose 仍为 OpenSpec 自动生成的 TBD 占位文本
2. 两处正式文档包含错误的 CJK 字符（`兞` U+515E 应为 `其`，`奔` U+5954 应为 `套`）
3. Delivery Manifest 缺少 `fullTestStatus` 投影
4. A1 Bootstrap 历史例外未正式记录

这些问题不得直接塞入 Delivery Final Commit，也不得重新打开已 Checkpoint 的 A1–D1。创建 corrective Change E1 是唯一合法路径。

## What Changes

### A. 修正三个 capability spec 的 Purpose

替换 TBD 占位文本为正式 Purpose：

- `openspec/specs/flowkit-core-model/spec.md`
- `openspec/specs/flowkit-integration-boundaries/spec.md`
- `openspec/specs/flowkit-bootstrap-and-roadmap/spec.md`

Purpose 只说明 capability 的稳定用途，不新增 Requirement，不修改既有冻结语义。

### B. 修正两处错误 CJK 字符

- `docs/delivery-lifecycle.md` L74：`兞他` → `其他`
- `docs/verification-model.md` L127：`第二奔` → `第二套`

这些是字符替换，不改变生命周期或 Verification 设计。

### C. 补齐 Delivery fullTestStatus 投影

`fullTestStatus: not-ready` 已在 E1 创建时加入 Manifest。E1 Checkpoint 后转换为 `awaiting-user-decision`。

Delivery Manifest（`openspec/delivery-groups/20260805-01-product-baseline.yaml`）是 E1 的受控输出，承载 `fullTestStatus` 与 E1 state 投影。

### D. 记录 Bootstrap 历史例外

在 E1 的 verification.md 中记录 A1 历史例外。不补造不存在的历史 Run，不创建 waiver，不修改 A1 completed 状态。

### E. 增加最小 delta to flowkit-bootstrap-and-roadmap

为现有 `flowkit-bootstrap-and-roadmap` capability 增加一个最小 ADDED Requirement，冻结 Delivery Final Audit → corrective Change → Full Test 的行为。不创建新 capability。

## Capabilities

E1 不创建新 capability。E1 修改现有 capability spec 的 Purpose 字段、正式文档字符和 Delivery Manifest 投影。此外，E1 为现有 `flowkit-bootstrap-and-roadmap` capability 增加一个最小 ADDED Requirement，冻结 Delivery Final Audit corrective Change 路径。

## Impact

- **修改的正式产物**：3 个 capability spec（Purpose 字段）、2 个正式文档（字符修正）、1 个 Delivery Manifest（fullTestStatus 投影）、1 个 ADDED Requirement on flowkit-bootstrap-and-roadmap
- **不修改**：A1–D1 的 archived Change 历史、任何既有 Requirement/Scenario、产品定位、Action Catalog、Review/Revise 语义（唯一例外：owner 已授权的 flowkit-bootstrap-and-roadmap ADDED Requirement 及其 3 个 Scenario）
- **不引入**：Runner、CLI、状态持久化实现、Adapter、Registry、Plugin
- **风险**：低——全部是文本修正和状态投影，不涉及设计变更
