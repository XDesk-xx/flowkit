## Why

`20260816-227-apply` 在新的 archive-sync guard 已正确落地后，formal Change Verification 因 compatible Node union 命中既有 120s execution budget 而记录 `failed`。同一 exact candidate 的后续诊断执行证明测试本身可以全部通过，但当前产品只有“Apply terminal admission 首次发布 Verification”与只读 `flowkit verify` projection，没有合法机制在 **completed Apply + failed Verification + candidate bytes 未变化** 时产生新的 Verification authority。Owner 因此再次执行窄 Contract Reset：只补 re-verification lifecycle，不修改 timeout/concurrency/scheduler，不新增 Formal Action/Change，也不制造 no-op revise；227 failed evidence/result 必须保持 immutable。

随后 `20260816-224-archive` 在真实 OpenSpec 1.7 archive merge 时返回 `archive_spec_update_failed`：I1 的一个 `MODIFIED Requirement` 重命名了仍适用的 canonical Scenario identity，导致 strict validation PASS 但 archive-sync completeness FAIL。Owner 已执行 Contract Reset：不新增 Change、不重开 Explore，保留既有 I1 implementation outcomes 与 `I1-RA-001` resolved 事实，只重新冻结 archive-sync-safe Proposal generation，并要求把 exact-current-candidate real archive preflight 前移为可复用 guard。

02 Delivery 在 H1 checkpoint 后的正式 Delivery Full Test 暴露出一个 Windows canonical failure，同时全局 closure scan 证明还存在同源的假绿路径：G1 仍自行假设 repo-local OpenSpec executable，`test:full` 可在缺少 executable context 时 silent-skip real OpenSpec conformance，当前 OpenSpec adapter 暴露的 nominal executable 与 Windows 实际 resolved invocation identity 不一致；此外新 corrective Change 会再次触发 live-Manifest count fixture，而 OpenSpec archive 后稳定出现的 EOF-only whitespace 又让 Checkpoint Executor反复请求额外 Owner 授权。I1 需要在重新正式 Full Test 前一次关闭这些已经证明的 Delivery 收口缺口。

## What Changes

- 建立唯一的 resolved OpenSpec executable authority：production adapter、Change Verification、G1 real-process regression 与 Delivery verification 都消费同一个 resolved invocation identity；Windows 保留 `.ps1` 优先、`.cmd` fallback，并继续复用现有 shared external-command launcher，不要求项目新增 OpenSpec devDependency。
- 关闭 Delivery Full Test real OpenSpec physical coverage：public `test:full` 在启动测试子进程前解析并传播同一个 OpenSpec executable；`openspec-1-7-real-cli.test.ts` 不再通过缺少 `FLOWKIT_OPENSPEC_BIN` 静默整套 skip，failing sentinel 必须使 Full Test 非零退出。
- 移除 G1 对 `node_modules/.bin/openspec(.cmd)` 的 repo-local 假设；real OpenSpec invocation-count regression 使用 platform-aware runner 包裹真实 executable，而不是 POSIX-only `.sh` wrapper。
- 将 A1 current-corpus regression 从 live 02 Manifest exact count 耦合改成 stable synthetic point-in-time corpus + future expansion assertion；保持 exact semantic assertions，不用 `>=` 或简单把 11 改为 12。
- 将 OpenSpec archive 后严格限定的 EOF-only normalization 明确为 already-authorized Change Checkpoint mechanics：只允许 candidate/archive-touched text files 的 redundant EOF blank-line collapse 与 exactly one final newline；不得扩成 trailing spaces/tabs 清理、通用 formatter、内部/语义 formatting、unrelated-file mutation 或额外 Owner decision。
- 扩展 Verification Module Map 与 physical resolver，使 `scripts/verification.ts` / `verification-plan.test.ts` 的变化可 exact-one selection，并由同一个 formal `tests-verification` execution 实际执行 `verification-plan.test.ts`；sentinel 必须控制 formal PASS/FAIL。
- 修正 I1 OpenSpec delta 的 full-replacement completeness：所有 `MODIFIED Requirement` 保留仍适用的 canonical Scenario identity；特别保留 `OpenSpec executable identity is propagated from the current adapter`，同时在该 identity 下整合已批准的 resolved executable authority 语义。
- 增加最小可复用 real OpenSpec archive-sync preflight：Propose/revise-propose terminal admission 在 strict PASS 后必须对 exact current `openspec/` candidate 于 disposable repository 执行真实 `archive --yes`；Change Verification 再以 stable logical check `openspec-current-change-archive-sync` 调用同一 guard。structured failure/timeout/outcome-unknown 均 fail closed，且 canonical candidate 不被 mutation。
- 增加显式 `flowkit verify --retry` re-verification behavior：仅在唯一 current completed Apply/revise-apply 已正式 terminal、current Verification=`failed`、且 current exact candidate 与该 Apply 的 post-action identity 完全一致时可执行；默认 `flowkit verify` 继续只读。retry 不创建 Formal Action/Run，不修改 Apply result，不自动改 candidate。
- re-verification 前将当前失败 `verification.md` exact bytes 以其 SHA-256 作为 immutable history identity 保存到 validated Change Verification authority 同目录下的 bounded `verification-history/<fingerprint>.md`，新 publication 必须显式链接 previous fingerprint / origin Apply run / exact candidate fingerprint；Formal Reader 只在完整 chain 可回溯到 original Apply terminal binding 时才接受 superseding current authority。candidate drift、selection drift、history mismatch、chain ambiguity 均 fail closed。
- Reviewer 仍只绑定 current `verification.md`；history chain 保证先前 failed evidence 可审计且不可改写。新的 PASS authority 成立后 Policy 才能自然解除 `verification-failed` 并进入 `review-apply`。
- 保持性能边界：只做 correctness/executable/coverage closure；不修改 runner concurrency、timeout、scheduler、process-heavy batching 或 cache。G1/real OpenSpec standalone process count与 wall time不得出现材料级回归。

