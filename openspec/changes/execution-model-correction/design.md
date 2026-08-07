# Design: Q1 — execution-model-correction

## 设计目标

Q1 只修正执行模型的横切契约，不重写已完成的 Policy 业务规则。设计必须同时满足：

```text
正确性：review binding / ResultRef / terminal publish 可机械验证
轻量性：Run 不再承担第二套事实系统
可恢复：正式 artifact 可从 Git + OpenSpec 恢复
低成本：小修订不默认触发全量测试
兼容性：Bootstrap schemaVersion 1 历史不被重写
```

119 暴露了一个必须显式处理的生命周期事实：

```text
canonical Change artifact
= 当前版本
= 合法 revise-* 可以覆盖

terminal Run
= 历史执行记录
= 不可覆盖
```

因此不能要求**所有历史** `producedResultRefs` 永久重新验证“当前 canonical bytes”。Q1 选择
**generation-aware validation boundary**，而不是为每个 revision 建立第二套 immutable artifact snapshot store。

## 设计决策

### Q1-1: RunResultFile 使用单一 closed Core-validated schema

Q1 MUST 将 schemaVersion 2 的 `RunResultFile` / `ActionResultWithoutRunRef` 收敛为 closed schema。
校验器 MUST 拒绝未知字段，不得继续 lenient passthrough。

允许的逻辑字段限定为：

```text
RunResultFile
  runStatus
  actionResult?
  failureDiagnosis?
  cancellationReason?
  reviewVerdict?     // review-* completed 专用
  reviewFindings?    // review-* completed 专用 typed payload

ActionResultWithoutRunRef
  action
  executionStatus
  summary
  producedResultRefs?
  consumedInputRefs?
  verificationSummaryRef?
  reviewVerdictRef?
  failureDiagnosis?
  nextActionRecommendation?
```

`blockingFindings`、`nonBlockingFindings`、`resolvedFindings`、`verification[]`、`archiveResults`、
`manifestUpdate`、`policyRoute`、`commitPolicy`、`consistencyScan` 等自由字段不属于 schemaVersion 2
RunResultFile，出现时 MUST reject。

### Q1-2: reviewFindings 是最小 typed reviewer payload

`reviewFindings` 只允许出现在 completed `review-*` Run 中，每条 Finding 使用最小结构：

```text
id: non-empty string
severity: blocking | non-blocking
title: non-empty string
problem: non-empty string
location?: non-empty string
requiredChange?: non-empty string
```

规则：

- `changes-requested` MUST 至少包含 1 个 `severity=blocking` finding；
- `approved` MUST 不包含 blocking finding；
- 非 review Run MUST NOT 携带 `reviewVerdict` 或 `reviewFindings`；
- `reviewFindings` 不复制完整 OpenSpec/Verification/Git 内容，只保存 Reviewer 自己拥有的 verdict/finding 事实。

Q1 不实现 Finding registry 或自动 review/revise loop。

### Q1-3: ResultRef 的 fingerprint、kind 和 path authority 全部归 Core

生产路径中的 ResultRef MUST 由 Core 从真实目标文件派生。Caller 只允许提供 typed descriptor，MUST NOT
提供：

```text
versionFingerprint
任意 ref path
ResultRef.kind
```

Run-result 使用现有：

```text
buildRunResultRef(runPath, fileContent)
→ kind = run-result
→ ref = <runPath>/result.json
```

non-Run artifact 新增内部构造器：

```text
buildArtifactResultRef(logicalRef, fileContent, kind)
→ kind ∈ {produced-artifact, verification-summary}
→ persisted ref = normalized logicalRef
→ versionFingerprint = content SHA-256
```

`kind` 由 owning result field 的 Core resolver 决定，不暴露给 caller。

### Q1-4: Core-owned field → kind → logical ref → physical target resolver 是唯一解析规则

统一 resolver 映射：

