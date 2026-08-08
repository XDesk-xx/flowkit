# Action: revise-apply

- Run: `20260806-138-revise-apply`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q1 execution-model-correction`
- Role: author
- Source Review: `20260806-137-review-apply` (`changes-requested`)

## Goal

Resolve the remaining Q1-RA-007 Blocking Finding from Run 137 without changing the approved Q1 contract.

The Reader must make source-review integrity an admission boundary for generation classification:

1. pending `revise-*` validates only context-level predecessor review lineage and does not require terminal-only `reviewVerdictRef`;
2. completed `revise-*` still validates the complete immutable source-review tuple;
3. only integrity-admitted pending/completed revise Runs can establish revision-window or superseded generation semantics.

## Constraints

- Preserve RA-001/003/005/006/008/009/010 behavior.
- Do not run Delivery Full Test without owner authorization.
- Do not archive, checkpoint, commit, push, or alter Delivery state.
