## 1. Durable Architecture Assets

- [x] 1.1 Keep scoped `architecture/.gitignore` with narrow `*/html/` ignore behavior; JSON remains trackable.
- [x] 1.2 Replace the superseded reference set with `change-lifecycle.workflow.json` + `change-lifecycle.sequence.json`; preserve complete Change review/revise/non-author STOP/archive/checkpoint structure and one-way authority wording.
- [x] 1.3 Replace `delivery-lifecycle.lifecycle.json` with `delivery-lifecycle.workflow.json` + `delivery-lifecycle.sequence.json`; preserve passed/failed split, corrective loop, fresh Full Test authorization, architecture/finalize/final path and one-way authority wording.
- [x] 1.4 Preserve 03 `current.architecture.json` at exact pre-03 `main @ 74d46f0920cdf6f19b5b264cf9de138f4c2bec` semantic boundary and validate/deliver against exact pre-03 repo root.
- [x] 1.5 Preserve 03 `planned.architecture.json` planning provenance at original Delivery Start `f132db761bd209e6aff72411108b8e3e1c9801f5` and validate/deliver with repository evidence.
- [x] 1.6 Assert final D1 has no `delivery-lifecycle.lifecycle.json`, no `full-test-lifecycle.lifecycle.json`, no `actual.architecture.json`, no global `system.architecture.json`, and no generated HTML in Git boundary.
- [x] 1.7 Freeze presentation-only review order: Change Workflow → Change Sequence → Delivery Workflow → Delivery Sequence → Current → Planned.

## 2. Thin Architecture / Archify Runtime

- [x] 2.1 Extend `ArchifyRenderableType` minimally to `architecture | workflow | sequence | lifecycle`; add sequence validate/deliver regressions while preserving exact managed identity and architecture-only `--repo-root` fail-closed semantics.
- [x] 2.2 Preserve generic `src/architecture/**` Delivery path/service behavior keyed by `deliveryId`, with no 03-specific constants in generic runtime resolution and no reference-as-Policy reader.
- [x] 2.3 Preserve `flowkit architecture render current|planned` and mechanical compare with no lifecycle-state mutation.
- [x] 2.4 Preserve future Delivery path, JSON-vs-HTML authority, staleness direction and repo-root argument regressions.

## 3. Formal Verification Closure

- [x] 3.1 Preserve closed `flowkit-architecture-assets`, `tests-architecture`, non-overlapping `architecture` ownership and `cli-diagnostics → flowkit-architecture-assets` capability relation.
- [x] 3.2 Extend D1 physical tests to validate/deliver all four reference JSON native types through exact managed Archify and assert complete Workflow structures plus Sequence participants/messages/authority ordering.
- [x] 3.3 Update expected D1 actualChangeSet proof for four final reference files plus cleanup of superseded `delivery-lifecycle.lifecycle.json`; require matched capability relation and the existing full selected-check chain.
- [x] 3.4 Add/extend external-tool tests proving `sequence` is supported for validate/deliver but rejects repository evidence, with workflow/lifecycle/architecture compatibility unchanged.
- [x] 3.5 Re-run counterfactual physical closure: breaking any required reference renderer/structure or Architecture repo-root route must fail the formally selected check.

## 4. Fresh Apply Quality / Recovery Closure

- [x] 4.1 Keep historical `20260818-057-revise-apply` and its failed Verification byte-immutable; fresh Apply publishes a new verification authority only through Flowkit.
- [x] 4.2 Run focused/affected tests, typecheck, lint, build, quality, current OpenSpec strict and `--all --strict` without treating them as Delivery Full Test.
- [x] 4.3 Run formal Change Verification against the exact fresh Apply candidate and require physical closure for architecture / cli / external-tools / openspec-runtime / verification / typecheck selected chain.
- [x] 4.4 Verify `git diff --check`, staging-aware `git diff --cached --check`, mutation-scope closure and no generated `architecture/**/html/**` in candidate.
- [x] 4.5 Prepare cumulative fresh Apply candidate for Reviewer with four reference JSONs + Current/Planned JSON and no Actual/promotion/lifecycle-example artifacts.
