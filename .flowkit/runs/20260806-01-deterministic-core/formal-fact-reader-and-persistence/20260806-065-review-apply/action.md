# 20260806-065-review-apply

- Action: `review-apply`
- Role: reviewer
- Status: completed

Reviewed `20260806-064-revise-apply`, its Change Verification record, and the revised C1 persistence/Reader contracts.

Verdict: `changes-requested`

## Findings

### C1-AP-005 (P1): result.json read errors are treated as an absent result

`reconstructCurrentRun` catches every error from `readFileContent(resultPath)` and returns a pending Run. `readFileContent` wraps all filesystem errors, so permission failures, an `EISDIR` path, or other I/O failures are indistinguishable from ENOENT. writeRunResult can then pass assertMutable and attempt publication despite being unable to determine whether an existing terminal result is readable. The required absent-result behavior applies only to ENOENT; all other failures must fail closed.

Required revision: preserve/read the filesystem error code, treat only ENOENT as pending, and surface all other result-path errors as a deterministic persistence error before assertMutable/publication. Add tests for at least inaccessible/non-ENOENT and directory-at-result-path cases.

### C1-AP-006 (P1): review verdict integrity is detected too late, after terminal publication

ContextFile correctly requires reviewedRunId for review actions and RunResultFile adds reviewVerdict, but writeRunResult validates the result without the ContextFile action. It can publish a completed review Run lacking reviewVerdict, or a non-review Run carrying one; Reader only reports FactConflict afterwards, when the terminal result cannot be amended. The canonical review verdict/linkage contract must be enforced before publication.

Required revision: add a context-aware result validation step in writeRunResult. For completed review actions, require reviewVerdict in the accepted enum and reviewedRunId; for non-review actions, reject reviewVerdict. Add publication-path fixtures that prove invalid combinations write no result.json.

## Verification

- `npm test` — passed: 238 tests; the suite does not cover the two P1 boundaries above.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npx openspec validate formal-fact-reader-and-persistence --strict` — passed (structural validation only).
- Change Verification — currently recorded as passed, but must be refreshed after the required fixes.
- Full test — not run; no owner authorization.

## Next Action

`revise-apply`
