# Action: review-explore

- Run: `20260806-101-review-explore`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q1 execution-model-correction`
- Role: reviewer

## Goal

Perform the complete reviewer assessment of `20260806-100-revise-explore`.
Confirm the two findings from 099 are fully resolved; scan the resulting
Explore against every applicable Q1 scope, Lean Run, provenance, artifact,
verification, terminal-immutability, policy-boundary, and recovery contract.

## Inputs

- `.flowkit/runs/20260806-01-deterministic-core/execution-model-correction/20260806-099-review-explore/{action.md,context.json,result.json}`
- `.flowkit/runs/20260806-01-deterministic-core/execution-model-correction/20260806-100-revise-explore/{action.md,context.json,result.json}`
- `openspec/changes/execution-model-correction/explore.md`
- `openspec/delivery-groups/20260806-01-deterministic-core.yaml`
- `ref/01-deterministic-core-delivery-implementation-reference.md`
- `AGENTS.md`, `docs/{core-model,delivery-lifecycle,verification-model,bootstrap-reference}.md`
- `openspec/specs/{flowkit-domain-and-state-schema,flowkit-formal-fact-reader-and-persistence,flowkit-policy-engine}/spec.md`
- `src/{domain/types,persistence/run-persistence,persistence/result-ref-adapter,persistence/serialization}.ts`

## Allowed work

- Read the complete reviewed artifact and listed formal contracts.
- Verify JSON, provenance hashes, Run-ID ordering, and whitespace/scope evidence.
- Write only this reviewer Run's artifacts.

## Prohibited work

- Do not modify the reviewed Explore, implementation, tests, frozen contracts,
  manifest, or terminal Runs.
- Do not authorize or run Full Test, propose, apply, archive, checkpoint,
  commit, or push.

## Required output

Write a terminal reviewer result with a hash-bound verdict, complete blocking
and non-blocking findings, verification summary, and Policy next-action
recommendation.
