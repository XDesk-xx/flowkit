## Context

See `proposal.md` and approved Explore `20260816-214-revise-explore`. I1 is the final known corrective Change for 02 Delivery closure after an Owner-authorized Delivery Full Test exposed a Windows canonical failure. The failure is not evidence that OpenSpec must become a project devDependency: the repository already supports an externally installed OpenSpec 1.7 CLI. The defect is that different consumers infer executable identity differently.

Explore also proved three adjacent closure gaps that would otherwise cause another late failure: public `test:full` can silently skip the real OpenSpec suite when executable context is absent; adding I1 itself grows the current Delivery corpus and breaks a live-Manfiest count fixture; and real OpenSpec archive reproducibly introduces redundant EOF blank lines that are semantic no-ops but block `git diff --check` before checkpoint.

`20260816-224-archive` 又暴露出一个不同于上述实现缺口、但属于既有 OpenSpec contract 的 late failure：I1 `flowkit-change-verification-selection` 的 `MODIFIED Requirement` 将仍适用的 canonical Scenario header `OpenSpec executable identity is propagated from the current adapter` 重命名为新的 header。OpenSpec strict validation允许该 delta，但 real archive full-replacement merge 检测到 canonical scenario 将被静默删除，因此以 `archive_spec_update_failed` fail closed 且未修改任何文件。Owner Contract Reset 明确要求保留既有实现结果，只重新冻结 scenario completeness 与 reusable archive-sync preflight；旧 216→224 generation 不再授权新 generation。

`20260816-227-apply` 又暴露了一个 lifecycle dead-end：Apply terminal 已 `completed`，其 formal `verification.md` 与 terminal binding 正确记录 `failed`，但当前 `flowkit verify` 被 G1 contract 冻结为 read-only projection，而 completed Apply 也不能用 failed/cancelled Run retry 机制重开。相同 exact candidate 后续诊断可全绿并不能成为 authority，因为覆盖 `verification.md` 会破坏 227 immutable terminal binding。Owner 因此要求在 I1 内增加最小 exact-candidate re-verification behavior，同时保持 227 failed publication/result point-in-time immutable。

The approved proofs establish these boundaries:

1. PATH/global OpenSpec available + repo-local `.bin` absent must remain supported; G1 currently fails only because it bypasses official adapter resolution.
2. Windows `.ps1` priority and `.cmd` fallback must resolve to the executable actually invoked; a nominal `openspec.ps1` string cannot be reused as resolved identity when only `.cmd` exists.
3. Delivery Full Test must physically execute the real OpenSpec conformance target; missing execution context cannot turn a required suite into a zero-test success.
4. Historical/current compatibility tests must bind exactness to stable point-in-time fixtures, not to the mutable count of Changes in the active Delivery Manifest.
5. Real OpenSpec 1.7 archive reproduces the same two EOF-only whitespace findings; bounded normalization returns byte-for-byte to the current checkpointed canonical specs and keeps strict validation green.
6. `scripts/verification.ts` currently zero-matches the Verification Module Map. The corrected design must pair module ownership with `tests-verification` physical execution of `verification-plan.test.ts`; formal sentinel fail/restore already proved this closure.
7. No evidence supports runner scheduling/concurrency changes; standalone corrected G1 and real OpenSpec costs are effectively unchanged.
8. Future corrective Change and next-Delivery-shaped consumers do not depend on I1/02 identity.

## Goals / Non-Goals

**Goals:**

- make actual OpenSpec invocation identity a single resolved fact shared by production and verification consumers;
- make public Delivery verification fail closed if required real OpenSpec conformance cannot execute;
- remove local-install and POSIX-only assumptions from affected real OpenSpec tests;
- preserve exact fixture semantics while decoupling tests from mutable Delivery lifecycle growth;
- make bounded archive-generated EOF whitespace cleanup part of already-authorized checkpoint mechanics;
- ensure I1's own verification-tooling mutations are exactly owned and physically executed by formal Change Verification;
- preserve current runner topology and performance characteristics;
- make canonical Scenario identity completeness explicit for every I1 `MODIFIED Requirement`;
- make exact-current-candidate real OpenSpec archive-sync a reusable pre-archive guard at Proposal terminal admission and Change Verification.
- allow an explicit Verification-authority retry for a completed Apply whose current Verification failed, only when the exact post-action candidate and logical selection remain unchanged;
- preserve every superseded failed `verification.md` publication as immutable point-in-time history while keeping `verification.md` as the single current authority consumed by Policy/Reviewer.

