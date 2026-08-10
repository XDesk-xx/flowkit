# Q2 Explore：Orchestration Authority Boundary Correction

## 1. 背景与 Reset

旧 detached Q2 `run-authority-boundary-correction` Runs `146–160` 已由 Owner 明确废弃，未进入 canonical，也不继承其 Proposal、Review、Apply 或 Archive lineage。

新的 Q2 从同一个 Q1 Checkpoint Base 重新开始：

```text
repository: XDesk-xx/flowkit
branch: delivery/20260806-01-deterministic-core
head: 6fe05c4cd28ebbdb6abf3640057a30bc01b1332d
```

本次 reset 的原因不是一个局部实现 bug，而是更基础的职责判断需要重新收敛：之前为了防止 artifact drift、historical replacement、archive relocation 等问题，Flowkit 逐步承担了越来越多本应属于 OpenSpec / Git / Verification / Reviewer 的事实解释与重复证明。

Owner 已重新冻结最本质要求：

> Flowkit 必须简单但有效。它是 thin orchestration authority，只维护安全推进当前 Action 所必需的最小流程事实；已有原始 authority 的事实，不重复存储、不重复解释、不重复证明。

因此，本 Explore 的任务不是设计一个更复杂的 Reader，而是先判断：**Flowkit 到底应该少管什么。**

---

## 2. 已冻结 Authority Map

当前高层文档已经存在正确基础，不需要重新发明 authority 模型。

| 事实 | 主要 authority | Flowkit 应做什么 |
|---|---|---|
| Delivery / Change 流程状态、唯一下一 Action | Flowkit Policy | 读取必要事实并决定是否允许推进 |
| Change Explore / Proposal / Design / Specs / Tasks | OpenSpec Change artifacts | 引用、调用 OpenSpec，不维护第二份完整事实 |
| OpenSpec archive 是否成功、archive 后 artifact lifecycle | OpenSpec | 调用并接受成功/失败结果，不重新解释其内部 relocation / merge |
| 文件 bytes、版本历史、Checkpoint | Git | 使用 Git 作为持久化/恢复边界，不让 Run 代替 Git |
| Findings / Verdict | Reviewer | 消费正式 Reviewer 结果，不复制一套 Reviewer authority |
| Verification | 项目验证工具 + `verification.md` | 判断流程 gate 是否满足，不复制完整测试事实 |
| Owner 授权 | Owner decision / Flowkit | 严格保护 owner-only boundary |
| 单次 Action 的执行上下文和最小结果 | Run | 仅提供执行、交接、resume 所需最小记录 |

Base 的 `docs/product-positioning.md` 与 `docs/core-model.md` 已明确 `One fact, one authority`，并明确 Run 不是 Change contract、Git、Findings、Verification 的 authority。这些高层原则应视为 **KEEP**。

---

## 3. `pending` 的边界必须明确

Base canonical B1 已冻结：

```text
RunStatus = pending | completed | failed | cancelled
```

本 Q2 **不把“删除 pending”作为目标**。

正确解释只有：

```text
Run.status = pending
= 这一次 Run 已创建，但尚未发布 terminal result
```

同时：

```text
Action 本身没有 pending 状态
Change 本身也不会因为某个 Run pending 而新增 reviewing/revising/verifying 等主状态
```

需要重点调查的是：Base 后续实现是否把 `pending` 进一步用于：

```text
artifact revision-window
mutable artifact generation authority
historical replacement suppression
```

如果是，这属于 **Run execution status 被提升成 artifact lifecycle authority** 的风险，应在 Proposal 中证明其必要性；不能因为 `pending` 这个 RunStatus 合法，就默认 `revision-window` 也属于 Flowkit 必需事实。

初步结论：

- `pending` 作为 RunStatus：**KEEP**；
- `pending` 作为 Action 状态：**不存在 / 禁止混用**；
- `pending` 参与 artifact generation/revision-window：**INVESTIGATE，默认不保留，除非证明当前 Action 正确性确实依赖它**。

---

## 4. Base 中已经出现的越权风险

### 4.1 Reader 从“读取流程事实”扩展成“重放 mutable artifact 历史”

当前 `src/facts/formal-fact-reader.ts` 不只是读取 Run identity/status/verdict，还调用：

```text
classifyArtifactGenerations()
classifyVerificationGenerations()
validateCurrentGenerationRefs()
validateCurrentVerificationSummaryRef()
resolveArchiveAwareArtifactPath()
validateStageEffectiveSet()
```

