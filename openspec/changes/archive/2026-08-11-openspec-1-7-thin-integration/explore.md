# C1 Explore — OpenSpec 1.7 Thin Integration

## 1. Context

- Delivery: `20260810-01-change-execution-loop`
- Change: `C1 openspec-1-7-thin-integration`
- Role: Author
- Execution Context: detached
- Exact GitHub Base: `338aec5bcb3ea3216ebb25d3ae8a306b3ebd456f`
- Run: `20260811-048-explore`
- OpenSpec probe version: `1.7.0`

C1 目标来自 02 implementation reference：OpenSpec 继续拥有 Change contract / artifact lifecycle / archive semantics；Flowkit 只做 select/create、读取 status/instructions/structured paths/context、validate、archive handoff 与 operation result consumption，不复制 OpenSpec path/state machine。

本次 Explore 不实现 adapter，不修改 production/tests/canonical specs，不选择最终 schema 方案。目标是以 exact Base 与实际 OpenSpec 1.7.0 CLI 为证据，确认 current integration drift、structured contract、failure semantics 与 Proposal 必须冻结的边界。

---

## 2. C1 启动已完全由现有 Flowkit 自己完成

GitHub exact Base `338aec5bcb3ea3216ebb25d3ae8a306b3ebd456f` 是 B1 Change Checkpoint。最新 snapshot 带完整 `.git`，Manifest 是 canonical LF。

激活前：

```text
flowkit next
→ owner-decision: activate-change
→ context-change: C1
→ dependencies satisfied

flowkit doctor
→ overall: ok
→ findings: 0
```

Owner 当前明确要求 `explore C1`，因此该输入构成 C1 activation / Explore authority。通过 A1 正式 write-side：

```text
flowkit activate --change openspec-1-7-thin-integration ...
→ success
→ Owner activate-change provenance persisted
→ C1 planned → active

flowkit next
→ explore
```

随后 B1 正式 preparation surface 创建：

```text
20260811-048-explore
semanticInputFingerprint:
510a5247d0ee108386efd7dce229736df2aee888475911f4ae5c782bad366398
```

因此 C1 不再需要 Bootstrap 手工 `planned → active` 或手工分配 Run-ID。

---

## 3. Actual OpenSpec 1.7.0 command surface

离线包真实版本：

```text
openspec --version
→ 1.7.0
```

当前与 C1 直接相关的 JSON-capable commands 已确认：

```text
openspec context --json
openspec list --json
openspec status --change <id> --json
openspec instructions <artifact|apply|archive> --change <id> --json
openspec templates --schema <name> --json
openspec new change <id> --schema <name> --json
openspec show <id> --type change --json --no-interactive
openspec validate <id> --type change --strict --json --no-interactive
openspec doctor --json
openspec archive <id> --json --yes
```

### 3.1 `status --json` 已提供 C1 reference 所需 structured context

对当前 C1：

```text
schemaName: spec-driven
planningHome.kind: repo
planningHome.root: <repo>
planningHome.changesDir: <repo>/openspec/changes
changeRoot: <repo>/openspec/changes/openspec-1-7-thin-integration
artifactPaths: {...}
actionContext.mode: repo-local
actionContext.sourceOfTruth: repo
actionContext.allowedEditRoots: [<repo>]
artifacts: [...]
nextSteps: [...]
```

这证明 02 中预期的：

```text
planningHome
changeRoot
artifactPaths
actionContext
```

不是未来假设，而是 OpenSpec 1.7.0 当前真实 machine output。

### 3.2 `instructions <artifact> --json` 给出 artifact-specific authority context

`instructions proposal --json` 返回：

```text
changeName
artifactId
schemaName
changeDir
planningHome
outputPath
resolvedOutputPath
existingOutputPaths
description
instruction
template
dependencies
unlocks
root
```

Flowkit 不需要自己重写 proposal/spec/design/tasks 的 dependency graph、template path 或 instruction content。

### 3.3 `instructions apply --json` 给出 concrete `contextFiles`

对一个 25/25 tasks complete 的真实 B1 archived candidate disposable probe：

```text
contextFiles.proposal: [absolute path]
contextFiles.specs: [all concrete delta spec paths]
contextFiles.design: [absolute path]
contextFiles.tasks: [absolute path]
progress: 25 / 25
state: all_done
```

这证明 Apply 输入不需要 Flowkit 自己枚举 `specs/**/*.md` 或猜 planning artifact paths。

