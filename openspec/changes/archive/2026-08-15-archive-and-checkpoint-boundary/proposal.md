## Why

F1 已通过 159→164 Explore/Review 证明 Archive success → completed、Owner checkpoint gate、Git boundary topology 与 post-E2 three-file Run 基础均可复用，但当前 Git checkpoint Reader 仍会把 subject-only commit 当成正式 checkpoint，并且如果只匹配 later/current Owner ref，会允许 `checkpoint-first → authorization-later` 的事后追认。F1 需要把 Archive 关闭 Change 后的 checkpoint handoff 与 strict admission 收敛成一个薄、可恢复、不可绕过 Owner authority 的正式边界，同时修复 archive 后测试 fixture 对历史 active Change path 的耦合。

## What Changes

- 新增 `flowkit-archive-and-checkpoint-boundary` capability，正式定义 Archive success 关闭 Change、completed-uncheckpointed checkpoint readiness、Owner-authorized Git handoff 与 formal checkpoint admission 的闭环。
- Current/post-cutover Change Checkpoint 只有在 subject、`Flowkit-Delivery`、`Flowkit-Change`、`Flowkit-Boundary: change-checkpoint` 与 `Owner-Authorization` 全部一致，并且 matching `authorize-checkpoint` Owner fact 在 checkpoint boundary 形成时已经存在时，才被 Reader 投影为正式 `change-checkpoint`。
- 明确禁止 retroactive admission：先形成 checkpoint、后补 matching Owner fact，不能因为 later/current Manifest 已出现该 ref 而把历史 commit 事后追认为合法 checkpoint。
- 保留 current Flowkit migration history 的 bounded legacy compatibility，但 migration cutover 只有一个 authority meaning：legacy admission 与 post-E2 writer activation MUST 共同使用 original strict-admitted E2 checkpoint。subject-only、仅 trailers 完整但 checkpoint-time Owner authorization 不存在、或其它未 strict-admit 的 E2 candidate 均不得激活 writer 或成为 legacy anchor；未来重复 E2 checkpoint 不得移动 cutover；strict anchor 及以后必须使用 formal + temporal binding；fresh/downstream repository 不获得无限 subject-only legacy fallback，并继续默认使用 current three-file writer。
- 增加薄 checkpoint handoff/preflight surface，只产生/校验 canonical commit subject、trailers、exact target 与 `git diff --check` / `git diff --cached --check` 要求；不自动 commit/push，不创建 Checkpoint Run，不复制 Git truth。
- 新增 F1 disposable lifecycle integration regression，覆盖合法 checkpoint 与 subject-only / wrong target / missing provenance / `checkpoint-first → authorization-later` 反例；并把该 integration path纳入 E2 generic Verification 的 physical execution union。
- 修复 `mutation-declaration.test.ts`：使用 isolated Design fixture/repoRoot，不再依赖 E2 active 或 archived path。
- 将 B1 writer activation production consumer 显式绑定到与 FormalFactReader 相同的 original strict-admitted E2 anchor，不再消费仅具 Git subject/trailer shape 的 migration boundary summary；同步修正 `tests/unit/services/b1-run-execution-service.test.ts` fixture，并新增 full-trailer-but-checkpoint-time-Owner-unauthorized E2 负向 regression。
- 不重新设计 D2 archive continuation、E2 writer、G1 CLI、Delivery Full Test/Finalize 或任何自动 Git transaction。

## Capabilities

### New Capabilities

- `flowkit-archive-and-checkpoint-boundary`: 定义 Archive → completed → Owner authorize-checkpoint → deterministic Git handoff → strict/non-retroactive checkpoint admission → next Change 的正式行为，以及 bounded legacy checkpoint compatibility。

### Modified Capabilities

无。F1 复用现有 Owner decision、Policy、FormalFactReader、Git 与 OpenSpec capability，并通过新 capability 对它们之间的 checkpoint authority chain 增加更严格的 observable contract；不改写既有 capability 的其它 Requirement identity。

## Impact

- 主要实现影响 `src/facts/git-boundary-reader.ts`、`src/facts/formal-fact-reader.ts`、`src/services/b1-run-execution-service.ts`，以及一个新的窄 checkpoint handoff/preflight service；B1 只改 writer cutover consumer，不重做 Run architecture。
- Policy production decision tree 预计不需要改变；只要 `FormalFactSnapshot.gitBoundaries` 只包含 admitted checkpoint，既有 `authorize-checkpoint → successor` 逻辑即可复用。Policy tests仍必须证明 malformed/unbound boundary不会推进。
- 新增 F1 integration test 需要在 `src/verification/change-selection/**` 中补齐 ownership/physical execution mapping，保证 formal Change Verification 真正执行该 target。
- `tests/unit/verification/change-selection/mutation-declaration.test.ts` 改为 repository-independent fixture，不修改 production mutation-declaration semantics。
- `tests/unit/services/b1-run-execution-service.test.ts` 纳入 F1 Apply/revise-apply mutation surface，仅用于把 post-E2 writer activation fixture 更新为 strict E2 checkpoint；不扩大 B1 production scope。
- Checkpoint 继续是 Owner-authorized Git boundary，不是 Standard Action/Run；Executor仍拥有机械 commit/push 边界，Flowkit不建立第二份 checkpoint state。
