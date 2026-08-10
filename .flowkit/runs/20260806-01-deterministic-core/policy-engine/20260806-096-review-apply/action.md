# D1 Review Apply — 096

## Delivery / Change / Action

- Delivery: `20260806-01-deterministic-core`
- Change: `D1 policy-engine`
- Action: `review-apply`
- Role: `reviewer`
- Owner authorization: not required for Review

## Goal

Review `20260806-095-revise-apply` against D1-RA-004. Confirm that the Change-owned `verification.md` reflects the latest revision evidence and that it remains a Change Verification record distinct from Delivery Full Test.

## Inputs

- `.flowkit/runs/20260806-01-deterministic-core/policy-engine/20260806-094-review-apply/result.json`
- `.flowkit/runs/20260806-01-deterministic-core/policy-engine/20260806-095-revise-apply/{action.md,context.json,result.json}`
- `openspec/changes/policy-engine/{verification.md,tasks.md}`
- `docs/{verification-model,delivery-lifecycle}.md`

## Allowed work

- Read the listed formal records and contracts.
- Run ordinary tests, typecheck, build, lint, and OpenSpec strict validation.
- Write only this Review Run's own artifacts.

## Prohibited work

- Do not modify source, tests, Change artifacts, frozen specifications, manifest, or prior terminal Runs.
- Do not authorize or execute Archive, Change Checkpoint, Full Test, commit, or push.

## Required output

Write a completed reviewer `result.json` with an `approved` or `changes-requested` verdict, concrete findings, reviewed-result reference, validation summary, and next-action recommendation.