**Non-Goals:**

- no OpenSpec npm/devDependency addition or vendoring;
- no generic executable registry or new launcher framework;
- no Policy change, no new Formal Action, no new Run kind, and no Run/context/result schema generation; Formal Reader changes are limited to validating the bounded re-verification history chain;
- no generic formatter, Prettier sweep or semantic normalization at checkpoint;
- no `AGENTS.md` mutation;
- no concurrency, timeout, scheduler, process-heavy rebatching or cache work;
- no Delivery Full Test executor implementation from 03 scope.

## Decisions

### 1. One minimal resolver owns OpenSpec executable resolution

Add `src/integrations/openspec/openspec-executable.ts` as a small resolver for the invocation identity already implicit in `OpenSpecCliAdapter`.

The resolver contract is:

```text
explicit executable supplied
→ use that exact executable

otherwise non-Windows
→ openspec

otherwise Windows
→ search PATH deterministically for openspec.ps1 across all entries
→ if absent, search PATH deterministically for openspec.cmd
→ if absent, fail OPENSPEC_SPAWN_FAILED
```

The resolver only resolves identity. It MUST NOT become a generic executable registry and MUST NOT duplicate process-launch semantics. Actual `.ps1/.cmd` invocation continues through `src/shared/external-command.ts`.

`OpenSpecCliAdapter` keeps compatibility with an explicit executable option, but all callers needing the actual invocation identity consume the resolved value rather than treating the constructor's nominal default string as authoritative. Adapter invocation itself uses the same resolver.

Alternative rejected: add `@fission-ai/openspec` to project dependencies. That merely makes the wrong repo-local assumption happen to work and changes dependency ownership without product need.

### 2. Change Verification propagates resolved, not nominal, OpenSpec identity

When `tests-openspec-runtime` is selected, `executeVerificationSelection()` obtains the same resolved executable identity from the supplied current OpenSpec adapter and places it in `FLOWKIT_OPENSPEC_BIN` for the unioned Node test process.

Logical selection identity remains unchanged: executable path/shim representation is execution context, not Catalog identity. No executable path is persisted as a new verification authority.

`tests-verification` physical resolver also includes `tests/unit/verification/verification-plan.test.ts`, and Verification Module Map exact-owns both:

```text
scripts/verification.ts
tests/unit/verification/verification-plan.test.ts
→ verification-selection
```

This pairing is mandatory because 214 proved ownership without physical execution is insufficient.

### 3. Public `test:full` resolves OpenSpec once and makes real conformance required

Before public `test:full` launches its Node test children, `scripts/verification.ts` resolves the OpenSpec executable through the same resolver and propagates `FLOWKIT_OPENSPEC_BIN` in the child environment.

`openspec-1-7-real-cli.test.ts` no longer treats missing `FLOWKIT_OPENSPEC_BIN` as permission to silently skip the entire suite. If the required executable context cannot be resolved, public Full Test fails non-zero rather than reporting a zero-test success.

The `openspec-all` verification step also uses the same OpenSpec resolver and existing shared external-command launcher. The project verification command remains only a Verification tool: it does not create Owner authorization or mutate `fullTestStatus`.

Alternative rejected: leave the suite optional and rely on another OpenSpec validation command. Strict spec validation and real CLI archive/conformance exercise different physical behavior and cannot substitute for each other.

### 4. Real OpenSpec tests observe invocation through a runner seam, not shell wrappers

`openspec-1-7-real-cli.test.ts` must execute the real resolved OpenSpec binary on every platform. Invocation-count assertions use an injected runner/recording seam around the existing real command execution, then delegate to the actual launcher.

Do not create `openspec-count.sh` or another POSIX wrapper; Windows must exercise the same real `.ps1/.cmd` launcher contract.

G1 archive/recovery regression likewise constructs the real adapter with official resolution instead of `join(projectBin, 'openspec(.cmd)')`.

### 5. A1 exactness moves to stable synthetic point-in-time data

