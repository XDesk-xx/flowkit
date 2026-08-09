## Context

E1 的动机见 `proposal.md`。当前 Core 已具备：

- 单一只读入口 `readFormalFactSnapshot()`；
- 纯函数 `canRun / next / diagnose`；
- 从当前 Change Runs 派生 stage 与 lineage 的 helper；
- 最小手写 YAML parser；
- 通过既有 Git boundary reader 投影 Change Checkpoint；
- Q1/Q2 已冻结的 thin Run 与 point-in-time ResultRef 语义。

真正缺失的是 CLI composition，以及 diagnostics 必须消费的两个 current-fact projection：`explore.md` / `verification.md` artifact existence 与 active Change Verification status。170 review 还澄清了 Explore §11 的证据时点：无 `.git` 导致的 blocked 结果发生在 169 activation 之前的 detached input；169 current candidate 已重新读取为 `conflicts=[]`、`next=review-explore`。E1 不能把这个 detached limitation 变成第二套 checkpoint source。

172 `review-propose` 又指出三个必须在 Apply 前冻结的 contract gap：

1. `next` 的文本 contract 不能丢失 owner-decision context 或 blocked conflicts；
2. `doctor` 的 severity 必须唯一决定 `overall` 与 exit code；
3. active Delivery 但无 active Change 是正常 lifecycle 状态，必须有稳定 Delivery-level projection。

三个 blocker 均为 `author-actionable`。本设计只修正 presentation/projection contract，不增加新的 authority。

178 `review-apply` 已批准 177 candidate，但其真实 Policy 输出为 `blocked: tasks-facts-unavailable`。Owner 随后独立决定撤销本设计原先“Tasks completion 后置”的范围结论，并授权 E1 只补 Archive gate 所需的最小 current `tasks.md` completion projection。本次 Owner decision 是新的 contract authority fact，不是对 178 verdict 的重新解释。

## Goals / Non-Goals

**目标：**

- 在同一个 snapshot-loading path 上构建四个 deterministic read-only commands；
- 保持 CLI/diagnostics 只是 Reader + Policy 之上的 presentation layer，而不是第二个 orchestration layer；
- 增加 diagnostics 与 D1 既有 status-aware gate 都能消费的最小 current Verification projection；
- 增加 D1 既有 Archive Tasks gate 所需的最小 current `tasks.md` completion projection；
- 冻结足够稳定的文本输出、severity 与 no-active-Change 行为，使其可由 fixture tests byte-stable 验证，而不引入持久化 output schema。

**非目标：**

- 不实现 Change Runner、自动 OpenSpec operation、Run creation、owner-decision persistence、Git mutation、Full Test、Archify/CodeGraph 或 Agent Adapter；
- 不实现 workspace/project registry、command registry、diagnostic registry 或 plugin platform；
- 不做 historical Run replay、artifact snapshot registry 或 completed-Change Verification reconstruction；
- 不实现 Task Registry、Task 状态数据库、Task execution engine、task assignment/scheduling 或第二套 OpenSpec authority；
- 不为缺 `.git` 的 detached snapshot 增加产品 workaround；
- 不新增 JSON output mode 或稳定持久化 CLI schema。

## Decisions

### 1. CLI composition 使用 thin dispatcher + pure diagnostic views

依赖方向固定为：

```text
src/bin/flowkit.ts
  → src/cli/main.ts              # argv + exit code + stdout/stderr
  → src/cli/context-loader.ts    # repo/delivery discovery + Reader input
  → readFormalFactSnapshot()
  → src/diagnostics/*            # snapshot → immutable view/text
       ├─ status
       ├─ next
       ├─ doctor
       └─ resume-context
  → existing Policy helpers
```

`src/bin/flowkit.ts` 继续作为 process shell；`cli/main.ts` 负责 command parsing 与 process-facing result codes；diagnostic modules 只接收已加载的 snapshot 并返回 deterministic view/text，因此无需 spawn process 即可 unit test。

**原因：**把 I/O/process concerns 留在 CLI shell，不把它们带进 Policy/diagnostics，也不为四个命令建立通用 CLI framework。

**拒绝方案：**每个 command 独立 discover paths、read files、format facts。这样会形成四条略有差异的 authority path。

