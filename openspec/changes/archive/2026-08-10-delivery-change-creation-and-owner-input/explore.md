# A1 — Delivery / Change Creation and Owner Input Explore

## 1. Explore 身份与边界

```text
Delivery: 20260810-01-change-execution-loop
Change: A1 delivery-change-creation-and-owner-input
Action: explore
Run: 20260810-016-explore
Role: Author
Execution Context: detached
GitHub Base: 448fa042de86d07e893bcc51da528f93eb7ced3a
```

Owner 当前明确授权：

```text
A1 activation
+ 开始 Explore A1
```

本 Explore 只调查并冻结 A1 Proposal 必须解决的问题，不实现 production code、tests、CLI write command 或正式 owner-decision persistence。

允许的 Bootstrap mutation 仅为：

```text
A1 planned → active
create OpenSpec A1 metadata
create/complete 016-explore Run
write explore.md
```

禁止：

```text
Proposal / Design / delta specs / Tasks
production implementation
test implementation
Delivery Full Test
Archive / Checkpoint
Commit / Push
A1 后续 Action
```

---

## 2. canonical 起点：detached checkpoint observation gap 与真实 dependency identity drift

GitHub exact Base `448fa042de86d07e893bcc51da528f93eb7ced3a` 是：

```text
chore(flowkit): checkpoint core-contract-alignment
Flowkit-Delivery: 20260810-01-change-execution-loop
Flowkit-Change: core-contract-alignment
Flowkit-Boundary: change-checkpoint
```

因此 canonical Git authority 已证明：

```text
Q1 completed
+ Q1 Change Checkpoint exists
```

Delivery Manifest 基础事实：

```text
Delivery active
Q1 completed
A1 planned（Owner 本次授权前）
A1 dependsOn core-contract-alignment
```

上传的 repository ZIP 不包含 `.git`。当前 GitBoundaryReader 只通过 `git log --all` 读取正式 Git boundary，所以在 detached ZIP 上当前 Flowkit 仍表现为：

```text
flowkit next
→ owner-decision: authorize-checkpoint
→ change = Q1
```

这不是 canonical GitHub 上缺 checkpoint，而是 detached transport 无法观察 Git history：

```text
GitHub exact Base 448fa042...
→ Q1 Checkpoint exists                 [Git authority]

repository ZIP
→ no .git
→ local GitBoundaryReader sees no checkpoint
```

本次由 Owner 明确授权 Bootstrap activation A1。A1 MUST NOT 因此扩张为 remote GitHub checkpoint oracle、ZIP Git history store 或第二套 checkpoint state。

但 `.git` 缺失不是 A1 当前无法由产品自然推进的唯一原因。对 exact checkpoint Base 的 canonical Manifest / Policy contract 做进一步核对后，确认还存在第二层、与 Git transport 无关的真实 dependency identity drift：

```text
Delivery Manifest:
Q1.key = Q1
Q1.id  = core-contract-alignment

A1.dependsOn:
  - core-contract-alignment      # persisted Change.id

current Policy dependenciesMet():
change.dependsOn.every((depKey) =>
  snapshot.changes.some(
    (c) => c.key === depKey && c.state === 'completed'
  )
)
                  ^ compares Change.key
```

因此即使 Git authority 已经证明：

```text
Q1 completed
+ Q1 Change Checkpoint exists
```

当前 dependency resolution 仍会把：

```text
A1.dependsOn = core-contract-alignment
```

与：

```text
Q1.key = Q1
```

比较，得到 false，进而错误报告：

```text
dependency-incomplete
```

同时 `tests/unit/policy/next.test.ts` 的 dependency fixtures 使用 `Q1 / Q2` 等 Change.key 作为 `dependsOn`，与真实 Delivery Manifest 持续使用 Change.id 的 persisted shape 不一致。

这是真实 product contract drift，直接属于 A1 的：

```text
Change dependency contract
create-Change validation
planned → active dependency precondition
diagnostic projection
```

Owner 已明确决定不新增 corrective Q2，而由 A1 收敛此问题。Explore 只确认 identity mismatch；**不在本阶段决定唯一 identity 必须是 `Change.id` 还是 `Change.key`**。Proposal 必须基于 repo-wide canonical evidence 冻结唯一依赖 identity，并同步 Reader / Policy / creation validation / diagnostics / tests。

