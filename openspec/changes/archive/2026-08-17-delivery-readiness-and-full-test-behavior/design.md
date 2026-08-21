## Context

See `proposal.md - Why` and the approved `explore.md` for feasibility evidence. The exact Base already has: `FullTestStatus` five-state type, delivery-scoped `authorize-full-test`, strict Change Checkpoint recognition, `verifyFullPlan()` / `npm run verify:full`, diagnostics, and the Q1→03 blocked bridge. What is missing is the Delivery-level machine layer that turns those facts into a real no-Run Full Test lifecycle.

Two approved Explore findings constrain this design:

- Full Test is not physically read-only: `build` writes ignored/generated `dist/**`; therefore re-entry must be bounded at-least-once from persisted `authorized`, and generated output can never be authority.
- Delivery readiness/authorization must be generic across Delivery ids and multi-Change graphs; no current 03/A1 identity or Change-count assumption may enter production behavior.

006 Review-Propose adds three proposal corrections:

- the current 03 execution binding is an **instance**, while future Delivery creation must persist caller/Delivery-contract supplied execution input;
- the persisted binding must identify the same physical route that produces the structured Verification result;
- terminal Full Test result shape and `resultRef` hash domain must be closed and recomputable by Reader.

008 Review-Propose adds three final execution-safety corrections:

- the logical persisted command must include bounded cross-platform launcher semantics; current 03 `npm` uses `launcherMode=npm-shim`, resolving deterministically to `npm` on non-win and `npm.cmd -> ComSpec` on win32;
- timeout re-entry is legal only after owned process-tree termination is proven; Windows `outcome-unknown` requires one durable current execution-block latch and MUST NOT start another attempt;
- only a valid Verification protocol payload may publish terminal `failed`; transport/execution failures never fabricate `verification:full-test:<hash>`.

## Goals / Non-Goals

**Goals:**

- Make Delivery readiness and Full Test lifecycle deterministic from repository/formal facts.
- Preserve Owner authorization as an independent delivery-scoped authority.
- Execute one already-decided Delivery Full Test behavior without reintroducing a Change Action/Run.
- Keep one per-Delivery physical execution contract and one machine-readable result protocol.
- Keep one closed terminal result/resultRef schema shared by Writer, Reader, B1 and resume.
- Make crash/re-entry repository-fact based and generic for future Deliveries.
- Ensure Change Verification physically reaches the public Delivery Full Test route.

**Non-Goals:**

- Delivery Finding/corrective Change implementation (B1).
- `FLOWKIT_HOME` / managed OpenSpec / Archify migration (C1).
- Delivery Finalize (F1).
- Full Test Action/Run, `_delivery/**`, NNN, Action Package or Agent Adapter.
- Generic Delivery Behavior Registry, Verification Registry, Tool Registry, dynamic command discovery, second plan compiler, Evidence platform, scheduler/concurrency redesign, automatic retry or automatic Owner authorization.

## Decisions

### 1. `awaiting-user-decision` is an effective pure projection, not a diagnostic write

Persisted `delivery.fullTestStatus=not-ready` remains the raw durable value while required Changes are still open. Once repository facts prove all required Changes completed + checkpointed, formal conflicts are zero, and the current Delivery execution contract is structurally valid, the shared readiness projection returns effective `awaiting-user-decision`.

`status` / `next` / `doctor` / `resume-context` consume that projection but never write it back.

**Alternative rejected:** persist `awaiting-user-decision` from `next/status` — violates diagnostics read-only and makes observation change authority.

### 2. Owner Full Test authorization and raw `authorized` publish atomically

`flowkit owner record --decision authorize-full-test ...` continues to be admitted only when current Policy requests the exact delivery-scoped decision. For this decision only, the bounded Manifest mutation publishes both the deterministic Owner record and raw `delivery.fullTestStatus=authorized` in one atomic replace.

It does not run Verification. If publication fails, neither fact is accepted.

**Alternative rejected:** write Owner fact first and status later — creates a durable split state requiring recovery metadata.

### 3. Policy adds one non-Action result variant

Extend `PolicyResult` with:

```text
kind: delivery-behavior
behavior: full-test
context-full-test: authorized
context-detail: ...
```

