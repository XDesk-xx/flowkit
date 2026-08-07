# Action: revise-explore

- Run: `20260806-106-revise-explore`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q1 execution-model-correction`
- Role: author
- Source review: `20260806-105-review-explore`（verdict: changes-requested）

## Preflight（AGENTS.md 契约产物 revise preflight）

### 步骤 1：完整阅读

**Q1-RE-001 requiredResolution**：Core-owned derivation 必须覆盖 EVERY allowed ResultRef category。Callers provide typed target descriptors, never versionFingerprint。Core resolves, computes, constructs, verifies all referenced targets before terminal publication。Tests: each ResultRef category derivation success, missing target, replacement/mismatch, pending preservation。

**Q1-RE-003 requiredResolution**：选择 non-self-referential 设计。Option A — 在 terminal review result 中直接添加 closed typed reviewer-findings/verdict payload，后续非 review consumer 引用该 completed result。Option B — 在 result.json 之前创建独立的 reviewer-owned findings artifact 并引用。不得要求 review Run 引用自己的 result.json。allowlist 必须显式命名 formal reviewer-findings field。

**ref/01 section 6.5 全文**："生产路径禁止 Agent 手写 versionFingerprint"——UNIVERSAL，覆盖所有 ResultRef 类别，不只 inputRef。

**ref/01 section 2.1 全文**："不得让 Run 复制并重新拥有 Reviewer 或 Verification 的事实。" Run 拥有"执行上下文与最小结果引用"；Reviewer Findings/Verdict 由 Reviewer 正式结果拥有。

### 步骤 2：枚举实例 — ALL ResultRef categories

| ResultRef 类别 | 当前状态 | 目标文件 | Core 派生方式 | 自引用？ |
|---|---|---|---|---|
| context.inputRef | 已 Core-derived ✓ | consumed Run result.json | Core 读取 → SHA-256 → 构造 | 否（不同文件） |
| actionResult.consumedInputRefs | caller-provided ✗ | consumed Runs result.json | Core 读取每个 → SHA-256 → 构造 | 否（不同 Run） |
| actionResult.producedResultRefs | caller-provided ✗ | Run 产出的 artifact 文件（≠ result.json，后者是 runRef） | Core 读取每个 → SHA-256 → 构造 | 否（artifact ≠ result.json） |
| actionResult.verificationSummaryRef | caller-provided ✗ | verification.md | Core 读取 → SHA-256 → 构造 | 否（不同文件） |
| actionResult.reviewVerdictRef | caller-provided ✗ + 自引用 ✗ | review Run result.json | Core 读取 → SHA-256 → 构造 | review-* Run 自引用；非 review Run 不自引用 |

**自引用修复**：review-* Run 不携带 reviewVerdictRef（它 IS 被引用目标）。review-* Run 直接携带 reviewVerdict + reviewFindings（typed formal payload）。非 review Run 携带 reviewVerdictRef 指向 review Run result.json（Core-derived，不同 Run，不自引用）。

### 步骤 3：可实现性验证 — hash 计算流程

```
context.inputRef (context.json):
  Core at createRun → 读取 consumed result.json → SHA-256 → 构造 ResultRef → 写入 context.json
  自引用？否（context.json ≠ consumed result.json）✓

actionResult.consumedInputRefs (result.json):
  Core at writeRunResult → 读取每个 consumed result.json → SHA-256 → 构造 ResultRef → 写入 result.json
  自引用？否（this result.json ≠ consumed result.json）✓

actionResult.producedResultRefs (result.json):
  Core at writeRunResult → 读取每个 artifact 文件 → SHA-256 → 构造 ResultRef → 写入 result.json
  自引用？否（artifact ≠ result.json；result.json 自身由 runRef 在读取时派生，已 omit）✓

actionResult.verificationSummaryRef (result.json):
  Core at writeRunResult → 读取 verification.md → SHA-256 → 构造 ResultRef → 写入 result.json
  自引用？否（verification.md ≠ result.json）✓

actionResult.reviewVerdictRef (result.json, NON-review Run only):
  Core at writeRunResult → 读取 review Run result.json → SHA-256 → 构造 ResultRef → 写入 result.json
  自引用？否（this result.json ≠ review result.json）✓

reviewVerdict + reviewFindings (review-* Run result.json):
  typed formal fields, NOT ResultRefs → 无 hash 计算 → 无自引用 ✓

runRef (derived on read, NOT serialized):
  已由 C1 处理：omit from ActionResultWithoutRunRef, derive from file content SHA-256 ✓
```

**结论**：无循环依赖，无自引用。全部可实现。

### 步骤 4：全局一致性 — 需更新的位置

| 位置 | 当前问题 | 修复 |
|---|---|---|
| Section 3.2 标题 + 结论 | 只提 inputRef | → 所有 ResultRef 类别 |
| Section 3.3 结论 | 只提 inputRef | → 所有 ResultRef 类别 |
| Section 4.1 allowlist | "Core 验证 ResultRef 结构" + reviewVerdictRef 自引用 + 缺 reviewFindings | → Core 派生 + review-* Run 不带 reviewVerdictRef + 添加 reviewFindings |
| Section 4.1 ResultRef target 定义 | 只有 reviewVerdictRef + verificationSummaryRef | → 扩展到全部 5 类 |
| Section 4.2 | 只讲 inputRef 派生 | → 全部 ResultRef 类别派生 |
| Section 4.3 | 只 preflight inputRef | → preflight 全部 ResultRef |
| Section 5 表 | 只提 inputRef 派生 | → 全部 ResultRef 派生 + reviewFindings formal schema |
| Section 7 验收 | 只提 inputRef | → 全部 ResultRef + reviewFindings + reviewVerdictRef 不自引用 |
| Section 8 交叉引用 | inputRef fingerprint 行 + Lean Run 行 | → 全部 ResultRef fingerprint + reviewFindings + 不自引用 |

## 已 resolved（不修改）

- Q1-RE-002：resolved（103 确认）

## 约束

- 最小安全修复：只解决 Q1-RE-001 和 Q1-RE-003，不扩大 scope；
- 只修改 `openspec/changes/execution-model-correction/explore.md`；
- 不修改生产代码、测试、冻结文档或 terminal Runs；
- 不自审。
