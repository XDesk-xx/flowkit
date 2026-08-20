## ADDED Requirements

### Requirement: Double-quoted YAML scalar MUST round-trip with the current writer escape language

Delivery Manifest double-quoted string values written by the current `JSON.stringify()`-compatible writer MUST be decoded by the shared YAML reader exactly once using the same quoted-string escape semantics. The original serialized scalar bytes MUST be the only escape input; decoding MUST NOT use staged/chained replacements that reinterpret backslash sequences created by an earlier replacement.

For every supported string value, `value → writer → reader` MUST restore the exact semantic value. This includes quote/backslash、literal `\\n|\\t|\\r|\\uXXXX` text、actual JSON-compatible control escapes、Unicode/control characters以及 Windows-shaped executable/path/args. Malformed/unsupported quoted scalars MUST continue to fail closed under the existing handwritten YAML-subset contract; J1 MUST NOT add a second YAML runtime dependency or silently migrate repository facts.

#### Scenario: double-quoted scalar exact semantic round-trip

- **WHEN** writer persists a supported string using its current JSON-compatible quoted form
- **AND** the value contains quote、backslash、literal escape-shaped text、actual control escapes、Unicode or Windows-shaped path text
- **THEN** Reader MUST restore the exact original semantic string
- **AND** characters produced by decoding MUST NOT become a second round of escape input

#### Scenario: legacy command Windows-shaped value不得被二次解释

- **WHEN** a legacy `kind=command` Full Test contract persists command/args containing literal backslash + `n`、`t`、`r` or `uXXXX`-shaped text
- **THEN** Reader MUST restore command/args exactly as written
- **AND** MUST NOT turn those literal sequences into newline、tab、carriage return or Unicode escape output unless they were escapes in the original serialized scalar bytes

#### Scenario: repository YAML semantics remain compatible

- **WHEN** the J1 reader parses the repository YAML corpus that was valid before J1
- **THEN** its semantic projections MUST remain identical for supported inputs
- **AND** J1 MUST NOT require a broad YAML rewrite or migration
