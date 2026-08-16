# Q1 Explore：Core Contract Alignment

## 1. 基本信息与进入边界

- Delivery：`20260810-01-change-execution-loop`
- Change Key：`Q1`
- Change ID：`core-contract-alignment`
- Action：`explore`
- Role：`author`
- Execution Context：`detached`
- GitHub Base：`95bb875b12dc682882ded6b89b829b8b6c407d74`

GitHub 已确认当前 branch `delivery/20260810-01-change-execution-loop` 仍精确指向上述 Delivery Start commit；该 commit 只创建本 Delivery Manifest，Q1 仍为 `planned`，没有后续 canonical Change mutation。

Owner 已在当前会话明确授权“开始 explore Q1”。Q1 无依赖、当前 Delivery 为 `active`、没有其他 `active` Change，因此本 detached candidate 只执行 Bootstrap/manual activation：

```text
Q1 planned → active
→ create OpenSpec Change path
→ create 20260810-001-explore Run
→ write explore.md
```

本授权不包含：

- Proposal / Design / Tasks / delta specs；
- production code / tests / canonical specs 修改；
- Delivery Full Test / Finalize；
- Archive / Change Checkpoint / Commit / Push；
- 03 Delivery Execution Loop scope。

---

## 2. Q1 已冻结目标：只修三类 canonical drift

02 Implementation Reference 已把 Q1 限定为最小 corrective Change：

```text
1. blocker authority
   changes-requested ≠ revise-required

2. Run / Action boundary
   Delivery Full Test / Finalize 不属于 Standard Run Action

3. canonical consistency
   docs / specs / code / AGENTS 表达同一 contract
```

Q1 不负责：

```text
重写 Deterministic Core
完整 D1 Finding convergence
Owner provenance ingestion
Delivery Full Test executor
Delivery Finalize executor
Archify
stable Agent Adapter
自动 Author / Reviewer loop
```

因此本 Explore 的问题不是“如何重新设计 Flowkit”，而是：

> 当前已经完成的 Deterministic Core 中，哪些旧 contract 仍会让后续 Change Runner 做出错误边界判断；哪些必须在 Q1 最小修正，哪些必须留给后续 Change。

---

## 3. Drift A：当前机器仍然把 `changes-requested` 机械等同于 `revise-required`

这不是单一文档问题，而是从规则、类型、Reader 到 Policy、tests 的完整旧语义链。

### 3.1 AGENTS 仍冻结旧规则

当前 `AGENTS.md` 明确写着：

```text
`approved` 才向前推进；只有 `changes-requested` 才执行对应 `revise-*`。
```

Reviewer 规则又写：

```text
`changes-requested` 后交回 Author 修正。
```

这会把：

```text
verdict
```

错误提升为：

```text
next authority decision
```

而 v8 已冻结的正确关系是：

```text
changes-requested
→ target not approvable
→ classify blocker authority
→ only author blocker may revise
```

### 3.2 canonical lifecycle docs 仍直接画出 CR → revise

`docs/core-model.md` / `docs/delivery-lifecycle.md` 当前仍包含：

```text
changes-requested → revise-explore
changes-requested → revise-propose
changes-requested → revise-apply
```

并把 Revision 定义为“处理 `changes-requested` Verdict”。

这与新 invariant 冲突：Revision 应由 **author-actionable blocking finding** 触发，而不是仅由 Verdict 触发。

### 3.3 Policy 当前没有 blocker authority 判断分支

`src/policy/next.ts` 当前三个 stage 都直接执行：

```text
match + changes-requested
→ actionResult('revise-*')
```

`src/policy/preconditions.ts` 进一步把：

```text
matching changes-requested
```

编码成：

```text
matching-changes-requested-requires-revision
```

并注明：

```text
the only legal action then is revise-S
```

`src/policy/unified-entry.ts` 的统一 `revise` 入口也只检查：

```text
lineage match
+ verdict = changes-requested
```

然后直接解析成 `revise-S`。

结论：**`changes-requested ≠ revise-required` 尚未机器化。**

---

## 4. Drift B：现有 Finding payload 已 typed，但其结构仍默认 blocker 属于 Author

这是 Q1 最关键的事实缺口。

### 4.1 当前 `ReviewFinding` 已经存在，不需要另建 Finding 平台