```text
context.inputRef
  kind = run-result
  descriptor = consumedRunId（普通 Run）或 reviewedRunId（review-*）
  target = Core 从 Run root + runId 派生 result.json

actionResult.consumedInputRefs
  kind = run-result
  descriptor = consumedRunId[]
  target = Core 从 Run ID 派生 result.json

actionResult.reviewVerdictRef
  kind = run-result
  descriptor = reviewRunId
  target = review Run result.json
  review-* Run 禁止携带，避免 self-reference

actionResult.producedResultRefs
  kind = produced-artifact
  initial explore/propose = Core 根据 Action 固定 expected set 自动派生（caller 无权省略）
  revise-explore/revise-propose = caller 仅声明 changed producedArtifactTag[]，Core 做 subset overlay
  logical ref = Core 从 context.changeId + Action + tag 派生 canonical identity
  physical target = generation-aware + archive-aware artifact resolver

actionResult.verificationSummaryRef
  kind = verification-summary
  descriptor = none
  logical ref = openspec/changes/<context.changeId>/verification.md
  physical target = generation-aware + archive-aware artifact resolver
```

`producedArtifactTag` 固定映射：

```text
explore / revise-explore
  explore  → openspec/changes/<changeId>/explore.md

propose / revise-propose
  proposal → openspec/changes/<changeId>/proposal.md
  design   → openspec/changes/<changeId>/design.md
  specs    → openspec/changes/<changeId>/specs/**（Core 枚举）
  tasks    → openspec/changes/<changeId>/tasks.md

apply / revise-apply / review-* / archive
  no produced artifact tags
```

初始 generation 不使用“可选 tag 列表”决定完整性，Core 固定 expected set：

```text
initial explore
  required expected tags = {explore}
  effective refs = {openspec/changes/<changeId>/explore.md}

initial propose
  required expected tags = {proposal, design, specs, tasks}
  singleton refs = proposal.md + design.md + tasks.md
  specs refs = Core 在 terminal preflight 时枚举当时实际存在的完整 specs/** namespace
```

`producedResultRefs` 在 initial artifact Run 上因此不是语义可选：Core MUST 自动构造完整 expected set。
caller 不能通过 `[]`、省略 tag 或只声明部分 tag 缩小 initial coverage。`revise-*` 仍允许非空 changed-tag
子集，并通过 predecessor effective set overlay 保留最小修复能力。

MUST reject Action 不允许的 tag、caller-supplied path/kind/fingerprint、path traversal、绝对路径、
non-Run `result.json` target、field/kind mismatch 和非法 root。

createRun、writeRunResult preflight、review entry check 与 Reader MUST 共享同一 resolver/validation 语义。

### Q1-5: mutable Change artifact 使用 generation-aware validation，而不是历史快照库

`openspec/changes/<changeId>/...` 是 OpenSpec current-state canonical artifact。合法 `revise-explore` /
`revise-propose` 会覆盖同一路径，因此历史 `producedResultRefs` 的 fingerprint 不能永久解释为
“当前 canonical path 必须仍是旧 bytes”。

Q1 定义两层概念：

```text
artifact generation
  = 一个 completed {explore|revise-explore|propose|revise-propose} Run
    在完成时由 Core 验证的 produced artifact version

current effective artifact set
  = 当前阶段 lineage 中仍代表 canonical current-state 的 ResultRefs
```

Reader MUST 先根据 review/revise lineage 分类 generation，再决定哪些 mutable artifact refs 需要对当前 bytes
执行 replacement validation。不得简单地“遍历所有 terminal Run refs 并逐个对当前 path 验 hash”。

#### 5.0 initial generation 必须完整

初始 `explore` / `propose` 没有 predecessor，因此不能依赖 overlay 补齐缺失引用。Core MUST 在 initial terminal
preflight 自己建立 authoritative expected set：

- initial `explore`：exactly `explore.md`；
- initial `propose`：`proposal.md`、`design.md`、`tasks.md` + 当时实际 `specs/**` 完整 namespace；
- `specs/**` 必须逐文件形成 content-hash ResultRef；如果 namespace 为空，则“空 namespace”本身是枚举结果，
  但 proposal/design/tasks 仍不可缺失；
