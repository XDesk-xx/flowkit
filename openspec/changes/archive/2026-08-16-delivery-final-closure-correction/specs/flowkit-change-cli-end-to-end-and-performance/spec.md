## MODIFIED Requirements

### Requirement: verify MUST remain a read-only projection of formal Change Verification authority

Bare `flowkit verify` MUST continue to discover the current active Change's Change Verification status and authority artifact from the existing FormalFact/OpenSpec structured projection. It MUST NOT construct a Change verification path from a CLI-local `openspec/changes/<changeId>` rule. When the projected authority publication exists, bare `flowkit verify` MAY read that exact projected logical path to report published selection identity/logical check ids. Bare `flowkit verify` MUST NOT independently rerun Verification, overwrite `verification.md`, create a Run, or change lifecycle state.

An explicit `flowkit verify --retry` submode MAY execute and publish a new formal Change Verification authority only when the unique current Apply/revise-apply producer is already `completed`, current formal Verification is `failed`, and Core proves the current candidate is byte-identical to that producer's post-action candidate after excluding only Core-owned current Verification/history publication paths. `--retry` MUST remain Verification behavior rather than a Formal Action: it MUST NOT allocate a Run/NNN, mutate the Apply terminal result, manufacture revise-apply, change Policy, widen selection, or modify candidate product/contract bytes. It MUST reuse the same deterministic logical selection and current external-tool authority.

Before replacing current `verification.md`, retry MUST preserve the exact previous publication at a deterministic immutable history ref derived from the validated projected Verification authority directory and the previous publication SHA-256. The new current publication MUST link to the previous fingerprint/ref, the origin Apply run, origin Apply verification fingerprint, exact post-action candidate fingerprint and unchanged selection fingerprint. Repeated retries MUST form a finite chain. Missing/corrupt/cyclic history, candidate drift, selection drift, producer ambiguity or any non-`failed` current state MUST fail closed.

#### Scenario: verify reports current formal status through structured projection
- **WHEN** the current Change has a conflict-free FormalFact/OpenSpec projection whose projected Change Verification artifact exists
- **WHEN** the operator invokes bare `flowkit verify`
- **THEN** the CLI MUST report the projected formal Verification status and MAY report selection identity/logical check ids read from that projected authority publication
- **AND** MUST NOT reconstruct the Change-root path, rerun Verification or republish Verification

#### Scenario: verify before formal publication remains non-mutating
- **WHEN** the current Change has a valid projected Change Verification artifact path but no publication exists yet
- **WHEN** the operator invokes bare `flowkit verify`
- **THEN** the CLI MUST report the formal absence/not-run state deterministically
- **AND** MUST NOT create a substitute Verification truth

#### Scenario: missing or conflicting Verification projection fails closed
- **WHEN** the active Change's FormalFact/OpenSpec structured Verification projection is missing, ambiguous or conflicting
- **WHEN** the operator invokes `flowkit verify` or `flowkit verify --retry`
- **THEN** the CLI MUST fail closed
- **AND** MUST NOT fall back to constructing `openspec/changes/<changeId>/verification.md` or another guessed path

#### Scenario: explicit retry can supersede failed Verification on the exact same Apply candidate
- **WHEN** the unique current Apply/revise-apply Run is completed with a valid failed Verification terminal binding
- **AND** current `verification.md` is the valid current publication for that producer
- **AND** current candidate identity and deterministic selection exactly match the producing Apply post-action identity/selection
- **WHEN** the operator invokes `flowkit verify --retry`
- **THEN** Core MUST execute the same selected Change Verification against that exact candidate
- **AND** MUST preserve the previous publication exact bytes under immutable fingerprint-addressed Verification history before atomically publishing the new current authority
- **AND** MUST NOT create a Run, Formal Action, no-op revise or candidate mutation

#### Scenario: retry candidate or selection drift fails closed
- **WHEN** product/spec/test/contract bytes differ from the producing Apply post-action candidate, or deterministic selection no longer equals the origin selection fingerprint
- **WHEN** the operator invokes `flowkit verify --retry`
- **THEN** retry MUST fail closed before executing/publishing a superseding authority
- **AND** current failed `verification.md` and Apply terminal result MUST remain unchanged

#### Scenario: repeated retry preserves every superseded formal publication
- **WHEN** a previous explicit retry produced another failed current Verification publication for the same exact Apply candidate
- **WHEN** the operator invokes `flowkit verify --retry` again
- **THEN** Core MUST preserve that immediately previous publication under its own immutable content-fingerprint history ref
- **AND** the new publication MUST link to it while retaining the same origin Apply/candidate/selection identity
- **AND** Formal Reader MUST be able to validate a finite chain back to the original Apply terminal binding

#### Scenario: retry is not admitted outside verification-failed completed-Apply boundary
- **WHEN** current Verification is `passed`, `not-run`, `not-applicable` or unavailable, or the current Apply/revise-apply producer is pending/missing/ambiguous
- **WHEN** the operator invokes `flowkit verify --retry`
- **THEN** the CLI MUST fail closed
- **AND** MUST NOT publish a new Verification authority