`src/persistence/serialization.ts` 已有 Reviewer-owned typed `reviewFindings`：

```text
id
severity
title
problem
location?
requiredChange?
```

并且 completed `review-*` + `changes-requested` 必须至少有一个 blocking finding。

这说明 Q1 不需要新建：

```text
Finding Registry
Evidence DB
Review database
```

已有 payload 就是最自然的最小承载点。

### 4.2 但 `requiredChange` 的语义写死为“Author 必须改什么”

当前注释与 validator 明确把 blocking finding 定义为：

```text
requiredChange
→ what the author must change
```

且所有 blocking finding 都要求 `requiredChange` 非空。

这会错误表达以下合法 blocker：

```text
owner
→ 需要新的独立 Owner decision

verification
→ 需要新的 Verification fact

external
→ 需要外部依赖 / 外部事实
```

这些 blocker 可能根本不存在合法的 Author mutation。

### 4.3 Policy snapshot 又丢掉了 Findings

`ReviewVerdictFact` 当前只有：

```text
reviewRunId
verdict
reviewedRunId
```

`FormalFactSnapshot.reviewVerdicts` 因此只让 Policy 看见：

```text
approved | changes-requested
```

却看不见：

```text
blockingAuthority
```

所以即使 Reviewer 在人类 summary 里写“这是 Owner blocker”，Policy 也无法消费；把 authority 写在 summary/chat 里同样违反 One fact, one authority。

### 4.4 Q1 的最小责任

Q1 必须把 **blocking authority 作为 Reviewer finding 的正式 contract** 建立起来，并让 Policy 至少能够消费“当前 matching blocking findings 的 authority”。

但 Q1 不应提前实现 D1 的完整能力：

```text
稳定 Finding convergence
resolved / still-open / superseded / new
跨 review round finding lifecycle
完整 Finding API / CLI
```

这些仍属于后续 `D1-review-findings-and-blocker-authority`。

Explore 初步判断：最符合 One fact, one authority 的方向，是让 authority 属于 blocking finding 本身，而不是再额外创建一份 aggregate authority 状态；具体字段 requiredness、mixed-authority 行为和 projection 结构留到 Proposal 冻结。

---

## 5. Drift C：direct re-review 当前被 Policy 明确禁止

新 contract 要求：

```text
non-author blocker
→ STOP at authority boundary
→ new authority fact arrives
→ candidate bytes unchanged
→ direct re-review same target
```

但当前实现恰好相反。

### 5.1 `review-S` 在 matching CR 时被禁止

`reviewSPreconditions()` 当前：

```text
lineage.match
+ verdict = changes-requested
→ matching-changes-requested-requires-revision
→ review-S forbidden
```

因此同一 target bytes 在 Owner / Verification / External 新事实到位后，无法合法 direct re-review。

### 5.2 `resolveReview()` 继承同一限制

统一 `review` 入口委托 `canRun(review-S)`，所以同样会 blocked。

### 5.3 这不是“允许无限重复 Review”

Q1 需要区分：

```text
Author blocker still open
→ revise required
→ direct re-review 不应成为逃避修复的路径

Non-author blocker
→ Author 无合法 mutation
→ 等待 authority fact
→ bytes unchanged 时允许新的 reviewer execution
```

具体如何证明“新 authority fact 已到位”以及 mixed blockers 如何处理，需要 Proposal 冻结最小 Policy contract；不能退化成“match+CR 永远允许再 review”。

---

## 6. Drift D：当前没有真正的 no-op revise prohibition

当前 `reviseSPreconditions()` 只要求：

```text
Current Review exists
+ lineage match
+ verdict = changes-requested
```

它不要求：

```text
存在 author-authority blocking finding
```

也不可能从现有 Policy fact 判断这一点。

因此当前系统只能通过流程习惯避免：

```text
Owner blocker
→ Author 创建一个没有合法 candidate mutation 的 revise Run
```

而不能由 contract / Policy 阻止。

Q1 需要把 no-op revise prohibition 落到机器语义，但边界必须最小：

- Q1 只负责“非 author blocker 不得创建 author revise”这一流程资格；
- 真正的 candidate mutation / operation-set 校验和完整 Action Package 仍由 B1/D1 后续能力继续完善；
- 不为了 no-op revise 新建 artifact diff registry 或 mutation database。