- persisted produced refs 缺任一 expected singleton、缺任一实际 spec ref、包含不属于 expected set 的额外
  produced-artifact ref，initial completion MUST reject；
- review entry 再重建 expected/current set：既验证 persisted refs 全部匹配，也比较当前 canonical specs namespace，
  防止 initial completion 后新增未绑定 spec 文件绕过 review。

因此 initial generation 不存在“caller 声明空 tag 后得到空 effective set”的合法路径。

#### 5.1 合法 successor lineage

对阶段 `S ∈ {explore, propose}`：

```text
G0 = completed S / revise-S artifact generation
R  = completed review-S
R.reviewedRunId == G0.runId
R.verdict == changes-requested
G1 = pending 或 completed revise-S
G1.sourceReviewRun == R.runId
G1.sourceReviewVerdict == changes-requested
```

只有该链成立时，G1 才是 G0 的合法 revision successor / revision window。不能仅按 Run 编号、mtime 或
“存在较新 revise-S”推断 supersession。

#### 5.2 current、superseded 与 revision window

- 没有合法 successor 时，G0 是 current generation，其 effective refs MUST 严格验证当前 canonical bytes；
- 合法 pending `revise-S` 创建后，进入 revision window：G0 的 mutable stage refs MAY 被当前 Action 合法修改，
  Reader MUST NOT 因这些预期中的 canonical changes 把 G0 记为 `FactConflict`；
- pending revise 仍必须保持其 review input/source lineage 可验证，且 Policy 不应出现跳过当前 revise 的新阶段结果；
- G1 terminal 完成后，G0 变为 superseded，G1 成为新的 current generation；
- superseded G0 的 terminal Run、source review、review exact binding 继续严格验证，但其已被合法 successor 覆盖的
  mutable artifact refs MUST NOT 再与当前 canonical bytes 比较；
- 没有合法 revision window/successor 的 canonical overwrite 仍是非法 replacement，MUST fail-closed。

这是一条 **Reader validation boundary**，不是 terminal Run mutation，也不是删除历史 ResultRef。

#### 5.3 subset revision 使用 effective-set overlay

`revise-propose` MAY 只修改 Proposal bundle 的子集。为了既支持最小修改又避免漏报，Core 构建：

```text
effectiveSet(G1)
= effectiveSet(G0)
  overlay G1.producedResultRefs
```

按 logical artifact identity 合并：

- `proposal` / `design` / `tasks` tag 各替换一个 logical ref；
- `specs` tag 是 namespace replacement：一旦 G1 声明 `specs`，Core 重新枚举当前 `specs/**`，整个旧 specs
  namespace 被新集合替换，包括合法新增/删除；
- G1 未声明的 tag 继承 G0 的 refs，G1 terminal preflight MUST 再次验证这些 inherited refs 仍与 canonical
  current bytes 一致；
- 对 `propose / revise-propose`，overlay 之后 Core MUST **无条件**重新枚举当前 canonical `specs/**` logical identities，
  并与 `effectiveSet(G1)` 中的 specs logical-ref set 做精确集合比对；
- 若 G1 未声明 `specs` tag，而当前 specs namespace 相比 inherited set 新增或删除文件，则 exact-set mismatch：
  G1 MUST 保持 pending，不能以“所有 inherited refs 的旧文件仍 hash-match”为由 terminal；
- 若 G1 声明 `specs` tag，Core MUST 用重新枚举得到的完整当前 namespace 整体替换 predecessor specs set，并为
  每个实际 spec 重新派生 fingerprint；
- 如果实际修改了某 singleton artifact 却没有声明对应 tag，则 inherited fingerprint mismatch，G1 MUST 保持 pending；
- 因此 caller 可以做最小 tag declaration，但不能静默漏掉 singleton 内容变化，也不能静默漏掉 specs namespace 变化。

