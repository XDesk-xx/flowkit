# E1 Explore：Diagnostic CLI

## 1. 基本信息与进入边界

- Delivery：`20260806-01-deterministic-core`
- Change Key：`E1`
- Change ID：`diagnostic-cli`
- Action：`explore`
- Execution Context：`detached`
- GitHub Base：`5fe8a0b096564052e41418e726962b5a35b9d423`
- 前置 Change：`Q2 orchestration-authority-boundary-correction` 已 `completed`

本次 detached snapshot 不包含 `.git` 历史，而当前 `git-boundary-reader` 只从本地 Git topology 投影 Change Checkpoint。实际执行 `readFormalFactSnapshot() → next()` 时，因此得到：

```text
gitBoundaries = []
next = blocked: ambiguous-state
unmet = multiple completed Changes await Checkpoint: A1, B1, C1, D1, Q1, Q2
```

该结果反映的是 detached execution input 缺失 Git history，不代表 canonical Git authority 中 Q2 未 Checkpoint。GitHub exact Base 的父提交 `e4610bec34652275e46454f594a29972dd252abd` 是：

```text
chore(flowkit): checkpoint orchestration-authority-boundary-correction
```

Owner 已在本次会话中明确授权进入 E1 Explore。因此本次只做 Bootstrap/manual activation：Manifest `E1 planned → active`，创建 E1 canonical Change path 与 `169-explore` Run。

**本次授权不修改 Policy，也不把 GitHub/聊天变成新的产品内 checkpoint authority。** E1 Proposal 不得为了适配 detached ZIP 而给 Core 新增第二套 Git boundary persistence。

---

## 2. E1 已冻结目标

Delivery Manifest 与重规划参考一致：E1 只实现四个只读诊断命令：

```text
flowkit status
flowkit next
flowkit doctor
flowkit resume-context
```

边界继续冻结：

- `status` 只展示推进流程需要的状态，不 dump 全量 Run metadata；
- `next` 只展示 `PolicyResult`，不得修改 Manifest、Run、OpenSpec 或 Git；
- `doctor` 检查影响可靠性的事实问题，可给 warning，但不自动修复；
- `resume-context` 从正式事实生成最小恢复视图，不依赖 `.tmp`、聊天或 Provider session；
- 不实现完整 Change Runner、OpenSpec apply/archive integration、Review/Findings 写入闭环、Change Verification 调度、自动 Git、Archify/CodeGraph/Agent Adapter；
- 不重新引入 heavy Run、historical artifact replay、Gate/Provider/Skill Registry。

---

## 3. 当前代码基线调查

### 3.1 CLI 目前只有版本输出

`src/bin/flowkit.ts` 当前行为：

```text
--version / -v → getVersion()
其他输入        → 仍输出 getVersion()
```

没有 command router，也没有 repo/delivery discovery。`src/cli/` 只有 `version.ts`。

结论：E1 需要最小 command dispatch，但没有理由引入通用 CLI framework、command registry 或 plugin system。

### 3.2 diagnostics 目录尚为空壳

`src/diagnostics/README.md` 明确预留给 E1：

```text
status
next
doctor
resume-context
```

目录中没有生产实现。

### 3.3 Reader 已提供一个主要只读入口，但调用参数仍是底层参数

`readFormalFactSnapshot()` 当前要求调用者显式提供：

```text
repoRoot
deliveryId
runsPathPrefix
openspecChangesPath
manifestPathPrefix
```

CLI 用户通常只会在 repository 中运行 `flowkit <command>`。因此 E1 至少需要解决：

1. repository root 如何确定；
2. 当前 active Delivery 如何唯一确定；
3. 固定 repository paths 是否由一个薄的 CLI/read helper 填充，而不是每个 command 重复拼装。

这些属于**读取入口 ergonomics**，不是新的状态 authority。

### 3.4 Policy API 已经可直接复用

D1 已提供纯函数：