A1 adds only `full-test`; F1 may later extend the same small typed seam if its own contract approves it. `FormalAction`, `ACTION_DEFINITIONS`, Standard `canRun`, Run schema and Delivery-wide NNN remain unchanged.

### 4. Public execution surface is `flowkit delivery full-test`

The Delivery operator:

1. loads the current formal snapshot;
2. requires exact `PolicyResult={kind:'delivery-behavior', behavior:'full-test'}`;
3. reads the current Delivery's persisted execution contract;
4. spawns exactly that physical command/args once with bounded timeout;
5. requires/consumes the structured result protocol from that same child process;
6. validates terminal status/result consistency and computes `resultRef`;
7. atomically publishes terminal result;
8. returns control.

It never prepares/completes a Standard Run and never allocates NNN.

### 5. Full Test execution is per-Delivery contract input, not a repository-global constant

`DeliveryCreateInput` gains one typed Full Test execution contract in addition to the existing coverage-intent `fullTestPlan`.

Minimal schema:

```yaml
id: <non-empty delivery-local identity>
kind: "command"
command: <non-empty logical command>
launcherMode: "direct" | "npm-shim"
args:
  - <string>
scope: <non-empty delivery contract scope>
timeoutMs: <positive integer>
resultProtocol: "flowkit-full-test-result-v1"
resultAuthority: "verification"
expectedTerminalStatuses:
  - "passed"
  - "failed"
```

`createDelivery` validates schema/uniqueness and serializes exactly the supplied values. `launcherMode=direct` preserves the logical command and then uses the repository's existing bounded platform launcher mechanics; `launcherMode=npm-shim` is valid only with logical `command=npm` and deterministically resolves to `npm` on non-win32 or `npm.cmd` on win32 before existing `.cmd/.bat -> ComSpec` resolution. Reader validates the persisted contract structurally; it does **not** require all future Deliveries to equal the current Flowkit repository binding. This runtime normalization is part of the single persisted contract, not a second platform-specific execution authority.

Current already-started 03 receives a bounded A1 migration instance:

```yaml
id: "project-full-verification"
kind: "command"
command: "npm"
launcherMode: "npm-shim"
args:
  - "run"
  - "verify:full"
scope: "delivery"
timeoutMs: 120000
resultProtocol: "flowkit-full-test-result-v1"
resultAuthority: "verification"
expectedTerminalStatuses:
  - "passed"
  - "failed"
```

`120000ms` remains only this Delivery instance, justified by the approved exact-Base proof (~53s), not a universal product constant.

**Alternative rejected:** Writer synthesizes `npm run verify:full / 120000` for every future Delivery — violates generic Delivery creation.

### 6. The persisted command is the single physical execution authority

A1 chooses the command-binding branch of the 006 acceptance. `flowkit delivery full-test` MUST resolve the persisted logical `command + args + launcherMode` to exactly one platform launch and spawn it; it MUST NOT call `verifyFullPlan()` / `runVerificationPlan()` separately in-process to obtain a second result.

For `resultProtocol=flowkit-full-test-result-v1`, Flowkit creates a disposable result-file path and passes it to the child as:

```text
FLOWKIT_FULL_TEST_RESULT_PATH=<absolute disposable path>
```

The child command may continue writing human logs to stdout/stderr, but formal result parsing reads only the structured result file. Missing/malformed result file, protocol mismatch, child/result status disagreement, spawn failure or timeout fail closed; human log text is never parsed as formal authority.

For current 03, the same persisted logical identity has exactly these bounded platform launches:

```text
non-win32: npm run verify:full
win32:     npm.cmd run verify:full -> existing ComSpec launcher
```

Both continue to the same physical route:

```text
scripts/verification.ts main('verify:full')
→ verifyFullPlan()
→ runVerificationPlan(...)
```

When `FLOWKIT_FULL_TEST_RESULT_PATH` is present, that same route atomically writes protocol v1 output. Without the env variable, existing engineering CLI behavior stays compatible. Therefore `npm run verify:full` is a secondary human entry to the same physical route, not a separate Delivery authority.

### 7. Structured protocol v1 is minimal and closed

