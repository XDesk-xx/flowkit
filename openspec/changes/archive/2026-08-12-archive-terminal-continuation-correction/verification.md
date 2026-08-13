<!-- flowkit-change-verification-status: passed -->

# D2 Change Verification — 102 fresh Apply generation

## Scope

本 generation 验证 D2 Contract Reset 后的两个极窄 corrective outcome：

1. `archive-sync-scenario-identity`：保留 canonical `Archive 后无 active Change 时进入 Checkpoint 边界` scenario identity，同时继续要求 matching archive Run terminal completed 后才允许 Checkpoint；
2. `reset-currentness-routing`：approved Explore 保持可复用，而 Proposal / Apply / Archive 的 stage、artifact、review、Owner authorization、Policy `next/canRun`、formal preparation 与 immutable producer binding 使用同一 current Contract Reset identity。

旧 `090-revise-propose`、`091-review-propose`、`094-revise-apply`、`095-review-apply`、`097-apply` 继续作为 immutable history 保留，但不能跨当前 Reset 成为 Current Artifact / current review / current authority。

未运行 Delivery Full Test。

## Selected checks

### Focused Contract Reset / archive continuation regressions

Command:

```text
npm run test:focused -- tests/unit/services/b1-run-execution-service.test.ts tests/unit/policy/contract-reset-currentness.test.ts
```

Result: **passed**，33 tests / 5 suites，0 failed。

覆盖：

- reset 后 approved Explore 可继续作为 fresh Proposal handoff；Explore 尚未 approved 时不会错误跳过 Explore；
- Proposal stage 完整覆盖 `propose / revise-propose / review-propose`；
- Apply stage 完整覆盖 `apply / revise-apply / review-apply`；
- Archive currentness 只接受 current完整 Contract Reset identity；
- 历史 `090-revise-propose`、`094-revise-apply`、`097-apply` 保留但不再决定 current stage / lineage；
- Contract Reset 后旧 `authorize-apply` 不再作为 current Owner authorization，fresh `review-propose` 后必须重新取得 Owner apply authority；
- immutable Proposal producer selection 与 formal preparation 不回退到 all historical lineage；
- active Change preparation precedence、archive semantic drift fail-closed、ambiguous archive-terminal recovery fail-closed；
- pending archive resume/admission、post-relocation continuation 与 existing D1 bounded Contract Reset regressions。

### Deterministic affected

Command:

```text
npm run test:affected -- facts policy
```

Result: **passed**，346 tests / 87 suites / 26 files，0 failed；约 7.166s，within 30s target。

### Real OpenSpec 1.7 lifecycle integration

Command:

```text
FLOWKIT_OPENSPEC_BIN=/mnt/data/openspec-offline/node_modules/.bin/openspec \
  npm run test:focused -- tests/integration/openspec-1-7-real-cli.test.ts
```

Result: **passed**，3 tests / 1 suite，0 failed；约 24.7s。

真实覆盖：

- schemaVersion 4 `archiveEntryOpenSpecProjection` 与 structured keyed artifact identity；
- real OpenSpec archive relocation；
- Change completed 但 archive Run pending 时 Checkpoint gate 继续 blocked；
- normal `admitActionResult` terminalizes 同一个 archive Run，随后才开放 `authorize-checkpoint`；
- normal future archive success path 不依赖 `recover archive-terminal`；
- archive mutation collision / recovery guard 仍 fail closed。

### Current D2 delta real OpenSpec 1.7 strict/archive probe

在 disposable exact candidate copy 中执行：

```text
openspec validate archive-terminal-continuation-correction --strict --no-interactive
openspec archive archive-terminal-continuation-correction --yes
```

Result: **passed**。

Archive output：

```text
Task status: Complete
flowkit-formal-fact-reader-and-persistence: +4
flowkit-lean-run-and-action-package: +2
flowkit-openspec-1-7-thin-integration: +2
flowkit-policy-engine: ~1
Totals: +8, ~1, -0, →0
Specs updated successfully.
Change archived as 2026-08-12-archive-terminal-continuation-correction.
```

该 probe 证明 096 暴露的 MODIFIED scenario identity 问题已关闭；mutation 只发生在 disposable copy，未写回当前 candidate。

### Historical D1/085 recovery regression

本 generation **没有重新执行**已经完成的 historical D1/085 recovery。既有正式 `085/result.json` 保留；相关 bounded recovery / semantic drift / ambiguity regressions通过上述 focused suite重新验证。

### Static / quality

- `npm run typecheck` — passed。
- `npm run lint` — passed。
- `npm run build` — passed。
- `npm run quality` — passed，hard-failures 0；complexity / LOC 为 observation，不是 blocker。

### OpenSpec / hygiene

- `openspec validate archive-terminal-continuation-correction --strict --no-interactive` — passed。
- `openspec validate --specs --strict --no-interactive` — 14 / 14 passed，0 failed。
- `git diff --check` — passed。

## Outcome

D2 102 fresh Apply generation Change Verification: **passed**。

Delivery Full Test: **NOT RUN**。本次验证不取得 Delivery Full Test lifecycle 语义。
