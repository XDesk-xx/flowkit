# E1 Explore — Action Fact Time Boundary 与 Exact Run Retry

## 1. 当前 generation

- Delivery：`20260810-01-change-execution-loop`
- Change：`E1 change-verification-selection-and-change-set`
- Explore Run：`20260813-105-explore`
- Revision Runs：`20260813-107-revise-explore`、`20260813-110-revise-explore`
- Base checkpoint：`689d5dfe495f86e23f2fd0e4a87dc9213fca667c`
- Activation fact：`owner:7935d82cc0f67fe28c695432f35a1609612da350c45c83c07301dbd9e2605c4d`

canonical working tree 已整体回退到 D2 checkpoint 后重新激活 E1。回退前的 E1 artifacts、Runs 和临时 Contract Reset fact 均不属于本 generation 的 authority 或 evidence。

`02-change-execution-loop-delivery-implementation-reference-v3.md` 是本次 Explore 前更新的非权威实现参考；正式 contract 仍必须由本 generation 的 Proposal、Design、delta specs 与 tasks 建立。

Review Run `20260813-106-review-explore` 首次提出 `E1-RE-001` 与 `E1-RE-002`。Owner 随后通过正式 write-side 记录 `owner:52c2f519e846da1aab0ba16b4f2e2355ae362d0fb846f2a21302a2b5bdf17b6d`，明确扩展 E1 scope 并保留 G1 的既有 consumer / validation / observation outputs。Review Run `20260813-109-review-explore` 已确认 `E1-RE-001` 与 `E1-RE-002` resolved，当前 revision 只关闭 Author-owned `E1-RE-003`。

## 2. 两个相互关联的根因

### 2.1 Action entry 与 post-action facts 被混入同一时间域

Apply / revise-apply 在执行前创建 immutable context 与 ActionPackage。最终 candidate path、change kind、content fingerprint、actualChangeSet 和 verification scope 只能在 Action 执行后确定；若把它们写入 entry semantic identity，合法 Action 会因为产生自身输出而形成 self-drift。

因此 entry 只能冻结执行前已存在的 authority，最终 change/verification facts 必须由 Core 在 post-action observation 阶段产生。

### 2.2 caller timeout 与 Run progression 被混入同一入口

当前 `prepareActionExecution({ entry: "next" })` 先读取最新 formal facts、运行 Policy、派生 semantic inputs，再检查 pending Run：

```text
readSnapshot
→ next(snapshot)
→ deriveSemanticInputs
→ inspect pending
→ resume existing OR allocate/create next Run
```

该入口既表达“恢复 pending Run”，又表达“根据最新 Policy 创建下一 Run”。当 caller timeout 时，caller 只知道没有及时获得响应，不知道底层 writer 是否仍在运行、稍后完成或已经 terminal。此时重试 `next` 可能看到旧 Run 已完成，并合法但错误地创建下一 generation。

已观测到的具体 race 是：Author revise admission 的外层调用超时，原进程随后完成 Author Run；第二次 `next` 重试据最新 Policy 创建了 pending Reviewer Run。schema 拒绝了把 Author result 写成 Reviewer verdict，但新 Reviewer Run 已被 preparation 持久化。

这不是把 timeout 从 60 秒调到 180 秒即可修复的问题。延长 timeout 只能降低复现概率，不能提供 exact retry correctness。

## 3. 耗时来源与能力边界

本地只读计时显示：

- `openspec --version` 约 0.44 秒；
- 单次 `openspec status` 约 1.64 秒；
- 单次 `openspec instructions` 约 1.62 秒；
- active OpenSpec Change 上一次 `flowkit status` 约 23.08 秒；
- 回到无 active Change 的 checkpoint 后，同一 diagnostics 约 0.7 秒。

CodeGraph trace 显示 formal snapshot、tasks、verification、contract refs 和 prepared action context 会分别创建 adapter 并重复读取 version/status；Proposal preparation 还会让每个 artifact instruction 再读取 status。累计 Windows process startup cost 使 prepare + admit 容易超过 caller timeout。

OpenSpec projection 去重与 exact retry contract 是两个都必须关闭的根因。即使所有命令足够快，transport interruption、进程调度和并发仍可能产生 outcome ambiguity；即使 retry identity 正确，重复 process startup 仍会持续制造 timeout 和 bootstrap 不稳定性。E1 必须同时实现 bounded projection reuse 与 exact retry safety。