### 2. Discovery 只在 repository 内执行：nearest-root + exactly-one-active-Delivery

`discoverRepositoryRoot(startDir)` 向父目录查找最近且同时包含以下目录的 ancestor：

```text
openspec/delivery-groups/
.flowkit/runs/
```

`discoverActiveDelivery(repoRoot)` 枚举 `openspec/delivery-groups/*.yaml`，用既有 minimal YAML parser 读取，并选择 `delivery.state` 恰好为 `active` 的唯一 Manifest。

规则：

```text
0 active      → discovery error
1 active      → continue
>1 active     → discovery error
malformed YAML relevant to discovery → discovery error
```

Discovery 完成后，loader 使用固定 repository-relative paths 调现有 Reader：

```text
runsPathPrefix      = .flowkit/runs
openspecChangesPath = openspec/changes
manifestPathPrefix  = openspec/delivery-groups
```

E1 不增加 `--delivery` override。在真正存在 multi-Delivery use case 之前，保持“one repository / one active Delivery”的基线。

**拒绝方案：**扫描 Git branches/GitHub，或接受 sidecar checkpoint file。Checkpoint 仍由 Git authority 拥有；detached development limitation 不进入产品语义。

### 3. Verification status 只通过 verification.md 内唯一 machine marker 投影

当前 Change Verification record 增加精确 marker：

```text
<!-- flowkit-change-verification-status: passed -->
```

允许值沿用既有 `VerificationStatus`：

```text
not-run | passed | failed | not-applicable
```

active Change 的 Reader 行为固定为：

```text
verification.md absent
→ changeVerificationStatus = undefined
→ Verification 尚未存在时的正常状态

verification.md present + exactly one valid marker
→ 将 marker value 投影进 snapshot

verification.md present + no marker / duplicate marker / invalid value
→ FactConflict dimension=change-verification-status
→ 不从 prose 推断
```

marker 只是 projection hook，不是新 authority：`verification.md` 仍是 canonical Change Verification record，并继续保存 human-readable scope/check/result。禁止引入 `.flowkit/verification-state.json`。

E1 Apply 必须同步 `docs/verification-model.md` §7，并让 active E1 `verification.md` 使用该 marker。历史 archived verification files 不回填，因为 current Policy/diagnostics 只需要 active Change。

**拒绝方案：**解析“总体状态”“结论”等中英文 prose。历史记录存在多种合法 human layout，自由文本解析不 deterministic。

### 4. FormalFactSnapshot 只新增最小 Verification / Tasks 字段与两个 artifact kinds

新增：

```ts
readonly changeVerificationStatus?: VerificationStatus;
readonly changeTasksComplete?: boolean;
```

其中 `changeTasksComplete` 只表示 current active Change 的 required tasks 是否全部完成：`undefined`=事实不可用，`false`=事实可用但仍有 required task 未完成，`true`=全部 required tasks 完成。它不携带 task 列表、task id、owner、执行历史或状态数据库。

并扩展 `OpenSpecArtifactFact.kind`：

```text
change-explore
change-verification
```

`readOpenSpecArtifacts()` 仍只暴露 `{kind, path, exists}`，不读取 artifact body/timestamp。

active Verification status 只从：

```text
openspec/changes/<active-change-id>/verification.md
```

读取。Reader 已先通过 Manifest 确定 active Change，因此无需新 resolver/state machine。

**拒绝方案：**在 diagnostics 中另建 file reader。那会导致 CLI 与 Policy 用不同路径解释 Verification，违反 one-fact-one-authority。

### 5. D1 Verification gate 只接通已有 forward-compatibility point

`src/policy/verification-gate.ts` 已集中处理 status-aware behavior。E1 只把 snapshot reader 从概念上的：

```text
always undefined
```

改为：

```text
snapshot.changeVerificationStatus
```

映射继续保持：

```text
undefined       → unavailable
passed          → satisfied
not-applicable  → satisfied
failed          → failed
not-run         → not-run
```

不重写 `canRun` / `next` decision tree。之所以需要 `flowkit-policy-engine` delta，是因为 fact 一旦可用，observable behavior 会变化，但业务规则本身不变。

### 6. active Change 的 stage/lineage/last artifact 复用既有 Policy helpers

存在 active Change 时：

