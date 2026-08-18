# Explore

## 1. Problem

D1 是 03 Delivery 第一次被授权形成正式 repository Architecture assets 的 Change。C1 已经冻结并实现 exact managed Archify runtime/CLI contract，但明确禁止在 C1 创建正式 `Current / Planned / Actual` Architecture；因此 D1 需要回答的不是“Archify 能不能画图”，而是：

1. 第一份可信 `Current/System Architecture` 如何只描述 03 Delivery Start 前的真实系统，而不被当前已执行 A1/B1/C1 的 working tree 污染；
2. 03 `Planned Architecture` 如何从原始 Delivery Start 计划事实重建，并保留 Bootstrap reconciliation provenance；
3. AI/human authored JSON、Archify validate/render/compare、Flowkit lifecycle 各自拥有什么 authority；
4. 当前 C1 Archify adapter 与 Change Verification 是否已经足以物理消费正式 Architecture JSON；
5. D1 应如何形成未来 Delivery 可复用的最薄路径/CLI/authoring boundary，而不引入 Architecture DB、Registry 或第二套 lifecycle engine。

结论先行：**D1 可以进入 Proposal，并且 D1 确实应开始形成真实 durable Architecture JSON；但只形成 `current.architecture.json` 与 `planned.architecture.json`。`actual.architecture.json` 必须留给 E1。**

## 2. Current Facts

### 2.1 Exact canonical Base / lifecycle

- detached canonical Base：`9d27efef586bcb3204647c78785c9c30a64be4a2`
- Git boundary：`chore(flowkit): checkpoint external-tool-runtime-and-archify-cli-contract`
- Delivery：`20260817-01-delivery-execution-loop`
- A1 / B1 / C1：`completed`
- D1 activation dependency：C1 checkpoint 已满足
- Owner activation fact：`owner:ebecb176e5ab8a64b703e9a7b83b8452a6ad86e390f80ca2be12a871bec1898e`
- Flowkit activation 后：`D1 active / stage=explore / doctor=ok`
- formal Explore Run：`20260818-045-explore`
- 046 Review：`changes-requested`，blocking finding `D1-RE-001`（author）；non-blocking `D1-RE-NB-001` 要求 Proposal 冻结 HTML Git hygiene

### 2.2 Exact architecture time boundaries

Git 证明：

```text
03 pre-Delivery baseline:
main @ 74d46f0920c0dfc6f19b5b264cf9de138f4c2bec

03 Delivery Start:
f132db761bd209e6aff72411108b8e3e1c9801f5

f132db7^ = 74d46f0

current D1 Base:
9d27efef586bcb3204647c78785c9c30a64be4a2
```

`74d46f0..9d27efe` 已有 224 个 path 发生变化，因此直接观察当前 03 branch 来反推 `Current` 会产生真实 temporal contamination risk。

### 2.3 C1 external-tool authority 已可用

在 disposable `FLOWKIT_HOME` 中安装 exact distributions：

```text
OpenSpec 1.7.0 npm tarball sha256
3e0bd044bf1fae1732f201fab7b5c1c8ceb4ef89bed9923f89a33cb4f0750afd

Archify 2.14.0 official archify.zip sha256
1b610a4d8ff5821cccd7a3dfe2d0943d11e64bda1d2fb0511944df190472f175
```

package identity 与 C1 static descriptors 一致；Archify doctor 通过 exact managed entrypoint 实际执行并报告 `Archify is ready.`。

### 2.4 旧 `archify-flowkit-review-v3-cn-104c14cc.zip`

该包自身明确声明：

```text
Reviewer preview base = 104c14cc...
不是 Formal Review Run
preview JSON 不直接声明为 repository authority
Current baseline = main @ 74d46f0
Actual 不生成
```

因此它是**高价值 D1 candidate / visual organization input**，但不是 D1 formal Current/Planned authority。D1 可以复用其信息组织、组件抽象与布局方向，但必须从 D1 自己的 authorized facts 重新 author / bind provenance。

## 3. Scope Boundary

### In scope

