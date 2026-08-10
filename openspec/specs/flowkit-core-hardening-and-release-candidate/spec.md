# flowkit-core-hardening-and-release-candidate Specification

## Purpose
为 Deterministic Core F1 提供确定、分层且成本可控的项目验证入口、最小 Quality Guard、固定 Full Test Plan 与内部 Core RC candidate contract，使 Core 在不建立第二套测试/流程 authority 的情况下形成可供 Delivery Full Test qualification 的稳定候选。
## Requirements
### Requirement: Verification scripts 必须提供 focused / affected / full 三层测试入口

F1 MUST 提供 `test:focused`、`test:affected`、`test:full` 三个项目测试入口，并保持三者职责不同。`test:focused` MUST 只运行调用者显式给出的合法 test files；`test:affected` MUST 只从 source-controlled closed scope set `shared/domain/persistence/facts/policy/cli/verification` 解析受影响 test set；`test:full` MUST 运行全部 unit/integration tests。任何普通 affected scope MUST NOT 被定义为完整 full suite。F1 MUST NOT 建立 Test Registry、Affected Registry、dependency database 或 CodeGraph substitute。

#### Scenario: focused 只执行显式 test files
- **WHEN** 调用 `npm run test:focused -- tests/unit/policy/next.test.ts`
- **THEN** runner MUST 只执行显式合法 test file
- **AND** MUST NOT 自动扩展到 full suite

#### Scenario: focused 拒绝非法路径
- **WHEN** focused 输入为空、位于 `tests/` 外、不是 `.test.ts` 或规范化后逃逸 repository root
- **THEN** command MUST fail non-zero
- **AND** MUST NOT 猜测替代 test scope

#### Scenario: affected 使用固定 scope map
- **WHEN** 调用 `npm run test:affected -- policy`
- **THEN** runner MUST 从 source-controlled fixed mapping 解析 policy 受影响 tests
- **AND** MUST 对 resolved paths 去重并按 repository-relative path 排序
- **AND** MUST NOT读取 Git diff、聊天、Run 或外部 dependency DB 来决定 scope

#### Scenario: affected 拒绝未知 scope
- **WHEN** 输入不存在于 frozen scope set 的 alias
- **THEN** command MUST fail non-zero
- **AND** MUST NOT退化为 full suite 或空测试

#### Scenario: shared 是 broad affected 但不是 full
- **WHEN** 调用 `npm run test:affected -- shared`
- **THEN** runner MUST 运行 Design 冻结的全部 unit tests 与代表性 lifecycle/diagnostic integration tests
- **AND** MUST NOT 运行 `tests/integration/diagnostic-cli-process.test.ts`
- **AND** MUST NOT 把该 invocation 标记或实现为 `test:full`

#### Scenario: verification scope 覆盖 F1 tooling
- **WHEN** `scripts/verification.ts`、`scripts/quality.ts` 或其直接 helper 发生修改
- **THEN** Change Verification MUST 使用 `verification` affected scope
- **AND** 该 scope MUST 包含 `tests/unit/verification/**/*.test.ts`、`tests/unit/external-command.test.ts` 与 `tests/integration/verification-commands.test.ts`
- **AND** MUST NOT 选择 `none` 将这类 test-bearing tooling 标记为 not-applicable

#### Scenario: full 运行全部测试
- **WHEN** 调用 `npm run test:full`
- **THEN** MUST 运行全部 `tests/unit/**/*.test.ts` 与 `tests/integration/**/*.test.ts`
- **AND** MUST 包含真实 npm pack/install/installed CLI launcher process tests

### Requirement: Test concurrency 必须固定且 npm test 不保留第二个默认 full path

focused / affected / full MUST 分别使用固定 Node test concurrency `1 / 2 / 4`。`npm test` MUST 转发到 `npm run test:full` 或与之产生完全相同的 fixed-concurrency full-suite behavior，MUST NOT 继续依赖 Node test runner 的机器默认 concurrency。

