# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `D1`
- Change ID: `policy-engine`
- Action: `revise-apply`
- Role: `author`
- Owner authorization: not-required

## Goal

修复 092-review-apply 的 P1 blocking finding D1-RA-003：`mapVerificationStatusToGate` 把 Change `VerificationStatus = not-applicable` fail-closed 到 `{ kind: 'not-run' }`，导致 `verificationGateUnmet`/`verificationGateDiagnosis` 用 `verification-not-run` 阻断 `review-apply` 与 `archive`。但冻结的 `verification-model.md` Section 3.3 与 `delivery-lifecycle.md` Section 3.4/3.5 明确允许 `passed | not-applicable` 放行，只阻断 `failed | not-run`。091 的实现把 `not-applicable` 当作阻断，违反冻结生命周期，会使一个正确记录为 `not-applicable` 的 Change 无法 review/archive。

同时按 finding requiredChange 修正 D1 Proposal 自身：spec/design/tasks 多处把 Change Verification 门控写成 "passed only"，比冻结契约更严，是 D1 proposal 的 defect。本次将对齐冻结契约（"passed 或 not-applicable" 放行），不修改冻结文档。

## Source review

- Review Run: `20260806-092-review-apply`
- Verdict: `changes-requested`
- Review Result SHA-256: `4d5a75a0c74e1ce7c51738bf5f583ced4cc4acb391aab227e37ba85715c72bfe`
- Finding: `D1-RA-003` (P1, blocking) — `not-applicable` Verification is incorrectly blocked as `not-run`
- Resolved findings carried forward: `D1-RA-001` (089), `D1-RA-002` (091)

## Root cause

`src/policy/verification-gate.ts` `mapVerificationStatusToGate` 在 091 引入时把 `not-applicable` 与 `not-run` 合并到 `{ kind: 'not-run' }`，注释称 "fail-closed: not passed, no dedicated reason"。但冻结的 `verification-model.md` Section 3.3 明确：进入 `review-apply` 前所有适用检查必须为 `passed | not-applicable`，只有 `not-run | failed` 阻断；`delivery-lifecycle.md` Section 3.4/3.5 同样规定 `review-apply` 只阻断 `failed | not-run`，`archive` 接受 `passed | not-applicable`。`not-applicable` 是"没有适用检查时必须明确记录"的满足态，不是阻断态。D1 Proposal 的 spec/design/tasks 也重复了 "passed only" 的更严限制，使契约和实现一致地偏离冻结文档。

## Fix

**gate 重命名 + 映射修正**（`src/policy/verification-gate.ts`）：
- `VerificationGateResult` 的 `{ kind: 'passed' }` → `{ kind: 'satisfied' }`，语义为"满足门控"（`passed` 或 `not-applicable`）。
- `mapVerificationStatusToGate`：`passed` → `satisfied`；`not-applicable` → `satisfied`（**不再** fail-closed 到 `not-run`）；`undefined` → `unavailable`；`failed` → `failed`；`not-run` → `not-run`。
- `verificationGateUnmet`：`satisfied` → `null`（放行）；其余不变。
- `verificationGateDiagnosis`：`NonPassedVerificationGate` 改名 `NonSatisfiedVerificationGate`（`Exclude<..., {kind:'satisfied'}>`），映射不变。
- 注释引用冻结 `verification-model.md` Section 3.3 / `delivery-lifecycle.md` Section 3.4/3.5 作为权威。

**调用点**（`src/policy/next.ts`）：`decideApplyStage` 的 `!lineage.match` 与 `approved` 两个分支 `vGate.kind !== 'passed'` → `vGate.kind !== 'satisfied'`；注释对齐。

**注释对齐**（`src/policy/preconditions.ts`、`src/policy/blocked-diagnosis.ts`）：`preconditions.ts` 三处注释把 "Only passed satisfies" → "Only satisfied (passed or not-applicable) satisfies"；`blocked-diagnosis.ts` `verificationNotRunDiagnosis` 注释删去 "or not-applicable, fail-closed"，明确 `not-applicable` 不映射到此。

**测试**（`tests/unit/policy/verification-gate.test.ts`）：`passed → satisfied`；`not-applicable → satisfied`（D1-RA-003）；新增 "passed and not-applicable both release the gate" 覆盖；exhaustive 与 `verificationGateUnmet` 的 kind 列表更新为 `satisfied`。

**Proposal 对齐冻结契约**（spec/design/tasks）：仅 Change Verification 门控处把 "passed" → "passed 或 not-applicable"；FullTestStatus `passed`（D1-12）一律不动，B1 `FullTestStatus` 仍无 `not-applicable`。

D1 行为不变：`readChangeVerificationStatus` 仍返回 `undefined` → gate `unavailable` → `verification-facts-unavailable`（canRun 拒绝、next blocked），与 091 表面一致；仅前向兼容分支（`not-applicable`）从错误阻断修正为正确放行。

## Allowed work

- 修改 `src/policy/verification-gate.ts`（gate kind 重命名 + not-applicable 映射）
- 修改 `src/policy/next.ts`（两处 kind 判断 + 注释）
- 修改 `src/policy/preconditions.ts`（注释对齐，逻辑不变）
- 修改 `src/policy/blocked-diagnosis.ts`（注释对齐，逻辑不变）
- 修改 `tests/unit/policy/verification-gate.test.ts`（satisfied + D1-RA-003 覆盖）
- 修改 D1 Proposal `spec.md` / `tasks.md` / `design.md`（Change Verification 门控对齐冻结契约，finding requiredChange 明确要求）
- 执行 `npm run typecheck`、`npm run build`、`npm run lint`、`npm test`、`npx openspec validate policy-engine --strict`
- 创建本 revise-apply Run

## Prohibited work

- 不修改冻结文档（`docs/verification-model.md`、`docs/delivery-lifecycle.md`、B1/C1 archived specs）
- 不修改 B1 结构转换表（`src/domain/states.ts`）
- 不修改 069–092 terminal Runs
- 不修改 `FullTestStatus` 相关门控（D1-12：`delivery-finalize` 仍仅 `passed` 放行，B1 `FullTestStatus` 无 `not-applicable`）
- 不执行 Change Checkpoint 或 Full Test
- 不提交或推送（AGENTS.md rule #6）
- 不扩张 Change 范围（proposal 修改仅为对齐冻结契约，非新增需求）
- 不引入新问题（尤其保持 next() 与 canRun 一致、不破坏 D1-12 FullTestStatus 门控）

## Required output

- 修复后的 `verification-gate.ts` / `next.ts` / `preconditions.ts` / `blocked-diagnosis.ts`
- 更新后的 `verification-gate.test.ts`
- 对齐冻结契约的 `spec.md` / `tasks.md` / `design.md`
- `npm run typecheck` / `build` / `lint` / `test` / `openspec validate --strict` 全通过
- 本 Run 的 `result.json`（含 findingsAddressed + consistencyScan，0 contradictions）
- 下一 Action 为 `review-apply`
