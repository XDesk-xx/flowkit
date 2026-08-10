# Action: review-explore

- Run: `20260806-099-review-explore`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q1 execution-model-correction`
- Role: reviewer

## Goal

Review `20260806-098-explore` against the owner-updated `ref/` implementation
references, the active Delivery manifest, frozen formal contracts, and the
current persistence implementation. Determine whether the Explore gives Q1 a
scope-correct, implementable path to Lean Run and Core-owned ResultRef
provenance.

## Inputs

- `.flowkit/runs/20260806-01-deterministic-core/execution-model-correction/20260806-098-explore/{action.md,context.json,result.json}`
- `openspec/changes/execution-model-correction/explore.md`
- `openspec/delivery-groups/20260806-01-deterministic-core.yaml`
- `ref/01-deterministic-core-delivery-implementation-reference.md`
- `docs/{core-model,delivery-lifecycle,verification-model,bootstrap-reference}.md`
- `openspec/specs/{flowkit-domain-and-state-schema,flowkit-formal-fact-reader-and-persistence,flowkit-policy-engine}/spec.md`
- `src/persistence/{run-persistence,result-ref-adapter,serialization}.ts`

## Allowed work

- Read the listed formal records, references, and implementation evidence.
- Write only this reviewer Run's artifacts.

## Prohibited work

- Do not modify the reviewed Explore, production code, tests, frozen contracts,
  manifest, or prior terminal Runs.
- Do not authorize or run Full Test, propose, apply, archive, checkpoint,
  commit, or push.

## Required output

Write a terminal reviewer result with an `approved` or `changes-requested`
verdict, the hash-bound reviewed result, concrete findings, and the Policy
next-action recommendation.