### 3.4 `archive --json --yes` 有明确 structured operation result

对 disposable B1 copy 实际运行成功：

```json
{
  "archive": {
    "change": "tmp-b1-archive-probe",
    "archivedAs": "2026-08-11-tmp-b1-archive-probe",
    "path": ".../openspec/changes/archive/2026-08-11-tmp-b1-archive-probe",
    "specsUpdated": false,
    "totals": {
      "added": 0,
      "modified": 0,
      "removed": 0,
      "renamed": 0
    }
  },
  "root": {...}
}
```

不存在 change 时：

```text
exitCode = 1
archive = null
status[0].severity = error
status[0].code = archive_change_not_found
```

因此 Archive success/failure 可以直接由 OpenSpec operation output 判定；Flowkit 不需要 archive 后扫描路径做第二次 proof。

### 3.5 Validation JSON 也已经足够 machine-consumable

当前仅 metadata 的 C1：

```text
openspec validate C1 --strict --json --no-interactive
→ exitCode 1
→ items[0].valid = false
→ structured issues[]
→ summary.totals
→ root
```

错误命令如 missing change / missing artifact 也返回 structured：

```text
status[]:
  severity
  code
  message
```

Proposal 必须冻结 adapter 同时检查 process result 与 parsed JSON semantics；不能只 grep stdout prose。

---

## 4. Confirmed Gap C1-G01 — 当前没有 production OpenSpec thin adapter

当前 `src/` 中没有 OpenSpec-specific command adapter/service。

存在：

```text
src/shared/external-command.ts
→ generic spawn + stdout/stderr/exitCode
```

但当前没有 production surface 负责：

```text
OpenSpec executable/version admission
status JSON parsing
action instructions JSON parsing
apply contextFiles parsing
validate JSON parsing
archive JSON parsing
structured diagnostic mapping
```

当前 Bootstrap 仍由人/AI 直接运行 OpenSpec CLI。

### Additional concrete gap: timeout contract 只是字段，没有实现

`RunCommandOptions` 已声明：

```text
timeout?: number
```

但 `runCommand()` 当前完全没有使用该值，也没有 kill/timeout semantics。

02 要求 C1 冻结 external CLI timeout/failure semantics，因此 Proposal 必须明确：

```text
OpenSpec invocation timeout
spawn failure
non-zero exit
invalid JSON
JSON error status
version mismatch
```

如何统一 fail-closed。

不得因此建立 generic Executor Registry。

---

## 5. Confirmed Gap C1-G02 — 当前 Core 大量拥有 OpenSpec physical path rules

当前多处直接假设：

```text
openspec/changes/<changeId>/...
```

主要 affected surface：

```text
src/facts/formal-fact-reader.ts
src/persistence/result-ref-adapter.ts
src/persistence/run-persistence.ts
src/services/a1-write-service.ts
src/services/b1-run-execution-service.ts
src/diagnostics/shared.ts
src/cli/context-loader.ts
```

例如 FormalFactReader 当前直接：

```text
join(repoRoot, openspecChangesPath, change.id, "explore.md")
join(..., "proposal.md")
join(..., "design.md")
join(..., "tasks.md")
join(..., "verification.md")
```

`result-ref-adapter.ts` 直接生成：

```text
openspec/changes/<changeId>/proposal.md
openspec/changes/<changeId>/verification.md
openspec/changes/<changeId>/specs/**
```

B1 package preparation 也仍用 `OPEN_SPEC_CHANGE_PREFIX = 'openspec/changes'`。

这在 repo-local default layout 下可工作，但 C1 的目标正是让 OpenSpec 拥有 path/artifact lifecycle。Proposal 必须冻结哪些地方改为消费 OpenSpec structured `planningHome/changeRoot/artifactPaths/contextFiles`，哪些 repo-relative logical refs 仍作为 Flowkit own ResultRef identity 保留。

不得简单把 OpenSpec 返回的任意 absolute path 直接当成 Flowkit ResultRef；仍需 root containment / normalization / exact authority checks。

---

## 6. Confirmed Gap C1-G03 — OpenSpec 1.7 default schema 与当前 Flowkit 6-artifact contract 不一致

这是本轮最高风险的 authority mismatch。

当前所有 active/recent Change metadata 都是：

```yaml
schema: spec-driven
```

OpenSpec 1.7.0 built-in `spec-driven` schema 实际只有：

```text
proposal
specs
design
tasks
```

真实：

