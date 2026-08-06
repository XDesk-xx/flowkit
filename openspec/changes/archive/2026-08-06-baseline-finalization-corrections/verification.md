# Verification — E1 baseline-finalization-corrections

- Delivery：`20260805-01-product-baseline`
- Change key：`E1`
- Change ID：`baseline-finalization-corrections`
- Action：`apply`
- 日期：`2026-08-06`
- 验证执行 Run：`20260806-057-apply`（初版），`20260806-059-revise-apply`（修订 U+FFFD/whitespace 扫描范围至 13 份 E1 正式文件，精确 CJK 检查范围限定为 2 份目标 docs）

---

## 1. 适用检查项（实际执行结果）

### 1.1 OpenSpec 严格校验（所有 specs）

- **status**：passed
- **命令**：`npx openspec validate --specs --strict`
- **结果**：4 passed, 0 failed
  - ✓ spec/flowkit-bootstrap-and-roadmap
  - ✓ spec/flowkit-core-model
  - ✓ spec/flowkit-integration-boundaries
  - ✓ spec/flowkit-product-positioning

### 1.2 OpenSpec 严格校验（E1 Change）

- **status**：passed
- **命令**：`npx openspec validate baseline-finalization-corrections --strict`
- **结果**：Change 'baseline-finalization-corrections' is valid

### 1.3 Purpose 占位扫描

- **status**：passed
- **方法**：Python 逐文件扫描 `TBD - created by archiving`
- **文件范围**（7 份）：
  - `openspec/specs/flowkit-core-model/spec.md`
  - `openspec/specs/flowkit-integration-boundaries/spec.md`
  - `openspec/specs/flowkit-bootstrap-and-roadmap/spec.md`
  - `openspec/specs/flowkit-product-positioning/spec.md`
  - `docs/delivery-lifecycle.md`
  - `docs/verification-model.md`
  - `openspec/delivery-groups/20260805-01-product-baseline.yaml`
- **结果**：TBD placeholder count = 0

### 1.4 错误 CJK 字符检查（精确字符串）

- **status**：passed
- **方法**：Python 逐文件扫描精确字符串 `兞他`（U+515E + U+4ED6）和 `第二奔`（U+7B2C + U+4E8C + U+5954），不限于 U+FFFD
- **文件范围**（2 份目标 docs，即发生错误的产品输出）：
  - `docs/delivery-lifecycle.md`
  - `docs/verification-model.md`
- **结果**：Bad CJK string count = 0
- **说明**：`兞`（U+515E）应为 `其`（U+5176），`奔`（U+5954）应为 `套`（U+5957）。这些是错误的 CJK 字符，不是 U+FFFD replacement character。验证必须检查精确字符串，不能只扫描 U+FFFD。
- **范围说明**：E1 Change Markdown（explore.md、proposal.md、design.md、verification.md 等）中保留 `兞他`、`第二奔` 字面量作为修正说明文档，属预期行为，不视为产品输出错误，因此不纳入本检查范围。

### 1.5 U+FFFD 扫描

- **status**：passed
- **方法**：Python 逐文件字节扫描 `\xef\xbf\xbd`
- **文件范围**（13 份，覆盖所有 E1 正式文件）：
  - **正式 outputs / Manifest（7 份）**：
    - `openspec/specs/flowkit-core-model/spec.md`
    - `openspec/specs/flowkit-integration-boundaries/spec.md`
    - `openspec/specs/flowkit-bootstrap-and-roadmap/spec.md`
    - `openspec/specs/flowkit-product-positioning/spec.md`
    - `docs/delivery-lifecycle.md`
    - `docs/verification-model.md`
    - `openspec/delivery-groups/20260805-01-product-baseline.yaml`
  - **E1 Change Markdown（6 份）**：
    - `openspec/changes/baseline-finalization-corrections/explore.md`
    - `openspec/changes/baseline-finalization-corrections/proposal.md`
    - `openspec/changes/baseline-finalization-corrections/design.md`
    - `openspec/changes/baseline-finalization-corrections/tasks.md`
    - `openspec/changes/baseline-finalization-corrections/verification.md`
    - `openspec/changes/baseline-finalization-corrections/specs/flowkit-bootstrap-and-roadmap/spec.md`
- **结果**：U+FFFD count = 0

### 1.6 Whitespace 扫描（内容感知）

- **status**：passed
- **方法**：Python 逐文件扫描，trailing whitespace（`line != line.rstrip()` on non-blank lines）+ space-before-tab（`^ *\t`）
- **文件范围**：同 1.5（13 份，覆盖所有 E1 正式文件）
- **结果**：trailing = 0，space-before-tab = 0，total = 0

### 1.7 git diff --check

- **status**：passed
- **命令**：`git diff --check`
- **exit code**：0
- **覆盖范围**：已跟踪文件；CRLF 警告是 Windows 行尾提示，非错误
- **说明**：git diff --check 退出码为 0，表示无 whitespace 错误

---

## 2. 不运行的检查

### 2.1 Full Test

- **status**：not-run
- **原因**：Full Test 是 Delivery 级验证，需要 owner 明确授权，不由 Apply、Review、Archive 或 Adapter 自动触发。E1 Apply 阶段不运行 Full Test。Full Test 在 E1 Checkpoint 后、owner 授权时才运行，覆盖 A1–E1 的最终结果。

