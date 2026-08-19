## Purpose

Define the minimal disposable capability used only by the H1 future-Delivery self-hosting acceptance fixture.

## ADDED Requirements

### Requirement: Future fixture Change completes deterministically

The fixture Change MUST be executable as one normal Flowkit Change lifecycle without introducing product authority outside Flowkit/OpenSpec/Owner/Reviewer/Verification/Git.

#### Scenario: Apply completes the fixture task
- **WHEN** the approved fixture Change reaches Apply
- **THEN** the task MUST be marked complete
- **AND** Change Verification MUST remain a separate Flowkit-owned technical authority