The child protocol file contains exactly the pre-hash terminal payload:

```json
{
  "schemaVersion": 1,
  "status": "passed",
  "summary": "all full-test checks passed",
  "totalDurationMs": 53123,
  "checks": [
    { "id": "quality", "status": "passed", "durationMs": 321 },
    { "id": "typecheck", "status": "passed", "durationMs": 4567 }
  ]
}
```

Rules:

- `status` is `passed|failed`.
- `summary` is a non-empty bounded human-readable string.
- `totalDurationMs` and each `durationMs` are non-negative integer milliseconds.
- `checks` contains the executed checks in physical execution order; check ids are non-empty and unique inside one result.
- Each check has exactly `id/status/durationMs`; no raw logs or command output enter the protocol.
- On normal child completion the child exit code and payload status MUST agree (`0 ↔ passed`, non-zero ↔ failed).
- `authorized -> passed|failed` is permitted **only** from a valid closed protocol payload whose status agrees with the terminal child exit. A valid protocol `status=failed` is the only source of durable Verification-owned `failed`. Spawn failure, timeout, missing/malformed/stale/mismatched protocol, or child/protocol disagreement MUST NOT create terminal Full Test result or `verification:full-test:<hash>`.

### 8. Terminal Manifest result schema and `resultRef` hash domain are exact

Manifest `verification.fullTest.result` uses the same payload plus `resultRef`:

```yaml
schemaVersion: 1
status: "passed|failed"
summary: "..."
totalDurationMs: 53123
checks:
  - id: "quality"
    status: "passed"
    durationMs: 321
  - id: "typecheck"
    status: "passed"
    durationMs: 4567
resultRef: "verification:full-test:<sha256>"
```

Canonical hash input excludes `resultRef` and is constructed independent of YAML ordering as follows:

```text
canonical object field order:
  schemaVersion
  status
  summary
  totalDurationMs
  checks

check object field order:
  id
  status
  durationMs

checks array order:
  structured protocol physical execution order

serialization:
  JSON.stringify(canonicalObject)
  UTF-8 bytes
  no pretty whitespace
  no trailing newline

hash:
  lowercase hex SHA-256(serialized bytes)

resultRef:
  verification:full-test:<hash>
```

Writer and Reader MUST reconstruct this exact canonical object rather than hashing Manifest/YAML bytes. Reader recomputes `resultRef` and fails closed on mismatch, duplicate check id, malformed integer/status, terminal status/result disagreement or unsupported schemaVersion.

This gives B1 one stable `failed status + resultRef + timing/check projection` without interpreting raw logs or implementation-specific output.

### 9. Re-entry is bounded at-least-once only after prior execution is proven terminal

There is no normal `running` FullTestStatus and no attempt ledger. Durable status stays `authorized` until a genuine Verification terminal payload is atomically published. Re-entry safety is classified from the existing external-command outcome:

- `spawn-failed`: no child started; keep `authorized`, no result/resultRef, operator returns execution error; re-entry is safe.
- `exited` + missing/malformed/stale/mismatched protocol: child is terminal; keep `authorized`, no result/resultRef, operator returns protocol error; re-entry is safe with a fresh disposable result path.
- non-Windows timeout: existing bounded launcher termination yields `timed-out-cancelled`; keep `authorized`, no result/resultRef; re-entry is safe only after that terminal outcome.
- Windows timeout: Full Test service MUST provide an owned whole-process-tree canceller through the existing `windowsProcessTreeCanceller` seam. The bounded implementation uses the Windows process-tree authority (`taskkill.exe /PID <launcherPid> /T /F`) and treats success only as `timed-out-cancelled`. If cancellation is absent/fails/cannot prove termination, the command outcome is `outcome-unknown`.

For `outcome-unknown`, before returning control Flowkit MUST atomically persist exactly one current safety latch:

```yaml
verification:
  fullTest:
    executionBlock:
      schemaVersion: 1
      reason: outcome-unknown
      summary: <bounded non-empty diagnostic>
```

