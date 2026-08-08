# Action: revise-apply

- Run: `20260806-142-revise-apply`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q1 execution-model-correction`
- Role: author
- Source Review: `20260806-141-review-apply` (`changes-requested`)

## Goal

Resolve Blocking Finding Q1-RA-011 while preserving the C1 admission behavior completed in Run 140.

The Reader must retain physical-format provenance long enough to keep the two contracts separate:

1. schemaVersion 2/C1 Runs continue through strict immutable ResultRef and generation validation;
2. schemaVersion 1 Bootstrap Runs continue through bounded legacy semantics and are not retroactively required to synthesize C1 source-review, produced-artifact, or verification-summary ResultRefs;
3. legacy completed revise/review/artifact Runs cannot enter C1-only generation validation merely because their minimal RunFact has the same action/status;
4. unknown schemaVersion remains fail-closed.

## Constraints

- Do not rewrite or supplement any historical schemaVersion 1 terminal Run.
- Preserve Run-140 pending/completed/failed/cancelled C1 revise admission behavior.
- Preserve RA-006/007/008/009/010 behavior.
- Do not introduce a new product Registry/Provider or a second Run domain model.
- Do not run Delivery Full Test without owner authorization.
- Do not archive, checkpoint, commit, push, or alter Delivery state.