并从整个 Delivery Run tree 读取历史 Change Runs，再基于历史 review/revise lineage 分类：

```text
current
superseded
revision-window
```

这已经超出“Run 是最小执行信封”的直观职责。

需要在 Proposal 前回答：

> 当前 Policy 为决定当前 active Change 的下一 Action，是否真的需要重放已完成 Change 的 mutable OpenSpec artifact generation？

初步代码追踪显示，`src/policy/**` 对 Change 流程判断主要按 `change.id` 查询当前 Change 的 Runs / ReviewVerdicts；尚未发现 Policy 需要通过已完成 Change 的 mutable artifact fingerprints 来决定当前 Action。

因此“扫描全部历史 Run → 重放全部 mutable artifact generations → 任一 mismatch 进入 snapshot.conflicts → Policy 全局 blocked”是当前最重要的 **REMOVE / NARROW 候选**。

### 4.2 `generation-resolver.ts` 已形成第二套 artifact lifecycle 模型

当前模块显式定义：

```text
GenerationClass = current | superseded | revision-window
```

并用 Review + Revise lineage 决定某个 OpenSpec artifact generation 是否仍应匹配 current canonical bytes。

这个模型解决的是“历史 Run 中记录的 mutable artifact hash 如何继续解释”的问题。

但 Owner 当前原则要求先反问：

> 历史 Run 为什么需要继续证明今天的 OpenSpec current artifact bytes？

如果历史 `produced-artifact ResultRef` 只是 point-in-time reference，那么多数 generation classification 本身可能是不必要复杂度，而不是必须保留后再优化的能力。

因此：

- current review target 的精确版本绑定：**KEEP 候选**；
- historical mutable artifact replay：**REMOVE 候选**；
- `current/superseded/revision-window` 作为通用 Reader authority：**REMOVE / 极度收窄候选**。

### 4.3 Archive 边界尤其容易越权

Delivery Manifest 当前明确把完整：

```text
OpenSpec apply / archive 集成
```

列在本 Delivery excluded scope。

但 Base 的 C1 spec / Reader / ResultRef adapter 已经包含较强的：

```text
archive-aware resolver
archive relocation 后继续验证 final effective fingerprints
active/archive ambiguity detection
historical superseded ref post-archive replay
```

这至少说明职责边界需要重新核对。

Owner 已明确当前原则：

```text
Flowkit Policy
→ 判断 archive Action 是否允许执行

OpenSpec archive
→ 自己负责 artifact relocation / spec sync / archive 成功失败

OpenSpec success
→ Flowkit 记录本次 archive Run completed

OpenSpec failure
→ Flowkit 记录本次 archive Run failed
```

Flowkit 不应在 OpenSpec 已成功 archive 后，再通过自己理解 archive 目录结构、spec merge 或 historical fingerprint 来二次证明 OpenSpec 的结果。

因此 Proposal 必须重点检查并最小化：

- `resolveArchiveAwareArtifactPath()` 是否仍有真正属于 Flowkit 的用途；
- archive completion 是否存在 OpenSpec artifact 二次验证；
- Reader 是否因为 OpenSpec 正常 relocation 而承担额外 lifecycle authority。

默认方向不是“补 archive-aware resolver”，而是“删除不属于 Flowkit 的 post-archive proof”。

### 4.4 ResultRef 需要区分“精确交接”与“永久 authority”

ResultRef 本身不是问题。Base reference 已冻结机器派生 fingerprint，避免 Agent 手写 hash。

真正需要区分：

```text
A. 精确交接
review-* 必须知道自己审的是哪个稳定结果
revise-* 必须知道自己响应的是哪个 changes-requested review
owner-only Action 必须不能消费错误 predecessor

B. 永久 artifact authority
历史 Run 的 produced artifact fingerprint
长期要求 current OpenSpec path 仍保持相同 bytes
```

A 直接影响当前流程正确性，应保持严格。

B 容易让 Run 代替 OpenSpec/Git，应默认取消。

因此 Proposal 不应讨论“ResultRef 全留 / 全删”，而应逐字段证明：

> 这个 ref 如果不存在，当前 Action 是否会消费错误输入或错误推进？

只有答案为“会”时，才保留为 Flowkit 的最小 lineage / handoff fact。

### 4.5 Completion preflight 可能验证过多

当前 persistence 把“所有 Core-owned ResultRefs 在 terminal publish 前重新与 current bytes 比较”作为统一 completion preflight。

其中有些属于 Flowkit 自己的安全边界，例如：

