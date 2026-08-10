# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `D1`
- Change ID: `policy-engine`
- Action: `revise-apply`
- Role: `author`
- Owner authorization: not-required

## Goal

修复 094-review-apply 的 P1 blocking finding D1-RA-004：Change-owned `verification.md` 在 091-revise-apply（D1-RA-002）与 093-revise-apply（D1-RA-003）后未同步更新，仍记录 087/089、406/406 tests、仅 D1-RA-001。`docs/verification-model.md` Section 7 要求每个 Change 维护 `verification.md`，且 Run 的 `result.json` 不能替代它。当前 Verification 记录过时，无法支持 review-apply approved 或 Archive 边界。

按 D1-RA-004 requiredChange：本次 revise-apply **仅更新** `openspec/changes/policy-engine/verification.md`——引用 091/093、记录 D1-RA-002/D1-RA-003 检查、用当前 424/424 替换过时 406/406、保留 Full Test 为 not-applicable、保持总体 Change Verification 状态明确（passed），并重新执行适用 ordinary checks 记录实际结果。

## Source review

- Review Run: `20260806-094-review-apply`
- Verdict: `changes-requested`
- Review Result SHA-256: `b07d894d83a3e6c03d87cd6e925e65887fb20f10bab78e72563c38ee870dda8f`
- Finding: `D1-RA-004` (P1, blocking) — Change Verification record is stale after the latest revise-apply Runs
- Resolved findings carried forward: `D1-RA-001` (089), `D1-RA-002` (091), `D1-RA-003` (093)

## Root cause

091 与 093 修复 D1-RA-002 / D1-RA-003 时只更新了 Run `result.json` 与代码/spec，未同步更新 Change-owned `verification.md`。该文件仍停留在 087/089 状态：406/406 tests、仅 D1-RA-001 检查行、结果引用只到 089。`verification-model.md` Section 3.3/3.4 要求 revise-apply 后更新 Verification 结果；Section 7 要求 `verification.md` 作为正式记录，`result.json` 不可替代。因此 094 审查判定 Verification 证据过时（D1-RA-004）。

## Fix

仅修改 `openspec/changes/policy-engine/verification.md`：

1. Section 2 单元测试行：`406/406（109 suites）；Policy 子集 156/156（55 suites）` → `424/424（113 suites）；Policy 子集 174/174（59 suites）`。
2. Section 2 新增三行检查：`D1-RA-002 修复（status-aware verification gate）`、`D1-RA-003 修复（not-applicable → satisfied）`、`D1-RA-004 修复（Change Verification 记录更新）`；`Change Verification 记录` 行说明更新至 095。
3. Section 3 结果引用：补充 091（D1-RA-002，423/423）、093（D1-RA-003，424/424）、095（本 Run）、090/092/094 review-apply Runs。
4. Section 6 补充说明：重写以反映 091/093/095 修订历程，新增 D1-RA-002/D1-RA-003/D1-RA-004 修复说明。
5. Section 7：下一 Action 更新为审查 095-revise-apply。
6. Full Test 仍 `not-applicable`；总体 Change Verification 状态仍 `passed`。

重新执行适用 ordinary checks（typecheck/build/lint/test 424/424/openspec strict）记录实际结果。

## Allowed work

- 修改 `openspec/changes/policy-engine/verification.md`（Change-owned verification record）
- 执行 `npm run typecheck`、`npm run build`、`npm run lint`、`npm test`、`npx openspec validate policy-engine --strict`
- 创建本 revise-apply Run

## Prohibited work

- 不修改生产代码（`src/**/*.ts`）
- 不修改测试（`tests/**/*.ts`）
- 不修改 proposal bundle（`proposal.md` / `design.md` / `spec.md` / `tasks.md`）
- 不修改冻结文档（`docs/verification-model.md`、`docs/delivery-lifecycle.md`、B1/C1 archived specs）
- 不修改 B1 结构转换表（`src/domain/states.ts`）
- 不修改 069–094 terminal Runs
- 不修改 FullTestStatus 语义（D1-12）
- 不执行 Change Checkpoint 或 Full Test
- 不提交或推送（AGENTS.md rule #6）
- 不扩张 Change 范围
- 不引入新问题

## Required output

- 更新后的 `openspec/changes/policy-engine/verification.md`
- `npm run typecheck` / `build` / `lint` / `test` / `openspec validate --strict` 全通过
- 本 Run 的 `result.json`（含 findingsAddressed + consistencyScan，0 contradictions）
- 下一 Action 为 `review-apply`