当前 `runResolvedCommand` 在 timeout 时调用 `child.kill('SIGKILL')`。Windows 上这不能独立证明 PowerShell / `.cmd` 的整个 process tree 已停止，因此 timeout 必须被解释为 `outcome-unknown`，不能解释为“操作未发生”。

## 4. 统一时间模型

### 4.1 Action fact boundary

```text
entry-time, immutable
  canonical base
  persisted entry workspace identity
  Policy-first typed allowed-mutation declaration
  applicable contract / Owner facts
  semantic input fingerprint

post-action, Core-owned
  canonical base + persisted entry state + post-action state
    → actualChangeSet(create / modify / delete)
    → immutable verification-selection record
    → canonical verification.md
```

allowed-mutation declaration 只是 Action 的允许范围，不是 candidate manifest。caller、executor 或 terminal result 不得提供、替换、合并或扩大 declaration。

### 4.2 Execution control boundary

```text
prepareNext()
  Policy may select a new Action
  may allocate a new Run only when no current pending Run exists

resumeRun(expectedRunId)
  exact persisted target only
  never reruns Policy to select another Action
  never allocates a Run id

admitRunResult(expectedRunId, exactActionPackage, logicalResult)
  exact identity and role binding
  idempotent replay only for the same terminal descriptor
```

timeout / disconnect / caller cancellation 必须返回或映射为 `outcome-unknown`。恢复顺序固定为：

```text
inspect expectedRunId
├─ pending + exact identity  → target-pinned resume/admit
├─ terminal + same result   → return existing terminal state
├─ terminal + different input → fail closed
└─ missing/ambiguous/drift  → fail closed
```

在任何分支中，retry 都不得隐式调用 `prepareNext()`。

## 5. pending continuation 与 self-drift

pending resume 必须从 persisted Run entry identity 恢复。Action-owned declaration 覆盖的 post-entry mutation 不单独构成 self-drift；以下变化继续 fail closed：

- approved Design declaration source ref/fingerprint 变化；
- undeclared 或 unowned path；
- applicable Owner/contract facts 变化；
- requested Run id、Action、Role 或 semantic fingerprint 不匹配；
- 多个 current pending writers 或无法证明唯一 target。

系统没有 exclusive worktree / lease authority 时，只能证明 entry/post/base 的 path/bytes 状态差异，不能仅用 hash 证明写入来源。Proposal 必须显式保留该能力边界。

## 6. schema、persistence 与 migration

Proposal 必须定义：

1. historical completed context v4 保持 immutable、legacy-readable；new writer 使用 context v5；
2. context v5 保存 canonical base、persisted entry workspace identity、Core-derived typed declaration、applicable facts 与 semantic fingerprint；
3. ActionPackage v1 保持旧语义，v2 承载 selected Action、approved Design source 与 ordered selectors；
4. exact retry identity 必须来自 persisted Run/context，不得由 caller 重新构造或按 current Policy 猜测；
5. terminal result 保持 closed schema，只提交最小 logical execution/review/failure descriptor；
6. actualChangeSet 与 verification selection 写入独立 immutable Core record，不回填 context；
7. terminal replay 的幂等比较必须使用 canonical logical descriptor，并且不得重写既有 result bytes。

## 7. Contract Reset 与 bootstrap

`recoverContractResetPendingRun` 仍是 narrow reset-only recovery：只在唯一 pending Run 因适用 Owner Contract Reset 产生唯一 semantic drift 时，正式取消为 `superseded-by-owner-contract-reset`。它不是 generic cancellation 或 generation manager。

E1 是 bootstrap migration：

- 本 Explore Run 使用历史 context v4，不是 v5 dogfood；
- 使用新建 v5 fixture / integration Run 验证新模型；
- E1 `verification.md` 必须标记 bootstrap verification；
- 真正 canonical v5 dogfood 从 E1 后续 Change 开始；
- E1 自身尚未交付 exact resume 前，timeout 后必须 STOP，先检查 expected Run，不重试 `next`。

## 8. E1 deterministic verificationScope selection

E1 Proposal 必须冻结以下单一、可复验的选择链，不能让 caller 直接选择最终 scope：

```text
canonical Git base + persisted entry state + post-action state
  → actualChangeSet(create / modify / delete)
  → unique production-owned module seeds
  → reverse dependency consumer transitive closure
  → structured current OpenSpec delta capability ids
  → module/capability relation validation
  → ordered, deduplicated minimal verificationScope
  → immutable verification-selection record
  → canonical verification.md
```

### 8.1 canonical base 与 actual paths