#### 5.3.1 current propose specs namespace completeness invariant

对每个 current propose effective generation `G ∈ {initial propose, revise-propose successor}`：

```text
logicalIdentities(effectiveSpecs(G))
==
enumerateCanonicalSpecs(context.changeId)
```

该等式 MUST 在两个边界重复成立：

1. `propose / revise-propose` terminal preflight；
2. `review-propose` entry。

这不是“initial generation special case”。Initial propose 用 Core-owned complete expected set 建立第一代；每个
revise-propose 则先做 predecessor overlay，再做同一个 exact namespace comparison。这样：

```text
P0 specs = {A}
R0 = changes-requested
P1 declares only proposal
canonical specs becomes {A, B}
```

在 P1 terminal preflight 即因 `{A} != {A,B}` 被拒绝；即使 namespace 变化发生在 P1 terminal 之后、
review-propose 创建之前，review entry 的重复 exact-set check 仍会拒绝 binding。

#### 5.4 review 前必须验证 current effective set

创建 `review-explore` / `review-propose` 前，Core/Reader MUST 先验证当前 effective artifact set：

```text
all effective refs resolve uniquely
+
all current bytes match their fingerprints
+
if stage == propose:
  logicalIdentities(effective specs refs)
  == current canonical specs/** namespace
```

然后 review-* Run 再用 `context.inputRef` 精确绑定被审查 artifact generation 的 immutable `result.json`。
这样 reviewer 的 verdict 与“当时已验证的 current artifact generation”绑定，而不要求未来 revision 永久保留旧
canonical bytes。

### Q1-6: review-* Run 必须绑定 reviewedRunId 的精确 result 内容

review-* Run 的 `ContextFile.inputRef` 从 optional 收紧为 REQUIRED。

创建：

```text
reviewedRunId
→ resolve reviewed Run result.json
→ read bytes
→ buildRunResultRef
→ persist context.inputRef
```

约束：

```text
context.inputRef.ref == reviewedRunId 对应 result.json path
context.inputRef.versionFingerprint == reviewed result.json 实际 SHA-256
```

reviewed result 缺失/不可读时 createRun MUST 在 staging publish 前失败。

完成 preflight 再次读取 reviewed result。替换后 SHA 不一致时 MUST 返回 `RESULT_REF_MISMATCH`，不发布 reviewer
result，Run 保持 pending。Reader 对 inputRef absent / wrong target / missing / mismatch MUST `FactConflict`。

该 exact Run-result binding **永久有效**，不受 mutable OpenSpec artifact generation supersession 影响。

### Q1-7: reviewVerdictRef 禁止自引用

review-* Run 自己就是 reviewer 正式结果，因此 MUST NOT 在自己的 result.json 中携带
`actionResult.reviewVerdictRef`。

非 review Run 如需引用 reviewer 结果，只提供 `reviewRunId` descriptor；Core 构造指向另一个 review Run
`result.json` 的 `reviewVerdictRef`。

### Q1-8: writeRunResult completion preflight 使用 current/effective generation 规则

保留现有 `assertMutable + fs.link` 并发不变量，在 schema / action-specific integrity 校验之后、
serialization / temp-file 之前执行 ResultRef preflight。

普通 Run-result refs：

```text
context.inputRef
consumedInputRefs
reviewVerdictRef
→ 始终严格 resolve + SHA-256 验证
```

mutable Change artifact refs：

```text
initial explore/propose
→ Core derive complete Action-owned expected set（不可由 caller 缩小）
→ derive every expected produced ref
→ validate exact completeness + every produced ref

revise-explore/revise-propose
→ derive refs for declared changed tags
→ merge predecessor effective set
→ validate successor refs + inherited refs
→ any undeclared actual change => inherited mismatch => pending

review-explore/review-propose entry
→ validate current effective set before reviewer Run creation

historical superseded generation
→ 不在普通 Reader 中重新对当前 canonical bytes 验证其被覆盖 refs
```