---

## 7. Drift E：Delivery Full Test / Finalize 仍被建模为 Standard Formal Action + Run

这是第二条完整的代码级旧语义链。

### 7.1 Domain Action Catalog 仍是 `10 Change + 2 Delivery`

`src/domain/actions.ts` 当前：

```text
CHANGE_ACTIONS = 10 Change Actions
DELIVERY_ACTIONS = ['full-test', 'delivery-finalize']
FormalAction = ChangeAction | DeliveryAction
ACTION_CATALOG = CHANGE_ACTIONS + DELIVERY_ACTIONS
```

而 Q1 新 contract 要求：

```text
Standard Formal Change Actions = 10
Checkpoint / Full Test / Finalize = no Standard Run
```

Delivery behavior 如何机器表达，明确后置到 03 A1。

### 7.2 Run model 仍原生支持 Delivery-level Run

当前多个层次仍把 `changeId` 设计成 optional，以支持 Delivery-level Run：

```text
src/domain/types.ts
src/facts/formal-fact-snapshot.ts
src/persistence/serialization.ts
src/persistence/run-persistence.ts
src/facts/formal-fact-reader.ts
```

并保留：

```text
.flowkit/runs/<delivery-id>/<run-id>/
或文档中的
.flowkit/runs/<delivery-id>/_delivery/<run-id>/
```

`serialization.ts` 还用 `isDeliveryAction()` 决定 Delivery Run 不携带 `changeKey/changeId`。

### 7.3 Policy 仍会返回 `action: full-test / delivery-finalize`

当所有 Change 完成后，`src/policy/next.ts` 目前会：

```text
fullTestStatus = authorized + scope present
→ action: full-test

fullTestStatus = passed + finalize scope present
→ action: delivery-finalize
```

这直接要求后续存在 Standard Action/Run executor。

### 7.4 canonical specs/docs 同样冻结了旧模型

至少以下当前 canonical contract 明确要求旧语义：

```text
openspec/specs/flowkit-domain-and-state-schema/spec.md
→ 10 Change + 2 Delivery Action

openspec/specs/flowkit-policy-engine/spec.md
→ canRun(full-test / delivery-finalize)
→ next may return action full-test / delivery-finalize

openspec/specs/flowkit-core-model/spec.md
→ Delivery-level Run path

openspec/specs/flowkit-bootstrap-and-roadmap/spec.md
→ Reviewer changes-requested 后由 Author 执行对应 Revision
→ changes-requested MUST 交回 Author 修复

docs/core-model.md
→ Delivery-level Run

docs/verification-model.md
→ 正式 full-test Action + Delivery-level Run
```

其中 `flowkit-bootstrap-and-roadmap` 不是纯历史记录：它仍是 exact Base 下的 active canonical capability spec，且其 Reviewer/Revision requirement 直接冻结了 `changes-requested → Author revise`。因此 Q1 必须把它纳入 affected capability surface；不能只修 Policy/Domain/Core 三个显眼 spec 而留下该 requirement 与新 invariant 冲突。

所以 Q1 必须同步 specs / docs / code / tests；只改 `actions.ts` 会造成 canonical contract 自相矛盾。

---

## 8. 历史 Delivery-level Runs：不能删除，但也不能继续定义当前产品模型

当前 repository 历史中确实存在旧 Bootstrap Delivery-level Runs，例如早期 Delivery 的 `full-test` / `finalize` terminal Runs。

这带来一个重要兼容边界：

```text
新模型
→ Full Test / Finalize 不创建 Standard Run

历史 Git facts
→ 已经存在的旧 Run 不能被 Q1 重写或删除
```

因此 Proposal 必须把两件事分开：

### 当前产品 contract

```text
new Standard Run
→ Change-only
→ requires Change identity
→ no new _delivery/full-test/finalize Run
```

### bounded legacy compatibility

如当前 Reader / migration 仍需要识别旧历史数据，可以保留最窄的 legacy read compatibility，但它必须：

```text
不进入 current Action Catalog
不允许 create new Delivery-level Run
不让 historical Run 决定当前 Delivery behavior
不要求历史 artifact migration
```