`tests/unit/services/a1-write-service.test.ts` stops using the live current 02 Manifest as the authority for a hard-coded total Change count.

The regression builds a stable synthetic corpus representing the historical compatibility boundary and keeps exact assertions for:

- point-in-time Change count;
- legacy entries missing `architectureImpact`;
- explicit `architectureImpact=false` entries;
- preservation of those historical semantics after appending one future corrective Change.

The test MUST NOT replace exact assertions with `>=` and MUST NOT merely update 11→12.

### 6. Checkpoint authorization includes bounded hygiene mechanics, not new business authority

`prepareCheckpointBoundaryHandoff()` continues to require exactly one matching Owner `authorize-checkpoint` fact and remains read-only with respect to Git commit/push.

The handoff additionally declares a bounded normalization contract that the Executor may perform under that same authorization before the required diff checks:

```text
scope:
  text files touched by the candidate/archive result only

allowed transformations:
  collapse redundant blank lines at EOF
  ensure exactly one final newline

forbidden:
  trailing spaces/tabs cleanup as a generalized checkpoint transform
  Markdown reflow
  internal whitespace rewriting
  semantic text changes
  unrelated files
  broad formatter execution
```

After normalization the Executor MUST rerun `git diff --check`; after staging it MUST still run `git diff --cached --check`. Any finding outside the bounded class fails closed and requires a new authority decision. No second Owner prompt is required solely for these deterministic hygiene operations.

Alternative rejected: broaden checkpoint cleanup to trailing spaces/tabs or add an automatic repository formatter. Approved Proof 5 covers only the EOF class reproduced by real OpenSpec archive.

### 7. Performance acceptance is no-material-regression; runner topology stays unchanged

I1 does not optimize the test scheduler. Apply records the corrected standalone G1 and real OpenSpec results/process counts and requires no material regression against approved Explore evidence:

```text
G1 proof reference:        7/7, 69 real CLI, ~29.52s before / ~29.94s corrected
real OpenSpec reference:   5/5, ~9.44s before / ~9.47s corrected
```

Wall time remains observational and environment-sensitive. No absolute timing gate, timeout expansion, concurrency change or process-heavy rebatching enters I1.


### 8. Exact current candidate uses one reusable real OpenSpec archive-sync preflight

Add a narrow `OpenSpecCliAdapter` archive-sync preflight surface. It does not parse or emulate OpenSpec merge semantics. Its only job is:

```text
current exact repoRoot/openspec bytes
↓ copy to disposable repoRoot
reuse current resolved OpenSpec executable identity
↓
real OpenSpec 1.7 archive <changeId> --json --yes
↓
consume existing typed archive success/failure observation
↓
cleanup disposable repo
```

The helper MUST fail closed on structured failure, spawn failure, timeout or outcome-unknown. It MUST never relocate or rewrite canonical current Change/spec bytes.

`B1` terminal admission for `propose` / `revise-propose` keeps the existing strict validation and then runs this preflight before writing the terminal result. Therefore a delta can no longer become a completed Proposal generation merely because `validate --strict` passes while archive merge would fail.

The same helper is reused by Change Verification through stable logical check:

```text
openspec-current-change-archive-sync
```

For a matched current Change, selection includes both:

```text
openspec-current-change-strict
openspec-current-change-archive-sync
```

The new logical id is execution authority only; it does not add a new persisted schema generation. Evidence continues to use the existing verification evidence shape and records the preflight as a closed check. This second execution is intentional final insurance before review-apply / Owner archive authorization.

Explore remains guidance rather than a new lifecycle gate: when external archive mutation risk is identified, Author MAY call the same preflight helper in a disposable proof. Even if Explore misses the risk, Proposal terminal admission is the automatic fail-closed product guard.

For I1 specifically, the current `MODIFIED Requirement` MUST restore the canonical Scenario header:

```text
OpenSpec executable identity is propagated from the current adapter
```

while keeping the already-approved resolved-authority body semantics. The new physical-coverage scenario remains additional rather than a rename/replacement.

Alternative rejected: implement a Flowkit-side Requirement/Scenario comparator or merge engine. OpenSpec remains the archive semantics authority; Flowkit only runs the real operation in a disposable repository and consumes its structured outcome.



