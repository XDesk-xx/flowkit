# Flowkit Self-hosting Bootstrap and Run Migration

## Status and scope

This document records the long-lived migration boundary introduced by E1
`change-verification-selection-and-change-set`. It is an operator/product
contract note, not a second lifecycle authority. Flowkit Policy, persisted Runs,
OpenSpec, Git, Reviewer results, Verification results, and explicit Owner facts
remain authoritative.

## Context and ActionPackage migration

The migration is intentionally version-first and fail-closed:

- context v2, v3, and v4 are historical read-only formats. Their persisted
  bytes are never upgraded in place.
- context v5 is the only writer format for new Standard Runs after the E1
  migration boundary.
- historical context v2/v3/v4 can only use their bounded ActionPackage v1
  semantics when that historical identity can be reconstructed exactly.
- context v5 is paired with ActionPackage v2. Apply/revise-apply v5 Runs also
  persist immutable entry workspace identity and the Design-derived mutation
  declaration.
- unknown versions and cross-version pairings fail closed; Flowkit does not
  coerce them to the nearest supported schema.

The E1 bootstrap Runs that were created before the v5 writer became usable are
historical migration evidence. In particular, the earlier E1 v4 corpus is not
claimed as v5 dogfood and is not rewritten to make it look current.

## New preparation and exact continuation are different operations

A caller that wants a new execution uses the Policy-selected new preparation
boundary. Core alone checks the pending boundary and allocates the Delivery-wide
Run number.

A caller that already has a durable Run receipt uses exact resume with the
expected Run id. Exact resume reads the persisted target identity directly; it
does not call Policy to select a new Action and does not allocate another Run.
If that Run is already terminal, the persisted terminal result is the replay
authority. Equivalent repeated admission is idempotent; a conflicting logical
descriptor fails closed.

This separation is required after a caller-side timeout. A transport timeout is
not proof that the owned operation stopped. The caller treats the result as
`outcome-unknown` unless cancellation is proven and recovers by the durable
`expectedRunId`; it must not simply ask Flowkit for "whatever is next".

## Core-only numbering and concurrent preparation

Run numbering is a Core persistence concern. New preparation performs pending
check plus allocation/create under one bounded Core preparation lock so two
callers cannot both publish a new pending Run for the same Delivery boundary.
The losing caller receives the already-persisted identity and resumes it
exactly.

This is a narrow single-repository preparation boundary, not a generic job,
generation, or distributed-lock framework.

## OpenSpec operation projection

One formal Flowkit read/preparation operation owns one read-only
`OpenSpecOperationProjection`. Version and structured status are read once for
that operation and the same projection is passed to artifact, task,
verification, contract, and Action-context consumers. Additional instructions
or validation extend that same projection rather than re-reading version/status.

A post-action or write-side admission starts a fresh operation projection. A
projection is never cached across a repository mutation.

## Apply attribution limit without an exclusive worktree

E1 distinguishes two observations:

- `actualChangeSet`: canonical Git base to post-action candidate state.
- `observedActionMutations`: immutable Apply entry to post-action state.

The second observation proves which bytes changed during the Action window and
is checked against the approved mutation declaration. Without an exclusive
worktree/actor lock it does **not** cryptographically prove which human or agent
wrote those bytes. Flowkit therefore records a bounded time-window observation,
not actor attribution.

Core-owned Run bookkeeping and publication records are excluded from candidate
business paths. Undeclared candidate mutation still fails closed.

## Verification-selection publication

A v5 Apply/revise-apply publishes deterministic `verification.md` first and an
immutable per-Run `verification-selection.json` commit marker second. The
terminal result is written last and exact-binds that immutable record plus the
canonical logical result descriptor.

Historical terminal replay validates only persisted terminal/result authority
and the immutable per-Run record. It does not compare an old terminal Run to a
future mutable `verification.md`. During a successor pending publication the
Reader treats verification authority as in-flight/unavailable until the new Run
terminalizes.

## Bootstrap evidence and first normal dogfood

E1 may use disposable Git-backed fixtures to prove the v5 writer, exact resume,
publication, Reader, OpenSpec projection, and cancellation contracts while E1
itself crosses the migration seam. This does not retroactively relabel older E1
Runs.

The first **normal canonical** v5 dogfood is expected from a subsequent Change
that enters through the new preparation API after E1 is checkpointed. E1's own
migration/recovery Runs are bootstrap evidence, not a claim that the migration
was available before it was implemented.

## G1 ownership remains unchanged

E1 does not absorb G1 scope. G1 still owns the stable Change CLI/end-to-end
surface, checkout/resume acceptance, and the size/timing/review-convergence
observations required for the final Change CLI and performance acceptance.
