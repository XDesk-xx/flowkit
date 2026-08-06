# 20260806-063-review-apply

- Action: `review-apply`
- Role: reviewer
- Status: completed

Reviewed `20260806-062-apply` against the C1 requirements, actual Delivery Manifest and Run corpus, B1 contracts, and Change Verification rules.

Verdict: `changes-requested`

## Findings

### C1-AP-001 (P1): required Change Verification record is missing

`openspec/changes/formal-fact-reader-and-persistence/verification.md` does not exist. `docs/verification-model.md` requires this Change-owned record and states that a Run result can reference it but cannot replace it. The Apply Run's self-reported verificationResults therefore do not establish Change Verification = passed, so review-apply's lifecycle precondition is not met.

Required revision: create the formal verification.md with scope, applicable checks, results/environment, Full Test status, and overall Change Verification status; make the Apply/Revision result reference it. Re-run the applicable checks and retain their actual results.

### C1-AP-002 (P1): writeRunResult does not let assertMutable observe terminal persistent state

`src/persistence/run-persistence.ts` always calls `projectCurrentRun(contextFile)`, which sets status to pending and never reads existing result.json before `assertMutable`. A second write is rejected only later by fs.link EEXIST, not by assertMutable as the requirement and test claim. This violates the required CURRENT persistent-state check and makes the asserted terminal-state test a false positive for the specified behavior.

Required revision: reconstruct current Run status from the persisted result before calling assertMutable (while preserving the race-safe fs.link publication), and add a test that proves assertMutable is reached with a terminal Run on a pre-existing result.json. Also validate ContextFile identity in the write path before publication.

### C1-AP-003 (P1): FormalFact Reader cannot read the actual Delivery Manifest state

The active Manifest stores state at `delivery.state` and full-test state at `delivery.fullTestStatus`. `readDeliveryManifest` reads top-level `manifest.state` and `manifest.fullTestStatus`; its fixture uses that incorrect top-level shape. On the real manifest, both Snapshot facts are undefined, so D1 Policy cannot determine the active Delivery or Full Test gate.

Required revision: parse and validate the real manifest shape, add a fixture from the active manifest grammar, and fail closed for missing/invalid required delivery fields rather than silently returning undefined.

### C1-AP-004 (P1): Reader cannot reconstruct review verdict facts from canonical or current Bootstrap records

C1 RunResultFile has no top-level `verdict`, but `extractReviewVerdict` reads one and therefore returns no C1 review verdict. The legacy extraction reads `result.json.input.reviewedRunId`, while existing review records keep the reviewed Run reference in context.json (and result.json has no input object), yielding an empty reviewedRunId. Policy consequently lacks the required reviewer Verdict-to-reviewed-Run linkage.

Required revision: define and persist a canonical review verdict payload/reference that the Reader can decode, read Bootstrap review linkage from the legacy context shape, reject missing linkage as FactConflict, and add C1 plus representative Bootstrap fixtures.

## Verification

- `npm test` — passed: 226 tests. The passing suite does not cover the four defects above.
- `npm run build` — passed.
- `npx openspec validate formal-fact-reader-and-persistence --strict` — passed (structural validation only).
- Change Verification — failed: required verification.md is absent.
- Full test — not run; no owner authorization.

## Next Action

`revise-apply`
