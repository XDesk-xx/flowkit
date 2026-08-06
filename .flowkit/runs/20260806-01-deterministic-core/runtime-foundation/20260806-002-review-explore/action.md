# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `A1`
- Change ID: `runtime-foundation`
- Action: `review-explore`
- Role: `reviewer`

## Goal

Independently review the complete A1 Explore result and determine whether it is sufficiently correct, complete, and within the frozen Delivery boundary to proceed to `propose`.

## Inputs

- Delivery Manifest: `openspec/delivery-groups/20260806-01-deterministic-core.yaml`
- Reviewed Author Run: `.flowkit/runs/20260806-01-deterministic-core/runtime-foundation/20260806-001-explore/`
- Explore artifact: `openspec/changes/runtime-foundation/explore.md`
- Frozen product and integration specifications
- Delivery implementation reference: `ref/01-deterministic-core-delivery-implementation-reference.md`

## Allowed work

- Read the fixed inputs and run read-only, applicable checks.
- Write only this reviewer Run.
- Return a formal verdict with blocking and non-blocking findings.

## Prohibited work

- Do not modify the Explore artifact, Delivery Manifest, frozen docs/specs, or prior Runs.
- Do not create Proposal, Design, Spec, Tasks, production code, or tests.
- Do not run Full Test, commit, or push.
