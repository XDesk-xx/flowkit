# Action: review-apply

- Run: `20260806-131-review-apply`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q1 execution-model-correction`
- Role: reviewer
- Reviewed Run: `20260806-130-revise-apply`
- Source Review: `20260806-129-review-apply` (`changes-requested`)

## Goal

Independently review `20260806-130-revise-apply` against the approved Q1
Proposal, Design, delta Specs, Tasks, the Blocking Findings from Run 129, the
current production implementation, Reader recovery behavior, tests, and current
Change Verification.

This is a complete review of the current stage. It must verify both directions
of the frozen contract:

1. production write paths are mechanically unbypassable; and
2. Reader/review-entry recovery paths fail closed when persisted schemaVersion 2
   facts are malformed, tampered, incomplete, or incorrectly bound.

## Constraints

- Read-only with respect to reviewed production code, tests, OpenSpec artifacts,
  verification.md, and all prior terminal Runs.
- Do not modify reviewed artifacts.
- Do not run Delivery Full Test.
- Do not archive, checkpoint, commit, push, or modify Policy state.
- Record all currently identified Blocking Findings in one review.

## Required output

Write this reviewer Run's terminal result with an evidence-backed verdict,
complete Blocking Findings, resolved prior findings, verification reviewed, and
the Policy-compatible next-action recommendation.
