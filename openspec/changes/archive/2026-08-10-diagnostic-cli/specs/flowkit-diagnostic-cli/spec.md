## Purpose

为 Flowkit Deterministic Core 提供稳定、只读、可脚本测试的诊断 CLI，使维护者和 Agent 能从 repository 正式事实确定当前状态、下一流程边界、可靠性问题与最小恢复上下文，而不创建第二套流程状态或执行引擎。

## ADDED Requirements

### Requirement: Diagnostic CLI 只暴露四个只读命令

Flowkit MUST 提供 `status`、`next`、`doctor`、`resume-context` 四个诊断命令。四个命令 MUST 只读取正式事实并输出诊断视图，MUST NOT 修改 Delivery Manifest、OpenSpec Change artifact、Run、Git、owner authorization 或 Verification record，MUST NOT 自动执行返回的下一 Action。

#### Scenario: status 不修改 repository facts
- **WHEN** 用户执行 `flowkit status`
- **THEN** CLI MUST 只输出当前流程状态视图
- **AND** MUST NOT 创建 Run、修改 Manifest、修改 OpenSpec artifact 或写入 Git

#### Scenario: next 只展示 Policy 结果
- **WHEN** 用户执行 `flowkit next`
- **THEN** CLI MUST 展示当前 `PolicyResult`
- **AND** MUST NOT 激活 Change、创建 Run、记录 owner authorization 或执行 Action

#### Scenario: doctor 不自动修复
- **WHEN** `flowkit doctor` 检测到 error 或 warning
- **THEN** CLI MUST 只报告 finding
- **AND** MUST NOT 自动删除 pending Run、修复 artifact、改写 Manifest 或改变流程状态

#### Scenario: resume-context 不持久化恢复状态
- **WHEN** 用户执行 `flowkit resume-context`
- **THEN** CLI MUST 从当前正式事实生成恢复视图
- **AND** MUST NOT 创建新的 resume state、session state、registry 或 cache authority

### Requirement: Repository 与 active Delivery discovery 必须 deterministic 且 fail-closed

Diagnostic CLI MUST 从当前工作目录向父目录查找最近的 Flowkit repository root。repository root MUST 同时包含 `openspec/delivery-groups/` 与 `.flowkit/runs/`。CLI MUST 从 `openspec/delivery-groups/*.yaml` 的 `delivery.state` 解析 active Delivery，并且只在恰好一个 active Delivery 时继续；零个或多个 active Delivery MUST fail-closed。E1 MUST NOT 引入 workspace/project registry、GitHub checkpoint cache 或 detached snapshot sidecar 作为 discovery authority。

#### Scenario: 从 repository 子目录执行
- **WHEN** 当前工作目录位于 Flowkit repository root 的任意后代目录
- **AND** 最近祖先同时包含 `openspec/delivery-groups/` 与 `.flowkit/runs/`
- **THEN** CLI MUST 选择该最近祖先作为 repository root

#### Scenario: repository root 不存在
- **WHEN** 向上查找不到满足 Flowkit root 条件的目录
- **THEN** CLI MUST 以 invocation/discovery error 失败
- **AND** MUST NOT 猜测其他目录或创建新状态目录

#### Scenario: 恰好一个 active Delivery
- **WHEN** delivery-groups 中恰好一个 Manifest 的 `delivery.state=active`
- **THEN** CLI MUST 选择该 Delivery 作为 snapshot 输入

#### Scenario: active Delivery 数量不是一
- **WHEN** active Delivery 数量为 0 或大于 1
- **THEN** CLI MUST fail-closed
- **AND** MUST 报告确定的 discovery error

#### Scenario: detached snapshot 缺 Git history 不改变 Git authority
- **WHEN** diagnostic CLI 在不包含 canonical Git history 的 detached copy 中执行
- **THEN** CLI MUST NOT 从 GitHub API、聊天、sidecar 或缓存伪造 Change Checkpoint
- **AND** Git boundary 仍 MUST 由现有 Git authority Reader 负责

### Requirement: 四个命令共享单一 FormalFactSnapshot 加载路径

四个诊断命令 MUST 复用同一个 repository/delivery discovery 与 `FormalFactSnapshot` 加载入口。该入口 MUST 使用当前 repository 的固定正式路径读取 Manifest、Runs、OpenSpec artifacts、Git boundaries 与其他 Reader facts；单个命令 MUST NOT 自行建立独立事实读取规则来覆盖 Reader authority。

#### Scenario: commands 使用同一 snapshot loader
- **WHEN** `status`、`next`、`doctor` 或 `resume-context` 读取当前流程事实
- **THEN** MUST 使用共享的 snapshot loading path
- **AND** 相同 repository bytes 下 MUST 得到相同 `FormalFactSnapshot`

