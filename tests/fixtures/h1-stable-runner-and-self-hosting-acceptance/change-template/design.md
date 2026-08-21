## Context

This is a disposable H1 self-hosting fixture. It intentionally has no production-code mutation.

## Goals / Non-Goals

- Goal: exercise a complete normal Change lifecycle through the installed runner.
- Non-goal: introduce a reusable product feature.

## Decisions

Apply only checks the current task. Verification remains Flowkit-owned.

## flowkitMutationScope

```json
{
  "schemaVersion": 1,
  "actions": {
    "apply": {
      "selectors": [
        { "kind": "exact", "path": "openspec/changes/__CHANGE_ID__/tasks.md" },
        { "kind": "exact", "path": "openspec/changes/__CHANGE_ID__/verification.md" }
      ]
    },
    "revise-apply": {
      "selectors": [
        { "kind": "exact", "path": "openspec/changes/__CHANGE_ID__/tasks.md" },
        { "kind": "exact", "path": "openspec/changes/__CHANGE_ID__/verification.md" }
      ]
    }
  }
}
```
