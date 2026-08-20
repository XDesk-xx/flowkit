## ADDED Requirements

### Requirement: PowerShell launcher absence MUST be distinguished from permission and other spawn failures

For Windows `.ps1` execution, PowerShell launcher fallback MUST treat only an explicit spawn `ENOENT` as “this launcher is absent”. `pwsh.exe` MAY fall back to `powershell.exe` only after `ENOENT`; if both candidates return `ENOENT`, the runner MUST produce the existing machine-distinguishable `POWERSHELL_NOT_FOUND` failure. `EACCES`、permission/lookup errors、a launcher that already started and then failed、timeout and any other spawn result MUST remain terminal and MUST NOT be reclassified as launcher absence.

Verification that asserts exact launcher-absence behavior MUST own that negative premise deterministically, using a test-owned absolute nonexistent executable path or an equivalently controlled environment. It MUST NOT depend on an ambient PATH search for a random bare executable name when the expected errno is part of the assertion.

#### Scenario: first launcher ENOENT permits fallback

- **WHEN** the first PowerShell launcher spawn returns `ENOENT`
- **AND** the second launcher can start
- **THEN** the runner MUST attempt the second launcher with the original script/argv contract

#### Scenario: EACCES remains terminal

- **WHEN** a PowerShell launcher spawn returns `EACCES` or another non-`ENOENT` spawn failure
- **THEN** the runner MUST fail closed at that launcher
- **AND** MUST NOT continue as if the launcher were absent

#### Scenario: negative launcher fixture is environment-owned

- **WHEN** a regression requires deterministic “launcher not found” semantics
- **THEN** the fixture MUST use a test-owned absence premise independent of ambient PATH permissions/order
- **AND** hostile or unreadable ambient PATH entries MUST NOT change the expected absence result