```text
openspec status --change C1 --json
→ artifactPaths 只有 proposal/specs/design/tasks

openspec instructions explore --change C1 --json
→ exitCode 1
→ Artifact 'explore' not found in schema 'spec-driven'

openspec instructions apply --change completed-B1-copy --json
→ contextFiles 只有 proposal/specs/design/tasks
```

但当前 Flowkit canonical facts / B1 ResultRefs 将以下都视为 Change contract artifact：

```text
explore.md
proposal.md
design.md
specs/**
tasks.md
verification.md
```

所以当前真实语义是：

```text
Flowkit says OpenSpec Change has 6 formal files
OpenSpec default schema only models 4 planning artifacts
```

C1 不能继续把这个差异隐藏在 hardcoded path reader 中。

---

## 7. C1-G03 Probe — project-local custom schema 可扩 artifact，但不能直接当最终答案

OpenSpec 1.7 schema resolver支持：

```text
<project>/openspec/schemas/<name>/schema.yaml
```

手工建立 project-local schema：

```text
explore
proposal
specs
design
tasks
verification
```

真实 `openspec schema validate flowkit-change --json`：

```text
valid: true
```

`status --json` 与 `instructions explore --json` 也能正确返回 `explore` / `verification` 的 structured paths。

但有两个重要限制：

### 7.1 官方 schema management surface 仍是 experimental

CLI 明确打印：

```text
Schema commands are experimental and may change.
```

而且：

```text
openspec schema init ... --artifacts explore,...
→ Unknown artifact 'explore'
→ valid: proposal/specs/design/tasks
```

也就是说“手写 arbitrary project schema”当前 engine 能消费，但官方 `schema init` command 并不把 arbitrary artifact ID 当稳定创建面。

### 7.2 `verification` 直接放 artifact DAG 会产生 lifecycle mismatch

手工 schema 中若：

```text
verification requires tasks
```

当 explore/proposal/specs/design/tasks 全完成而 verification 尚未创建：

```text
status.isComplete = false
nextSteps → create verification
verification.status = ready
```

但同一时刻：

```text
instructions apply
→ state = all_done
→ Apply 已可执行
```

说明 OpenSpec artifact graph 是 planning-artifact graph；`verification` 若直接作为普通 artifact node，会在 Apply 前已经 ready，并不能天然表达 Flowkit 的：

```text
Apply
→ Change Verification
→ review-apply
```

因此 Proposal 必须显式决定 authority 分工，不能仅以“custom schema 加两个节点”解决 G03。

### 7.3 Confirmed Gap C1-G03A — 当前 C1 不能靠静默 schema migration 解决自身 authority mismatch

当前 C1 已经在 activation 时持久化：

```yaml
schema: spec-driven
```

并且 048 `explore`、049 `review-explore` 与当前 050 `revise-explore` 的 B1 semantic input 都把：

```text
openspec/changes/openspec-1-7-thin-integration/.openspec.yaml
```

作为 versioned `contractRef`。下一正常 `propose` 的固定 B1 mutation boundary 又是：

```text
proposal-bundle-only
```

因此以下做法都不合法：

```text
049 review-explore approved
→ 在 propose 前 out-of-band 改当前 C1 .openspec.yaml

或

propose
→ 暗中承担 schema migration
```

二者都会破坏已 review semantic binding，或违反 B1 已冻结的 Action mutation contract。

当前 C1 的兼容 seam 必须明确区分两个时间平面：

```text
current C1 lifecycle
→ 保持 activation 时的 schema: spec-driven
→ Explore 继续由 Flowkit formal fact 管理，不伪称 OpenSpec graph node
→ Proposal/Specs/Design/Tasks 继续使用当前 OpenSpec spec-driven graph
→ Verification 继续由 Flowkit Verification authority 在 Apply 后管理
→ 当前 C1 .openspec.yaml 不在 review-explore → propose 之间迁移

future Changes after C1 implementation
→ 才应用 Proposal 最终冻结的 metadata/schema contract
→ A1 activation initializer / OpenSpec adapter 与该 contract 同步
```

这并不预先选择 P2 的最终长期方案 A/B/C；它只冻结一个 Bootstrap/self-dogfood compatibility invariant：

> **当前已经激活并被 review-bind 的 C1 不通过 silent metadata rewrite 自我迁移。**

如果 Proposal 认为长期方案必须使用 project-local custom schema，则 Proposal 必须明确：

```text
custom schema definition / production support
→ 可在后续 Apply 作为 future-Change capability 实现

current C1 metadata
→ 仍保持 spec-driven 直到本 Change archive
```