- terminal `result.json` create-once；
- review target result 在 Review 期间不能被偷换；
- source Review 必须是真实且 verdict 匹配；
- caller 不能手写 fingerprint/path。

但如果 preflight 进一步要求：

- OpenSpec mutable artifact 必须持续匹配历史 Run fingerprint；
- OpenSpec archive 后由 Flowkit 再解析 archived path；
- Verification 完整事实由 Run 再次证明；

就可能越权。

因此 Proposal 必须把 completion validation 分为两类：

```text
Flowkit-owned safety invariant
→ 保留

external-authority fact replay
→ 删除
```

不能继续采用“一切有 ResultRef 就统一二次验证”的默认思路。

---

## 5. Canonical 文档 / Spec / AGENTS 的初步分类

本 Explore **不修改这些文件**，只给 Proposal 输入。

### KEEP

- `docs/product-positioning.md`
  - `One fact, one authority`
  - 高层 authority map
- `docs/core-model.md`
  - Run 是 execution envelope
  - RunStatus 四态
  - Action / Change 主状态与 RunStatus 分离
- Q1 reference 的：
  - terminal result create-once
  - machine-derived fingerprint
  - owner authorization boundary
  - Verification layering
  - `.tmp` 不作为正式恢复 authority

### CLARIFY

- `AGENTS.md`
  - 前八条基本规则整体正确；
  - “能由 Core、类型、Policy、Git 或验证工具确定的事实，不要求 Agent 手工维护”应继续保留；
  - 必须把 **人类可读内容默认使用简体中文** 纳入 Proposal 的正式同步输入：
    - `action.md` 的说明性内容；
    - Explore / Proposal / Design / Tasks 正文；
    - Review summary / Findings；
    - verification summary 等面向人的说明。
  - Action 名、schema key、CLI / code identifier、路径、error code、enum 等机器或代码标识继续使用英文；该语言规则只约束呈现和 Agent 行为，**不成为 Policy、OpenSpec 或任何流程状态的 authority**。
  - 必须把 **Reviewer mutation boundary** 纳入 Proposal 的正式同步输入：
    - Reviewer 只读审查 reviewed candidate；
    - 除 Reviewer-owned Run / Review artifact 外，不得修改 Author artifacts、production code、tests 或 Manifest；
    - 发现问题只能给出 Findings / Verdict，并在 `changes-requested` 后交回 Author；
    - Reviewer 不得替 Author 实现修复，也不得替 Owner 授权 Archive / Checkpoint / Full Test / Finalize。
  - 同时必须明确 `AGENTS.md` 只是仓库级 **Agent 操作约束**：它不拥有唯一下一 Action、Change contract 或 Owner decision，不能因为“防越权”而形成第二套流程 authority。
  - 当前最后“historical mutable artifact replacement validation 由 Reader generation-aware 规则判定”已经把某个实现机制提升为仓库级原则，需要重新判断。
- `docs/delivery-lifecycle.md`
  - artifact 可合法被 revise 覆盖的原则正确；
  - 但 generation-aware replay、archive-aware fingerprint validation 与 pending revision-window 不应在未证明必要前作为默认生命周期规则。

### REMOVE / NARROW 候选

- C1 canonical spec 中：
  - historical mutable artifact generation-aware validation；
  - current/superseded/revision-window 全生命周期模型；
  - archive relocation 后由 Flowkit 继续验证 final effective fingerprint；
  - historical verification generation replay。
- production 中对应：
  - Reader 的全历史 mutable artifact replay；
  - `generation-resolver` 的通用 lifecycle authority；
  - archive-aware ResultRef resolution，如其唯一目的只是让 Flowkit 二次证明 OpenSpec archive 内部结果。

是否最终删除，必须由 Proposal 逐项证明，不在 Explore 阶段直接改代码。

---

## 6. Proposal 前必须回答的 6 个问题

### Q2-E1：Policy 真正需要哪些 Run facts？

要求从 `src/policy/**` 反向列出最小输入，不从现有 Reader 输出正向合理化现有复杂度。

重点确认：

- active Change 的当前/近邻 Runs 是否已经足够；
- completed/cancelled Change 的历史 mutable artifact Runs 是否根本不应进入当前 Policy conflict scope；
- Delivery-level Runs 是否独立保留。

### Q2-E2：哪些 lineage 是 Flowkit-owned？

逐项证明：

```text
reviewedRunId
sourceReviewRun
sourceReviewVerdict
inputRef
reviewVerdictRef
producedResultRefs
verificationSummaryRef
```