#### Scenario: focused concurrency 固定
- **WHEN** 执行 focused tests
- **THEN** Node test concurrency MUST 为 1

#### Scenario: affected concurrency 固定
- **WHEN** 执行 affected tests
- **THEN** Node test concurrency MUST 为 2

#### Scenario: full concurrency 固定
- **WHEN** 执行 full tests 或 `npm test`
- **THEN** Node test concurrency MUST 为 4
- **AND** 两个入口 MUST 覆盖相同 full test set

### Requirement: Windows process surface 必须使用真实平台 launcher 语义

Verification/process tests 在 Windows 上遇到 `.cmd` / `.bat` launcher 时 MUST 通过 Windows command processor 或等价合法平台机制执行，MUST NOT 把 command script 直接当作 POSIX executable。installed CLI contract tests MUST 覆盖 npm-installed bin 的真实平台入口。

#### Scenario: Windows npm command shim
- **WHEN** process test 在 Windows 调用 npm-installed `.cmd` launcher
- **THEN** MUST 使用真实 Windows command processor semantics
- **AND** MUST NOT 因 test harness 的直接 `spawn("*.cmd")` 方式产生 `EINVAL`

#### Scenario: installed flowkit bin 真实执行
- **WHEN** full/package process test 完成 npm pack 与 local install
- **THEN** MUST 通过平台生成的 installed `flowkit` launcher 执行至少 `--version` 与一个只读 diagnostic command

### Requirement: Quality Guard 的 hard failures 只固化现有 correctness/architecture invariant

`npm run quality` MUST 至少检查：`src/**` 与 `tests/**` 不存在手写 `.mjs` source/test；`package.json.bin.flowkit` 精确指向 `dist/bin/flowkit.js`；`src/bin/flowkit.ts` 保留 `#!/usr/bin/env node` shebang；`src/domain/**` 与 `src/policy/**` 不直接 import Node filesystem modules。任一 hard check failure MUST 使 command non-zero。F1 MUST NOT 为此建立 Gate Registry。

#### Scenario: forbidden mjs hard failure
- **WHEN** `src/**` 或 `tests/**` 出现手写 `.mjs` source/test
- **THEN** `npm run quality` MUST fail non-zero

#### Scenario: bin contract hard failure
- **WHEN** `package.json.bin.flowkit` 不等于 `dist/bin/flowkit.js` 或 CLI source 丢失 Node shebang
- **THEN** `npm run quality` MUST fail non-zero

#### Scenario: domain/policy filesystem boundary hard failure
- **WHEN** `src/domain/**` 或 `src/policy/**` 直接 import `node:fs`、`node:fs/promises`、`fs` 或 `fs/promises`
- **THEN** `npm run quality` MUST fail non-zero

### Requirement: Maintainability metrics 必须实现但只能作为 warning，不成为 F1 correctness gate

`quality` MUST 对 `src/**/*.ts` 确定性计算 file effective LOC、function LOC、cyclomatic complexity、nesting depth 与 parameter count。metric definition MUST 使用 Design 冻结的 TypeScript token/AST 规则，并由固定 fixtures 验证。F1 的 reference thresholds MUST 为 `file 300/500`、`function 60/100`、`complexity 10/15`、`nesting 4/6`、`parameters 5/8`（warning/elevated-warning）。超过阈值 MUST 报告对应 warning；这些 warning MUST NOT 改变 quality exit code，MUST NOT 触发 Flowkit state transition，也 MUST NOT 要求为了数字重构既有 approved semantics。

#### Scenario: legacy large file 必须报告 warning 但 command 成功
- **WHEN** existing source file 超过 file LOC reference threshold
- **AND** 所有 hard checks 通过
- **THEN** quality MUST 输出对应 warning/elevated-warning
- **AND** command MUST 仍成功退出

#### Scenario: metric fixture 输出确定
- **WHEN** 对固定 maintainability fixture 重复运行 quality metric analyzer
- **THEN** file/function LOC、complexity、nesting 与 parameter count MUST 产生相同结果

