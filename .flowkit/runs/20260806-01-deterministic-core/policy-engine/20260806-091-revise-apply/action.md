# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `D1`
- Change ID: `policy-engine`
- Action: `revise-apply`
- Role: `author`
- Owner authorization: not-required

## Goal

修复 090-review-apply 的 P1 finding D1-RA-002：Verification 门控把"事实可用"与"结果 passed"混为一谈。唯一的谓词 `isVerificationFactAvailable()` 只检查可用性，`canRun` 与 `next` 都把 `true` 当作充分——未来扩展 snapshot 后，`failed`/`not-run` 的 Verification 字段会错误放行 `review-apply` 并推进 archive，违反 fail-closed 契约。

修复后 Verification 门控为 status-aware、fail-closed，由 `canRun` 与 `next` 共享：只有 `passed` 放行；`unavailable`/`failed`/`not-run` 各自有 distinct blocked reason。

同时按 owner 指示纠正 explore 产物路径：把 `.tmp/explore/policy-engine/conclusion.md` 恢复为 `openspec/changes/policy-engine/explore.md`（与 A1–C1 全部 8 个已归档 change 一致的正式产物位置，git 跟踪）。

## Source review

- Review Run: `20260806-090-review-apply`
- Verdict: `changes-requested`
- Review Result SHA-256: `032bb814081a2466b59c0e3387517e7f419ccd00fcca2d77268720334c5b7413`
- Finding: `D1-RA-002` (P1, blocking) — Verification gate conflates fact availability with a passed result

## Root cause

`src/policy/preconditions.ts` 仅暴露 `isVerificationFactAvailable()`（可用性布尔），`src/policy/next.ts` 与 `preconditions.reviewSPreconditions`/`archivePreconditions` 都把它当充分条件。没有谓词或结果检查 Verification 是否 `passed`。该函数文档说未来返回 `true` 当字段存在——届时 `failed`/`not-run` 也会被当作放行。

## Fix

新增 `src/policy/verification-gate.ts`：
- `VerificationGateResult` 判别联合：`unavailable | passed | failed | not-run`
- `mapVerificationStatusToGate(status)` — 纯函数，`undefined`→`unavailable`，`passed`→`passed`，`failed`→`failed`，`not-run`/`not-applicable`→`not-run`（fail-closed）
- `readChangeVerificationStatus(snapshot)` — D1 返回 `undefined`（C1 无字段），唯一前向兼容点
- `evaluateVerificationGate(snapshot)` — `canRun` 与 `next` 共享入口
- `verificationGateUnmet(gate)` → canRun unmet string；`verificationGateDiagnosis(gate)` → next blocked diagnosis

`blocked-diagnosis.ts` 补 `verificationFailedDiagnosis()` / `verificationNotRunDiagnosis()`。

`preconditions.ts`：删除 `isVerificationFactAvailable`；`reviewSPreconditions`（apply 阶段）与 `archivePreconditions` 改用 `evaluateVerificationGate` + `verificationGateUnmet`。

`next.ts`：`decideApplyStage` 的 `!lineage.match` 与 `approved` 两个分支改用 `evaluateVerificationGate` + `verificationGateDiagnosis`。

D1 行为不变：gate 始终 `unavailable` → `verification-facts-unavailable`。前向兼容分支（`passed`/`failed`/`not-run`）成为未来扩展时的唯一正确点。

## Allowed work

- 新增 `src/policy/verification-gate.ts`
- 修改 `src/policy/blocked-diagnosis.ts`（补两个 diagnosis）
- 修改 `src/policy/preconditions.ts`（替换 `isVerificationFactAvailable`）
- 修改 `src/policy/next.ts`（替换两个 usage）
- 新增 `tests/unit/policy/verification-gate.test.ts`
- 纠正 explore 产物路径：`openspec/changes/policy-engine/explore.md`（owner 指示）
- 执行 `npm run typecheck`、`npm run build`、`npm run lint`、`npm test`、`npx openspec validate policy-engine --strict`
- 创建本 revise-apply Run

## Prohibited work

- 不修改 proposal bundle（proposal.md / design.md / spec.md / tasks.md）
- 不修改冻结 specs（B1/C1 archived specs）
- 不修改 B1 结构转换表（`src/domain/states.ts`）
- 不修改 069–090 terminal Runs
- 不执行 Change Checkpoint 或 Full Test
- 不提交或推送（AGENTS.md rule #6）
- 不引入新问题（尤其保持 next() 与 canRun 在 revise-apply / archive 路径的一致性）

## Required output

- 新增 `src/policy/verification-gate.ts` + 测试
- 修改后的 `blocked-diagnosis.ts` / `preconditions.ts` / `next.ts`
- `openspec/changes/policy-engine/explore.md`（路径纠正）
- `npm run typecheck` / `build` / `lint` / `test` / `openspec validate --strict` 全通过
- 本 Run 的 `result.json`（含 findingsAddressed + consistencyScan，0 contradictions）
- 下一 Action 为 `review-apply`
