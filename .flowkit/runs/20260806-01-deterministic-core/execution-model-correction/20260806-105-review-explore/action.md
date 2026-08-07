# Action: review-explore

- Run: `20260806-105-review-explore`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q1 execution-model-correction`
- Role: reviewer

## Goal

Perform the complete reviewer assessment of `20260806-104-revise-explore`.
Verify that the closed schema and reviewer-result design resolves Q1-RE-003
without violating content-hash serialization, and rescan all Q1 ResultRef
provenance paths, not only `context.inputRef`.

## Inputs

- `.flowkit/runs/20260806-01-deterministic-core/execution-model-correction/20260806-103-review-explore/{action.md,context.json,result.json}`
- `.flowkit/runs/20260806-01-deterministic-core/execution-model-correction/20260806-104-revise-explore/{action.md,context.json,result.json}`
- `openspec/changes/execution-model-correction/explore.md`
- `openspec/delivery-groups/20260806-01-deterministic-core.yaml`
- `ref/01-deterministic-core-delivery-implementation-reference.md`
- `AGENTS.md`, `docs/{core-model,delivery-lifecycle,verification-model,bootstrap-reference}.md`
- `openspec/specs/{flowkit-domain-and-state-schema,flowkit-formal-fact-reader-and-persistence,flowkit-policy-engine}/spec.md`
- `src/{domain/types,persistence/run-persistence,persistence/result-ref-adapter,persistence/serialization}.ts`

## Allowed work

- Read the complete reviewed artifact and all listed formal contracts.
- Verify JSON, source hashes, Run ordering, scope, whitespace, and canonical
  OpenSpec-spec structure.
- Write only this reviewer Run's artifacts.

## Prohibited work

- Do not modify the reviewed Explore, implementation, tests, frozen contracts,
  manifest, or terminal Runs.
- Do not authorize or run Full Test, propose, apply, archive, checkpoint,
  commit, or push.

## Required output

Write a terminal reviewer result with complete blocking/non-blocking findings,
a hash-bound verdict, validation summary, and Policy next-action recommendation.
