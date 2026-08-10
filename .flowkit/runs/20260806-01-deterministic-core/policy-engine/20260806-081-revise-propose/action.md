# revise-propose: D1 policy-engine — 081

## Delivery / Change / Action

- Delivery: `20260806-01-deterministic-core`
- Change: `D1 policy-engine`
- Action: `revise-propose`
- Role: `author`
- Owner authorization: explicit

## Goal

Resolve `20260806-080-review-propose` blocking findings **D1-PR-003** (P1) and **D1-PR-004** (P1):

- **D1-PR-003**: Archive gate omitted mandatory task completion (required by
  `docs/delivery-lifecycle.md` Section 3.5 "Tasks 已完成") and had no fail-closed behavior when the
  required fact is unavailable. C1 `FormalFactSnapshot` exposes `change-tasks` existence only, no
  task-completion status.
- **D1-PR-004**: `delivery-finalize` permitted an unrepresentable "Full Test not-applicable" state.
  B1 `FullTestStatus = not-ready | awaiting-user-decision | authorized | passed | failed` has NO
  `not-applicable` value; `not-applicable` belongs to Change `VerificationStatus`, not Delivery
  `FullTestStatus`.

Both are **content defects** in the Proposal bundle (spec/design/tasks). D1-PR-001 (provenance) and
D1-PR-002 (canRun(review-S) contradiction) remain resolved.

## Source review

- Run: `20260806-080-review-propose`
- Verdict: `changes-requested`
- Reviewed Run: `20260806-079-revise-propose` (SHA-256 `709ddb70…`)
- Blocking Findings:
  - **D1-PR-003** (P1): Archive gate omits mandatory task completion + no fail-closed behavior
    - Required: add task completion as Archive prerequisite; specify distinct fail-closed
      `tasks-facts-unavailable` diagnosis until upstream snapshot extension; do not infer completion
      from artifact existence / Run history / chat; update Design/Spec/Tasks/Archive decision path.
  - **D1-PR-004** (P1): delivery-finalize permits unrepresentable Full Test not-applicable
    - Required: require `snapshot.deliveryFullTestStatus = passed` for delivery-finalize; add negative
      table-driven coverage for every non-passed FullTestStatus; remove "Full Test not-applicable" from
      Design/Spec/Tasks/decision rules; must not conflate with Change Verification not-applicable.

## D1-PR-003 fix

### spec.md changes

1. **Requirement "Change-level Action 前置条件矩阵" description**: added "Tasks 事实可用且全部完成"
   to `archive` precondition; added fail-closed clause — when Tasks completion facts unavailable,
   `canRun(archive)` returns `allowed: false` with `tasks-facts-unavailable`, `next` returns
   `blocked: tasks-facts-unavailable` (D1-11).
2. **Updated Scenario "archive 需 apply approved + findings 清零 + Verification passed + Tasks 完成 + owner 授权"**:
   added "Tasks 完成事实可用且全部完成" condition.
3. **New Scenario "Tasks 完成事实不可用时 archive blocked"**: proves `canRun(archive)` returns
   `allowed: false` + `tasks-facts-unavailable` when facts unavailable; `next` blocked; MUST NOT infer.
4. **Requirement "blocked diagnosis 条件"**: added `tasks-facts-unavailable` to reason list; added
   distinction clause vs `verification-facts-unavailable`.
5. **New Scenario "Tasks 完成事实不可用 diagnosis"**: `diagnose` returns `tasks-facts-unavailable`,
   MUST NOT return `verification-facts-unavailable`.

### design.md changes

6. **New design decision D1-11**: "Archive task-completion gate + tasks-facts-unavailable fail-closed"
   — documents delivery-lifecycle.md Section 3.5 requirement, C1 snapshot gap, fail-closed handling
   parallel to D1-7, and strict distinction from `verification-facts-unavailable`.

### tasks.md changes

