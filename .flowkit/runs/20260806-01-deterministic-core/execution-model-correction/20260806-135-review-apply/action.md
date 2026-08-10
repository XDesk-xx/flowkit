# Action: review-apply

- Run: `20260806-135-review-apply`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q1 execution-model-correction`
- Role: reviewer
- Reviewed Run: `20260806-134-revise-apply`
- Source Review: `20260806-133-review-apply` (`changes-requested`)

## Goal

Independently and comprehensively review `20260806-134-revise-apply` against
the approved Q1 Proposal, Design, delta Specs, Tasks, all current-stage
invariants, the Blocking Findings from Run 133, the actual production
implementation, Reader/recovery behavior, tests, and current Change
Verification.

The review must verify shared-invariant parity across Writer / terminal
preflight / FormalFact Reader / sibling-lineage recovery, not merely confirm
that the Author added helpers or that the recorded test suite is green.

## Constraints

- Read-only with respect to reviewed production code, tests, OpenSpec artifacts,
  verification.md, and all prior terminal Runs.
- Do not modify reviewed artifacts.
- Do not run Delivery Full Test.
- Do not archive, checkpoint, commit, push, or modify Policy state.
- Record all currently identified Blocking Findings in one review.

## Required output

Write this reviewer Run's terminal result with an evidence-backed verdict,
complete Blocking Findings, resolved prior findings, verification reviewed,
and the Policy-compatible next-action recommendation.
