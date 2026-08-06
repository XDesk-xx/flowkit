# 20260806-057-review-propose

- Action: `review-propose`
- Role: reviewer
- Status: completed

Reviewed `20260806-056-revise-propose` and the revised C1 proposal artifacts against the active manifest, the actual Bootstrap Run corpus, and B1 Run validation.

Verdict: `changes-requested`

## Findings

### C1-PR-004 (P1): `ContextFile` is still not a deterministic physical projection of the current Run

D15 and the new requirement list fields, but they do not define how `ContextFile` plus result-file state projects to B1 `Run.status`, nor do they require validation that `runPath`, directory name, `runId`, delivery/change path segments, and current result state agree. Task 10.4 only requires required fields and action-catalog validation; tasks/tests omit identity/path mismatch, invalid role/schema version/constraints, terminal-result/non-pending cases, and the required B1 Run reconstruction. Consequently `writeRunResult` cannot safely validate the actual current pending Run before publication, and a moved or mismatched context can be accepted as a different Run.

Required revision: freeze the exact C1 Run reconstruction rule (`ContextFile` + result file -> B1 `Run`), including pending/terminal status derivation; validate schemaVersion, non-empty typed fields, role, constraints, path and content identity, and current result state; fail closed on every mismatch. Add the corresponding scenarios and fixtures, including mismatch and terminal cases.

### C1-PR-005 (P1): Bootstrap compatibility discriminator excludes real pre-C1 formal Runs

D16 declares a Run Bootstrap only when `schemaVersion` is absent or less than 1, but the actual pre-C1 corpus already uses `schemaVersion: 1`. In particular, `055-review-propose` has schemaVersion 1 but lacks the newly required `changeKey`, `ownerAuthorization`, `inputRef`, and `runPath`; it would be treated as a C1 ContextFile and rejected rather than normalized. D16 also reduces a present result to the undifferentiated value `terminal`, while B1 requires one of completed/failed/cancelled. Therefore the reader cannot deterministically read the existing formal history that Policy must consume.

Required revision: define an unambiguous producer/version/cutover discriminator that classifies all existing pre-C1 records (including schemaVersion 1) as legacy, and specify exact legacy normalization of terminal status and mandatory B1 Run fields. Add fixtures based on representative current records, including the schemaVersion-1 review context shape and each supported terminal status; malformed legacy records must fail closed as FactConflict.

## Verification

- `npx openspec validate formal-fact-reader-and-persistence --strict` — passed (structural validation only).
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- Proposal contract review — completed; the two P1 findings above remain.
- Full test — not run; no owner authorization and this was a proposal review.

## Next Action

`revise-propose`
