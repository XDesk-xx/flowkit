# Explore — external-tool-runtime-and-archify-cli-contract

## 1. Problem

03 `20260817-01-delivery-execution-loop` 已在 canonical Base
`104c14cc245c4a6db3609e7e3dd52e356d0bfc19` 完成 B1 Change Checkpoint。C1 是当前下一个 required Change，目标是建立一个**最薄的 shared External Tool Runtime**，让 OpenSpec 与 Archify 使用 `FLOWKIT_HOME/tools` 下的 exact offline distribution，并冻结 Archify CLI 的真实物理契约。

本次 Owner / Reviewer 建议进一步明确 C1 与 D1/E1 的边界：

```text
C1 负责：
✓ exact offline runtime feasibility
✓ doctor / validate / deliver / compare physical contract
✓ architecture / workflow / lifecycle renderer physical proof
✓ JSON / HTML / receipt behavior proof
✓ 为 D1 证明 synthetic review ZIP 可以物理生成

C1 不负责：
✗ 正式 Current Architecture
✗ 正式 Planned Architecture
✗ 正式 Actual Architecture
✗ 冻结 Flowkit 当前系统架构内容
```

Explore 必须证明工具能力和 integration seam，不得因为已经能生成 Architecture HTML 就提前 author D1/E1 的正式 architecture authority。

## 2. Current Facts

### 2.1 Exact repository facts

- Git Base: `104c14cc245c4a6db3609e7e3dd52e356d0bfc19`。
- Branch: `delivery/20260817-01-delivery-execution-loop`。
- Base commit 是 B1 正式 Change Checkpoint：`chore(flowkit): checkpoint delivery-findings-and-corrective-change`。
- 03 Delivery `state=active`。
- A1/B1 `state=completed`；C1 `state=planned`，依赖 B1，依赖已满足。
- Base 初始 Policy：`owner-decision activate-change`，唯一 eligible Change = `C1`，`doctor=ok / 0 findings`。
- Owner 已明确授权激活 C1 并进入 proof-based Explore。
- C1 activation 必须显式选择 OpenSpec `specDeltaMode`；本 Change 会修改 OpenSpec/external-tool contract，因此使用 `required`。
- C1 已通过正式 write-side 激活：
  - Owner decision ref: `owner:1c987731006b6a95d9cf4894c92c8dc651640936aea42c4cbca15c98efebcaca`
  - `specDeltaMode=required`
- Formal Explore Run: `20260817-029-explore`。
- 激活后：`stage=explore`，`next=explore`，`doctor=ok / 0 findings`。

### 2.2 Current OpenSpec executable model

Exact Base 当前 `resolveOpenSpecExecutable()` 的 authority 顺序是：

```text
explicit injected executable
→ FLOWKIT_OPENSPEC_BIN
→ POSIX ambient `openspec`
→ Windows PATH search: openspec.ps1 first, openspec.cmd fallback
```

主要 consumers：

```text
src/integrations/openspec/openspec-executable.ts
src/integrations/openspec/openspec-cli-adapter.ts
src/services/b1-run-execution-service.ts
src/facts/formal-fact-reader.ts
src/verification/change-selection/evidence.ts
scripts/verification.ts
verify --retry / archive-sync / real CLI regressions
```

现有 `FLOWKIT_OPENSPEC_BIN` 还是“一个 executable string”的 compatibility carrier；C1 若把 canonical route 改为：

```text
process.execPath
+ exact managed JS entrypoint
```

Proposal 必须冻结如何把同一 managed identity送入 nested verification / retry / real-process consumers，而不能只改顶层 Adapter。

### 2.3 Supplied offline distributions

本次 Explore 实际使用：

```text
OpenSpec offline bundle:
/mnt/data/openspec-1.7.0-offline.zip
sha256 = 99cf7b801a21c956dc2b1f0da8c607b896e205a4d6eb5017692bdcdd4570ab56

OpenSpec package tarball:
/mnt/data/fission-ai-openspec-1.7.0.tgz
sha256 = 3e0bd044bf1fae1732f201fab7b5c1c8ceb4ef89bed9923f89a33cb4f0750afd

Archify supplied offline source bundle:
/mnt/data/archify-2.14.0-offline.zip
sha256 = a04ea1e4bd7d34002d16111619bf365db619bfae91b07a336d2c7493f7453ab0
zip comment/source commit = cffdd42eed0ebf013aa070378d94facdd3d56b10

Embedded installable archify.zip:
sha256 = 320401c3ac302a14f1b0077cc989d8f36aae9902eba2e42b93845a50480dc0ae
package name = archify
package version = 2.14.0
Node engine = >=18
entrypoint = archify/bin/archify.mjs
```