---

## 3. A1 产品目标

02 Implementation Reference 要求 A1 实现：

```text
create delivery
create change
record explicit Owner decision / authorization
activate change
```

Owner authority 必须来自 Owner 独立明确输入。

最小 provenance 至少需要：

```text
decision scope
decision value / authorization
applicable Delivery / Change
source reference
```

明确不建立：

```text
Approval Registry
Decision Database
workflow inbox
```

Change activation 只有在：

```text
Delivery active
no other active Change
dependencies completed
Owner authorize activation
formal facts consistent
```

时才能 `planned → active`。

A1 不自动 Commit / Push / PR / Full Test / Archify。

---

## 4. 当前已有能力

### 4.1 Domain 状态已存在

当前已经有：

```text
DeliveryState = active | completed | cancelled
ChangeState = planned | active | completed | cancelled
Delivery / Change / ChangeSummary / OwnerAuthorizationRef
```

结构转换已经允许：

```text
planned → active | cancelled
active  → completed | cancelled
```

A1 不需要增加新的主状态。

### 4.2 Policy 已能计算 activation boundary

当前 `next()` 在 no-active-change + planned required Change + dependencies completed 时返回：

```text
kind: owner-decision
decision: activate-change
context:
  changeKey
  eligibleChangeKeys
```

所以 A1 不应建立第二套 activation decision engine。正确关系仍是：

```text
Formal Facts → Policy → owner-decision: activate-change
```

A1 要补的是 Owner fact ingestion 与安全 mutation。

### 4.3 Reader 已读取 Manifest lifecycle facts

当前 Reader 已从 Delivery Manifest 投影 Delivery state/fullTestStatus 与 Change key/id/state/required/dependsOn/outputs。

因此 Delivery Manifest 应继续承担 Delivery/Change lifecycle projection authority，不建立第二份 Change state store。

### 4.4 已有 single-file atomic write primitive

`src/shared/atomic-write.ts` 已有 temp-file → rename 模式，可复用，但它只解决单文件发布，不自动解决 activation 的多文件一致性。

---

## 5. Confirmed Gap A1-G1 — 没有 Delivery / Change creation write-side

当前 CLI 只有：

```text
status
next
doctor
resume-context
```

全部 read-only。

当前 persistence 主要拥有 Run create/complete/result/ref，没有：

```text
createDelivery
createChange
recordOwnerDecision
activateChange
```

也没有 Delivery Manifest writer/mutator。

当前产品能读取人工创建的 Manifest，却不能自己安全创建同样的正式事实。

---

## 6. Confirmed Gap A1-G2 — Owner authorization projection 固定为空

`FormalFactReader` 当前实现等价于：

```ts
function collectOwnerAuthorizations(runs) {
  void runs;
  return [];
}
```

所以 `FormalFactSnapshot.ownerAuthorizations` 没有真实 authority source。

Policy 已消费 apply/archive/full-test/finalize authorization scope，但 Reader 永远投影为空。A1 必须补 Owner input → formal provenance → Reader projection。

---

## 7. Confirmed Gap A1-G3 — Run `ownerAuthorization` 不是 Owner authority

当前 schemaVersion 2 `context.json` 要求：

```text
ownerAuthorization: string
```

Bootstrap 常见值：

```text
explicit
not-required
```

但它没有 typed scope/value/applicability/sourceRef，也没有被 Reader 投影成 OwnerAuthorizationFact。

canonical docs 又明确 Run 中 owner authorization 只是引用，不是完整 authority 副本。

因此 A1 MUST NOT 使用：

```text
context.ownerAuthorization == "explicit"
→ 自动创造正式 Owner authorization
```

正确方向必须是：

```text
Owner independent input
→ formal minimal provenance record
→ Reader projects fact
→ Run / Action Package may reference it
```

---

## 8. Confirmed Gap A1-G4 — OwnerAuthorizationFact applicability 不足

当前 OwnerAuthorizationFact 只有：

```text
ref
scope
```

`hasAuthorizationScope()` 只判断任何 record 是否 scope 相等。

如果 A1 直接读取 Delivery 全历史 owner records，会有 cross-Change authority leakage：

```text
A1 apply auth → accidentally authorizes B1 apply
old archive auth → accidentally authorizes new Change archive
```

