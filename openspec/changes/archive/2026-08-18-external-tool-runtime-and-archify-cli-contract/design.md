## Context

03 的 A1/B1 已完成并 checkpoint。C1 进入时，OpenSpec 1.7 thin integration 已经拥有 structured machine contract、archive/retry/recovery 与 Windows `.ps1/.cmd` regressions，但 executable authority 仍是 `explicit → FLOWKIT_OPENSPEC_BIN → ambient PATH/shim`。03 又需要第一个 Archify runtime，因此 C1 是第一次有充分证据抽出 shared external-tool seam。

029 Explore 已完成 managed OpenSpec、static two-tool resolver、Archify doctor/validate/deliver/compare、architecture/workflow/lifecycle renderer、JSON/HTML/receipt、atomic failure、synthetic review ZIP 与 Verification closure feasibility proof。030 Reviewer 又基于新的 exact `v2.14.0` external fact 独立验证：`archify-2.14.0/archify.zip` SHA256=`1b610a4d8ff5821cccd7a3dfe2d0943d11e64bda1d2fb0511944df190472f175`，并从该 exact bytes 重跑 doctor/validate/deliver/compare PASS，因此 029 的唯一 external gap 已关闭，不需要 no-op revise-explore。

## Goals / Non-Goals

**Goals:**
- 建立一个 closed OpenSpec+Archify managed external-tool runtime；
- canonical managed invocation 使用 exact offline identity + current Node direct entrypoint；
- OpenSpec 从 ambient/shim canonical model 平滑迁移，同时保留 bounded historical compatibility；
- Archify 只通过 CLI adapter 暴露真实 doctor/validate/deliver/compare + renderer/receipt behavior；
- formal Change Verification 物理覆盖 managed tool route；
- 为 D1 证明 synthetic review ZIP 可物理生成。

**Non-Goals:**
- Tool Registry / dynamic discovery / online installer / marketplace；
- vendoring OpenSpec/Archify source 到 flowkit repository；
- import/reimplement Archify internal modules/schema/renderer；
- `FLOWKIT_ARCHIFY_BIN` ambient override；
- 正式 Current / Planned / Actual Architecture 或 `architecture/**` assets；
- D1 public `flowkit architecture render/compare` lifecycle binding；
- generic receipt/evidence database、ZIP lifecycle、Architecture acceptance/promotion；
- Delivery Full Test / Finalize authority changes。

## Decisions

### 1. `FLOWKIT_HOME` 只提供最小 local environment root

Resolution:

```text
explicit env FLOWKIT_HOME
→ MUST be absolute, non-empty

otherwise
→ <os.homedir()>/.flowkit
```

C1 only standardizes:

```text
FLOWKIT_HOME/
└─ tools/
   ├─ openspec/
   │  └─ 1.7.0/
   │     ├─ distribution/
   │     │  └─ fission-ai-openspec-1.7.0.tgz
   │     └─ runtime/
   │        └─ node_modules/@fission-ai/openspec/bin/openspec.js
   └─ archify/
      └─ 2.14.0/
         ├─ distribution/
         │  └─ archify.zip
         └─ runtime/
            └─ archify/bin/archify.mjs
```

Provision/materialization is an operator/setup responsibility. Normal Flowkit lifecycle MUST NOT download/install tools online. H1 may later package a ready `tools/` tree, but C1 does not add an installer command.

### 2. Exact identity = static descriptor + preserved upstream distribution + runtime metadata/entrypoint validation

C1 introduces a closed static descriptor set, not a Registry:

```text
openspec@1.7.0
  distribution sha256 = 3e0bd044bf1fae1732f201fab7b5c1c8ceb4ef89bed9923f89a33cb4f0750afd
  packageName = @fission-ai/openspec
  packageVersion = 1.7.0
  packageJson = runtime/node_modules/@fission-ai/openspec/package.json
  entrypoint = runtime/node_modules/@fission-ai/openspec/bin/openspec.js

archify@2.14.0
  distribution sha256 = 1b610a4d8ff5821cccd7a3dfe2d0943d11e64bda1d2fb0511944df190472f175
  packageName = archify
  packageVersion = 2.14.0
  packageJson = runtime/archify/package.json
  entrypoint = runtime/archify/bin/archify.mjs
```