03 v6 reference 曾记录 candidate release-asset SHA：

```text
1b610a4d8ff5821cccd7a3dfe2d0943d11e64bda1d2fb0511944df190472f175
```

但 reference 自己明确要求 C1 以 real release/package proof 为准，不能把历史 SHA 当作证明。

### 2.4 External release identity observation

Public GitHub release metadata identifies stable `v2.14.0` at release commit `a3bf80c` (2026-08-11)。

Supplied source bundle identifies commit `cffdd42...`; that later commit is `fix(cli): reject quality flags without values (#73)` and changes `archify/bin/archify.mjs`, tests, **and `archify.zip` itself**。

Therefore the supplied installable package is demonstrably a post-release `2.14.0`-labelled package snapshot, not yet proven byte-identical to the exact `v2.14.0` release asset.

## 3. Scope Boundary

### In scope

- `FLOWKIT_HOME` resolution and `FLOWKIT_HOME/tools` physical layout；
- static supported tool identities（OpenSpec / Archify only）；
- exact tool-home + package metadata + entrypoint validation；
- current Node runtime direct entrypoint invocation；
- missing/wrong package fail-closed；
- OpenSpec 1.7.0 managed offline route；
- current OpenSpec executable consumer scan；
- `FLOWKIT_OPENSPEC_BIN` bounded compatibility / migration bridge；
- Windows `.ps1/.cmd` historical compatibility preservation decision；
- nested Verification / retry / archive / real-process identity propagation；
- Archify installed package `doctor`；
- Archify `validate architecture`；
- Archify `deliver architecture`；
- Archify `compare architecture` + structured receipt；
- workflow / lifecycle physical renderer proof；
- JSON durable-input vs HTML derived-output behavior；
- compare receipt behavior；
- failed delivery atomic preservation behavior；
- synthetic review ZIP transport feasibility for D1；
- mutation-surface / physical Verification closure planning。

### Out of scope

- 正式 `architecture/<delivery-id>/json/current.architecture.json`；
- 正式 Planned / Actual Architecture；
- 03 的真实 System Architecture 内容；
- architecture acceptance / promotion；
- D1 bootstrap baseline reconstruction；
- E1 Planned-vs-Actual lifecycle acceptance；
- Tool Registry / Plugin Registry / installer marketplace；
- online download during lifecycle；
- vendoring Archify/OpenSpec source into Flowkit repository；
- Archify internal module import；
- generic receipt/evidence database；
- formal Architecture Action / Run；
- using synthetic C1 proof outputs as architecture authority。

## 4. Mandatory Risk Scan

| Risk | yes/no | Why |
|---|---|---|
| Scope expansion / missing prerequisite | yes | D1/E1 architecture authoring is adjacent but must remain outside C1; exact official Archify release bytes may be a missing external prerequisite. |
| Cross-time facts | yes | managed tool identity is resolved in parent process and must remain the same identity through nested Verification/retry/archive/full-test consumers. |
| Schema / persistence migration | no | C1 primarily changes local tool resolution/invocation; no new durable lifecycle DB/schema is required. |
| Self-hosting / writer changes itself | yes | C1 changes OpenSpec resolution used to prepare/validate/archive the same and later Changes. |
| Authority duplication | yes | OpenSpec owns Change contract; Archify owns renderer/compare facts; Flowkit may pin/invoke but must not copy either engine. |
| Generic reusable subsystem | yes | shared runtime must serve two static tool identities and future Deliveries without becoming a Registry. |
| Activation must persist across Change/Delivery boundaries | yes | after C1 checkpoint, D1–H1 and future Delivery fresh processes must use the managed route, not silently fall back to ambient PATH. |
| Candidate/formal-fact mutation affects existing consumers | yes | OpenSpec adapter, verification evidence, retry, archive-sync, Full Test env, external command launchers and tests are direct consumers. |
| Verification selection must reach actual executed targets | yes | new Archify/OpenSpec real-process regressions must be physically selected by Change Verification. |
| External tool performs real mutation | yes | Archify deliver/compare write HTML/receipt; OpenSpec archive mutates Change/canonical specs. Disposable physical proof is required. |
| Change claims performance improvement | no | C1 does not claim a performance improvement. |

## 5. Applicable Proofs

