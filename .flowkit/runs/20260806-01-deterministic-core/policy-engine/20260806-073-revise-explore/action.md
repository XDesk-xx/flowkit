# revise-explore: D1 policy-engine — 073

## Delivery / Change / Action

- Delivery: `20260806-01-deterministic-core`
- Change: `D1 policy-engine`
- Action: `revise-explore`
- Role: `author`
- Owner authorization: explicit (required for revise-explore)

## Goal

Resolve `20260806-072-review-explore` blocking finding **D1-EX-003** (P1): the prior
revision Run `071-revise-explore` recorded a `context.inputRef.versionFingerprint` for
`070-review-explore/result.json` that does not match the immutable file's actual SHA-256.
The provenance chain `070 → 071` is therefore invalid and the explore cannot be approved.

Per the 072 required change, create a **new** revise-explore Run that:

1. **Cites 070 with its actual SHA-256** (`sha256:4a69f71f95ce5b29dfbfbf2f4a3e640f2d35d2728415cdbda799ba975501c770`)
   in `context.inputRef`, re-establishing the broken provenance.
2. **Carries forward D1-EX-001 and D1-EX-002 as addressed** — the existing
   `.tmp/explore/policy-engine/conclusion.md` (hash `aa7e92b9…`) already resolves both
   findings via the Lineage model and the verification/authorization facts availability
   design. The conclusion content is preserved unchanged.
3. **Preserves 070, 071, and 072 unchanged** — terminal Runs are immutable; the fix is
   recorded in this new Run only.
4. **Does not edit 071 in place** — 071 is a completed (terminal) Run.

## Source review

- Run: `20260806-072-review-explore`
- Verdict: `changes-requested`
- Reviewed Run: `20260806-071-revise-explore`
- Blocking Finding:
  - **D1-EX-003** (P1): 071 revision input fingerprint does not identify the reviewed 070 result
    - Evidence: `071 context.inputRef.ref` names `070-review-explore/result.json` but declares
      `sha256:5a3e7b1c9f2d8e4a6b0c3f5d7e9a1b3c5d7e9f1a3b5c7d9e1f3a5b7c9d1e3f5`.
      The immutable file's actual SHA-256 is
      `sha256:4a69f71f95ce5b29dfbfbf2f4a3e640f2d35d2728415cdbda799ba975501c770`.

## Carried-forward findings (already addressed in 071 conclusion)

- **D1-EX-001** (P1, from 070): Lifecycle stage selection cannot progress after a completed
  review — addressed by the Lineage model (`ReviewVerdictFact.reviewedRunId` tracking).
- **D1-EX-002** (P1, from 070): Policy gates require formal facts the snapshot does not
  provide — addressed by blocking on `verification-facts-unavailable` and treating empty
  `ownerAuthorizations` as owner-decision.

Both remain resolved by the unchanged conclusion artifact
(`conclusion.md` SHA-256 `aa7e92b98f8f8683489cfad3036c50eb645858bb40794a8d6af29ad1cc7b4b8e`).
This Run does **not** modify `conclusion.md` or `evidence.json`.

## D1-EX-003 fix

The fix is a Run-level provenance correction, not a conclusion-content change:

- `context.inputRef.ref` = `run-result:.flowkit/runs/20260806-01-deterministic-core/policy-engine/20260806-070-review-explore/result.json`
- `context.inputRef.versionFingerprint` = `sha256:4a69f71f95ce5b29dfbfbf2f4a3e640f2d35d2728415cdbda799ba975501c770`
  (the actual SHA-256 of the immutable 070 result, computed and verified)

`reviewedRun` = `20260806-072-review-explore/` (the review whose `changes-requested` verdict
and D1-EX-003 finding triggered this revision). `inputRef` and `reviewedRun` differ by design:
the conclusion content addresses 070's findings while this Run responds to 072's provenance
finding. See `context.inputRefSemantics` for the full rationale.

## Allowed work

- Read formal docs, frozen specs, source files, and prior Runs (070/071/072).
- Compute and verify SHA-256 fingerprints of immutable Run results.
- Write only this Run's own artifacts (`context.json`, `action.md`, `result.json`).

## Prohibited work

- Do not modify 070, 071, or 072 (terminal Run immutability).
- Do not modify `conclusion.md` or `evidence.json` (carried forward unchanged).
- Do not modify the delivery manifest, production code, tests, or OpenSpec Change artifacts.
- Do not run Full Test, checkpoint, archive, commit, push, or create a Proposal.

## Required output

Write a completed author `result.json` recording: D1-EX-003 as resolved via correct
`inputRef`; D1-EX-001/D1-EX-002 as carried-forward (conclusion hash unchanged); a
`consistencyScan` covering provenance integrity, artifact carry-forward, terminal Run
immutability, and mutation-policy compliance; and a `nextAction` of `review-explore`.
