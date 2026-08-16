## 1. Strict checkpoint candidate / admission

- [x] 1.1 扩展 Git boundary reader：读取 current Delivery topology、exact checkpoint subject 与 formal trailers，拒绝 duplicate/missing/conflicting/wrong-target current candidate，同时保留明确的 bounded legacy candidate path。
- [x] 1.2 在 FormalFactReader 中组合 Git candidate 与 Owner authority，验证 checkpoint-time Manifest 中存在 exact canonical `authorize-checkpoint` record；禁止 later/current Manifest ref equality 事后追认历史 checkpoint。
- [x] 1.3 实现 current Flowkit E2 strict anchor 前的 bounded legacy compatibility；anchor及以后 strict，fresh/downstream repository无 legacy fallback。
- [x] 1.4 收口 shared original strict E2 anchor projection：FormalFactReader bounded legacy admission与 B1 writer activation必须消费同一个 strict-admitted/temporal Owner-bound anchor，Git-only candidate不得单独激活 writer。

## 2. Thin checkpoint handoff / preflight

- [x] 2.1 新增窄 checkpoint handoff/preflight service：只生成 exact subject、Flowkit/Owner trailers与 `git diff --check` / `git diff --cached --check` requirements。
- [x] 2.2 Handoff 对 completed-uncheckpointed target、matching Owner authorization、Delivery/Change ambiguity fail closed；不得 commit/push、不得创建 Run或第二 checkpoint state。

## 3. Lifecycle / Policy regressions

- [x] 3.1 扩展 Git/FormalFactReader unit regressions：valid formal、subject-only、wrong Delivery、wrong Change、wrong Boundary、missing/mismatched Owner provenance。
- [x] 3.2 增加 temporal regression：`authorization-before-checkpoint` accepted；`checkpoint-first → authorization-later` 不得 retroactively admitted。
- [x] 3.3 扩展 Policy next/preconditions regressions：invalid candidate时仍 `authorize-checkpoint`，valid admitted boundary才允许 successor progression。
- [x] 3.4 新增 disposable F1 lifecycle integration：archive terminal completed → Change completed → Owner authorize-checkpoint → formal checkpoint → next Change，并覆盖 bounded legacy/fresh strict 反例。
- [x] 3.5 增加 migration writer activation regressions：subject-only E2拒绝、full-trailer但 boundary-time Owner未授权 E2拒绝、real e182 strict anchor激活、later duplicate E2不移动cutover、fresh/downstream默认three-file。

## 4. Verification closure / fixture isolation

- [x] 4.1 将 F1 integration path加入 generic Verification module ownership与 `tests-execution` physical Node union，补 module-map/evidence regressions证明 formal selection实际执行该 target。
- [x] 4.2 将 `mutation-declaration.test.ts` 改为 isolated temporary repoRoot + Design fixture；不得引用 E2 active/archived path或修改 production mutation-declaration semantics。
- [x] 4.3 确认 F1 post-E2 Standard Runs继续只有 `action.md` / `context.json` / terminal `result.json`，不新增 sidecar。
- [x] 4.4 更新 B1 writer activation production consumer与 fixture，使其使用 shared strict-admitted E2 anchor；不得恢复 Git Reader Owner-authority或 changeId-specific subject-only fallback。

## 5. Verification / acceptance

- [x] 5.1 运行 focused Git/FormalFact/Policy/service/F1 integration regressions。
- [x] 5.2 执行 F1 formal Change Verification，确认 actual changed paths → logical checks → physical executed targets闭合，尤其 F1 integration与 mutation-declaration regression实际被选中并执行。
- [x] 5.3 运行 typecheck、lint、build、OpenSpec strict与适用 quality guards；记录任何环境相关非F1 failure，不静默扩scope。
- [x] 5.4 Revised Apply完成后重新运行 targeted/full regression 与 F1 formal Change Verification，确认 full-trailer-but-unauthorized E2负向 case由正式 physical test execution覆盖。
