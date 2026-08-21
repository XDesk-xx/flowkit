## Context

J1 是 I1 checkpoint `2ee79244128b62ea9ddb0388afc1ea08e746e298` 后，由 authoritative Delivery Full Test failure 派生的 required corrective Change。I1 historical completion保持 immutable；J1 不重开 I1，也不重新设计 bounded Full Test executor。

128 Explore / 129 Review 已批准以下事实：

```text
Windows authoritative technical execution
→ bounded plan不再 120s overall timeout
→ legacy kind=command write/read/spawn 因 YAML double-unescape 失败

Linux detached authoritative Full Test
→ quality/typecheck/lint/build/openspec-all PASS
→ full 到真实 physical target 后失败
→ external-command negative fixture依赖 ambient PATH，ENOENT/EACCES premise不确定
```

同时 stable combined prototype 已在 exact-base candidate-shaped Linux detached 环境完成：

```text
focused regression: 61/61 PASS
ESLint: PASS
typecheck: PASS
full physical plan: 154 targets / terminal PASS / ~311s
```

该 disposable full-plan 不写 Delivery Full Test lifecycle facts，只证明 candidate physical consumer closure。

## Goals

- 关闭 legacy `kind: command` Windows YAML writer/read semantic defect，而不是针对一个 `C:\\nvm...` path做特判。
- 使 PowerShell absence regression完全由 test-owned execution premise决定，不放宽 production fallback安全边界。
- 让 bounded Full Test失败能在 technical/operator surface直接定位 logical/physical target和 transport root cause，同时保持 durable logical protocol authority不变。
- 在再次 archive/checkpoint 前，把 Linux downstream full physical plan 与 deterministic simulated-Windows legacy command evidence都前移到 J1 acceptance，避免形成 K1/L1；同时把真实 Windows OS semantics 明确排除在本 Change 的证明 claim 之外。

## Non-Goals

- 不修改 I1 bounded logical/physical resolver architecture、`120000ms` per-target timeout或 H1 `1 smoke + 26 phases`。
- 不把 `EACCES`、permission error 或任意 spawn failure当成 launcher absent。
- 不引入 YAML dependency、通用 serialization framework、process scheduler、dynamic timeout、telemetry/evidence platform。
- 不把 physical diagnostics写入新的 Full Test protocol schema、Manifest durable ledger或 Run sidecar。
- 不提前执行 authoritative Delivery Full Test、Actual/Compare、Finalize/Delivery Final。
- 不实现 04 的 Skill retrospective/engineering-health机制。

## Decisions

### 1. Double-quoted scalar使用 writer-compatible single semantic decode

当前 bounded Manifest writer 的 double-quoted values来自 `JSON.stringify(value)`。因此 reader对 double-quoted scalar MUST使用与 JSON quoted string兼容的一次 semantic decode：

```text
serialized quoted scalar bytes
→ one decode
→ final semantic string
```

禁止：

```text
replace(\\\" → \")
→ replace(\\\\ → \\)
→ replace(\\n → newline)
→ replace(\\t → tab)
```

因为前一 replacement生成的字符不能成为后一 replacement的新 escape input。

实现 MAY复用平台 JSON parser完成单个 quoted scalar decode，只要保持当前 supported YAML subset/fail-closed semantics且不引入新的 YAML runtime dependency。

必须证明：

```text
value
→ writer(JSON.stringify-compatible quoted scalar)
→ YAML reader
→ exact same value
```

至少覆盖：

```text
quote
backslash
literal \\n / \\t / \\r / \\uXXXX
actual newline/tab/carriage-return/backspace/formfeed
Unicode/control edge
Windows-shaped executable/path/args
```

并对现有 repository YAML做 semantic compatibility regression。

### 2. Legacy command acceptance使用 deterministic simulated-Windows evidence，并收窄 claim

Windows YAML double-unescape 的根因属于 host-independent serialization contract：只要 writer 写出 Windows-shaped backslash string，reader 的 chained decode 就可在任意 host 复现。`platform='win32'` simulation 与 injected runner/launcher seam 则可以证明 Flowkit 自己拥有的 branch/argv/transport semantics。

Owner Contract Reset `owner:c2788a597263cd6084295c4648d7d7af0fd49dad420214d4e41f83423857af8e` 已明确取消 real-Windows OS execution 作为 J1 blocker。因此 J1 Apply/Verification acceptance冻结为：在 final stable candidate bytes 上必须执行 deterministic Gate W：

```text
Windows-shaped executable/args
→ Manifest write
→ YAML read
→ exact semantic equality
→ platform='win32' branch
→ injected controlled runner/launcher seam
→ passed/failed protocol cases produce expected terminal behavior
```

Gate W MUST 完全控制 executable/launcher/PATH/env premise，不得依赖 ambient host state；decoded command/args 必须在进入 injected execution seam 时与 writer input exact equal。

该 Gate 证明：

