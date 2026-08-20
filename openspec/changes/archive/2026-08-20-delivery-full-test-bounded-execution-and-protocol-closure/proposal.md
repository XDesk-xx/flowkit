## Why

03 已完成 A1→H1 并形成 H1 checkpoint，但 Delivery Full Test 的 executable binding 仍把一个 logical Full Test authority 绑定到单一 `npm run verify:full` child process 与一份 `120000ms` 总 transport budget。当前 `verify:full` 内部实际包含 `quality → typecheck → lint → build → openspec-all → full` 六个 logical checks，其中 `typecheck` 继续启动两个 `tsc` child，`full` 又进入长生命周期 `npm run test:full`。这会使 logical authority、physical process lifetime 与 terminal protocol publication 错误耦合；transport timeout 不能合法代表 Verification `failed`。

116 Explore + 117 Review 已证明该问题与 H1 的 bounded physical execution 属同类结构性缺陷。120/121/122 Proposal/Apply generation 后续又暴露出一个更早的 acceptance gap：I1 的 formal Change Verification 自身仍把 `tests-cli/tests-execution` 物理执行绑定到 current Change 是否携带 H1 capability，而不是绑定到已选择 logical check 的稳定 physical contract，导致 122 Apply 虽完成实现，formal Verification 仍以 monolithic 120s route 执行 `tests-cli`，并命中一个随 HEAD 演进失效的 historical G1-shaped F1 fixture。Owner 已明确 Contract Reset：旧 120/121/122 generation abandoned，保留 116/117 approved Explore，fresh Proposal 必须在再次授权 Apply 前闭合 `actualChangeSet → logical selection → physical targets → formal Change Verification`。

## What Changes

- 将 `FullTestExecutionContract` 扩展为 `kind: command | bounded-command-plan` 的判别联合；`command` 继续是合法 per-Delivery execution shape，现有 `flowkit-full-test-result-v1/schemaVersion:1` 保持不变，不建立 `FullTestExecutionV1/V2` 内部版本体系。
- 当前 03 Manifest 的 Full Test execution 从 `npm run verify:full` single-command binding 迁移为 `bounded-command-plan`，冻结 logical order：`quality → typecheck → lint → build → openspec-all → full`。每个 logical check 持久化 closed `resolverId` 与 `perTargetTimeoutMs=120000`；resolver 在 current checkout 生成 exact physical targets，不持久化 `FLOWKIT_HOME/PATH/tmp` 或完整 test file snapshot。
- 在 Verification-owned Full Test execution 模块中解析 logical plan 并聚合结果；Delivery Full Test service 只负责 Policy/Owner gate、调用与 persistence。bounded path 不再通过 child `FLOWKIT_FULL_TEST_RESULT_PATH/result.json` IPC；legacy `kind=command` 保持现有 IPC/child-exit coherence 路径。
- 在 `src/shared/external-command.ts` 上抽取最小 ordered bounded transport helper：每个真实 spawned child 独立 timeout/process-tree ownership，返回 `exited | spawn-failed | timed-out-cancelled | outcome-unknown` 与 bounded process diagnostics；helper 不解释 passed/failed、不拥有 Verification/Policy/lifecycle。
- `typecheck` 展开为 source/test 两个独立 `tsc` physical targets；`quality/lint/build/openspec-all` 各自解析为 bounded target；`full` 通过 current-checkout `resolveAllTests()` 形成 ordinary file-per-worker fallback，并对 5 个已证明 process-heavy/结构化 targets 使用 source-controlled static overrides。H1 override MUST case/semantic-complete：默认 installed-runner diagnostics smoke 独立成为一个 bounded target，future-Delivery E2E 继续拆为 `FLOWKIT_H1_FORMAL_PHASE=1..26` 共 26 个 bounded targets；不得因设置 FORMAL_PHASE 的 branch 提前 return 而静默删除默认 smoke assertions。禁止 `verify:step full → npm run test:full` 之类新的 long wrapper。
- 对 bounded kind 增加 executable-plan-relative semantic validation：PASS 必须等于完整 frozen logical plan；FAILED 必须是 exact non-empty logical prefix、前项全 passed、最后一项 failed；transport/protocol/aggregation execution-error 不产生 terminal Full Test result。`checks[]` 语义改为 frozen logical order；physical targets 只进入 bounded execution diagnostics。
- 冻结 duration 语义：physical target duration=单 child wall time；logical check duration=该 check 首 target 开始至 terminal/fail-fast；`totalDurationMs`=整个 logical orchestration wall time，允许包含 orchestration/env-resolution overhead，不要求等于 check durations 之和。
- 修复 lifecycle write-side：当 raw Full Test `authorized` 且无 executionBlock 时，Owner 创建新的 `required=true` Change 必须在同一 atomic Manifest publication 中把 raw status 失效为 `not-ready`，保留旧 authorization record 为历史；Change checkpoint 后重新投影 `awaiting-user-decision` 并要求 fresh `authorize-full-test`。
- 当 current `executionBlock.reason=outcome-unknown` 时，ordinary Change create/activate MUST fail closed 且不得清除 block；本 Change 不实现新的 generic recovery engine。
- 保持 managed `FLOWKIT_HOME` propagation：每个 bounded target 启动前由 current resolver 重新构造环境；OpenSpec/Archify nested targets 必须继续解析同一 managed identity，不把机器绝对路径持久化进 Manifest。
- 增加 Delivery Full Test physical coverage closure regressions：`resolveAllTests(current checkout)` 必须等于所有 `full` physical partitions 的 file coverage union，missing=0、unintended duplicate=0；每个 heavy override 必须证明 default case/selector semantics 被完整映射。H1 必须显式覆盖默认 2 cases（1 smoke + 1 E2E→26 phases）；新 ordinary test 自动进入 fallback。
- **新增 Reset-required Change Verification closure**：`tests-cli` 与 `tests-execution` 一旦被 formal selection 选中，其 bounded physical mapping MUST 由 logical check 本身决定，不得依赖 current Change 是否携带 H1 capability 才启用。保持当前 static source-controlled mapping、每 physical target 120s、fail-fast semantics，不引入 scheduler/timing platform，也不提高 timeout。
- `tests-cli` bounded mapping MUST 保持原有 coverage：non-H1 selection 仍完整执行 legacy npm-installed diagnostic smoke；只有 H1 capability 同时 selected 时才允许对该 legacy smoke 做现有 dedup，同时 H1 自身 installed-runner smoke + phases 1..26 仍必须执行。
- `tests-execution` 继续使用现有 per-file + B1 bounded case mapping；修复 G1 historical checkpoint fixture，使其以正式 Git checkpoint boundary 定位 G1 candidate，而不是假设 current `HEAD` 仍等于 G1 checkpoint。不得仅因 exact base 也失败而忽略该 formal target。
- Verification sentinel regressions MUST 证明目标 physical target **实际被执行到**：在 fail-fast bounded plan 中，前序 mandatory target 必须由 fixture 明确提供 passing prerequisites；不能只因 command string 曾包含某路径就声称 physical closure。