canonical base 必须来自 Change 的正式 Git boundary，并在 entry identity 中持久化。Core 比较 base、persisted entry state 与 post-action state，产生 normalized repository-relative actual paths、`create` / `modify` / `delete`、path kind 与最终 content fingerprint。第一版不使用 heuristic rename authoritative primitive。

### 8.2 production-owned module map

repository 必须有一个 source-controlled、closed、production-owned module map。每个 module 定义：

- non-overlapping normalized ownership selectors；
- fixed verification scope names；
- `dependsOn` module ids；
- 与 structured OpenSpec capability ids 的显式 relation。

每条 candidate actual path 必须唯一匹配一个 module；zero-match、multi-match、unknown module、重复 selector、重叠 ownership 或 cyclic dependency 都必须 fail closed。

### 8.3 dependency expansion direction

actual paths 唯一归属得到 seed modules。影响展开方向固定为 **reverse dependency consumer closure**：若 module B 的 `dependsOn` 包含 A，则 A 改变时 B 是受影响 consumer；递归展开全部 consumers。结果按 canonical module id lexical order 排序并去重，不依赖 filesystem enumeration、caller order 或 map declaration order。

### 8.4 structured OpenSpec capability relation

当前 Change affected capabilities 必须从 OpenSpec structured `artifactPaths.specs` 对应的 delta specs 中提取稳定 capability ids/refs，不能从 Markdown 自由文本、目录猜测或 caller 参数获得。每个 seed module 必须与至少一个当前 delta capability 存在显式 relation；每个当前 delta capability 也必须被至少一个 relevant module relation 覆盖。missing、unknown、stale、mismatch 或 ambiguous relation 必须 fail closed。

### 8.5 minimal scope 与 not-applicable

minimal verificationScope 是 seed modules 与 reverse consumer closure 中各 module 固定 scopes 的 canonical ordered union。deduplication 后仍为空时，只有 closed module/capability contract 明确声明且 Core 能证明 `noApplicable` predicate 时才允许 `not-applicable`；不得因 selector、capability、test mapping 缺失或读取失败而降级为 `not-applicable`。

selection record 必须持久化 canonical base、actualChangeSet、module-map ref/fingerprint、seed modules、reverse closure、delta capability refs/ids、module/capability relation outcome 与 ordered scopes。`verification.md` 由同一 Core writer 从该 record 生成，并验证 record-to-Markdown binding。

## 9. E1 与 G1 的范围分界

E1 correctness scope 必须包含：

- entry/post-action fact boundary；
- context v5 与 ActionPackage v2 migration；
- Core-derived declaration 与 actualChangeSet；
- immutable verification-selection record 与 canonical `verification.md`；
- target-pinned pending resume；
- timeout=`outcome-unknown`；
- exact terminal replay idempotency；
- late completion / concurrent retry 不得创建下一 Run；
- operation-scoped OpenSpec version/status/instructions projection 与调用去重；
- Windows process-tree cancellation，以及无法证明 complete cancellation 时的 durable `outcome-unknown` fallback；
- canonical Git boundary 与 `create` / `modify` / `delete` actualChangeSet；
- unique module ownership、reverse dependency consumer closure 与 deterministic ordering/deduplication；
- structured OpenSpec affected capability extraction 与 module/capability relation；
- ordered minimal focused/affected verificationScope 与 explicit `not-applicable`；
- narrow Contract Reset recovery；
- immutable selection record 到 canonical `verification.md` 的 binding。

G1 基于 E1 已交付的 primitive，继续拥有 Manifest 与 Owner fact 冻结的完整 consumer / validation / observation outputs：

- Change CLI surface 与 `resume-context`；
- full Change E2E matrix；
- checkout / resume recovery validation；
- ActionPackage / Run size observation；
- focused / affected verification timing observation；
- review convergence observation。

职责边界固定为：

| Concern | E1 implementation owner | G1 consumer / validation owner |
| --- | --- | --- |
| exact Run retry / terminal replay | persisted identity、service primitive、idempotent admission | CLI exposure、full E2E、checkout/resume recovery validation |
| timeout / cancellation | `outcome-unknown` contract、process-tree cancellation primitive | full Change E2E timeout scenario；不拥有 cancellation implementation |
| OpenSpec projection | operation-scoped projection 与 invocation deduplication | E2E consumption 与 timing observation |
| verification selection | actualChangeSet、module/capability selection、immutable record/Markdown writer | focused/affected timing 与 end-to-end selection observation |
| review convergence | 不改变 D1 convergence semantics | 观察完整 Change E2E 中的 convergence 行为 |
| package / Run size | 只增加 E1 必需的 versioned fields | size observation 与 Delivery acceptance report |

