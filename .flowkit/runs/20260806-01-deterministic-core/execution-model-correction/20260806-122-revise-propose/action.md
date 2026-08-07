# Action: revise-propose

- Run: `20260806-122-revise-propose`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q1 execution-model-correction`
- Role: author
- Source Review: `20260806-121-review-propose` (`changes-requested`)

## Goal

Resolve Q1-RP-004 and Q1-RP-005 with the smallest safe Proposal revision.

The revision must:
1. make the affected OpenSpec Requirement unambiguously parser-recognizable with an explicit MUST/SHALL;
2. make the initial explore/propose artifact generation complete by construction, so empty or partial initial produced refs cannot enter review;
3. preserve the generation-aware subset overlay already accepted for revise-* successors.

## Allowed work

- Modify only Q1 Proposal artifacts needed by the two findings.
- Run the OpenSpec 1.7.0 Change strict CLI validation.
- Run lightweight JSON and whitespace checks.

## Prohibited work

- Do not modify production code or tests.
- Do not modify approved `explore.md` or prior terminal Runs.
- Do not broaden into F1 verification-script implementation.
- Do not create an artifact snapshot/history store.
- Do not run Delivery Full Test.
- Do not archive, checkpoint, commit, push, or create a reviewer Run.

## Required output

A revised Q1 Proposal bundle that closes Q1-RP-004 / Q1-RP-005 and is ready for an independent `review-propose`.