- `architecture/20260817-01-delivery-execution-loop/json/current.architecture.json`
- `architecture/20260817-01-delivery-execution-loop/json/planned.architecture.json`
- `architecture/<delivery-id>/html/**` 作为 disposable generated view 的路径/生成契约
- exact pre-03 Current baseline reconstruction
- 03 original Delivery Start Planned reconciliation
- AI/human authoring context / provenance boundary
- exact managed Archify repository-evidence validate/deliver binding
- `flowkit architecture render ...` 薄 CLI/service boundary
- D1 文档要求的 thin compare binding feasibility；compare 结果不取得 lifecycle authority
- future Delivery dynamic `<delivery-id>` path / normal Planned authoring boundary
- D1 mutation-surface + Change Verification physical closure
- repository `.gitignore` 的最小 derived-HTML ignore 规则作为 Proposal 待冻结的推荐 implementation choice，只用于 default-not-committed Git hygiene

### Out of scope

- `actual.architecture.json`
- Planned-vs-Actual lifecycle interpretation / promotion（E1）
- Accepted Actual → `SystemArchitectureRef` promotion（E1）
- per-Change architecture regeneration
- Architecture DB / Registry / freshness ledger
- Flowkit 自动推断完整 architecture JSON
- Archify schema/renderer reimplementation
- Archify compare 决定 Reviewer / Owner / Policy
- HTML 作为 durable authority
- `architecture/reference/**` 成为 D1 lifecycle 必需 authority

旧 preview 包中的 `architecture/reference/**` 可继续作为人类理解产品规则的非权威 projection/reference；但 v6 D1 formal acceptance 不依赖它，本 Change 不应把它提升成第二份 Policy/OpenSpec authority或 mandatory lifecycle asset。

## 4. Risk Scan

| Risk | yes/no | Why |
|---|---|---|
| Scope expansion / missing prerequisite | yes | C1 runtime 已完成，但 D1 formal repository-evidence 调用暴露 `--repo-root` adapter seam 缺口 |
| Cross-time facts | yes | Current=74d46f0；Planned provenance=03 Start f132db7；当前 Base=9d27efe，三者不可混用 |
| Schema / persistence migration | yes | 首次新增 repository `architecture/<delivery-id>/json/**` durable source；必须避免新 DB/Registry |
| Self-hosting / writer changes itself | low | D1 不切换 Run writer；但产物必须跨 D1 checkpoint 持续被 E1/G1 消费 |
| Authority duplication | yes | Git / Delivery Manifest/OpenSpec / AI-human / Archify / Flowkit 必须分权 |
| Generic reusable subsystem | yes | 路径与 render/compare wrapper 必须适用于 future Delivery，不能硬编码 03 id/SHA |
| Activation must persist across Change/Delivery boundaries | yes | D1 JSON 在 checkpoint 后必须成为 E1 的同一 durable assets；future Delivery 需正常形成自己的 Current/Planned |
| Candidate/formal-fact mutation affects existing consumers | yes | CLI、Archify adapter、verification mapping、new architecture files/tests 都进入 mutation surface |
| Verification selection must reach actual executed targets | yes | 当前 module map 对 `architecture/**` 与 D1 tests 是 unowned，formal selection 会 fail |
| External tool performs real mutation | yes | Archify deliver/compare 会写 HTML/receipt；JSON 仍由 AI/human author，不由 Archify生成 authority |
| Change claims performance improvement | no | D1 不声明性能优化 |

## 5. Applicable Proofs

### Proof A — Scope / prerequisite / activation proof

**Question**
当前是否已经具备合法进入 D1 的前置边界？

**Acceptance Boundary**
C1 completed + checkpointed；没有 active Change；Policy 唯一允许激活 D1；exact managed OpenSpec/Archify 可用。

**Method**

- 校验 Git Base / checkpoint topology；
- 运行 Flowkit `next` / `doctor`；
- Owner 明确授权后执行正式 `activate --change architecture-baseline-and-delivery-plan --spec-delta-mode required`；
- 使用 C1 exact managed tool home 重新读取正式状态。

**Evidence**

```text
before activation:
next = owner-decision activate-change
context-change = D1
doctor = ok / 0 findings

after activation:
change = D1 architecture-baseline-and-delivery-plan
stage = explore
next = explore
doctor = ok / 0 findings
```

**Evidence Boundary**
D1 formal Explore entry。

**Gap**
无。

**Result: PASS**

**Implication**
D1 不需要补做 C1 或额外 Bootstrap Change。

---

### Proof B — Temporal + Current baseline authority proof

**Question**
第一份 Current Architecture 是否可以可靠绑定到真正的 pre-03 system，而不是当前 03 branch？