#### Scenario: metric warning 不成为 Flowkit fact
- **WHEN** quality 输出 maintainability warning
- **THEN** Flowkit MUST NOT 因该 warning 自动创建 Finding、Change、Action 或新的 workflow state

### Requirement: verify:change 必须执行 Change-level checks 且不得升级为 full suite

`npm run verify:change -- <scope...>` MUST 聚合 quality（含 required warning-only metrics）、显式 affected scope tests、typecheck、lint、build、当前 Change OpenSpec strict 与 canonical spec strict validation。调用者 MUST 显式选择一个或多个 frozen affected scope，或在确实没有适用 test-bearing code 时单独选择 `none`；`none` MUST NOT 与其他 scope 混用。verification/quality tooling 变化 MUST 使用 `verification`。runner MUST NOT 自动做通用 dependency inference。任何合法 affected scope MUST NOT 被实现为完整 full suite，`verify:change` MUST NOT 调用 `test:full`、`verify:full` 或创建 Delivery Full Test authority fact。

#### Scenario: verify:change 使用 affected scope
- **WHEN** Author 为 policy 修改执行 `npm run verify:change -- policy`
- **THEN** MUST 运行 policy affected test set 与适用 static/OpenSpec checks
- **AND** MUST NOT 运行 full suite

#### Scenario: verify:change 覆盖 verification tooling
- **WHEN** 当前 Change 修改 verification/quality tooling 并执行 `npm run verify:change -- verification`
- **THEN** MUST 运行 verification affected test set 与适用 static/OpenSpec checks
- **AND** MUST NOT 运行 full suite

#### Scenario: docs-only scope none
- **WHEN** 当前 Change 明确没有适用测试并使用 `none`
- **THEN** runner MUST 跳过 affected tests
- **AND** MUST 继续执行 applicable quality/static/OpenSpec checks
- **AND** verification.md MUST 记录 tests not-applicable 的理由

### Requirement: verify:full 必须固定 Full Test Plan 但不能拥有 Owner authorization

`npm run verify:full` MUST 以固定 fail-fast 顺序执行 `quality → typecheck → lint → build → OpenSpec validate --all --strict → test:full`，并记录每项状态与耗时。该命令是项目验证工具，不是 Flowkit Full Test Action；执行命令本身 MUST NOT 创建或推断 Owner authorization、`fullTestStatus=passed` 或 Delivery finalization eligibility。

#### Scenario: verify:full 全部通过
- **WHEN** 所有聚合检查成功
- **THEN** command MUST exit 0
- **AND** MUST 提供每项检查 status/duration 摘要

#### Scenario: verify:full 单项失败
- **WHEN** 任一聚合检查失败
- **THEN** command MUST fail non-zero
- **AND** MUST fail-fast 或明确标记后续未运行检查

#### Scenario: 未获 Owner 授权时项目命令不创造 Full Test fact
- **WHEN** Author/Reviewer 在 Change 内为了诊断或 F1 自身验收执行 `npm run verify:full`
- **AND** Flowkit 尚未进入 Owner-authorized Delivery Full Test Action
- **THEN** 该执行 MUST 只作为项目 verification evidence
- **AND** MUST NOT 自动更新 Delivery `fullTestStatus` 或绕过 Owner boundary

### Requirement: Verification timing budget 只能告警机器成本

verification runner MUST 记录 platform、arch、Node version 与 wall-clock duration。F1 reference budget MUST 为 focused `2s target / 5s warning`、affected `30s / 60s`、full `30s / 60s`、typecheck/lint/build 各 `10s / 20s`。超过 warning threshold MUST 只输出 warning/diagnosis，不改变 correctness exit code。

#### Scenario: test 超过 warning budget 但行为通过
- **WHEN** test command 全部 assertions 通过
- **AND** duration 超过对应 warning threshold
- **THEN** command MUST 保持成功状态
- **AND** MUST 输出 timing warning 与 environment annotation

### Requirement: Git whitespace preflight 保持 Checkpoint authority boundary