### Proof 1 — Scope / D1-E1 Boundary

**Question**

Can C1 prove Archify runtime/render/receipt/review transport capability without authoring formal Current/Planned/Actual Architecture?

**Acceptance Boundary**

C1 proof outputs must be disposable synthetic artifacts. D1 must remain the first Change that authors formal Current/System + Planned assets; E1 remains Actual/Compare/Promotion.

**Method**

Use only Archify packaged examples copied to `/mnt/data/c1-explore-work/**`; do not create repository `architecture/**` assets. Generate synthetic JSON/HTML/receipt outputs and a synthetic review ZIP outside repository candidate.

**Evidence**

Repository candidate after proof contains only:

```text
C1 activation Manifest mutation
029 Explore Run
openspec/changes/external-tool-runtime-and-archify-cli-contract/.openspec.yaml
explore.md
```

No `architecture/**` formal asset was created.

**Evidence Boundary**

Covers C1→D1 responsibility split and proves tool review artifacts can be produced without becoming formal architecture facts.

**Gap**

None for scope feasibility.

**Result: PASS.**

**Implication**

Proposal must explicitly keep formal Current/Planned/Actual authoring out of C1.

---

### Proof 2 — Managed OpenSpec Offline Runtime + Existing Consumer Compatibility

**Question**

Can OpenSpec 1.7.0 run from `FLOWKIT_HOME/tools` through current Node without ambient OpenSpec PATH, while preserving current real-process/retry/archive semantics during migration?

**Acceptance Boundary**

A managed offline OpenSpec must execute real CLI operations with exact package version/entrypoint, and the current compatibility bridge must be able to carry that identity through existing Flowkit consumers until C1 replaces canonical ambient resolution.

**Method**

Materialize:

```text
FLOWKIT_HOME/tools/openspec/1.7.0/
└─ node_modules/@fission-ai/openspec/bin/openspec.js
```

Invoke with absolute `process.execPath` and no ambient OpenSpec command. Then use a disposable compatibility launcher referenced by `FLOWKIT_OPENSPEC_BIN` and execute current Flowkit + real OpenSpec regressions.

**Evidence**

Direct managed invocation with poisoned PATH:

```text
OpenSpec --version → 1.7.0
OpenSpec doctor --json → healthy=true
```

Current Flowkit through managed compatibility bridge:

```text
flowkit status → C1 active / 029 pending / conflicts 0
flowkit doctor → ok / 0 findings
```

Existing targeted OpenSpec/launcher/Verification regressions:

```text
50 / 50 PASS
```

Managed wrapper + real OpenSpec CLI conformance:

```text
6 / 6 PASS
```

including real archive-sync/recovery paths.

Managed wrapper + actual public `verify --retry` CLI route:

```text
4 / 4 PASS
```

**Evidence Boundary**

Covers offline package execution, real OpenSpec operation, current Flowkit compatibility bridge, real archive and retry consumers.

**Gap**

Current production `FLOWKIT_OPENSPEC_BIN` is still a single executable-string carrier. Proposal must freeze the canonical managed representation for `process.execPath + JS entrypoint` and its nested-process propagation without breaking historical `.ps1/.cmd` tests.

**Result: PASS (migration feasibility).**

**Implication**

C1 should preserve explicit/injected and bounded legacy compatibility, but canonical resolution after C1 must prefer managed `FLOWKIT_HOME` identity over ambient PATH.

---

### Proof 3 — Minimal Static External Tool Resolver + Fail-closed Identity

**Question**

Can one minimal non-Registry resolver support exactly OpenSpec and Archify, validate package identity/version/entrypoint, and fail closed when bytes are missing/mismatched?

**Acceptance Boundary**

The design must not need dynamic discovery or a Tool Registry. Missing/wrong package must fail before invocation.

**Method**

A disposable prototype resolved only two closed identities:

```text
openspec@1.7.0
archify@2.14.0
```

into:

```text
command = process.execPath
entrypoint = exact managed JS/MJS path
```

and then mutated disposable copies to remove entrypoints or change package versions.

**Evidence**

Valid identities resolved:

```text
OpenSpec packageName = @fission-ai/openspec
version = 1.7.0
entrypoint = .../bin/openspec.js

Archify packageName = archify
version = 2.14.0
bin.archify = ./bin/archify.mjs
entrypoint = .../bin/archify.mjs
```

Counterfactuals:

```text
OpenSpec missing entrypoint → fail closed
OpenSpec package version 1.6.0 → fail closed
Archify missing entrypoint → fail closed
Archify package version 2.13.0 → fail closed
```