**Acceptance Boundary**
Current 必须来自 `main @ 74d46f0` exact repository、accepted 02 facts/specs；03 A/B/C working tree 不得污染。

**Method**

1. 建立 detached worktree `@74d46f0`；
2. 证明 `f132db7^ == 74d46f0`；
3. 检查 preview Current 的 9 个 repository source paths 均在 `74d46f0` 存在；
4. 将 preview Current 仅作为 draft，去除 `Reviewer Preview` 文案并重新绑定 `meta.repository.revision=74d46f0`；
5. 使用 exact managed Archify + `--repo-root` 真实 validate/deliver。

**Evidence**

```text
Current repository evidence:
revision = 74d46f0920c0dfc6f19b5b264cf9de138f4c2bec
references = 9
validate checks = 9/9
errors = 0
warnings = 0

regenerated current.html sha256:
e6c5fda9e14c9fddcdc2af9ec1b32df9d33fdebf790b11629160311bfb6024a7
```

删除 HTML 后用同一 JSON + exact Archify 再次 deliver，HTML SHA256 完全相同。

**Evidence Boundary**
足以证明正式 Current JSON 可以由 pre-03 exact Git facts author 并被 revision-pinned Archify evidence 验证。

**Gap**
正式 JSON bytes 仍应在 D1 Apply 中重新冻结/Review；Explore proof candidate 不是 authority。

**Result: PASS**

**Implication**
正式 `current.architecture.json` 必须固定 `74d46f0` provenance；不得使用 `9d27efe` 或 D1 执行时 working tree 作为“Current”。

---

### Proof C — 03 Planned bootstrap reconciliation / provenance proof

**Question**
03 Planned Architecture 应绑定什么正式时间点，旧 preview 的 `104c14cc` 是否可以直接成为 Planned provenance？

**Acceptance Boundary**
Planned 必须表达 03 Delivery 原始计划，而不是 A/B/C 已实施后的中间状态；必须保留原始 Delivery Start provenance。

**Method**

1. 从 Git 读取原始 Delivery Start commit `f132db7...`；
2. 读取 `f132db7:openspec/delivery-groups/20260817-01-delivery-execution-loop.yaml`；
3. 确认该 Start Manifest 已冻结 A1→H1、architecture impact、External Tool、Current/Planned/Actual、Full Test、Finalize、resume/self-hosting 等 03 计划；
4. 将旧 preview Planned 作为 draft，去除 `Reviewer Preview` 文案，将 repository planning provenance 改为 `f132db7...`，并让 03 新增/调整组件显式 source 到原始 Delivery Start Manifest；
5. exact managed Archify + `--repo-root` validate/deliver。

**Evidence**

旧 preview：

```text
meta.repository.revision = 104c14cc...
```

该值只能说明 preview 当时的 reviewer base，不能作为正式 03 Planned planning boundary。

Disposable formal-shaped candidate：

```text
Planned repository evidence:
revision = f132db761bd209e6aff72411108b8e3e1c9801f5
references = 14
validate checks = 9/9
errors = 0
warnings = 0

regenerated planned.html sha256:
799042e50841fcb4c98b723c5a666f457e399b16dc3ac820150142aaadc89958
```

第二次 deliver SHA256 相同。

**Evidence Boundary**
03 bootstrap Planned reconciliation。

**Gap**
正式 Planned component wording/layout/source set 仍由 D1 Proposal/Apply 从原始 Start facts 冻结；proof candidate 不自动成为 authority。

**Result: PASS**

**Implication**
D1 应保留“旧 preview 结构可复用、provenance 必须重建”的边界：

```text
Current provenance = 74d46f0
Planned bootstrap provenance = f132db7 Delivery Start
D1 implementation Base = 9d27efe
```

三者不得混成一个 revision。

---

### Proof D — Authority proof

**Question**
正式 Architecture facts 的 authority 如何分配，是否需要 Architecture DB/Registry？

**Acceptance Boundary**
One fact, one authority；Flowkit 不成为第二 Archify/Git/OpenSpec engine。

**Method**
对 D1 输入/输出逐项分权。

**Evidence / frozen boundary**