The latch is Flowkit-owned execution-safety state, not Verification truth: it contains no `resultRef`, no check result, no raw logs, no attempt history and does not change raw `fullTestStatus=authorized`. While it exists, Policy/`flowkit delivery full-test` MUST fail closed and MUST NOT start another attempt. A1 does not auto-clear it or invent a recovery result. Clearing/recovery mechanics are intentionally out of A1 scope; until a later explicit recovery authority proves prior-tree termination and removes the latch, current Policy remains fail-closed. This avoids inventing a scheduler/supervisor merely to make the rare unknown outcome self-heal.

This is the only exceptional durable execution marker A1 adds. It is required by the approved no-overlap invariant and is not a generic scheduler/background supervisor/running-state platform.

### 10. Failed stays terminal for A1 and is B1's input

A1 publishes `failed` plus closed result/resultRef/timing and stops **only when the valid Verification protocol itself reports `failed`**. Policy continues to return `full-test-failed` blocked/Owner boundary semantics. It does not retry or create a Change. B1 consumes only that genuine terminal Verification projection as its source fact; execution/transport diagnostics and `executionBlock` are not B1 findings.

### 11. Apply must prove physical Verification closure

Implementation tests must cover:

- readiness not-ready → effective awaiting projection;
- Owner authorization atomically yields raw authorized;
- `delivery-behavior` Policy result and deterministic diagnostics formatting;
- `createDelivery` persists two different caller-supplied Full Test execution contracts without current-03 hardcode, including `launcherMode`;
- current 03 bounded migration writes only its instance binding;
- real `flowkit delivery full-test` resolves persisted logical command/args/launcherMode, consumes protocol file, publishes terminal passed/failed and creates no Run/NNN;
- human `npm run verify:full` without protocol env remains compatible;
- result protocol/resultRef canonicalization and Reader recomputation;
- cross-platform launcher normalization (`npm-shim`: non-win npm, win32 npm.cmd -> ComSpec) and bare npm not assumed on Windows;
- timeout ownership: Windows descendant-survival fixture must yield `outcome-unknown` unless whole-tree canceller proves termination; persisted executionBlock prevents a second attempt; non-Windows timeout remains bounded;
- transport-vs-Verification distinction: spawn/timed-out-cancelled/protocol failures produce no terminal resultRef, while valid protocol failed does;
- mid-attempt/post-success-pre-publication re-entry from authorized with fresh result path only when prior execution is terminal;
- current 03 and future-Delivery-shaped multi-Change/fresh-process fixtures;
- malformed/missing execution contract and terminal result mismatch fail closed;
- counterfactual route-break: if the public operator stops spawning persisted command or ignores its protocol output, formally selected A1 tests MUST fail.

The Change Verification module map must select the physical files above from A1's actualChangeSet. Running repository-wide tests manually is not a substitute for this selection proof, and none of these checks acquires Owner-authorized Delivery Full Test lifecycle semantics.

## flowkitMutationScope