The outer GitHub tag Source ZIP and locally renamed/offline wrapper ZIP are acquisition/transport facts, not canonical runtime identity. For Archify the pinned official runtime distribution is the exact `archify.zip` bytes. For OpenSpec the pinned upstream package identity is the exact npm tarball; the already-prepared offline `node_modules` bundle is bootstrap provisioning transport.

Resolver validation order per descriptor:

```text
tool home path
→ distribution file exists + SHA256 exact
→ package.json exists
→ package name/version exact
→ entrypoint exists/readable
→ produce invocation
```

Errors remain bounded:

```text
EXTERNAL_TOOL_HOME_INVALID
EXTERNAL_TOOL_DISTRIBUTION_MISMATCH
EXTERNAL_TOOL_PACKAGE_MISMATCH
EXTERNAL_TOOL_ENTRYPOINT_MISSING
```

No network fallback, no “closest version”, no dynamic provider selection.

### 3. Invocation is command + argsPrefix, not a single executable string

Managed invocation shape:

```ts
{
  toolId,
  version,
  source: 'managed',
  toolHome,
  command: process.execPath,
  argsPrefix: [absoluteEntrypoint],
  propagationEnv: { FLOWKIT_HOME: absoluteFlowkitHome }
}
```

`OpenSpecCliAdapter` and new `ArchifyCliAdapter` append operation args after `argsPrefix` and continue using shared `runCommand` for process semantics.

Existing test/compatibility injection may map to:

```ts
{
  source: 'explicit-compat' | 'legacy-compat',
  command: <existing executable>,
  argsPrefix: []
}
```

`runner` is only the process execution/observation callback. Its presence MUST NOT be interpreted as executable authority. A fake/injected test that intends to replace executable identity MUST do so through the explicit `executable` or `invocation` seam; an observational runner continues consuming whatever identity the normal resolver selects.

This preserves the existing adapter seam without pretending `node + entrypoint` can be encoded as one executable string.

### 4. OpenSpec migration order is explicit injection → managed → legacy env → ambient fallback

`resolveOpenSpecInvocation()` freezes:

```text
1. explicit/injected executable/invocation
   → controlled test/existing adapter seam

2. valid FLOWKIT_HOME/tools/openspec/1.7.0
   → canonical managed route

3. FLOWKIT_OPENSPEC_BIN
   → bounded compatibility fallback

4. historical ambient route
   POSIX: openspec
   Windows: complete ps1 search → cmd fallback
```

Important distinction:

```text
managed tool home malformed
→ fail closed
→ MUST NOT silently downgrade to ambient PATH

managed tool home absent
→ compatibility fallback may be used
```

Existing Windows `.ps1/.cmd` launcher behavior remains unchanged and regression-covered; C1 removes its canonical status, not its historical support.

### 5. Nested OpenSpec identity propagates through environment identity, not executable-string rewriting

For managed route:

```text
parent FLOWKIT_HOME
→ child standalone env preserves FLOWKIT_HOME
→ child independently resolves same static descriptor
```

For explicit/legacy compatibility route:

```text
exact FLOWKIT_OPENSPEC_BIN
→ may continue to be propagated
```

Migrate `scripts/verification.ts` and formal Verification evidence execution so managed OpenSpec does not get reduced to `FLOWKIT_OPENSPEC_BIN=process.execPath` without its entrypoint. This applies to:

```text
current Change strict
archive-sync
verify --retry / real-process integration
Change Verification selected tests
Delivery Full Test technical child environment
```

No new Delivery Full Test lifecycle authority is created.

### 6. Archify adapter is closed and thin

`ArchifyCliAdapter` uses only the managed exact Archify invocation. No ambient fallback and no `FLOWKIT_ARCHIFY_BIN`.

Supported C1 surface:

```text
doctor
validate architecture|workflow|lifecycle
deliver architecture|workflow|lifecycle
compare architecture
```

All structured operations request JSON where supported. The adapter validates only bounded success semantics needed by Flowkit/tests:

```text
process outcome must be exited
exitCode must be 0
JSON must parse where contract says JSON
structured ok/result coherence must indicate success
requested generated output must physically exist where required
```

It does NOT reproduce Archify's full result schema. Malformed/incoherent output is `ARCHIFY_MALFORMED_OUTPUT`; terminal external failure is `ARCHIFY_OPERATION_FAILED`.

### 7. JSON remains input; HTML/receipt remain derived outputs

C1 does not create an Architecture state machine around renderer outputs.