```text
Git exact revision + repository bytes
→ Current 真实代码事实 / source evidence

03 Delivery Start Manifest + accepted Delivery/OpenSpec contract
→ Planned intent / scope provenance

AI / human Author
→ 根据上述 facts author typed Architecture JSON

Archify exact managed CLI
→ validate / deliver / compare typed JSON
→ 不 author Flowkit architecture truth
→ 不决定 lifecycle acceptance

architecture/<delivery-id>/json/**
→ durable repository architecture source

architecture/<delivery-id>/html/**
→ disposable derived view
→ missing/stale 不产生 lifecycle blocker

Flowkit
→ 决定何时需要这些 assets、解析固定路径、调用 exact Archify、消费 bounded result/ref
```

不需要：

```text
Architecture Registry
architecture database
HTML freshness ledger
receipt database
per-Change architecture state machine
```

**Evidence Boundary**
D1 + E1 authority split。

**Gap**
E1 才能定义 Actual compare interpretation / accepted Actual promotion。

**Result: PASS**

---

### Proof E — Formal repository-evidence invocation proof

**Question**
C1 现有 `ArchifyCliAdapter` 是否可直接消费 D1 formal Current/Planned JSON？

**Acceptance Boundary**
带 `meta.repository` + component `sources` 的正式 architecture JSON 必须通过 exact managed Archify 的 repository evidence validation。

**Method**

- 使用现有 `ArchifyCliAdapter.validate('architecture', formal-shaped-current)`；
- 对照 exact managed Archify CLI 直接执行同一 JSON，并显式传 `--repo-root`。

**Evidence**

现有 Adapter：

```text
EXPECTED_FAIL
ARCHIFY_OPERATION_FAILED
Archify validate architecture exited 1
```

底层 Archify 明确诊断：

```text
repository-evidence/root-required
This diagram declares source evidence.
Pass --repo-root <repository> so Archify can verify it before rendering.
```

exact managed CLI + `--repo-root`：

```text
Current 9/9 PASS, evidence verified @ 74d46f0
Planned 9/9 PASS, evidence verified @ f132db7
```

**Evidence Boundary**
正式 D1 JSON physical validation/render invocation。

**Gap**
C1 adapter 需要一个**bounded explicit repository-evidence seam**。不得通过 Flowkit 自己读取/重实现 Archify schema 来猜是否需要 `--repo-root`。

**Result: PASS（feasibility proven；implementation required in D1）**

**Implication**
Proposal mutation surface MUST 包含 Archify adapter/architecture service 相关最小扩展，使 D1 formal validate/deliver/compare 可以显式传 exact repository root，同时保持 C1 synthetic no-repo-evidence fixtures 可继续工作。

---

### Proof F — External mutation / derived HTML / compare feasibility proof

**Question**
JSON durable + HTML disposable 模型是否可物理成立，thin compare binding 是否可行？

**Acceptance Boundary**

- 同一 JSON + exact Archify 可以重建同一 HTML；
- compare 由 Archify 执行并返回 structured result；
- compare 事实不决定 Flowkit lifecycle；
- D1 不创建 Actual。

**Method**

- 对 Current/Planned proof candidate 各执行两次 deliver，中间删除 HTML；
- direct exact managed Archify 执行 `compare architecture current planned ... --repo-root` 只作为 wrapper feasibility proof。

**Evidence**

```text
Current HTML deterministic sha256 = e6c5fda9...
Planned HTML deterministic sha256 = 799042e5...

compare:
ok = true
command = compare
type = architecture
proofLevel = revision-pinned
base revision = 74d46f0
head revision = f132db7
```

这里的 Current→Planned compare **不是 D1 lifecycle authority，也不是要求提交 delta.html**；它只证明 D1/E1 所需 thin compare adapter 可以走 exact managed Archify + repository evidence。

**Evidence Boundary**
render/compare physical feasibility。

**Gap**
Planned-vs-Actual 正式 compare、drift interpretation、Owner acceptance 留给 E1。

**Result: PASS**

---

### Proof G — Genericity / next-consumer / activation persistence proof

**Question**
D1 是否会被写死成只适用于 03 Bootstrap？D1 产物能否跨 checkpoint 被 E1 和一个真正不同的 future Delivery 消费？

**Acceptance Boundary**

```text
D1 checkpoint
→ E1 consumes same Current/Planned durable JSON
→ G1 resume can later read architecture refs/status

future Delivery (different deliveryId)
→ previous accepted Actual + Git baseline
→ that Delivery's own Start facts
→ dynamic architecture/<future-delivery-id>/... paths
→ Current/Planned repository provenance derived from those facts
→ exact managed Archify repository-evidence validate/render
```