```text
Flowkit serialization semantics
+ win32 decision/argv/launcher policy
+ legacy command protocol transport
```

但 MUST NOT 被描述为证明：

```text
real Windows filesystem semantics
real CreateProcess/Node spawn OS semantics
real PowerShell installation/lookup behavior
```

如果 Gate W FAIL：

```text
J1 MUST remain blocked
→ 不得进入 formal Change Verification
```

### 3. PowerShell fallback保持 ENOENT-only；测试拥有 absence premise

Production contract保持：

```text
pwsh missing with spawn ENOENT
→ try powershell

powershell missing with spawn ENOENT
→ POWERSHELL_NOT_FOUND

EACCES / other spawn error
→ terminal failure
→ MUST NOT fallback as if absent
```

J1 不修改 `src/shared/external-command.ts` 生产逻辑。

测试中需要精确“not found”时，MUST使用 test-owned absolute nonexistent executable path（parent/path由测试控制）或同等受控 PATH；不得使用 bare random executable name并依赖 ambient PATH恰好返回 ENOENT。

必须包含 hostile-PATH regression，证明 ambient unreadable/permission path不能改变 test预期。

### 4. Diagnostics从 transport保留到 operator display，但不进入 durable authority

`runBoundedCommands()` 已产生 point-in-time transport detail。`executeBoundedFullTest()` 的 diagnostic projection扩展为保留：

```text
logicalCheckId
physicalTargetId
outcome
durationMs
exitCode
stdout
stderr
spawnError
processTreeDiagnostics
```

其中字段保持既有 bounded output/process diagnostics限制；不得建立 unbounded raw-log persistence。

technical `verify:full`：

```text
terminal / execution-error
→ render failing/tail physical diagnostic
→ human-readable stderr/stdout/console surface
```

`flowkit delivery full-test`：

```text
bounded terminal failed / execution-error
→ operator-facing operation summary包含 failing logical/physical target + outcome/root diagnostic
```

但是 persisted Manifest仍只保存既有：

```text
FullTestProtocolPayload
logical checks[]
summary
resultRef
executionBlock (only existing outcome-unknown contract)
```

正常 `failed` result不得把 physical diagnostic写入新 durable field；operator display不是第二 Verification authority。

### 5. Full-plan dry proof只用于 candidate closure，不拥有 lifecycle authority

J1 修改 Full Test consumer/display与 shared serialization compatibility，因此 final stable Apply candidate必须运行：

```text
same frozen Full Test logical plan
→ same bounded resolver/executor
→ every physical target terminal
```

在 disposable environment中完整 PASS。

该 proof MUST：

- 使用 managed `FLOWKIT_HOME`；
- 使用真实 directory-form project dependencies，不通过 repository-internal symlink污染 entry-workspace premise；
- 不调用 authoritative `flowkit delivery full-test` write-side；
- 不写 `fullTestStatus/resultRef/Finding`；
- 不替代 formal Change Verification；Gate W 只证明 host-independent serialization + Flowkit win32 branch/transport semantics，不声称真实 Windows OS execution。

### 6. Verification closure与 failure policy

Proposal批准后，Apply所有 candidate/task mutation必须在 formal Change Verification前完成。

Apply 首先完成并冻结全部 candidate-owned bytes：

```text
YAML parser + persistence semantic round-trip
legacy command write/read/execute regression
PowerShell deterministic negative fixture + hostile PATH
bounded diagnostics projection
technical verify:full failure output
Delivery full-test operator summary + persisted-protocol non-mutation
focused/typecheck/lint/build/OpenSpec/hygiene
all required task checkboxes completed
tasks.md frozen as final task-status mutation
```

随后对**同一 exact frozen candidate identity**执行两个不回写 task checkbox的 Pre-Verification Evidence Gates：

```text
Gate W: deterministic simulated-Windows legacy command write/read/controlled-execute PASS
Gate F: complete disposable Full Test physical plan terminal PASS
```

只有 Gate W + Gate F 都 PASS，才进入 lifecycle authority：

```text
exact frozen candidate + gates PASS
→ formal Change Verification
→ verification.md / terminal binding
→ review-apply
```

若任一 gate FAIL/UNKNOWN 且需要修改 candidate，则必须重新 freeze candidate并重跑两个 gate；不得在 evidence PASS 后通过 task checkbox改变 exact candidate identity。formal Change Verification PASS、`verification.md` publication 与 `review-apply` verdict都不是 `tasks.md` checkbox authority。任何 acceptance失败都不得通过增加 timeout、删除 selected target、弱化 error code语义或伪造 durable result来关闭。

## Verification / Evidence Boundary

### Host-independent semantic evidence

可在 Linux/detached充分证明：

```text
YAML writer/read exact equality
repository YAML semantic compatibility
negative fixture ownership
operator formatting/protocol separation
full physical plan Linux closure
```

### Simulated-Windows evidence

必须在 exact frozen candidate 上确定性证明：

