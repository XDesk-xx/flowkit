## Why

I1 已正确解决 Delivery Full Test 的 120 秒 monolithic transport timeout，并完成 checkpoint。随后 Owner-authorized 03 Delivery Full Test 在真实 Windows 与 exact-base Linux detached 两个环境分别到达真实 `full` physical target failure，证明 bounded execution 主体有效，但也暴露出三个不能继续后移的 compatibility/diagnostic 缺口：

1. Delivery Manifest double-quoted scalar writer 使用 `JSON.stringify()`，shared YAML reader 却通过顺序 `.replace()` 做多轮反转义。Windows-shaped `C:\\nvm...` 会先把 `\\` 解成 `\`，再把新形成的 `\n` 二次解释成 newline，破坏 legacy `kind: command` 的真实 write → read → spawn。
2. PowerShell fallback regression 使用 bare fake launcher name 表达“launcher absent”，其预期错误码依赖 ambient PATH；在 detached Linux hostile/unreadable PATH 下可合法得到 `EACCES` 而非 `ENOENT`。Production 的 `ENOENT-only fallback` 是正确安全边界，问题在 fixture premise 不由测试拥有。
3. bounded executor 已拥有 logical/physical target、typed outcome、bounded stdout/stderr 与 process diagnostics，但 `executeBoundedFullTest()`、technical `verify:full` 和 authoritative `flowkit delivery full-test` operator summary 在失败路径丢失部分/全部 physical diagnostics，导致系统测试只能显示 `full failed`，显著放大定位成本。

128 Explore + 129 approved Review 已进一步完成 proof-depth closure：单次 JSON-compatible decode 对现有 repository YAML 40/40 semantic-identical，edge matrix 15/15 exact；deterministic PowerShell fixture prototype 14/14 PASS；diagnostics prototype 保持 persisted logical Full Test protocol不变；stable combined candidate-shaped disposable full physical plan 154 targets terminal PASS。随后 Owner Contract Reset `owner:c2788a597263cd6084295c4648d7d7af0fd49dad420214d4e41f83423857af8e` 明确收窄 J1 evidence boundary：本 Change 不再要求真实 Windows OS execution proof，而以 host-independent Windows-shaped serialization + `platform='win32'` branch/transport simulation 作为 Gate W；该 evidence 不得被描述为真实 Windows filesystem/CreateProcess/PowerShell OS semantics 的证明。

## What Changes

- 将 shared YAML double-quoted scalar parsing 从 chained replacement 改为**单次 JSON-compatible semantic decode**，与当前 `JSON.stringify()`-based writer 使用同一 escape language；解码结果不得递归解释新生成的 backslash sequence。
- 用 semantic round-trip regression 冻结 writer/reader 对称性：quote/backslash、literal `\\n/\\t/\\r/\\uXXXX`、actual control escapes、Unicode 与 Windows-shaped command/path 必须 write → read exact equality；现有 repository YAML semantics 必须保持兼容。
- 增加 legacy `kind: command` Manifest write → parse → execute regression，明确覆盖 Windows-shaped executable/args；Gate W 使用受控 injected runner/launcher seam + `platform='win32'` simulation，证明 decoded command/args 原样到达 execution branch，并覆盖 passed/failed protocol cases。
- 不改变 `src/shared/external-command.ts` 的 production PowerShell fallback policy：只有 launcher spawn `ENOENT` 才尝试下一 candidate；`EACCES` 等真实权限/lookup failure 保持 terminal。
- 将 PowerShell negative fixtures 改为 test-owned absolute nonexistent executable（或同等完全受控 premise），不再使用 ambient PATH bare fake name来断言精确 error code；增加 hostile-PATH counterexample。
- 扩展 bounded Full Test execution diagnostics projection，保留底层已经存在的 `spawnError` / `processTreeDiagnostics`，连同 `logicalCheckId`、`physicalTargetId`、typed outcome、duration、bounded stdout/stderr 上浮。
- technical `verify:full` 在失败时 MUST 输出 terminal/failing physical target diagnostic；authoritative `flowkit delivery full-test` 的 operator-facing returned summary MUST 指明同一 failing bounded target/outcome。
- **不改变** persisted `FullTestProtocolPayload` / `resultRef` / logical `checks[]` authority；physical diagnostics 继续只是 point-in-time execution detail，不写入新的 durable protocol/ledger。
- J1 Apply 必须先完成全部 implementation/mechanical task checkbox，并把 `tasks.md` 作为 candidate 的**最后一次 task-status mutation**冻结；随后在同一 exact frozen candidate 上依次取得 deterministic simulated-Windows legacy `kind: command` write → read → controlled execute PASS 与完整 non-authoritative disposable Full Test physical-plan terminal PASS。两项 evidence 是 **Pre-Verification Evidence Gates，不是 task checkbox**，不得在 PASS 后回写 candidate。
- 只有两个 Evidence Gate 都 PASS，才允许对该 exact frozen candidate开始第一次 formal Change Verification。formal Change Verification 只通过 `verification.md` / terminal binding表达，**不是** `tasks.md` 中等待 Verification PASS 后再勾选的 required task；`review-apply` handoff/verdict同样不进入 implementation task completion。若任一 gate要求修改 candidate，必须重新 freeze并重跑两个 gate。
- J1 的 compatibility claim 明确收窄为：Windows-shaped serialization semantics、`platform='win32'` execution-branch/argv/launcher policy 与 bounded transport contract 已闭合；不得声称本 Change 已真实证明 Windows filesystem/CreateProcess/PowerShell OS semantics。
- J1 完成 + archive + checkpoint 后，Delivery 重新进入 Ready，再由 Owner fresh authorization 执行下一次 authoritative Delivery Full Test；本 Change 不重新打开 I1。

## Capabilities

### Modified Capabilities

- `flowkit-formal-fact-reader-and-persistence`: double-quoted YAML scalar 与 JSON.stringify-based writer 形成单次、非递归的 semantic round-trip contract；Windows-shaped backslash/control escape 不得二次解释。
- `flowkit-runtime-foundation`: Windows PowerShell launcher fallback 明确保持 `ENOENT-only`，权限/其他 spawn error不得伪装成 launcher absent；negative compatibility verification premise必须可由测试环境确定性拥有。
- `flowkit-core-model`: bounded physical diagnostics 保持 non-authoritative execution detail，但从 transport 到 Verification/Delivery operator display不得丢失 terminal failure identity；logical Full Test protocol authority不变。
- `flowkit-change-cli-end-to-end-and-performance`: technical `verify:full` 与 `flowkit delivery full-test` failure display 必须包含 failing bounded physical target/outcome，同时不得改变 durable Full Test result schema。

## Impact

- YAML reader/tests：`src/facts/yaml-parser.ts`、`tests/unit/facts/yaml-parser.test.ts`、`tests/unit/persistence/delivery-manifest-document.test.ts`。
- Legacy command cross-platform integration：`tests/integration/a1-delivery-readiness-and-full-test-behavior.test.ts`。
- PowerShell deterministic regression：`tests/unit/external-command.test.ts`；production `src/shared/external-command.ts` 不应修改。
- Bounded diagnostics：`src/verification/full-test/executor.ts`、`scripts/verification.ts`、`src/services/delivery-full-test-service.ts` 与对应 unit regressions。
- 不改变 I1 bounded resolver/timeout architecture、Full Test result protocol、Standard Action catalog、Owner authority、Actual/Compare/Finalize、Git boundary、04 Skill/engineering-health scope。
