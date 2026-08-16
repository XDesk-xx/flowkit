# E1 schema migration fixtures

These fixtures are immutable shape samples used by migration tests. They model
version-first discrimination only; they are not a second Run corpus and do not
replace repository historical Runs.

- v2/v3/v4 are read-only historical shapes.
- v5 is the new writer shape paired with ActionPackage v2.
- unknown/cross-version combinations must fail closed.