若 Proposal 反而要求迁移当前 C1 `.openspec.yaml`，则必须先证明存在一个已冻结且合法的 Action / Owner / candidate-reset boundary，能在不继承失效 review binding 的前提下重新建立 semantic generation；在该证明出现前，该路径视为不合法候选。

---

## 8. Confirmed Gap C1-G04 — A1 metadata initializer 把 `spec-driven` 写死成产品 contract

`ensureMinimalOpenSpecMetadata()` 当前 exact shape：

```text
schema: spec-driven
created: YYYY-MM-DD
```

并且已有文件只有匹配：

```regex
^schema: spec-driven\ncreated: ...\n$
```

才视为 idempotent，否则：

```text
OPENSPEC_METADATA_MISMATCH
```

因此如果 Proposal 最终选择 Flowkit project-local schema，C1 必须同步 A1 metadata seam；否则 future Change activation 会继续创建 `spec-driven` Change。

但 A1 的权力边界必须保留：

```text
activation
→ 只 initialize/validate metadata
→ 不创建 planning artifacts
→ 不拥有 OpenSpec artifact lifecycle/archive
```

另一个可调查方案是使用 `openspec new change ... --json` 作为 metadata/directory creation authority；Proposal 必须基于最小故障面和 idempotency 选择，Explore 不提前决定。

---

## 9. Confirmed Gap C1-G05 — structured output 是 absolute physical path，Flowkit ResultRef 是 repo-relative logical identity

OpenSpec 1.7 structured output示例：

```text
changeRoot = /absolute/repo/.../openspec/changes/<id>
resolvedOutputPath = /absolute/repo/.../proposal.md
contextFiles.specs[] = /absolute/repo/.../specs/<cap>/spec.md
actionContext.allowedEditRoots[] = /absolute/repo
```

而 Flowkit B1/Q1 已冻结 ResultRef：

```text
repository-relative logical ref
+ content fingerprint
```

C1 必须提供清晰转换边界：

```text
OpenSpec physical authority path
→ verify under resolved planning root / allowed roots
→ normalize
→ Flowkit logical ref/view
```

必须拒绝：

```text
path escapes
unexpected root
ambiguous/multiple unsupported output shape
malformed structured JSON
```

不能为了“thin”取消已有 path safety，也不能把 OpenSpec absolute path永久写进 Run 作为第二 path authority。

---

## 10. Confirmed Gap C1-G06 — Archive operation result 尚未成为 product integration surface

当前产品代码没有 OpenSpec archive adapter。B1 只负责 archive Run execution identity/continuation，不拥有 OpenSpec archive operation。

OpenSpec 1.7 已明确提供：

```text
archive.change
archive.archivedAs
archive.path
archive.specsUpdated
archive.totals
archive.warnings?
root
```

失败提供：

```text
archive: null
status[].severity/code/message
exitCode = 1
```

C1 必须冻结 thin archive handoff：

```text
Flowkit Policy/Owner gate already legal
→ call OpenSpec archive --json [confirmation semantics]
→ parse structured operation result
→ success/failure returned to Action execution
```

成功后：

```text
MUST NOT scan archive directory to prove OpenSpec success
MUST NOT re-run spec merge logic
MUST NOT copy OpenSpec internal archive state machine
```

B1 对 persisted pending archive 的 archived-path lookup只服务**同一 pending Run continuation / immutable entry identity recovery**；它不能被提升成 C1 的 archive success authority。

---

## 11. Confirmed Gap C1-G07 — current canonical integration wording still contains historical stage ownership text

当前 `flowkit-integration-boundaries` canonical spec仍含历史语句：

```text
C1 MUST NOT modify B1 ...
C1 MUST 新建 docs/integration-boundaries.md ...
```

这些内容来自早期 Delivery 的 B1/C1 stage naming；当前 02 的 C1 已是：

```text
openspec-1-7-thin-integration
```

而 `docs/integration-boundaries.md` / capability spec早已存在且在 B1 checkpoint 中被更新。

这不是要求 C1 重写 B1 已批准 contract，而是 current integration capability 自身存在**历史 stage-name wording 与当前 ownership语境冲突**。Proposal 必须决定最小 canonical cleanup，使 requirement 使用 capability/authority 名称而不是可复用的 `B1/C1` 临时阶段标签，避免当前 C1 被错误理解为“不得修改 integration capability”。

---

