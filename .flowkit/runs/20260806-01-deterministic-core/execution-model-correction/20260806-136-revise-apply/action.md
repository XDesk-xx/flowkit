# Action: revise-apply

- Run: `20260806-136-revise-apply`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q1 execution-model-correction`
- Role: author
- Source Review: `20260806-135-review-apply`
- Source Verdict: `changes-requested`

## Goal

Resolve the remaining Blocking Findings from `20260806-135-review-apply`:

- Q1-RA-007: source-review tuple requiredness MUST be Action-owned (revise-*
  requires the complete tuple regardless of field presence) AND the tuple MUST
  prove the Action-owned lineage (revise-explore → admitted review-explore,
  revise-propose → admitted review-propose, revise-apply → admitted
  review-apply) with both the admitted verdict and sourceReviewVerdict being
  `changes-requested`.
- Q1-RA-010: shared Action applicability MUST enforce requiredness from the
  top-level physical result (`runStatus == completed`) + context.action, not
  `actionResult.executionStatus`: completed artifact-producing Run MUST
  structurally carry `producedResultRefs`; completed review-apply MUST carry
  `verificationSummaryRef`. Writer and Reader MUST share the same
  required/forbidden matrix. Superseded historical malformed physical results
  MUST still conflict.

## Constraints

- Do not reopen already-resolved findings (RA-001/003/005/006/008/009) unless a
  regression is actually introduced; then fix only the regression.
- Do not create new Registry / Provider / Gate / Scheduler / second state
  authority.
- Do not self-review; do not archive; do not checkpoint; do not run Full Test.
- Do not auto commit / push; do not modify prior terminal Runs.
