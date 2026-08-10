# Deterministic Core — Internal Release Candidate

## 1. Candidate purpose

F1 `core-hardening-and-release-candidate` 在 Change 自身完成前形成本内部 Core RC candidate。它表示 Deterministic Core 已具备下一 Delivery 可以固定依赖的稳定内部 surface，并已经配套可执行的 verification layering / Quality Guard / Full Test Plan。

该文件声明 **candidate contract**，不是外部 package release receipt，也不是 Delivery Full Test 状态存储。

## 2. Stable internal surface

本 RC candidate 向下一 Delivery 暴露并冻结以下内部 surface：

- domain types 与 fixed Action Catalog；
- `FormalFactSnapshot` 及 formal-fact read APIs；
- atomic persistence、Lean Run create/complete 与 terminal create-once invariant；
- Core-derived `ResultRef` / version fingerprint；
- Policy `canRun / next / diagnose` 及既有 Owner authorization boundary；
- diagnostic read APIs 与 `flowkit status / next / doctor / resume-context`；
- F1 verification tooling：`test:focused / test:affected / test:full / quality / verify:change / verify:full`；
- F1 fixed affected scopes、fixed test concurrency、hard Quality Guard、warning-only maintainability/timing contract。

这些 surface 的 authority 仍按既有模型分工：Flowkit 拥有流程，OpenSpec 拥有 Change contract，Git 拥有 repository/history/checkpoint，Verification 工具拥有检查结果，Run 只记录轻量执行 lineage。

## 3. Verification tooling contract

测试分层：

```text
focused   → 显式 test file，concurrency=1
affected  → closed source-controlled scope，concurrency=2
full      → 全部 unit + integration，concurrency=4
```

`npm test` 与 `npm run test:full` 使用同一 full test set / fixed concurrency。

Change-level verification：

```text
npm run verify:change -- <scope...>
```

只运行 quality + selected affected + static/OpenSpec checks，不升级为 full suite。

完整项目 verification：

```text
npm run verify:full
```

固定执行 quality、typecheck、lint、build、OpenSpec `--all --strict`、`test:full`。该项目命令本身不拥有 Owner authorization，也不会自动更新 `fullTestStatus`。

## 4. Quality boundary

Hard Guard 只固化既有 correctness / architecture invariant：

- 禁止手写 `.mjs` source/test；
- CLI bin path / shebang contract；
- `domain` / `policy` filesystem import boundary。

Maintainability metrics（file/function LOC、complexity、nesting、parameters）必须确定性计算并报告，但只产生 warning/elevated-warning。当前 legacy exceedance 是 technical debt，不要求 F1 为数字重构已批准语义。

验证耗时同样只产生 warning/diagnosis，不作为机器波动敏感的 correctness gate。

## 5. Platform and checkpoint hygiene

Windows `.cmd/.bat` launcher 必须通过真实 Windows command processor 或等价合法机制运行；installed CLI process regression 必须覆盖真实 npm-installed launcher surface。

Change Checkpoint 前执行：

```text
git diff --check
git diff --cached --check
```

这两个检查属于 canonical Git authority preflight。detached verification 不建立 tracked-file registry、sidecar 或 EOF scanner 来替代 Git diff authority。

## 6. Qualification boundary

生命周期固定为：

```text
F1 implementation
→ Core RC candidate exists
→ F1 Change Verification
→ review-apply
→ archive
→ F1 Change Checkpoint
→ Delivery ready
→ Owner authorize Delivery Full Test
→ Delivery Full Test
→ RC qualification / acceptance
```

因此：

- Core RC candidate **必须先于** F1 completion/checkpoint 形成；
- F1 Change Checkpoint 最终由 Git 标识 reviewed candidate bytes；
- Delivery Full Test 只 qualification 已 checkpoint 的 candidate，不负责生成 F1 required output；
- Author/Reviewer 在 F1 中运行 `verify:full` 只是 Change evidence，不是 Delivery Full Test；
- Delivery Full Test failed 时按既有规则创建新的 corrective Change，不 reopen F1。

## 7. Non-goals

F1 不做：

- npm prerelease publish；
- Git tag / release registry；
- `package.json.version` prerelease bump（保持 `0.1.0`）；
- 在 tracked artifact 写 current/checkpoint SHA；
- 第二份 `fullTestStatus`；
- Test/Affected/Gate Registry、dependency DB、CodeGraph/Archify integration；
- 自动 Full Test、Archive、Checkpoint、Commit、Push 或 Delivery Finalize。
