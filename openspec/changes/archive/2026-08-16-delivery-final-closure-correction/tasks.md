## 1. Close OpenSpec executable authority

- [x] 1.1 Add the minimal shared OpenSpec executable resolver with explicit-executable handling, non-Windows `openspec`, and deterministic Windows `.ps1` then `.cmd` PATH resolution; keep actual launch semantics in the existing shared external-command helper.
- [x] 1.2 Update `OpenSpecCliAdapter` so invocation and consumers needing the actual tool identity use the same resolved executable; add Windows `.ps1`/`.cmd`, explicit executable and missing-shim regressions.
- [x] 1.3 Update G1 changed-surface archive/recovery coverage to use official adapter resolution instead of repo-local `node_modules/.bin/openspec(.cmd)` construction.
- [x] 1.4 Close I1-RA-001 by making propagated `FLOWKIT_OPENSPEC_BIN` an execution-context carrier of the already-resolved authority (`explicit option → propagated identity → platform/PATH discovery`), and prove G1 receives that identity through formal `tests-cli` execution without repo-local or ambient OpenSpec discovery.

## 2. Close Delivery Full Test and Change Verification physical coverage

- [x] 2.1 Update `scripts/verification.ts` so `openspec-all` and public `test:full` resolve the same OpenSpec executable and propagate `FLOWKIT_OPENSPEC_BIN` to test children without creating Full Test lifecycle authority.
- [x] 2.2 Remove silent-suite-skip behavior from `tests/integration/openspec-1-7-real-cli.test.ts`; use a platform-aware recording runner that delegates to the real executable instead of a POSIX-only shell wrapper, and prove a failing real-target sentinel makes public Full Test fail.
- [x] 2.3 Extend `src/verification/change-selection/module-map.ts` so `scripts/verification.ts` and `tests/unit/verification/verification-plan.test.ts` exact-one map to `verification-selection`.
- [x] 2.4 Extend the `tests-verification` physical resolver in `src/verification/change-selection/evidence.ts` to execute `verification-plan.test.ts`; keep resolved OpenSpec executable propagation for `tests-openspec-runtime` and add ownership/physical-command/failing-sentinel regressions through formal `executeVerificationSelection()`.

## 3. Remove lifecycle-coupled fixture debt

- [x] 3.1 Replace the A1 live-current-Delivery count fixture with a stable synthetic point-in-time corpus that keeps exact historical `architectureImpact` assertions and remains valid after appending a future corrective Change; do not use `>=` or a 11→12 patch.

## 4. Close archive-to-checkpoint hygiene mechanics

- [x] 4.1 Extend the checkpoint handoff contract to declare only the approved Proof 5 EOF-only normalization covered by the existing exact Owner checkpoint authorization, while keeping trailing spaces/tabs cleanup, commit/push and manual semantic mutation outside the service.
- [x] 4.2 Add checkpoint regressions proving only redundant EOF blank-line collapse plus exactly one final newline are allowed for candidate/archive-touched text files; trailing spaces/tabs cleanup, broader/internal formatting, semantic or unrelated-file mutations remain fail-closed and the required `git diff --check` / `git diff --cached --check` preflights remain present.

## 5. I1 acceptance

- [x] 5.1 Run G1 real-process E2E and real OpenSpec 1.7 conformance with the resolved executable authority; confirm required cases execute, G1 keeps the full correctness matrix, and process count/wall time show no material regression relative to approved Explore evidence.
- [x] 5.2 Run A1 stable-fixture, OpenSpec adapter, checkpoint handoff, Verification module-map/evidence/verification-plan targeted regressions, typecheck, lint, build, quality and strict current-Change/OpenSpec validation.
- [x] 5.3 Complete formal I1 Change Verification through Apply admission and publish `verification.md`; prove `scripts/verification.ts` and `verification-plan.test.ts` are exact-owned and physically executed, with the formal sentinel controlling PASS/FAIL.
- [x] 5.4 Confirm the candidate does not add OpenSpec package dependencies, AGENTS.md changes, generic formatter/registry, runner concurrency/timeout/scheduler/rebatching, Policy/Formal Action, Run/Persistence schema or 03 Delivery executor behavior. Formal Delivery Full Test remains after I1 archive + checkpoint and independent Owner authorization.

