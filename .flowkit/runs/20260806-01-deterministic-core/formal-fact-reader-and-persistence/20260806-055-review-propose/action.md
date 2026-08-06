# 20260806-055-review-propose

- Action: `review-propose`
- Role: reviewer
- Status: completed

Reviewed the completed `20260806-054-propose` artifacts for Change `formal-fact-reader-and-persistence` against the active delivery manifest, B1 lifecycle contracts, and the repository's existing formal Run records.

Verdict: `changes-requested`

## Findings

### C1-PR-001 (P1): YAML manifest parsing contract is not frozen

The proposal and task 1.8 only say that a handwritten minimal YAML subset is preferred. They do not define the supported grammar, unsupported-syntax failure behavior, parser module, error mapping, or fixtures. The active Delivery manifest uses nested mappings, scalar lists, mapping lists, quoted and unquoted scalars, blank lines, and a folded block scalar. With no runtime YAML dependency and no exact handwritten-parser contract, implementation would be underspecified and could silently misread formal facts.

Required revision: define the parser/reader module and the exact supported YAML subset sufficient for the formal manifests; require fail-closed handling for unsupported or malformed input; map parse failures to the reader error contract; and add fixtures/tests for every supported construct plus malformed input.

### C1-PR-002 (P1): `context.json` has no physical schema or validation contract

Tasks 3.2 and 4.2 make `context.json` a required Run file and use it to reconstruct a pending Run, but the proposal, design, tasks, and spec do not define its required fields, schema version, relationship to the B1 `Run` model, serialization/validation, path-to-content consistency checks, or failure behavior. Therefore `createRun`, `writeRunResult`, and recovery cannot deterministically establish or validate the current Run before terminal publication.

Required revision: define a C1-owned versioned `RunContextFile` schema, its exact projection to/from B1 `Run`, required pending-state and location/identity checks, and fail-closed errors for missing, malformed, or mismatched context. Add implementation tasks and tests covering malformed content, identity/path mismatch, non-pending context, and existing-result cases.

### C1-PR-003 (P1): no compatibility boundary for the existing formal Bootstrap Runs

The proposed canonical result schema uses `runStatus`, whereas existing formal Bootstrap result files use `status`; existing Bootstrap `context.json` files also do not persist `Run.status`. The new reader is responsible for deriving formal facts from `.flowkit/runs`, including the current history needed by Policy, but the proposal defines neither a legacy adapter/normalization contract nor an authoritative migration/cutover. Rejecting those records makes the reader unusable on the repository's present formal history; accepting them ad hoc would weaken the physical-schema contract.

Required revision: explicitly define the supported pre-C1 Bootstrap record schema and its deterministic normalization to B1 facts, or define an authorized migration/cutover that preserves Policy-readable history. Add representative legacy fixtures and malformed-legacy rejection tests.

## Verification

- `npx openspec validate formal-fact-reader-and-persistence --strict` — passed (structural validation only).
- Proposal contract review — completed; the three P1 findings above remain.
- Full test — not run; no owner authorization and this was a proposal review.

## Next Action

`revise-propose`