### 9. Failed Change Verification uses explicit exact-candidate re-verification, not a no-op revise

The current dead-end is:

```text
completed Apply
+ terminalBinding.currentVerification.status = failed
+ current verification.md exact-binds that failed publication
+ candidate bytes unchanged
↓
Policy = verification-failed
flowkit verify = read-only
failed/cancelled Run retry = not applicable because Apply Run is completed
```

I1 adds one explicit Verification behavior:

```text
flowkit verify --retry
```

Bare `flowkit verify` remains read-only and unchanged. `--retry` is **not** a Formal Action, does not allocate a Run/NNN, does not mutate the Apply terminal result and does not decide Policy. It is admitted only when all of the following are true:

```text
exactly one active Change
exactly one current completed Apply/revise-apply producer
current formal Verification status = failed
current verification publication is valid
current candidate identity == original Apply post-action candidate identity
current deterministic selection fingerprint == original selection fingerprint
no pending Run / ambiguous producer / formal-fact conflict
```

Candidate equality is checked against the producing Apply's persisted compact entry + mutation declaration and the publication's `postActionWorkspaceFingerprint`. Re-verification-owned paths are excluded from this comparison:

```text
<validated verification authority path>
<validated verification authority dir>/verification-history/**
```

This exclusion is only for Core-owned Verification authority bytes. Any production/spec/test/contract drift changes the candidate fingerprint and fails closed. The retry MUST NOT widen scope, change selection, change timeout/concurrency/scheduler, or invent a new verification plan.

Before replacing the current authority, Core preserves the exact current `verification.md` bytes under a deterministic immutable history path derived from the **validated projected authority directory**, not a CLI-local Change-root guess:

```text
verification-history/<sha256-of-publication>.md
```

Publication uses create-if-absent semantics. If the same fingerprint already exists, bytes MUST be identical; mismatch fails closed. No raw stdout/log corpus, generic Evidence registry or Run sidecar is added.

The new current `verification.md` is rendered from the same exact candidate and same logical selection and carries bounded lineage metadata:

```text
reverificationOfRunId
previousVerificationFingerprint
previousVerificationRef
originApplyVerificationFingerprint
postActionWorkspaceFingerprint
selectionFingerprint
```

A second or later retry repeats the same operation: the immediately previous current publication is snapshotted by fingerprint and the new publication links to it. Formal Reader validates a finite, acyclic chain back to the original Apply terminal binding. Every chain node MUST:

```text
hash-match its deterministic history ref
bind the same origin Apply run
bind the same postActionWorkspaceFingerprint
bind the same selectionFingerprint
link to exactly one predecessor
```

The chain terminates only when the predecessor fingerprint equals the original `terminalBinding.currentVerification.versionFingerprint`; that original snapshot MUST preserve the original status/selection and exact bytes. Missing history, cycle, identity drift, candidate drift, selection drift or ambiguous current producer is a FactConflict/fail-closed condition.

This changes the meaning of "current applicable selection lineage" narrowly:

```text
normal path:
Apply terminal binding == current verification.md

re-verification path:
Apply terminal binding == immutable origin history publication
validated re-verification chain
→ current verification.md is the superseding formal Verification authority
```

`review-apply` continues to freeze the exact current `verification.md` through its existing `verificationInputRef`; therefore Reviewer sees the new authority plus lineage to prior failed evidence. A passed retry naturally changes FormalFact `changeVerificationStatus` to `passed`, after which existing Policy may resolve `review-apply`. No Policy special case is required.

Crash ordering is fail-safe:

```text
validate origin/current/candidate
→ execute Verification fully in memory
→ immutable-copy current publication to history (idempotent)
→ atomic publish new current verification.md
```

If execution aborts before publication, old authority remains current. If the history copy exists but current publication was not replaced, that extra immutable duplicate does not alter lifecycle status and a repeated retry is idempotent.

Alternative rejected: update 227 `result.json`, overwrite failed evidence without history, create a verification Run/Formal Action, manufacture `revise-apply`, or raise the 120s timeout. All violate the Owner reset boundary or existing authority model.


## 225 Contract Reset Proposal Proof

本 generation 在任何新 Apply mutation 前先验证 Owner 指定的 archive-sync completeness：