```text
legacy kind=command
→ Windows-shaped Manifest write
→ read
→ executable/args remain exact
→ platform='win32' branch
→ injected controlled execution seam
→ passed/failed protocol cases produce expected terminal behavior
```

该 evidence 满足本次 Owner-reset 后的 J1 acceptance，但其 Evidence Boundary 只到 Flowkit-owned serialization / branch / transport semantics；不得外推成真实 Windows OS process semantics。

## Migration Plan

1. 修 shared YAML double-quoted scalar decoder并增加 semantic round-trip matrix/repository compatibility regression。
2. 增加 legacy command Manifest write/read/execute regression；保持 writer与 Full Test contract shape不变。
3. 将 PowerShell missing-launcher fixture改为 test-owned deterministic absence，增加 hostile-PATH proof；不改 production fallback。
4. 扩 bounded diagnostics projection并连接 technical `verify:full` output。
5. 扩 authoritative Full Test operator-facing summary，同时断言 persisted logical protocol bytes/fields不变。
6. 在 candidate 上完成 focused/typecheck/lint/build/OpenSpec/hygiene与所有 required task checkbox；以 `tasks.md` 最后一次 task-status mutation结束 candidate freeze。
7. 在同一 exact frozen candidate 上执行 Gate W（deterministic simulated Windows）与 Gate F（完整 disposable Full Test physical plan）；gate result不回写 task checkbox。若需改 candidate，重新执行第 6–7 步。
8. Gate W + Gate F 都 PASS 后，对该 exact frozen candidate执行 formal Change Verification；Verification authority仅通过 `verification.md` / terminal binding表达。
9. review-apply approved + Owner archive authorization后 archive/checkpoint J1；之后等待 fresh Owner authorize Full Test。

## flowkitMutationScope

```json
{
  "schemaVersion": 1,
  "actions": {
    "apply": {
      "selectors": [
        { "kind": "exact", "path": "openspec/changes/delivery-full-test-cross-platform-compatibility-closure/tasks.md" },
        { "kind": "exact", "path": "openspec/changes/delivery-full-test-cross-platform-compatibility-closure/verification.md" },
        { "kind": "exact", "path": "scripts/verification.ts" },
        { "kind": "exact", "path": "src/facts/yaml-parser.ts" },
        { "kind": "exact", "path": "src/services/delivery-full-test-service.ts" },
        { "kind": "exact", "path": "src/verification/full-test/executor.ts" },
        { "kind": "exact", "path": "tests/integration/a1-delivery-readiness-and-full-test-behavior.test.ts" },
        { "kind": "exact", "path": "tests/unit/external-command.test.ts" },
        { "kind": "exact", "path": "tests/unit/facts/yaml-parser.test.ts" },
        { "kind": "exact", "path": "tests/unit/persistence/delivery-manifest-document.test.ts" },
        { "kind": "exact", "path": "tests/unit/services/delivery-full-test-service.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/full-test/executor.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/verification-plan.test.ts" }
      ]
    },
    "revise-apply": {
      "selectors": [
        { "kind": "exact", "path": "openspec/changes/delivery-full-test-cross-platform-compatibility-closure/tasks.md" },
        { "kind": "exact", "path": "openspec/changes/delivery-full-test-cross-platform-compatibility-closure/verification.md" },
        { "kind": "exact", "path": "scripts/verification.ts" },
        { "kind": "exact", "path": "src/facts/yaml-parser.ts" },
        { "kind": "exact", "path": "src/services/delivery-full-test-service.ts" },
        { "kind": "exact", "path": "src/verification/full-test/executor.ts" },
        { "kind": "exact", "path": "tests/integration/a1-delivery-readiness-and-full-test-behavior.test.ts" },
        { "kind": "exact", "path": "tests/unit/external-command.test.ts" },
        { "kind": "exact", "path": "tests/unit/facts/yaml-parser.test.ts" },
        { "kind": "exact", "path": "tests/unit/persistence/delivery-manifest-document.test.ts" },
        { "kind": "exact", "path": "tests/unit/services/delivery-full-test-service.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/full-test/executor.test.ts" },
        { "kind": "exact", "path": "tests/unit/verification/verification-plan.test.ts" }
      ]
    }
  }
}
```

## Risks / Trade-offs

- JSON-compatible decode必须保持 current supported YAML subset；如果 repository YAML compatibility出现 semantic diff，Apply必须 fail closed，而不是 silent migration。
- Operator summary包含 bounded stdout/stderr时必须继续受 existing output bounds约束，避免 diagnostics修复演变为 log persistence。
- simulated-Windows Gate 通过 controlled seam 提高可重复性，但它不覆盖真实 Windows filesystem/CreateProcess/PowerShell OS semantics；Proposal/Review/Verification summary 都必须保持这个 claim boundary。
- full-plan dry execution成本约 5 分钟，但仅对 J1 这种 Full Test/transport/persistence corrective Change使用，不推广成每个 Change mandatory步骤。
