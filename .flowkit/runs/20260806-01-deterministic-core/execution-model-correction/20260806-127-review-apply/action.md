# Action: review-apply

- Run: `20260806-127-review-apply`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q1 execution-model-correction`
- Role: reviewer
- Reviewed Run: `20260806-126-apply`

## Goal

Independently review the Q1 Apply implementation against the approved Proposal,
Design, delta Specs, Tasks, current production code, tests, and recorded Change
Verification. Verify that the implementation actually enforces the frozen
Core-owned ResultRef authority, exact review binding, generation-aware lifecycle,
completion preflight, verificationSummaryRef lifecycle, archive relocation, and
Bootstrap compatibility contracts.

## Constraints

- Read-only with respect to reviewed production code, tests, proposal artifacts,
  verification.md, and all prior terminal Runs.
- Do not modify reviewed artifacts.
- Do not run Delivery Full Test.
- Do not archive, checkpoint, commit, push, or modify Policy state.
- Record all currently identified blocking findings in one complete review.

## Required output

Write this reviewer Run's terminal result with an evidence-backed verdict,
complete Blocking Findings, Non-blocking Findings, and the Policy-compatible
next-action recommendation.