---

## 3. 一致性确认

### 3.1 与 A1 产品定位一致

- 正式层级 Delivery > Change > Action 保持不变
- 正式角色 owner / author / reviewer 保持不变
- 产品定位和非目标保持不变
- E1 不修改 `docs/product-positioning.md`

### 3.2 与 B1 核心模型一致

- Policy 仍是唯一权威
- Change 主流程 explore → review → propose → review → apply → review → archive → checkpoint 保持不变
- E1 修正 `docs/delivery-lifecycle.md` L74 的错误 CJK 字符（`兞他` → `其他`），不改变生命周期设计
- E1 修正 `docs/verification-model.md` L127 的错误 CJK 字符（`第二奔` → `第二套`），不改变 Verification 设计
- E1 不修改任何既有 Requirement/Scenario

### 3.3 与 C1 集成边界一致

- 集成边界保持不变
- E1 不修改 `docs/integration-boundaries.md`
- E1 不引入新的 Adapter、Registry、Plugin、Evidence 或 Receipt 系统

### 3.4 与 D1 Bootstrap 一致

- Bootstrap 规则保持不变
- E1 不修改 `docs/bootstrap-reference.md`、`docs/development-roadmap.md`、`AGENTS.md`、`.codex/skills/flowkit-git-workflow/SKILL.md`
- E1 为 `flowkit-bootstrap-and-roadmap` capability 增加一个最小 ADDED Requirement（owner 已授权的唯一例外），冻结 Delivery Final Audit → owner 授权 → corrective Change → Full Test 行为

### 3.5 不修改冻结文档的确认

E1 修改的正式产物仅限于基线收口范围：

| 修改类型 | 文件 | 修改内容 | 是否冻结内容 |
|---|---|---|---|
| Purpose 替换 | `openspec/specs/flowkit-core-model/spec.md` | TBD → 正式 Purpose | 否（OpenSpec 自动生成占位） |
| Purpose 替换 | `openspec/specs/flowkit-integration-boundaries/spec.md` | TBD → 正式 Purpose | 否（OpenSpec 自动生成占位） |
| Purpose 替换 | `openspec/specs/flowkit-bootstrap-and-roadmap/spec.md` | TBD → 正式 Purpose | 否（OpenSpec 自动生成占位） |
| 字符修正 | `docs/delivery-lifecycle.md` L74 | `兞他` → `其他` | 否（字符损坏修正） |
| 字符修正 | `docs/verification-model.md` L127 | `第二奔` → `第二套` | 否（字符损坏修正） |
| 状态投影 | `openspec/delivery-groups/20260805-01-product-baseline.yaml` | fullTestStatus 投影 | 否（Manifest 是 E1 受控输出） |

E1 不修改任何既有 Requirement/Scenario。唯一例外：owner 已授权的 `flowkit-bootstrap-and-roadmap` ADDED Requirement 及其 3 个 Scenario，该 delta 是真实的、可复用的长期规则，不是为了让校验通过而凑的。

E1 不重新打开 A1–D1 的 archived Change 历史。

---

## 4. A1 Bootstrap 历史例外

A1 是正式 Run 与 Review 操作模型冻结前的 Bootstrap 历史例外。

- 仓库保留真实 Git、OpenSpec 和既有 Run 历史，不追溯创建伪造 Run
- 从 B1 起使用正式的 Explore、Review、Revise、Apply 和 Archive Run 模型
- 不创建独立的历史例外文件，不创建 waiver
- Delivery Finalize 摘要可引用该记录

---

## 5. Delivery Manifest 投影确认

`openspec/delivery-groups/20260805-01-product-baseline.yaml`：

- `delivery.state`：`active`
- `delivery.fullTestStatus`：`not-ready`
- E1 `state`：`active`
- E1 `outputs` 包含 Delivery Manifest 文件本身

`fullTestStatus` 是 Delivery 验证子状态，不是 Delivery 主状态。E1 Checkpoint 后由 Archive 动作转换为 `awaiting-user-decision`。不创建第二份独立状态文件。

---

## 6. 最小 delta on flowkit-bootstrap-and-roadmap

E1 为现有 `flowkit-bootstrap-and-roadmap` capability 增加一个最小 ADDED Requirement：

- **Requirement**：Delivery Final Audit corrective Change 路径
- **Scenario 1**：发现已 Checkpoint 产物问题 → Policy 停在 owner 决策边界，MUST NOT 自动创建 corrective Change，MUST NOT 重新打开已 Checkpoint Change，MUST NOT 直接塞入 Delivery Final Commit
- **Scenario 2**：owner 明确授权 → Flowkit 创建 corrective Change，按普通生命周期完成 Checkpoint
- **Scenario 3**：corrective Change 完成 Checkpoint → fullTestStatus 转为 `awaiting-user-decision`，Full Test 仍需 owner 明确授权

该 Requirement 不是为了让校验通过而凑的，而是 E1 实际发现的一个尚未被完整冻结的长期行为。未来每个 Delivery Finalize 都可能遇到已 Checkpoint 产物问题，需要 corrective Change 路径。

---

## 7. Tasks 完成状态

- **tasks.md 总项数**：25
- **已完成 [x]**：25
- **未完成 [ ]**：0