02 reference 已要求 provenance 有 applicable Delivery / Change，因此 Proposal 必须冻结 Owner fact record、Reader projection 与 Policy filtering 的 applicability contract。

---

## 9. Confirmed Gap A1-G5 — activation 有 Policy，没有 mutation executor

当前系统知道 planned Change 是否 eligible，但没有正式 operation 将：

```text
Owner activation decision
+ eligible Change
```

机械变成：

```text
Manifest planned → active
```

A1 必须保持：

```text
Policy decides legality
Owner supplies authority/selection
activation operation performs mutation
```

Activation operation 不成为第二 Policy。

---

## 10. Confirmed Gap A1-G6 — activation 是多文件一致性边界

Bootstrap reference 把 activation 表达为：

```text
Manifest planned → active
+ create OpenSpec .openspec.yaml
```

A1 又需要 Owner provenance。因此实际至少涉及：

```text
Owner provenance
OpenSpec Change metadata
Delivery Manifest
```

单个 atomicWriteFile 不足以提供跨文件 transaction。

Proposal 必须冻结 preflight、operation ordering、failure behavior、idempotent retry 和 partial-state diagnosis；不能引入 transaction DB / journal platform。

尤其应避免：

```text
Manifest active
BUT OpenSpec Change root missing
```

---

## 11. Confirmed Gap A1-G7 — Manifest 只有 Reader，没有 Writer contract

当前有 hand-written minimal YAML parser，但没有 canonical Manifest serializer/updater。

Manifest 还包含 goal、technicalBaseline、scope、architecture、verification、acceptance 等大量非 A1-owned 字段。

A1 writer 必须满足：

```text
validate current authority
only mutate owned fields
preserve unrelated semantics
atomic publish
fail closed on malformed/ambiguous input
no duplicate keys
```

Proposal 必须冻结 writer strategy，而不是 Apply 临时用 brittle string patch。

---

## 12. Confirmed Gap A1-G8 — creation input runtime validation 尚不存在

当前 schema-validator 主要验证 state/Run/ResultRef，没有完整 create/owner/activation DTO validator。

A1 至少需要考虑：

```text
Delivery id / branch / goal / scope
architectureImpact
Full Test Plan declaration/status

Change key / id / goal / dependsOn / outputs
architectureImpact / required / state=planned

Owner record scope/value/applicability/sourceRef
```

还要处理：

```text
Delivery id uniqueness
Change key uniqueness
Change id uniqueness
canonical dependency identity
unknown dependency
self dependency
duplicate dependency
```

这里已经存在一个真实 regression：Manifest `dependsOn` 当前保存 Change.id，而 Policy 按 Change.key resolve；因此 `unknown dependency` / `self dependency` / `duplicate dependency` 等 validation 在 Proposal 前不能继续隐含使用未冻结的 identity。

最终校验集合与 dependency identity 必须由 Proposal 基于 repo-wide canonical evidence 一并冻结。

---

## 13. Confirmed Gap A1-G9 — create Delivery 生命周期语义未机器化

Delivery 没有 planned 状态，只有 active/completed/cancelled。

因此 `create delivery` 必须回答：

```text
创建时是否直接 active？
如何确保 one active Delivery？
与 Git Delivery Start boundary 如何分离？
```

02 同时明确 create delivery 不自动 Commit / Push / PR。

Proposal 必须把 logical Delivery creation 与 Git Delivery Start boundary 分离，不能偷做 branch/commit/push。

---

## 14. Confirmed Gap A1-G10 — create Change 的 Owner authority 尚需冻结

Change creation 会改变 Delivery scope。Owner 又拥有 Delivery scope authority。

同时 03 corrective Change 路径明确需要 Owner authorize corrective Change。

Proposal 必须统一普通 planned Change creation 与 corrective Change creation 的 Owner provenance要求，不能让 Agent 因为有 create API 就自行扩张 Delivery scope。

---

## 15. Confirmed Gap A1-G11 — 多 eligible Change 的 target selection

Policy 的 eligibleChangesToActivate() 可返回多个 Change；`next()` 同时给出 `eligibleChangeKeys` 与一个 `changeKey`。

Proposal 必须冻结：

```text
Owner 是否必须显式指定 target Change
activation API 如何验证 target ∈ eligibleChangeKeys
多个 eligible Change 是否允许 Owner 选择任一个
```

