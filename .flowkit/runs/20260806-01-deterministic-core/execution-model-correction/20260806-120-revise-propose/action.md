# Action: revise-propose

- Run: `20260806-120-revise-propose`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q1 execution-model-correction`
- Role: author
- Source Review: `20260806-119-review-propose` (`changes-requested`)

## Goal

Resolve Q1-RP-003 with the smallest safe Proposal revision.

The fix must define one complete mutable artifact lifecycle across:

`propose → review-propose changes-requested → revise-propose → review-propose → archive`

without rewriting terminal Runs, weakening review exact binding, or introducing a per-Run artifact snapshot/history store.

## Allowed work

- Modify only Q1 Proposal artifacts: `proposal.md`, `design.md`, the two Q1 delta specs, and `tasks.md`.
- Apply the same root-cause rule to other mutable non-Run Change refs directly affected by revision, especially `verificationSummaryRef`.
- Run Proposal-level OpenSpec strict validation and lightweight formatting/JSON checks.

## Prohibited work

- Do not modify production code or tests.
- Do not modify approved `explore.md` or prior terminal Runs.
- Do not rewrite D1 Policy semantics.
- Do not create an artifact/evidence history registry.
- Do not run Delivery Full Test.
- Do not archive, checkpoint, commit, push, or create a reviewer Run.

## Required output

A revised Q1 Proposal bundle that closes Q1-RP-003 and is ready for an independent `review-propose`.