```text
exact Base:
1783983440e4d1b29d6282bc5c1af55d390f392d

current generation:
20260816-225-propose

OpenSpec:
1.7.0
```

对当前 exact I1 proposal bundle：

1. 所有 `MODIFIED Requirement` 与 canonical requirement 做 Scenario identity completeness 对照：
   - `flowkit-archive-and-checkpoint-boundary` → canonical scenarios 全保留；
   - `flowkit-change-verification-selection` → canonical scenarios 全保留，包含 `OpenSpec executable identity is propagated from the current adapter`；
   - `flowkit-core-hardening-and-release-candidate` → canonical scenarios 全保留。
2. `openspec validate delivery-final-closure-correction --type change --strict --json --no-interactive` → `valid=true`。
3. 将当前 exact `openspec/` bytes 复制到 disposable repository，并使用真实 OpenSpec 1.7 执行 `archive delivery-final-closure-correction --json --yes` → structured success：
   - `specsUpdated=true`
   - `added=2`
   - `modified=3`
   - `removed=0`
   - `renamed=0`
4. disposable archive 后执行 canonical specs strict validation → 全部通过。
5. canonical I1 candidate 未被该 proof relocation 或 mutation。

该 proof 只证明当前 Proposal generation 的真实 archive-sync compatibility；6.2–6.4 的 reusable product guard 仍需在新 Apply generation 实现并由 formal Change Verification 重证。


## 228 Contract Reset Proposal Proof

本 generation 不重新打开 Explore；它只验证 227 dead-end 与 proposed re-verification boundary 可以在现有 authority model 内成立：

1. `227 result.json` 为 immutable completed Apply，且 `terminalBinding.currentVerification.status=failed`、fingerprint/selection 均完整；当前 `verification.md` 与该 binding exact match。
2. 当前 Policy 为 `verification-failed`；现有 failed/cancelled Run retry 不适用，因为 227 Run 自身是 `completed`；bare `flowkit verify` 仅投影 current authority，不能生成新 evidence。
3. Owner `owner:cffdb6e...` 已正式 supersede 225/226/227 generation，仅授权 exact-candidate re-verification lifecycle，不授权 timeout/concurrency/scheduler/新 Formal Action/新 Change。
4. 新设计不需要修改 Policy、Formal Action catalog 或 Run/context/result schema；它只增加显式 Verification behavior、immutable publication history 与 Reader bounded-chain validation。
5. `verification.md` 继续是唯一 current Change Verification authority；history 只保存 superseded formal publication exact bytes，并以 content fingerprint 定位，不保存 raw logs，不形成通用 Evidence platform。
6. 现有 review-apply exact `verificationInputRef` 可以直接消费 retry 后 current publication；因此新的 passed authority 成立后无需 no-op revise 即可回到正常 Reviewer boundary。

Apply 前 Reviewer 必须重点确认：history chain 是否真的能保持 227 point-in-time evidence immutable、candidate identity exclusion 是否只排除 Verification-owned bytes、以及默认 `flowkit verify` 是否仍保持 read-only。

当前 exact 228 Proposal bundle 另外已完成 OpenSpec archive-sync proof：

```text
OpenSpec 1.7.0 strict current Change: PASS
real disposable archive: PASS
specsUpdated=true
added=3
modified=5
removed=0
renamed=0
post-archive openspec validate --all --strict: 17/17 PASS
canonical candidate mutation: none
```

因此新增的 3 个 capability deltas 与 2 个新增 MODIFIED Requirement 已通过真实 archive merge completeness，而不是只通过 strict schema validation。


## flowkitMutationScope