Explore 不在此决定是否最终需要保留哪一层 legacy parser；但**不能为了“类型干净”去改写历史 terminal Runs**，也不能反过来因为历史存在就继续让新产品生成同类 Run。

---

## 9. Checkpoint boundary 当前大方向正确，应保持

Q1 不应顺手重做 Checkpoint。

当前实现已经明确：

```text
change-checkpoint
→ 不在 Action Catalog
→ Git formal boundary
```

Policy 通过：

```text
owner-decision: authorize-checkpoint
```

表达这个边界，而不是创建 `checkpoint` Run。

这与 v8 / 02 目标一致。

Q1 只需在同步 Action Catalog 时防止回归，不需要为 Checkpoint 新增 Action、Run 或状态机。

---

## 10. 已经正确的基础，不应被 Q1 重做

以下 Deterministic Core 结果与新方向一致，应视为 KEEP：

### 10.1 One fact, one authority

当前 docs 与 Q2 已明确：

```text
Flowkit Policy → lifecycle boundary
OpenSpec       → Change contract / archive semantics
Git            → bytes / history / checkpoint
Reviewer       → Findings / Verdict
Verification   → check result
Run            → lightweight execution envelope
```

### 10.2 Lean Run / point-in-time ResultRef

Q2 已经收窄历史 mutable artifact replay，Q1 不应重新引入 generation registry / evidence ledger。

### 10.3 OpenSpec archive success closes Change

```text
OpenSpec archive success
→ Change.state = completed
→ Checkpoint follows as Git boundary
```

保持不变。

### 10.4 Change path 不自动跑 Delivery Full Test

当前文档/验证模型已有该隔离原则。Q1 要改的是“Full Test 仍被建模为 Standard Action/Run”，不是取消 Owner authorization 或 Delivery-level verification 语义。

### 10.5 Full Test / Finalize 的完整 machine behavior 留给 03

Q1 不实现：

```text
Delivery behavior discriminated union
Full Test executor
Finalize executor
Delivery Finding loop
```

Q1 只需要移除“它们必须是 Standard Formal Action/Run”的旧前提，使 03 可以在干净边界上实现正确 Delivery behavior。

---

## 11. 当前 canonical drift surface

下面是 Explore 阶段确认的主要影响面；这不是最终 file whitelist。001 已证明“只看显眼的 Domain/Policy/Core spec”会漏掉仍冻结旧 Review→Revision 规则的 capability contract，因此 Proposal **必须先对 repo-wide canonical contract 做一次完整冲突扫描**，再冻结最终 affected capability/file set；只修改当前表格中已列出的文件不构成完整性证明。

Proposal 的扫描目标是所有仍作为 current product contract 的 canonical surfaces（至少 active OpenSpec capability specs、AGENTS、current docs、domain/facts/policy/persistence/diagnostics 与直接 contract tests），而不是历史 archived artifacts 的全文清理。最终只修改真实冲突项。

