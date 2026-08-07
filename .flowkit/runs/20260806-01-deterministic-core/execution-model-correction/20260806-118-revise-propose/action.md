# Action: revise-propose

- Run: `20260806-118-revise-propose`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q1 execution-model-correction`
- Role: author
- Source Review: `20260806-117-review-propose` (`changes-requested`)

## Goal

Resolve all Blocking Findings from 117 with the smallest safe Proposal revision:

1. make the Bootstrap legacy delta parser-recognizable under strict OpenSpec validation;
2. make non-Run Change artifact ResultRefs survive normal OpenSpec archive relocation without rewriting terminal Runs.

## Allowed work

- Modify only Q1 Proposal artifacts: `proposal.md`, `design.md`, the two Q1 delta specs, and `tasks.md`.
- Expand the archive fix to directly affected non-Run artifact ResultRefs when the same root cause applies.
- Run Proposal-level OpenSpec strict validation and lightweight formatting/JSON checks.

## Prohibited work

- Do not modify production code or tests.
- Do not modify approved `explore.md` or prior terminal Runs.
- Do not rewrite D1 Policy semantics.
- Do not run Delivery Full Test.
- Do not archive, checkpoint, commit, push, or create a reviewer Run.

## Required output

A revised Q1 Proposal bundle that resolves Q1-RP-001 and Q1-RP-002 and is ready for an independent `review-propose`.