G1 不重复实现或重新定义 E1 primitives；E1 不拥有 Change CLI、full Change E2E、checkout/resume recovery validation 或 G1 observations。两者不得借 consumer validation 反向改变 exact identity、fail-closed 或 verification-selection contract。

## 10. 非目标

E1 不引入：

- E1-specific 或 Run-id-specific bypass；
- mutable context；
- generic generation manager；
- generic cancellation；
- history rewrite；
- 新 Standard Change Action；
- runtime CodeGraph dependency；
- heuristic rename authoritative primitive；
- 通过 hash 声称写入来源；
- 与本次 timeout/retry 根因无关的 generic executor / process platform；
- 自动 Author/Reviewer loop。

## 11. Proposal 前置要求

Proposal 必须在设计 schema 前完整枚举并对齐以下链路：

1. `prepareNext → createRun → context persist → package consume`；
2. `resumeRun(expectedRunId) → persisted identity read → exact package reconstruction`；
3. `admit → logical validation → post-action observation → completeRun`；
4. timeout / late completion / retry / concurrent caller 的状态矩阵；
5. `flowkitMutationScope create → approved Design ResultRef → read → persist → resume/admit consume`；
6. operation-scoped OpenSpec projection 的 create → bounded reuse → post-action refresh，以及 version/status/instructions invocation-count contract；
7. Windows process tree start → timeout/cancel → confirmed termination 或 durable `outcome-unknown`；
8. canonical Git base → actual paths/classification → unique module ownership → reverse dependency closure；
9. structured delta capability refs/ids → module relation validation → canonical ordered/deduplicated minimal scopes；
10. selection record create → persist → read → canonical `verification.md` render/consume；
11. v4/v5、ActionPackage v1/v2 与 historical terminal Result compatibility；
12. Contract Reset recovery 基于 target persisted lineage 的 narrow admission；
13. 将每项 retry、projection、cancellation、CLI、recovery、size/timing 与 convergence acceptance 映射到 Section 9 中唯一的 E1 implementation owner 或 G1 consumer/validation owner，不得 overlap 或遗漏。

测试不得只覆盖成功路径，至少要证明：

- target-pinned retry 不分配新 id；
- late completion 后 retry 不产生下一 Reviewer/Author Run；
- wrong target/role/action/result 与 concurrent terminal mismatch fail closed；
- caller/terminal declaration field 被拒绝；
- OpenSpec projection 在 operation 内去重、在 post-action boundary 刷新；
- Windows timeout 不把未确认停止的 process tree 宣称为 cancelled；
- path ownership zero/multi-match、dependency cycle、reverse consumer expansion 与 ordering/deduplication；
- capability missing/unknown/mismatch/ambiguity 与显式 `not-applicable`；
- unknown/unowned drift 不可通过扩大 declaration 恢复；
- selection record 与 `verification.md` byte/fingerprint binding。

## 12. Finding closure 与 Explore 结论

`E1-RE-001` 已由正式 Owner fact `owner:52c2f519…f17b6d` 关闭：该 fact 被 109 与 110 context 的 `ownerFactRefs` 投影，execution-control、bounded OpenSpec projection 与 cancellation 不再由非权威 reference 或 Author prose 自行创造。

`E1-RE-002` 已通过 Sections 8 与 11 关闭：Proposal 必须定义 canonical base/actual changes、unique module ownership、reverse dependency consumers、structured affected capabilities、module relation、ordered minimal scope、explicit `not-applicable`、immutable record/Markdown binding 及全部 fail-closed negative cases。

`E1-RE-003` 已通过 Section 9 与 Proposal preflight item 13 关闭：G1 的 Change CLI、full Change E2E、checkout/resume recovery validation、Run/package size、focused/affected timing 与 review convergence observations 全部保留；E1 只实现其依赖的 retry、projection、cancellation 与 verification-selection primitives。

E1 可以进入 fresh Proposal，但 Proposal 的根 contract 必须同时修复两类时间边界：执行前与执行后 facts 的 authority 分离，以及 caller transport lifetime 与 persisted Run lifecycle 的分离。

`next` 只负责让 Policy 选择新的 legal boundary；exact retry 只绑定 persisted target Run。任何 timeout 都不能成为创建下一 generation 的隐式授权。