`allFailClosed=true`.

**Evidence Boundary**

Covers static two-tool resolution, metadata validation and missing/mismatch behavior.

**Gap**

Proposal must choose exact production error codes and identity fields; no generic Registry is required.

**Result: PASS.**

---

### Proof 4 — Archify Physical CLI Contract

**Question**

Does the supplied installed Archify package physically support the commands/types C1 intends to integrate, rather than commands guessed from docs?

**Acceptance Boundary**

Must physically execute `doctor`, `validate architecture`, `deliver architecture`, `compare architecture`, plus renderer-backed workflow/lifecycle operations with machine-readable results.

**Method**

Use the installable package extracted from supplied `archify.zip` and invoke with absolute Node while PATH is poisoned for Archify discovery.

**Evidence**

`archify doctor` reports all required runtime surfaces `[ok]` and ends:

```text
Archify is ready.
```

`validate architecture --json`:

```text
ok=true
checks=9/9
composition=pass
```

`deliver architecture --json`:

```text
ok=true
specification sha256=483350f5297d...
artifact sha256=b1753910784a...
checks=9/9
```

`compare architecture ... --receipt ... --json`:

```text
ok=true
comparatorVersion=1
canonicalVersion=1
completeness=complete
proofLevel=authored
validation=28/28
```

Workflow:

```text
validate → PASS
deliver → PASS 9/9
artifact sha256=a7a3b2836f7f...
```

Lifecycle:

```text
validate → PASS
deliver → PASS 9/9
artifact sha256=9ef047c4a029...
```

Actual CLI help confirms supported types:

```text
architecture
workflow
sequence
dataflow
lifecycle
```

and supported commands include:

```text
render
compare architecture
deliver
preview
validate
inspect
check
visual-check
guide
examples
doctor
demo
```

**Evidence Boundary**

Covers physical command names, machine JSON result shape and three renderer types requested for C1 proof.

**Gap**

Exact official release asset identity remains separate Proof 7 below.

**Result: PASS for functional package behavior.**

---

### Proof 5 — JSON / HTML / Receipt / Atomic Mutation Behavior

**Question**

Can D1 safely treat JSON as durable authoring input and HTML/receipt as generated review output without making HTML a second authority?

**Acceptance Boundary**

- same JSON + exact renderer must reproducibly generate the same HTML bytes；
- generated HTML can be deleted/regenerated；
- compare receipt must be machine-readable and bind the generated artifact；
- invalid generation must not destroy the last good artifact；
- C1 must not persist a second lifecycle truth around HTML freshness。

**Method**

Deliver the same synthetic Architecture JSON twice with deletion between renders, compare artifact hashes; execute compare with sidecar receipt; intentionally deliver invalid JSON over the same output path.

**Evidence**

Architecture HTML first render:

```text
sha256=b1753910784abc7e37952868051861c2c90d953aeb80342ebb59febdeec87612
```

After deleting HTML and rerunning exact deliver:

```text
sha256=b1753910784abc7e37952868051861c2c90d953aeb80342ebb59febdeec87612
```

Hashes are identical.

Compare:

```text
stdout JSON receipt
== semantic content of delta.receipt.json sidecar
```

Invalid Architecture input (`components` removed):

```text
exit=1
ok=false
stage=render
diagnostic code=schema/required
```

Existing target HTML before/after failure:

```text
before=b1753910784a...
after =b1753910784a...
preserved=yes
```

**Evidence Boundary**

Covers reproducible derived HTML, structured receipt, compare sidecar and last-good atomic preservation.

**Gap**

D1 still owns repository path conventions and formal Architecture refs; C1 only freezes tool behavior.

**Result: PASS.**

---

### Proof 6 — Synthetic D1 Review ZIP Physical Feasibility

**Question**

Can a later D1 review handoff physically package Archify JSON + HTML + receipts into a normal review ZIP without introducing Archify ZIP lifecycle authority?

**Acceptance Boundary**

A synthetic package must be physically created and integrity-tested; it must contain only review artifacts and explicitly not become Current/Planned/Actual authority.

**Method**

Create a disposable transport ZIP from synthetic Archify outputs:

```text
README.txt
synthetic.architecture.json
synthetic.architecture.html
synthetic.architecture.receipt.json
synthetic.workflow.json
synthetic.workflow.html
synthetic.workflow.receipt.json
synthetic.lifecycle.json
synthetic.lifecycle.html
synthetic.lifecycle.receipt.json
synthetic.delta.html
synthetic.delta.receipt.json
```

