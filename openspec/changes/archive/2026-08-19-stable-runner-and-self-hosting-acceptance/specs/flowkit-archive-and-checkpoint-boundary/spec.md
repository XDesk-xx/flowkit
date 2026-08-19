## ADDED Requirements

### Requirement: public checkpoint handoff MUST be read-only and expose an exact Executor execution plan

After one completed/uncheckpointed Change has an exact matching `authorize-checkpoint` Owner fact, Flowkit MUST expose a stable read-only checkpoint handoff surface that a fresh Executor process can consume using repository/formal facts only. The handoff MUST identify the exact Delivery, Change, Owner authorization, checkpoint subject/trailers, current base revision, sorted current candidate paths, exact allowed EOF-only normalization operations by path, and required preflight commands.

Candidate/path derivation MUST be bounded by current formal Change facts, the completed Change Run/mutation declaration, archived OpenSpec artifacts and delta→canonical spec mapping, the Delivery Manifest, and current Git worktree/index facts. Unrelated dirty paths MUST fail closed. A path with trailing spaces/tabs, internal/semantic whitespace drift, or other non-EOF hygiene MUST NOT be converted into an allowed normalization operation.

The public handoff MUST STOP after returning the plan. It MUST NOT modify files, stage, commit, push, merge/rebase, record Owner authority, create a Checkpoint Run, or become a Checkpoint Adapter. Actual EOF-only mutation, staging, `git diff --cached --check`, commit and push remain Executor mechanics after the exact Owner authorization.

#### Scenario: fresh process receives an exact checkpoint plan
- **WHEN** a fresh process reads a completed/uncheckpointed Change with one exact `authorize-checkpoint` Owner fact
- **AND** the current candidate contains only formally bounded Change/archive paths
- **THEN** the checkpoint handoff MUST return exact Delivery/Change/Owner binding, subject/trailers, base revision and sorted candidate paths
- **AND** each redundant-EOF path MUST be listed with only `collapse-redundant-eof-blank-lines` and `ensure-exactly-one-final-newline`
- **AND** the handoff MUST require `git diff --check` before staging and `git diff --cached --check` after staging

#### Scenario: unrelated dirty path fails closed
- **WHEN** the repository contains a current dirty path outside the formally derived checkpoint candidate boundary
- **THEN** the public checkpoint handoff MUST fail closed
- **AND** MUST NOT broaden the allowed candidate set or mutate the unrelated path

#### Scenario: non-EOF hygiene fails closed
- **WHEN** a candidate/archive-touched text path contains trailing spaces/tabs or another forbidden non-EOF formatting mutation
- **THEN** the handoff MUST fail closed for that hygiene condition
- **AND** MUST NOT represent it as an EOF-only normalization operation

#### Scenario: public handoff performs no Git or file mutation
- **WHEN** the handoff is successfully generated
- **THEN** repository bytes, index, Git history, Owner facts and Run corpus MUST remain unchanged
- **AND** Executor mechanics MUST still be required to normalize, stage and form the authorized Git Change Checkpoint
