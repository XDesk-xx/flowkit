# D1 Review Apply — 090

## Delivery / Change / Action

- Delivery: `20260806-01-deterministic-core`
- Change: `D1 policy-engine`
- Action: `review-apply`
- Role: `reviewer`
- Owner authorization: not required for Review

## Goal

Review `20260806-089-revise-apply` and verify that it resolves D1-RA-001 without weakening the approved requirement that `review-apply` needs Change Verification facts that are both available and passed.

## Inputs

- `.flowkit/runs/20260806-01-deterministic-core/policy-engine/20260806-088-review-apply/result.json`
- `.flowkit/runs/20260806-01-deterministic-core/policy-engine/20260806-089-revise-apply/action.md`
- `.flowkit/runs/20260806-01-deterministic-core/policy-engine/20260806-089-revise-apply/context.json`
- `.flowkit/runs/20260806-01-deterministic-core/policy-engine/20260806-089-revise-apply/result.json`
- `openspec/changes/policy-engine/specs/flowkit-policy-engine/spec.md`
- `src/policy/next.ts`
- `src/policy/preconditions.ts`
- `tests/unit/policy/`

## Allowed work

- Read the listed formal records, implementation, tests, and lifecycle contracts.
- Run ordinary tests, typecheck, build, lint, and OpenSpec strict validation.
- Write only this Review Run's own artifacts.

## Prohibited work

- Do not modify source, tests, Proposal artifacts, frozen specifications, manifest, or prior terminal Runs.
- Do not authorize or execute Archive, Change Checkpoint, Full Test, commit, or push.

## Required output

Write a completed reviewer `result.json` with an `approved` or `changes-requested` verdict, concrete findings, a reviewed-result reference, validation summary, and next-action recommendation.