**Evidence**

Physical ZIP:

```text
c1-synthetic-archify-review.zip
sha256=6fd8f0573b90b2106439ee772b1672f70a1d3f764abe529cc7771a7a1a496aa6
```

`unzip -t`:

```text
all 12 entries OK
No errors detected in compressed data
```

README explicitly states:

```text
C1 disposable review-transport proof only.
Not Current/Planned/Actual Architecture authority.
ZIP is operator transport; Archify does not own ZIP lifecycle semantics.
```

**Evidence Boundary**

Proves the exact physical artifact class D1 may later hand to Reviewer can be produced.

**Gap**

D1 must decide the real formal JSON inputs and review package naming/content; C1 does not author them.

**Result: PASS.**

---

### Proof 7 — Exact Official Archify v2.14.0 Release Identity

**Question**

Does the supplied offline Archify distribution prove the exact official `v2.14.0` release asset identity required by current C1 contract?

**Acceptance Boundary**

C1 must pin an exact official release distribution, not merely any later package that still reports version `2.14.0`.

**Method**

Compare supplied transport metadata/hash/package identity with current v6 expected candidate and public GitHub release/commit facts.

**Evidence**

Current v6 reference candidate:

```text
release = v2.14.0
asset = archify.zip
candidate sha256 = 1b610a4d8ff5821cccd7a3dfe2d0943d11e64bda1d2fb0511944df190472f175
```

Supplied offline source bundle:

```text
outer sha256 = a04ea1e4bd7d34002d16111619bf365db619bfae91b07a336d2c7493f7453ab0
source commit = cffdd42eed0ebf013aa070378d94facdd3d56b10
embedded archify.zip sha256 = 320401c3ac302a14f1b0077cc989d8f36aae9902eba2e42b93845a50480dc0ae
```

Public release metadata:

```text
v2.14.0 release commit = a3bf80c
```

Public commit `cffdd42...` is a later CLI fix and explicitly changes:

```text
archify/bin/archify.mjs
archify/test/cli.test.mjs
archify.zip
```

Therefore:

```text
supplied package version label = 2.14.0
functional runtime = verified
exact official v2.14.0 release-asset identity = NOT proven
```

**Evidence Boundary**

Proves the supplied package is a real functioning post-release package snapshot; does not reach the required exact official release asset boundary.

**Gap**

Need one of:

```text
A. exact official v2.14.0 archify.zip bytes with independently verified release checksum
```

or an explicit Owner Contract Reset that intentionally changes C1 from “official v2.14.0 release” to a specifically pinned post-release snapshot identity. The latter is a contract change and must not be inferred by Author.

**Result: UNKNOWN / external prerequisite.**

**Implication**

Do not freeze the supplied `320401...` package as the official release in Proposal under the current contract.

---

### Proof 8 — Mutation Surface + Verification Closure Feasibility

**Question**

Can C1 be implemented and formally verified using bounded existing repository areas without adding a generic platform?

**Acceptance Boundary**

Expected implementation/test mutations must fit a bounded scope and formal Change Verification must physically execute managed OpenSpec/Archify regressions.

**Method**

Scan current ownership/consumer graph and Verification module map.

**Evidence**

Expected implementation surface is bounded around:

```text
src/integrations/openspec/**
src/integrations/<shared-external-tool-runtime>/**
src/integrations/archify/**
src/shared/external-command.ts (only if common launch semantics require it)
scripts/verification.ts
src/verification/change-selection/**
related tests/integration/**
related tests/unit/**
OpenSpec C1 artifacts
```

Current module map already owns:

```text
openspec-runtime:
  src/integrations/openspec
  src/shared/external-command.ts
  tests/integration/openspec-1-7-real-cli.test.ts
  tests/unit/integrations
  tests-openspec-runtime

a verification-selection module:
  scripts/verification.ts
  src/verification/change-selection
  tests-verification
```

C1 will need a bounded Archify/shared-runtime ownership relation and C1 capability relation so new physical Archify tests are not merely run manually.

Formal selection acceptance must prove:

```text
actualChangeSet
→ external-tool/Archify ownership
→ C1 OpenSpec delta capability
→ selected logical check
→ actual managed-tool physical test files/commands
→ formal verification result
```

A counterfactual sentinel should break the managed Archify/OpenSpec physical route and make the selected formal check fail.

**Evidence Boundary**