没有“当前 Action correctness”证明的字段/验证不得继续因为“更安全”而保留。

### Q2-E3：`pending` 除 RunStatus 外还应承担什么？

默认答案：什么也不承担。

如果 Proposal 要让 pending 影响 artifact generation / revision window，必须给出无法用更简单 current-action lineage 表达的实际错误场景。

### Q2-E4：Archive Action 的 Flowkit contract 到哪里结束？

至少区分：

```text
进入 archive 前的 Flowkit Policy gate
OpenSpec archive 外部调用结果
archive Run 的 success/failed 记录
OpenSpec 内部 artifact relocation/spec sync
```

后者默认归 OpenSpec，不进入 Flowkit 二次 proof。

### Q2-E5：ResultRef 的最小保留集合是什么？

目标是：

```text
精确交接需要 → 保留
历史 mutable authority → 删除
```

而不是继续维护通用 artifact provenance system。

### Q2-E6：文档与 Agent 操作约束的最小同步范围是什么？

Proposal 必须分别给出 `AGENTS.md`、canonical docs/specs 的：

```text
KEEP
CLARIFY
REMOVE
```

其中 `AGENTS.md` 至少要回答两个本次 reset 的仓库级 Agent 行为约束：

1. **语言边界**
   - 面向人的说明性内容默认简体中文；
   - Action 名、schema key、CLI / code identifier、路径、error code、enum 保持英文；
   - 只约束呈现/Agent 行为，不成为 Policy/OpenSpec 的流程 authority。

2. **Reviewer mutation boundary**
   - Reviewer 只读审查 reviewed candidate；
   - 除 Reviewer-owned Run / Review artifact 外，不修改 Author artifacts、production code、tests 或 Manifest；
   - Finding 只能通过 `changes-requested` 交回 Author 修复；
   - Reviewer 不替 Owner 授权 Archive / Checkpoint / Full Test / Finalize。

还必须明确：

```text
AGENTS
= Agent 操作约束
≠ next Action authority
≠ Change contract authority
≠ Owner decision authority
```

不允许为了“统一表述”顺手重写所有 AGENTS/docs/specs，也不允许通过补 AGENTS 规则反过来创造第二套流程 authority。

---

## 7. 新 Q2 的 Non-goals

本 Change 不做：

- 不建立新的 provenance ledger / artifact registry / generation registry；
- 不给 Flowkit 增加 OpenSpec archive path resolver 作为新 authority；
- 不重新实现 OpenSpec archive / apply；
- 不让 Run 保存完整 OpenSpec / Verification / Git / Review 快照；
- 不批量重写历史 Runs；
- 不要求历史 terminal mutable artifact refs 永远匹配 current path；
- 不新增 Run 主状态；
- 不把 Action 变成 pending/completed 状态机；
- 不修改 D1 Policy 的业务流程顺序，除非发现其本身依赖越权事实且 Proposal 明确证明；
- 不实现 E1 CLI；
- 不运行 Delivery Full Test；
- 不做 Checkpoint。

---

## 8. Explore 结论

新的 Q2 应从“修 Reader compatibility”升级为更准确的：

```text
orchestration-authority-boundary-correction
```

当前最重要结论不是增加能力，而是减少错误 ownership：

1. Base 高层 `One fact, one authority` 原则正确，应保留；
2. `pending` 合法且必要，但只属于 RunStatus，不应天然产生 artifact revision-window authority；
3. 当前 Reader / generation-resolver / C1 spec 已存在 historical mutable artifact replay 和 archive-aware lifecycle proof，属于主要越权风险；
4. OpenSpec archive 的内部正确性归 OpenSpec；Flowkit 只负责当前 Action gate、调用结果和最小 Run execution status；
5. ResultRef 只保留对当前精确交接真正必要的部分，不扩展为长期 provenance authority；
6. Proposal 必须从 Policy 的最小真实输入反推 Reader/Run contract，而不是从现有复杂实现倒推“为什么这些机制都需要”；
7. AGENTS/docs/specs 只做最小 keep/clarify/remove 同步；其中 AGENTS 必须显式冻结“人类可读内容默认简体中文”和 Reviewer mutation boundary，但 AGENTS 仍只约束 Agent 行为，不能反过来创造 next Action / Change contract / Owner decision authority。

本 Explore 不提出具体实现补丁。若 Reviewer 批准，下一步 `propose` 应先形成一份 **authority ownership matrix + minimal current-action invariants + explicit removals**，再决定需要修改哪些代码。