**Method**

在 disposable full-history Git repo 中执行一个 future-Delivery-shaped prototype，而不是只做路径文案推理：

1. 从当前 exact committed seed `9d27efef586bcb3204647c78785c9c30a64be4a2` 创建 synthetic prior Delivery `20981231-01-prior-system` 的 accepted Actual asset，并形成独立 prior accepted commit；
2. 创建与 03 完全不同的 synthetic future Delivery `20990101-01-future-self-hosted-proof`，写入该 Delivery 自己的 Start manifest，再形成独立 Delivery Start commit；
3. prototype 只消费 future-shaped facts：
   - `deliveryId`；
   - previous `acceptedActualRef + gitRevision`；
   - current Delivery `manifestRef + start gitRevision`；
4. generic resolver 由这些 facts 派生 Current/Planned JSON/HTML 路径与 repository provenance；
5. 对 prototype 派生结果执行 forbidden-constant assertion，要求 generic result 不出现 `20260817-01-delivery-execution-loop`、`74d46f0...`、`f132db7...`；
6. 将 future Current/Planned 写入派生路径，并使用 C1 exact managed `archify@2.14.0` + explicit `--repo-root` 分别执行 `validate architecture` 与 `deliver architecture`。

**Evidence**

Synthetic future facts / commits：

```text
seed Base:
9d27efef586bcb3204647c78785c9c30a64be4a2

prior accepted architecture commit:
e107dec75a3812558a1d38a94fcd5d1e85958cc7

prior accepted Actual ref:
architecture/20981231-01-prior-system/json/actual.architecture.json

future Delivery:
20990101-01-future-self-hosted-proof

future Delivery Start commit:
084e7a38078f532630c5d947b8f87b25ffbc07c0

future Delivery Start manifest:
openspec/delivery-groups/20990101-01-future-self-hosted-proof.yaml
```

Prototype 派生结果：

```text
Current path:
architecture/20990101-01-future-self-hosted-proof/json/current.architecture.json

Planned path:
architecture/20990101-01-future-self-hosted-proof/json/planned.architecture.json

Current provenance:
acceptedActualRef = architecture/20981231-01-prior-system/json/actual.architecture.json
repository revision = e107dec75a3812558a1d38a94fcd5d1e85958cc7

Planned provenance:
manifestRef = openspec/delivery-groups/20990101-01-future-self-hosted-proof.yaml
repository revision = 084e7a38078f532630c5d947b8f87b25ffbc07c0
```

Generic result forbidden-constant assertion：

```text
20260817-01-delivery-execution-loop  absent
74d46f0920c0dfc6f19b5b264cf9de138f4c2bec absent
f132db761bd209e6aff72411108b8e3e1c9801f5 absent
```

Exact managed Archify next-consumer execution：

```text
future Current validate  = PASS / ok=true
future Current deliver   = PASS / ok=true
future Planned validate  = PASS / ok=true
future Planned deliver   = PASS / ok=true

current.html sha256:
f9479628f150f336a8d465b64a18d9d22adf2cf2a49b7ea92c375e8eba32731e

planned.html sha256:
87248cc4f47df173beeff98ecce55a0a96c0fbb1900c954131c620d4b2f3353
```

这证明 future Delivery 的 Current provenance 来自**previous accepted architecture + prior Git baseline**，Planned provenance 来自**该 Delivery 自己的 Start facts**；03 Bootstrap 的 `74d46f0/f132db7` 只属于 03 formal asset，不需要出现在 generic resolver/service behavior。

**Evidence Boundary**
已覆盖一个 different-deliveryId 的 disposable next-consumer：future formal facts → generic path/provenance derivation → exact managed Archify repository-evidence validate/render。Evidence Boundary 达到 D1 v6 所要求的“future Delivery can form Planned without Bootstrap exception” feasibility boundary。

**Gap**
Accepted Actual → next `SystemArchitectureRef` 的正式 promotion、真实 post-03 merged main 与 next Delivery Current binding 仍由 E1/后续真实 self-hosted Delivery 形成；本 proof 只证明 D1 generic path/provenance/render contract 不依赖 03 constants，不伪造未来真实 repository facts。