Covers required mutation area and feasibility of extending existing deterministic Verification selection without a Registry.

**Gap**

Exact selectors/check mapping must be frozen in Proposal after the external release identity prerequisite is closed.

**Result: PASS for mutation/verification feasibility.**

## 6. Rejected Approaches

### 6.1 C1 authors formal Current/Planned Architecture

Rejected：这会把 tool-runtime proof 与 D1 architecture authority 混在一起，并污染“Current 必须来自 exact pre-03 baseline”的 D1 requirement。

### 6.2 Treat supplied post-release `2.14.0` package as official v2.14.0 solely because package.json says 2.14.0

Rejected：exact release identity requirement would become false; public commit evidence shows `archify.zip` changed after the official release commit.

### 6.3 Ambient PATH remains canonical

Rejected：cannot satisfy detached/offline reproducibility and keeps `.ps1/.cmd` ambiguity as canonical authority.

### 6.4 Delete legacy `FLOWKIT_OPENSPEC_BIN` / Windows shim tests immediately

Rejected：02 real-process/retry/archive consumers already rely on the propagation contract; migration must be bounded and regression-proven.

### 6.5 Generic Tool Registry

Rejected：C1 needs exactly two supported identities; a static typed mapping is sufficient.

### 6.6 Persist HTML freshness / receipt registry

Rejected：JSON remains architecture source; generated HTML/receipt are tool outputs/review evidence. No second architecture state machine is required.

### 6.7 Archify-owned review ZIP lifecycle

Rejected：Archify has no required ZIP lifecycle command here. ZIP is transport assembled after generating JSON/HTML/receipt and must not become an architecture authority.

## 7. Feasible Proposal Boundary

The following is proven feasible and may be frozen once the external release-asset identity gap is closed:

```text
FLOWKIT_HOME
└─ tools
   ├─ openspec/1.7.0/
   │  └─ exact offline distribution
   └─ archify/2.14.0/
      └─ exact pinned installable distribution

static two-tool support
→ validate package name/version/entrypoint
→ invoke through process.execPath + exact entrypoint
→ fail closed missing/mismatch

OpenSpec:
managed canonical route
+ bounded explicit/injected compatibility
+ bounded FLOWKIT_OPENSPEC_BIN / Windows shim compatibility
+ same identity reaches archive/retry/verification/full-test children

Archify:
doctor
validate
deliver
compare architecture
structured JSON/receipt semantics
architecture/workflow/lifecycle physical renderer regressions

D1 handoff feasibility:
JSON + generated HTML + receipts
→ ordinary review ZIP transport
→ no formal architecture content authored in C1
```

## 8. Open Decisions / Blocking Gap

### External prerequisite — exact official Archify release asset

Current contract says official `v2.14.0` exact offline distribution.

Current supplied package is functionally valid but is pinned to later commit `cffdd42...`, which changed `archify.zip` after official release commit `a3bf80c`.

Therefore Explore cannot truthfully write:

```text
Exact official Archify v2.14.0 release identity = PASS
```

Required external resolution before Proposal freezes tool identity:

```text
preferred:
provide exact official v2.14.0 release archify.zip
→ independently hash
→ rerun doctor/validate/deliver/compare on those exact bytes
```

Alternative only with explicit Owner Contract Reset:

```text
pin a specifically named post-release commit/package identity
```

Author does not infer that reset from the existence of the supplied package.

## 9. Explore Conclusion

```text
Scope boundary                     PASS
OpenSpec managed runtime           PASS
OpenSpec migration feasibility     PASS
static two-tool resolver           PASS
missing/mismatch fail-closed       PASS
Archify functional CLI contract    PASS
architecture renderer              PASS
workflow renderer                  PASS
lifecycle renderer                 PASS
JSON/HTML reproducibility          PASS
receipt + atomic failure behavior  PASS
synthetic review ZIP feasibility   PASS
mutation/Verification feasibility  PASS
exact official Archify asset       UNKNOWN (external prerequisite)
```

Overall:

> C1 is correctly activated and the intended thin runtime/Archify integration is technically feasible. Reviewer-proposed responsibility boundary is supported by physical evidence. However, under the current “official v2.14.0 exact release distribution” contract, Proposal MUST NOT freeze tool identity until the exact official Archify release asset is supplied/verified (or Owner explicitly resets that contract to a different pinned snapshot).

The Explore Action itself is complete; the unresolved item is an external input/authority gap, not an invitation for Author to silently rewrite the contract.