## 12. Confirmed Gap C1-G08 — OpenSpec version / invocation / Windows launcher contract尚未冻结

02 明确要求 C1 真正研究并冻结 OpenSpec 1.7 thin integration。

当前 repo verification script已有：

```text
win32 → openspec.cmd
other → openspec
```

以及 `scripts/platform-command.ts` 的 `.cmd/.bat` launcher handling，但这是 verification script helper，不是 production OpenSpec adapter。

Production `src/shared/external-command.ts`：

```text
直接 spawn(command,args)
没有 platform launcher policy
声明 timeout 但不执行 timeout
```

Proposal 必须冻结：

```text
supported OpenSpec version/range
version mismatch behavior
Windows launcher strategy
command timeout
NO_COLOR/FORCE_COLOR/non-interactive environment
JSON-only machine mode
stderr handling
exit code + JSON status handling
```

不得依赖 human prose，也不得 import/vendoring OpenSpec internals形成第二实现。

---

## 13. Current OpenSpec root/context facts

对 exact Base 当前 repo：

```text
openspec context --json
→ root.path = exact repo root
→ root.source = nearest
→ members = []
→ status = []

openspec doctor --json
→ root.healthy = true
→ status = []
```

当前是单 repo-local root；OpenSpec 1.7 同时暴露 `--store` / `planningHome.kind` 等能力。

02 当前 Delivery只需要把本项目 Change execution loop安全完成，不应因为 OpenSpec 提供 store能力就扩成 Store Registry/platform。Proposal 必须明确本 C1 支持的 root/mode范围，以及遇到 unsupported mode 时的 fail-closed 语义。

---

## 14. What C1 should reuse, not replace

### Flowkit already owns

```text
Policy next boundary
Owner authority/provenance
B1 ActionDefinition / Action Package / semantic input identity
B1 Run preparation/result admission
ResultRef logical/content fingerprint semantics
Reviewer Verdict
Verification status authority
Git boundary facts
```

### OpenSpec owns

```text
resolved Change schema
planning artifact graph
artifact instructions/templates
planningHome/changeRoot/artifactPaths
apply contextFiles/task progress
change/spec validation
spec delta sync
archive relocation
archive operation success/failure
```

### C1 should be thin bridge

```text
invoke
parse
validate structured output
normalize bounded refs/context
return structured view/result
```

C1 must not become：

```text
second Policy
second OpenSpec artifact graph
second spec merger/archive engine
Provider/Adapter Registry
generic external-command platform
stable Agent runtime
```

---

## 15. Proposal Freeze Questions

Proposal 必须基于上述 probes明确冻结以下问题，不能留给 Apply 临时决定。

### P1 — supported OpenSpec contract

冻结：

```text
supported version / range
version admission command
machine JSON command set
timeout/non-interactive/color/env
platform launcher
structured diagnostic envelope
```

### P2 — artifact authority reconciliation + current-C1 compatibility

必须明确回答：

```text
OpenSpec 1.7 default schema只有 proposal/specs/design/tasks
Flowkit formal facts另有 explore/verification
```

最终采用何种 authority split。

可比较但本 Explore不选择长期方案：

```text
A. repo-local custom OpenSpec schema承担 explore + planning artifacts，verification仍由 Verification authority单独管理
B. default spec-driven继续拥有4个 planning artifacts，Flowkit显式承认 explore/verification不是OpenSpec artifact-graph nodes
C. 其它能同时满足 OpenSpec authority + post-Apply Verification lifecycle的最小方案
```

但 Proposal 必须同时冻结 current-C1 compatibility：

```text
当前 C1 .openspec.yaml = schema: spec-driven
→ 在本 Change 的 Explore/Review/Propose generation 中保持不变
→ Propose 不承担 metadata/schema migration
→ Explore / Verification 的非 graph-node 状态必须被显式承认

长期方案若改变 schema
→ 作为 C1 Apply 后对 future Changes 生效的 capability
→ 不 retroactively silent-migrate 当前 C1
```

若 Proposal 要求迁移当前 C1 metadata，则必须先给出合法 Action/Owner/candidate-reset boundary 与重新建立 semantic generation 的完整证明；否则该方案不 admissible。

禁止伪称 default spec-driven已经拥有6个 artifacts，也禁止用 out-of-band metadata rewrite 掩盖 mismatch。

### P3 — future metadata creation seam

冻结：

```text
C1 implementation 完成后，future Changes 的 A1 exact metadata initializer
如何与最终 schema/root decision一致
```