```text
canRun(snapshot, action)
next(snapshot)
diagnose(snapshot)
resolveReview(snapshot)
resolveRevise(snapshot)
```

`next(snapshot)` 返回互斥 union：

```text
action
owner-decision
blocked
```

因此 `flowkit next` 不需要重写决策树；它只应读取 snapshot → 调 `next()` → format。

### 3.5 `diagnose()` 不是完整 `doctor`

当前 `diagnose(snapshot)` 的职责是解释 **Policy 为什么 blocked**。当 `next()` 非 blocked 时，它返回一个空内容的 fallback diagnosis；它不会主动枚举所有 maintainability/integrity checks。

但 E1 `doctor` 的目标更宽，至少包括：

```text
formal fact conflict
broken ResultRef
missing formal artifact
reviewed result mismatch
invalid terminal result
orphan pending Run
invalid artifact path
verification record missing
```

其中一部分由 Reader conflicts 已覆盖；另一部分是只读诊断视图，而不是 Policy blocked reason。

结论：`doctor` 不应简单等同于 `diagnose()`；Proposal 需要冻结“复用 Reader admission/conflicts + 极少量 E1 read-only checks”的边界，避免建立第二套 validator。

---

## 4. 当前事实模型与 E1 输出之间的真实缺口

### 4.1 `status` 所需的大部分事实已有

当前 `FormalFactSnapshot` 已有：

```text
deliveryId / deliveryState / deliveryFullTestStatus
changes
runs
reviewVerdicts
openSpecArtifacts
gitBoundaries
ownerAuthorizations
conflicts
```

可以派生：

```text
active Delivery
active Change
current stage
last relevant Run
latest valid Review verdict
Policy next
formal conflicts
Delivery Full Test status
```

这些不需要新的持久化状态。

### 4.2 Change Verification status 目前不存在于 `FormalFactSnapshot`

E1 `status` 与 `resume-context` 都要求显示 Verification；`doctor` 还要求识别 verification record missing。

但当前 C1/D1 模型明确：

```text
FormalFactSnapshot 没有 Change Verification status
verification gate 当前会返回 verification-facts-unavailable
```

`verification.md` 虽是 canonical Change artifact，但 Reader 目前没有把其存在性/状态投影进 snapshot。

这是 E1 Proposal 必须明确处理的 contract gap：

- 需要最小 read-only Verification projection，还是 CLI 独立读文件？
- 如果扩展 `FormalFactSnapshot`，必须只投影流程/诊断真正需要的最小状态，不能复制完整验证日志；
- 如果 Policy 开始消费该字段，必须通过 delta spec 明确这是既有 D1 forward-compatible gap 的实现，而不是 E1 偷改 Policy 业务规则；
- E1 不实现 Verification 调度和 `test:focused/test:affected/test:full` scripts，那些仍属于 F1。

初步倾向：**共享 Reader 投影最小 Verification fact 优于四个 CLI 各自读取 `verification.md`**，因为后者会制造第二套事实解释。但具体字段和解析 contract 留给 Proposal 冻结。

### 4.3 OpenSpec artifact projection 缺 `explore.md` 与 `verification.md`

`readOpenSpecArtifacts()` 当前只枚举：

```text
proposal.md
design.md
specs/**/spec.md
tasks.md
```

没有：

```text
explore.md
verification.md
```

而 E1 要求：

- `doctor` 能报告 missing formal artifact / verification record missing；
- `resume-context` 能给出 last formal artifact / Verification。

因此 Proposal 应检查是否把 artifact kind 做最小扩展。不能为了 CLI 建立 artifact history registry；只需要 current canonical path 的存在性/必要摘要。

### 4.4 RunFact 足以做 current/near-neighbour resume，不足以做历史账本——这正是正确边界

Q2 后 `RunFact` 只保留：

```text
identity / action / role / status
inputRef / resultRef
current source-review lineage
reviewedRunId
```