- current stage 使用 `detectStage(runs, changeId)`；
- current artifact/review 使用既有 lineage helper；
- `last-run` 是当前 Change 中 Delivery-scoped Run ID 最大的 admitted Run，展示 execution context 时包含 pending；
- `review` 只使用 admitted `reviewVerdicts`；
- `last-artifact` 只从 current canonical artifact facts + current stage 选择。

stage 对 artifact 的 preference：

```text
explore → explore.md
propose → tasks.md, design.md, specs/**, proposal.md（按此前顺序选择第一个存在项）
apply   → verification.md（存在时），否则 tasks.md
archive → verification.md（存在时），否则 tasks.md
```

这是 display/recovery projection，不拥有 artifact lifecycle。Historical ResultRef fingerprint 永远不能决定 current file。

### 7. no-active-Change 是正常 Delivery-level projection

当唯一 active Delivery 存在、但 `active Change = null` 时，四个命令不得将其视为 discovery/loading failure。稳定投影冻结为：

`status`：

```text
delivery: <deliveryId>
delivery-state: active
change: none
change-state: none
stage: delivery-level
last-run: <Delivery 内 admitted Run ID 最大者 | none>
review: none
verification: not-applicable
full-test: <deliveryFullTestStatus | unavailable>
conflicts: <count>
```

`resume-context`：

```text
delivery: <deliveryId>
change: none
stage: delivery-level
last-artifact: none
last-run: <Delivery 内 admitted Run ID 最大者 | none>
review: none
verification: not-applicable
next-kind: <PolicyResult.kind>
next-detail: <按 Decision 8 的稳定摘要>
```

`doctor`：

- 不因“无 active Change”本身创建 finding；
- 继续消费 Reader conflicts 与 Policy result；
- 若 Policy 返回合法 `action` / `owner-decision`，该 Delivery-level 状态可正常 `overall: ok`；
- 若 Policy 返回 `blocked`，按 Decision 9 的 severity map 呈现。

`next`：

- 直接格式化现有 `next(snapshot)` 的 Delivery-level result；
- 不新增 activate/checkpoint/full-test/finalize 判断。

因此 Change 刚完成等待 Checkpoint、两个 Change 之间、Delivery ready / Full Test / Finalize 等 no-active-Change boundary 都可以得到稳定 read-only view。

### 8. next 对 PolicyResult 三个 branch 使用完整 deterministic 文本投影

`flowkit next` 只格式化 Policy 返回值，不重新计算任何 decision。所有输出为 line-oriented `key: value`；scalar 中的 CR/LF 转义为字面量 `\r` / `\n`，保证一条 field 不跨行。

#### `kind=action`

固定字段顺序：

```text
kind: action
action: <FormalAction>
```

#### `kind=owner-decision`

固定字段顺序，所有 context fields 均输出；缺失值统一 `none`：

```text
kind: owner-decision
decision: <OwnerDecision>
context-change: <changeKey | none>
context-eligible-changes: <eligibleChangeKeys 按 Policy 原顺序以逗号连接 | none>
context-full-test: <deliveryFullTestStatus | none>
context-detail: <detail | none>
```

CLI 不推断 context，也不新增 owner authorization。

#### `kind=blocked`

固定字段顺序：

```text
kind: blocked
reason: <BlockedReason>
unmet: <unmetPreconditions 按 Policy 原顺序以逗号连接 | none>
conflicts: <count>
conflict[0]: dimension=<dimension>; authority=<authority>; message=<message>
...
owner-actions: <suggestedOwnerActions 按 Policy 原顺序以逗号连接 | none>
```

`conflict[i]` 在 presentation 前按 `(dimension, authority, message)` 升序排序，从而使相同 conflict set byte-stable；每条 conflict 保留 `dimension / authority / message`，不只输出 count。`unmet`、`owner-actions` 与 owner-decision context lists 保留 Policy 原顺序，CLI 不重排业务语义。

Acceptance fixtures 至少包括：

- `activate-change` owner-decision，能看到 `context-change` 与 `context-eligible-changes`；
- Full Test/Finalize owner-decision，能看到 `context-full-test` 与 `context-detail`；
- `formal-fact-conflict` blocked，能恢复 `reason / unmet / conflict dimension / authority / message`。

