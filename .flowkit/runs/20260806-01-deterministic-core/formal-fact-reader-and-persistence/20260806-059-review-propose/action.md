# 20260806-059-review-propose

- Action: `review-propose`
- Role: reviewer
- Status: completed

Reviewed `20260806-058-revise-propose` and the revised C1 proposal artifacts against B1 Run types, the actual Bootstrap Run corpus, and the current delivery scope.

Verdict: `changes-requested`

## Findings

### C1-PR-006 (P1): schema-validation failure is an unsafe Bootstrap discriminator

D16 classifies every `validateContextFile` failure as a Bootstrap Run. A malformed or corrupted C1 Run therefore bypasses C1 validation and identity checks and is best-effort read as legacy instead of producing `FactConflict`. That is a downgrade path, not a fail-closed compatibility boundary. Reusing schemaVersion 1 for both historical and C1 records makes this ambiguity unavoidable under the proposed discriminator.

Required revision: introduce an unambiguous C1 format marker/version distinct from the historical Bootstrap corpus, and make malformed records carrying that marker fail closed. Define a bounded legacy-shape recognizer for pre-C1 records; records satisfying neither schema must produce `FactConflict`. Add fixtures for valid schemaVersion-1 legacy, invalid marked C1 context, and unknown/mixed records.

### C1-PR-007 (P1): `ContextFile.inputRef` cannot map to B1 `Run.inputRef`

D15 defines `ContextFile.inputRef` as `string`, then requires it to map to `Run.inputRef`. B1 defines `Run.inputRef?: ResultRef`, which requires at least `ref` and `versionFingerprint`. The proposal defines no conversion, source of the fingerprint, optionality rule, or validation for that projection. The claimed deterministic current-Run construction therefore cannot typecheck or preserve B1 identity semantics.

Required revision: make the C1 physical field a validated optional `ResultRef` projection, or define a complete deterministic adapter from the physical representation to `ResultRef` including every required field and failure behavior. Keep Bootstrap string inputs within the legacy adapter only. Add valid, malformed, absent, and round-trip projection fixtures.

### C1-PR-008 (P1): ContextFile contradicts Delivery-level Run support

B1 permits Delivery-level Runs without `changeId`, and D15/tasks explicitly say Delivery-level Runs skip change-path validation. Yet `ContextFile` makes both `changeKey` and `changeId` mandatory strings, so a valid Delivery-level C1 Run cannot be created or validated. The proposal also does not define how Action Catalog action scope determines the presence of these fields.

Required revision: define the canonical Delivery-level ContextFile variant and the Action-scope rule for `changeId`/`changeKey` presence; reject mixed or missing Change-level identities. Update identity validation and add create/read fixtures for both Delivery- and Change-level Runs.

## Verification

- `npx openspec validate formal-fact-reader-and-persistence --strict` — passed (structural validation only).
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- Proposal contract review — completed; the three P1 findings above remain.
- Full test — not run; no owner authorization and this was a proposal review.

## Next Action

`revise-propose`
