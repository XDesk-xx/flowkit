# Action: review-apply

- Run: `20260806-133-review-apply`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q1 execution-model-correction`
- Role: reviewer
- Reviewed Run: `20260806-132-revise-apply`
- Source Review: `20260806-131-review-apply` (`changes-requested`)

## Goal

Independently review `20260806-132-revise-apply` against the approved Q1
Proposal, Design, delta Specs, Tasks, the four Blocking Findings from Run 131,
the current production implementation, Reader/review-entry recovery behavior,
tests, and current Change Verification.

The review must verify that invalid schemaVersion 2 persisted facts are both:

1. impossible to terminal-publish through a production-reachable path; and
2. impossible to promote or consume as valid formal facts during Reader or
   review-entry recovery.

The review is complete-current-stage review, not a spot check of Author claims.

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