| Surface | 当前 drift | Q1 方向 |
|---|---|---|
| `AGENTS.md` | CR 无条件交 Author revise | 改成先判 blocker authority |
| `docs/core-model.md` | Revision=处理 CR；Delivery-level Run | 对齐 authority + Change-only Standard Run |
| `docs/delivery-lifecycle.md` | 三阶段 CR→revise 固定映射 | 引入 authority boundary / direct re-review |
| `docs/verification-model.md` | Full Test 是 formal action / Delivery Run | 保留验证语义，移除 Standard Run 要求 |
| `docs/integration-boundaries.md` | Review/Finding contract 未表达 authority | 最小补 authority ownership |
| `docs/bootstrap-reference.md` | 存在旧 Bootstrap 表达 | 只改仍被当产品 contract 的冲突部分，不复制 v8 operator 文档 |
| `docs/development-roadmap.md` | 需核对 02/03 分工 | 只做一致性修正 |
| `openspec/specs/flowkit-domain-and-state-schema` | 10+2 Action Catalog | 改为 Change-only Standard Action contract |
| `openspec/specs/flowkit-policy-engine` | match+CR 唯一 revise；full-test/finalize action | 对齐 authority；移除 Delivery Standard Action 假设 |
| `openspec/specs/flowkit-core-model` | Delivery-level Run | 对齐 Change-only current Run model |
| `openspec/specs/flowkit-formal-fact-reader-and-persistence` | current Reader 支持 Delivery Run | 视 Proposal 的 legacy seam 做最小同步 |
| `openspec/specs/flowkit-bootstrap-and-roadmap` | Reviewer CR 后固定交 Author Revision | 对齐 blockingAuthority；只有 author blocker 才进入 revise |
| `src/domain/actions.ts` | `FormalAction = Change + Delivery` | Standard Action 收敛为 Change-only |
| `src/domain/types.ts` | Run/ActionResult 支持 DeliveryAction | 对齐 current Run contract；legacy 另行隔离 |
| `src/persistence/serialization.ts` | Delivery Run schema；blocking finding 默认 author | 补 authority contract，禁止新 Delivery Standard Run |
| `src/facts/formal-fact-snapshot.ts` | Policy verdict fact 不含 blocker authority | 增加最小可消费 authority projection |
| `src/facts/formal-fact-reader.ts` | 读取 Delivery-level current Runs；Verdict fact 丢 Findings | 对齐最小 current facts；legacy bounded |
| `src/policy/preconditions.ts` | CR requires revision | author blocker 才允许 revise |
| `src/policy/next.ts` | CR→revise；Full Test/Finalize→action | authority dispatch；去 Standard Delivery action |
| `src/policy/unified-entry.ts` | CR 即 resolveRevise | 仅 author-actionable blocker resolve revise |
| `src/policy/owner-decision.ts` | Full Test/Finalize scope 映射到 FormalAction | 需与新 Action/Delivery behavior 边界解耦 |
| `src/diagnostics/**` | owner decision 文案仍映射到 delivery actions | 随 Policy type 最小调整 |
| `tests/**` | 大量测试冻结旧 10+2、CR→revise、Delivery Run | 同步为新 contract + legacy regression |

---

## 12. Q1 与后续 D1 的边界

Q1 与 `D1-review-findings-and-blocker-authority` 容易重叠，必须明确：

### Q1 必须完成

```text
blockingAuthority 成为 canonical machine contract
Policy 不再从 CR 直接推出 revise
non-author blocker 不创建 Author revise
bytes unchanged 时存在 direct re-review 的合法 contract
no-op revise 不再是合法默认路径
Standard Run 只覆盖 Change lifecycle
Full Test / Finalize 不再需要 Delivery-level Standard Run
Q1 移除 Delivery FormalAction 后，现有 Policy 在 03 A1 尚未实现前仍保持 deterministic / fail-closed
```

这里最后一项只是 **过渡契约要求**：Q1 Proposal 必须冻结 no-active-change 下各 Delivery status 的合法 Policy 输出；不得通过继续返回 `full-test` / `delivery-finalize` 伪 Action 来维持可运行，也不得提前实现 03 A1 的完整 Delivery behavior model/executor。

### D1 后续完成

```text
完整 Finding model
problem / invariant / evidence / impact / requiredOutcome / acceptance
稳定 Finding identity 的正式收口
resolved / still-open / superseded / new convergence
多轮 Finding lifecycle
Review CLI / Action Package 的完整 Finding 交互
```

也就是说：

> Q1 修“Core 现在会走错边界”的最小事实与 Policy；D1 再把 Review/Findings 做完整。

---

## 13. Proposal 前必须冻结的六个具体问题

Explore 已经确认问题存在，但以下实现选择不应在 Explore 阶段偷跑成 Design：

### Q1-P1：blockingAuthority 放在哪个最小 canonical payload

优先方向是 Reviewer-owned blocking finding 本身，因为 authority 是 finding 的性质；但需要 Proposal 冻结：

```text
字段名/enum
blocking vs non-blocking requiredness
旧 reviewFindings 的兼容策略
Policy snapshot 的最小 projection
```

### Q1-P2：mixed blocking authorities 如何确定唯一下一 boundary

例如同一 Review 同时有：

```text
author blocker + owner blocker
```

不能简单挑一个继续。Proposal 必须定义 fail-closed / precedence / aggregate 规则，保证 Policy 仍然唯一确定。

### Q1-P3：direct re-review 的“新 authority fact”最小证明

必须防止：

```text
同一 CR target
→ 无任何事实变化
→ 无限 reviewer 重跑
```

同时又要允许：

```text
Owner/Verification/External fact 已变化
+ candidate bytes unchanged
→ direct re-review
```

