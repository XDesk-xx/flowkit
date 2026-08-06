# Design: baseline-finalization-corrections

## Context

A1–D1 已全部完成完整 Change 生命周期并 Checkpoint。Delivery Final Audit 发现 7 个基线收口问题：3 个 TBD Purpose、2 个错误 CJK 字符、缺少 fullTestStatus、A1 历史例外未记录。

这些问题必须通过 corrective Change 处理，不得重新打开已 Checkpoint 的 Change，也不得直接塞入 Delivery Final Commit。

## Goals

- 替换 3 个 capability spec 的 TBD Purpose 为正式文本
- 修正 2 处错误 CJK 字符
- 补齐 Delivery fullTestStatus 投影
- 记录 A1 Bootstrap 历史例外
- 使 Delivery 进入 Full Test 就绪状态

## Non-Goals

- 不重新打开 A1–D1
- 不修改 Requirement/Scenario
- 不修改产品定位、Action Catalog、Review/Revise 语义
- 不新增 Runner、CLI、状态持久化实现
- 不新增 Adapter、Registry、Plugin、Evidence 或 Receipt 系统
- 不自动运行 Full Test
- 不自动批准 Delivery Finalize
- 不删除 ref/ 内容（由 owner 决定）
- 不补造 A1 历史 Run

## Decisions

### D1：Purpose 修正文本

三个 capability spec 的 Purpose 替换为：

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

Purpose 只说明 capability 的稳定用途。不新增 Requirement，不修改既有冻结语义。

### D2：CJK 字符修正

| 文件 | 行 | 错误 | 正确 | Unicode |
|---|---|---|---|---|
| docs/delivery-lifecycle.md | L74 | `兞` | `其` | U+515E → U+5176 |
| docs/verification-model.md | L127 | `奔` | `套` | U+5954 → U+5957 |

这些是错误的 CJK 字符，不是 U+FFFD replacement character。两个文件中 U+FFFD count 均为 0。验证必须检查精确字符串，不能只扫描 U+FFFD。

### D3：fullTestStatus 状态机

```text
E1 创建时              → not-ready
E1 Checkpoint 后        → awaiting-user-decision
owner 授权 Full Test 时 → authorized
Full Test passed 时     → passed
Full Test failed 时     → failed
```

`fullTestStatus` 是 Delivery 验证子状态，不是 Delivery 主状态。不创建第二份独立状态文件。

E1 Apply 阶段保持 `not-ready`。E1 Checkpoint 后由 Archive 动作转换为 `awaiting-user-decision`。

### D4：A1 历史例外记录位置

记录在 E1 的 verification.md 中，作为一致性确认的一部分。

记录内容：
```text
A1 是正式 Run 与 Review 操作模型冻结前的 Bootstrap 历史例外。
仓库保留真实 Git、OpenSpec 和既有 Run 历史，不追溯创建伪造 Run。
从 B1 起使用正式的 Explore、Review、Revise、Apply 和 Archive Run 模型。
```

不创建独立的历史例外文件，不创建 waiver。Delivery Finalize 摘要可引用该记录。

### D5：Delivery Manifest 作为 E1 受控输出

Delivery Manifest（`openspec/delivery-groups/20260805-01-product-baseline.yaml`）是 E1 的受控输出。它只承载：
- E1 state 投影（`planned → active → completed`）
- `fullTestStatus` 投影

不借此改写 Delivery 主状态，不扩张到第二套状态系统。

### D6：E1 生命周期

E1 按普通 required Change 执行完整生命周期：

```text
explore → review → revise → review → propose → review → revise → review →
apply → review → revise → review → archive → checkpoint
```

E1 Checkpoint 后，所有 required Changes（A1–E1）均为 completed，Delivery 进入 Full Test 就绪状态。

### D7：Full Test 和 Finalize 授权分离

```text
授权 Full Test ≠ 批准 Finalize
```

E1 Checkpoint 后 fullTestStatus 转为 `awaiting-user-decision`。owner 授权 Full Test 后执行 Full Test。Full Test passed 后仍需 owner 明确批准 Finalize。
