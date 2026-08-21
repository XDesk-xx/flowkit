## 1. YAML semantic round-trip closure

- [x] 1.1 将 double-quoted YAML scalar reader改为与 `JSON.stringify()` writer 对称的单次 semantic decode；禁止 chained replacement递归解释新生成的 backslash escape，并保持 unsupported/malformed YAML fail closed。
- [x] 1.2 增加 YAML scalar edge matrix与 repository YAML semantic compatibility regression，覆盖 quote/backslash、literal escape-shaped substrings、control escapes、Unicode和 Windows-shaped command/path/args。
- [x] 1.3 增加 Delivery Manifest writer → parser exact round-trip regression，证明 legacy `kind: command` executable/args的 Windows-shaped values byte-semantically恢复。

## 2. Legacy command simulated-Windows execution closure

- [x] 2.1 扩 A1 legacy command integration，使 Windows-shaped write → parse → `platform='win32'` controlled execute同时覆盖 passed protocol与 failed protocol；使用 injected runner/launcher seam，且进入 execution seam 的 decoded executable/args必须与 writer input exact equal，不依赖真实 Windows或 ambient PATH。

## 3. Deterministic PowerShell negative fixtures

- [x] 3.1 将 missing PowerShell launcher regression从 bare ambient-PATH fake names改为 test-owned absolute nonexistent paths（或等价 fully-controlled execution premise）。
- [x] 3.2 增加 hostile-PATH regression，证明 ambient unreadable/permission path不会把预期 absence从 `ENOENT`变成 fixture nondeterminism；production fallback仍只允许 `ENOENT`进入下一 launcher，`EACCES`保持 terminal。
- [x] 3.3 `tests/unit/external-command.test.ts`完整回归必须 PASS，且 production `src/shared/external-command.ts`不得为了测试通过而放宽 fallback语义。

## 4. Bounded diagnostics end-to-end propagation

- [x] 4.1 在 `executeBoundedFullTest()` diagnostics projection保留 transport已有 `spawnError` / `processTreeDiagnostics`，并保持 logical/physical id、typed outcome、duration、bounded stdout/stderr。
- [x] 4.2 technical `verify:full`失败时输出 terminal/failing physical target + outcome/root diagnostic；增加 user-facing failure-path regression，不只测试 formatter helper。
- [x] 4.3 `flowkit delivery full-test` bounded failure的 operator-facing summary包含同一 failing physical target/outcome；同时断言 Manifest persisted `FullTestProtocolPayload/resultRef/checks[]` schema与内容 authority不增加 physical diagnostic state。
- [x] 4.4 outcome-unknown仍只使用既有 executionBlock contract；普通 terminal failed不得新增 durable diagnostic ledger/attempt record。

## 5. Candidate freeze / anti-K1-L1 preflight

- [x] 5.1 所有 implementation/test bytes stable 后，完成 focused regressions、typecheck、lint、build、OpenSpec current/all strict 与 `git diff --check`；任何失败必须在 candidate freeze 前关闭。
- [x] 5.2 确认 Apply pre-Verification 阶段没有执行 authoritative Delivery Full Test、Actual/Compare、Finalize 或 Delivery Final；J1 checkpoint 后必须重新等待 Owner fresh Full Test authorization。
- [x] 5.3 确认 1.x–5.2 全部 required implementation/mechanical tasks 已真实完成；本 checkbox 是 `tasks.md` 的最后一次 task-status mutation，完成后 `tasks.md` 与其余 candidate bytes一并冻结。

### Pre-Verification Evidence Gates（不是 task checkbox）

在 5.3 完成且 exact candidate 已冻结之后，必须对**同一 frozen candidate identity**依次取得以下 technical evidence；这些 gate 的 PASS/FAIL 不得回写 task checkbox：

1. **Simulated-Windows Gate**：在 exact frozen candidate 上，以 Windows-shaped executable/args + `platform='win32'` + injected controlled runner/launcher seam执行 legacy `kind: command` Manifest write → read → controlled execute；decoded values必须 exact equal，passed/failed protocol cases均 PASS，且 premise不依赖 ambient PATH。该 Gate 不得被描述为真实 Windows OS execution proof。
2. **Disposable Full-Plan Gate**：在 disposable exact-candidate environment 使用 managed `FLOWKIT_HOME` 与真实 directory-form dependencies，运行完整 frozen Full Test physical plan到 terminal PASS；不得写 Delivery Full Test lifecycle facts。

若任一 gate FAIL/UNKNOWN，则不得开始 formal Change Verification；如果需要修改 implementation/tests/tasks 来关闭 gate，candidate identity 已改变，必须重新完成 candidate freeze，并重新执行两个 gate。两个 gate 都 PASS 后，才允许对该 exact frozen candidate执行第一次 formal Change Verification。

formal Change Verification 的 PASS/FAIL、`verification.md` publication 与 terminal binding由 Verification authority表达；`review-apply` handoff/verdict由 Policy/Reviewer authority表达，二者均不是 `tasks.md` checkbox，也不得触发任何 post-Verification candidate mutation。
