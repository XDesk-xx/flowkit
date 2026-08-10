# revise-propose: D1 policy-engine — 077

## Delivery / Change / Action

- Delivery: `20260806-01-deterministic-core`
- Change: `D1 policy-engine`
- Action: `revise-propose`
- Role: `author`
- Owner authorization: explicit

## Goal

Resolve `20260806-076-review-propose` blocking finding **D1-PR-001** (P1): the prior
propose Run `075-propose` recorded `context.inputRef.versionFingerprint` =
`sha256:c672e7621062bb95c8dba3b68a8fee38d5529d8bef6ae86cfb3e811bae8792e9`, which is the
SHA-256 of `072-review-explore/result.json`, **not** the cited `074-review-explore/result.json`.
The 075 provenance chain to the approved source review is therefore invalid.

This is the same class of provenance error as D1-EX-003 (071→070). Per the 076 required
change, create a **new** revise-propose Run that:

1. **Records 074 with its actual SHA-256**
   (`sha256:b1323433400ff5aa39027adc7196a9cd69492773e60630d38798e8388ad4e293`) in
   `context.inputRef`, re-establishing the broken provenance.
2. **Preserves 075 and 076 unchanged** — terminal Runs are immutable.
3. **Carries the unchanged Proposal bundle forward** only after verifying that its artifact
   set and strict validation still match the reviewed version.
4. **Does not edit 075 in place** — 075 is a completed (terminal) Run.

## Source review

- Run: `20260806-076-review-propose`
- Verdict: `changes-requested`
- Reviewed Run: `20260806-075-propose`
- Blocking Finding:
  - **D1-PR-001** (P1): 075 Proposal source fingerprint does not identify the approved 074 Review
    - Evidence: `075 context.inputRef.ref` names `074-review-explore/result.json` but its
      `versionFingerprint` is `sha256:c672e762...` (072's hash). The immutable 074 result
      SHA-256 is `sha256:b1323433400ff5aa39027adc7196a9cd69492773e60630d38798e8388ad4e293`.

## D1-PR-001 fix

Run-level provenance correction, not a proposal-content change:

- `context.inputRef.ref` = `run-result:.flowkit/runs/20260806-01-deterministic-core/policy-engine/20260806-074-review-explore/result.json`
- `context.inputRef.versionFingerprint` = `sha256:b1323433400ff5aa39027adc7196a9cd69492773e60630d38798e8388ad4e293`
  (actual SHA-256 of the immutable 074 result, computed and verified independently)

## Proposal bundle carry-forward

The Proposal artifacts are carried forward unchanged from 075 (D1-PR-001 is a provenance
defect, not a content defect):

| Artifact | SHA-256 |
|---|---|
| proposal.md | `6d86964a196f76c76652b2978274ee88f2b0c4556d93830a3ebd1caef1c77cec` |
| design.md | `6a7ae7c396db11a4d035d6fbe67062f7a8ca57c53b9c8c8a146bdd5b23548a8d` |
| spec.md | `208a0ded02048d0041a6cc47b7ddc94d801b7d77065738c0e201b6be20eb48ad` |
| tasks.md | `8501875daf7af7c4a1cc25e48f6f66cef81fc18ef70ec88975765bb1fb95b82a` |

`openspec validate policy-engine --strict` re-verified: `Change 'policy-engine' is valid`.

## Allowed work

- Read formal docs, frozen specs, source files, and prior Runs (074/075/076).
- Compute and verify SHA-256 fingerprints of immutable Run results.
- Re-run `openspec validate policy-engine --strict` to confirm bundle integrity.
- Write only this Run's own artifacts (`context.json`, `action.md`, `result.json`).

## Prohibited work

- Do not modify 075 or 076 (terminal Run immutability).
- Do not modify the Proposal bundle (carried forward unchanged; content already passed 076 strict validation).
- Do not modify frozen specs, manifest, production code, or tests.
- Do not run Full Test, checkpoint, archive, commit, push, or create a new Proposal.

## Required output

Write a completed author `result.json` recording: D1-PR-001 as resolved via correct
`inputRef`; the Proposal bundle carried forward with verified artifact hashes and
re-validated strict status; a `consistencyScan` covering provenance integrity, artifact
carry-forward, terminal Run immutability, and mutation-policy compliance; and a
`nextAction` of `review-propose`.