**Result: PASS**

**Implication**
Proposal 必须把 03-only bootstrap constants 限定在 03 asset authoring/provenance；generic architecture path/service 必须只消费 formal delivery identity、previous accepted architecture/Git baseline 与该 Delivery Start facts。不得引入 Architecture Registry/DB 或自动 architecture inference 来“解决”跨 Delivery provenance。

---

### Proof H — Mutation Surface + Change Verification closure proof

**Question**
如果 D1 按 v6 直接增加正式 Architecture JSON、CLI/service/tests，现有 Change Verification 能否物理覆盖 actual changed paths？

**Acceptance Boundary**

```text
actualChangeSet
→ exactly one owned verification module per path
→ logical check selection
→ physical target resolver
→ D1 architecture targets actually execute
```

**Method**

对 hypothetical D1 paths 调用当前 `selectAffectedVerificationModules()`：

```text
architecture/20260817-01-delivery-execution-loop/json/current.architecture.json
src/integrations/archify/archify-cli-adapter.ts
src/cli/main.ts
tests/integration/d1-architecture-baseline-and-delivery-plan.test.ts
```

**Evidence**

已有 paths：

```text
src/integrations/archify/archify-cli-adapter.ts
→ external-tools
→ tests-external-tools + downstream checks

src/cli/main.ts
→ cli-diagnostics
→ tests-cli + typecheck
```

但新 D1 paths 当前会 fail closed：

```text
architecture/.../current.architecture.json
→ VERIFICATION_MODULE_SELECTION_FAILED

new D1 architecture integration test path
→ VERIFICATION_MODULE_SELECTION_FAILED
```

因此 D1 若不修改 verification ownership/physical resolver，正式 Apply 一定无法形成合法 Change Verification。

**Evidence Boundary**
Proposal mutation-surface feasibility。

**Gap**
Proposal 必须冻结一个最小、source-controlled architecture ownership/check path，并在 Apply 用 selected-target enumeration/sentinel 证明 D1 JSON + tests 被真实执行。不得用 `npm test` 全量 PASS 替代 formal selection closure。

**Result: PASS（gap 已被精确界定；physical PASS deferred to Apply）**

**Implication**
D1 Proposal MUST 把下列内容视为同一 required mutation surface，而不是后期补丁：

```text
formal architecture JSON paths
architecture service/path resolver
Archify repository-evidence seam
CLI render/compare binding
D1 architecture tests
Verification module-map / evidence resolver needed to own and physically execute them
OpenSpec D1 specs/tasks/verification publication
```

---

### Proof I — Performance proof

D1 不声称 latency/process-count 优化。

**Result: NOT APPLICABLE**

## 6. Rejected Approaches

### 6.1 直接把 `archify-flowkit-review-v3-cn-104c14cc.zip` 中 JSON 原样提交为 formal D1 assets

拒绝原因：

- 包自身声明是 Reviewer Preview，不是 authority；
- Current/Planned subtitle 仍带 preview 语义；
- Planned `meta.repository.revision=104c14cc...` 是 preview execution base，不是原始 Delivery Start planning provenance；
- D1 contract 要求从自己的 authorized repository facts 重新 author real formal JSON。

### 6.2 使用当前 `9d27efe` working tree 生成 Current

拒绝原因：

- 03 已实施 A1/B1/C1；
- `74d46f0..9d27efe` 有大量真实变化；
- 会把 03 过程中的未来事实伪装成 Delivery Start Current。

### 6.3 让 Flowkit 解析 Archify JSON 来决定是否传 `--repo-root`

拒绝原因：

- 形成第二份 Archify schema knowledge；
- 违反 thin external authority boundary。

应使用 explicit/bounded invocation seam，由 D1 formal architecture operation 明确要求 repository evidence。

### 6.4 把 HTML / validate receipt 提升为 durable architecture truth

拒绝原因：

- C1 已冻结 JSON source vs generated output boundary；
- HTML 可删除/重建；
- receipt 是工具 evidence，不是 generic Evidence DB。

### 6.5 D1 直接创建 Actual 或做 Planned-vs-Actual lifecycle acceptance

拒绝原因：

- final repository 尚不存在；
- Actual/E1 必须独立观察 final candidate；
- 提前创建 Actual 会伪造未来事实。