```json
{
  "schemaVersion": 1,
  "actions": {
    "apply": {
      "selectors": [
        {
          "kind": "exact",
          "path": "openspec/changes/delivery-final-closure-correction/tasks.md"
        },
        {
          "kind": "exact",
          "path": "openspec/changes/delivery-final-closure-correction/verification.md"
        },
        {
          "kind": "exact",
          "path": "scripts/verification.ts"
        },
        {
          "kind": "exact",
          "path": "src/cli/change-action.ts"
        },
        {
          "kind": "exact",
          "path": "src/cli/main.ts"
        },
        {
          "kind": "exact",
          "path": "src/facts/formal-fact-reader.ts"
        },
        {
          "kind": "exact",
          "path": "src/integrations/openspec/openspec-cli-adapter.ts"
        },
        {
          "kind": "exact",
          "path": "src/integrations/openspec/openspec-executable.ts"
        },
        {
          "kind": "exact",
          "path": "src/services/b1-run-execution-service.ts"
        },
        {
          "kind": "exact",
          "path": "src/services/f1-checkpoint-boundary-service.ts"
        },
        {
          "kind": "exact",
          "path": "src/verification/change-selection/entry-snapshot.ts"
        },
        {
          "kind": "exact",
          "path": "src/verification/change-selection/evidence.ts"
        },
        {
          "kind": "exact",
          "path": "src/verification/change-selection/module-map.ts"
        },
        {
          "kind": "exact",
          "path": "src/verification/change-selection/publication.ts"
        },
        {
          "kind": "exact",
          "path": "src/verification/change-selection/selection.ts"
        },
        {
          "kind": "exact",
          "path": "tests/integration/g1-change-cli-end-to-end.test.ts"
        },
        {
          "kind": "exact",
          "path": "tests/integration/openspec-1-7-real-cli.test.ts"
        },
        {
          "kind": "exact",
          "path": "tests/unit/cli/change-action.test.ts"
        },
        {
          "kind": "exact",
          "path": "tests/unit/facts/formal-fact-reader.test.ts"
        },
        {
          "kind": "exact",
          "path": "tests/unit/integrations/openspec-cli-adapter.test.ts"
        },
        {
          "kind": "exact",
          "path": "tests/unit/services/a1-write-service.test.ts"
        },
        {
          "kind": "exact",
          "path": "tests/unit/services/b1-run-execution-service.test.ts"
        },
        {
          "kind": "exact",
          "path": "tests/unit/services/f1-checkpoint-boundary-service.test.ts"
        },
        {
          "kind": "exact",
          "path": "tests/unit/verification/change-selection/entry-snapshot.test.ts"
        },
        {
          "kind": "exact",
          "path": "tests/unit/verification/change-selection/evidence.test.ts"
        },
        {
          "kind": "exact",
          "path": "tests/unit/verification/change-selection/module-map.test.ts"
        },
        {
          "kind": "exact",
          "path": "tests/unit/verification/change-selection/publication.test.ts"
        },
        {
          "kind": "exact",
          "path": "tests/unit/verification/change-selection/selection.test.ts"
        },
        {
          "kind": "exact",
          "path": "tests/unit/verification/verification-plan.test.ts"
        }
      ]
    },
    "revise-apply": {
      "selectors": [
        {
          "kind": "exact",
          "path": "openspec/changes/delivery-final-closure-correction/tasks.md"
        },
        {
          "kind": "exact",
          "path": "openspec/changes/delivery-final-closure-correction/verification.md"
        },
        {
          "kind": "exact",
          "path": "scripts/verification.ts"
        },
        {
          "kind": "exact",
          "path": "src/cli/change-action.ts"
        },
        {
          "kind": "exact",
          "path": "src/cli/main.ts"
        },
        {
          "kind": "exact",
          "path": "src/facts/formal-fact-reader.ts"
        },
        {
          "kind": "exact",
          "path": "src/integrations/openspec/openspec-cli-adapter.ts"
        },
        {
          "kind": "exact",
          "path": "src/integrations/openspec/openspec-executable.ts"
        },
        {
          "kind": "exact",
          "path": "src/services/b1-run-execution-service.ts"
        },
        {
          "kind": "exact",
          "path": "src/services/f1-checkpoint-boundary-service.ts"
        },
        {
          "kind": "exact",
          "path": "src/verification/change-selection/entry-snapshot.ts"
        },
        {
          "kind": "exact",
          "path": "src/verification/change-selection/evidence.ts"
        },
        {
          "kind": "exact",
          "path": "src/verification/change-selection/module-map.ts"
        },
        {
          "kind": "exact",
          "path": "src/verification/change-selection/publication.ts"
        },
        {
          "kind": "exact",
          "path": "src/verification/change-selection/selection.ts"
        },
        {
          "kind": "exact",
          "path": "tests/integration/g1-change-cli-end-to-end.test.ts"
        },
        {
          "kind": "exact",
          "path": "tests/integration/openspec-1-7-real-cli.test.ts"
        },
        {
          "kind": "exact",
          "path": "tests/unit/cli/change-action.test.ts"
        },
        {
          "kind": "exact",
          "path": "tests/unit/facts/formal-fact-reader.test.ts"
        },
        {
          "kind": "exact",
          "path": "tests/unit/integrations/openspec-cli-adapter.test.ts"
        },
        {
          "kind": "exact",
          "path": "tests/unit/services/a1-write-service.test.ts"
        },
        {
          "kind": "exact",
          "path": "tests/unit/services/b1-run-execution-service.test.ts"
        },
        {
          "kind": "exact",
          "path": "tests/unit/services/f1-checkpoint-boundary-service.test.ts"
        },
        {
          "kind": "exact",
          "path": "tests/unit/verification/change-selection/entry-snapshot.test.ts"
        },
        {
          "kind": "exact",
          "path": "tests/unit/verification/change-selection/evidence.test.ts"
        },
        {
          "kind": "exact",
          "path": "tests/unit/verification/change-selection/module-map.test.ts"
        },
        {
          "kind": "exact",
          "path": "tests/unit/verification/change-selection/publication.test.ts"
        },
        {
          "kind": "exact",
          "path": "tests/unit/verification/change-selection/selection.test.ts"
        },
        {
          "kind": "exact",
          "path": "tests/unit/verification/verification-plan.test.ts"
        }
      ]
    }
  }
}
```

