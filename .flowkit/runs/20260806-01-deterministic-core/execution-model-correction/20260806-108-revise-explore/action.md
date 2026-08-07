# Action: revise-explore

- Run: `20260806-108-revise-explore`
- Source review: `20260806-107-review-explore`（verdict: changes-requested）

## Preflight（AGENTS.md 契约产物 revise preflight）

### 步骤 1：完整阅读

**Q1-RE-001 requiredResolution**：定义 generic Core-owned artifact ResultRef constructor（接受 normalized repo-relative path + content + validated kind），保留 buildRunResultRef 只作为 result.json 特化。指定 allowed kinds 和 path roots、descriptor-to-path resolution、traversal rejection、generic verification/read resolution。更新 all-category derivation 和 tests 覆盖 run-result + non-Run artifact。

**Q1-RE-003 requiredResolution**：每个 review-* Run 必须有 Core-derived review input descriptor，必须 resolve 到 context.reviewedRunId 的 result.json。持久化 inputRef，在 createRun 和 review-result publication 前验证 equality。Reader fail-closed 当 binding absent/mismatched/unreadable/replaced。reviewFindings payload 只在 reviewedResultRef binding 建立后添加。

**ref/01 section 6.5**：UNIVERSAL——所有 ResultRef versionFingerprint 机器生成。

### 步骤 2：枚举实例

ResultRef 类别 + 构造器映射：

| 类别 | target 文件 | 需要的构造器 | kind |
|---|---|---|---|
| context.inputRef | consumed Run result.json | buildRunResultRef（现有） | run-result |
| actionResult.consumedInputRefs | consumed Runs result.json | buildRunResultRef | run-result |
| actionResult.producedResultRefs | Run 产出 artifact（≠ result.json） | **buildArtifactResultRef（NEW）** | produced-artifact |
| actionResult.verificationSummaryRef | verification.md | **buildArtifactResultRef** | verification-summary |
| actionResult.reviewVerdictRef | review Run result.json（非 review Run） | buildRunResultRef | run-result |

review-* Run inputRef binding：
- 当前 C1：inputRef optional，不要求指向 reviewedRunId
- 需要改为：review-* Run inputRef REQUIRED，MUST resolve 到 reviewedRunId 的 result.json

### 步骤 3：可实现性验证（含代码层验证）

**(a) 读实际函数签名**：
- `buildRunResultRef(runPath, fileContent)` → 无条件追加 result.json，kind=run-result。**不能用于非 Run target** ✓（已读 result-ref-adapter.ts:44-54）
- `computeResultFileHash(fileContent)` → SHA-256 hex。**通用，可用于任何文件** ✓
- `verifyResultRef(ref, actualFileContent)` → 比较 versionFingerprint。**通用** ✓
- 需要 NEW：`buildArtifactResultRef(repoRelPath, fileContent, kind)` → 不追加 result.json，kind 由 caller 指定

**(b) 追踪完整数据流**：

review-* Run 完整流程：
```
createRun:
  caller 提供 reviewedRunId（C1 已 required）
  → Core resolve reviewedRunId → Run directory → result.json path
  → Core 读取 reviewed result.json
  → Core computeResultFileHash → SHA-256
  → Core buildRunResultRef → ResultRef(kind=run-result)
  → Core 写入 context.inputRef
  → reviewed result.json 缺失/不可读 → createRun 失败

writeRunResult preflight:
  → 重新读取 reviewedRunId 的 result.json
  → 重新计算 SHA-256
  → 与 context.inputRef.versionFingerprint 比较
  → mismatch → RESULT_REF_MISMATCH, Run 保持 pending
  → preflight 通过 → 发布 result.json（含 reviewVerdict + reviewFindings）

Reader:
  → review-* Run inputRef absent → FactConflict (fail closed)
  → inputRef.ref ≠ reviewedRunId's result.json path → FactConflict
  → reviewedRunId's result.json missing/unreadable → FactConflict
  → inputRef.versionFingerprint ≠ actual SHA-256 → FactConflict
```

非 review Run inputRef（optional）：
```
createRun:
  caller 提供 consumedRunId（optional for non-review）
  → Core resolve consumedRunId → result.json
  → Core 读取 → SHA-256 → buildRunResultRef → 写入 inputRef
  → consumed result.json 缺失 → createRun 失败
```

非 Run artifact ResultRef：
```
writeRunResult:
  caller 提供 artifactPath descriptor
  → Core normalize path（reject traversal: 不允许 .. 或绝对路径出 repo）
  → Core 读取 artifact 文件
  → Core computeResultFileHash → SHA-256
  → Core buildArtifactResultRef(normalizedPath, content, kind) → ResultRef
  → artifact 缺失/不可读 → writeRunResult 失败
```

**(c) 查 C1 当前字段约束**：
- `CreateRunInput.inputRef?: ResultRef` — optional, caller-provided（已读 run-persistence.ts:56）
- `CreateRunInput.reviewedRunId?: string` — optional, but required for review-* by validation（已读 serialization.ts:534）
- `buildContextFile` 直接透传 inputRef，不派生（已读 run-persistence.ts:374）
- 需要改为：CreateRunInput 不再接受 caller-supplied inputRef.versionFingerprint；review-* Run inputRef required + bound to reviewedRunId

**结论**：无循环依赖，无自引用。buildArtifactResultRef 是新函数，不与现有 buildRunResultRef 冲突。review-* inputRef binding 通过复用 buildRunResultRef（reviewed result.json IS a Run result）实现。全部可实现。

### 步骤 4：全局一致性 — 需更新位置

| 位置 | 修改 |
|---|---|
| Section 4.1 所有 ResultRef 类别 block | producedResultRefs/verificationSummaryRef 改用 buildArtifactResultRef；添加 allowed kinds + path roots + traversal rejection |
| Section 4.1 Reviewer formal artifact block | 添加 review-* inputRef required + bound to reviewedRunId；Reader fail-closed |
| Section 4.2 | 添加 buildArtifactResultRef；review-* inputRef binding |
| Section 4.3 | review-* preflight 含 inputRef vs reviewedRunId binding |
| Section 5 表 | result-ref-adapter 行加 buildArtifactResultRef；run-persistence 行加 review binding；tests 行加 artifact + review binding tests |
| Section 7 验收 | 加 buildArtifactResultRef + review-* inputRef binding |
| Section 8 交叉引用 | 更新 ALL ResultRef fingerprint 行 + 添加 review binding 行 |
