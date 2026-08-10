## 1. Verification test layers

- [x] 1.1 新增 TypeScript verification runner，提供 `test:focused` / `test:affected` / `test:full`；focused 只接受显式 `tests/**/*.test.ts`，affected 只接受 frozen `shared/domain/persistence/facts/policy/cli/verification` scope map，full 覆盖全部 unit/integration tests。
- [x] 1.2 固定 test concurrency：focused=1、affected=2、full=4，并把 `npm test` 收敛为 fixed-concurrency `test:full` 兼容入口。
- [x] 1.3 按 Design 冻结的精确 pattern 实现 affected scope map 并增加 focused tests：未知 scope fail-closed、多 scope union/dedupe/sort、`shared` 为 broad affected 但不等于 full、`verification` 确定覆盖 F1 verification/quality tooling tests、各 scope 覆盖对应 high-risk integration surface。
- [x] 1.4 保留并增强 npm pack/install/installed CLI process regression，确保 Linux 与 Windows 平台 launcher 路径都是真实执行面；Windows `.cmd/.bat` 必须经过合法 command processor。

## 2. Quality Guard

- [x] 2.1 新增 `npm run quality` 与 TypeScript quality checker，hard-check forbidden `src/tests .mjs`、`package.json.bin.flowkit`、CLI shebang、`domain/policy` direct filesystem imports；任一 hard violation non-zero。
- [x] 2.2 按 Design 冻结的 TypeScript token/AST 定义实现 required deterministic maintainability metrics（file/function LOC、complexity、nesting、parameters），超过 Proposal reference threshold MUST 输出 warning/elevated-warning，但不改变 exit code。
- [x] 2.3 增加 quality fixtures/tests，证明 hard violation 会失败、legacy maintainability exceedance 必须报告 warning 但 command 成功，并冻结 metric fixture 的确定输出。
- [x] 2.4 不实现 generic cycle graph、module responsibility score、Gate Registry、quality database 或 tracked-file registry；把这些保持为 future input。

## 3. Change / Full verification commands

- [x] 3.1 新增 `npm run verify:change -- <scope...>`：聚合 quality、显式 affected tests、typecheck、lint、build、current Change OpenSpec strict 与 canonical specs strict；verification/quality tooling 必须使用 `verification`，`none` 只允许单独用于确实没有适用 test-bearing code 的情况；任何合法 scope 都不得升级为 full suite。
- [x] 3.2 新增 `npm run verify:full`：固定聚合 `quality → typecheck → lint → build → OpenSpec --all --strict → test:full`，按步骤 fail-closed 并记录 status/duration。
- [x] 3.3 增加 regression：`verify:change` 永不调用 `test:full/verify:full`；`verify:full` 包含全部项目检查但不会修改 Flowkit/Manifest/Run/owner authorization。
- [x] 3.4 记录 verification environment/timing；实现 focused 2/5s、affected 30/60s、full 30/60s、typecheck/lint/build 10/20s target/warning，仅 warning 不改变 correctness result。

## 4. Full Test Plan 与工程卫生

- [x] 4.1 更新 `docs/verification-model.md`，把现有 Manifest Full Test Plan 映射到 `quality / typecheck / lint / build / OpenSpec strict / test:full / verify:full`，并明确项目命令不拥有 Owner authorization。
- [x] 4.2 保留 AGENTS 中 Windows launcher 与 Checkpoint `git diff --check` / `git diff --cached --check` 规则；验证 detached quality/verify 不伪造 Git diff authority，也不建立全仓 EOF scanner。
- [x] 4.3 验证 `npm test`、`test:full` 与 `verify:full` 的 full test set 一致，且真实 package/process slow surface 不被 focused/affected 默认带入无关 scope。

## 5. Core RC candidate

- [x] 5.1 创建 `docs/core-release-candidate.md`，冻结 candidate purpose、stable internal surface、non-goals、verification tooling、qualification boundary 与 Full Test failure handling。
- [x] 5.2 stable surface 至少覆盖 domain types/Action Catalog、`FormalFactSnapshot`、atomic persistence/Lean Run、Core-derived ResultRef、Policy APIs、diagnostic APIs/CLI、F1 verification/quality scripts。
- [x] 5.3 明确 F1 不 bump `0.1.0` 为 prerelease、不 npm publish、不 Git tag、不在 tracked artifact 写 checkpoint SHA 或第二份 `fullTestStatus`。
- [x] 5.4 用 tests/docs contract 证明 RC candidate 在 F1 review/archive/checkpoint 前已形成，Delivery Full Test 只在 checkpoint 后 qualification；失败走 corrective Change，不 reopen F1。

## 6. F1 Change Verification

- [x] 6.1 Apply 后创建/更新 F1 `verification.md`，包含唯一 `flowkit-change-verification-status` marker、focused/affected/static/OpenSpec checks、timing/environment、Full Test 是否运行及总体状态。
- [x] 6.2 运行 F1 focused tests 与 `npm run test:affected -- verification`，再执行 `npm run quality`、`npm run typecheck`、`npm run lint`、`npm run build`、current Change strict 与 canonical specs strict。
- [x] 6.3 因 F1 自身就是 verification tooling / RC hardening Change，允许为 F1 acceptance 运行一次 `npm run verify:full`；必须在 `verification.md` 明确该执行是 F1 Change evidence，不是 Delivery Full Test authority fact。
- [x] 6.4 验证没有引入 Registry / dependency DB / CodeGraph / Archify / automatic Full Test / automatic Git operation，也没有改变 D1 Policy / Owner authorization / FullTestStatus 语义。
- [x] 6.5 验证 `AGENTS.md` 的 Windows launcher 与 whitespace preflight 规则仍存在且未被新的 project tooling 误解为第二流程 authority。