任一适用 preflight 失败：

```text
MUST NOT serialize terminal result
MUST NOT create temp result
MUST NOT fs.link result.json
Run remains pending
```

terminal Run 已存在时仍由 `assertMutable + fs.link` 拒绝。

### Q1-9: verificationSummaryRef 使用同一 generation principle

`verification.md` 也是 mutable Change artifact：`revise-apply` 后 Change Verification 会更新它，随后新的
`review-apply` 产生新的 `verificationSummaryRef`。因此不能永久把所有历史 review-apply summary ref 对当前
`verification.md` bytes 做严格验证。

规则：

```text
review-apply V0
  → verificationSummaryRef = current verification.md content

V0 verdict = approved
  → V0 summary ref 维持 current，直到 archive

V0 verdict = changes-requested
  → 合法 revise-apply 创建后开启 verification revision window
  → V0 summary ref 可被后续 Change Verification 合法 supersede
  → 更新 verification.md 不产生历史假 FactConflict

next review-apply V1
  → 创建前要求当前 verification.md 存在/可读
  → Core 构造新 verificationSummaryRef
  → V1 成为 current verification generation
```

历史 V0 的 review result、reviewedRun exact binding 与 verdict 继续严格验证；只停止将已合法 superseded 的
verificationSummaryRef 与当前 bytes 比较。若没有匹配的 `changes-requested → revise-apply` lineage 而
`verification.md` 被替换，仍 fail-closed。

### Q1-10: current effective artifact set 跨 archive relocation 保持可验证

generation-aware 规则先确定**当前 effective set**，archive-aware resolver 再决定这些 ref 的物理位置。

持久化 logical ref：

```text
openspec/changes/<changeId>/<relativeArtifactPath>
```

archive 前：

```text
physical target = openspec/changes/<changeId>/<relativeArtifactPath>
```

archive 后：

```text
active target absent
→ `openspec/changes/archive/` 下恰好一个 `<YYYY-MM-DD>-<changeId>` directory
→ physical target = archived path
```

要求：

- persisted logical ref 不因 archive 改写；
- archive 必须保持**最终 current effective artifact set** bytes 不变；
- active + archive 同时存在、多个 archive 精确匹配、目标缺失或 archive 后 final content hash 改变均 fail-closed；
- superseded generation 不因 archive 获得新的历史 snapshot，也不重写 terminal Run；
- post-archive Reader 验证 final effective generation + final current verificationSummaryRef，历史 superseded refs
  继续按 generation boundary 处理。

### Q1-11: 正式 Change artifact 与 scratch 明确分离

active Change 正式 Git-tracked artifact：

```text
openspec/changes/<changeId>/explore.md
openspec/changes/<changeId>/proposal.md
openspec/changes/<changeId>/design.md
openspec/changes/<changeId>/specs/**
openspec/changes/<changeId>/tasks.md
openspec/changes/<changeId>/verification.md
```

这些是 **current-state canonical paths**，合法 revise-* MAY 覆盖；它们不是每个 terminal Run 的 immutable
history store。

archive 后最终 current-state artifact relocation 到：

```text
openspec/changes/archive/<date>-<changeId>/**
```

`.tmp/**` 只允许临时计算，MUST NOT 成为 resume / review / archive 的唯一事实来源。Q1 不新增
`.flowkit/artifacts/`、`openspec/.history/` 或其他第二套 artifact history registry。

### Q1-12: Verification 只冻结成本边界，不实现 F1 工具

Q1 冻结：

```text
explore / propose
  → 当前契约/文档适用检查

apply / revise-apply
  → focused + affected 范围适用检查
  → typecheck / lint / build / OpenSpec strict 仅在适用时执行

review-apply / archive
  → 消费 Change Verification，不自动跑 Delivery Full Test

Delivery Full Test
  → 只有 Delivery ready + owner explicit authorization 才允许
```