## 6. 225 Contract Reset generation — OpenSpec archive-sync completeness

- [x] 6.1 保留 I1 所有 `MODIFIED Requirement` 中仍适用的 canonical Scenario identity；特别将 `OpenSpec executable identity is propagated from the current adapter` 作为原 identity 保留，并在其正文中整合 222 已批准的 resolved executable authority 语义。
- [x] 6.2 在 `OpenSpecCliAdapter` 增加最小 reusable archive-sync preflight：复制 current exact `openspec/` candidate 到 disposable repository，复用当前 resolved executable，真实执行 OpenSpec `archive --json --yes`，仅消费既有 typed archive outcome，并在 finally 清理 disposable mutation。
- [x] 6.3 在 B1 Propose/revise-propose terminal admission 中，于 strict validation PASS 后调用同一 preflight；增加 regression 证明 strict PASS + missing canonical Scenario 的 delta 会在 Proposal terminal 前 fail closed，canonical repository 不发生 archive mutation。
- [x] 6.4 将 `openspec-current-change-archive-sync` 加入 current closed Verification Catalog / matched selection，并在 `executeVerificationSelection()` 中调用同一 preflight；增加 selection/evidence tests，证明 structured archive failure 控制 formal Change Verification PASS/FAIL，而不新增 persistence schema generation。
- [x] 6.5 使用真实 OpenSpec 1.7 对本 generation 的 exact current I1 candidate 在 disposable repository 执行 archive-sync proof；必须得到 structured success，且不得以 strict validation 或 synthetic fixture 代替。
- [x] 6.6 重新执行 I1 targeted tests、formal Change Verification、typecheck/lint/build/quality、OpenSpec strict；保持 222 已成立实现结果，不重新打开 Explore、不新增 Change、不进入 03 scope，并在 review-apply Approved 后重新等待 Owner archive authorization。


## 7. 228 Contract Reset generation — exact-candidate re-verification lifecycle

- [x] 7.1 保持 bare `flowkit verify` read-only，并增加显式 `flowkit verify --retry`：只允许 unique current completed Apply/revise-apply + current Verification `failed`；不得创建 Formal Action/Run/NNN、不得修改 producing Apply result、不得自动创建 Reviewer/Revision。
- [x] 7.2 增加 bounded Verification publication history：在 supersede failed current `verification.md` 前，以 validated Verification authority directory + publication SHA-256 原子 create-if-absent 保存 `verification-history/<fingerprint>.md` exact bytes；existing same-ref bytes 不一致必须 fail closed。新 Apply terminal publication若将覆盖 227 failed current publication，也必须先通过同一 helper 保留 227 exact bytes。
- [x] 7.3 实现 exact-candidate retry admission：从 current completed Apply persisted compact entry/mutation declaration重建 post-action candidate identity；只排除 validated current `verification.md` 与 `verification-history/**` Core-owned bytes，任何其他 drift fail closed；重建 deterministic selection并要求 fingerprint与 origin selection完全一致。
- [x] 7.4 扩展 current Verification publication/Reader：retry publication记录 origin Apply、origin terminal verification fingerprint、immediate predecessor ref/fingerprint、postActionWorkspaceFingerprint、selectionFingerprint；Reader 验证 finite/acyclic same-origin/same-candidate/same-selection chain后才投影 current status。direct current Apply binding路径保持兼容。
- [x] 7.5 增加 retry lifecycle regressions：bare verify不写、failed exact candidate retry PASS、retry再次 failed 后可重复 retry、candidate drift/selection drift/history missing-or-corrupt/cycle fail closed、227 failed bytes/result不被改写、retry PASS 后 existing Policy自然返回 `review-apply`；并由 `tests-cli` 选中的 CLI 回归通过实际 `runCli(["verify", "--retry"])` 路由验证 operator-facing write surface，确保将 `--retry` 错接回 bare verify 时该回归必然失败。
- [x] 7.6 运行 targeted tests、typecheck/lint/build/quality、current OpenSpec strict + exact current archive-sync preflight；正式 Apply admission必须重新执行 Change Verification。不得修改 timeout/concurrency/scheduler/process-heavy batching，不新增 Change/Action/Run schema，不进入 03 scope。