#### Scenario: command 不重读 Run 作为 artifact authority
- **WHEN** CLI 需要 OpenSpec artifact 或 Verification 状态
- **THEN** MUST 消费 Reader 投影
- **AND** MUST NOT 从 historical Run ResultRef 或 action summary 重建 current artifact/Verification facts

### Requirement: status 输出最小推进状态并覆盖 Delivery-level 状态

`flowkit status` MUST 输出当前 Delivery、active Change、current stage、last relevant Run、latest valid Review verdict、Change Verification status、Delivery Full Test status 与 formal conflict count。不存在的可选事实 MUST 以稳定的 `none`、`unavailable` 或本 Requirement 冻结的 `not-applicable` 表达，MUST NOT dump 全量 `context.json` / `result.json` metadata 或 completed Change 历史 Run corpus。

存在 active Change 时，字段顺序 MUST 为：

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

唯一 active Delivery 存在但无 active Change 时，MUST 使用相同字段顺序，并固定 `change=none`、`change-state=none`、`stage=delivery-level`、`review=none`、`verification=not-applicable`；`last-run` MUST 为 Delivery 内 admitted Run ID 最大者或 `none`。该状态 MUST NOT 被视为 discovery/loading error。

#### Scenario: active Change status
- **WHEN** 当前 Delivery 有一个 active Change
- **THEN** status MUST 输出该 Delivery id/state、Change key/id、current stage、last relevant Run、Review、Verification、Full Test 与 conflict count

#### Scenario: 可选事实不存在
- **WHEN** 当前 active Change 阶段尚无 Review 或 Verification fact
- **THEN** status MUST 以稳定的 `none` 或 `unavailable` 值表达
- **AND** MUST NOT 将缺失字段扩写为历史 Run 扫描

#### Scenario: status 不 dump Run metadata
- **WHEN** 当前 Change 存在多个 Run
- **THEN** status MUST 只输出推进所需的 last relevant Run 与 Review 摘要
- **AND** MUST NOT 输出每个 Run 的完整 metadata

#### Scenario: no-active-Change status 是正常 Delivery-level view
- **WHEN** 唯一 active Delivery 存在
- **AND** 当前没有 active Change
- **THEN** status MUST 输出 `change: none`
- **AND** MUST 输出 `change-state: none`
- **AND** MUST 输出 `stage: delivery-level`
- **AND** MUST 输出 `review: none`
- **AND** MUST 输出 `verification: not-applicable`
- **AND** command MUST NOT 因无 active Change 返回 discovery/loading failure

### Requirement: next 必须完整、确定地呈现 PolicyResult

`flowkit next` MUST 对共享 snapshot 调用现有 Policy `next`，并以确定格式呈现 `action`、`owner-decision` 或 `blocked`。CLI MUST NOT 重写 Policy decision tree，也 MUST NOT 因诊断便利将 `blocked` 自动转换为 Action。

`kind=action` MUST 只输出：

```text
kind: action
action: <FormalAction>
```

`kind=owner-decision` MUST 按以下固定顺序输出全部 context fields；缺失值 MUST 为 `none`：

```text
kind: owner-decision
decision: <OwnerDecision>
context-change: <changeKey | none>
context-eligible-changes: <eligibleChangeKeys | none>
context-full-test: <deliveryFullTestStatus | none>
context-detail: <detail | none>
```

`context-eligible-changes` MUST 保留 Policy 提供的原顺序。

`kind=blocked` MUST 按以下固定顺序输出：

```text
kind: blocked
reason: <BlockedReason>
unmet: <unmetPreconditions | none>
conflicts: <count>
conflict[0]: dimension=<dimension>; authority=<authority>; message=<message>
...
owner-actions: <suggestedOwnerActions | none>
```

`unmetPreconditions` 与 `suggestedOwnerActions` MUST 保留 Policy 原顺序。`conflict[i]` MUST 保留 `dimension / authority / message`，并按 `(dimension, authority, message)` 升序排序后编号。CLI MUST NOT 丢弃 owner-decision context 或 blocked conflict diagnosis。

#### Scenario: next 返回 action
- **WHEN** Policy `next(snapshot)` 返回 `kind=action`
- **THEN** CLI MUST 输出 `kind` 与该 action
- **AND** MUST NOT 执行该 action

#### Scenario: next 返回带 context 的 owner-decision
- **WHEN** Policy 返回 `kind=owner-decision`
- **THEN** CLI MUST 输出 owner decision 类型
- **AND** MUST 输出 `context-change / context-eligible-changes / context-full-test / context-detail`
- **AND** 不适用的 context field MUST 输出 `none`
- **AND** MUST NOT 替 Owner 记录 authorization

