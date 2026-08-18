## ADDED Requirements

### Requirement: formal Architecture repository evidence 必须通过显式 repo-root seam 进入 exact Archify operation
The managed Archify adapter MUST support an explicit bounded repository-evidence root for `validate architecture`, `deliver architecture` and `compare architecture`. When supplied, the adapter MUST pass `--repo-root <root>`. The adapter MUST NOT inspect Architecture JSON to infer whether repository evidence exists and MUST NOT copy/reimplement the Archify schema.

Existing calls without repository evidence MUST remain compatible.

#### Scenario: evidence-bearing architecture validates with explicit repo root
- **WHEN** D1 supplies an Architecture JSON containing repository/source evidence and an explicit repository root
- **THEN** the adapter MUST invoke exact managed `archify@2.14.0` with `--repo-root <root>`
- **AND** repository evidence validation MUST be performed by Archify

### Requirement: exact managed Archify renderable type 必须最薄支持 Sequence
The Archify adapter renderable type MUST support `architecture`, `workflow`, `sequence`, and `lifecycle` for validate/deliver, using only exact managed `archify@2.14.0`. Adding `sequence` MUST NOT introduce ambient PATH authority, Registry/discovery, internal Archify imports or lifecycle authority.

Repository evidence MUST remain architecture-only: workflow/sequence/lifecycle calls supplied with repositoryRoot MUST fail closed.

#### Scenario: sequence validates and delivers with exact managed identity
- **WHEN** D1 invokes validate/deliver for a valid Sequence reference
- **THEN** the adapter MUST call exact managed `archify@2.14.0` with type `sequence`
- **AND** structured command/type/output identity checks MUST remain enforced

#### Scenario: sequence rejects repository evidence
- **WHEN** a caller supplies repositoryRoot for type `sequence`
- **THEN** the adapter MUST fail closed before pretending repo-root support
- **AND** architecture repository-evidence behavior MUST remain unchanged
