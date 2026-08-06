# Explore — E1 baseline-finalization-corrections

> Delivery：`20260805-01-product-baseline`
>
> Change key：`E1`
>
> Change ID：`baseline-finalization-corrections`
>
> 探索目标：识别 Delivery Final Audit 中发现的基线收口问题，确认 corrective Change 的必要性，定义 E1 范围边界，为 Proposal 阶段准备关键问题。

---

## 1. 背景

A1–D1 已全部完成完整 Change 生命周期：

```text
explore → review → revise → review → propose → review → revise → review →
apply → review → revise → review → archive → checkpoint
```

四个 required Changes 均已：
- Review Approved
- Archive
- OpenSpec capability 同步
- Change state = completed
- Change Checkpoint Commit

当前最新正式 Git 边界为 D1 Change Checkpoint（`77c4c36`）。

但是 Delivery Final Audit 发现了若干基线收口问题，不得直接创建 Delivery Final Commit。

---

## 2. 已发现的基线问题（附验证证据）

### 2.1 三个 capability spec Purpose 仍为 TBD

OpenSpec 在 archive 时自动生成的占位 Purpose 尚未被替换为正式文本。

| Spec | 行 | 当前内容 |
|---|---|---|
| `openspec/specs/flowkit-core-model/spec.md` | L3-4 | `TBD - created by archiving change core-model. Update Purpose after archive.` |
| `openspec/specs/flowkit-integration-boundaries/spec.md` | L3-4 | `TBD - created by archiving change integration-boundaries. Update Purpose after archive.` |
| `openspec/specs/flowkit-bootstrap-and-roadmap/spec.md` | L3-4 | `TBD - created by archiving change bootstrap-and-roadmap. Update Purpose after archive.` |

`openspec/specs/flowkit-product-positioning/spec.md` 的 Purpose 已有正式文本，不需要修正。

### 2.2 两处正式文档文字损坏

| 文件 | 行 | 损坏文本 | 应修正为 |
|---|---|---|---|
| `docs/delivery-lifecycle.md` | L74 | `当前没有兞他 active Change` | `当前没有其他 active Change` |
| `docs/verification-model.md` | L127 | `不创建第二奔 current/state 文件` | `不创建第二套 current/state 文件` |

这些是错误的 CJK 字符（`兞` U+515E 应为 `其` U+5176，`奔` U+5954 应为 `套` U+5957），不是 U+FFFD replacement character。两个文件中 U+FFFD count 均为 0。后续验证必须检查这些精确字符串（`兞他`、`第二奔`），不能只扫描 U+FFFD。

### 2.3 Delivery Manifest 缺少 fullTestStatus

`openspec/delivery-groups/20260805-01-product-baseline.yaml` 的 delivery section 缺少 `fullTestStatus` 字段。

当前（E1 创建前已补充）：
```yaml
delivery:
  state: active
  fullTestStatus: not-ready
```

`fullTestStatus` 是 Delivery 验证子状态，不是 Delivery 主状态，也不得创建第二份独立状态文件。

### 2.4 A1 Bootstrap 历史例外未记录

A1 的部分工作发生在 B1/D1 正式 Run 模型冻结之前。仓库没有补造不存在的历史 Run，但也没有正式记录这一历史例外。

需要记录：
```text
A1 是正式 Run 与 Review 操作模型冻结前的 Bootstrap 历史例外。
仓库保留真实 Git、OpenSpec 和既有 Run 历史，不追溯创建伪造 Run。
从 B1 起使用正式的 Explore、Review、Revise、Apply 和 Archive Run 模型。
```

### 2.5 Delivery Full Test 尚未授权

Delivery 级 Full Test 尚未获得 owner 授权。Full Test 只能由 owner 明确授权，不得由 Apply、Review、Archive 或 Adapter 自动触发。

### 2.6 Delivery Finalize 尚未授权

Delivery 尚未获得 owner 的 Finalize 授权。Full Test 授权和 Finalize 授权是两个不同决定。

---

## 3. 为什么必须创建 corrective Change

### 3.1 冻结规则

A1–D1 已形成 Change Checkpoint。冻结规则要求：

```text
不得重新打开已 Checkpoint Change
```

因此不能将发现的问题重新归入 B1、C1 或 D1，也不能直接在 Delivery Final Commit 中顺手修改这些正式产物。

### 3.2 正确方式

创建新的 corrective Change：

```text
E1 baseline-finalization-corrections
```

E1 是当前 Delivery 中新的 required Change。它用于修正 Delivery Final Audit 中发现的已知问题，而不是改写 A1–D1 的历史。

正确关系：
```text
A1–D1 保持 completed
+
E1 处理基线收口问题
```