Q1 MUST NOT 新增具体 `test:focused` / `test:affected` / `test:full` / `verify:change` scripts。

### Q1-13: Bootstrap legacy correction 是有界例外，不是产品 editor

schemaVersion 1 历史 Run 继续由 legacy recognizer best-effort 读取。`createRun` / `writeRunResult` MUST NOT
修改或迁移 legacy Run。

Bootstrap 仅允许 owner 明确授权的 migration-time metadata correction，且必须满足：

```text
schemaVersion 1 legacy
metadata-only
不改 result.json
不改 Action / Role / Verdict / Findings / 业务产物
不存在已知下游消费冲突
Git 保存 before / after
```

不实现通用 CLI/API，不成为长期产品接口。

## 数据流

### Create Run

```text
Policy 已确定 Action
→ caller 提供 identity + typed target descriptor
→ 若为 review-*：先验证 current effective artifact/verification generation
→ Core resolve immutable Run input
→ Core derive input ResultRef
→ build ContextFile
→ closed/schema + identity validation
→ staging
→ atomic directory publish
→ pending Run
```

### Complete initial artifact Run

```text
read context
→ assertMutable
→ validate closed result input
→ derive produced refs
→ validate produced refs
→ serialize
→ temp
→ fs.link create-once
→ terminal current generation
```

### Complete revise artifact Run

```text
read sourceReviewRun
→ prove matching changes-requested lineage
→ find predecessor effective set
→ derive successor refs for declared tags
→ overlay successor refs on predecessor effective set
→ validate successor + inherited current refs
→ undeclared changed artifact => inherited mismatch => keep pending
→ publish terminal result
→ predecessor becomes superseded
→ successor becomes current generation
```

### Read Runs

```text
1. read/validate immutable Run contexts + result.json
2. build review/revise lineage
3. classify mutable artifact generations:
   current / revision-window / superseded
4. construct current effective artifact set by overlay
5. strictly validate only current effective mutable refs
6. validate all immutable Run-result refs / review exact bindings
7. after archive, resolve current effective logical refs to unique archive target
```

Reader MUST NOT treat “historical produced ref no longer equals current canonical bytes” as conflict when and only when a
valid successor lineage proves that ref was legitimately superseded.

## Q1-RP-003 场景证明

必须覆盖真实序列：

```text
P0: schemaVersion 2 propose
  → proposal/design/specs/tasks refs = generation 0

R0: review-propose(P0)
  → changes-requested
  → exact inputRef binds P0 result.json

P1: revise-propose(sourceReview=R0)
  → 只改 proposal + design
  → produced tags = proposal, design
  → specs + tasks inherited from P0
  → completion verifies:
       new proposal/design refs match
       inherited specs/tasks still match
  → P0 becomes superseded; P1 becomes current

Reader before archive
  → P0 terminal/result/review lineage valid
  → P0 overwritten proposal/design refs are superseded, no false FactConflict
  → inherited P0 specs/tasks still participate in P1 effective set and MUST match
  → P1 current refs MUST match

R1: review-propose(P1)
  → approved

Archive
  → relocate final canonical Change dir without byte changes

Reader after archive
  → final P1 effective set resolves to unique archive path and matches hashes
  → P0 remains historical/superseded without terminal rewrite
  → review bindings remain exact
```

另加 negative case：

```text
P0 terminal
→ 没有 matching changes-requested review / revise window
→ proposal.md 被任意覆盖
→ P0 仍 current
→ Reader MUST FactConflict
```

## 不做

- 不改变 `Delivery > Change > Action` 产品层级；
- 不新增 Run 主状态；
- 不重写 D1 Policy 行为；
- 不实现完整 Change Runner；
- 不实现自动 review/revise 交互；
- 不实现 Full Test 调度器；
- 不实现 Quality Gate / Gate Registry；
- 不创建通用 completed Run editor；
- 不创建 per-Run OpenSpec artifact snapshot/history store；
- 不重写既有 A1–D1 terminal Runs。
