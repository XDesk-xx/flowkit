## ADDED Requirements

### Requirement: F1 finalization identity/projection 必须是 closed deterministic domain model
Core domain MUST define bounded typed identities for finalization qualification, final candidate, and minimal finalization projection. Finalization qualification MUST include an exact `qualifiedBaseRevision` derived from formal Git boundary facts rather than caller input, and final candidate identity MUST reuse that revision rather than recapturing arbitrary current HEAD. Owner decision records/facts MAY carry optional `finalizationQualificationRef` only as an applicability binding; arbitrary metadata bags are forbidden. Canonical Owner ref generation MUST include the field only when present so historical records without it preserve their prior refs.

#### Scenario: qualification/candidate refs use closed typed prefixes
- **WHEN** F1 derives a finalization qualification or final candidate identity
- **THEN** the result MUST use a closed typed `<prefix>:<sha256>` shape
- **AND** parsing MUST reject malformed/unexpected fields
- **AND** qualification/candidate canonicalization MUST bind the same exact `qualifiedBaseRevision`

#### Scenario: legacy Owner ref is stable when F1 field is absent
- **WHEN** a pre-F1 Owner record is canonicalized without `finalizationQualificationRef`
- **THEN** canonical tuple/ref MUST remain byte-for-byte compatible with the pre-F1 algorithm
