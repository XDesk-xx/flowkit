## MODIFIED Requirements

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

`unmetPreconditions` 与 `suggestedOwnerActions` MUST 保留 Policy 原顺序。`conflict[i]` MUST 保留 `dimension / authority / message`，并按 `(dimension, authority, message)` 升序排序后编号。CLI MUST NOT 丢弃 owner-decision context 或 blocked conflict diagnosis。Q1 新增的 `non-author-review-blocker` 与 `delivery-behavior-not-implemented` MUST 作为普通 `BlockedReason` 通过同一格式稳定呈现；CLI MUST NOT 为二者新增独立 decision branch，也 MUST NOT 把它们转换为 `review-*`、`full-test` 或 `delivery-finalize` Action。

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

#### Scenario: Q1 新 blocked reason 只做稳定呈现

- **WHEN** Policy 返回 `reason=non-author-review-blocker` 或 `reason=delivery-behavior-not-implemented`
- **THEN** `flowkit next` MUST 使用既有 `kind=blocked` 格式原样输出该 reason
- **AND** MUST 保留 Policy 提供的 unmet/conflicts/owner-actions
- **AND** CLI MUST NOT 自行选择 direct re-review、Author revise、Delivery Full Test 或 Delivery Finalize

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
non-author-review-blocker → warning
delivery-behavior-not-implemented → warning
```

Policy finding code MUST 为 `policy-blocked:<reason>`。`overall` MUST 唯一由 findings 决定：任一 error → `error`；否则任一 warning → `warning`；否则 → `ok`。doctor findings MUST 按 `severity(error before warning) → code → message` 的确定顺序输出。`flowkit doctor` MUST 只消费 Policy 返回的新 blocked reason，不得复制 mixed-authority/direct-re-review 或 Delivery behavior decision tree。

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

#### Scenario: non-author Review blocker 是 warning

- **WHEN** Policy blocked diagnosis 的 `reason=non-author-review-blocker`
- **THEN** doctor MUST 输出 `policy-blocked:non-author-review-blocker`
- **AND** severity MUST 为 `warning`
- **AND** doctor MUST NOT 自动发起 direct re-review 或 Author Revision

#### Scenario: Delivery behavior 尚未实现是 warning

- **WHEN** Policy blocked diagnosis 的 `reason=delivery-behavior-not-implemented`
- **THEN** doctor MUST 输出 `policy-blocked:delivery-behavior-not-implemented`
- **AND** severity MUST 为 `warning`
- **AND** doctor MUST NOT 把该 finding 转成 `full-test` 或 `delivery-finalize` Action