```json
{
  "schemaVersion": 1,
  "actions": {
    "apply": {
      "selectors": [
        {
          "kind": "exact",
          "path": "openspec/changes/delivery-readiness-and-full-test-behavior/tasks.md"
        },
        {
          "kind": "exact",
          "path": "openspec/changes/delivery-readiness-and-full-test-behavior/verification.md"
        },
        {
          "kind": "exact",
          "path": "openspec/delivery-groups/20260817-01-delivery-execution-loop.yaml"
        },
        {
          "kind": "exact",
          "path": "scripts/verification.ts"
        },
        {
          "kind": "exact",
          "path": "src/cli/main.ts"
        },
        {
          "kind": "prefix",
          "path": "src/diagnostics"
        },
        {
          "kind": "exact",
          "path": "src/domain/a1-types.ts"
        },
        {
          "kind": "exact",
          "path": "src/domain/full-test.ts"
        },
        {
          "kind": "exact",
          "path": "src/domain/types.ts"
        },
        {
          "kind": "exact",
          "path": "src/facts/formal-fact-reader.ts"
        },
        {
          "kind": "exact",
          "path": "src/facts/formal-fact-snapshot.ts"
        },
        {
          "kind": "exact",
          "path": "src/persistence/delivery-manifest-document.ts"
        },
        {
          "kind": "prefix",
          "path": "src/policy"
        },
        {
          "kind": "exact",
          "path": "src/services/a1-write-service.ts"
        },
        {
          "kind": "exact",
          "path": "src/services/delivery-full-test-service.ts"
        },
        {
          "kind": "exact",
          "path": "src/shared/external-command.ts"
        },
        {
          "kind": "prefix",
          "path": "src/verification/change-selection"
        },
        {
          "kind": "prefix",
          "path": "tests/fixtures/a1-delivery-readiness-and-full-test-behavior"
        },
        {
          "kind": "exact",
          "path": "tests/integration/a1-delivery-readiness-and-full-test-behavior.test.ts"
        },
        {
          "kind": "exact",
          "path": "tests/integration/diagnostic-cli-process.test.ts"
        },
        {
          "kind": "exact",
          "path": "tests/integration/diagnostic-cli.test.ts"
        },
        {
          "kind": "exact",
          "path": "tests/integration/g1-change-cli-end-to-end.test.ts"
        },
        {
          "kind": "exact",
          "path": "tests/integration/verification-commands.test.ts"
        },
        {
          "kind": "prefix",
          "path": "tests/unit/cli"
        },
        {
          "kind": "prefix",
          "path": "tests/unit/diagnostics"
        },
        {
          "kind": "prefix",
          "path": "tests/unit/domain"
        },
        {
          "kind": "prefix",
          "path": "tests/unit/facts"
        },
        {
          "kind": "prefix",
          "path": "tests/unit/persistence"
        },
        {
          "kind": "prefix",
          "path": "tests/unit/policy"
        },
        {
          "kind": "prefix",
          "path": "tests/unit/services"
        },
        {
          "kind": "prefix",
          "path": "tests/unit/shared"
        },
        {
          "kind": "prefix",
          "path": "tests/unit/verification"
        }
      ]
    },
    "revise-apply": {
      "selectors": [
        {
          "kind": "exact",
          "path": "openspec/changes/delivery-readiness-and-full-test-behavior/tasks.md"
        },
        {
          "kind": "exact",
          "path": "openspec/changes/delivery-readiness-and-full-test-behavior/verification.md"
        },
        {
          "kind": "exact",
          "path": "openspec/delivery-groups/20260817-01-delivery-execution-loop.yaml"
        },
        {
          "kind": "exact",
          "path": "scripts/verification.ts"
        },
        {
          "kind": "exact",
          "path": "src/cli/main.ts"
        },
        {
          "kind": "prefix",
          "path": "src/diagnostics"
        },
        {
          "kind": "exact",
          "path": "src/domain/a1-types.ts"
        },
        {
          "kind": "exact",
          "path": "src/domain/full-test.ts"
        },
        {
          "kind": "exact",
          "path": "src/domain/types.ts"
        },
        {
          "kind": "exact",
          "path": "src/facts/formal-fact-reader.ts"
        },
        {
          "kind": "exact",
          "path": "src/facts/formal-fact-snapshot.ts"
        },
        {
          "kind": "exact",
          "path": "src/persistence/delivery-manifest-document.ts"
        },
        {
          "kind": "prefix",
          "path": "src/policy"
        },
        {
          "kind": "exact",
          "path": "src/services/a1-write-service.ts"
        },
        {
          "kind": "exact",
          "path": "src/services/delivery-full-test-service.ts"
        },
        {
          "kind": "exact",
          "path": "src/shared/external-command.ts"
        },
        {
          "kind": "prefix",
          "path": "src/verification/change-selection"
        },
        {
          "kind": "prefix",
          "path": "tests/fixtures/a1-delivery-readiness-and-full-test-behavior"
        },
        {
          "kind": "exact",
          "path": "tests/integration/a1-delivery-readiness-and-full-test-behavior.test.ts"
        },
        {
          "kind": "exact",
          "path": "tests/integration/diagnostic-cli-process.test.ts"
        },
        {
          "kind": "exact",
          "path": "tests/integration/diagnostic-cli.test.ts"
        },
        {
          "kind": "exact",
          "path": "tests/integration/g1-change-cli-end-to-end.test.ts"
        },
        {
          "kind": "exact",
          "path": "tests/integration/verification-commands.test.ts"
        },
        {
          "kind": "prefix",
          "path": "tests/unit/cli"
        },
        {
          "kind": "prefix",
          "path": "tests/unit/diagnostics"
        },
        {
          "kind": "prefix",
          "path": "tests/unit/domain"
        },
        {
          "kind": "prefix",
          "path": "tests/unit/facts"
        },
        {
          "kind": "prefix",
          "path": "tests/unit/persistence"
        },
        {
          "kind": "prefix",
          "path": "tests/unit/policy"
        },
        {
          "kind": "prefix",
          "path": "tests/unit/services"
        },
        {
          "kind": "prefix",
          "path": "tests/unit/shared"
        },
        {
          "kind": "prefix",
          "path": "tests/unit/verification"
        }
      ]
    }
  }
}
```

