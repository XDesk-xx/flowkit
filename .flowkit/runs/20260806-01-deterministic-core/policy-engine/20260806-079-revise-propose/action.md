# revise-propose: D1 policy-engine — 079

## Delivery / Change / Action

- Delivery: `20260806-01-deterministic-core`
- Change: `D1 policy-engine`
- Action: `revise-propose`
- Role: `author`
- Owner authorization: explicit

## Goal

Resolve `20260806-078-review-propose` blocking finding **D1-PR-002** (P1): the Spec's
`canRun(review-S)` precondition permitted `review-S` when the matching Verdict was
`changes-requested`, conflicting with the lineage model's `match + changes-requested → revise-S`
and allowing unified review to bypass the required Revision.

This is a **content defect** (not provenance): the spec description and tasks included an
erroneous `OR match+changes-requested` condition for `review-S`. The conclusion's concrete
condition was correct, but the spec/tasks inherited a contradictory wording.

## Source review

- Run: `20260806-078-review-propose`
- Verdict: `changes-requested`
- Reviewed Run: `20260806-077-revise-propose` (SHA-256 `cd53dde2…`)
- Blocking Finding:
  - **D1-PR-002** (P1): review-S precondition permits a Review when the matching Verdict requires Revision
    - Required: `canRun(review-S)` allowed only when no current review or no lineage match;
      match+changes-requested allows only revise-S; remove contradictory condition; add table-driven
      scenarios proving unified review blocks until revision produces a new artifact; update
      Design/Spec/Tasks consistently; do not alter prior Runs.

## D1-PR-002 fix

### spec.md changes

1. **Requirement "Change-level Action 前置条件矩阵" description**: removed `OR match+changes-requested`
   from `review-explore`; added explicit statement that `canRun(review-S)` MUST return `allowed: false`
   on lineage match + changes-requested; added `review-propose` and `review-apply` preconditions with
   correct lineage conditions.
2. **New Scenario "review-S 在 match+changes-requested 时拒绝"**: proves `canRun(review-S)` returns
   `allowed: false` with `matching-changes-requested-requires-revision` when match+cr.
3. **New Scenarios "review-propose 允许在无 lineage match 时执行" / "review-apply 允许在无 lineage match 时执行"**:
   explicit lineage conditions for all stages.
4. **Updated Scenario "review-apply 需 Verification 事实可用且 passed"**: added lineage condition.
5. **Requirement "统一 review/revise 入口解析"**: added Scenarios "统一 review 在 match+changes-requested
   时 blocked" and "统一 review 在 revise-S 完成后恢复 allowed" — proves unified review blocks until
   revise-S produces a new artifact.

### design.md changes

6. **New design decision D1-10**: `canRun(review-S) blocks on match+changes-requested` — formalizes
   the `next` ↔ `canRun` consistency for review-S; documents relationship to D1-8.

### tasks.md changes

7. **Fixed 4.3 / 4.6 / 4.9**: removed `OR match+changes-requested`; added explicit
   `match+changes-requested 时返回 allowed: false (D1-10)`.
8. **New 4.15**: implement `canRun(review-S)` blocking on match+cr for all 3 stages.
9. **New 9.5**: table-driven test for unified review blocking/restoring.
10. **New 10.20**: table-driven test for `canRun(review-S)` blocking across all stages.

## Allowed work

- Modify `openspec/changes/policy-engine/` proposal bundle (spec.md, design.md, tasks.md).
- Read formal docs, frozen specs, conclusion, and prior Runs.
- Re-run `openspec validate policy-engine --strict`.

## Prohibited work

- Do not modify 075/076/077/078 (terminal Run immutability).
- Do not modify `proposal.md` (no content change needed).
- Do not modify frozen specs, manifest, production code, or tests.
- Do not run Full Test, checkpoint, archive, commit, or push.

## Required output

Write a completed author `result.json` with: D1-PR-002 resolved; modified artifact hashes;
a **full consistencyScan** covering all cross-reference dimensions of the modified concept
(`canRun(review-S)` precondition, unified review entry, lineage model, spec↔design↔tasks↔conclusion↔delivery-lifecycle
consistency); `nextAction: review-propose`.