错误关系：
```text
重新打开 B1 / C1 / D1
```

或：
```text
把正式修正直接塞入 Delivery Final Commit
```

---

## 4. E1 范围定义

### 4.1 A. 修正三个 capability spec 的 Purpose

修改：
- `openspec/specs/flowkit-core-model/spec.md`
- `openspec/specs/flowkit-integration-boundaries/spec.md`
- `openspec/specs/flowkit-bootstrap-and-roadmap/spec.md`

替换 TBD 占位文本为正式 Purpose。Purpose 只说明 capability 的稳定用途，不新增 Requirement，也不修改既有冻结语义。

建议 Purpose 文本（来自 Finalization Reference）：

**flowkit-core-model**：
```text
定义 Flowkit 的 Delivery、Change、Action 和 Run 核心模型，以及生命周期、Review/Revise、Verification、Full Test、Checkpoint 和 Policy 的正式边界，为后续 Runner 实现提供确定性流程契约。
```

**flowkit-integration-boundaries**：
```text
定义 Flowkit 与 OpenSpec、Git、Reviewer、项目验证工具、Archify、CodeGraph、Skill 和 Adapter 之间的事实权威、逻辑输入输出和权力边界，确保外部系统不会成为第二流程编排器。
```

**flowkit-bootstrap-and-roadmap**：
```text
定义在 Runner 和 CLI 尚未实现时，如何手工执行同一套 Flowkit 规则，包括 Run 操作、续接上下文、Git 正式边界、owner 授权、Delivery Finalize 和后续 Runner 开发路线。
```

### 4.2 B. 修正正式文档中的文字损坏

修改：
- `docs/delivery-lifecycle.md` L74：`兞他` → `其他`
- `docs/verification-model.md` L127：`第二奔` → `第二套`

这些是文字修正，不改变生命周期或 Verification 设计。

### 4.3 C. 补齐 Delivery fullTestStatus 投影

`fullTestStatus: not-ready` 已在 E1 创建时加入 Manifest。Delivery Manifest（`openspec/delivery-groups/20260805-01-product-baseline.yaml`）是 E1 的受控输出，承载 `fullTestStatus` 与 E1 state 投影。

E1 Checkpoint 后转换为：
```yaml
fullTestStatus: awaiting-user-decision
```

### 4.4 D. 记录 Bootstrap 历史例外

在 E1 的 verification.md 或 Delivery Finalize 摘要中记录 A1 历史例外。

不补造不存在的历史 Run。不创建 waiver。不修改 A1 completed 状态。

### 4.5 E. 增加最小 delta to flowkit-bootstrap-and-roadmap

E1 为现有 `flowkit-bootstrap-and-roadmap` capability 增加一个最小 ADDED Requirement，冻结以下行为：

```text
Delivery Final Audit
→ 发现已 Checkpoint 产物问题
→ Policy 停在 owner 决策边界
→ owner 明确授权 corrective Change
→ corrective Change 完成 Checkpoint
→ 再进入 Full Test（仍需 owner 授权）
```

该行为不仅适用于本次三个 Purpose 和两个错别字，未来每个 Delivery Finalize 都可能遇到。

不创建新 capability。不把具体错别字分别建模为 Requirement。不扩张到 Runner 或 CLI 实现。

---

## 5. E1 不包含范围

E1 不得：

- 修改 A1–D1 的 archived Change 历史
- 重新打开任何 completed Change
- 修改 Flowkit 产品定位
- 修改 Action Catalog
- 修改 Review/Revise 语义
- 新增 Runner、CLI 或状态持久化实现
- 新增 Adapter、Registry、Plugin、Evidence 或 Receipt 系统
- 自动运行 Full Test
- 自动批准 Delivery Finalize
- 把 PR、GitHub、ChatGPT 或 Codex 变成正式产品依赖
- 补造 A1 历史 Run
- 删除 ref/ 内容（由 owner 决定）
- 扩张当前 Delivery 的产品目标

---

## 6. 关键问题（供 Proposal 阶段回答）

### Q1：E1 是否需要创建新的 capability spec？

不创建新 capability。但 E1 为现有 `flowkit-bootstrap-and-roadmap` capability 增加一个最小 ADDED Requirement，冻结 Delivery Final Audit → corrective Change → Full Test 的行为。该 delta 是真实的、可复用的长期规则，不是为了让校验通过而凑的 Requirement。

E1 修改现有 3 个 capability spec 的 Purpose 字段，不修改任何既有 Requirement/Scenario。唯一例外：owner 已授权的、位于 `flowkit-bootstrap-and-roadmap` 的一个 ADDED Requirement 及其 3 个 Scenario。所有其他 Requirement/Scenario 仍保持冻结。