7. **Fixed 1.6**: added `tasks-facts-unavailable` to `BlockedReason` union.
8. **Fixed 4.11**: added "Tasks 完成事实可用且全部完成（不可用 → unmet `tasks-facts-unavailable`，D1-11）".
9. **Fixed 7.4**: added `tasks-facts-unavailable` to diagnose reasons.
10. **New 4.16**: implement archive Tasks completion gate (D1-11).
11. **New 10.21**: table-driven test for archive `tasks-facts-unavailable` (incl. distinction from
    `verification-facts-unavailable` and no-inference assertion).

## D1-PR-004 fix

### spec.md changes

12. **Requirement "Delivery-level Action 前置条件" description**: replaced "Full Test passed 或
    not-applicable" with "`snapshot.deliveryFullTestStatus` = passed"; added B1 `FullTestStatus` enum
    citation (no `not-applicable`); added that any non-passed value (incl. `undefined`) → `allowed: false`
    (D1-12).
13. **Updated Scenario "delivery-finalize 前置条件"**: condition is now
    "`snapshot.deliveryFullTestStatus` = passed".
14. **New Scenario "delivery-finalize 在非 passed FullTestStatus 时拒绝"**: table-driven negative
    coverage for `{not-ready, awaiting-user-decision, authorized, failed, undefined}`; asserts
    `not-applicable` not accepted as FullTestStatus.

### design.md changes

15. **New design decision D1-12**: "delivery-finalize requires FullTestStatus=passed（无 not-applicable）"
    — documents B1 enum, Change VerificationStatus distinction, complementarity with `full-test`
    action, and extensibility path (future B1 enum extension).

### tasks.md changes

16. **Fixed 4.13**: "`snapshot.deliveryFullTestStatus` = passed（任意非 passed 值含 undefined → unmet
    `full-test-not-passed`，D1-12；MUST NOT 接受 `not-applicable`）".
17. **New 4.17**: implement delivery-finalize strict `deliveryFullTestStatus = passed` gate (D1-12).
18. **New 10.22**: table-driven test for delivery-finalize non-passed FullTestStatus (5 values) +
    `not-applicable` rejection assertion.

## Conclusion (scratch) alignment

The explore conclusion (`.tmp/explore/policy-engine/conclusion.md`, gitignored) is aligned to
maintain 0 spec↔conclusion contradictions:
- Section 3.1 archive row: added Tasks completion + `tasks-facts-unavailable` (D1-11).
- Section 3.2 delivery-finalize row: `deliveryFullTestStatus = passed` (D1-12), removed not-applicable.
- Section 4.2 apply decision tree: added Tasks check branch before authorize-archive.
- Section 5 blocked diagnosis table: added `tasks-facts-unavailable` row.
- Section 1.3 snapshot availability matrix: added "Tasks completion status" row.
- Added D1-11/D1-12 修复 notes parallel to D1-EX-002 note.

## Allowed work

- Modify `openspec/changes/policy-engine/` proposal bundle (spec.md, design.md, tasks.md).
- Align `.tmp/explore/policy-engine/conclusion.md` (gitignored scratch) for 0 contradictions.
- Read formal docs, frozen specs, conclusion, and prior Runs.
- Re-run `openspec validate policy-engine --strict`.

## Prohibited work

- Do not modify 075/076/077/078/079/080 (terminal Run immutability).
- Do not modify `proposal.md` (no motivation/scope/impact change needed).
- Do not modify frozen specs, manifest, production code, or tests.
- Do not run Full Test, checkpoint, archive, commit, or push.

## Required output

Write a completed author `result.json` with: D1-PR-003 and D1-PR-004 resolved; modified artifact
hashes; a **full consistencyScan** covering all cross-reference dimensions of the modified concepts
(Archive task-completion gate, delivery-finalize FullTestStatus, blocked reasons, FullTestStatus vs
VerificationStatus distinction, spec↔design↔tasks↔conclusion↔delivery-lifecycle↔B1 types↔C1 snapshot
consistency, D1-PR-002 regression, terminal Run immutability); `nextAction: review-propose`.
