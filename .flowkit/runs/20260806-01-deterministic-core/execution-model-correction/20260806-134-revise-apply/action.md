# Action: revise-apply

- Run: `20260806-134-revise-apply`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q1 execution-model-correction`
- Role: author
- Source Review: `20260806-133-review-apply`
- Source Verdict: `changes-requested`

## Goal

Resolve all Blocking Findings from `20260806-133-review-apply`:

- Q1-RA-006: review exact-binding MUST become one shared fail-closed invariant
  used by context admission / terminal preflight / formal Reader / sibling-lineage
  admission.
- Q1-RA-007: source-review evidence (`sourceReviewRun` + `sourceReviewVerdict` +
  `reviewVerdictRef`) MUST become one complete immutable tuple; any missing
  counterpart or unadmitted source review fails closed.
- Q1-RA-010: Action-owned ResultRef applicability MUST be one shared validator
  used by both writer/terminal preflight and `admitC1RunResult`/Reader admission.

Not per-file patching: converge the three findings into three shared invariants.

## Constraints

- Preserve 132 resolutions for RA-001 / RA-003 / RA-005 / RA-008 / RA-009.
- Do not modify 133.
- Do not reopen prior terminal Runs.
- Do not run Delivery Full Test.
- Do not create 135-review-apply.
- Do not archive or checkpoint.
- Do not self-review.
- Do not introduce new registry/platform/provider abstractions.
- Do not rewrite the generation resolver.
- Do not modify approved contracts.