不得把数组顺序偷换成 Owner selection。

---

## 16. Confirmed Gap A1-G12 — Owner provenance 的 assurance limit

Flowkit 当前没有登录、签名、Owner identity provider 或 approval service。

A1 能可靠保证的是：

```text
record only enters through explicit Owner-ingestion boundary
typed scope/value/applicability/sourceRef
source-controlled recovery
Policy does not infer authorization from prose
```

A1 不能声称 cryptographically proves caller identity。Proposal 必须明确 structural provenance 与 identity authentication 的边界；后者不在 02 scope。

---

## 17. Confirmed Gap A1-G13 — Owner decision 与 authorization vocabulary

现有 Policy vocabulary 包括：

```text
activate-change
authorize-checkpoint
authorize-apply
authorize-archive
authorize-full-test
authorize-delivery-finalize
```

其中 activation 是 selection/decision，apply/archive 更像 authorization。未来还有 corrective Change / cancel / scope reset。

如果 A1 只做 scope 字符串，无法表达 activation target；如果做无限 generic payload，又容易形成 Decision Database。

Proposal 必须冻结最小 typed vocabulary，只覆盖明确需要的 Owner facts。

---

## 18. Confirmed Gap A1-G14 — A1 不得反向破坏 Q1 non-author blocker contract

Q1 已冻结：

```text
matching changes-requested + any non-author blocker
→ Author revise prohibited
→ next() blocked
→ explicit same-stage re-review allowed
```

A1 引入 Owner facts 后不得自动变成 generic owner-blocker resolution tracker，不得 Owner record 出现就自动 close Finding / schedule re-review。

Owner records 只是 authority facts；D1 Finding convergence 仍后置。

---

## 19. Confirmed Gap A1-G15 — write CLI 与 diagnostic CLI 要分层

当前 `flowkit-diagnostic-cli` capability 冻结四个 read-only diagnostics。

02 A1 又要求“CLI surface 在 Proposal 冻结”，而 G1 才交付完整 Change CLI。

Proposal 必须决定 A1 是：

```text
service/API only
or
minimal create/owner/activate CLI + existing read-only diagnostics
```

若新增 write commands，必须把 diagnostic capability 明确限定为 diagnostic subset，不能让 status/next/doctor/resume-context 获得 mutation 权力。

若 CLI 延后 G1，也必须解释 A1 的 operator entry 如何可用。

---

## 20. Confirmed Gap A1-G16 — OpenSpec seam 必须保持最薄

Activation 需要确保：

```text
openspec/changes/<change-id>/.openspec.yaml
```

存在，但完整 OpenSpec 1.7 thin integration 属 C1。

A1 不应提前实现 planningHome/changeRoot/artifactPaths/contextFiles/archive adapter，只冻结 activation 所需的最小 OpenSpec Change initialization seam。

---

## 21. Confirmed Gap A1-G17 — dependency identity 在 Manifest / Policy / tests 之间漂移

当前真实 persisted Delivery Manifest 使用：

```yaml
changes:
  - key: Q1
    id: core-contract-alignment
    dependsOn: []

  - key: A1
    id: delivery-change-creation-and-owner-input
    dependsOn:
      - core-contract-alignment
```

即 `dependsOn` 的值是被依赖 Change 的 `id`。

当前 `src/policy/next.ts`：

```text
dependenciesMet(change, snapshot)
→ for each depKey in change.dependsOn
→ snapshot.changes.some(c => c.key === depKey && c.state === completed)
```

即运行时把 persisted dependency value 当作 `Change.key` 解析。

与此同时，Policy unit fixtures 多处构造：

```text
Q2.dependsOn = ["Q1"]
E1.dependsOn = ["Q2"]
```

这使测试通过的是 Change.key 语义，而不是当前真实 Manifest shape。

直接结果：

```text
Q1 completed
+ Q1 Git Change Checkpoint exists
+ A1.dependsOn = core-contract-alignment
→ current Policy dependency resolution = false
→ A1 incorrectly dependency-incomplete
```

这不是 detached ZIP 无 `.git` 的 transport observation；即使 checkpoint Git fact 可见，identity 比较本身仍然错误。

该 drift 必须在 A1 收敛，因为 A1 正在实现：