#### Scenario: activate-change owner-decision 保留候选上下文
- **WHEN** Policy 返回 `decision=activate-change`
- **AND** context 携带 `changeKey` 与 `eligibleChangeKeys`
- **THEN** stdout MUST 包含对应 `context-change`
- **AND** MUST 包含对应 `context-eligible-changes`
- **AND** 相同 PolicyResult MUST 产生 byte-stable 输出

#### Scenario: next 返回带 conflicts 的 blocked
- **WHEN** Policy 返回 `kind=blocked`
- **AND** diagnosis 包含一个或多个 conflicts
- **THEN** CLI MUST 输出 blocked reason、unmet、conflict count 与每个 conflict 的 dimension/authority/message
- **AND** MUST 输出 suggested owner actions 或 `none`
- **AND** blocked MUST 被视为合法诊断结果而不是自动 repair 信号

### Requirement: doctor 只汇总 authority-owned conflicts 与最小恢复检查

`flowkit doctor` MUST 汇总当前 Reader conflicts、Policy blocked diagnosis 与少量 E1 专属只读恢复检查。若某问题属于 Reader admission invariant，doctor MUST 消费 Reader conflict 而不是复制对应 validator。pending Run 本身 MUST NOT 被视为错误；completed historical mutable refs MUST NOT 被重放成永久一致性要求。

E1 自有 finding severity MUST 固定为：

```text
reader-conflict:<dimension> → error
ambiguous-pending-runs      → error
missing-formal-artifact     → error
orphan-pending-run          → warning
```

Policy blocked diagnosis MUST 进入 doctor finding，但 `formal-fact-conflict` MUST NOT 再生成重复 Policy finding；其余 blocked reason 的 severity MUST 固定为：

```text
no-active-delivery   → error
ambiguous-state      → error
no-actionable-change → warning
verification-facts-unavailable → warning
verification-failed  → warning
verification-not-run → warning
tasks-facts-unavailable → warning
tasks-incomplete        → warning
dependency-incomplete → warning
full-test-failed      → warning
```

Policy finding code MUST 为 `policy-blocked:<reason>`。`overall` MUST 唯一由 findings 决定：任一 error → `error`；否则任一 warning → `warning`；否则 → `ok`。doctor findings MUST 按 `severity(error before warning) → code → message` 的确定顺序输出。

#### Scenario: Reader conflict 成为 doctor error
- **WHEN** `FormalFactSnapshot.conflicts` 非空
- **THEN** doctor MUST 将每个 conflict 映射为 `reader-conflict:<dimension>` error finding
- **AND** MUST 保留 conflict dimension、authority 与 message
- **AND** `overall` MUST 为 `error`

#### Scenario: ambiguous pending Runs 是 error
- **WHEN** active Change 同时存在多个 pending Runs
- **THEN** doctor MUST 输出 `ambiguous-pending-runs` error
- **AND** `overall` MUST 为 `error`

#### Scenario: orphan pending Run 是 warning
- **WHEN** active Change 只有一个 pending Run
- **AND** 该 Run 无法解释为 current stage/Policy boundary 可继续的 execution
- **THEN** doctor MUST 输出 `orphan-pending-run` warning
- **AND** 若不存在其他 error，`overall` MUST 为 `warning`

#### Scenario: missing formal artifact 是 error
- **WHEN** current stage 已存在 completed current artifact Run
- **AND** 对应 current canonical artifact fact 不存在
- **THEN** doctor MUST 输出 `missing-formal-artifact` error
- **AND** `overall` MUST 为 `error`

#### Scenario: Policy blocked diagnosis 使用冻结 severity
- **WHEN** Policy `next(snapshot)` 为 blocked 且 reason 不是 `formal-fact-conflict`
- **THEN** doctor MUST 输出 `policy-blocked:<reason>` finding
- **AND** severity MUST 使用本 Requirement 的固定映射
- **AND** MUST NOT 独立计算另一套合法 Action

#### Scenario: formal-fact-conflict 不重复
- **WHEN** Policy blocked reason 为 `formal-fact-conflict`
- **THEN** doctor MUST 只使用 Reader conflict findings 表达对应 errors
- **AND** MUST NOT 再增加重复 `policy-blocked:formal-fact-conflict`

#### Scenario: 合法 pending Run 不报 orphan
- **WHEN** pending Run 与当前 active Change、stage 和 Policy boundary 一致且可作为当前继续执行对象
- **THEN** doctor MUST NOT 仅因其 `status=pending` 报错或 warning

#### Scenario: completed historical mutable refs 不做全量 replay
- **WHEN** completed Change 的历史 produced-artifact / verification-summary refs 与 current path bytes 不同
- **AND** 当前 Policy 不消费该历史 lineage
- **THEN** doctor MUST NOT 因此创建 error finding