### 9. doctor 是 aggregator；severity/overall/exit code 必须唯一

E1 doctor 的输入只来自：

1. `snapshot.conflicts`；
2. 当前 `next(snapshot)`；
3. 少量不属于 Reader invariant 的 recovery checks。

E1 自有 finding code 与 severity 冻结如下：

```text
reader-conflict:<dimension>   → error
ambiguous-pending-runs        → error
missing-formal-artifact       → error
orphan-pending-run            → warning
```

具体规则：

- 每个 `snapshot.conflicts` 映射为一个 `reader-conflict:<dimension>` error，并保留 authority/message；
- active Change 存在多个 pending Runs 时，产生一个 `ambiguous-pending-runs` error，因为 resume target 无法唯一确定；
- active Change 只有一个 pending Run，但它不能解释为当前 stage/Policy boundary 可继续的 execution 时，产生 `orphan-pending-run` warning；
- current stage 已有 completed current artifact Run，但对应 current canonical artifact fact 不存在时，产生 `missing-formal-artifact` error；
- legal pending Run 本身不是 finding；
- completed historical mutable ResultRefs 不做全量 replay。

Policy blocked diagnosis 固定进入 doctor，但避免重复：

```text
formal-fact-conflict → 不额外生成 policy finding；Reader conflicts 已逐条 error
no-active-delivery   → error
ambiguous-state      → error
no-actionable-change → warning
verification-facts-unavailable → warning
verification-failed  → warning
verification-not-run → warning
tasks-facts-unavailable → warning
dependency-incomplete → warning
full-test-failed      → warning
```

Policy finding code 固定为 `policy-blocked:<reason>`，并保留 `unmetPreconditions` 与 `suggestedOwnerActions`。Doctor 不独立计算合法 Action。

`overall` 唯一由 findings 推导：

```text
存在任一 error   → overall: error
否则存在 warning → overall: warning
否则              → overall: ok
```

findings 按 `severity(error before warning) → code → message` 排序。Exit code：

```text
doctor overall=error   → 1
doctor overall=warning → 0
doctor overall=ok      → 0
```

因此 ambiguous pending、orphan pending、missing formal artifact、Reader conflict 与任何被呈现的 Policy blocked reason 都有唯一 severity/exit 预期。

### 10. 四个命令输出为固定字段顺序的 line-oriented text，不建立持久 schema

所有 command 输出固定为 UTF-8 + LF，默认无 ANSI，不包含 timestamp/random value。

`status` active-Change 字段顺序：

```text
delivery
delivery-state
change
change-state
stage
last-run
review
verification
full-test
conflicts
```

no-active-Change 仍使用完全相同字段顺序，仅按 Decision 7 输出稳定值。

`next` 使用 Decision 8 的 branch-specific 固定字段顺序。

`doctor` 开头固定：

```text
overall: ok | warning | error
findings: <count>
```

随后按 Decision 9 的稳定排序输出 findings。

`resume-context` 字段顺序：

```text
delivery
change
stage
last-artifact
last-run
review
verification
next-kind
next-detail
```

`next-detail` 是 `PolicyResult` 的单行摘要，不替代 `flowkit next` 的完整 branch projection；其 deterministic 构造只复用 Decision 8 已格式化的关键值。

process exit codes：

```text
0 → command 成功形成合法 diagnostic view；
    包括 next=blocked/owner-decision、doctor ok/warning
1 → doctor 至少包含一个 error finding
2 → usage/repository/discovery/loading failure，导致无法形成 diagnostic view
```

E1 有意只冻结 text mode。未来 JSON output mode 必须作为独立 behavior change。

### 11. 语言规则只约束人类可读内容，不成为流程 authority

E1 的 Proposal/Design/Tasks/Run 说明默认使用简体中文。以下内容保持英文：

```text
OpenSpec 必需结构关键字
Action 名
schema key
CLI command
代码标识符
文件路径
error code
固定 enum
既有正式英文 contract 名称
```

例如 `## Context`、`## ADDED Requirements`、`Requirement / Scenario / WHEN / THEN / AND` 等若属于 OpenSpec parser/template contract，则保留英文；其正文使用中文。

该语言规则只影响 presentation/Agent behavior，不改变 Policy、OpenSpec authority、Owner decision 或任何 lifecycle state。