Change Checkpoint 前 MUST 按 repository AGENTS 执行 `git diff --check`，暂存后 MUST 再执行 `git diff --cached --check`。因为 detached executable snapshot MAY 不包含 `.git`，repository-only `quality` / `verify:change` MUST NOT 用 tracked-file registry、sidecar 或全仓 EOF scanner伪造 Git diff authority。

#### Scenario: detached snapshot 无 Git
- **WHEN** F1 verification 在无 `.git` 的 detached snapshot 中运行
- **THEN** quality/verify MUST NOT 因无法执行 Git diff preflight 而伪造 checkpoint result
- **AND** canonical Checkpoint executor 仍 MUST 在 Git authority 环境运行对应 diff checks

### Requirement: Core RC candidate 必须在 F1 completion/checkpoint 前形成

F1 MUST 创建 `docs/core-release-candidate.md` 作为内部 Core RC candidate 声明，记录稳定 internal surface、non-goals、verification tooling contract 与 qualification boundary。该 candidate MUST 在 F1 review-apply/archive/checkpoint 前已经存在；F1 Change Checkpoint 的 Git boundary 最终识别 reviewed candidate bytes。RC declaration MUST NOT 保存自引用 Git SHA、另一份 `fullTestStatus` 或 registry publish receipt。

稳定 internal surface MUST 至少包含 domain types/fixed Action Catalog、`FormalFactSnapshot`、atomic persistence/Lean Run create-complete、Core-derived ResultRef、Policy `canRun/next/diagnose`、diagnostic read APIs/CLI，以及 F1 quality/verification scripts。

#### Scenario: F1 Apply 形成 RC candidate
- **WHEN** F1 implementation 已满足 Proposal/Design 并进入 Change Verification
- **THEN** `docs/core-release-candidate.md` MUST 已存在
- **AND** MUST 明确稳定 surface 与 qualification boundary

#### Scenario: RC 不使用自引用 SHA
- **WHEN** F1 RC declaration 落盘
- **THEN** MUST NOT 写入“当前 checkpoint SHA”作为 tracked current-state authority
- **AND** candidate identity MUST 最终由 Git Change Checkpoint boundary 表达

#### Scenario: RC 不要求 npm prerelease publish
- **WHEN** F1 形成内部 RC candidate
- **THEN** `package.json.version` MAY 保持 `0.1.0`
- **AND** F1 MUST NOT 要求 npm publish、Git tag 或 release registry

### Requirement: Delivery Full Test 只 qualification 已 checkpoint 的 RC candidate

F1 completed + archived + checkpointed 后，Delivery MAY 按既有 Policy 进入 `awaiting-user-decision → authorized → full-test`。Delivery Full Test passed MUST 表示既有 checkpointed RC candidate 获得 Delivery-level qualification/acceptance，MUST NOT 被解释为“现在才生成 F1 core release candidate”。Full Test failed MUST 使用既有 corrective Change lifecycle，MUST NOT reopen F1。

#### Scenario: F1 checkpoint 后等待 Full Test authorization
- **WHEN** F1 required output 已形成且 F1 completed/checkpointed
- **AND** 所有 required Changes 均 completed/checkpointed
- **THEN** Delivery MUST 按现有 Policy 等待 Owner authorize Full Test
- **AND** MUST NOT 要求 F1 再生成 RC artifact

#### Scenario: Full Test passed qualification candidate
- **WHEN** Owner-authorized Delivery Full Test 对 checkpointed RC candidate passed
- **THEN** 该 candidate MUST 被视为获得 Delivery-level qualification/acceptance
- **AND** MUST NOT reopen F1 或产生第二份 F1 RC required output

#### Scenario: Full Test failed 不 reopen F1
- **WHEN** Owner-authorized Delivery Full Test failed
- **THEN** F1 MUST 保持 completed/archived
- **AND** 后续修复 MUST 通过既有 owner-authorized corrective Change lifecycle
- **AND** 修复后 MUST 再次等待 Owner authorize Full Test
