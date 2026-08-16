## Context

See `proposal.md` for motivation. Q1 runs on the completed Deterministic Core, whose current contracts still expose two incompatible assumptions to the upcoming Change Execution Loop:

1. a matching `changes-requested` review is treated as sufficient to select `revise-*`; and
2. `full-test` / `delivery-finalize` are still modeled as Standard `FormalAction` values with Delivery-level Run shapes.

The repository already has typed Reviewer findings and Owner authorization facts, but findings do not carry blocker authority and `ReviewVerdictFact` does not project enough information for Policy to distinguish Author-actionable blockers from Owner / Verification / External blockers. There is also one historical schemaVersion 1 Delivery-level `full-test` Run in the repository; immutable historical bytes must remain readable without preserving that model as a current execution surface.

Q1 is deliberately transitional. It must make the current Core safe for 02 without implementing D1 Finding convergence, A1 Owner provenance ingestion, or 03's Delivery behavior model/executor.

## Goals / Non-Goals

**Goals:**

- Make blocker authority a minimal Reviewer-owned fact that can be deterministically projected into Policy.
- Make `changes-requested` select `revise-*` only when every current blocking finding is Author-actionable.
- Preserve a safe explicit direct re-review path for any review containing non-author blockers, including mixed author+non-author reviews, without creating an automatic review loop or a new authority-event ledger.
- Make current Standard Action/Run contracts Change-only while retaining bounded, read-only compatibility for historical Delivery-level Runs.
- Keep no-active-change Delivery policy deterministic and fail-closed until 03 supplies real Full Test / Finalize behavior.
- Preserve immutable pre-Q1 terminal Review artifacts through a narrow reader compatibility rule rather than rewriting history.

**Non-Goals:**

- Implement Finding convergence, stable Finding lifecycle, or a Finding database.
- Implement generic Owner / Verification / External authority-event provenance or automatic blocker-resolution detection.
- Implement Delivery Full Test / Finalize execution, a Delivery behavior discriminated union, or Delivery-level Agent/Run execution.
- Migrate, rewrite, delete, or re-publish historical terminal Runs or archived OpenSpec Changes.
- Change Archive, Checkpoint, Change Verification, Owner decision, or Git authority semantics beyond what is necessary to remove the obsolete Delivery Action/Run coupling.

## Decisions

### 1. Current `FormalAction` is exactly the 10 Change Actions

`FormalAction` becomes the Change Action catalog itself. Current/public `DeliveryAction`, `DELIVERY_ACTIONS`, and `isDeliveryAction` are removed from the active domain surface. Standard `canRun`, `createRun`, `writeRunResult`, CLI action parsing, and current Run serialization therefore accept only:

`explore`, `review-explore`, `revise-explore`, `propose`, `review-propose`, `revise-propose`, `apply`, `review-apply`, `revise-apply`, `archive`.

Owner decisions such as `authorize-full-test` and `authorize-delivery-finalize` remain Delivery authority facts. A decision is not an Action.

**Why:** Keeping `full-test` / `delivery-finalize` in `FormalAction` solely for temporary compatibility would continue to let Policy and Run code treat Delivery behavior as a Change execution step, defeating the Q1 correction.

**Alternative considered:** Keep a union of ChangeAction + legacy DeliveryAction and reject Delivery actions only inside `createRun`. Rejected because the incorrect values would remain part of the current machine contract and could still leak through `next`, `canRun`, CLI typing, or adapters.

### 2. schemaVersion 2 Runs are Change-only; legacy Delivery Runs use a bounded recognizer

A current schemaVersion 2 `ContextFile` requires `changeKey`, `changeId`, and a Change Action. New Delivery-level Run creation is rejected. Current `Run` / `RunFact` projections are Change-only.

Historical schemaVersion 1 or unversioned Run files may be recognized by a narrow legacy path that understands old `full-test` / `delivery-finalize` shapes only for historical reading and Delivery-wide Run-ID enumeration. Those Runs are never projected into `snapshot.runs`, never become current `FormalAction`, and are never writable through current terminal APIs.

Run-ID enumeration continues to inspect legacy top-level / `_delivery` identifiers where needed so a historical NNN cannot be accidentally reused.

**Why:** The repository contains historical Delivery-level Run bytes, so simply deleting parsing support would turn valid history into avoidable read failures. Reintroducing legacy values into the current domain would be worse.

**Alternative considered:** Migrate historical Runs to a new shape. Rejected because terminal artifacts are create-once historical facts and migration would alter Git-preserved execution history for no product benefit.

### 3. `blockingAuthority` lives on blocking Reviewer findings

Introduce one shared machine enum:

`author | owner | verification | external`.

For newly published typed Review findings:

- every `severity=blocking` finding requires `blockingAuthority`;
- an Author blocker requires a non-empty `requiredChange`;
- a non-author blocker must not carry `requiredChange`, because that field semantically instructs Author mutation;
- non-blocking findings do not participate in authority projection.