### 12. 不重新解释 170 non-blocking timing finding

不因 E1-RE-001 单独修改已 approved 的 `explore.md`。Proposal/Design/tests 若引用无 `.git` blocked 结果，必须明确标记为 **pre-169 activation detached input**。169+ current candidate 的断言使用 materialized current facts。

这样保留 point-in-time evidence，不重写 approved Explore history。

### 13. Tasks completion 只解析 current canonical tasks.md 的 required checkbox

Owner contract reset 后，Reader 从：

```text
openspec/changes/<active-change-id>/tasks.md
```

读取当前 Change required tasks completion。规则冻结为：

```text
tasks.md 不存在
→ changeTasksComplete = undefined
→ Archive gate: tasks-facts-unavailable

tasks.md 存在
→ 以 Markdown task checkbox 行 `- [ ]` / `- [x]` / `- [X]` 为 required task entries
→ 任一 `[ ]` → changeTasksComplete=false
→ 全部为 `[x]/[X]` → changeTasksComplete=true
→ 没有 required checkbox → vacuously complete=true
```

`false` 时 Policy 返回 `blocked: tasks-incomplete`；这只是既有 Archive 前置条件的可观察 diagnosis，不是新 lifecycle state。允许留到未来的工作不得继续保留为当前 Change 的 unchecked required task；应先由 Author/Owner contract reconciliation 将其移出当前 scope 或明确为非 required future/deferred prose。

Reader MUST NOT 从 Run、聊天、`verification.md`、artifact existence 或其他 sidecar 推断 task completion，也不解析 task owner/执行顺序。

**拒绝方案：**Task Registry、`.flowkit/tasks.json`、task execution engine、从历史 Run 重建 task 状态。它们都会创建第二套 OpenSpec authority。

## Risks / Trade-offs

- **[风险] human-readable Verification record 现在要求一个精确 marker。** → marker 仍放在既有 authority file 中，只校验唯一合法值，并在 `verification-model.md` 记录 contract；不解析周围 prose。
- **[风险] 新增 `changeVerificationStatus` 后，D1 gate 开始消费真实 status，可能暴露原来永久 unavailable 的潜在测试假设。** → 为四个 status + undefined 增加 integration tests，不改 gate mapping/action matrix。
- **[风险] repository root discovery 可能误选父级 repository。** → 只选最近且同时满足两个目录 marker 的 ancestor，并覆盖 nested-directory test。
- **[风险] doctor 容易继续膨胀成第二 validator。** → 新检查必须先判断 invariant 是否属于 Reader/Policy；E1 只保留 recovery-oriented aggregation。
- **[风险] 固定文本输出会形成 compatibility surface。** → 只冻结 E1 必需的小字段集合与顺序，JSON/format negotiation 后置。
- **[风险] no-active-Change 的 `last-run` 跨 Change 展示可能被误认为 current Change lineage。** → 同时固定 `change:none`、`stage:delivery-level`，并明确该字段仅表示 Delivery 内最后 admitted Run。
- **[风险] Markdown checkbox parser 可能被扩展成 Task Engine。** → E1 只投影一个 boolean；只读 current canonical `tasks.md`，不保存 task identity/owner/history。`tasks-incomplete` 只是 Archive gate diagnosis。

## Migration Plan

1. 增加 Reader types/artifact projection/Verification marker parser 与 focused tests。
2. 把既有 Verification gate 接到新 snapshot field，并运行 affected Policy tests。
3. 增加共享 CLI context discovery/loader 与 pure diagnostic views。
4. 实现 `PolicyResult` 三 branch formatter、Delivery-level no-active-Change projection 与 doctor severity map。
5. 增加 process-level CLI dispatch/output/exit-code tests，同时保留 `--version/-v` compatibility。
6. 更新 `docs/verification-model.md` marker contract，并在 Apply/Change Verification 时创建 E1 `verification.md` marker。
7. 运行 E1 focused + affected checks 与 OpenSpec strict validation；未经 Owner 授权不运行 Delivery Full Test。

E1 checkpoint 前若回滚，使用普通 Change rollback：删除 E1 code/delta artifacts，返回此前 checkpoint。不会创建 persistent migration state 或 compatibility database。