## Capabilities

### Modified Capabilities

- `flowkit-delivery-change-creation-and-owner-input`: Full Test execution contract 支持 `command|bounded-command-plan`；required Change 创建失效旧 authorized qualification；outcome-unknown 阻塞 create/activate。
- `flowkit-formal-fact-reader-and-persistence`: Reader/Writer closed-read/render bounded plan；bounded terminal result 相对 logical plan 做 PASS/FAILED semantic validation；`checks[]` 定义为 logical order。
- `flowkit-core-model`: Full Test logical authority 与 physical execution 分层；bounded execution-error 不冒充 Verification failed；fresh-authorization invalidation 与 duration 语义进入核心合同。
- `flowkit-change-cli-end-to-end-and-performance`: `flowkit delivery full-test` 按 persisted execution kind 选择 legacy single-command 或 in-process bounded orchestration，仍是 one Delivery behavior/no Run。
- `flowkit-runtime-foundation`: shared external-command 增加无业务语义的 ordered bounded process transport primitive。
- `flowkit-openspec-1-7-thin-integration`: managed OpenSpec identity 必须传播到 bounded Full Test 的每个 applicable physical child，而非仅单一 wrapper。
- `flowkit-change-verification-selection`: selected `tests-cli/tests-execution` 使用 logical-check-owned deterministic bounded physical execution；physical mapping activation 不再依赖 current Change 的 H1 capability，且 sentinel/fixture 必须证明真实 target reachability。

## Impact

- Domain/reader/writer：`src/domain/full-test.ts`、`src/domain/a1-types.ts`、`src/facts/formal-fact-reader.ts`、`src/persistence/delivery-manifest-document.ts`。
- Lifecycle/write-side：`src/services/a1-write-service.ts`、`src/services/delivery-full-test-service.ts`。
- Transport/Verification：`src/shared/external-command.ts`、new `src/verification/full-test/**`、`scripts/verification.ts`、`src/verification/change-selection/evidence.ts`、必要的 Verification module ownership mapping。
- Verification regression closure：`tests/unit/verification/change-selection/evidence.test.ts` 与 `tests/unit/services/f1-checkpoint-boundary-service.test.ts`。
- Current 03 executable contract：`openspec/delivery-groups/20260817-01-delivery-execution-loop.yaml` 迁移到 bounded kind；human `verification.fullTest.plan` coverage prose 保持不变。
- Tests：reader/writer、A1 write-side/service、shared transport、Verification logical/physical resolver、module ownership、A1 Full Test physical integration、managed tool propagation regressions。
- 不改变 Standard Action catalog、Run schema、Full Test Owner authority、Full Test result wire schema、H1 planner semantics、Actual/Compare/Finalize、Git boundary或 04 Engineering Health 范围。
