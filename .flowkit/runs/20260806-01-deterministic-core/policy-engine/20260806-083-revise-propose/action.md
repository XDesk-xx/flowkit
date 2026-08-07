# 20260806-083-revise-propose

## Action

revise-propose (author)

## Reviewed Run

20260806-082-review-propose (verdict: changes-requested; blocking finding: D1-PR-005)

## Trigger Finding

**D1-PR-005 (P1)**: full-test precondition allows direct retry after a failed Full Test

- **Evidence**: The Proposal defined `full-test` as allowed when all required Changes are completed/checkpointed, authorization exists, and `deliveryFullTestStatus != passed`. Thus `failed` satisfies the precondition.
- **Root cause**: The precondition `deliveryFullTestStatus ≠ passed` includes `failed` as an eligible state, but frozen `verification-model.md` Section 6 requires `fullTestStatus` to remain `failed` and Policy to return an owner decision boundary or blocked diagnosis. The owner may authorize a corrective Change or cancel, and only the corrective Change resets the status to `not-ready` before another Full Test cycle.
- **Required change**: Limit `full-test` eligibility to pre-execution states; `failed` must return `full-test-failed` owner-decision/blocked behavior, never `action: full-test`. Add table-driven coverage for `failed` preserving the status and for the corrective-Change reset path. Update Design, Spec, Tasks, and the next/diagnose rules consistently.

## Fix Applied

### Design (design.md)

- Added **D1-13**: `full-test` eligibility restricted to pre-execution states (`awaiting-user-decision`, `authorized`); `failed` → `blocked: full-test-failed` with `suggestedOwnerActions` (corrective Change or cancel Delivery). Documents the full `FullTestStatus` × `full-test` behavior matrix, alignment with frozen `verification-model.md` Section 6, the blocked-vs-owner-decision distinction (per D1-9), and complementarity with D1-12 (`delivery-finalize`).
- Updated D1-12's complementarity reference from `deliveryFullTestStatus ≠ passed` to D1-13's pre-execution states.

### Spec (spec.md)

- **"Delivery-level Action 前置条件" Requirement**: Changed `full-test` precondition from `deliveryFullTestStatus ≠ passed` to `deliveryFullTestStatus ∈ {awaiting-user-decision, authorized}` (D1-13).
- **"full-test 前置条件" Scenario**: Updated condition to `∈ {awaiting-user-decision, authorized}`.
- **New Scenario "full-test 在 failed 时拒绝并返回 blocked"**: `failed` → `allowed: false` + `full-test-already-failed` + `next` returns `blocked: full-test-failed` + `suggestedOwnerActions` lists corrective Change or cancel; MUST NOT return `action: full-test`.
- **New Scenario "full-test 在 passed 时拒绝"**: `passed` → `allowed: false` + `full-test-already-passed`.
- **"authorize-full-test" Scenario**: Refined "Full Test 未运行" to precise `deliveryFullTestStatus = awaiting-user-decision`.
- **"owner 决策边界不可绕过" Requirement**: Updated `authorize-full-test` description to cite `awaiting-user-decision`; added explicit note that `full-test-failed` is blocked (not owner-decision) because owner has multiple choices (D1-13).
- **"blocked diagnosis 条件" Requirement**: Clarified `full-test-failed` — `deliveryFullTestStatus = failed`; added frozen Section 6 alignment (status preserved, no auto-retry, no auto-create corrective Change, `suggestedOwnerActions` lists options, corrective Change resets to `not-ready`).
- **New Scenario "Full Test failed diagnosis"**: `diagnose` returns `full-test-failed` + `suggestedOwnerActions`; MUST NOT return `action: full-test`; MUST NOT auto-create corrective Change.
- **New Scenario "full-test-failed 后 corrective Change 重置 fullTestStatus"**: After corrective Change resets `fullTestStatus` to `not-ready`, `next` MUST NOT return `blocked: full-test-failed`; corrective Change follows normal rules; MUST NOT auto-retry `full-test`.

### Tasks (tasks.md)

- **4.12** updated: `deliveryFullTestStatus ∈ {awaiting-user-decision, authorized}` (D1-13).
- **4.18** (NEW): Implement `full-test` `failed`/`passed` rejection + `full-test-failed` blocked (D1-13).
- **7.4** updated: Clarified `full-test-failed` reason behavior (suggestedOwnerActions, no auto-retry, no auto-create corrective Change).
- **10.23** (NEW): Table-driven test for `full-test` across all `FullTestStatus` values + corrective Change reset path.

### Conclusion (scratch, .tmp/explore/policy-engine/conclusion.md)

- Section 3.2: Updated `full-test` precondition row.
- Section 3.3: Updated `authorize-full-test` row; added D1-13 note (full-test-failed is blocked, not owner-decision).
- Section 5: Updated `full-test-failed` row; added D1-13 修复 note.
- Section 9: Added "Full Test 生命周期 / full-test eligibility" cross-reference row.

## Verification

- `npx openspec validate policy-engine --strict`: Change 'policy-engine' is valid.
- proposal.md unchanged (SHA-256 matches 081).
- Terminal Runs 075-082 verified unchanged by SHA-256.
- No frozen specs modified, no production/test code written, no manifest modified.