#### Scenario: no-active-Change 本身不是 doctor finding
- **WHEN** 唯一 active Delivery 存在
- **AND** 当前没有 active Change
- **AND** Reader 无 conflict
- **AND** Policy 返回 action 或 owner-decision
- **THEN** doctor MUST NOT 因无 active Change 创建 finding
- **AND** `overall` MUST 为 `ok`

### Requirement: resume-context 生成最小可恢复视图并覆盖 Delivery-level 状态

`flowkit resume-context` MUST 输出当前 Delivery、active Change、current stage、last formal artifact、last relevant Run、latest valid Review、Change Verification 与 Policy next。`last formal artifact` MUST 根据当前 stage 与 active Change canonical OpenSpec paths 派生；MUST NOT 根据 historical ResultRef replay、`.tmp/**`、聊天记录或 Provider session 决定。

唯一 active Delivery 存在但无 active Change 时，resume-context MUST 输出 `change=none`、`stage=delivery-level`、`last-artifact=none`、`review=none`、`verification=not-applicable`，`last-run` MUST 为 Delivery 内 admitted Run ID 最大者或 `none`，并 MUST 直接呈现现有 Delivery-level Policy next。

#### Scenario: current Change 可恢复
- **WHEN** active Change formal facts 可读取
- **THEN** resume-context MUST 输出 Delivery、Change、stage、last formal artifact、last relevant Run、Review、Verification 与 Policy next

#### Scenario: last formal artifact 由 stage 与 canonical path 决定
- **WHEN** 当前 stage 已产生一个或多个正式 OpenSpec artifacts
- **THEN** resume-context MUST 从 active Change 当前 canonical artifact projection 选择与 stage 对应的最后正式 artifact
- **AND** MUST NOT 用 historical ResultRef 的旧 fingerprint 锁定 current path

#### Scenario: no-active-Change resume-context 是正常 Delivery-level view
- **WHEN** 唯一 active Delivery 存在
- **AND** 当前没有 active Change
- **THEN** resume-context MUST 输出 `change: none`
- **AND** MUST 输出 `stage: delivery-level`
- **AND** MUST 输出 `last-artifact: none`
- **AND** MUST 输出 `review: none`
- **AND** MUST 输出 `verification: not-applicable`
- **AND** MUST 输出现有 Policy 的 Delivery-level `next-kind / next-detail`
- **AND** command MUST NOT 因无 active Change 返回 discovery/loading failure

#### Scenario: scratch 与聊天不可作为恢复输入
- **WHEN** `.tmp/**`、聊天历史或 Provider session 包含额外上下文
- **THEN** resume-context MUST NOT 依赖这些内容才能生成正式恢复视图

### Requirement: Diagnostic CLI 输出与 exit code 必须稳定可测试

E1 四个命令 MUST 使用 UTF-8、LF、无时间戳、无随机值、默认无 ANSI 的 line-oriented `key: value` 文本输出。文本 scalar 中 CR/LF MUST 转义为字面量 `\r` / `\n`，不得破坏字段边界。正常流程状态（包括 `next=blocked` 或 `owner-decision`）MUST exit 0；`doctor` 存在至少一个 error finding MUST exit 1；repository/discovery/usage 等无法形成诊断视图的 invocation error MUST exit 2；warning-only doctor MUST exit 0。

#### Scenario: 相同 facts 产生相同输出
- **WHEN** 两次执行使用相同 repository facts
- **THEN** 同一 command 的 stdout MUST byte-for-byte deterministic
- **AND** MUST NOT 包含时间戳、随机 id 或环境相关颜色控制码

#### Scenario: blocked next 是合法结果
- **WHEN** `flowkit next` 返回 blocked
- **THEN** command MUST exit 0
- **AND** stdout MUST 明确包含 blocked reason 与本 spec 要求的 branch fields

#### Scenario: doctor error 返回一
- **WHEN** doctor findings 至少包含一个 error
- **THEN** command MUST exit 1

#### Scenario: doctor 只有 warning 返回零
- **WHEN** doctor 没有 error 且存在 warning
- **THEN** command MUST exit 0

#### Scenario: no-active-Change 正常状态不返回二
- **WHEN** 唯一 active Delivery 存在但无 active Change
- **AND** repository/discovery/loading 成功
- **THEN** `status`、`next`、`doctor`、`resume-context` MUST NOT 仅因无 active Change exit 2

#### Scenario: discovery error 返回二
- **WHEN** repository root 或唯一 active Delivery 无法解析
- **THEN** command MUST exit 2
- **AND** stderr MUST 输出 deterministic error message