E1 不应为了 `resume-context` 再把完整 `action.md`、summary、所有 produced artifacts、测试日志全部塞回 snapshot。

`resume-context` 应从：

```text
Manifest current state
+ current Change Runs
+ current canonical OpenSpec artifacts
+ latest valid Review
+ Verification minimal fact
+ Policy next
```

派生最小恢复信息。历史 completed Change 的 Run corpus 不应重新进入 current projection。

---

## 5. 四个命令的最小职责候选

本节是 Explore 输入，不在此冻结最终输出 schema。

### 5.1 `flowkit status`

只读展示候选：

```text
Delivery: id + state
Change: active key/id（若无则 none）
Stage: explore/propose/apply/archive 或 delivery-level
Last Run: current projection 中最后 relevant Run
Review: latest valid verdict（若适用）
Verification: minimal status / unavailable
Full Test: deliveryFullTestStatus
Conflicts: count + concise dimensions
```

不 dump `context.json/result.json` 全字段，不扫描 completed Change historical mutable refs。

### 5.2 `flowkit next`

固定数据流候选：

```text
resolve repo/delivery
→ readFormalFactSnapshot
→ next(snapshot)
→ deterministic format
```

只显示：

```text
action <name>
owner-decision <decision + minimal context>
blocked <reason + unmet/conflict dimensions>
```

绝不：

```text
activate Change
create Run
写 owner authorization
执行 Action
自动修冲突
```

### 5.3 `flowkit doctor`

优先消费现有 authority：

```text
Reader admission/conflicts
Policy diagnosis
current canonical artifact existence
current pending Run shape/age-free orphan semantics
minimal Verification record presence/status
```

需要 Proposal 进一步分类：

- **error**：会让当前正式事实不可安全解释；
- **warning**：可维护性/恢复风险，但不改变 Policy；
- **ok**：当前未发现诊断问题。

不得新增“doctor state”，不得自动 repair。

`orphan pending Run` 需要特别谨慎：`pending` 本身合法，不能仅因“存在 pending”就报错。只有它与当前 active Change/stage/lineage 明显不一致，或无法成为当前可继续执行的 Run 时，才是诊断候选。

### 5.4 `flowkit resume-context`

只生成视图，不持久化新 authority。最小候选：

```text
Delivery
Change
stage
last formal artifact
last relevant Run
latest valid Review
Verification
Policy next
```

禁止依赖：

```text
.tmp
聊天历史
Provider session
完整历史 Run hash 表
```

---

## 6. CLI 入口与 discovery 的设计约束

E1 需要一个确定性、薄的 read context loader，但不能升级成 workspace/project registry。

Proposal 必须回答：

1. 是否只支持从 repository 内执行，并向上查找唯一 project root；
2. active Delivery 是否通过 `openspec/delivery-groups/*.yaml` 中 `delivery.state=active` 唯一解析；
3. 0 个或 >1 个 active Delivery 时如何 fail-closed；
4. 是否允许显式 `--delivery <id>` 作为诊断 override，还是本 E1 完全不需要；
5. 四个命令是否共享一次 snapshot loader，避免各自定义 authority；
6. 输出格式和 exit code 如何保持 deterministic，并兼顾人类阅读与后续 Agent consumption。

默认原则：**先做一个 repo、一个 active Delivery、四个只读命令的最小路径，不引入配置 registry。**

---

## 7. `doctor` 不得越权成为第二个 Policy / Validator

E1 最容易重新变重的地方是 `doctor`。

必须保持分层：

```text
Reader
→ 读取/校验正式事实，产生 conflicts

Policy
→ next / blocked diagnosis

Doctor
→ 汇总并呈现现有诊断 + 少量 E1 专属只读完整性检查
```

Doctor 不应：

- 重新实现 ResultRef validator；
- 重放 completed Change 全历史；
- 独立决定哪个 Action 合法；
- 将 warning 写回 Manifest/Run/OpenSpec；
- 自动删除 pending Run；
- 自动修复 artifact path；
- 根据自己的检查结果偷偷推进状态。