## Capabilities

### New Capabilities

<!-- None. I1 closes existing OpenSpec, Verification, Full Test tooling and Checkpoint behavior. -->

### Modified Capabilities

- `flowkit-openspec-1-7-thin-integration`: OpenSpec executable identity 必须解析为实际 invocation identity，并由 adapter / verification consumers共享；同时 Proposal terminal admission 与 Change Verification 必须复用真实 disposable archive-sync preflight，在 Owner archive authorization 前 fail closed archive-incompatible current candidate。
- `flowkit-change-verification-selection`: selected external-tool physical checks必须传播 resolved executable identity，让 changed verification-plan regression进入正式 physical execution closure，并为 matched current Change 增加 `openspec-current-change-archive-sync` logical check，实际调用同一 real disposable archive preflight。
- `flowkit-core-hardening-and-release-candidate`: `verify:full` / public `test:full` 必须真实执行 required real OpenSpec conformance，不允许 executable context 缺失导致 silent suite skip。
- `flowkit-archive-and-checkpoint-boundary`: exact Owner checkpoint authorization 仅覆盖 approved Proof 5 已证明的 EOF-only checkpoint hygiene normalization（redundant EOF blank-line collapse + exactly one final newline），无需为该机械动作取得第二次 Owner decision。
- `flowkit-change-cli-end-to-end-and-performance`: bare `flowkit verify` 保持 read-only projection；显式 `flowkit verify --retry` 成为唯一 re-verification write surface，只在 verification-failed + exact candidate unchanged 时运行，不创建 Run/Action。
- `flowkit-formal-fact-reader-and-persistence`: current `verification.md` 可在严格验证的 re-verification chain 下 supersede original Apply publication；original terminal binding 对应的 failed bytes 必须存在于 immutable `verification-history/<fingerprint>.md`，Reader 必须验证 chain、origin Apply、selection 与 post-action candidate identity。

## Impact

- OpenSpec integration：`src/integrations/openspec/openspec-cli-adapter.ts` + 新的最小 `openspec-executable.ts` resolver。
- Project verification：`scripts/verification.ts`；不改变 Full Test Owner authority，只闭合工具的 physical coverage。
- Change Verification：`src/verification/change-selection/evidence.ts`、`module-map.ts`、`selection.ts` 及对应 regressions；新增 stable logical check `openspec-current-change-archive-sync`。
- Proposal admission：`src/services/b1-run-execution-service.ts` 在 Propose/revise-propose terminal admission 的 strict validation 后复用 OpenSpec archive-sync preflight；对应 service regression 必须覆盖 strict PASS + archive merge FAIL 的前移拦截。
- Checkpoint handoff：`src/services/f1-checkpoint-boundary-service.ts` 与 handoff regression；不自动 commit/push。
- Tests：G1 real process、real OpenSpec 1.7、A1 stable corpus、OpenSpec adapter、checkpoint handoff、verification module/plan physical closure。
- Re-verification lifecycle：`src/cli/main.ts`、`src/cli/change-action.ts`、`src/facts/formal-fact-reader.ts`、`src/services/b1-run-execution-service.ts`、`src/verification/change-selection/entry-snapshot.ts`、`src/verification/change-selection/publication.ts` 与对应 unit/integration tests。
- 不修改 `package.json` / `package-lock.json`、`scripts/platform-command.ts`、Policy/Formal Action catalog、Run/context/result schema、AGENTS.md、runner concurrency/timeout/scheduler，也不 vendor OpenSpec；`verification-history` 只保存显式 retry 前一份 formal publication exact bytes，不成为通用 Evidence platform。