### Q2：E1 的 Purpose 修正是否算修改冻结文档？

Purpose 字段是 OpenSpec 自动生成的占位文本，不是 A1–D1 的冻结内容。替换 TBD 占位为正式 Purpose 属于基线收口，不属于重新打开 Change。

但 E1 MUST NOT 修改任何既有 Requirement 和 Scenario —— 那些是冻结内容。唯一例外是 owner 已授权的、位于 `flowkit-bootstrap-and-roadmap` 的一个 ADDED Requirement 及其 3 个 Scenario；所有其他 Requirement/Scenario 仍保持冻结。

### Q3：fullTestStatus 的状态转换时机？

```text
E1 创建时              → not-ready
E1 Checkpoint 后        → awaiting-user-decision
owner 授权 Full Test 时 → authorized
Full Test passed 时     → passed
Full Test failed 时     → failed
```

### Q4：A1 历史例外记录在哪里？

建议记录在 E1 的 verification.md 中，作为一致性确认的一部分。Delivery Finalize 摘要可引用该记录。

不创建独立的历史例外文件，不创建 waiver。

### Q5：E1 的 verification 应包含哪些检查？

- OpenSpec strict validation（所有 specs）
- Purpose 占位扫描（确认无 TBD）
- 错误 CJK 字符检查（确认无 `兞他`、`第二奔`，检查精确字符串而非只扫描 U+FFFD）
- Manifest 检查（fullTestStatus 正确）
- git diff --check
- whitespace 扫描 + U+FFFD 扫描（两者独立执行）
- Full Test：not-run（Delivery 级，需要 owner 授权）

### Q6：E1 是否需要完整 Review？

是。E1 按普通 required Change 执行完整生命周期，包括 review-explore、review-propose、review-apply。

---

## 7. E1 生命周期

```text
explore
→ review-explore
→ propose
→ review-propose
→ owner Apply authorization
→ apply
→ Change Verification
→ review-apply
→ owner Archive authorization
→ archive
→ Change Checkpoint Commit
```

如果任一 Review 返回 `changes-requested`，则进入对应 Revision。

Run 编号继续使用当前 Delivery 的全局单调序列：`YYYYMMDD-NNN-action`。

不得提前固定后续所有编号；每次真正创建 Run 时使用下一个合法编号。

---

## 8. 与 Delivery Full Test 和 Finalize 的关系

### 8.1 E1 Checkpoint 后

```text
所有 required Changes completed
→ fullTestStatus = awaiting-user-decision
→ 等待 owner 授权 Full Test
```

E1 Checkpoint 后不得直接创建 Delivery Final Commit。

### 8.2 Full Test 和 Finalize 是两个不同决定

```text
授权 Full Test
≠
批准 Finalize
```

Full Test passed 后仍需 owner 明确批准 Finalize。

### 8.3 Full Test 属于 Delivery

```text
Change Verification 属于 Change
Delivery Full Test 属于 Delivery
```

A1–E1 各自的 Verification 通过，不等于 Delivery Full Test 已通过。

本 Delivery 是产品基线 Delivery，没有 Runner 生产代码。Full Test 是全量契约与基线一致性验证，覆盖 A1–E1 的最终结果。

---

## 9. 权威边界

E1 必须保持：

```text
OpenSpec      → Change 契约
正式 docs     → 产品和流程解释
Delivery YAML → Bootstrap Delivery 状态投影
Reviewer      → Findings 和 Verdict
验证工具      → 原始验证结果
Flowkit       → 流程状态和下一步判断
Git           → 文件版本和正式边界
```

E1 不创建第二套权威。

---

## 10. 风险

### 10.1 修改冻结文档的误解

E1 修改 3 个 capability spec 的 Purpose 和 2 个正式文档的文字损坏，可能被误解为重新打开 B1/C1/D1。

缓解：E1 Proposal 明确说明这些是基线收口修正，不是 Change 重新打开。Purpose 字段是 OpenSpec 自动生成的占位文本，不是冻结内容。错误 CJK 字符是字符替换问题，不是设计变更。

### 10.2 fullTestStatus 被误解为 Delivery 主状态

`fullTestStatus` 是 Delivery 验证子状态，不是 Delivery 主状态。

缓解：E1 Proposal 明确 `fullTestStatus` 的定义和转换规则，不创建第二份独立状态文件。

### 10.3 Reference 被误认为正式契约

`ref/` 目录下的文件是临时执行参考，不是产品契约或流程状态权威。

缓解：E1 Proposal 明确 Reference 的非权威边界。ref/ 内容的删除由 owner 决定，E1 不自动删除。