## Risks / Trade-offs

- **[Risk] resolved executable leaks into persisted selection identity** → Keep it execution-only; Catalog fingerprints remain logical/source-controlled.
- **[Risk] public Full Test becomes host-dependent when OpenSpec is genuinely absent** → That is intentional fail-closed behavior for a required external-tool integration; the environment must provide supported OpenSpec rather than silently skip acceptance.
- **[Risk] runner seam turns real CLI conformance into a mock** → Recording runner must delegate to the real executable; assertions cover real process results and invocation count.
- **[Risk] synthetic A1 fixture stops detecting useful corpus drift** → Preserve exact point-in-time semantics and add explicit future-expansion assertion; do not read mutable current Delivery count.
- **[Risk] checkpoint normalization becomes hidden or broadened mutation** → Limit transformations to the proof-backed EOF-only class on candidate/archive-touched text files and require Git diff hygiene afterwards; trailing spaces/tabs cleanup, internal formatting, semantic changes or unrelated files all stop.
- **[Risk] verification tooling modifies its own selector/executor** → Exact module ownership + physical `verification-plan.test.ts` sentinel already proved formal self-verification closure.
- **[Risk] detached performance differs from canonical host** → Gate only correctness/process-count non-regression and report wall time; do not redesign runner scheduling from environment-sensitive observations.
- **[Risk] disposable archive preflight becomes a second OpenSpec semantics engine** → Never parse/merge Requirements or Scenarios in Flowkit; copy exact `openspec/` bytes, invoke real OpenSpec archive and consume existing typed outcome only.
- **[Risk] Proposal preflight mutates canonical candidate** → All archive mutation is confined to a disposable repo and cleaned in `finally`; canonical repo remains read-only for the preflight.

## Migration Plan

No persisted Flowkit schema, Run format, Manifest schema, Policy state machine or dependency migration is introduced.

Apply changes current source/tests and current OpenSpec delta only. Existing historical Runs/Changes remain immutable. The new executable resolver is immediately used by current code once I1 candidate is materialized; no activation migration is required.

This Contract Reset generation also adds no migration framework. The preflight helper becomes active with the same I1 Apply bytes; future Proposal terminal admission and Change Verification use it directly. Historical Proposal/Review/Apply/Archive Runs 216–224 remain immutable and superseded by the Owner Contract Reset.

After I1 passes Change Verification, review-apply, archive and Owner-authorized checkpoint, 02 returns to Delivery Ready. A new independent Owner authorization is still required before rerunning the formal Delivery Full Test. A passing formal Full Test qualifies the final checkpointed Delivery candidate; a failure remains a Delivery-level fact and MUST NOT reopen I1 automatically.