```text
create change
→ dependency validation

activate change
→ dependencies completed
→ planned → active
```

Proposal MUST repo-wide 调查并冻结**唯一 canonical dependency identity**，然后同步：

```text
Delivery Manifest contract
FormalFactReader projection
Policy dependency resolution
create/change dependency validation
diagnostic behavior
real-Manifest-shape regression tests
```

Explore 不指定唯一实现表达为 `id` 或 `key`。当前 Manifest corpus 是强 evidence，但最终 normative choice 必须由 Proposal 在完整 canonical evidence 上冻结。

---

## 22. 初步 affected code surface

Proposal 必须 repo-wide scan 后冻结最终 set；当前至少：

```text
src/domain/types.ts
src/domain/schema-validator.ts
src/domain/states.ts

src/facts/formal-fact-snapshot.ts
src/facts/formal-fact-reader.ts
src/facts/yaml-parser.ts

src/persistence/**
src/shared/atomic-write.ts

src/policy/next.ts
src/policy/preconditions.ts
src/policy/owner-decision.ts
src/policy/types.ts
src/policy/unified-entry.ts

src/cli/main.ts
src/cli/context-loader.ts
src/diagnostics/**

openspec/delivery-groups/*.yaml
tests/unit/policy/next.test.ts
相关 Reader / creation / activation / diagnostics regression tests
```

预期 Policy 改动主要是消费新的真实 Owner facts / applicability，而不是重写 decision tree。

---

## 23. 初步 affected canonical capability surface

至少检查：

```text
flowkit-core-model
flowkit-domain-and-state-schema
flowkit-formal-fact-reader-and-persistence
flowkit-policy-engine
flowkit-diagnostic-cli
flowkit-bootstrap-and-roadmap
```

并复查 integration boundaries 与 runtime no-runtime-dependency invariant。

该列表不是 Proposal whitelist。

---

# 24. Proposal Freeze Questions

## P1 — Owner fact physical authority

Proposal 必须选择唯一最小 canonical source，例如 Manifest 内 minimal records、`.flowkit` source-controlled minimal files，或其他同样轻量形式。

必须满足：Owner independent input、typed、sourceRef、Delivery/Change applicability、checkout recoverable、no chat dependency、no Run-as-authority、no Registry/DB/inbox。

## P2 — Owner record minimal schema

至少冻结 record ref、decision/scope、value/selected target、applicable Delivery/Change、sourceRef，以及 recorded/authorized time 是否需要。

必须定义 malformed / unknown / duplicate / conflicting record 的 fail-closed 行为。

## P3 — applicability filtering

必须证明：

```text
A1 apply auth ≠ B1 apply auth
A1 archive auth ≠ B1 archive auth
other Delivery auth ≠ current Delivery auth
```

并冻结 Reader 与 Policy 各自负责的过滤边界。

## P4 — create Delivery contract

冻结 required inputs、defaults、initial state、ID uniqueness、one-active rule、Full Test Plan/status initialization、architectureImpact、branch metadata；明确不创建 branch/commit/push/PR/Archify runtime。

## P5 — create Change contract

冻结 key/id/goal/dependsOn/outputs/architectureImpact/required/state=planned，以及 duplicate/unknown/self dependency/cycle、scope mutation authority、corrective Change source 等规则。`dependsOn` MUST 使用 Proposal 基于 repo-wide evidence 冻结的唯一 canonical dependency identity，不得让 create validation 与 Reader/Policy 使用不同 identity。

## P6 — activation contract

冻结 target selection、Owner activation record/ref、Delivery active、no other active Change、dependencies completed、formal facts conflict-free、planned→active、OpenSpec minimal initialization。`dependencies completed` MUST 与 P13 冻结的 dependency identity 使用同一解析语义，并覆盖真实 Manifest `dependsOn` shape。

Activation 不自动 create Explore Run，不是 Git boundary。

## P7 — activation write ordering / retry

冻结 Owner provenance、OpenSpec metadata、Manifest 三者的 deterministic ordering、idempotency、partial failure diagnosis，不建立通用 transaction platform。

## P8 — Manifest writer strategy

冻结 whole-document deterministic serialization、bounded structured mutation 或其他最小安全 writer；必须 preserve unrelated semantics、no duplicate keys、no silent repair、one EOF newline、atomic publish、Reader round-trip valid。

