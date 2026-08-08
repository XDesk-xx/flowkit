# Action: revise-apply

- Run: `20260806-140-revise-apply`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q1 execution-model-correction`
- Role: author
- Source Review: `20260806-139-review-apply` (`changes-requested`)

## Goal

Resolve the remaining Q1-RA-007 Blocking Finding from Run 139 while preserving the Run-138 admission boundary.

The Reader must complete the two-stage boundary before mutable generation classification:

1. `failed/cancelled revise-*` validates only physically applicable immutable facts and never requires terminal-only `reviewVerdictRef`;
2. pending/completed revise eligibility is decided from the complete per-Run set of applicable immutable validation results, not source-review lineage alone;
3. any invalid applicable `inputRef`, `consumedInputRefs`, or source-review evidence excludes the revise Run from revision-window/supersession successor eligibility;
4. invalid successors cannot hide predecessor artifact or verification replacement conflicts.

## Constraints

- Preserve the Run-138 fixes: pending does not require `reviewVerdictRef`; completed source-review tuple remains strict.
- Preserve matching review stage and `changes-requested`-only lineage.
- Preserve RA-006/008/009/010 behavior.
- Do not run Delivery Full Test without owner authorization.
- Do not archive, checkpoint, commit, push, or alter Delivery state.