## Risks / Trade-offs

- **[Raw `not-ready` differs from effective `awaiting-user-decision`]** → keep both concepts explicit in types/tests; diagnostics show effective lifecycle status, persistence tests verify Manifest stays byte-stable until an authorized write.
- **[Owner record + status mutation broadens an existing write service]** → restrict the special case to exact `authorize-full-test` gate and use one atomic Manifest replace; other authorization semantics remain unchanged.
- **[Per-Delivery command contract can be malformed]** → typed create input + Reader schema validation + fail-closed Policy; do not add dynamic discovery/Registry.
- **[Current 03 120s timeout may be tight on unusually slow hosts]** → it is only the current 03 contract instance based on measured ~53s execution; future Deliveries supply their own timeout. Timeout does not silently increase budget; re-entry requires proven prior-tree termination.
- **[Windows npm shim semantics differ from POSIX]** → the persisted contract carries `launcherMode`; current 03 `npm-shim` maps logical npm deterministically to `npm.cmd` on win32 and reuses existing ComSpec handling. No ambient shell discovery or C1 tool runtime is introduced.
- **[Windows tree cancellation can be outcome-unknown]** → use the existing owned canceller seam; on unproven termination atomically persist only the current executionBlock and prohibit overlap.
- **[Transport failure could be mistaken for test failure]** → only valid protocol `status=failed` can publish Delivery Full Test failed/resultRef; all other execution/protocol faults remain non-terminal to Verification.
- **[Structured result file becomes stale across crash]** → every attempt uses a fresh disposable path; old/partial files never become authority.
- **[Generated `dist/**` survives a crash]** → it is ignored/reproducible and never read as authority; fresh attempt overwrites it.
- **[Manifest result grows]** → only compact check status/duration + summary/ref/status are stored; no raw logs or attempt history ledger.
- **[Current 03 Manifest predates execution contract]** → A1 Apply performs one bounded migration of this active Delivery; future manifests are born from caller-supplied typed input. Missing/invalid contract fails closed after A1 activation boundary.

## Migration Plan

1. Extend domain/Reader/Policy types for raw/effective Full Test facts, typed per-Delivery execution contract (including `launcherMode`), optional current executionBlock, terminal result and `delivery-behavior` result.
2. Add bounded Manifest parsing/writing for `verification.fullTest.execution/result`; migrate current 03 Manifest by adding only the approved 03 instance binding without changing coverage intent.
3. Extend `DeliveryCreateInput` and `create delivery` serialization to validate/persist caller-supplied execution contract; do not synthesize current-03 values.
4. Extend exact `authorize-full-test` write admission to atomically publish Owner fact + raw `authorized`.
5. Extend the existing `scripts/verification.ts verify:full` physical route so protocol env presence causes atomic structured result-file publication while preserving human CLI compatibility.
6. Add the Delivery Full Test service/operator that resolves the persisted launcherMode, reuses existing bounded external-command mechanics with owned Windows whole-tree cancellation, consumes protocol v1, classifies transport outcomes, computes/verifies canonical `resultRef`, atomically publishes genuine terminal Manifest state, and writes executionBlock only for unproven `outcome-unknown`.
7. Update diagnostics and physical E2E/Verification selection coverage, including generic future-Delivery input and route-break counterfactuals.
8. Keep rollback mechanical before checkpoint: reverting A1 candidate restores the pre-A1 bridge; no historical Run or Git boundary is rewritten.