### 6.6 不修改 Verification mapping，依赖 Full Test / 全量 npm test 兜底

拒绝原因：

- `architecture/**` 当前 formal selection 已实证 fail closed；
- full repository PASS 不能替代 changed target 的 physical selection closure。

## 7. Feasible Proposal Boundary

D1 可以进入 Proposal。Proposal 应冻结以下最小实现边界：

1. **真实 durable JSON 开始于 D1**

```text
architecture/20260817-01-delivery-execution-loop/json/current.architecture.json
architecture/20260817-01-delivery-execution-loop/json/planned.architecture.json
```

不创建：

```text
actual.architecture.json
```

2. **Current**

- 从 exact `main @ 74d46f0` + accepted 02 facts/specs 重新 author；
- 可以复用旧 preview 的组件组织/布局作为 draft；
- formal JSON 必须去掉 Reviewer Preview 身份；
- repository evidence 必须 revision-pin `74d46f0`。

3. **Planned**

- 从原始 03 Delivery Start `f132db7` Manifest/goal/scope/planned Changes author；
- 不使用当前 9d branch 或 104c preview base 作为 planning authority；
- 可以复用旧 preview 视觉/组件结构，但必须重建 provenance/source evidence；
- 只描述 planned target，不把尚未实现能力写成 Current fact。

4. **JSON / HTML / Git hygiene**

```text
json/** = Git-tracked durable source
html/** = local generated view, default not committed, safe to delete/rebuild
```

Proposal 应冻结最薄的 HTML default-not-committed Git hygiene mechanism。推荐 implementation choice 是在 repository `.gitignore` 增加只覆盖 generated HTML 目录的规则（例如 `architecture/*/html/` 或等价最小表达），使正常 render 产生的 HTML 默认不进入 Git boundary；也可以采用满足同一 contract 的等价最薄机制。该选择不得忽略 `architecture/*/json/**`，也不得建立 HTML freshness ledger。

5. **thin Archify binding**

- 保持 exact managed `archify@2.14.0`；
- 为 formal repository-evidence architecture operation 增加显式 `--repo-root` seam；
- 不 import Archify internal modules；
- 不复制 schema；
- `flowkit architecture render current|planned` 必须物理调用 exact managed Archify；
- compare wrapper 只做 mechanical mapping，不决定 lifecycle。

6. **Genericity**

- generic resolver 使用 active `deliveryId`，不得硬编码 `20260817-01...`；
- `74d46f0/f132db7` 只能存在于 03 formal asset/provenance；
- future Delivery 可建立自己的 `architecture/<delivery-id>/...`。

7. **Verification physical closure / mutation surface**

- Proposal 必须把 `architecture/**`、`.gitignore`、D1 architecture tests、architecture service/CLI、Archify seam 所需 verification ownership/resolver 更新纳入 approved mutation scope；
- Apply 必须证明 selected logical check 真实执行 D1 Architecture JSON validate/render path 与 D1 regression targets。

8. **Anti-overdesign**

不引入：

```text
Architecture Registry
Architecture DB
HTML freshness state
generic Evidence platform
per-Change architecture lifecycle
AI automatic architecture inference engine
new Formal Change Action
```

## 8. Open Decisions

046 blocking finding `D1-RE-001` 已由本轮 future-Delivery-shaped next-consumer proof author-side closing evidence 覆盖，等待 Reviewer convergence。

HTML default-not-committed hygiene 不需要新的 Owner lifecycle authorization：它属于 D1 既有 JSON durable / HTML disposable contract 下由 Proposal 待冻结的最薄 implementation choice。`.gitignore` 可以作为推荐方案，但不得把 Reviewer/Author prose 转写成 Owner authority。当前没有 Owner blocker 阻止进入 Proposal。

Proposal 可以在既有 v6 contract 内冻结以下实现细节：

- formal Current/Planned 的最终组件文案、source references 与 layout；
- explicit repository-evidence seam 的 method/service shape；
- `flowkit architecture render/compare` 的最薄 CLI 参数形式；
- architecture verification ownership/check 的最小 source-controlled mapping。

以下事项不应在 D1 Proposal 中重新讨论：

```text
Current = exact pre-03 74d46f0
03 Planned bootstrap provenance = original Delivery Start f132db7
JSON durable / HTML disposable
Actual = E1
Archify external authority
no Registry / DB / second lifecycle engine
```
