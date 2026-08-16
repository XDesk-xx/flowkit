## Why

G1 archive + checkpoint 后，02 Delivery 的测试体系暴露出三类同源缺口：部分 integration/current-corpus fixture 仍依赖已经消失或已变化的 repository lifecycle snapshot，historical E1 real-OpenSpec test 又错误地把过去 delta 与 future/current canonical spec 比较；同时 `tests-openspec-runtime` 的 logical selection 没有真正执行 real OpenSpec integration target。H1 需要在正式 Delivery Full Test 前把 fixture temporal authority、physical Verification closure 与已经 proof 证明可行的重复 process 成本一起收口。

206 Apply fail-closed 后，Owner Contract Reset 仅纠正 verification lifecycle boundary：`public test:full` 属 Delivery Full Test，不再作为 H1 Apply acceptance；其余 204 correctness、performance、fixture、Verification Closure 设计与 7-selector implementation mutation surface保持不变。

## What Changes

- 将 G1 CLI E2E fixture 从“读取当前 active G1 Change”改为 immutable post-archive point-in-time source；保留完整 7-scenario real-process matrix，并允许 targeted scenarios 复用由 public CLI 真实生成的 Explore/approved-Proposal boundary snapshot，减少重复 lifecycle setup 与 CLI subprocess。
- 将 real OpenSpec 1.7 historical conformance fixture 改成 self-contained point-in-time canonical + `MODIFIED` delta；不再依赖 active E1 path，也不再要求 historical E1 delta 满足 post-E2/current canonical completeness。
- 修正 H1 正式进入 Manifest 后暴露的 current-corpus test expectation：02 Delivery 当前 Change corpus 从 10 对齐为 11，同时保持 legacy `architectureImpact` compatibility 与 D2/E2/H1 explicit `false` 的精确断言。
- 补齐 `tests-openspec-runtime` physical Verification closure：changed `openspec-1-7-real-cli.test.ts` 必须实际进入 Node physical target，并从当前 Verification operation 的 `OpenSpecCliAdapter.executable` 获得同源 real OpenSpec executable identity；不能因环境变量缺失而 silent skip。
- 增加 physical-target failing-sentinel / executable propagation regressions，证明 logical selection PASS 必须对应真实 target execution PASS。
- 固定 correctness-preserving performance acceptance：G1 7/7 场景不减少、real CLI child-process count 相对 correctness-only baseline 降低，并由 H1 formal Change Verification 证明 changed/affected correctness；不通过删 case、skip real OpenSpec、扩大 timeout、修改 runner concurrency、cache 或 scheduler 换取性能数字。`public test:full` 不属于 H1 Change-level acceptance，正式 Delivery Full Test 仅在 H1 archive + checkpoint 后由 Owner 独立授权。

## Capabilities

### New Capabilities

<!-- None. H1 is a corrective Change over existing Change CLI and Verification capabilities. -->

### Modified Capabilities

- `flowkit-change-cli-end-to-end-and-performance`: 使 G1 E2E fixture 在 G1 archive/checkpoint 后仍保持 point-in-time 独立，并允许 correctness-preserving real-CLI boundary snapshot reuse 来减少重复 process cost。
- `flowkit-change-verification-selection`: 要求 selected OpenSpec runtime physical execution真正包含 changed real OpenSpec integration target，并传播当前 OpenSpec adapter executable identity，避免 logical PASS + physical target skipped/omitted。

## Impact

- Verification execution：`src/verification/change-selection/evidence.ts` 与对应 evidence regression。
- Integration tests：`tests/integration/g1-change-cli-end-to-end.test.ts`、`tests/integration/openspec-1-7-real-cli.test.ts`。
- Current-corpus regression：`tests/unit/services/a1-write-service.test.ts`。
- 不修改 `scripts/verification.ts`、Verification module map、production CLI/Policy/FormalFactReader/OpenSpec adapter/archive service。
- 不新增 dependency、cache/scheduler/fixture registry，不实现 Delivery Full Test/Finalize 或 03 scope。