## P9 — CLI / API surface

明确 Product service/API、flowkit CLI、read-only diagnostics 三者边界；A1 不提前实现 G1 complete runner loop。

## P10 — Owner identity assurance limit

明确 A1保证 structural provenance/non-inference，不保证 cryptographic identity/authentication。

## P11 — historical Bootstrap compatibility

Q1 001–015 的 `ownerAuthorization: explicit/not-required` 不改写，也不自动升级成新的 formal Owner record。新机制从 A1 起 strict。

## P12 — verification plan

至少覆盖 creation validation、Owner record write/read、cross-Change leakage、activation preconditions、multiple active rejection、dependency rejection、dependency identity regression、malformed provenance、Manifest mutation/atomicity、OpenSpec metadata init、CLI/API entry（如适用）、checkout/resume recovery。

dependency regression MUST 使用真实 Delivery Manifest shape，至少证明：

```text
completed dependency
+ canonical dependsOn identity
→ dependenciesMet = true

unknown / self / duplicate dependency
→ create validation deterministically rejects

diagnostics
→ does not report dependency-incomplete for a canonically completed dependency
```

仍不得自动运行 Delivery Full Test。

## P13 — canonical dependency identity

Proposal MUST 基于 repo-wide canonical evidence 冻结唯一 dependency identity；不得只沿用 Policy unit fixture 的 `Q1/Q2` 假设，也不得只因为当前 Manifest 看起来使用 `id` 就跳过其它 canonical consumers 的扫描。

冻结后必须同步：

```text
Manifest dependsOn contract
FormalFactReader projection
Policy dependenciesMet()
create/change dependency validation
activation preconditions
diagnostic reason/projection
tests using real Manifest shape
```

需要明确 migration / compatibility 边界：A1 不重写已完成 Q1 历史 Run/Review artifacts，也不新增 Q2；如当前 Delivery Manifest 已经符合最终 identity，则不得进行无意义重写。

---

## 25. Out of scope

A1 MUST NOT 实现：

```text
B1 Action Package / Result redesign
C1 full OpenSpec thin adapter
D1 Finding convergence / generic blocker resolution
E1 actualChangeSet / verificationScope
F1 archive/checkpoint executor
G1 complete Change runner CLI
03 Delivery Full Test / Finalize / Archify / stable Agent Adapter
```

也不建立 Registry / Decision DB / workflow inbox / event sourcing / generic transaction log。

---

## 26. Explore 结论

A1 的本质不是“加几个 create 命令”，而是补 Deterministic Core 缺失的 write-side authority bridge：

```text
已有：
Formal Facts → Policy → 知道需要 Owner activate / authorize

缺失：
Owner independent input
→ formal provenance
→ safe applicability
→ deterministic create / activation mutation
```

Proposal 应围绕五个收敛点：

```text
1. creation contract
2. Owner fact contract
3. canonical dependency identity
4. activation mutation contract
5. minimal CLI/API boundary
```

并保持：

```text
One fact / one authority
Policy remains unique decision authority
Run remains reference-only
Git remains boundary authority
OpenSpec remains Change contract authority
```

---

## 27. Explore Acceptance

Reviewer 应确认：

- A1 没有重开 Q1；
- detached ZIP 缺 Git history 与 A1 product scope 已区分，且没有再把它当成 A1 当前唯一入口问题；
- Manifest/Policy/tests 的 dependency identity drift 已作为独立 confirmed gap 识别；
- Proposal 必须 repo-wide 冻结唯一 dependency identity，并同步 Manifest/Reader/Policy/create validation/diagnostics/real-shape regression tests；
- Owner authorization projection 为空是已确认真实 gap；
- Run `ownerAuthorization` 没被误当 authority；
- cross-Change applicability 风险已识别；
- Delivery / Change creation write-side 缺失已识别；
- activation Policy 与 mutation 已分离；
- multi-file activation failure seam 与 Manifest writer seam 已识别；
- create Delivery / Change、Owner schema、CLI/API 关键问题均进入 Proposal freeze；
- A1 不提前实现 B1/C1/D1/E1/F1/G1/03；
- Proposal 必须 repo-wide scan 后冻结最终 affected set。

若 approved：

```text
nextActionRecommendation: propose
```

若存在 Author-actionable omission：

```text
changes-requested → revise-explore
```