```text
JSON
→ supplied tool input

HTML
→ generated, disposable, reproducible view

receipt
→ generated structured tool output / review evidence
```

C1 tests MUST prove:
- same synthetic JSON + exact runtime can regenerate same HTML after deletion；
- compare JSON stdout/receipt sidecar remain coherent；
- invalid render/compare is rejected and last-good generated artifact is not admitted as newly successful output；
- missing/stale HTML does not create Flowkit lifecycle state。

D1/E1 own the later durable repository Architecture JSON/ref semantics.

### 8. Review ZIP is acceptance proof, not product lifecycle

C1 integration proof creates a disposable ZIP containing synthetic:

```text
architecture JSON + HTML + receipt
workflow JSON + HTML + receipt
lifecycle JSON + HTML + receipt
compare HTML + receipt
```

Then runs ZIP integrity validation. The ZIP is ordinary operator/reviewer transport. No Archify ZIP command, no repository transport registry, no Run sidecar and no durable Architecture authority are added.

### 9. Verification gets a new closed external-tools module/check with exact non-overlapping ownership

Add stable logical check:

```text
tests-external-tools
```

The C1 ownership layout is frozen around the current `owns(selector, path)` prefix semantics. It MUST NOT rely on selector precedence, because the current module-map rejects any overlapping selector pair.

```text
external-tools
ownership:
  src/integrations/archify
  src/integrations/external-tools
  tests/fixtures/c1-external-tool-runtime-and-archify-cli-contract
  tests/integration/c1-external-tool-runtime-and-archify-cli-contract.test.ts
  tests/unit/external-tools

verificationScopes:
  tests-external-tools
  typecheck

capabilityIds:
  flowkit-external-tool-runtime
  flowkit-integration-boundaries
```

Existing OpenSpec unit ownership stays intact and exclusive:

```text
openspec-runtime
ownership retained:
  src/integrations/openspec
  src/shared/external-command.ts
  tests/integration/openspec-1-7-real-cli.test.ts
  tests/unit/external-command.test.ts
  tests/unit/integrations
```

C1 therefore freezes the following test-placement rule:

```text
new Archify/shared-runtime unit tests
→ tests/unit/external-tools/**
→ exactly one owner: external-tools

existing OpenSpec adapter/archive/path unit tests
→ tests/unit/integrations/**
→ exactly one owner: openspec-runtime

verify --retry public CLI regression
→ tests/unit/cli/change-action.test.ts
→ exactly one owner: cli-diagnostics
```

No `external-tools` selector may be added under `tests/unit/integrations/**`. If a future test needs a different owner, Proposal authority must change the source-controlled module map instead of relying on overlapping prefixes.

Dependency closure is also frozen:

```text
external-tools
→ base dependency: core-model

openspec-runtime
→ depends on external-tools + existing core-model/execution

verification-selection
→ remains downstream of openspec-runtime
```

Therefore a shared external-tool production mutation seeds `external-tools`, selects `tests-external-tools`, and through reverse dependency closure also selects existing `tests-openspec-runtime` plus verification-selection checks. Existing OpenSpec-only mutations continue to seed `openspec-runtime`, not `external-tools`.

`CLOSED_VERIFICATION_SCOPES` must add `tests-external-tools`; `CLOSED_CAPABILITY_IDS` must add `flowkit-external-tool-runtime` and the already-canonical `flowkit-integration-boundaries` capability so all four C1 delta capabilities can be related to the selected module closure.

`module-map.test.ts` MUST prove, under the real current `owns()` implementation:

```text
src/integrations/external-tools/managed-tool.ts
→ exactly external-tools

src/integrations/archify/archify-cli-adapter.ts
→ exactly external-tools

tests/unit/external-tools/managed-tool.test.ts
→ exactly external-tools

tests/unit/integrations/openspec-cli-adapter.test.ts
→ exactly openspec-runtime

tests/unit/cli/change-action.test.ts
→ exactly cli-diagnostics
```

It MUST also include a negative overlap counterexample showing that adding an `external-tools` selector beneath `tests/unit/integrations` would make `validateVerificationModuleMap()` fail closed.

Proposal-time closure check against Base `104c14cc...` and the current `owns(selector, path)` semantics produced:

```text
proposed full selector set overlap count = 0

src/integrations/external-tools/managed-tool.ts
→ external-tools only

src/integrations/archify/archify-cli-adapter.ts
→ external-tools only

tests/unit/external-tools/managed-tool.test.ts
→ external-tools only

tests/unit/integrations/openspec-cli-adapter.test.ts
→ openspec-runtime only

tests/unit/cli/change-action.test.ts
→ cli-diagnostics only

tests/unit/services/b1-openspec-action-context.test.ts
→ execution only
```

Counterexample:

```text
external-tools selector = tests/unit/integrations/archify
+ openspec-runtime selector = tests/unit/integrations
→ overlap detected
→ formal module-map validation must fail closed
```

`evidence.ts` maps `tests-external-tools` to the actual C1 physical integration/unit targets. A counterfactual sentinel MUST break the managed Archify/OpenSpec route and observe formal selected failure.

### 9.1 Managed retry coverage is distinct from legacy compatibility coverage

The existing real `verify --retry` regression in `tests/unit/cli/change-action.test.ts` is a direct consumer of the old `FLOWKIT_OPENSPEC_BIN` carrier and is part of the approved C1 migration surface.

C1 MUST revise that regression so the canonical managed case executes the public retry route with:

```text
FLOWKIT_HOME = valid managed OpenSpec home
FLOWKIT_OPENSPEC_BIN = absent
ambient OpenSpec PATH authority = absent/poisoned
```

and still reaches the exact managed OpenSpec identity.

A separate compatibility case MAY continue to set `FLOWKIT_OPENSPEC_BIN` explicitly and prove the retained legacy route. That compatibility case MUST be labelled/structured as compatibility coverage and MUST NOT stand in for the managed canonical-path proof.

Likewise, public `test:full`/`fullTestEnvironment()` under a valid managed tool home MUST propagate `FLOWKIT_HOME` and MUST NOT synthesize `FLOWKIT_OPENSPEC_BIN` merely to satisfy an old regression assumption. Legacy-only child execution may still receive the exact compatibility executable when the parent itself resolved a compatibility route.

The Reset correction additionally requires the real-process adapter regression that wraps `runCommand` only for observation to remain on the managed invocation. Unit/service fake runners that synthesize OpenSpec output instead of executing the selected command MUST declare their injected identity through `executable`/`invocation`; `runner` presence is never a precedence signal.

### 10. C1 activation is repository-global only after archive + Change Checkpoint

During detached C1 Apply, current canonical execution remains Base `104c14cc...`. New managed semantics are candidate facts only. After C1 archive + Owner-authorized Change Checkpoint, later D1–H1 and future Deliveries consume the new resolver from repository bytes/fresh process.

No Manifest migration/version registry is introduced because tool runtime identity is local environment resolution, not Delivery durable state.

## Risks / Trade-offs

- **[Exact distribution vs extracted tree]** → resolver verifies preserved upstream distribution fingerprint plus runtime package metadata/entrypoint. C1 intentionally does not hash every extracted dependency file on every invocation; that would turn local runtime validation into an expensive package manager.
- **[Legacy OpenSpec ambiguity]** → compatibility remains, but a valid managed home wins. A malformed managed home fails closed rather than silently using PATH.
- **[Nested process drift]** → managed route propagates `FLOWKIT_HOME`; compatibility route propagates exact legacy executable only when managed identity is unavailable.
- **[Archify schema duplication]** → adapter parses only bounded operation success/result fields and generated path existence; Archify schemas remain external authority.
- **[C1/D1 scope bleed]** → tests use synthetic/disposable artifacts outside formal `architecture/**`; public Delivery architecture render/compare binding stays D1.

## Migration Plan

1. Add shared managed-tool resolver + exact two-tool descriptors and tests.
2. Migrate OpenSpec adapter/default resolver to command+argsPrefix managed identity while preserving explicit/legacy routes.
3. Update nested Verification/Full Test technical env propagation and existing OpenSpec real-process regressions.
4. Add Archify thin adapter + exact offline physical tests for doctor/validate/deliver/compare and renderer/receipt behavior.
5. Extend Verification module/check/physical resolver and prove counterfactual failure closure.
6. Keep all proof artifacts synthetic; do not create formal `architecture/**` assets.
7. Only after Review-Apply + Owner archive + Change Checkpoint does managed external-tool behavior become canonical for D1.

## flowkitMutationScope

