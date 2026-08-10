# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `C1`
- Change ID: `formal-fact-reader-and-persistence`
- Action: `review-explore`
- Role: `reviewer`

## Goal

Independently review the completed C1 revised Explore artifact against frozen Delivery, A1, B1, and integration-boundary contracts. Return a formal verdict.

## Inputs

- Reviewed revision: `.flowkit/runs/20260806-01-deterministic-core/formal-fact-reader-and-persistence/20260806-052-revise-explore/`
- Revised Explore: `openspec/changes/formal-fact-reader-and-persistence/explore.md`
- Frozen docs, A1/B1 specs, and consumed review findings

## Allowed work

- Read inputs and write only this reviewer Run.
- Return a formal verdict with blocking and non-blocking findings.

## Prohibited work

- Do not modify source, tests, Explore artifacts, Delivery Manifest, frozen docs/specs, or prior Runs.
- Do not run Full Test, commit, or push.

## Required output

- `result.json` bound to the reviewed revision result.
