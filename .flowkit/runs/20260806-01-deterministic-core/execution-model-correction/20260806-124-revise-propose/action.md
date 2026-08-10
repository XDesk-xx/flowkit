# Action: revise-propose

- Run: `20260806-124-revise-propose`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q1 execution-model-correction`
- Role: author
- Source Review: `20260806-123-review-propose` (`changes-requested`)

## Goal

Resolve Q1-RP-006 with the smallest safe Proposal revision.

The revision must make complete `specs/**` namespace coverage an invariant of every
current propose effective generation, including `revise-propose` successors, while
preserving the accepted subset-overlay behavior when the specs namespace is unchanged.

## Allowed work

- Modify only Q1 Proposal artifacts needed by Q1-RP-006.
- Run OpenSpec 1.7.0 Change strict validation.
- Run lightweight JSON and whitespace checks.

## Prohibited work

- Do not modify production code or tests.
- Do not modify approved `explore.md` or prior terminal Runs.
- Do not create an artifact snapshot/history store.
- Do not broaden into F1 verification-script implementation.
- Do not run Delivery Full Test.
- Do not archive, checkpoint, commit, push, or create a reviewer Run.

## Required output

A revised Q1 Proposal bundle that closes Q1-RP-006 and is ready for an independent
`review-propose`.
