## ADDED Requirements

### Requirement: F1 Finalize Owner authorization 必须由 write-side exact-bind current qualification
`flowkit owner record --decision authorize-delivery-finalize` MUST derive the current finalization qualification from fresh formal facts/Policy. Caller input MUST remain sourceRef/delivery context only and MUST NOT supply `finalizationQualificationRef`. The persisted Owner record MUST bind the exact derived qualification; stale/missing qualification or a Policy gate that is no longer requesting Finalize authorization MUST fail closed before Manifest mutation.

#### Scenario: current qualification is bound automatically
- **WHEN** Policy requests `authorize-delivery-finalize` for qualification Q
- **AND** Owner explicitly records the decision
- **THEN** write-side MUST persist an Owner record whose `finalizationQualificationRef=Q`
- **AND** MUST NOT execute Finalize behavior

#### Scenario: stale Finalize record does not close a fresh gate
- **WHEN** a historical/current Owner record binds Q1
- **AND** current qualification is Q2 where Q1 != Q2
- **THEN** record presence MUST NOT authorize Q2
- **AND** a fresh Owner record MUST be required

### Requirement: post-pass required Change creation 必须原子失效 current Delivery qualification
When persisted raw `fullTestStatus=passed`, any newly admitted `required=true` Change MUST atomically invalidate the current passed qualification in the same Manifest publication as the new planned Change/Owner provenance. The operation MUST remove current Full Test result and set raw status to `not-ready`. If architecture is applicable and current cycle/source exists, it MUST also remove current architecture cycle and acceptedSystemSource. B1 failed corrective and E1 awaiting-architecture remediation remain separate exact-binding contracts.

#### Scenario: accepted architecture + new required Change requires fresh qualification
- **WHEN** Full Test is passed and current architecture cycle/source are accepted
- **AND** Owner creates a new required Change
- **THEN** create-change publication MUST remove current Full Test result/cycle/source and set raw status to `not-ready`
- **AND** after ordinary Change completion+checkpoint, fresh Owner Full Test authorization MUST be required
- **AND** architecture-applicable Delivery MUST produce fresh Actual/Compare/Owner acceptance before Finalize eligibility returns

#### Scenario: architecture-not-applicable still requires fresh Full Test
- **WHEN** Full Test is passed for architectureImpact=false
- **AND** Owner creates a new required Change
- **THEN** current Full Test result/status qualification MUST be invalidated
- **AND** fresh Full Test authorization/result MUST be required after checkpoint

#### Scenario: E1 awaiting architecture remediation keeps exact cycle binding
- **WHEN** passed Delivery has a current architecture cycle awaiting Owner acceptance
- **THEN** E1 `architectureRemediation.cycleRef` exact-match requirement MUST remain in force
- **AND** F1 general post-pass reset MUST NOT weaken or reinterpret B1 corrective/E1 remediation authority