同时明确：

```text
current C1 metadata
→ 保持 activation 时的 spec-driven generation
→ 不由 P3 retroactively 重写

future Change activation
→ 使用 Proposal 冻结后的 metadata/schema contract
```

并保持 A1只初始化 metadata、不拥有 artifact lifecycle。

### P4 — structured path/context model

冻结 adapter返回的最小 typed views：

```text
root/planningHome
changeRoot
artifactPaths
contextFiles
actionContext
status/artifact dependency state
```

以及 absolute physical path → safe logical ref conversion规则。

### P5 — Action-specific OpenSpec consumption

逐 Standard Change Action说明最小 OpenSpec input：

```text
explore
propose / revise-propose
apply / revise-apply
archive
```

Review仍审查 B1 ResultRef-bound target，不让 OpenSpec决定 Reviewer Verdict。

### P6 — validation semantics

冻结：

```text
when status/instructions/validate is called
strict vs non-strict
what blocks preparation/admission
how structured issues become Flowkit failure diagnosis
```

Validation工具不能决定 next Action。

### P7 — archive operation result

冻结 archive input/options/result/error model与恢复边界：

```text
operation success is OpenSpec authority
no post-success archive scan proof
no duplicate spec sync
```

### P8 — repo-local scope / store behavior

明确：

```text
current C1是否仅支持 repo-local planningHome
或支持 bounded store-aware path resolution
```

不得顺带建立 Store Registry。

### P9 — canonical migration

明确 affected docs/spec/code/tests，至少复核：

```text
flowkit-integration-boundaries
flowkit-formal-fact-reader-and-persistence
flowkit-lean-run-and-action-package
flowkit-delivery-change-creation-and-owner-input
flowkit-domain-and-state-schema
flowkit-bootstrap-and-roadmap

src/facts/formal-fact-reader.ts
src/persistence/result-ref-adapter.ts
src/persistence/run-persistence.ts
src/services/a1-write-service.ts
src/services/b1-run-execution-service.ts
src/cli/context-loader.ts
src/shared/external-command.ts / platform launcher seam
```

只修改真实 contract drift，不借 C1 重构 Core。

---

## 16. Required tests for Proposal/Apply planning

后续至少需要覆盖：

```text
OpenSpec 1.7 version accepted / wrong version rejected
status JSON parsing
instructions artifact JSON parsing
instructions apply contextFiles exact enumeration
validate strict success/failure JSON
structured status diagnostic mapping
invalid JSON / non-zero / spawn error / timeout
Windows openspec.cmd launcher
planning root containment / path escape rejection
schema/artifact authority chosen contract
A1 future metadata compatibility
B1 package uses structured current OpenSpec inputs without copying tool state
archive JSON success
archive JSON failure
archive success no second path proof
archive continuation仍由 same pending Run identity工作
```

并继续保证：

```text
Delivery Full Test = not-run
no auto Commit/Push/Checkpoint
```

---

## 17. Explore conclusion

C1 的核心并不是“给 `openspec` 包一层 subprocess”。真实问题有三层：

```text
1. OpenSpec 1.7 已有足够好的 structured CLI authority
   → Flowkit当前没有 production consumer

2. Flowkit当前拥有太多 physical path/artifact assumptions
   → 必须收缩到 structured views + safe logical refs

3. 最大 contract gap：default spec-driven只认识4个 planning artifacts，
   Flowkit却把 explore/verification一起表达成 OpenSpec Change artifact
   → Proposal必须先解决 authority split，才能安全实现 adapter

4. 当前 C1 已经以 spec-driven 激活并被 B1 semantic binding
   → 本 Change 不允许在 review-explore → propose 之间 silent-migrate metadata
   → 长期 schema contract 与 current-C1 compatibility 必须分开冻结
```

OpenSpec 1.7.0 的 status/instructions/apply/archive/validate probes已经证明 thin integration可行；但 schema/artifact authority mismatch如果不先冻结，会让 C1 在“复用 OpenSpec”与“暗中维护第二套 artifact lifecycle”之间继续漂移。当前 C1 自身则明确保持 activation 时的 `spec-driven` metadata generation，直到合法 Proposal/Apply 冻结并实现面向 future Changes 的新 contract；不通过 out-of-band rewrite 自我迁移。

因此本 Explore 建议下一边界仍是正常：

```text
review-explore
```

由 Reviewer先判断 G01–G08 与 P1–P9 是否完整，再进入 Proposal。
