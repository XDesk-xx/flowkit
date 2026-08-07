# 20260806-085-revise-propose

## Action

revise-propose (author)

## Reviewed Run

20260806-084-review-propose (verdict: changes-requested; blocking finding: D1-PR-006)

## Trigger Finding

**D1-PR-006 (P1)**: full-test is permitted before the Delivery reaches authorized

- **Evidence**: 083 permitted `full-test` for `deliveryFullTestStatus ∈ {awaiting-user-decision, authorized}`. Frozen `verification-model.md` Section 4.2 defines `awaiting-user-decision → authorized → passed|failed` and states "未 authorized 时不得执行 Full Test". `awaiting-user-decision` is a pre-authorization state; including it permits Policy to bypass the explicit Delivery substate transition to `authorized`.
- **Root cause**: 083 misinterpreted D1-PR-005's requiredChange wording ("awaiting-user-decision or explicitly authorized, as appropriate to the action boundary") as meaning both states are eligible. The frozen model is unambiguous: only `authorized` permits Full Test execution.
- **Required change**: Require `deliveryFullTestStatus = authorized` for `canRun(full-test)`. In `awaiting-user-decision`, `next` must return `authorize-full-test`. Add table-driven cases showing `awaiting-user-decision` is never runnable, `authorized` is runnable only with required authorization, `failed`/`passed` remain non-runnable.

## Fix Applied

### Spec (spec.md)

- **"Delivery-level Action 前置条件" Requirement description**: Changed `full-test` precondition from `deliveryFullTestStatus ∈ {awaiting-user-decision, authorized}` to `deliveryFullTestStatus = authorized` (frozen Section 4.2: "未 authorized 时不得执行 Full Test"; `awaiting-user-decision` is pre-authorization → `owner-decision: authorize-full-test`).
- **"full-test 前置条件" Scenario**: Condition changed to `deliveryFullTestStatus = authorized`.
- **New Scenario "full-test 在 awaiting-user-decision 时拒绝"**: `awaiting-user-decision` → `allowed: false` + `full-test-not-authorized` + `next` returns `owner-decision: authorize-full-test`; MUST NOT return `action: full-test` (frozen Section 4.2).
- Existing scenarios for `failed` (blocked) and `passed` (rejected) remain unchanged from 083.

### Design (design.md)

- **D1-13 title**: Updated to "full-test eligibility restricted to authorized；awaiting-user-decision → owner-decision；failed → blocked".
- **D1-13 description**: Documents that 083's `{awaiting-user-decision, authorized}` was incorrect (D1-PR-006); 085 restricts to `authorized` only — the unique correct reading of frozen Section 4.2.
- **FullTestStatus × full-test behavior matrix**: `awaiting-user-decision` row updated to `allowed: false` + `owner-decision: authorize-full-test` (was: `allowed: true` in 083).
- **New "授权转换模型" section**: Documents the `awaiting-user-decision → authorized` transition triggered by owner authorization, atomic update responsibility (C1), and D1's read-only view of `deliveryFullTestStatus` as authoritative.
- **D1-12 complementarity reference**: Updated from `{awaiting-user-decision, authorized}` to `= authorized`.

### Tasks (tasks.md)

- **4.12** updated: `deliveryFullTestStatus = authorized`; `awaiting-user-decision` → `allowed: false` + `full-test-not-authorized` + `owner-decision: authorize-full-test`.
- **4.18** updated: Added `awaiting-user-decision` rejection behavior (was: only `failed`/`passed` in 083).
- **10.23** updated: `authorized` is the ONLY allowed state; `awaiting-user-decision` → `allowed: false` + `owner-decision: authorize-full-test`; added `authorized` + no full-test scope → `owner-decision` (defensive fail-closed); corrective Change reset note clarified (re-enters `awaiting-user-decision`, still not `authorized`, needs re-authorization).

### Conclusion (scratch, .tmp/explore/policy-engine/conclusion.md)

- Section 3.2: Updated `full-test` precondition row to `= authorized`.
- Section 3.3: Updated D1-13 note (085-revise-propose).
- Section 5: Updated D1-13 修复 note (documents 083→085 progression).
- Section 9: Updated Full Test 生命周期 cross-reference row.

## Verification

- `npx openspec validate policy-engine --strict`: Change 'policy-engine' is valid.
- proposal.md unchanged (SHA-256 matches 083).
- Terminal Runs 075-084 verified unchanged by SHA-256.
- No remaining `{awaiting-user-decision, authorized}` as a full-test accepting condition (all occurrences are rejection lists or state-machine descriptions).
- No frozen specs modified, no production/test code written, no manifest modified.