The full Finding remains Reviewer-owned in `result.json`; Q1 does not create a separate Finding store.

**Why:** Authority belongs to the Finding that identifies the blocker. Storing only one authority on the overall Verdict would lose mixed-authority information and make review convergence ambiguous.

**Alternative considered:** Add `blockingAuthority` only to `ReviewVerdictFact`. Rejected because that would make the derived Policy projection the only place containing a fact that Reviewer should own, and it could not faithfully represent multiple blockers.

### 4. `ReviewVerdictFact` carries only the deterministic authority projection Policy needs

Reader reconstructs `ReviewVerdictFact` with `reviewRunId`, `verdict`, `reviewedRunId`, and `blockingAuthorities`. Authorities are derived from blocking findings, deduplicated, and ordered by the fixed authority catalog rather than file order.

- `approved` requires an empty authority set and no blocking findings.
- `changes-requested` requires a non-empty authority set.
- malformed or unknown authority data becomes `FactConflict`; Policy does not guess.

This is a projection, not a second Finding database.

**Why:** Policy only needs authority classification to choose or stop a lifecycle boundary. Copying Finding text, locations, evidence, or acceptance into snapshot facts would violate the Lean / one-fact-one-authority model.

**Alternative considered:** Let Policy open Reviewer `result.json` directly. Rejected because Policy should consume deterministic formal facts rather than own persistence parsing.

### 5. Immutable pre-Q1 blocking findings get one narrow read-compatibility rule

Existing terminal Reviews cannot be rewritten. For an already-persisted typed blocking finding that predates Q1 and lacks `blockingAuthority`, Reader may project `author` only if the legacy finding has a valid non-empty `requiredChange`. This compatibility is read-only and never accepted by the new terminal writer.

No compatibility inference exists for Owner / Verification / External authority. If an old finding has no explicit authority and does not satisfy the old Author-shaped contract, Reader emits conflict.

**Why:** The current Q1 review lineage itself contains pre-Q1 Reviewer artifacts with blocking `requiredChange` but no authority. Treating those immutable facts as unreadable immediately after Q1 would break self-consistency; rewriting them would violate terminal immutability.

**Alternative considered:** Add a migration/version marker and rewrite old Q1 results. Rejected as unnecessary machinery for a single bounded legacy seam.

### 6. Mixed authority is fail-closed; only author-only blockers select revision

For the matching current Review:

- `approved` → existing progress logic;
- `changes-requested` + non-empty `blockingAuthorities` all `author` → `revise-S`;
- `changes-requested` + any `owner`, `verification`, or `external` → non-author review blocker boundary;
- a mixed Author + non-author set is treated as non-author blocked, not “revise the Author part first”.

`canRun(revise-S)` uses the same rule, so `next` and direct action admission cannot disagree.

**Why:** Flowkit must return one legal boundary. Revising only the Author subset while another authority still blocks approval would create unnecessary candidate generations and risks converting `changes-requested` back into a mechanical revision loop.

**Alternative considered:** Prefer Author blockers whenever any are present, then revisit non-author blockers later. Rejected because it is not fail-closed and does not provide a unique authority boundary for the whole unapprovable target.

### 7. Direct re-review admission is deterministic; “legal” and “worth doing now” are separate

Q1 strictly separates two questions:

1. **Is this Action legal under the current lifecycle contract?** — Policy owns this question.
2. **Is it worth executing this legal Action now?** — the explicit caller/operator owns this question for direct re-review.

When a matching `changes-requested` Review contains **any** non-author blocker, including pure non-author and mixed author+non-author authority sets, explicit same-stage `review-S` MUST remain a legal recovery Action in Policy. Therefore `canRun(review-S)` MUST deterministically return allowed for that matching state, and unchanged candidate bytes MUST be admissible as the reviewed target. This legality rule does not depend on Policy proving that an Owner / Verification / External fact has changed.

`next()` MUST still remain at the non-author blocked boundary and MUST NOT automatically return or trigger `review-S`. Author mutation also remains disallowed while the current matching Review contains any non-author blocker. Each explicit re-review MUST create a new Reviewer execution / Review generation. At execution time, Reviewer MUST evaluate the full target using the latest authority facts actually available to that Reviewer. If the new Review closes non-author blockers while an Author blocker remains, only the **new** matching author-only Review enables `revise-S`.

Q1 intentionally does not introduce a generic authority-resolution event/ref, does not machine-prove whether a non-author fact has arrived, and does not implement Owner provenance lifecycle, Verification resolution lifecycle, D1 Finding convergence, or 03 Delivery behavior. Whether there is enough new information to make a re-review worthwhile is an explicit execution/operator responsibility before invoking Review; it is **not** a `canRun(review-S)` machine prerequisite.

**Why:** This freezes one deterministic Policy answer for the same formal snapshot/action, removes the mixed-authority dead-end, and preserves fail-closed `next()` semantics without inventing an authority-resolution platform or an automatic Reviewer loop.