如果某项问题其实属于 Reader admission invariant，应修 Reader/对应 canonical spec，而不是在 doctor 中复制一份 validator。

---

## 8. E1 预计受影响文件（Proposal 前调查清单）

### 很可能需要新增/修改

```text
src/bin/flowkit.ts
src/cli/**
src/diagnostics/**
tests/**/cli*.test.ts
tests/**/diagnostics*.test.ts
```

### 可能需要最小扩展（必须先由 Proposal 证明）

```text
src/facts/formal-fact-snapshot.ts
src/facts/formal-fact-reader.ts
openspec/specs/flowkit-formal-fact-reader-and-persistence/spec.md（delta）
openspec/specs/flowkit-policy-engine/spec.md（仅当 Verification fact 真正进入 Policy 时）
docs/core-model.md / docs/delivery-lifecycle.md（仅有直接 contract 需要时）
```

### 默认不应修改

```text
Run persistence / terminal immutability
ResultRef point-in-time 语义
Q2 archived artifacts
Git checkpoint model
OpenSpec archive integration
Verification scheduling scripts
F1 quality/performance guards
```

---

## 9. 风险与 Proposal 必答问题

### E1-E1：Verification fact 的最小 projection 是什么？

CLI 需要展示 Verification，D1 Policy gate 也预留了未来字段，但当前 snapshot 没有。Proposal 必须定义最小 authority-safe projection，不复制完整 verification log。

### E1-E2：`doctor` 与 Reader/Policy 的职责边界如何避免重复 validator？

优先复用 Reader conflicts；只有无法归属于现有 Reader/Policy 的只读恢复检查才留给 diagnostics。

### E1-E3：如何确定 repository root 与 active Delivery？

必须 deterministic + fail-closed，不引入 workspace registry。

### E1-E4：`resume-context` 如何定义“last formal artifact”？

应基于 current stage + canonical OpenSpec paths 派生，不应靠 historical ResultRef replay。

### E1-E5：CLI 输出 contract 与 exit code 如何冻结？

四个命令需要一致、可测试、稳定的展示边界；但不得为了结构化输出引入第二套持久化 schema。

### E1-E6：detached 缺 `.git` 的开发环境问题是否进入产品实现？

默认答案：**不进入**。Git boundary 的 canonical authority 仍是 Git。当前 E1 Explore 使用 Owner 明确授权 + exact GitHub Base 手工进入，是 Bootstrap/detached execution workaround，不应把 GitHub API、snapshot sidecar 或 checkpoint cache塞进 E1 CLI。

---

## 10. Explore 结论

E1 可以进入 Proposal，但 Proposal 不应把任务描述成“实现四个 command handler”而忽略事实模型缺口。

最小正确方向是：

```text
薄 CLI dispatch
+ 单一 read context loader
+ 复用 FormalFactSnapshot / Policy
+ 最小补齐 current explore/verification diagnostics facts
+ 只读 formatter / doctor checks
```

同时严格禁止：

```text
第二套 Policy
第二套 ResultRef validator
历史 Run replay
CLI state persistence
自动 repair
通用 command/diagnostic registry
为了 detached ZIP 缺 .git 而改变 canonical Git authority
```

本 Explore 未修改 production code/tests/canonical specs/docs；未运行 Delivery Full Test；未执行 Archive/Checkpoint/Commit/Push。

## 11. 本次实际检查

```text
npm run typecheck
→ passed
```

并实际执行当前 Reader + Policy（在无 `.git` 的 uploaded snapshot 上）：

```text
gitBoundaries = []
conflicts = []
next = blocked: ambiguous-state
       multiple completed Changes await Checkpoint: A1, B1, C1, D1, Q1, Q2
```

该结果仅作为 detached environment limitation 的证据；E1 产品 contract 仍以 Git 为 Checkpoint authority。