Proposal 需要找最小已有 authority ref，不建立新的 history ledger。

### Q1-P4：historical Delivery Run compatibility seam

需要决定：

```text
current domain/public API 完全 Change-only
+ legacy parser 私有兼容
```

还是其他更小的隔离方式。

无论采用哪种方式，都必须同时满足：

```text
不生成新 Delivery Standard Run
不改写历史 terminal Runs
不让历史兼容污染 current Policy contract
```

### Q1-P5：repo-wide affected capability completeness

001 已漏掉 `flowkit-bootstrap-and-roadmap` 中仍 active 的旧 Review→Revision requirement，因此 Proposal 不能把 Explore 当前表格当作最终 whitelist。Proposal 必须先完成 repo-wide canonical conflict scan，并冻结：

```text
哪些 active capability specs 直接冻结旧 blocker / revise / Delivery Action / Delivery Run 语义
哪些 docs / AGENTS / code / tests 是这些 requirement 的直接实现或验证
哪些只是历史 archived artifact，不进入 Q1 rewrite
```

验收重点是：Q1 结束后 current canonical product contract 不再同时存在互相冲突的新旧 requirement，而不是“把所有历史文字统一重写”。

### Q1-P6：移除 Delivery FormalAction 后、03 A1 前的 deterministic Policy 过渡边界

当前 `next()` 在 no-active-change 的 Delivery 状态仍可能返回 `full-test` / `delivery-finalize` FormalAction；Q1 又必须移除这两个 Standard Action，而完整 Delivery behavior machine model 明确后置 03 A1。因此 Proposal 必须显式冻结 **Q1→03 的过渡 contract**，至少覆盖：

```text
no active Change
+ fullTestStatus = awaiting-user-decision
+ fullTestStatus = authorized
+ fullTestStatus = passed
+ 其他与现有 Delivery terminal/blocked 判定直接相关的状态
```

该 contract 必须同时保证：

```text
Policy 输出仍 deterministic / fail-closed
不得返回 full-test / delivery-finalize FormalAction
不得创建 Delivery-level Standard Run
不得把 Delivery behavior 重新伪装成 Change Action
不得提前实现 03 A1 的完整 Delivery behavior discriminated union / executor
```

Explore 不指定具体返回形态；这是 Proposal 必须在现有 Policy boundary vocabulary 与最小 Q1 scope 内冻结的设计选择，不能留到 Apply 临时决定。

---

## 14. Explore 结论

Q1 是必要且边界清晰的 corrective Change。

当前真实问题可以压缩成两条错误链：

```text
Reviewer verdict
changes-requested
    ↓ 当前 Core
revise-* required
```

需要变为：

```text
Reviewer blocking finding
    ↓
blockingAuthority
    ├─ author       → revise-*
    ├─ owner        → owner authority boundary
    ├─ verification → verification boundary
    └─ external     → external boundary

non-author fact changes + candidate bytes unchanged
→ direct re-review
```

以及：

```text
当前 Core
FormalAction = 10 Change + full-test + delivery-finalize
Delivery behavior → Delivery-level Run
```

需要变为：

```text
Q1 后
Standard Formal Action / Run = Change-only 10 Actions
Checkpoint = Git boundary, no Run
Full Test / Finalize = no Standard Run
Delivery behavior machine model = 03 A1
```

Q1 不需要重做 Deterministic Core，也不需要提前实现完整 D1/03。修订后的 Explore 额外确认两项 Proposal 不得遗漏的约束：

1. `flowkit-bootstrap-and-roadmap` 仍是 affected canonical capability，Proposal 必须通过 repo-wide canonical scan 冻结完整 affected capability set；
2. 删除 Delivery FormalAction 后、03 A1 尚未实现前，Proposal 必须冻结 deterministic / fail-closed 的 Policy 过渡边界，且不能靠伪 Action、Delivery Run 或提前实现 03 来填空。

最小正确方向是：

> **修正当前会导致错误流程推进的 canonical contract 和最小机器事实；完整扫描 current canonical contract 但不清理历史；为 Q1→03 保留确定且 fail-closed 的过渡边界；保留历史兼容但不让历史旧模型继续定义新行为；随后重新交给 Reviewer 做完整 `review-explore`。**