```json
{
  "schemaVersion": 1,
  "actions": {
    "apply": {
      "selectors": [
        {"kind":"exact","path":"openspec/changes/external-tool-runtime-and-archify-cli-contract/tasks.md"},
        {"kind":"exact","path":"openspec/changes/external-tool-runtime-and-archify-cli-contract/verification.md"},
        {"kind":"exact","path":"scripts/verification.ts"},
        {"kind":"prefix","path":"src/integrations/archify"},
        {"kind":"prefix","path":"src/integrations/external-tools"},
        {"kind":"exact","path":"src/integrations/openspec/openspec-cli-adapter.ts"},
        {"kind":"exact","path":"src/integrations/openspec/openspec-executable.ts"},
        {"kind":"exact","path":"src/verification/change-selection/evidence.ts"},
        {"kind":"exact","path":"src/verification/change-selection/module-map.ts"},
        {"kind":"prefix","path":"tests/fixtures/c1-external-tool-runtime-and-archify-cli-contract"},
        {"kind":"exact","path":"tests/integration/c1-external-tool-runtime-and-archify-cli-contract.test.ts"},
        {"kind":"exact","path":"tests/integration/g1-change-cli-end-to-end.test.ts"},
        {"kind":"exact","path":"tests/integration/openspec-1-7-real-cli.test.ts"},
        {"kind":"exact","path":"tests/integration/verification-commands.test.ts"},
        {"kind":"exact","path":"tests/unit/cli/change-action.test.ts"},
        {"kind":"prefix","path":"tests/unit/external-tools"},
        {"kind":"exact","path":"tests/unit/integrations/openspec-archive-service.test.ts"},
        {"kind":"exact","path":"tests/unit/integrations/openspec-cli-adapter.test.ts"},
        {"kind":"exact","path":"tests/unit/integrations/openspec-paths.test.ts"},
        {"kind":"exact","path":"tests/unit/services/b1-openspec-action-context.test.ts"},
        {"kind":"exact","path":"tests/unit/verification/change-selection/evidence.test.ts"},
        {"kind":"exact","path":"tests/unit/verification/change-selection/module-map.test.ts"},
        {"kind":"exact","path":"tests/unit/verification/verification-plan.test.ts"}
      ]
    },
    "revise-apply": {
      "selectors": [
        {"kind":"exact","path":"openspec/changes/external-tool-runtime-and-archify-cli-contract/tasks.md"},
        {"kind":"exact","path":"openspec/changes/external-tool-runtime-and-archify-cli-contract/verification.md"},
        {"kind":"exact","path":"scripts/verification.ts"},
        {"kind":"prefix","path":"src/integrations/archify"},
        {"kind":"prefix","path":"src/integrations/external-tools"},
        {"kind":"exact","path":"src/integrations/openspec/openspec-cli-adapter.ts"},
        {"kind":"exact","path":"src/integrations/openspec/openspec-executable.ts"},
        {"kind":"exact","path":"src/verification/change-selection/evidence.ts"},
        {"kind":"exact","path":"src/verification/change-selection/module-map.ts"},
        {"kind":"prefix","path":"tests/fixtures/c1-external-tool-runtime-and-archify-cli-contract"},
        {"kind":"exact","path":"tests/integration/c1-external-tool-runtime-and-archify-cli-contract.test.ts"},
        {"kind":"exact","path":"tests/integration/g1-change-cli-end-to-end.test.ts"},
        {"kind":"exact","path":"tests/integration/openspec-1-7-real-cli.test.ts"},
        {"kind":"exact","path":"tests/integration/verification-commands.test.ts"},
        {"kind":"exact","path":"tests/unit/cli/change-action.test.ts"},
        {"kind":"prefix","path":"tests/unit/external-tools"},
        {"kind":"exact","path":"tests/unit/integrations/openspec-archive-service.test.ts"},
        {"kind":"exact","path":"tests/unit/integrations/openspec-cli-adapter.test.ts"},
        {"kind":"exact","path":"tests/unit/integrations/openspec-paths.test.ts"},
        {"kind":"exact","path":"tests/unit/services/b1-openspec-action-context.test.ts"},
        {"kind":"exact","path":"tests/unit/verification/change-selection/evidence.test.ts"},
        {"kind":"exact","path":"tests/unit/verification/change-selection/module-map.test.ts"},
        {"kind":"exact","path":"tests/unit/verification/verification-plan.test.ts"}
      ]
    }
  }
}
```