**Alternative considered:** Gate `canRun(review-S)` on “relevant non-author fact has arrived”. Rejected because Q1 has no generic machine input that can prove that predicate, so the same snapshot/action could be allowed or denied nondeterministically. Allowing mixed blockers to enter Author revise was also rejected because it violates the fail-closed single-boundary rule.

### 8. Q1→03 uses a temporary deterministic Delivery bridge, never fake Actions

When no Change is active, existing checkpoint / activation / Owner decision behavior remains authoritative. Once all required Changes are completed and checkpointed:

- `fullTestStatus=awaiting-user-decision` → existing Owner decision `authorize-full-test`;
- `fullTestStatus=authorized` → blocked `delivery-behavior-not-implemented`; never `action: full-test`;
- `fullTestStatus=failed` → existing fail-closed failed state;
- `fullTestStatus=passed` and Finalize not authorized → existing Owner decision `authorize-delivery-finalize`;
- `fullTestStatus=passed` and Finalize already authorized → blocked `delivery-behavior-not-implemented`; never `action: delivery-finalize`;
- inconsistent/not-ready states remain fail-closed according to existing state consistency rules.

Standard `canRun` has no Full Test / Finalize precondition branches because those values are no longer Actions. 03 A1 replaces this temporary blocked bridge with the real Delivery behavior machine model.

**Why:** Returning a fake Action would retain the exact drift Q1 exists to remove. Implementing Delivery behavior now would invade 03 scope. A stable blocked diagnosis is therefore the only safe bridge.

**Alternative considered:** Introduce a Delivery behavior union in Q1. Rejected as premature 03 implementation.

### 9. Canonical alignment is repo-wide but history-preserving

Apply must update all current product contract surfaces found by repo-wide scan: active OpenSpec capability specs, `AGENTS.md`, current docs, affected domain/facts/persistence/policy code, and direct tests. Archived OpenSpec Changes remain untouched unless a current runtime parser requires bounded compatibility with their persisted artifacts.

**Why:** Q1 exists to remove contradictory current authority. Editing a hand-picked document list while leaving an active capability spec with the old rule would preserve ambiguity; rewriting archived history would erase provenance.

## Risks / Trade-offs

- **[Risk] Policy allows explicit re-review even when no useful new non-author fact exists.** → This is intentional separation of legality from execution worthiness: `next()` stays blocked and never auto-reviews; the explicit caller/operator decides whether new facts make another Review worthwhile. Q1 does not guess or track generic authority resolution.
- **[Risk] Removing Delivery actions from TypeScript unions can expose broad compile/test fallout.** → Treat compile errors as a useful repo-wide call-site inventory; update only current Action/Run consumers and keep Delivery Owner decisions/status as separate facts.
- **[Risk] Legacy parsing could accidentally preserve Delivery Actions as current behavior.** → Isolate legacy discriminators from current schemas and exclude legacy Delivery Runs from `snapshot.runs` / Policy input; add regression tests for read-only compatibility and new-write rejection.
- **[Risk] Compatibility mapping of old `requiredChange` to `author` is heuristic.** → Bound it to already-persisted typed blocking findings only, never use it for new writes, and fail closed for all other missing-authority shapes.
- **[Risk] Mixed blockers postpone an available Author fix while a non-author blocker remains in the matching Review.** → This is intentional fail-closed behavior. Explicit direct re-review of unchanged bytes is always legally available for that mixed verdict; a new Reviewer generation can use the latest available facts to remove a closed non-author blocker and surface any remaining Author blocker as author-only.
- **[Risk] `delivery-behavior-not-implemented` is temporary product behavior.** → Make it explicit and tested, with 03 A1 designated as the replacement boundary; do not create temporary Run or executor abstractions that 03 must later unwind.

## Migration Plan

1. Freeze the seven active capability deltas (including `flowkit-diagnostic-cli`) and current docs/AGENTS wording; do not edit archived Change history.
2. Narrow the domain Action catalog and current Run schemas to Change-only while introducing isolated legacy Delivery-run recognition for reads/NNN enumeration.
3. Extend new Review finding validation with `blockingAuthority` and add bounded read compatibility for immutable pre-Q1 Author-shaped findings.
4. Project deterministic `blockingAuthorities` into `ReviewVerdictFact`; make malformed Review authority facts fail closed.
5. Update Policy `canRun`, `next`, unified review/revise entry, and diagnosis so author-only revision, non-author blocked boundaries, pure/mixed explicit direct re-review recovery, and mixed-authority behavior agree.
6. Replace Delivery `full-test` / `delivery-finalize` Action selection with the Q1→03 blocked bridge while preserving Owner decision/status facts.
7. Update direct contract tests and current documentation, then run focused/affected verification and strict OpenSpec validation only as Change Verification requires. Do not run Delivery Full Test without Owner authorization.
8. If Apply must be reverted before checkpoint, revert Q1 source/spec/doc changes together; historical Run bytes require no rollback because Q1 never migrates them.
