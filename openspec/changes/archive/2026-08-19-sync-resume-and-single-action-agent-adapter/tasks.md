## 1. Historical terminal replay closure

- [x] 1.1 抽取/扩展 bounded active-or-unique-archive Verification path resolver，使 current publication/history 可从 active root 或唯一 archived root读取，同时保留 producing terminal logical refs不变。
- [x] 1.2 调整 Apply/revise-apply terminal Verification replay：exact current publication直接通过；非 exact current publication必须通过 same-origin/exact-candidate/same-selection bounded re-verification chain锚定 producing binding后才能通过。
- [x] 1.3 分离 re-verification chain 的 logical authority base 与 physical storage directory；增加 missing/ambiguous archive、missing/corrupt predecessor、cycle、origin/candidate/selection drift 的 fail-closed unit/integration regressions。
- [x] 1.4 保持 historical E1 sidecar reader point-in-time semantics，并增加 current Catalog counterfactual regression，证明 legacy selection/evidence 不被 future Catalog重新解释。

## 2. Shared resume projection

- [x] 2.1 新增 non-persistent typed resume projection builder，复用 FormalFactSnapshot/Policy/pending inspection并派生 Delivery/Change/stage/Run/Review/Verification/next。
- [x] 2.2 在 projection 中只读派生当前 Delivery Current/Planned/Actual Architecture status 与存在时 logical path/content fingerprint；不得生成 Actual/HTML或持久化第二份 ref。
- [x] 2.3 为 structured Agent/H1 consumer按需派生 closed managed OpenSpec/Archify readiness/identity；禁止 ambient PATH fallback成为 managed success或 Policy authority。
- [x] 2.4 让 `resume-context` 消费同一 typed projection 的 repository-stable子集并呈现 Architecture status/ref；更新 diagnostic regressions且保持命令 read-only。

## 3. Provider-neutral single-action Agent Adapter

- [x] 3.1 新增 bounded single-action adapter service，调用既有 `prepareNewExecution`/exact `resumeRun`，并为 fresh resume重建当前 Action 的 bounded OpenSpec structured execution context。
- [x] 3.2 定义 provider execution view = exact ActionPackage + OpenSpec execution context + typed resume projection；provider/executor由caller注入，不新增 Provider/Agent Registry或session persistence。
- [x] 3.3 强制每个 adapter invocation最多调用 provider一次，合法 result只经既有 `admitActionResult` admission；provider transport failure保持 pending Run且不得伪造 terminal。
- [x] 3.4 admission/replay后只返回 post-action Policy projection并立即 return control；增加 no-second-Run/no-new-NNN/no-auto-next/no-role-switch regressions。
- [x] 3.5 固化 different future Delivery-shaped fresh clone regression，证明不同 deliveryId/changeId 下 exact resume、OpenSpec context rebuild、single invocation与existing admission不依赖03/G1常量。

## 4. Verification ownership and physical closure

- [x] 4.1 更新 closed Verification capability/module ownership，使 G1 production/test paths 与新 capability/modified capabilities形成 matched relation，且每个 path恰有一个 owner。
- [x] 4.2 新增 `tests/integration/g1-sync-resume-and-single-action-agent-adapter.test.ts`（或等价同语义 target），覆盖 retry+archive replay、fresh checkout/future Delivery、historical E1、resume projection与single-action adapter关键边界。
- [x] 4.3 将该 G1 integration target加入现有 selected logical Node check的 physical resolver，并增加 sentinel regression证明 target failure会让正式 selected check失败。
- [x] 4.4 用 expected production/test paths + 本 Change delta capability refs执行 production `buildVerificationSelection()` prospective proof，确认 capabilityRelation=`matched` 且 selected checks覆盖 `tests-execution`、`tests-cli`、`tests-verification`、`typecheck`及真实 dependency closure要求的其他 checks。

## 5. Change verification readiness

- [x] 5.1 运行 targeted unit/integration regressions与 `typecheck`，确认 current three-file Run、historical E1兼容、existing Change CLI/Policy/Owner boundaries无回归。
- [x] 5.2 运行 OpenSpec current Change strict validation与 `git diff --check`，确认 Proposal冻结范围外没有 production/test mutation、Run sidecar、Registry、H1/Actual/Full Test/Finalize/Checkpoint/Git automation扩张。
- [x] 5.3 完成 G1 formal Change Verification，让正式 physical resolver实际执行新的 G1 integration target；记录结果后交 `review-apply`，不执行 Delivery Full Test或H1 self-hosting acceptance。
