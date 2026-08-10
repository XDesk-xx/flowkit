# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `C1`
- Change ID: `formal-fact-reader-and-persistence`
- Action: `review-explore`
- Role: `reviewer`

## Goal

Independently review the completed C1 Explore artifact against frozen Delivery, B1, and A1 contracts. Return a formal verdict and findings.

## Inputs

- Delivery Manifest: `openspec/delivery-groups/20260806-01-deterministic-core.yaml`
- Explored Run: `.flowkit/runs/20260806-01-deterministic-core/formal-fact-reader-and-persistence/20260806-036-explore/`
- Explore artifact: `openspec/changes/formal-fact-reader-and-persistence/explore.md`
- Frozen docs and A1/B1 frozen specs and source contracts

## Allowed work

- Read the listed formal inputs and write only this reviewer Run.
- Return a formal verdict with blocking and non-blocking findings.

## Prohibited work

- Do not modify source, tests, Explore artifacts, Delivery Manifest, frozen docs/specs, or prior Runs.
- Do not run Full Test, commit, or push.

## Required output

- `result.json` with a verdict bound to the reviewed Explore result.
